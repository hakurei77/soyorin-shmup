/**
 * 游戏主循环
 * - 固定时间步长：逻辑固定 60 步/秒，渲染用 requestAnimationFrame，
 *   帧率波动只影响渲染次数，不影响弹幕轨迹
 * - 场景状态机：title → playing ⇄ paused → clear / gameover
 * - 作为各引擎模块的编排者，模块间通过回调/事件通信，互不直接改内部状态
 */
import { SpriteManager } from '../assets/sprites'
import { BALANCE } from '../config/balance'
import { ENEMIES } from '../config/enemies'
import { STAGE_MAP } from '../config/stages'
import type {
  EnemyKey,
  EnemySpawnConfig,
  GameCallbacks,
  KeyAction,
  KeyBindings,
  ArcBeam,
  BossPart,
  EmpPulse,
  EnemyLaser,
  EnemyLaserBit,
  EnemyLaserBitConfig,
  EnemyLaserBitEscalation,
  EnemyLaserSpawnFn,
  LaserBeam,
  ImplantEffect,
  ResolvedCharacterStats,
  SceneState,
  SkillKey,
  StageDef,
  WeaponKey
} from '../types'
import { Boss } from './boss'
import { FinalBoss } from './finalBoss'
import { BulletPool, ParticlePool } from './bullet'
import type { BulletSpawnFn } from './bullet'
import { circleHit, segmentCircleHit } from './collision'
import { Enemy } from './enemy'
import { field } from './field'
import { InputManager } from './input'
import { Player } from './player'
import type { PlayerControl } from './player'
import { PLAYER_WEAPONS } from '../weapons/playerWeapons'
import { Renderer } from './renderer'
import { chargePalette } from '../utils/chargeColors'
import { playSfx, preloadSfx } from '../utils/sfx'
import { getBgmBeat, playBgm, setBgmPlaybackRate } from '../utils/bgm'
import enemyHitSfx from '../assets/audio/battle/EnemyHit.wav'
import enemyDieSfx from '../assets/audio/battle/EnemyDie.wav'
import enemyShotSfx from '../assets/audio/battle/EnemyShot.wav'
import bitShotASfx from '../assets/audio/battle/BitShotA.wav'
import bitShotBSfx from '../assets/audio/battle/BitShotB.wav'
import bossPartExplodeSfx from '../assets/audio/battle/BossPartExplode.wav'
import bossPhaseClearSfx from '../assets/audio/battle/BossPhaseClear.wav'
import bossFinalExplodeSfx from '../assets/audio/battle/BossFinalExplode.wav'
import synapticActivateSfx from '../assets/audio/skill/synaptic-activate.wav'
import empBurstSfx from '../assets/audio/skill/emp-burst.wav'
import geminiSummonSfx from '../assets/audio/skill/gemini-summon.wav'
import weaponSwapSfx from '../assets/audio/weapon/WeaponSwap.wav'

/** 固定逻辑步长（毫秒） */
const STEP = 1000 / 60
const DEG = Math.PI / 180

/** 展开后的敌机生成时刻表项 */
interface ScheduledSpawn {
  at: number
  cfg: EnemySpawnConfig
}

export class Game {
  private renderer!: Renderer
  private sprites = new SpriteManager()
  private input = new InputManager()
  private enemyBullets = new BulletPool(BALANCE.pools.enemyBullets)
  // 自机弹出屏边距放大到 240：敌机允许被逼出屏，自机弹需要飞出屏外一段距离仍能命中
  private playerBullets = new BulletPool(BALANCE.pools.playerBullets, 240)
  private particles = new ParticlePool(BALANCE.pools.particles)
  private player = new Player()
  private enemies: Enemy[] = []
  /** 场上所有存活 Boss（训练室可重复召唤多个；普通关卡只会存在一个） */
  private bosses: Boss[] = []

  private scene: SceneState = 'title'
  private currentStage: StageDef | null = null
  private stageFrame = 0
  private schedule: ScheduledSpawn[] = []
  private scheduleIndex = 0
  private bossSpawned = false

  private banner: string | null = null
  private bannerId = 0
  private bannerTimer = 0
  private shake = 0
  /** 准星命中反馈序号（命中时递增，Vue 层据此重放准星动画） */
  private hitId = 0
  /** 击杀反馈序号（击毁敌机 / 击破 Boss 时递增，Vue 层据此重放准星击杀动画） */
  private killId = 0

  // ==================== 技能状态（突触超频） ====================
  /** 当前装备的技能（null = 无技能） */
  private skill: SkillKey | null = null
  /** 技能开关状态（true = 正在生效） */
  private skillOn = false
  /** 技能能量（0 ~ BALANCE.skill.maxEnergy）：开启时消耗，关闭时回复 */
  // BALANCE 为 as const，maxEnergy 是字面量类型 360，需显式标注为 number 以允许动态赋值
  private skillEnergy: number = BALANCE.skill.maxEnergy
  /** EMP 充能层数（0 ~ BALANCE.emp.maxCharges）：每次释放消耗一层 */
  private empCharges: number = BALANCE.emp.maxCharges
  /** EMP 下一层充能的已回复帧数（满层时暂停计时） */
  private empChargeTimer = 0
  /** 双子星卫能量（0 ~ BALANCE.gemini.duration）：激活期间持续消耗，回满才能再次释放 */
  private geminiEnergy: number = BALANCE.gemini.duration
  /** 双子星卫卫星轨道角（弧度） */
  private geminiAngle = 0
  /** 技能回复速度倍率（义体修正，>1 为加速充能/回复） */
  private skillRegenMul = 1
  /** 义体修正：自动索敌半径（>0 时开火自动瞄准离鼠标最近的敌人，逻辑像素） */
  private autoAimRange = 0
  /** 上一帧是否开火（用于蓄力武器松手帧仍保持自动索敌） */
  private prevShooting = false
  /** 义体自动索敌：当前锁定的瞄准点（供渲染层绘制锁定框，null = 未锁定） */
  private autoAimTarget: { x: number; y: number } | null = null
  /** 义体修正：弹丸跟踪转向速率（弧度/帧，>0 时自机弹丸自动追踪最近敌人） */
  private bulletHoming = 0
  /** EMP 充满一层所需帧数（义体回复倍率修正后） */
  private get empChargeRegenFrames(): number {
    return BALANCE.emp.chargeRegen / this.skillRegenMul
  }

  /** 受击故障残影的生成节流（帧），防止持续承伤时残影刷屏 */
  private synapticGlitchCd = 0

  // ==================== DPS 统计（训练室专用） ====================
  /** DPS 滚动窗口长度（逻辑帧）：2 秒 @60fps */
  private static readonly DPS_WINDOW = 120
  /** 本逻辑帧已累计造成的伤害（帧末写入窗口后清零） */
  private frameDamage = 0
  /** 近 DPS_WINDOW 帧逐帧伤害的环形缓冲 + 增量维护的窗口和 */
  private dmgWindow: number[] = []
  private dmgWindowIdx = 0
  private dmgWindowSum = 0
  /** 累计伤害 / 峰值 DPS / 战斗帧数（自首次造成伤害起算） */
  private totalDamage = 0
  private peakDps = 0
  private combatFrames = 0

  private raf = 0
  private lastTime = 0
  private acc = 0
  private fps = 60
  /** 渲染帧率上限（0 = 不限制，跟随屏幕刷新率） */
  private frameLimit = 0
  /** 上一次实际渲染的时间戳（限速与帧率统计用） */
  private lastRender = 0
  private hudTick = 0
  private destroyed = false

  /** 训练室无限生命：开启后所有伤害结算跳过扣血（仍保留受击反馈），开局时自动复位 */
  private trainingGodMode = false

  /** 训练室：切换无限生命（true = 永不扣血；新开局 / 回标题自动关闭） */
  setTrainingGodMode(on: boolean) {
    this.trainingGodMode = on
  }

  /**
   * 敌弹写入回调（弹幕发射器 → 对象池），伤害由武器配置传入；turn/life 为追踪导弹参数；
   * opts 支持巨弹半径倍率与可摧毁弹（金色方块 / 巨型弹可被自机弹击落）。
   * 弹丸判定半径保持基准配置值（仅巨弹/方弹按 opts.radiusMul 单独放大）
   */
  private spawnEnemyBullet: BulletSpawnFn = (x, y, vx, vy, style, damage, turn, life, opts) => {
    this.enemyBullets.spawn(
      x,
      y,
      vx,
      vy,
      BALANCE.enemyBulletRadius * (opts?.radiusMul ?? 1),
      style,
      damage ?? BALANCE.enemyBulletDamage,
      turn ?? 0,
      life ?? -1,
      opts?.destructible ?? false,
      opts?.hp ?? 1,
      opts?.turnDelay ?? -1,
      opts?.moveDelay ?? -1
    )
  }

  /** 敌激光实体列表（光束状态机见 updateEnemyLasers，渲染层消费绘制） */
  private enemyLasers: EnemyLaser[] = []
  /** 同屏敌激光上限（16 台子机错峰开火时峰值约 35 条，超出丢弃） */
  private static readonly MAX_ENEMY_LASERS = 40

  /** 敌激光写入回调（激光武器发射器 → 实体列表） */
  private spawnEnemyLaser: EnemyLaserSpawnFn = (x, y, angle, cfg, color) => {
    if (this.enemyLasers.length >= Game.MAX_ENEMY_LASERS) return
    this.enemyLasers.push({
      x,
      y,
      angle,
      baseAngle: angle,
      state: 'telegraph',
      t: 0,
      color,
      len: Math.hypot(field.width, field.height) * 1.5,
      cfg,
      hitTimer: 0
    })
  }

  /** 浮游炮实体列表（Boss 血量驱动的激光子机群，见 updateEnemyBits） */
  private enemyBits: EnemyLaserBit[] = []
  /** 同屏浮游炮上限（轨道 8 台 + 自由 8 台 = 16） */
  private static readonly MAX_ENEMY_BITS = 16
  /** 浮游炮分段增援：每个 Boss 各自已应用的增援阶段数（缺省 0 = 初始波未部署） */
  private bossBitStages = new Map<Boss, number>()
  /** 各 Boss 浮游炮当前生效的发射间隔覆盖（增援阶段提速用，缺省用部署配置值） */
  private bossBitInterval = new Map<Boss, number>()
  /** 各 Boss 召唤的护卫机编队（巨构 Boss 专属）：Boss 被击破 / 训练室清场时随之一并清除 */
  private bossMinions = new Map<Boss, Enemy[]>()

