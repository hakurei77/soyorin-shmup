/**
 * 敌人武器库（数据驱动）
 * 每把武器一个定义，道中敌机（stages.ts）通过 weapon: '编号' 引用。
 * 发射行为由 engine/bullet.ts 的 EnemyWeaponEmitter 统一解释，
 * 新增武器：在 ENEMY_WEAPONS 里加一条定义即可，无需改引擎代码。
 *
 * 系列（EnemyWeaponSeries）：子弹（样式 + 颜色）由系列决定，
 * 同一系列的所有武器共用同一种子弹；换系列 = 换子弹。
 *
 * 图鉴（guideData.ts）与预览（useGuidePreview.ts）同样从这里读取，
 * 保证展示参数与局内实际行为一致。
 */
import type {
  BulletStyleKey,
  EnemyLaserAttackConfig,
  EnemyWeaponKey
} from '../types'

/** 敌人武器系列：同系列武器共用相同子弹 */
export interface EnemyWeaponSeries {
  /** 系列编号（如 SER-T） */
  key: string
  /** 系列名 */
  name: string
  /** 英文代号 */
  en: string
  /** 系列共用子弹样式（渲染层根据 key 决定颜色与形状） */
  bulletStyle: BulletStyleKey
  /** 系列共用演示弹色（图鉴预览用，与 renderer 的配色一致） */
  bulletColor: string
}

/** SER-T 测试平台：入门验证系列，统一的青蓝色针弹 */
export const SERIES_TESTBED: EnemyWeaponSeries = {
  key: 'SER-T',
  name: '测试平台',
  en: 'TESTBED',
  bulletStyle: 'needle-cyan',
  bulletColor: '#33ddff'
}

/** SER-RB 掠夺者·礼花：环形弹幕系列，统一的紫色 orb 弹 */
export const SERIES_REAVER_BLOOM: EnemyWeaponSeries = {
  key: 'SER-RB',
  name: '掠夺者·礼花',
  en: 'REAVER BLOOM',
  bulletStyle: 'orb-purple',
  bulletColor: '#cc66ff'
}

/** SER-RS 掠夺者·鎏金：螺旋弹幕系列，统一的金色针弹 */
export const SERIES_REAVER_GILT: EnemyWeaponSeries = {
  key: 'SER-RS',
  name: '掠夺者·鎏金',
  en: 'REAVER GILT',
  bulletStyle: 'needle-gold',
  bulletColor: '#ffc233'
}

/** SER-RV 掠夺者·涡流：双螺旋弹幕系列，统一的粉色星弹 */
export const SERIES_REAVER_VORTEX: EnemyWeaponSeries = {
  key: 'SER-RV',
  name: '掠夺者·涡流',
  en: 'REAVER VORTEX',
  bulletStyle: 'star-pink',
  bulletColor: '#ff66cc'
}

/** SER-RF 掠夺者·赤锋：狙杀齐射系列，统一的红色针弹 */
export const SERIES_REAVER_FANG: EnemyWeaponSeries = {
  key: 'SER-RF',
  name: '掠夺者·赤锋',
  en: 'REAVER FANG',
  bulletStyle: 'needle-red',
  bulletColor: '#ff3344'
}

/** SER-RC 掠夺者·苍雷：苍蓝雷光系列，统一的蓝色 orb 弹 */
export const SERIES_REAVER_THUNDER: EnemyWeaponSeries = {
  key: 'SER-RC',
  name: '掠夺者·苍雷',
  en: 'REAVER THUNDER',
  bulletStyle: 'orb-blue',
  bulletColor: '#4488ff'
}

/** SER-RG 掠夺者·翠毒：腐蚀毒雾系列，统一的绿色 orb 弹 */
export const SERIES_REAVER_VENOM: EnemyWeaponSeries = {
  key: 'SER-RG',
  name: '掠夺者·翠毒',
  en: 'REAVER VENOM',
  bulletStyle: 'orb-green',
  bulletColor: '#66ff99'
}

