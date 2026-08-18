/**
 * 音效（SFX）管理器
 * 基于 Web Audio：低延迟、支持快速连发叠加（HTMLAudioElement 在点射场景会卡顿）。
 * 用法：playSfx(url, volume?)，url 由 Vite 静态导入音频文件获得。
 * 首次播放若被浏览器自动播放策略拦截，会在用户首次交互后自动恢复 Context。
 *
 * 音量管理：通过 registerSfxVolume(url, volume, channel) 为每个音效文件注册
 * 默认音量与所属通道，无需在武器配置中逐个设置。未注册的音效默认 0.6、归入 ui 通道。
 * 最终音量 = 文件默认音量 × 通道音量（武器 / 交互两路，设置面板分别调节）。
 */

let ctx: AudioContext | null = null
/** 全局主音量 GainNode：所有 SFX 最终都经过它再到 destination，用户可在设置面板调节 */
let masterGain: GainNode | null = null

/** url -> 解码后的音频缓冲（解码失败缓存 null，避免重复请求） */
const buffers = new Map<string, AudioBuffer | null>()
/** url -> 进行中的解码 Promise，防止同一音效并发重复解码 */
const pending = new Map<string, Promise<AudioBuffer | null>>()

/** 音效通道：weapon 武器 / ui 交互（角色语音走 HTMLAudioElement，不在此体系） */
export type SfxChannel = 'weapon' | 'ui'

/** 音效文件级默认音量注册表（url -> 音量 0~1） */
const sfxVolumes = new Map<string, number>()
/** url -> 所属通道（注册时指定，未注册归入 ui） */
const sfxChannels = new Map<string, SfxChannel>()
/** 通道音量 0~1（默认 0.5，对应设置面板的 5），与文件级音量叠乘 */
const channelVolumes: Record<SfxChannel, number> = { weapon: 0.5, ui: 0.5 }

/**
 * 注册音效文件的默认音量与所属通道。
 * 应在应用启动时一次性调用，通常放在独立的音量配置文件中（如 sfxVolumes.ts）。
 * @param url     Vite 导入的音频资源 URL
 * @param volume  音量 0~1
 * @param channel 所属通道，默认 'ui'
 */
export function registerSfxVolume(
  url: string,
  volume: number,
  channel: SfxChannel = 'ui',
): void {
  sfxVolumes.set(url, Math.min(1, Math.max(0, volume)))
  sfxChannels.set(url, channel)
}

/**
 * 设置通道音量（用户设置面板调用），即时生效于后续播放；
 * 进行中的循环音效（如激光）不受影响，下次起播生效。
 */
export function setSfxChannelVolume(channel: SfxChannel, volume: number): void {
  channelVolumes[channel] = Math.min(1, Math.max(0, volume))
}

/** 获取音效所属通道的当前音量 */
function getChannelVolume(url: string): number {
  return channelVolumes[sfxChannels.get(url) ?? 'ui']
}

/** 获取音效的默认音量：优先查注册表，未注册则回退 0.6 */
function getDefaultVolume(url: string): number {
  return sfxVolumes.get(url) ?? 0.6
}

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    if (ctx.state === 'suspended') {
      const resume = () => {
        ctx?.resume().catch(() => {})
        window.removeEventListener('pointerdown', resume)
        window.removeEventListener('keydown', resume)
      }
      window.addEventListener('pointerdown', resume)
      window.addEventListener('keydown', resume)
    }
  }
  return ctx
}

/** 获取（懒创建）全局汇流节点：创建后始终连接 destination，所有 SFX 都经过它 */
function getMasterGain(): GainNode {
  if (!masterGain) {
    masterGain = getCtx().createGain()
    masterGain.gain.value = 1
    masterGain.connect(getCtx().destination)
  }
  return masterGain
}

async function load(url: string): Promise<AudioBuffer | null> {
  if (buffers.has(url)) return buffers.get(url)!
  let task = pending.get(url)
  if (!task) {
    task = fetch(url)
      .then(res => res.arrayBuffer())
      .then(data => getCtx().decodeAudioData(data))
      .then(buf => {
        buffers.set(url, buf)
        return buf
      })
      .catch(() => {
        buffers.set(url, null)
        return null
      })
      .finally(() => pending.delete(url))
    pending.set(url, task)
  }
  return task
}

function playBuffer(buf: AudioBuffer, volume: number): void {
  const audioCtx = getCtx()
  if (audioCtx.state === 'suspended') {
    // Context 尚未激活（典型场景：首次用户手势刚发生，resume 仍在异步进行）。
    // 等恢复完成后补播本次音效，避免直接丢弃（如 BootGate 首次点击的确认音）。
    void audioCtx
      .resume()
      .then(() => playBuffer(buf, volume))
      .catch(() => {})
    return
  }
  const src = audioCtx.createBufferSource()
  src.buffer = buf
  const gain = audioCtx.createGain()
  gain.gain.value = Math.min(1, Math.max(0, volume))
  src.connect(gain)
  gain.connect(getMasterGain())
  src.start()
}

