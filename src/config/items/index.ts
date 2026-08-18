/**
 * 物品定义表（数据驱动）
 * 每个物品一个定义，按功能分类放在同目录文件（weapons / implants / materials ...），
 * 背包（composables/useInventory.ts）通过 id 引用。
 * 新增物品：在对应分类文件里加一条定义并追加进该分类的列表即可，注册表自动聚合。
 *
 * 武器类物品通过 weaponKey 关联 weapons/playerWeapons.ts，
 * 详情页可直接读取 PLAYER_WEAPONS[weaponKey] 拿到伤害/射速等参数。
 */
import type { ItemDef } from '../../types'
import { WEAPON_ITEMS } from './weapons'
import { IMPLANT_ITEMS } from './implants'
import { MATERIAL_ITEMS } from './materials'
import { SKILL_ITEMS } from './skills'

export * from './rarity'
export * from './kinds'
export * from './prices'
export * from './weapons'
export * from './implants'
export * from './materials'
export * from './skills'

/** 物品注册表：id → 物品定义（自动聚合各分类列表） */
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  [...WEAPON_ITEMS, ...IMPLANT_ITEMS, ...MATERIAL_ITEMS, ...SKILL_ITEMS].map((item) => [item.id, item]),
)

/** 物品列表（需要遍历全部物品时用） */
export const ITEM_LIST: ItemDef[] = Object.values(ITEMS)

/** 按 id 查物品定义，不存在返回 undefined */
export function getItemDef(id: string): ItemDef | undefined {
  return ITEMS[id]
}
