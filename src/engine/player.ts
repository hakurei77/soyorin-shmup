/**
 * 自机
 * 职责：8 方向移动、朝鼠标方向旋转与射击、判定点、受击无敌、血量/护盾（HP 制，无残机无 BOMB）
 * 通过 PlayerControl 快照接收输入，不直接依赖输入设备实现
 */
import { BALANCE } from '../config/balance'
import type { ImplantEffect, ResolvedCharacterStats, WeaponKey } from '../types'
import { PLAYER_WEAPONS } from '../weapons/playerWeapons'
import type { PlayerWeaponConfig } from '../weapons/playerWeapons'
import { playSfx, preloadSfx, startSfxLoop } from '../utils/sfx'
import type { BulletPool } from './bullet'
import { field } from './field'

/** 每帧由游戏层组装的操作快照 */
export interface PlayerControl {
  /** 移动方向轴（-1~1，已归一化） */
  dx: number
  dy: number
  /** 低速模式 */
  slow: boolean
  /** 是否冲刺（持续加速 + 尾翼） */
  sprint: boolean
  /** 是否射击 */
  shooting: boolean
  /** 右键瞄准（仅弹匣式武器生效） */
  aim: boolean
  /** 本帧是否请求闪现（边沿触发） */
  dash: boolean
  /** 瞄准点（鼠标在逻辑坐标系中的位置），自机始终朝向它 */
  aimX: number
  aimY: number
  /** 时间缩放标记（期间 < 1，仅用于残影采样等表现判断；自机移速、武器射速与弹速均不受影响） */
  timeScale: number
}

const P = BALANCE.player

