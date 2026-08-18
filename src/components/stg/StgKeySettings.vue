<script setup lang="ts">
/**
 * 键位设置面板
 * 职责：展示键位、捕获新按键；实际改键 / 重置由父组件调用引擎完成
 */
import { onBeforeUnmount, ref } from 'vue'
import type { KeyAction, KeyBindings } from '../../types'
import { keyLabel } from '../../utils/display'

defineProps<{
  bindings: KeyBindings
}>()

const emit = defineEmits<{
  rebind: [action: KeyAction, code: string]
  reset: []
  close: []
}>()

/** 当前等待按键的动作（null = 未在捕获） */
const capturing = ref<KeyAction | null>(null)

/** 可绑定动作列表（展示顺序） */
const keyActionList: { action: KeyAction; label: string }[] = [
  { action: 'up', label: '上移' },
  { action: 'down', label: '下移' },
  { action: 'left', label: '左移' },
  { action: 'right', label: '右移' },
  { action: 'slow', label: '低速 / 判定点' },
  { action: 'dash', label: '闪现' },
  { action: 'sprint', label: '冲刺' },
  { action: 'skill', label: '技能' },
  { action: 'pause', label: '暂停' }
]

/** 进入捕获状态：下一次按键将成为该动作的新键位（Esc 取消） */
function startCapture(action: KeyAction) {
  capturing.value = action
  window.addEventListener('keydown', onCaptureKey, { capture: true })
}

function stopCapture() {
  capturing.value = null
  window.removeEventListener('keydown', onCaptureKey, { capture: true })
}

/** 捕获按键：用 capture 阶段拦截并阻断，避免触发游戏内暂停 */
function onCaptureKey(e: KeyboardEvent) {
  e.preventDefault()
  e.stopImmediatePropagation()
  const action = capturing.value
  if (action && e.code !== 'Escape') {
    emit('rebind', action, e.code)
  }
  stopCapture()
}

onBeforeUnmount(stopCapture)
</script>

<template>
  <div class="stg-overlay stg-overlay--dim">
    <h2 class="stg-overlay__title stg-overlay__title--small">键位设置</h2>
    <div class="stg-keys">
      <div
        v-for="item in keyActionList"
        :key="item.action"
        class="stg-keys__row"
      >
        <span class="stg-keys__label">{{ item.label }}</span>
        <button
          class="stg-keys__key"
          :class="{ 'stg-keys__key--wait': capturing === item.action }"
          @click="startCapture(item.action)"
        >
          {{
            capturing === item.action
              ? '按任意键…'
              : keyLabel(bindings[item.action])
          }}
        </button>
      </div>
      <div class="stg-keys__row">
        <span class="stg-keys__label">射击</span>
        <span class="stg-keys__fixed">鼠标左键</span>
      </div>
    </div>
    <p class="stg-keys__tip">
      点击键位后按下新按键即可修改（Esc 取消），自动保存到本地
    </p>
    <div class="stg-menu">
      <button class="stg-btn" @click="emit('reset')">恢复默认</button>
      <button class="stg-btn stg-btn--primary" @click="emit('close')">
        返回
      </button>
    </div>
  </div>
</template>
