import type { ItemDef } from '../../types'
import nornIcon from '../../assets/items/implants/Norn.png'
import titanIcon from '../../assets/items/implants/Titan.png'
import aegisIcon from '../../assets/items/implants/Aegis.png'
import lunarCocoonIcon from '../../assets/items/implants/Lunar-Cocoon.png'
import falconIcon from '../../assets/items/implants/Falcon.png'
import mirageIcon from '../../assets/items/implants/Mirage.png'
import longinusIcon from '../../assets/items/implants/longinus.png'
import gungnirIcon from '../../assets/items/implants/gungnir.png'
import fenrirIcon from '../../assets/items/implants/fenrir.png'
import mjolnirIcon from '../../assets/items/implants/mjolnir.png'
import sleipnirIcon from '../../assets/items/implants/sleipnir.png'
import gaeBolgIcon from '../../assets/items/implants/Gae-Bolg.png'
import artemisIcon from '../../assets/items/implants/Artemis.png'
import odysseusIcon from '../../assets/items/implants/Odysseus.png'
import soteriaIcon from '../../assets/items/implants/Soteria.png'
import atlasIcon from '../../assets/items/implants/Atlas.png'

/* ==================== 义体属性速查表（改配置后请同步本表） ====================
 *
 * 名称                        部位    品质      耐受  效果
 * ─────────────────────────────────────────────────────────────────
 * 诺恩演算核心                头部    遗构(金)  30    技能回复 +50%
 * 泰坦重殖躯干                躯干    军用(蓝)  15    生命 +40%
 * 泰坦重殖躯干·巨像式         躯干    试作(紫)  35    生命 +55%，护盾 +25（护盾上限 +25%）
 * 泰坦重殖躯干·撼岳式         躯干    遗构(金)  55    生命 +100%，护盾 +40（护盾上限 +50%），移速 -15%
 * 辉誓屏障核心                躯干    军用(蓝)  15    护盾 +25
 * 辉誓屏障核心·圣盾式         躯干    试作(紫)  30    护盾 +50，护盾恢复 +2/s
 * 辉誓屏障核心·圣域式         躯干    遗构(金)  50    护盾 +100，生命 -25，护盾恢复 +4/s
 * 月茧缓冲骨架                躯干    试作(紫)  35    受到伤害 -35%
 * 隼式推进义足                腿部    军用(蓝)  10    移速 +15%
 * 隼式推进义足·猎空式         腿部    试作(紫)  20    移速 +40%，生命 -15
 * 隼式推进义足·翔隼式         腿部    遗构(金)  40    移速 +60%，闪避率 +10%，承伤 +15%
 * 蜃影相位肌腱                腿部    试作(紫)  25    折跃充能 +1，折跃距离 +25%，移速 +10%
 * 蜃影相位肌腱·幻蜃式         腿部    遗构(金)  40    折跃充能 +1，折跃无敌 +0.5 秒，折跃距离 +50%，移速 +15%
 * 朗基努斯火控核心            头部    军用(蓝)  10    伤害 +10%
 * 朗基努斯火控核心·圣枪式     头部    试作(紫)  30    伤害 +30%
 * 朗基努斯火控核心·天枪式     头部    遗构(金)  50    伤害 +50%
 * 冈格尼尔过载心核            躯干    军用(蓝)  15    生命 +80，移速 -5%
 * 冈格尼尔过载心核·流星式     躯干    试作(紫)  30    生命 +150，移速 -10%
 * 冈格尼尔过载心核·永恒式     躯干    遗构(金)  45    生命 +230，移速 -30%
 * 芬里尔撕裂肌束              躯干    军用(蓝)  15    生命 +70
 * 芬里尔撕裂肌束·狂狼式       躯干    试作(紫)  30    生命 +130
 * 妙尔尼尔怒战中枢            头部    遗构(金)  35    怒雷协议：免死 1 血 + 无敌 5s（期间伤害 +50%），冷却 180s
 * 斯莱普尼尔奔袭蹄腿          腿部    军用(蓝)  15    闪避率 +10%，移速 +5%
 * 斯莱普尼尔奔袭蹄腿·疾驰式   腿部    试作(紫)  20    闪避率 +20%，生命 -25，移速 +10%
 * 斯莱普尼尔奔袭蹄腿·追风式   腿部    遗构(金)  30    闪避率 +30%，生命 -50，移速 +15%
 * 盖伯尔加索敌核心            头部    军用(蓝)  10    伤害 +12%，移速 -10%
 * 盖伯尔加索敌核心·千棘式     头部    试作(紫)  25    伤害 +30%，移速 -20%
 * 盖伯尔加索敌核心·万棘式     头部    遗构(金)  40    伤害 +50%，移速 -30%
 * 阿耳忒弥斯猎月义眼          头部    试作(紫)  30    自动索敌：开火时瞄准离鼠标最近的敌人（全图）
 * 奥德修斯诡弦弹道核心        头部    遗构(金)  45    弹丸跟踪：贴近敌人的子弹锁定追踪直至命中（激光/电弧除外）
 * 索特里亚护盾谐律核心        躯干    试作(紫)  30    护盾熔断时间 -50%，护盾恢复 +2/s
 * 阿特拉斯承负脊架            躯干    遗构(金)  0     义体承受度上限 +40
 *
 * 装配规则：
 * - 同名不同品质的变体通过 implantFamily 字段归为同族，同族全局限装配一件
 *   （校验见 composables/useEquipment.ts）；新增变体时复用同一 implantFamily，与命名格式无关。
 * - 承受值（implantLoad）按件独立配置，与稀有度脱钩；承受度基础上限 150，
 *   可被 implantCapacityAdd 义体（如阿特拉斯承负脊架）提高。
 *   定价标尺：1 耐受 ≈ 1% 伤害 ≈ 4~5 点生命（生命是不可再生的永久资源，单价已上调）；
 *   护盾因「溢出伤害整吞」机制约 2 倍溢价；护盾回复为「脱战喘息」收益
 *   （承伤后 2 秒暂停回复，见 balance.ts 的 shieldRegenDelayFrames），回复词条单价相应下调；
 *   闪避率约 1.2~1.5 耐受/%；移速正词条 1 耐受/%，负词条按半价折抵。
 */

