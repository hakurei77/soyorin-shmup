/**
 * 敌机
 * 移动分两阶段：
 * 1. path 阶段：按配置中的 path 入场（straight/sine/dive/hover…）
 * 2. engage 阶段（仅配置了 orbit 时）：追踪自机，逼近到设定半径后
 *    保持该距离环绕扫射（Circle Strafing），永不离场；
 *    允许被自机逼出屏幕（仍持续环绕，会随后绕回），但屏外不开火
 *
 * 行为系统（behaviors）：可叠加在路径移动上的附加行为
 * - ambush：伏击突袭（Enemy 内部处理，覆盖路径）
 * - evade / flock / guard：由 Game 层统一处理，通过 behaviorOffX/Y 累加偏移
 *
 * 所有静态数据（hp、weapon、速度等）来自 config/enemies.ts 的 EnemyConfig，
 * EnemySpawnConfig 仅配置出场时机与移动路径。
 */
import { BALANCE } from '../config/balance'
import { ENEMIES } from '../config/enemies'
import type {
  AmbushConfig,
  BehaviorConfig,
  EnemyConfig,
  EnemyLaserSpawnFn,
  EnemySpawnConfig,
  Vec2
} from '../types'
import { EnemyWeaponEmitter } from './bullet'
import type { BulletSpawnFn } from './bullet'
import { ENEMY_WEAPONS } from '../weapons/enemyWeapons'
import { field } from './field'

const DEG = Math.PI / 180
const AI = BALANCE.enemyAi

export class Enemy {
  x: number
  y: number
  /** 上一步位置（渲染插值用，由 update 每步快照） */
  px = 0
  py = 0
  hp: number
  readonly maxHp: number
  readonly radius = BALANCE.enemyRadius
  /** false 表示已被击毁或已逃离屏幕（由游戏层回收） */
  alive = true
  /** 受击闪白帧数 */
  flash = 0
  /** 电磁脉冲干扰剩余帧数（> 0 时无法移动与开火） */
  stun = 0
  /** 敌人数据定义（渲染层通过它读取 icon / iconColor 等） */
  readonly def: EnemyConfig
  /** 最近一帧朝自机的瞄准角（无人机炮塔/透镜朝向绘制用，缺省向上） */
  aimAngle = -Math.PI / 2

  /** 存活帧数（路径函数的自变量） */
  private t = 0
  private readonly baseX: number
  private readonly baseY: number
  /** 路径辅助状态（loop 的回旋中心下移量） */
  private aux = 0
  private readonly speed: number
  private readonly emitter: EnemyWeaponEmitter | null = null
  private readonly fireDelay: number

  /** 当前阶段：path = 按编队路径入场；engage = 追踪环绕 */
  private phase: 'path' | 'engage' = 'path'
  /** 环绕轨道角（弧度），进入环绕时从当前方位开始 */
  private orbitAngle = 0
  /** 环绕方向（1 顺时针 / -1 逆时针） */
  private readonly orbitDir: 1 | -1
  /** 感知到的自机位置（低通滤波后的滞后值） */
  private aimX: number
  private aimY: number
  /** 追踪响应系数（带个体差异，避免整群动作整齐划一） */
  private readonly trackResponse: number
  /** 出场/移动配置 */
  private readonly cfg: EnemySpawnConfig

  // ==================== 行为系统 ====================

  /** 附加行为列表（可叠加多个） */
  readonly behaviors: BehaviorConfig[]
  /** 行为偏移累加器（Game 层在 flock/guard/evade 处理后累加，帧末统一应用） */
  behaviorOffX = 0
  behaviorOffY = 0

  /** 伏击状态机（仅 ambush 行为生效） */
  private ambushState: 'idle' | 'waiting' | 'dashing' | 'done' = 'idle'
  /** 伏击待机位置（屏幕边缘） */
  private ambushWaitX = 0
  private ambushWaitY = 0

