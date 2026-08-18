/**
 * 背包状态（全局单例 composable）
 * 项目未引入 pinia：模块级 reactive 单例即可跨组件共享，
 * 与 utils/bgm.ts、utils/settings.ts 的模式一致。
 *
 * 职责：水晶货币、背包物品的增删 / 堆叠 / 拖拽移动 / 旋转 / 整理排序。
 * 背包为定长槽位模型：物品以左上角锚点存入槽位数组，按 size 矩形占格
 * （null = 空格），只支持矩形，rotated 时宽高互换。
 * 物品静态定义见 config/items.ts。
 */
import { computed, reactive, watch } from 'vue'
import type { InvItem, ItemCategory, ItemRarity } from '../types'
import { getItemDef, ITEM_CRYSTAL } from '../config/items'
import { BALANCE } from '../config/balance'

/** 新用户首次进入赠送的水晶数量（货币 = 背包中的水晶道具，首次进入时一次性发放） */
export const NEWBIE_CRYSTAL = 5000

/** 背包网格：8 列 × 50 行 = 400 格 */
export const INVENTORY_COLS = 8
export const INVENTORY_ROWS = 50
export const INVENTORY_CAPACITY = INVENTORY_COLS * INVENTORY_ROWS

/** 初始背包（无存档时使用，anchor = 左上角锚点格下标，需互不重叠；水晶由首次进入发放，不在此预置） */
const INITIAL_ITEMS: Array<InvItem & { anchor: number }> = [
  { itemId: 'wpn-rookie', count: 1, anchor: 1 }, // 2×1 → 占 1,2
  { itemId: 'skill-synaptic', count: 1, anchor: 10 }, // 1×1 → 突触超频
]

/* ==================== 矩形占格工具 ==================== */

/** 物品实际占格尺寸（rotated 时宽高互换） */
function sizeOf(itemId: string, rotated?: boolean): { w: number; h: number } {
  const size = getItemDef(itemId)?.size ?? { w: 1, h: 1 }
  return rotated ? { w: size.h, h: size.w } : size
}

/** 锚点 + 尺寸 → 覆盖的格子下标数组；越界返回 null */
function rectCells(anchor: number, w: number, h: number): number[] | null {
  const col = anchor % INVENTORY_COLS
  const row = Math.floor(anchor / INVENTORY_COLS)
  if (anchor < 0 || col + w > INVENTORY_COLS || row + h > INVENTORY_ROWS) return null
  const cells: number[] = []
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      cells.push((row + r) * INVENTORY_COLS + col + c)
    }
  }
  return cells
}

/* ==================== 存档 ==================== */

/** 初始槽位（无存档时使用） */
function initialSlots(): Array<InvItem | null> {
  const slots: Array<InvItem | null> = new Array(INVENTORY_CAPACITY).fill(null)
  const occ = new Set<number>()
  for (const { anchor, ...item } of INITIAL_ITEMS) {
    const { w, h } = sizeOf(item.itemId, item.rotated)
    const cells = rectCells(anchor, w, h)
    if (!cells || cells.some((c) => occ.has(c))) continue
    cells.forEach((c) => occ.add(c))
    slots[anchor] = { itemId: item.itemId, count: item.count, rotated: item.rotated || undefined }
  }
  return slots
}

/** 从 localStorage 读取存档；逐格校验（定义存在 / 数量合法 / 占格不重叠），坏格子丢弃 */
function loadSlots(): Array<InvItem | null> {
  try {
    const raw = localStorage.getItem(BALANCE.storageKeys.inventory)
    if (!raw) return initialSlots()
    const arr: unknown = JSON.parse(raw)
    if (!Array.isArray(arr)) return initialSlots()
    const slots: Array<InvItem | null> = new Array(INVENTORY_CAPACITY).fill(null)
    const occ = new Set<number>()
    arr.forEach((s, anchor) => {
      const slot = s as InvItem | null
      if (!slot || typeof slot.itemId !== 'string' || !getItemDef(slot.itemId)) return
      if (typeof slot.count !== 'number' || slot.count <= 0) return
      const { w, h } = sizeOf(slot.itemId, slot.rotated)
      const cells = rectCells(anchor, w, h)
      if (!cells || cells.some((c) => occ.has(c))) return
      cells.forEach((c) => occ.add(c))
      slots[anchor] = {
        itemId: slot.itemId,
        count: Math.floor(slot.count),
        rotated: slot.rotated || undefined,
      }
    })
    return slots
  } catch {
    return initialSlots()
  }
}

const state = reactive({
  /** 背包槽位：定长，仅锚点格存物品，null 为空格；启动时从 localStorage 恢复 */
  slots: loadSlots(),
})

// 任何变动（拖拽 / 增删 / 整理）自动持久化到 localStorage
watch(
  () => state.slots,
  (slots) => {
    try {
      localStorage.setItem(BALANCE.storageKeys.inventory, JSON.stringify(slots))
    } catch {
      /* 存储满 / 隐私模式下静默失败 */
    }
  },
  { deep: true }
)