/* ==================== 可装备义体 ==================== */

/** 头部义体 · 诺恩演算核心：技能回复速度 +50% */
export const ITEM_IMPLANT_NORN: ItemDef = {
  id: 'implant-norn',
  name: '诺恩演算核心',
  implantFamily: 'implant-norn',
  implantLoad: 30,
  category: 'implant',
  rarity: 'legendary',
  desc: '技能回复速度 +50%。',
  stackLimit: 1,
  icon: nornIcon,
  iconScale: 1.5,
  kind: '头部义体',
  implantPart: 'head',
  implantEffect: { skillRegenAdd: 0.5 },
}

/** 躯干义体 · 泰坦重殖躯干：生命值 +40% */
export const ITEM_IMPLANT_TITAN: ItemDef = {
  id: 'implant-titan',
  name: '泰坦重殖躯干',
  implantFamily: 'implant-titan',
  implantLoad: 15,
  category: 'implant',
  rarity: 'rare',
  desc: '生命值 +40%。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: titanIcon,
  iconScale: 1.5,
  implantEffect: { hpPctAdd: 0.4 },
}

/** 躯干义体 · 泰坦重殖躯干·巨像式：生命值 +55%，护盾 +25，护盾上限额外 +25% */
export const ITEM_IMPLANT_TITAN_COLOSSUS: ItemDef = {
  id: 'implant-titan-colossus',
  name: '泰坦重殖躯干·巨像式',
  implantFamily: 'implant-titan',
  implantLoad: 35,
  category: 'implant',
  rarity: 'epic',
  desc: '生命值 +55%，护盾 +25，护盾上限额外 +25%。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: titanIcon,
  iconScale: 1.5,
  implantEffect: { hpPctAdd: 0.55, shieldAdd: 25, shieldPctAdd: 0.25 },
}

