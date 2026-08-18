/**
 * 第 3 关：星渊终点（Boss 战）
 * Boss：星渊巨构·绯红天幕 FIN-01（最终 Boss，三阶段巨构战）
 */
import type { StageDef } from '../../types'

export const STAGE_1_3: StageDef = {
  id: '1-3', kind: 'boss',
  name: '星渊终点', desc: '深入星渊，直面沉睡的远古巨构——绯红天幕。',
  pos: { x: 980, y: 46 },
  waves: [], boss: { enemyKey: 'FIN-01' },
  bg: { gradient: ['#1a0008', '#3a0414', '#5a0a1c'] }
}
