/**
 * 数值平衡配置
 * 调整自机默认属性（各角色可按需覆盖，见 config/loadout.ts）、
 * 敌人默认数值、对象池容量、调试开关等全部在这里
 * 所有速度单位：逻辑像素/帧（逻辑固定 60 帧/秒）
 */

export const BALANCE = {
  /**
   * 设计分辨率（config 坐标系的基准）
   * 实际战场会铺满窗口并随窗口大小扩展，config 中的坐标
   * 以屏幕中心为基准等比映射到实际战场（见 engine/field.ts 的 mapX/mapY），
   * 宽屏下敌人始终集中在中间区域
   */
  logicWidth: 480,
  logicHeight: 640,

  /**
   * 自机默认属性：新角色未覆盖对应字段时回退到这里
   * （角色差异化属性见 config/loadout.ts 的 CharacterOption.stats）
   */
  player: {
    /** 默认血量上限 */
    maxHp: 100,
    /** 默认护盾上限（承伤时优先于血量扣除，溢出伤害不扣血） */
    maxShield: 0,
    /** 护盾回复速度（点/秒），未熔断时持续回复至上限 */
    shieldRegenPerSec: 2,
    /** 护盾回复延迟（帧）：护盾承伤后暂停回复的时间，120 = 2 秒；
     *  让回复成为「脱战喘息」收益，防止回复流在持续交火中几乎不掉血 */
    shieldRegenDelayFrames: 120,
    /** 护盾熔断时间（帧）：护盾被打空后进入熔断，期间锁定为 0，结束后恢复到 1，480 = 8 秒 */
    shieldBreakFrames: 480,
    /** 高速移动速度 */
    fastSpeed: 4.6,
    /** 低速（按住 Z）移动速度 */
    slowSpeed: 2.0,
    /** 判定点半径（像素小判定） */
    hitboxRadius: 3,
    /** 外观半径（仅用于绘制与体术碰撞参考） */
    bodyRadius: 12,
    /** 受击无敌时间（帧），60 = 1 秒 */
    hitInvincible: 60,
    /** 出生点 */
    spawnX: 240,
    spawnY: 560,
    /** 可活动范围边距（防止贴边） */
    moveMargin: 12,
    /** 闪现距离（逻辑像素） */
    dashDistance: 160,
    /** 闪现体力上限（格） */
    dashMaxCharges: 3,
    /** 闪现体力回复速度（帧/格），180 = 3 秒回复 1 格 */
    dashRecover: 180,
    /** 闪现后无敌时间（帧），10 ≈ 0.17 秒，只覆盖落点贴脸弹，防止靠无敌逃课 */
    dashInvincible: 10,
    /** 冲刺速度倍率（相对基础速度，冲刺时按住 Shift 加速） */
    sprintSpeedMul: 1.7
  },

  /** 敌弹默认判定半径 */
  enemyBulletRadius: 4,
  /** 敌弹默认伤害（各武器未配置 damage 时的回退值） */
  enemyBulletDamage: 50,
  /** 敌机体术碰撞默认伤害 */
  enemyContactDamage: 50,
  /** 敌机外观/体术判定半径 */
  enemyRadius: 13,
  /** Boss 判定半径 */
  bossRadius: 26,

  /** 技能配置（突触超频）：能量条机制，随时开关，仅关闭时回能 */
  skill: {
    // ---- 手感可调参数 ----
    /** 关闭时每帧回复的能量（核心参数：决定技能轮转节奏；0.4 → 15 秒回满） */
    regenRate: 0.4,
    // ---- 结构参数 ----
    /** 能量上限（帧）：满能量可持续开启的时长，360 = 6 秒 */
    maxEnergy: 240,
    /** 最低开启能量（帧）：低于该值无法开启（关闭不受限），防止能量见底后反复点按蹭时缓 */
    minActivateEnergy: 108, // 30% 能量，约 1.8 秒续航
    /** 开启时每帧消耗的能量 */
    drainRate: 1,
    /** 全局时间缩放（敌人/敌弹速度乘以此值，越小越慢） */
    timeScale: 0.12,
    /** 激活期间 BGM 播放速率（降调慢放）：不用 timeScale 同款 0.12，避免糊成低鸣 */
    bgmRate: 0.4
  },

  /** 电磁脉冲（EMP）配置：瞬时释放的全向冲击波，充能制（有充能即可释放） */
  emp: {
    // ---- 手感可调参数 ----
    /** 每层充能回复时长（帧）：600 = 10 秒回一层（配诺恩 +50% 回复也需 6.7 秒） */
    chargeRegen: 900,
    /** 干扰时长（帧）：敌方不能移动与开火，150 = 2.5 秒 */
    stunDuration: 60,
    // ---- 结构参数 ----
    /** 充能上限（层）：可连续释放的最大次数 */
    maxCharges: 2
  },

  /** 双子星卫（Castor & Pollux）：召唤四颗环绕自机的金色卫星，持续时间内撞毁触碰到的敌弹 */
  gemini: {
    // ---- 手感可调参数 ----
    /** 持续时间（帧）：900 = 15 秒（激活期间每帧耗 1 点能量，耗尽自动结束） */
    duration: 900,
    /** 结束后的能量回复速率（能量/帧）：0.75 → 约 20 秒回满，回满才能再次释放 */
    regenRate: 0.75,
    /** 环绕角速度（度/帧）：3.2 → 持续期内约绕行 8 圈 */
    angularSpeed: 10,
    // ---- 结构参数 ----
    /** 卫星数量（沿轨道均匀分布） */
    orbCount: 4,
    /** 环绕半径（逻辑像素，自机中心到卫星中心） */
    orbitRadius: 60,
    /** 卫星判定 / 外观半径（逻辑像素） */
    orbRadius: 26
  },

  /**
   * 追踪型敌机 AI 默认值（配置了 orbit 的敌机生效）
   * 可在每个编队的 orbit 字段中单独覆盖
   */
  enemyAi: {
    /** 出场多少帧后开始追踪自机（先按 path 入场） */
    engageAfter: 90,
    /** 追踪/环绕时的速度倍率（相对编队 speed），越大越凶 */
    pursueSpeed: 2.0,
    /** 环绕角速度（度/帧），决定绕圈快慢 */
    orbitAngularSpeed: 1.4,
    /**
     * 追踪响应系数（0~1）：敌机感知到的自机位置每帧向真实位置
     * 逼近的比例。越小反应越迟钝（自机猛冲时敌机来不及同步躲），
     * 1 = 无延迟完全同步。每架敌机在此基础上有 ±25% 个体差异
     */
    trackResponse: 0.045,
    /**
     * 敌机间分离（boids separation）：进入追踪阶段的敌机相互推开，
     * 避免被自机走位引导全部聚集到同一个点
     */
    separation: {
      /** 分离半径 = enemyRadius × 此倍数（略大于直径，允许轻微重叠） */
      radiusMul: 2.2,
      /** 单帧最大分离位移（像素），推力随重叠深度线性增强 */
      maxPush: 0.9
    },
    /** 鸟群对齐参数（仅 flock 行为生效）：同群敌机向平均速度方向靠拢 */
    alignment: {
      radius: 120,
      strength: 0.03
    },
    /** 鸟群凝聚参数（仅 flock 行为生效）：敌机被拉向同群几何中心 */
    cohesion: {
      radius: 150,
      maxForce: 0.35
    },
    /** 弹幕回避默认参数（仅 evade 行为生效） */
    evade: {
      radius: 80,
      strength: 0.7
    },
    /** 护卫行为默认参数（仅 guard 行为生效） */
    guard: {
      radius: 55,
      angularSpeed: 1.6
    },
    /** 伏击行为默认参数（仅 ambush 行为生效） */
    ambush: {
      triggerDist: 160,
      dashSpeedMul: 3.5
    }
  },

  /** 对象池容量（同屏上限，超出后新子弹丢弃） */
  pools: {
    enemyBullets: 1200,
    playerBullets: 128,
    particles: 600
  },

  debug: {
    /** 是否显示 FPS 调试信息 */
    showFps: true,
    /**
     * 渲染插值：高刷屏（>60Hz）下在逻辑帧之间平滑过渡，
     * 画面接近原生刷新率的顺滑度；关闭则按 60Hz 逻辑帧硬切
     */
    interpolation: true
  },

  /**
   * 默认键位（KeyboardEvent.code；鼠标键用 MouseEvent.button 值 + 'Mouse' 前缀）
   * 用户可在标题界面「键位设置」中修改，修改结果持久化到 localStorage
   */
  defaultKeys: {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    slow: 'KeyZ',
    dash: 'Space',
    sprint: 'ShiftLeft',
    skill: 'KeyQ',
    pause: 'Escape',
    fire: 'Mouse0',
    aim: 'Mouse2'
  },

  /** localStorage key */
  storageKeys: {
    keybinds: 'stg-keybinds',
    /** 渲染帧率上限（0 = 不限制，跟随屏幕刷新率） */
    frameLimit: 'stg-framelimit',
    /** 背包槽位数据（含水晶货币） */
    inventory: 'stg-inventory',
    /** 角色装备槽数据（武器栏等） */
    equipment: 'stg-equipment',
    /** 首次进入标记（用于新手引导弹窗与水晶发放） */
    firstVisit: 'stg-first-visit'
  }
} as const
