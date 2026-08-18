/**
 * 敌人单位库（数据驱动）
 * 每个敌人一个定义，图鉴（guideData.ts）与关卡配置（stages.ts）通过 key 引用。
 * 渲染层根据 icon 字段决定图标形状，根据 iconColor 决定颜色。
 *
 * 新增敌人：在 ENEMIES 里加一条定义即可。
 */
import type { EnemyConfig, EnemyKey } from '../types'

/** TST-01 测试机器人01：白色三角形，使用新人手枪（E-WPN-01） */
export const TST_01: EnemyConfig = {
  key: 'TST-01',
  name: '测试机器人01',
  en: 'TEST BOT 01',
  category: 'normal',
  desc: '测试平台系列的入门级敌机。白色三角形机体，搭载新人手枪，单发直射、弹道直白，是所有敌机的起点原型。',
  icon: 'triangle',
  iconColor: '#ffffff',
  hp: 10,
  shield: 0,
  speed: 2.2,
  weapon: 'E-WPN-01',
  fireDelay: 30,
  tips: [
    '血量极低，自机弹只需数发即可击毁',
    '搭载的新人手枪锁定发射瞬间的自机位置，保持移动即可让弹丸落空',
    '移动轨迹为直线下落，弹道完全可预测，适合热身与练手'
  ]
}

/** TST-02 测试机器人02：白色正方形，使用新人霰弹枪（E-WPN-02） */
export const TST_02: EnemyConfig = {
  key: 'TST-02',
  name: '测试机器人02',
  en: 'TEST BOT 02',
  category: 'normal',
  desc: '测试平台系列的散射型敌机。白色正方形机体，搭载新人霰弹枪，一次喷出 5 颗弹丸形成扇面压制，覆盖面大。',
  icon: 'square',
  iconColor: '#ffffff',
  hp: 10,
  shield: 0,
  speed: 2.2,
  weapon: 'E-WPN-02',
  fireDelay: 30,
  tips: [
    '血量极低，但霰弹枪扇面覆盖广，不宜正面硬扛',
    '弹丸之间有固定缝隙，距离越远缝隙越宽，保持间距更容易穿缝',
    '发射间隔比手枪长，抓住两轮射击的空窗期输出'
  ]
}

/** DMY-01 木桩假人：原木色正方形，无敌且原地静止的训练靶 */
export const DMY_01: EnemyConfig = {
  key: 'DMY-01',
  name: '木桩假人',
  en: 'WOODEN DUMMY',
  category: 'normal',
  desc: '训练舱标配的全息木桩靶机。扎根场地中央一动不动，外覆训练缓冲力场使其无法被击毁，专门用于校验火力与练习走位。',
  icon: 'square',
  iconColor: '#d8a35f',
  hp: 999,
  shield: 0,
  speed: 0,
  weapon: 'E-WPN-01',
  fireDelay: 999999, // 事实上的永不射击
  invincible: true,
  noContactDamage: true,
  tips: [
    '无敌单位：受击只会闪白，无法被击毁，放心倾泻火力',
    '没有碰撞伤害，贴身绕背、贴脸输出都安全',
    '全程原地静止，适合测试武器 DPS 与弹道手感'
  ]
}

