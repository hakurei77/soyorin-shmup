<script setup lang="ts">
/**
 * 帧率设置面板
 * 职责：展示帧率档位，选择结果即时上抛给父组件写入引擎
 */
defineProps<{
  /** 当前渲染帧率上限（0 = 不限制，跟随屏幕刷新率） */
  frameLimit: number
}>()

const emit = defineEmits<{
  change: [fps: number]
  close: []
}>()

/** 可选帧率档位 */
const frameOptions = [
  { fps: 0, label: '跟随屏幕（无上限）' },
  { fps: 30, label: '30 FPS' },
  { fps: 60, label: '60 FPS' },
  { fps: 120, label: '120 FPS' },
  { fps: 144, label: '144 FPS' }
]
</script>

<template>
  <div class="stg-overlay stg-overlay--dim">
    <h2 class="stg-overlay__title stg-overlay__title--small">帧率设置</h2>
    <div class="stg-keys">
      <div
        v-for="opt in frameOptions"
        :key="opt.fps"
        class="stg-keys__row"
      >
        <span class="stg-keys__label">{{ opt.label }}</span>
        <button
          class="stg-keys__key"
          :class="{
            'stg-keys__key--active': frameLimit === opt.fps
          }"
          @click="emit('change', opt.fps)"
        >
          {{ frameLimit === opt.fps ? '使用中' : '选择' }}
        </button>
      </div>
    </div>
    <p class="stg-keys__tip">
      游戏逻辑始终固定 60Hz，此设置只调整渲染帧率；选择即时生效并自动保存
    </p>
    <div class="stg-menu">
      <button class="stg-btn stg-btn--primary" @click="emit('close')">
        返回
      </button>
    </div>
  </div>
</template>
