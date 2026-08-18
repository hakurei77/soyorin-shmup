/**
 * 物品子类别（ItemDef.kind）配色表
 * 背包物品块右上角的小三角标按此表着色，新增类别在此加一行即可。
 */
export const KIND_COLORS: Record<string, string> = {
  动能武器: '#f0b429', // 金黄色
  技术武器: '#7ec8e3', // 淡蓝色
  激光武器: '#ffffff', // 白色
  主动技能: '#4ade80', // 绿色
  头部义体: '#f0abfc', // 粉紫色
  躯干义体: '#fb923c', // 橙黄色
  腿部义体: '#67e8f9', // 青蓝色
}

/** 缺省颜色（未登记的 kind） */
export const KIND_COLOR_DEFAULT = '#8f7ab5'
