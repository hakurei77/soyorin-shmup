/**
 * BGM 管理器
 * 用法：
 *   1. 把音频文件放进 src/assets/bgm/
 *   2. 在 bgm.json 中登记 { id, path, volume }
 *      - id:     程序调用时使用的唯一标识
 *      - path:   相对 bgm 目录的文件路径
 *      - volume: 音量补偿（0~1），用来拉平不同音乐的响度
 *   3. 代码中调用 playBgm('home') / stopBgm()
 */
import bgmManifest from '../assets/bgm/bgm.json'

interface BgmEntry {
  id: string
  path: string
  /** 音量补偿 0~1，防止某些音乐过高/过低 */
  volume: number
  /** 展示用曲名（可选，缺省时回退为 id） */
  title?: string
  /** 曲目 BPM（可选）：登记后游戏逻辑可通过 getBgmBeat 做节拍同步 */
  bpm?: number
}

/** Vite 构建期收集 bgm 目录（含子目录）下所有音频，返回最终 URL */
const bgmUrls = import.meta.glob('../assets/bgm/**/*.{mp3,ogg,wav,m4a}', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

const entries = bgmManifest as BgmEntry[]

/** 单例播放器：同一时间只播放一首 BGM */
let currentAudio: HTMLAudioElement | null = null
let currentId: string | null = null
/** 当前曲目的音量补偿（bgm.json 登记值），用户音量在此之上叠乘 */
let baseVolume = 1

const USER_VOLUME_KEY = 'stg-bgm-volume'

function clampVolume(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** 默认用户音乐音量：0.5（对应设置面板的 5），与曲目音量补偿叠乘 */
const DEFAULT_USER_VOLUME = 0.5

function loadUserVolume(): number {
  try {
    const raw = localStorage.getItem(USER_VOLUME_KEY)
    if (raw === null) return DEFAULT_USER_VOLUME
    const v = Number(raw)
    return Number.isFinite(v) ? clampVolume(v) : DEFAULT_USER_VOLUME
  } catch {
    return DEFAULT_USER_VOLUME
  }
}

/** 用户音乐音量（0~1），与曲目音量补偿叠乘，持久化到 localStorage */
let userVolume = loadUserVolume()

/** 设置用户音乐音量（0~1），即时作用于当前播放中的 BGM 并自动保存 */
export function setBgmVolume(v: number): void {
  userVolume = clampVolume(v)
  if (currentAudio) currentAudio.volume = baseVolume * userVolume
  try {
    localStorage.setItem(USER_VOLUME_KEY, String(userVolume))
  } catch {
    // 静默失败
  }
}

/** 当前用户音乐音量（0~1） */
export function getBgmVolume(): number {
  return userVolume
}

/** Web Audio 分析链路：audio -> source -> analyser -> destination */
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let sourceNode: MediaElementAudioSourceNode | null = null

/** 把当前音频接入 AnalyserNode，供可视化组件读取频谱 */
function attachAnalyser(audio: HTMLAudioElement): void {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext()
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.8
      analyser.connect(audioCtx.destination)
    }
    sourceNode?.disconnect()
    sourceNode = audioCtx.createMediaElementSource(audio)
    sourceNode.connect(analyser!)
    if (audioCtx.state === 'suspended') {
      // 自动播放策略下 Context 可能被挂起，首次交互后恢复
      audioCtx.resume().catch(() => {})
      const resume = () => {
        audioCtx?.resume().catch(() => {})
        window.removeEventListener('pointerdown', resume)
        window.removeEventListener('keydown', resume)
      }
      window.addEventListener('pointerdown', resume)
      window.addEventListener('keydown', resume)
    }
  } catch {
    // 分析链路建立失败不影响正常播放
  }
}

/** 获取当前 BGM 的频谱分析器（未播放时返回 null） */
export function getBgmAnalyser(): AnalyserNode | null {
  return currentAudio && analyser ? analyser : null
}