/** SER-RO 掠夺者·焚天：燃烧轰炸系列，统一的橙色 orb 弹 */
export const SERIES_REAVER_PYRE: EnemyWeaponSeries = {
  key: 'SER-RO',
  name: '掠夺者·焚天',
  en: 'REAVER PYRE',
  bulletStyle: 'orb-orange',
  bulletColor: '#ff9a2e'
}

/** SER-RR 掠夺者·血月：猩红处刑系列，统一的红色 orb 弹 */
export const SERIES_REAVER_BLOOD: EnemyWeaponSeries = {
  key: 'SER-RR',
  name: '掠夺者·血月',
  en: 'REAVER BLOOD',
  bulletStyle: 'orb-red',
  bulletColor: '#ff4455'
}

/** SER-RN 掠夺者·青针：青色针雨系列，统一的青色针弹 */
export const SERIES_REAVER_NEEDLE: EnemyWeaponSeries = {
  key: 'SER-RN',
  name: '掠夺者·青针',
  en: 'REAVER NEEDLE',
  bulletStyle: 'needle-cyan',
  bulletColor: '#33ddff'
}

/** SER-RY 掠夺者·金穗：金黄稻弹系列，统一的黄色米弹 */
export const SERIES_REAVER_GRAIN: EnemyWeaponSeries = {
  key: 'SER-RY',
  name: '掠夺者·金穗',
  en: 'REAVER GRAIN',
  bulletStyle: 'rice-yellow',
  bulletColor: '#ffcc33'
}

/** SER-L 棱镜光枢：镭射光束系列，统一的冰青色光束（棱镜星卫专属） */
export const SERIES_LASER: EnemyWeaponSeries = {
  key: 'SER-L',
  name: '棱镜光枢',
  en: 'PRISM LIGHT',
  bulletStyle: 'needle-cyan',
  bulletColor: '#7de8ff'
}

/** 武器系列注册表：系列编号 → 系列定义 */
export const ENEMY_WEAPON_SERIES: Record<string, EnemyWeaponSeries> = {
  'SER-T': SERIES_TESTBED,
  'SER-RB': SERIES_REAVER_BLOOM,
  'SER-RS': SERIES_REAVER_GILT,
  'SER-RV': SERIES_REAVER_VORTEX,
  'SER-RF': SERIES_REAVER_FANG,
  'SER-RC': SERIES_REAVER_THUNDER,
  'SER-RG': SERIES_REAVER_VENOM,
  'SER-RO': SERIES_REAVER_PYRE,
  'SER-RR': SERIES_REAVER_BLOOD,
  'SER-RN': SERIES_REAVER_NEEDLE,
  'SER-RY': SERIES_REAVER_GRAIN,
  'SER-L': SERIES_LASER
}

