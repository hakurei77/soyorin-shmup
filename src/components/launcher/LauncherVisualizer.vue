<script setup lang="ts">
/**
 * 启动页左下角音频可视化
 * 职责：读取 BGM 的 AnalyserNode 频谱，绘制赛博风频谱柱
 * 低耦合设计：
 *   - 仅依赖 bgm 工具暴露的 getBgmAnalyser()，不感知播放逻辑
 *   - 未播放 / 被自动播放策略拦截时，展示待机呼吸波，UI 不会空掉
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { getBgmAnalyser } from '../../utils/bgm'

const BAR_COUNT = 28
/** 频谱高频段通常为空，只取前 72% 的 bin */
const USABLE_RATIO = 0.72

const canvasRef = ref<HTMLCanvasElement | null>(null)
let rafId = 0
let idlePhase = 0
/** 画布 CSS 尺寸（ctx 已按 DPR 缩放，绘制一律使用逻辑坐标） */
let viewW = 0
let viewH = 0

function draw() {
  rafId = requestAnimationFrame(draw)
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return

  const width = viewW
  const height = viewH
  ctx.clearRect(0, 0, width, height)

  const gap = 3
  const barW = (width - gap * (BAR_COUNT - 1)) / BAR_COUNT
  const analyser = getBgmAnalyser()

  let levels: number[] | null = null
  if (analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    // 全零说明尚未真正出声（自动播放被拦截），按待机处理
    if (data.some(v => v > 0)) {
      const usable = Math.floor(data.length * USABLE_RATIO)
      levels = Array.from({ length: BAR_COUNT }, (_, i) => {
        const idx = Math.floor((i / BAR_COUNT) * usable)
        return data[idx] / 255
      })
    }
  }

  if (!levels) {
    // 待机呼吸波：缓慢正弦起伏
    idlePhase += 0.03
    levels = Array.from(
      { length: BAR_COUNT },
      (_, i) => 0.1 + 0.08 * (1 + Math.sin(idlePhase + i * 0.45))
    )
  }

  const gradient = ctx.createLinearGradient(0, height, 0, 0)
  gradient.addColorStop(0, 'rgba(187, 153, 245, 0.55)')
  gradient.addColorStop(1, '#5ee6ff')

  ctx.fillStyle = gradient
  ctx.shadowColor = 'rgba(94, 230, 255, 0.6)'
  ctx.shadowBlur = 6

  for (let i = 0; i < BAR_COUNT; i++) {
    const h = Math.max(2, levels[i] * (height - 4))
    const x = i * (barW + gap)
    ctx.fillRect(x, height - h, barW, h)
  }
}

onMounted(() => {
  const canvas = canvasRef.value
  if (canvas) {
    // 按设备像素比放大画布，保证高分屏清晰
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    viewW = rect.width
    viewH = rect.height
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.getContext('2d')?.scale(dpr, dpr)
  }
  rafId = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="visualizer">
    <span class="visualizer__label">AUDIO // SPECTRUM</span>
    <canvas ref="canvasRef" class="visualizer__canvas"></canvas>
  </div>
</template>

<style lang="scss" scoped>
.visualizer {
  position: absolute;
  left: 40px;
  bottom: 44px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;

  &__label {
    font-size: 9px;
    letter-spacing: 0.3em;
    color: rgba(242, 245, 250, 0.35);
  }

  &__canvas {
    width: 220px;
    height: 44px;
  }
}
</style>