export class Player {
  // 显式标注 number：BALANCE 为 as const，初始值是字面量类型，
  // 不标注会导致 reset()/运行期重新赋值时报类型错误
  x: number = P.spawnX
  y: number = P.spawnY
  /** 上一步位置与朝向（渲染插值用，由 update 每步快照） */
  px: number = P.spawnX
  py: number = P.spawnY
  pAngle = -Math.PI / 2
  /** 血量上限 / 当前血量（归零即死亡，无复活） */
  maxHp: number = P.maxHp
  hp: number = P.maxHp
  /** 护盾上限 / 当前护盾（承伤时优先于血量扣除，溢出伤害不扣血） */
  maxShield: number = P.maxShield
  shield: number = P.maxShield
  /** 护盾回复速度（点/帧），未熔断时持续回复 */
  shieldRegen: number = P.shieldRegenPerSec / 60
  /** 护盾熔断总帧数（护盾被打空后的锁定时间） */
  shieldBreakFrames: number = P.shieldBreakFrames
  /** 护盾熔断剩余帧（>0 时护盾锁定为 0，归零瞬间护盾恢复到 1） */
  shieldBreakTimer = 0
  /** 护盾回复延迟剩余帧（>0 时暂停回复；护盾每次承伤时重置） */
  shieldRegenDelayTimer = 0
  /** 高速移动速度（角色可覆盖） */
  fastSpeed: number = P.fastSpeed
  /** 低速模式移动速度（角色可覆盖） */
  slowSpeed: number = P.slowSpeed
  /** 冲刺速度倍率（角色可覆盖） */
  sprintSpeedMul: number = P.sprintSpeedMul
  /** 受击无敌时间（帧，角色可覆盖） */
  hitInvincible: number = P.hitInvincible
  /** 移速倍率（义体修正，乘法作用于最终移动速度） */
  moveSpeedMul = 1
  /** 受到伤害倍率（义体修正，<1 为减伤） */
  damageTakenMul = 1
  /** 闪避率：受击时按概率完全不受伤害（0~0.9，默认 0） */
  dodgeChance = 0
  /** 造成伤害倍率（义体修正，乘法作用于全部武器伤害） */
  attackMul = 1
  /** 实际伤害倍率：免死守护无敌窗口（如「怒雷协议」）期间附加窗口伤害加成 */
  get effectiveAttackMul() {
    return this.attackMul * (this.deathGuardActiveTimer > 0 ? 1 + this.deathGuardAttackAdd : 1)
  }
  /** 免死守护冷却总帧数（义体修正，0 = 未装备该效果） */
  deathGuardCooldownFrames = 0
  /** 免死守护触发后的无敌帧数 */
  deathGuardInvincibleFrames = 0
  /** 免死守护剩余冷却帧（>0 时无法再次触发） */
  deathGuardTimer = 0
  /** 免死守护触发后的剩余无敌帧（HUD「发动中」高亮用） */
  deathGuardActiveTimer = 0
  /** 免死守护无敌窗口内的伤害加成（义体修正，0 = 无） */
  deathGuardAttackAdd = 0
  /** 剩余无敌帧（>0 时免疫伤害并闪烁） */
  invincible = 0
  alive = true
  /** 当前是否处于低速模式（渲染层据此显示判定点） */
  slow = false
  /** 当前是否处于冲刺状态（游戏层据此生成尾翼粒子） */
  sprinting = false
  /** 右键瞄准中（仅弹匣式武器） */
  aiming = false
  /** 上一帧是否在移动（用于检测"停下来"的时刻） */
  private wasMoving = false
  /** 停下来后的第一发子弹是否已射出（重置：开始移动、刚停下来、闲置超时） */
  private stoppedFirstShot = false
  /** 闲置帧数累计（不移动不开火时累加，复位后置0，超阈值重获精准） */
  private idleFrames = 0
  /** 闲置超时阈值（帧），超过后重置精准第一发 */
  private readonly idleResetFrames = 60
  /** 持续射击散射累积量（每发 +0.15°，停火快速衰减，上限 2.5°） */
  private sustainedFireSpread = 0
  /** 弹匣剩余弹药（非弹匣式武器不启用） */
  private ammo = 0
  /** 装填剩余帧数（0 = 未在装填） */
  private reloadTimer = 0
  /** 装填音效延迟播放的剩余帧数（<=0 时播放） */
  private reloadSfxDelay = 0
  /** 上一帧扳机状态（干火音效边沿触发用） */
  private prevShooting = false
  /** 激光循环音效的停止函数（null = 未在播放） */
  private laserLoopStop: (() => void) | null = null
  /** 蓄力循环音效的停止函数（null = 未在播放） */
  private chargeLoopStop: (() => void) | null = null
  /** 当前动作 id（对应皮肤 .json 中 animations 的 key，渲染层据此播放对应片段） */
  anim = 'move'
  /** 是否水平镜像绘制（左移时为 true，渲染层翻转皮肤，无需单独 left 动作） */
  flip = false
  /** 冲刺尾迹路径点（最近若干帧位置，渲染层绘制连续激光光带） */
  sprintTrail: { x: number; y: number }[] = []
  /** 尾迹最大长度（帧），超过后丢弃最旧的点 */
  private sprintTrailMax = 16
  /** 残影路径点（技能激活时记录位置 + 朝向，渲染层绘制洋葱皮残影） */
  rainbowTrail: { x: number; y: number; angle: number }[] = []
  /** 残影最大层数 */
  private rainbowTrailMax = 14
  /** 残影采样起始间隔（帧），技能刚激活时最稀疏 */
  private rainbowTrailIntervalStart = 5
  /** 残影采样最小间隔（帧），采样逐渐加密，收敛到此值 */
  private rainbowTrailIntervalMin = 3
  /** 间隔每缩短 1 帧所需的持续移动帧数（越大慢到快的过渡越长） */
  private rainbowTrailRampStep = 16
  private rainbowTrailTick = 0
  /** 残影加速计时（持续移动的帧数，用于推进采样间隔由慢到快） */
  private rainbowTrailRamp = 0
  /** 受击故障残影：技能激活期间被击中时在周围闪出的彩虹分身（渲染层绘制，ttl 逐帧消散；seed 决定色相与抖动相位） */
  glitchGhosts: { x: number; y: number; angle: number; ttl: number; maxTtl: number; seed: number }[] = []
  /** 朝向角（弧度，0 = 正右方），初始朝上，由鼠标位置决定 */
  angle = -Math.PI / 2
  /** 闪现体力上限（义体可扩充） */
  dashMaxCharges: number = P.dashMaxCharges
  /** 闪现体力格数 */
  dashCharges: number = P.dashMaxCharges
  /** 折跃无敌时长（帧，义体可延长） */
  dashInvincibleFrames: number = P.dashInvincible
  /** 折跃距离（逻辑像素，义体可加成） */
  dashDistance: number = P.dashDistance
  /** 本帧是否发生了闪现（游戏层读取后生成特效并清零） */
  dashFlash = false
  /**
   * 本帧发射的激光射线（激光武器不生成弹丸，改为瞬时射线事件；
   * 由 game.step() 消费后清空，命中逻辑见 game.fireLaser）。
   * 按住开火时每帧都会发射（光束连续不间断），
   * tick 为 true 的帧才结算伤害（节拍 = 武器 fireInterval）
   */
  laserShot: { x: number; y: number; angle: number; tick: boolean } | null = null
  /**
   * 本帧放出的蓄力电弧（蓄力武器不生成弹丸，松手瞬间发出瞬时贯穿电弧事件；
   * 由 game.step() 消费后清空，命中逻辑见 game.fireArc）。
   * power 为蓄力比例 0~1，决定伤害与电弧粗细/密度
   */
  arcShot: { x: number; y: number; angle: number; power: number } | null = null
  /** 闪现起点坐标（特效用） */
  dashFromX = 0
  dashFromY = 0
  /** 体力回复计时（帧） */
  private dashTimer = 0
  /** 当前格体力回复进度 0~1（HUD 连续充能条用；满格时为 0） */
  get dashProgress(): number {
    return this.dashCharges >= this.dashMaxCharges
      ? 0
      : Math.min(1, this.dashTimer / P.dashRecover)
  }
  private fireCd = 0
  /** 点射连发剩余弹数（<=0 时下一次开火重新装满一轮连发） */
  private burstLeft = 0
  /** 蓄力武器充能进度（帧，按住累积封顶 chargeFrames；松开扳机时若已充满则发射电弧） */
  private chargeProgress = 0
  /** 当前武器编号（武器定义见 weapons/playerWeapons.ts） */
  weapon: WeaponKey = 'WPN-01'
  /** 武器槽（0/1 对应武器栏一/二号位，null = 空槽） */
  private weapons: (WeaponKey | null)[] = [null, null]
  /** 当前使用的武器槽（供 HUD 联动准星样式） */
  weaponSlot = 0
  /** 出击时的初始武器槽（reset 时恢复） */
  private startSlot = 0
  /** 各武器槽各自的剩余弹药（切换武器时保留进度；按槽位区分，双持同名武器互不影响） */
  private ammoBySlot = new Map<number, number>()
  /** 当前武器热量（仅定义了 heatPerShot 的过热武器启用，0~heatMax） */
  private heat = 0
  /** 过热锁机剩余帧数（>0 时无法开火，归零后热量清空） */
  private overheatTimer = 0
  /** 各武器槽各自的热量（切换武器时保留进度；按槽位区分，双持同名武器互不影响） */
  private heatBySlot = new Map<number, number>()
  /** 机身主色（角色颜色占位，渲染层使用） */
  color = '#7dd3fc'
  /** 机身描边 / 高光色 */
  accent = '#e0f2fe'
  /** 角色皮肤素材 id（SpriteManager 动态加载），null = 回退全局 player 素材 / 占位绘制 */
  spriteId: string | null = null

