/**
 * 关卡注册表（数据驱动）
 *
 * 作战页仅保留 3 个 Boss 关卡，难度递进：
 *   1-1 掠星者·沃恩 → 1-2 棱镜星卫 → 1-3 星渊巨构·绯红天幕
 *
 * 训练室（training）独立于作战页，由角色页「模拟训练」进入。
 *
 * 路径速查（道中波次用，当前 Boss 关无道中波次）：
 *   straight     dive-left    dive-right    sine
 *   hover        zigzag       loop          rush
 *   sweep-left   sweep-right
 */
import type { StageChapter, StageDef } from '../../types'
import { STAGE_TRAINING } from './training'
import { STAGE_1_1 } from './1-1'
import { STAGE_1_2 } from './1-2'
import { STAGE_1_3 } from './1-3'

/** 所有关卡的统一注册表（训练室 + 3 个 Boss 关） */
export const STAGE_REGISTRY: StageDef[] = [
  STAGE_TRAINING,
  STAGE_1_1,
  STAGE_1_2,
  STAGE_1_3
]

/** 快速查找：id → StageDef */
export const STAGE_MAP = new Map<string, StageDef>(
  STAGE_REGISTRY.map((s) => [s.id, s])
)

/** 章节列表（作战关卡选择界面数据源，仅 3 个 Boss 关） */
export const CHAPTERS: StageChapter[] = [
  {
    id: 'ep0',
    name: '作战出击',
    nameEn: 'SORTIE',
    stageIds: ['1-1', '1-2', '1-3']
  }
]