/** 水晶总量：背包中所有水晶格的合计（货币与道具同源） */
const crystal = computed(() =>
  state.slots.reduce(
    (n, s) => (s?.itemId === ITEM_CRYSTAL.id ? n + s.count : n),
    0
  )
)

/* ==================== 占用分析 ==================== */

const RARITY_RANK: Record<ItemRarity, number> = {
  mythic: 0,
  legendary: 1,
  epic: 2,
  rare: 3,
  uncommon: 4,
  common: 5,
}
const CATEGORY_RANK: Record<ItemCategory, number> = { weapon: 0, implant: 1, material: 2, skill: 3 }

function stackLimitOf(itemId: string): number {
  return getItemDef(itemId)?.stackLimit ?? 99
}

/** 占用表：格子下标 → 占据它的物品锚点（null 为空格），ignore 中的锚点不计 */
function buildOccupancy(ignore: ReadonlySet<number> = new Set<number>()): Array<number | null> {
  const occ: Array<number | null> = new Array(INVENTORY_CAPACITY).fill(null)
  state.slots.forEach((slot, anchor) => {
    if (!slot || ignore.has(anchor)) return
    const { w, h } = sizeOf(slot.itemId, slot.rotated)
    for (const c of rectCells(anchor, w, h) ?? []) occ[c] = anchor
  })
  return occ
}

/** 在占用表上找第一个能放下的位置（先自然方向，再旋转方向） */
function findSpotIn(
  occ: Array<number | null>,
  itemId: string
): { anchor: number; rotated: boolean } | null {
  const natural = sizeOf(itemId, false)
  const turned = sizeOf(itemId, true)
  const orientations =
    natural.w === turned.w && natural.h === turned.h
      ? [{ ...natural, rotated: false }]
      : [
          { ...natural, rotated: false },
          { ...turned, rotated: true },
        ]
  for (const o of orientations) {
    for (let anchor = 0; anchor < INVENTORY_CAPACITY; anchor++) {
      const cells = rectCells(anchor, o.w, o.h)
      if (cells && cells.every((c) => occ[c] === null)) return { anchor, rotated: o.rotated }
    }
  }
  return null
}

/** 落点分析：move 直接放 / merge 合并 / invalid 不可放（压到物品即不可放，无交换） */
function analyzeDrop(
  from: number,
  to: number,
  rotated: boolean
): 'move' | 'merge' | 'invalid' {
  const a = state.slots[from]
  if (!a) return 'invalid'
  const { w, h } = sizeOf(a.itemId, rotated)
  const targetCells = rectCells(to, w, h)
  if (!targetCells) return 'invalid'

  const occ = buildOccupancy(new Set([from]))
  const overlapping = new Set<number>()
  for (const c of targetCells) {
    const v = occ[c]
    if (v !== null) overlapping.add(v)
  }

  if (overlapping.size === 0) return 'move'
  if (overlapping.size > 1) return 'invalid'

  const bAnchor = [...overlapping][0]
  const b = state.slots[bAnchor]
  if (!b) return 'invalid'
  const bs = sizeOf(b.itemId, b.rotated)

  // 同种、同形同向、可堆叠 → 合并
  const limit = stackLimitOf(a.itemId)
  if (b.itemId === a.itemId && limit > 1 && bs.w === w && bs.h === h && b.count < limit) {
    return 'merge'
  }

  return 'invalid'
}

/** 拖拽落点是否可行（界面预览高亮用） */
export function canDropAt(from: number, to: number, rotated: boolean): boolean {
  return analyzeDrop(from, to, rotated) !== 'invalid'
}

/** 拆分放置预览：to 处是否全为空位可放 itemId（rotated 姿态） */
export function canPlaceAt(itemId: string, to: number, rotated: boolean): boolean {
  const { w, h } = sizeOf(itemId, rotated)
  const cells = rectCells(to, w, h)
  if (!cells) return false
  const occ = buildOccupancy()
  return cells.every((c) => occ[c] === null)
}