  /** 蓄力进度 0~1（非蓄力武器或未蓄力时为 0；渲染层据此绘制炮口蓄力圈） */
  get chargeRatio(): number {
    const cf = PLAYER_WEAPONS[this.weapon].chargeFrames
    return cf ? Math.min(1, this.chargeProgress / cf) : 0
  }

  /**
   * 设置出击配置（角色颜色 + 属性 + 武器 + 皮肤），开局前由游戏层调用
   * @param stats 已补齐默认值的完整角色属性（见 config/loadout.ts 的 resolveCharacterStats）
   */
  setLoadout(
    color: string,
    accent: string,
    weapons: (WeaponKey | null)[],
    stats: ResolvedCharacterStats,
    spriteId: string | null = null,
    implants: ImplantEffect = {}
  ) {
    this.color = color
    this.accent = accent
    this.weapons = [weapons[0] ?? null, weapons[1] ?? null]
    // 默认使用一号位，空则用二号位
    this.weaponSlot = this.weapons[0] ? 0 : 1
    this.startSlot = this.weaponSlot
    this.weapon = this.weapons[this.weaponSlot]!
    // 义体修正：生命/护盾上限加算，移速/承伤乘算，闪现体力扩充
    this.maxHp = stats.hp + (implants.hpAdd ?? 0) + Math.round(stats.hp * (implants.hpPctAdd ?? 0))
    this.hp = this.maxHp
    // 护盾百分比作用于「基础 + 固定盾值」总和，避免基础护盾为 0 时百分比词条失效
    this.maxShield = Math.round((stats.shield + (implants.shieldAdd ?? 0)) * (1 + (implants.shieldPctAdd ?? 0)))
    this.shield = this.maxShield
    this.shieldRegen = Math.max(0, P.shieldRegenPerSec + (implants.shieldRegenAdd ?? 0)) / 60
    // 护盾熔断时长倍率（义体，乘算），钳制在 [0.1, 2] 防止叠出 0 或负值
    this.shieldBreakFrames = Math.round(P.shieldBreakFrames * Math.min(2, Math.max(0.1, implants.shieldBreakMul ?? 1)))
    this.fastSpeed = stats.fastSpeed
    this.slowSpeed = stats.slowSpeed
    this.sprintSpeedMul = stats.sprintSpeedMul
    this.hitInvincible = stats.hitInvincible
    this.moveSpeedMul = Math.max(0.1, 1 + (implants.moveSpeedAdd ?? 0))
    // 承伤倍率钳制在 [0.3, 2]：防止多件义体乘算叠出 0 或负值
    this.damageTakenMul = Math.min(2, Math.max(0.3, implants.damageTakenMul ?? 1))
    this.dodgeChance = Math.min(0.9, Math.max(0, implants.dodgeChance ?? 0))
    this.attackMul = Math.max(0.1, 1 + (implants.attackAdd ?? 0))
    // 义体修正：免死守护（秒 → 帧，60Hz 逻辑帧）
    this.deathGuardCooldownFrames = Math.round((implants.deathGuard?.cooldownSec ?? 0) * 60)
    this.deathGuardInvincibleFrames = Math.round((implants.deathGuard?.invincibleSec ?? 0) * 60)
    this.deathGuardAttackAdd = implants.deathGuard?.attackAdd ?? 0
    this.deathGuardTimer = 0
    this.deathGuardActiveTimer = 0
    this.dashMaxCharges = P.dashMaxCharges + (implants.dashChargesAdd ?? 0)
    this.dashCharges = this.dashMaxCharges
    // 折跃无敌延长（义体，秒转帧，至少保留基础时长）
    this.dashInvincibleFrames = P.dashInvincible + Math.max(0, Math.round((implants.dashInvincibleAdd ?? 0) * 60))
    // 折跃距离加成（义体，百分比加算）
    this.dashDistance = Math.round(P.dashDistance * (1 + (implants.dashDistanceAdd ?? 0)))
    this.spriteId = spriteId
    // 弹匣状态：出击时所有武器装满
    this.ammoBySlot.clear()
    this.ammo = PLAYER_WEAPONS[this.weapon].magazine ?? 0
    this.reloadTimer = 0
    // 热量状态：出击时所有武器冷却
    this.heatBySlot.clear()
    this.heat = 0
    this.overheatTimer = 0
    this.aiming = false
    // 预载携带武器的开火/装填音效，避免开局首发无声
    for (const key of this.weapons) {
      const w = key ? PLAYER_WEAPONS[key] : undefined
      if (w?.fireSound) preloadSfx(w.fireSound)
      if (w?.reloadSound) preloadSfx(w.reloadSound)
      if (w?.emptySound) preloadSfx(w.emptySound)
      if (w?.chargeSound) preloadSfx(w.chargeSound)
      if (w?.overheatSound) preloadSfx(w.overheatSound)
    }
  }

