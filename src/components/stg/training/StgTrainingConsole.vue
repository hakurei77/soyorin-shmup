<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ game: any }>()

const hpInput = ref('100')
const lastSpawned = ref('')
const godMode = ref(false)

function addDummy() {
  const n = parseInt(hpInput.value, 10)
  if (isNaN(n) || n < 1) {
    lastSpawned.value = '请输入正整数'
    return
  }
  props.game.spawnTrainingDummy(n)
  lastSpawned.value = `已添加 ${n} 血木桩`
  setTimeout(() => { lastSpawned.value = '' }, 2000)
}

function clearDummies() {
  props.game.clearTrainingDummies()
  lastSpawned.value = '已清空全部假人'
  setTimeout(() => { lastSpawned.value = '' }, 2000)
}

function startBoss(enemyKey: string, bossName: string) {
  props.game.startTrainingBoss(enemyKey)
  lastSpawned.value = `${bossName}挑战已开启`
  setTimeout(() => { lastSpawned.value = '' }, 2000)
}

function toggleGodMode() {
  godMode.value = !godMode.value
  props.game.setTrainingGodMode(godMode.value)
  lastSpawned.value = godMode.value ? '无限生命已开启' : '无限生命已关闭'
  setTimeout(() => { lastSpawned.value = '' }, 2000)
}
</script>

<template>
  <div class="training-console">
    <span class="console-label">训练台</span>
    <div class="console-row">
      <input
        v-model="hpInput"
        class="hp-input"
        type="number"
        min="1"
        placeholder="血量"
        @keyup.enter="addDummy"
      />
      <button class="add-btn" @click="addDummy">添加</button>
    </div>
    <button class="clear-btn" @click="clearDummies">清空全部</button>
    <button class="boss-btn boss-btn--prism" @click="startBoss('LAS-01', '棱镜星卫')">挑战棱镜星卫</button>
    <button class="boss-btn boss-btn--reaver" @click="startBoss('PRT-01', '掠星者·沃恩')">挑战掠星者·沃恩</button>
    <button class="boss-btn boss-btn--leviathan" @click="startBoss('FIN-01', '星渊巨构·绯红天幕')">警报：最终兵器</button>
    <button
      class="god-btn"
      :class="{ 'god-btn--on': godMode }"
      @click="toggleGodMode"
    >
      {{ godMode ? '无限生命：开' : '无限生命：关' }}
    </button>
    <span v-if="lastSpawned" class="feedback">{{ lastSpawned }}</span>
  </div>
</template>

<style scoped>
.training-console {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 100;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
  font-family: 'Courier New', monospace;
}

.console-label {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.console-row {
  display: flex;
  gap: 6px;
}

.hp-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  color: #e2e8f0;
  padding: 5px 8px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
  min-width: 0;
}

.hp-input:focus {
  border-color: #38bdf8;
}

.hp-input::-webkit-inner-spin-button,
.hp-input::-webkit-outer-spin-button {
  opacity: 1;
}

.add-btn {
  background: #0ea5e9;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.add-btn:hover {
  background: #0284c7;
}

.add-btn:active {
  background: #0369a1;
}

.clear-btn {
  background: rgba(239, 68, 68, 0.75);
  color: #fff;
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 4px;
  padding: 5px 0;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.clear-btn:hover {
  background: #dc2626;
}

.clear-btn:active {
  background: #b91c1c;
}

.boss-btn {
  color: #fff;
  border-radius: 4px;
  padding: 5px 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
}

.boss-btn--prism {
  background: linear-gradient(135deg, rgba(125, 232, 255, 0.85), rgba(59, 130, 246, 0.85));
  border: 1px solid rgba(125, 232, 255, 0.5);
}

.boss-btn--reaver {
  background: linear-gradient(135deg, rgba(179, 102, 255, 0.85), rgba(217, 70, 160, 0.85));
  border: 1px solid rgba(179, 102, 255, 0.5);
}

.boss-btn--leviathan {
  background: linear-gradient(135deg, rgba(255, 59, 78, 0.9), rgba(90, 14, 24, 0.9));
  border: 1px solid rgba(255, 100, 110, 0.6);
  animation: leviathan-pulse 1.6s ease-in-out infinite alternate;
}

.boss-btn--leviathan:hover {
  filter: brightness(1.25);
  box-shadow: 0 0 12px rgba(255, 59, 78, 0.5);
}

@keyframes leviathan-pulse {
  from {
    box-shadow: 0 0 2px rgba(255, 59, 78, 0.3);
  }
  to {
    box-shadow: 0 0 10px rgba(255, 59, 78, 0.65);
  }
}

.boss-btn:hover {
  filter: brightness(1.15);
}

.boss-btn:active {
  filter: brightness(0.9);
  transform: scale(0.98);
}

.god-btn {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 4px;
  padding: 5px 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.god-btn:hover {
  background: rgba(148, 163, 184, 0.3);
}

.god-btn--on {
  background: rgba(74, 222, 128, 0.25);
  color: #86efac;
  border-color: rgba(74, 222, 128, 0.6);
  box-shadow: 0 0 10px rgba(74, 222, 128, 0.35);
}

.god-btn--on:hover {
  background: rgba(74, 222, 128, 0.35);
}

.feedback {
  font-size: 11px;
  color: #86efac;
}
</style>
