<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ImplantPart, ItemCategory, ItemRarity } from '@/types'
import { playSfx, preloadSfx } from '@/utils/sfx'
import pickupWeaponSfx from '@/assets/audio/ui/item-pickup-weapon.wav'
import pickupImplantSfx from '@/assets/audio/ui/item-pickup-implant.wav'
import pickupMaterialSfx from '@/assets/audio/ui/item-pickup-material.wav'
import itemDropSfx from '@/assets/audio/ui/item-drop.wav'
import btnHoverSfx from '@/assets/audio/ui/btn-hover.wav'
import deckClickSfx from '@/assets/audio/ui/deck-click.wav'
import shopBuySfx from '@/assets/audio/ui/shop-buy.wav'
import {
  getItemDef,
  getSellPrice,
  implantLoadOf,
  ITEM_CRYSTAL,
  KIND_COLORS,
  KIND_COLOR_DEFAULT,
  RARITY_NAMES,
} from '@/config/items'
import { PLAYER_WEAPONS } from '@/weapons/playerWeapons'
import { CHARACTERS as LOADOUT_CHARACTERS, resolveCharacterStats } from '@/config/loadout'
import { BALANCE } from '@/config/balance'
import {
  INVENTORY_CAPACITY,
  INVENTORY_COLS,
  INVENTORY_ROWS,
  canDropAt,
  canPlaceAt,
  useInventory,
} from '@/composables/useInventory'
import {
  IMPLANT_SLOT_KEYS,
  implantFamilyOf,
  implantSlotPart,
  useEquipment,
  type ImplantSlotKey,
  type WeaponSlotKey,
} from '@/composables/useEquipment'
import bg2Url from '@/assets/background/bg2.png'
import crystalIcon from '@/assets/icon/crystal.png'
import miaonaiAvatar from '@/assets/character/miaonai-avatar.png'
import miaonaiPortrait from '@/assets/character/miaonai.png'
import weaponShadow from '@/assets/items/weapons/shadow.png'

const emit = defineEmits<{ back: []; training: [] }>()

const COLS = INVENTORY_COLS
const ROWS = INVENTORY_ROWS
const CAPACITY = INVENTORY_CAPACITY
const GAP_PX = 5

/** 物品拾取音效：按物品种类区分（技能与义体共用同一素材，用户指定）；放下全种类共用 */
const PICKUP_SFX: Record<ItemCategory, string> = {
  weapon: pickupWeaponSfx,
  implant: pickupImplantSfx,
  skill: pickupImplantSfx,
  material: pickupMaterialSfx,
}

function playPickupSfx(category: ItemCategory | undefined) {
  playSfx(PICKUP_SFX[category ?? 'material'])
}

/* ---------- 界面按钮音效：hover 全站统一音色，click 用确认音 ---------- */
function onBtnHover() {
  playSfx(btnHoverSfx)
}

/** 出售按钮 hover：无选中置灰时不发声 */
function onSellBtnHover() {
  if (selectedCount.value === 0) return
  playSfx(btnHoverSfx)
}

function onBackClick() {
  playSfx(deckClickSfx)
  emit('back')
}

function onTrainingClick() {
  playSfx(deckClickSfx)
  emit('training')
}

/** 角色页签点击：重复点当前角色不发声 */
function onUnitClick(id: (typeof CHARACTERS)[number]['id']) {
  if (activeUnit.value === id) return
  playSfx(deckClickSfx)
  activeUnit.value = id
}

/** 背包页签点击：重复点当前页签不发声 */
function onTabClick(key: TabKey) {
  if (activeTab.value === key) return
  playSfx(deckClickSfx)
  activeTab.value = key
}

function onCancelClick() {
  playSfx(deckClickSfx)
  exitSelectMode()
}

/** 批量出售：交易确认用水晶入账脆响（与商店购买同素材） */
function onSellSelectedClick() {
  playSfx(shopBuySfx)
  sellSelected()
}

function onSortClick() {
  playSfx(deckClickSfx)
  sortInventory()
}

function onDetailClick() {
  playSfx(deckClickSfx)
  onDetail()
}

function onSplitClick() {
  playSfx(deckClickSfx)
  onSplit()
}

/** 右键菜单出售：交易确认用水晶入账脆响（与商店购买同素材） */
function onCtxSellClick() {
  playSfx(shopBuySfx)
  onSell()
}

function onCloseDetailClick(win: DetailWin) {
  playSfx(deckClickSfx)
  closeDetail(win)
}

onMounted(() => {
  for (const url of Object.values(PICKUP_SFX)) preloadSfx(url)
  preloadSfx(itemDropSfx)
  preloadSfx(btnHoverSfx)
  preloadSfx(deckClickSfx)
  preloadSfx(shopBuySfx)
})

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'weapon', label: '武器' },
  { key: 'implant', label: '义体' },
  { key: 'skill', label: '技能' },
  { key: 'material', label: '材料' },
] as const

type TabKey = (typeof TABS)[number]['key']

const activeTab = ref<TabKey>('all')

/* ---------- 角色选择（占位数据，后续接入角色立绘） ---------- */
const CHARACTERS = [
  { id: 'unit-01', name: '喵奈', code: 'UNIT-01' },
] as const

const activeUnit = ref<(typeof CHARACTERS)[number]['id']>('unit-01')

/* ---------- 装备槽（占位 UI，后续接入装备数据与拖放装备） ---------- */
/** 义体部位：头部 / 身体 / 腿部，每个部位 3 个等大义体槽 */
const IMPLANT_PARTS = [
  { key: 'head', label: '头部', en: 'HEAD' },
  { key: 'body', label: '躯干', en: 'BODY' },
  { key: 'legs', label: '腿部', en: 'LEGS' },
] as const

const SLOTS_PER_IMPLANT = 3

const WEAPON_SLOTS = [
  { key: 'weapon-1', label: '武器Ⅰ', en: 'PRIMARY' },
  { key: 'weapon-2', label: '武器Ⅱ', en: 'SECONDARY' },
] as const

const { state, sortInventory, moveSlot, placeSplit, addItem, addCrystal, crystal } = useInventory()
const {
  state: equipState,
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
} = useEquipment()

/* ---------- 通用软提醒：装配 / 卸下被规则阻止时飘出（堆叠 toast，各自独立消失，不阻断操作） ---------- */
interface NoticeTip {
  id: number
  text: string
}

const noticeTips = ref<NoticeTip[]>([])
let noticeSeq = 0

function showNotice(msg: string) {
  const id = ++noticeSeq
  noticeTips.value.push({ id, text: msg })
  window.setTimeout(() => {
    noticeTips.value = noticeTips.value.filter(t => t.id !== id)
  }, 2200)
}

/** 武器槽已装备的武器定义（空槽为 null） */
function equippedDef(slotKey: WeaponSlotKey) {
  const id = equipState.weapons[slotKey]
  return id ? (getItemDef(id) ?? null) : null
}

/** 技能槽已装备的技能定义（空槽为 null） */
const equippedSkillDef = computed(() => {
  const id = equipState.skill
  return id ? (getItemDef(id) ?? null) : null
})

/** 部位 + 序号 → 义体槽位 key（如 head-1 / body-2 / legs-3） */
function implantSlotKeyOf(part: ImplantPart, index: number): ImplantSlotKey {
  return `${part}-${index}` as ImplantSlotKey
}

/** 义体槽已装备的义体定义（空槽为 null） */
function implantSlotDef(slotKey: ImplantSlotKey) {
  const id = equipState.implants[slotKey]
  return id ? (getItemDef(id) ?? null) : null
}

/** 属性变化行：标签 + 带符号数值 + 是否有利（配色用） */
interface ImplantStatLine {
  label: string
  value: string
  positive: boolean
}

/** 已装备义体的属性变化汇总（义体槽右侧面板用；加算项累加，承伤倍率乘算） */
const implantStatLines = computed<ImplantStatLine[]>(() => {
  let hp = 0
  let hpPct = 0
  let shield = 0
  let shieldPct = 0
  let shieldRegen = 0
  let move = 0
  let regen = 0
  let dash = 0
  let dashInv = 0
  let dashDist = 0
  let atk = 0
  let dodge = 0
  let dmgMul = 1
  let breakMul = 1
  let homing = false
  let autoAim = false
  let capacity = 0
  let guard: { name: string; cooldownSec: number; invincibleSec: number; attackAdd?: number } | null = null
  for (const key of IMPLANT_SLOT_KEYS) {
    const itemId = equipState.implants[key]
    const fx = (itemId ? getItemDef(itemId) : undefined)?.implantEffect
    if (!fx) continue
    hp += fx.hpAdd ?? 0
    hpPct += fx.hpPctAdd ?? 0
    shield += fx.shieldAdd ?? 0
    shieldPct += fx.shieldPctAdd ?? 0
    shieldRegen += fx.shieldRegenAdd ?? 0
    move += fx.moveSpeedAdd ?? 0
    regen += fx.skillRegenAdd ?? 0
    dash += fx.dashChargesAdd ?? 0
    dashInv += fx.dashInvincibleAdd ?? 0
    dashDist += fx.dashDistanceAdd ?? 0
    atk += fx.attackAdd ?? 0
    dodge += fx.dodgeChance ?? 0
    if (fx.bulletHoming) homing = true
    if (fx.autoAimRange) autoAim = true
    capacity += fx.implantCapacityAdd ?? 0
    if (fx.deathGuard && (!guard || fx.deathGuard.cooldownSec < guard.cooldownSec)) guard = fx.deathGuard
    if (fx.damageTakenMul !== undefined) dmgMul *= fx.damageTakenMul
    if (fx.shieldBreakMul !== undefined) breakMul *= fx.shieldBreakMul
  }
  const signed = (v: number) => `${v > 0 ? '+' : ''}${v}`
  const pct = (v: number) => `${signed(Math.round(v * 100))}%`
  const lines: ImplantStatLine[] = []
  if (hp) lines.push({ label: '生命上限', value: signed(hp), positive: hp > 0 })
  if (hpPct) lines.push({ label: '生命上限', value: pct(hpPct), positive: hpPct > 0 })
  if (shield) lines.push({ label: '护盾上限', value: signed(shield), positive: shield > 0 })
  if (shieldPct) lines.push({ label: '护盾上限', value: pct(shieldPct), positive: shieldPct > 0 })
  if (shieldRegen) lines.push({ label: '护盾恢复', value: `+${shieldRegen} / 秒`, positive: shieldRegen > 0 })
  if (breakMul !== 1) lines.push({ label: '护盾熔断时间', value: pct(breakMul - 1), positive: breakMul < 1 })
  if (move) lines.push({ label: '移动速度', value: pct(move), positive: move > 0 })
  if (regen) lines.push({ label: '技能回复', value: pct(regen), positive: regen > 0 })
  if (dash) lines.push({ label: '折跃充能', value: signed(dash), positive: dash > 0 })
  if (dashInv) lines.push({ label: '折跃无敌', value: `+${dashInv.toFixed(1)} 秒`, positive: true })
  if (dashDist) lines.push({ label: '折跃距离', value: pct(dashDist), positive: dashDist > 0 })
  if (atk) lines.push({ label: '造成伤害', value: pct(atk), positive: atk > 0 })
  if (dodge) lines.push({ label: '闪避率', value: pct(dodge), positive: dodge > 0 })
  if (guard) {
    lines.push({ label: '获得', value: `「${guard.name}」`, positive: true })
  }
  if (homing) lines.push({ label: '获得', value: '「弹丸跟踪」', positive: true })
  if (autoAim) lines.push({ label: '获得', value: '「自动索敌」', positive: true })
  if (capacity) lines.push({ label: '义体容量', value: signed(capacity), positive: capacity > 0 })
  if (Math.abs(dmgMul - 1) > 1e-9) {
    lines.push({ label: '受到伤害', value: pct(dmgMul - 1), positive: dmgMul < 1 })
  }
  // 增益行永远在前、减益行在后（稳定排序，同组内保持原有顺序）
  return lines.slice().sort((a, b) => Number(b.positive) - Number(a.positive))
})

/** 角色基础属性面板行（出厂数值 + balance 默认机制参数，不含义体修正） */
const baseStatLines = computed(() => {
  const stats = resolveCharacterStats(LOADOUT_CHARACTERS[0]!)
  const P = BALANCE.player
  const sec = (frames: number) => `${(frames / 60).toFixed(1)} 秒`
  return [
    { label: '生命上限', value: `${stats.hp}` },
    { label: '护盾上限', value: `${stats.shield}` },
    { label: '移动速度', value: `${stats.fastSpeed}` },
    { label: '精密移动', value: `${stats.slowSpeed}` },
    { label: '冲刺速度', value: `×${stats.sprintSpeedMul}` },
    { label: '判定半径', value: `${P.hitboxRadius} 像素` },
    { label: '受击无敌', value: sec(stats.hitInvincible) },
    { label: '折跃距离', value: `${P.dashDistance} 像素` },
    { label: '折跃充能', value: `${P.dashMaxCharges} 格` },
    { label: '充能回复', value: `${sec(P.dashRecover)} / 格` },
    { label: '折跃无敌', value: sec(P.dashInvincible) },
    { label: '护盾回复', value: `+${P.shieldRegenPerSec} / 秒` },
    { label: '回复延迟', value: `承伤后 ${sec(P.shieldRegenDelayFrames)}` },
    { label: '护盾熔断', value: sec(P.shieldBreakFrames) },
  ]
})

/** 已装配义体的承受值总和（equipState 是 reactive，依赖其字段自动追踪） */
const implantLoad = computed(() => implantLoadUsed())

/** 当前承受度上限（基础 150 + 已装配容量义体的加成，如阿特拉斯承负脊架） */
const implantCap = computed(() => implantLoadCap())

/** 承受度占比（0~1），进度条宽度用 */
const implantLoadRatio = computed(() => Math.min(1, implantLoad.value / implantCap.value))

/** 承受度告急：≥80% 时进度条转警示红 */
const implantLoadWarn = computed(() => implantLoadRatio.value >= 0.8)

/** 承受度计量条刻度数（竖向分段，自底向上点亮） */
const IMPLANT_LOAD_TICKS = 36
/** 安全区刻度数：超过即刻度进入红色危险区（与告急阈值同为 80%） */
const IMPLANT_LOAD_TICKS_SAFE = Math.floor(IMPLANT_LOAD_TICKS * 0.8)

/** 已点亮的刻度数 */
const implantLoadTicks = computed(() => Math.round(implantLoadRatio.value * IMPLANT_LOAD_TICKS))

/** 水晶货币（与主界面货币卡同一数据源：背包中的水晶道具总量） */
const crystalText = computed(() => crystal.value.toLocaleString('en-US'))

/** 占位物品视图：锚点格 + 静态定义 + 实际占格（旋转后宽高互换） */
interface PlacedItem {
  anchor: number
  itemId: string
  name: string
  category: ItemCategory
  icon?: string
  iconScale: number
  kind?: string
  /** 义体装配部位（仅义体类物品有值，用于右下角小字标注） */
  implantPart?: ImplantPart
  /** 义体耐受度（仅可装配义体有值，用于左下角小字数字标注） */
  implantLoad?: number
  count: number
  rarity: ItemRarity
  rotated: boolean
  w: number
  h: number
}

const placedItems = computed<PlacedItem[]>(() =>
  state.slots.flatMap((slot, anchor) => {
    if (!slot) return []
    const def = getItemDef(slot.itemId)
    if (!def) return []
    const size = def.size ?? { w: 1, h: 1 }
    const rotated = !!slot.rotated
    return [
      {
        anchor,
        itemId: slot.itemId,
        name: def.name,
        category: def.category,
        icon: def.icon,
        iconScale: def.iconScale ?? 1,
        kind: def.kind,
        implantPart: def.implantPart,
        implantLoad: def.implantPart ? implantLoadOf(def) : undefined,
        count: slot.count,
        rarity: def.rarity,
        rotated,
        w: rotated ? size.h : size.w,
        h: rotated ? size.w : size.h,
      },
    ]
  })
)

/** 页签筛选：不匹配的物品置灰（位置不动，保证拖拽可用） */
function isDimmed(item: PlacedItem): boolean {
  return activeTab.value !== 'all' && item.category !== activeTab.value
}

/** 当前页签下匹配的物品数 */
const matchCount = computed(() => placedItems.value.filter((it) => !isDimmed(it)).length)

const categoryLabel = computed(() => {
  const map: Record<TabKey, string> = {
    all: 'ALL',
    weapon: 'WEAPON',
    implant: 'IMPLANT',
    skill: 'SKILL',
    material: 'MATERIAL',
  }
  return map[activeTab.value]
})

/** 物品的 CSS Grid 占位：锚点行列 + 跨度 */
function itemStyle(item: PlacedItem) {
  const col = item.anchor % COLS
  const row = Math.floor(item.anchor / COLS)
  return {
    gridColumn: `${col + 1} / span ${item.w}`,
    gridRow: `${row + 1} / span ${item.h}`,
  }
}

/* ---------- 拖拽（移动 / 合并，R 手动旋转，放不下时自动临时旋转） ---------- */
const drag = ref<{
  anchor: number
  /** 当前实际姿态（可能被自动旋转临时改变） */
  rotated: boolean
  /** 期望姿态：拖拽开始时的姿态，手动按 R 时更新；自动旋转不影响它 */
  baseRotated: boolean
  /** 物品自然尺寸（未旋转） */
  nw: number
  nh: number
  /** 当前实际占格尺寸 */
  w: number
  h: number
  x: number
  y: number
} | null>(null)
const dragOverIndex = ref(-1)
const gridRef = ref<HTMLElement | null>(null)

/** 拖动激活阈值（px）：按下后移动超过该距离才进入拖拽（出虚影），原地松开视为点击 */
const DRAG_THRESHOLD = 6
/** 双击判定窗口（ms）：pointerdown 已 preventDefault，原生 dblclick 被抑制，需手动识别 */
const DBLCLICK_MS = 350
/** 长按判定（ms）：按住物品不动超过该时间进入多选模式 */
const LONGPRESS_MS = 500

/* ---------- 多选模式：长按物品进入，点选切换，底部按钮变出售 ---------- */
const selectMode = ref(false)
/** 已选中的物品锚点集合 */
const selected = ref<ReadonlySet<number>>(new Set())
/** 长按计时器（null = 未在计时） */
let longPressTimer: number | null = null

