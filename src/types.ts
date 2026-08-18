/**
 * STG 游戏全局类型定义
 * 本模块（src/stg）与项目其他代码零耦合，可整体迁移
 */

/** 二维向量 / 坐标 */
export interface Vec2 {
  x: number
  y: number
}

/** 游戏场景状态机 */
export type SceneState = 'title' | 'playing' | 'paused' | 'clear' | 'gameover'

/** 可自定义键位的动作 */
export type KeyAction =
  | 'up' // 上移
  | 'down' // 下移
  | 'left' // 左移
  | 'right' // 右移
  | 'slow' // 低速模式（显示判定点）
  | 'dash' // 闪现（移动中朝移动方向瞬移）
  | 'sprint' // 冲刺（持续加速 + 本色尾翼）
  | 'skill' // 技能（突触超频等）
  | 'pause' // 暂停
  | 'fire' // 射击（默认鼠标左键）
  | 'aim' // 瞄准（默认鼠标右键，动能武器 ADS）

/** 键位映射：动作 → KeyboardEvent.code */
export type KeyBindings = Record<KeyAction, string>

/** 子弹样式 key（渲染层根据 key 决定颜色与形状） */
export type BulletStyleKey =
  | 'orb-red'
  | 'orb-blue'
  | 'orb-purple'
  | 'orb-green'
  | 'orb-orange'
  | 'needle-red'
  | 'needle-cyan'
  | 'needle-gold'
  | 'rice-yellow'
  | 'star-pink'
  | 'missile-cyan'
  | 'orb-huge'
  | 'orb-square'
  | 'capsule-purple'

/** 自机武器编号（武器定义见 weapons/playerWeapons.ts） */
export type WeaponKey = 'WPN-01' | 'AH-01' | 'AH-02' | 'AH-03' | 'LW-01' | 'LW-02' | 'LW-03' | 'LW-04' | 'LW-05'

/** 激光束视觉残留（激光武器瞬时射线的渲染状态，见 engine/game.ts fireLaser） */
export interface LaserBeam {
  /** 起点 x（炮口） */
  x1: number
  /** 起点 y */
  y1: number
  /** 终点 x（命中目标中心，或未命中时的远处端点） */
  x2: number
  /** 终点 y */
  y2: number
  /** 剩余显示帧数 */
  ttl: number
  /** 总显示帧数（计算淡出透明度） */
  max: number
  /** 终点是否命中目标（命中端绘制爆闪光辉） */
  hit?: boolean
}

/** 蓄力电弧视觉残留（LW-04 松手放出的贯穿电弧渲染状态，见 engine/game.ts fireArc） */
export interface ArcBeam {
  /** 起点 x（炮口） */
  x1: number
  /** 起点 y */
  y1: number
  /** 终点 x（无限射程的远处端点） */
  x2: number
  /** 终点 y */
  y2: number
  /** 剩余显示帧数 */
  ttl: number
  /** 总显示帧数（计算淡出透明度） */
  max: number
  /** 蓄力比例 0~1（渲染层据此决定电弧粗细与密度） */
  power: number
}

/**
 * 电磁脉冲冲击波（EMP 技能释放的扩散脉冲渲染状态，
 * 渲染层据此绘制从自机扩散到全屏的电弧波前，见 engine/renderer.ts drawEmpPulses）
 */
export interface EmpPulse {
  /** 波源 x（释放瞬间自机位置） */
  x: number
  /** 波源 y */
  y: number
  /** 剩余显示帧数 */
  ttl: number
  /** 总显示帧数（计算扩散进度与淡出透明度） */
  max: number
}

/** 自机技能类型 */
export type SkillKey = 'synaptic' | 'emp' | 'gemini'

/**
 * 敌激光（敌方光束武器）攻击配置
 * 配置了 laser 字段的敌人武器走光束逻辑（见 engine/bullet.ts 的 EnemyWeaponEmitter），
 * 不再发射弹丸。一轮激光的完整周期：
 *   telegraph（预警，无判定）→ duration（照射，有判定）→ fade（熄灭残影）→ rest（休息）
 * 瞄准模式：预警开始瞬间锁定朝自机的方向，照射期间角度固定（预警线即真实光路）
 */
