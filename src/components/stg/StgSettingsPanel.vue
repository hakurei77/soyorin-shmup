<script setup lang="ts">
/**
 * 设置面板（画面 / 音频 / 按键 三页签）
 * 职责：汇总所有可调项；键位改绑与帧率上限上抛给父组件写入引擎，
 *       FPS / 失焦静音 / 音乐音量由本组件直接写入 uiSettings 与 bgm 单例
 * 布局：顶部页签条 + 全宽行式列表 + 底部操作区，参考终末地设置界面
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { BALANCE } from '../../config/balance'
import type { KeyAction, KeyBindings } from '../../types'
import { getBgmVolume, setBgmVolume } from '../../utils/bgm'
import { setSfxChannelVolume } from '../../utils/sfx'
import { keyLabel } from '../../utils/display'
import { uiSettings } from '../../utils/settings'
import audioIcon from '../../assets/icon/audio.svg?raw'
import characterIcon from '../../assets/icon/character.svg?raw'
import controlsIcon from '../../assets/icon/controls.svg?raw'
import displayIcon from '../../assets/icon/display.svg?raw'

type SettingsTab = 'display' | 'audio' | 'controls' | 'interface'

const props = withDefaults(
  defineProps<{
    bindings: KeyBindings
    /** 当前渲染帧率上限（0 = 不限制，跟随屏幕刷新率） */
    frameLimit: number
    /** 打开时默认选中的页签 */
    initialTab?: SettingsTab
  }>(),
  { initialTab: 'display' },
)

const emit = defineEmits<{
  /** 点击「保存配置」时一次性提交键位草稿 */
  save: [bindings: KeyBindings]
  changeFrameLimit: [fps: number]
  close: []
}>()

const activeTab = ref<SettingsTab>(props.initialTab)

const tabs: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'display', label: '画面', icon: displayIcon },
  { id: 'audio', label: '音频', icon: audioIcon },
  { id: 'controls', label: '按键', icon: controlsIcon },
  { id: 'interface', label: '界面', icon: characterIcon },
]

/* ---------- 画面：帧率上限下拉 ---------- */
const frameOptions = [
  { fps: 0, label: '跟随屏幕（无上限）' },
  { fps: 30, label: '30 FPS' },
  { fps: 60, label: '60 FPS' },
  { fps: 120, label: '120 FPS' },
  { fps: 144, label: '144 FPS' },
]

const fpsDropdownOpen = ref(false)

function currentFpsLabel(): string {
  return (
    frameOptions.find(o => o.fps === props.frameLimit)?.label ?? '跟随屏幕（无上限）'
  )
}

function pickFps(fps: number) {
  emit('changeFrameLimit', fps)
  fpsDropdownOpen.value = false
}

/* ---------- 音频：四路音量（面板 0~10 映射到内部 0~1，默认均为 5） ---------- */
/** 音乐音量：bgm 单例自行持久化 */
const bgmVolume = ref(Math.round(getBgmVolume() * 10))
/** 角色语音音量：持久化在 uiSettings，播放时读取 */
const voiceVolume = ref(Math.round(uiSettings.voiceVolume * 10))
/** 武器音效通道音量 */
const weaponVolume = ref(Math.round(uiSettings.weaponVolume * 10))
/** 交互音效（UI）通道音量 */
const uiVolume = ref(Math.round(uiSettings.uiVolume * 10))

function readSlider(e: Event): number {
  return Number((e.target as HTMLInputElement).value)
}

function onVolumeInput(e: Event) {
  const v = readSlider(e)
  bgmVolume.value = v
  setBgmVolume(v / 10)
}

function onVoiceVolumeInput(e: Event) {
  const v = readSlider(e)
  voiceVolume.value = v
  uiSettings.voiceVolume = v / 10
}

function onWeaponVolumeInput(e: Event) {
  const v = readSlider(e)
  weaponVolume.value = v
  uiSettings.weaponVolume = v / 10
  setSfxChannelVolume('weapon', v / 10)
}

