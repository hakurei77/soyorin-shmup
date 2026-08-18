/**
 * 浏览器控制台调试命令（挂载到 window.cheat）
 * 在 main.ts 中导入即生效，详细用法见同目录 devCommands.md
 *
 * 示例：
 *   cheat.give('AH-01')      给一把夯锤（支持 物品id / 武器编号 / 中文名）
 *   cheat.give('crystal', 1000)
 *   cheat.list()             列出全部物品
 */
import { useInventory } from '../composables/useInventory'
import { ITEM_LIST, getItemDef } from '../config/items'

const inv = useInventory()

/** 按 物品id / 武器编号(weaponKey) / 中文名 解析物品 id */
function resolveItemId(query: string): string | undefined {
  const q = query.trim().toLowerCase()
  const hit = ITEM_LIST.find(
    (d) =>
      d.id.toLowerCase() === q ||
      d.weaponKey?.toLowerCase() === q ||
      d.name === query.trim(),
  )
  return hit?.id
}

/** 给物品：cheat.give('AH-01') / cheat.give('wpn-ramhammer') / cheat.give('伏尔甘') */
function give(query: string, count = 1) {
  const id = resolveItemId(query)
  if (!id) {
    console.warn(`[cheat] 找不到物品：${query}，用 cheat.list() 查看全部物品`)
    return
  }
  const added = inv.addItem(id, count)
  const def = getItemDef(id)!
  if (added === 0) {
    console.warn(`[cheat] 背包已满，${def.name} 没放进去`)
  } else if (added < count) {
    console.warn(`[cheat] 背包空间不足，${def.name} 只放入 ${added}/${count}`)
  } else {
    console.log(`[cheat] 获得 ${def.name} ×${added}`)
  }
}

/** 加水晶：cheat.crystal(5000)，传负数则扣减 */
function crystal(n: number) {
  inv.addCrystal(n)
  console.log(`[cheat] 水晶 ${n >= 0 ? '+' : ''}${n}，当前共 ${inv.crystal.value}`)
}

/** 列出全部物品（id / 名称 / 武器编号 / 稀有度） */
function list() {
  console.table(
    ITEM_LIST.map((d) => ({
      id: d.id,
      名称: d.name,
      武器编号: d.weaponKey ?? '',
      分类: d.category,
      稀有度: d.rarity,
    })),
  )
}

/** 发放全部武器（各有 weaponKey 的物品各 1 件） */
function allWeapons() {
  const weapons = ITEM_LIST.filter((d) => d.weaponKey)
  let total = 0
  weapons.forEach((d) => {
    const added = inv.addItem(d.id, 1)
    if (added > 0) total += added
  })
  console.log(`[cheat] 已发放全部武器，成功放入 ${total}/${weapons.length}`)
}

/** 发放全部物品：cheat.allItems() / cheat.allItems(99)（默认每种 1 个） */
function allItems(count = 1) {
  let kinds = 0
  let total = 0
  const skipped: string[] = []
  ITEM_LIST.forEach((d) => {
    const added = inv.addItem(d.id, count)
    if (added > 0) {
      kinds++
      total += added
    }
    if (added < count) skipped.push(d.name)
  })
  console.log(`[cheat] 已发放全部物品，成功 ${kinds}/${ITEM_LIST.length} 种，共 ${total} 个`)
  if (skipped.length) console.warn(`[cheat] 以下物品未放满 ${count} 个（背包空间不足）：${skipped.join('、')}`)
}

function help() {
  console.log(
    [
      '[cheat] 可用命令：',
      '  cheat.give(物品, 数量?)   给物品，物品可填 id / 武器编号 / 中文名',
      '  cheat.crystal(数量)       加水晶（负数扣减）',
      '  cheat.allWeapons()         发放全部武器各 1 件',
      '  cheat.allItems(数量?)      发放全部物品，数量默认 1',
      '  cheat.list()              列出全部物品',
      '  cheat.help()              显示本帮助',
      '',
      '示例：cheat.give("AH-01")  cheat.give("夯锤")  cheat.give("energy-cell", 99)',
    ].join('\n'),
  )
}

const cheat = { give, crystal, allWeapons, allItems, list, help }

declare global {
  interface Window {
    cheat: typeof cheat
  }
}

window.cheat = cheat
console.log('[cheat] 调试命令已挂载，输入 cheat.help() 查看用法')
