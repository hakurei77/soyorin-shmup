/**
 * 子弹实体 + 对象池 + 弹幕发射器
 *
 * 对象池设计：
 * - 构造时一次性预分配全部对象与空闲下标栈，运行时不创建新对象
 * - spawn 从空闲栈取对象，release 归还，active 标志控制遍历
 * - 出屏（含边距）自动回收，保证同屏 500+ 子弹零 GC 压力
 */
import type { BulletStyleKey, EnemyLaserAttackConfig, EnemyLaserSpawnFn } from '../types'
import type { EnemyWeaponConfig } from '../weapons/enemyWeapons'
import type { BgmBeat } from '../utils/bgm'
import { playSfx } from '../utils/sfx'
import enemyShotSfx from '../assets/audio/battle/EnemyShot.wav'

const DEG = Math.PI / 180

/** 子弹实体（池内复用，字段直接读写） */
export interface Bullet {
  index: number
  active: boolean
  x: number
  y: number
  /** 上一步位置（渲染插值用，由 integrate 每步快照） */
  px: number
  py: number
  vx: number
  vy: number
  /** 判定半径 */
  radius: number
  style: BulletStyleKey
  /** 视觉朝向（由速度方向决定，用于针弹/米弹/导弹旋转绘制） */
  angle: number
  /** 伤害（自机弹用） */
  damage: number
  /** 跟踪锁定标志（自机弹用）：贴近敌人被捕获后置 true，之后持续追踪直至命中或出屏 */
  locked: boolean
  /**
   * 追踪转向速率（弧度/帧，敌追踪导弹用）：> 0 时每帧朝锁定目标
   * （integrate 传入的 homing 目标点）最多转向该角度；0 = 直飞
   */
  turn: number
  /**
   * 锁定延迟（帧，敌追踪导弹用）：> 0 时先直线飞行锁定目标，
   * 归零后才开始按 turn 转向追踪；< 0 表示无延迟（立即追踪）
   */
  turnDelay: number
  /**
   * 发射驻留（帧，敌直射导弹用）：> 0 时在发射点悬停锁定（不移动），
   * 归零后按 vx/vy 直线飞出；< 0 表示立即飞行
   */
  moveDelay: number
  /**
   * 剩余寿命（帧，敌追踪导弹用）：> 0 时逐帧递减，归零自毁；
   * < 0 表示无限寿命（默认，仅出屏回收）
   */
  life: number
  /**
   * 可摧毁弹（true 时自机弹可将其击落）：金色方块弹、巨型弹等；
   * hp 为剩余击落次数，归零爆散回收
   */
  destructible: boolean
  hp: number
}

/** 敌弹生成附加选项（radiusMul = 判定半径倍率；destructible/hp = 可摧毁弹；turnDelay = 追踪启动延迟；moveDelay = 追踪持续窗口，耗尽后直飞） */
export interface BulletSpawnOpts {
  radiusMul?: number
  destructible?: boolean
  hp?: number
  turnDelay?: number
  moveDelay?: number
}

/** 子弹生成回调签名（弹幕发射器通过它向池中写弹） */
export type BulletSpawnFn = (
  x: number,
  y: number,
  vx: number,
  vy: number,
  style: BulletStyleKey,
  damage?: number,
  /** 追踪转向速率（弧度/帧），缺省 0 = 直飞 */
  turn?: number,
  /** 剩余寿命（帧），缺省 < 0 = 无限寿命 */
  life?: number,
  /** 附加选项（巨弹半径 / 可摧毁弹） */
  opts?: BulletSpawnOpts
) => void

export class BulletPool {
  readonly items: Bullet[] = []
  /** 空闲下标栈 */
  private freeList: number[] = []
  activeCount = 0

  constructor(
    capacity: number,
    /** 出屏回收边距（像素） */
    private margin = 40
  ) {
    for (let i = 0; i < capacity; i++) {
      this.items.push({
        index: i,
        active: false,
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        vx: 0,
        vy: 0,
        radius: 4,
        style: 'orb-red',
        angle: 0,
        damage: 0,
        locked: false,
        turn: 0,
        turnDelay: -1,
        moveDelay: -1,
        life: -1,
        destructible: false,
        hp: 0
      })
      this.freeList.push(capacity - 1 - i)
    }
  }