function onUiVolumeInput(e: Event) {
  const v = readSlider(e)
  uiVolume.value = v
  uiSettings.uiVolume = v / 10
  setSfxChannelVolume('ui', v / 10)
}

/* ---------- 按键：草稿（保存配置前不写入引擎） ---------- */
/**
 * 改绑先落到本地草稿：点「保存配置」才提交给引擎持久化，
 * 直接关闭面板（X / Esc）则丢弃全部改动
 */
const draft = reactive<KeyBindings>({ ...props.bindings })

/** 写入草稿；新按键与其他动作冲突时，将被占用动作置为未设置（空串标红） */
function applyDraftRebind(action: KeyAction, code: string) {
  const conflict = (Object.keys(draft) as KeyAction[]).find(
    (a) => a !== action && draft[a] === code,
  )
  if (conflict) draft[conflict] = ''
  draft[action] = code
}

/** 恢复默认键位（同样只改草稿，保存后才生效） */
function resetDraft() {
  Object.assign(draft, BALANCE.defaultKeys)
}

function save() {
  emit('save', { ...draft })
}

/* ---------- 未保存改动：退出确认 ---------- */
/** 草稿与已保存键位是否不一致 */
const dirty = computed(() =>
  (Object.keys(draft) as KeyAction[]).some(
    (a) => draft[a] !== props.bindings[a],
  ),
)

/** 确认弹窗是否打开 */
const confirmOpen = ref(false)

/** X 按钮关闭：有未保存改动时先弹确认 */
function requestClose() {
  if (dirty.value) confirmOpen.value = true
  else emit('close')
}

/** 确认：保存并关闭（父组件收到 save 后会关闭面板） */
function confirmSave() {
  confirmOpen.value = false
  save()
}

/** 取消：放弃改动直接关闭 */
function confirmDiscard() {
  confirmOpen.value = false
  emit('close')
}

/**
 * Esc 拦截（capture 阶段，先于父组件的全局 Esc 关闭）：
 * 有未保存改动时弹确认框而不是直接退出；确认框打开时再按 Esc 仅关闭弹窗。
 * 改绑捕获中让位（捕获监听会自行阻断冒泡）
 */
function onEscInterceptor(e: KeyboardEvent) {
  if (e.code !== 'Escape' || capturing.value) return
  if (confirmOpen.value) {
    e.preventDefault()
    e.stopImmediatePropagation()
    confirmOpen.value = false
    return
  }
  if (dirty.value) {
    e.preventDefault()
    e.stopImmediatePropagation()
    confirmOpen.value = true
  }
}

/* ---------- 按键：改绑捕获 ---------- */
const capturing = ref<KeyAction | null>(null)

const keyActionList: { action: KeyAction; label: string }[] = [
  { action: 'up', label: '上移' },
  { action: 'down', label: '下移' },
  { action: 'left', label: '左移' },
  { action: 'right', label: '右移' },
  { action: 'fire', label: '射击' },
  { action: 'aim', label: '瞄准' },
  { action: 'slow', label: '低速 / 判定点' },
  { action: 'dash', label: '闪现' },
  { action: 'sprint', label: '冲刺' },
  { action: 'skill', label: '技能' },
  { action: 'pause', label: '暂停' },
]

/** 支持长按 / 切换触发方式的动作（键位左侧附带开关） */
const TRIGGER_MODE_ACTIONS: KeyAction[] = ['slow', 'sprint']

function getTriggerMode(action: KeyAction): 'hold' | 'toggle' {
  return action === 'sprint' ? uiSettings.sprintMode : uiSettings.slowMode
}

function setTriggerMode(action: KeyAction, mode: 'hold' | 'toggle') {
  if (action === 'sprint') uiSettings.sprintMode = mode
  else uiSettings.slowMode = mode
}