  /** 浮游炮写入（Boss 增援逻辑 → 实体列表），子机归属召唤它的 Boss */
  private spawnEnemyBit(x: number, y: number, cfg: EnemyLaserBitConfig, color: string, owner: Boss) {
    // 同屏上限按所属 Boss 分别计算：多 Boss 同屏时互不占额度
    const ownerBits = this.enemyBits.filter(b => b.owner === owner)
    if (ownerBits.length >= Game.MAX_ENEMY_BITS) return
    const index = ownerBits.length
    // 悬停锚点：flank 左右两翼 / top 屏幕顶部一字排开
    let ax = x
    let ay = y
    if (cfg.deploy === 'flank') {
      const side = index % 2 === 0 ? 0 : 1
      ax = side === 0 ? 70 : field.width - 70
      ay = Math.max(90, Math.min(field.height - 120, y))
    } else if (cfg.deploy === 'top') {
      ax = (field.width * (index + 1)) / (cfg.count + 1)
      ay = 80
    }
    this.enemyBits.push({
      x,
      y,
      px: x,
      py: y,
      t: 0,
      fireT: cfg.engageDelay ?? 0,
      cfg,
      orbitAngle:
        cfg.deploy === 'orbit'
          ? Math.atan2(y - owner.y, x - owner.x) + (index * Math.PI * 2) / Math.max(1, cfg.count)
          : 0,
      ax,
      ay,
      tx: x,
      ty: y,
      holdT: 0,
      state: cfg.deploy === 'orbit' || cfg.deploy === 'free' ? 'active' : 'deploy',
      color,
      owner
    })
  }

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: GameCallbacks
  ) {}

  /** 加载素材并启动主循环（仅客户端调用） */
  async init() {
    await this.sprites.load()
    this.renderer = new Renderer(this.canvas, this.sprites)
    this.input.attach(this.canvas)
    this.frameLimit = this.loadNumber(BALANCE.storageKeys.frameLimit)
    this.emitHud()
    this.lastTime = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.input.detach()
  }

  resize() {
    this.renderer.resize()
  }

  // ==================== 场景控制（供 Vue 层调用） ====================

  /** 设置出击配置（角色颜色 + 属性 + 武器槽 + 技能 + 皮肤 + 义体效果），在 startRun 前调用（皮肤加载完成后返回） */
  async setLoadout(
    color: string,
    accent: string,
    weapons: (WeaponKey | null)[],
    stats: ResolvedCharacterStats,
    skill: SkillKey | null = null,
    sprite: { id: string; path: string } | null = null,
    implants: ImplantEffect = {}
  ) {
    this.player.setLoadout(color, accent, weapons, stats, sprite?.id ?? null, implants)
    this.skill = skill
    // 义体修正：技能回复速度（>1 加速充能与回复）
    this.skillRegenMul = Math.max(0.1, 1 + (implants.skillRegenAdd ?? 0))
    // 义体修正：自动索敌半径
    this.autoAimRange = implants.autoAimRange ?? 0
    // 义体修正：弹丸跟踪转向速率
    this.bulletHoming = implants.bulletHoming ?? 0
    if (sprite) await this.sprites.loadSprite(sprite.id, sprite.path)
  }

  /** 开始 / 重新开始一局 */
  startRun(stageId: string) {
    const stage = STAGE_MAP.get(stageId)
    if (!stage) {
      console.error(`[Game] 未找到关卡: ${stageId}`)
      return
    }
    this.currentStage = stage

    /* 加载关卡专属背景图 */
    if (stage.bg?.image) {
      this.sprites.loadSprite('levelBg', stage.bg.image)
    }

    this.player.reset()
    preloadSfx(enemyHitSfx)
    preloadSfx(enemyDieSfx)
    preloadSfx(enemyShotSfx)
    preloadSfx(bitShotASfx)
    preloadSfx(bitShotBSfx)
    preloadSfx(bossPartExplodeSfx)
    preloadSfx(bossPhaseClearSfx)
    preloadSfx(bossFinalExplodeSfx)
    preloadSfx(synapticActivateSfx)
    preloadSfx(empBurstSfx)
    preloadSfx(geminiSummonSfx)
    preloadSfx(weaponSwapSfx)
    // 重开对局：若上一局停在 Boss 专属 BGM，恢复战斗曲（否则是空操作）
    playBgm('gamePage')
    this.stopAllBossSfx() // 丢弃旧 Boss 前停掉残留的激光循环音
    this.enemies = []
    this.bosses = []
    this.enemyBullets.clear()
    this.playerBullets.clear()
    this.particles.clear()
    this.laserBeams = []
    this.arcBeams = []
    this.empPulses = []
    this.enemyLasers = []
    this.enemyBits = []
    this.stageFrame = 0
    this.scheduleIndex = 0
    this.bossSpawned = false
    this.trainingGodMode = false
    this.bossBitStages.clear()
    this.bossBitInterval.clear()
    this.bossMinions.clear()
    this.shake = 0
    this.skillOn = false
    this.skillEnergy = BALANCE.skill.maxEnergy
    this.empCharges = BALANCE.emp.maxCharges
    this.empChargeTimer = 0
    this.geminiEnergy = BALANCE.gemini.duration
    this.geminiAngle = 0
    this.banner = null
    this.bannerTimer = 0
    // 重置 DPS 统计
    this.frameDamage = 0
    this.dmgWindow = []
    this.dmgWindowIdx = 0
    this.dmgWindowSum = 0
    this.totalDamage = 0
    this.peakDps = 0
    this.combatFrames = 0
    this.buildSchedule()
    this.setScene('playing')
  }

  togglePause() {
    if (this.scene === 'playing') this.setScene('paused')
    else if (this.scene === 'paused') this.setScene('playing')
  }

  resume() {
    if (this.scene === 'paused') this.setScene('playing')
  }

  /** 激光束视觉残留列表（fireLaser 写入，renderer 消费，逻辑帧衰减） */
  private laserBeams: LaserBeam[] = []
  /** 蓄力电弧视觉残留列表（fireArc 写入，renderer 消费，逻辑帧衰减） */
  private arcBeams: ArcBeam[] = []
  /** 电磁脉冲冲击波列表（castEmp 写入，renderer 消费，逻辑帧衰减） */
  private empPulses: EmpPulse[] = []
  /** 受击音效节流（帧）：高射速武器逐帧命中时避免音效堆叠糊成一片 */
  private hitSfxCd = 0
  /** 击毁音效节流（帧）：防止一帧多杀（电弧贯穿等）音效完全重叠炸音 */
  private dieSfxCd = 0
  /** 浮游炮发射音节流（帧）：同帧多台齐射只响一次 */
  private bitSfxCd = 0
  /** 浮游炮发射音双变体交替开关（0 = A / 1 = B） */
  private bitShotAlt = 0
  /** 巨构 Boss 大爆炸音效节流（帧）：部位击毁 / 连爆演出共用，防殉爆同帧炸音 */
  private bossBoomSfxCd = 0
  /** 巨构召唤物齐射音节流（帧）：FIN-ESC / FIN-LSR 编队同帧多机开火只响一次 */
  private summonShotSfxCd = 0

  quitToTitle() {
    this.player.reset()
    this.stopAllBossSfx() // 丢弃 Boss 前停掉残留的激光循环音
    this.enemies = []
    this.bosses = []
    this.enemyBullets.clear()
    this.playerBullets.clear()
    this.particles.clear()
    this.laserBeams = []
    this.arcBeams = []
    this.empPulses = []
    this.enemyLasers = []
    this.enemyBits = []
    this.banner = null
    this.trainingGodMode = false
    this.bossBitStages.clear()
    this.bossBitInterval.clear()
    this.bossMinions.clear()
    // 退出时若正值突触超频时缓，先恢复 BGM 原速（离开战斗后 step 不再逐帧同步）
    setBgmPlaybackRate(1)
    // Boss 专属 BGM 若在播放则恢复战斗曲（无 Boss 曲时是空操作）
    playBgm('gamePage')
    this.setScene('title')
  }

  // ==================== 键位设置（供 Vue 层调用） ====================

  /** 当前键位映射（供设置界面展示） */
  getKeyBindings(): KeyBindings {
    return this.input.getBindings()
  }

  /** 重新绑定某个动作（自动持久化到 localStorage） */
  rebindKey(action: KeyAction, code: string) {
    this.input.rebind(action, code)
  }

  /** 恢复默认键位 */
  resetKeyBindings() {
    this.input.resetBindings()
  }

  /** 整体替换键位映射（设置面板「保存配置」时调用，自动持久化） */
  setKeyBindings(next: KeyBindings) {
    this.input.setBindings(next)
  }

  /** 设置低速 / 判定点触发方式（hold = 按住生效，toggle = 按一下切换） */
  setSlowMode(mode: 'hold' | 'toggle') {
    this.input.setSlowMode(mode)
  }

  /** 设置冲刺触发方式（hold = 按住生效，toggle = 按一下切换） */
  setSprintMode(mode: 'hold' | 'toggle') {
    this.input.setSprintMode(mode)
  }

  // ==================== 帧率设置（供 Vue 层调用） ====================

  /** 当前渲染帧率上限（0 = 不限制，跟随屏幕刷新率） */
  getFrameLimit(): number {
    return this.frameLimit
  }

  /** 设置渲染帧率上限并持久化到 localStorage（0 = 不限制） */
  setFrameLimit(fps: number) {
    this.frameLimit = Math.max(0, Math.round(fps))
    try {
      localStorage.setItem(
        BALANCE.storageKeys.frameLimit,
        String(this.frameLimit)
      )
    } catch {
      // 静默失败
    }
  }

  // ==================== 主循环 ====================

  private loop = (t: number) => {
    if (this.destroyed) return
    this.raf = requestAnimationFrame(this.loop)
    let dt = t - this.lastTime
    this.lastTime = t
    // 限制最大补帧时间，避免切后台后螺旋追帧
    if (dt > 250) dt = 250
    this.acc += dt
    while (this.acc >= STEP) {
      this.step()
      this.acc -= STEP
    }
    // 渲染帧率上限：只减少绘制次数，逻辑仍按真实时间推进，游戏速度不变
    const interval = this.frameLimit > 0 ? 1000 / this.frameLimit : 0
    if (interval > 0 && t - this.lastRender < interval - 1) return
    // 帧率统计（指数平滑，统计实际渲染帧率）
    const rdt = t - this.lastRender
    this.lastRender = t
    if (rdt < 1000) {
      this.fps = this.fps * 0.9 + (1000 / Math.max(rdt, 1)) * 0.1
    }
    this.renderer.render({
      inGame: this.scene === 'playing' || this.scene === 'paused',
      player: this.player,
      enemies: this.enemies,
      bosses: this.bosses,
      enemyBullets: this.enemyBullets,
      playerBullets: this.playerBullets,
      particles: this.particles,
      laserBeams: this.laserBeams,
      arcBeams: this.arcBeams,
      empPulses: this.empPulses,
      enemyLasers: this.enemyLasers,
      enemyBits: this.enemyBits,
      shake: this.shake,
      /** 激活中（渲染时间减速滤镜） */
      sandevistan: this.skill === 'synaptic' && this.skillOn,
      twinGuard: this.skill === 'gemini' && this.skillOn ? this.geminiAngle : null,
      // 渲染插值系数：本次渲染时间点位于上一步与当前步之间的比例
      alpha: BALANCE.debug.interpolation
        ? Math.min(1, this.acc / STEP)
        : 1,
      /** 关卡专属背景渐变 */
      bgGradient: this.currentStage?.bg?.gradient,
      /** 背景主题 */
      bgType: this.currentStage?.bg?.bgType,
      /** 义体自动索敌当前锁定点（逻辑坐标，null = 未锁定），渲染锁定框 */
      autoAimTarget: this.autoAimTarget
    })
  }

  /** 固定步长逻辑更新（60 次/秒） */
  private step() {
    // 暂停键在 playing / paused 两个场景均可触发
    if (this.input.consumePause()) this.togglePause()
    if (this.scene !== 'playing') {
      this.input.consumeDash() // 丢弃非对局中的闪现 / 技能请求
      this.input.consumeSkill()
      return
    }

    this.stageFrame++
    if (this.hitSfxCd > 0) this.hitSfxCd--
    if (this.dieSfxCd > 0) this.dieSfxCd--
    if (this.bitSfxCd > 0) this.bitSfxCd--
    if (this.bossBoomSfxCd > 0) this.bossBoomSfxCd--
    if (this.summonShotSfxCd > 0) this.summonShotSfxCd--
    this.spawnDue()
    this.maybeSpawnBoss()

    // 技能按键：电磁脉冲瞬时释放；双子星卫限时召唤；突触超频开关切换
    if (this.input.consumeSkill()) {
      if (this.skill === 'emp') this.castEmp()
      else if (this.skill === 'gemini') this.castGemini()
      else this.toggleSkill()
    }
    // 双子星卫：激活期间持续耗能（固定 15 秒），耗尽自动结束；关闭时回复，回满才能再次释放
    if (this.skill === 'gemini') {
      if (this.skillOn) {
        this.geminiEnergy = Math.max(0, this.geminiEnergy - 1)
        if (this.geminiEnergy <= 0) this.skillOn = false // 能量耗尽自动结束
      } else if (this.geminiEnergy < BALANCE.gemini.duration) {
        this.geminiEnergy = Math.min(
          BALANCE.gemini.duration,
          this.geminiEnergy + BALANCE.gemini.regenRate * this.skillRegenMul // 义体回复加速
        )
      }
    } else if (this.skillOn) {
      this.skillEnergy = Math.max(0, this.skillEnergy - BALANCE.skill.drainRate)
      if (this.skillEnergy <= 0) this.skillOn = false // 能量耗尽自动关闭
    } else if (this.skill === 'synaptic' && this.skillEnergy < BALANCE.skill.maxEnergy) {
      this.skillEnergy = Math.min(
        BALANCE.skill.maxEnergy,
        this.skillEnergy + BALANCE.skill.regenRate * this.skillRegenMul // 义体回复加速
      )
    }
    // EMP 充能回复：未满层时逐帧推进，回满一层后清零继续回下一层（义体回复加速 = 充能阈值等比缩短）
    if (this.skill === 'emp' && this.empCharges < BALANCE.emp.maxCharges) {
      if (++this.empChargeTimer >= this.empChargeRegenFrames) {
        this.empCharges++
        this.empChargeTimer = 0
      }
    }
    /** 当前全局时间缩放：技能激活时全场减速，仅玩家移速不受影响 */
    const timeScale = this.skill === 'synaptic' && this.skillOn ? BALANCE.skill.timeScale : 1
    // BGM 同步时缓：降速降调播放；手动关闭 / 能量耗尽自动关闭均在下一帧恢复原速（接口幂等）
    setBgmPlaybackRate(timeScale < 1 ? BALANCE.skill.bgmRate : 1)
    /** BGM 节拍时钟（每帧采样一次）：供 Boss 武器轮播等逻辑做节拍对齐，无 BPM 曲目时为 null */
    const bgmBeat = getBgmBeat()

    // 武器切换：1/2 键直达槽位，滚轮循环切换（按键优先于滚轮）；真切了才播放切枪音
    const slotReq = this.input.consumeWeaponSlot()
    const wheelDir = this.input.consumeWheelDir()
    if (slotReq !== null) {
      if (this.player.switchWeapon(slotReq)) playSfx(weaponSwapSfx)
    } else if (wheelDir !== 0) {
      if (this.player.cycleWeapon()) playSfx(weaponSwapSfx)
    }
    // R 键手动换弹
    if (this.input.consumeReload()) this.player.startReload()

    const control = this.buildControl(timeScale)
    this.player.update(control, this.playerBullets)
    if (this.player.dashFlash) {
      this.player.dashFlash = false
      this.spawnDashFx(this.player.dashFromX, this.player.dashFromY)
    }
    // 激光武器：消费本帧的瞬时射线事件（伤害结算与弹丸碰撞同帧完成）
    const laser = this.player.laserShot
    if (laser) {
      this.player.laserShot = null
      this.fireLaser(laser.x, laser.y, laser.angle, laser.tick)
    }
    // 蓄力武器：消费本帧的电弧事件（贯穿射线，伤害结算与弹丸碰撞同帧完成）
    const arc = this.player.arcShot
    if (arc) {
      this.player.arcShot = null
      this.fireArc(arc.x, arc.y, arc.angle, arc.power)
    }
    // 激光束视觉残留衰减
    for (let i = this.laserBeams.length - 1; i >= 0; i--) {
      if (--this.laserBeams[i]!.ttl <= 0) this.laserBeams.splice(i, 1)
    }
    // 蓄力电弧视觉残留衰减
    for (let i = this.arcBeams.length - 1; i >= 0; i--) {
      if (--this.arcBeams[i]!.ttl <= 0) this.arcBeams.splice(i, 1)
    }
    // 电磁脉冲冲击波衰减
    for (let i = this.empPulses.length - 1; i >= 0; i--) {
      if (--this.empPulses[i]!.ttl <= 0) this.empPulses.splice(i, 1)
    }
    this.updateEnemies(timeScale)
    for (const boss of this.bosses) {
      if (boss.defeated) continue
      // 编队召唤回调（巨构 Boss 专属）：写入敌人列表并登记归属，
      // Boss 被击破 / 训练室清场时随之一并清除
      const summon = (cfg: EnemySpawnConfig) => {
        const e = new Enemy(cfg)
        this.enemies.push(e)
        // 弹射舱门闪光
        this.particles.burst(e.x, e.y, '#ff5a6a', 6, 2, 2, 18)
        let list = this.bossMinions.get(boss)
        if (!list) {
          list = []
          this.bossMinions.set(boss, list)
        }
        list.push(e)
      }
      boss.update(
        { x: this.player.x, y: this.player.y },
        this.spawnEnemyBullet,
        timeScale,
        this.spawnEnemyLaser,
        bgmBeat,
        summon
      )
    }
    // 转阶段演出：无敌窗口内沿舰体持续连爆（每 18 帧引爆一个点，撑满 2.5 秒）
    for (const boss of this.bosses) {
      if (!(boss instanceof FinalBoss) || boss.transitionT <= 0) continue
      if (boss.transitionT % 18 !== 0) continue
      const spots = Game.PHASE_TRANSITION_SPOTS
      const idx = Math.floor((150 - boss.transitionT) / 18) % spots.length
      const [dx, dy] = spots[idx]!
      const ex = boss.x + dx * boss.S
      const ey = boss.y + dy * boss.S
      this.particles.burst(ex, ey, '#ffb15e', 22, 4.5, 3, 42)
      this.particles.burst(ex, ey, '#ff3b4e', 12, 3, 2.5, 32)
      this.particles.burst(ex, ey, '#ffffff', 5, 2, 1.8, 16)
      this.shake = Math.max(this.shake, 9)
      this.playBossBoomSfx()
    }
    // 最终兵器死亡演出：进入解体瞬间清屏（弹雨化作火花），随后沿舰体逐段引爆
    // 3.5 秒，最后收束在核心位的白热巨爆（Boss 本体在 update 中归零后正式击破）
    for (const boss of this.bosses) {
      if (!(boss instanceof FinalBoss) || boss.dyingT <= 0) continue
      const total = 210
      const elapsed = total - boss.dyingT
      if (elapsed === 1) {
        for (const b of this.enemyBullets.items) {
          if (!b.active) continue
          this.particles.burst(b.x, b.y, '#ffd23e', 2, 1.2, 1.2, 10)
          this.enemyBullets.release(b)
        }
        this.enemyLasers = []
        playSfx(bossPhaseClearSfx) // 终幕开场：弹雨化火花的清屏冲击
      }
      if (elapsed % 10 === 0) {
        const spots = Game.PHASE_TRANSITION_SPOTS
        const idx = Math.floor(elapsed / 10) % spots.length
        const [dx, dy] = spots[idx]!
        const ex = boss.x + dx * boss.S
        const ey = boss.y + dy * boss.S
        this.particles.burst(ex, ey, '#ffb15e', 26, 5, 3.5, 50)
        this.particles.burst(ex, ey, '#ff3b4e', 14, 3.2, 3, 38)
        this.particles.burst(ex, ey, '#ffffff', 6, 2.2, 2, 18)
        this.particles.ring(ex, ey, '#ffd23e', 12, 2.6, 2, 16)
        this.shake = Math.max(this.shake, 13)
        this.playBossBoomSfx()
      }
    }
    // 敌激光状态机：预警 → 照射 → 熄灭（时间缩放减速整条光束的节奏）
    this.updateEnemyLasers(timeScale)
    // 浮游炮：轨道/悬停移动 + 自机狙激光（Boss 被 EMP 干扰时停火）
    this.updateEnemyBits(timeScale)
    // 浮游炮分段增援：随 Boss 血量下降增派子机（如 3 → 5 → 8）
    this.updateBossBitEscalation()
    // 突触超频：仅敌人与敌弹受时间缩放影响，自机武器与弹丸保持原速（自机移速本就不受影响）
    // 追踪导弹朝自机当前位置锁定转向
    this.enemyBullets.integrate(field.width, field.height, timeScale, this.player.x, this.player.y)
    this.steerPlayerBullets(1)
    this.playerBullets.integrate(field.width, field.height, 1)
    this.particles.update()

    // 双子星卫：推进卫星轨道角并吞噬碰到的敌弹（先于自机碰撞判定，替自机挡弹）
    if (this.skill === 'gemini' && this.skillOn) this.updateGeminiOrbs()

    this.collidePlayerBullets()
    this.collidePlayerBulletsWithEnemyBullets()
    this.collidePlayer()
    this.flushDamageFrame()

    // 特效计时
    if (this.shake > 0) this.shake *= 0.85
    if (this.bannerTimer > 0 && --this.bannerTimer === 0) this.banner = null
    if (this.synapticGlitchCd > 0) this.synapticGlitchCd--

    // HUD 每 2 步推送一次（30 次/秒足够流畅）
    if (++this.hudTick % 2 === 0) this.emitHud()
  }

  /** 切换技能开关：有能量即可随时开启 / 关闭（无技能或能量为空时忽略开启） */
  private toggleSkill() {
    if (!this.skill) return
    if (this.skillOn) {
      this.skillOn = false
      return
    }
    // 开启有最低能量门槛（关闭不受限），防止能量见底后反复点按蹭时缓
    if (this.skillEnergy < BALANCE.skill.minActivateEnergy) return
    this.skillOn = true
    if (this.skill === 'synaptic') playSfx(synapticActivateSfx)
  }

  /**
   * 电磁脉冲：从自机向四周释放冲击波——清空全场敌弹，
   * 并干扰所有敌人 / Boss 使其一段时间内无法移动与开火。
   * 充能制：每次释放消耗一层充能，充能随时间回复（无充能时忽略）
   */
  private castEmp() {
    if (this.empCharges <= 0) return
    // 满层释放：回复计时从头开始，保证下一层要回满整段时长
    if (this.empCharges === BALANCE.emp.maxCharges) this.empChargeTimer = 0
    this.empCharges--
    playSfx(empBurstSfx)
    const px = this.player.x
    const py = this.player.y
    // 全屏扩散脉冲：渲染层绘制从自机扩到全屏的电弧波前（约 0.8 秒）
    this.empPulses.push({ x: px, y: py, ttl: 48, max: 48 })
    // 波源粒子：中心爆闪 + 两层扩散电环 + 震屏
    this.particles.ring(px, py, '#67e8f9', 48, 8, 3.5, 40)
    this.particles.ring(px, py, '#a5f3fc', 32, 5.5, 2.5, 30)
    this.particles.burst(px, py, '#ffffff', 24, 4, 3, 30)
    this.shake = 10
    // 清空敌弹：每颗弹化作一小簇电火花
    for (const b of this.enemyBullets.items) {
      if (!b.active) continue
      this.particles.burst(b.x, b.y, '#67e8f9', 3, 1.5, 1.5, 10)
      this.enemyBullets.release(b)
    }
    // 清空敌激光：预警线与光束当场熄灭（沿光束近段迸出电火花）
    for (const l of this.enemyLasers) {
      const mx = l.x + Math.cos(l.angle) * Math.min(220, l.len)
      const my = l.y + Math.sin(l.angle) * Math.min(220, l.len)
      this.particles.burst(mx, my, '#67e8f9', 4, 2, 1.5, 12)
    }
    this.enemyLasers = []
    // 干扰：所有敌机与 Boss 瘫痪，命中瞬间迸出电子超载火花
    for (const e of this.enemies) {
      e.stun = BALANCE.emp.stunDuration
      this.particles.burst(e.x, e.y, '#a5f3fc', 8, 2.5, 2, 26)
      this.particles.burst(e.x, e.y, '#ffffff', 4, 1.5, 1.5, 18)
    }
    for (const boss of this.bosses) {
      if (boss.defeated) continue
      boss.stun = BALANCE.emp.stunDuration
      this.particles.burst(boss.x, boss.y, '#a5f3fc', 16, 3, 2.5, 32)
      this.particles.burst(boss.x, boss.y, '#ffffff', 8, 2, 2, 22)
    }
  }

  /**
   * 双子星卫（Castor & Pollux）：召唤两颗金色防御卫星环绕自机 15 秒，
   * 卫星撞毁触碰到的敌弹（替自机挡子弹）。
   * 能量制：能量回满才能释放，激活期间持续耗能，耗尽自动结束
   */
  private castGemini() {
    if (this.skillOn) return
    if (this.geminiEnergy < BALANCE.gemini.duration) return
    this.skillOn = true
    this.geminiAngle = -Math.PI / 2 // 卫星从自机正上方起步
    playSfx(geminiSummonSfx)
    const px = this.player.x
    const py = this.player.y
    this.particles.ring(px, py, '#fbbf24', 40, 6, 3, 36)
    this.particles.burst(px, py, '#fffbeb', 16, 3, 2.5, 26)
  }

  /** 双子星卫：推进轨道角，沿轨道均匀分布的卫星撞毁触碰到的敌弹（金色火花） */
  private updateGeminiOrbs() {
    this.geminiAngle += BALANCE.gemini.angularSpeed * DEG
    const count = BALANCE.gemini.orbCount
    const orbitR = BALANCE.gemini.orbitRadius
    const orbR = BALANCE.gemini.orbRadius
    const px = this.player.x
    const py = this.player.y
    for (const b of this.enemyBullets.items) {
      if (!b.active) continue
      for (let i = 0; i < count; i++) {
        const a = this.geminiAngle + (i * Math.PI * 2) / count
        if (circleHit(px + Math.cos(a) * orbitR, py + Math.sin(a) * orbitR, orbR, b.x, b.y, b.radius)) {
          this.particles.burst(b.x, b.y, '#fbbf24', 3, 1.5, 1.5, 10)
          this.enemyBullets.release(b)
          break
        }
      }
    }
  }

  // ==================== 关卡流程 ====================

  /** 把 stages 配置展开为按帧排序的生成时刻表 */
  private buildSchedule() {
    this.schedule = []
    const waves = this.currentStage?.waves ?? []
    for (const wave of waves) {
      for (const s of wave.spawns) {
        for (let i = 0; i < s.count; i++) {
          this.schedule.push({ at: wave.at + i * s.gap, cfg: s })
        }
      }
    }
    this.schedule.sort((a, b) => a.at - b.at)
  }

  private spawnDue() {
    while (
      this.scheduleIndex < this.schedule.length &&
      this.schedule[this.scheduleIndex]!.at <= this.stageFrame
    ) {
      this.enemies.push(new Enemy(this.schedule[this.scheduleIndex]!.cfg))
      this.scheduleIndex++
    }
  }

  /** Boss 登场条件：全部波次生成完毕且场上杂鱼清空 */
  private maybeSpawnBoss() {
    if (this.bossSpawned) return
    if (this.scheduleIndex < this.schedule.length) return
    if (this.enemies.length > 0) return
    const bossCfg = this.currentStage?.boss
    if (!bossCfg) return
    this.bossSpawned = true
    const b = this.createBoss(bossCfg)
    this.bosses.push(b)
    // Boss 专属 BGM：登场时切换
    if (b.def.bgm) playBgm(b.def.bgm)
  }

  /**
   * Boss 工厂：巨构 Boss（配置了 leviathan）用专属脚本驱动，
   * 其余走武器轮播 / 浮游炮增援的标准 Boss
   */
  private createBoss(cfg: { enemyKey: EnemyKey }): Boss {
    let b: Boss
    if (ENEMIES[cfg.enemyKey].leviathan) {
      b = new FinalBoss(
        cfg,
        () => this.onBossDefeated(b),
        (name) => this.showBanner(name),
        (part) => this.onBossPartDestroyed(b, part),
        (name) => this.onBossPhaseChange(b, name)
      )
    } else {
      b = new Boss(cfg, () => this.onBossDefeated(b), (name) => this.showBanner(name))
    }
    return b
  }

  /** 巨构 Boss 部位击毁：爆炸特效 + 震屏 + 击杀反馈 */
  private onBossPartDestroyed(boss: Boss, part: BossPart) {
    const wx = boss.x + part.x
    const wy = boss.y + part.y
    this.particles.burst(wx, wy, '#ffb15e', 40, 4.5, 4, 60)
    this.particles.burst(wx, wy, '#ff3b4e', 30, 3, 3, 45)
    this.particles.ring(wx, wy, '#ffd23e', 24, 3, 2, 30)
    this.shake = Math.max(this.shake, 10)
    this.killId++
    this.playEnemyDieSfx()
    this.playBossBoomSfx()
  }

  /** 巨构 Boss 大爆炸音效（26 帧节流）：部位击毁与转阶段/死亡连爆共用 */
  private playBossBoomSfx() {
    if (this.bossBoomSfxCd > 0) return
    this.bossBoomSfxCd = 26
    playSfx(bossPartExplodeSfx)
  }

  /** 巨构召唤物齐射音（10 帧节流）：护卫机炮 / 无人机激光共用，编队同帧开火只响一次 */
  private playSummonShotSfx() {
    if (this.summonShotSfxCd > 0) return
    this.summonShotSfxCd = 10
    playSfx(enemyShotSfx)
  }

  /** 丢弃 Boss 列表前调用：停掉巨构 Boss 仍在循环的激光音效，防退出/重开/清场后残留 */
  private stopAllBossSfx() {
    for (const boss of this.bosses) {
      if (boss instanceof FinalBoss) boss.stopAllBeamSfx()
    }
  }

  /**
   * 巨构 Boss 阶段切换：全场弹幕化作火花清屏 + 沿舰体多点连爆 +
   * 冲击波 + 符卡横幅 + 强震屏（随后 Boss 进入无敌转阶段窗口）
   */
  private onBossPhaseChange(boss: Boss, name: string) {
    for (const b of this.enemyBullets.items) {
      if (!b.active) continue
      this.particles.burst(b.x, b.y, '#ffd23e', 2, 1.2, 1.2, 10)
      this.enemyBullets.release(b)
    }
    this.enemyLasers = []
    // 阶段击破连爆：沿舰体多点依次爆出火球
    const S = (boss as unknown as { S?: number }).S ?? 1
    const spots: [number, number][] = [
      [0, 40], [-78, 56], [78, 56], [-138, 44], [138, 44],
      [-190, 24], [190, 24], [-88, 50], [88, 50], [-175, 18], [175, 18]
    ]
    for (let i = 0; i < spots.length; i++) {
      const [dx, dy] = spots[i]!
      const ex = boss.x + dx * S
      const ey = boss.y + dy * S
      this.particles.burst(ex, ey, '#ffb15e', 26, 5, 3.5, 55)
      this.particles.burst(ex, ey, '#ff3b4e', 16, 3.2, 3, 40)
      this.particles.burst(ex, ey, '#ffffff', 6, 2, 2, 20)
    }
    // 双重冲击波
    this.particles.ring(boss.x, boss.y + 40 * S, '#ffd23e', 60, 7, 3, 50)
    this.particles.ring(boss.x, boss.y + 40 * S, '#ffffff', 36, 5, 2.5, 36)
    this.shake = 20
    // 阶段击破清屏冲击音（登场横幅 transitionT=0 不播，仅真阶段转换）
    if (boss instanceof FinalBoss && boss.transitionT > 0) playSfx(bossPhaseClearSfx)
    this.showBanner(name)
  }

  /** 转阶段连爆点位（设计坐标，见 step 中的演出驱动） */
  private static readonly PHASE_TRANSITION_SPOTS: [number, number][] = [
    [0, 40], [-138, 44], [138, 44], [-190, 24], [190, 24],
    [-78, 56], [78, 56], [-88, 50], [88, 50], [-175, 18], [175, 18]
  ]

  /** 清除指定 Boss 召唤的护卫机编队（Boss 击破 / 训练室清场时调用） */
  private clearBossMinions(boss: Boss) {
    const minions = this.bossMinions.get(boss)
    if (!minions) return
    for (const m of minions) {
      if (m.alive) {
        this.particles.burst(m.x, m.y, '#ffcc66', 10, 3, 2.5, 30)
        m.alive = false
      }
    }
    this.bossMinions.delete(boss)
  }

  /** 清除全场 Boss 召唤的护卫机编队（重开 / 回标题 / 训练室清场） */
  private clearAllBossMinions() {
    for (const boss of [...this.bossMinions.keys()]) this.clearBossMinions(boss)
    this.bossMinions.clear()
  }

  private onBossDefeated(boss: Boss) {
    this.particles.burst(boss.x, boss.y, '#f0abfc', 60, 5, 4, 80)
    this.particles.burst(boss.x, boss.y, '#a5f3fc', 40, 3, 3, 60)
    this.killId++
    this.enemyBullets.clear()
    this.clearBossMinions(boss)
    this.bosses = this.bosses.filter(b => b !== boss)
    this.shake = 16
    if (boss instanceof FinalBoss) playSfx(bossFinalExplodeSfx) // 终幕收束：核心白热巨爆
    // 仍有其他 Boss 在场：只清理弹雨，等全部击破后再收尾
    if (this.bosses.length > 0) return
    this.enemyLasers = []
    this.enemyBits = []
    this.bossBitStages.clear()
    this.bossBitInterval.clear()
    // Boss 专属 BGM 若在播放则恢复战斗曲（无 Boss 曲时是空操作）
    playBgm('gamePage')
    // 训练室：不弹结算面板，直接恢复场地中央的无限血木桩
    if (this.currentStage?.id === 'training') {
      this.restoreTrainingDummy()
      return
    }
    this.setScene('clear')
  }

  // ==================== 战斗逻辑 ====================

  private buildControl(timeScale = 1): PlayerControl {
    const axis = this.input.getAxis()
    let aimX = this.input.mouse.x
    let aimY = this.input.mouse.y
    // 义体「自动索敌」：装备即持续锁定离鼠标最近的敌人（锁定框始终跟随目标）；
    // 瞄准点改写仅在开火时生效（含松手帧 prevShooting，避免蓄力武器释放瞬间朝向弹回鼠标）
    if (this.autoAimRange > 0) {
      const target = this.findAutoAimTarget(aimX, aimY, this.autoAimRange)
      this.autoAimTarget = target ? { x: target.x, y: target.y } : null
      if (target && (this.input.shooting || this.prevShooting)) {
        aimX = target.x
        aimY = target.y
      }
    } else {
      this.autoAimTarget = null
    }
    this.prevShooting = this.input.shooting
    return {
      dx: axis.x,
      dy: axis.y,
      slow: this.input.slow,
      sprint: this.input.sprint,
      shooting: this.input.shooting,
      aim: this.input.aiming,
      dash: this.input.consumeDash(),
      aimX,
      aimY,
      timeScale
    }
  }

  /** 自动索敌：在以鼠标为中心、range 为半径的范围内找离鼠标最近的可锁定敌人（含 Boss），无目标返回 null */
  private findAutoAimTarget(mx: number, my: number, range: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null
    let bestDist = range * range
    for (const e of this.enemies) {
      if (!e.trackable) continue
      const dx = e.x - mx
      const dy = e.y - my
      const d2 = dx * dx + dy * dy
      if (d2 <= bestDist) {
        bestDist = d2
        best = e
      }
    }
    for (const boss of this.bosses) {
      if (!boss.trackable) continue
      // Boss 提供多个候选锁定点（核心 + 存活部位）：取离鼠标最近的点，指哪打哪
      for (const tp of boss.aimPoints) {
        const dx = tp.x - mx
        const dy = tp.y - my
        const d2 = dx * dx + dy * dy
        if (d2 <= bestDist) {
          bestDist = d2
          best = tp
        }
      }
    }
    return best
  }

  /** 弹丸捕获半径：子弹贴近敌人到此距离内才会被锁定（逻辑像素） */
  private static readonly HOMING_ACQUIRE_RANGE = 180

  /**
   * 义体「弹丸跟踪」：近距捕获 + 持续锁定
   * - 子弹飞到敌人 HOMING_ACQUIRE_RANGE 内才被捕获锁定，太远/太偏的子弹不锁定、直接直飞
   * - 锁定后持续追踪直至命中或出屏：冲过头的子弹会掉头飞回目标
   */
  private steerPlayerBullets(timeScale: number) {
    if (this.bulletHoming <= 0) return
    const maxTurn = this.bulletHoming * timeScale
    const acquireD2 = Game.HOMING_ACQUIRE_RANGE * Game.HOMING_ACQUIRE_RANGE
    for (const b of this.playerBullets.items) {
      if (!b.active) continue
      // 最近的可锁定目标（敌机 / Boss）
      let tx = 0
      let ty = 0
      let bestD2 = Infinity
      let found = false
      for (const e of this.enemies) {
        if (!e.trackable) continue
        const dx = e.x - b.x
        const dy = e.y - b.y
        const d2 = dx * dx + dy * dy
        if (d2 < bestD2) {
          bestD2 = d2
          tx = e.x
          ty = e.y
          found = true
        }
      }
      for (const boss of this.bosses) {
        if (!boss.trackable) continue
        const tp = boss.targetPoint
        const dx = tp.x - b.x
        const dy = tp.y - b.y
        const d2 = dx * dx + dy * dy
        if (d2 < bestD2) {
          bestD2 = d2
          tx = tp.x
          ty = tp.y
          found = true
        }
      }
      if (!found) continue
      // 捕获：仅贴近敌人时才锁定；一旦锁定持续追踪（冲过头会掉头飞回）
      if (!b.locked) {
        if (bestD2 > acquireD2) continue
        b.locked = true
      }
      const speed = Math.hypot(b.vx, b.vy)
      if (speed <= 0) continue
      // 距离越近允许越急的转向（最多 10 倍）：纯追踪 + 限速转向会形成稳定环绕轨道
      // （半径 = 弹速/转向速率），放大近距离转向把环绕半径压进命中半径以内
      const dist = Math.sqrt(bestD2)
      const distBoost = Math.max(1, Math.min(10, 120 / Math.max(dist, 1)))
      // 朝目标方向偏转，单帧转角不超过 maxTurnB（保留弹速不变）
      const cur = Math.atan2(b.vy, b.vx)
      let diff = Math.atan2(ty - b.y, tx - b.x) - cur
      if (diff > Math.PI) diff -= Math.PI * 2
      else if (diff < -Math.PI) diff += Math.PI * 2
      // 偏角越大允许拐得越急（最多 6 倍）：高速弹冲过头后能快速掉头咬回目标，
      // 小偏差仍保持平滑弧线
      const angleBoost = Math.max(1, Math.min(6, Math.abs(diff) / 0.35))
      const maxTurnB = maxTurn * Math.max(distBoost, angleBoost)
      // 必杀距离：进入"轨道半径"内则解除转向限制、直接对准目标中心——
      // 环绕半径 = 弹速/转向速率（speed / maxTurnB），限速转向在环绕几何下会形成
      // 稳定圆轨道，而轨道半径恒大于该值时必杀永远够不着（角度增益会把轨道撑得更大），
      // 故必杀阈值必须与轨道半径挂钩；正对直冲不可能环绕
      const turn = dist <= speed / maxTurnB ? diff : Math.max(-maxTurnB, Math.min(maxTurnB, diff))
      const a = cur + turn
      b.vx = Math.cos(a) * speed
      b.vy = Math.sin(a) * speed
      b.angle = a
    }
  }

  /**
   * 闪现三段式特效
   * 1. 原地：白色闪光爆点 + 青色扩散光环（"消失"感）
   * 2. 路径：起点到落点之间铺一串残影粒子（"瞬移轨迹"）
   * 3. 落点：青色闪光爆点 + 逆向喷溅粒子（"出现"感）
   */
  private spawnDashFx(fromX: number, fromY: number) {
    const toX = this.player.x
    const toY = this.player.y

    // 1. 原地闪烁：中心白色爆闪 + 扩散光环
    this.particles.burst(fromX, fromY, '#ffffff', 12, 1.6, 3.5, 18)
    this.particles.ring(fromX, fromY, '#67e8f9', 20, 3.6, 2.2, 22)

    // 2. 路径残影：沿线均匀铺粒子，反向轻微漂移
    const steps = 7
    const dx = toX - fromX
    const dy = toY - fromY
    const len = Math.hypot(dx, dy) || 1
    const nx = dx / len
    const ny = dy / len
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      this.particles.spawn(
        fromX + dx * t,
        fromY + dy * t,
        -nx * 0.4,
        -ny * 0.4,
        16,
        2.2,
        '#a5f3fc',
        0.92
      )
    }

    // 3. 落点：青色爆闪 + 沿闪现反方向的喷溅
    this.particles.burst(toX, toY, '#7dd3fc', 10, 2.2, 2.8, 20)
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * 1.2
      const a = Math.atan2(-ny, -nx) + spread
      const s = 2 + Math.random() * 2
      this.particles.spawn(
        toX,
        toY,
        Math.cos(a) * s,
        Math.sin(a) * s,
        14,
        1.8,
        '#e0f2fe',
        0.9
      )
    }
  }

  private updateEnemies(timeScale = 1) {
    // 第一遍：更新所有敌机（移动 + 内部行为）
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]!
      e.behaviorOffX = 0
      e.behaviorOffY = 0
      const aim = Math.atan2(this.player.y - e.y, this.player.x - e.x)
      // 巨构召唤物（FIN-ESC 护卫机炮 / FIN-LSR 无人机激光）是 silent 武器，不走通用齐射音；
      // 这里包装开火回调侦测开火帧，经全局节流补播——同帧多机开火只响一次
      const watchShot = e.def.key === 'FIN-ESC'
      const watchLaser = e.def.key === 'FIN-LSR'
      let shotFired = false
      let laserFired = false
      const spawn: BulletSpawnFn = watchShot
        ? (...args) => {
            shotFired = true
            this.spawnEnemyBullet(...args)
          }
        : this.spawnEnemyBullet
      const spawnLaser: EnemyLaserSpawnFn = watchLaser
        ? (...args) => {
            laserFired = true
            this.spawnEnemyLaser(...args)
          }
        : this.spawnEnemyLaser
      e.update(aim, spawn, this.player, timeScale, spawnLaser)
      if (shotFired || laserFired) this.playSummonShotSfx()
      if (e.destroyed) {
        this.particles.burst(e.x, e.y, '#ffcc66', 16, 3, 3, 40)
        this.particles.burst(e.x, e.y, '#ff6644', 8, 2, 2, 28)
        this.killId++
        this.playEnemyDieSfx()
        e.alive = false
      }
      if (!e.alive) this.enemies.splice(i, 1)
    }

    // 第二遍：群体行为（flock / guard / evade）→ 累加到 behaviorOffX/Y
    this.processEvadeBehaviors(timeScale)
    this.processFlockBehaviors(timeScale)
    this.processGuardBehaviors(timeScale)

    // 第三遍：应用所有行为偏移
    for (const e of this.enemies) {
      e.x += e.behaviorOffX
      e.y += e.behaviorOffY
    }

    // 追踪敌机分离（跳过已通过 flock 分离的敌机）
    this.separateEnemies(timeScale)
  }

  /**
   * 敌激光状态机（每逻辑帧推进）：
   * - telegraph：预警中，无判定；到点转入照射
   * - firing：照射中，有判定（角度在预警开始时锁定，期间不变）；到点转入熄灭
   * - fading：熄灭残影，无判定；到点移除
   * 计时均乘时间缩放（会放慢整条光束的节奏）
   */
  private updateEnemyLasers(timeScale: number) {
    for (let i = this.enemyLasers.length - 1; i >= 0; i--) {
      const l = this.enemyLasers[i]!
      l.t += timeScale
      if (l.hitTimer > 0) l.hitTimer -= timeScale
      // 旋转光束（风车激光 / 扫射光束）：以锚点为圆心持续旋转，预警线同步转动
      if (l.cfg.sweep) {
        l.angle += l.cfg.sweep * DEG * timeScale
      }

      if (l.state === 'telegraph') {
        if (l.t >= l.cfg.telegraph) {
          l.state = 'firing'
          l.t = 0
          l.hitTimer = 0 // 照射首帧即可结算命中
        }
      } else if (l.state === 'firing') {
        if (l.t >= l.cfg.duration) {
          l.state = 'fading'
          l.t = 0
        }
      } else if (l.state === 'fading' && l.t >= l.cfg.fade) {
        this.enemyLasers.splice(i, 1)
      }
    }
  }

  /**
   * 浮游炮更新（每逻辑帧推进）：
   * - orbit：环绕 Boss 的椭圆轨道（径向缓动逼近，不会瞬移）
   * - flank / top：先滑向悬停锚点，就位后小幅浮动
   * - active 且 Boss 未被 EMP 干扰时，按 fireInterval 向自机发射激光
   * - Boss 被击破 / 超时（ttl）后移除
   */
  private updateEnemyBits(timeScale: number) {
    for (let i = this.enemyBits.length - 1; i >= 0; i--) {
      const b = this.enemyBits[i]!
      const boss = b.owner
      // 所属 Boss 已被击破：移除其子机
      if (boss.defeated) {
        this.enemyBits.splice(i, 1)
        continue
      }
      b.px = b.x
      b.py = b.y
      b.t += timeScale
      if (b.cfg.ttl !== undefined && b.t >= b.cfg.ttl) {
        this.enemyBits.splice(i, 1)
        continue
      }

      // 轨道 / 游走 / 悬停移动
      if (b.cfg.deploy === 'orbit') {
        b.orbitAngle += (b.cfg.orbitSpeed ?? 1.5) * DEG * timeScale
        const R = (b.cfg.orbitRadius ?? 110) * field.sy
        const tx = boss.x + Math.cos(b.orbitAngle) * R
        const ty = boss.y + Math.sin(b.orbitAngle) * R * 0.7
        const k = 0.08 * timeScale
        b.x += (tx - b.x) * k
        b.y += (ty - b.y) * k
      } else if (b.cfg.deploy === 'free') {
        // 自由游走：朝目标点巡航 → 悬停开火 → 战术换位（见 updateFreeBit）
        this.updateFreeBit(b, timeScale)
      } else {
        const tx = b.ax
        const ty = b.ay + Math.sin(b.t * 0.02) * 10 * field.sy
        const k = b.state === 'deploy' ? 0.06 : 0.08
        b.x += (tx - b.x) * k * timeScale
        b.y += (ty - b.y) * k * timeScale
        if (b.state === 'deploy' && Math.hypot(tx - b.x, ty - b.y) < 12) {
          b.state = 'active'
        }
      }

      // 开火：就位且 Boss 未被 EMP 干扰时按节拍发射自机狙激光。
      // fireT 为倒计时（错峰模式下由 redistributeBitSwarm 排布相位），
      // 归零发射并重置为 fireInterval；干扰期间全体暂停，相位关系不变
      if (b.state === 'active' && boss.stun <= 0) {
        b.fireT -= timeScale
        if (b.fireT <= 0) {
          b.fireT = b.cfg.fireInterval
          const a = Math.atan2(this.player.y - b.y, this.player.x - b.x)
          this.spawnEnemyLaser(b.x, b.y, a, b.cfg.laser, b.color)
          this.playBitShotSfx()
        }
      }
    }

    // 自由浮游炮之间软排斥：游走 / 悬停途中靠太近时互相推开，
    // 配合选点逻辑（pickFreeBitTarget 倾向远离同僚）保证机群散而不聚
    const frees: EnemyLaserBit[] = []
    for (const b of this.enemyBits) {
      if (b.cfg.deploy === 'free') frees.push(b)
    }
    const minD = 110
    for (let i = 0; i < frees.length; i++) {
      for (let j = i + 1; j < frees.length; j++) {
        const a = frees[i]!
        const c = frees[j]!
        const dx = c.x - a.x
        const dy = c.y - a.y
        const d = Math.hypot(dx, dy)
        if (d < minD && d > 0.01) {
          const push = ((minD - d) / minD) * 0.5 * timeScale
          const ux = dx / d
          const uy = dy / d
          a.x -= ux * push
          a.y -= uy * push
          c.x += ux * push
          c.y += uy * push
        }
      }
    }
  }

  /**
   * 自由浮游炮战术游走（单机推进）：
   * 朝目标点巡航（带垂直正弦摆动，轨迹有机不呆板）→ 抵达后悬停
   * holdT 帧（小幅度漂移开火）→ 换位（pickFreeBitTarget 重新选点）。
   * 全程钳制在屏幕边距内。
   */
  private updateFreeBit(b: EnemyLaserBit, timeScale: number) {
    const M = 80
    const dx = b.tx - b.x
    const dy = b.ty - b.y
    const dist = Math.hypot(dx, dy)
    const sp = 1.7 * timeScale
    if (dist > 6) {
      const ux = dx / dist
      const uy = dy / dist
      // 垂直于航向的正弦摆动，避免直线飞行显得机械
      const wob = Math.sin(b.t * 0.05) * 0.5
      b.x += (ux - uy * wob) * sp
      b.y += (uy + ux * wob) * sp
    } else {
      // 抵达目标：战术悬停（小幅漂移），计时结束换位
      b.x += Math.sin(b.t * 0.03) * 0.3 * timeScale
      b.y += Math.cos(b.t * 0.027) * 0.3 * timeScale
      b.holdT -= timeScale
      if (b.holdT <= 0) this.pickFreeBitTarget(b)
    }
    b.x = Math.max(M, Math.min(field.width - M, b.x))
    b.y = Math.max(M, Math.min(field.height - M, b.y))
  }

  /**
   * 自由浮游炮选点：在全屏边距内随机采样多个候选点，
   * 选离其他自由浮游炮最远的那个（max-min 距离）——
   * 机群自然散向屏幕各处，但带随机性，不像是被固定在格点上。
   */
  private pickFreeBitTarget(b: EnemyLaserBit) {
    const M = 90
    let bestX = b.x
    let bestY = b.y
    let bestScore = -1
    for (let k = 0; k < 4; k++) {
      const cx = M + Math.random() * (field.width - M * 2)
      const cy = M + Math.random() * (field.height - M * 2)
      let minD2 = Infinity
      for (const o of this.enemyBits) {
        if (o === b || o.cfg.deploy !== 'free') continue
        const ddx = o.x - cx
        const ddy = o.y - cy
        const d2 = ddx * ddx + ddy * ddy
        if (d2 < minD2) minD2 = d2
      }
      if (minD2 > bestScore) {
        bestScore = minD2
        bestX = cx
        bestY = cy
      }
    }
    b.tx = bestX
    b.ty = bestY
    b.holdT = 50 + Math.random() * 90
  }

  /**
   * Boss 浮游炮分段增援（血量驱动，每个 Boss 独立推进）：
   * 登场后先部署 initial 台（轨道组 + 自由组各 initial 台）；
   * 血量低于 stages[i].atRatio（maxHp 比例）时两组各增援 add 台。
   * 每个阶段只触发一次（如 3+3 → 5+5 → 8+8）。
   * Boss 被击破后其子机随 updateEnemyBits 清理。
   */
  private updateBossBitEscalation() {
    for (const boss of this.bosses) {
      if (boss.defeated || boss.entering) continue
      const esc: EnemyLaserBitEscalation | undefined = boss.def.bitEscalation
      if (!esc) continue

      const stage = this.bossBitStages.get(boss) ?? 0

      // 初始波：登场完成即部署
      if (stage === 0) {
        this.bossBitStages.set(boss, 1)
        this.spawnBitWave(esc.initial, esc, boss)
        continue
      }

      // 后续阶段：血量低于阈值时增援（按配置顺序逐级触发）
      const nextIdx = stage - 1
      if (nextIdx < esc.stages.length) {
        const s = esc.stages[nextIdx]!
        if (boss.hp / boss.maxHp < s.atRatio) {
          this.bossBitStages.set(boss, stage + 1)
          // 射速增压：在场子机立即改用新间隔（克隆 cfg，避免污染共享的敌人定义配置）
          if (s.fireInterval != null) {
            this.bossBitInterval.set(boss, s.fireInterval)
            for (const bit of this.enemyBits) {
              if (bit.owner === boss) bit.cfg = { ...bit.cfg, fireInterval: s.fireInterval }
            }
          }
          this.spawnBitWave(s.add, esc, boss)
        }
      }
    }
  }

  /** 部署一批浮游炮：轨道组 + 自由组（若配置 freeConfig）同时增援，随后该机群整体重排 */
  private spawnBitWave(n: number, esc: EnemyLaserBitEscalation, boss: Boss) {
    const color = boss.def.iconColor
    // 若此前增援阶段已提速，新波子机直接沿用当前生效的间隔
    const interval = this.bossBitInterval.get(boss)
    const orbitCfg = interval != null ? { ...esc.config, fireInterval: interval } : esc.config
    const freeCfg =
      esc.freeConfig && interval != null ? { ...esc.freeConfig, fireInterval: interval } : esc.freeConfig
    for (let i = 0; i < n; i++) {
      this.spawnEnemyBit(boss.x, boss.y, orbitCfg, color, boss)
    }
    if (freeCfg) {
      for (let i = 0; i < n; i++) {
        this.spawnEnemyBit(boss.x, boss.y, freeCfg, color, boss)
      }
    }
    this.redistributeBitSwarm(boss)
  }

  /**
   * 机群重排（每波增援后调用）：
   * 1. orbit 浮游炮轨道角按当前数量均分全周（3→120°、5→72°、8→45°）
   * 2. 全部 stagger 浮游炮（含自由游走）统一错峰排布开火相位：
   *    按绕 Boss 的方位角排序后依次错开 fireInterval/总数 帧，
   *    开火顺序沿屏幕转圈——任意时刻只有一台在发射，且射击方位
   *    像有指挥一样依次轮转，而不是聚在某一侧
   */
  private redistributeBitSwarm(boss: Boss) {
    // 1. 轨道角均分（仅重排该 Boss 的子机）
    const orbitBits: EnemyLaserBit[] = []
    const staggerBits: EnemyLaserBit[] = []
    for (const b of this.enemyBits) {
      if (b.owner !== boss) continue
      if (b.cfg.deploy === 'orbit') orbitBits.push(b)
      if (b.cfg.stagger === true) staggerBits.push(b)
    }
    if (orbitBits.length >= 2) {
      for (let i = 0; i < orbitBits.length; i++) {
        orbitBits[i]!.orbitAngle = (i / orbitBits.length) * Math.PI * 2
      }
    }

    // 2. 错峰开火相位：按绕 Boss 方位角排序，射击顺序沿屏幕轮转
    if (staggerBits.length >= 2) {
      staggerBits.sort((a, b) => {
        const aa = Math.atan2(a.y - boss.y, a.x - boss.x)
        const ab = Math.atan2(b.y - boss.y, b.x - boss.x)
        return aa - ab
      })
      const total = staggerBits.length
      const gap = staggerBits[0]!.cfg.fireInterval / total
      for (let i = 0; i < total; i++) {
        const b = staggerBits[i]!
        b.fireT = (b.cfg.engageDelay ?? 0) + i * gap
      }
    }
  }

  /**
   * Boids 分离：追踪阶段的敌机两两检查，距离小于分离半径时
   * 各承担一半推力互相推开（推力随重叠深度线性增强，单帧封顶），
   * 防止被自机走位引导全部聚集成一个点；非追踪敌机保持编队路径不受干扰。
   * 拥有 flock 行为的敌机通过 processFlockBehaviors 单独处理分离，此处跳过。
   */
  private separateEnemies(timeScale = 1) {
    const sepCfg = BALANCE.enemyAi.separation
    const sepDist = BALANCE.enemyRadius * sepCfg.radiusMul
    const maxPush = sepCfg.maxPush * timeScale
    const list = this.enemies
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!
      if (!a.engaged || a.hasBehavior('flock')) continue
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!
        if (!b.engaged || b.hasBehavior('flock')) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.hypot(dx, dy)
        if (d >= sepDist) continue
        const fallback = (i + j) * 2.39996
        const nx = d > 0.001 ? dx / d : Math.cos(fallback)
        const ny = d > 0.001 ? dy / d : Math.sin(fallback)
        const push = ((1 - d / sepDist) * maxPush) / 2
        a.x -= nx * push
        a.y -= ny * push
        b.x += nx * push
        b.y += ny * push
      }
    }
  }

  // ==================== 行为系统（群体处理） ====================

  /**
   * 弹幕回避行为：有 evade 行为的敌机感知玩家弹幕，
   * 计算各弹幕的危险方向加权和，向反方向偏转
   */
  private processEvadeBehaviors(timeScale = 1) {
    const cfg = BALANCE.enemyAi.evade
    const bulletItems = this.playerBullets.items
    for (const e of this.enemies) {
      if (!e.hasBehavior('evade')) continue
      let totalDx = 0
      let totalDy = 0
      const radius = cfg.radius
      for (let i = 0; i < bulletItems.length; i++) {
        const b = bulletItems[i]!
        if (!b.active) continue
        const dx = e.x - b.x
        const dy = e.y - b.y
        const dist = Math.hypot(dx, dy)
        if (dist < 1) continue
        // 危险度 = 1 / 距离（越近越紧急）× 方向单位向量
        const danger = 1 / Math.max(dist, 1)
        if (dist < radius) {
          totalDx += (dx / dist) * danger * 60
          totalDy += (dy / dist) * danger * 60
        }
      }
      const strength = cfg.strength * timeScale
      e.behaviorOffX += totalDx * strength * (e as any).speed * 0.3
      e.behaviorOffY += totalDy * strength * (e as any).speed * 0.3
    }
  }

  /**
   * 鸟群行为（Full Boids）：同 groupId 的敌机之间施加
   * 分离 + 对齐 + 凝聚三力，形成自然编队运动
   */
  private processFlockBehaviors(timeScale = 1) {
    const alignCfg = BALANCE.enemyAi.alignment
    const cohCfg = BALANCE.enemyAi.cohesion
    const sepCfg = BALANCE.enemyAi.separation
    const sepDist = BALANCE.enemyRadius * sepCfg.radiusMul
    const maxPush = sepCfg.maxPush * timeScale

    // 按 groupId 分组
    const groups = new Map<string, Enemy[]>()
    for (const e of this.enemies) {
      if (!e.hasBehavior('flock') || !e.alive) continue
      const gid = e.behaviors.find((b: {type: string}) => b.type === 'flock') as any
      const key = gid?.groupId ?? '__default__'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(e)
    }

    for (const [_, group] of groups) {
      if (group.length < 2) continue
      // 计算每个成员的分离、对齐、凝聚
      for (const a of group) {
        let sepX = 0, sepY = 0
        let alignVx = 0, alignVy = 0, alignCount = 0
        let cohX = 0, cohY = 0, cohCount = 0

        for (const b of group) {
          if (a === b) continue
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d = Math.hypot(dx, dy) || 1

          // 分离（近距离推力，与原有 separateEnemies 一致）
          if (d < sepDist) {
            const fallback = (a.x + b.x + a.y + b.y) * 2.39996
            const nx = d > 0.001 ? dx / d : Math.cos(fallback)
            const ny = d > 0.001 ? dy / d : Math.sin(fallback)
            const push = ((1 - d / sepDist) * maxPush) / 2
            sepX += nx * push
            sepY += ny * push
          }

          // 对齐（仅考虑对齐半径内的邻居）
          if (d < alignCfg.radius) {
            alignVx += (b.px !== undefined ? b.x - b.px : 0)
            alignVy += (b.py !== undefined ? b.y - b.py : 0)
            alignCount++
          }

          // 凝聚（向可见邻居的几何中心靠拢）
          if (d < cohCfg.radius) {
            cohX += b.x
            cohY += b.y
            cohCount++
          }
        }

        // 对齐：向平均速度方向修正
        if (alignCount > 0) {
          const avgVx = alignVx / alignCount
          const avgVy = alignVy / alignCount
          a.behaviorOffX += avgVx * alignCfg.strength * timeScale
          a.behaviorOffY += avgVy * alignCfg.strength * timeScale
        }

        // 凝聚：拉向几何中心
        if (cohCount > 0) {
          const cx = cohX / cohCount
          const cy = cohY / cohCount
          const toCx = cx - a.x
          const toCy = cy - a.y
          const toDist = Math.hypot(toCx, toCy) || 1
          const force = Math.min(cohCfg.maxForce * timeScale, toDist * 0.05)
          a.behaviorOffX += (toCx / toDist) * force
          a.behaviorOffY += (toCy / toDist) * force
        }

        // 分离
        a.behaviorOffX += sepX
        a.behaviorOffY += sepY
      }
    }
  }

  /**
   * 护卫行为：有 guard 行为的敌机围绕第一位同路径的"队长"敌机环绕
   * （队长 = 同 cfg.path 的同一编队中存活的第一架）
   */
  private processGuardBehaviors(timeScale = 1) {
    const guardCfg = BALANCE.enemyAi.guard
    for (const e of this.enemies) {
      if (!e.hasBehavior('guard') || !e.alive) continue
      // 找队长：同编队 path、存活的第一个
      let leader: Enemy | null = null
      for (const other of this.enemies) {
        if (other === e || !other.alive) continue
        leader = other
        break
      }
      if (!leader) continue

      const cfg = e.behaviors.find((b: {type: string}) => b.type === 'guard') as any
      const R = cfg?.radius ?? guardCfg.radius
      const angSpd = (cfg?.angularSpeed ?? guardCfg.angularSpeed) * DEG * timeScale

      // 用 hash 为每架护卫指定不同初始角度
      const offset = (e.x * 3.7 + e.y * 7.1) % (Math.PI * 2)
      const angle = offset + this.stageFrame * angSpd

      const tx = leader.x + Math.cos(angle) * R
      const ty = leader.y + Math.sin(angle) * R

      const mx = tx - e.x
      const my = ty - e.y
      const md = Math.hypot(mx, my)
      if (md > 0.5) {
        const step = Math.min(2.0, md * 0.15)
        e.behaviorOffX += (mx / md) * step * timeScale
        e.behaviorOffY += (my / md) * step * timeScale
      }
    }
  }

  /** 敌人受击音效（节流：高射速武器逐帧命中时避免音效堆叠糊成一片） */
  private playEnemyHitSfx() {
    if (this.hitSfxCd > 0) return
    this.hitSfxCd = 4
    playSfx(enemyHitSfx)
  }

  /** 敌人击毁音效（短节流：防止一帧多杀时音效完全重叠炸音） */
  private playEnemyDieSfx() {
    if (this.dieSfxCd > 0) return
    this.dieSfxCd = 3
    playSfx(enemyDieSfx)
  }

  /** 浮游炮发射音：双 biu 变体交替播放；3 帧冷却节流，同帧多台齐射只响一次 */
  private playBitShotSfx() {
    if (this.bitSfxCd > 0) return
    this.bitSfxCd = 3
    playSfx(this.bitShotAlt === 0 ? bitShotASfx : bitShotBSfx)
    this.bitShotAlt ^= 1
  }

  /** 自机弹 vs 敌机 / Boss（敌弹不打敌机，互不判定；扫掠判定防高速弹穿透） */
  private collidePlayerBullets() {    const items = this.playerBullets.items
    for (let i = 0; i < items.length; i++) {
      const b = items[i]!
      if (!b.active) continue
      let consumed = false
      for (const e of this.enemies) {
        if (segmentCircleHit(b.px, b.py, b.x, b.y, b.radius, e.x, e.y, e.radius)) {
          e.damage(b.damage)
          this.trackDamage(b.damage)
          this.trackHit()
          this.playEnemyHitSfx()
          this.playerBullets.release(b)
          this.particles.burst(b.x, b.y, '#a5f3fc', 2, 1.5, 1.5, 12)
          consumed = true
          break
        }
      }
      if (consumed) continue
      for (const boss of this.bosses) {
        if (boss.entering || boss.defeated) continue
        // 部位判定优先（巨构 Boss 的副炮）：命中部位走独立血量与破坏流程
        for (const part of boss.parts) {
          if (!part.alive) continue
          if (
            segmentCircleHit(
              b.px, b.py, b.x, b.y, b.radius,
              boss.x + part.x, boss.y + part.y, part.radius
            )
          ) {
            boss.partHit(part, b.damage)
            this.trackDamage(b.damage)
            this.trackHit()
            this.playEnemyHitSfx()
            this.playerBullets.release(b)
            this.particles.burst(b.x, b.y, '#ffb15e', 2, 1.5, 1.5, 12)
            consumed = true
            break
          }
        }
        if (consumed) break
        // 有效伤害圆（巨构 Boss 仅核心）：命中扣本体血量
        let hit = false
        for (const c of boss.damageCircles) {
          if (segmentCircleHit(b.px, b.py, b.x, b.y, b.radius, c.x, c.y, c.r)) {
            hit = true
            break
          }
        }
        if (hit) {
          boss.damage(b.damage)
          this.trackDamage(b.damage)
          this.trackHit()
          this.playEnemyHitSfx()
          this.playerBullets.release(b)
          this.particles.burst(b.x, b.y, '#f0abfc', 2, 1.5, 1.5, 12)
          break
        }
        // 舰体装甲：吞弹 + 火花反馈，但不扣本体血量（提示瞄准核心 / 副炮）
        let armor = false
        for (const c of boss.hitCircles) {
          if (segmentCircleHit(b.px, b.py, b.x, b.y, b.radius, c.x, c.y, c.r)) {
            armor = true
            break
          }
        }
        if (armor) {
          this.playerBullets.release(b)
          // 舰体装甲无效：冷色护盾涟漪（区别于副炮/核心的金橙命中反馈）
          this.particles.burst(b.x, b.y, '#8fd8ff', 3, 1.8, 1.4, 10)
          this.particles.ring(b.x, b.y, '#8fd8ff', 6, 1.2, 1, 8)
          break
        }
      }
    }
  }

  /**
   * 自机弹 vs 可摧毁敌弹：金色方块弹 / 巨型弹可被击落——
   * 每命中一次扣 1 点弹丸耐久，归零爆散回收；自机弹同时被消耗
   */
  private collidePlayerBulletsWithEnemyBullets() {
    const pItems = this.playerBullets.items
    const eItems = this.enemyBullets.items
    for (let i = 0; i < pItems.length; i++) {
      const p = pItems[i]!
      if (!p.active) continue
      for (let j = 0; j < eItems.length; j++) {
        const e = eItems[j]!
        if (!e.active || !e.destructible) continue
        if (!segmentCircleHit(p.px, p.py, p.x, p.y, p.radius, e.x, e.y, e.radius)) continue
        e.hp--
        this.playerBullets.release(p)
        if (e.hp <= 0) {
          this.enemyBullets.release(e)
          this.particles.burst(e.x, e.y, '#ffd23e', 12, 2.6, 2.2, 22)
          this.particles.ring(e.x, e.y, '#ffffff', 8, 1.6, 1.4, 12)
          this.trackHit()
        } else {
          // 未击穿：弹丸震荡火花
          this.particles.burst(p.x, p.y, '#ffd23e', 4, 1.8, 1.4, 12)
        }
        break
      }
    }
  }

  /**
   * 激光武器命中判定：从炮口沿 angle 方向发出瞬时射线，
   * 无限射程，命中路径上第一个敌人即止（不可穿透）。
   * 持续照射期间每帧调用（光束保持连续），tick 为 true 的帧才结算伤害
   */
  private fireLaser(x: number, y: number, angle: number, tick: boolean) {
    const w = PLAYER_WEAPONS[this.player.weapon]
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    /** 无限射程：取实时战场对角线的两倍作为射线终点，任何窗口尺寸/角度下都直通屏外 */
    const FAR = Math.hypot(field.width, field.height) * 2
    /** 光束判定半径（略微加宽判定，提升擦弹命中手感） */
    const BEAM_R = 2

    // 射线与圆的求交：返回入射距离 t（单位方向向量下即像素距离），未命中返回 null
    const rayHit = (cx: number, cy: number, cr: number): number | null => {
      const tc = (cx - x) * dx + (cy - y) * dy // 圆心在射线上的投影距离
      if (tc < 0) return null
      const nx = x + dx * tc - cx
      const ny = y + dy * tc - cy
      const rr = cr + BEAM_R
      const d2 = nx * nx + ny * ny
      if (d2 > rr * rr) return null
      return Math.max(0, tc - Math.sqrt(rr * rr - d2))
    }

    // 敌机与 Boss（含巨构 Boss 的机体判定圆与部位）一起比较，取距离最近的命中目标
    let bestT = Infinity
    let victim: Enemy | null = null
    let bossVictim: Boss | null = null
    let partVictim: BossPart | null = null
    let partBoss: Boss | null = null
    for (const e of this.enemies) {
      const t = rayHit(e.x, e.y, e.radius)
      if (t !== null && t < bestT) {
        bestT = t
        victim = e
        bossVictim = null
        partVictim = null
      }
    }
    for (const boss of this.bosses) {
      if (boss.entering || boss.defeated) continue
      // 有效伤害圆（巨构 Boss 仅核心扣本体血量）
      for (const c of boss.damageCircles) {
        const t = rayHit(c.x, c.y, c.r)
        if (t !== null && t < bestT) {
          bestT = t
          victim = null
          bossVictim = boss
          partVictim = null
        }
      }
      for (const part of boss.parts) {
        if (!part.alive) continue
        const t = rayHit(boss.x + part.x, boss.y + part.y, part.radius)
        if (t !== null && t < bestT) {
          bestT = t
          victim = null
          bossVictim = null
          partVictim = part
          partBoss = boss
        }
      }
    }

    // 光束终点：命中时止于目标中心，否则直通屏幕外。
    // 持续照射每帧重建光束（只保留一条，保证视觉连续），松开后由衰减逻辑淡出
    const hasTarget = victim !== null || bossVictim !== null || partVictim !== null
    const tx = victim
      ? victim.x
      : bossVictim
        ? bossVictim.x
        : partVictim
          ? partBoss!.x + partVictim.x
          : x + dx * FAR
    const ty = victim
      ? victim.y
      : bossVictim
        ? bossVictim.y
        : partVictim
          ? partBoss!.y + partVictim.y
          : y + dy * FAR
    this.laserBeams.length = 0
    this.laserBeams.push({ x1: x, y1: y, x2: tx, y2: ty, ttl: 6, max: 6, hit: hasTarget })

    if (!hasTarget || !tick) return
    const laserDmg = w.bulletDamage * this.player.effectiveAttackMul
    if (victim) victim.damage(laserDmg)
    else if (bossVictim) bossVictim.damage(laserDmg)
    else if (partVictim && partBoss) partBoss.partHit(partVictim, laserDmg)
    this.trackDamage(laserDmg)
    this.trackHit()
    this.playEnemyHitSfx()
    this.particles.burst(tx, ty, '#ffffff', 4, 2, 2, 12)
  }

  /**
   * 蓄力电弧（LW-04 特斯拉）命中判定：松手瞬间从炮口沿 angle 方向放出
   * 一道无限射程的贯穿电弧——路径上所有敌人与 Boss 同时受伤（可穿透，
   * 与激光"命中即止"不同）。power 为蓄力比例 0~1：伤害按比例递增，
   * 蓄满为完整伤害。电弧本体只是视觉残留（arcBeams），
   * 由渲染层绘制 Storm Lance 风格的折角闪电后逐帧衰减
   */
  private fireArc(x: number, y: number, angle: number, power: number) {
    const w = PLAYER_WEAPONS[this.player.weapon]
    /** 本次电弧单目标伤害：蓄力比例线性递增，蓄满为完整伤害 */
    const dmg = Math.round(w.bulletDamage * power * this.player.effectiveAttackMul)
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    /** 无限射程：取实时战场对角线的两倍作为电弧终点，任何窗口尺寸/角度下都直通屏外 */
    const FAR = Math.hypot(field.width, field.height) * 2
    /** 电弧判定半径（比激光更宽，体现蓄力一击的压迫感） */
    const ARC_R = 4

    // 射线与圆的求交：命中返回 true（贯穿机制不需要距离，只需在路径上）
    const rayHit = (cx: number, cy: number, cr: number): boolean => {
      const tc = (cx - x) * dx + (cy - y) * dy // 圆心在射线上的投影距离
      if (tc < 0) return false
      const nx = x + dx * tc - cx
      const ny = y + dy * tc - cy
      const rr = cr + ARC_R
      return nx * nx + ny * ny <= rr * rr
    }

    // 贯穿：路径上所有目标全部命中（命中粒子随蓄力等级配色：浅蓝 → 蓝 → 紫 → 红）
    const arcColor = chargePalette(power).branch
    let hits = 0
    for (const e of this.enemies) {
      if (!rayHit(e.x, e.y, e.radius)) continue
      e.damage(dmg)
      this.particles.burst(e.x, e.y, arcColor, Math.round(3 + 5 * power), 2.5, 2, 14)
      hits++
    }
    for (const boss of this.bosses) {
      if (boss.entering || boss.defeated) continue
      // 有效伤害圆：任一命中即结算本体伤害（每 Boss 只结算一次）
      const bodyHit = boss.damageCircles.some((c) => rayHit(c.x, c.y, c.r))
      if (bodyHit) {
        boss.damage(dmg)
        this.particles.burst(boss.x, boss.y, arcColor, Math.round(5 + 8 * power), 3, 2.5, 20)
        hits++
      }
      // 部位：贯穿电弧可同时撕开多个部位
      for (const part of boss.parts) {
        if (!part.alive) continue
        if (!rayHit(boss.x + part.x, boss.y + part.y, part.radius)) continue
        boss.partHit(part, dmg)
        this.particles.burst(boss.x + part.x, boss.y + part.y, arcColor, Math.round(4 + 6 * power), 2.5, 2, 18)
        hits++
      }
    }
    if (hits > 0) {
      this.trackDamage(dmg * hits)
      this.trackHit()
      this.playEnemyHitSfx()
    }

    // 炮口爆闪 + 电弧视觉残留 + 轻微震屏（命中反馈随蓄力比例增强）
    this.particles.burst(x, y, '#ffffff', Math.round(4 + 6 * power), 3, 2.5, 16)
    this.arcBeams.push({ x1: x, y1: y, x2: x + dx * FAR, y2: y + dy * FAR, ttl: 16, max: 16, power })
    this.shake = Math.max(this.shake, 2 + 5 * power)
  }

  // ==================== DPS 统计（训练室专用） ====================

  /** 命中反馈：每次命中递增序号，通知 Vue 层让准星闪一下 */
  private trackHit() {
    this.hitId++
  }

  /** 记录一次自机伤害（无敌单位不掉血也照常计入，方便测靶） */
  private trackDamage(n: number) {
    if (this.currentStage?.id !== 'training') return
    this.frameDamage += n
  }

  /** 逻辑帧末结算：本帧伤害写入环形缓冲，维护窗口和 / 累计 / 峰值 / 计时 */
  private flushDamageFrame() {
    if (this.currentStage?.id !== 'training') return
    const old = this.dmgWindow[this.dmgWindowIdx] ?? 0
    this.dmgWindowSum += this.frameDamage - old
    this.dmgWindow[this.dmgWindowIdx] = this.frameDamage
    this.dmgWindowIdx = (this.dmgWindowIdx + 1) % Game.DPS_WINDOW
    this.totalDamage += this.frameDamage
    // 首次造成伤害后开始计时，之后持续走动（停火不清零）
    if (this.frameDamage > 0 || this.combatFrames > 0) this.combatFrames++
    this.frameDamage = 0
    const dps = this.dmgWindowSum / (Game.DPS_WINDOW / 60)
    if (dps > this.peakDps) this.peakDps = dps
  }

  /** 敌弹 / 敌机体术 vs 自机判定点 */
  private collidePlayer() {
    const p = this.player
    if (!p.alive) return
    // 激活期间无敌，但不做「幽灵化」跳判：敌弹命中仍会被拦截并触发故障残影（见 onPlayerHit）
    const synapticGuard = this.skill === 'synaptic' && this.skillOn
    if (p.invincible > 0 && !synapticGuard) return
    const hr = BALANCE.player.hitboxRadius

    const items = this.enemyBullets.items
    for (let i = 0; i < items.length; i++) {
      const b = items[i]!
      if (!b.active) continue
      if (circleHit(b.x, b.y, b.radius, p.x, p.y, hr)) {
        this.enemyBullets.release(b)
        this.onPlayerHit(b.damage)
        return
      }
    }
    // 敌激光：照射中的光束段 vs 判定点（命中按 hitInterval 节流结算，
    // 站立不动约 1.7 秒致死；多条光束同帧命中只结算一次）
    for (const l of this.enemyLasers) {
      if (l.state !== 'firing') continue
      const ex = l.x + Math.cos(l.angle) * l.len
      const ey = l.y + Math.sin(l.angle) * l.len
      if (segmentCircleHit(l.x, l.y, ex, ey, l.cfg.halfWidth, p.x, p.y, hr)) {
        if (l.hitTimer <= 0) {
          l.hitTimer = l.cfg.hitInterval
          this.onPlayerHit(l.cfg.damage)
          return
        }
      }
    }
    for (const e of this.enemies) {
      // 无碰撞伤害的单位（训练靶等）直接跳过体术判定
      if (e.def.noContactDamage) continue
      if (circleHit(e.x, e.y, e.radius, p.x, p.y, hr)) {
        this.onPlayerHit(BALANCE.enemyContactDamage)
        return
      }
    }
    for (const boss of this.bosses) {
      if (boss.entering || boss.defeated) continue
      // 机体判定圆（巨构 Boss 为沿舰体排布的多个圆）
      let touched = false
      for (const c of boss.hitCircles) {
        if (circleHit(c.x, c.y, c.r, p.x, p.y, hr)) {
          touched = true
          break
        }
      }
      // 部位体术判定
      if (!touched) {
        for (const part of boss.parts) {
          if (!part.alive) continue
          if (circleHit(boss.x + part.x, boss.y + part.y, part.radius, p.x, p.y, hr)) {
            touched = true
            break
          }
        }
      }
      if (touched) {
        this.onPlayerHit(BALANCE.enemyContactDamage)
        return
      }
    }
  }

  /** 自机受击：扣血/扣盾 + 受击特效；血量归零直接游戏结束（无残机无复活） */
  /** 受击反馈：在自机周围随机位置闪出 3~4 个彩虹故障残影（渲染层读取 player.glitchGhosts 绘制） */
  private spawnSynapticGlitch() {
    const p = this.player
    const n = 3 + Math.floor(Math.random() * 2)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const d = 14 + Math.random() * 26
      const ttl = 9 + Math.floor(Math.random() * 6)
      p.glitchGhosts.push({
        x: p.x + Math.cos(a) * d,
        y: p.y + Math.sin(a) * d,
        angle: p.angle,
        ttl,
        maxTtl: ttl,
        seed: Math.random(),
      })
    }
    // 上限保护：极端弹幕密度下残影也不会无限堆积
    if (p.glitchGhosts.length > 16) p.glitchGhosts.splice(0, p.glitchGhosts.length - 16)
  }

  private onPlayerHit(damage: number) {
    // 激活期间无敌：不扣血，但在周围闪出彩虹故障残影作为受击反馈（节流防刷屏）
    if (this.skill === 'synaptic' && this.skillOn) {
      if (this.synapticGlitchCd <= 0) {
        this.synapticGlitchCd = 8
        this.spawnSynapticGlitch()
      }
      return
    }
    // 训练室无限生命：跳过扣血，仍给绿色受击反馈（提示"这一下本该受伤"）
    if (this.trainingGodMode) {
      this.particles.burst(this.player.x, this.player.y, '#86efac', 14, 2.5, 2.5, 26)
      this.particles.ring(this.player.x, this.player.y, '#4ade80', 12, 2.2, 2, 18)
      return
    }
    const result = this.player.hit(damage)
    if (!result) return
    this.particles.burst(this.player.x, this.player.y, '#7dd3fc', 30, 4, 3, 50)
    this.shake = result === 'dead' ? 16 : 10
    if (result === 'dead') {
      this.setScene('gameover')
    }
    this.emitHud()
  }

  // ==================== HUD / 存档 ====================

  private showBanner(text: string) {
    this.banner = text
    this.bannerId++
    this.bannerTimer = 160
    this.emitHud()
  }

  private setScene(s: SceneState) {
    this.scene = s
    this.emitHud()
  }

  private emitHud() {
    this.cb.onHud({
      scene: this.scene,
      hp: Math.max(0, this.player.hp),
      maxHp: this.player.maxHp,
      shield: Math.max(0, Math.round(this.player.shield)),
      maxShield: this.player.maxShield,
      dash: this.player.dashCharges,
      dashMax: this.player.dashMaxCharges,
      dashProgress: this.player.dashProgress,
      skillActive: this.skillOn,
      skillReady:
        this.skill === 'emp'
          ? this.empCharges > 0
            ? 1
            : 0
          : this.skill === 'gemini'
            ? this.geminiEnergy / BALANCE.gemini.duration
            : this.skill
              ? this.skillEnergy / BALANCE.skill.maxEnergy
              : 1,
      // EMP 充能制 HUD 数据（非充能制技能为 0）
      skillCharges: this.skill === 'emp' ? this.empCharges : 0,
      skillMaxCharges: this.skill === 'emp' ? BALANCE.emp.maxCharges : 0,
      skillChargeProgress:
        this.skill === 'emp'
          ? this.empCharges >= BALANCE.emp.maxCharges
            ? 1
            : this.empChargeTimer / this.empChargeRegenFrames
          : 0,
      // 免死守护 HUD 数据（未装备该义体为 null）
      deathGuard:
        this.player.deathGuardCooldownFrames > 0
          ? {
              ready: this.player.deathGuardTimer <= 0,
              progress: 1 - this.player.deathGuardTimer / this.player.deathGuardCooldownFrames,
              active: this.player.deathGuardActiveTimer > 0
            }
          : null,
      fps: Math.round(this.fps),
      // 场上存活 Boss（HUD 血条最多显示 3 个；带浮游炮增援的 Boss 附分段刻度）
      bosses: this.bosses
        .filter((b) => !b.defeated)
        .slice(0, 3)
        .map((b) => ({
          name: b.name,
          hp: Math.max(0, b.hp),
          maxHp: b.maxHp,
          segments: b.def.bitEscalation
            ? b.def.bitEscalation.stages.map((s) => s.atRatio).sort((x, y) => x - y)
            : b.def.leviathan
              ? (() => {
                  // 巨构 Boss：分段刻度 = 三阶段血量边界（升序比例）
                  const l = b.def.leviathan
                  const p2 = l.phase2PartDefs.reduce((s, d) => s + d.hp, 0)
                  const total = l.phaseHp[0] + p2 + l.phaseHp[1]
                  return [l.phaseHp[1] / total, (l.phaseHp[1] + p2) / total]
                })()
              : undefined
        })),
      // 巨构 Boss 部位列表（右上角独立血条）：取场上第一个带部位的 Boss
      bossParts: (() => {
        const host = this.bosses.find((b) => !b.defeated && b.parts.length > 0)
        if (!host) return null
        return host.parts.map((p) => ({
          id: p.id,
          name: p.name,
          hp: Math.max(0, p.hp),
          maxHp: p.maxHp,
          alive: p.alive
        }))
      })(),
      banner: this.banner,
      bannerId: this.bannerId,
      hitId: this.hitId,
      killId: this.killId,
      ammo: this.player.ammoHud,
      weaponSlot: this.player.weaponSlot,
      aiming: this.player.aiming,
      charge: this.player.chargeRatio,
      chargeMin: PLAYER_WEAPONS[this.player.weapon].chargeMinRatio ?? 0,
      heat: this.player.heatHud,
      dps:
        this.currentStage?.id === 'training'
          ? {
              current: Math.round(this.dmgWindowSum / (Game.DPS_WINDOW / 60)),
              peak: Math.round(this.peakDps),
              total: Math.round(this.totalDamage),
              time: Math.round((this.combatFrames / 60) * 10) / 10,
              // 面板钉在木桩右缘；木桩未生成时回退屏幕右上角
              anchor: this.dummyAnchor()
            }
          : null
    })
  }

  /** 训练靶右上方的屏幕锚点（DPS 面板定位用），未找到返回 null */
  private dummyAnchor(): { x: number; y: number } | null {
    const dummy = this.enemies.find((e) => e.def.key === 'DMY-01' && e.alive)
    if (!dummy) return null
    // 横向让出靶子辉光与受击粒子的范围，纵向与靶子顶部齐平
    return { x: dummy.x + dummy.radius + 42, y: dummy.y - dummy.radius }
  }

  /** 训练室用户生成的木桩假人列表（不包含场地默认的无敌假人） */
  private trainingDummies: Enemy[] = []

  /** 训练室：添加自定义血量的木桩假人 */
  spawnTrainingDummy(hp: number) {
    if (this.scene !== 'playing' || this.currentStage?.id !== 'training') return

    // 清理已死亡的训练假人引用
    this.trainingDummies = this.trainingDummies.filter(e => e.alive)

    // 场上最多保留 20 个，超出移除最旧的
    if (this.trainingDummies.length >= 20) {
      const oldest = this.trainingDummies.shift()
      if (oldest && oldest.alive) oldest.hp = 0
    }

    // 以场地中心为基准扩散随机偏移，避免全部叠在一起
    const pos = this.trainingDummySpread()
    const cfg: EnemySpawnConfig = {
      enemyKey: 'DMY-01',
      path: 'static',
      x: pos.x,
      y: pos.y,
      count: 1,
      gap: 0,
      hp,
      invincible: false
    }
    const dummy = new Enemy(cfg)
    this.enemies.push(dummy)
    this.trainingDummies.push(dummy)
  }

  /** 计算训练假人的扩散生成位置：以场地中心 (240,320) 为圆心，已有假人越多扩散半径越大 */
  private trainingDummySpread(): { x: number; y: number } {
    const cx = 240, cy = 320
    const count = this.trainingDummies.filter(e => e.alive).length
    const angle = Math.random() * Math.PI * 2
    // 从 24px 半径起步，每增加一个假人扩 9px，上限 170px
    const radius = Math.min(count * 9 + 24, 170)
    return {
      x: Math.round(cx + Math.cos(angle) * radius),
      y: Math.round(cy + Math.sin(angle) * radius)
    }
  }

  /** 清空所有用户生成的训练假人与场上 Boss，并恢复场地默认的无限血木桩 */
  clearTrainingDummies() {
    if (this.scene !== 'playing' || this.currentStage?.id !== 'training') return
    for (const dummy of this.trainingDummies) {
      dummy.hp = 0
    }
    this.trainingDummies = []
    // 清除全部 Boss（直接移除，不触发击破结算与横幅）
    for (const boss of this.bosses) {
      this.particles.burst(boss.x, boss.y, '#f0abfc', 30, 4, 3, 50)
    }
    this.stopAllBossSfx() // 清场前停掉残留的激光循环音
    this.bosses = []
    this.enemyBullets.clear()
    this.enemyLasers = []
    this.enemyBits = []
    this.bossBitStages.clear()
    this.bossBitInterval.clear()
    // 巨构 Boss 召唤的护卫机编队随清场一并移除
    this.clearAllBossMinions()
    // Boss 专属 BGM 若在播放则恢复战斗曲
    playBgm('gamePage')
    // 回到初始状态：恢复场地中央的无限血木桩
    this.restoreTrainingDummy()
  }

  /** 训练室：恢复场地默认的无限血木桩（场上仍有存活的 DMY-01 时不重复生成） */
  private restoreTrainingDummy() {
    if (this.currentStage?.id !== 'training') return
    const exists = this.enemies.some(e => e.def.key === 'DMY-01' && e.alive && e.hp > 0)
    if (exists) return
    this.enemies.push(
      new Enemy({ enemyKey: 'DMY-01', path: 'static', x: 240, y: 320, count: 1, gap: 0 })
    )
  }

  /** 训练室 Boss 登场横幅文案（未配置的 Boss 用默认警告文案） */
  private static readonly TRAINING_BOSS_WARNING: Partial<Record<EnemyKey, string>> = {
    'PRT-01': 'WARNING — 侦测到星际海盗信号',
    'LAS-01': 'WARNING — 侦测到高能光棱反应',
    'FIN-01': 'WARNING — 侦测到超巨型构造体反应'
  }

  /**
   * 训练室：开始模拟 Boss 战——删除全部木桩，屏幕上方召唤指定 Boss
   * （默认 LAS-01 棱镜星卫；可传 enemyKey 召唤其他 Boss，如 FIN-01 星渊巨构）。
   * 每调用一次就创建一个新 Boss，可同时在场多个（横向错开登场位置）。
   */
  startTrainingBoss(enemyKey: EnemyKey = 'LAS-01') {
    if (this.scene !== 'playing' || this.currentStage?.id !== 'training') return

    // 删除全部木桩（含场地默认的无敌假人与用户生成的假人）
    for (const e of this.enemies) {
      if (e.def.key === 'DMY-01') e.hp = 0
    }
    this.trainingDummies = []
    // 把尚未出场的木桩从生成时刻表中剔除，防止战斗中冒出无敌木桩挡弹
    this.schedule = this.schedule.filter((s) => s.cfg.enemyKey !== 'DMY-01')
    // 首个 Boss 入场时清一次场（弹幕/激光/浮游炮）；后续召唤不清场，避免干扰已在场的 Boss
    if (this.bosses.length === 0) {
      this.enemyBullets.clear()
      this.enemyLasers = []
      this.enemyBits = []
      this.bossBitStages.clear()
      this.bossBitInterval.clear()
    }
    // 阻止 maybeSpawnBoss 重复触发（训练室本身无 boss 配置，双保险）
    this.bossSpawned = true
    const b = this.createBoss({ enemyKey })
    // 多个 Boss 横向错开登场位置，避免完全重叠
    const idx = this.bosses.length
    const offset = (idx % 2 === 0 ? 1 : -1) * Math.ceil(idx / 2) * 100
    b.x = Math.max(80, Math.min(field.width - 80, b.x + offset))
    b.px = b.x
    this.bosses.push(b)
    // Boss 专属 BGM：登场时切换
    if (b.def.bgm) playBgm(b.def.bgm)
    // 登场横幅：按 Boss 定制警告文案
    this.showBanner(
      Game.TRAINING_BOSS_WARNING[enemyKey] ?? 'WARNING — 侦测到未知高能反应'
    )
  }

  private loadNumber(key: string): number {
    try {
      return Number(localStorage.getItem(key)) || 0
    } catch {
      return 0
    }
  }
}
