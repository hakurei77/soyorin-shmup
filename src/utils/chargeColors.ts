/**
 * 蓄力等级配色（LW-04 电弧发射器）：
 * 按蓄力比例 0~1 分四档——浅蓝 → 蓝 → 紫 → 红，
 * 渲染层（蓄力圈/贯穿电弧/命中粒子）与准星组件共用，保证颜色一致。
 */

export interface ChargePalette {
  /** 主色（CSS 颜色，准星/进度弧用） */
  css: string
  /** 宽辉光层描边色 */
  glow: string
  /** 中层亮线描边色 */
  mid: string
  /** 伴生细弧/命中粒子色 */
  branch: string
  /** 光球渐变中间色（RGB 分量字符串） */
  glowMid: string
  /** 光球渐变边缘色（RGB 分量字符串） */
  glowEdge: string
}

const TIERS: ChargePalette[] = [
  // 浅蓝（0 ~ 25%）
  {
    css: '#7dd3fc',
    glow: '#0ea5e9',
    mid: '#7dd3fc',
    branch: '#e0f2fe',
    glowMid: '186,230,253',
    glowEdge: '14,165,233'
  },
  // 蓝（25% ~ 50%）
  {
    css: '#60a5fa',
    glow: '#2563eb',
    mid: '#60a5fa',
    branch: '#bfdbfe',
    glowMid: '147,197,253',
    glowEdge: '37,99,235'
  },
  // 紫（50% ~ 75%）
  {
    css: '#a78bfa',
    glow: '#7c3aed',
    mid: '#a78bfa',
    branch: '#ddd6fe',
    glowMid: '196,181,253',
    glowEdge: '109,40,217'
  },
  // 红（75% ~ 100%）
  {
    css: '#f87171',
    glow: '#dc2626',
    mid: '#f87171',
    branch: '#fecaca',
    glowMid: '252,165,165',
    glowEdge: '185,28,28'
  }
]

/** 按蓄力比例取配色：0~0.25 浅蓝，0.25~0.5 蓝，0.5~0.75 紫，0.75~1 红 */
export function chargePalette(ratio: number): ChargePalette {
  const i = Math.min(3, Math.max(0, Math.floor(ratio * 4)))
  return TIERS[i]!
}