/** 可改绑的鼠标键：button → 内部 code（含左右键，射击 / 瞄准默认绑定，均可改绑） */
const CAPTURE_MOUSE_CODES: Record<number, string> = {
  0: 'Mouse0',
  1: 'Mouse1',
  2: 'Mouse2',
  3: 'Mouse3',
  4: 'Mouse4',
}

/** 进入捕获状态：按键盘键绑定键盘键，点击当前按钮绑定鼠标键，点击其他按钮切换，点击空白取消 */
function startCapture(action: KeyAction) {
  if (capturing.value === action) {
    stopCapture()
    return
  }
  capturing.value = action
  window.addEventListener('keydown', onCaptureKey, { capture: true })
  window.addEventListener('mousedown', onCaptureMouse, { capture: true })
}

function stopCapture() {
  capturing.value = null
  window.removeEventListener('keydown', onCaptureKey, { capture: true })
  window.removeEventListener('mousedown', onCaptureMouse, { capture: true })
}

/** 捕获按键：capture 阶段拦截并阻断，避免触发游戏内暂停 */
function onCaptureKey(e: KeyboardEvent) {
  e.preventDefault()
  e.stopImmediatePropagation()
  const action = capturing.value
  if (action) {
    applyDraftRebind(action, e.code)
  }
  stopCapture()
}

/** 捕获鼠标键：点击当前捕获中的按钮 = 绑定该鼠标键；点击其他按钮 = 切换；点击空白 = 取消 */
function onCaptureMouse(e: MouseEvent) {
  const code = CAPTURE_MOUSE_CODES[e.button]
  if (!code) return
  const action = capturing.value
  if (!action) return
  e.preventDefault()
  e.stopImmediatePropagation()
  const btn = (e.target as HTMLElement | null)?.closest('.set-key') as HTMLElement | null
  // 点击键位按钮外的区域：取消捕获
  if (!btn) {
    stopCapture()
    return
  }
  // 点击其他键位按钮：切换捕获目标
  if (btn.dataset.action && btn.dataset.action !== action) {
    stopCapture()
    startCapture(btn.dataset.action as KeyAction)
    return
  }
  // 点击当前捕获中的按钮：绑定该鼠标键
  applyDraftRebind(action, code)
  stopCapture()
}

/** 点击下拉外部时收起 */
function onPanelClick(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.set-dropdown')) {
    fpsDropdownOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onEscInterceptor, { capture: true })
})

onBeforeUnmount(() => {
  stopCapture()
  window.removeEventListener('keydown', onEscInterceptor, { capture: true })
})
</script>