function resolveUrl(path: string): string | undefined {
  // glob 的 key 形如 ../assets/bgm/./home.mp3 或 ../assets/bgm/home.mp3
  const normalized = path.replace(/^\.\//, '')
  return (
    bgmUrls[`../assets/bgm/${normalized}`] ??
    bgmUrls[`../assets/bgm/./${normalized}`]
  )
}

/**
 * 播放指定 id 的 BGM（默认循环）
 * 注意：浏览器自动播放策略可能拦截首次播放，
 * 本函数会自动降级为「等待用户首次交互后再播」。
 */
export function playBgm(id: string, options?: { loop?: boolean }): void {
  if (currentId === id && currentAudio) return

  const entry = entries.find(e => e.id === id)
  if (!entry) {
    console.warn(`[bgm] 未在 bgm.json 中找到 id: ${id}`)
    return
  }

  const url = resolveUrl(entry.path)
  if (!url) {
    console.warn(`[bgm] 找不到音频文件: ${entry.path}`)
    return
  }

  stopBgm()

  const audio = new Audio(url)
  audio.loop = options?.loop ?? true
  baseVolume = clampVolume(entry.volume)
  audio.volume = baseVolume * userVolume
  // 时缓中切曲（如慢动作中 Boss 登场）：新曲目继承当前播放速率
  if (currentRate !== 1) {
    audio.preservesPitch = false
    audio.playbackRate = currentRate
  }
  currentAudio = audio
  currentId = id
  currentBpm = entry.bpm ?? 0
  lastBeatIndex = -1
  attachAnalyser(audio)

  audio.play().catch(() => {
    // 自动播放被拦截：监听首次用户交互后补播
    const resume = () => {
      audio.play().catch(() => {})
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
  })
}

/** 当前播放中的 BGM id（未播放返回 null） */
export function getCurrentBgmId(): string | null {
  return currentId
}

// ==================== 变速播放（突触超频时缓用） ====================

/** 当前播放速率（1 = 原速），跨切曲保持，由游戏逻辑每帧同步 */
let currentRate = 1

/**
 * 设置 BGM 播放速率。速率 < 1 时关闭音高保持（preservesPitch），
 * 获得降调慢放的经典慢动作听感；恢复 1 时重新开启。
 * 幂等（速率未变化时不触碰音频元素），可每帧调用。
 */
export function setBgmPlaybackRate(rate: number): void {
  const r = Math.min(4, Math.max(0.0625, rate))
  if (r === currentRate) return
  currentRate = r
  if (currentAudio) {
    currentAudio.preservesPitch = r >= 1
    currentAudio.playbackRate = r
  }
}

/** 当前 BGM 是否处于暂停状态（未播放时视为暂停） */
export function isBgmPaused(): boolean {
  return currentAudio ? currentAudio.paused : true
}

/** 暂停当前 BGM（保留进度，可用 resumeBgm 继续） */
export function pauseBgm(): void {
  currentAudio?.pause()
}

/** 继续播放当前 BGM */
export function resumeBgm(): void {
  currentAudio?.play().catch(() => {})
}

/** 获取已登记的曲目列表（供播放器 UI 展示与切歌） */
export function getBgmTracks(): { id: string; title: string }[] {
  return entries.map(e => ({ id: e.id, title: e.title ?? e.id }))
}

/** 停止当前 BGM 并释放资源 */
export function stopBgm(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
    currentId = null
  }
  sourceNode?.disconnect()
  sourceNode = null
  currentBpm = 0
  lastBeatIndex = -1
}

// ==================== 节拍时钟（弹幕对节奏用） ====================

/** 当前曲目的 BPM（bgm.json 登记值，未登记为 0） */
let currentBpm = 0
/** 上一帧所处的拍序号，用于检测"新拍开始"的边沿 */
let lastBeatIndex = -1

/** BGM 节拍信息（getBgmBeat 返回值） */
export interface BgmBeat {
  /** 曲目 BPM */
  bpm: number
  /** 绝对拍位置（浮点，随音乐持续前进；曲目循环回绕时跳变） */
  beatFloat: number
  /** 当前拍序号（beatFloat 取整） */
  beatIndex: number
  /** 自上次调用以来跨过了拍点边界（新拍开始的那一帧为 true） */
  newBeat: boolean
  /** 跨过了小节边界（4/4 拍，每 4 拍一个小节） */
  newBar: boolean
}

/**
 * 读取当前 BGM 的节拍信息（每帧调用一次）。
 * 返回 null = 当前无曲目、暂停中或曲目未登记 bpm（调用方按无节拍处理）。
 */
export function getBgmBeat(): BgmBeat | null {
  if (!currentAudio || currentAudio.paused || currentBpm <= 0) {
    lastBeatIndex = -1
    return null
  }
  const beatFloat = (currentAudio.currentTime * currentBpm) / 60
  const beatIndex = Math.floor(beatFloat)
  const newBeat = lastBeatIndex >= 0 && beatIndex !== lastBeatIndex
  const newBar = newBeat && beatIndex % 4 === 0
  lastBeatIndex = beatIndex
  return { bpm: currentBpm, beatFloat, beatIndex, newBeat, newBar }
}
