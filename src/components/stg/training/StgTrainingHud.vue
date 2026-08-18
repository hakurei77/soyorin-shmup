<script setup lang="ts">
/**
 * 训练室 HUD 容器
 * 统一收纳 DPS 统计器 + 训练台控制面板
 */
import type { HudState } from '../../../types'
import StgDpsMeter from './StgDpsMeter.vue'
import StgTrainingConsole from './StgTrainingConsole.vue'

defineProps<{
  hud: HudState
  game: any
}>()
</script>

<template>
  <!-- 训练室 DPS 统计器（Boss 出现时隐藏，避免与右上角 Boss 血条重叠） -->
  <StgDpsMeter v-if="hud.dps && hud.bosses.length === 0" :dps="hud.dps" />

  <!-- 训练台控制面板（仅在游戏中显示） -->
  <StgTrainingConsole v-if="hud.scene === 'playing'" :game="game" />
</template>