export interface EnemyLaserAttackConfig {
  /** 瞄准模式：锁定自机（预警开始时锁定方向） */
  aim: 'player'
  /** 预警帧数（无判定，仅显示预警线，60 帧 = 1 秒） */
  telegraph: number
  /** 照射持续帧数（有判定） */
  duration: number
  /** 熄灭残影帧数（无判定） */
  fade: number
  /** 照射结束后的休息帧数（下一轮预警前的空窗） */
  rest: number
  /** 光束判定半宽（逻辑像素，判定宽度 = halfWidth + 自机判定半径） */
  halfWidth: number
  /** 单次命中判定伤害（站立在光束内每隔 hitInterval 帧结算一次） */
  damage: number
  /** 命中判定间隔（帧）：同一光束两次结算之间的最小间隔 */
  hitInterval: number
  /** 同轮平行光束数量（垂直于照射方向排布） */
  count: number
  /** 平行光束间距（逻辑像素） */
  spacing: number
  /**
   * 光束旋转角速度（度/帧，可选）：设置后光束以锚点为圆心持续旋转
   * （预警线同步转动），实现旋转激光/风车激光等扫射光束；
   * 缺省 0 = 角度在预警时锁定、照射期间固定
   */
  sweep?: number
}

/** 敌激光运行时实体（engine/game.ts 维护状态机，renderer 消费绘制） */
export interface EnemyLaser {
  /** 锚点 x（发射瞬间炮口位置，发射后固定在世界坐标，Boss 移动不影响已发射光束） */
  x: number
  /** 锚点 y */
  y: number
  /** 当前照射角度（预警时锁定，之后不再变化） */
  angle: number
  /** 预警开始时锁定的基准角度 */
  baseAngle: number
  /** 状态机：预警 → 照射 → 熄灭 */
  state: 'telegraph' | 'firing' | 'fading'
  /** 当前状态已持续帧数（受时间缩放影响） */
  t: number
  /** 光束发光主色 */
  color: string
  /** 光束长度（发射时取战场对角线，恒通屏外） */
  len: number
  /** 光束攻击配置 */
  cfg: EnemyLaserAttackConfig
  /** 命中结算计时（firing 期间倒计时，归零且自机在光束内时结算伤害） */
  hitTimer: number
}

/** 敌激光生成回调签名（弹幕发射器通过它向 Game 写入光束实体） */
export type EnemyLaserSpawnFn = (
  x: number,
  y: number,
  angle: number,
  cfg: EnemyLaserAttackConfig,
  color: string
) => void

/**
 * 浮游炮（激光子机）部署配置
 * 激光武器每轮可附带部署浮游炮：不灭的攻击平台，按自身节奏向自机发射激光，
 * 与 Boss 本体形成夹击。Boss 被击破 / 超时（ttl）后自动消失
 */
export interface EnemyLaserBitConfig {
  /** 子机数量 */
  count: number
  /**
   * 部署模式：
   * - orbit：环绕 Boss 的椭圆轨道（全周均分）
   * - flank：左右两翼悬停
   * - top：屏幕顶部一字排开
   * - free：自由游走——全屏战术巡航（朝目标点移动 → 悬停开火 → 换位），
   *   目标点倾向远离其他自由子机（分散但不呆板，像有指挥的编队机动）
   */
  deploy: 'orbit' | 'flank' | 'top' | 'free'
  /** 环绕半径（逻辑像素，orbit 模式，随屏幕纵向比例缩放） */
  orbitRadius?: number
  /** 环绕角速度（度/帧，orbit 模式） */
  orbitSpeed?: number
  /** 部署完成开始射击的延迟（帧） */
  engageDelay?: number
  /** 每台子机的发射间隔（帧） */
  fireInterval: number
  /**
   * 错峰开火：设置后子机群按相位错开——第 i 台比第 i+1 台早
   * fireInterval/总数 帧开火，任意时刻只有一台在发射（预警线此起彼伏）。
   * 增援波到达时会整体重新排布相位
   */
  stagger?: boolean
  /** 子机发射的光束配置（每发一轮预警→照射→熄灭） */
  laser: EnemyLaserAttackConfig
  /** 持续时间（帧），到期自毁；缺省持续到 Boss 战结束 */
  ttl?: number
}

/** 浮游炮运行时实体（engine/game.ts 维护，renderer 消费绘制） */
export interface EnemyLaserBit {
  /** 当前位置（orbit 模式跟随 Boss 轨道） */
  x: number
  y: number
  /** 上一步位置（渲染插值用） */
  px: number
  py: number
  /** 存活帧数 */
  t: number
  /** 发射计时 */
  fireT: number
  /** 部署配置 */
  cfg: EnemyLaserBitConfig
  /** 轨道角（orbit 模式） */
  orbitAngle: number
  /** 悬停锚点（flank / top 模式的世界坐标） */
  ax: number
  ay: number
  /** 自由游走目标点（free 模式的世界坐标） */
  tx: number
  ty: number
  /** 抵达目标后的悬停剩余帧数（free 模式战术停顿，归零后换位） */
  holdT: number
  /** deploy = 滑向锚点途中；active = 就位开火（orbit / free 直接 active） */
  state: 'deploy' | 'active'
  /** 机体发光色 */
  color: string
  /**
   * 所属 Boss（多 Boss 同屏时：子机锚定各自 Boss 的轨道 / 跟随各自 EMP 干扰状态，
   * Boss 被击破后其子机随之移除）。结构化类型声明，避免 types 与 engine 循环依赖。
   */
  owner: {
    readonly x: number
    readonly y: number
    readonly stun: number
    readonly defeated: boolean
  }
}

