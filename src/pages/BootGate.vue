<script setup lang="ts">
/**
 * 开机引导门（BootGate）
 * 职责：
 *   1. 在展示启动页之前，先预载全部游戏资源（图片解码 + 音频暖缓存），
 *      加载期间显示进度，未加载完不允许交互
 *   2. 资源就绪后索取一次用户交互
 * 为什么需要它：
 *   - 浏览器自动播放策略禁止无声交互前播放音频，
 *     用户的这一次点击即为「激活手势」，
 *     之后挂载 GameLauncher 时 BGM 可立即与画面同步响起
 *   - 提前完成资源下载，避免进入游戏后素材还在路上（贴图缺失 / 首次开火无声）
 * 低耦合设计：
 *   - 对外仅暴露一个 enter 事件，父级决定之后进入什么界面
 *   - 内部不播放任何音频（除确认音），只负责预载与收集首次交互
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { playSfx, preloadSfx } from '../utils/sfx'
import { preloadAllAssets } from '../utils/preload'
import bootLinkSfx from '../assets/audio/ui/boot-link.wav'

const emit = defineEmits<{
  /** 用户完成首次交互（点击 / 按 Enter）后触发 */
  enter: []
}>()

/** 是否正在执行进入过场（防止重复触发） */
const entering = ref(false)
/** 已加载完成的资源数 */
const loadedCount = ref(0)
/** 资源总数（0 表示尚未开始统计） */
const totalCount = ref(0)
/** 全部资源加载完成，允许交互 */
const ready = ref(false)

/** 加载进度百分比（0~100） */
const progressPercent = computed(() =>
  totalCount.value > 0 ? Math.round((loadedCount.value / totalCount.value) * 100) : 0
)

function startEnter() {
  // 资源未就绪或正在过场时忽略交互
  if (!ready.value || entering.value) return
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
  // 启动全量资源预载，完成后才开放交互
  preloadAllAssets(({ loaded, total }) => {
    loadedCount.value = loaded
    totalCount.value = total
  }).then(() => {
    ready.value = true
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    class="boot-gate"
    :class="{ 'boot-gate--entering': entering, 'boot-gate--loading': !ready }"
    role="button"
    tabindex="0"
    :aria-disabled="!ready"
    :aria-label="ready ? '点击建立神经链路连接' : '正在加载资源，请稍候'"
    @click="startEnter"
  >
    <div class="boot-gate__core">
      <div class="boot-gate__ring"></div>
      <div class="boot-gate__ring boot-gate__ring--inner"></div>
      <div class="boot-gate__dot"></div>
    </div>

    <p class="boot-gate__label">
      {{
        entering
          ? 'LINK ESTABLISHING...'
          : ready
            ? 'CLICK TO ACCESS'
            : `LOADING ASSETS ${progressPercent}%`
      }}
    </p>

    <!-- 加载进度条：就绪后淡出，让位给提示文案 -->
    <div v-if="!ready" class="boot-gate__progress">
      <div
        class="boot-gate__progress-bar"
        :style="{ width: `${progressPercent}%` }"
      ></div>
    </div>
    <p class="boot-gate__sub">
      {{ ready ? '// 点 击 任 意 处 建 立 连 接 //' : `// ${loadedCount} / ${totalCount} 资源加载中 //` }}
    </p>

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

  /* 加载中：光标与呼吸动画保持等待态，提示用户暂不可交互 */
  &--loading {
    cursor: wait;
  }

  /* ===== 加载进度条 ===== */
  &__progress {
    width: min(320px, 60vw);
    height: 3px;
    background: rgba(187, 153, 245, 0.15);
    border-radius: 2px;
    overflow: hidden;
  }

  &__progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--gate-accent), var(--gate-cyan));
    box-shadow: 0 0 10px rgba(187, 153, 245, 0.6);
    border-radius: 2px;
    transition: width 0.15s ease-out;
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
