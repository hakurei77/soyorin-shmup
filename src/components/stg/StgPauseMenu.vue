<script setup lang="ts">
/**
 * 暂停菜单
 */
const emit = defineEmits<{
  resume: []
  restart: []
  openSettings: []
  toTitle: []
}>()
</script>

<template>
  <div class="stg-overlay stg-overlay--dim">
    <h2 class="stg-overlay__title stg-overlay__title--small">PAUSED</h2>
    <div class="stg-menu">
      <button class="stg-btn stg-btn--primary" @click="emit('resume')">
        继续
      </button>
      <button class="stg-btn" @click="emit('restart')">重新开始</button>
      <button class="stg-btn" @click="emit('openSettings')">键位设置</button>
      <button class="stg-btn" @click="emit('toTitle')">返回标题</button>
    </div>
  </div>
</template>