<template>
  <div class="stg-overlay stg-overlay--dim settings" @click="onPanelClick" @contextmenu.prevent>
    <!-- 顶栏：标题 / 页签 / 关闭 -->
    <header class="settings__topbar">
      <p class="settings__title">//设置</p>

      <nav class="settings__tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="settings__tab"
          :class="{ 'settings__tab--active': activeTab === tab.id }"
          :title="tab.label"
          @click="activeTab = tab.id"
        >
          <span class="settings__tab-icon" v-html="tab.icon" />
          <span class="settings__tab-label">{{ tab.label }}</span>
        </button>
      </nav>

      <button class="settings__close" title="关闭" @click="requestClose">
        <span class="settings__close-x" />
      </button>
    </header>

    <!-- 内容区 -->
    <div class="settings__body">
      <!-- ==================== 画面 ==================== -->
      <template v-if="activeTab === 'display'">
        <p class="settings__section">性能与画面</p>

        <div class="set-group">
        <div class="set-row">
          <span class="set-row__label">帧率上限</span>
          <div class="set-dropdown" :class="{ 'set-dropdown--open': fpsDropdownOpen }">
            <button
              class="set-dropdown__value"
              @click.stop="fpsDropdownOpen = !fpsDropdownOpen"
            >
              {{ currentFpsLabel() }}
              <span class="set-dropdown__chevron" />
            </button>
            <div v-if="fpsDropdownOpen" class="set-dropdown__list">
              <button
                v-for="opt in frameOptions"
                :key="opt.fps"
                class="set-dropdown__option"
                :class="{ 'set-dropdown__option--active': frameLimit === opt.fps }"
                @click="pickFps(opt.fps)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </div>

        <div class="set-row">
          <span class="set-row__label">显示 FPS</span>
          <div class="set-seg">
            <button
              class="set-seg__btn"
              :class="{ 'set-seg__btn--active': uiSettings.showFps }"
              @click="uiSettings.showFps = true"
            >
              开
            </button>
            <button
              class="set-seg__btn"
              :class="{ 'set-seg__btn--active': !uiSettings.showFps }"
              @click="uiSettings.showFps = false"
            >
              关
            </button>
          </div>
        </div>
        </div>

        <p class="settings__note">
          游戏逻辑始终固定 60Hz，帧率上限只调整渲染帧率；所有改动即时生效并自动保存
        </p>
      </template>

      <!-- ==================== 音频 ==================== -->
      <template v-else-if="activeTab === 'audio'">
        <p class="settings__section">音频</p>

        <div class="set-group">
        <div class="set-row">
          <span class="set-row__label">音乐音量</span>
          <div class="set-slider">
            <span class="set-slider__icon" v-html="audioIcon" />
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              :value="bgmVolume"
              class="set-slider__input"
              @input="onVolumeInput"
            />
            <span class="set-slider__value">{{ bgmVolume }}</span>
          </div>
        </div>

        <div class="set-row">
          <span class="set-row__label">角色音量</span>
          <div class="set-slider">
            <span class="set-slider__icon" v-html="audioIcon" />
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              :value="voiceVolume"
              class="set-slider__input"
              @input="onVoiceVolumeInput"
            />
            <span class="set-slider__value">{{ voiceVolume }}</span>
          </div>
        </div>

        <div class="set-row">
          <span class="set-row__label">武器音效</span>
          <div class="set-slider">
            <span class="set-slider__icon" v-html="audioIcon" />
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              :value="weaponVolume"
              class="set-slider__input"
              @input="onWeaponVolumeInput"
            />
            <span class="set-slider__value">{{ weaponVolume }}</span>
          </div>
        </div>

        <div class="set-row">
          <span class="set-row__label">交互音效</span>
          <div class="set-slider">
            <span class="set-slider__icon" v-html="audioIcon" />
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              :value="uiVolume"
              class="set-slider__input"
              @input="onUiVolumeInput"
            />
            <span class="set-slider__value">{{ uiVolume }}</span>
          </div>
        </div>

        <div class="set-row">
          <span class="set-row__label">窗口失焦时静音</span>
          <div class="set-seg">
            <button
              class="set-seg__btn"
              :class="{ 'set-seg__btn--active': uiSettings.muteOnBlur }"
              @click="uiSettings.muteOnBlur = true"
            >
              开
            </button>
            <button
              class="set-seg__btn"
              :class="{ 'set-seg__btn--active': !uiSettings.muteOnBlur }"
              @click="uiSettings.muteOnBlur = false"
            >
              关
            </button>
          </div>
        </div>
        </div>

        <p class="settings__note">音量改动即时生效并自动保存</p>
      </template>

      <!-- ==================== 按键 ==================== -->
      <template v-else-if="activeTab === 'controls'">
        <p class="settings__section">通用</p>

        <div class="set-group">
        <div
          v-for="item in keyActionList"
          :key="item.action"
          class="set-row"
        >
          <span class="set-row__label">{{ item.label }}</span>
          <div class="set-row__controls">
            <!-- 低速 / 冲刺：键位左侧附带触发方式开关 -->
            <div
              v-if="TRIGGER_MODE_ACTIONS.includes(item.action)"
              class="set-seg set-seg--compact"
            >
              <button
                class="set-seg__btn"
                :class="{ 'set-seg__btn--active': getTriggerMode(item.action) === 'hold' }"
                @click="setTriggerMode(item.action, 'hold')"
              >
                长按
              </button>
              <button
                class="set-seg__btn"
                :class="{ 'set-seg__btn--active': getTriggerMode(item.action) === 'toggle' }"
                @click="setTriggerMode(item.action, 'toggle')"
              >
                切换
              </button>
            </div>
            <button
              class="set-key"
              :class="{
                'set-key--wait': capturing === item.action,
                'set-key--unset': !draft[item.action],
              }"
              :data-action="item.action"
              @click="startCapture(item.action)"
            >
              {{
                capturing === item.action
                  ? '按任意键…'
                  : draft[item.action]
                    ? keyLabel(draft[item.action])
                    : '未设置'
              }}
            </button>
          </div>
        </div>

        </div>

        <p class="settings__note">
          请点击选择希望更换的按键（再次点击按钮取消），支持 Esc 与鼠标左 / 右 / 中键及侧键；若新按键与其他动作冲突，该动作将被标红置为「未设置」，需重新指定；「切换」模式下按一次对应按键开启，再按一次关闭；改动暂存于面板，点击「保存配置」后生效，直接关闭则不保存
        </p>
      </template>

      <!-- ==================== 界面 ==================== -->
      <template v-else>
        <p class="settings__section">界面</p>

        <div class="set-group">
        <div class="set-row">
          <span class="set-row__label">显示看板娘</span>
          <div class="set-seg">
            <button
              class="set-seg__btn"
              :class="{ 'set-seg__btn--active': uiSettings.showMascot }"
              @click="uiSettings.showMascot = true"
            >
              开
            </button>
            <button
              class="set-seg__btn"
              :class="{ 'set-seg__btn--active': !uiSettings.showMascot }"
              @click="uiSettings.showMascot = false"
            >
              关
            </button>
          </div>
        </div>
        </div>

        <p class="settings__note">控制标题界面左侧的看板娘立绘，改动即时生效并自动保存</p>
      </template>
    </div>

    <!-- 底部操作区 -->
    <footer class="settings__footer">
      <button
        v-if="activeTab === 'controls'"
        class="settings__reset"
        @click="resetDraft"
      >
        恢复默认
      </button>
      <button class="settings__done" @click="save">保存配置</button>
    </footer>

    <!-- 未保存改动确认弹窗 -->
    <Transition name="stg-fade">
      <div v-if="confirmOpen" class="confirm-mask" @click.self="confirmOpen = false">
        <div class="confirm-box">
          <p class="confirm-box__title">是否保存当前配置？</p>
          <p class="confirm-box__desc">按键改动尚未保存，直接关闭将丢失</p>
          <div class="confirm-box__actions">
            <button
              class="confirm-box__btn confirm-box__btn--ghost"
              @click="confirmDiscard"
            >
              取消
            </button>
            <button
              class="confirm-box__btn confirm-box__btn--primary"
              @click="confirmSave"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/stg-vars.scss' as *;

