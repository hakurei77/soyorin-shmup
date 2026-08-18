/**
 * Boss
 * 单一阶段，无符卡机制：
 * - 登场动画后使用敌人武器射击
 * - 全部血量耗尽即击破
 *
 * 武器机制：
 * - 默认使用 EnemyConfig.weapon 单武器
 * - 配置 EnemyConfig.weapons 后进入武器轮播：按顺序循环切换武器，
 *   每把持续 duration 帧——单形态 Boss 通过轮换武器改变弹幕形态，
 *   切换时通过 onWeaponChange 回调通知外层（横幅展示等）
 * - 武器槽可携带 movement 字段，切换武器时同步切换机动模式
 *   （漂移 / 李萨如巡航 / 猎杀追击 / 俯冲压迫），见 updateMovement
 * - 切换机动模式时通过衰减偏移量平滑滑入新路径，Boss 位置永不瞬移
 *
 * 静态数据（名称、图标、HP 等）全部来自 config/enemies.ts 的 EnemyConfig。
 */
import { BALANCE } from '../config/balance'
import { ENEMIES } from '../config/enemies'
import type {
  BossConfig,
  BossMovementKey,
  BossPart,
  EnemyConfig,
  EnemyLaserSpawnFn,
  EnemySpawnConfig,
  Vec2
} from '../types'
import { EnemyWeaponEmitter } from './bullet'
import type { BulletSpawnFn } from './bullet'
import type { BgmBeat } from '../utils/bgm'
import { ENEMY_WEAPONS } from '../weapons/enemyWeapons'
import { field } from './field'

/** Boss 武器槽（运行时）：发射器 + 持续帧数 + 武器名 + 移动模式 */
interface BossWeaponSlotRuntime {
  emitter: EnemyWeaponEmitter
  /** 持续帧数（Infinity = 永不切换，单武器 Boss） */
  duration: number
  /** 武器名（切换横幅用） */
  name: string
  /** 该武器激活期间的移动模式（可选） */
  movement?: BossMovementKey
}

export class Boss {
  x = field.cx
  y = -70
  /** 上一步位置（渲染插值用，由 update 每步快照） */
  px = field.cx
  py = -70
  /** 机体判定半径（巨构 Boss 覆写为更大值，并以 hitCircles 提供多圆判定） */
  readonly radius: number = BALANCE.bossRadius
  /** Boss 数据定义（渲染层通过它读取 icon / iconColor 等） */
  readonly def: EnemyConfig

  /**
   * 部位系统（巨构 Boss 专属，普通 Boss 为空数组）：
   * 独立受击目标列表，位置为相对 Boss 中心的世界偏移，
   * 由巨构 Boss 的专属脚本维护；游戏层碰撞 / 渲染层绘制都遍历它
   */
  parts: BossPart[] = []

  hp: number
  readonly maxHp: number
  /** 登场动画中（此时不攻击、不受击） */
  entering = true
  defeated = false
  flash = 0
  /** 电磁脉冲干扰剩余帧数（> 0 时无法移动与开火） */
  stun = 0

  /** 是否仍可被跟踪弹锁定 */
  get trackable(): boolean {
    return !this.entering && !this.defeated
  }

  get name(): string {
    return this.def.name
  }

  /**
   * 机体判定圆列表（体术碰撞 / 射线阻挡用）：
   * 普通 Boss 为以中心为圆心的单圆；巨构 Boss 覆写为沿舰体排布的
   * 多个判定圆，让宽大的舰体各处都有真实的体术判定
   */
  get hitCircles(): { x: number; y: number; r: number }[] {
    return [{ x: this.x, y: this.y, r: this.radius }]
  }

  /**
   * 有效伤害圆列表（自机弹 / 激光命中本体扣血的判定圆）：
   * 普通 Boss 与 hitCircles 一致；巨构 Boss 覆写为仅核心——
   * 命中舰体装甲只会被吞弹跳火花，不扣本体血量
   */
  get damageCircles(): { x: number; y: number; r: number }[] {
    return this.hitCircles
  }

  /**
   * 自动索敌 / 弹丸跟踪的锁定点：
   * 普通 Boss 即机体中心；巨构 Boss 覆写为核心位置（核心才是有效目标）
   */
  get targetPoint(): { x: number; y: number } {
    return { x: this.x, y: this.y }
  }

  /**
   * 自动索敌候选锁定点列表（默认单点 = 机体中心）：
   * 巨构 Boss 覆写为核心 + 各存活部位 / 舰体多点，
   * 索敌时取离鼠标最近的点，实现「指哪打哪」
   */
  get aimPoints(): { x: number; y: number }[] {
    return [this.targetPoint]
  }