/** 躯干义体 · 泰坦重殖躯干·撼岳式：生命值 +100%，护盾 +40，护盾上限额外 +50%，移动速度 -15% */
export const ITEM_IMPLANT_TITAN_DIVINE: ItemDef = {
  id: 'implant-titan-divine',
  name: '泰坦重殖躯干·撼岳式',
  implantFamily: 'implant-titan',
  implantLoad: 55,
  category: 'implant',
  rarity: 'legendary',
  desc: '生命值 +100%，护盾 +40，护盾上限额外 +50%，移动速度 -15%。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: titanIcon,
  iconScale: 1.5,
  implantEffect: { hpPctAdd: 1.0, shieldAdd: 40, shieldPctAdd: 0.5, moveSpeedAdd: -0.15 },
}

/** 躯干义体 · 辉誓屏障核心：护盾 +25 */
export const ITEM_IMPLANT_AEGIS: ItemDef = {
  id: 'implant-aegis',
  name: '辉誓屏障核心',
  implantFamily: 'implant-aegis',
  implantLoad: 15,
  category: 'implant',
  rarity: 'rare',
  desc: '护盾 +25。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: aegisIcon,
  iconScale: 1.5,
  implantEffect: { shieldAdd: 25 },
}

/** 躯干义体 · 辉誓屏障核心·圣盾式：护盾 +50，护盾恢复速度 +2/秒 */
export const ITEM_IMPLANT_AEGIS_HOLY: ItemDef = {
  id: 'implant-aegis-holy',
  name: '辉誓屏障核心·圣盾式',
  implantFamily: 'implant-aegis',
  implantLoad: 30,
  category: 'implant',
  rarity: 'epic',
  desc: '护盾 +50，护盾恢复速度 +2/秒。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: aegisIcon,
  iconScale: 1.5,
  implantEffect: { shieldAdd: 50, shieldRegenAdd: 2 },
}

/** 躯干义体 · 辉誓屏障核心·圣域式：护盾 +100，生命值 -25，护盾恢复速度 +4/秒 */
export const ITEM_IMPLANT_AEGIS_DIVINE: ItemDef = {
  id: 'implant-aegis-divine',
  name: '辉誓屏障核心·圣域式',
  implantFamily: 'implant-aegis',
  implantLoad: 50,
  category: 'implant',
  rarity: 'legendary',
  desc: '护盾 +100，生命值 -25，护盾恢复速度 +4/秒。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: aegisIcon,
  iconScale: 1.5,
  implantEffect: { shieldAdd: 100, hpAdd: -25, shieldRegenAdd: 4 },
}

/** 躯干义体 · 月茧缓冲骨架：受到的伤害降低 35% */
export const ITEM_IMPLANT_LUNAR_COCOON: ItemDef = {
  id: 'implant-lunar-cocoon',
  name: '月茧缓冲骨架',
  implantFamily: 'implant-lunar-cocoon',
  implantLoad: 35,
  category: 'implant',
  rarity: 'epic',
  desc: '受到的伤害降低 35%。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: lunarCocoonIcon,
  iconScale: 1.5,
  implantEffect: { damageTakenMul: 0.65 },
}

/** 腿部义体 · 隼式推进义足：移动速度 +15% */
export const ITEM_IMPLANT_FALCON: ItemDef = {
  id: 'implant-falcon',
  name: '隼式推进义足',
  implantFamily: 'implant-falcon',
  implantLoad: 10,
  category: 'implant',
  rarity: 'rare',
  desc: '移动速度 +15%。',
  stackLimit: 1,
  kind: '腿部义体',
  implantPart: 'legs',
  icon: falconIcon,
  iconScale: 1.5,
  implantEffect: { moveSpeedAdd: 0.15 },
}