function clearLongPress() {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

/** 长按触发：取消挂起的拖拽，以该物品为首选进入多选模式（水晶是货币，不触发） */
function enterSelectMode(anchor: number) {
  selectMode.value = true
  selected.value = new Set([anchor])
}

function exitSelectMode() {
  selectMode.value = false
  selected.value = new Set()
}

/** 多选模式下点击物品：切换选中状态（水晶不可选） */
function toggleSelect(anchor: number) {
  const slot = state.slots[anchor]
  if (!slot || slot.itemId === ITEM_CRYSTAL.id) return
  const next = new Set(selected.value)
  if (next.has(anchor)) next.delete(anchor)
  else next.add(anchor)
  selected.value = next
}

const selectedCount = computed(() => selected.value.size)

/** 选中物品出售总收益（价格见 config/items/prices.ts） */
const selectedGain = computed(() => {
  let sum = 0
  for (const anchor of selected.value) {
    const slot = state.slots[anchor]
    if (!slot || slot.itemId === ITEM_CRYSTAL.id) continue
    const def = getItemDef(slot.itemId)
    if (def) sum += getSellPrice(def) * slot.count
  }
  return sum
})

/** 批量出售：移除全部选中物品，折算水晶一次入账，然后退出多选 */
function sellSelected() {
  // 先取收益：清空槽位后 selectedGain 会重算为 0，必须提前缓存
  const gain = selectedGain.value
  if (gain <= 0) return
  for (const anchor of selected.value) {
    const slot = state.slots[anchor]
    if (!slot || slot.itemId === ITEM_CRYSTAL.id) continue
    state.slots[anchor] = null
  }
  addCrystal(gain)
  exitSelectMode()
}

/** 已按下但尚未激活拖拽的挂起状态（超过位移阈值才真正开始拖） */
let pendingDrag: { item: PlacedItem; startX: number; startY: number } | null = null
/** 上一次原地点击的锚点与时间：手动识别双击穿戴 */
let lastItemClick: { anchor: number; ts: number } = { anchor: -1, ts: 0 }

const dragItem = computed(
  () => placedItems.value.find((it) => it.anchor === drag.value?.anchor) ?? null
)

/** 按姿态设置当前占格尺寸 */
function applyOrientation(d: NonNullable<typeof drag.value>, rotated: boolean) {
  d.rotated = rotated
  d.w = rotated ? d.nh : d.nw
  d.h = rotated ? d.nw : d.nh
}

function onItemPointerDown(e: PointerEvent, item: PlacedItem) {
  if (e.button !== 0) return
  e.preventDefault()
  hideHoverTip() // 按下（拖拽/多选/双击）即收起悬停提示
  // 多选模式：点击只切换选中，不进入拖拽 / 双击判定
  if (selectMode.value) {
    toggleSelect(item.anchor)
    return
  }
  // 只记录挂起状态，不立即出虚影：移动超过阈值才激活拖拽
  pendingDrag = { item, startX: e.clientX, startY: e.clientY }
  // 长按不动 → 进入多选模式
  longPressTimer = window.setTimeout(() => {
    longPressTimer = null
    if (!pendingDrag) return
    const held = pendingDrag.item
    pendingDrag = null
    window.removeEventListener('pointermove', onDragMove)
    if (held.itemId !== ITEM_CRYSTAL.id) enterSelectMode(held.anchor)
  }, LONGPRESS_MS)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragUp, { once: true })
}

/** 位移超阈值后激活拖拽：建立 drag 状态、挂 R 旋转监听 */
function activateDrag(e: PointerEvent) {
  clearLongPress() // 拖起来了就不是长按
  const p = pendingDrag
  if (!p) return
  pendingDrag = null
  const item = p.item
  playPickupSfx(item.category)
  const nw = item.rotated ? item.h : item.w
  const nh = item.rotated ? item.w : item.h
  drag.value = {
    anchor: item.anchor,
    rotated: item.rotated,
    baseRotated: item.rotated,
    nw,
    nh,
    w: item.w,
    h: item.h,
    x: e.clientX,
    y: e.clientY,
  }
  window.addEventListener('keydown', onDragKeydown)
}

/** 拖拽中按 R：切换期望姿态，并按新尺寸立即重算落点 */
function onDragKeydown(e: KeyboardEvent) {
  const d = drag.value
  if (!d || (e.key !== 'r' && e.key !== 'R')) return
  d.baseRotated = !d.baseRotated
  applyOrientation(d, d.baseRotated)
  dragOverIndex.value = dropAnchorFromPoint(d.x, d.y, d.w, d.h)
}

/**
 * 指针坐标 → 落点锚点格子。
 * 残影以指针为中心，换算出残影左上角对应的格子并就近吸附（Math.round），
 * 让"残影覆盖到哪就放到哪"，而不是要求指针尖对准格子。
 */
function dropAnchorFromPoint(clientX: number, clientY: number, w: number, h: number): number {
  const board = gridRef.value?.querySelector('.inv-cells') as HTMLElement | null
  if (!board) return -1
  const rect = board.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return -1

  const cellW = (rect.width - (COLS - 1) * GAP_PX) / COLS
  const cellH = (rect.height - (ROWS - 1) * GAP_PX) / ROWS
  const pitchX = cellW + GAP_PX
  const pitchY = cellH + GAP_PX

  // 残影左上角相对网格的坐标
  const originX = x - (w * cellW + (w - 1) * GAP_PX) / 2
  const originY = y - (h * cellH + (h - 1) * GAP_PX) / 2
  const col = Math.max(0, Math.min(COLS - 1, Math.round(originX / pitchX)))
  const row = Math.max(0, Math.min(ROWS - 1, Math.round(originY / pitchY)))
  return row * COLS + col
}

function onDragMove(e: PointerEvent) {
  // 挂起中：位移不足阈值不动，超过才激活拖拽
  if (pendingDrag) {
    const dx = e.clientX - pendingDrag.startX
    const dy = e.clientY - pendingDrag.startY
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
    activateDrag(e)
  }
  const d = drag.value
  if (!d) return
  d.x = e.clientX
  d.y = e.clientY

  // 优先回归期望姿态（离开需要自动旋转的位置时自动转回来）
  applyOrientation(d, d.baseRotated)
  let idx = dropAnchorFromPoint(e.clientX, e.clientY, d.w, d.h)

  // 期望姿态放不下时，临时自动旋转（仅非正方形物品）
  if (idx >= 0 && d.nw !== d.nh && !canDropAt(d.anchor, idx, d.rotated)) {
    applyOrientation(d, !d.baseRotated)
    const idx2 = dropAnchorFromPoint(e.clientX, e.clientY, d.w, d.h)
    if (idx2 >= 0 && canDropAt(d.anchor, idx2, d.rotated)) {
      idx = idx2
    } else {
      applyOrientation(d, d.baseRotated)
    }
  }

  dragOverIndex.value = idx

  // 拖到槽位上时高亮该槽
  if (dragItem.value?.category === 'weapon') {
    equipOverSlot.value = weaponSlotFromPoint(e.clientX, e.clientY)
    equipOverSkillSlot.value = false
    equipOverImplantSlot.value = null
  } else if (dragItem.value?.category === 'skill') {
    equipOverSkillSlot.value = skillSlotFromPoint(e.clientX, e.clientY)
    equipOverSlot.value = null
    equipOverImplantSlot.value = null
  } else if (dragItem.value?.category === 'implant') {
    // 义体：仅当槽位可装配时高亮（部位不匹配 / 重复装配 / 超出承受度的槽不响应）
    const slotKey = implantSlotFromPoint(e.clientX, e.clientY)
    equipOverImplantSlot.value =
      slotKey && canEquipImplant(slotKey, dragItem.value.itemId) ? slotKey : null
    equipOverSlot.value = null
    equipOverSkillSlot.value = false
  } else {
    equipOverSlot.value = null
    equipOverSkillSlot.value = false
    equipOverImplantSlot.value = null
  }

  // 指针贴近网格上下边缘时自动滚动
  const grid = gridRef.value
  if (grid) {
    const rect = grid.getBoundingClientRect()
    const EDGE = 48
    const SPEED = 14
    // 仅当指针在网格矩形内部（横向在内、纵向贴边）时才滚动，避免指针在网格外误触发
    const insideX = e.clientX >= rect.left && e.clientX <= rect.right
    const inTopEdge = e.clientY >= rect.top && e.clientY < rect.top + EDGE
    const inBottomEdge = e.clientY > rect.bottom - EDGE && e.clientY <= rect.bottom
    if (insideX && inTopEdge) grid.scrollTop -= SPEED
    else if (insideX && inBottomEdge) grid.scrollTop += SPEED
  }
}

/** 落点预览：覆盖的单元格集合 + 是否可放置 */
const dragRect = computed(() => {
  const d = drag.value
  if (!d || dragOverIndex.value < 0) return null
  const col = dragOverIndex.value % COLS
  const row = Math.floor(dragOverIndex.value / COLS)
  const cells = new Set<number>()
  for (let r = 0; r < d.h; r++) {
    for (let c = 0; c < d.w; c++) {
      if (col + c >= COLS || row + r >= ROWS) continue
      cells.add((row + r) * COLS + col + c)
    }
  }
  const valid = canDropAt(d.anchor, dragOverIndex.value, d.rotated)
  return { cells, valid }
})

function onDragUp() {
  clearLongPress() // 提前松手（单击）不触发多选
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('keydown', onDragKeydown)
  // 从未激活拖拽 = 原地点击：手动识别双击（同一物品短时间内连点两次 → 穿戴）
  if (pendingDrag) {
    const item = pendingDrag.item
    pendingDrag = null
    const now = Date.now()
    if (item.anchor === lastItemClick.anchor && now - lastItemClick.ts < DBLCLICK_MS) {
      lastItemClick = { anchor: -1, ts: 0 }
      onEquipItemDblClick(item)
    } else {
      lastItemClick = { anchor: item.anchor, ts: now }
    }
    return
  }
  const d = drag.value
  let dropped = false
  if (d && equipOverSlot.value) {
    // 落在武器槽上：穿戴（槽位优先于网格落点）
    equipWeaponToSlot(d.anchor, equipOverSlot.value)
    dropped = true
  } else if (d && equipOverSkillSlot.value) {
    // 落在技能槽上：穿戴
    equipSkillToSlot(d.anchor)
    dropped = true
  } else if (d && equipOverImplantSlot.value) {
    // 落在部位匹配的义体槽上：穿戴
    equipImplantToSlot(d.anchor, equipOverImplantSlot.value)
    dropped = true
  } else if (d && dragItem.value?.category === 'implant') {
    // 义体落在槽位上但未通过装配校验（槽位未高亮）：按原因弹提示
    const overKey = implantSlotFromPoint(d.x, d.y)
    if (overKey && dragItem.value.implantPart && implantSlotPart(overKey) === dragItem.value.implantPart) {
      const reason = implantEquipBlock(overKey, dragItem.value.itemId)
      if (reason === 'duplicate') showNotice('相同系列义体仅允许装备一个')
      else if (reason === 'over-capacity') showNotice('超过当前义体容量上限')
    }
  }
  if (!dropped && d && dragOverIndex.value >= 0 && dragRect.value?.valid) {
    moveSlot(d.anchor, dragOverIndex.value, d.rotated)
    dropped = true
  }
  if (dropped) playSfx(itemDropSfx)
  drag.value = null
  dragOverIndex.value = -1
  equipOverSlot.value = null
  equipOverSkillSlot.value = false
  equipOverImplantSlot.value = null
}

/** 拖拽残影：位置跟随指针，尺寸 = 单元格像素 × 占格数 */
const ghostStyle = computed(() => {
  const d = drag.value
  if (!d) return {}
  const cell = gridRef.value?.querySelector('.inv-cell') as HTMLElement | null
  const s = cell?.offsetWidth ?? 44
  return {
    left: `${d.x}px`,
    top: `${d.y}px`,
    width: `${d.w * s + (d.w - 1) * GAP_PX}px`,
    height: `${d.h * s + (d.h - 1) * GAP_PX}px`,
  }
})

/* ---------- 装备：背包物品 → 拖到槽位穿戴；槽位 → 拖回背包卸下 ---------- */
/** 拖拽中的物品正悬停的目标槽（高亮用） */
const equipOverSlot = ref<WeaponSlotKey | null>(null)
/** 拖拽中的技能物品正悬停的技能槽（高亮用） */
const equipOverSkillSlot = ref(false)
/** 拖拽中的义体正悬停的目标义体槽（部位匹配才高亮） */
const equipOverImplantSlot = ref<ImplantSlotKey | null>(null)

/** 指针坐标 → 武器槽 key（不在槽上返回 null） */
function weaponSlotFromPoint(clientX: number, clientY: number): WeaponSlotKey | null {
  const el = document.elementFromPoint(clientX, clientY)?.closest('[data-weapon-slot]')
  const key = el?.getAttribute('data-weapon-slot')
  return key === 'weapon-1' || key === 'weapon-2' ? key : null
}

/** 指针坐标 → 是否在技能槽上 */
function skillSlotFromPoint(clientX: number, clientY: number): boolean {
  return !!document.elementFromPoint(clientX, clientY)?.closest('[data-skill-slot]')
}

/** 指针坐标 → 义体槽位 key（不在义体槽上返回 null） */
function implantSlotFromPoint(clientX: number, clientY: number): ImplantSlotKey | null {
  const el = document.elementFromPoint(clientX, clientY)?.closest('[data-implant-slot]')
  const key = el?.getAttribute('data-implant-slot')
  if (!key) return null
  return IMPLANT_SLOT_KEYS.includes(key as ImplantSlotKey) ? (key as ImplantSlotKey) : null
}

/**
 * 穿戴：把背包 anchor 处的物品装进武器槽；
 * 槽位已有武器时换下并放回背包，背包放不下则整体回滚
 */
function equipWeaponToSlot(anchor: number, slotKey: WeaponSlotKey): boolean {
  const taken = state.slots[anchor]
  if (!taken || getItemDef(taken.itemId)?.category !== 'weapon') return false
  state.slots[anchor] = null
  const prev = equipWeapon(slotKey, taken.itemId)
  if (prev && addItem(prev, 1) === 0) {
    equipWeapon(slotKey, prev) // 回滚：旧武器装回，拖拽物还原
    state.slots[anchor] = taken
    return false
  }
  return true
}

/**
 * 穿戴：把背包 anchor 处的技能物品装进技能槽；
 * 槽位已有技能时换下并放回背包，背包放不下则整体回滚
 */
function equipSkillToSlot(anchor: number): boolean {
  const taken = state.slots[anchor]
  if (!taken || getItemDef(taken.itemId)?.category !== 'skill') return false
  state.slots[anchor] = null
  const prev = equipSkill(taken.itemId)
  if (prev && addItem(prev, 1) === 0) {
    equipSkill(prev) // 回滚：旧技能装回，拖拽物还原
    state.slots[anchor] = taken
    return false
  }
  return true
}

/**
 * 穿戴：把背包 anchor 处的义体装进义体槽；
 * 部位不匹配 / 已装配同名（含同族变体）义体 / 超出承受度上限时直接放弃；
 * 槽位已有义体时换下并放回背包，背包放不下则整体回滚
 */
function equipImplantToSlot(anchor: number, slotKey: ImplantSlotKey): boolean {
  const taken = state.slots[anchor]
  const def = taken ? getItemDef(taken.itemId) : undefined
  if (!taken || def?.category !== 'implant' || !def.implantPart) return false
  if (!canEquipImplant(slotKey, taken.itemId)) return false // 部位不匹配 / 同族重复装配 / 超出承受度
  state.slots[anchor] = null
  const prev = equipImplant(slotKey, taken.itemId)
  if (prev && addItem(prev, 1) === 0) {
    equipImplant(slotKey, prev) // 回滚：旧义体装回，拖拽物还原
    state.slots[anchor] = taken
    return false
  }
  return true
}

/** 双击已装备的义体槽：卸下放回背包（背包满 / 卸下后超承受度上限则不动） */
function unequipImplantToInventory(slotKey: ImplantSlotKey): boolean {
  const itemId = equipState.implants[slotKey]
  if (!itemId) return false
  if (!canUnequipImplant(slotKey)) {
    showNotice('卸下后义体总承受值将超过承受度上限，请先卸下其他义体')
    return false
  }
  if (addItem(itemId, 1) === 0) return false // 背包满，放弃卸下
  unequipImplant(slotKey)
  return true
}

/** 双击已装备的武器槽：卸下放回背包（背包满则不动） */
function unequipWeaponToInventory(slotKey: WeaponSlotKey): boolean {
  const itemId = equipState.weapons[slotKey]
  if (!itemId) return false
  if (addItem(itemId, 1) === 0) return false // 背包满，放弃卸下
  unequipWeapon(slotKey)
  return true
}

/**
 * 双击背包中的武器/技能/义体：
 * 武器找空武器槽穿戴（无空槽不顶掉），技能直接装入技能槽（有旧技能则换下），
 * 义体找本部位的空义体槽穿戴（无空槽不顶掉，部位不对口的槽不可用）
 */
function onEquipItemDblClick(item: PlacedItem) {
  if (item.category === 'skill') {
    if (equipSkillToSlot(item.anchor)) playSfx(itemDropSfx)
    return
  }
  if (item.category === 'implant') {
    if (!item.implantPart) return // 义体素材（动力核心等）不可装配
    // 槽位已满优先提示（盖过同族 / 容量校验）
    const anyEmpty = IMPLANT_SLOT_KEYS.find(
      (key) => implantSlotPart(key) === item.implantPart && !equipState.implants[key]
    )
    if (!anyEmpty) {
      showNotice(`当前${IMPLANT_PART_LABELS[item.implantPart]}槽位已满`)
      return
    }
    // 同族义体（含同名不同品质变体）已装配：直接提示
    const family = implantFamilyOf(getItemDef(item.itemId))
    const dup = IMPLANT_SLOT_KEYS.some((key) => {
      const otherId = equipState.implants[key]
      return !!otherId && (otherId === item.itemId || implantFamilyOf(getItemDef(otherId)) === family)
    })
    if (dup) {
      showNotice('相同系列义体仅允许装备一个')
      return
    }
    // 找本部位第一个可装配的空槽（承受度超限则没有可用槽）
    const emptyKey = IMPLANT_SLOT_KEYS.find(
      (key) =>
        implantSlotPart(key) === item.implantPart &&
        !equipState.implants[key] &&
        canEquipImplant(key, item.itemId)
    )
    if (!emptyKey) {
      // 有空槽但装不上 = 承受度不足
      if (implantEquipBlock(anyEmpty, item.itemId) === 'over-capacity') {
        showNotice('超过当前义体容量上限')
      }
      return
    }
    if (equipImplantToSlot(item.anchor, emptyKey)) playSfx(itemDropSfx)
    return
  }
  if (item.category !== 'weapon') return
  const empty = WEAPON_SLOTS.find((s) => !equipState.weapons[s.key])
  if (!empty) return
  // 直接使用双击项的锚点，避免 findIndex 在有同名武器时错配到第一个
  if (equipWeaponToSlot(item.anchor, empty.key)) playSfx(itemDropSfx)
}