/** 敌人武器定义 */
export interface EnemyWeaponConfig {
  /** 武器编号（如 E-WPN-01），stages.ts 通过它引用 */
  key: EnemyWeaponKey
  /** 武器名 */
  name: string
  /** 英文代号 */
  en: string
  /** 武器描述（图鉴展示） */
  desc: string
  /** 所属系列（同系列武器共用相同子弹） */
  series: EnemyWeaponSeries
  /** 子弹速度（逻辑像素/帧，60 帧基准） */
  bulletSpeed: number
  /** 单发伤害 */
  damage: number
  /** 发射间隔（帧），如 75 表示每 1.25 秒发射一次 */
  fireInterval: number
  /** 一次发射的弹丸数量（默认 1） */
  bulletCount?: number
  /** 扇形总张角（度），仅 aimed 且 bulletCount > 1 时有效，默认 8°×(n-1) */
  spreadAngle?: number
  /**
   * 弹幕模式：
   * - aimed（默认）：以发射瞬间朝自机的方向为中心的扇形直射
   * - radial：360° 均布 bulletCount 颗弹丸的全屏环形弹幕，配合 spinSpeed / mirrorSpin 衍生旋转环与螺旋
   */
  pattern?: 'aimed' | 'radial'
  /** 每轮射击后基础角增量（度）：0 = 固定环，非 0 = 旋转环 / 螺旋（aimed 下表现为扇面偏转） */
  spinSpeed?: number
  /** 【radial】双螺旋：后半组弹丸反向旋转并错开半个身位（bulletCount 需为偶数） */
  mirrorSpin?: boolean
  /** 奇数序号弹丸的速度增量（正负皆可）：制造快慢双层弹幕，两种模式均可叠加 */
  speedStep?: number
  /** 基础角摆动上限（度）：设置后基础角在 ±值之间往返（aimed 下表现为来回扫摆的扇面） */
  spinBounce?: number
  /** 连发轮数：打满后停火 burstCooldown 帧（节奏喘息，给玩家输出窗口） */
  burstCount?: number
  /** 连发后的停火帧数（需配合 burstCount，默认 60） */
  burstCooldown?: number
  /**
   * 节拍网格发射间隔（单位：拍，可选）：配置后且 BGM 提供节拍时钟时，
   * 每轮齐射锁定在音乐拍网格上（取代 fireInterval 帧计时），弹幕随鼓点律动；
   * 时缓（timeScale < 1）或无节拍时钟时自动回退 fireInterval
   */
  beatInterval?: number
  /**
   * 激光攻击配置：配置后本武器走光束逻辑（预警 → 照射 → 熄灭 → 休息），
   * 不再发射弹丸；子弹相关字段（bulletSpeed 等）仅作为图鉴回退值
   */
  laser?: EnemyLaserAttackConfig
  /** 子弹样式（取自所属系列） */
  bulletStyle: BulletStyleKey
  /** 演示弹色（取自所属系列） */
  bulletColor: string
  /** 静音开火：不播放齐射音效（编队无人机等高频小口径武器用，避免群射噪音） */
  silent?: boolean
  /** 应对技巧（图鉴展示） */
  tips: string[]
}

/** E-WPN-01 新人手枪：一次发射一颗朝向自机的弹丸（测试平台系列） */
export const E_WPN_01: EnemyWeaponConfig = {
  key: 'E-WPN-01',
  name: '新人手枪',
  en: 'ROOKIE PISTOL',
  desc: '测试平台系列的入门级手枪，一次发射一颗朝向自机的弹丸。单发、弹道直白，是所有敌机武装的起点。',
  series: SERIES_TESTBED,
  bulletSpeed: 2.8,
  damage: 50,
  fireInterval: 75,
  get bulletStyle() {
    return this.series.bulletStyle
  },
  get bulletColor() {
    return this.series.bulletColor
  },
  tips: [
    '弹丸锁定的是发射瞬间的自机位置：保持移动就能让每一发落空',
    '发射间隔固定，熟悉节奏后可在开火间隙安心输出',
    '多架敌机齐射时，横向微移比大幅乱跑更安全'
  ]
}

/** E-WPN-02 新人霰弹枪：一次发射 5 颗朝向自机的弹丸（测试平台系列） */
export const E_WPN_02: EnemyWeaponConfig = {
  key: 'E-WPN-02',
  name: '新人霰弹枪',
  en: 'ROOKIE SHOTGUN',
  desc: '测试平台系列的散射型武器，一次朝自机方向喷出 5 颗弹丸，形成小扇面压制。弹速略慢但覆盖面大。',
  series: SERIES_TESTBED,
  bulletSpeed: 2.6,
  damage: 50,
  fireInterval: 100,
  bulletCount: 5,
  spreadAngle: 32,
  get bulletStyle() {
    return this.series.bulletStyle
  },
  get bulletColor() {
    return this.series.bulletColor
  },
  tips: [
    '扇面锁定的是发射瞬间的位置：提前横向离开原站位即可让整组弹丸落空',
    '弹丸之间有固定缝隙，距离越远缝隙越宽，保持间距更容易穿缝',
    '发射间隔比手枪长，抓住两轮射击的空窗期输出'
  ]
}

