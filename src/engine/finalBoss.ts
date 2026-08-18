/**
 * 最终 Boss：星渊巨构「绯红天幕」（FIN-01）
 *
 * 一艘只从屏幕顶端探出下半身的远古母舰。与普通 Boss（武器轮播 /
 * 浮游炮增援）不同，它由本专属脚本全权驱动，三阶段各自由独立的
 * 血量池与部位体系推进：
 *
 * 阶段一「绯红要塞·全域封锁」——核心 + 四门副炮：
 *   - 主血条 = 核心血量；四门副炮独立血条（HUD 右上角），可单独击毁，
 *     击毁即永久缴械对应武器（两条路线：速攻核心 / 先拆副炮减压）
 *   - 每击毁一门副炮：核心伤害倍率 +0.35（0.6 起步，最高 2.0），
 *     同时对核心结算 6% 结构剥离伤害——全部只作用于阶段一
 *   - 核心被击破 → 阶段一结束
 *
 * 阶段二「蔷薇方程式」——左 / 中 / 右三个等血部位：
 *   - 主血条 = 三部位血量之和；次级血条 = 三部位各自血量
 *   - 三部位攻击方式各不相同（左=玫瑰花阵、中=扫射光束+高速针、
 *     右=追踪导弹）；击毁一个部位会对另外两个造成 20% 剥离伤害
 *     （只作用于阶段二，不影响阶段三）
 *   - 三部位全部击毁 → 阶段二结束
 *
 * 阶段三「超球面·坍缩终局」——只剩舰体：
 *   - 打哪里都有伤害，没有任何机制，直接击溃
 *
 * 转阶段演出：阶段击破瞬间全场弹幕清屏 + 沿舰体多点连爆 + 冲击波 +
 * 符卡横幅 + 强震屏，随后进入约 2.5 秒的无敌转阶段窗口（Boss 停火、
 * 不可锁定），窗口结束后下一阶段的部位 / 血量池就位。
 * 舰体外观随阶段逐级损伤：一阶段完好 → 二阶段裂纹 → 三阶段核心
 * 炸毁成残骸、满身裂痕与火花，让玩家真切感受到星舰在崩塌。
 *
 * 弹速与光束宽度随屏幕纵向比例（field.sy）缩放，2K 屏下弹幕速度
 * 与体积保持与基准分辨率一致的手感。
 */
import type { BgmBeat } from '../utils/bgm'
import type {
  BossConfig,
  BossPart,
  BulletStyleKey,
  EnemyLaserAttackConfig,
  EnemyLaserSpawnFn,
  EnemySpawnConfig,
  LeviathanConfig,
  LeviathanPartDef,
  Vec2
} from '../types'
import { Boss } from './boss'
import type { BulletSpawnFn } from './bullet'
import { field } from './field'
import { playSfx, preloadSfx, startSfxLoop } from '../utils/sfx'
import bossLaserChargeSfx from '../assets/audio/battle/BossLaserCharge.wav'
import bossLaserBeamSfx from '../assets/audio/battle/BossLaserBeam.wav'
import bossMegaBeamSfx from '../assets/audio/battle/BossMegaBeam.wav'
import bossMissileSfx from '../assets/audio/battle/BossMissile.wav'
import bossHeavyShotSfx from '../assets/audio/battle/BossHeavyShot.wav'
import bossSummonSfx from '../assets/audio/battle/BossSummon.wav'

const DEG = Math.PI / 180
const TAU = Math.PI * 2

/** 舰体设计尺寸（480×640 设计空间，几何整体随 S 缩放；上半藏于屏外） */
const HULL_HALF = 230
const HULL_TOP = -140
const HULL_BOTTOM = 80
/** 可见区顶部（设计 y ≥ VISIBLE_TOP 的部分露出屏幕） */
const VISIBLE_TOP = 10
/** 阶段一核心（承受阶段一本体血量）在舰体设计空间的偏移 */
const CORE_X = 0
const CORE_Y = 40
const CORE_R = 36

/** 阶段一核心主炮：锁定自机的单发粗光束（无旋转） */
const CORE_LASER: EnemyLaserAttackConfig = {
  aim: 'player',
  telegraph: 52,
  duration: 84,
  fade: 14,
  rest: 0,
  halfWidth: 12,
  damage: 40,
  hitInterval: 24,
  count: 1,
  spacing: 0
}

/** 阶段一二：三束平行横扫光束（宽幅光幕，间距/宽度随 sy 缩放） */
const TRIPLE_SWEEP: EnemyLaserAttackConfig = {
  aim: 'player',
  telegraph: 50,
  duration: 300,
  fade: 16,
  rest: 0,
  halfWidth: 26,
  damage: 40,
  hitInterval: 24,
  count: 1,
  spacing: 46,
  sweep: 0.45
}

/** 阶段一二：半屏宽度的巨型光束（瞄准即审判） */
const MEGA_BEAM: EnemyLaserAttackConfig = {
  aim: 'player',
  telegraph: 70,
  duration: 110,
  fade: 20,
  rest: 0,
  halfWidth: 110,
  damage: 45,
  hitInterval: 24,
  count: 1,
  spacing: 0
}

/** 阶段二：横扫的半屏光束（旋转巨幕） */
const MEGA_SWEEP: EnemyLaserAttackConfig = {
  aim: 'player',
  telegraph: 60,
  duration: 420,
  fade: 18,
  rest: 0,
  halfWidth: 80,
  damage: 45,
  hitInterval: 24,
  count: 1,
  spacing: 0,
  sweep: 0.25
}

/** 阶段二扫射光束：锁定自机后持续旋转扫过战场（sweep 方向每轮交替） */
const SWEEP_LASER: EnemyLaserAttackConfig = {
  aim: 'player',
  telegraph: 42,
  duration: 260,
  fade: 14,
  rest: 0,
  halfWidth: 10,
  damage: 40,
  hitInterval: 24,
  count: 1,
  spacing: 0,
  sweep: 0.5
}

/** 阶段三风车激光：三道 120° 均布光束绕核心位同步旋转 */
const WIND_LASER: EnemyLaserAttackConfig = {
  aim: 'player',
  telegraph: 46,
  duration: 420,
  fade: 14,
  rest: 0,
  halfWidth: 9,
  damage: 40,
  hitInterval: 24,
  count: 1,
  spacing: 0,
  sweep: 0.42
}

export class FinalBoss extends Boss {
  override readonly radius = 30
  /** 部位实体（阶段一四门副炮 / 阶段二三部位，随阶段切换重建） */
  override parts: BossPart[]
  /**
   * 总血量上限（= 三阶段血量之和，全程固定）：
   * 阶段一核心 6000 + 阶段二三部位 15000 + 阶段三舰体 8000 = 29000。
   * 主血条跨阶段持续下降，阶段边界由 HUD 分段刻度标出
   */
  override maxHp: number

  /** 舰体整体缩放：宽度逼近屏宽 94%、可见部分逼近屏高 25%，取更小者 */
  readonly S: number
  /** 当前阶段 1~3 */
  phase = 1
  /** 存活帧数（登场即开始累计，渲染动画与函数弹幕的自变量） */
  age = 0
  /** 各炮塔当前瞄准角（渲染层画炮管朝向用，按部位 id 索引） */
  barrelAims: Record<string, number> = {}
  /** 机库弹射闪光剩余帧数（渲染层据此点亮机库舱门，>0 表示刚弹射编队） */
  summonFlash = 0
  /** 核心受击闪白剩余帧数（渲染层只让核心本体变白，不波及舰体） */
  coreFlash = 0
  /** 舰体受击闪白剩余帧数（仅阶段三：整舰承伤，舰体闪白） */
  hullFlash = 0