/* 卸下拖拽：从武器槽拿起已装备武器，拖到背包空格放下 */
const equipDrag = ref<{
  slot: WeaponSlotKey
  itemId: string
  w: number
  h: number
  x: number
  y: number
  over: number
} | null>(null)

const equipDragDef = computed(() =>
  equipDrag.value ? (getItemDef(equipDrag.value.itemId) ?? null) : null
)

/** 武器槽按下但尚未激活卸下拖拽的挂起状态（超过位移阈值才出虚影） */
let pendingEquipDrag: { slotKey: WeaponSlotKey; itemId: string; startX: number; startY: number } | null = null
/** 上一次原地点击的武器槽与时间：手动识别双击卸下 */
let lastSlotClick: { slot: WeaponSlotKey; ts: number } | null = null

function onEquipPointerDown(e: PointerEvent, slotKey: WeaponSlotKey) {
  if (e.button !== 0) return
  const itemId = equipState.weapons[slotKey]
  if (!itemId) return
  e.preventDefault()
  hideHoverTip() // 按下（卸下拖拽/双击）即收起悬停提示
  // 只记录挂起状态，不立即出虚影：移动超过阈值才激活卸下拖拽
  pendingEquipDrag = { slotKey, itemId, startX: e.clientX, startY: e.clientY }
  window.addEventListener('pointermove', onEquipDragMove)
  window.addEventListener('pointerup', onEquipDragUp, { once: true })
}

/** 卸下拖拽中正悬停的目标武器槽（用于槽位间交换，高亮用；不含源槽） */
const equipDragOverSlot = ref<WeaponSlotKey | null>(null)

function onEquipDragMove(e: PointerEvent) {
  // 挂起中：位移不足阈值不动，超过才激活卸下拖拽
  if (pendingEquipDrag) {
    const p = pendingEquipDrag
    const dx = e.clientX - p.startX
    const dy = e.clientY - p.startY
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
    pendingEquipDrag = null
    playPickupSfx(getItemDef(p.itemId)?.category)
    const size = getItemDef(p.itemId)?.size ?? { w: 1, h: 1 }
    equipDrag.value = {
      slot: p.slotKey,
      itemId: p.itemId,
      w: size.w,
      h: size.h,
      x: e.clientX,
      y: e.clientY,
      over: -1,
    }
  }
  const d = equipDrag.value
  if (!d) return
  d.x = e.clientX
  d.y = e.clientY
  d.over = dropAnchorFromPoint(e.clientX, e.clientY, d.w, d.h)

  // 悬停在另一个武器槽上：可交换 / 移动
  const overSlot = weaponSlotFromPoint(e.clientX, e.clientY)
  equipDragOverSlot.value = overSlot && overSlot !== d.slot ? overSlot : null

  // 指针贴近网格上下边缘时自动滚动（与背包拖拽一致）
  const grid = gridRef.value
  if (grid) {
    const rect = grid.getBoundingClientRect()
    const EDGE = 48
    const SPEED = 14
    // 仅当指针在网格矩形内部（横向在内、纵向贴边）时才滚动，避免指针在网格外误触发
    const insideX = e.clientX >= rect.left && e.clientX <= rect.right
    const inTopEdge = e.clientY >= rect.top && e.clientY < rect.top + EDGE
    const inBottomEdge = e.clientY > rect.bottom - EDGE && e.clientY <= rect.bottom
    if (insideX && inTopEdge) grid.scrollTop -= SPEED
    else if (insideX && inBottomEdge) grid.scrollTop += SPEED
  }
}

/** 卸下落点预览：覆盖的单元格集合 + 是否可放置（必须全空位） */
const equipDropRect = computed(() => {
  const d = equipDrag.value
  if (!d || d.over < 0) return null
  const col = d.over % COLS
  const row = Math.floor(d.over / COLS)
  const cells = new Set<number>()
  for (let r = 0; r < d.h; r++) {
    for (let c = 0; c < d.w; c++) {
      if (col + c >= COLS || row + r >= ROWS) continue
      cells.add((row + r) * COLS + col + c)
    }
  }
  return { cells, valid: canPlaceAt(d.itemId, d.over, false) }
})

function onEquipDragUp() {
  window.removeEventListener('pointermove', onEquipDragMove)
  // 从未激活拖拽 = 原地点击：手动识别双击（同一槽位短时间内连点两次 → 卸下）
  if (pendingEquipDrag) {
    const p = pendingEquipDrag
    pendingEquipDrag = null
    const now = Date.now()
    if (lastSlotClick && lastSlotClick.slot === p.slotKey && now - lastSlotClick.ts < DBLCLICK_MS) {
      lastSlotClick = null
      if (unequipWeaponToInventory(p.slotKey)) playSfx(itemDropSfx)
    } else {
      lastSlotClick = { slot: p.slotKey, ts: now }
    }
    return
  }
  const d = equipDrag.value
  if (d && equipDragOverSlot.value) {
    // 落在另一个武器槽上：交换（目标为空槽则纯移动）
    const target = equipDragOverSlot.value
    const otherId = equipState.weapons[target]
    equipWeapon(target, d.itemId)
    if (otherId) equipWeapon(d.slot, otherId)
    else unequipWeapon(d.slot)
    playSfx(itemDropSfx)
  } else if (d && d.over >= 0 && canPlaceAt(d.itemId, d.over, false)) {
    state.slots[d.over] = { itemId: d.itemId, count: 1 }
    unequipWeapon(d.slot)
    playSfx(itemDropSfx)
  }
  equipDrag.value = null
  equipDragOverSlot.value = null
}

/** 从技能槽卸下技能物品放回背包（背包没空间则回滚） */
function unequipSkillToInventory(): boolean {
  const itemId = equipState.skill
  if (!itemId) return false
  if (addItem(itemId, 1) === 0) return false // 背包满，放弃卸下
  unequipSkill()
  return true
}

/* 卸下拖拽：从技能槽拿起已装备技能，拖到背包空格放下（与武器/义体槽同一套交互） */
const skillDrag = ref<{
  itemId: string
  w: number
  h: number
  x: number
  y: number
  over: number
} | null>(null)

const skillDragDef = computed(() =>
  skillDrag.value ? (getItemDef(skillDrag.value.itemId) ?? null) : null
)

/** 技能槽按下但尚未激活卸下拖拽的挂起状态（超过位移阈值才出虚影） */
let pendingSkillDrag: { itemId: string; startX: number; startY: number } | null = null
/** 上一次左键点击技能槽的时间：手动识别双击卸下（单击/右键不触发） */
let lastSkillClickTs = 0

function onSkillSlotPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  const itemId = equipState.skill
  if (!itemId) return
  hideHoverTip() // 按下（卸下拖拽/双击）即收起悬停提示
  // 只记录挂起状态，不立即出虚影：移动超过阈值才激活卸下拖拽
  pendingSkillDrag = { itemId, startX: e.clientX, startY: e.clientY }
  window.addEventListener('pointermove', onSkillDragMove)
  window.addEventListener('pointerup', onSkillDragUp, { once: true })
}

function onSkillDragMove(e: PointerEvent) {
  // 挂起中：位移不足阈值不动，超过才激活卸下拖拽
  if (pendingSkillDrag) {
    const p = pendingSkillDrag
    const dx = e.clientX - p.startX
    const dy = e.clientY - p.startY
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
    pendingSkillDrag = null
    playPickupSfx(getItemDef(p.itemId)?.category)
    const size = getItemDef(p.itemId)?.size ?? { w: 1, h: 1 }
    skillDrag.value = {
      itemId: p.itemId,
      w: size.w,
      h: size.h,
      x: e.clientX,
      y: e.clientY,
      over: -1,
    }
  }
  const d = skillDrag.value
  if (!d) return
  d.x = e.clientX
  d.y = e.clientY
  d.over = dropAnchorFromPoint(e.clientX, e.clientY, d.w, d.h)

  // 指针贴近网格上下边缘时自动滚动（与背包拖拽一致）
  const grid = gridRef.value
  if (grid) {
    const rect = grid.getBoundingClientRect()
    const EDGE = 48
    const SPEED = 14
    // 仅当指针在网格矩形内部（横向在内、纵向贴边）时才滚动，避免指针在网格外误触发
    const insideX = e.clientX >= rect.left && e.clientX <= rect.right
    const inTopEdge = e.clientY >= rect.top && e.clientY < rect.top + EDGE
    const inBottomEdge = e.clientY > rect.bottom - EDGE && e.clientY <= rect.bottom
    if (insideX && inTopEdge) grid.scrollTop -= SPEED
    else if (insideX && inBottomEdge) grid.scrollTop += SPEED
  }
}

/** 技能卸下落点预览：覆盖的单元格集合 + 是否可放置（必须全空位） */
const skillDropRect = computed(() => {
  const d = skillDrag.value
  if (!d || d.over < 0) return null
  const col = d.over % COLS
  const row = Math.floor(d.over / COLS)
  const cells = new Set<number>()
  for (let r = 0; r < d.h; r++) {
    for (let c = 0; c < d.w; c++) {
      if (col + c >= COLS || row + r >= ROWS) continue
      cells.add((row + r) * COLS + col + c)
    }
  }
  return { cells, valid: canPlaceAt(d.itemId, d.over, false) }
})

function onSkillDragUp() {
  window.removeEventListener('pointermove', onSkillDragMove)
  // 从未激活拖拽 = 原地点击：手动识别双击（短时间内连点两次 → 卸下）
  if (pendingSkillDrag) {
    pendingSkillDrag = null
    const now = Date.now()
    if (now - lastSkillClickTs < DBLCLICK_MS) {
      lastSkillClickTs = 0
      if (unequipSkillToInventory()) playSfx(itemDropSfx)
    } else {
      lastSkillClickTs = now
    }
    return
  }
  const d = skillDrag.value
  if (d && d.over >= 0 && canPlaceAt(d.itemId, d.over, false)) {
    state.slots[d.over] = { itemId: d.itemId, count: 1 }
    unequipSkill()
    playSfx(itemDropSfx)
  }
  skillDrag.value = null
}

/** 技能卸下残影样式：与拖拽残影同一套算法 */
const skillGhostStyle = computed(() => {
  const d = skillDrag.value
  if (!d) return {}
  const cell = gridRef.value?.querySelector('.inv-cell') as HTMLElement | null
  const s = cell?.offsetWidth ?? 44
  return {
    left: `${d.x}px`,
    top: `${d.y}px`,
    width: `${d.w * s + (d.w - 1) * GAP_PX}px`,
    height: `${d.h * s + (d.h - 1) * GAP_PX}px`,
  }
})

/* 卸下拖拽：从义体槽拿起已装备义体，拖到背包空格放下；同部位槽位间可拖换（与武器槽同一套交互） */
const implantDrag = ref<{
  slot: ImplantSlotKey
  itemId: string
  w: number
  h: number
  x: number
  y: number
  over: number
} | null>(null)

const implantDragDef = computed(() =>
  implantDrag.value ? (getItemDef(implantDrag.value.itemId) ?? null) : null
)

/** 义体槽按下但尚未激活卸下拖拽的挂起状态（超过位移阈值才出虚影） */
let pendingImplantDrag: { slotKey: ImplantSlotKey; itemId: string; startX: number; startY: number } | null = null
/** 上一次原地点击的义体槽与时间：手动识别双击卸下 */
let lastImplantClick: { slot: ImplantSlotKey; ts: number } | null = null

function onImplantSlotPointerDown(e: PointerEvent, slotKey: ImplantSlotKey) {
  if (e.button !== 0) return
  const itemId = equipState.implants[slotKey]
  if (!itemId) return
  hideHoverTip() // 按下（卸下拖拽/双击）即收起悬停提示
  // 只记录挂起状态，不立即出虚影：移动超过阈值才激活卸下拖拽
  pendingImplantDrag = { slotKey, itemId, startX: e.clientX, startY: e.clientY }
  window.addEventListener('pointermove', onImplantDragMove)
  window.addEventListener('pointerup', onImplantDragUp, { once: true })
}

/** 卸下拖拽中正悬停的目标义体槽（仅同部位的其他槽，高亮用；不含源槽） */
const implantDragOverSlot = ref<ImplantSlotKey | null>(null)

function onImplantDragMove(e: PointerEvent) {
  // 挂起中：位移不足阈值不动，超过才激活卸下拖拽
  if (pendingImplantDrag) {
    const p = pendingImplantDrag
    const dx = e.clientX - p.startX
    const dy = e.clientY - p.startY
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
    pendingImplantDrag = null
    playPickupSfx(getItemDef(p.itemId)?.category)
    const size = getItemDef(p.itemId)?.size ?? { w: 1, h: 1 }
    implantDrag.value = {
      slot: p.slotKey,
      itemId: p.itemId,
      w: size.w,
      h: size.h,
      x: e.clientX,
      y: e.clientY,
      over: -1,
    }
  }
  const d = implantDrag.value
  if (!d) return
  d.x = e.clientX
  d.y = e.clientY
  d.over = dropAnchorFromPoint(e.clientX, e.clientY, d.w, d.h)

  // 悬停在同部位其他义体槽上：可交换 / 移动
  const overSlot = implantSlotFromPoint(e.clientX, e.clientY)
  implantDragOverSlot.value =
    overSlot && overSlot !== d.slot && implantSlotPart(overSlot) === implantSlotPart(d.slot)
      ? overSlot
      : null

  // 指针贴近网格上下边缘时自动滚动（与背包拖拽一致）
  const grid = gridRef.value
  if (grid) {
    const rect = grid.getBoundingClientRect()
    const EDGE = 48
    const SPEED = 14
    // 仅当指针在网格矩形内部（横向在内、纵向贴边）时才滚动，避免指针在网格外误触发
    const insideX = e.clientX >= rect.left && e.clientX <= rect.right
    const inTopEdge = e.clientY >= rect.top && e.clientY < rect.top + EDGE
    const inBottomEdge = e.clientY > rect.bottom - EDGE && e.clientY <= rect.bottom
    if (insideX && inTopEdge) grid.scrollTop -= SPEED
    else if (insideX && inBottomEdge) grid.scrollTop += SPEED
  }
}

/** 义体卸下落点预览：覆盖的单元格集合 + 是否可放置（必须全空位） */
const implantDropRect = computed(() => {
  const d = implantDrag.value
  if (!d || d.over < 0) return null
  const col = d.over % COLS
  const row = Math.floor(d.over / COLS)
  const cells = new Set<number>()
  for (let r = 0; r < d.h; r++) {
    for (let c = 0; c < d.w; c++) {
      if (col + c >= COLS || row + r >= ROWS) continue
      cells.add((row + r) * COLS + col + c)
    }
  }
  return { cells, valid: canPlaceAt(d.itemId, d.over, false) }
})

function onImplantDragUp() {
  window.removeEventListener('pointermove', onImplantDragMove)
  // 从未激活拖拽 = 原地点击：手动识别双击（同一槽位短时间内连点两次 → 卸下）
  if (pendingImplantDrag) {
    const p = pendingImplantDrag
    pendingImplantDrag = null
    const now = Date.now()
    if (lastImplantClick && lastImplantClick.slot === p.slotKey && now - lastImplantClick.ts < DBLCLICK_MS) {
      lastImplantClick = null
      if (unequipImplantToInventory(p.slotKey)) playSfx(itemDropSfx)
    } else {
      lastImplantClick = { slot: p.slotKey, ts: now }
    }
    return
  }
  const d = implantDrag.value
  if (d && implantDragOverSlot.value) {
    // 落在同部位另一个义体槽上：交换（目标为空槽则纯移动）。
    // 已装配集合不变，直接互换槽位内容：不做承受度校验，容量义体也可自由换位
    swapImplantSlots(d.slot, implantDragOverSlot.value)
    playSfx(itemDropSfx)
  } else if (d && d.over >= 0 && canPlaceAt(d.itemId, d.over, false)) {
    // 拖回背包：卸下后其余义体超出承受度上限时阻止（如正靠阿特拉斯撑上限）
    if (!canUnequipImplant(d.slot)) {
      showNotice('卸下后义体总承受值将超过承受度上限，请先卸下其他义体')
    } else {
      state.slots[d.over] = { itemId: d.itemId, count: 1 }
      unequipImplant(d.slot)
      playSfx(itemDropSfx)
    }
  }
  implantDrag.value = null
  implantDragOverSlot.value = null
}

/** 义体卸下残影样式：与拖拽残影同一套算法 */
const implantGhostStyle = computed(() => {
  const d = implantDrag.value
  if (!d) return {}
  const cell = gridRef.value?.querySelector('.inv-cell') as HTMLElement | null
  const s = cell?.offsetWidth ?? 44
  return {
    left: `${d.x}px`,
    top: `${d.y}px`,
    width: `${d.w * s + (d.w - 1) * GAP_PX}px`,
    height: `${d.h * s + (d.h - 1) * GAP_PX}px`,
  }
})

/** 卸下残影样式：与拖拽残影同一套算法 */
const equipGhostStyle = computed(() => {
  const d = equipDrag.value
  if (!d) return {}
  const cell = gridRef.value?.querySelector('.inv-cell') as HTMLElement | null
  const s = cell?.offsetWidth ?? 44
  return {
    left: `${d.x}px`,
    top: `${d.y}px`,
    width: `${d.w * s + (d.w - 1) * GAP_PX}px`,
    height: `${d.h * s + (d.h - 1) * GAP_PX}px`,
  }
})

