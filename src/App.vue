<script setup lang="ts">
/**
 * 应用根组件
 * 职责：页面流转 —— 引导门（BootGate）→ 启动页（GameLauncher）→ 游戏本体（StgGame）
 * BootGate 索取首次用户交互以解锁音频自动播放，
 * GameLauncher 通过 launch 事件通知进入游戏，三方互不感知内部实现
 */
import { ref } from 'vue'
import StgGame from './pages/StgGame.vue'
import GameLauncher from './pages/GameLauncher.vue'
import BootGate from './pages/BootGate.vue'

/** localStorage 标记：用户完成过一次引导后，后续访问直接跳过 BootGate */
const BOOT_GATE_KEY = 'soyorin.boot-done'

/** 调试开关：true = 每次访问都弹出 BootGate（测试用）；false = 只弹一次 */
const BOOT_GATE_EVERY_TIME = true

/** 是否已完成首次交互（解锁音频）；再次访问时读取标记直接跳过引导层 */
const entered = ref(!BOOT_GATE_EVERY_TIME && localStorage.getItem(BOOT_GATE_KEY) === '1')
const launched = ref(false)

function onEnter() {
  entered.value = true
  if (!BOOT_GATE_EVERY_TIME) localStorage.setItem(BOOT_GATE_KEY, '1')
}

function onLaunch() {
  launched.value = true
}
</script>

<template>
  <Transition name="page" mode="out-in">
    <StgGame v-if="launched" />
    <GameLauncher
      v-else-if="entered"
      title="喵奈"
      title-accent="Project"
      version="0.0.1"
      @launch="onLaunch"
    />
    <BootGate v-else @enter="onEnter" />
  </Transition>
</template>

<style scoped>
/* 启动页 → 游戏页 过场动画：淡出微缩 → 淡入微扩 */
.page-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease, filter 0.35s ease;
}

.page-enter-active {
  transition: opacity 0.5s ease 0.05s, transform 0.5s ease 0.05s;
}

.page-leave-to {
  opacity: 0;
  transform: scale(1.04);
  filter: blur(6px);
}

.page-enter-from {
  opacity: 0;
  transform: scale(0.98);
}
</style>