  reset() {
    this.x = field.mapX(P.spawnX)
    this.y = field.mapY(P.spawnY)
    this.px = this.x
    this.py = this.y
    this.pAngle = this.angle
    this.hp = this.maxHp
    this.shield = this.maxShield
    this.shieldBreakTimer = 0
    this.shieldRegenDelayTimer = 0
    this.invincible = 0
    this.deathGuardTimer = 0
    this.deathGuardActiveTimer = 0
    this.alive = true
    this.slow = false
    this.sprinting = false
    this.anim = 'move'
    this.flip = false
    this.sprintTrail.length = 0
    this.rainbowTrail.length = 0
    this.dashCharges = this.dashMaxCharges
    this.dashTimer = 0
    this.dashFlash = false
    this.fireCd = 0
    this.burstLeft = 0
    this.chargeProgress = 0
    // 恢复初始武器槽；所有武器弹药重新装满
    this.ammoBySlot.clear()
    this.weaponSlot = this.startSlot
    this.weapon = this.weapons[this.weaponSlot] ?? this.weapon
    this.ammo = PLAYER_WEAPONS[this.weapon].magazine ?? 0
    this.reloadTimer = 0
    this.heatBySlot.clear()
    this.heat = 0
    this.overheatTimer = 0
    this.stopLaserLoop()
    this.stopChargeLoop()
    this.aiming = false
    this.wasMoving = false
    this.stoppedFirstShot = false
    this.idleFrames = 0
    this.sustainedFireSpread = 0
  }