/* ---------- 右键菜单（拆分堆叠） ---------- */
const ctxMenu = ref<{ anchor: number; x: number; y: number } | null>(null)
const ctxItem = computed(
  () => placedItems.value.find((it) => it.anchor === ctxMenu.value?.anchor) ?? null
)

/** 拆分模式被右键取消的瞬间时间戳：抑制紧随其后的 contextmenu 弹菜单 */
let splitCancelTs = 0

/** 物品右键：在指针位置弹出自定义菜单（钳制在视口内）；多选模式下右键改为退出多选 */
function onItemContextMenu(e: MouseEvent, item: PlacedItem) {
  hideHoverTip() // 右键弹菜单时收起悬停提示
  if (selectMode.value) {
    exitSelectMode()
    return
  }
  if (Date.now() - splitCancelTs < 300) return
  const x = Math.min(e.clientX, window.innerWidth - 150)
  const y = Math.min(e.clientY, window.innerHeight - 110)
  ctxMenu.value = { anchor: item.anchor, x, y }
}

function closeCtxMenu() {
  ctxMenu.value = null
}

/** 右键物品是否可出售（水晶本身是货币，不可出售） */
const ctxSellable = computed(() => !!ctxItem.value && ctxItem.value.itemId !== ITEM_CRYSTAL.id)

/** 出售整堆所得水晶 = 单价 × 堆叠数（价格见 config/items/prices.ts） */
const ctxSellGain = computed(() => {
  const it = ctxItem.value
  if (!it || !ctxSellable.value) return 0
  const def = getItemDef(it.itemId)
  return def ? getSellPrice(def) * it.count : 0
})

/** 出售：移除整堆物品，按价格表折算水晶入账 */
function onSell() {
  const it = ctxItem.value
  closeCtxMenu() // 关菜单后 ctxItem/ctxSellable 会连锁置空，只能用闭包内的 it 判断
  if (!it || it.itemId === ITEM_CRYSTAL.id) return
  const slot = state.slots[it.anchor]
  if (!slot) return
  const def = getItemDef(slot.itemId)
  if (!def) return
  state.slots[it.anchor] = null
  addCrystal(getSellPrice(def) * slot.count)
}

/* ---------- 物品详情悬浮窗（可同时开多个，各自拖拽 / 独立关闭） ---------- */
/** 详情窗口：物品快照（打开瞬间的数据，之后移动/拆分不影响已开的窗口）+ 位置 + 层级 */
interface DetailWin {
  id: number
  item: PlacedItem
  x: number
  y: number
  z: number
}

const detailWins = ref<DetailWin[]>([])
let winSeq = 0
let zSeq = 130

/** 窗口的物品静态定义 */
function winDef(win: DetailWin) {
  return getItemDef(win.item.itemId)
}

/** 窗口物品关联的武器战斗参数（无关联时为 null） */
function winWeapon(win: DetailWin) {
  const key = winDef(win)?.weaponKey
  return key ? (PLAYER_WEAPONS[key] ?? null) : null
}

/** 射速（发/秒）：发射间隔按 60 帧基准换算 */
function winFireRate(win: DetailWin) {
  const w = winWeapon(win)
  return w ? (60 / w.fireInterval).toFixed(1) : ''
}

/** 窗口提到最前 */
function raiseWin(win: DetailWin) {
  win.z = ++zSeq
}

/** 点击详情：同一物品已开窗则提到最前，否则在物品（右键菜单位置）旁边开新窗，层叠错位排开 */
function onDetail() {
  const it = ctxItem.value
  const menu = ctxMenu.value
  closeCtxMenu()
  if (!it) return
  const existing = detailWins.value.find((w) => w.item.anchor === it.anchor)
  if (existing) {
    raiseWin(existing)
    return
  }
  const n = detailWins.value.length % 8
  // 菜单弹在指针处（即物品旁），窗口贴菜单右下角；无菜单坐标时回退屏幕中部；整体钳制在视口内
  const baseX = menu ? menu.x + 12 : (window.innerWidth - 380) / 2
  const baseY = menu ? menu.y - 12 : window.innerHeight * 0.16
  detailWins.value.push({
    id: ++winSeq,
    item: { ...it },
    x: Math.min(Math.max(12, baseX + n * 28), window.innerWidth - 392),
    y: Math.min(Math.max(12, baseY + n * 28), window.innerHeight - 320),
    z: ++zSeq,
  })
}

function closeDetail(win: DetailWin) {
  detailWins.value = detailWins.value.filter((w) => w.id !== win.id)
}

/* 窗口拖拽：按住头部拖动，指针与窗口的相对偏移在拖动期间保持不变 */
let winDrag: { id: number; dx: number; dy: number } | null = null

function onWinDragStart(e: PointerEvent, win: DetailWin) {
  if (e.button !== 0) return
  e.preventDefault()
  raiseWin(win)
  winDrag = { id: win.id, dx: e.clientX - win.x, dy: e.clientY - win.y }
  window.addEventListener('pointermove', onWinDragMove)
  window.addEventListener('pointerup', onWinDragEnd, { once: true })
}

function onWinDragMove(e: PointerEvent) {
  if (!winDrag) return
  const win = detailWins.value.find((w) => w.id === winDrag!.id)
  if (!win) return
  // 钳制在视口内：至少留一条边可抓回
  win.x = Math.min(Math.max(-300, e.clientX - winDrag.dx), window.innerWidth - 80)
  win.y = Math.min(Math.max(0, e.clientY - winDrag.dy), window.innerHeight - 60)
}

function onWinDragEnd() {
  winDrag = null
  window.removeEventListener('pointermove', onWinDragMove)
}

/* ---------- 悬停详情提示：hover 背包物品 / 装备槽自动弹出，移开即消失 ---------- */
/** 提示弹出延迟（ms）：鼠标扫过物品时不闪现 */
const HOVER_TIP_DELAY = 240
/** 提示条宽（水平翻转定位用，与样式中的 width 一致） */
const HOVER_TIP_W = 340
/** 提示条估算高（垂直钳制在视口内用） */
const HOVER_TIP_H = 380

/** 悬停提示的物品快照（背包物品与槽位装备统一成同一视图） */
interface HoverTipItem {
  itemId: string
  name: string
  category: ItemCategory
  icon?: string
  iconScale: number
  kind?: string
  implantPart?: ImplantPart
  count: number
  rarity: ItemRarity
}

const hoverTip = ref<{ item: HoverTipItem; x: number; y: number } | null>(null)
let hoverTipTimer: number | null = null

function hideHoverTip() {
  if (hoverTipTimer !== null) {
    clearTimeout(hoverTipTimer)
    hoverTipTimer = null
  }
  hoverTip.value = null
}

/** 在目标元素旁弹出详情提示：右侧优先，贴近视口右缘则翻到左侧；垂直钳制在视口内 */
function showHoverTip(item: HoverTipItem, el: HTMLElement) {
  hideHoverTip()
  hoverTipTimer = window.setTimeout(() => {
    hoverTipTimer = null
    const rect = el.getBoundingClientRect()
    let x = rect.right + 10
    if (x + HOVER_TIP_W > window.innerWidth - 8) x = rect.left - HOVER_TIP_W - 10
    const y = Math.min(Math.max(8, rect.top), Math.max(8, window.innerHeight - HOVER_TIP_H - 8))
    hoverTip.value = { item, x, y }
  }, HOVER_TIP_DELAY)
}

/** 拖拽 / 拆分 / 多选进行中不弹提示 */
function hoverTipBlocked(): boolean {
  return !!(
    selectMode.value ||
    drag.value ||
    split.value ||
    equipDrag.value ||
    implantDrag.value ||
    skillDrag.value
  )
}

/** 背包物品悬停 */
function onItemHoverEnter(e: PointerEvent, item: PlacedItem) {
  if (hoverTipBlocked()) return
  showHoverTip(
    {
      itemId: item.itemId,
      name: item.name,
      category: item.category,
      icon: item.icon,
      iconScale: item.iconScale,
      kind: item.kind,
      implantPart: item.implantPart,
      count: item.count,
      rarity: item.rarity,
    },
    e.currentTarget as HTMLElement
  )
}

/** 装备槽悬停：由槽内物品 id 构造提示（空槽不弹） */
function onSlotHoverEnter(e: PointerEvent, itemId: string | null | undefined) {
  if (!itemId || hoverTipBlocked()) return
  const def = getItemDef(itemId)
  if (!def) return
  showHoverTip(
    {
      itemId: def.id,
      name: def.name,
      category: def.category,
      icon: def.icon,
      iconScale: def.iconScale ?? 1,
      kind: def.kind,
      implantPart: def.implantPart,
      count: 1,
      rarity: def.rarity,
    },
    e.currentTarget as HTMLElement
  )
}

/** 提示物品静态定义 / 关联武器参数 / 射速（模板用） */
const hoverTipDef = computed(() => (hoverTip.value ? getItemDef(hoverTip.value.item.itemId) : undefined))
const hoverTipWeapon = computed(() => {
  const key = hoverTipDef.value?.weaponKey
  return key ? (PLAYER_WEAPONS[key] ?? null) : null
})
const hoverTipFireRate = computed(() =>
  hoverTipWeapon.value ? (60 / hoverTipWeapon.value.fireInterval).toFixed(1) : ''
)

/* ---------- 拆分放置模式：分出一半跟随指针，点有效空位落下，否则并回原堆叠 ---------- */
const split = ref<{
  anchor: number
  itemId: string
  count: number
  rotated: boolean
  baseRotated: boolean
  nw: number
  nh: number
  w: number
  h: number
  x: number
  y: number
} | null>(null)
const splitOverIndex = ref(-1)

/** 拆分残影的物品静态信息（图标 / 稀有度等） */
const splitItem = computed(() => {
  const s = split.value
  if (!s) return null
  const def = getItemDef(s.itemId)
  if (!def) return null
  return { name: def.name, icon: def.icon, iconScale: def.iconScale ?? 1, rarity: def.rarity }
})

/** 点击拆分：关闭菜单，进入放置模式（数量暂不动，确认落点才扣减） */
function onSplit() {
  const it = ctxItem.value
  const menu = ctxMenu.value
  closeCtxMenu()
  if (!it || it.count <= 1 || !menu) return
  const size = getItemDef(it.itemId)?.size ?? { w: 1, h: 1 }
  split.value = {
    anchor: it.anchor,
    itemId: it.itemId,
    count: Math.floor(it.count / 2),
    rotated: it.rotated,
    baseRotated: it.rotated,
    nw: size.w,
    nh: size.h,
    w: it.w,
    h: it.h,
    x: menu.x,
    y: menu.y,
  }
  splitOverIndex.value = dropAnchorFromPoint(menu.x, menu.y, it.w, it.h)
  window.addEventListener('pointermove', onSplitMove)
  window.addEventListener('pointerdown', onSplitDown, { capture: true })
  window.addEventListener('keydown', onSplitKeydown)
}

function endSplit() {
  window.removeEventListener('pointermove', onSplitMove)
  window.removeEventListener('pointerdown', onSplitDown, { capture: true })
  window.removeEventListener('keydown', onSplitKeydown)
  split.value = null
  splitOverIndex.value = -1
}

function onSplitMove(e: PointerEvent) {
  const s = split.value
  if (!s) return
  s.x = e.clientX
  s.y = e.clientY

  applyOrientation(s, s.baseRotated)
  let idx = dropAnchorFromPoint(e.clientX, e.clientY, s.w, s.h)

  // 期望姿态放不下时临时自动旋转（与拖拽一致）
  if (idx >= 0 && s.nw !== s.nh && !canPlaceAt(s.itemId, idx, s.rotated)) {
    applyOrientation(s, !s.baseRotated)
    const idx2 = dropAnchorFromPoint(e.clientX, e.clientY, s.w, s.h)
    if (idx2 >= 0 && canPlaceAt(s.itemId, idx2, s.rotated)) {
      idx = idx2
    } else {
      applyOrientation(s, s.baseRotated)
    }
  }

  splitOverIndex.value = idx

  const grid = gridRef.value
  if (grid) {
    const rect = grid.getBoundingClientRect()
    const EDGE = 48
    const SPEED = 14
    // 仅当指针在网格矩形内部（横向在内、纵向贴边）时才滚动，避免指针在网格外误触发
    const insideX = e.clientX >= rect.left && e.clientX <= rect.right
    const inTopEdge = e.clientY >= rect.top && e.clientY < rect.top + EDGE
    const inBottomEdge = e.clientY > rect.bottom - EDGE && e.clientY <= rect.bottom
    if (insideX && inTopEdge) grid.scrollTop -= SPEED
    else if (insideX && inBottomEdge) grid.scrollTop += SPEED
  }
}

/** 全局按下：有效空位 → 落下；其他任何地方 → 取消（数量从未扣减，自然并回） */
function onSplitDown(e: PointerEvent) {
  e.stopPropagation()
  const s = split.value
  if (!s) return
  if (e.button === 2) {
    splitCancelTs = Date.now() // 右键取消：挡住随之而来的 contextmenu
  } else if (e.button === 0 && splitOverIndex.value >= 0) {
    placeSplit(s.anchor, splitOverIndex.value, s.count, s.rotated)
    playSfx(itemDropSfx)
  }
  endSplit()
}

/** R 旋转 / Esc 取消 */
function onSplitKeydown(e: KeyboardEvent) {
  const s = split.value
  if (!s) return
  if (e.key === 'Escape') {
    endSplit()
    return
  }
  if (e.key !== 'r' && e.key !== 'R') return
  s.baseRotated = !s.baseRotated
  applyOrientation(s, s.baseRotated)
  splitOverIndex.value = dropAnchorFromPoint(s.x, s.y, s.w, s.h)
}

/** 拆分落点预览：覆盖的单元格集合 + 是否可放置（必须全空位） */
const splitRect = computed(() => {
  const s = split.value
  if (!s || splitOverIndex.value < 0) return null
  const col = splitOverIndex.value % COLS
  const row = Math.floor(splitOverIndex.value / COLS)
  const cells = new Set<number>()
  for (let r = 0; r < s.h; r++) {
    for (let c = 0; c < s.w; c++) {
      if (col + c >= COLS || row + r >= ROWS) continue
      cells.add((row + r) * COLS + col + c)
    }
  }
  return { cells, valid: canPlaceAt(s.itemId, splitOverIndex.value, s.rotated) }
})

/** 拆分残影样式：与拖拽残影同一套算法 */
const splitGhostStyle = computed(() => {
  const s = split.value
  if (!s) return {}
  const cell = gridRef.value?.querySelector('.inv-cell') as HTMLElement | null
  const sz = cell?.offsetWidth ?? 44
  return {
    left: `${s.x}px`,
    top: `${s.y}px`,
    width: `${s.w * sz + (s.w - 1) * GAP_PX}px`,
    height: `${s.h * sz + (s.h - 1) * GAP_PX}px`,
  }
})

/** 子类别三角标的颜色：按 KIND_COLORS 取色，未登记用缺省色 */
function kindColor(kind: string): string {
  return KIND_COLORS[kind] ?? KIND_COLOR_DEFAULT
}

/** 义体部位 → 背包物品块右下角小字标注 */
const IMPLANT_PART_LABELS: Record<ImplantPart, string> = {
  head: '头部',
  body: '躯干',
  legs: '腿部',
}

/** 义体部位标注文本（非义体或无部位时为空） */
function implantPartLabel(item: PlacedItem): string {
  return item.implantPart ? IMPLANT_PART_LABELS[item.implantPart] : ''
}

/**
 * 图标样式：基准占格 62%，iconScale 手动缩放。
 * 旋转物品先把宽/高百分比对调（相对容器），再逆时针转 90°（素材枪口朝右，转完朝上）。
 * 直接 rotate 不换比例的话，横图在竖格子里会被 object-fit 缩得很小。
 */
function iconStyle(rotated: boolean, w: number, h: number, scale = 1) {
  const base = 62 * scale
  if (!rotated) return { width: `${base}%`, height: `${base}%` }
  return {
    width: `${(base * h) / w}%`,
    height: `${(base * w) / h}%`,
    transform: 'rotate(-90deg)',
  }
}
</script>