/** E-WPN-10 环状礼花：高密度 360° 旋转环形弹幕（掠夺者·礼花系列） */
export const E_WPN_10: EnemyWeaponConfig = {
  key: 'E-WPN-10',
  name: '环状礼花',
  en: 'BLOOM MORTAR',
  desc: '掠夺者旗舰的全向礼花炮阵，一轮喷出 36 颗紫色光弹组成完整圆环，每 0.43 秒一轮、基础角持续偏转，层层圆环如死亡之花高速绽放。全屏覆盖，没有射击死角。',
  series: SERIES_REAVER_BLOOM,
  bulletSpeed: 9.0,
  damage: 50,
  fireInterval: 9,
  beatInterval: 0.375,
  bulletCount: 36,
  pattern: 'radial',
  spinSpeed: 6.5,
  get bulletStyle() {
    return this.series.bulletStyle
  },
  get bulletColor() {
    return this.series.bulletColor
  },
  tips: [
    '环层极密，跟着圆环旋转的方向横向顺势移动，顺着弹缝"漂"比硬穿更安全',
    '绕后毫无意义——圆环 360° 全覆盖，任何方位密度一致',
    'Boss 此时全场游走，别盯着它追，盯住自己判定点周围的缝'
  ]
}

/** E-WPN-11 鎏金螺旋：五臂高射速金色螺旋弹流（掠夺者·鎏金系列） */
export const E_WPN_11: EnemyWeaponConfig = {
  key: 'E-WPN-11',
  name: '鎏金螺旋',
  en: 'GILT SPIRAL',
  desc: '五联装螺旋机炮，每 0.05 秒一轮的恐怖射速持续泼洒金色针弹，炮口每轮偏转 12.5°，五条螺旋臂以 4.4 的弹速交织成不断收紧的金色风暴，将整片空域卷入其中。',
  series: SERIES_REAVER_GILT,
  bulletSpeed: 10.5,
  damage: 50,
  fireInterval: 2,
  beatInterval: 0.0833,
  bulletCount: 6,
  pattern: 'radial',
  spinSpeed: 12.5,
  get bulletStyle() {
    return this.series.bulletStyle
  },
  get bulletColor() {
    return this.series.bulletColor
  },
  tips: [
    '螺旋弹流密不透风，逆着螺旋旋转方向微移，让缝隙主动送上门',
    '大幅折返跑等于主动撞进另一条螺旋臂，保持小碎步',
    'Boss 此时会追击自机：把它"遛"着走，牵引弹源比原地硬躲更有效'
  ]
}

/** E-WPN-12 双子涡流：十弹正反转双螺旋弹幕（掠夺者·涡流系列） */
export const E_WPN_12: EnemyWeaponConfig = {
  key: 'E-WPN-12',
  name: '双子涡流',
  en: 'TWIN VORTEX',
  desc: '掠夺者最凶恶的弹幕武装：两组五联星弹发射器反向旋转，粉色星弹以每 0.08 秒一轮的频率倾泻，在空中交织成双重涡流。正反转弹道的交叉点不断扫过全场，是考验读弹底力的终极杀招。',
  series: SERIES_REAVER_VORTEX,
  bulletSpeed: 9.5,
  damage: 50,
  fireInterval: 3,
  beatInterval: 0.125,
  bulletCount: 10,
  pattern: 'radial',
  spinSpeed: 15,
  mirrorSpin: true,
  get bulletStyle() {
    return this.series.bulletStyle
  },
  get bulletColor() {
    return this.series.bulletColor
  },
  tips: [
    '正反转弹幕的交叉点最危险，盯住交叉点之间的空当移动',
    '弹幕密度极高，死多半是慌出来的——保持节奏比反应速度重要',
    'Boss 此时缓慢漂移，弹幕源相对稳定，盯住交叉空当就能持续输出',
    '电磁脉冲留到这个阶段再用，清屏收益最大'
  ]
}

