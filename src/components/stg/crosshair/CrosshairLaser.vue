<script setup lang="ts">
/**
 * 三段旋转圆环准星（Laser / 3-arc Ring Crosshair）
 * 中心一个点，外围圆环断开为三段圆弧，持续旋转
 * 激光武器专用（见 StgGame.vue crosshairComp）
 */
import { onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  /** 准星中心相对舞台左上角的 x 坐标 */
  x: number
  /** 准星中心相对舞台左上角的 y 坐标 */
  y: number
  /** 命中反馈序号（变化时重放命中动画） */
  hitId?: number
  /** 击杀反馈序号（变化时准星短暂变为金色） */
  killId?: number
  /** 右键瞄准中（圆环向中心收束） */
  aiming?: boolean
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
    class="crosshair-laser"
    :class="{
      'crosshair-laser--hit': hitId,
      'crosshair-laser--kill': killOn,
      'crosshair-laser--aiming': aiming
    }"
    :key="hitId"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <span class="crosshair-laser__ring-wrap">
      <svg class="crosshair-laser__ring" viewBox="-20 -20 40 40">
        <!-- pathLength=90 归一化：三段 21 单位圆弧 + 三段 9 单位缺口 -->
        <circle
          class="crosshair-laser__arc"
          cx="0"
          cy="0"
          r="13"
          pathLength="90"
        />
      </svg>
    </span>
    <span class="crosshair-laser__dot"></span>
  </div>
</template>

<style lang="scss" scoped>
// 准星参数（可统一调整）
$ch-radius: 13px; // 圆环半径（与 viewBox 中 r 一致）
$ch-thick: 3px; // 圆弧线宽
$ch-dot: 4px; // 中心点直径
$ch-color: #7dffb0; // 准星颜色（与其他准星统一的经典亮绿）
$ch-kill: #ffe27a; // 击杀反馈金色（高亮）
$ch-spin: 4s; // 圆环旋转一周耗时

.crosshair-laser {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none; // 不拦截鼠标事件
  z-index: 40;

  // 收束动画的包一层，避免与旋转动画的 transform 冲突
  &__ring-wrap {
    position: absolute;
    left: -20px;
    top: -20px;
    width: 40px;
    height: 40px;
    transition: transform 0.12s ease-out;
  }

  &__ring {
    width: 100%;
    height: 100%;
    overflow: visible;
    animation: ch-laser-spin $ch-spin linear infinite;
  }

  &__arc {
    fill: none;
    stroke: $ch-color;
    stroke-width: $ch-thick;
    stroke-linecap: round;
    // pathLength=90：弧 21 / 缺口 9，整圆恰好三段均布
    stroke-dasharray: 21 9;
    filter: drop-shadow(0 0 3px rgba($ch-color, 0.9)); // 轻微发光，暗背景更清晰
    transition:
      stroke 0.08s ease-out,
      filter 0.08s ease-out;
  }

  &__dot {
    position: absolute;
    width: $ch-dot;
    height: $ch-dot;
    left: calc($ch-dot / -2);
    top: calc($ch-dot / -2);
    border-radius: 50%;
    background: $ch-color;
    box-shadow: 0 0 4px rgba($ch-color, 0.9);
    transition:
      background-color 0.08s ease-out,
      box-shadow 0.08s ease-out;
  }

  // 瞄准：圆环向中心收束，旋转略微加快
  &--aiming {
    .crosshair-laser__ring-wrap {
      transform: scale(0.72);
    }

    .crosshair-laser__ring {
      animation-duration: calc($ch-spin * 0.6);
    }
  }

  // 击杀反馈：整体变为金色并增强辉光（由 killOn 类驱动，移除后渐复原色）
  &--kill {
    .crosshair-laser__arc {
      stroke: $ch-kill;
      filter: drop-shadow(0 0 4px rgba($ch-kill, 1)) drop-shadow(0 0 9px rgba($ch-kill, 0.7));
    }

    .crosshair-laser__dot {
      background: $ch-kill;
      box-shadow:
        0 0 6px rgba($ch-kill, 1),
        0 0 12px rgba($ch-kill, 0.7);
    }
  }

  &--hit {
    animation: ch-laser-hit 0.16s ease-out;
  }
}

@keyframes ch-laser-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes ch-laser-hit {
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