  /**
   * 部位受击入口（巨构 Boss 覆写）：处理部位血量、
   * 部位破坏奖励伤害与阶段推进。普通 Boss 为空实现。
   */
  partHit(_part: BossPart, _damage: number): void {}

  private moveT = 0
  /** 武器轮播槽（单武器 Boss 只有一个 duration = Infinity 的槽） */
  private readonly slots: BossWeaponSlotRuntime[]
  private slotIndex = 0
  private slotTimer = 0
  /** 当前移动模式（由武器槽切换，默认 drift） */
  private moveMode: BossMovementKey = 'drift'
  /** 位置平滑偏移量：切换机动模式时记录旧位置与新路径目标的差值，逐帧衰减到 0，避免位置跳变 */
  private ox = 0
  private oy = 0

  /** 悬停目标高度（设计空间 140，按纵向比例映射） */
  private get targetY(): number {
    return field.mapY(140)
  }

  /** lissajous 纵向振幅（设计空间）：配置了 maxY 时压缩，保证路径不越过活动下界 */
  private get lissajousAmpY(): number {
    return this.def.maxY === undefined
      ? 95
      : Math.max(0, Math.min(95, this.def.maxY - 150))
  }

  /** swoop 纵向行程（设计空间，顶端 120 起）：配置了 maxY 时压缩，保证路径不越过活动下界 */
  private get swoopRange(): number {
    return Math.max((this.def.maxY ?? 410) - 120, 0)
  }

  constructor(
    cfg: BossConfig,
    protected readonly onDefeated: () => void,
    /** 武器切换回调（轮播 Boss 换武器时触发，外层可用于横幅展示） */
    private onWeaponChange?: (weaponName: string) => void
  ) {
    // 从注册表取 Boss 数据
    this.def = ENEMIES[cfg.enemyKey]
    this.hp = this.def.hp
    this.maxHp = this.def.hp
    // 配置了 weapons 则轮播，否则回退到单武器
    const list = this.def.weapons?.length
      ? this.def.weapons
      : [{ key: this.def.weapon, duration: Number.POSITIVE_INFINITY }]
    this.slots = list.map(w => {
      const weapon = ENEMY_WEAPONS[w.key]
      return {
        emitter: new EnemyWeaponEmitter(weapon),
        duration: w.duration,
        name: weapon.name,
        movement: w.movement
      }
    })
    // 初始移动模式取第一把武器的配置
    this.moveMode = this.slots[0]?.movement ?? 'drift'
  }