  /** 生成一颗子弹；池满时返回 null（丢弃） */
  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    style: BulletStyleKey,
    damage = 0,
    turn = 0,
    life = -1,
    destructible = false,
    hp = 1,
    turnDelay = -1,
    moveDelay = -1
  ): Bullet | null {
    const idx = this.freeList.pop()
    if (idx === undefined) return null
    const b = this.items[idx]!
    b.active = true
    b.x = x
    b.y = y
    b.px = x
    b.py = y
    b.vx = vx
    b.vy = vy
    b.radius = radius
    b.style = style
    b.angle = Math.atan2(vy, vx)
    b.damage = damage
    b.locked = false
    b.turn = turn
    b.turnDelay = turnDelay
    b.moveDelay = moveDelay
    b.life = life
    b.destructible = destructible
    b.hp = hp
    this.activeCount++
    return b
  }

  release(b: Bullet) {
    if (!b.active) return
    b.active = false
    this.activeCount--
    this.freeList.push(b.index)
  }

  /**
   * 移动所有存活子弹，出屏立即回收；timeScale < 1 时子弹减速。
   * hx/hy 为追踪导弹锁定目标（通常为自机）：turn > 0 的子弹每帧朝目标
   * 最多转向 turn 弧度（转向速率随 timeScale 缩放），寿命归零的子弹自毁回收
   */
  integrate(width: number, height: number, timeScale = 1, hx?: number, hy?: number) {
    const m = this.margin
    for (let i = 0; i < this.items.length; i++) {
      const b = this.items[i]!
      if (!b.active) continue
      // 渲染插值：快照上一步位置
      b.px = b.x
      b.py = b.y
      b.x += b.vx * timeScale
      b.y += b.vy * timeScale
      // 追踪转向（turn > 0）：
      //  turnDelay > 0：先直线飞行 turnDelay 帧，再朝锁定目标逐步偏转；
      //  moveDelay >= 0：仅在 moveDelay 帧窗口内朝目标偏转，耗尽后沿当前方向直线飞行
      if (b.turn > 0 && hx !== undefined && hy !== undefined) {
        if (b.turnDelay > 0) {
          b.turnDelay -= timeScale
        } else {
          if (b.moveDelay > 0) b.moveDelay -= timeScale
          if (b.moveDelay !== 0) {
            const cur = Math.atan2(b.vy, b.vx)
            let diff = Math.atan2(hy - b.y, hx - b.x) - cur
            if (diff > Math.PI) diff -= Math.PI * 2
            else if (diff < -Math.PI) diff += Math.PI * 2
            const step = Math.max(-b.turn * timeScale, Math.min(b.turn * timeScale, diff))
            const na = cur + step
            const sp = Math.hypot(b.vx, b.vy)
            b.vx = Math.cos(na) * sp
            b.vy = Math.sin(na) * sp
            b.angle = na
          }
        }
      }
      if (b.life > 0 && (b.life -= timeScale) <= 0) {
        this.release(b)
        continue
      }
      if (b.x < -m || b.x > width + m || b.y < -m || b.y > height + m) {
        this.release(b)
      }
    }
  }

  /** 清空池子，可通过回调对每颗子弹做收尾（如阶段切换清屏转分） */
  clear(cb?: (b: Bullet) => void) {
    for (let i = 0; i < this.items.length; i++) {
      const b = this.items[i]!
      if (!b.active) continue
      if (cb) cb(b)
      this.release(b)
    }
  }
}

/** 粒子（击毁爆散 / 特效，同样对象池复用） */
export interface Particle {
  index: number
  active: boolean
  x: number
  y: number
  /** 上一步位置（渲染插值用） */
  px: number
  py: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  drag: number
}

export class ParticlePool {
  readonly items: Particle[] = []
  private freeList: number[] = []

  constructor(capacity: number) {
    for (let i = 0; i < capacity; i++) {
      this.items.push({
        index: i,
        active: false,
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        color: '#ffffff',
        drag: 0.98
      })
      this.freeList.push(capacity - 1 - i)
    }
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    drag = 0.98
  ) {
    const idx = this.freeList.pop()
    if (idx === undefined) return
    const p = this.items[idx]!
    p.active = true
    p.x = x
    p.y = y
    p.px = x
    p.py = y
    p.vx = vx
    p.vy = vy
    p.life = life
    p.maxLife = life
    p.size = size
    p.color = color
    p.drag = drag
  }