<template>
  <div class="chara-page" @contextmenu.prevent :style="{
    backgroundImage: `linear-gradient(rgba(6, 7, 18, 0.9), rgba(6, 7, 18, 0.96)), url(${bg2Url})`
  }">
    <!-- 背景装饰：点阵 -->
    <div class="deco-dots" aria-hidden="true" />

    <header class="chara-page__header">
      <button class="chara-back" @mouseenter="onBtnHover" @click="onBackClick">
        <span class="chara-back__arrow">◀</span>
        <span class="chara-back__text">返回</span>
        <span class="chara-back__sub">BACK</span>
      </button>

      <div class="chara-title-block">
        <h2 class="chara-page__title">角色</h2>
        <span class="chara-page__tag">CHARACTER // UNIT-INFO</span>
      </div>

      <div class="chara-header__meta">
        <div class="chara-currency" title="水晶">
          <img class="chara-currency__icon" :src="crystalIcon" alt="水晶" draggable="false" />
          <span class="chara-currency__amount">{{ crystalText }}</span>
        </div>
        <div class="chara-header__serial">
          <span class="chara-header__serial-line">NO.002</span>
          <span class="chara-header__serial-line">SYS.READY</span>
        </div>
        <div class="chara-barcode" aria-hidden="true">
          <i v-for="n in 14" :key="n" :style="{ width: `${(n * 7) % 3 + 1}px` }" />
        </div>
      </div>
    </header>

    <div class="hazard-strip" aria-hidden="true" />

    <div class="chara-page__body">
      <!-- 最左侧：角色选择标签列 -->
      <nav class="chara-rail" aria-label="角色选择">
        <span class="chara-rail__label">UNIT</span>
        <button v-for="c in CHARACTERS" :key="c.id" class="unit-tab"
          :class="{ 'unit-tab--active': activeUnit === c.id }" :aria-pressed="activeUnit === c.id" :title="c.name"
          @mouseenter="onBtnHover" @click="onUnitClick(c.id)">
          <img class="unit-tab__avatar" :src="miaonaiAvatar" :alt="c.name" draggable="false" />
        </button>
      </nav>

      <!-- 左侧区域：角色立绘 -->
      <section class="chara-main">
        <div class="chara-main__frame">
          <!-- 模拟训练按钮：右上角悬浮 -->
          <button class="chara-training-btn" title="进入全息模拟训练舱，无敌人，自由练习"
            @mouseenter="onBtnHover" @click="onTrainingClick">
            <span class="chara-training-btn__icon">▷</span>
            <span class="chara-training-btn__text">模拟训练</span>
          </button>
          <i class="chara-main__bracket chara-main__bracket--tl" />
          <i class="chara-main__bracket chara-main__bracket--tr" />
          <i class="chara-main__bracket chara-main__bracket--bl" />
          <i class="chara-main__bracket chara-main__bracket--br" />
          <img class="chara-main__portrait" :src="miaonaiPortrait" alt="喵奈" draggable="false" />
          <div class="chara-main__nameplate">
            <span class="chara-main__name">喵奈</span>
            <span class="chara-main__name-sub">MIAONAI // UNIT-01</span>
          </div>
          <span class="chara-main__coord chara-main__coord--y">Y:000.00</span>
        </div>

        <!-- 装备槽：叠加在立绘右侧留白处（按截图红框位置：义体 3 组 + 底部武器 × 2） -->
        <div class="chara-equip">
          <!-- 义体区：左侧 3 个部位组，右侧属性变化面板 -->
          <div class="equip-implants">
            <div class="equip-implants__groups">
              <!-- 义体部位组：3 个等大义体槽 -->
              <div v-for="part in IMPLANT_PARTS" :key="part.key" class="equip-group">
                <i class="equip-group__link" :class="`equip-group__link--${part.key}`" aria-hidden="true"><i /></i>
                <span class="equip-group__tag">{{ part.en }} // {{ part.label }}</span>
                <div class="equip-group__row">
                  <div v-for="i in SLOTS_PER_IMPLANT" :key="i" class="equip-slot equip-slot--implant"
                    :class="{
                      'equip-slot--drop-ok':
                        equipOverImplantSlot === implantSlotKeyOf(part.key, i) ||
                        implantDragOverSlot === implantSlotKeyOf(part.key, i),
                    }"
                    :data-implant-slot="implantSlotKeyOf(part.key, i)"
                    :title="implantSlotDef(implantSlotKeyOf(part.key, i))
                      ? undefined
                      : `${part.label}义体 ${i}（将${part.label}义体拖至此处或双击穿戴）`"
                    @pointerenter="onSlotHoverEnter($event, equipState.implants[implantSlotKeyOf(part.key, i)])"
                    @pointerleave="hideHoverTip"
                    @pointerdown.prevent.stop="onImplantSlotPointerDown($event, implantSlotKeyOf(part.key, i))">
                    <!-- 已装备：稀有度底色块 + 图标 + 名称 -->
                    <div v-if="implantSlotDef(implantSlotKeyOf(part.key, i))" class="equip-slot__filled"
                      :class="`inv-item--${implantSlotDef(implantSlotKeyOf(part.key, i))!.rarity}`">
                      <img class="equip-slot__icon"
                        :src="implantSlotDef(implantSlotKeyOf(part.key, i))!.icon || crystalIcon"
                        :alt="implantSlotDef(implantSlotKeyOf(part.key, i))!.name" draggable="false" />
                      <span class="equip-slot__label">{{ implantSlotDef(implantSlotKeyOf(part.key, i))!.name }}</span>
                      <!-- 左下角小字数字：义体耐受度（承受值） -->
                      <span v-if="implantLoadOf(implantSlotDef(implantSlotKeyOf(part.key, i)) ?? undefined)"
                        class="equip-slot__load">{{
                          implantLoadOf(implantSlotDef(implantSlotKeyOf(part.key, i)) ?? undefined) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 承受度面板：竖向分段计量条（属性变化面板左侧），自底向上点亮，顶部 20% 为危险区 -->
            <div class="implant-load" :class="{ 'implant-load--warn': implantLoadWarn }"
              :title="`义体承受度 ${implantLoad} / ${implantCap}：装配义体占用承受度，总和不得超过上限`">
              <div class="implant-load__gauge">
                <!-- 上限：固定在刻度柱右上 -->
                <span class="implant-load__num implant-load__num--cap">{{ implantCap }}</span>
                <!-- 当前值：绝对定位在点亮刻度的顶沿高度，跟随承受度上下移动 -->
                <span class="implant-load__num implant-load__num--cur"
                  :style="{ bottom: `${implantLoadRatio * 100}%` }">{{ implantLoad }}</span>
                <div class="implant-load__ticks">
                  <i v-for="n in IMPLANT_LOAD_TICKS" :key="n" class="implant-load__tick" :class="{
                    'implant-load__tick--on': n <= implantLoadTicks,
                    'implant-load__tick--danger': n > IMPLANT_LOAD_TICKS_SAFE,
                    // 窄刻度：当前液面起向上 3 段（含未占用刻度，给左侧当前值数字让位）+ 顶部 3 段（上限数字在右上）
                    'implant-load__tick--slim':
                      n >= implantLoadTicks - 1 || n > IMPLANT_LOAD_TICKS - 3,
                  }" />
                </div>
              </div>
              <span class="implant-load__label">承受度 // LOAD</span>
            </div>

            <!-- 属性变化面板：汇总全部已装备义体的修正（正增益绿 / 减益红） -->
            <div class="implant-stats">
              <span class="implant-stats__tag">IMPLANT // 属性变化</span>
              <template v-if="implantStatLines.length">
                <div v-for="line in implantStatLines" :key="line.label" class="implant-stats__line"
                  :class="line.positive ? 'implant-stats__line--up' : 'implant-stats__line--down'">
                  <span class="implant-stats__label">{{ line.label }}</span>
                  <span class="implant-stats__value">{{ line.value }}</span>
                </div>
              </template>
              <span v-else class="implant-stats__empty">NO IMPLANT</span>
            </div>

            <!-- 角色基础属性面板：出厂数值 + 默认机制参数（不含义体修正） -->
            <div class="base-stats">
              <span class="base-stats__tag">UNIT // 基础属性</span>
              <div v-for="line in baseStatLines" :key="line.label" class="base-stats__line">
                <span class="base-stats__label">{{ line.label }}</span>
                <span class="base-stats__value">{{ line.value }}</span>
              </div>
            </div>
          </div>

          <!-- 特殊技能槽（拖拽技能物品到此处装备，点击卸下） -->
          <div class="equip-group">
            <span class="equip-group__tag">SKILL // 特殊技能</span>
            <div class="equip-group__row">
              <div class="equip-slot equip-slot--skill"
                :class="{ 'equip-slot--drop-ok': equipOverSkillSlot }"
                :data-skill-slot="'skill-1'"
                :title="equippedSkillDef ? undefined : '未装备技能（将技能物品拖至此处）'"
                @pointerenter="onSlotHoverEnter($event, equipState.skill)"
                @pointerleave="hideHoverTip"
                @pointerdown.prevent.stop="onSkillSlotPointerDown">
                <!-- 已装备：稀有度底色块 + 图标 + 名称 -->
                <div v-if="equippedSkillDef" class="equip-slot__filled"
                  :class="`inv-item--${equippedSkillDef.rarity}`">
                  <img class="equip-slot__icon" :src="equippedSkillDef.icon || crystalIcon"
                    :alt="equippedSkillDef.name" draggable="false" />
                  <span class="equip-slot__label">{{ equippedSkillDef.name }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 武器槽 × 2 -->
          <div class="equip-group equip-group--weapon">
            <span class="equip-group__tag">WEAPON // 武器</span>
            <div class="equip-group__row equip-group__row--weapon">
              <div v-for="(slot, idx) in WEAPON_SLOTS" :key="slot.key" class="equip-slot equip-slot--weapon"
                :class="{ 'equip-slot--drop-ok': equipOverSlot === slot.key || equipDragOverSlot === slot.key }"
                :data-weapon-slot="slot.key"
                :title="equippedDef(slot.key) ? undefined : slot.label"
                @pointerenter="onSlotHoverEnter($event, equipState.weapons[slot.key])"
                @pointerleave="hideHoverTip"
                @pointerdown="onEquipPointerDown($event, slot.key)">
                <span class="equip-slot__num">{{ idx + 1 }}</span>
                <!-- 已装备：稀有度底色块 + 图标 + 名称（可拖回背包卸下） -->
                <div v-if="equippedDef(slot.key)" class="equip-slot__filled"
                  :class="`inv-item--${equippedDef(slot.key)!.rarity}`">
                  <img class="equip-slot__icon" :src="equippedDef(slot.key)!.icon || crystalIcon"
                    :alt="equippedDef(slot.key)!.name" draggable="false" />
                  <span class="equip-slot__name">{{ equippedDef(slot.key)!.name }}</span>
                </div>
                <img v-else class="equip-slot__ghost" :src="weaponShadow" alt="" aria-hidden="true">
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 右侧：网格背包 -->
      <aside class="chara-inv">
        <div class="chara-inv__head">
          <div class="chara-inv__head-top">
            <span class="chara-inv__label">INVENTORY</span>
            <span class="chara-inv__count">
              <b>{{ matchCount }}</b> / {{ CAPACITY }}
            </span>
          </div>
          <div class="chara-inv__tabs">
            <button v-for="tab in TABS" :key="tab.key" class="inv-tab"
              :class="{ 'inv-tab--active': activeTab === tab.key }"
              @mouseenter="onBtnHover" @click="onTabClick(tab.key)">
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div class="chara-inv__status">
          <span class="chara-inv__status-dot" />
          <span class="chara-inv__status-text">FILTER:{{ categoryLabel }} — OK</span>
        </div>

        <div ref="gridRef" class="chara-inv__grid" :class="{ 'chara-inv__grid--dragging': drag }">
          <div class="inv-board">
            <!-- 底纹层：400 个单元格自动排布，决定网格高度 -->
            <div class="inv-cells">
              <div v-for="i in CAPACITY" :key="i" class="inv-cell" :data-index="i - 1" :class="{
                'inv-cell--drop-ok': (dragRect ?? splitRect ?? equipDropRect ?? implantDropRect ?? skillDropRect)?.valid && (dragRect ?? splitRect ?? equipDropRect ?? implantDropRect ?? skillDropRect)!.cells.has(i - 1),
                'inv-cell--drop-bad': !!(dragRect ?? splitRect ?? equipDropRect ?? implantDropRect ?? skillDropRect) && !(dragRect ?? splitRect ?? equipDropRect ?? implantDropRect ?? skillDropRect)!.valid && (dragRect ?? splitRect ?? equipDropRect ?? implantDropRect ?? skillDropRect)!.cells.has(i - 1),
              }" />
            </div>
            <!-- 物品层：绝对定位叠加的独立网格，显式定位互不干扰 -->
            <div class="inv-items">
              <div v-for="item in placedItems" :key="item.anchor" class="inv-item" :class="[
                `inv-item--${item.rarity}`,
                {
                  'inv-item--dimmed': isDimmed(item),
                  'inv-item--drag-source': drag?.anchor === item.anchor || split?.anchor === item.anchor,
                  'inv-item--selected': selected.has(item.anchor),
                },
              ]" :style="itemStyle(item)"
                @pointerenter="onItemHoverEnter($event, item)"
                @pointerleave="hideHoverTip"
                @pointerdown="onItemPointerDown($event, item)"
                @contextmenu.prevent.stop="onItemContextMenu($event, item)">
                <img class="inv-item__icon" :src="item.icon || crystalIcon" :alt="item.name"
                  :style="iconStyle(item.rotated, item.w, item.h, item.iconScale)" draggable="false" />
                <span class="inv-item__name">{{ item.name }}</span>
                <!-- 义体不显示右上角三角标，改为右下角小字标注部位 -->
                <span v-if="item.kind && item.category !== 'implant'" class="inv-item__kind"
                  :style="{ background: kindColor(item.kind) }" :title="item.kind"></span>
                <span v-if="implantPartLabel(item)" class="inv-item__part">{{ implantPartLabel(item) }}</span>
                <!-- 义体左下角小字数字：耐受度（承受值） -->
                <span v-if="item.implantLoad" class="inv-item__load">{{ item.implantLoad }}</span>
                <span v-if="item.count > 1" class="inv-item__count">{{ item.count }}</span>
                <span v-if="selected.has(item.anchor)" class="inv-item__check">✓</span>
              </div>
            </div>
          </div>
        </div>

        <div class="chara-inv__foot">
          <div class="chara-inv__foot-meta">
            <span>SORT://AUTO</span>
            <span>DRAG:MOVE · R:ROTATE · AUTO-FIT</span>
            <span>CAP.{{ CAPACITY }}</span>
          </div>
          <!-- 多选模式：整理按钮变为 取消 + 出售 -->
          <div v-if="selectMode" class="chara-inv__foot-actions">
            <button class="chara-inv__btn chara-inv__btn--cancel"
              @mouseenter="onBtnHover" @click="onCancelClick">
              <span class="chara-inv__btn-text">取消</span>
              <span class="chara-inv__btn-sub">CANCEL</span>
            </button>
            <button class="chara-inv__btn chara-inv__btn--sell" :disabled="selectedCount === 0"
              @mouseenter="onSellBtnHover" @click="onSellSelectedClick">
              <span class="chara-inv__btn-text">出售</span>
              <span class="chara-inv__btn-sub">+{{ selectedGain }} 水晶 · {{ selectedCount }} 件</span>
            </button>
          </div>
          <button v-else class="chara-inv__btn" @mouseenter="onBtnHover" @click="onSortClick">
            <span class="chara-inv__btn-text">整理</span>
            <span class="chara-inv__btn-sub">ORGANIZE</span>
          </button>
        </div>
      </aside>
    </div>

    <!-- 拖拽残影：跟随指针的物品块（按实际占格尺寸） -->
    <div v-if="drag && dragItem" class="drag-ghost" :class="`drag-ghost--${dragItem.rarity}`" :style="ghostStyle">
      <img class="inv-item__icon" :src="dragItem.icon || crystalIcon" :alt="dragItem.name"
        :style="iconStyle(drag.rotated, drag.w, drag.h, dragItem.iconScale)" draggable="false" />
      <span v-if="dragItem.count > 1" class="inv-item__count">{{ dragItem.count }}</span>
    </div>

    <!-- 拆分残影：跟随指针的半份物品块，点空位落下 / 点其他处并回 -->
    <div v-if="split && splitItem" class="drag-ghost drag-ghost--split" :class="`drag-ghost--${splitItem.rarity}`"
      :style="splitGhostStyle">
      <img class="inv-item__icon" :src="splitItem.icon || crystalIcon" :alt="splitItem.name"
        :style="iconStyle(split.rotated, split.w, split.h, splitItem.iconScale)" draggable="false" />
      <span v-if="split.count > 1" class="inv-item__count">{{ split.count }}</span>
    </div>

    <!-- 卸下残影：从武器槽拖出的已装备武器，放到背包空格即卸下 -->
    <div v-if="equipDrag && equipDragDef" class="drag-ghost" :class="`drag-ghost--${equipDragDef.rarity}`"
      :style="equipGhostStyle">
      <img class="inv-item__icon" :src="equipDragDef.icon || crystalIcon" :alt="equipDragDef.name"
        :style="iconStyle(false, equipDrag.w, equipDrag.h, equipDragDef.iconScale ?? 1)" draggable="false" />
    </div>

    <!-- 义体卸下残影：从义体槽拖出的已装备义体，放到背包空格即卸下 -->
    <div v-if="implantDrag && implantDragDef" class="drag-ghost" :class="`drag-ghost--${implantDragDef.rarity}`"
      :style="implantGhostStyle">
      <img class="inv-item__icon" :src="implantDragDef.icon || crystalIcon" :alt="implantDragDef.name"
        :style="iconStyle(false, implantDrag.w, implantDrag.h, implantDragDef.iconScale ?? 1)" draggable="false" />
    </div>

    <!-- 技能卸下残影：从技能槽拖出的已装备技能，放到背包空格即卸下 -->
    <div v-if="skillDrag && skillDragDef" class="drag-ghost" :class="`drag-ghost--${skillDragDef.rarity}`"
      :style="skillGhostStyle">
      <img class="inv-item__icon" :src="skillDragDef.icon || crystalIcon" :alt="skillDragDef.name"
        :style="iconStyle(false, skillDrag.w, skillDrag.h, skillDragDef.iconScale ?? 1)" draggable="false" />
    </div>

    <!-- 右键菜单：拆分堆叠 -->
    <div v-if="ctxMenu && ctxItem" class="ctx-overlay" @click="closeCtxMenu" @contextmenu.prevent="closeCtxMenu">
      <div class="ctx-menu" :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }" @click.stop>
        <div class="ctx-menu__title">{{ ctxItem.name }} ×{{ ctxItem.count }}</div>
        <button class="ctx-menu__item" @mouseenter="onBtnHover" @click="onDetailClick">
          <span class="ctx-menu__item-text">详情</span>
          <span class="ctx-menu__item-sub">DETAIL</span>
        </button>
        <button v-if="ctxItem.count > 1" class="ctx-menu__item"
          @mouseenter="onBtnHover" @click="onSplitClick">
          <span class="ctx-menu__item-text">拆分一半</span>
          <span class="ctx-menu__item-sub">SPLIT</span>
        </button>
        <button v-if="ctxSellable" class="ctx-menu__item ctx-menu__item--sell"
          @mouseenter="onBtnHover" @click="onCtxSellClick">
          <span class="ctx-menu__item-text">出售</span>
          <span class="ctx-menu__item-price">
            <img :src="crystalIcon" alt="水晶" draggable="false" />
            +{{ ctxSellGain }}
          </span>
        </button>
      </div>
    </div>

    <!-- 悬停详情提示：hover 背包物品 / 装备槽自动弹出，移开即消失；不拦截指针，复用详情窗样式 -->
    <div v-if="hoverTip && hoverTipDef" class="detail-panel hover-tip"
      :class="`detail-panel--${hoverTip.item.rarity}`"
      :style="{ left: `${hoverTip.x}px`, top: `${hoverTip.y}px` }">
      <header class="detail-panel__head hover-tip__head">
        <div class="detail-panel__icon-box" :class="`inv-item--${hoverTip.item.rarity}`">
          <img class="inv-item__icon" :src="hoverTip.item.icon || crystalIcon" :alt="hoverTip.item.name"
            :style="iconStyle(false, 1, 1, hoverTip.item.iconScale)" draggable="false" />
        </div>
        <div class="detail-panel__title">
          <span class="detail-panel__name">{{ hoverTip.item.name }}</span>
          <span class="detail-panel__tags">
            <i class="detail-panel__rarity">{{ RARITY_NAMES[hoverTip.item.rarity] }}</i>
            <i v-if="hoverTip.item.kind" class="detail-panel__kind">{{ hoverTip.item.kind }}</i>
          </span>
        </div>
      </header>

      <p v-if="hoverTipDef.desc" class="detail-panel__desc">{{ hoverTipDef.desc }}</p>

      <div v-if="hoverTipWeapon" class="detail-panel__stats">
        <span class="detail-panel__stats-title">COMBAT // 战斗参数</span>
        <div class="detail-panel__row">
          <span>单发伤害</span><b>{{ hoverTipWeapon!.bulletDamage }}</b>
        </div>
        <div class="detail-panel__row">
          <span>射速</span><b>{{ hoverTipFireRate }} 发/秒</b>
        </div>
        <div class="detail-panel__row">
          <span>弹速</span><b>{{ hoverTipWeapon!.bulletSpeed }}</b>
        </div>
        <div class="detail-panel__row">
          <span>弹匣容量</span><b>{{ hoverTipWeapon!.magazine ?? '∞' }}</b>
        </div>
      </div>

      <div class="detail-panel__meta">
        <div v-if="hoverTip.item.implantPart" class="detail-panel__row">
          <span>承受值</span><b>{{ implantLoadOf(hoverTipDef) }}</b>
        </div>
        <div v-if="hoverTip.item.itemId !== ITEM_CRYSTAL.id" class="detail-panel__row">
          <span>出售价</span><b>{{ getSellPrice(hoverTipDef) }} 水晶</b>
        </div>
      </div>
    </div>

    <!-- 物品详情悬浮窗：可开多个，各自拖拽（拖头部）/ 独立关闭，点击窗体提到最前 -->
    <div v-for="win in detailWins" :key="win.id" class="detail-panel" :class="`detail-panel--${win.item.rarity}`"
      :style="{ left: `${win.x}px`, top: `${win.y}px`, zIndex: win.z }" @pointerdown="raiseWin(win)">
      <header class="detail-panel__head" @pointerdown="onWinDragStart($event, win)">
        <div class="detail-panel__icon-box" :class="`inv-item--${win.item.rarity}`">
          <img class="inv-item__icon" :src="win.item.icon || crystalIcon" :alt="win.item.name"
            :style="iconStyle(false, 1, 1, win.item.iconScale)" draggable="false" />
        </div>
        <div class="detail-panel__title">
          <span class="detail-panel__name">{{ win.item.name }}</span>
          <span class="detail-panel__tags">
            <i class="detail-panel__rarity">{{ RARITY_NAMES[win.item.rarity] }}</i>
            <i v-if="win.item.kind" class="detail-panel__kind">{{ win.item.kind }}</i>
          </span>
        </div>
        <button class="detail-panel__close" title="关闭" @pointerdown.stop
          @mouseenter="onBtnHover" @click="onCloseDetailClick(win)">✕</button>
      </header>

      <p v-if="winDef(win)?.desc" class="detail-panel__desc">{{ winDef(win)!.desc }}</p>

      <div v-if="winWeapon(win)" class="detail-panel__stats">
        <span class="detail-panel__stats-title">COMBAT // 战斗参数</span>
        <div class="detail-panel__row">
          <span>单发伤害</span><b>{{ winWeapon(win)!.bulletDamage }}</b>
        </div>
        <div class="detail-panel__row">
          <span>射速</span><b>{{ winFireRate(win) }} 发/秒</b>
        </div>
        <div class="detail-panel__row">
          <span>弹速</span><b>{{ winWeapon(win)!.bulletSpeed }}</b>
        </div>
        <div class="detail-panel__row">
          <span>弹匣容量</span><b>{{ winWeapon(win)!.magazine ?? '∞' }}</b>
        </div>
      </div>

      <div class="detail-panel__meta">
        <div v-if="win.item.implantPart" class="detail-panel__row">
          <span>承受值</span><b>{{ implantLoadOf(winDef(win)) }}</b>
        </div>
        <div v-if="win.item.itemId !== ITEM_CRYSTAL.id" class="detail-panel__row">
          <span>出售价</span><b>{{ winDef(win) ? getSellPrice(winDef(win)!) : 0 }} 水晶</b>
        </div>
      </div>
    </div>

    <footer class="chara-page__footer">
      <span class="chara-page__footer-item">■ UNIT-MGMT TERMINAL</span>
      <span class="chara-page__footer-item">VER 2.0.26</span>
      <span class="chara-page__footer-item chara-page__footer-item--right">LINK:STABLE ▮▮▮▮▯</span>
    </footer>

    <!-- 通用软提醒：装配 / 卸下被规则阻止时屏幕正中飘出，2.2 秒后自动消失 -->
    <TransitionGroup name="notice-tip" tag="div" class="notice-tips">
      <p v-for="tip in noticeTips" :key="tip.id" class="notice-tip">
        <span class="notice-tip__dot" />{{ tip.text }}
      </p>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/stg-vars.scss' as *;