  private readonly lc: LeviathanConfig
  /** 阶段二部位血量之和（用于总血量与显示血量换算） */
  private readonly phase2Total: number
  /** 当前阶段剩余血量（阶段一核心 / 阶段二三部位之和 / 阶段三舰体） */
  private phaseHpLeft = 0
  /** 光束配置（半宽与间距随屏幕纵向比例放大，2K 下光幕依旧壮观） */
  private readonly laserCore: EnemyLaserAttackConfig
  private readonly laserTriple: EnemyLaserAttackConfig
  private readonly laserMega: EnemyLaserAttackConfig
  private readonly laserMegaSweep: EnemyLaserAttackConfig
  private readonly laserSweep: EnemyLaserAttackConfig
  private readonly laserWind: EnemyLaserAttackConfig

  // ==================== 阶段一计时器 ====================
  private cdGunL = 10
  private cdGunR = 18
  private cdPodL = 45
  private cdPodR = 35
  private cdCoreLaser = 140
  private cdCardioid = 120
  private cdPhyllo = 110
  private cdMegaOrb = 150
  private shotR = 0
  private rotPodR = 0
  /** 核心激光轮换：0 = 三重横扫光幕 / 1 = 半屏巨型光束 */
  private laserAlt = 0
  /** 阶段一已击毁的副炮数（核心伤害倍率 = 基础 + 增量 × 此数） */
  private turretsDestroyed = 0
  // ==================== 阶段二计时器 ====================
  private cdRose = 60
  private cdNeedle = 6
  private cdSweep = 200
  private cdMegaSweep = 160
  private cdMissile2 = 70
  private cdAstroid = 140
  private cdSquares = 110
  private cdCapsule = 80
  private cdBigOrb2 = 170
  private roseBase = 0
  private roseParity = 0
  private sweepDir: 1 | -1 = 1
  // ==================== 阶段三计时器 ====================
  private cdSphere = 80
  private cdWall = 20
  private cdWind = 160
  private cdMissile3 = 60
  private cdFan3 = 30
  private sphereRot = 0
  private wallBase = 0
  private windDir: 1 | -1 = 1
  // ==================== 召唤 ====================
  private summonT = 1800
  private summonSide: 1 | -1 = 1
  // ==================== 音效 ====================
  /** 激光持续音调度：telegraph 预警结束后起播循环音，照射 + 残影结束停播 */
  private beamSfx: { delay: number; left: number; mega: boolean; stop: (() => void) | null }[] = []
  /** 激光预警蓄力音节流（帧）：三束同帧齐射只响一次 */
  private chargeSfxCd = 0
  /** 重型齐射音节流（帧）：巨弹/方块墙/玫瑰阵/球面近帧齐射只响一次 */
  private heavySfxCd = 0
  /** 训练室多 Boss 同屏时的登场横向错位（首次移动时捕获并保持） */
  private baseOff: number | null = null
  // ==================== 转阶段 ====================
  /** 无敌转阶段窗口剩余帧数（>0：停火、不可锁定、不承伤；
   *  游戏层与渲染层据此驱动连爆与屏幕特效） */
  transitionT = 0
  /** 转阶段窗口结束后进入的阶段 */
  private pendingPhase = 1
  // ==================== 死亡演出 ====================
  /** 击破倒计时剩余帧数（>0：停火、不承伤、舰体下沉解体，归零正式击破；
   *  游戏层与渲染层据此驱动连爆与舰体崩塌特效） */
  dyingT = 0

  constructor(
    cfg: BossConfig,
    onDefeated: () => void,
    onWeaponChange: ((name: string) => void) | undefined,
    /** 部位被击毁回调（外层放爆炸特效 / 震屏） */
    private readonly onPartDestroyed: (part: BossPart) => void,
    /** 阶段切换回调（外层清屏 + 连爆演出 + 符卡横幅 + 震屏） */
    private readonly onPhaseChange: (name: string) => void
  ) {
    super(cfg, onDefeated, onWeaponChange)
    const lc = this.def.leviathan
    if (!lc) throw new Error('[FinalBoss] 缺少 leviathan 配置，请检查 config/enemies.ts')
    this.lc = lc
    this.S = Math.min(
      (field.width * 0.94) / (HULL_HALF * 2),
      (field.height * 0.25) / (HULL_BOTTOM - VISIBLE_TOP)
    )
    // 光束半宽与间距随屏幕纵向比例缩放（基准分辨率 640 设计高度）
    const scaleLaser = (c: EnemyLaserAttackConfig): EnemyLaserAttackConfig => ({
      ...c,
      halfWidth: c.halfWidth * field.sy,
      spacing: c.spacing * field.sy
    })
    this.laserCore = scaleLaser(CORE_LASER)
    this.laserTriple = scaleLaser(TRIPLE_SWEEP)
    this.laserMega = scaleLaser(MEGA_BEAM)
    this.laserMegaSweep = scaleLaser(MEGA_SWEEP)
    this.laserSweep = scaleLaser(SWEEP_LASER)
    this.laserWind = scaleLaser(WIND_LASER)
    // 总血量 = 三阶段血量之和（全程固定，主血条跨阶段持续下降）
    this.phase2Total = lc.phase2PartDefs.reduce((s, d) => s + d.hp, 0)
    this.maxHp = lc.phaseHp[0] + this.phase2Total + lc.phaseHp[1]
    // 阶段一：当前阶段剩余 = 核心血量
    this.phaseHpLeft = lc.phaseHp[0]
    this.hp = this.phaseHpLeft + this.phase2Total + lc.phaseHp[1]
    this.parts = this.makeParts(lc.partDefs)
    // 登场起点：完全藏于屏幕上缘之外，缓动滑入
    this.y = HULL_TOP * this.S * 1.6
    this.py = this.y
    this.x = field.cx
    this.px = this.x
    // 预解码专属音效（登场动画期间完成，首轮开火零延迟）
    preloadSfx(bossLaserChargeSfx)
    preloadSfx(bossLaserBeamSfx)
    preloadSfx(bossMegaBeamSfx)
    preloadSfx(bossMissileSfx)
    preloadSfx(bossHeavyShotSfx)
    preloadSfx(bossSummonSfx)
  }

