<script setup lang="ts">
/**
 * 蓄力圆环准星（Arc Charge Crosshair）
 * 蓄力武器专用（LW-04 电弧发射器，见 StgGame.vue crosshairComp）：
 * - 外圈为充能进度环，从顶部顺时针随蓄力填充
 * - 环上的刻度标记最小发射阈值：未达阈值时进度弧为暗色（松手不发射），
 *   越过阈值转为亮蓝，蓄满时白炽脉动提示可释放完整威力
 * - 中心点为聚能核，随蓄力变大变亮；蓄力中下方显示充能百分比
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { chargePalette } from '../../../utils/chargeColors'

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
    /** 蓄力进度 0~1 */
    charge?: number
    /** 最小发射阈值比例 0~1（低于该值松手不发射） */
    chargeMin?: number
  }>(),
  { hitId: 0, killId: 0, charge: 0, chargeMin: 0.15 }
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

/** 已越过最小发射阈值（松手可发射） */
const ready = computed(() => props.charge >= props.chargeMin)
/** 已蓄满（完整伤害） */
const full = computed(() => props.charge >= 1)
/** 阈值刻度在圆环上的角度（0° = 顶部，顺时针） */
const minDeg = computed(() => props.chargeMin * 360)
/** 蓄力等级配色：浅蓝 → 蓝 → 紫 → 红（与局内电弧特效一致） */
const tierColor = computed(() => chargePalette(props.charge).css)
/** 进度弧颜色：击杀反馈中为金色；未达阈值保持暗色，越过阈值后按蓄力等级变色 */
const progressColor = computed(() =>
  killOn.value ? '#ffe27a' : ready.value ? tierColor.value : '#33507e'
)
/** 聚能核颜色：击杀反馈中为金色，其余随蓄力等级变化 */
const dotColor = computed(() => (killOn.value ? '#ffe27a' : tierColor.value))
</script>

<template>
  <div
    class="crosshair-arc"
    :class="{
      'crosshair-arc--hit': hitId,
      'crosshair-arc--kill': killOn,
      'crosshair-arc--ready': ready,
      'crosshair-arc--full': full
    }"
    :key="hitId"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <svg class="crosshair-arc__svg" viewBox="-24 -24 48 48">
      <!-- 进度环底轨 -->
      <circle class="crosshair-arc__track" cx="0" cy="0" r="15" pathLength="100" />
      <!-- 充能进度弧（从顶部顺时针填充，颜色随蓄力等级变化） -->
      <circle
        class="crosshair-arc__progress"
        cx="0"
        cy="0"
        r="15"
        pathLength="100"
        :stroke-dasharray="`${charge * 100} 100`"
        :style="{ stroke: progressColor }"
        transform="rotate(-90)"
      />
      <!-- 最小发射阈值刻度 -->
      <g :transform="`rotate(${minDeg})`">
        <line class="crosshair-arc__tick" x1="0" y1="-16.2" x2="0" y2="-13.8" />
      </g>
      <!-- 中心聚能核：随蓄力变大，颜色随蓄力等级变化 -->
      <circle
        class="crosshair-arc__dot"
        cx="0"
        cy="0"
        :r="1.6 + charge * 1.6"
        :opacity="0.8 + charge * 0.2"
        :style="{ fill: dotColor }"
      />
    </svg>
    <!-- 蓄力百分比（蓄力中显示） -->
    <span v-if="charge > 0" class="crosshair-arc__pct" :style="{ color: progressColor }">
      {{ Math.round(charge * 100) }}
    </span>
  </div>
</template>

<style lang="scss" scoped>
// 准星参数（可统一调整）
$ch-size: 48px; // 整体尺寸
$ch-color: #60a5fa; // 亮蓝（电弧主题色）
$ch-dim: #33507e; // 未达阈值时的暗蓝
$ch-full: #ffffff; // 蓄满白炽
$ch-kill: #ffe27a; // 击杀反馈金色（高亮）

.crosshair-arc {
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
    stroke: rgba($ch-color, 0.4);
    stroke-width: 2.5px;
    transition: stroke 0.08s ease-out;
  }

  &__progress {
    fill: none;
    stroke: $ch-dim; // 默认暗色：未达阈值
    stroke-width: 2.5px;
    stroke-linecap: round;
    transition: stroke 0.1s ease-out;
  }

  &__tick {
    stroke: rgba(#ffffff, 0.65);
    stroke-width: 2px;
    stroke-linecap: round;
  }

  &__dot {
    fill: $ch-color;
    filter: drop-shadow(0 0 3px rgba($ch-color, 0.9));
    transition:
      fill 0.08s ease-out,
      filter 0.08s ease-out;
  }

  // 蓄力百分比：锚在圆环右下象限外侧，不遮挡准星正下方的弹道视野
  &__pct {
    position: absolute;
    left: 16px;
    top: 10px;
    font-size: 10px;
    letter-spacing: 1px;
    white-space: nowrap;
    color: $ch-dim;
    text-shadow: 0 0 4px rgba($ch-color, 0.6);

    &::after {
      content: '%';
      margin-left: 1px;
      opacity: 0.7;
    }
  }

  // 越过阈值：进度弧转亮蓝并发光，提示松手可发射
  &--ready {
    .crosshair-arc__progress {
      stroke: $ch-color;
      filter: drop-shadow(0 0 3px rgba($ch-color, 0.9));
    }

    .crosshair-arc__pct {
      color: $ch-color;
    }
  }

  // 蓄满：白炽脉动，提示完整威力
  &--full {
    .crosshair-arc__progress {
      stroke: $ch-full;
      animation: ch-arc-full 0.5s ease-in-out infinite alternate;
    }

    .crosshair-arc__dot {
      fill: $ch-full;
      animation: ch-arc-full 0.5s ease-in-out infinite alternate;
    }

    .crosshair-arc__pct {
      color: $ch-full;
    }
  }

  // 击杀反馈：整体变为金色并增强辉光（由 killOn 类驱动，移除后渐复原色；
  // 进度弧 / 聚能核颜色由 progressColor / dotColor 计算属性切换为金色）
  &--kill {
    .crosshair-arc__progress {
      filter: drop-shadow(0 0 4px rgba($ch-kill, 1)) drop-shadow(0 0 9px rgba($ch-kill, 0.7));
    }

    .crosshair-arc__dot {
      filter: drop-shadow(0 0 4px rgba($ch-kill, 1)) drop-shadow(0 0 9px rgba($ch-kill, 0.7));
    }
  }

  &--hit {
    animation: ch-arc-hit 0.16s ease-out;
  }
}

@keyframes ch-arc-full {
  from {
    opacity: 1;
    filter: drop-shadow(0 0 3px rgba($ch-color, 0.9));
  }
  to {
    opacity: 0.65;
    filter: drop-shadow(0 0 6px rgba($ch-full, 0.95));
  }
}

@keyframes ch-arc-hit {
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