/** 浮游炮生成回调签名（Boss 按血量分段增援时向 Game 写入子机实体） */
export type EnemyLaserBitSpawnFn = (
  x: number,
  y: number,
  cfg: EnemyLaserBitConfig,
  color: string
) => void

/**
 * Boss 浮游炮分段增援配置（血量驱动，仅 Boss 使用）：
 * 登场后先部署 initial 台；血量低于 stages[i].atRatio（maxHp 比例）时增援 add 台。
 * stages 按 atRatio 从高到低排列，总台数 = initial + Σadd（如 3 → 5 → 8）。
 * 配置 freeConfig 时每波同时增援等量的自由游走浮游炮（如 3+3 → 5+5 → 8+8）
 */
export interface EnemyLaserBitEscalation {
  /** 初始浮游炮数量 */
  initial: number
  /**
   * 增援阶段（按 maxHp 比例从高到低排列）。
   * fireInterval 可选：触发后该 Boss 全场浮游炮（含后续新波）改用更短的发射间隔，
   * 实现"台数与射速同步增压"；缺省保持部署配置不变
   */
  stages: { atRatio: number; add: number; fireInterval?: number }[]
  /** 轨道浮游炮部署配置 */
  config: EnemyLaserBitConfig
  /** 自由游走浮游炮部署配置（可选）：每波与轨道组同数量增援 */
  freeConfig?: EnemyLaserBitConfig
}

/** 敌人武器编号（武器定义见 weapons/enemyWeapons.ts） */
export type EnemyWeaponKey =
  | 'E-WPN-01'
  | 'E-WPN-02'
  | 'E-WPN-10'
  | 'E-WPN-11'
  | 'E-WPN-12'
  | 'E-WPN-14'
  | 'E-WPN-16'
  | 'E-WPN-17'
  | 'E-WPN-19'
  | 'E-WPN-22'
  | 'E-WPN-23'
  | 'E-WPN-24'
  | 'E-WPN-25'
  | 'E-WPN-28'
  | 'E-WPN-29'
  | 'E-WPN-31'
  | 'E-WPN-32'
  | 'E-LSR-01'

/** 敌人单位编号（敌人定义见 config/enemies.ts） */
export type EnemyKey =
  | 'TST-01'
  | 'TST-02'
  | 'DMY-01'
  | 'PRT-01'
  | 'LAS-01'
  | 'FIN-01'
  | 'FIN-ESC'
  | 'FIN-LSR'

/** 敌人图标形状（渲染层根据形状绘制） */
export type EnemyIconType = 'triangle' | 'square' | 'circle' | 'leviathan' | 'drone' | 'laser-drone'

/** 敌人分类（图鉴二级导航用） */
export type EnemyCategory = 'normal' | 'boss'

/**
 * 巨构 Boss 部位（运行时实体，engine/finalBoss.ts 维护）
 * 部位是独立受击目标：被击毁后该部位停止开火，
 * 并按阶段机制结算剥离伤害与阶段推进
 */
export interface BossPart {
  /** 部位 id（对应 LeviathanConfig.partDefs / phase2PartDefs 中的定义） */
  id: string
  /** 部位名（图鉴 / 提示用） */
  name: string
  /** 部位外观类型：turret = 双联炮塔，pod = 导弹巢，beam = 激光塔 */
  kind: 'turret' | 'pod' | 'beam'
  /** 相对 Boss 中心的世界坐标偏移（每帧由 Boss 更新，含待机浮动） */
  x: number
  y: number
  /** 判定半径（逻辑像素） */
  radius: number
  hp: number
  maxHp: number
  /** 是否存活（false = 已被击毁，停止开火并显示残骸） */
  alive: boolean
  /** 受击闪白帧数 */
  flash: number
}

/** 巨构 Boss 部位定义（数据配置，坐标基于 480×640 设计空间，整体随舰体缩放） */
export interface LeviathanPartDef {
  /** 部位 id（如 gun-l / sec-c） */
  id: string
  /** 部位名（如 左翼副炮 / 中枢激光塔） */
  name: string
  /** 部位外观类型 */
  kind: 'turret' | 'pod' | 'beam'
  /** 相对 Boss 中心的设计偏移（x 以舰体中心为 0） */
  x: number
  y: number
  /** 判定半径（设计空间像素） */
  radius: number
  /** 部位血量 */
  hp: number
}