$hi: $accent; // #bb99f5
$hi-2: $accent-purple; // #f0abfc
$ink: #0a0a16;

/* ===== 页面基底 ===== */
.chara-page {
  position: absolute;
  inset: 0;
  z-index: 45;
  display: flex;
  flex-direction: column;
  background-size: cover;
  background-position: center;
  overflow: hidden;
}

/* ===== 背景装饰 ===== */
.deco-dots {
  position: absolute;
  top: 0;
  right: 0;
  width: 46%;
  height: 100%;
  pointer-events: none;
  background-image: radial-gradient(rgb(187 153 245 / 14%) 1px, transparent 1px);
  background-size: 14px 14px;
  mask-image: linear-gradient(105deg, transparent 30%, #000 75%);
  -webkit-mask-image: linear-gradient(105deg, transparent 30%, #000 75%);
}

/* ===== 顶部 ===== */
.chara-page__header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px 26px 14px;
  background:
    linear-gradient(180deg, rgb(30 15 50 / 60%), transparent);
}

.chara-back {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px 7px 12px;
  border: 1px solid rgb(187 153 245 / 40%);
  border-radius: 0;
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  background: linear-gradient(180deg, rgb(80 50 130 / 45%), rgb(40 25 75 / 35%));
  color: rgb(220 190 255 / 90%);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;

  &:hover {
    border-color: $hi;
    background: linear-gradient(180deg, rgb(110 70 175 / 55%), rgb(60 35 105 / 40%));
    box-shadow: 0 0 14px rgb(160 100 255 / 30%);
    transform: translateX(-2px);
  }

  &:active {
    transform: translateX(-2px) scale(0.97);
  }
}

.chara-back__arrow {
  font-size: 10px;
  line-height: 1;
}

.chara-back__text {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 3px;
}

.chara-back__sub {
  font-size: 9px;
  letter-spacing: 1.5px;
  opacity: 0.5;
}

.chara-title-block {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding-left: 16px;
  border-left: 3px solid $hi;
}

.chara-page__title {
  font-size: 24px;
  font-weight: 900;
  color: rgb(240 230 255 / 95%);
  letter-spacing: 8px;
  margin: 0;
  text-shadow: 0 0 18px rgb(160 100 255 / 35%);
}

.chara-page__tag {
  font-size: 10px;
  font-weight: 600;
  color: rgb(187 153 245 / 65%);
  letter-spacing: 2.5px;
}

.chara-header__meta {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 页头水晶货币 */
.chara-currency {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px 5px 8px;
  border: 1px solid rgb(187 153 245 / 35%);
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  background: rgb(10 8 22 / 55%);
}

.chara-currency__icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  filter: drop-shadow(0 0 5px rgb(96 200 255 / 70%));
}

.chara-currency__amount {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #aee6ff;
  text-shadow: 0 0 8px rgb(96 200 255 / 60%);
  font-variant-numeric: tabular-nums;
}

.chara-header__serial {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.chara-header__serial-line {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgb(200 170 245 / 60%);
  font-variant-numeric: tabular-nums;

  &:first-child {
    color: $hi-2;
  }
}

.chara-barcode {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 26px;
  padding: 3px 5px;
  border: 1px solid rgb(187 153 245 / 30%);
  background: rgb(10 8 22 / 50%);

  i {
    display: block;
    background: rgb(220 200 255 / 75%);
  }
}

/* ===== 警示条纹分隔线 ===== */
.hazard-strip {
  height: 10px;
  margin: 0 26px;
  background: repeating-linear-gradient(-45deg,
      $hi 0 8px,
      transparent 8px 16px);
  opacity: 0.35;
  clip-path: polygon(0 0, 100% 0, calc(100% - 6px) 100%, 6px 100%);
}

/* ===== 主体 ===== */
.chara-page__body {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 22px 26px 16px;
  gap: 22px;
}

/* ===== 最左侧：角色选择标签列 ===== */
.chara-rail {
  width: 84px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding-top: 2px;
}

.chara-rail__label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 3px;
  color: rgb(187 153 245 / 55%);

  /* 两侧装饰细线，呼应工业面板的分区标头 */
  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgb(187 153 245 / 40%), transparent);
  }
}

/* 折角缎带形标签：左侧半高短边 + 斜边 + 右侧尖角 + 左下水平台阶
   （注意：clip-path 会裁掉 box-shadow，外发光要用 filter: drop-shadow） */
.unit-tab {
  position: relative;
  height: 122px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  padding: 0 0 0 3px; // 给左侧脊椎刻线让位
  font-family: inherit;
  cursor: pointer;
  color: rgb(216 190 252 / 80%);
  text-shadow: 0 1px 2px rgb(0 0 0 / 65%);
  clip-path: polygon(0 0,
      15% 0,
      100% 54.64%,
      100% 100%,
      85% 100%,
      15% 55%,
      0 55%);
  background:
    /* 右下角警示纹小块 */
    repeating-linear-gradient(-45deg, rgb(187 153 245 / 18%) 0 3px, transparent 3px 6px) 100% 100% / 26% 8px no-repeat,
    /* 顶部金属高光 */
    linear-gradient(180deg, rgb(255 255 255 / 8%), transparent 22%),
    /* 水平拉丝纹理 */
    repeating-linear-gradient(0deg, rgb(187 153 245 / 5%) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, rgb(48 33 86 / 94%), rgb(20 14 40 / 88%));
  transition: all 0.18s;

  &:hover {
    z-index: 3;
    color: rgb(240 222 255 / 98%);
    background:
      repeating-linear-gradient(-45deg, rgb(240 171 252 / 24%) 0 3px, transparent 3px 6px) 100% 100% / 26% 8px no-repeat,
      linear-gradient(180deg, rgb(255 255 255 / 11%), transparent 22%),
      repeating-linear-gradient(0deg, rgb(187 153 245 / 6%) 0 1px, transparent 1px 4px),
      linear-gradient(180deg, rgb(84 56 136 / 94%), rgb(42 27 80 / 88%));
    filter: drop-shadow(0 0 10px rgb(160 100 255 / 45%));
    transform: translateX(5px);
  }

  &:active {
    transform: translateX(5px) scale(0.97);
  }
}

/* 折角描边：mask 抠掉中间只留 1px 边环，父级 clip-path 负责把边环裁出斜边 */
.unit-tab::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  padding: 1px;
  background: linear-gradient(155deg,
      rgb(205 175 250 / 60%),
      rgb(187 153 245 / 14%) 42%,
      rgb(187 153 245 / 40%));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}

/* 左侧细脊椎条：沿左竖边（0~55% 区段）的机能刻线 */
.unit-tab::after {
  content: '';
  position: absolute;
  top: 4px;
  bottom: 47%;
  left: 0;
  z-index: 2;
  width: 2px;
  background: linear-gradient(180deg, rgb(230 219 255 / 35%), rgb(230 219 255 / 8%));
  pointer-events: none;
}

.unit-tab:hover::after {
  background: linear-gradient(180deg, rgb(230 219 255 / 60%), rgb(230 219 255 / 20%));
}

/* 标签头像：铺满整个标签，由父级 clip-path 裁出折角；默认压暗，逐级点亮 */
.unit-tab__avatar {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  user-select: none;
  /* 微量模糊柔化缩图锯齿；blur 在所有状态间保持一致，避免切换时锐度跳变 */
  filter: brightness(0.7) saturate(0.9) blur(0.4px);
  transform: translateZ(0) scale(0.85); // GPU 合成 + 等比缩小（调这个数值）
  backface-visibility: hidden;
  transition: filter 0.18s;
  margin-left: 6px;
  margin-top: 14px;
}

.unit-tab:hover .unit-tab__avatar {
  filter: brightness(0.92) blur(0.4px);
}

.unit-tab--active .unit-tab__avatar,
.unit-tab--active:hover .unit-tab__avatar {
  filter: brightness(1.05) blur(0.4px);
}

/* 斜边互嵌：后一个标签上移，咬进前一个斜边裁出的空三角
   （负边距约 36% 标签高度，已接近理论极限 ~37%，再大两条斜边会贴上） */
.unit-tab+.unit-tab {
  margin-top: -44px;
}

.unit-tab--active,
.unit-tab--active:hover {
  z-index: 2;
  color: $ink;
  text-shadow: none;
  background:
    repeating-linear-gradient(-45deg, rgb(10 10 22 / 20%) 0 3px, transparent 3px 6px) 100% 100% / 26% 8px no-repeat,
    linear-gradient(180deg, rgb(255 255 255 / 38%), transparent 26%),
    repeating-linear-gradient(0deg, rgb(255 255 255 / 7%) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, $hi-2, $hi);
  filter: drop-shadow(0 0 14px rgb(160 100 255 / 55%));
  transform: translateX(5px);
}

/* 选中态描边：外亮内暗，模拟凸起金属牌 */
.unit-tab--active::before {
  background: linear-gradient(155deg,
      rgb(255 255 255 / 85%),
      rgb(255 255 255 / 22%) 42%,
      rgb(10 10 22 / 30%));
}

.unit-tab--active::after {
  background: linear-gradient(180deg, rgb(230 219 255 / 95%), rgb(230 219 255 / 40%));
}

/* ===== 左侧区域（暂留空，工业框装饰） ===== */
.chara-main {
  flex: 1;
  min-width: 0;
  display: flex;
}

.chara-main__frame {
  position: relative;
  flex: 1;
  overflow: hidden; // 裁掉立绘负偏移溢出的透明部分
  border: 1px dashed rgb(187 153 245 / 22%);
  background:
    linear-gradient(rgb(187 153 245 / 3%) 1px, transparent 1px) 0 0 / 100% 28px,
    linear-gradient(90deg, rgb(187 153 245 / 3%) 1px, transparent 1px) 0 0 / 28px 100%;
}

/* ===== 模拟训练按钮：右上角悬浮（与页面统一的紫色切角金属牌） ===== */
.chara-training-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 18px 8px 12px;
  border: 0; // 描边交给 ::before 边环，clip-path 下 border 会被裁形
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 10%), transparent 42%), // 顶部金属高光
    repeating-linear-gradient(0deg, rgb(187 153 245 / 5%) 0 1px, transparent 1px 4px), // 拉丝纹理
    linear-gradient(180deg, rgb(92 56 152 / 78%), rgb(44 27 86 / 72%));
  color: rgb(228 208 255 / 94%);
  font-family: inherit;
  cursor: pointer;
  transition: all 0.18s;
  pointer-events: auto;

  /* 切角描边：mask 抠出 1px 边环（同 unit-tab 手法） */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 1px;
    background: linear-gradient(155deg,
        rgb(205 175 250 / 65%),
        rgb(187 153 245 / 18%) 45%,
        rgb(187 153 245 / 45%));
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
    pointer-events: none;
  }

  &:hover {
    background:
      linear-gradient(180deg, rgb(255 255 255 / 16%), transparent 42%),
      repeating-linear-gradient(0deg, rgb(187 153 245 / 7%) 0 1px, transparent 1px 4px),
      linear-gradient(180deg, rgb(126 82 198 / 85%), rgb(62 39 116 / 78%));
    filter: drop-shadow(0 0 12px rgb(160 100 255 / 50%));
    transform: translateY(-1px);

    .chara-training-btn__icon {
      background: rgb(240 171 252 / 22%);
      box-shadow: 0 0 10px rgb(240 171 252 / 45%);
      color: rgb(255 230 255);
    }

    .chara-training-btn__text {
      color: rgb(246 236 255);
    }
  }

  &:active {
    transform: translateY(-1px) scale(0.96);
  }
}

/* 圆形播放键：三角视觉重心偏右，padding 微调居中 */
.chara-training-btn__icon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding-left: 2px;
  border: 1px solid rgb(240 171 252 / 55%);
  border-radius: 50%;
  font-size: 8px;
  line-height: 1;
  color: $hi-2;
  text-shadow: 0 0 6px rgb(240 171 252 / 55%);
  transition: all 0.18s;
}

.chara-training-btn__text {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 3px;
  white-space: nowrap;
  transition: color 0.18s;
}

.chara-main__bracket {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 2px solid $hi;

  &--tl {
    top: -2px;
    left: -2px;
    border-right: 0;
    border-bottom: 0;
  }

  &--tr {
    top: -2px;
    right: -2px;
    border-left: 0;
    border-bottom: 0;
  }

  &--bl {
    bottom: -2px;
    left: -2px;
    border-right: 0;
    border-top: 0;
  }

  &--br {
    bottom: -2px;
    right: -2px;
    border-left: 0;
    border-top: 0;
  }
}

/* 角色立绘：靠左、底部对齐、完整显示全身（中间区域留给后续内容） */
.chara-main__portrait {
  position: absolute;
  left: -6%; // 素材两侧是透明区，负偏移让透明部分溢出框外，人物本体更靠左
  bottom: 0;
  height: 96%;
  object-fit: contain;
  object-position: bottom left;
  pointer-events: none;
  user-select: none;
}

/* 左上角名牌（左下角让给立绘） */
.chara-main__nameplate {
  position: absolute;
  left: 14px;
  top: 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 16px 8px 12px;
  border-left: 3px solid $hi-2;
  background: linear-gradient(90deg, rgb(10 8 22 / 78%), transparent);
  pointer-events: none;
}