  update(control: PlayerControl, pool: BulletPool) {
    if (this.invincible > 0) this.invincible--
    // 受击故障残影逐帧消散
    for (let i = this.glitchGhosts.length - 1; i >= 0; i--) {
      if (--this.glitchGhosts[i]!.ttl <= 0) this.glitchGhosts.splice(i, 1)
    }
    if (this.deathGuardTimer > 0) this.deathGuardTimer--
    if (this.deathGuardActiveTimer > 0) this.deathGuardActiveTimer--
    // 护盾：熔断期锁定为 0，熔断结束瞬间恢复到 1；未熔断时按速率持续回复，
    // 但承伤后短暂暂停回复（脱战喘息收益，防止持续交火中"不掉血"）
    if (this.maxShield > 0) {
      if (this.shieldRegenDelayTimer > 0) this.shieldRegenDelayTimer--
      if (this.shieldBreakTimer > 0) {
        if (--this.shieldBreakTimer === 0) this.shield = Math.min(1, this.maxShield)
      } else if (this.shield < this.maxShield && this.shieldRegenDelayTimer <= 0) {
        this.shield = Math.min(this.maxShield, this.shield + this.shieldRegen)
      }
    }
    // 渲染插值：快照上一步位置与朝向
    this.px = this.x
    this.py = this.y
    this.pAngle = this.angle

    // 死亡即终局（无残机无复活），由游戏层切换到 gameover 场景
    if (!this.alive) return

    // 移动状态追踪：用于散射规则（停下第一发 0 散射 / 瞄准不移动 0 散射）
    const isMoving = control.dx !== 0 || control.dy !== 0
    if (!isMoving && this.wasMoving) {
      // 刚停下来：第一发子弹散射应为 0
      this.stoppedFirstShot = false
    } else if (isMoving) {
      // 移动中：正常散射
      this.stoppedFirstShot = true
    }
    this.wasMoving = isMoving

    // 闲置超时重获精准：不移动且不开火时累加帧数，超阈值重置精准第一发
    if (isMoving) {
      this.idleFrames = 0
    } else if (this.stoppedFirstShot) {
      this.idleFrames++
      if (this.idleFrames >= this.idleResetFrames) {
        this.stoppedFirstShot = false
        this.idleFrames = 0
      }
    } else {
      this.idleFrames = 0
    }

    // 持续射击散射衰减：不射击时快速恢复，低于阈值直接清零
    if (!control.shooting && this.sustainedFireSpread > 0) {
      this.sustainedFireSpread *= 0.8
      if (this.sustainedFireSpread < 0.05) this.sustainedFireSpread = 0
    }

    this.slow = control.slow
    // 右键瞄准（仅定义了 aimSpreadDeg 的武器）：瞄准时打断冲刺，冲刺中也无法通过瞄准叠加
    this.aiming =
      control.aim && PLAYER_WEAPONS[this.weapon].aimSpreadDeg !== undefined
    this.sprinting = control.sprint && !this.aiming
    // 动作切换：右移（D）播 right；左移（A）播 right 并镜像（等价左倾，
    // 若皮肤没有 right 片段则渲染层回退 move，对称帧镜像后视觉不变属正常）；
    // 其余情况播 move
    if (control.dx > 0) {
      this.anim = 'right'
      this.flip = false
    } else if (control.dx < 0) {
      this.anim = 'right'
      this.flip = true
    } else {
      this.anim = 'move'
      this.flip = false
    }
    let speed = control.slow ? this.slowSpeed : this.fastSpeed
    // 瞄准时移速降低，但不低于低速模式速度
    if (this.aiming && !control.slow) {
      const mul = PLAYER_WEAPONS[this.weapon].aimSpeedMul ?? 0.6
      speed = Math.max(this.fastSpeed * mul, this.slowSpeed)
    }
    if (this.sprinting) speed *= this.sprintSpeedMul
    speed *= this.moveSpeedMul // 义体移速修正（乘法独立乘区）
    this.x += control.dx * speed
    this.y += control.dy * speed

    // 冲刺尾迹：冲刺且移动时记录路径点，非冲刺时逐帧缩短形成渐隐
    if (this.sprinting && (control.dx !== 0 || control.dy !== 0)) {
      this.sprintTrail.push({ x: this.x, y: this.y })
      if (this.sprintTrail.length > this.sprintTrailMax) this.sprintTrail.shift()
    } else if (this.sprintTrail.length > 0) {
      this.sprintTrail.shift()
    }

    // 残影：仅在技能激活且移动时采样，间隔随残影层数增加而缩短（先慢后快）；
    // 中途停下则清空残影重新起算节奏，技能结束后逐帧消散
    if (control.timeScale < 1) {
      if (control.dx === 0 && control.dy === 0) {
        // 中途停下：重置节奏计时（重新移动时从慢间隔起算），残影逐帧消散而非瞬间消失
        this.rainbowTrailTick = 0
        this.rainbowTrailRamp = 0
        if (this.rainbowTrail.length > 0) this.rainbowTrail.shift()
      } else {
        this.rainbowTrailRamp++
        const interval = Math.max(
          this.rainbowTrailIntervalMin,
          this.rainbowTrailIntervalStart -
            Math.floor(this.rainbowTrailRamp / this.rainbowTrailRampStep)
        )
        if (++this.rainbowTrailTick >= interval) {
          this.rainbowTrailTick = 0
          this.rainbowTrail.push({ x: this.x, y: this.y, angle: this.angle })
          if (this.rainbowTrail.length > this.rainbowTrailMax) this.rainbowTrail.shift()
        }
      }
    } else {
      this.rainbowTrailTick = 0
      if (this.rainbowTrail.length > 0) this.rainbowTrail.shift()
    }

    // 体力回复：未满时每 dashRecover 帧回复 1 格
    if (this.dashCharges < this.dashMaxCharges) {
      if (++this.dashTimer >= P.dashRecover) {
        this.dashTimer = 0
        this.dashCharges++
      }
    }

    // 闪现：移动中按下闪现键，朝当前移动方向瞬移一小段距离
    if (
      control.dash &&
      this.dashCharges > 0 &&
      (control.dx !== 0 || control.dy !== 0)
    ) {
      // 满格消耗时重新起算回复计时
      if (this.dashCharges === this.dashMaxCharges) this.dashTimer = 0
      this.dashCharges--
      this.dashFromX = this.x
      this.dashFromY = this.y
      this.dashFlash = true
      this.x += control.dx * this.dashDistance
      this.y += control.dy * this.dashDistance
      // 闪现为瞬移，不做位置插值；清空尾迹避免跨越瞬移距离的长线段
      this.px = this.x
      this.py = this.y
      this.sprintTrail.length = 0
      // 闪现附带短暂无敌，避免闪进弹幕直接中弹（不覆盖更长的既有无敌）
      this.invincible = Math.max(this.invincible, this.dashInvincibleFrames)
    }

    // 限制活动范围（战场 = 当前窗口尺寸）
    const m = P.moveMargin
    this.x = Math.max(m, Math.min(field.width - m, this.x))
    this.y = Math.max(m, Math.min(field.height - m, this.y))

    // 朝向：始终面向鼠标瞄准点（距离过近时保持当前朝向，避免抖动）
    const adx = control.aimX - this.x
    const ady = control.aimY - this.y
    if (adx * adx + ady * ady > 4) this.angle = Math.atan2(ady, adx)

    // 射击：武器由 PLAYER_WEAPONS 解释，朝瞄准方向发射弹丸
    // 期间自机武器保持原速（减速力场只作用于敌人一侧）
    const w = PLAYER_WEAPONS[this.weapon]
    if (this.fireCd > 0) this.fireCd--
    // 弹匣式武器：装填计时（装填完毕自动补满）；打空自动开始装填。
    // 换弹与音效延迟使用真实帧数，不受时间缩放技能影响
    if (this.reloadTimer > 0) {
      this.reloadTimer--
      // 装填音效可延迟播放（如栓动枪先响枪声、后响拉栓声）
      if (this.reloadSfxDelay > 0) {
        this.reloadSfxDelay--
        if (this.reloadSfxDelay <= 0 && w.reloadSound) playSfx(w.reloadSound)
      }
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0
        this.ammo = w.magazine ?? 0
      }
    } else if (w.magazine !== undefined && this.ammo <= 0) {
      this.beginReload(w)
    }
    // 过热武器：锁机计时（真实帧数，不受时间缩放影响），归零后热量清空；
    // 未锁机且停火时缓慢散热
    if (this.overheatTimer > 0) {
      this.overheatTimer--
      if (this.overheatTimer <= 0) {
        this.overheatTimer = 0
        this.heat = 0
      }
    } else if (w.heatPerShot !== undefined && !control.shooting && this.heat > 0) {
      this.heat = Math.max(0, this.heat - (w.heatDissipate ?? 1))
    }
    // 空弹匣干火：弹匣式武器在打空/装填中按下扳机（边沿触发，避免长按连响）
    const firePressed = control.shooting && !this.prevShooting
    const fireReleased = !control.shooting && this.prevShooting
    this.prevShooting = control.shooting
    // 蓄力武器：松手即发射——按充能比例放出一道无限射程的贯穿电弧
    // （比例决定伤害与电弧粗细/密度，命中结算见 game.fireArc）；
    // 低于最小充能比例不发射，防止反复点击
    if (fireReleased && w.chargeFrames !== undefined) {
      const power = Math.min(1, this.chargeProgress / w.chargeFrames)
      if (
        power >= (w.chargeMinRatio ?? 0.15) &&
        this.fireCd <= 0 &&
        this.reloadTimer <= 0 &&
        (w.magazine === undefined || this.ammo > 0)
      ) {
        this.fireCd = w.fireInterval
        this.idleFrames = 0 // 实际开火，重置闲置计时
        if (w.fireSound) playSfx(w.fireSound)
        // 出弧点在机首前方；事件由 game.step() 同帧消费
        const cos = Math.cos(this.angle)
        const sin = Math.sin(this.angle)
        this.arcShot = { x: this.x + cos * 14, y: this.y + sin * 14, angle: this.angle, power }
      }
      this.chargeProgress = 0
    }
    if (
      firePressed &&
      w.magazine !== undefined &&
      w.emptySound &&
      (this.reloadTimer > 0 || this.ammo <= 0)
    ) {
      playSfx(w.emptySound)
    }
    // 过热干火：过热锁机中按下扳机（边沿触发）播放干火音效
    if (firePressed && this.overheatTimer > 0 && w.emptySound) {
      playSfx(w.emptySound)
    }
    // 激光音效：持续照射期间循环播放，松手/无法开火即停
    let laserFiring = false
    // 蓄力音效：充能期间循环播放，松手/切枪即停
    let charging = false
    if (
      control.shooting &&
      this.reloadTimer <= 0 &&
      this.overheatTimer <= 0 &&
      (w.magazine === undefined || this.ammo > 0)
    ) {
      if (w.laser) {
        laserFiring = true
        // 激光武器：持续照射——按住开火每帧刷新射线（光束不间断），
        // 伤害按 fireInterval 节拍结算；激光无散射，弹道即瞄准方向
        const tick = this.fireCd <= 0
        if (tick) this.fireCd = w.fireInterval
        const cos = Math.cos(this.angle)
        const sin = Math.sin(this.angle)
        this.laserShot = {
          x: this.x + cos * 14,
          y: this.y + sin * 14,
          angle: this.angle,
          tick
        }
      } else if (w.chargeFrames !== undefined) {
        // 蓄力武器：按住扳机持续充能（封顶 chargeFrames），松开扳机时发射
        // 充能速度不受减速影响
        charging = true
        this.chargeProgress = Math.min(this.chargeProgress + 1, w.chargeFrames)
      } else if (this.fireCd <= 0) {
        // 点射连发：连发内用短间隔 burstGap，一轮打完后进入 fireInterval 冷却
        const burst = w.burst ?? 1
        // 开火音效：每次扳机（新一轮连发起点）播放一次，避免连发内叠音
        if (this.burstLeft <= 0 && w.fireSound) playSfx(w.fireSound)
        if (this.burstLeft <= 0) this.burstLeft = burst
        this.burstLeft--
        this.fireCd = this.burstLeft > 0 ? (w.burstGap ?? 3) : w.fireInterval
        if (w.magazine !== undefined) this.ammo--
        this.idleFrames = 0 // 实际开火，重置闲置计时
        // 过热武器：每发累积热量，打满即锁机进入强制冷却
        if (w.heatPerShot !== undefined) {
          const heatMax = w.heatMax ?? 100
          this.heat = Math.min(heatMax, this.heat + w.heatPerShot)
      if (this.heat >= heatMax) {
        this.overheatTimer = w.overheatFrames ?? 120
        if (w.overheatSound) playSfx(w.overheatSound) // 锁机瞬间提示音
      }
        }
        // 散射规则：
        // 0. 无散布武器（未定义 spreadDeg 的技术武器）→ 始终 0 散射，
        //    不受持续射击累积与冲刺惩罚影响，弹着点与准星严丝合缝
        // 1. 瞄准 + 不移动 → 始终 0 散射
        // 2. 停下后的第一发子弹 → 0 散射
        // 3. 其余情况：腰射 spreadDeg / 瞄准 aimSpreadDeg
        let spreadDeg: number
        if (w.spreadDeg === undefined) {
          spreadDeg = 0
        } else if (this.aiming && !isMoving) {
          spreadDeg = 0
        } else if (!isMoving && !this.stoppedFirstShot) {
          spreadDeg = 0
          this.stoppedFirstShot = true
        } else {
          spreadDeg = this.aiming
            ? (w.aimSpreadDeg ?? 0)
            : (w.spreadDeg ?? 0)
        }
        if (w.spreadDeg !== undefined) {
          // 持续射击散射逐渐加大（每发 +0.15°，上限 2.5°）
          this.sustainedFireSpread = Math.min(this.sustainedFireSpread + 0.15, 2.5)
          spreadDeg += this.sustainedFireSpread
          // 冲刺时腰射散布额外增大
          if (this.sprinting) spreadDeg += 2
        }
        const a =
          this.angle + (Math.random() * 2 - 1) * spreadDeg * (Math.PI / 180)
        // 弹丸数量：在 [projectilesMin, projectilesMax] 区间内随机取整（缺省单发）；
        // 多发时以瞄准方向为中心对称扇形展开，单发恒为正中无偏移
        const pMin = w.projectilesMin ?? 1
        const pMax = w.projectilesMax ?? pMin
        const count = pMin + Math.floor(Math.random() * (pMax - pMin + 1))
        const fan = (w.pelletFanDeg ?? 5) * (Math.PI / 180)
        for (let i = 0; i < count; i++) {
          const pa = a + (i - (count - 1) / 2) * fan
          const cos = Math.cos(pa)
          const sin = Math.sin(pa)
          // 出弹点在机首前方
          pool.spawn(
            this.x + cos * 14,
            this.y + sin * 14,
            cos * w.bulletSpeed,
            sin * w.bulletSpeed,
            w.bulletRadius,
            w.bulletStyle,
            w.bulletDamage * this.effectiveAttackMul
          )
        }
      }
    }
    // 激光循环音效：照射中确保已启动，否则立即停止
    if (laserFiring && w.fireSound) {
      if (!this.laserLoopStop)
        this.laserLoopStop = startSfxLoop(w.fireSound, undefined, w.fireLoopFrom, w.fireLoopTo)
    } else {
      this.stopLaserLoop()
    }
    // 蓄力循环音效：充能中且未蓄满时确保已启动，松手/切枪/蓄满即停
    if (charging && w.chargeSound && this.chargeProgress < w.chargeFrames!) {
      if (!this.chargeLoopStop)
        this.chargeLoopStop = startSfxLoop(w.chargeSound)
    } else {
      this.stopChargeLoop()
    }
  }

  /** 停止激光循环音效（幂等） */
  private stopLaserLoop() {
    this.laserLoopStop?.()
    this.laserLoopStop = null
  }

  /** 停止蓄力循环音效（幂等） */
  private stopChargeLoop() {
    this.chargeLoopStop?.()
    this.chargeLoopStop = null
  }

  /** HUD 用：弹匣状态（非弹匣式武器为 null） */
  get ammoHud(): { current: number; max: number; reloading: boolean } | null {
    const mag = PLAYER_WEAPONS[this.weapon].magazine
    if (mag === undefined) return null
    return { current: this.ammo, max: mag, reloading: this.reloadTimer > 0 }
  }

  /** HUD 用：热量状态（非过热武器为 null；overheated = 过热锁机中） */
  get heatHud(): { current: number; max: number; overheated: boolean } | null {
    const w = PLAYER_WEAPONS[this.weapon]
    if (w.heatPerShot === undefined) return null
    return {
      current: this.heat,
      max: w.heatMax ?? 100,
      overheated: this.overheatTimer > 0
    }
  }

  /** 切换到指定武器槽（空槽或当前槽则忽略）；返回是否真切了（供切枪音效判断） */
  switchWeapon(slot: number): boolean {
    const w = this.weapons[slot]
    if (!w || slot === this.weaponSlot) return false
    // 保留当前槽位剩余弹药；进行中的装填被打断
    this.ammoBySlot.set(this.weaponSlot, this.ammo)
    // 保留当前槽位热量；切回时若热量已满则重新进入过热锁机
    this.heatBySlot.set(this.weaponSlot, this.heat)
    this.weaponSlot = slot
    this.weapon = w
    this.ammo = this.ammoBySlot.get(slot) ?? (PLAYER_WEAPONS[w].magazine ?? 0)
    this.heat = this.heatBySlot.get(slot) ?? 0
    this.overheatTimer = 0
    const nw = PLAYER_WEAPONS[w]
    if (nw.heatPerShot !== undefined && this.heat >= (nw.heatMax ?? 100)) {
      this.overheatTimer = nw.overheatFrames ?? 120
    }
    this.reloadTimer = 0
    this.reloadSfxDelay = 0
    this.stopLaserLoop()
    this.stopChargeLoop()
    this.aiming = false
    this.burstLeft = 0
    this.chargeProgress = 0
    // 切换硬直：短暂无法开火，防止双武器轮射
    this.fireCd = Math.max(this.fireCd, 12)
    return true
  }

  /** 滚轮循环切换：切到另一个非空槽位的武器；返回是否真切了 */
  cycleWeapon(): boolean {
    const other = this.weaponSlot === 0 ? 1 : 0
    return this.weapons[other] ? this.switchWeapon(other) : false
  }

  /** 开始装填：重置装填计时，并按配置立即/延迟播放装填音效 */
  private beginReload(w: PlayerWeaponConfig) {
    this.reloadTimer = w.reloadFrames ?? 90
    this.reloadSfxDelay = w.reloadSoundDelay ?? 0
    if (this.reloadSfxDelay <= 0 && w.reloadSound) playSfx(w.reloadSound)
  }

  /** R 键手动换弹（仅弹匣式武器；弹匣已满或装填中则忽略） */
  startReload() {
    const w = PLAYER_WEAPONS[this.weapon]
    if (w.magazine === undefined) return
    if (this.reloadTimer > 0 || this.ammo >= w.magazine) return
    this.beginReload(w)
  }

  /**
   * 尝试受击：护盾优先承伤，护盾耗尽后扣血量；
   * 命中后获得受击无敌；血量归零即死亡（无复活）
   * @returns 'hit' = 受击存活，'dead' = 血量归零死亡，false = 无敌中或闪避成功未受伤
   */
  hit(damage: number): 'hit' | 'dead' | false {
    const dmg = damage * this.damageTakenMul // 义体承伤修正（减伤乘区）
    if (!this.alive || this.invincible > 0 || dmg <= 0) return false
    // 闪避判定：按概率完全不受伤害（不触发受击无敌，视同未命中）
    if (this.dodgeChance > 0 && Math.random() < this.dodgeChance) return false
    this.invincible = Math.max(this.invincible, this.hitInvincible)
    // 护盾承伤：溢出部分不扣血；护盾被打空进入熔断（锁定为 0，熔断结束后恢复到 1）
    if (this.shield > 0) {
      this.shield -= dmg
      this.shieldRegenDelayTimer = P.shieldRegenDelayFrames // 承伤后暂停回复
      if (this.shield <= 0) {
        this.shield = 0
        this.shieldBreakTimer = this.shieldBreakFrames
      }
      return 'hit'
    }
    this.hp -= dmg
    if (this.hp <= 0) {
      // 免死守护（义体）：致命伤保留 1 点生命并获得无敌，触发后进入冷却
      if (this.deathGuardCooldownFrames > 0 && this.deathGuardTimer <= 0) {
        this.hp = 1
        this.deathGuardTimer = this.deathGuardCooldownFrames
        this.deathGuardActiveTimer = this.deathGuardInvincibleFrames
        this.invincible = Math.max(this.invincible, this.deathGuardInvincibleFrames)
        return 'hit'
      }
      this.hp = 0
      this.alive = false
      return 'dead'
    }
    return 'hit'
  }
}
