import type { ItemDef } from '../../types'
import ramhammerIcon from '../../assets/items/weapons/ramhammer.png'
import mountainshearIcon from '../../assets/items/weapons/mountainshear.png'
import sledgefistIcon from '../../assets/items/weapons/sledgefist.png'
import rookieIcon from '../../assets/items/weapons/rookie.png'
import vesperIcon from '../../assets/items/weapons/vesper.png'
import auroraIcon from '../../assets/items/weapons/aurora.png'
import heliosIcon from '../../assets/items/weapons/helios.png'
import teslaIcon from '../../assets/items/weapons/tesla.png'
import novaIcon from '../../assets/items/weapons/nova.png'

/** 新人手枪：与武器库 WPN-01 打通 */
export const ITEM_WPN_ROOKIE: ItemDef = {
  id: 'wpn-rookie',
  name: '新人手枪',
  category: 'weapon',
  rarity: 'common',
  desc: '制式配发的入门级手枪，射速稳定、弹道笔直。',
  stackLimit: 1,
  icon: rookieIcon,
  iconScale: 1.4,
  kind: '技术武器',
  size: { w: 2, h: 1 },
  weaponKey: 'WPN-01',
}

/** 磐舟重工 AH-01 伏尔甘：制式动能步枪 */
export const ITEM_WPN_RAMHAMMER: ItemDef = {
  id: 'wpn-ramhammer',
  name: '伏尔甘',
  category: 'weapon',
  rarity: 'common',
  desc: '磐舟重工制式动能步枪。火药燃气推动的钨芯弹丸，结构简单到任何殖民地机修工都能用扳手修好它。',
  icon: ramhammerIcon,
  iconScale: 1.5,
  kind: '动能武器',
  stackLimit: 1,
  size: { w: 4, h: 2 },
  weaponKey: 'AH-01',
}

/** 磐舟重工 AH-02 妙尔尼尔：反器材动能步枪 */
export const ITEM_WPN_MOUNTAINSHEAR: ItemDef = {
  id: 'wpn-mountainshear',
  name: '妙尔尼尔',
  category: 'weapon',
  rarity: 'common',
  desc: '磐舟重工反器材动能步枪。没有什么目标是一发足够重的钨芯弹解决不了的——如果有，那就换更大的口径。',
  icon: mountainshearIcon,
  iconScale: 3,
  kind: '动能武器',
  stackLimit: 1,
  size: { w: 5, h: 1 },
  weaponKey: 'AH-02',
}

/** 磐舟重工 AH-03 塔罗斯：大口径动能手枪 */
export const ITEM_WPN_SLEDGEFIST: ItemDef = {
  id: 'wpn-sledgefist',
  name: '塔罗斯',
  category: 'weapon',
  rarity: 'common',
  desc: '磐舟重工大口径动能手枪。开火如一记抡圆的重锤，后坐力与威力同样惊人，掉进泥里捡起来照样开火。',
  icon: sledgefistIcon,
  iconScale: 1.4,
  kind: '动能武器',
  stackLimit: 1,
  size: { w: 2, h: 1 },
  weaponKey: 'AH-03',
}

/** 流明光电 LW-01 薇丝珀：电磁手枪 */
export const ITEM_WPN_VESPER: ItemDef = {
  id: 'wpn-vesper',
  name: '薇丝珀',
  category: 'weapon',
  rarity: 'common',
  desc: '流明光电电磁手枪。加速线圈将弹芯瞬息推至数倍音速，开火时只有线圈充能的低鸣。',
  icon: vesperIcon,
  iconScale: 1.4,
  kind: '技术武器',
  stackLimit: 1,
  size: { w: 2, h: 1 },
  weaponKey: 'LW-01',
}

/** 流明光电 LW-02 奥罗拉：电磁突击步枪 */
export const ITEM_WPN_AURORA: ItemDef = {
  id: 'wpn-aurora',
  name: '奥罗拉',
  category: 'weapon',
  rarity: 'common',
  desc: '流明光电电磁突击步枪。纯白装甲板与橙色几何条纹之下，是联邦正规军最信赖的多级线圈加速系统。',
  icon: auroraIcon,
  iconScale: 1.5,
  kind: '技术武器',
  stackLimit: 1,
  size: { w: 4, h: 2 },
  weaponKey: 'LW-02',
}

/** 流明光电 LW-03 赫利俄斯：重型磁轨枪 */
export const ITEM_WPN_HELIOS: ItemDef = {
  id: 'wpn-helios',
  name: '赫利俄斯',
  category: 'weapon',
  rarity: 'common',
  desc: '流明光电重型磁轨枪。堆叠式加速线圈组的集大成之作，光速之下，众生平等。',
  icon: heliosIcon,
  iconScale: 1.5,
  kind: '激光武器',
  stackLimit: 1,
  size: { w: 4, h: 2 },
  weaponKey: 'LW-03',
}

/** 流明光电 LW-04 特斯拉：电弧发射器 */
export const ITEM_WPN_TESLA: ItemDef = {
  id: 'wpn-tesla',
  name: '电弧发射器',
  category: 'weapon',
  rarity: 'common',
  desc: '流明光电电弧发射器。长按扳机为电容组充能 3 秒，松开扳机将全部能量压缩成一颗高浓度电弧弹一次射出。',
  icon: teslaIcon,
  iconScale: 2,
  kind: '技术武器',
  stackLimit: 1,
  size: { w: 5, h: 2 },
  weaponKey: 'LW-04',
}

/** 流明光电 LW-05 诺瓦：电磁轻机枪 */
export const ITEM_WPN_NOVA: ItemDef = {
  id: 'wpn-nova',
  name: '诺瓦',
  category: 'weapon',
  rarity: 'common',
  desc: '流明光电电磁轻机枪。多级线圈组以极限转速倾泻聚能弹芯，持续射击会使线圈组过热锁机——火力与散热之间的平衡，是使用者的必修课。',
  icon: novaIcon,
  iconScale: 2,
  kind: '技术武器',
  stackLimit: 1,
  size: { w: 5, h: 2 },
  weaponKey: 'LW-05',
}

/** 武器类物品列表（新增武器在此追加，无需改注册表） */
export const WEAPON_ITEMS: ItemDef[] = [
  ITEM_WPN_ROOKIE,
  ITEM_WPN_RAMHAMMER,
  ITEM_WPN_MOUNTAINSHEAR,
  ITEM_WPN_SLEDGEFIST,
  ITEM_WPN_VESPER,
  ITEM_WPN_AURORA,
  ITEM_WPN_HELIOS,
  ITEM_WPN_TESLA,
  ITEM_WPN_NOVA,
]