.chara-main__name {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 6px;
  color: rgb(240 230 255 / 95%);
  text-shadow: 0 0 14px rgb(160 100 255 / 45%);
}

.chara-main__name-sub {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2.5px;
  color: rgb(187 153 245 / 60%);
}

@keyframes blink {
  50% {
    opacity: 0.25;
  }
}

.chara-main__coord {
  position: absolute;
  font-size: 9px;
  letter-spacing: 2px;
  color: rgb(187 153 245 / 40%);
  font-variant-numeric: tabular-nums;

  &--y {
    bottom: 8px;
    left: 12px;
  }
}

/* ===== 立绘右侧留白处：悬浮装备槽（对齐截图红框位置） ===== */
.chara-equip {
  position: absolute;
  top: 11%;
  bottom: 7%;
  /* 立绘本体在左侧，槽位列从画面约 1/3 处开始 */
  left: 38%;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 64px; // 前四组（义体 × 3 + 技能）紧凑排在上方
  pointer-events: none; // 容器不挡指针，槽位自身恢复交互
}

/* 义体区：左侧部位组列 + 右侧属性变化面板 */
.equip-implants {
  display: flex;
  align-items: flex-start;
  gap: 20px;
}

/* 部位组列：保持原 64px 组间距（原先由 .chara-equip 的 gap 提供） */
.equip-implants__groups {
  display: flex;
  flex-direction: column;
  gap: 64px;
}

/* 属性变化面板：切角暗底 + 紫边，与装备槽同一套视觉语言 */
.implant-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 132px;
  padding: 12px 14px;
  pointer-events: none;
  user-select: none;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  background: rgb(10 8 22 / 62%);
  box-shadow: inset 0 0 0 1px rgb(187 153 245 / 25%);
}

.implant-stats__tag {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgb(187 153 245 / 50%);
  text-shadow: 0 1px 2px rgb(0 0 0 / 60%);
}

.implant-stats__line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  font-weight: 600;

  &--up .implant-stats__value {
    color: rgb(110 231 183 / 95%);
    text-shadow: 0 0 8px rgb(52 211 153 / 35%);
  }

  &--down .implant-stats__value {
    color: rgb(248 113 113 / 95%);
    text-shadow: 0 0 8px rgb(248 113 113 / 30%);
  }
}

.implant-stats__label {
  color: rgb(200 180 240 / 75%);
  letter-spacing: 1px;
}

.implant-stats__value {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.implant-stats__empty {
  font-size: 10px;
  letter-spacing: 2px;
  color: rgb(187 153 245 / 30%);
}

/* 角色基础属性面板：与属性变化同一视觉语言，青色描边区分"出厂数值" */
.base-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 132px;
  padding: 12px 14px;
  pointer-events: none;
  user-select: none;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  background: rgb(8 14 22 / 62%);
  box-shadow: inset 0 0 0 1px rgb(103 232 249 / 22%);
}

.base-stats__tag {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgb(103 232 249 / 50%);
  text-shadow: 0 1px 2px rgb(0 0 0 / 60%);
}

.base-stats__line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  font-weight: 600;
}

.base-stats__label {
  color: rgb(180 220 235 / 75%);
  letter-spacing: 1px;
}

.base-stats__value {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: rgb(165 243 252 / 95%);
  text-shadow: 0 0 8px rgb(103 232 249 / 25%);
}

/* 承受度面板：竖向分段计量条（赛博朋克式刻度柱 + 两侧数值签），高度撑满义体区 */
.implant-load {
  align-self: stretch; // 与 .equip-implants 同高
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  // 左右内边距容纳两侧数值签，不凸出面板外
  padding: 12px 10px;
  pointer-events: none;
  user-select: none;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  background: rgb(10 8 22 / 62%);
  box-shadow: inset 0 0 0 1px rgb(187 153 245 / 25%);
}

/* 计量区：刻度柱容器，撑满面板剩余高度，当前值相对它绝对定位 */
.implant-load__gauge {
  position: relative;
  flex: 1;
  display: flex;
}

/* 刻度柱：column-reverse 让序号 1 在底部，自底向上点亮；间距均分撑满高度 */
.implant-load__ticks {
  position: relative;
  display: flex;
  flex-direction: column-reverse;
  justify-content: space-between;
  width: 60px;
  padding: 0 2px;
}

.implant-load__tick {
  position: relative;
  height: 4px;
  // 斜切平行四边形，贴合整体的切角工业风
  clip-path: polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%);
  background: rgb(232 183 74 / 7%);
  box-shadow: inset 0 0 0 1px rgb(232 183 74 / 14%);
  transition: background 0.15s ease, box-shadow 0.15s ease, width 0.15s ease;

  /* 窄刻度：靠近数值签的段位收窄居中，给数字让出空间 */
  &--slim {
    width: 26px;
    align-self: center;
  }

  &--on {
    background: linear-gradient(90deg, rgb(200 144 47 / 90%), rgb(245 208 116 / 95%) 55%, rgb(255 231 170 / 100%));
    box-shadow:
      inset 0 0 0 1px rgb(255 231 170 / 35%),
      0 0 6px rgb(232 183 74 / 45%);
  }

  /* 危险区（顶部 20%）：未点亮时淡红描边预警，点亮后转红 */
  &--danger {
    background: rgb(248 113 113 / 6%);
    box-shadow: inset 0 0 0 1px rgb(248 113 113 / 18%);
  }

  &--on#{&}--danger {
    background: linear-gradient(90deg, rgb(200 60 60 / 90%), rgb(248 113 113 / 95%) 55%, rgb(255 160 130 / 100%));
    box-shadow:
      inset 0 0 0 1px rgb(255 160 130 / 35%),
      0 0 6px rgb(248 113 113 / 50%);
  }
}

/* 数值签：小方框数字（上限置顶，当前值贴在刻度柱左侧、随点亮高度浮动） */
.implant-load__num {
  min-width: 30px; // 固定宽度：2 位 / 3 位数字不会把框撑宽
  box-sizing: border-box;
  padding: 2px 5px;
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
  white-space: nowrap;
  text-align: center;

  &--cur {
    position: absolute;
    right: calc(100% + -12px); // 刻度柱左侧，跟随液面高度
    transform: translateY(50%); // bottom 定位的是盒底，上移半高对齐液面中心
    color: rgb(245 208 116 / 95%);
    box-shadow: inset 0 0 0 1px rgb(232 183 74 / 45%);
    background: rgb(10 8 22 / 92%);
    text-shadow: 0 0 6px rgb(232 183 74 / 40%);
    transition: bottom 0.15s ease;
  }

  &--cap {
    position: absolute;
    top: 0;
    left: calc(100% + -12px); // 刻度柱右上
    transform: translateY(-50%); // 中心对齐柱顶
    color: rgb(187 153 245 / 70%);
    box-shadow: inset 0 0 0 1px rgb(187 153 245 / 35%);
    background: rgb(10 8 22 / 92%);
  }
}

.implant-load__label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgb(187 153 245 / 50%);
  text-shadow: 0 1px 2px rgb(0 0 0 / 60%);
}

/* 承受度告急（≥80%）：整体转警示红 */
.implant-load--warn {
  box-shadow: inset 0 0 0 1px rgb(248 113 113 / 40%);

  .implant-load__num--cur {
    color: rgb(248 113 113 / 95%);
    box-shadow: inset 0 0 0 1px rgb(248 113 113 / 55%);
    background: rgb(26 9 12 / 94%); // 保持不透明，避免透出刻度柱光晕显得变宽
    text-shadow: 0 0 6px rgb(248 113 113 / 45%);
  }
}

/* 义体部位组：部位标签 + 一行槽位 */
.equip-group {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* 工业衍生折线：槽位组 → 横线段 → 拐角关节 → 斜线段 → 角色部位锚点 */
.equip-group__link {
  position: absolute;
  right: calc(100% + 14px);
  top: 55%;
  width: clamp(72px, 7vw, 116px); // 横线段（主体）
  height: 1px;
  pointer-events: none;
  /* 纯色：与斜线段拐角端亮度一致，两段衔接无跳变 */
  background: rgb(187 153 245 / 55%);
  box-shadow: 0 0 5px rgb(160 100 255 / 35%);

  /* 拐角关节：小方块铆点（与角色侧锚点同尺寸） */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    width: 4px;
    height: 4px;
    transform: translate(-50%, -50%);
    background: rgb(240 171 252 / 80%);
    box-shadow: 0 0 5px rgb(240 171 252 / 60%);
  }

  /* 槽位侧：短竖肘端头 */
  &::after {
    content: '';
    position: absolute;
    right: 0;
    top: -4px;
    width: 1px;
    height: 9px;
    background: rgb(187 153 245 / 55%);
    box-shadow: 0 0 5px rgb(160 100 255 / 35%);
  }

  /* 斜线段：以拐角（右端）为轴旋转，折向角色部位 */
  >i {
    position: absolute;
    right: 100%; // 右端对齐拐角（横线段左端）
    top: 0;
    width: 34px; // 斜线段（只留一小段折角）
    height: 1px;
    transform-origin: right center;
    /* 角色侧（左）近透明 → 拐角（右）高浓度：scaleY 压细会吃亮度，
       端点给到 90% 补偿，才能与 1px 横线的 55% 在视觉上接上 */
    background: linear-gradient(90deg,
        rgb(187 153 245 / 8%),
        rgb(187 153 245 / 90%));
    box-shadow: 0 0 5px rgb(160 100 255 / 35%);
  }

  /* 头部：斜线向左上折（scaleY 压细，角色侧更轻） */
  &--head>i {
    transform: rotate(-24deg) scaleY(0.55);
  }

  /* 身体：近平直，微上扬 */
  &--body>i {
    transform: rotate(-6deg) scaleY(0.55);
  }

  /* 腿部：斜线向左下折 */
  &--legs>i {
    transform: rotate(22deg) scaleY(0.55);
  }
}

.equip-group__tag {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgb(187 153 245 / 50%);
  text-shadow: 0 1px 2px rgb(0 0 0 / 60%);
  user-select: none;
}

.equip-group__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 武器组：沉底独立放置，与前四组拉开 */
.equip-group--weapon {
  margin-top: auto;
}

.equip-group__row--weapon {
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

/* 装备槽：切角暗格 + 虚线边框，暗示"空位待装" */
.equip-slot {
  position: relative;
  width: 34px;
  height: 34px;
  pointer-events: auto;
  clip-path: polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px);
  background: rgb(10 8 22 / 72%);
  box-shadow: inset 0 0 0 1px rgb(187 153 245 / 28%);
  transition: box-shadow 0.15s, background 0.15s;

  /* 内层虚线框 */
  &::after {
    content: '';
    position: absolute;
    inset: 4px;
    border: 1px dashed rgb(187 153 245 / 30%);
    pointer-events: none;
  }

  &:hover {
    background: rgb(40 26 70 / 85%);
    box-shadow:
      inset 0 0 0 1px $hi,
      0 0 12px rgb(160 100 255 / 35%);
  }
}

/* 义体槽：每组 3 个等大槽位，亮紫边 */
.equip-slot--implant {
  width: 80px;
  height: 80px;
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  box-shadow:
    inset 0 0 0 1px rgb(240 171 252 / 55%),
    0 0 12px rgb(160 100 255 / 20%);

  &::after {
    inset: 7px;
  }
}

/* 义体槽之间额外拉开间距（叠加在行的 6px gap 上） */
.equip-slot--implant+.equip-slot--implant {
  margin-left: 10px;
}

/* 武器槽：横向长条矩形（对齐三角洲式宽槽，宽度与义体行一致） */
.equip-slot--weapon {
  width: 280px;
  height: 140px;
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  box-shadow:
    inset 0 0 0 1px rgb(140 180 255 / 45%),
    0 0 12px rgb(96 160 255 / 20%);

  &::after {
    inset: 6px;
  }
}

/* 武器槽 hover：蓝色系点亮（与编号角标同色），压过通用 .equip-slot 的紫色 hover */
.equip-slot--weapon:hover {
  background: rgb(20 28 54 / 88%);
  box-shadow:
    inset 0 0 0 2px rgb(140 180 255 / 55%),
    inset 0 0 22px rgb(140 180 255 / 12%),
    0 0 16px rgb(96 160 255 / 40%);
}

/* 已装备时 hover：内容块同步轻微提亮（与背包物品 hover 同一幅度） */
.equip-slot--weapon:hover .equip-slot__filled {
  filter: brightness(1.15) saturate(1.06);
}

/* 槽位编号角标：左上角小方块（对齐三角洲式序号） */
.equip-slot__num {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  min-width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  color: rgb(10 8 22 / 90%);
  background: rgb(140 180 255 / 85%);
  clip-path: polygon(0 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
  box-shadow: 0 0 8px rgb(96 160 255 / 40%);
}

/* 武器虚影：空槽占位，低透明度暗示"待装填" */
.equip-slot__ghost {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 82%;
  transform: translate(-50%, -50%);
  opacity: 0.13;
  filter: brightness(0.55) saturate(0.6);
  pointer-events: none;
  user-select: none;
  transition: opacity 0.15s;
}

.equip-slot--weapon:hover .equip-slot__ghost {
  opacity: 0.22;
}

/* 武器拖入悬停：槽位高亮提示可装备 */
.equip-slot--drop-ok {
  background: rgb(50 80 140 / 85%);
  box-shadow:
    inset 0 0 0 1px rgb(140 180 255 / 90%),
    0 0 16px rgb(96 160 255 / 45%);
}

/* 已装备内容块：稀有度底色（复用 inv-item--*）+ 图标 + 名称，可拖出卸下 */
.equip-slot__filled {
  position: absolute;
  inset: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: filter 0.15s;
}

/* 已装备武器图标：不锁死宽高，按素材原始比例显示，最大铺满槽内容区 */
.equip-slot__icon {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.equip-slot__name {
  position: absolute;
  top: 3px;
  left: 16px; // 让开左上角槽位编号角标
  max-width: calc(100% - 36px);
  font-size: 12px;
  line-height: 1.2;
  color: rgb(245 240 255 / 90%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

/* 技能槽内名称：小字号贴顶部，靠左省略 */
.equip-slot__label {
  position: absolute;
  top: 2px;
  left: 4px;
  right: 4px;
  font-size: 10px;
  line-height: 1.2;
  text-align: left;
  color: rgb(245 240 255 / 90%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

/* 特殊技能槽：青色描边，与义体/武器区分 */
.equip-slot--skill {
  width: 80px;
  height: 80px;
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  box-shadow:
    inset 0 0 0 1px rgb(96 220 200 / 50%),
    0 0 12px rgb(96 220 200 / 20%);

  &::after {
    inset: 7px;
  }

  /* 技能图标缩小，给名称和边缘留白 */
  .equip-slot__icon {
    max-width: 68%;
    max-height: 68%;
  }
}

/* ===== 右侧背包面板：切角工业面板 ===== */
.chara-inv {
  width: 620px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgb(20 14 38 / 88%), rgb(12 8 26 / 82%));
  border: 1px solid rgb(187 153 245 / 25%);
  clip-path: polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px);
  box-shadow: 0 10px 36px rgb(0 0 0 / 45%);
  overflow: hidden;
}

.chara-inv__head {
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgb(187 153 245 / 18%);
  background:
    repeating-linear-gradient(-45deg, rgb(187 153 245 / 5%) 0 6px, transparent 6px 12px),
    linear-gradient(180deg, rgb(120 80 190 / 14%), transparent);
}

.chara-inv__head-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.chara-inv__label {
  font-size: 17px;
  font-weight: 900;
  letter-spacing: 4px;
  color: rgb(240 230 255 / 92%);
  padding-left: 8px;
  border-left: 3px solid $hi-2;
}

.chara-inv__count {
  font-size: 12px;
  color: rgb(187 153 245 / 65%);
  letter-spacing: 1px;
  font-variant-numeric: tabular-nums;

  b {
    font-size: 15px;
    color: $hi-2;
  }
}

.chara-inv__tabs {
  display: flex;
  gap: 6px;
}

.inv-tab {
  flex: 1;
  padding: 8px 0;
  border: 1px solid rgb(187 153 245 / 22%);
  border-radius: 0;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  background: rgb(10 8 22 / 45%);
  color: rgb(200 170 240 / 55%);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 3px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;

  &:hover {
    color: rgb(225 200 255 / 88%);
    border-color: rgb(187 153 245 / 50%);
  }
}

.inv-tab--active,
.inv-tab--active:hover {
  color: $ink;
  border-color: $hi;
  background: linear-gradient(180deg, $hi-2, $hi);
  box-shadow: 0 0 14px rgb(160 100 255 / 35%);
  text-shadow: none;
}

.chara-inv__status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  border-bottom: 1px solid rgb(187 153 245 / 12%);
  background: rgb(8 6 18 / 55%);
}

.chara-inv__status-dot {
  width: 6px;
  height: 6px;
  background: $hi-2;
  box-shadow: 0 0 8px $hi-2;
  animation: blink 1.8s steps(2) infinite;
}

.chara-inv__status-text {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgb(187 153 245 / 55%);
}

.chara-inv__grid {
  flex: 1;
  padding: 12px 14px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 5px;
  }

  &::-webkit-scrollbar-track {
    background: rgb(187 153 245 / 6%);
  }

  &::-webkit-scrollbar-thumb {
    background: rgb(187 153 245 / 35%);
  }
}

/* 双层网格的相对定位容器 */
.inv-board {
  position: relative;
}

/* 底纹层：单元格自动排布，撑开网格高度 */
.inv-cells {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 5px;
}

/* 物品层：绝对叠加的独立网格，行列与底纹层严格对齐 */
.inv-items {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(50, 1fr);
  gap: 5px;
  pointer-events: none;
}

/* 背景单元格：仅作网格底纹与落点高亮 */
.inv-cell {
  aspect-ratio: 1;
  clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px);
  background: rgb(8 6 18 / 60%);
  box-shadow: inset 0 0 0 1px rgb(187 153 245 / 14%);
  transition: background 0.12s, box-shadow 0.12s;
}

/* 落点预览：可放 */
.inv-cell--drop-ok {
  background: rgb(90 60 150 / 55%);
  box-shadow: inset 0 0 0 1px $hi-2;
}

/* 落点预览：不可放（越界 / 压到多个物品） */
.inv-cell--drop-bad {
  background: rgb(150 50 70 / 45%);
  box-shadow: inset 0 0 0 1px rgb(255 110 140 / 70%);
}

/* 占位物品块：按锚点 + 跨度显式定位，覆盖在单元格之上 */
.inv-item {
  position: relative;
  z-index: 1;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  background: rgb(30 20 55);
  box-shadow: inset 0 0 0 1px rgb(187 153 245 / 30%);
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: filter 0.15s, box-shadow 0.15s, opacity 0.15s;

  /* 悬停：整体提亮背景 + 内/外发光，边框只微调不抢眼（置灰物品不响应） */
  &:not(.inv-item--dimmed):hover {
    z-index: 2; // 外发光压过相邻物品
    filter: brightness(1.15) saturate(1.06);
    box-shadow:
      inset 0 0 0 2px rgb(187 153 245 / 55%),
      inset 0 0 18px rgb(255 255 255 / 6%),
      0 0 16px rgb(160 100 255 / 45%);
  }
}

/* 拖拽时物品块不拦截指针，保证 elementFromPoint 命中底层单元格 */
.chara-inv__grid--dragging .inv-item {
  pointer-events: none;
}

/* 多选模式：选中物品青色高亮 + 对勾角标 */
.inv-item--selected {
  z-index: 2;
  filter: brightness(1.18) saturate(1.1);
  box-shadow:
    inset 0 0 0 2px rgb(96 200 255 / 90%),
    inset 0 0 18px rgb(96 200 255 / 22%),
    0 0 14px rgb(96 200 255 / 45%);
}

.inv-item__check {
  position: absolute;
  top: 2px;
  left: 3px;
  z-index: 3;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  color: #06121e;
  background: #7fd8ff;
  clip-path: polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px);
  box-shadow: 0 0 8px rgb(96 200 255 / 70%);
  pointer-events: none;
}

