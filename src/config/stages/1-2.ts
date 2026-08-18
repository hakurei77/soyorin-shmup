/**
 * 第 2 关：棱镜回廊（Boss 战）
 * Boss：棱镜星卫 LAS-01（纯激光武装 Boss，浮游炮随战损增援）
 */
import type { StageDef } from '../../types'

export const STAGE_1_2: StageDef = {
  id: '1-2', kind: 'boss',
  name: '棱镜回廊', desc: '穿越棱镜回廊，直面序章的最终守卫。',
  pos: { x: 620, y: 46 },
  waves: [], boss: { enemyKey: 'LAS-01' },
  bg: { gradient: ['#001018', '#06283a', '#0a3d4d'] }
}