$mono: ui-monospace, 'Cascadia Mono', Consolas, monospace;
/* 行背景偏亮的半透明白，与深色毛玻璃遮罩形成明暗反差（参考终末地设置界面） */
$row-bg: linear-gradient(90deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08));
$row-border: rgba(255, 255, 255, 0.16);

/* 遮罩覆盖：单独提高优先级，确保压过 stg-common 中 stg-overlay--dim 的背景 */
/* 注意：不能把它作为 BEM 嵌套的根选择器，否则 &__xxx 会编译错误 */
.stg-overlay.settings {
  /* 毛玻璃：轻暗色半透明底 + 强模糊 + 提饱和度，背景磨砂透出而非压黑 */
  background: linear-gradient(
    180deg,
    rgba(18, 18, 38, 0.38) 0%,
    rgba(12, 12, 30, 0.5) 100%
  );
  backdrop-filter: blur(28px) saturate(1.35) brightness(0.94);
  -webkit-backdrop-filter: blur(28px) saturate(1.35) brightness(0.94);
}

.settings {
  justify-content: flex-start;
  gap: 0;
  padding: 20px 28px 18px;

  /* ---------- 顶栏 ---------- */
  &__topbar {
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba($accent, 0.18);
  }

  &__title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 4px;
    color: #fff;
    text-shadow: 0 0 12px rgba($accent, 0.5);
  }

  &__tabs {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 12px;
  }

  &__tab {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 11px 24px;
    cursor: pointer;
    background: rgba(10, 10, 26, 0.58);
    border: 1px solid rgba($accent, 0.35);
    clip-path: polygon(
      0 0,
      calc(100% - 8px) 0,
      100% 8px,
      100% 100%,
      8px 100%,
      0 calc(100% - 8px)
    );
    color: rgba(255, 255, 255, 0.85);
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;

    &:hover {
      color: #fff;
      border-color: rgba($accent, 0.7);
    }

    &--active {
      background: linear-gradient(135deg, rgba($accent, 0.85), rgba($accent-purple, 0.75));
      border-color: transparent;
      color: #0a0a1a;
      box-shadow: 0 0 18px rgba($accent, 0.45);
    }
  }

  /* v-html 注入的 svg 不带 scoped 属性，需 :deep 控制尺寸 */
  &__tab-icon {
    width: 20px;
    height: 20px;

    :deep(svg) {
      display: block;
      width: 100%;
      height: 100%;
    }
  }

  &__tab-label {
    font-size: 14px;
    letter-spacing: 3px;
  }

  &__close {
    position: relative;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    cursor: pointer;
    background: rgba(10, 10, 26, 0.58);
    border: 1px solid rgba($accent, 0.35);
    border-radius: 50%;
    transition: background 0.2s ease, border-color 0.2s ease, transform 0.3s ease;

    &:hover {
      background: rgba($accent, 0.25);
      border-color: rgba($accent, 0.8);
      transform: rotate(90deg);
    }
  }

  /* 纯 CSS 绘制的 X */
  &__close-x {
    position: relative;
    width: 14px;
    height: 14px;

    &::before,
    &::after {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      width: 100%;
      height: 2px;
      margin-top: -1px;
      background: rgba(255, 255, 255, 0.85);
    }

    &::before {
      transform: rotate(45deg);
    }

    &::after {
      transform: rotate(-45deg);
    }
  }

  /* ---------- 内容区 ---------- */
  &__body {
    flex: 1;
    width: 100%;
    margin-top: 14px;
    padding-right: 6px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba($accent, 0.4);
    }
  }

  /* 分节标题：左侧强调竖条 */
  &__section {
    margin: 6px 0 4px;
    padding-left: 10px;
    border-left: 3px solid $accent;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 3px;
    color: $accent;
    text-shadow: 0 0 10px rgba($accent, 0.55);
  }

  &__note {
    margin: 8px 0 0;
    font-size: 11px;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.68);
  }

  /* ---------- 底部 ---------- */
  &__footer {
    width: 100%;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 12px;
  }

  &__reset,
  &__done {
    min-width: 160px;
    padding: 9px 24px;
    cursor: pointer;
    font-size: 13px;
    letter-spacing: 3px;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid $glass-border;
    border-radius: 999px;
    transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba($accent, 0.6);
      box-shadow: 0 0 16px rgba($accent, 0.25);
    }
  }

  &__done {
    background: linear-gradient(135deg, rgba($accent, 0.18), rgba($accent-purple, 0.18));
    border-color: rgba($accent, 0.5);

    &:hover {
      background: linear-gradient(135deg, rgba($accent, 0.3), rgba($accent-purple, 0.3));
    }
  }
}

