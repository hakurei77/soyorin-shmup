/**
 * 全局资源预载器
 * 编译期通过 import.meta.glob 收集 src/assets 下全部图片与音频的最终 URL，
 * 在进入游戏前并发拉取：
 *   - 图片用 Image 对象加载（浏览器完成解码，渲染时零延迟）
 *   - 音频用 fetch 拉取（暖 HTTP 缓存；SFX 的 decodeAudioData 与 BGM 的
 *     HTMLAudioElement 后续播放时会直接命中缓存，不再等待网络）
 * 单个资源失败不阻塞整体（渲染层与播放器本身均有失败回退）。
 * 模块级单例：重复调用复用同一次加载，不会重复请求。
 */

const IMAGE_URLS = import.meta.glob('../assets/**/*.{png,jpg,jpeg,webp,gif,svg}', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

const AUDIO_URLS = import.meta.glob('../assets/**/*.{mp3,ogg,wav,m4a}', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

export interface PreloadProgress {
  loaded: number
  total: number
}

let started: Promise<void> | null = null

/**
 * 预载全部游戏资源，onProgress 在每个资源完成时回调（无论成败）。
 * 全部 settle 后 resolve；重复调用直接复用进行中的任务。
 */
export function preloadAllAssets(
  onProgress?: (p: PreloadProgress) => void
): Promise<void> {
  if (started) {
    // 已在加载或已完成：完成时补一次满进度回调，保证后挂载的调用方拿到终态
    return started.then(() => {
      const total =
        Object.keys(IMAGE_URLS).length + Object.keys(AUDIO_URLS).length
      onProgress?.({ loaded: total, total })
    })
  }

  const images = Object.values(IMAGE_URLS)
  const audios = Object.values(AUDIO_URLS)
  const total = images.length + audios.length
  let loaded = 0
  const tick = () => {
    loaded++
    onProgress?.({ loaded, total })
  }

  const loadImage = (url: string): Promise<void> =>
    new Promise(resolve => {
      const el = new Image()
      el.onload = el.onerror = () => {
        tick()
        resolve()
      }
      el.src = url
    })

  const loadAudio = (url: string): Promise<void> =>
    fetch(url)
      .then(res => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null)
      .then(() => tick())

  started = Promise.all([...images.map(loadImage), ...audios.map(loadAudio)]).then(
    () => undefined
  )
  return started
}