/** PRT-01 掠星者·沃恩：星际海盗旗舰，单形态、轮换十三套全屏武器倾泻华丽弹幕的极限 Boss */
export const PRT_01: EnemyConfig = {
  key: 'PRT-01',
  name: '掠星者·沃恩',
  en: 'STAR REAVER VORN',
  category: 'boss',
  desc: '横行于废弃航路的星际海盗旗舰。舰体搭载十三门战术主武器，按战术链路不间断循环切换——旋转礼花、绞杀螺旋、狙击扇面、节拍弹墙，每种武器对应一套独立机动：巡航、追击、漂移、俯冲。火力覆盖整片空域，不存在任何射击死角。',
  icon: 'circle',
  iconColor: '#b366ff',
  bgm: 'boss-vorn',
  hp: 10000,
  shield: 0,
  speed: 2.4,
  // 纵向活动限制在屏幕上方 40% 空域，不会压到屏幕中心与下半屏
  maxY: 260,
  weapon: 'E-WPN-10',
  weapons: [
    { key: 'E-WPN-10', duration: 420, movement: 'lissajous' },
    { key: 'E-WPN-11', duration: 420, movement: 'hunt' },
    { key: 'E-WPN-12', duration: 420, movement: 'drift' },
    { key: 'E-WPN-14', duration: 360, movement: 'lissajous' },
    { key: 'E-WPN-16', duration: 360, movement: 'swoop' },
    { key: 'E-WPN-17', duration: 360, movement: 'lissajous' },
    { key: 'E-WPN-19', duration: 360, movement: 'swoop' },
    { key: 'E-WPN-22', duration: 360, movement: 'lissajous' },
    { key: 'E-WPN-23', duration: 360, movement: 'swoop' },
    { key: 'E-WPN-24', duration: 360, movement: 'hunt' },
    { key: 'E-WPN-25', duration: 360, movement: 'drift' },
    { key: 'E-WPN-28', duration: 360, movement: 'lissajous' },
    { key: 'E-WPN-29', duration: 480, movement: 'swoop' }
  ],
  fireDelay: 60,
  tips: [
    'EXTREME：十三门武器循环轮换，每 6~8 秒换一种弹幕形态，不要试图用同一套走位应付全场',
    '弹幕为 360° 全向高密度覆盖，绕后没有任何意义，正面穿缝是唯一出路',
    '焚天火雨（13.5 弹速）这类高速弹必须听节奏提前走位，看到弹丸再躲必中',
    '慢速弹会堆积封场，越早脱离密集区越安全',
    '终焉焰火（双螺旋×双层弹速）是终局杀招，把 EMP 和突触超频全部留给它'
  ]
}

/** LAS-01 棱镜星卫：序章终末的棱镜回廊守护者，主炮 + 血量驱动的浮游炮集群 */
export const LAS_01: EnemyConfig = {
  key: 'LAS-01',
  name: '棱镜星卫',
  en: 'PRISM SENTINEL',
  category: 'boss',
  desc: '棱镜回廊的最终守卫，环绕星门运转的冰青色光棱构造体。主炮「棱镜聚焦」以不到一秒的预警贯穿战场；浮游炮集群随战损不断增援且轮转越转越快——登场 3 台环绕轨道 + 3 台自由游走，血量跌破三分之二增至 5+5 且射速提升，跌破三分之一增至 8+8、射击间隔再度压缩。自由子机全屏巡航、悬停开火、战术换位，与轨道子机错峰轮转射击：预警线像有指挥一样依次从四面八方亮起，十六道预警线此起彼伏、光束交织成网。这是一场越打越绝望的光棱绞杀。通过率不足 1%。',
  icon: 'circle',
  iconColor: '#7de8ff',
  hp: 10000,
  shield: 0,
  speed: 2.0,
  weapon: 'E-LSR-01',
  bgm: 'boss-prism',
  bitEscalation: {
    initial: 3,
    stages: [
      // 增援同时全场提速：55 → 44 → 34 帧/台，密度约 6.5 → 13.6 → 28 发/秒
      { atRatio: 2 / 3, add: 2, fireInterval: 44 },
      { atRatio: 1 / 3, add: 3, fireInterval: 34 }
    ],
    config: {
      count: 8,
      deploy: 'orbit',
      orbitRadius: 110,
      orbitSpeed: 1.8,
      engageDelay: 45,
      fireInterval: 55,
      stagger: true,
      laser: {
        aim: 'player',
        telegraph: 36,
        duration: 70,
        fade: 10,
        rest: 0,
        halfWidth: 5,
        damage: 25,
        hitInterval: 30,
        count: 1,
        spacing: 0
      }
    },
    freeConfig: {
      count: 8,
      deploy: 'free',
      engageDelay: 60,
      fireInterval: 55,
      stagger: true,
      laser: {
        aim: 'player',
        telegraph: 36,
        duration: 70,
        fade: 10,
        rest: 0,
        halfWidth: 5,
        damage: 25,
        hitInterval: 30,
        count: 1,
        spacing: 0
      }
    }
  },
  fireDelay: 60,
  tips: [
    '主炮预警线标出的是真实光路，看到预警线就离开原位',
    '浮游炮不可击毁且随血量增援（3+3 → 5+5 → 8+8）：轨道组环绕 Boss，自由组全屏游走',
    '全部子机错峰轮转开火：预警线按方位依次亮起，注意射击顺序，别被轮转节奏带走',
    '自由浮游炮会巡航-悬停-换位，换位时是它最没威胁的时候，趁机输出本体',
    '血量跌破 2/3 和 1/3 是增援节点：台数与射速同步提升，但增援瞬间子机群会短暂停火重排阵型——抓住空窗输出',
    'EMP 能瞬间熄灭全场光束并瘫痪 Boss 与子机，留给 16 台齐射最凶的阶段',
    'HP 高达 14000，这是一场耐力战——把每一格闪现都当成生命'
  ]
}