/**
 * 巨构 Boss 配置（仅最终 Boss「星渊巨构」使用，见 engine/finalBoss.ts）：
 * 三阶段各自由独立血量池驱动——阶段一「核心 + 四门副炮」、
 * 阶段二「左/中/右三部位」、阶段三「整舰」，阶段击破即换池，
 * 转阶段有无敌窗口与爆炸演出，部位破坏与剥离伤害互不跨阶段
 */
export interface LeviathanConfig {
  /** 阶段一部位定义（四门副炮） */
  partDefs: LeviathanPartDef[]
  /** 阶段二部位定义（左/中/右三部位，等血量） */
  phase2PartDefs: LeviathanPartDef[]
  /** 各阶段符卡名（登场横幅与阶段切换横幅展示，如 ['符卡一', '符卡二', '符卡三']） */
  spellCards: string[]
  /** 阶段独立血量池：[阶段一核心血量, 阶段三舰体血量]（阶段二血量 = 三部位之和） */
  phaseHp: [number, number]
  /** 各阶段的编队召唤间隔（帧，如 [600, 430, 320]） */
  summonIntervals: number[]
  /** 阶段一：单门副炮击毁时对核心造成的血量比例剥离伤害（如 0.06 = 6% 核心血） */
  partBonusRatio: number
  /** 阶段一：核心伤害倍率基础值（0 门副炮被击毁时） */
  coreDamageBase: number
  /** 阶段一：每击毁一门副炮，核心伤害倍率的增量 */
  coreDamagePerPart: number
  /** 阶段二：击毁一个部位对另外两个部位造成的血量比例伤害（如 0.2 = 20% 单部位血） */
  phase2PartChipRatio: number
}

/**
 * 敌人单位定义（数据驱动，图鉴与关卡配置引用）
 * 描述一个敌人类型的全部属性，关卡配置通过 key 引用
 */
export interface EnemyConfig {
  /** 敌人编号（如 TST-01） */
  key: EnemyKey
  /** 敌人名 */
  name: string
  /** 英文代号 */
  en: string
  /** 分类（普通敌人 / Boss） */
  category: EnemyCategory
  /** 描述（图鉴展示） */
  desc: string
  /** 图标形状（渲染层根据形状绘制） */
  icon: EnemyIconType
  /** 图标颜色 */
  iconColor: string
  /** 血量 */
  hp: number
  /** 护盾 */
  shield: number
  /** 移动速度（逻辑像素/帧） */
  speed: number
  /** 携带的敌人武器编号（引用 weapons/enemyWeapons.ts） */
  weapon: EnemyWeaponKey
  /**
   * Boss 武器轮播（仅 Boss 使用）：按顺序循环切换武器，每把持续 duration 帧。
   * 配置后优先于 weapon 字段——单形态 Boss 通过轮换武器改变弹幕形态
   */
  weapons?: BossWeaponSlot[]
  /** 浮游炮分段增援（仅 Boss 使用）：随血量下降增派激光子机（如 3 → 5 → 8） */
  bitEscalation?: EnemyLaserBitEscalation
  /**
   * 巨构 Boss 配置（仅最终 Boss 使用）：部位破坏 + 多阶段符卡 + 编队召唤，
   * 配置后 Boss 由 engine/finalBoss.ts 的专属脚本驱动
   */
  leviathan?: LeviathanConfig
  /**
   * 纵向活动下界（设计空间 y，仅 Boss 使用）：各机动模式的纵向范围被压缩到该线以上，
   * Boss 不会压到屏幕中下部（如 260 ≈ 上 40% 空域）
   */
  maxY?: number
  /** 出场后多少帧开始射击 */
  fireDelay: number
  /** 无敌：受击只闪白不掉血（训练靶等场景用） */
  invincible?: boolean
  /** 无碰撞伤害：自机撞上去不会受伤（训练靶等场景用） */
  noContactDamage?: boolean
  /** Boss 专属 BGM（bgm.json 中的 id，可选）：登场时切换，击破后恢复战斗曲 */
  bgm?: string
  /** 应对技巧（图鉴展示） */
  tips: string[]
}

