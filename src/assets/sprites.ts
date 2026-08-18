/**
 * 素材管理器（SpriteManager）
 * 用法：把图片放入 public/ 目录，然后在下面的 SPRITE_PATHS 里填上路径，
 * 例如 player: '/player.png'（独立部署）或 player: '/stg/player.png'（集成到 main-site），
 * 游戏会自动加载并替换占位图形。
 *
 * 序列帧动画（soyorin-png 工具导出的 .json）：
 *   {
 *     "image": "player.png",        // 图片路径（相对 json 所在目录），换图只改这里
 *     "fps": 8, "frameWidth": 128, "frameHeight": 128,
 *     "animations": {               // 动作名 → 条带中的帧区间，调用方按名字取用
 *       "move":  { "start": 0, "length": 6, "fps": 8 },   // 每个动作可带独立帧率
 *       "right": { "start": 6, "length": 4, "fps": 8 }    // 左移由渲染层镜像生成，无需 left
 *     }
 *   }
 * 角色皮肤（loadout.ts 的 sprite）直接填 .json 路径即可，新增动作只需改 json。
 *
 * 内置素材目录（推荐）：把 soyorin-png 导出的 xxx.png / xxx.json 放进
 * src/assets/frame/，sprite 写 'frame:xxx'（如 'frame:player'）。
 * 这些文件在编译期经 import.meta.glob 打包进产物，
 * 独立运行（pnpm dev）与打包部署到 main-site（/stg/ 子路径）都能正常加载，
 * 不依赖 public/ 目录，也不会有路由 404 问题。
 * 未配置（空字符串）或加载失败时，渲染层回退到代码绘制的占位图形，
 * 因此可以在没有任何美术素材的情况下完整运行。
 */

/** 单个动作片段：在横向条带中的起始帧索引与帧数；fps 可选，缺省用顶层帧率 */
export interface AnimClip {
  start: number
  length: number
  /** 该动作独立帧率（不同动作可不同），未设置时回退 SpriteAnim.fps */
  fps?: number
}

/** 序列帧动画配置（归一化后） */
export interface SpriteAnim {
  /** 播放帧率 */
  fps: number
  /** 单帧宽度（像素） */
  frameWidth: number
  /** 单帧高度（像素） */
  frameHeight: number
  /** 动作名 → 片段 */
  animations: Record<string, AnimClip>
}

/** 校验并归一化动画配置（必须包含 animations），非法返回 null */
function normalizeAnim(cfg: unknown): SpriteAnim | null {
  if (!cfg || typeof cfg !== 'object') return null
  const c = cfg as Record<string, unknown>
  if (!c.fps || !c.frameWidth || !c.frameHeight) return null
  const base = {
    fps: c.fps as number,
    frameWidth: c.frameWidth as number,
    frameHeight: c.frameHeight as number
  }
  if (!c.animations || typeof c.animations !== 'object') return null
  const animations: Record<string, AnimClip> = {}
  for (const [name, clip] of Object.entries(c.animations as Record<string, unknown>)) {
    const cl = clip as Partial<AnimClip>
    if (cl && typeof cl.start === 'number' && typeof cl.length === 'number' && cl.start >= 0 && cl.length > 0) {
      animations[name] = { start: cl.start, length: cl.length }
      if (typeof cl.fps === 'number' && cl.fps > 0) animations[name].fps = cl.fps
    }
  }
  return Object.keys(animations).length ? { ...base, animations } : null
}

/** 可替换的素材 key */
export type SpriteKey = 'player' | 'enemy' | 'boss' | 'background'

/** key → 图片路径映射（路径相对于站点根，即 public/ 目录） */
const SPRITE_PATHS: Record<SpriteKey, string> = {
  player: '', // 例: '/stg/player.png'
  enemy: '', // 例: '/stg/enemy.png'
  boss: '', // 例: '/stg/boss.png'
  background: '' // 例: '/stg/background.png'
}