/** E-WPN-14 苍雷花火：快慢双层高速雷环（掠夺者·苍雷系列） */
export const E_WPN_14: EnemyWeaponConfig = {
  key: 'E-WPN-14',
  name: '苍雷花火',
  en: 'THUNDER BLOOM',
  desc: '苍雷炮阵一轮射出 18 颗雷光弹，奇偶弹速相差 3.5——快环撕裂长空、慢环封死退路，两层雷网旋转着压向全场。',
  series: SERIES_REAVER_THUNDER,
  bulletSpeed: 12.0,
  damage: 50,
  fireInterval: 8,
  beatInterval: 0.375,
  bulletCount: 24,
  pattern: 'radial',
  spinSpeed: 11,
  speedStep: -3.5,
  get bulletStyle() { return this.series.bulletStyle },
  get bulletColor() { return this.series.bulletColor },
  tips: [
    '快环和慢环的缝隙位置不同，穿过快环后立刻找慢环的缝，别停在原地',
    '整体旋转很快，顺着旋转方向走比逆行省力'
  ]
}

/** E-WPN-16 焚天火雨：极速外环 + 滞留内环的燃烧弹幕（掠夺者·焚天系列） */
export const E_WPN_16: EnemyWeaponConfig = {
  key: 'E-WPN-16',
  name: '焚天火雨',
  en: 'PYRE RAIN',
  desc: '燃烧轰炸炮一轮 24 颗燃烧弹，弹速 13.5 的火环瞬息即至，夹在其中的慢速余烬却久久不散——先躲过火雨，再小心脚下的余焰。',
  series: SERIES_REAVER_PYRE,
  bulletSpeed: 13.5,
  damage: 50,
  fireInterval: 9,
  beatInterval: 0.375,
  bulletCount: 24,
  pattern: 'radial',
  spinSpeed: 3,
  speedStep: -5.5,
  get bulletStyle() { return this.series.bulletStyle },
  get bulletColor() { return this.series.bulletColor },
  tips: [
    '13.5 弹速从出膛到糊脸不足一秒，看到炮口闪光就要动',
    '慢速余烬会长期占位，移动路线要提前规划',
    '俯冲阶段火雨的入射角更陡，下半屏尤其危险'
  ]
}

/** E-WPN-17 血月镰刀：四臂高速旋转风车（掠夺者·血月系列） */
export const E_WPN_17: EnemyWeaponConfig = {
  key: 'E-WPN-17',
  name: '血月镰刀',
  en: 'BLOOD SICKLE',
  desc: '四联处刑炮以每轮 21° 的角速度高速旋转，四条猩红弹臂如镰刀般收割空域。弹速 11.0，被卷入就是连环判定。',
  series: SERIES_REAVER_BLOOD,
  bulletSpeed: 11.0,
  damage: 50,
  fireInterval: 3,
  beatInterval: 0.125,
  bulletCount: 6,
  pattern: 'radial',
  spinSpeed: 21,
  get bulletStyle() { return this.series.bulletStyle },
  get bulletColor() { return this.series.bulletColor },
  tips: [
    '风车转速极快，别试图跟着转，在原地等弹臂扫过的瞬间穿缝',
    '四条弹臂夹角 90°，斜 45° 方向是天然的相对安全区'
  ]
}

/** E-WPN-19 金穗波浪：快慢交替的金色稻弹波（掠夺者·金穗系列） */
export const E_WPN_19: EnemyWeaponConfig = {
  key: 'E-WPN-19',
  name: '金穗波浪',
  en: 'GRAIN WAVE',
  desc: '金穗炮一轮 16 颗稻弹，奇数弹加速 1.8 抢先压场、偶数弹随后收口，两波弹浪前后夹击，形如金色潮汐。',
  series: SERIES_REAVER_GRAIN,
  bulletSpeed: 8.5,
  damage: 50,
  fireInterval: 7,
  beatInterval: 0.3333,
  bulletCount: 16,
  pattern: 'radial',
  spinSpeed: 5,
  speedStep: 3.0,
  get bulletStyle() { return this.series.bulletStyle },
  get bulletColor() { return this.series.bulletColor },
  tips: [
    '快弹先慢弹后，穿过快弹波后别急着停，慢弹波马上收口',
    '波长固定，掌握"快-慢"两拍节奏后难度骤降'
  ]
}