/** 敌机移动路径类型 */
export type EnemyPathType =
  | 'straight' // 直线下落
  | 'sine' // 正弦摆动下落
  | 'dive-left' // 左斜冲
  | 'dive-right' // 右斜冲
  | 'hover' // 下落至上方悬停一段时间后离开
  | 'zigzag' // 锯齿下落：每 45 帧急转一次横向方向
  | 'loop' // 回旋：边缓慢下落边绕圈
  | 'rush' // 加速俯冲：缓慢入场后持续加速下坠
  | 'sweep-left' // 左横扫：下落后转向左横穿战场
  | 'sweep-right' // 右横扫：下落后转向右横穿战场
  | 'static' // 原地静止：不移动、不离场（训练靶等）

/**
 * 追踪环绕行为配置（Circle Strafing / 轨道机动）
 * 配置后敌机更有侵略性：先按 path 入场，engageAfter 帧后切换为追踪自机，
 * 直线逼近到 radius 距离后保持该半径环绕扫射；
 * 不再离场、不会飞出屏幕，只能被击毁
 */
export interface OrbitConfig {
  /** 与自机保持的环绕半径（设计空间像素，随屏幕纵向比例缩放） */
  radius: number
  /** 环绕角速度（度/帧），默认取 balance.enemyAi.orbitAngularSpeed */
  angularSpeed?: number
  /** 环绕方向：1 顺时针 / -1 逆时针，默认按出生侧自动选择 */
  direction?: 1 | -1
  /** 追踪/环绕速度倍率（相对自身 speed），默认取 balance.enemyAi.pursueSpeed */
  speedMul?: number
  /** 出场多少帧后开始追踪，默认取 balance.enemyAi.engageAfter */
  engageAfter?: number
  /**
   * 环绕初始相位偏移（弧度）：进入环绕时叠加到轨道角上，
   * 多架同轨敌机按 i/N×2π 错开身位，形成围绕自机的均匀包围圈
   */
  phaseOffset?: number
  /**
   * 封锁占位模式：不追踪自机——每架按 phaseOffset 换算的站位序号
   * 散开到战场下缘边界的巡游点上（缓慢游移 + 跟随自机所在高度微调），
   * 用无限射程火力从远处封锁自机移动路线；适合激光类远程无人机
   */
  blockade?: boolean
}

/** 敌机行为类型（行为分析图鉴用，可叠加组合） */
export type BehaviorType = 'flock' | 'evade' | 'guard' | 'ambush'

/** 鸟群行为：同群敌机之间施加分离 + 对齐 + 凝聚三力 */
export interface FlockConfig {
  type: 'flock'
  /** 群体 ID，同 id 视为同一鸟群（不配则按 spawn 序号自动分配） */
  groupId?: string
}

/** 弹幕回避：感知自机弹幕并主动避开危险方向 */
export interface EvadeConfig {
  type: 'evade'
  /** 感知半径（逻辑像素），默认取 balance 中的值 */
  radius?: number
  /** 回避力度倍率（相对自身速度），默认取 balance */
  strength?: number
}

/** 护卫行为：围绕指定敌人保持距离旋转保护 */
export interface GuardConfig {
  type: 'guard'
  /** 护卫半径（逻辑像素），默认取 balance */
  radius?: number
  /** 护卫角速度（度/帧），默认取 balance */
  angularSpeed?: number
}

/** 伏击行为：入场后在屏幕边缘待机，自机进入触发范围后高速突袭 */
export interface AmbushConfig {
  type: 'ambush'
  /** 触发距离（逻辑像素），默认取 balance */
  triggerDist?: number
  /** 突袭速度倍率（相对自身 speed），默认取 balance */
  dashSpeedMul?: number
}

export type BehaviorConfig = FlockConfig | EvadeConfig | GuardConfig | AmbushConfig

/** 敌机编队生成配置（数据属性来自 EnemyConfig，这里只配出场/移动） */
export interface EnemySpawnConfig {
  /** 敌人编号，引用 config/enemies.ts 中的 EnemyKey */
  enemyKey: EnemyKey
  /** 移动路径 */
  path: EnemyPathType
  /** 初始 x 坐标（逻辑坐标 0~480） */
  x: number
  /** 初始 y 坐标（通常为负值，屏幕上方外入场） */
  y: number
  /** 编队数量（同配置连续生成 count 架） */
  count: number
  /** 编队内每架之间的出场间隔（帧） */
  gap: number
  /**
   * 追踪环绕行为（不配置则按 path 飞完离场）
   * 配置后敌机会追踪自机并保持 radius 距离环绕，永不离场
   */
  orbit?: OrbitConfig
  /** 附加行为列表（可叠加多个，如 flock + evade） */
  behaviors?: BehaviorConfig[]
  /** 血量覆盖（不配则使用敌人定义中的 hp）。用于训练室生成自定义 HP 假人等场景 */
  hp?: number
  /** 无敌覆盖（true=无敌不扣血，false=可被击毁，不配则沿用敌人定义） */
  invincible?: boolean
}