/**
 * FIN-01 星渊巨构·绯红天幕：最终 Boss
 * 只从屏幕顶端探出下半身的远古母舰。三阶段各自由独立血量池与
 * 部位体系推进：一阶段「核心 + 四门副炮」、二阶段「左/中/右三部位」、
 * 三阶段「整舰」，阶段击破有连爆演出与无敌转阶段窗口，
 * 由 engine/finalBoss.ts 专属脚本驱动
 */
export const FIN_01: EnemyConfig = {
  key: 'FIN-01',
  name: '星渊巨构·绯红天幕',
  en: 'CRIMSON FIRMAMENT',
  category: 'boss',
  desc: '沉睡于星渊深处的远古巨构母舰，一座只露出半身的钢铁天穹。一阶段：核心与四门副炮各自为战——速攻核心或逐一拆掉副炮减压，每拆一门副炮，核心的伤害倍率就提高一档；二阶段：左/中/右三座同血炮阵轮番轰炸，击毁其一便会撕开其余两座的装甲；三阶段：舰体彻底解体为最后的靶舰，打哪里都是伤害。每一次阶段击破，星舰就崩塌一分，直到最后一舞。',
  icon: 'leviathan',
  iconColor: '#ff3b4e',
  bgm: 'boss-firmament',
  hp: 29000, // 阶段一核心 6000 + 阶段二三部位 15000 + 阶段三舰体 8000
  shield: 0,
  speed: 1.0,
  weapon: 'E-WPN-01', // 占位：巨构由专属脚本驱动，不经过武器轮播
  fireDelay: 60,
  leviathan: {
    spellCards: ['绯红要塞·全域封锁', '蔷薇方程式', '超球面·坍缩终局'],
    phaseHp: [6000, 8000],
    summonIntervals: [1800, 1800, 1800],
    partBonusRatio: 0.06,
    coreDamageBase: 0.6,
    coreDamagePerPart: 0.35,
    phase2PartChipRatio: 0.2,
    partDefs: [
      { id: 'gun-l', name: '左翼副炮', kind: 'turret', x: -175, y: 18, radius: 32, hp: 3000 },
      { id: 'gun-r', name: '右翼副炮', kind: 'turret', x: 175, y: 18, radius: 32, hp: 3000 },
      { id: 'pod-l', name: '左腹副炮', kind: 'turret', x: -88, y: 50, radius: 30, hp: 3000 },
      { id: 'pod-r', name: '右腹副炮', kind: 'turret', x: 88, y: 50, radius: 30, hp: 3000 }
    ],
    phase2PartDefs: [
      { id: 'sec-l', name: '左舷炮阵', kind: 'turret', x: -150, y: 22, radius: 38, hp: 5000 },
      { id: 'sec-c', name: '中枢激光塔', kind: 'beam', x: 0, y: 44, radius: 32, hp: 5000 },
      { id: 'sec-r', name: '右舷炮阵', kind: 'pod', x: 150, y: 22, radius: 38, hp: 5000 }
    ]
  },
  tips: [
    'EXTREME：主血条 = 三阶段血量之和（29000），跨阶段持续下降，刻度线把血条分成三个区段——阶段一打核心、阶段二打三个部位、阶段三打整舰',
    '阶段一两条路线：速攻核心（顶着四门副炮的火力硬灌），或先拆副炮减压——每击毁一门副炮，核心伤害倍率 +35%（0.6 起步最高 2.0）并结算 6% 剥离伤害',
    '阶段二左/中/右三座炮阵等血：左=玫瑰花阵、中=扫射光束+高速针、右=追踪导弹；击毁一座会对另外两座造成 20% 剥离伤害，三座全灭进三阶段',
    '狂怒机制：每一座部位血量越低、火力越强（射速 / 弹数 / 弹速全面提升），残血炮阵周身亮起灼热光圈——优先集火打掉一座，而不是雨露均沾',
    '阶段三没有任何机制：整舰皆可击，直接击溃',
    '阶段击破瞬间有约 2.5 秒无敌转阶段窗口：Boss 停火不可锁定，趁机调整站位',
    '追踪导弹有寿命且转向有限：朝导弹内侧切小圈可以甩掉，EMP 可清掉全场导弹',
    '「蔷薇方程式」的花瓣间有真空走廊，走廊随花阵缓慢旋转——跟着走廊走',
    '「超球面·坍缩终局」的球面弹幕有一个缓慢游移的缺口，那是唯一的活路；风车激光逼你绕核心位走位，别站死',
    '机库弹射的护卫机编队全部可击毁：清掉它们，母舰的火力网会塌掉一角'
  ]
}