/* ---------- 行组容器：每个页签的整组 set-row ---------- */
.set-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 18px;
  margin-top: 6px;
}

/* ---------- 行式选项：左标签右控件 ---------- */
.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  /* 统一行高：各控件（分段开关 / 下拉 / 滑条）内容高度不一，用 min-height 对齐 */
  min-height: 56px;
  box-sizing: border-box;
  padding: 10px 18px;
  background: $row-bg;
  border: 1px solid $row-border;
  clip-path: polygon(
    0 0,
    calc(100% - 10px) 0,
    100% 10px,
    100% 100%,
    10px 100%,
    0 calc(100% - 10px)
  );
  transition: border-color 0.2s ease;

  &:hover {
    border-color: rgba($accent, 0.45);
  }

  &__label {
    font-size: 13px;
    letter-spacing: 2px;
    color: #fff;
    text-shadow: 0 0 8px rgba(0, 0, 0, 0.6);
  }

  /* 行右侧控件组（触发方式开关 + 键位按钮并排） */
  &__controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* 下拉展开时：1) clip-path 会裁剪行外后代，必须移除，否则整个选项列表被裁掉；
     2) clip-path 同时使每行成为独立层叠上下文，需提升整行层级避免被后面的行盖住 */
  &:has(.set-dropdown--open) {
    position: relative;
    z-index: 20;
    clip-path: none;
  }
}