/** E-WPN-22 黄金回旋：六臂反转高速螺旋（掠夺者·鎏金系列） */
export const E_WPN_22: EnemyWeaponConfig = {
  key: 'E-WPN-22',
  name: '黄金回旋',
  en: 'GOLDEN WHIRL',
  desc: '六联机炮以每轮 -17° 反向高速旋转，弹速 11.5 的金色针弹如回旋镖般泼洒全场。看清旋转方向，是你唯一的机会。',
  series: SERIES_REAVER_GILT,
  bulletSpeed: 11.5,
  damage: 50,
  fireInterval: 3,
  beatInterval: 0.125,
  bulletCount: 8,
  pattern: 'radial',
  spinSpeed: -17,
  get bulletStyle() { return this.series.bulletStyle },
  get bulletColor() { return this.series.bulletColor },
  tips: [
    '反转螺旋 + 高弹速，顺着旋转方向的下游位置缝隙最宽',
    '弹雨落地很快，尽量在中场解决走位，别退到底边'
  ]
}

/** E-WPN-23 粉红星雨：高速流星 + 慢速拖尾的双层坠击（掠夺者·涡流系列） */
export const E_WPN_23: EnemyWeaponConfig = {
  key: 'E-WPN-23',
  name: '粉红星雨',
  en: 'PINK METEOR',
  desc: '星弹炮一轮 12 颗粉色流星以 13.5 弹速坠落，每颗流星身后都拖着一颗 8.5 弹速的缓滞残星——躲开流星只是开始。',
  series: SERIES_REAVER_VORTEX,
  bulletSpeed: 13.5,
  damage: 50,
  fireInterval: 5,
  beatInterval: 0.25,
  bulletCount: 12,
  pattern: 'radial',
  spinSpeed: 7,
  speedStep: -5.0,
  get bulletStyle() { return this.series.bulletStyle },
  get bulletColor() { return this.series.bulletColor },
  tips: [
    '流星快、残星慢，穿过流星层后必须继续移动躲开残星',
    '弹速全场顶尖，视线放在中场预判，别盯着自机'
  ]
}

/** E-WPN-24 苍蓝风暴：十四弹中速双螺旋（掠夺者·苍雷系列） */
export const E_WPN_24: EnemyWeaponConfig = {
  key: 'E-WPN-24',
  name: '苍蓝风暴',
  en: 'AZURE STORM',
  desc: '双七联雷光发射器反向旋转，14 颗苍蓝弹以中速交织成对称风暴。密度与速度的均衡之作，也是最容易被低估的杀阵。',
  series: SERIES_REAVER_THUNDER,
  bulletSpeed: 8.5,
  damage: 50,
  fireInterval: 6,
  beatInterval: 0.25,
  bulletCount: 14,
  pattern: 'radial',
  spinSpeed: 9,
  mirrorSpin: true,
  get bulletStyle() { return this.series.bulletStyle },
  get bulletColor() { return this.series.bulletColor },
  tips: [
    '对称双螺旋的空当也在对称移动，锁定一侧的空当跟住它',
    'Boss 此时会追击，牵引弹源画大圈比小碎步安全'
  ]
}