/** 腿部义体 · 隼式推进义足·猎空式：移动速度 +40%，生命值 -15 */
export const ITEM_IMPLANT_FALCON_SKY: ItemDef = {
  id: 'implant-falcon-sky',
  name: '隼式推进义足·猎空式',
  implantFamily: 'implant-falcon',
  implantLoad: 20,
  category: 'implant',
  rarity: 'epic',
  desc: '移动速度 +40%，生命值 -15。',
  stackLimit: 1,
  kind: '腿部义体',
  implantPart: 'legs',
  icon: falconIcon,
  iconScale: 1.5,
  implantEffect: { moveSpeedAdd: 0.4, hpAdd: -15 },
}

/** 腿部义体 · 隼式推进义足·翔隼式：移动速度 +60%，闪避率 +10%，受到的伤害 +15% */
export const ITEM_IMPLANT_FALCON_DIVINE: ItemDef = {
  id: 'implant-falcon-divine',
  name: '隼式推进义足·翔隼式',
  implantFamily: 'implant-falcon',
  implantLoad: 40,
  category: 'implant',
  rarity: 'legendary',
  desc: '移动速度 +60%，闪避率 +10%，受到的伤害 +15%。',
  stackLimit: 1,
  kind: '腿部义体',
  implantPart: 'legs',
  icon: falconIcon,
  iconScale: 1.5,
  implantEffect: { moveSpeedAdd: 0.6, dodgeChance: 0.1, damageTakenMul: 1.15 },
}

/** 腿部义体 · 蜃影相位肌腱：折跃充能 +1，折跃距离 +25%，移动速度 +10% */
export const ITEM_IMPLANT_MIRAGE: ItemDef = {
  id: 'implant-mirage',
  name: '蜃影相位肌腱',
  implantFamily: 'implant-mirage',
  implantLoad: 25,
  category: 'implant',
  rarity: 'epic',
  desc: '折跃充能 +1，折跃距离 +25%，移动速度 +10%。',
  stackLimit: 1,
  kind: '腿部义体',
  implantPart: 'legs',
  icon: mirageIcon,
  iconScale: 1.5,
  implantEffect: { dashChargesAdd: 1, dashDistanceAdd: 0.25, moveSpeedAdd: 0.1 },
}

/** 腿部义体 · 蜃影相位肌腱·幻蜃式：折跃充能 +1，折跃无敌 +0.5 秒，折跃距离 +50%，移动速度 +15% */
export const ITEM_IMPLANT_MIRAGE_DIVINE: ItemDef = {
  id: 'implant-mirage-divine',
  name: '蜃影相位肌腱·幻蜃式',
  implantFamily: 'implant-mirage',
  implantLoad: 40,
  category: 'implant',
  rarity: 'legendary',
  desc: '折跃充能 +1，折跃无敌时间 +0.5 秒，折跃距离 +50%，移动速度 +15%。',
  stackLimit: 1,
  kind: '腿部义体',
  implantPart: 'legs',
  icon: mirageIcon,
  iconScale: 1.5,
  implantEffect: { dashChargesAdd: 1, dashInvincibleAdd: 0.5, dashDistanceAdd: 0.5, moveSpeedAdd: 0.15 },
}

/* ==================== 伏尔甘军械（VA） ==================== */

/** 头部义体 · VA-01 朗基努斯火控核心：造成伤害 +10%，受到伤害 +10% */
export const ITEM_IMPLANT_LONGINUS: ItemDef = {
  id: 'implant-va01-longinus',
  name: '朗基努斯火控核心',
  implantFamily: 'implant-longinus',
  implantLoad: 10,
  category: 'implant',
  rarity: 'rare',
  desc: '造成伤害 +10%，受到伤害 +10%。',
  stackLimit: 1,
  kind: '头部义体',
  implantPart: 'head',
  icon: longinusIcon,
  iconScale: 1.5,
  implantEffect: { attackAdd: 0.1, damageTakenMul: 1.1 },
}

