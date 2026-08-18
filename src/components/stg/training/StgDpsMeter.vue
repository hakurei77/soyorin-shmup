<script setup lang="ts">
/**
 * DPS 统计器（训练室专用 HUD）
 * 职责：当前/峰值 DPS、累计伤害、战斗计时，全息投影风悬浮面板
 */
import { computed } from 'vue'
import type { HudDpsInfo } from '../../../types'

const props = defineProps<{
  dps: HudDpsInfo
}>()

/** 面板定位：有锚点时钉在木桩右上方，否则回退屏幕右上角 */
const panelStyle = computed(() => {
  const a = props.dps.anchor
  if (!a) return {}
  return { left: `${a.x}px`, top: `${a.y}px`, right: 'auto' }
})

/** 累计伤害缩写（1234 → 1.2k） */
const totalText = computed(() => {
  const t = props.dps.total
  return t >= 10000 ? `${(t / 1000).toFixed(1)}k` : String(t)
})

/** 战斗计时（62.5 → 1:02.5） */
const timeText = computed(() => {
  const t = props.dps.time
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
})
</script>

<template>
  <div class="stg-dps" :style="panelStyle">
    <div class="stg-dps__title">火力统计</div>
    <div class="stg-dps__main">
      <span class="stg-dps__num">{{ dps.current }}</span>
      <span class="stg-dps__unit">DPS</span>
    </div>
    <div class="stg-dps__row">
      <span>峰值</span>
      <span>{{ dps.peak }}</span>
    </div>
    <div class="stg-dps__row">
      <span>总伤</span>
      <span>{{ totalText }}</span>
    </div>
    <div class="stg-dps__row">
      <span>计时</span>
      <span>{{ timeText }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../../../styles/stg-vars.scss' as *;

.stg-dps {
  position: absolute;
  top: 12px;
  right: 14px;
  min-width: 108px;
  padding: 4px 10px;
  // 无底色无边框：文字直接悬浮在战场上，靠辉光与扫描线营造投影感
  pointer-events: none;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-variant-numeric: tabular-nums;
  color: rgba(#67e8f9, 0.92);
  text-shadow:
    0 0 6px rgba(#67e8f9, 0.75),
    0 0 18px rgba(#22d3ee, 0.35);
  animation: holo-flicker 4s linear infinite;

  &__title {
    font-size: 9px;
    letter-spacing: 3px;
    opacity: 0.65;
    margin-bottom: 4px;
  }

  &__main {
    display: flex;
    align-items: baseline;
    gap: 5px;
    margin-bottom: 5px;
  }

  &__num {
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
    color: #c8f6ff;
    text-shadow:
      0 0 8px rgba(#67e8f9, 0.9),
      0 0 24px rgba(#22d3ee, 0.5);
  }

  &__unit {
    font-size: 9px;
    letter-spacing: 1px;
    opacity: 0.7;
  }

  &__row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 10px;
    line-height: 1.7;
    opacity: 0.6;

    span:last-child {
      opacity: 1;
      color: #b5effc;
    }
  }
}

// 全息闪烁：极小幅度的透明度抖动，避免分散注意力
@keyframes holo-flicker {
  0%, 91%, 94.5%, 100% { opacity: 1; }
  92.5% { opacity: 0.82; }
  93.5% { opacity: 0.94; }
}
</style>