  constructor(cfg: EnemySpawnConfig) {
    this.cfg = cfg
    // 从注册表取敌人数据
    const data = ENEMIES[cfg.enemyKey]
    this.def = data

    // config 坐标基于 480×640 设计空间，以屏幕中心为基准映射到实际战场
    this.x = field.mapX(cfg.x)
    this.y = field.mapY(cfg.y)
    this.px = this.x
    this.py = this.y
    this.baseX = this.x
    this.baseY = this.y
    // 允许关卡配置覆盖血量和无敌状态（训练室自定义假人等场景）
    this.hp = cfg.hp ?? data.hp
    this.maxHp = cfg.hp ?? data.hp
    this.speed = data.speed
    this.fireDelay = data.fireDelay
    this.emitter = new EnemyWeaponEmitter(ENEMY_WEAPONS[data.weapon])

    // 环绕方向默认按出生侧选择（左侧顺时针、右侧逆时针，向外展开）
    this.orbitDir =
      cfg.orbit?.direction ?? (cfg.x < BALANCE.logicWidth / 2 ? 1 : -1)
    // 感知点从出生地出发（入场阶段会收敛到自机附近），响应系数按
    // 出生坐标哈希取 0.75~1.25 倍，让每架敌机的反应快慢略有不同
    this.aimX = this.x
    this.aimY = this.y
    const hash = Math.abs(Math.sin(this.baseX * 12.9898 + this.baseY * 78.233) * 43758.5453) % 1
    this.trackResponse = AI.trackResponse * (0.75 + hash * 0.5)

    // 行为系统
    this.behaviors = cfg.behaviors ?? []
    if (this.hasBehavior('ambush')) {
      this.ambushState = 'waiting'
      this.ambushWaitX = this.x
      this.ambushWaitY = this.y
    }
  }

  /**
   * @param aimAngle 朝自机的角度（弧度）
   * @param spawn 敌弹写入回调
   * @param player 自机位置（追踪 AI / 伏击用；传 Player 实例即可，无额外分配）
   * @param timeScale 时间缩放（1 = 正常，< 1 = 减速）
   * @param spawnLaser 敌激光写入回调（激光武器用，缺省时不发射激光）
   */
  update(
    aimAngle: number,
    spawn: BulletSpawnFn,
    player: Vec2,
    timeScale = 1,
    spawnLaser?: EnemyLaserSpawnFn
  ) {
    this.aimAngle = aimAngle
    this.px = this.x
    this.py = this.y
    if (this.flash > 0) this.flash--
    // 电磁脉冲干扰：整机冻结（存活帧不推进，恢复后路径连续），不能移动与开火
    if (this.stun > 0) {
      this.stun--
      return
    }
    this.t++

    // 伏击行为：在 path 入场基础上覆盖移动逻辑
    if (this.ambushState !== 'idle') {
      this.updateAmbush(player, timeScale)
      // 伏击状态直接控制移动，跳过标准 path/engage 流程
      if (this.ambushState !== 'done') {
        // 射击（如果仍在活跃状态）
        if (this.emitter && this.t >= this.fireDelay && this.onScreen) {
          this.emitter.update(this.x, this.y, aimAngle, spawn, timeScale, spawnLaser)
        }
        return
      }
    }

    if (this.cfg.orbit) {
      // 感知点向真实自机位置缓慢逼近（timeScale 减速时反应同步变慢）
      const resp = this.trackResponse * timeScale
      this.aimX += (player.x - this.aimX) * resp
      this.aimY += (player.y - this.aimY) * resp
      // 追踪型：入场 path 飞一段时间后切换为追踪环绕
      const engageAfter = this.cfg.orbit.engageAfter ?? AI.engageAfter
      if (this.phase === 'path' && this.t >= engageAfter) {
        this.phase = 'engage'
        this.orbitAngle =
          Math.atan2(this.y - this.aimY, this.x - this.aimX) +
          (this.cfg.orbit.phaseOffset ?? 0)
      }
      if (this.phase === 'engage') {
        this.engage(timeScale)
      } else {
        this.move(timeScale)
      }
      // 追踪型不夹取屏幕边界：被逼出屏后继续环绕，感知点拉回屏内时会绕回来
    } else {
      this.move(timeScale)
      // 出屏判定：下方出屏或左右大幅出屏视为逃离
      const m = 60
      if (
        this.y > field.height + m ||
        this.x < -m ||
        this.x > field.width + m
      ) {
        this.alive = false
        return
      }
    }

    // 射击（timeScale < 1 时发射频率降低；屏外不开火，防止被不可见的子弹偷袭）
    if (this.emitter && this.t >= this.fireDelay && this.onScreen) {
      this.emitter.update(this.x, this.y, aimAngle, spawn, timeScale, spawnLaser)
    }
  }