/** 头部义体 · VA-01X 朗基努斯火控核心·圣枪式：造成伤害 +30%，受到伤害 +20% */
export const ITEM_IMPLANT_LONGINUS_SPEAR: ItemDef = {
  id: 'implant-va01x-longinus-spear',
  name: '朗基努斯火控核心·圣枪式',
  implantFamily: 'implant-longinus',
  implantLoad: 30,
  category: 'implant',
  rarity: 'epic',
  desc: '造成伤害 +30%，受到伤害 +20%。',
  stackLimit: 1,
  kind: '头部义体',
  implantPart: 'head',
  icon: longinusIcon,
  iconScale: 1.5,
  implantEffect: { attackAdd: 0.3, damageTakenMul: 1.2 },
}

/** 头部义体 · VA-01S 朗基努斯火控核心·天枪式：造成伤害 +50%，受到伤害 +30% */
export const ITEM_IMPLANT_LONGINUS_DIVINE: ItemDef = {
  id: 'implant-va01s-longinus-divine',
  name: '朗基努斯火控核心·天枪式',
  implantFamily: 'implant-longinus',
  implantLoad: 50,
  category: 'implant',
  rarity: 'legendary',
  desc: '造成伤害 +50%，受到伤害 +30%。',
  stackLimit: 1,
  kind: '头部义体',
  implantPart: 'head',
  icon: longinusIcon,
  iconScale: 1.5,
  implantEffect: { attackAdd: 0.5, damageTakenMul: 1.3 },
}

/** 躯干义体 · VA-02 冈格尼尔过载心核：生命值 +80，移动速度 -5% */
export const ITEM_IMPLANT_GUNGNIR: ItemDef = {
  id: 'implant-va02-gungnir',
  name: '冈格尼尔过载心核',
  implantFamily: 'implant-gungnir',
  implantLoad: 15,
  category: 'implant',
  rarity: 'rare',
  desc: '生命值 +80，移动速度 -5%。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: gungnirIcon,
  iconScale: 1.5,
  implantEffect: { hpAdd: 80, moveSpeedAdd: -0.05 },
}

/** 躯干义体 · VA-02X 冈格尼尔过载心核·流星式：生命值 +150，移动速度 -10% */
export const ITEM_IMPLANT_GUNGNIR_METEOR: ItemDef = {
  id: 'implant-va02x-gungnir-meteor',
  name: '冈格尼尔过载心核·流星式',
  implantFamily: 'implant-gungnir',
  implantLoad: 30,
  category: 'implant',
  rarity: 'epic',
  desc: '生命值 +150，移动速度 -10%。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: gungnirIcon,
  iconScale: 1.5,
  implantEffect: { hpAdd: 150, moveSpeedAdd: -0.1 },
}

/** 躯干义体 · VA-02S 冈格尼尔过载心核·永恒式：生命值 +230，移动速度 -30% */
export const ITEM_IMPLANT_GUNGNIR_ETERNAL: ItemDef = {
  id: 'implant-va02s-gungnir-eternal',
  name: '冈格尼尔过载心核·永恒式',
  implantFamily: 'implant-gungnir',
  implantLoad: 45,
  category: 'implant',
  rarity: 'legendary',
  desc: '生命值 +230，移动速度 -30%。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: gungnirIcon,
  iconScale: 1.5,
  implantEffect: { hpAdd: 230, moveSpeedAdd: -0.3 },
}

/** 躯干义体 · VA-03 芬里尔撕裂肌束：生命值 +70 */
export const ITEM_IMPLANT_FENRIR: ItemDef = {
  id: 'implant-va03-fenrir',
  name: '芬里尔撕裂肌束',
  implantFamily: 'implant-fenrir',
  implantLoad: 15,
  category: 'implant',
  rarity: 'rare',
  desc: '生命值 +70。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: fenrirIcon,
  iconScale: 1.5,
  implantEffect: { hpAdd: 70 },
}

