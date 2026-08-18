/**
 * 战场尺寸（动态逻辑分辨率）
 * 游戏画面铺满整个窗口：逻辑坐标系 = 画布 CSS 像素尺寸，
 * 屏幕越大战斗场地越大，不设固定逻辑分辨率。
 * config/ 中的坐标（敌机出场位置、自机出生点等）基于 480×640 设计空间，
 * 引擎通过 mapX/mapY 把它们映射到实际战场：
 * - 纵向按 sy 等比缩放；
 * - 横向以屏幕中心为基准（设计空间中央 x=240 永远对齐屏幕正中），
 *   偏移量同样按 sy 缩放，保证宽屏下敌人始终集中在中间区域，
 *   不会随窗口变宽而散到两侧。
 */
import { BALANCE } from '../config/balance'

interface Field {
  /** 当前战场逻辑宽度（= 画布 CSS 宽度） */
  width: number
  /** 当前战场逻辑高度（= 画布 CSS 高度） */
  height: number
  /** 战场中心横坐标 */
  cx: number
  /** 相对设计空间的纵向缩放比（横向偏移也用它，保持等比） */
  sy: number
  /** 由渲染层在画布尺寸变化时调用，各引擎模块读取实时值 */
  set(w: number, h: number): void
  /** 设计空间横坐标 → 实际横坐标（以屏幕中心为基准等比缩放） */
  mapX(x: number): number
  /** 设计空间纵坐标 → 实际纵坐标 */
  mapY(y: number): number
}

export const field: Field = {
  width: BALANCE.logicWidth,
  height: BALANCE.logicHeight,
  cx: BALANCE.logicWidth / 2,
  sy: 1,
  /** 由渲染层在画布尺寸变化时调用，各引擎模块读取实时值 */
  set(w: number, h: number) {
    this.width = w
    this.height = h
    this.cx = w / 2
    this.sy = h / BALANCE.logicHeight
  },
  /** 设计空间横坐标 → 实际横坐标（以屏幕中心为基准等比缩放） */
  mapX(x: number) {
    return this.cx + (x - BALANCE.logicWidth / 2) * this.sy
  },
  /** 设计空间纵坐标 → 实际纵坐标 */
  mapY(y: number) {
    return y * this.sy
  }
}
