/**
 * 物品出售价格表（单位：水晶）
 * 后期调价只改这一个文件：
 * - SELL_PRICE_BY_RARITY：稀有度默认价（未单独指定的物品按稀有度取价）
 * - SELL_PRICE_OVERRIDES：按物品 id 单独定价，优先级高于稀有度默认价
 */
import type { ItemDef, ItemRarity } from '../../types'

/** 稀有度默认出售价（单个） */
export const SELL_PRICE_BY_RARITY: Record<ItemRarity, number> = {
  common: 10,
  uncommon: 25,
  rare: 60,
  epic: 150,
  legendary: 400,
  mythic: 1000,
}

/** 单件定价（物品 id → 价格），需要单独定价的物品在这里加一行 */
export const SELL_PRICE_OVERRIDES: Record<string, number> = {
  // 示例：'wpn-rookie': 5,
}

/** 单个物品的出售价：单件定价优先，否则按稀有度默认价 */
export function getSellPrice(def: ItemDef): number {
  return SELL_PRICE_OVERRIDES[def.id] ?? SELL_PRICE_BY_RARITY[def.rarity] ?? 0
}