/** 道中波次配置：第 at 帧触发，spawns 内所有编队同时开始生成 */
export interface WaveConfig {
  at: number
  spawns: EnemySpawnConfig[]
}

/** Boss 配置 */
export interface BossConfig {
  /** Boss 敌人编号，引用 config/enemies.ts */
  enemyKey: EnemyKey
}

/**
 * Boss 移动模式（由武器槽携带，切换武器时同步切换机动）：
 * - drift：缓慢左右横移（默认）
 * - lissajous：李萨如巡航，横向大幅横扫 + 纵向翻飞，弹幕源全场漂移
 * - hunt：猎杀追击，持续逼近自机（纵向钳制在上方空域，近身减速）
 * - swoop：俯冲压迫，纵向大幅起落，周期性压向自机所在空域
 */
export type BossMovementKey = 'drift' | 'lissajous' | 'hunt' | 'swoop'

/** Boss 武器轮播槽：一件武器 + 持续帧数（见 EnemyConfig.weapons / engine/boss.ts） */
export interface BossWeaponSlot {
  /** 敌人武器编号，引用 weapons/enemyWeapons.ts */
  key: EnemyWeaponKey
  /** 持续帧数（60 帧 = 1 秒），到点自动切换下一把 */
  duration: number
  /** 该武器激活期间的移动模式（不配则保持当前模式） */
  movement?: BossMovementKey
}

/* ==================== 关卡定义 ==================== */

/** 关卡节点种类（决定地图上图标样式） */
export type StageNodeKind = 'tutorial' | 'main' | 'sub' | 'boss'

/** 关卡节点在地图上的坐标 */
export interface StagePos {
  x: number
  y: number
  /** 连接自哪个关卡 id（不配则自动连前一关） */
  from?: string
}

/** 背景类型（不配则使用默认深空背景） */
export type BgType = 'space' | 'lab'

/** 关卡背景配置（不配则使用默认深空背景） */
export interface StageBg {
  /** 渐变颜色 [上, 中, 下]（bgType = 'space' 时有效） */
  gradient?: [string, string, string]
  /** 背景图路径（相对于站点根 public/） */
  image?: string
  /** 背景类型：space = 深空星空，lab = 实验室/训练室 */
  bgType?: BgType
}

/**
 * 关卡完整定义（地图展示 + 战斗配置 + 背景）
 * 新增地图只需在 STAGE_REGISTRY 加一条记录
 */
export interface StageDef {
  id: string
  kind: StageNodeKind
  name: string
  desc: string
  pos: StagePos
  waves: WaveConfig[]
  boss: BossConfig | null
  bg?: StageBg
}

/** 章节定义：将关卡按剧情分组 */
export interface StageChapter {
  id: string
  name: string
  nameEn: string
  stageIds: string[]
}

/** Boss 信息（HUD 用） */
export interface HudBossInfo {
  name: string
  hp: number
  maxHp: number
  /** 血条分段刻度（maxHp 比例 0~1，升序；如浮游炮增援节点 [1/3, 2/3]），无分段为 undefined */
  segments?: number[]
}

/** 巨构 Boss 部位信息（HUD 右上角独立血条用，含已击毁部位） */
export interface HudBossPart {
  /** 部位 id（如 gun-l） */
  id: string
  /** 部位名（如 左翼副炮） */
  name: string
  hp: number
  maxHp: number
  /** 是否存活（false = 已击毁，血条显示为报废） */
  alive: boolean
}

/** DPS 统计信息（训练室 HUD 用） */
export interface HudDpsInfo {
  /** 当前 DPS（近 2 秒滚动窗口均值） */
  current: number
  /** 峰值 DPS */
  peak: number
  /** 累计伤害 */
  total: number
  /** 战斗计时（秒，自首次造成伤害起算） */
  time: number
  /**
   * 面板锚点（CSS 像素，木桩右缘位置）；null 时面板回退到屏幕右上角。
   * 逻辑坐标 = 画布 CSS 像素，可直接用于 DOM 定位
   */
  anchor: { x: number; y: number } | null
}

/**
 * 角色战斗属性（HP 制，无残机、无 BOMB，死了直接游戏结束）
 * hp / shield 为每个角色必填；其余字段可选，缺省时回退 balance.player 默认值，
 * 方便后续添加新角色时只写差异化属性
 */
export interface CharacterStats {
  /** 血量上限 */
  hp: number
  /** 护盾上限（承伤时优先于血量扣除） */
  shield: number
  /** 高速移动速度（逻辑像素/帧） */
  fastSpeed?: number
  /** 低速模式移动速度 */
  slowSpeed?: number
  /** 冲刺速度倍率（相对基础速度） */
  sprintSpeedMul?: number
  /** 受击无敌时间（帧） */
  hitInvincible?: number
}

