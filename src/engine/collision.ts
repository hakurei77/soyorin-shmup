/**
 * 碰撞检测
 * 只使用圆形判定 + 距离平方比较（避免开方，性能最优）
 */

/** 判断两个圆是否相交（a、b 为圆心坐标与半径） */
export function circleHit(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  const dx = ax - bx
  const dy = ay - by
  const r = ar + br
  return dx * dx + dy * dy <= r * r
}

/**
 * 判断线段（带半径 r，如高速子弹一帧的扫掠路径）是否与圆相交。
 * 取圆心在线段上的最近点做距离平方比较，避免开方；
 * 用于防止弹速过快时一帧跨过目标造成穿透（tunneling）。
 */
export function segmentCircleHit(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  cx: number,
  cy: number,
  cr: number
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  let t = 0
  if (lenSq > 0) {
    t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq
    if (t < 0) t = 0
    else if (t > 1) t = 1
  }
  const nx = x1 + dx * t - cx
  const ny = y1 + dy * t - cy
  const rr = r + cr
  return nx * nx + ny * ny <= rr * rr
}
