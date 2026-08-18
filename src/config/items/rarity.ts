import type { ItemDef, ItemRarity } from '../../types'

/** 稀有度中文名（白 / 绿 / 蓝 / 紫 / 金 / 红）：科幻装备制造等级体系 */
export const RARITY_NAMES: Record<ItemRarity, string> = {
  common: '量产', // 流水线制式装备
  uncommon: '高等', // 精工打造的上等品
  rare: '军用', // 军工级规格
  epic: '试作', // 未量产的实验原型机
  legendary: '遗构', // 前文明遗产科技
  mythic: '神骸', // 弑神级遗物
}

/** 义体的承受值（非义体 / 不可装配的义体素材为 0）：每件义体在定义中独立配置 implantLoad */
export function implantLoadOf(def: ItemDef | undefined): number {
  return def?.category === 'implant' && def.implantPart ? (def.implantLoad ?? 0) : 0
}