/** 补齐可选字段后的完整角色属性（引擎运行时使用的形态） */
export type ResolvedCharacterStats = Required<CharacterStats>

/** 引擎每帧推送给 Vue 层的 HUD 状态（引擎不依赖 Vue，通过回调通信） */
export interface HudState {
  scene: SceneState
  /** 当前血量 / 上限 */
  hp: number
  maxHp: number
  /** 当前护盾 / 上限 */
  shield: number
  maxShield: number
  /** 闪现体力格数（0~dashMax） */
  dash: number
  /** 闪现体力上限（义体可扩充） */
  dashMax: number
  /** 当前格闪现体力回复进度 0~1（连续充能条用，满格时为 0） */
  dashProgress: number
  /** 技能是否正在激活中（开启状态） */
  skillActive: boolean
  /** 技能能量比例（0~1，1 = 满能量；开启时消耗，仅关闭时回复；充能制技能表示是否有可用充能） */
  skillReady: number
  /** 技能当前充能层数（充能制技能如电磁脉冲，其余为 0） */
  skillCharges: number
  /** 技能充能上限（0 表示非充能制技能） */
  skillMaxCharges: number
  /** 下一层充能回复进度 0~1（满层时为 1，环形冷却用） */
  skillChargeProgress: number
  /** 免死守护状态（未装备该义体为 null）：ready = 冷却就绪，progress = 冷却回复进度 0~1，active = 触发后无敌中 */
  deathGuard: { ready: boolean; progress: number; active: boolean } | null
  fps: number
  /** 场上存活 Boss 列表（HUD 血条用，最多 3 个；普通关卡只会有一个） */
  bosses: HudBossInfo[]
  /** 巨构 Boss 部位列表（右上角独立血条用；无巨构 Boss 时为 null） */
  bossParts: HudBossPart[] | null
  /** DPS 统计（仅训练室等非 null） */
  dps: HudDpsInfo | null
  /** 当前展示的横幅文字（符卡名 / Boss 登场），null 表示不显示 */
  banner: string | null
  /** 横幅序号，每次新横幅递增（用于重新触发 CSS 动画） */
  bannerId: number
  /** 命中反馈序号，自机弹命中敌人时递增（用于准星重放命中动画） */
  hitId: number
  /** 击杀反馈序号，击毁敌机 / 击破 Boss 时递增（用于准星重放击杀动画） */
  killId: number
  /** 弹匣状态（仅弹匣式武器有值，其余为 null） */
  ammo: { current: number; max: number; reloading: boolean } | null
  /** 当前使用的武器槽（0/1，供 Vue 层联动准星样式） */
  weaponSlot: number
  /** 右键瞄准中（仅弹匣式武器，供准星收束反馈） */
  aiming: boolean
  /** 蓄力进度 0~1（蓄力武器专用，其余为 0；准星进度环用） */
  charge: number
  /** 最小发射阈值比例 0~1（蓄力武器专用，其余为 0；准星阈值刻度用） */
  chargeMin: number
  /** 热量状态（仅过热武器有值，其余为 null；准星热量环用） */
  heat: { current: number; max: number; overheated: boolean } | null
}

/** 引擎对外回调 */
export interface GameCallbacks {
  onHud: (hud: HudState) => void
}

/* ==================== 背包 / 物品 ==================== */

/** 物品分类（背包页签筛选用） */
export type ItemCategory =
  | 'weapon' // 武器
  | 'implant' // 义体
  | 'material' // 材料
  | 'skill' // 技能

/** 物品稀有度：白 / 绿 / 蓝 / 紫 / 金 / 红（红附带棱彩全息特效） */
export type ItemRarity =
  | 'common' // 量产（白）
  | 'uncommon' // 高等（绿）
  | 'rare' // 军用（蓝）
  | 'epic' // 试作（紫）
  | 'legendary' // 遗构（金）
  | 'mythic' // 神骸（红）

/** 义体装配部位：头部 / 躯干 / 腿部（义体只能装入对应部位的义体槽） */
export type ImplantPart = 'head' | 'body' | 'legs'

/**
 * 义体装备效果（仅义体类物品，装配后叠加到角色战斗属性上）
 * 所有字段可选，未配置表示无该修正
 */