  /**
   * 追踪环绕（Circle Strafing / 轨道机动）
   * 距离大于环绕半径时直线逼近；进入半径后沿轨道环绕，
   * 通过轨道目标点修正位置。所有计算基于滞后的感知点 (aimX, aimY)
   * 而非自机实时位置，因此自机猛冲时敌机有约半秒的反应延迟
   */
  private engage(timeScale = 1) {
    const orbit = this.cfg.orbit!
    if (orbit.blockade) {
      this.engageBlockade(timeScale)
      return
    }
    // 半径按屏幕纵向比例缩放，与战场映射规则保持一致
    const R = orbit.radius * field.sy
    const sp = this.speed * (orbit.speedMul ?? AI.pursueSpeed) * timeScale
    const dx = this.aimX - this.x
    const dy = this.aimY - this.y
    const dist = Math.hypot(dx, dy) || 1

    if (dist > R * 1.15) {
      // 接近阶段：直线逼近，同时同步轨道角避免进环绕瞬间跳变
      this.x += (dx / dist) * sp
      this.y += (dy / dist) * sp
      this.orbitAngle = Math.atan2(this.y - this.aimY, this.x - this.aimX)
    } else {
      // 环绕阶段：推进轨道角，朝轨道上的目标点移动（含径向修正）
      this.orbitAngle +=
        this.orbitDir * (orbit.angularSpeed ?? AI.orbitAngularSpeed) * DEG * timeScale
      const tx = this.aimX + Math.cos(this.orbitAngle) * R
      const ty = this.aimY + Math.sin(this.orbitAngle) * R
      const mx = tx - this.x
      const my = ty - this.y
      const md = Math.hypot(mx, my)
      if (md > 0.5) {
        const step = Math.min(sp, md)
        this.x += (mx / md) * step
        this.y += (my / md) * step
      }
    }
  }

  /**
   * 封锁占位（blockade）：不逼向自机——每架按站位序号在战场下缘边界的
   * 巡游点上站位，缓慢游移并跟随自机所在高度微调，水平站位锚定不变，
   * 整队始终分散，用无限射程光束从远处封锁自机移动路线。
   * 站位序号 = phaseOffset / 2π（0~1），沿「左侧边 → 底边 → 右侧边」均布
   */
  private engageBlockade(timeScale = 1) {
    const orbit = this.cfg.orbit!
    const sp = this.speed * (orbit.speedMul ?? AI.pursueSpeed) * timeScale
    // 封锁区：顶边压在 Boss 舰腹下方，其余留 46 设计像素屏内边距（保证屏内开火）
    const mx0 = 46
    const my0 = 170
    const x1 = field.width - mx0
    const y1 = field.height - mx0
    const W = x1 - mx0
    const H = y1 - my0
    const peri = 2 * (W + H)
    // 站位序号 → 边界弧长 → 锚点（左上角起，顺时针走左侧边、底边、右侧边）
    const TAU = Math.PI * 2
    const f = ((((orbit.phaseOffset ?? 0) / TAU) % 1) + 1) % 1
    let d = f * peri
    let ax: number
    let ay: number
    if (d < H) {
      ax = mx0
      ay = my0 + d
    } else if (d < H + W) {
      ax = mx0 + (d - H)
      ay = y1
    } else {
      ax = x1
      ay = y1 - (d - H - W)
    }
    // 缓慢游移 + 跟随自机高度微调（水平锚定，保持分散不聚堆）
    ax += Math.cos(this.t * 0.003 + f * TAU) * 26
    ay += Math.sin(this.t * 0.004 + f * TAU) * 18 + (this.aimY - field.height * 0.5) * 0.15
    const tx = Math.max(mx0, Math.min(x1, ax))
    const ty = Math.max(my0, Math.min(y1, ay))
    const mdx = tx - this.x
    const mdy = ty - this.y
    const md = Math.hypot(mdx, mdy)
    if (md > 0.5) {
      const step = Math.min(sp, md)
      this.x += (mdx / md) * step
      this.y += (mdy / md) * step
    }
  }

  /** 机身是否在屏幕内（中心点位于战场边界内；屏外时不开火） */
  get onScreen(): boolean {
    return (
      this.x >= 0 &&
      this.x <= field.width &&
      this.y >= 0 &&
      this.y <= field.height
    )
  }

