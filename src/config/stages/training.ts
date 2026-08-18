/**
 * 训练室：无限时间，场地中央一台打不死的木桩假人，用于测试装备与练习操作
 */
import type { StageDef } from '../../types'

export const STAGE_TRAINING: StageDef = {
  id: 'training', kind: 'tutorial',
  name: '模拟训练室', desc: '全息模拟训练舱。场地中央伫立着打不坏的木桩假人，无时限，自由练习操作与测试装备。',
  pos: { x: 0, y: 0 },
  waves: [
    {
      at: 30,
      // 逻辑坐标系 480×640 的正中央
      spawns: [{ enemyKey: 'DMY-01', path: 'static', x: 240, y: 320, count: 1, gap: 0 }]
    }
  ],
  boss: null,
  bg: { bgType: 'lab' }
}