/** FIN-ESC 绯红护卫机：巨构母舰机库弹射的编队护卫机，环绕自机扫射骚扰 */
export const FIN_ESC: EnemyConfig = {
  key: 'FIN-ESC',
  name: '绯红护卫机',
  en: 'CRIMSON ESCORT',
  category: 'normal',
  desc: '巨构母舰机库弹射的编队护卫机。后掠翼拦截机机身，入场后转入追踪环绕，用三连机炮持续骚扰自机，是母舰火力网的延伸——击毁它们，母舰的封锁线就会塌掉一角。',
  icon: 'drone',
  iconColor: '#ff5a6a',
  hp: 10,
  shield: 0,
  speed: 3.0,
  weapon: 'E-WPN-31',
  fireDelay: 70,
  tips: [
    '血薄但机动凶：入场后会追踪自机保持距离环绕扫射',
    '清理优先级高于输出母舰——护卫机群的火力网与母舰弹幕叠加时几乎无处可躲',
    'EMP 可以一次瘫痪整支编队，抓住瘫痪窗口集中击落'
  ]
}

/** FIN-LSR 激光无人机：绕行机动的光束骚扰机，母舰编队的侧翼切割者 */
export const FIN_LSR: EnemyConfig = {
  key: 'FIN-LSR',
  name: '激光无人机',
  en: 'LASER DRONE',
  category: 'normal',
  desc: '巨构母舰机库弹射的光束无人机。悬浮菱形机体环绕自机巡航，机首聚能透镜短促锁定后射出细光束切割航线，与护卫机群的弹幕形成交叉火力。',
  icon: 'laser-drone',
  iconColor: '#7de8ff',
  hp: 10,
  shield: 0,
  speed: 2.6,
  weapon: 'E-WPN-32',
  fireDelay: 60,
  tips: [
    '开火前机首有短暂预警，看到亮光就横向拉开',
    '绕行换位时是最大的输出窗口，抓住机会击落',
    'EMP 可以一次熄灭全场光束'
  ]
}

/** 敌人注册表：编号 → 敌人定义 */
export const ENEMIES: Record<EnemyKey, EnemyConfig> = {
  'TST-01': TST_01,
  'TST-02': TST_02,
  'DMY-01': DMY_01,
  'PRT-01': PRT_01,
  'LAS-01': LAS_01,
  'FIN-01': FIN_01,
  'FIN-ESC': FIN_ESC,
  'FIN-LSR': FIN_LSR
}

/** 敌人列表（图鉴等按数组遍历用） */
export const ENEMY_LIST: EnemyConfig[] = Object.values(ENEMIES)

/** 按 category 筛选用的辅助 Map */
export const ENEMIES_BY_CATEGORY: Record<'normal' | 'boss', EnemyConfig[]> = {
  normal: Object.values(ENEMIES).filter(e => e.category === 'normal'),
  boss: Object.values(ENEMIES).filter(e => e.category === 'boss')
}