/** E-WPN-25 翠玉绞杀：快速反向双螺旋绞阵（掠夺者·翠毒系列） */
export const E_WPN_25: EnemyWeaponConfig = {
  key: 'E-WPN-25',
  name: '翠玉绞杀',
  en: 'JADE STRANGLE',
  desc: '双四联毒弹发射器以每轮 -13° 反转绞合，8 颗翠玉弹高速交叉收拢，如巨蟒绞杀猎物般压缩你的活动空间。',
  series: SERIES_REAVER_VENOM,
  bulletSpeed: 10.5,
  damage: 50,
  fireInterval: 5,
  beatInterval: 0.25,
  bulletCount: 10,
  pattern: 'radial',
  spinSpeed: -13,
  mirrorSpin: true,
  get bulletStyle() { return this.series.bulletStyle },
  get bulletColor() { return this.series.bulletColor },
  tips: [
    '绞合点按固定节奏扫过全场，提前离开绞合路径',
    'Boss 此时缓慢漂移，绞杀中心随之横移，走位时余光要分给 Boss'
  ]
}

/** E-WPN-28 青光乱舞：超高速旋转的混乱针雨（掠夺者·青针系列） */
export const E_WPN_28: EnemyWeaponConfig = {
  key: 'E-WPN-28',
  name: '青光乱舞',
  en: 'CYAN DANCE',
  desc: '九联针炮以每轮 23° 的狂暴角速度旋转，青色针弹的轨迹肉眼几乎无法追踪。不要试图读懂它——感受它。',
  series: SERIES_REAVER_NEEDLE,
  bulletSpeed: 9.5,
  damage: 50,
  fireInterval: 4,
  beatInterval: 0.1667,
  bulletCount: 9,
  pattern: 'radial',
  spinSpeed: 23,
  get bulletStyle() { return this.series.bulletStyle },
  get bulletColor() { return this.series.bulletColor },
  tips: [
    '旋转快到无法预判，盯住局部小区域穿缝，别看全局',
    '突触超频（减速技能）留给这把武器收益极高'
  ]
}

/** E-WPN-29 终焉焰火：双层双螺旋终局弹幕（掠夺者·金穗系列） */
export const E_WPN_29: EnemyWeaponConfig = {
  key: 'E-WPN-29',
  name: '终焉焰火',
  en: 'FINALE PYRO',
  desc: '掠夺者的压舱底牌：双八联发射器反向旋转，快慢两层稻弹交织成十六道旋臂的终局焰火。能活着看完这场烟火的人，才有资格谈胜利。',
  series: SERIES_REAVER_GRAIN,
  bulletSpeed: 10.5,
  damage: 50,
  fireInterval: 5,
  beatInterval: 0.25,
  bulletCount: 16,
  pattern: 'radial',
  spinSpeed: 18,
  mirrorSpin: true,
  speedStep: -2.5,
  get bulletStyle() { return this.series.bulletStyle },
  get bulletColor() { return this.series.bulletColor },
  tips: [
    '双螺旋 × 双层弹速，全场最复杂的弹幕，保持节奏在交叉空当间穿行',
    '快层逼位、慢层封路，优先处理快层，慢层的缝记住就行',
    '把所有资源（EMP / 突触超频）都砸在这个阶段，不留遗憾'
  ]
}

/** E-LSR-01 棱镜聚焦：锁定自机方位的单发粗光束（棱镜光枢系列，终焉形态强化版） */
export const E_LSR_01: EnemyWeaponConfig = {
  key: 'E-LSR-01',
  name: '棱镜聚焦',
  en: 'PRISM FOCUS',
  desc: '棱镜星卫的主炮：不到 1 秒的预警后，粗大的冰青光束贯穿战场。光束发射后角度固定，预警线就是真实光路——但这次它更粗、更快、更痛，贪输出的人会被光柱钉在原地。',
  series: SERIES_LASER,
  bulletSpeed: 3.0,
  damage: 75,
  fireInterval: 90,
  laser: {
    aim: 'player',
    telegraph: 50,
    duration: 120,
    fade: 18,
    rest: 45,
    halfWidth: 12,
    damage: 40,
    hitInterval: 26,
    count: 1,
    spacing: 0
  },
  get bulletStyle() {
    return this.series.bulletStyle
  },
  get bulletColor() {
    return this.series.bulletColor
  },
  tips: [
    '预警线标出的是真实光路，看到预警线出现就果断让开，不要赌它射偏',
    '光束发射后角度固定，绕到光束另一侧可安心输出',
    '照射期间 Boss 缓慢漂移，但光束锚定在原地——别把光束和 Boss 机体混为一谈'
  ]
}