/* 稀有度：深宝石色调（高纯度、低明度）+ 纵向明暗渐变 + 顶部细高光 */
/* 白（普通）：石板灰 */
.inv-item--common {
  background: linear-gradient(180deg, rgb(66 70 86), rgb(42 45 58));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 6%),
    inset 0 0 0 2px rgb(180 190 210 / 35%);
}

/* 绿（优良）：祖母绿 */
.inv-item--uncommon {
  background: linear-gradient(180deg, rgb(28 104 62), rgb(16 62 38));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 6%),
    inset 0 0 0 2px rgb(110 220 140 / 60%),
    inset 0 0 10px rgb(110 220 140 / 16%);
}

/* 蓝（稀有）：蓝宝石 */
.inv-item--rare {
  background: linear-gradient(180deg, rgb(32 76 144), rgb(18 46 92));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 6%),
    inset 0 0 0 2px rgb(140 180 255 / 65%),
    inset 0 0 10px rgb(140 180 255 / 18%);
}

/* 紫（史诗）：紫晶 */
.inv-item--epic {
  background: linear-gradient(180deg, rgb(104 52 158), rgb(64 32 100));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 6%),
    inset 0 0 0 2px $hi-2,
    inset 0 0 12px rgb(240 171 252 / 22%);
}

/* 金（传说）：琥珀（提高饱和度，避免土黄） */
.inv-item--legendary {
  background: linear-gradient(180deg, rgb(170 116 30), rgb(106 68 17));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 7%),
    inset 0 0 0 2px rgb(255 200 90 / 75%),
    inset 0 0 12px rgb(255 200 90 / 22%);
}

/* 红（神话）：品质色（红）背景 + 沿边框循环流动的彩色描边 */

/* 注册可动画的角度变量（锥形渐变起始角） */
@property --prismatic-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.inv-item--mythic {
  background: rgb(122 28 44);
  box-shadow:
    inset 0 0 14px rgb(255 80 80 / 25%),
    0 0 12px rgb(255 80 80 / 22%);
}

/* 神话 hover 保留红色光晕（特异度压过通用 hover 的紫光），提亮由通用规则提供 */
.inv-item--mythic:not(.inv-item--dimmed):hover {
  box-shadow:
    inset 0 0 0 2px rgb(255 120 130 / 55%),
    inset 0 0 18px rgb(255 120 120 / 20%),
    0 0 18px rgb(255 80 80 / 45%);
}

/* 彩色描边：整层锥形彩虹渐变，mask 抠掉中间只留 2px 边环（与其他物品一致），
   旋转渐变起始角让彩色沿边框流动 */
.inv-item--mythic::before,
.drag-ghost--mythic::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 2px;
  background: conic-gradient(from var(--prismatic-angle),
      #ff5f6d,
      #ffc371,
      #f3f76a,
      #6af59a,
      #5fc9ff,
      #b06aff,
      #ff6ac9,
      #ff5f6d);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  animation: prismatic-angle-spin 4s linear infinite;
  pointer-events: none;
}

@keyframes prismatic-angle-spin {
  to {
    --prismatic-angle: 360deg;
  }
}

/* 页签筛选：不匹配的物品置灰（位置保持不动） */
.inv-item--dimmed {
  opacity: 0.22;
  filter: grayscale(0.7);
}

/* 拖拽源：物品被拿起后留个虚位暗示 */
.inv-item--drag-source {
  opacity: 0.3;
}

.inv-item__icon {
  width: 62%;
  height: 62%;
  object-fit: contain;
  pointer-events: none;
}

/* 物品名：左上角小字 */
.inv-item__name {
  position: absolute;
  top: 3px;
  left: 5px;
  max-width: calc(100% - 10px);
  font-size: 12px;
  line-height: 1.2;
  color: rgb(245 240 255 / 90%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

/* 子类别标记：右上角小三角，颜色按 KIND_COLORS 内联着色 */
.inv-item__kind {
  position: absolute;
  top: 0;
  right: 0;
  width: 9px;
  height: 9px;
  clip-path: polygon(100% 0, 0 0, 100% 100%);
  pointer-events: none;
}

.inv-item__count {
  position: absolute;
  right: 4px;
  bottom: 3px;
  font-size: 12px;
  font-weight: 800;
  color: rgb(245 240 255 / 95%);
  text-shadow: 0 1px 2px rgb(0 0 0 / 80%);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

/* 义体部位标注：右下角极小字（义体不可堆叠，与计数角标不冲突） */
.inv-item__part {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font-size: 10px;
  letter-spacing: 0.5px;
  color: rgb(245 240 255 / 95%);
  text-shadow: 0 1px 2px rgb(0 0 0 / 80%);
  transform: scale(0.9);
  transform-origin: right bottom;
  pointer-events: none;
}

/* 义体耐受度：左下角小字数字（与右下角部位标注同一规格，镜像到左侧） */
.inv-item__load {
  position: absolute;
  left: 2px;
  bottom: 1px;
  font-size: 10px;
  letter-spacing: 0.5px;
  color: rgb(255 214 130 / 95%);
  text-shadow: 0 1px 2px rgb(0 0 0 / 80%);
  transform: scale(0.9);
  transform-origin: left bottom;
  pointer-events: none;
}

/* 义体槽耐受度：左下角小字数字（34px 小槽，字号更小） */
.equip-slot__load {
  position: absolute;
  left: 0;
  bottom: -2px;
  z-index: 1;
  font-size: 9px;
  line-height: 1;
  color: rgb(255 214 130 / 95%);
  text-shadow: 0 1px 2px rgb(0 0 0 / 85%);
  pointer-events: none;
}

/* 拖拽残影：跟随指针，尺寸由内联样式按占格计算 */
.drag-ghost {
  position: fixed;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -50%);
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  background: rgb(40 26 70 / 90%);
  box-shadow:
    inset 0 0 0 1px $hi,
    0 8px 24px rgb(0 0 0 / 50%),
    0 0 18px rgb(160 100 255 / 35%);
  pointer-events: none;
}

.drag-ghost--common {
  background: linear-gradient(180deg, rgb(66 70 86), rgb(42 45 58));
  box-shadow:
    inset 0 0 0 2px rgb(180 190 210 / 50%),
    0 8px 24px rgb(0 0 0 / 50%);
}

.drag-ghost--uncommon {
  background: linear-gradient(180deg, rgb(28 104 62), rgb(16 62 38));
  box-shadow:
    inset 0 0 0 2px rgb(110 220 140 / 70%),
    0 8px 24px rgb(0 0 0 / 50%),
    0 0 18px rgb(110 220 140 / 30%);
}

.drag-ghost--rare {
  background: linear-gradient(180deg, rgb(32 76 144), rgb(18 46 92));
  box-shadow:
    inset 0 0 0 2px rgb(140 180 255 / 75%),
    0 8px 24px rgb(0 0 0 / 50%),
    0 0 18px rgb(140 180 255 / 35%);
}

.drag-ghost--epic {
  background: linear-gradient(180deg, rgb(104 52 158), rgb(64 32 100));
  box-shadow:
    inset 0 0 0 2px $hi-2,
    0 8px 24px rgb(0 0 0 / 50%),
    0 0 18px rgb(240 171 252 / 40%);
}

.drag-ghost--legendary {
  background: linear-gradient(180deg, rgb(170 116 30), rgb(106 68 17));
  box-shadow:
    inset 0 0 0 2px rgb(255 200 90 / 80%),
    0 8px 24px rgb(0 0 0 / 50%),
    0 0 18px rgb(255 200 90 / 35%);
}

.drag-ghost--mythic {
  background: rgb(122 28 44);
  box-shadow:
    0 8px 24px rgb(0 0 0 / 50%),
    0 0 20px rgb(255 80 80 / 40%);
}

/* 拆分残影：半透明 + 虚线边，暗示"未定稿" */
.drag-ghost--split {
  opacity: 0.75;
  outline: 1px dashed rgb(240 171 252 / 80%);
  outline-offset: 2px;
}

.chara-inv__foot {
  padding: 10px 14px 14px;
  border-top: 1px solid rgb(187 153 245 / 18%);
  background: linear-gradient(0deg, rgb(120 80 190 / 14%), transparent);
}

.chara-inv__foot-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgb(187 153 245 / 45%);
}

.chara-inv__btn {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  padding: 11px 0;
  border: 1px solid rgb(187 153 245 / 45%);
  border-radius: 0;
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  background: linear-gradient(180deg, rgb(90 55 145 / 55%), rgb(50 30 95 / 40%));
  color: rgb(230 205 255 / 95%);
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: $hi-2;
    background: linear-gradient(180deg, rgb(120 75 185 / 65%), rgb(65 38 115 / 45%));
    box-shadow: 0 0 16px rgb(160 100 255 / 35%);
  }

  &:active {
    transform: scale(0.98);
  }
}

.chara-inv__btn-text {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 5px;
}

.chara-inv__btn-sub {
  font-size: 10px;
  letter-spacing: 2px;
  opacity: 0.55;
}

/* 多选模式：取消 + 出售 并排 */
.chara-inv__foot-actions {
  display: flex;
  gap: 8px;

  .chara-inv__btn {
    width: auto;
    flex: 1;
    padding: 11px 6px;
  }
}

/* 出售按钮：水晶青色主题（与货币卡同色） */
.chara-inv__btn--sell {
  border-color: rgb(96 200 255 / 55%);
  background: linear-gradient(180deg, rgb(35 110 165 / 60%), rgb(18 60 100 / 45%));
  color: #d8f2ff;

  &:hover:not(:disabled) {
    border-color: rgb(140 220 255 / 85%);
    background: linear-gradient(180deg, rgb(50 135 195 / 70%), rgb(24 75 120 / 50%));
    box-shadow: 0 0 16px rgb(96 200 255 / 40%);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .chara-inv__btn-sub {
    color: #aee6ff;
    opacity: 0.85;
  }
}

/* 取消按钮：弱化 */
.chara-inv__btn--cancel {
  flex: 0 0 32%;
  border-color: rgb(187 153 245 / 25%);
  background: rgb(30 22 55 / 50%);
  color: rgb(200 175 240 / 75%);
}

/* ===== 右键菜单 ===== */
.ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
}

.ctx-menu {
  position: fixed;
  min-width: 140px;
  background: linear-gradient(180deg, rgb(24 16 44 / 97%), rgb(14 10 30 / 97%));
  border: 1px solid rgb(187 153 245 / 40%);
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 55%), 0 0 16px rgb(160 100 255 / 20%);
  padding: 6px;
}

.ctx-menu__title {
  padding: 5px 10px 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: rgb(187 153 245 / 65%);
  border-bottom: 1px solid rgb(187 153 245 / 15%);
  white-space: nowrap;
}

.ctx-menu__item {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: rgb(230 205 255 / 92%);
  font-family: inherit;
  cursor: pointer;
  transition: all 0.12s;

  &:hover:not(:disabled) {
    border-color: rgb(187 153 245 / 45%);
    background: rgb(120 80 190 / 25%);
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
}

.ctx-menu__item-text {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 2px;
}

.ctx-menu__item-sub {
  font-size: 9px;
  letter-spacing: 1.5px;
  opacity: 0.5;
}

/* 出售项：右侧显示水晶收益 */
.ctx-menu__item--sell:hover:not(:disabled) {
  border-color: rgb(96 200 255 / 50%);
  background: rgb(40 110 160 / 22%);
}

.ctx-menu__item-price {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #aee6ff;
  text-shadow: 0 0 8px rgb(96 200 255 / 60%);
  font-variant-numeric: tabular-nums;

  img {
    width: 14px;
    height: 14px;
    object-fit: contain;
    filter: drop-shadow(0 0 4px rgb(96 200 255 / 70%));
  }
}

/* ===== 物品详情悬浮窗（可拖拽、非模态） ===== */
.detail-panel {
  position: fixed;
  z-index: 130;
  width: 380px;
  max-width: calc(100vw - 48px);
  padding: 16px 18px 18px;
  background: linear-gradient(180deg, rgb(24 16 44 / 97%), rgb(14 10 30 / 97%));
  border: 1px solid rgb(187 153 245 / 40%);
  clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
  box-shadow: 0 14px 40px rgb(0 0 0 / 60%), 0 0 24px rgb(160 100 255 / 18%);
}

/* 稀有度缘光：面板顶边一条品质色高光 */
.detail-panel--common {
  border-top-color: rgb(180 190 210 / 60%);
}

.detail-panel--uncommon {
  border-top-color: rgb(110 220 140 / 75%);
}

.detail-panel--rare {
  border-top-color: rgb(140 180 255 / 80%);
}

.detail-panel--epic {
  border-top-color: $hi-2;
}

.detail-panel--legendary {
  border-top-color: rgb(255 200 90 / 85%);
}

.detail-panel--mythic {
  border-top-color: rgb(255 90 110 / 85%);
}

.detail-panel__head {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }
}

.detail-panel__icon-box {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
}

.detail-panel__title {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.detail-panel__name {
  font-size: 19px;
  font-weight: 900;
  letter-spacing: 3px;
  color: rgb(240 230 255 / 95%);
  text-shadow: 0 0 12px rgb(160 100 255 / 40%);
}

.detail-panel__tags {
  display: flex;
  gap: 6px;

  i {
    font-style: normal;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    padding: 2px 8px;
    border: 1px solid rgb(187 153 245 / 40%);
    color: rgb(220 200 255 / 85%);
    background: rgb(120 80 190 / 18%);
  }
}

.detail-panel__close {
  margin-left: auto;
  align-self: flex-start;
  width: 26px;
  height: 26px;
  border: 1px solid rgb(187 153 245 / 35%);
  border-radius: 0;
  background: transparent;
  color: rgb(220 190 255 / 80%);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.12s;

  &:hover {
    border-color: $hi-2;
    color: #fff;
    background: rgb(120 80 190 / 30%);
  }
}

.detail-panel__desc {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-left: 3px solid rgb(187 153 245 / 45%);
  background: rgb(10 8 22 / 55%);
  font-size: 12px;
  line-height: 1.7;
  color: rgb(216 190 252 / 80%);
}

.detail-panel__meta,
.detail-panel__stats {
  margin-top: 12px;
  padding: 8px 12px;
  border: 1px solid rgb(187 153 245 / 16%);
  background: rgb(8 6 18 / 45%);
}

.detail-panel__stats-title {
  display: block;
  margin-bottom: 6px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgb(140 180 255 / 65%);
}

.detail-panel__row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 12px;

  span {
    letter-spacing: 2px;
    color: rgb(187 153 245 / 55%);
  }

  b {
    font-weight: 700;
    letter-spacing: 1px;
    color: rgb(240 230 255 / 92%);
    font-variant-numeric: tabular-nums;
  }
}

/* ===== 悬停详情提示（不拦截指针，复用详情窗样式） ===== */
.hover-tip {
  z-index: 118; // 低于可拖拽详情窗（130+），高于界面其他元素
  width: 340px;
  pointer-events: none;
  animation: hover-tip-in 0.12s ease-out;
}

.hover-tip__head {
  cursor: default;
}

@keyframes hover-tip-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ===== 底部状态栏 ===== */
.chara-page__footer {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 8px 26px;
  border-top: 1px solid rgb(187 153 245 / 15%);
  background: rgb(8 6 18 / 60%);
}

.chara-page__footer-item {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgb(187 153 245 / 45%);

  &--right {
    margin-left: auto;
    color: rgb(240 171 252 / 60%);
  }
}

/* ===== 通用软提醒（装配 / 卸下被规则阻止时飘出）：屏幕正中纵向堆叠，不阻断操作 ===== */
.notice-tips {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 300;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}

.notice-tip {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  font-size: 13px;
  letter-spacing: 2px;
  color: rgb(240 171 252 / 95%);
  text-shadow: 0 0 8px rgb(187 153 245 / 50%);
  background: rgb(12 8 26 / 78%);
  border: 1px solid rgb(187 153 245 / 50%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
  box-shadow: 0 8px 24px rgb(0 0 0 / 40%);
  pointer-events: none;

  &__dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    background: rgb(240 171 252 / 95%);
    box-shadow: 0 0 8px rgb(187 153 245 / 90%);
  }
}

.notice-tip-enter-active {
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.notice-tip-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
  /* 离场时脱离文档流，让剩余提示平滑补位 */
  position: absolute;
}

.notice-tip-move {
  transition: transform 0.3s ease;
}

.notice-tip-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.notice-tip-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