/** 躯干义体 · VA-03X 芬里尔撕裂肌束·狂狼式：生命值 +130 */
export const ITEM_IMPLANT_FENRIR_FRENZY: ItemDef = {
  id: 'implant-va03x-fenrir-frenzy',
  name: '芬里尔撕裂肌束·狂狼式',
  implantFamily: 'implant-fenrir',
  implantLoad: 30,
  category: 'implant',
  rarity: 'epic',
  desc: '生命值 +130。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: fenrirIcon,
  iconScale: 1.5,
  implantEffect: { hpAdd: 130 },
}

/** 头部义体 · VA-05 妙尔尼尔怒战中枢：怒雷协议（致命伤保留 1 血 + 5s 无敌，期间伤害 +50%，冷却 180s） */
export const ITEM_IMPLANT_MJOLNIR: ItemDef = {
  id: 'implant-va05-mjolnir',
  name: '妙尔尼尔怒战中枢',
  implantFamily: 'implant-mjolnir',
  implantLoad: 35,
  category: 'implant',
  rarity: 'legendary',
  desc: '受到致命伤害时保留 1 点生命，进入「怒雷协议」状态：5 秒无敌，期间造成伤害 +50%（冷却 180 秒）。',
  stackLimit: 1,
  kind: '头部义体',
  implantPart: 'head',
  icon: mjolnirIcon,
  iconScale: 1.5,
  implantEffect: { deathGuard: { name: '怒雷协议', cooldownSec: 180, invincibleSec: 5, attackAdd: 0.5 } },
}

/** 腿部义体 · VA-06 斯莱普尼尔奔袭蹄腿：闪避率 +10%，移动速度 +5% */
export const ITEM_IMPLANT_SLEIPNIR: ItemDef = {
  id: 'implant-va06-sleipnir',
  name: '斯莱普尼尔奔袭蹄腿',
  implantFamily: 'implant-sleipnir',
  implantLoad: 15,
  category: 'implant',
  rarity: 'rare',
  desc: '闪避率 +10%，移动速度 +5%。',
  stackLimit: 1,
  kind: '腿部义体',
  implantPart: 'legs',
  icon: sleipnirIcon,
  iconScale: 1.5,
  implantEffect: { dodgeChance: 0.1, moveSpeedAdd: 0.05 },
}

/** 腿部义体 · VA-06X 斯莱普尼尔奔袭蹄腿·疾驰式：闪避率 +20%，生命值 -25，移动速度 +10% */
export const ITEM_IMPLANT_SLEIPNIR_SWIFT: ItemDef = {
  id: 'implant-va06x-sleipnir-swift',
  name: '斯莱普尼尔奔袭蹄腿·疾驰式',
  implantFamily: 'implant-sleipnir',
  implantLoad: 20,
  category: 'implant',
  rarity: 'epic',
  desc: '闪避率 +20%，生命值 -25，移动速度 +10%。',
  stackLimit: 1,
  kind: '腿部义体',
  implantPart: 'legs',
  icon: sleipnirIcon,
  iconScale: 1.5,
  implantEffect: { dodgeChance: 0.2, hpAdd: -25, moveSpeedAdd: 0.1 },
}

/** 腿部义体 · VA-06S 斯莱普尼尔奔袭蹄腿·追风式：闪避率 +30%，生命值 -50，移动速度 +15% */
export const ITEM_IMPLANT_SLEIPNIR_DIVINE: ItemDef = {
  id: 'implant-va06s-sleipnir-divine',
  name: '斯莱普尼尔奔袭蹄腿·追风式',
  implantFamily: 'implant-sleipnir',
  implantLoad: 30,
  category: 'implant',
  rarity: 'legendary',
  desc: '闪避率 +30%，生命值 -50，移动速度 +15%。',
  stackLimit: 1,
  kind: '腿部义体',
  implantPart: 'legs',
  icon: sleipnirIcon,
  iconScale: 1.5,
  implantEffect: { dodgeChance: 0.3, hpAdd: -50, moveSpeedAdd: 0.15 },
}

