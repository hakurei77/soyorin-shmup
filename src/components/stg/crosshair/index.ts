/**
 * 自定义准星组件集合
 * 新增准星样式：在本文件夹创建组件（props 统一为 { x, y, hitId?, killId? }），并在此导出
 * hitId 为命中反馈序号：自机弹命中敌人时递增，组件据此重放命中动画
 * killId 为击杀反馈序号：击毁敌机 / 击破 Boss 时递增，组件据此让准星短暂变为金色
 * 准星不由用户选择，按装备武器类型自动决定（见 StgGame.vue crosshairComp）
 * 蓄力武器准星额外接收 { charge, chargeMin }（蓄力进度与最小发射阈值）
 * 过热武器准星额外接收 { heat }（热量与过热锁机状态）
 */
export { default as CrosshairClassic } from './CrosshairClassic.vue'
export { default as CrosshairTriangle } from './CrosshairTriangle.vue'
export { default as CrosshairLaser } from './CrosshairLaser.vue'
export { default as CrosshairArc } from './CrosshairArc.vue'
export { default as CrosshairHeat } from './CrosshairHeat.vue'
