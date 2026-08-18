/**
 * 角色装备状态（全局单例 composable，与 useInventory 同一模式）
 *
 * 职责：武器栏 / 技能栏等装备槽的穿戴 / 卸下，localStorage 自动持久化。
 * 槽位只存物品 id（引用 config/items 定义），数量语义由背包保证
 * （可装备物品 stackLimit 均为 1，穿上即从背包取走整格）。
 */
import { reactive, watch } from 'vue'
import type { ImplantPart, ItemDef } from '../types'
import { getItemDef, implantLoadOf } from '../config/items'
import { BALANCE } from '../config/balance'

/**
 * 义体族名：取物品定义中显式声明的 implantFamily（同名不同品质的变体声明同一族名，
 * 如「泰坦重殖躯干」三件套均为 'implant-titan'）；未声明时回退为物品名称。
 * 同族义体全局限装配一件（无论品质）。
 */
export function implantFamilyOf(def: ItemDef | undefined): string | null {
  if (def?.category !== 'implant') return null
  return def.implantFamily ?? def.name
}

/** 义体承受度基础上限：已装配义体的承受值总和不得超过该值（可被 implantCapacityAdd 义体提高） */
export const IMPLANT_LOAD_CAP = 150

/** 从一组已装配义体（槽位 → 物品 id）中汇总承受度上限加成 */
function capacityBonusOf(implants: Record<string, string | null>): number {
  let bonus = 0
  for (const itemId of Object.values(implants)) {
    if (itemId) bonus += getItemDef(itemId)?.implantEffect?.implantCapacityAdd ?? 0
  }
  return bonus
}

/** 武器槽位 key */
export type WeaponSlotKey = 'weapon-1' | 'weapon-2'

/** 技能槽位 key */
export type SkillSlotKey = 'skill-1'

/** 义体部位（每部位 3 个等大义体槽） */
export const IMPLANT_PART_KEYS: readonly ImplantPart[] = ['head', 'body', 'legs']

/** 每个义体部位的槽位数 */
export const IMPLANT_SLOTS_PER_PART = 3

/** 义体槽位 key：如 head-1 / body-2 / legs-3 */
export type ImplantSlotKey = `${ImplantPart}-${number}`

/** 全部义体槽位 key（按部位顺序展开） */
export const IMPLANT_SLOT_KEYS: readonly ImplantSlotKey[] = IMPLANT_PART_KEYS.flatMap(
  (part) =>
    Array.from(
      { length: IMPLANT_SLOTS_PER_PART },
      (_, i) => `${part}-${i + 1}` as ImplantSlotKey
    )
)

/** 义体槽位 key → 所属部位 */
export function implantSlotPart(slot: ImplantSlotKey): ImplantPart {
  return slot.slice(0, slot.lastIndexOf('-')) as ImplantPart
}

export const WEAPON_SLOT_KEYS: readonly WeaponSlotKey[] = ['weapon-1', 'weapon-2']

function emptyWeapons(): Record<WeaponSlotKey, string | null> {
  return { 'weapon-1': null, 'weapon-2': null }
}

function emptyImplants(): Record<ImplantSlotKey, string | null> {
  return Object.fromEntries(IMPLANT_SLOT_KEYS.map((key) => [key, null])) as Record<
    ImplantSlotKey,
    string | null
  >
}

interface StoredEquipment {
  weapons: Record<WeaponSlotKey, string | null>
  skill: string | null
  implants: Record<ImplantSlotKey, string | null>
}