  /** 爆散效果：以 (x,y) 为中心向四周喷射 count 个粒子 */
  burst(
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
    size = 3,
    life = 40
  ) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.3 + Math.random() * 0.7)
      this.spawn(
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        life * (0.6 + Math.random() * 0.4),
        size * (0.6 + Math.random() * 0.8),
        color
      )
    }
  }

  /**
   * 环形冲击波：粒子均匀分布在圆周上沿径向外扩，
   * 视觉上是一个逐渐扩大并消散的圆环（闪现等技能特效用）
   */
  ring(
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
    size = 2.5,
    life = 24
  ) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      this.spawn(
        x,
        y,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        life,
        size,
        color,
        0.96
      )
    }
  }

  update() {
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i]!
      if (!p.active) continue
      p.px = p.x
      p.py = p.y
      p.x += p.vx
      p.y += p.vy
      p.vx *= p.drag
      p.vy *= p.drag
      if (--p.life <= 0) {
        p.active = false
        this.freeList.push(p.index)
      }
    }
  }

  clear() {
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i]!
      if (p.active) {
        p.active = false
        this.freeList.push(p.index)
      }
    }
  }
}

/**
 * 敌人武器发射器：解释 EnemyWeaponConfig，道中敌机与 Boss 使用。
 * - aimed（默认）：按 fireInterval 节奏，以发射瞬间朝自机的方向为中心，
 *   一次发射 bulletCount 颗弹丸（默认 1 颗；多颗时按 spreadAngle 扇形展开）
 * - radial：360° 均布 bulletCount 颗弹丸的环形弹幕；
 *   spinSpeed ≠ 0 时每轮基础角旋转，衍生旋转环 / 螺旋；
 *   mirrorSpin 时后半组弹丸反向旋转并错开半个身位，形成双螺旋
 * 通用修饰（两种模式均可叠加）：
 * - speedStep：奇数序号弹丸的速度增量，制造快慢双层弹幕
 * - spinBounce：基础角在 ±值之间往返摆动（aimed 下表现为扫摆扇面）
 * - burstCount / burstCooldown：连发数轮后停火喘息，形成节奏空窗
 * 武器数据见 weapons/enemyWeapons.ts，新增武器只需加配置、无需改这里。
 */
export class EnemyWeaponEmitter {
  private frame = 0
  private acc = 0
  /** 当前基础角（度），每轮射击后按 spinSpeed × spinDir 递增 */
  private baseAngle = 0
  /** 基础角旋转方向（spinBounce 摆动时往返翻转） */
  private spinDir: 1 | -1 = 1
  /** 当前连发剩余轮数（burstCount 用，0 = 未在连发中） */
  private burstLeft = 0
  /** 停火喘息剩余帧数（burstCooldown 用） */
  private cooldownLeft = 0
  /** 激光武器：距下一轮光束发射的剩余帧数（0 = 立即发射） */
  private laserWait = 0
  /** 节拍网格模式：已发射到的拍格序号（-1 = 未发射，首帧立即齐射） */
  private beatVolleyIdx = -1

  constructor(private readonly cfg: EnemyWeaponConfig) {}

  reset() {
    this.frame = 0
    this.acc = 0
    this.baseAngle = 0
    this.spinDir = 1
    this.burstLeft = 0
    this.cooldownLeft = 0
    this.laserWait = 0
    this.beatVolleyIdx = -1
  }

  update(
    x: number,
    y: number,
    aimAngle: number,
    spawn: BulletSpawnFn,
    dt = 1,
    spawnLaser?: EnemyLaserSpawnFn,
    beat?: BgmBeat | null
  ) {
    // 激光武器：走光束状态机（预警 → 照射 → 熄灭 → 休息），不发射弹丸
    if (this.cfg.laser) {
      this.updateLaser(x, y, aimAngle, spawnLaser, dt)
      return
    }
    // 节拍网格模式：配置了 beatInterval 且有节拍时钟时，每轮齐射锁定音乐拍网格；
    // 时缓（dt < 1）期间回退帧计时，避免弹速减慢而发射不减导致弹丸堆积
    if (this.cfg.beatInterval != null && beat && dt >= 1) {
      const idx = Math.floor(beat.beatFloat / this.cfg.beatInterval)
      if (idx === this.beatVolleyIdx) return
      this.beatVolleyIdx = idx
      this.fireVolley(x, y, aimAngle, spawn)
      return
    }
    this.acc += dt
    if (this.acc < 1) return
    this.acc -= 1

    this.frame++
    // 连发后的停火喘息期
    if (this.cooldownLeft > 0) {
      this.cooldownLeft--
      return
    }
    if (this.frame % Math.max(1, this.cfg.fireInterval) !== 0) return

    this.fireVolley(x, y, aimAngle, spawn)
  }