interface SpriteEntry {
  img: HTMLImageElement | null
  anim: SpriteAnim | null
}

/**
 * 编译期打包 src/assets/frame/ 下的序列帧素材：
 * json 配置直接打进 JS，png 由 Vite 输出为带指纹的资源文件（URL 自动带 base 前缀）
 */
const FRAME_CONFIGS = import.meta.glob('./frame/*.json', {
  eager: true,
  import: 'default'
}) as Record<string, unknown>
const FRAME_IMAGES = import.meta.glob('./frame/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

/** 解析 'frame:xxx' 素材：读 frame/xxx.json 配置，并按其 image 字段定位同目录图片 */
function resolveFrame(id: string): { imgPath: string; anim: SpriteAnim | null } | null {
  const cfg = FRAME_CONFIGS[`./frame/${id}.json`]
  if (!cfg) return null
  const image = (cfg as { image?: unknown }).image
  const imgPath = typeof image === 'string' ? FRAME_IMAGES[`./frame/${image}`] : undefined
  if (!imgPath) return null
  return { imgPath, anim: normalizeAnim(cfg) }
}

export class SpriteManager {
  /** 加载结果：key → 图片元素（失败/未配置为 null） */
  private images = new Map<SpriteKey, HTMLImageElement | null>()
  /** 动态素材（角色皮肤等运行时按 id 加载）：id → 图片与动画配置 */
  private dynamic = new Map<string, SpriteEntry>()

  /** 加载所有已配置的静态素材，全部 settle 后返回（不阻塞游戏启动） */
  async load(): Promise<void> {
    const entries = Object.entries(SPRITE_PATHS) as [SpriteKey, string][]
    await Promise.all(
      entries.map(async ([key, path]) => {
        this.images.set(key, path ? await this.loadImage(path) : null)
      })
    )
  }

  private async fetchJson(path: string): Promise<unknown | null> {
    try {
      const res = await fetch(path)
      return res.ok ? await res.json() : null
    } catch {
      return null
    }
  }

  private loadImage(path: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => resolve(null)
      el.src = path
    })
  }

  /**
   * 按自定义 id 加载素材，重复调用直接命中缓存。
   * path 可以是 'frame:xxx'（内置素材）、.json 配置
   * （图片路径取 json 的 image 字段，相对 json 所在目录解析）或静态图片
   */
  async loadSprite(id: string, path: string): Promise<void> {
    if (this.dynamic.has(id)) return
    const entry: SpriteEntry = { img: null, anim: null }
    this.dynamic.set(id, entry)
    // 内置素材：'frame:xxx' → src/assets/frame/xxx.json（编译期打包，dev / 构建均可用）
    if (path.startsWith('frame:')) {
      const r = resolveFrame(path.slice(6))
      if (!r) return
      entry.anim = r.anim
      entry.img = await this.loadImage(r.imgPath)
      return
    }
    let imgPath = path
    if (path.endsWith('.json')) {
      const cfg = (await this.fetchJson(path)) as { image?: unknown } | null
      entry.anim = normalizeAnim(cfg)
      if (cfg && typeof cfg.image === 'string' && cfg.image) {
        imgPath = path.slice(0, path.lastIndexOf('/') + 1) + cfg.image
      } else {
        return // 配置缺失或未写图片路径，素材视为不存在
      }
    }
    entry.img = await this.loadImage(imgPath)
  }

  /** 取素材，未加载/失败返回 null（调用方回退占位绘制） */
  get(key: SpriteKey): HTMLImageElement | null {
    return this.images.get(key) ?? null
  }

  /** 取动态素材图片，未加载/失败返回 null */
  getSprite(id: string): HTMLImageElement | null {
    return this.dynamic.get(id)?.img ?? null
  }

  /** 取动态素材的动画配置，无配置返回 null */
  getSpriteAnim(id: string): SpriteAnim | null {
    return this.dynamic.get(id)?.anim ?? null
  }
}