/** 从 localStorage 恢复装备；非法条目（定义不存在 / 非对应分类 / 部位不匹配）丢弃 */
function loadFromStorage(): StoredEquipment {
  const weapons = emptyWeapons()
  const implants = emptyImplants()
  let skill: string | null = null
  try {
    const raw = localStorage.getItem(BALANCE.storageKeys.equipment)
    if (!raw) return { weapons, skill, implants }
    const obj: unknown = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return { weapons, skill, implants }
    const rec = obj as Record<string, unknown>

    for (const key of WEAPON_SLOT_KEYS) {
      const itemId = rec[key]
      if (typeof itemId !== 'string') continue
      const def = getItemDef(itemId)
      if (def?.category === 'weapon') weapons[key] = itemId
    }

    // 技能槽恢复（兼容旧存档无 skill-1 字段）
    const skillId = rec['skill-1']
    if (typeof skillId === 'string') {
      const def = getItemDef(skillId)
      if (def?.category === 'skill') skill = skillId
    }

    // 义体槽恢复（兼容旧存档无义体字段；部位不匹配 / 重复装配 / 同族重复 / 超出承受度的条目丢弃）
    let loadUsed = 0
    const equippedFamilies = new Set<string>()
    for (const key of IMPLANT_SLOT_KEYS) {
      const itemId = rec[key]
      if (typeof itemId !== 'string') continue
      const def = getItemDef(itemId)
      if (def?.category !== 'implant' || def.implantPart !== implantSlotPart(key)) continue
      if (Object.values(implants).includes(itemId)) continue // 相同义体只允许一件
      const family = implantFamilyOf(def)
      if (family && equippedFamilies.has(family)) continue // 同名不同品质的同族义体也只允许一件
      const load = implantLoadOf(def)
      // 上限 = 基础值 + 已恢复义体的容量加成（容量义体自身不能帮助自己被装入）
      if (loadUsed + load > IMPLANT_LOAD_CAP + capacityBonusOf(implants)) continue // 超出承受度
      implants[key] = itemId
      if (family) equippedFamilies.add(family)
      loadUsed += load
    }
  } catch {
    /* 坏存档静默回退空装备 */
  }
  return { weapons, skill, implants }
}

const { weapons, skill, implants } = loadFromStorage()

const state = reactive({
  /** 武器槽：槽位 key → 物品 id（null = 空槽） */
  weapons,
  /** 技能槽：物品 id（null = 空槽） */
  skill: skill as string | null,
  /** 义体槽：槽位 key → 物品 id（null = 空槽） */
  implants,
})

// 任何变动自动持久化
watch(
  () => ({ ...state.weapons, 'skill-1': state.skill, ...state.implants }),
  (all) => {
    try {
      localStorage.setItem(BALANCE.storageKeys.equipment, JSON.stringify(all))
    } catch {
      /* 存储满 / 隐私模式下静默失败 */
    }
  },
  { deep: true }
)