/* ---------- 分段开关（开 / 关、准星样式） ---------- */
.set-seg {
  display: flex;
  background: rgba(5, 5, 16, 0.7);
  border: 1px solid $row-border;
  border-radius: 999px;
  padding: 3px;
  gap: 3px;

  /* 紧凑变体：嵌入键位行内，与键位按钮高度对齐 */
  &--compact &__btn {
    min-width: 52px;
    padding: 4px 10px;
    font-size: 11px;
  }

  &__btn {
    min-width: 72px;
    padding: 5px 16px;
    cursor: pointer;
    border: none;
    border-radius: 999px;
    background: transparent;
    font-size: 12px;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.75);
    transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      color: #fff;
    }

    &--active {
      background: linear-gradient(135deg, $accent, $accent-purple);
      color: #0a0a1a;
      font-weight: 600;
      box-shadow: 0 0 12px rgba($accent, 0.5);
    }
  }
}

/* ---------- 下拉选择（帧率上限） ---------- */
.set-dropdown {
  position: relative;
  min-width: 220px;

  &__value {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 16px;
    cursor: pointer;
    background: rgba(5, 5, 16, 0.7);
    border: 1px solid $row-border;
    border-radius: 999px;
    font-size: 12px;
    letter-spacing: 1px;
    color: #fff;
    transition: border-color 0.2s ease;

    &:hover {
      border-color: rgba($accent, 0.6);
    }
  }

  &__chevron {
    width: 8px;
    height: 8px;
    border-right: 1.5px solid rgba($accent, 0.9);
    border-bottom: 1.5px solid rgba($accent, 0.9);
    transform: rotate(45deg) translateY(-2px);
    transition: transform 0.2s ease;
  }

  &--open &__chevron {
    transform: rotate(225deg) translateY(-2px);
  }

  &__list {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    width: 100%;
    z-index: 10;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: rgba(8, 8, 22, 0.96);
    border: 1px solid rgba($accent, 0.4);
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  }

  &__option {
    padding: 8px 14px;
    cursor: pointer;
    border: none;
    border-radius: 7px;
    background: transparent;
    font-size: 12px;
    letter-spacing: 1px;
    text-align: left;
    color: rgba(255, 255, 255, 0.9);
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      background: rgba($accent, 0.16);
      color: #fff;
    }

    &--active {
      color: $accent;
      background: rgba($accent, 0.12);
    }
  }
}