/**
 * 播放一次音效（不阻塞；未解码完成时加载完后补播当次，保证首次开火不丢声）
 * @param url    Vite 导入的音频资源 URL
 * @param volume 音量 0~1；不传则使用 registerSfxVolume 注册的默认值（未注册回退 0.6）
 */
export function playSfx(url: string, volume?: number): void {
  const vol = (volume ?? getDefaultVolume(url)) * getChannelVolume(url)
  const buf = buffers.get(url)
  if (buf === undefined) {
    void load(url).then(b => {
      if (b) playBuffer(b, vol)
    })
    return
  }
  if (!buf) return
  playBuffer(buf, vol)
}

/** 预加载音效（可在进入关卡前调用，消除首次开火的静音） */
export function preloadSfx(url: string): void {
  void load(url)
}

/**
 * 播放一次音效并返回停止函数（幂等；解码未完成时调用也安全，会阻止补播）。
 * 用于需要中途打断的长音效（如档案室加载音被「点击跳过」打断）。
 * @param url    Vite 导入的音频资源 URL
 * @param volume 音量 0~1；不传则使用 registerSfxVolume 注册的默认值（未注册回退 0.6）
 */
export function playSfxStoppable(url: string, volume?: number): () => void {
  const vol = (volume ?? getDefaultVolume(url)) * getChannelVolume(url)
  let stopped = false
  let src: AudioBufferSourceNode | null = null
  const start = (buf: AudioBuffer) => {
    if (stopped) return
    const audioCtx = getCtx()
    if (audioCtx.state === 'suspended') {
      // 与 playBuffer 一致：resume 完成后补播，除非已被停止
      void audioCtx
        .resume()
        .then(() => start(buf))
        .catch(() => {})
      return
    }
    const s = audioCtx.createBufferSource()
    s.buffer = buf
    const gain = audioCtx.createGain()
    gain.gain.value = Math.min(1, Math.max(0, vol))
    s.connect(gain)
    gain.connect(getMasterGain())
    s.start()
    src = s
  }
  const buf = buffers.get(url)
  if (buf === undefined) {
    void load(url).then(b => {
      if (b) start(b)
    })
  } else if (buf) {
    start(buf)
  }
  return () => {
    stopped = true
    try {
      src?.stop()
    } catch {
      /* 已停止的 source 重复 stop 会抛错，忽略 */
    }
    src = null
  }
}

/**
 * 循环播放音效（激光等持续型武器用）
 * @param url      Vite 导入的音频资源 URL
 * @param volume   音量 0~1；不传则使用 registerSfxVolume 注册的默认值（未注册回退 0.6）
 * @param loopFrom 循环起点（秒）：整段先完整播一遍，之后只循环该位置到结尾；超过全长则整段循环
 * @param loopTo   循环终点（秒）：与 loopFrom 配合只循环 [loopFrom, loopTo] 区间，
 *                 用于裁掉素材尾部的淡出段避免回绕时出现静音断档；不合法则循环到结尾
 * @returns 停止函数（幂等；解码未完成时调用也安全，会阻止补播）
 */
export function startSfxLoop(url: string, volume?: number, loopFrom = 0, loopTo = 0): () => void {
  const vol = (volume ?? getDefaultVolume(url)) * getChannelVolume(url)
  let stopped = false
  let src: AudioBufferSourceNode | null = null
  const start = (buf: AudioBuffer) => {
    if (stopped) return
    const audioCtx = getCtx()
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
      return
    }
    const s = audioCtx.createBufferSource()
    s.buffer = buf
    s.loop = true
    if (loopFrom > 0 && loopFrom < buf.duration) s.loopStart = loopFrom
    if (loopTo > s.loopStart && loopTo <= buf.duration) s.loopEnd = loopTo
    const gain = audioCtx.createGain()
    gain.gain.value = Math.min(1, Math.max(0, vol))
    s.connect(gain)
    gain.connect(getMasterGain())
    s.start()
    src = s
  }
  const buf = buffers.get(url)
  if (buf === undefined) {
    void load(url).then(b => {
      if (b) start(b)
    })
  } else if (buf) {
    start(buf)
  }
  return () => {
    stopped = true
    try {
      src?.stop()
    } catch {
      /* 已停止的 source 重复 stop 会抛错，忽略 */
    }
    src = null
  }
}
