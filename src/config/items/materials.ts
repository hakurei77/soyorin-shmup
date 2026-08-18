import type { ItemDef } from '../../types'
import crystalIcon from '../../assets/icon/crystal.png'

/** 水晶：通用货币，同时也是背包道具（界面显示的货币数 = 背包中水晶总量） */
export const ITEM_CRYSTAL: ItemDef = {
  id: 'crystal',
  name: '水晶',
  category: 'material',
  rarity: 'epic',
  desc: '泛用型能量结晶，是流通最广的硬通货。',
  icon: crystalIcon,
  stackLimit: 999999,
}

/** 材料类物品列表（新增在此追加，无需改注册表） */
export const MATERIAL_ITEMS: ItemDef[] = [ITEM_CRYSTAL]
