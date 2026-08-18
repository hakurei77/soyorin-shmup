<script setup lang="ts">
/**
 * 过热热量环准星（Heat Gauge Crosshair）
 * 过热武器专用（LW-05 电磁轻机枪，见 StgGame.vue crosshairComp）：
 * - 中心点 + 外围热量环的极简造型，中心点颜色随热量同步变化
 * - 外围圆环为热量表：随射击从顶部顺时针填充，颜色由青绿渐变为橙红
 * - 过热锁机时整体转为红色警报脉动，圆环随冷却进度逐渐排空，
 *   排空前无法开火，准星下方显示"过热"提示
 */
import { computed, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 准星中心相对舞台左上角的 x 坐标 */
    x: number
    /** 准星中心相对舞台左上角的 y 坐标 */
    y: number
    /** 命中反馈序号（变化时重放命中动画） */
    hitId?: number
    /** 击杀反馈序号（变化时准星短暂变为金色） */
    killId?: number
    /** 热量状态（过热武器由引擎推送；null 时按 0 热量处理） */
    heat?: { current: number; max: number; overheated: boolean } | null
  }>(),
  { hitId: 0, killId: 0, heat: null }
)

/** 击杀反馈中（准星金色闪一下即复原；连续击杀会刷新时长） */
const killOn = ref(false)
let killTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.killId,
  (v) => {
    if (!v) return
    killOn.value = true
    clearTimeout(killTimer)
    killTimer = setTimeout(() => (killOn.value = false), 80)
  }
)

onUnmounted(() => clearTimeout(killTimer))

/** 热量比例 0~1 */
const ratio = computed(() =>
  props.heat ? Math.min(1, props.heat.current / props.heat.max) : 0
)
/** 过热锁机中 */
const overheated = computed(() => props.heat?.overheated ?? false)
/** 热量环颜色：击杀反馈金色 > 过热警报红 > 随热量青绿 → 橙 → 红渐变 */
const ringColor = computed(() => {
  if (killOn.value) return '#ffe27a'
  if (overheated.value) return '#ff4444'
  const r = ratio.value
  if (r < 0.5) {
    // 青绿 → 橙
    const t = r / 0.5
    return `rgb(${Math.round(125 + (255 - 125) * t)}, ${Math.round(255 - (255 - 154) * t)}, ${Math.round(176 - 176 * t)})`
  }
  // 橙 → 红
  const t = (r - 0.5) / 0.5
  return `rgb(255, ${Math.round(154 - (154 - 68) * t)}, ${Math.round(46 - 46 * t)})`
})
</script>

<template>
  <div
    class="crosshair-heat"
    :class="{
      'crosshair-heat--hit': hitId,
      'crosshair-heat--kill': killOn,
      'crosshair-heat--overheated': overheated
    }"
    :key="hitId"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <svg class="crosshair-heat__svg" viewBox="-24 -24 48 48">
      <!-- 热量环底轨 -->
      <circle class="crosshair-heat__track" cx="0" cy="0" r="16" pathLength="100" />
      <!-- 热量进度弧（从顶部顺时针填充，过热后随冷却排空） -->
      <circle
        class="crosshair-heat__ring"
        cx="0"
        cy="0"
        r="16"
        pathLength="100"
        :stroke-dasharray="`${ratio * 100} 100`"
        :style="{ stroke: ringColor }"
        transform="rotate(-90)"
      />
      <!-- 中心点：颜色随热量同步变化 -->
      <circle class="crosshair-heat__dot" cx="0" cy="0" r="1.4" :style="{ fill: ringColor }" />
    </svg>
    <!-- 过热提示（锁机期间显示） -->
    <span v-if="overheated" class="crosshair-heat__warn">过热</span>
  </div>
</template>

<style lang="scss" scoped>
$ch-size: 48px; // 整体尺寸
$ch-thick: 1.7px; // 线宽
$ch-color: #7dffb0; // 青绿（技术武器主题色，低热量）
$ch-kill: #ffe27a; // 击杀反馈金色（高亮）
$ch-hot: #ff4444; // 过热警报红

.crosshair-heat {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 40;

  &__svg {
    position: absolute;
    left: calc($ch-size / -2);
    top: calc($ch-size / -2);
    width: $ch-size;
    height: $ch-size;
    overflow: visible;
  }

  &__track {
    fill: none;
    stroke: rgba($ch-color, 0.18);
    stroke-width: 2px;
  }

  &__ring {
    fill: none;
    stroke: $ch-color;
    stroke-width: 2.5px;
    stroke-linecap: round;
    filter: drop-shadow(0 0 3px rgba($ch-color, 0.7));
    transition: stroke 0.1s ease-out;
  }

  &__dot {
    fill: $ch-color;
    filter: drop-shadow(0 0 2px rgba($ch-color, 0.9));
    transition: fill 0.1s ease-out;
  }

  // 过热提示：锚在圆环右下象限外侧，不遮挡准星正下方的弹道视野
  &__warn {
    position: absolute;
    left: 16px;
    top: 10px;
    font-size: 10px;
    letter-spacing: 2px;
    white-space: nowrap;
    color: $ch-hot;
    text-shadow: 0 0 4px rgba($ch-hot, 0.8);
    animation: ch-heat-blink 0.4s ease-in-out infinite alternate;
  }

  // 击杀反馈：热量环增强金色辉光（颜色由 ringColor 计算属性切换为金色）
  &--kill {
    .crosshair-heat__ring {
      filter: drop-shadow(0 0 4px rgba($ch-kill, 1)) drop-shadow(0 0 9px rgba($ch-kill, 0.7));
    }
  }

  // 过热锁机：整体红色警报脉动，提示无法开火（颜色由 ringColor 切换为警报红）
  &--overheated {
    .crosshair-heat__ring {
      filter: drop-shadow(0 0 4px rgba($ch-hot, 0.9));
      animation: ch-heat-blink 0.4s ease-in-out infinite alternate;
    }

    .crosshair-heat__dot {
      animation: ch-heat-blink 0.4s ease-in-out infinite alternate;
    }
  }

  &--hit {
    animation: ch-heat-hit 0.16s ease-out;
  }
}

@keyframes ch-heat-blink {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.45;
  }
}

@keyframes ch-heat-hit {
  0% {
    transform: scale(1.18);
    filter: brightness(1.4);
  }
  100% {
    transform: scale(1);
    filter: none;
  }
}
</style>