export function useEquipment() {
  /**
   * 穿戴武器到槽位：返回被换下的旧武器 id（无则 null）。
   * 调用方负责把返回的旧武器放回背包、把新武器从背包取走。
   */
  function equipWeapon(slot: WeaponSlotKey, itemId: string): string | null {
    if (getItemDef(itemId)?.category !== 'weapon') return null
    const prev = state.weapons[slot]
    state.weapons[slot] = itemId
    return prev
  }

  /** 卸下武器：返回取下的物品 id（空槽返回 null），调用方负责放回背包 */
  function unequipWeapon(slot: WeaponSlotKey): string | null {
    const prev = state.weapons[slot]
    state.weapons[slot] = null
    return prev
  }

  /**
   * 穿戴技能到技能槽：返回被换下的旧技能 id（无则 null）。
   * 调用方负责把返回的旧技能放回背包、把新技能从背包取走。
   */
  function equipSkill(itemId: string): string | null {
    if (getItemDef(itemId)?.category !== 'skill') return null
    const prev = state.skill
    state.skill = itemId
    return prev
  }

  /** 卸下技能：返回取下的物品 id（空槽返回 null），调用方负责放回背包 */
  function unequipSkill(): string | null {
    const prev = state.skill
    state.skill = null
    return prev
  }

  /** 当前已装配义体的承受值总和（excludeSlot：忽略某槽位，用于换装前的预检） */
  function implantLoadUsed(excludeSlot?: ImplantSlotKey): number {
    let sum = 0
    for (const key of IMPLANT_SLOT_KEYS) {
      if (key === excludeSlot) continue
      const itemId = state.implants[key]
      if (itemId) sum += implantLoadOf(getItemDef(itemId))
    }
    return sum
  }

  /**
   * 当前义体承受度上限：基础值 + 已装配义体的容量加成
   * （excludeSlot：忽略某槽位，用于换装前的预检，与 implantLoadUsed 的语义保持一致）
   */
  function implantLoadCap(excludeSlot?: ImplantSlotKey): number {
    let cap = IMPLANT_LOAD_CAP
    for (const key of IMPLANT_SLOT_KEYS) {
      if (key === excludeSlot) continue
      const itemId = state.implants[key]
      if (itemId) cap += getItemDef(itemId)?.implantEffect?.implantCapacityAdd ?? 0
    }
    return cap
  }

  /** 义体装配被阻止的原因（null = 允许装配） */
  type ImplantEquipBlock = 'part-mismatch' | 'duplicate' | 'over-capacity' | null

  /**
   * 装配预检：返回阻止原因。
   * 部位匹配、相同义体（含同名不同品质的同族变体）只允许穿戴一件、
   * 装配后承受度不超过上限（槽位已有义体时视为换装，旧义体的承受值与容量加成均不计入）
   */
  function implantEquipBlock(slot: ImplantSlotKey, itemId: string): ImplantEquipBlock {
    const def = getItemDef(itemId)
    if (def?.category !== 'implant' || def.implantPart !== implantSlotPart(slot)) return 'part-mismatch'
    const family = implantFamilyOf(def)
    for (const key of IMPLANT_SLOT_KEYS) {
      if (key === slot) continue
      const otherId = state.implants[key]
      if (!otherId) continue
      if (otherId === itemId) return 'duplicate' // 相同义体限一件
      if (family && implantFamilyOf(getItemDef(otherId)) === family) return 'duplicate' // 同族不同品质也限一件
    }
    if (implantLoadUsed(slot) + implantLoadOf(def) > implantLoadCap(slot)) return 'over-capacity'
    return null
  }

  /** 是否允许把 itemId 装进义体槽（implantEquipBlock 的布尔封装） */
  function canEquipImplant(slot: ImplantSlotKey, itemId: string): boolean {
    return implantEquipBlock(slot, itemId) === null
  }

  /**
   * 穿戴义体到槽位：部位不匹配 / 重复装配（含同族变体） / 超出承受度时拒绝并返回 null。
   * 成功时返回被换下的旧义体 id（无则 null）。
   * 调用方负责把返回的旧义体放回背包、把新义体从背包取走。
   */
  function equipImplant(slot: ImplantSlotKey, itemId: string): string | null {
    if (!canEquipImplant(slot, itemId)) return null
    const prev = state.implants[slot]
    state.implants[slot] = itemId
    return prev
  }

  /**
   * 是否允许从义体槽卸下（义体离开槽位，回到背包）：
   * 卸下后其余义体的承受值总和不得超过剩余上限——
   * 仅容量义体（如阿特拉斯承负脊架）在"靠它撑着上限"时会触发阻止
   */
  function canUnequipImplant(slot: ImplantSlotKey): boolean {
    return implantLoadUsed(slot) <= implantLoadCap(slot)
  }

  /** 卸下义体：返回取下的物品 id（空槽 / 卸下会导致超上限时返回 null），调用方负责放回背包 */
  function unequipImplant(slot: ImplantSlotKey): string | null {
    if (!canUnequipImplant(slot)) return null
    const prev = state.implants[slot]
    state.implants[slot] = null
    return prev
  }

  /** 同部位槽位间移动 / 交换义体（已装配集合不变，不做承受度校验，容量义体也可自由换位） */
  function swapImplantSlots(a: ImplantSlotKey, b: ImplantSlotKey) {
    const tmp = state.implants[a]
    state.implants[a] = state.implants[b]
    state.implants[b] = tmp
  }

  return {
    state,
    equipWeapon,
    unequipWeapon,
    equipSkill,
    unequipSkill,
    equipImplant,
    unequipImplant,
    canEquipImplant,
    canUnequipImplant,
    implantEquipBlock,
    swapImplantSlots,
    implantLoadUsed,
    implantLoadCap,
  }
}