  /** 发射一轮弹丸并推进旋转/连发节奏（帧计时与节拍网格两种驱动共用） */
  private fireVolley(x: number, y: number, aimAngle: number, spawn: BulletSpawnFn) {
    // 齐射音：每个发射器每轮只播一次（节拍网格模式下天然落在拍点上）；
    // silent 武器（编队无人机）静音开火
    if (!this.cfg.silent) playSfx(enemyShotSfx)
    const n = Math.max(1, this.cfg.bulletCount ?? 1)
    const s = this.cfg.bulletSpeed
    const speedStep = this.cfg.speedStep ?? 0

    if (this.cfg.pattern === 'radial') {
      const base = this.baseAngle * DEG
      // 双螺旋：拆成两组，第二组反向旋转并错开半个身位（bulletCount 需为偶数）
      const mirror = this.cfg.mirrorSpin === true && n >= 2 && n % 2 === 0
      const m = mirror ? n / 2 : n
      for (let i = 0; i < n; i++) {
        const rev = mirror && i >= m
        const idx = rev ? i - m : i
        const a = (rev ? -base : base) + (rev ? Math.PI / m : 0) + (idx / m) * Math.PI * 2
        // 奇数序号弹丸叠加速度增量：快慢双层环
        const v = s + (i % 2 === 1 ? speedStep : 0)
        spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, this.cfg.bulletStyle, this.cfg.damage)
      }
    } else {
      // aimed：朝自机方向的扇形直射（baseAngle 偏移可实现扫摆扇面）
      const center = aimAngle + this.baseAngle * DEG
      const total = (this.cfg.spreadAngle ?? 8 * (n - 1)) * DEG
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? center : center - total / 2 + (total * i) / (n - 1)
        const v = s + (i % 2 === 1 ? speedStep : 0)
        spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, this.cfg.bulletStyle, this.cfg.damage)
      }
    }

    // 基础角推进：spinBounce 设置时在 ±值之间往返摆动，否则持续单向旋转
    this.baseAngle += (this.cfg.spinSpeed ?? 0) * this.spinDir
    const bounce = this.cfg.spinBounce
    if (bounce !== undefined) {
      if (this.baseAngle > bounce) {
        this.baseAngle = bounce
        this.spinDir = -1
      } else if (this.baseAngle < -bounce) {
        this.baseAngle = -bounce
        this.spinDir = 1
      }
    }

    // 连发节奏：打满 burstCount 轮后进入 burstCooldown 帧停火
    const burstCount = this.cfg.burstCount ?? 0
    if (burstCount > 0) {
      if (this.burstLeft <= 0) this.burstLeft = burstCount
      if (--this.burstLeft <= 0) this.cooldownLeft = this.cfg.burstCooldown ?? 60
    }
  }

  /**
   * 激光武器发射逻辑：休息计时归零时发射一轮光束，然后等待
   * 「预警 + 照射 + 熄灭 + 休息」的完整周期结束再发射下一轮。
   * count > 1 时沿基准角法线方向排布平行光束。
   * 光束实体由 Game 层维护状态机（预警 → 照射 → 熄灭），
   * 此处只负责发射时机与锚点/角度计算。
   */
  private updateLaser(
    x: number,
    y: number,
    aimAngle: number,
    spawnLaser: EnemyLaserSpawnFn | undefined,
    dt: number
  ) {
    if (!spawnLaser) return
    const L: EnemyLaserAttackConfig = this.cfg.laser!
    if (this.laserWait > 0) {
      this.laserWait -= dt
      return
    }
    // 基准角：预警开始瞬间锁定朝自机的方向，照射期间固定
    const base = aimAngle
    const count = Math.max(1, L.count)
    for (let i = 0; i < count; i++) {
      // 平行光束：沿基准角法线方向排布锚点
      const o = (i - (count - 1) / 2) * L.spacing
      const ox = Math.cos(base + Math.PI / 2) * o
      const oy = Math.sin(base + Math.PI / 2) * o
      spawnLaser(x + ox, y + oy, base, L, this.cfg.bulletColor)
    }
    // 下一轮发射等待完整周期（时间缩放由 dt 累积处理）
    this.laserWait = L.telegraph + L.duration + L.fade + L.rest
  }
}