  /**
   * @param aim 自机位置（用于射击角度计算）
   * @param spawn 敌弹写入回调
   * @param timeScale 时间缩放（1 = 正常，< 1 = 减速）
   * @param spawnLaser 敌激光写入回调（激光武器用，缺省时不发射激光）
   * @param beat BGM 节拍信息（bgm.json 登记了 bpm 的曲目播放中时每帧传入）：
   *   武器轮播到点后等待下一个小节边界再切换（4/4 拍），弹幕形态随音乐段落整齐变换；
   *   并透传给发射器做齐射对拍（配置了 beatInterval 的武器锁定拍网格发射）
   * @param summon 编队召唤回调（巨构 Boss 专属，用于召唤护卫机群等；普通 Boss 忽略）
   */
  update(
    aim: Vec2,
    spawn: BulletSpawnFn,
    timeScale = 1,
    spawnLaser?: EnemyLaserSpawnFn,
    beat?: BgmBeat | null,
    summon?: (cfg: EnemySpawnConfig) => void
  ) {
    if (this.defeated) return
    // 渲染插值
    this.px = this.x
    this.py = this.y
    // 电磁脉冲干扰：冻结（不移动、不开火，漂移计时不推进；登场动画不受影响）
    if (this.stun > 0 && !this.entering) {
      this.stun--
      return
    }

    if (this.entering) {
      // 登场：缓动下落至目标位置
      this.y += (this.targetY - this.y) * 0.04 + 0.6
      if (this.targetY - this.y < 2) this.entering = false
      return
    }

    this.moveT += timeScale
    if (this.flash > 0) this.flash--
    this.updateMovement(aim, timeScale)

    // 武器轮播：到点切换下一把武器并重置其发射节奏
    if (this.slots.length > 1) {
      this.slotTimer += timeScale
      if (this.slotTimer >= this.slots[this.slotIndex]!.duration) {
        // 小节对齐：有节拍时钟时等待小节边界再切换（最多晚一小节 ≈1.43s），
        // 让弹幕形态变换精准落在音乐段落上；超时期间当前武器继续射击
        if (!beat || beat.newBar) {
          this.slotTimer = 0
          this.slotIndex = (this.slotIndex + 1) % this.slots.length
          const slot = this.slots[this.slotIndex]!
          slot.emitter.reset()
          if (slot.movement && slot.movement !== this.moveMode) {
            this.moveMode = slot.movement
            this.blendIntoMode()
          }
          this.onWeaponChange?.(slot.name)
        }
      }
    }

    // 使用当前武器射击
    const aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x)
    this.slots[this.slotIndex]!.emitter.update(
      this.x,
      this.y,
      aimAngle,
      spawn,
      timeScale,
      spawnLaser,
      beat
    )
  }

  /**
   * 按当前移动模式更新位置（数据驱动，模式由武器槽携带切换）。
   * 路径类模式对 moveT 采样后叠加平滑偏移（ox / oy），偏移逐帧衰减到 0；
   * 追击类模式按 timeScale 缩放步进，从当前位置起步，天然无跳变。
   */
  private updateMovement(aim: Vec2, timeScale: number) {
    const t = this.moveT
    const sy = field.sy
    switch (this.moveMode) {
      case 'lissajous':
        // 李萨如巡航：横向大幅横扫 + 纵向高频翻飞，弹幕源全场漂移
        this.decayOffset(timeScale)
        this.x = field.cx + Math.sin(t * 0.023) * 175 * sy + this.ox
        this.y = field.mapY(150) + Math.sin(t * 0.037) * this.lissajousAmpY * sy + this.oy
        break
      case 'hunt': {
        // 猎杀追击：持续逼近自机（纵向钳制在活动下界以上），近身减速避免直接坐脸
        const dx = aim.x - this.x
        const dy = Math.min(aim.y, field.mapY(this.def.maxY ?? 360)) - this.y
        const d = Math.hypot(dx, dy)
        if (d > 1) {
          const sp = 2.4 * sy * Math.min(1, d / (60 * sy)) * timeScale
          this.x += (dx / d) * sp
          this.y += (dy / d) * sp
        }
        break
      }
      case 'swoop':
        // 俯冲压迫：纵向在设计空间 120~410（或 maxY）之间大幅起落，周期性压向自机所在空域
        this.decayOffset(timeScale)
        this.x = field.cx + Math.sin(t * 0.016) * 120 * sy + this.ox
        this.y = field.mapY(120) + (Math.sin(t * 0.03) * 0.5 + 0.5) * this.swoopRange * sy + this.oy
        break
      default:
        // 漂移：缓慢左右横移（原始行为，纵向保持当前高度）
        this.decayOffset(timeScale)
        this.x = field.cx + Math.sin(t * 0.01) * 90 * sy + this.ox
    }
    // 纵向活动下界兜底：平滑偏移（oy）可能把位置推出下界，这里硬钳制拉回
    if (this.def.maxY !== undefined) {
      this.y = Math.min(this.y, field.mapY(this.def.maxY))
    }
  }

  /**
   * 切换机动模式时计算平滑偏移：令偏移量 = 当前位置 - 新模式路径在当前 moveT 下的目标位置，
   * 使切换瞬间位置保持连续，之后由 decayOffset 逐帧衰减，Boss 平滑滑入新路径。
   * hunt 为增量移动（从当前位置起步），无需偏移。
   */
  private blendIntoMode() {
    const t = this.moveT
    const sy = field.sy
    let tx = this.x
    let ty = this.y
    switch (this.moveMode) {
      case 'lissajous':
        tx = field.cx + Math.sin(t * 0.023) * 175 * sy
        ty = field.mapY(150) + Math.sin(t * 0.037) * this.lissajousAmpY * sy
        break
      case 'swoop':
        tx = field.cx + Math.sin(t * 0.016) * 120 * sy
        ty = field.mapY(120) + (Math.sin(t * 0.03) * 0.5 + 0.5) * this.swoopRange * sy
        break
      case 'drift':
        tx = field.cx + Math.sin(t * 0.01) * 90 * sy
        break
      default:
        // hunt：增量移动，无路径目标
        break
    }
    this.ox = this.x - tx
    this.oy = this.y - ty
  }

  /** 平滑偏移量逐帧衰减，趋近于 0 时归零 */
  private decayOffset(timeScale: number) {
    if (this.ox === 0 && this.oy === 0) return
    const decay = Math.pow(0.96, timeScale)
    this.ox *= decay
    this.oy *= decay
    if (Math.abs(this.ox) < 0.5 && Math.abs(this.oy) < 0.5) {
      this.ox = 0
      this.oy = 0
    }
  }

  /** 受击 */
  damage(n: number) {
    if (this.entering || this.defeated) return
    this.hp -= n
    this.flash = 3
    if (this.hp <= 0) {
      this.defeated = true
      this.onDefeated()
    }
  }
}