/** 头部义体 · VA-07 盖伯尔加索敌核心：造成伤害 +12%，移动速度 -10% */
export const ITEM_IMPLANT_GAE_BOLG: ItemDef = {
  id: 'implant-va07-gaebolg',
  name: '盖伯尔加索敌核心',
  implantFamily: 'implant-gae-bolg',
  implantLoad: 10,
  category: 'implant',
  rarity: 'rare',
  desc: '造成伤害 +12%，移动速度 -10%。',
  stackLimit: 1,
  kind: '头部义体',
  implantPart: 'head',
  icon: gaeBolgIcon,
  iconScale: 1.5,
  implantEffect: { attackAdd: 0.12, moveSpeedAdd: -0.1 },
}

/** 头部义体 · VA-07X 盖伯尔加索敌核心·千棘式：造成伤害 +30%，移动速度 -20% */
export const ITEM_IMPLANT_GAE_BOLG_THORNS: ItemDef = {
  id: 'implant-va07x-gaebolg-thorns',
  name: '盖伯尔加索敌核心·千棘式',
  implantFamily: 'implant-gae-bolg',
  implantLoad: 25,
  category: 'implant',
  rarity: 'epic',
  desc: '造成伤害 +30%，移动速度 -20%。',
  stackLimit: 1,
  kind: '头部义体',
  implantPart: 'head',
  icon: gaeBolgIcon,
  iconScale: 1.5,
  implantEffect: { attackAdd: 0.3, moveSpeedAdd: -0.2 },
}

/** 头部义体 · VA-07S 盖伯尔加索敌核心·万棘式：造成伤害 +50%，移动速度 -30% */
export const ITEM_IMPLANT_GAE_BOLG_DIVINE: ItemDef = {
  id: 'implant-va07s-gaebolg-divine',
  name: '盖伯尔加索敌核心·万棘式',
  implantFamily: 'implant-gae-bolg',
  implantLoad: 40,
  category: 'implant',
  rarity: 'legendary',
  desc: '造成伤害 +50%，移动速度 -30%。',
  stackLimit: 1,
  kind: '头部义体',
  implantPart: 'head',
  icon: gaeBolgIcon,
  iconScale: 1.5,
  implantEffect: { attackAdd: 0.5, moveSpeedAdd: -0.3 },
}

/* ==================== 阿耳戈斯光学（AO） ==================== */

/** 头部义体 · AO-02 阿耳忒弥斯猎月义眼：自动索敌（开火时自动瞄准离鼠标最近的敌人，全图范围） */
export const ITEM_IMPLANT_ARTEMIS: ItemDef = {
  id: 'implant-ao02-artemis',
  name: '阿耳忒弥斯猎月义眼',
  implantFamily: 'implant-artemis',
  implantLoad: 30,
  category: 'implant',
  rarity: 'epic',
  desc: '自动索敌：开火时自动瞄准离鼠标最近的敌人（全图范围），无需精确瞄准。',
  stackLimit: 1,
  kind: '头部义体',
  implantPart: 'head',
  icon: artemisIcon,
  iconScale: 1.5,
  implantEffect: { autoAimRange: Infinity },
}

/** 头部义体 · AO-04 奥德修斯诡弦弹道核心：弹丸跟踪（贴近敌人 300 内的子弹锁定追踪最近敌人直至命中，冲过头会掉头飞回；激光 / 电弧武器不受影响；捕获半径见 game.ts 的 HOMING_ACQUIRE_RANGE） */
export const ITEM_IMPLANT_ODYSSEUS: ItemDef = {
  id: 'implant-ao04-odysseus',
  name: '奥德修斯诡弦弹道核心',
  implantFamily: 'implant-odysseus',
  implantLoad: 45,
  category: 'implant',
  rarity: 'legendary',
  desc: '弹丸跟踪：贴近敌人的子弹会锁定追踪最近的敌人直至命中，冲过头也会掉头飞回（激光与电弧武器不受影响）。',
  stackLimit: 1,
  kind: '头部义体',
  implantPart: 'head',
  icon: odysseusIcon,
  iconScale: 1.5,
  implantEffect: { bulletHoming: 0.08 },
}