export function useInventory() {
  /** 添加物品：先堆叠进已有同种格，再找空位开新格；返回实际放入数量 */
  function addItem(itemId: string, count = 1): number {
    if (!getItemDef(itemId) || count <= 0) return 0
    const limit = stackLimitOf(itemId)
    let remaining = count

    if (limit > 1) {
      for (const slot of state.slots) {
        if (!slot || slot.itemId !== itemId || slot.count >= limit) continue
        const add = Math.min(limit - slot.count, remaining)
        slot.count += add
        remaining -= add
        if (remaining === 0) return count
      }
    }
    while (remaining > 0) {
      const spot = findSpotIn(buildOccupancy(), itemId)
      if (!spot) break // 背包满
      const add = Math.min(limit, remaining)
      state.slots[spot.anchor] = { itemId, count: add, rotated: spot.rotated || undefined }
      remaining -= add
    }
    return count - remaining
  }

  /** 移除物品：总量不足则不动并返回 false */
  function removeItem(itemId: string, count = 1): boolean {
    const total = state.slots.reduce(
      (n, s) => (s?.itemId === itemId ? n + s.count : n),
      0
    )
    if (total < count) return false

    let remaining = count
    for (let i = state.slots.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = state.slots[i]
      if (!slot || slot.itemId !== itemId) continue
      const take = Math.min(slot.count, remaining)
      slot.count -= take
      remaining -= take
      if (slot.count <= 0) state.slots[i] = null
    }
    return true
  }

  /**
   * 拖拽放置（rotated 为拖拽中的旋转姿态）：
   * 空位移动 / 同种合并 / 压到其他物品或越界则不动
   */
  function moveSlot(from: number, to: number, rotated?: boolean) {
    const a = state.slots[from]
    if (!a) return
    const nextRotated = rotated ?? !!a.rotated
    const action = analyzeDrop(from, to, nextRotated)
    if (action === 'invalid') return

    if (action === 'move') {
      state.slots[from] = null
      state.slots[to] = { ...a, rotated: nextRotated || undefined }
      return
    }

    // merge：找到被压到的那个同种物品，并入堆叠
    const { w, h } = sizeOf(a.itemId, nextRotated)
    const occ = buildOccupancy(new Set([from]))
    const hitCell = rectCells(to, w, h)!.find((c) => occ[c] !== null)!
    const b = state.slots[occ[hitCell]!]!
    const limit = stackLimitOf(a.itemId)
    const move = Math.min(limit - b.count, a.count)
    b.count += move
    a.count -= move
    if (a.count <= 0) state.slots[from] = null
  }

  /**
   * 拆分放置：从 anchor 分出 count 个放到 to（to 必须全是空位，不能压任何物品）；
   * 来源数量清零时移除原格。返回是否成功
   */
  function placeSplit(from: number, to: number, count: number, rotated: boolean): boolean {
    const a = state.slots[from]
    if (!a || count <= 0 || count > a.count) return false
    const { w, h } = sizeOf(a.itemId, rotated)
    const cells = rectCells(to, w, h)
    if (!cells) return false
    const occ = buildOccupancy()
    if (cells.some((c) => occ[c] !== null)) return false
    a.count -= count
    if (a.count <= 0) state.slots[from] = null
    state.slots[to] = { itemId: a.itemId, count, rotated: rotated || undefined }
    return true
  }

  /** 增加水晶（传负数即尝试扣减，不足则不扣） */
  function addCrystal(n: number) {
    if (n >= 0) addItem(ITEM_CRYSTAL.id, n)
    else removeItem(ITEM_CRYSTAL.id, -n)
  }

  /** 尝试消费水晶：不足则不动并返回 false */
  function spendCrystal(n: number): boolean {
    return removeItem(ITEM_CRYSTAL.id, n)
  }

  /** 整理：合并同种堆叠，按 分类 → 稀有度 → 数量 排序，取消旋转后紧凑重排 */
  function sortInventory() {
    // 按 id 汇总总量
    const byId = new Map<string, number>()
    for (const slot of state.slots) {
      if (!slot) continue
      byId.set(slot.itemId, (byId.get(slot.itemId) ?? 0) + slot.count)
    }
    // 按堆叠上限重新分格
    const merged: InvItem[] = []
    for (const [itemId, total] of byId) {
      const limit = stackLimitOf(itemId)
      let remaining = total
      while (remaining > 0) {
        const c = Math.min(limit, remaining)
        merged.push({ itemId, count: c })
        remaining -= c
      }
    }
    merged.sort((a, b) => {
      const da = getItemDef(a.itemId)
      const db = getItemDef(b.itemId)
      if (!da || !db) return 0
      return (
        CATEGORY_RANK[da.category] - CATEGORY_RANK[db.category] ||
        RARITY_RANK[da.rarity] - RARITY_RANK[db.rarity] ||
        b.count - a.count
      )
    })
    // 紧凑重排（逐个 first-fit）
    const next: Array<InvItem | null> = new Array(INVENTORY_CAPACITY).fill(null)
    const occ: Array<number | null> = new Array(INVENTORY_CAPACITY).fill(null)
    for (const item of merged) {
      const spot = findSpotIn(occ, item.itemId)
      if (!spot) continue // 理论上不会发生（物品总数不变）
      const { w, h } = sizeOf(item.itemId, spot.rotated)
      for (const c of rectCells(spot.anchor, w, h) ?? []) occ[c] = spot.anchor
      next[spot.anchor] = { ...item, rotated: spot.rotated || undefined }
    }
    state.slots = next
  }

  return {
    state,
    crystal,
    addItem,
    removeItem,
    moveSlot,
    placeSplit,
    addCrystal,
    spendCrystal,
    sortInventory,
  }
}
