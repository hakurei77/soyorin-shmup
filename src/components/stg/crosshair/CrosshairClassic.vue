<script setup lang="ts">
/**
 * 四段式十字准星（Classic / 4-line Crosshair）
 * 上下左右四条短线，中心留空隙，CS / Valorant 经典样式
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
  /** 右键瞄准中（准星向中心收束） */
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
    class="crosshair-classic"
    :class="{
      'crosshair-classic--hit': hitId,
      'crosshair-classic--kill': killOn,
      'crosshair-classic--aiming': aiming
    }"
    :key="hitId"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <span class="crosshair-classic__tick crosshair-classic__tick--top"></span>
    <span class="crosshair-classic__tick crosshair-classic__tick--right"></span>
    <span class="crosshair-classic__tick crosshair-classic__tick--bottom"></span>
    <span class="crosshair-classic__tick crosshair-classic__tick--left"></span>
  </div>
</template>

<style lang="scss" scoped>
// 准星参数（可统一调整）
$ch-len: 10px; // 每段线长
$ch-thick: 3.5px; // 线宽
$ch-gap: 9px; // 中心空隙半径
$ch-gap-aim: 5px; // 瞄准时的中心空隙半径（收束）
$ch-color: #7dffb0; // 准星颜色（经典亮绿）
$ch-kill: #ffe27a; // 击杀反馈金色（高亮）

.crosshair-classic {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none; // 不拦截鼠标事件
  z-index: 40;

  &__tick {
    position: absolute;
    background: $ch-color;
    box-shadow: 0 0 4px rgba($ch-color, 0.9); // 轻微发光，暗背景更清晰
    transition:
      top 0.12s ease-out,
      bottom 0.12s ease-out,
      left 0.12s ease-out,
      right 0.12s ease-out,
      background-color 0.08s ease-out,
      box-shadow 0.08s ease-out;

    &--top,
    &--bottom {
      width: $ch-thick;
      height: $ch-len;
      left: calc($ch-thick / -2);
    }

    &--left,
    &--right {
      width: $ch-len;
      height: $ch-thick;
      top: calc($ch-thick / -2);
    }

    &--top {
      bottom: $ch-gap;
    }

    &--bottom {
      top: $ch-gap;
    }

    &--left {
      right: $ch-gap;
    }

    &--right {
      left: $ch-gap;
    }
  }

  // 瞄准：四条线向中心收束
  &--aiming {
    .crosshair-classic__tick--top {
      bottom: $ch-gap-aim;
    }

    .crosshair-classic__tick--bottom {
      top: $ch-gap-aim;
    }

    .crosshair-classic__tick--left {
      right: $ch-gap-aim;
    }

    .crosshair-classic__tick--right {
      left: $ch-gap-aim;
    }
  }

  // 击杀反馈：整体变为金色并增强辉光（由 killOn 类驱动，移除后渐复原色）
  &--kill {
    .crosshair-classic__tick {
      background: $ch-kill;
      box-shadow:
        0 0 6px rgba($ch-kill, 1),
        0 0 12px rgba($ch-kill, 0.7);
    }
  }

  &--hit {
    animation: ch-classic-hit 0.16s ease-out;
  }
}

@keyframes ch-classic-hit {
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