/* ==================== 奥林匹斯生物（OH） ==================== */

/** 躯干义体 · OH-07 索特里亚护盾谐律核心：护盾熔断时间 -50%，护盾恢复 +2/秒 */
export const ITEM_IMPLANT_SOTERIA: ItemDef = {
  id: 'implant-oh07-soteria',
  name: '索特里亚护盾谐律核心',
  implantFamily: 'implant-soteria',
  implantLoad: 30,
  category: 'implant',
  rarity: 'epic',
  desc: '护盾熔断时间 -50%，护盾恢复速度 +2/秒。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: soteriaIcon,
  iconScale: 1.5,
  implantEffect: { shieldBreakMul: 0.5, shieldRegenAdd: 2 },
}

/* ==================== 代达罗斯工坊（DA） ==================== */

/** 躯干义体 · DA-07 阿特拉斯承负脊架：义体承受度上限 +40（自身不占承受度，代价是占用一个躯干槽） */
export const ITEM_IMPLANT_ATLAS: ItemDef = {
  id: 'implant-da07-atlas',
  name: '阿特拉斯承负脊架',
  implantFamily: 'implant-atlas',
  implantLoad: 0,
  category: 'implant',
  rarity: 'legendary',
  desc: '义体承受度上限 +40。',
  stackLimit: 1,
  kind: '躯干义体',
  implantPart: 'body',
  icon: atlasIcon,
  iconScale: 1.5,
  implantEffect: { implantCapacityAdd: 40 },
}

/** 植入体/义体类物品列表（新增在此追加，无需改注册表） */
export const IMPLANT_ITEMS: ItemDef[] = [
  ITEM_IMPLANT_NORN,
  ITEM_IMPLANT_TITAN,
  ITEM_IMPLANT_TITAN_COLOSSUS,
  ITEM_IMPLANT_TITAN_DIVINE,
  ITEM_IMPLANT_AEGIS,
  ITEM_IMPLANT_AEGIS_HOLY,
  ITEM_IMPLANT_AEGIS_DIVINE,
  ITEM_IMPLANT_LUNAR_COCOON,
  ITEM_IMPLANT_FALCON,
  ITEM_IMPLANT_FALCON_SKY,
  ITEM_IMPLANT_FALCON_DIVINE,
  ITEM_IMPLANT_MIRAGE,
  ITEM_IMPLANT_MIRAGE_DIVINE,
  ITEM_IMPLANT_LONGINUS,
  ITEM_IMPLANT_LONGINUS_SPEAR,
  ITEM_IMPLANT_LONGINUS_DIVINE,
  ITEM_IMPLANT_GUNGNIR,
  ITEM_IMPLANT_GUNGNIR_METEOR,
  ITEM_IMPLANT_GUNGNIR_ETERNAL,
  ITEM_IMPLANT_FENRIR,
  ITEM_IMPLANT_FENRIR_FRENZY,
  ITEM_IMPLANT_MJOLNIR,
  ITEM_IMPLANT_SLEIPNIR,
  ITEM_IMPLANT_SLEIPNIR_SWIFT,
  ITEM_IMPLANT_SLEIPNIR_DIVINE,
  ITEM_IMPLANT_GAE_BOLG,
  ITEM_IMPLANT_GAE_BOLG_THORNS,
  ITEM_IMPLANT_GAE_BOLG_DIVINE,
  ITEM_IMPLANT_ARTEMIS,
  ITEM_IMPLANT_ODYSSEUS,
  ITEM_IMPLANT_SOTERIA,
  ITEM_IMPLANT_ATLAS,
]
