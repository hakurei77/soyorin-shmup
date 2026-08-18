<script setup lang="ts">
/**
 * 三角尖角准星（Triangle Crosshair）
 * 中心实心圆点 + 3 个互不相连的 V 形尖角折线：
 * 上、左下、右下各 1 个，V 形开口均朝向中心圆点，
 * 三个尖角围绕中心呈三角布局
 */
import { onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  x: number
  y: number
  /** 命中反馈序号（变化时重放命中动画） */
  hitId?: number
  /** 击杀反馈序号（变化时准星短暂变为金色） */
  killId?: number
}>()

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
</script>

<template>
  <div
    class="crosshair-triangle"
    :class="{
      'crosshair-triangle--hit': hitId,
      'crosshair-triangle--kill': killOn
    }"
    :key="hitId"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <svg
      class="crosshair-triangle__svg"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
    >
      <!-- 上方：朝上的尖角 -->
      <polyline points="8.5,6.9 12,4 15.5,6.9" />
      <!-- 左下：顶点朝外、开口朝向圆点的 V 形 -->
      <polyline points="9.3,17.5 5.1,16 5.9,11.6" />
      <!-- 右下：顶点朝外、开口朝向圆点的 V 形 -->
      <polyline points="18.1,11.6 18.9,16 14.7,17.5" />
      <!-- 中心点 -->
      <circle class="crosshair-triangle__dot" cx="12" cy="12" r="1.1" />
    </svg>
  </div>
</template>

<style lang="scss" scoped>
$ch-size: 48px; // 整体尺寸
$ch-thick: 1.7px; // 线宽
$ch-color: #7dffb0;
$ch-kill: #ffe27a; // 击杀反馈金色（高亮）

.crosshair-triangle {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 40;

  &__svg {
    position: absolute;
    left: calc($ch-size / -2);
    top: calc($ch-size / -2);
    stroke: $ch-color;
    stroke-width: $ch-thick;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 3px rgba($ch-color, 0.9));
    transition:
      stroke 0.08s ease-out,
      filter 0.08s ease-out;
  }

  &__dot {
    fill: $ch-color;
    stroke: none;
    transition: fill 0.08s ease-out;
  }

  // 击杀反馈：整体变为金色并增强辉光（由 killOn 类驱动，移除后渐复原色）
  &--kill {
    .crosshair-triangle__svg {
      stroke: $ch-kill;
      filter: drop-shadow(0 0 4px rgba($ch-kill, 1)) drop-shadow(0 0 9px rgba($ch-kill, 0.7));
    }

    .crosshair-triangle__dot {
      fill: $ch-kill;
    }
  }

  &--hit {
    animation: ch-triangle-hit 0.16s ease-out;
  }
}

@keyframes ch-triangle-hit {
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
