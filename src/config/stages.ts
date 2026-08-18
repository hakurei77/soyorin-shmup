/**
 * 关卡注册表 — 已拆分到 stages/ 文件夹
 * 每个关卡一个独立文件，共享配置在 stages/shared.ts
 * 此文件仅作为向后兼容的重导出入口
 */
export {
  STAGE_REGISTRY,
  STAGE_MAP,
  CHAPTERS
} from './stages/index'