export interface ImplantEffect {
  /** 技能回复速度增量（0.25 = +25%） */
  skillRegenAdd?: number
  /** 生命值上限增量 */
  hpAdd?: number
  /** 生命值上限百分比加成（0.2 = +20%，基于角色基础生命，加算） */
  hpPctAdd?: number
  /** 护盾上限百分比加成（0.2 = +20%，基于角色基础护盾，加算） */
  shieldPctAdd?: number
  /** 护盾上限增量 */
  shieldAdd?: number
  /** 护盾恢复速度增量（点/秒，加算在基础回复速率上） */
  shieldRegenAdd?: number
  /** 护盾熔断时长倍率（0.5 = 熔断时间 -50%，护盾被打空后的锁定时长，乘法独立乘区） */
  shieldBreakMul?: number
  /** 移动速度倍率增量（0.1 = +10%，-0.05 = -5%） */
  moveSpeedAdd?: number
  /** 受到伤害倍率（0.75 = 只受 75% 伤害，乘法独立乘区） */
  damageTakenMul?: number
  /** 闪避率（0.1 = 10% 概率完全不受伤害，加算，默认 0） */
  dodgeChance?: number
  /** 造成伤害增量（0.02 = +2%，作用于自机全部武器伤害） */
  attackAdd?: number
  /** 免死守护：受到致命伤害时保留 1 点生命并获得无敌，触发后进入冷却（单位：秒）；name 为触发效果名（展示用）；attackAdd 为无敌窗口内的伤害加成（0.5 = +50%） */
  deathGuard?: { name: string; cooldownSec: number; invincibleSec: number; attackAdd?: number }
  /** 额外折跃（闪现体力）充能数 */
  dashChargesAdd?: number
  /** 折跃无敌时长增量（秒，加算在基础无敌帧上） */
  dashInvincibleAdd?: number
  /** 折跃距离增量（0.25 = +25%，加算，乘在基础折跃距离上） */
  dashDistanceAdd?: number
  /** 自动索敌：开火时自动瞄准离鼠标最近的敌人（取代鼠标点）；值为以鼠标为中心的索敌半径（逻辑像素，Infinity = 全图），多件并存时取最大 */
  autoAimRange?: number
  /** 弹丸跟踪：贴近敌人（100 逻辑像素内）的自机弹丸锁定追踪最近敌人直至命中（冲过头会掉头飞回），值为锁定期间每帧最大转向角（弧度，60fps 基准，多件并存时取最大）；仅作用于弹丸类武器，激光 / 电弧等射线武器不受影响 */
  bulletHoming?: number
  /** 义体承受度上限增量（装配后提高 IMPLANT_LOAD_CAP，不影响战斗属性，仅扩大可装配义体的承受度总额） */
  implantCapacityAdd?: number
}

/**
 * 物品静态定义（数据表，注册见 config/items.ts）
 * 只描述"这个物品是什么"，不含数量
 */
export interface ItemDef {
  /** 物品 id（注册表主键，背包实例通过它引用） */
  id: string
  /** 显示名 */
  name: string
  /** 分类 */
  category: ItemCategory
  /** 稀有度 */
  rarity: ItemRarity
  /** 描述（详情 / 悬浮提示用） */
  desc?: string
  /** 图标（缺省时背包格子显示名字首字） */
  icon?: string
  /** 图标放大比例，默认 1（背包内按占格 62% 显示，可手动调大调小） */
  iconScale?: number
  /** 子类别标签（如"动能武器"），背包物品块右上角显示 */
  kind?: string
  /** 单格堆叠上限，默认 99；不可堆叠（如武器）设为 1 */
  stackLimit?: number
  /** 占格尺寸（宽 × 高，矩形），默认 1×1 */
  size?: { w: number; h: number }
  /** 关联的自机武器编号（仅武器类物品，引用 weapons/playerWeapons.ts） */
  weaponKey?: WeaponKey
  /** 关联的玩家技能编号（仅技能类物品，引用 engine/game.ts 中的 SkillKey） */
  skillKey?: SkillKey
  /** 义体装配部位（仅可装备的义体）：只能装入对应部位的义体槽；缺省表示该义体是素材不可装配 */
  implantPart?: ImplantPart
  /** 义体族标识（仅可装备的义体）：同族义体（如同名不同品质的变体）全局限装配一件；缺省时以物品名称作为族名 */
  implantFamily?: string
  /** 义体承受值（仅可装备的义体）：每件独立配置的神经负荷，装配占用承受度；缺省为 0 */
  implantLoad?: number
  /** 义体效果（仅可装备的义体，装配后生效） */
  implantEffect?: ImplantEffect
}

/** 背包物品实例：物品 id + 数量，以左上角锚点存放在槽位数组中 */
export interface InvItem {
  /** 引用 config/items.ts 中的 ItemDef.id */
  itemId: string
  /** 数量 */
  count: number
  /** 是否旋转 90°（占格宽高互换），缺省为 false */
  rotated?: boolean
}
