/**
 * UI 偏好设置（FPS 显示 / 失焦静音 / 触发方式 / 看板娘）
 * 用法：任意组件 import { uiSettings } 后直接读写，改动自动持久化到 localStorage
 */
import { reactive, watch } from 'vue'

/** 低速 / 判定点触发方式：按住生效，或按一下切换 */
export type SlowMode = 'hold' | 'toggle'

export interface UiSettings {
  /** 是否在 HUD 显示 FPS */
  showFps: boolean
  /** 窗口失焦时是否自动静音 BGM */
  muteOnBlur: boolean
  /** 低速 / 判定点触发方式 */
  slowMode: SlowMode
  /** 冲刺触发方式 */
  sprintMode: SlowMode
  /** 标题界面是否显示看板娘立绘 */
  showMascot: boolean
  /** 角色语音音量 0~1（默认 0.5，对应设置面板的 5） */
  voiceVolume: number
  /** 武器音效通道音量 0~1 */
  weaponVolume: number
  /** 交互音效（UI）通道音量 0~1 */
  uiVolume: number
}

const STORAGE_KEY = 'stg-ui-settings'

const DEFAULTS: UiSettings = {
  showFps: true,
  muteOnBlur: false,
  slowMode: 'hold',
  sprintMode: 'hold',
  showMascot: true,
  voiceVolume: 0.5,
  weaponVolume: 0.5,
  uiVolume: 0.5,
}

/** 读取 0~1 音量字段：非法值回退默认 */
function pickVolume(v: unknown, fallback: number): number {
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback
}

function load(): UiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const saved = JSON.parse(raw) as Partial<UiSettings>
    return {
      showFps:
        typeof saved.showFps === 'boolean' ? saved.showFps : DEFAULTS.showFps,
      muteOnBlur:
        typeof saved.muteOnBlur === 'boolean'
          ? saved.muteOnBlur
          : DEFAULTS.muteOnBlur,
      slowMode:
        saved.slowMode === 'hold' || saved.slowMode === 'toggle'
          ? saved.slowMode
          : DEFAULTS.slowMode,
      sprintMode:
        saved.sprintMode === 'hold' || saved.sprintMode === 'toggle'
          ? saved.sprintMode
          : DEFAULTS.sprintMode,
      showMascot:
        typeof saved.showMascot === 'boolean'
          ? saved.showMascot
          : DEFAULTS.showMascot,
      voiceVolume: pickVolume(saved.voiceVolume, DEFAULTS.voiceVolume),
      weaponVolume: pickVolume(saved.weaponVolume, DEFAULTS.weaponVolume),
      uiVolume: pickVolume(saved.uiVolume, DEFAULTS.uiVolume),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export const uiSettings = reactive<UiSettings>(load())

watch(
  uiSettings,
  value => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      // 静默失败
    }
  },
  { deep: true },
)