/** E-WPN-31 护卫机炮：单发快速直射（掠夺者·赤锋系列，巨构母舰护卫机专属） */
export const E_WPN_31: EnemyWeaponConfig = {
  key: 'E-WPN-31',
  name: '护卫机炮',
  en: 'ESCORT GUN',
  desc: '绯红护卫机的点射机炮。一次射出一颗高速红色针弹，弹速轻快、节奏稳定，单独一架威胁有限——但一整支编队环绕齐射时，就是母舰封锁线的延伸。',
  series: SERIES_REAVER_FANG,
  bulletSpeed: 4.4,
  damage: 40,
  fireInterval: 95,
  silent: true,
  get bulletStyle() {
    return this.series.bulletStyle
  },
  get bulletColor() {
    return this.series.bulletColor
  },
  tips: [
    '单发弹丸锁定发射瞬间的自机位置：保持移动即可让弹丸落空',
    '护卫机环绕扫射时弹源持续移动，注意它开火瞬间与自机的相对角度',
    '优先击落护卫机本身，缴械才是根本解法'
  ]
}

/** E-WPN-32 无人机激光炮：短促锁定光束（棱镜光枢系列，激光无人机专属） */
export const E_WPN_32: EnemyWeaponConfig = {
  key: 'E-WPN-32',
  name: '无人机激光炮',
  en: 'DRONE LANCER',
  desc: '激光无人机搭载的短促锁定光束。预警不到一秒后从机首射出一道细光束，配合绕行机动从侧翼不断切割自机航线，是母舰编队里的骚扰专家。',
  series: SERIES_LASER,
  bulletSpeed: 3.0,
  damage: 30,
  fireInterval: 90,
  silent: true,
  laser: {
    aim: 'player',
    telegraph: 40,
    duration: 55,
    fade: 10,
    rest: 90,
    halfWidth: 6,
    damage: 30,
    hitInterval: 26,
    count: 1,
    spacing: 0
  },
  get bulletStyle() {
    return this.series.bulletStyle
  },
  get bulletColor() {
    return this.series.bulletColor
  },
  tips: [
    '预警线短但角度锁定准确：看到机首亮起就横向拉开',
    '激光无人机绕行时会先巡航换位再开火，换位空窗是击落它的最好时机',
    'EMP 可同时瘫痪整支编队的光束'
  ]
}

/** 敌人武器注册表：编号 → 武器定义 */
export const ENEMY_WEAPONS: Record<EnemyWeaponKey, EnemyWeaponConfig> = {
  'E-WPN-01': E_WPN_01,
  'E-WPN-02': E_WPN_02,
  'E-WPN-10': E_WPN_10,
  'E-WPN-11': E_WPN_11,
  'E-WPN-12': E_WPN_12,
  'E-WPN-14': E_WPN_14,
  'E-WPN-16': E_WPN_16,
  'E-WPN-17': E_WPN_17,
  'E-WPN-19': E_WPN_19,
  'E-WPN-22': E_WPN_22,
  'E-WPN-23': E_WPN_23,
  'E-WPN-24': E_WPN_24,
  'E-WPN-25': E_WPN_25,
  'E-WPN-28': E_WPN_28,
  'E-WPN-29': E_WPN_29,
  'E-WPN-31': E_WPN_31,
  'E-WPN-32': E_WPN_32,
  'E-LSR-01': E_LSR_01
}

/** 敌人武器列表（图鉴等按数组遍历用） */
export const ENEMY_WEAPON_LIST: EnemyWeaponConfig[] = Object.values(ENEMY_WEAPONS)
