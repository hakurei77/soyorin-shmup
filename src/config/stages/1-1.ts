/**
 * 第 1 关：巡逻母舰（Boss 战）
 * Boss：掠星者·沃恩 PRT-01（星际海盗旗舰，十三门武器循环弹幕）
 */
import type { StageDef } from '../../types'

export const STAGE_1_1: StageDef = {
  id: '1-1', kind: 'boss',
  name: '巡逻母舰', desc: '拦截闯入航线的海盗旗舰，击破十三门武器的火力封锁。',
  pos: { x: 260, y: 46 },
  waves: [], boss: { enemyKey: 'PRT-01' }
}