  /** 路径函数：按 path 类型根据存活帧数推进位置；timeScale < 1 时减速 */
  private move(timeScale = 1) {
    const s = this.speed * timeScale
    switch (this.cfg.path) {
      case 'straight':
        this.y += s
        break
      case 'sine':
        this.y += s * 0.7
        this.x += (this.baseX + Math.sin(this.t * 0.04) * 70 * field.sy - this.x) * timeScale
        break
      case 'dive-left':
        this.y += s
        this.x -= s * 0.5
        break
      case 'dive-right':
        this.y += s
        this.x += s * 0.5
        break
      case 'hover':
        // 下落 90 帧 → 悬停漂移 330 帧 → 加速离场
        if (this.t < 90) {
          this.y += s
        } else if (this.t < 420) {
          this.x += (this.baseX + Math.sin((this.t - 90) * 0.02) * 40 * field.sy - this.x) * timeScale
        } else {
          this.y += s * 1.5
        }
        break
      case 'zigzag': {
        // 锯齿：每 45 帧急转一次横向方向（单侧摆幅 = s×0.6×45）
        this.y += s * 0.8
        const dir = Math.floor(this.t / 45) % 2 === 0 ? 1 : -1
        this.x += dir * s * 0.6
        break
      }
      case 'loop': {
        // 回旋：中心缓慢下移，机身绕中心转圈（半径 65，周期 ≈126 帧）
        this.aux += s * 0.45
        const a = this.t * 0.05
        const tx = this.baseX + Math.sin(a) * 65 * field.sy
        const ty = this.baseY + this.aux + (1 - Math.cos(a)) * 65 * field.sy * 0.6
        this.x += (tx - this.x) * timeScale
        this.y += (ty - this.y) * timeScale
        break
      }
      case 'rush': {
        // 加速俯冲：0.4 倍速入场，每帧 +0.02 倍，上限 2.2 倍
        const factor = 0.4 + Math.min(this.t * 0.02, 1.8)
        this.y += s * factor
        break
      }
      case 'sweep-left':
        // 下落 40 帧 → 左转横穿战场（微幅下沉）
        if (this.t < 40) {
          this.y += s
        } else {
          this.x -= s * 1.2
          this.y += s * 0.15
        }
        break
      case 'sweep-right':
        // 下落 40 帧 → 右转横穿战场（微幅下沉）
        if (this.t < 40) {
          this.y += s
        } else {
          this.x += s * 1.2
          this.y += s * 0.15
        }
        break
      case 'static':
        // 原地静止：钉死在出生点（训练靶等），永不触发离场回收
        break
    }
  }

  /** 是否为追踪型且已进入追踪环绕阶段（boids 分离只作用于这类敌机） */
  get engaged(): boolean {
    return !!this.cfg.orbit && this.phase === 'engage'
  }

  // ==================== 行为系统 ====================

  /** 是否拥有指定类型的行为 */
  hasBehavior(type: string): boolean {
    return this.behaviors.some((b) => b.type === type)
  }

  /** 伏击配置（仅 ambush 行为生效时返回） */
  private get ambushConfig(): AmbushConfig | undefined {
    return this.behaviors.find((b): b is AmbushConfig => b.type === 'ambush')
  }

  /**
   * 伏击行为：入场后移到屏幕边缘待机，自机进入触发范围后全速突袭
   *
   * 状态转移：
   *   waiting → (自机进入触发距离) → dashing
   *   dashing → (飞出屏幕) → done（由 Game 标记 alive=false）
   */
  private updateAmbush(player: Vec2, timeScale = 1) {
    const cfg = this.ambushConfig
    if (!cfg) return

    if (this.ambushState === 'waiting') {
      // 入场后先按 path 飞 30 帧，然后进入待机位（移到屏幕边缘上方）
      if (this.t <= 30) {
        this.move(timeScale)
        this.ambushWaitX = this.x
        this.ambushWaitY = this.y
        return
      }
      // 待机：滞留在入场位置，微微正弦漂移（营造"潜伏"感）
      this.y += Math.sin(this.t * 0.03) * 0.4 * timeScale
      this.ambushWaitY = this.y
      // 检测触发
      const triggerDist = cfg.triggerDist ?? AI.ambush.triggerDist
      const dist = Math.hypot(player.x - this.x, player.y - this.y)
      if (dist <= triggerDist) {
        this.ambushState = 'dashing'
        // 突袭方向：预判自机位置 + 向自机略下方冲刺
        this.orbitAngle = Math.atan2(
          player.y - this.y + 30,
          player.x - this.x
        )
      }
      return
    }

    if (this.ambushState === 'dashing') {
      const dashMul = cfg.dashSpeedMul ?? AI.ambush.dashSpeedMul
      const sp = this.speed * dashMul * timeScale
      this.x += Math.cos(this.orbitAngle) * sp
      this.y += Math.sin(this.orbitAngle) * sp
      // 飞出屏幕下方 / 左右远端 → 行为结束
      if (this.y > field.height + 80 || this.x < -80 || this.x > field.width + 80) {
        this.ambushState = 'done'
        this.alive = false
      }
      return
    }
  }

  damage(n: number) {
    // 无敌判定：关卡配置覆盖 > 敌人定义。训练室可放置可击毁的假人
    const invincible = this.cfg.invincible ?? this.def.invincible ?? false
    if (!invincible) this.hp -= n
    this.flash = 3
  }

  /** 是否被击毁（hp 耗尽且仍标记为存活） */
  get destroyed(): boolean {
    return this.alive && this.hp <= 0
  }

  /** 是否仍可被跟踪弹锁定（存活且未被击毁） */
  get trackable(): boolean {
    return this.alive && this.hp > 0
  }
}