/* ---------- 音量滑条 ---------- */
.set-slider {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 320px;

  &__icon {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    color: rgba($accent, 0.9);

    :deep(svg) {
      display: block;
      width: 100%;
      height: 100%;
    }
  }

  &__input {
    flex: 1;
    height: 3px;
    appearance: none;
    -webkit-appearance: none;
    background: linear-gradient(
      90deg,
      rgba($accent, 0.9),
      rgba($accent-purple, 0.9)
    );
    border-radius: 999px;
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
      appearance: none;
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
      border: 2px solid $accent;
      box-shadow: 0 0 10px rgba($accent, 0.8);
    }

    &::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #fff;
      border: 2px solid $accent;
      box-shadow: 0 0 10px rgba($accent, 0.8);
    }
  }

  &__value {
    min-width: 3ch;
    font-family: $mono;
    font-size: 13px;
    text-align: right;
    color: #fff;
  }
}

/* ---------- 键位按钮 ---------- */
.set-key {
  min-width: 140px;
  padding: 7px 16px;
  cursor: pointer;
  background: rgba(5, 5, 16, 0.7);
  border: 1px solid rgba($accent, 0.4);
  border-radius: 8px;
  font-family: $mono;
  font-size: 12px;
  letter-spacing: 1px;
  text-align: center;
  color: $accent;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    background: rgba($accent, 0.16);
    border-color: rgba($accent, 0.75);
  }

  &--wait {
    color: #fff;
    border-color: rgba($accent-purple, 0.85);
    background: rgba($accent-purple, 0.18);
    box-shadow: 0 0 14px rgba($accent-purple, 0.4);
    animation: set-key-pulse 1s ease-in-out infinite;
  }

  /* 冲突后被置空的键位：红色警示，提示玩家重新指定 */
  &--unset {
    color: #ff5a6e;
    border-color: rgba(255, 90, 110, 0.75);
    background: rgba(255, 90, 110, 0.12);
    box-shadow: 0 0 12px rgba(255, 90, 110, 0.3);

    &:hover {
      background: rgba(255, 90, 110, 0.22);
      border-color: rgba(255, 90, 110, 0.95);
    }
  }

  &--fixed {
    cursor: default;
    border-color: transparent;
    color: rgba(255, 255, 255, 0.72);
  }
}

@keyframes set-key-pulse {
  0%,
  100% {
    box-shadow: 0 0 8px rgba($accent-purple, 0.25);
  }
  50% {
    box-shadow: 0 0 18px rgba($accent-purple, 0.55);
  }
}

/* ---------- 未保存确认弹窗 ---------- */
.confirm-mask {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  background: rgba(4, 4, 14, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.confirm-box {
  min-width: 340px;
  padding: 24px 28px 20px;
  background: rgba(10, 10, 26, 0.94);
  border: 1px solid rgba($accent, 0.45);
  clip-path: polygon(
    0 0,
    calc(100% - 14px) 0,
    100% 14px,
    100% 100%,
    14px 100%,
    0 calc(100% - 14px)
  );
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);

  &__title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 2px;
    color: #fff;
    text-shadow: 0 0 10px rgba($accent, 0.5);
  }

  &__desc {
    margin: 10px 0 18px;
    font-size: 12px;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.65);
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  &__btn {
    min-width: 110px;
    padding: 8px 20px;
    cursor: pointer;
    font-size: 12px;
    letter-spacing: 3px;
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid $glass-border;
    transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba($accent, 0.6);
    }

    &--primary {
      background: linear-gradient(135deg, rgba($accent, 0.25), rgba($accent-purple, 0.25));
      border-color: rgba($accent, 0.55);

      &:hover {
        background: linear-gradient(135deg, rgba($accent, 0.4), rgba($accent-purple, 0.4));
        box-shadow: 0 0 16px rgba($accent, 0.35);
      }
    }
  }
}

/* ---------- 窄屏回退 ---------- */
@media (max-width: 900px) {
  .settings {
    padding: 14px 14px 12px;

    &__tab-label {
      display: none;
    }
  }

  .set-slider {
    min-width: 200px;
  }
}
</style>
