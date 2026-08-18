<script setup lang="ts">
/**
 * 开机引导门（BootGate）
 * 职责：在展示启动页之前，先索取一次用户交互
 * 为什么需要它：
 *   浏览器自动播放策略禁止无声交互前播放音频，
 *   用户的这一次点击即为「激活手势」，
 *   之后挂载 GameLauncher 时 BGM 可立即与画面同步响起
 * 低耦合设计：
 *   - 对外仅暴露一个 enter 事件，父级决定之后进入什么界面
 *   - 内部不播放任何音频，只负责收集首次交互
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { playSfx, preloadSfx } from '../utils/sfx'
import bootLinkSfx from '../assets/audio/ui/boot-link.wav'

const emit = defineEmits<{
  /** 用户完成首次交互（点击 / 按 Enter）后触发 */
  enter: []
}>()

/** 是否正在执行进入过场（防止重复触发） */
const entering = ref(false)

function startEnter() {
  if (entering.value) return
  entering.value = true
  // 本次点击即为激活手势，链路建立的确认音与闪光过场同步响起
  playSfx(bootLinkSfx)
  // 短暂的闪光过场后再通知父级
  setTimeout(() => emit('enter'), 220)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') startEnter()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  // 提前解码确认音，保证首次点击零延迟发声
  preloadSfx(bootLinkSfx)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    class="boot-gate"
    :class="{ 'boot-gate--entering': entering }"
    role="button"
    tabindex="0"
    aria-label="点击建立神经链路连接"
    @click="startEnter"
  >
    <div class="boot-gate__core">
      <div class="boot-gate__ring"></div>
      <div class="boot-gate__ring boot-gate__ring--inner"></div>
      <div class="boot-gate__dot"></div>
    </div>

    <p class="boot-gate__label">
      {{ entering ? 'LINK ESTABLISHING...' : 'CLICK TO ACCESS' }}
    </p>
    <p class="boot-gate__sub">// 点 击 任 意 处 建 立 连 接 //</p>

    <div class="boot-gate__scanline"></div>
  </div>
</template>

<style lang="scss" scoped>
.boot-gate {
  --gate-accent: #bb99f5;
  --gate-cyan: #5ee6ff;
  --gate-ink: #0a0e1a;
  --gate-white: #f2f5fa;

  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 26px;
  background:
    radial-gradient(ellipse at 50% 55%, rgba(187, 153, 245, 0.08), transparent 55%),
    var(--gate-ink);
  color: var(--gate-white);
  font-family: 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
  cursor: pointer;
  user-select: none;
  transition: filter 0.3s;

  &--entering {
    filter: brightness(2.2) saturate(0.3);
  }

  /* ===== 中央脉冲核心 ===== */
  &__core {
    position: relative;
    width: 120px;
    height: 120px;
  }

  &__ring {
    position: absolute;
    inset: 0;
    border: 1px solid var(--gate-accent);
    border-radius: 50%;
    opacity: 0.6;
    animation: gate-ring-pulse 2.4s ease-out infinite;

    &--inner {
      inset: 22px;
      border-color: var(--gate-cyan);
      animation-delay: 1.2s;
    }
  }

  &__dot {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 14px;
    height: 14px;
    transform: translate(-50%, -50%) rotate(45deg);
    background: var(--gate-accent);
    box-shadow: 0 0 18px var(--gate-accent);
    animation: gate-dot-breathe 1.8s ease-in-out infinite;
  }

  /* ===== 文案 ===== */
  &__label {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.5em;
    text-indent: 0.5em;
    color: var(--gate-accent);
    text-shadow: 0 0 14px rgba(187, 153, 245, 0.5);
    animation: gate-blink 1.6s steps(2) infinite;
  }

  &__sub {
    font-size: 11px;
    letter-spacing: 0.35em;
    color: rgba(242, 245, 250, 0.45);
  }

  /* ===== 纵向扫描线 ===== */
  &__scanline {
    position: absolute;
    left: 0;
    right: 0;
    top: -10%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(94, 230, 255, 0.35),
      transparent
    );
    animation: gate-scan 4.5s linear infinite;
    pointer-events: none;
  }
}

@keyframes gate-ring-pulse {
  0% {
    transform: scale(0.7);
    opacity: 0.8;
  }

  100% {
    transform: scale(1.4);
    opacity: 0;
  }
}

@keyframes gate-dot-breathe {
  0%,
  100% {
    transform: translate(-50%, -50%) rotate(45deg) scale(1);
    box-shadow: 0 0 12px var(--gate-accent);
  }

  50% {
    transform: translate(-50%, -50%) rotate(45deg) scale(1.25);
    box-shadow: 0 0 26px var(--gate-accent);
  }
}

@keyframes gate-blink {
  50% {
    opacity: 0.45;
  }
}

@keyframes gate-scan {
  0% {
    top: -10%;
  }

  100% {
    top: 110%;
  }
}
</style>