  /** 按部位定义建运行时实体 */
  private makeParts(defs: LeviathanPartDef[]): BossPart[] {
    return defs.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      x: d.x * this.S,
      y: d.y * this.S,
      radius: d.radius * this.S,
      hp: d.hp,
      maxHp: d.hp,
      alive: true,
      flash: 0
    }))
  }

  /**
   * 部位狂怒系数：部位血量越低火力越强。
   * 满血 = 1，残血逼近 max（默认 1.6）——用于缩短开火冷却、增加弹数与弹速，
   * 渲染层同步按残血量点亮灼热光圈
   */
  private rage(p: BossPart, max = 1.6): number {
    if (p.maxHp <= 0) return 1
    return 1 + (1 - p.hp / p.maxHp) * (max - 1)
  }

  /** 舰体中心高度：可见区（设计 y VISIBLE_TOP~HULL_BOTTOM）恰好贴住屏幕顶端 */
  private homeY(): number {
    return -VISIBLE_TOP * this.S
  }

  /** 核心能量点（阶段一核心 / 阶段三破损反应堆，多数弹幕与激光的发射源） */
  private core(): { x: number; y: number } {
    return { x: this.x + CORE_X * this.S, y: this.y + CORE_Y * this.S }
  }

  private part(id: string): BossPart | undefined {
    return this.parts.find((p) => p.id === id)
  }

  /** 显示血量 = 当前阶段剩余 + 后续阶段的完整血量（主血条跨阶段连续下降） */
  private syncHp() {
    const later =
      this.phase === 1 ? this.phase2Total + this.lc.phaseHp[1] : this.phase === 2 ? this.lc.phaseHp[1] : 0
    this.hp = Math.max(0, Math.min(this.maxHp, this.phaseHpLeft + later))
  }

  /** 自动索敌锁定点：阶段一核心 / 阶段二存活部位 / 阶段三舰体 */
  override get targetPoint(): { x: number; y: number } {
    if (this.phase === 1) return this.core()
    if (this.phase === 2) {
      const p = this.parts.find((x) => x.id === 'sec-c' && x.alive) ?? this.parts.find((x) => x.alive)
      if (p) return { x: this.x + p.x, y: this.y + p.y }
    }
    return this.core()
  }

  /** 自动索敌候选点：阶段一核心+四副炮 / 阶段二存活部位 / 阶段三整舰判定圆中心（鼠标指哪锁哪） */
  override get aimPoints(): { x: number; y: number }[] {
    if (this.phase === 2) {
      return this.parts.filter((p) => p.alive).map((p) => ({ x: this.x + p.x, y: this.y + p.y }))
    }
    if (this.phase === 3) {
      return this.damageCircles.map((c) => ({ x: c.x, y: c.y }))
    }
    const pts = [this.core()]
    for (const p of this.parts) if (p.alive) pts.push({ x: this.x + p.x, y: this.y + p.y })
    return pts
  }

  /** 转阶段无敌窗口 / 死亡演出中不可锁定 */
  override get trackable(): boolean {
    return !this.entering && !this.defeated && this.transitionT <= 0 && this.dyingT <= 0
  }

  /**
   * 巨构舰体判定圆：仅用于体术碰撞，紧贴可见舰腹下缘、且所有圆的下缘
   * 都收在核心 / 副炮判定圆之内——自机弹从下方射来时永远先碰到
   * 核心或副炮，不会撞上悬空的"装甲墙"
   */
  override get hitCircles(): { x: number; y: number; r: number }[] {
    if (this.dyingT > 0) return [] // 死亡演出中不碰撞
    const s = this.S
    return [
      { x: this.x, y: this.y + 58 * s, r: 12 * s }, // 中央舰腹
      { x: this.x - 78 * s, y: this.y + 56 * s, r: 14 * s }, // 左下腹
      { x: this.x + 78 * s, y: this.y + 56 * s, r: 14 * s }, // 右下腹
      { x: this.x - 138 * s, y: this.y + 44 * s, r: 14 * s }, // 左翼下缘
      { x: this.x + 138 * s, y: this.y + 44 * s, r: 14 * s }, // 右翼下缘
      { x: this.x - 190 * s, y: this.y + 24 * s, r: 18 * s }, // 左翼中段
      { x: this.x + 190 * s, y: this.y + 24 * s, r: 18 * s }, // 右翼中段
      { x: this.x - 218 * s, y: this.y + 12 * s, r: 14 * s }, // 左翼尖
      { x: this.x + 218 * s, y: this.y + 12 * s, r: 14 * s }, // 右翼尖
      { x: this.x + CORE_X * s, y: this.y + CORE_Y * s, r: CORE_R * s } // 核心（体术）
    ]
  }

  /**
   * 有效伤害圆（本体承伤判定）按阶段切换：
   * 阶段一仅核心；阶段二本体不承伤（只有三部位可击）；阶段三整舰皆可击
   */
  override get damageCircles(): { x: number; y: number; r: number }[] {
    if (this.transitionT > 0 || this.dyingT > 0) return []
    if (this.phase === 1) {
      return [
        { x: this.x + CORE_X * this.S, y: this.y + CORE_Y * this.S, r: CORE_R * this.S }
      ]
    }
    if (this.phase === 2) return []
    // 阶段三：覆盖整片可见舰体的判定圆（互相重叠，不留任何死角）
    const s = this.S
    return [
      { x: this.x, y: this.y + 14 * s, r: 44 * s }, // 中央上段
      { x: this.x - 45 * s, y: this.y + 20 * s, r: 40 * s }, // 中左衔接
      { x: this.x + 45 * s, y: this.y + 20 * s, r: 40 * s }, // 中右衔接
      { x: this.x - 88 * s, y: this.y + 30 * s, r: 36 * s },
      { x: this.x + 88 * s, y: this.y + 30 * s, r: 36 * s },
      { x: this.x - 130 * s, y: this.y + 28 * s, r: 34 * s },
      { x: this.x + 130 * s, y: this.y + 28 * s, r: 34 * s },
      { x: this.x - 168 * s, y: this.y + 16 * s, r: 30 * s },
      { x: this.x + 168 * s, y: this.y + 16 * s, r: 30 * s },
      { x: this.x - 205 * s, y: this.y + 12 * s, r: 24 * s },
      { x: this.x + 205 * s, y: this.y + 12 * s, r: 24 * s },
      { x: this.x - 222 * s, y: this.y + 14 * s, r: 16 * s },
      { x: this.x + 222 * s, y: this.y + 14 * s, r: 16 * s },
      { x: this.x, y: this.y + 48 * s, r: 32 * s }, // 中央下段
      { x: this.x - 50 * s, y: this.y + 54 * s, r: 30 * s }, // 下左衔接
      { x: this.x + 50 * s, y: this.y + 54 * s, r: 30 * s }, // 下右衔接
      { x: this.x - 88 * s, y: this.y + 56 * s, r: 26 * s },
      { x: this.x + 88 * s, y: this.y + 56 * s, r: 26 * s },
      { x: this.x - 130 * s, y: this.y + 48 * s, r: 24 * s },
      { x: this.x + 130 * s, y: this.y + 48 * s, r: 24 * s },
      { x: this.x - 158 * s, y: this.y + 40 * s, r: 22 * s },
      { x: this.x + 158 * s, y: this.y + 40 * s, r: 22 * s },
      { x: this.x - 185 * s, y: this.y + 30 * s, r: 20 * s },
      { x: this.x + 185 * s, y: this.y + 30 * s, r: 20 * s }
    ]
  }

  override update(
    aim: Vec2,
    spawn: BulletSpawnFn,
    timeScale = 1,
    spawnLaser?: EnemyLaserSpawnFn,
    _beat?: BgmBeat | null,
    summon?: (cfg: EnemySpawnConfig) => void
  ) {
    this.px = this.x
    this.py = this.y
    if (this.defeated) return
    // 死亡演出：停火停召唤、不承伤，舰体缓缓下沉解体；倒计时结束正式击破
    if (this.dyingT > 0) {
      this.stopAllBeamSfx() // 游戏层已清空激光实体，停掉循环音
      this.dyingT -= timeScale
      this.age += timeScale
      if (this.flash > 0) this.flash--
      if (this.coreFlash > 0) this.coreFlash -= timeScale
      if (this.hullFlash > 0) this.hullFlash -= timeScale
      this.y += 0.3 * this.S * timeScale
      if (this.dyingT <= 0) {
        this.dyingT = 0
        this.defeated = true
        this.onDefeated()
      }
      return
    }
    // 电磁脉冲干扰：整舰冻结（部位不转动、不召唤、不开火）
    if (this.stun > 0 && !this.entering) {
      this.stopAllBeamSfx() // EMP 清空全场激光，循环音同步停
      this.stun--
      return
    }

    if (this.entering) {
      this.age++
      const target = this.homeY()
      this.y += (target - this.y) * 0.045 + 1.4 * this.S
      if (target - this.y < 4) {
        this.y = target
        this.entering = false
        // 登场横幅：打出第一阶段符卡名
        this.onPhaseChange(this.lc.spellCards[0]!)
      }
      return
    }

    // 无敌转阶段窗口：停火、冻结、不承伤；闪白正常衰减；窗口结束就位下一阶段
    if (this.transitionT > 0) {
      this.stopAllBeamSfx() // 阶段击破时游戏层清屏，循环音同步停
      this.age += timeScale
      if (this.flash > 0) this.flash--
      if (this.summonFlash > 0) this.summonFlash -= timeScale
      if (this.coreFlash > 0) this.coreFlash -= timeScale
      if (this.hullFlash > 0) this.hullFlash -= timeScale
      this.transitionT--
      if (this.transitionT <= 0) this.enterPhase(this.pendingPhase)
      return
    }

    this.age += timeScale
    if (this.flash > 0) this.flash--
    if (this.summonFlash > 0) this.summonFlash -= timeScale
    if (this.coreFlash > 0) this.coreFlash -= timeScale
    if (this.hullFlash > 0) this.hullFlash -= timeScale
    this.updateParts(timeScale)
    this.updateDrift(timeScale)
    this.updateSfx(timeScale)

    // 编队召唤：按阶段节奏从机库舱门弹射护卫机群（阶段三不再召唤）
    this.summonT -= timeScale
    if (this.summonT <= 0) {
      this.summonT = this.lc.summonIntervals[this.phase - 1]!
      this.summonFlash = 36
      if (this.phase < 3) {
        playSfx(bossSummonSfx)
        for (const cfg of this.summonSquadron()) summon?.(cfg)
      }
    }

    switch (this.phase) {
      case 1:
        this.updatePhase1(aim, spawn, spawnLaser, timeScale)
        break
      case 2:
        this.updatePhase2(aim, spawn, spawnLaser, timeScale)
        break
      default:
        this.updatePhase3(aim, spawn, spawnLaser, timeScale)
        break
    }
  }

  /** 部位每帧刷新：设计偏移 × S + 待机浮动 + 受击闪白衰减 */
  private updateParts(timeScale: number) {
    const defs = this.phase === 1 ? this.lc.partDefs : this.lc.phase2PartDefs
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i]!
      const d = defs[i]!
      const bob = p.alive ? Math.sin(this.age * 0.03 + i * 1.7) * 2.4 : 0
      p.x = d.x * this.S
      p.y = d.y * this.S + bob * Math.min(this.S, 2)
      if (p.flash > 0) p.flash -= timeScale
    }
  }

  /** 巨构漂移：横向摆幅加大 + 纵向微幅呼吸，更具压迫与追击感 */
  private updateDrift(timeScale: number) {
    if (this.baseOff === null) this.baseOff = this.x - field.cx
    const sway = Math.min(30 * this.S, field.width * 0.028)
    const halfSpan = Math.max(0, field.width / 2 - HULL_HALF * this.S - 8)
    const ox = Math.sin(this.age * 0.0055) * sway * timeScale
    this.x = field.cx + this.baseOff + Math.max(-halfSpan, Math.min(halfSpan, ox))
    this.y = this.homeY() + Math.sin(this.age * 0.008) * 5 * Math.min(this.S, 2)
  }

  /** 阶段击破：连爆演出 + 无敌转阶段窗口（结束后就位下一阶段） */
  private startPhaseClear(next: number) {
    this.transitionT = 150
    this.pendingPhase = next
    this.phaseHpLeft = 0
    this.syncHp()
    // 阶段一收尾：残余副炮一并殉爆（仅视觉，不再结算剥离伤害）
    if (this.phase === 1) {
      for (const p of this.parts) {
        if (p.alive) {
          p.alive = false
          this.onPartDestroyed(p)
        }
      }
    }
    this.onPhaseChange(this.lc.spellCards[next - 1]!)
  }

  /** 转阶段窗口结束：切换阶段、重建部位与血量池、重置弹幕节奏 */
  private enterPhase(next: number) {
    this.phase = next
    if (next === 2) {
      // 阶段二：左/中/右三个等血部位，当前阶段剩余 = 三者之和
      this.parts = this.makeParts(this.lc.phase2PartDefs)
      this.phaseHpLeft = this.phase2Total
      this.syncHp()
    } else if (next === 3) {
      // 阶段三：只剩舰体，整舰皆可击
      this.parts = []
      this.phaseHpLeft = this.lc.phaseHp[1]!
      this.syncHp()
    }
    this.summonFlash = 36
    // 重排节奏：所有计时器按新阶段初始值重新走
    this.cdGunL = 10
    this.cdGunR = 18
    this.cdPodL = 45
    this.cdPodR = 35
    this.cdCoreLaser = 140
    this.cdCardioid = 120
    this.cdPhyllo = 110
    this.cdMegaOrb = 150
    this.cdRose = 60
    this.cdNeedle = 6
    this.cdSweep = 200
    this.cdMegaSweep = 160
    this.cdMissile2 = 70
    this.cdAstroid = 140
    this.cdSquares = 110
    this.cdCapsule = 80
    this.cdBigOrb2 = 170
    this.cdSphere = 80
    this.cdWall = 20
    this.cdWind = 160
    this.cdMissile3 = 60
    this.cdFan3 = 30
  }

  /** 本体受击（按阶段）：一阶段核心 / 二阶段不承伤 / 三阶段整舰 */
  override damage(n: number) {
    if (this.entering || this.defeated || this.transitionT > 0 || this.dyingT > 0) return
    if (this.phase === 1) {
      // 核心：伤害倍率随已击毁副炮数提升（只影响阶段一）
      const mul = this.lc.coreDamageBase + this.lc.coreDamagePerPart * this.turretsDestroyed
      n = Math.max(1, Math.round(n * mul))
      this.phaseHpLeft = Math.max(0, this.phaseHpLeft - n)
      this.syncHp()
      this.coreFlash = 3 // 只闪核心，不闪舰体
      if (this.phaseHpLeft <= 0) {
        this.startPhaseClear(2) // 核心击破 → 阶段一结束
      }
      return
    }
    if (this.phase === 2) return // 阶段二本体不承伤，只有三部位可击
    // 阶段三：整舰承伤
    this.phaseHpLeft = Math.max(0, this.phaseHpLeft - n)
    this.syncHp()
    this.hullFlash = 3
    if (this.phaseHpLeft <= 0) {
      // 进入死亡演出：3.5 秒解体崩塌后正式击破（由 update 驱动 onDefeated）
      this.dyingT = 210
    }
  }

  /** 部位受击（按阶段机制结算） */
  override partHit(part: BossPart, damage: number) {
    if (!part.alive || this.defeated || this.transitionT > 0 || this.dyingT > 0) return
    part.hp -= damage
    part.flash = 3
    if (part.hp > 0) {
      // 阶段二部位掉血同步主血条（当前阶段剩余 = 三部位之和）
      if (this.phase === 2) this.syncPhase2Hp()
      return
    }
    part.hp = 0
    part.alive = false
    if (this.phase === 1) {
      // 阶段一：击毁副炮 → 核心伤害倍率 + 结构剥离伤害（只作用于阶段一核心）
      this.turretsDestroyed++
      this.phaseHpLeft = Math.max(
        0,
        this.phaseHpLeft - Math.round(this.lc.phaseHp[0] * this.lc.partBonusRatio)
      )
      this.syncHp()
      this.coreFlash = 3
      this.onPartDestroyed(part)
      if (this.phaseHpLeft <= 0) {
        this.startPhaseClear(2)
      }
    } else {
      // 阶段二：击毁一个部位 → 对另外两个部位造成剥离伤害（只作用于阶段二）
      for (const o of this.parts) {
        if (o.alive) o.hp = Math.max(1, o.hp - Math.round(part.maxHp * this.lc.phase2PartChipRatio))
      }
      this.syncPhase2Hp()
      this.onPartDestroyed(part)
      if (this.parts.every((p) => !p.alive)) {
        this.startPhaseClear(3) // 三部位全灭 → 阶段二结束
      }
    }
  }

  /** 阶段二剩余血量同步：当前阶段剩余 = 三部位存活血量之和 */
  private syncPhase2Hp() {
    this.phaseHpLeft = this.parts.reduce((s, p) => s + Math.max(0, p.hp), 0)
    this.syncHp()
  }

  // ==================== 弹幕生成原语（弹速随 field.sy 缩放） ====================

  /** 朝自机方向的扇形直射 */
  private fan(
    spawn: BulletSpawnFn,
    style: BulletStyleKey,
    x: number,
    y: number,
    n: number,
    spreadDeg: number,
    centerA: number,
    speed: number,
    dmg: number
  ) {
    const total = spreadDeg * DEG
    const v = speed * field.sy
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? centerA : centerA - total / 2 + (total * i) / (n - 1)
      spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, style, dmg)
    }
  }

  /** 全周环形弹（baseDeg 每轮推进 → 旋转环） */
  private ring(
    spawn: BulletSpawnFn,
    style: BulletStyleKey,
    x: number,
    y: number,
    n: number,
    speed: number,
    baseDeg: number,
    dmg: number
  ) {
    const v = speed * field.sy
    for (let i = 0; i < n; i++) {
      const a = ((i / n) * TAU + baseDeg * DEG) % TAU
      spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, style, dmg)
    }
  }

  /** 弧段弹：n 颗弹丸均布在 [startA, startA + arcLen] 弧段上 */
  private arc(
    spawn: BulletSpawnFn,
    style: BulletStyleKey,
    x: number,
    y: number,
    n: number,
    arcLen: number,
    startA: number,
    speed: number,
    dmg: number
  ) {
    const v = speed * field.sy
    for (let i = 0; i < n; i++) {
      const a = startA + (arcLen * i) / n
      spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, style, dmg)
    }
  }

  /** 追踪导弹：发射后朝自机追踪锁定 lock 帧（moveDelay 窗口内持续转向），随后沿当前方向直线飞出屏幕 */
  private missile(
    spawn: BulletSpawnFn,
    x: number,
    y: number,
    a: number,
    speed: number,
    life: number,
    dmg: number,
    lock = 60
  ) {
    const v = speed * field.sy
    spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, 'missile-cyan', dmg, 0.04, life, {
      moveDelay: lock
    })
  }

  /** 火神机炮：朝自机的高速连射流（带随机散布，弹如雨下） */
  private vulcan(
    spawn: BulletSpawnFn,
    style: BulletStyleKey,
    x: number,
    y: number,
    aimA: number,
    n: number,
    spreadDeg: number,
    speed: number,
    dmg: number
  ) {
    const v = speed * field.sy
    const total = spreadDeg * DEG
    for (let i = 0; i < n; i++) {
      const jitter = (Math.random() - 0.5) * 0.07
      const a = n === 1 ? aimA + jitter : aimA - total / 2 + (total * i) / (n - 1) + jitter
      spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, style, dmg)
    }
  }

  /** 心形线（cardioid）弹幕：速度按 1+cosθ 调制，波前在飞行中展开成心形 */
  private cardioid(
    spawn: BulletSpawnFn,
    style: BulletStyleKey,
    x: number,
    y: number,
    n: number,
    speed: number,
    baseDeg: number,
    dmg: number
  ) {
    const v = speed * field.sy
    for (let i = 0; i < n; i++) {
      const a = ((i / n) * TAU + baseDeg * DEG) % TAU
      const k2 = (1 + Math.cos(a - Math.PI)) / 2 // 朝自机方向最快
      const sp2 = v * (0.3 + 0.7 * k2)
      spawn(x, y, Math.cos(a) * sp2, Math.sin(a) * sp2, style, dmg)
    }
  }

  /** 星形线（astroid）弹幕：弹丸从四尖星形曲线上沿外法向射出 */
  private astroid(
    spawn: BulletSpawnFn,
    style: BulletStyleKey,
    x: number,
    y: number,
    n: number,
    speed: number,
    dmg: number
  ) {
    const v = speed * field.sy
    const R = 46 * this.S
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU
      const c3 = Math.pow(Math.cos(t), 3)
      const s3 = Math.pow(Math.sin(t), 3)
      const ox = x + c3 * R
      const oy = y + s3 * R
      const a = t + Math.PI / 4
      spawn(ox, oy, Math.cos(a) * v, Math.sin(a) * v, style, dmg)
    }
  }

  /** 黄金角向日葵螺旋（phyllotaxis）：137.5° 黄金角旋出的自然螺旋弹雨 */
  private phyllotaxis(
    spawn: BulletSpawnFn,
    style: BulletStyleKey,
    x: number,
    y: number,
    n: number,
    speed: number,
    baseDeg: number,
    dmg: number
  ) {
    const v = speed * field.sy
    const GA = 137.507764 * DEG
    const R = 52 * this.S
    for (let i = 0; i < n; i++) {
      const a = baseDeg * DEG + i * GA
      const rr = Math.sqrt((i + 1) / n) * R
      spawn(
        x + Math.cos(a) * rr,
        y + Math.sin(a) * rr,
        Math.cos(a) * v,
        Math.sin(a) * v,
        style,
        dmg
      )
    }
  }

  /** 巨型弹：超大判定弹丸，可被自机弹击落（耐久 hp） */
  private bigOrb(
    spawn: BulletSpawnFn,
    x: number,
    y: number,
    a: number,
    speed: number,
    dmg: number,
    hp: number
  ) {
    const v = speed * field.sy
    spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, 'orb-huge', dmg, 0, -1, {
      radiusMul: 3,
      destructible: true,
      hp
    })
  }

  /** 方块弹墙：金色可摧毁方块组成的弧段墙 */
  private squareWall(
    spawn: BulletSpawnFn,
    x: number,
    y: number,
    n: number,
    arcLen: number,
    startA: number,
    speed: number,
    dmg: number
  ) {
    const v = speed * field.sy
    for (let i = 0; i < n; i++) {
      const a = startA + (arcLen * i) / n
      spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, 'orb-square', dmg, 0, -1, {
        radiusMul: 1.5,
        destructible: true,
        hp: 1
      })
    }
  }

  /** 胶囊弹：紫色长条胶囊（不可摧毁，压迫走廊） */
  private capsuleBurst(
    spawn: BulletSpawnFn,
    x: number,
    y: number,
    a: number,
    speed: number,
    dmg: number
  ) {
    const v = speed * field.sy
    spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, 'capsule-purple', dmg)
  }

  // ==================== 音效编排 ====================

  /** 重型齐射音（10 帧节流）：巨型弹 / 方块墙 / 玫瑰阵 / 球面弹幕共用 */
  private playHeavyShotSfx() {
    if (this.heavySfxCd > 0) return
    this.heavySfxCd = 10
    playSfx(bossHeavyShotSfx)
  }

  /**
   * 激光音效编排：预警出现即播蓄力音（8 帧节流，三束同帧只响一次），
   * 并把持续循环音挂上调度——telegraph 结束起播，照射 + 残影结束停播
   */
  private queueLaserSfx(cfg: EnemyLaserAttackConfig, mega: boolean) {
    if (this.chargeSfxCd <= 0) {
      this.chargeSfxCd = 8
      playSfx(bossLaserChargeSfx)
    }
    this.beamSfx.push({ delay: cfg.telegraph, left: cfg.duration + cfg.fade, mega, stop: null })
  }

  /** 音效调度推进：节流计数衰减；到点的激光循环音起播 / 停播（随时间缩放同步减速） */
  private updateSfx(dt: number) {
    if (this.chargeSfxCd > 0) this.chargeSfxCd -= dt
    if (this.heavySfxCd > 0) this.heavySfxCd -= dt
    for (let i = this.beamSfx.length - 1; i >= 0; i--) {
      const b = this.beamSfx[i]!
      if (b.delay > 0) {
        b.delay -= dt
        if (b.delay <= 0) b.stop = startSfxLoop(b.mega ? bossMegaBeamSfx : bossLaserBeamSfx)
      } else {
        b.left -= dt
        if (b.left <= 0) {
          b.stop?.()
          this.beamSfx.splice(i, 1)
        }
      }
    }
  }

  /** 停掉全部激光循环音（转阶段 / 死亡 / EMP 干扰 / 退场清理时游戏层会清空激光实体） */
  stopAllBeamSfx() {
    for (const b of this.beamSfx) b.stop?.()
    this.beamSfx = []
  }

  // ==================== 阶段一「绯红要塞·全域封锁」 ====================

  private updatePhase1(
    aim: Vec2,
    spawn: BulletSpawnFn,
    spawnLaser: EnemyLaserSpawnFn | undefined,
    dt: number
  ) {
    const c = this.core()
    const gunL = this.part('gun-l')
    const gunR = this.part('gun-r')
    const podL = this.part('pod-l')
    const podR = this.part('pod-r')

    // 左翼副炮：火神机炮——越残射速越快，残血升级双联火神
    if (gunL?.alive) {
      const r = this.rage(gunL, 1.8)
      if ((this.cdGunL -= dt) <= 0) {
        this.cdGunL = Math.max(1, Math.round(3 / r))
        const ax = this.x + gunL.x
        const ay = this.y + gunL.y
        const a = Math.atan2(aim.y - ay, aim.x - ax)
        this.barrelAims[gunL.id] = a
        const n = r >= 1.7 ? 2 : 1
        this.vulcan(spawn, 'needle-red', ax, ay, a, n, n > 1 ? 6 : 0, 8.0 + 0.8 * (r - 1), 40)
      }
    }
    // 右翼副炮：三连点射风暴，越残节奏越紧凑（五连爆发更频繁）
    if (gunR?.alive) {
      const r = this.rage(gunR, 1.6)
      if ((this.cdGunR -= dt) <= 0) {
        this.cdGunR = Math.max(10, Math.round(18 / r))
        this.shotR++
        const ax = this.x + gunR.x
        const ay = this.y + gunR.y
        const a = Math.atan2(aim.y - ay, aim.x - ax)
        this.barrelAims[gunR.id] = a
        if (this.shotR % (r >= 1.5 ? 3 : 5) === 0) {
          this.fan(spawn, 'needle-gold', ax, ay, 5, 36, a, 7.2 + 0.6 * (r - 1), 45)
        } else {
          this.fan(spawn, 'needle-gold', ax, ay, 3, 16, a, 7.6 + 0.5 * (r - 1), 40)
        }
      }
    }
    // 左腹副炮：导弹蜂群——越残冷却越快，残血追加中路第三发
    if (podL?.alive) {
      const r = this.rage(podL, 1.5)
      if ((this.cdPodL -= dt) <= 0) {
        this.cdPodL = Math.max(30, Math.round(45 / r))
        const ax = this.x + podL.x
        const ay = this.y + podL.y
        const a = Math.atan2(aim.y - ay, aim.x - ax)
        this.barrelAims[podL.id] = a
        const sp = 3.4 + 0.4 * (r - 1)
        this.missile(spawn, ax, ay, a - 0.7, sp, 320, 50)
        this.missile(spawn, ax, ay, a + 0.7, sp, 320, 50)
        if (r >= 1.4) this.missile(spawn, ax, ay, a, sp, 320, 50)
        playSfx(bossMissileSfx)
      }
    }
    // 右腹副炮：高密度旋转环——越残环越密、弹速越快
    if (podR?.alive) {
      const r = this.rage(podR, 1.6)
      if ((this.cdPodR -= dt) <= 0) {
        this.cdPodR = Math.max(20, Math.round(35 / r))
        this.rotPodR += 7
        this.ring(
          spawn,
          'orb-orange',
          this.x + podR.x,
          this.y + podR.y,
          Math.round(24 * r),
          2.6 + 0.6 * (r - 1),
          this.rotPodR,
          40
        )
      }
    }
    // 核心激光：轮换「三束平行横扫光幕」与「半屏巨型光束」
    if ((this.cdCoreLaser -= dt) <= 0) {
      this.cdCoreLaser = this.laserAlt === 0 ? 380 : 240
      this.laserAlt ^= 1
      const a = Math.atan2(aim.y - c.y, aim.x - c.x)
      if (this.laserAlt === 1) {
        // 三束平行横扫光幕（间隔随 sy 缩放）
        this.sweepDir = this.sweepDir === 1 ? -1 : 1
        const cfg = { ...this.laserTriple, sweep: this.sweepDir * 0.45 }
        for (let i = -1; i <= 1; i++) {
          const o = i * this.laserTriple.spacing
          const ox = Math.cos(a + Math.PI / 2) * o
          const oy = Math.sin(a + Math.PI / 2) * o
          spawnLaser?.(c.x + ox, c.y + oy, a, cfg, '#ff3b4e')
        }
        this.queueLaserSfx(cfg, false)
      } else {
        // 半屏巨型光束：瞄准即审判
        spawnLaser?.(c.x, c.y, a, this.laserMega, '#ff3b4e')
        this.queueLaserSfx(this.laserMega, true)
      }
    }
    // 核心巨型弹压场
    if ((this.cdMegaOrb -= dt) <= 0) {
      this.cdMegaOrb = 110
      const a = Math.atan2(aim.y - c.y, aim.x - c.x)
      this.bigOrb(spawn, c.x, c.y, a - 0.5, 1.6, 50, 4)
      this.bigOrb(spawn, c.x, c.y, a + 0.5, 1.6, 50, 4)
      this.playHeavyShotSfx()
    }
  }

  // ==================== 阶段二「蔷薇方程式」（左/中/右三部位） ====================

  private updatePhase2(
    aim: Vec2,
    spawn: BulletSpawnFn,
    spawnLaser: EnemyLaserSpawnFn | undefined,
    dt: number
  ) {
    const left = this.part('sec-l')
    const center = this.part('sec-c')
    const right = this.part('sec-r')
    const at = (p: BossPart) => ({ x: this.x + p.x, y: this.y + p.y })

    // 左舷炮阵：玫瑰花阵 + 星形线弹幕——越残花阵转得越快、星形线越密
    if (left?.alive) {
      const p = at(left)
      const r = this.rage(left, 1.5)
      if ((this.cdRose -= dt) <= 0) {
        this.cdRose = Math.max(45, Math.round(75 / r))
        this.roseVolley(spawn, p.x, p.y)
        this.roseBase += 3.2 * r
        this.roseParity ^= 1
        this.barrelAims[left.id] = Math.atan2(aim.y - p.y, aim.x - p.x)
        this.playHeavyShotSfx()
      }
      if ((this.cdAstroid -= dt) <= 0) {
        this.cdAstroid = Math.max(90, Math.round(150 / r))
        this.astroid(spawn, 'needle-gold', p.x, p.y, Math.round(48 * r), 3.6 + 0.4 * (r - 1), 45)
      }
    }
    // 中枢激光塔：火神双针流 + 三束横扫光幕 + 半屏旋转巨幕——越残针越多、激光越频
    if (center?.alive) {
      const p = at(center)
      const r = this.rage(center, 1.6)
      if ((this.cdNeedle -= dt) <= 0) {
        this.cdNeedle = Math.max(2, Math.round(5 / r))
        const a = Math.atan2(aim.y - p.y, aim.x - p.x)
        this.vulcan(
          spawn,
          'needle-cyan',
          p.x,
          p.y,
          a,
          Math.min(5, Math.ceil(3 * r)),
          Math.min(16, Math.round(10 * r)),
          7.2 + 0.4 * (r - 1),
          45
        )
        this.barrelAims[center.id] = a
      }
      if ((this.cdSweep -= dt) <= 0) {
        this.cdSweep = Math.max(220, Math.round(380 / r))
        this.sweepDir = this.sweepDir === 1 ? -1 : 1
        const a = Math.atan2(aim.y - p.y, aim.x - p.x)
        const cfg = { ...this.laserTriple, sweep: this.sweepDir * (0.55 + 0.12 * (r - 1)) }
        for (let i = -1; i <= 1; i++) {
          const o = i * this.laserTriple.spacing
          const ox = Math.cos(a + Math.PI / 2) * o
          const oy = Math.sin(a + Math.PI / 2) * o
          spawnLaser?.(p.x + ox, p.y + oy, a, cfg, '#ff3b4e')
        }
        this.queueLaserSfx(cfg, false)
      }
      if ((this.cdMegaSweep -= dt) <= 0) {
        this.cdMegaSweep = Math.max(300, Math.round(520 / r))
        this.sweepDir = this.sweepDir === 1 ? -1 : 1
        const a = Math.atan2(aim.y - p.y, aim.x - p.x)
        const cfg = { ...this.laserMegaSweep, sweep: this.sweepDir * (0.25 + 0.1 * (r - 1)) }
        spawnLaser?.(p.x, p.y, a, cfg, '#ff3b4e')
        this.queueLaserSfx(cfg, true)
      }
    }
    // 右舷炮阵：导弹蜂群 + 可摧毁方块墙 + 巨型弹压——越残导弹越密、墙越宽、巨弹越频
    if (right?.alive) {
      const p = at(right)
      const r = this.rage(right, 1.5)
      if ((this.cdMissile2 -= dt) <= 0) {
        this.cdMissile2 = Math.max(45, Math.round(70 / r))
        const a = Math.atan2(aim.y - p.y, aim.x - p.x)
        this.barrelAims[right.id] = a
        const sp = 3.6 + 0.4 * (r - 1)
        // 加大散布 ±0.9，且三发锁定窗口错开（45/60/30 帧），
        // 各自在不同时刻停止追踪、直线飞出，避免三发聚到同一点
        for (let i = -1; i <= 1; i++)
          this.missile(spawn, p.x, p.y, a + i * 0.9, sp, 400, 50, i === 0 ? 60 : i < 0 ? 45 : 30)
        if (r >= 1.4) {
          this.missile(spawn, p.x, p.y, a - 1.5, sp, 400, 50, 25)
          this.missile(spawn, p.x, p.y, a + 1.5, sp, 400, 50, 25)
        }
        playSfx(bossMissileSfx)
      }
      if ((this.cdSquares -= dt) <= 0) {
        this.cdSquares = Math.max(75, Math.round(130 / r))
        const a = Math.atan2(aim.y - p.y, aim.x - p.x)
        this.squareWall(spawn, p.x, p.y, Math.round(14 * r), 110 * DEG, a - 55 * DEG, 2.6 + 0.4 * (r - 1), 45)
        this.playHeavyShotSfx()
      }
      if ((this.cdBigOrb2 -= dt) <= 0) {
        this.cdBigOrb2 = Math.max(110, Math.round(190 / r))
        const a = Math.atan2(aim.y - p.y, aim.x - p.x)
        const sp2 = 1.8 + 0.3 * (r - 1)
        this.bigOrb(spawn, p.x, p.y, a - 0.35, sp2, 50, 4)
        this.bigOrb(spawn, p.x, p.y, a, sp2, 50, 4)
        this.bigOrb(spawn, p.x, p.y, a + 0.35, sp2, 50, 4)
        this.playHeavyShotSfx()
      }
    }
  }

  /** 玫瑰花阵（玫瑰函数 r = cos²(kθ/2) 的离散化）：花瓣间留出真空走廊 */
  private roseVolley(spawn: BulletSpawnFn, x: number, y: number) {
    const k = 5
    const perPetal = 12
    const half = 23 * DEG // 单片花瓣发射张角一半；花瓣间约 26° 走廊
    const style: BulletStyleKey = this.roseParity === 0 ? 'orb-red' : 'needle-gold'
    for (let p = 0; p < k; p++) {
      const center = (p / k) * TAU + this.roseBase * DEG
      for (let j = 0; j < perPetal; j++) {
        const off = (j - (perPetal - 1) / 2) / (perPetal - 1)
        const a = center + off * half * 2
        const v = (3.3 + Math.abs(off) * 1.0) * field.sy // 花瓣边缘更快，瓣形波前
        spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, style, 50)
      }
    }
  }

  // ==================== 阶段三「超球面·坍缩终局」 ====================

  private updatePhase3(
    aim: Vec2,
    spawn: BulletSpawnFn,
    spawnLaser: EnemyLaserSpawnFn | undefined,
    dt: number
  ) {
    const c = this.core()

    // 伪 3D 旋转球面：多环投影弹幕，缺口活路缓慢游移
    if ((this.cdSphere -= dt) <= 0) {
      this.cdSphere = 130
      this.sphereVolley(spawn, c.x, c.y)
      this.sphereRot += 13
      this.playHeavyShotSfx()
    }
    // 螺旋弹墙：双弧段反向排布，真空走廊随旋转螺旋展开
    if ((this.cdWall -= dt) <= 0) {
      this.cdWall = 14
      this.wallBase += 2.7
      this.arc(spawn, 'orb-red', c.x, c.y, 12, 100 * DEG, this.wallBase * DEG, 2.4, 50)
      this.arc(spawn, 'orb-orange', c.x, c.y, 12, 100 * DEG, this.wallBase * DEG + Math.PI, 2.4, 50)
    }
    // 风车激光：三道光束绕核心位旋转，方向每轮交替
    if ((this.cdWind -= dt) <= 0) {
      this.cdWind = 500
      this.windDir = this.windDir === 1 ? -1 : 1
      const a = Math.atan2(aim.y - c.y, aim.x - c.x)
      const cfg = { ...this.laserWind, sweep: this.windDir * 0.42 }
      for (let i = 0; i < 3; i++) {
        spawnLaser?.(c.x, c.y, a + (i * TAU) / 3, cfg, '#ff3b4e')
      }
      this.queueLaserSfx(cfg, false)
    }
    // 五连导弹蜂群：大散布发射，锁定窗口按偏移量错开，避免聚点
    if ((this.cdMissile3 -= dt) <= 0) {
      this.cdMissile3 = 150
      const a = Math.atan2(aim.y - c.y, aim.x - c.x)
      for (let i = -2; i <= 2; i++)
        this.missile(spawn, c.x, c.y, a + i * 0.5, 3.5, 460, 50, 60 - Math.abs(i) * 12)
      playSfx(bossMissileSfx)
    }
  }

  /**
   * 伪 3D 旋转球面弹幕：
   * 五个纬度环（θ=25°~155°）各 14 颗弹丸，屏幕方向 = 球面点投影
   * (cosφ·sinθ, cosθ)。环随时间扩张成同心圆、按 cosθ 漂移，叠加
   * 逐轮自转，形成旋转球体壳的立体错觉。
   * 逃生路线：朝下的缺口楔（约 44° 宽）缓慢游移——跟着缺口走，
   * 就是设计好的活路。
   */
  private sphereVolley(spawn: BulletSpawnFn, x: number, y: number) {
    const rings = [25, 55, 90, 125, 155]
    const perRing = 14
    const speed = 2.6 * field.sy
    const styles: BulletStyleKey[] = ['orb-red', 'orb-orange', 'orb-red', 'orb-orange', 'orb-red']
    const gapC = (90 + 40 * Math.sin(this.age * 0.002)) * DEG
    const gapHalf = 22 * DEG
    const rot = this.sphereRot * DEG
    for (let ri = 0; ri < rings.length; ri++) {
      const th = rings[ri]! * DEG
      const sinT = Math.sin(th)
      const cosT = Math.cos(th)
      for (let j = 0; j < perRing; j++) {
        const phi = (j / perRing) * TAU + rot + ri * 0.4
        const dx = Math.cos(phi) * sinT
        const dy = cosT
        // 缺口：屏幕方向角落入缺口楔内则跳过（环间缺口对齐，形成旋转活路）
        const dirA = Math.atan2(dy, dx)
        let rel = dirA - gapC
        if (rel > Math.PI) rel -= TAU
        else if (rel < -Math.PI) rel += TAU
        if (Math.abs(rel) < gapHalf) continue
        spawn(x, y, dx * speed, dy * speed, styles[ri]!, 50)
      }
    }
  }

  // ==================== 编队召唤 ====================

  /** 设计空间坐标换算：让召唤配置经 field.mapX/mapY 后落在指定的世界坐标 */
  private designPos(sx: number, sy: number): { x: number; y: number } {
    return {
      x: 240 + (sx - field.cx) / field.sy,
      y: sy / field.sy
    }
  }

  /**
   * 母舰从机库舱门弹射编队：混合战术集群——
   * 环绕扫射护卫机 + 鸟群编队（flock 三力协同）护卫机 +
   * 自爆突袭机 + 激光无人机（阶段二起），全部可击毁。
   * 返回本波全部生成配置，由外层逐个写入敌人列表。
   */
  private summonSquadron(): EnemySpawnConfig[] {
    this.summonSide = this.summonSide === 1 ? -1 : 1
    const side = this.summonSide
    const list: EnemySpawnConfig[] = []
    /** 机库舱门世界坐标（设计偏移 × S，相对 Boss 中心） */
    const bay = (dx: number, dy: number) => this.designPos(this.x + dx * this.S, this.y + dy * this.S)
    const bayAt = (dx: number, dy: number, i: number) => {
      const p = bay(dx + (i % 5) * 12, dy + ((i * 7) % 5) * 4)
      return { x: p.x, y: p.y }
    }

    // 环绕扫射护卫机：追踪自机保持距离扫射（每波固定 10 架）
    const orbitN = 10
    for (let i = 0; i < orbitN; i++) {
      const p = bayAt(side * 100, 40, i)
      list.push({
        enemyKey: 'FIN-ESC',
        path: 'sine',
        x: p.x,
        y: p.y,
        count: 1,
        gap: 0,
        orbit: { radius: 150 + (i % 2) * 40, engageAfter: 80 + i * 30, speedMul: 1.7 }
      })
    }

    // 鸟群编队：flock 三力协同的集群（阶段一专属，固定 10 架）
    const flockN = this.phase === 1 ? 10 : 0
    for (let i = 0; i < flockN; i++) {
      const p = bayAt(-side * 100, 44, i)
      list.push({
        enemyKey: 'FIN-ESC',
        path: 'sine',
        x: p.x,
        y: p.y,
        count: 1,
        gap: 0,
        orbit: { radius: 120 + i * 30, engageAfter: 120 + i * 25, speedMul: 1.9 },
        behaviors: [{ type: 'flock', groupId: 'fin-flock' }]
      })
    }

    // 激光无人机：无限射程封锁位（阶段二专属，固定 10 架）
    // 左右机库各弹射 5 架均匀散布；不追踪自机——按站位序号散开到战场
    // 下缘边界（左/底/右均布），缓慢游移 + 跟随自机高度微调，
    // 整队始终分散，用光束从远处封锁自机移动路线
    if (this.phase >= 2) {
      const laserN = 10
      for (let i = 0; i < laserN; i++) {
        const p = bayAt((i < laserN / 2 ? -1 : 1) * 140, 16, i)
        list.push({
          enemyKey: 'FIN-LSR',
          path: 'sine',
          x: p.x,
          y: p.y,
          count: 1,
          gap: 0,
          orbit: {
            radius: 260,
            engageAfter: 30 + i * 10,
            speedMul: 1.2,
            blockade: true,
            phaseOffset: (i / laserN) * TAU
          }
        })
      }
    }
    return list
  }
}
