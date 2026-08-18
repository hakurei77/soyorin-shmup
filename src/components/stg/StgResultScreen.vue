<script setup lang="ts">
/**
 * 结算界面（通关 / 游戏结束共用）
 */
import { computed } from 'vue'

const props = defineProps<{
  type: 'clear' | 'gameover'
}>()

const emit = defineEmits<{
  restart: []
  toTitle: []
}>()

const isClear = computed(() => props.type === 'clear')
</script>

<template>
  <div class="stg-overlay stg-overlay--dim">
    <h2
      class="stg-overlay__title stg-overlay__title--small"
      :class="isClear ? 'stg-clear' : 'stg-over'"
    >
      {{ isClear ? 'STAGE CLEAR' : 'GAME OVER' }}
    </h2>
    <div class="stg-menu">
      <button class="stg-btn stg-btn--primary" @click="emit('restart')">
        {{ isClear ? '再来一局' : '重新开始' }}
      </button>
      <button class="stg-btn" @click="emit('toTitle')">返回标题</button>
    </div>
  </div>
</template>
