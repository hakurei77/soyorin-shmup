/**
 * 渲染层
 * - 动态逻辑分辨率：逻辑坐标系 = 画布 CSS 尺寸（铺满窗口），
 *   画布位图按 devicePixelRatio 放大保证清晰
 * - 子弹辉光使用预渲染贴图（初始化时一次性生成），避免运行时使用 shadowBlur
 * - 星空背景双图层视差滚动，任何场景下持续运动
 */
import { BALANCE } from '../config/balance'
import type { AnimClip, SpriteAnim, SpriteManager } from '../assets/sprites'
import type {
  ArcBeam,
  BgType,
  BossPart,
  BulletStyleKey,
  EmpPulse,
  EnemyLaser,
  EnemyLaserBit,
  LaserBeam
} from '../types'
import type { Boss } from './boss'
import type { Bullet, BulletPool, ParticlePool } from './bullet'
import type { Enemy } from './enemy'
import { field } from './field'
import type { Player } from './player'
import { chargePalette } from '../utils/chargeColors'

/** 按动作名取片段：缺失时回退 move，再回退配置中的第一个片段 */
function pickClip(anim: SpriteAnim, name: string): AnimClip | null {
  return (
    anim.animations[name] ??
    anim.animations['move'] ??
    Object.values(anim.animations)[0] ??
    null
  )
}

/** 游戏层每帧传给渲染层的只读快照 */
export interface RenderState {
  /** 是否处于对局中（决定是否绘制实体） */
  inGame: boolean
  player: Player
  enemies: readonly Enemy[]
  /** 场上所有 Boss（训练室可同时存在多个） */
  bosses: readonly Boss[]
  enemyBullets: BulletPool
  playerBullets: BulletPool
  particles: ParticlePool
  /** 激光束视觉残留（激光武器瞬时射线，见 game.ts fireLaser） */
  laserBeams?: LaserBeam[]
  /** 蓄力电弧视觉残留（LW-04 松手放出的贯穿电弧，见 game.ts fireArc） */
  arcBeams?: ArcBeam[]
  /** 电磁脉冲冲击波（EMP 技能释放的全屏扩散脉冲，见 game.ts castEmp） */
  empPulses?: EmpPulse[]
  /** 敌激光（Boss 光束武器：预警 / 照射 / 熄灭三阶段，见 game.ts updateEnemyLasers） */
  enemyLasers?: EnemyLaser[]
  /** 浮游炮（Boss 激光子机：环绕 / 两翼 / 顶部悬停，见 game.ts updateEnemyBits） */
  enemyBits?: EnemyLaserBit[]
  shake: number
  /** 突触超频激活中，渲染时间减速滤镜 */
  sandevistan?: boolean
  /** 双子星卫（Castor & Pollux）卫星轨道角（弧度，null/undefined = 未激活），见 game.ts updateGeminiOrbs */
  twinGuard?: number | null
  /**
   * 渲染插值系数（0~1）：逻辑固定 60 步/秒，渲染帧率更高时
   * 在上一步与当前步位置之间插值，高刷屏下画面更顺滑；
   * 1 表示不做插值（直接用当前步位置）
   */
  alpha: number
  /** 关卡专属背景渐变 [上, 中, 下]，不配则用默认深空背景 */
  bgGradient?: [string, string, string]
  /** 背景主题：space（深空星空）| lab（实验室/训练室），默认 space */
  bgType?: BgType
  /** 义体自动索敌当前锁定点（逻辑坐标，null = 未锁定），用于绘制锁定框 */
  autoAimTarget?: { x: number; y: number } | null
}

interface BulletVisual {
  /** 发光主色 */
  glow: string
  /** 形状：orb 圆形 / needle 长针 / rice 米弹 / star 星形 / missile 追踪导弹 */
  shape: 'orb' | 'needle' | 'rice' | 'star' | 'missile'
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** 角度插值（走最短弧，避免 ±PI 处绕远） */
const lerpAngle = (a: number, b: number, t: number) => {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

const BULLET_VISUALS: Record<BulletStyleKey, BulletVisual> = {
  'orb-red': { glow: '#ff5566', shape: 'orb' },
  'orb-blue': { glow: '#55aaff', shape: 'orb' },
  'orb-purple': { glow: '#cc66ff', shape: 'orb' },
  'orb-green': { glow: '#66ff99', shape: 'orb' },
  'orb-orange': { glow: '#ff9a2e', shape: 'orb' },
  'needle-red': { glow: '#ff3344', shape: 'needle' },
  'needle-cyan': { glow: '#33ddff', shape: 'needle' },
  'needle-gold': { glow: '#ffc233', shape: 'needle' },
  'rice-yellow': { glow: '#ffcc33', shape: 'rice' },
  'star-pink': { glow: '#ff66cc', shape: 'star' },
  'missile-cyan': { glow: '#55ccff', shape: 'missile' },
  'orb-huge': { glow: '#ff3b4e', shape: 'orb' },
  'orb-square': { glow: '#ffcc44', shape: 'orb' },
  'capsule-purple': { glow: '#bb66ff', shape: 'rice' }
}

/** WebGL 弹丸着色层的每样式参数（颜色 / 长宽比 / 尺寸倍率 / 白热度 / 形状 0圆 1方 2胶囊） */
const BULLET_GL_VISUALS: Record<
  BulletStyleKey,
  { r: number; g: number; b: number; aspect: number; sizeMul: number; hot: number; shape: number }
> = {
  'orb-red': { r: 1.0, g: 0.33, b: 0.4, aspect: 1, sizeMul: 5.2, hot: 0.85, shape: 0 },
  'orb-blue': { r: 0.33, g: 0.67, b: 1.0, aspect: 1, sizeMul: 5.2, hot: 0.85, shape: 0 },
  'orb-purple': { r: 0.8, g: 0.4, b: 1.0, aspect: 1, sizeMul: 5.2, hot: 0.85, shape: 0 },
  'orb-green': { r: 0.4, g: 1.0, b: 0.6, aspect: 1, sizeMul: 5.2, hot: 0.85, shape: 0 },
  'orb-orange': { r: 1.0, g: 0.6, b: 0.18, aspect: 1, sizeMul: 5.2, hot: 0.85, shape: 0 },
  'needle-red': { r: 1.0, g: 0.2, b: 0.27, aspect: 0.37, sizeMul: 6.0, hot: 1.0, shape: 0 },
  'needle-cyan': { r: 0.2, g: 0.87, b: 1.0, aspect: 0.37, sizeMul: 6.0, hot: 1.0, shape: 0 },
  'needle-gold': { r: 1.0, g: 0.76, b: 0.2, aspect: 0.37, sizeMul: 6.0, hot: 1.0, shape: 0 },
  'rice-yellow': { r: 1.0, g: 0.8, b: 0.2, aspect: 0.45, sizeMul: 4.0, hot: 0.9, shape: 0 },
  'star-pink': { r: 1.0, g: 0.4, b: 0.8, aspect: 1, sizeMul: 5.0, hot: 1.0, shape: 0 },
  'missile-cyan': { r: 0.35, g: 0.8, b: 1.0, aspect: 1, sizeMul: 5.2, hot: 0.9, shape: 0 },
  'orb-huge': { r: 1.0, g: 0.22, b: 0.32, aspect: 1, sizeMul: 4.2, hot: 0.9, shape: 0 },
  'orb-square': { r: 1.0, g: 0.8, b: 0.25, aspect: 1, sizeMul: 4.6, hot: 0.95, shape: 1 },
  'capsule-purple': { r: 0.75, g: 0.4, b: 1.0, aspect: 0.3, sizeMul: 6.5, hot: 1.0, shape: 2 }
}

// ==================== WebGL 弹丸着色层 ====================
// 弹丸不再用几何图形拼贴：点精灵走径向辉光着色器（orb / 针弹 / 米弹），
// 追踪导弹走三角面着色器（程序化噪声尾焰 + 渐变拖尾 + 弹体白炽鼻锥），
// 全部以加法混合渲染进半分辨率离屏层，再一次性合成进主画布。
// WebGL 不可用时回退到旧版 2D 贴图绘制。

const BULLET_GL_POINT_VS = `
attribute vec2 aPos;
attribute float aSize;
attribute float aAspect;
attribute vec2 aDir;
attribute vec3 aColor;
attribute float aHot;
attribute float aShape;
uniform vec2 uView;
uniform float uPx;
varying vec2 vUv;
varying vec3 vColor;
varying float vHot;
varying vec2 vDir;
varying float vAspect;
varying float vShape;
void main() {
  gl_Position = vec4(aPos.x / uView.x * 2.0 - 1.0, 1.0 - aPos.y / uView.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(1.0, aSize * uPx);
  vUv = gl_PointCoord;
  vColor = aColor;
  vHot = aHot;
  vDir = aDir;
  vAspect = aAspect;
  vShape = aShape;
}
`

const BULLET_GL_POINT_FS = `
precision mediump float;
varying vec2 vUv;
varying vec3 vColor;
varying float vHot;
varying vec2 vDir;
varying float vAspect;
varying float vShape;
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  // 沿飞行方向拉伸（针弹/米弹/胶囊），圆形弹 aspect=1
  vec2 q = vec2(dot(d, vDir), dot(d, vec2(-vDir.y, vDir.x))) / vec2(1.0, max(vAspect, 0.05));
  float halo;
  float core;
  if (vShape > 1.5) {
    // 胶囊：恒定宽度 + 圆头两端
    float dC = length(vec2(max(abs(q.x) - 0.45, 0.0), q.y));
    halo = exp(-dC * dC * 40.0);
    core = exp(-dC * dC * 220.0);
  } else if (vShape > 0.5) {
    // 正方形：圆角方片
    vec2 bq = abs(q) - vec2(0.5);
    float dBox = length(max(bq, 0.0)) + min(max(bq.x, bq.y), 0.0);
    halo = exp(-dBox * dBox * 60.0);
    core = exp(-dBox * dBox * 300.0);
  } else {
    // 圆形：径向辉光 + 外缘细环
    float r = length(q);
    halo = exp(-r * r * 5.0) + exp(-pow((r - 0.74), 2.0) * 70.0) * 0.55;
    core = exp(-r * r * 45.0);
  }
  vec3 col = vColor * (halo * 1.15) + vec3(core * 1.75 * vHot);
  gl_FragColor = vec4(col, halo);
}
`

const BULLET_GL_TRI_VS = `
attribute vec2 aPos;
attribute vec2 aUv;
attribute vec3 aColor;
uniform vec2 uView;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  gl_Position = vec4(aPos.x / uView.x * 2.0 - 1.0, 1.0 - aPos.y / uView.y * 2.0, 0.0, 1.0);
  vUv = aUv;
  vColor = aColor;
}
`

const BULLET_GL_TRI_FS = `
precision mediump float;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  // 弹体：青蓝等离子胶囊 + 辉光包边 + 白炽鼻锥（无尾焰、无拖尾）
  float u = vUv.x;
  float v = vUv.y;
  float bv = abs(v) * 2.0;
  float body = smoothstep(1.0, 0.9, bv) * (0.5 + 0.5 * smoothstep(0.0, 0.18, u));
  float nose = smoothstep(0.2, 0.0, length(vec2(u - 1.0, v)));
  float glow = exp(-pow(bv, 2.0) * 7.0) * 0.9;
  vec3 col = mix(vColor * 0.55, vec3(1.0), clamp(nose * 1.3 + u * 0.4, 0.0, 1.0));
  gl_FragColor = vec4(col * (body + glow), body + glow);
}
`

/** WebGL 弹丸层（半分辨率离屏 + 加法混合，合成方式与敌激光层一致） */
interface BulletGlLayer {
  canvas: HTMLCanvasElement
  gl: WebGLRenderingContext
  progPoint: WebGLProgram
  progTri: WebGLProgram
  bufPoint: WebGLBuffer
  bufTri: WebGLBuffer
  /** 逻辑像素 → 图层 GL 像素的换算系数 */
  pxPerUnit: number
}

interface Star {
  x: number
  y: number
  speed: number
  size: number
  alpha: number
}

/** 暗角贴图的设计尺寸（绘制时拉伸到实际战场，渐变拉伸无失真感） */
const VW = BALANCE.logicWidth
const VH = BALANCE.logicHeight

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private scale = 1
  /** 每种子弹样式的预渲染辉光贴图 */
  private bulletSprites = new Map<BulletStyleKey, HTMLCanvasElement>()
  /** 每种光束色的预渲染光束截面贴图（拉伸绘制，替代逐帧多层宽描边） */
  private laserBeamSprites = new Map<string, HTMLCanvasElement>()
  /** 每种光束色的预渲染径向光球贴图（炮口聚能点 / 浮游炮辉光） */
  private laserBallSprites = new Map<string, HTMLCanvasElement>()
  /**
   * 敌激光低分辨率离屏层（半分辨率）：
   * 浮游炮集群齐射时同屏 35+ 条全屏光束，在主画布逐条叠加绘制的填充开销极大；
   * 改为在半分辨率层绘制后整体放大合成，填充量降为约 1/4——
   * 辉光类内容对分辨率不敏感，观感几乎无损
   */
  private laserLayer: HTMLCanvasElement | null = null
  private laserLayerCtx: CanvasRenderingContext2D | null = null
  /** 离屏层相对主位图的分辨率比 */
  private static readonly LASER_LAYER_SCALE = 0.5
  /** WebGL 弹丸着色层（null = 不支持时回退 2D 贴图绘制） */
  private bulletGl: BulletGlLayer | null = null
  /** 暗角贴图（预渲染一次） */
  private vignette: HTMLCanvasElement
  private starsFar: Star[] = []
  private starsNear: Star[] = []
  /** 渲染帧计数（背景滚动等动画的自变量，暂停时背景依然滚动） */
  private tick = 0
  /** 义体自动索敌锁定框动画进度 0~1（复刻主菜单 AI 检测框的锁定收缩动画） */
  private aimLock = 0
  /** 上一个锁定点（逻辑坐标），用于检测目标切换以重新播放锁定收缩动画 */
  private aimTargetPrev: { x: number; y: number } | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private sprites: SpriteManager
  ) {
    this.ctx = canvas.getContext('2d')!
    this.vignette = this.createVignette()
    this.prerenderBullets()
    this.bulletGl = this.initBulletGl()
    this.resize()
  }

  /** 初始化 WebGL 弹丸着色层：两个程序（点精灵 / 三角面）+ 动态缓冲；失败返回 null 回退 2D */
  private initBulletGl(): BulletGlLayer | null {
    try {
      const canvas = document.createElement('canvas')
      const attrs: WebGLContextAttributes = {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false
      }
      const gl = (canvas.getContext('webgl', attrs) ??
        canvas.getContext('experimental-webgl', attrs)) as WebGLRenderingContext | null
      if (!gl) return null
      const shader = (type: number, src: string): WebGLShader | null => {
        const s = gl.createShader(type)
        if (!s) return null
        gl.shaderSource(s, src)
        gl.compileShader(s)
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null
        return s
      }
      const program = (vsSrc: string, fsSrc: string): WebGLProgram | null => {
        const vs = shader(gl.VERTEX_SHADER, vsSrc)
        const fs = shader(gl.FRAGMENT_SHADER, fsSrc)
        if (!vs || !fs) return null
        const p = gl.createProgram()
        if (!p) return null
        gl.attachShader(p, vs)
        gl.attachShader(p, fs)
        gl.linkProgram(p)
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null
        return p
      }
      const progPoint = program(BULLET_GL_POINT_VS, BULLET_GL_POINT_FS)
      const progTri = program(BULLET_GL_TRI_VS, BULLET_GL_TRI_FS)
      if (!progPoint || !progTri) return null
      const bufPoint = gl.createBuffer()
      const bufTri = gl.createBuffer()
      if (!bufPoint || !bufTri) return null
      return { canvas, gl, progPoint, progTri, bufPoint, bufTri, pxPerUnit: 0 }
    } catch {
      return null
    }
  }

  /**
   * 根据画布物理像素调整位图尺寸，同时更新战场逻辑尺寸（field）并重建星空
   *
   * 逻辑坐标系 = 物理像素（CSS 尺寸 × 完整 devicePixelRatio），
   * 而非 CSS 像素：浏览器 Page Zoom 只会改变 CSS 像素与 dpr 的比例，
   * 物理像素总量不变，因此游戏画面大小不受页面缩放影响。
   * 位图分辨率仍封顶 dpr=2 以控制渲染开销。
   */
  resize() {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    field.set(Math.round(rect.width * dpr), Math.round(rect.height * dpr))
    const bitmapDpr = Math.min(dpr, 2)
    this.canvas.width = Math.round(rect.width * bitmapDpr)
    this.canvas.height = Math.round(rect.height * bitmapDpr)
    this.scale = this.canvas.width / field.width
    // 重建敌激光离屏层（半分辨率，见 laserLayer 字段注释）
    if (!this.laserLayer) {
      this.laserLayer = document.createElement('canvas')
      this.laserLayerCtx = this.laserLayer.getContext('2d')
    }
    this.laserLayer.width = Math.max(1, Math.round(this.canvas.width * Renderer.LASER_LAYER_SCALE))
    this.laserLayer.height = Math.max(1, Math.round(this.canvas.height * Renderer.LASER_LAYER_SCALE))
    // WebGL 弹丸层：与激光层同分辨率（半分辨率）
    if (this.bulletGl) {
      this.bulletGl.canvas.width = Math.max(1, Math.round(this.canvas.width * Renderer.LASER_LAYER_SCALE))
      this.bulletGl.canvas.height = Math.max(1, Math.round(this.canvas.height * Renderer.LASER_LAYER_SCALE))
      this.bulletGl.pxPerUnit = this.bulletGl.canvas.width / field.width
    }
    this.initStars()
  }

  /** 预渲染子弹辉光贴图：白色核心 → 彩色辉光 → 透明的径向渐变 */
  private prerenderBullets() {
    const size = 64
    for (const key of Object.keys(BULLET_VISUALS) as BulletStyleKey[]) {
      const { glow } = BULLET_VISUALS[key]
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const g = c.getContext('2d')!
      const grad = g.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2
      )
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(0.25, glow)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, size, size)
      this.bulletSprites.set(key, c)
    }
  }

  /** 光束截面贴图：白芯彩色渐变条（按颜色缓存，绘制时横向拉伸成整条光束） */
  private getLaserBeamSprite(color: string): HTMLCanvasElement {
    let c = this.laserBeamSprites.get(color)
    if (!c) {
      c = document.createElement('canvas')
      c.width = 64
      c.height = 64
      const g = c.getContext('2d')!
      const [r, gg, b] = this.parseColor(color)
      const grad = g.createLinearGradient(0, 0, 0, 64)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(0.36, `rgba(${r},${gg},${b},0.3)`)
      grad.addColorStop(0.5, 'rgba(255,255,255,0.95)')
      grad.addColorStop(0.64, `rgba(${r},${gg},${b},0.3)`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, 64, 64)
      this.laserBeamSprites.set(color, c)
    }
    return c
  }

  /** 光球贴图：白心彩边径向渐变（按颜色缓存，炮口聚能点 / 浮游炮辉光共用） */
  private getLaserBallSprite(color: string): HTMLCanvasElement {
    let c = this.laserBallSprites.get(color)
    if (!c) {
      c = document.createElement('canvas')
      c.width = 64
      c.height = 64
      const g = c.getContext('2d')!
      const [r, gg, b] = this.parseColor(color)
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      grad.addColorStop(0, 'rgba(255,255,255,0.95)')
      grad.addColorStop(0.35, `rgba(${r},${gg},${b},0.55)`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, 64, 64)
      this.laserBallSprites.set(color, c)
    }
    return c
  }

  private createVignette(): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = VW
    c.height = VH
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(
      VW / 2,
      VH / 2,
      VH * 0.35,
      VW / 2,
      VH / 2,
      VH * 0.75
    )
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,10,0.45)')
    g.fillStyle = grad
    g.fillRect(0, 0, VW, VH)
    return c
  }

  private initStars() {
    const make = (n: number, speed: number, size: number, alpha: number) => {
      const arr: Star[] = []
      for (let i = 0; i < n; i++) {
        arr.push({
          x: Math.random() * field.width,
          y: Math.random() * field.height,
          speed: speed * (0.6 + Math.random() * 0.8),
          size: size * (0.6 + Math.random() * 0.8),
          alpha: alpha * (0.5 + Math.random() * 0.5)
        })
      }
      return arr
    }
    this.starsFar = make(60, 0.4, 1.2, 0.5)
    this.starsNear = make(40, 1.2, 2, 0.9)
  }

  render(s: RenderState) {
    this.tick++
    const ctx = this.ctx
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)

    this.drawBackground(s)

    ctx.save()
    if (s.shake > 0.5) {
      ctx.translate(
        (Math.random() - 0.5) * s.shake,
        (Math.random() - 0.5) * s.shake
      )
    }

    if (s.inGame) {
      const a = s.alpha
      // 自机插值坐标（激光起点与其共用，保证光束贴住机首）
      const p = s.player
      const px = lerp(p.px, p.x, a)
      const py = lerp(p.py, p.y, a)
      const pa = lerpAngle(p.pAngle, p.angle, a)
      // 自机弹：GL 着色层可用时并入加法合成（见下方），否则 2D 贴图
      if (!this.bulletGl) this.drawBulletPool(s.playerBullets, a)
      for (const e of s.enemies) this.drawEnemy(e, a)
      for (const boss of s.bosses) this.drawBoss(boss, a)
      // 义体自动索敌锁定框：装备后持续锁定最近的敌人，并绘制 AI 检测框特效
      if (s.autoAimTarget) {
        const t = s.autoAimTarget
        const prev = this.aimTargetPrev
        // 锁定目标切换（锁定点突变）时重新播放「从大到小」的收缩动画
        if (!prev || Math.hypot(t.x - prev.x, t.y - prev.y) > 30) {
          this.aimLock = 0
        }
        this.aimTargetPrev = { x: t.x, y: t.y }
        this.aimLock = Math.min(1, this.aimLock + 0.06)
        this.drawAutoAimTarget(t.x, t.y, this.aimLock)
      } else {
        this.aimTargetPrev = null
        this.aimLock = Math.max(0, this.aimLock - 0.12)
      }
      // 冲刺尾翼、激光光束、蓄力电弧与蓄力圈使用叠加混合，绘制在角色下层
      ctx.globalCompositeOperation = 'lighter'
      if (p.sprintTrail.length >= 2) this.drawSprintTrail(p, a)
      if (s.laserBeams && s.laserBeams.length > 0) this.drawLaserBeams(s.laserBeams)
      if (s.arcBeams && s.arcBeams.length > 0) this.drawArcBeams(s.arcBeams)
      if (p.chargeRatio > 0) this.drawChargeRing(p, px, py, pa)
      ctx.globalCompositeOperation = 'source-over'
      this.drawPlayer(p, px, py, pa)
      // 敌弹与粒子使用叠加混合，营造霓虹辉光
      ctx.globalCompositeOperation = 'lighter'
      // 双子星卫：金色防御卫星绘制在自机之上（角度按插值系数顺推，高刷下更顺滑）
      if (s.twinGuard != null)
        this.drawTwinGuard(px, py, s.twinGuard + a * BALANCE.gemini.angularSpeed * (Math.PI / 180))
      // 敌弹 + 自机弹：WebGL 着色层加法合成（不可用时回退 2D 贴图）
      if (this.bulletGl) this.drawBulletsGl(s, a)
      else this.drawBulletPool(s.enemyBullets, a)
      if (s.enemyBits && s.enemyBits.length > 0) this.drawEnemyBits(s.enemyBits, a)
      if (s.enemyLasers && s.enemyLasers.length > 0) this.drawEnemyLasers(s.enemyLasers)
      this.drawParticles(s.particles, a)
      if (s.empPulses && s.empPulses.length > 0) this.drawEmpPulses(s.empPulses)
      ctx.globalCompositeOperation = 'source-over'
    }

    ctx.restore()
    ctx.drawImage(this.vignette, 0, 0, field.width, field.height)

    // 突触超频时间减速滤镜
    if (s.sandevistan) this.drawSandevistanOverlay()
  }

  /**
   * 残影色带插值：ratio 0(最旧)→1(最新)
   * 淡黄 → 红 → 紫 → 蓝 → 青绿
   */
  private static readonly SAND_STOPS: [number, number, number, number][] = [
    // [ratio, R, G, B]
    [0.0, 254, 240, 138], // 淡黄（最旧，即将消散）
    [0.25, 239, 68, 68], // 红
    [0.5, 168, 85, 247], // 紫
    [0.75, 59, 130, 246], // 蓝
    [1.0, 45, 212, 191] // 青绿（最新，鲜亮）
  ]

  private sandColor(ratio: number): [number, number, number] {
    const stops = Renderer.SAND_STOPS
    for (let i = 1; i < stops.length; i++) {
      if (ratio <= stops[i]![0]) {
        const prev = stops[i - 1]!
        const next = stops[i]!
        const t = (ratio - prev[0]) / (next[0] - prev[0])
        return [
          Math.round(prev[1] + (next[1] - prev[1]) * t),
          Math.round(prev[2] + (next[2] - prev[2]) * t),
          Math.round(prev[3] + (next[3] - prev[3]) * t)
        ]
      }
    }
    const last = stops[stops.length - 1]!
    return [last[1], last[2], last[3]]
  }

  /**
   * - 琥珀色/金色半透明色调覆盖全场
   * - 加重暗角（边缘压暗）
   * - 边缘扫描线（模拟神经加速器过载）
   */
  private drawSandevistanOverlay() {
    const ctx = this.ctx
    const w = field.width
    const h = field.height

    // 冷绿色色调覆盖
    ctx.globalCompositeOperation = 'overlay'
    ctx.fillStyle = 'rgba(16, 185, 129, 0.14)'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'

    // 轻微青绿叠加
    ctx.fillStyle = 'rgba(52, 211, 153, 0.06)'
    ctx.fillRect(0, 0, w, h)

    // 加重暗角（冷绿色边缘）
    const grad = ctx.createRadialGradient(
      w / 2, h / 2, h * 0.25,
      w / 2, h / 2, h * 0.7
    )
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(0.7, 'rgba(6, 78, 59, 0.18)')
    grad.addColorStop(1, 'rgba(2, 44, 34, 0.45)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // 边缘扫描线（水平细线，模拟时间扭曲）
    ctx.globalAlpha = 0.04
    ctx.fillStyle = '#34d399'
    const lineGap = 4
    const offset = (this.tick * 0.5) % lineGap
    for (let y = offset; y < h; y += lineGap) {
      ctx.fillRect(0, y, w, 1)
    }
    ctx.globalAlpha = 1
  }

  private drawBackground(s: RenderState) {
    if (s.bgType === 'lab') {
      this.drawLabBackground(s)
      return
    }
    const ctx = this.ctx
    const w = field.width
    const h = field.height
    // 关卡专属渐变 → 默认深空渐变
    const [c0, c1, c2] = s.bgGradient ?? ['#050510', '#0b0b24', '#160a2e']
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, c0)
    grad.addColorStop(0.5, c1)
    grad.addColorStop(1, c2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // 关卡专属背景图 > 通用背景图（半透明叠加滚动）
    const bg = this.sprites.getSprite('levelBg') ?? this.sprites.get('background')
    if (bg) {
      const offset = (this.tick * 0.8) % h
      ctx.globalAlpha = 0.5
      ctx.drawImage(bg, 0, offset - h, w, h)
      ctx.drawImage(bg, 0, offset, w, h)
      ctx.globalAlpha = 1
    }

    // 双图层星空视差滚动
    this.drawStars(this.starsFar, '#8899cc')
    this.drawStars(this.starsNear, '#dde6ff')
  }

  /**
   * 实验室 / 训练室背景（程序化绘制）
   * 俯视机库甲板：纵向滚动的舱段拼接地板 + 中央导引跑道
   * + 追逐式跑道灯 + 舷侧壁轨，统一冷青色调、保持克制不抢戏
   */
  private drawLabBackground(s: RenderState) {
    const ctx = this.ctx
    const w = field.width
    const h = field.height
    const t = this.tick
    /** 世界滚动量（像素），所有纵向循环元素的相位基准 */
    const S = t * 1.2
    /** 确定性伪随机（按舱段序号取样，滚动时图案稳定不跳变） */
    const hash = (n: number) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
      return x - Math.floor(x)
    }

    // ---- 基底：深钢蓝纵向微渐变 ----
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#0c1219')
    grad.addColorStop(0.5, '#101923')
    grad.addColorStop(1, '#0d151e')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // ---- 中央导引跑道几何 ----
    const rw = w * 0.36
    const rx0 = (w - rw) / 2
    const rx1 = rx0 + rw

    // ---- 舱段拼接地板（随世界滚动的基本重复单元） ----
    const sec = h / 3
    const secBase = Math.floor(S / sec)
    const secOff = S % sec
    for (let i = -1; i <= 3; i++) {
      const y = i * sec + secOff // 舱段顶边屏幕 Y
      const k = i - secBase // 舱段世界序号（滚动时稳定）
      if (y > h || y + sec < 0) continue

      // 顶边接缝：凹槽暗线 + 高光描边
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fillRect(0, y, w, 2)
      ctx.fillStyle = 'rgba(130,190,235,0.10)'
      ctx.fillRect(0, y + 2, w, 1)

      // 舱内竖向拼缝（相邻舱段错缝排列）
      const jointX = Math.abs(k) % 2 === 0 ? w * 0.3 : w * 0.7
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.fillRect(jointX, y + 3, 1.5, sec - 3)
      // 拼缝交点铆钉
      ctx.fillStyle = 'rgba(150,200,240,0.14)'
      for (const bx of [w * 0.08, jointX, w * 0.92]) {
        ctx.beginPath()
        ctx.arc(bx, y + 7, 1.4, 0, Math.PI * 2)
        ctx.fill()
      }

      // 舱段细节：警戒门槛 / 通风栅 / 跑道编号（按序号确定性分配）
      const detail = hash(k)
      if (k % 4 === 0) {
        // 警戒门槛：斜纹警示带
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, y + 3, w, 12)
        ctx.clip()
        ctx.strokeStyle = 'rgba(255,196,66,0.10)'
        ctx.lineWidth = 5
        for (let x = -12; x < w + 12; x += 16) {
          ctx.beginPath()
          ctx.moveTo(x, y + 17)
          ctx.lineTo(x + 12, y + 1)
          ctx.stroke()
        }
        ctx.restore()
      } else if (detail < 0.45) {
        // 通风栅：跑道外随机一侧的暗色格栅
        const ventW = w * 0.11
        const ventH = sec * 0.3
        const vx = hash(k + 1) < 0.5 ? w * 0.07 : w - w * 0.07 - ventW
        const vy = y + sec * 0.35
        ctx.fillStyle = 'rgba(0,0,0,0.30)'
        ctx.fillRect(vx, vy, ventW, ventH)
        ctx.strokeStyle = 'rgba(120,180,225,0.10)'
        ctx.lineWidth = 1
        ctx.strokeRect(vx + 0.5, vy + 0.5, ventW - 1, ventH - 1)
        ctx.fillStyle = 'rgba(120,180,225,0.08)'
        const slats = 4
        for (let si = 1; si <= slats; si++) {
          const sy = vy + (ventH / (slats + 1)) * si
          ctx.fillRect(vx + 3, sy, ventW - 6, 1.5)
        }
      } else if (detail < 0.75) {
        // 跑道编号：巨型浅印（沿滚动方向阅读）
        const num = String((Math.abs(k) % 9) + 1).padStart(2, '0')
        ctx.save()
        ctx.translate(w / 2, y + sec / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.font = `700 ${Math.round(rw * 0.42)}px "Consolas", monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = 'rgba(150,210,250,0.05)'
        ctx.fillText(num, 0, 0)
        ctx.restore()
      }
    }

    // ---- 跑道本体 ----
    // 道面微亮，与两侧甲板区分
    ctx.fillStyle = 'rgba(130,190,240,0.028)'
    ctx.fillRect(rx0, 0, rw, h)
    // 跑道边线 + 外发光
    for (const lx of [rx0, rx1]) {
      ctx.fillStyle = 'rgba(120,210,255,0.05)'
      ctx.fillRect(lx - 4, 0, 8, h)
      ctx.fillStyle = 'rgba(120,210,255,0.22)'
      ctx.fillRect(lx - 1, 0, 2, h)
    }
    // 中央虚线（随世界滚动）
    const dash = 26
    const gap = 20
    const period = dash + gap
    ctx.fillStyle = 'rgba(140,220,255,0.12)'
    for (let y = (S % period) - period; y < h; y += period) {
      ctx.fillRect(w / 2 - 1.5, y, 3, dash)
    }

    // ---- 追逐式跑道灯（沿边线外侧顺序点亮，取代旧版随机乱闪） ----
    const lightGap = h / 12
    const lightBase = Math.floor(S / lightGap)
    const chaseStep = Math.floor(t * 0.09) % 6
    for (let i = -1; i <= 12; i++) {
      const y = i * lightGap + (S % lightGap)
      const phase = (((i - lightBase) % 6) + 6) % 6
      const alpha = phase === chaseStep ? 0.85 : 0.14
      for (const lx of [rx0 - 9, rx1 + 9]) {
        ctx.fillStyle = `rgba(120,220,255,${alpha * 0.3})`
        ctx.beginPath()
        ctx.arc(lx, y, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(160,230,255,${alpha})`
        ctx.beginPath()
        ctx.arc(lx, y, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // ---- 舷侧壁轨（战场左右边缘的压边条 + 铆钉） ----
    const railW = w * 0.045
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.fillRect(0, 0, railW, h)
    ctx.fillRect(w - railW, 0, railW, h)
    ctx.fillStyle = 'rgba(110,170,220,0.10)'
    ctx.fillRect(railW, 0, 1.5, h)
    ctx.fillRect(w - railW - 1.5, 0, 1.5, h)
    const rivetGap = h / 16
    ctx.fillStyle = 'rgba(140,190,230,0.10)'
    for (let i = -1; i <= 16; i++) {
      const y = i * rivetGap + (S % rivetGap)
      ctx.beginPath()
      ctx.arc(railW / 2, y, 1.3, 0, Math.PI * 2)
      ctx.arc(w - railW / 2, y, 1.3, 0, Math.PI * 2)
      ctx.fill()
    }

    // ---- 环境光 ----
    // 顶部冷色天光
    const topGlow = ctx.createRadialGradient(w / 2, -h * 0.1, 0, w / 2, -h * 0.1, h * 0.7)
    topGlow.addColorStop(0, 'rgba(90,160,230,0.06)')
    topGlow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = topGlow
    ctx.fillRect(0, 0, w, h)

    // 缓慢下移的扫描光带（模拟顶灯扫过甲板）
    const sweepY = ((t * 0.45) % (h + 160)) - 80
    const sweepGrad = ctx.createLinearGradient(0, sweepY - 70, 0, sweepY + 70)
    sweepGrad.addColorStop(0, 'rgba(110,190,255,0)')
    sweepGrad.addColorStop(0.5, 'rgba(110,190,255,0.045)')
    sweepGrad.addColorStop(1, 'rgba(110,190,255,0)')
    ctx.fillStyle = sweepGrad
    ctx.fillRect(0, sweepY - 70, w, 140)

    // ---- 背景图叠加（如果配置了） ----
    const bg = this.sprites.getSprite('levelBg')
    if (bg) {
      const offset = (t * 0.6) % h
      ctx.globalAlpha = 0.18
      ctx.drawImage(bg, 0, offset - h, w, h)
      ctx.drawImage(bg, 0, offset, w, h)
      ctx.globalAlpha = 1
    }
  }

  private drawStars(stars: Star[], color: string) {
    const ctx = this.ctx
    ctx.fillStyle = color
    for (const star of stars) {
      star.y += star.speed
      if (star.y > field.height) {
        star.y = -2
        star.x = Math.random() * field.width
      }
      ctx.globalAlpha = star.alpha
      ctx.fillRect(star.x, star.y, star.size, star.size)
    }
    ctx.globalAlpha = 1
  }

  private drawBulletPool(pool: BulletPool, a: number) {
    const ctx = this.ctx
    for (let i = 0; i < pool.items.length; i++) {
      const b = pool.items[i]!
      if (!b.active) continue
      const x = lerp(b.px, b.x, a)
      const y = lerp(b.py, b.y, a)
      const sprite = this.bulletSprites.get(b.style)!
      const { shape } = BULLET_VISUALS[b.style]
      const r = b.radius
      if (shape === 'orb') {
        const s = r * 5.2
        ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s)
      } else if (shape === 'needle' || shape === 'rice') {
        // 长条弹：按速度方向旋转，非均匀缩放形成椭圆
        const len = shape === 'needle' ? r * 6 : r * 4
        const wid = shape === 'needle' ? r * 2.2 : r * 1.8
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(b.angle)
        ctx.drawImage(sprite, -len / 2, -wid / 2, len, wid)
        ctx.restore()
      } else if (shape === 'missile') {
        // 追踪导弹（2D 回退路径）：青蓝等离子弹体，无尾焰无拖尾
        const len = r * 7
        const wid = r * 2.2
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(b.angle)
        // 弹体
        ctx.drawImage(sprite, -len / 2, -wid / 2, len, wid)
        // 鼻锥白点
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.beginPath()
        ctx.arc(len * 0.32, 0, wid * 0.22, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      } else {
        // star：发光盘 + 十字星芒
        const s = r * 5
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(this.tick * 0.05)
        ctx.drawImage(sprite, -s / 2, -s / 2, s, s)
        ctx.restore()
      }
    }
  }

  /**
   * WebGL 着色弹丸层（需在 'lighter' 叠加混合层中调用）：
   * 收集两个弹池的全部活跃弹丸——orb / 针弹 / 米弹 / 星弹走点精灵
   * 径向辉光着色器，追踪导弹走三角面着色器（噪声尾焰 + 渐变拖尾 +
   * 白炽鼻锥），随后把半分辨率离屏层一次性加法合成进主画布
   */
  private drawBulletsGl(s: RenderState, a: number) {
    const layer = this.bulletGl
    if (!layer) return
    const { gl } = layer
    const points: number[] = []
    const tris: number[] = []
    const collect = (pool: BulletPool) => {
      for (let i = 0; i < pool.items.length; i++) {
        const b = pool.items[i]!
        if (!b.active) continue
        const x = lerp(b.px, b.x, a)
        const y = lerp(b.py, b.y, a)
        const vis = BULLET_GL_VISUALS[b.style]
        if (b.style === 'missile-cyan') {
          this.pushMissileGl(tris, b, x, y)
        } else {
          const sp = Math.hypot(b.vx, b.vy) || 1
          points.push(
            x,
            y,
            b.radius * vis.sizeMul,
            vis.aspect,
            b.vx / sp,
            b.vy / sp,
            vis.r,
            vis.g,
            vis.b,
            vis.hot,
            vis.shape
          )
        }
      }
    }
    collect(s.playerBullets)
    collect(s.enemyBullets)
    if (points.length === 0 && tris.length === 0) return

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)

    // 点精灵：orb / 针弹 / 米弹 / 星弹
    if (points.length > 0) {
      gl.useProgram(layer.progPoint)
      gl.uniform2f(gl.getUniformLocation(layer.progPoint, 'uView'), field.width, field.height)
      gl.uniform1f(gl.getUniformLocation(layer.progPoint, 'uPx'), layer.pxPerUnit)
      gl.bindBuffer(gl.ARRAY_BUFFER, layer.bufPoint)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.DYNAMIC_DRAW)
      const setP = (name: string, size: number, off: number) => {
        const loc = gl.getAttribLocation(layer.progPoint, name)
        if (loc < 0) return
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 44, off)
      }
      setP('aPos', 2, 0)
      setP('aSize', 1, 8)
      setP('aAspect', 1, 12)
      setP('aDir', 2, 16)
      setP('aColor', 3, 24)
      setP('aHot', 1, 36)
      setP('aShape', 1, 40)
      gl.drawArrays(gl.POINTS, 0, points.length / 11)
    }

    // 三角面：追踪导弹（等离子弹体）
    if (tris.length > 0) {
      gl.useProgram(layer.progTri)
      gl.uniform2f(gl.getUniformLocation(layer.progTri, 'uView'), field.width, field.height)
      gl.bindBuffer(gl.ARRAY_BUFFER, layer.bufTri)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tris), gl.DYNAMIC_DRAW)
      const setT = (name: string, size: number, off: number) => {
        const loc = gl.getAttribLocation(layer.progTri, name)
        if (loc < 0) return
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 28, off)
      }
      setT('aPos', 2, 0)
      setT('aUv', 2, 8)
      setT('aColor', 3, 16)
      gl.drawArrays(gl.TRIANGLES, 0, tris.length / 7)
    }

    // 半分辨率层一次性加法合成（调用方已处于 'lighter'）
    this.ctx.drawImage(layer.canvas, 0, 0, field.width, field.height)
  }

  /** 组装单枚追踪导弹的着色三角面（等离子弹体一张 quad，无尾焰无拖尾） */
  private pushMissileGl(out: number[], b: Bullet, x: number, y: number) {
    const sp = Math.hypot(b.vx, b.vy) || 1
    const dx = b.vx / sp
    const dy = b.vy / sp
    const nx = -dy
    const ny = dx
    const r = b.radius
    const bodyHalf = r * 3.4
    const halfW = r * 1.4
    const tailX = x - dx * bodyHalf
    const tailY = y - dy * bodyHalf
    const noseX = x + dx * bodyHalf
    const noseY = y + dy * bodyHalf
    // 追踪锁定中（moveDelay > 0）呈灰白色，追踪结束转为青蓝并直线飞出
    const locked = b.moveDelay <= 0
    const cr = locked ? 0.35 : 0.75
    const cg = locked ? 0.8 : 0.75
    const cb = locked ? 1.0 : 0.8
    const tri = (
      ax: number, ay: number, au: number, av: number,
      bx2: number, by2: number, bu: number, bv: number,
      cx2: number, cy2: number, cu: number, cv: number
    ) => {
      out.push(ax, ay, au, av, cr, cg, cb)
      out.push(bx2, by2, bu, bv, cr, cg, cb)
      out.push(cx2, cy2, cu, cv, cr, cg, cb)
    }
    // 弹体（u：0=弹尾 → 1=白炽鼻锥）
    tri(
      tailX + nx * halfW, tailY + ny * halfW, 0, -0.5,
      noseX + nx * halfW, noseY + ny * halfW, 1, -0.5,
      noseX - nx * halfW, noseY - ny * halfW, 1, 0.5
    )
    tri(
      tailX + nx * halfW, tailY + ny * halfW, 0, -0.5,
      noseX - nx * halfW, noseY - ny * halfW, 1, 0.5,
      tailX - nx * halfW, tailY - ny * halfW, 0, 0.5
    )
  }

  /** 残影着色用的离屏画布（懒创建，复用避免每帧分配） */
  private tintCanvas: HTMLCanvasElement | null = null

  /**
   * 把素材的一帧绘制到离屏画布，再用 source-atop 叠加纯色
   * （保留透明背景，只给角色本体上色），返回可直接 drawImage 的画布
   */
  private tintSprite(
    img: HTMLImageElement,
    sx: number,
    sw: number,
    sh: number,
    dw: number,
    dh: number,
    r: number,
    g: number,
    b: number
  ): HTMLCanvasElement {
    const w = Math.max(1, Math.ceil(dw))
    const h = Math.max(1, Math.ceil(dh))
    if (!this.tintCanvas) this.tintCanvas = document.createElement('canvas')
    const c = this.tintCanvas
    c.width = w
    c.height = h
    const tctx = c.getContext('2d')!
    tctx.drawImage(img, sx, 0, sw, sh, 0, 0, w, h)
    tctx.globalCompositeOperation = 'source-atop'
    tctx.fillStyle = `rgba(${r},${g},${b},0.85)`
    tctx.fillRect(0, 0, w, h)
    tctx.globalCompositeOperation = 'source-over'
    return c
  }

  private drawPlayer(p: Player, x: number, y: number, angle: number) {
    if (!p.alive) return
    const ctx = this.ctx

    // 皮肤选择优先级：角色皮肤（frame: / .json）→ 全局 player 静态素材 → 占位绘制
    // （残影与本体共用，提前解析一次）
    let img: HTMLImageElement | null = null
    let anim: SpriteAnim | null = null
    if (p.spriteId) {
      img = this.sprites.getSprite(p.spriteId)
      anim = this.sprites.getSpriteAnim(p.spriteId)
    }
    if (!img) img = this.sprites.get('player')
    const clip = anim ? pickClip(anim, p.anim) : null
    // 素材绘制尺寸（高度，宽度按素材宽高比自适应；判定点大小不受影响）
    const dh = 64
    // 当前动作对应的源帧区域（序列帧取当前帧，静态图取整图）
    let frameSx = 0
    let frameSw = 0
    let frameSh = 0
    let frameDw = 0
    if (img) {
      if (clip && anim) {
        const fps = clip.fps ?? anim.fps
        const frame = Math.floor((performance.now() / 1000) * fps) % clip.length
        frameSx = (clip.start + frame) * anim.frameWidth
        frameSw = anim.frameWidth
        frameSh = anim.frameHeight
      } else {
        frameSw = img.naturalWidth
        frameSh = img.naturalHeight
      }
      frameDw = (dh * frameSw) / frameSh
    }

    // 洋葱皮残影：多层渐变透明分身，色相 青绿→蓝→紫→红→淡黄
    const trail = p.rainbowTrail
    if (trail.length > 1) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const len = trail.length
      for (let i = 0; i < len; i++) {
        const t = trail[i]!
        const ratio = i / (len - 1) // 0(最旧) → 1(最新)
        const [cr, cg, cb] = this.sandColor(ratio)
        // 基础透明度：最旧几乎不可见，最新较明显
        const baseA = 0.04 + ratio * ratio * 0.4
        ctx.save()
        ctx.translate(t.x, t.y)
        ctx.rotate(t.angle + Math.PI / 2)
        if (p.flip) ctx.scale(-1, 1)

        if (img) {
          // 有皮肤：绘制角色本体帧并叠加彩虹色调（保留透明背景）
          const tinted = this.tintSprite(
            img,
            frameSx,
            frameSw,
            frameSh,
            frameDw,
            dh,
            cr,
            cg,
            cb
          )
          ctx.globalAlpha = baseA
          ctx.drawImage(tinted, -frameDw / 2, -dh / 2)
        } else {
          // 无皮肤占位：三层渐变三角
          // 第 1 层：外层辉光（大尺寸、极淡）
          ctx.globalAlpha = baseA * 0.3
          ctx.fillStyle = `rgb(${cr},${cg},${cb})`
          ctx.beginPath()
          ctx.moveTo(0, -22)
          ctx.lineTo(-14, 14)
          ctx.lineTo(0, 7)
          ctx.lineTo(14, 14)
          ctx.closePath()
          ctx.fill()

          // 第 2 层：中层轮廓（标准尺寸）
          ctx.globalAlpha = baseA * 0.6
          ctx.beginPath()
          ctx.moveTo(0, -17)
          ctx.lineTo(-11, 11)
          ctx.lineTo(0, 5)
          ctx.lineTo(11, 11)
          ctx.closePath()
          ctx.fill()

          // 第 3 层：内核高亮（小尺寸、最亮）
          ctx.globalAlpha = baseA
          ctx.beginPath()
          ctx.moveTo(0, -13)
          ctx.lineTo(-8, 8)
          ctx.lineTo(0, 4)
          ctx.lineTo(8, 8)
          ctx.closePath()
          ctx.fill()
        }

        ctx.restore()
      }
      ctx.restore()
    }

    // 受击故障残影：彩虹色分身在周围闪现，带水平错位抖动（RGB 故障风）
    const glitchGhosts = p.glitchGhosts
    if (glitchGhosts.length > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const g of glitchGhosts) {
        const life = g.ttl / g.maxTtl // 1 → 0
        const [cr, cg, cb] = this.sandColor(g.seed)
        // 故障抖动：每 2 帧跳变一次水平错位，越消散越平静
        const jitter = ((Math.floor(this.tick / 2) + Math.floor(g.seed * 7)) % 2 === 0 ? 3 : -3) * life
        ctx.save()
        ctx.translate(g.x + jitter, g.y)
        ctx.rotate(g.angle + Math.PI / 2)
        if (p.flip) ctx.scale(-1, 1)
        ctx.globalAlpha = 0.55 * life
        if (img) {
          const tinted = this.tintSprite(img, frameSx, frameSw, frameSh, frameDw, dh, cr, cg, cb)
          ctx.drawImage(tinted, -frameDw / 2, -dh / 2)
        } else {
          ctx.fillStyle = `rgb(${cr},${cg},${cb})`
          ctx.beginPath()
          ctx.moveTo(0, -17)
          ctx.lineTo(-11, 11)
          ctx.lineTo(0, 5)
          ctx.lineTo(11, 11)
          ctx.closePath()
          ctx.fill()
        }
        ctx.restore()
      }
      ctx.restore()
    }

    // 无敌闪烁
    if (p.invincible > 0 && Math.floor(this.tick / 4) % 2 === 0) {
      ctx.globalAlpha = 0.35
    }

    // 机身朝鼠标方向旋转（素材默认朝上，angle 0 = 正右方，故 +90°）
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle + Math.PI / 2)
    // 左移（A）时水平镜像：复用 right / move 皮肤，无需单独的 left 动作
    if (p.flip) ctx.scale(-1, 1)

    // 本体绘制（皮肤与帧区域已在上方解析）
    if (img) {
      ctx.drawImage(
        img,
        frameSx,
        0,
        frameSw,
        frameSh,
        -frameDw / 2,
        -dh / 2,
        frameDw,
        dh
      )
    } else {
      // 占位绘制：辉光 + 机身三角（颜色由所选角色决定）
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 22)
      grad.addColorStop(0, p.color + '80')
      grad.addColorStop(1, p.color + '00')
      ctx.fillStyle = grad
      ctx.fillRect(-22, -22, 44, 44)
      ctx.beginPath()
      ctx.moveTo(0, -16)
      ctx.lineTo(-10, 10)
      ctx.lineTo(0, 5)
      ctx.lineTo(10, 10)
      ctx.closePath()
      ctx.fillStyle = p.color
      ctx.fill()
      ctx.strokeStyle = p.accent
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
    ctx.restore()
    ctx.globalAlpha = 1

    // 低速模式显示判定点
    if (p.slow) {
      ctx.beginPath()
      ctx.arc(x, y, BALANCE.player.hitboxRadius, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, y, BALANCE.player.hitboxRadius + 2.5, 0, Math.PI * 2)
      ctx.strokeStyle = '#ff4466'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }

  /** 把 CSS 颜色字符串解析为 rgba(R,G,B,A) 各部分值 */
  private parseColor(color: string): [number, number, number, number] {
    // 十六进制 #RRGGBB 或 #RRGGBBAA
    if (color.startsWith('#')) {
      const h = color.slice(1)
      if (h.length === 6) {
        return [
          parseInt(h.slice(0, 2), 16),
          parseInt(h.slice(2, 4), 16),
          parseInt(h.slice(4, 6), 16),
          1
        ]
      } else if (h.length === 8) {
        return [
          parseInt(h.slice(0, 2), 16),
          parseInt(h.slice(2, 4), 16),
          parseInt(h.slice(4, 6), 16),
          parseInt(h.slice(6, 8), 16) / 255
        ]
      }
    }
    return [255, 255, 255, 1] // fallback white
  }

  /** 义体自动索敌锁定框：锁定后的半边长 */
  private static readonly AIM_BOX_HALF = 18
  /** 义体自动索敌锁定框：未锁定半边长（收缩动画起点） */
  private static readonly AIM_BOX_HALF_MAX = 34

  /**
   * 义体自动索敌锁定框：复刻主菜单 AI 检测框特效
   * 四角括弧 + 锁定收缩动画 + 锁定后中心十字与标签
   */
  private drawAutoAimTarget(x: number, y: number, lock: number) {
    const ctx = this.ctx
    // lock 越大框越小，形成“锁定收缩”动画
    const half =
      Renderer.AIM_BOX_HALF_MAX -
      (Renderer.AIM_BOX_HALF_MAX - Renderer.AIM_BOX_HALF) * lock
    const x0 = x - half
    const y0 = y - half
    const x1 = x + half
    const y1 = y + half
    const arm = Math.max(5, half * 0.42)
    const locked = lock > 0.85
    const color = locked ? '#d3a4ff' : '#66eaff'

    ctx.globalAlpha = Math.min(1, lock * 1.6)
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.shadowColor = color
    ctx.shadowBlur = 10

    // 四角括弧（目标检测标注框样式）
    ctx.beginPath()
    ctx.moveTo(x0, y0 + arm)
    ctx.lineTo(x0, y0)
    ctx.lineTo(x0 + arm, y0)
    ctx.moveTo(x1 - arm, y0)
    ctx.lineTo(x1, y0)
    ctx.lineTo(x1, y0 + arm)
    ctx.moveTo(x1, y1 - arm)
    ctx.lineTo(x1, y1)
    ctx.lineTo(x1 - arm, y1)
    ctx.moveTo(x0 + arm, y1)
    ctx.lineTo(x0, y1)
    ctx.lineTo(x0, y1 - arm)
    ctx.stroke()

    // 锁定后：中心十字
    if (locked) {
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x - 7, y)
      ctx.lineTo(x + 7, y)
      ctx.moveTo(x, y - 7)
      ctx.lineTo(x, y + 7)
      ctx.stroke()
    }
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  }

  private drawEnemy(e: Enemy, a: number) {
    const ctx = this.ctx
    const x = lerp(e.px, e.x, a)
    const y = lerp(e.py, e.y, a)
    const def = e.def
    const baseColor = e.flash > 0 ? '#ffffff' : def.iconColor

    // 辉光
    const glowRadius = 20
    const [ir, ig, ib, ia] = this.parseColor(def.iconColor)
    const grad = ctx.createRadialGradient(x, y, 0, x, y, glowRadius)
    grad.addColorStop(0, `rgba(${ir},${ig},${ib},0.45)`)
    grad.addColorStop(1, `rgba(${ir},${ig},${ib},0)`)
    ctx.fillStyle = grad
    ctx.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2)

    // 按图标形状绘制
    if (def.icon === 'drone') {
      this.drawEscortDrone(x, y, e, baseColor)
    } else if (def.icon === 'laser-drone') {
      this.drawLaserDrone(x, y, e, baseColor)
    } else if (def.icon === 'triangle') {
      ctx.beginPath()
      ctx.moveTo(x, y - 14)
      ctx.lineTo(x + 12, y + 10)
      ctx.lineTo(x - 12, y + 10)
      ctx.closePath()
      ctx.fillStyle = baseColor
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 1
      ctx.stroke()
    } else if (def.icon === 'square') {
      const s = 12
      ctx.beginPath()
      ctx.rect(x - s, y - s, s * 2, s * 2)
      ctx.fillStyle = baseColor
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 1
      ctx.stroke()
    } else if (def.icon === 'circle') {
      ctx.beginPath()
      ctx.arc(x, y, 14, 0, Math.PI * 2)
      ctx.fillStyle = baseColor
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // 高血量敌机显示细血条
    if (e.maxHp >= 100) {
      const w = 34
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillRect(x - w / 2, y - 20, w, 3)
      ctx.fillStyle = '#fda4af'
      ctx.fillRect(x - w / 2, y - 20, (w * e.hp) / e.maxHp, 3)
    }

    // 电磁脉冲干扰中：电子超载电弧
    if (e.stun > 0) this.drawStunArcs(x, y, 14)
  }

  /**
   * 绯红护卫机（后掠翼拦截机）：机身沿飞行方向，双翼红绿翼尖灯、
   * 蓝色座舱、尾部推进火焰；受击时整体闪白
   */
  private drawEscortDrone(x: number, y: number, e: Enemy, baseColor: string) {
    const ctx = this.ctx
    const vx = e.x - e.px
    const vy = e.y - e.py
    const a = Math.hypot(vx, vy) > 0.05 ? Math.atan2(vy, vx) : -Math.PI / 2
    const now = performance.now()
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    // 后掠翼机身
    ctx.beginPath()
    ctx.moveTo(15, 0) // 机头
    ctx.lineTo(3, 6.5) // 右翼前缘
    ctx.lineTo(-7, 9.5) // 右翼尖
    ctx.lineTo(-11, 3.5)
    ctx.lineTo(-11, -3.5)
    ctx.lineTo(-7, -9.5)
    ctx.lineTo(3, -6.5)
    ctx.closePath()
    ctx.fillStyle = baseColor
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
    // 座舱
    ctx.fillStyle = '#9fdcff'
    ctx.beginPath()
    ctx.arc(5.5, 0, 2.3, 0, Math.PI * 2)
    ctx.fill()
    // 尾喷推进火焰（闪烁）
    const flick = 0.7 + 0.3 * Math.sin(now / 75 + e.x * 0.13)
    ctx.fillStyle = `rgba(255,170,80,${0.75 * flick})`
    ctx.beginPath()
    ctx.moveTo(-10.5, -2.2)
    ctx.lineTo(-15 - 5 * flick, 0)
    ctx.lineTo(-10.5, 2.2)
    ctx.closePath()
    ctx.fill()
    // 翼尖灯：右红左绿
    ctx.fillStyle = 'rgba(255,120,120,0.95)'
    ctx.beginPath()
    ctx.arc(-6.5, 9, 1.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(120,255,170,0.95)'
    ctx.beginPath()
    ctx.arc(-6.5, -9, 1.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /**
   * 激光无人机（悬浮菱形体）：外圈旋转刻度环 + 沿飞行方向的菱形机体 +
   * 朝自机的聚能透镜（呼吸脉动）+ 尾部推进口；受击闪白
   */
  private drawLaserDrone(x: number, y: number, e: Enemy, baseColor: string) {
    const ctx = this.ctx
    const now = performance.now()
    const vx = e.x - e.px
    const vy = e.y - e.py
    const a = Math.hypot(vx, vy) > 0.05 ? Math.atan2(vy, vx) : -Math.PI / 2
    // 旋转刻度外环
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(now / 900)
    ctx.strokeStyle = 'rgba(125,232,255,0.5)'
    ctx.lineWidth = 1.2
    ctx.setLineDash([3.2, 4.2])
    ctx.beginPath()
    ctx.arc(0, 0, 12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
    // 菱形机体（沿飞行方向）
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    ctx.beginPath()
    ctx.moveTo(10, 0)
    ctx.lineTo(0, 8)
    ctx.lineTo(-8, 0)
    ctx.lineTo(0, -8)
    ctx.closePath()
    ctx.fillStyle = baseColor
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
    // 朝自机的聚能透镜（机首方向，呼吸脉动）
    const pulse = 0.5 + 0.5 * Math.sin(now / 240 + e.x * 0.11)
    const lx = x + Math.cos(e.aimAngle) * 9
    const ly = y + Math.sin(e.aimAngle) * 9
    ctx.fillStyle = `rgba(180,240,255,${0.55 + 0.4 * pulse})`
    ctx.beginPath()
    ctx.arc(lx, ly, 2.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath()
    ctx.arc(lx, ly, 1.1, 0, Math.PI * 2)
    ctx.fill()
    // 尾部推进口
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    ctx.fillStyle = 'rgba(125,232,255,0.75)'
    ctx.fillRect(-9.5, -3, 2.6, 6)
    ctx.restore()
  }

  private drawBoss(b: Boss, a: number) {
    const ctx = this.ctx
    const x = lerp(b.px, b.x, a)
    const y = lerp(b.py, b.y, a)
    const def = b.def
    // 巨构 Boss：专属舰体绘制（含部位）
    if (def.icon === 'leviathan') {
      this.drawLeviathan(b, x, y)
      return
    }
    const baseColor = b.flash > 0 ? '#ffffff' : def.iconColor

    // 大辉光
    const glowRadius = 56
    const [ir, ig, ib] = this.parseColor(def.iconColor)
    const grad = ctx.createRadialGradient(x, y, 0, x, y, glowRadius)
    grad.addColorStop(0, `rgba(${ir},${ig},${ib},0.55)`)
    grad.addColorStop(1, `rgba(${ir},${ig},${ib},0)`)
    ctx.fillStyle = grad
    ctx.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2)

    // 按图标形状绘制 Boss 机体
    if (def.icon === 'circle') {
      // 白色巨大圆形：旋转外环 + 实心核心
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(this.tick * 0.02)
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 2
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2)
        ctx.beginPath()
        ctx.arc(0, 0, 36, 0.2, Math.PI / 2 - 0.2)
        ctx.stroke()
      }
      ctx.restore()

      ctx.beginPath()
      ctx.arc(x, y, 28, 0, Math.PI * 2)
      ctx.fillStyle = baseColor
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 2
      ctx.stroke()

      // 内部高光
      ctx.beginPath()
      ctx.arc(x - 6, y - 8, 8, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fill()
    } else if (def.icon === 'square') {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(this.tick * 0.02)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 2
      const s = 44
      ctx.strokeRect(-s / 2, -s / 2, s, s)
      ctx.restore()

      ctx.fillStyle = baseColor
      ctx.fillRect(x - 30, y - 30, 60, 60)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x - 30, y - 30, 60, 60)
    } else {
      // triangle / 默认
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(this.tick * 0.02)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 2
      for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3)
        ctx.beginPath()
        ctx.moveTo(0, -38)
        ctx.lineTo(0, -26)
        ctx.stroke()
      }
      ctx.restore()

      ctx.fillStyle = baseColor
      ctx.beginPath()
      ctx.moveTo(x, y - 30)
      ctx.lineTo(x + 24, y + 24)
      ctx.lineTo(x - 24, y + 24)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // 电磁脉冲干扰中：电子超载电弧
    if (b.stun > 0) this.drawStunArcs(x, y, 30)
  }

  /** 巨构舰体运行时信息（FinalBoss 公开字段的渲染视图，避免渲染层依赖具体类） */
  private leviathanView(b: Boss): {
    phase: number
    age: number
    S: number
    barrelAims: Record<string, number>
    summonFlash: number
    coreFlash: number
    hullFlash: number
    transitionT: number
    dyingT: number
  } {
    return b as unknown as {
      phase: number
      age: number
      S: number
      barrelAims: Record<string, number>
      summonFlash: number
      coreFlash: number
      hullFlash: number
      transitionT: number
      dyingT: number
    }
  }

  /**
   * 巨构 Boss「绯红天幕」舰腹绘制（drawBoss 的 leviathan 分支）：
   * 母舰只露出屏幕顶端的下半身——远翼层 → 主舰体 → 内装甲侧板 →
   * 反应堆基座，再加结构肋骨 / 面板接缝 / 机库舱门（召唤时闪光）/
   * 管线 / 警示条纹 / 天线簇 / 翼尖引擎 / 追逐跑灯等机械细节，
   * 中央是承受本体血量的多层核心（阶段一装甲封盖与相位护盾，
   * 阶段二三裸露狂暴、舰体裂纹与终局冲击环），四门副炮悬挂舰腹。
   * 整体几何由 FinalBoss.S 统一缩放
   */
  private drawLeviathan(b: Boss, x: number, y: number) {
    const ctx = this.ctx
    const def = b.def
    const {
      phase,
      S,
      barrelAims,
      summonFlash,
      coreFlash: coreFlashT,
      hullFlash: hullFlashT,
      transitionT,
      dyingT
    } = this.leviathanView(b)
    const now = performance.now()
    const coreFlash = coreFlashT > 0
    const hullFlash = hullFlashT > 0
    const [ir, ig, ib] = this.parseColor(def.iconColor)
    const k = Math.min(S, 2) // 小尺寸细节的缩放封顶
    const P = (dx: number, dy: number): [number, number] => [x + dx * S, y + dy * S]

    /** 按设计坐标绘多边形（可只描边 / 只填充 / 只建路径） */
    const poly = (pts: [number, number][], fill?: string | CanvasGradient, stroke?: string, lw = 1) => {
      ctx.beginPath()
      pts.forEach(([dx, dy], i) => {
        const [qx, qy] = P(dx, dy)
        if (i === 0) ctx.moveTo(qx, qy)
        else ctx.lineTo(qx, qy)
      })
      ctx.closePath()
      if (fill) {
        ctx.fillStyle = fill
        ctx.fill()
      }
      if (stroke) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = lw
        ctx.stroke()
      }
    }
    const line = (x1: number, y1: number, x2: number, y2: number, style: string, lw = 1) => {
      const [ax, ay] = P(x1, y1)
      const [bx, by] = P(x2, y2)
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.strokeStyle = style
      ctx.lineWidth = lw
      ctx.stroke()
    }
    /** 沿可见下缘的折线（跑灯 / 轮廓光共用） */
    const bottomRim: [number, number][] = [
      [-220, 12], [-190, 32], [-138, 52], [-78, 64], [0, 58], [78, 64],
      [138, 52], [190, 32], [220, 12]
    ]
    const rimPath = () => {
      ctx.beginPath()
      bottomRim.forEach(([dx, dy], i) => {
        const [qx, qy] = P(dx, dy)
        if (i === 0) ctx.moveTo(qx, qy)
        else ctx.lineTo(qx, qy)
      })
    }

    // —— 舰底压迫辉光（核心位） ——
    const glowR = 240 * S
    const glow = ctx.createRadialGradient(x, y + 40 * S, 0, x, y + 40 * S, glowR)
    glow.addColorStop(0, `rgba(${ir},${ig},${ib},${coreFlash ? 0.42 : 0.24})`)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(x - glowR, y + 40 * S - glowR, glowR * 2, glowR * 2)

    // —— 下投光幕（五道极淡的绯红光柱，顶端贴着舰腹弧线投下，缓慢摆动） ——
    // 舰腹下缘是弧形：按光柱的 x 位置在弧线上插值取顶边高度；
    // 顶边再向内收 6 个设计单位（探入舰体，随后被舰体盖住），让光从舰腹内部透出
    const rimYAt = (dx: number): number => {
      for (let i = 0; i < bottomRim.length - 1; i++) {
        const [x1, y1] = bottomRim[i]!
        const [x2, y2] = bottomRim[i + 1]!
        if (dx >= Math.min(x1, x2) && dx <= Math.max(x1, x2)) {
          const t = (dx - x1) / (x2 - x1 || 1)
          return y1 + (y2 - y1) * t
        }
      }
      return 60
    }
    for (let i = -2; i <= 2; i++) {
      const sway = Math.sin(now / 900 + i * 1.7) * 10 * S
      const gx = x + i * 82 * S + sway
      const topY = y + (rimYAt(i * 82) - 6) * S
      const beamA = 0.05 + 0.02 * Math.sin(now / 700 + i)
      ctx.fillStyle = `rgba(255,59,78,${beamA})`
      ctx.beginPath()
      ctx.moveTo(gx - 15 * S, topY)
      ctx.lineTo(gx + 15 * S, topY)
      ctx.lineTo(gx + 54 * S, y + 250 * S)
      ctx.lineTo(gx - 54 * S, y + 250 * S)
      ctx.closePath()
      ctx.fill()
    }

    // —— 远翼层（最暗、最宽，从主舰体两侧探出） ——
    poly(
      [
        [-234, 6], [-200, 30], [-144, 50], [-84, 62], [0, 56], [84, 62],
        [144, 50], [200, 30], [234, 6], [234, -70], [-234, -70]
      ],
      '#150a10',
      'rgba(255,59,78,0.20)',
      1.2
    )

    // —— 主舰体（下探的巨型天穹，上半藏于屏外） ——
    const hull: [number, number][] = [
      [-220, 12], [-190, 32], [-138, 52], [-78, 64], [0, 58], [78, 64],
      [138, 52], [190, 32], [220, 12], [220, -70], [-220, -70]
    ]
    // 下缘受光：底部亮、往上沉入阴影
    const hullGrad = ctx.createLinearGradient(0, y - 70 * S, 0, y + 66 * S)
    hullGrad.addColorStop(0, '#12070b')
    hullGrad.addColorStop(0.72, '#2e1018')
    hullGrad.addColorStop(1, '#4c1a26')
    poly(hull, hullGrad)
    // 主舰体能量描边（呼吸脉动）
    const edgeA = 0.62 + 0.25 * Math.sin(now / 520)
    poly(hull, undefined, `rgba(255,59,78,${edgeA})`, 1.6)
    // 下缘金色轮廓光
    rimPath()
    ctx.strokeStyle = `rgba(255,200,110,${0.4 + 0.14 * Math.sin(now / 700)})`
    ctx.lineWidth = 1.4
    ctx.stroke()

    // —— 内装甲侧板 ——
    for (const s of [-1, 1]) {
      poly(
        s === -1
          ? [[-202, 22], [-134, 46], [-104, 42], [-160, 16]]
          : [[202, 22], [134, 46], [104, 42], [160, 16]],
        'rgba(96,34,52,0.35)',
        'rgba(255,110,130,0.28)',
        1
      )
    }

    // —— 结构肋骨（从反应堆基座放射到舰缘，双层描边制造槽深） ——
    const ribs: [number, number, number, number][] = [
      [-64, 20, -180, 30], [-50, 40, -120, 52],
      [64, 20, 180, 30], [50, 40, 120, 52]
    ]
    for (const [x0, y0, x1, y1] of ribs) {
      line(x0, y0, x1, y1, 'rgba(0,0,0,0.5)', 3)
      line(x0, y0, x1, y1, 'rgba(255,120,140,0.22)', 1)
    }
    line(0, 12, 0, 40, 'rgba(0,0,0,0.45)', 2.6)
    line(0, 12, 0, 40, 'rgba(255,120,140,0.2)', 1)

    // —— 面板接缝 ——
    for (const sy of [24, 38, 52]) {
      line(-176, sy, 176, sy, 'rgba(0,0,0,0.42)', 1)
      line(-176, sy, 176, sy, 'rgba(255,110,130,0.10)', 0.6)
    }
    for (const sx of [-140, 140]) {
      line(sx, 24, sx, 52, 'rgba(0,0,0,0.4)', 1)
    }

    // —— 反应堆基座（核心挂架：下探的五边形装甲） ——
    poly(
      [[-72, 14], [72, 14], [88, 44], [0, 66], [-88, 44]],
      'rgba(46,16,26,0.9)',
      'rgba(255,150,100,0.45)',
      1.3
    )
    line(-72, 14, 72, 14, 'rgba(255,190,80,0.5)', 1.2)
    // 基座上的挂架细节
    for (const s of [-1, 1]) {
      line(s * 40, 22, s * 52, 44, 'rgba(0,0,0,0.5)', 2)
      line(s * 40, 22, s * 52, 44, 'rgba(255,110,130,0.18)', 0.8)
    }

    // —— 管线（沿舷侧蜿蜒的弧形管道） ——
    ctx.lineCap = 'round'
    for (const s of [-1, 1]) {
      const [ax, ay] = P(s * 46, 28)
      const [cx, cy] = P(s * 96, 62)
      const [bx, by] = P(s * 152, 46)
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.quadraticCurveTo(cx, cy, bx, by)
      ctx.strokeStyle = 'rgba(20,8,12,0.9)'
      ctx.lineWidth = 5 * k
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.quadraticCurveTo(cx, cy, bx, by)
      ctx.strokeStyle = 'rgba(255,120,140,0.3)'
      ctx.lineWidth = 1.2
      ctx.stroke()
      // 管道卡箍
      for (let i = 1; i <= 3; i++) {
        const t = i / 4
        const qx = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx
        const qy = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by
        ctx.fillStyle = 'rgba(255,150,100,0.4)'
        ctx.fillRect(qx - 2 * k, qy - 2.6 * k, 4 * k, 5.2 * k)
      }
    }

    // —— 机库舱门（母舰弹射编队的出口，召唤时闪光） ——
    const bayFlash = Math.max(0, summonFlash) / 36
    const bays: [number, number, number, number][] = [
      [-128, 40, 30, 15], [-108, 40, 30, 15], // 左侧双舱门（护卫机）
      [128, 40, 30, 15], [108, 40, 30, 15], // 右侧双舱门
      [-184, 15, 24, 11], [184, 15, 24, 11] // 翼尖舱门（突袭机）
    ]
    for (const [bx2, by2, bw, bh] of bays) {
      const [wx2, wy2] = P(bx2, by2)
      ctx.fillStyle = `rgba(6,3,4,${0.75 + 0.25 * bayFlash})`
      ctx.fillRect(wx2 - (bw / 2) * S, wy2 - (bh / 2) * S, bw * S, bh * S)
      // 舱门内侧能量光
      const inner = ctx.createLinearGradient(wx2, wy2 - (bh / 2) * S, wx2, wy2 + (bh / 2) * S)
      inner.addColorStop(0, `rgba(255,90,110,${0.10 + 0.30 * bayFlash})`)
      inner.addColorStop(0.5, `rgba(255,140,120,${0.16 + 0.45 * bayFlash})`)
      inner.addColorStop(1, `rgba(255,90,110,${0.10 + 0.30 * bayFlash})`)
      ctx.fillStyle = inner
      ctx.fillRect(wx2 - (bw / 2 - 2) * S, wy2 - (bh / 2 - 2) * S, (bw - 4) * S, (bh - 4) * S)
      // 舱门能量栅（流动斜线）
      ctx.save()
      ctx.beginPath()
      ctx.rect(wx2 - (bw / 2 - 1) * S, wy2 - (bh / 2 - 1) * S, (bw - 2) * S, (bh - 2) * S)
      ctx.clip()
      ctx.strokeStyle = `rgba(255,190,120,${0.2 + 0.5 * bayFlash})`
      ctx.lineWidth = 1
      const off = (now / 60) % 8
      for (let gx2 = wx2 - bw * S; gx2 < wx2 + bw * S; gx2 += 5 * S) {
        ctx.beginPath()
        ctx.moveTo(gx2 + off * S, wy2 + (bh / 2) * S)
        ctx.lineTo(gx2 + off * S + 7 * S, wy2 - (bh / 2) * S)
        ctx.stroke()
      }
      ctx.restore()
      ctx.strokeStyle = 'rgba(255,150,100,0.4)'
      ctx.lineWidth = 1
      ctx.strokeRect(wx2 - (bw / 2) * S, wy2 - (bh / 2) * S, bw * S, bh * S)
    }

    // —— 舷侧细节（格栅 / 盖板 / 小灯） ——
    const vents: [number, number, number, number][] = [
      [-188, 26, 24, 7], [-152, 36, 18, 6], [-118, 28, 14, 5],
      [188, 26, 24, 7], [152, 36, 18, 6], [118, 28, 14, 5]
    ]
    for (const [vx, vy, vw, vh] of vents) {
      const [wx3, wy3] = P(vx, vy)
      ctx.fillStyle = 'rgba(8,3,5,0.8)'
      ctx.fillRect(wx3 - (vw / 2) * S, wy3 - (vh / 2) * S, vw * S, vh * S)
      ctx.strokeStyle = 'rgba(255,110,130,0.22)'
      ctx.lineWidth = 0.8
      for (let i = 1; i < vw / 6; i++) {
        const sx3 = wx3 - (vw / 2) * S + i * 6 * S
        ctx.beginPath()
        ctx.moveTo(sx3, wy3 - (vh / 2) * S + 1)
        ctx.lineTo(sx3, wy3 + (vh / 2) * S - 1)
        ctx.stroke()
      }
    }
    const smallLights: [number, number, string][] = [
      [-202, 30, '255,120,140'], [-142, 24, '255,190,120'], [-112, 52, '255,120,140'],
      [202, 30, '255,120,140'], [142, 24, '255,190,120'], [112, 52, '255,120,140'],
      [-60, 26, '255,210,140'], [60, 26, '255,210,140']
    ]
    for (let i = 0; i < smallLights.length; i++) {
      const [lx2, ly2, c] = smallLights[i]!
      const bl = 0.35 + 0.45 * Math.sin(now / (260 + i * 40) + i * 1.9)
      const [wx4, wy4] = P(lx2, ly2)
      ctx.fillStyle = `rgba(${c},${bl})`
      ctx.beginPath()
      ctx.arc(wx4, wy4, Math.max(1, 1.2 * k), 0, Math.PI * 2)
      ctx.fill()
    }

    // —— 警示条纹（翼尖两侧） ——
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(x + (s === -1 ? -216 : 190) * S, y + 20 * S, 26 * S, 7 * S)
      ctx.clip()
      ctx.fillStyle = 'rgba(255,190,60,0.4)'
      for (let ox = -20 * S; ox < 26 * S; ox += 8 * S) {
        ctx.beginPath()
        ctx.moveTo(x + (s === -1 ? -216 : 190) * S + ox, y + 28 * S)
        ctx.lineTo(x + (s === -1 ? -216 : 190) * S + ox + 4 * S, y + 20 * S)
        ctx.lineTo(x + (s === -1 ? -216 : 190) * S + ox + 6 * S, y + 20 * S)
        ctx.lineTo(x + (s === -1 ? -216 : 190) * S + ox + 2 * S, y + 28 * S)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }

    // —— 天线簇 ——
    for (const s of [-1, 1]) {
      for (const [ax2, ay2] of [[s * 58, 12], [s * 66, 10], [s * 62, 14]] as [number, number][]) {
        const [tx3, ty3] = P(ax2, ay2 - 7)
        line(ax2, ay2, ax2, ay2 - 7, 'rgba(255,110,130,0.5)', 0.9)
        const bl2 = Math.sin(now / 300 + ax2) > 0.25 ? 0.9 : 0.2
        ctx.fillStyle = `rgba(255,210,120,${bl2})`
        ctx.beginPath()
        ctx.arc(tx3, ty3, Math.max(1, 1.1 * k), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // —— 翼尖引擎（喷口 + 尾焰） ——
    for (const s of [-1, 1]) {
      const ex3 = x + 226 * s * S
      const ey3 = y + 8 * S
      poly(
        s === 1
          ? [[218, 0], [234, 0], [240, 14], [212, 14]]
          : [[-218, 0], [-234, 0], [-240, 14], [-212, 14]],
        '#2a0f16',
        'rgba(255,150,100,0.45)',
        1
      )
      const flick = 0.7 + 0.3 * Math.sin(now / 95 + s * 2)
      this.drawLaserGlow(ex3, ey3 + 12 * S, 6 * S, 0.55 * flick, '255,160,90', '255,90,40')
      const flen = (12 + 5 * flick) * S
      ctx.fillStyle = `rgba(255,150,70,${0.45 * flick})`
      ctx.beginPath()
      ctx.moveTo(ex3 - 3.4 * S, ey3 + 10 * S)
      ctx.lineTo(ex3 + 3.4 * S, ey3 + 10 * S)
      ctx.lineTo(ex3, ey3 + 10 * S + flen)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = `rgba(255,240,210,${0.65 * flick})`
      ctx.beginPath()
      ctx.moveTo(ex3 - 1.4 * S, ey3 + 10 * S)
      ctx.lineTo(ex3 + 1.4 * S, ey3 + 10 * S)
      ctx.lineTo(ex3, ey3 + 10 * S + flen * 0.5)
      ctx.closePath()
      ctx.fill()
    }

    // —— 追逐跑灯（沿下缘依次点亮） ——
    for (let i = 0; i < bottomRim.length; i++) {
      const [dx2, dy2] = bottomRim[i]!
      const n2 = bottomRim.length
      const chase = ((now / 220 - i * 0.7) % (n2 * 2) + n2 * 2) % (n2 * 2)
      const bright = chase < 2 ? 0.95 : 0.16
      const [ex2, ey2] = P(dx2, dy2)
      ctx.fillStyle = `rgba(255,170,90,${bright})`
      ctx.beginPath()
      ctx.arc(ex2, ey2, Math.max(1, 1.5 * k), 0, Math.PI * 2)
      ctx.fill()
    }

    // —— 核心区（按阶段变化：一=装甲封盖 / 二=中枢激光塔基座 / 三=破损反应堆残骸；
    //    受击时只有核心本体闪白，舰体不闪） ——
    const [cx0, cy0] = P(0, 40)
    const phase3Flick = phase === 3 ? Math.sin(now / 60) : 0
    const corePulse = phase === 3 ? 0.7 + 0.3 * phase3Flick : 0.62 + 0.18 * Math.sin(now / 190)
    const coreR = (phase === 1 ? 21 : 26 + (phase === 3 ? 4 * phase3Flick : 0)) * S
    // 向下投射的能量光柱（一阶段压迫感最强，二阶段减弱，三阶段熄灭）
    if (phase !== 3) {
      const columnA = phase === 1 ? 0.16 + 0.10 * corePulse : 0.07 + 0.05 * corePulse
      const column = ctx.createLinearGradient(cx0, cy0, cx0, cy0 + 110 * S)
      column.addColorStop(0, `rgba(255,80,100,${coreFlash ? 0.3 : columnA})`)
      column.addColorStop(1, 'rgba(255,59,78,0)')
      ctx.fillStyle = column
      ctx.beginPath()
      ctx.moveTo(cx0 - 12 * S, cy0)
      ctx.lineTo(cx0 + 12 * S, cy0)
      ctx.lineTo(cx0 + 30 * S, cy0 + 110 * S)
      ctx.lineTo(cx0 - 30 * S, cy0 + 110 * S)
      ctx.closePath()
      ctx.fill()
    }
    this.drawLaserGlow(
      cx0,
      cy0,
      coreR,
      (phase === 1 ? 0.5 : 0.85) * (coreFlash ? 1 : 0.55 + 0.4 * corePulse),
      coreFlash ? '255,255,255' : '255,120,140',
      coreFlash ? '255,255,255' : '255,59,78'
    )
    if (phase === 1) {
      // 阶段一：核心被装甲封盖（暗色六角板 + 金色锁环 + 能量缝；受击时封盖闪白）
      ctx.save()
      ctx.translate(cx0, cy0)
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2
        const vx = Math.cos(a) * 14 * S
        const vy = Math.sin(a) * 14 * S
        if (i === 0) ctx.moveTo(vx, vy)
        else ctx.lineTo(vx, vy)
      }
      ctx.closePath()
      ctx.fillStyle = coreFlash ? '#ffffff' : '#2a1219'
      ctx.fill()
      ctx.strokeStyle = coreFlash ? 'rgba(255,255,255,0.95)' : 'rgba(255,190,80,0.6)'
      ctx.lineWidth = 1.4
      ctx.stroke()
      const slit = 0.5 + 0.5 * Math.sin(now / 400)
      ctx.strokeStyle = coreFlash
        ? 'rgba(255,255,255,0.95)'
        : `rgba(255,120,130,${0.25 + 0.35 * slit})`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(0, -8 * S)
      ctx.lineTo(0, 8 * S)
      ctx.stroke()
      ctx.rotate(now / 1500)
      ctx.strokeStyle = coreFlash ? 'rgba(255,255,255,0.9)' : 'rgba(255,210,80,0.5)'
      ctx.lineWidth = 2
      ctx.setLineDash([8 * S, 6 * S])
      ctx.beginPath()
      ctx.arc(0, 0, 20 * S, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    } else if (phase === 2) {
      // 阶段二：中枢激光塔取代核心，此处只留基座微光（激光塔本体由部位绘制）
      ctx.save()
      ctx.translate(cx0, cy0)
      ctx.rotate(now / 1500)
      ctx.strokeStyle = `rgba(255,210,80,${0.25 + 0.15 * corePulse})`
      ctx.lineWidth = 1.6
      ctx.setLineDash([10 * S, 8 * S])
      ctx.beginPath()
      ctx.arc(0, 0, 24 * S, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    } else {
      // 阶段三：核心已毁 —— 破损反应堆残骸 + 明灭火花与电光
      ctx.fillStyle = '#140a0d'
      ctx.beginPath()
      ctx.arc(cx0, cy0, 14 * S, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(255,100,90,${0.35 + 0.2 * Math.sin(now / 260)})`
      ctx.lineWidth = 1.4
      ctx.stroke()
      // 残骸裂缝
      ctx.strokeStyle = 'rgba(20,8,10,0.9)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx0 - 10 * S, cy0 - 4 * S)
      ctx.lineTo(cx0 - 2 * S, cy0 + 3 * S)
      ctx.lineTo(cx0 - 7 * S, cy0 + 10 * S)
      ctx.moveTo(cx0 + 4 * S, cy0 - 8 * S)
      ctx.lineTo(cx0 + 9 * S, cy0 + 2 * S)
      ctx.stroke()
      // 火花与电光（确定性闪烁）
      for (let i = 0; i < 6; i++) {
        const a = i * 1.9 + 0.7
        const d = (8 + (i % 3) * 6) * S
        const fl = 0.5 + 0.5 * Math.sin(now / (80 + i * 43) + i * 2.6)
        if (fl < 0.35) continue
        const sx2 = cx0 + Math.cos(a) * d
        const sy2 = cy0 + Math.sin(a) * d
        ctx.strokeStyle = `rgba(255,160,110,${fl * 0.8})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(sx2, sy2)
        ctx.lineTo(sx2 + Math.cos(a) * 6 * S * fl, sy2 + Math.sin(a) * 6 * S * fl)
        ctx.stroke()
        ctx.fillStyle = `rgba(255,220,150,${fl})`
        ctx.beginPath()
        ctx.arc(sx2, sy2, Math.max(1, 1.3 * k), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // —— 阶段护盾 / 舰体裂纹 ——
    if (phase === 1) {
      // 相位护盾：舰体上交叉的斜纹能量网
      ctx.save()
      poly(hull, undefined) // 只建路径，用于裁剪
      ctx.clip()
      ctx.strokeStyle = 'rgba(255,150,90,0.06)'
      ctx.lineWidth = 1
      const gap = 24 * S
      const [, topY] = P(0, -70)
      const bottomY = y + 70 * S
      for (let ox = -440 * S; ox <= 440 * S; ox += gap) {
        ctx.beginPath()
        ctx.moveTo(x + ox, topY)
        ctx.lineTo(x + ox + 90 * S, bottomY)
        ctx.stroke()
      }
      for (let ox = -350 * S; ox <= 350 * S; ox += gap) {
        ctx.beginPath()
        ctx.moveTo(x + ox + 90 * S, topY)
        ctx.lineTo(x + ox, bottomY)
        ctx.stroke()
      }
      ctx.restore()
    } else {
      // 舰体裂纹（炽红发光裂缝，随狂暴度闪烁；三阶段损伤更严重、裂纹更多）
      const crackA = 0.3 + 0.18 * Math.sin(now / 240) + (phase === 3 ? 0.15 * Math.sin(now / 70) : 0)
      const cracks: [number, number][][] = [
        [[0, 46], [-20, 34], [-10, 24], [-30, 10]],
        [[0, 46], [22, 36], [12, 24], [32, 10]],
        [[-84, 44], [-64, 32], [-78, 18], [-54, 6]],
        [[84, 44], [66, 32], [80, 18], [56, 6]],
        // 三阶段追加：更深的撕裂伤
        ...(phase === 3
          ? ([
              [[-40, 60], [-52, 46], [-36, 36], [-58, 22], [-44, 8]],
              [[40, 60], [52, 46], [36, 36], [58, 22], [44, 8]],
              [[-160, 44], [-172, 30], [-150, 18]],
              [[160, 44], [172, 30], [150, 18]]
            ] as [number, number][][])
          : [])
      ]
      for (const c of cracks) {
        ctx.beginPath()
        c.forEach(([dx2, dy2], i) => {
          const [qx, qy] = P(dx2, dy2)
          if (i === 0) ctx.moveTo(qx, qy)
          else ctx.lineTo(qx, qy)
        })
        ctx.strokeStyle = `rgba(255,90,80,${crackA * 0.35})`
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.strokeStyle = `rgba(255,160,110,${crackA})`
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
      // 三阶段：舰体能量外溢的火花（确定性位置闪烁）
      if (phase === 3) {
        for (let i = 0; i < 7; i++) {
          const spx = -190 + i * 55 + ((i * 37) % 23)
          const spy = 22 + ((i * 13) % 30)
          const fl2 = 0.5 + 0.5 * Math.sin(now / (100 + i * 47) + i * 3.1)
          if (fl2 < 0.4) continue
          const [sx3, sy3] = P(spx, spy)
          ctx.strokeStyle = `rgba(255,170,120,${fl2 * 0.75})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(sx3, sy3)
          ctx.lineTo(sx3 + 5 * S * fl2, sy3 - 4 * S * fl2)
          ctx.stroke()
          ctx.fillStyle = `rgba(255,225,160,${fl2})`
          ctx.beginPath()
          ctx.arc(sx3, sy3, Math.max(1, 1.1 * k), 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // —— 阶段三整舰承伤：受击时舰体描边与覆层闪白 ——
    if (phase === 3 && hullFlash) {
      poly(hull, undefined, 'rgba(255,255,255,0.9)', 2)
      poly(hull, 'rgba(255,255,255,0.14)')
    }

    // —— 部位 ——
    for (const part of b.parts) {
      const wx = x + part.x
      const wy = y + part.y
      if (part.alive) this.drawLeviathanPart(part, wx, wy, S, barrelAims[part.id], now)
      else this.drawLeviathanWreck(part, wx, wy, S)
      // 受损血条
      if (part.alive && part.hp < part.maxHp) {
        const bw = 46 * S
        const bh = Math.max(2, 2.4 * k)
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(wx - bw / 2 - 1, wy - 27 * S - 1, bw + 2, bh + 2)
        ctx.fillStyle = 'rgba(255,210,62,0.95)'
        ctx.fillRect(wx - bw / 2, wy - 27 * S, (bw * part.hp) / part.maxHp, bh)
      }
    }

    // —— 转阶段演出（无敌窗口内）：全屏闪白 + 核心白热膨胀 + 双重冲击波 ——
    if (transitionT > 0) {
      const [tx0, ty0] = P(0, 40)
      const prog = 1 - transitionT / 150 // 0 → 1
      // 开场全屏闪白（快速衰减）
      const flashA = Math.max(0, 0.5 - prog * 1.2)
      if (flashA > 0) {
        ctx.fillStyle = `rgba(255,240,225,${flashA})`
        ctx.fillRect(0, 0, field.width, field.height)
      }
      // 核心位白热膨胀球（吞没旧阶段核心）
      const orbR = (16 + prog * 95) * S
      this.drawLaserGlow(
        tx0,
        ty0,
        orbR,
        0.95 * Math.max(0, 1 - prog),
        '255,255,255',
        '255,200,150'
      )
      // 双重扩散冲击波
      const wave1 = (26 + prog * 170) * S
      ctx.strokeStyle = `rgba(255,220,170,${Math.max(0, 1 - prog) * 0.85})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(tx0, ty0, wave1, 0, Math.PI * 2)
      ctx.stroke()
      const wave2 = (12 + prog * 135) * S
      ctx.strokeStyle = `rgba(255,120,130,${Math.max(0, 1 - prog) * 0.7})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(tx0, ty0, wave2, 0, Math.PI * 2)
      ctx.stroke()
    }

    // —— 死亡演出（解体崩塌，dyingT 210 帧）：
    //    开场闪白 → 舰腹逐段灼烧崩解 → 核心白热膨胀 → 终局冲击波 → 舰体烧黑淡出 ——
    if (dyingT > 0) {
      const p = 1 - dyingT / 210 // 0 → 1
      const [dx0, dy0] = P(0, 40)
      // 开场全屏闪白（快速衰减）
      const flashA = Math.max(0, 0.6 - p * 1.6)
      if (flashA > 0) {
        ctx.fillStyle = `rgba(255,240,225,${flashA})`
        ctx.fillRect(0, 0, field.width, field.height)
      }
      // 舰体逐段崩解：暗色灼烧坑 + 橙红熔边（按伪随机启动点依次出现）
      const spots: [number, number][] = [
        [0, 40], [-78, 56], [78, 56], [-138, 44], [138, 44],
        [-190, 24], [190, 24], [-88, 50], [88, 50], [-175, 18], [175, 18]
      ]
      for (let i = 0; i < spots.length; i++) {
        const sOn = ((i * 37) % 11) / 11
        const sp = Math.max(0, Math.min(1, (p - sOn * 0.75) / 0.3))
        if (sp <= 0) continue
        const [sx, sy] = spots[i]!
        const [wx, wy] = P(sx, sy)
        const r = (4 + sp * 20) * S
        ctx.fillStyle = `rgba(8,3,5,${0.85 * sp})`
        ctx.beginPath()
        ctx.arc(wx, wy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = `rgba(255,150,70,${0.8 * sp})`
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.arc(wx, wy, r + 1.5, 0, Math.PI * 2)
        ctx.stroke()
      }
      // 核心位白热膨胀球（吞没舰体核心区，随推进熄灭）
      this.drawLaserGlow(dx0, dy0, (20 + p * 120) * S, 0.7 * (1 - p), '255,255,255', '255,170,90')
      // 终局巨爆冲击波
      const wave = (10 + p * 240) * S
      ctx.strokeStyle = `rgba(255,220,170,${(1 - p) * 0.9})`
      ctx.lineWidth = 3.2
      ctx.beginPath()
      ctx.arc(dx0, dy0, wave, 0, Math.PI * 2)
      ctx.stroke()
      // 后半程：舰体烧成焦黑并淡出（只盖舰体轮廓，不压暗全屏）
      const fadeA = Math.max(0, (p - 0.55) / 0.45) * 0.92
      if (fadeA > 0) {
        poly(hull, `rgba(10,3,6,${fadeA})`)
      }
    }
  }

  /** 存活部位绘制：turret = 圆形炮座 + 旋转刻度环 + 双联炮管；pod = 四联导弹巢 */
  private drawLeviathanPart(
    part: BossPart,
    wx: number,
    wy: number,
    S: number,
    aim: number | undefined,
    now: number
  ) {
    const ctx = this.ctx
    const flash = part.flash > 0
    const k = Math.min(S, 2) // 小尺寸细节的缩放封顶，避免大屏下过粗

    // 部位辉光
    const pr = part.radius * 1.6
    const pg = ctx.createRadialGradient(wx, wy, 0, wx, wy, pr)
    pg.addColorStop(0, `rgba(255,90,110,${flash ? 0.6 : 0.3})`)
    pg.addColorStop(1, 'rgba(255,90,110,0)')
    ctx.fillStyle = pg
    ctx.fillRect(wx - pr, wy - pr, pr * 2, pr * 2)

    if (part.kind === 'turret') {
      // 挂架（炮塔与舰体的连接结构）
      ctx.fillStyle = flash ? '#8a4a52' : '#241019'
      ctx.fillRect(wx - 11 * S, wy - 19 * S, 22 * S, 7 * S)
      ctx.strokeStyle = 'rgba(255,120,140,0.35)'
      ctx.lineWidth = 1
      ctx.strokeRect(wx - 11 * S, wy - 19 * S, 22 * S, 7 * S)
      // 圆形炮座
      ctx.fillStyle = flash ? '#9a525c' : '#2e131b'
      ctx.beginPath()
      ctx.arc(wx, wy - 3 * S, 16 * S, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,59,78,0.55)'
      ctx.lineWidth = 1.2
      ctx.stroke()
      // 旋转刻度环
      ctx.save()
      ctx.translate(wx, wy - 3 * S)
      ctx.rotate(now / 2600)
      ctx.strokeStyle = 'rgba(255,150,100,0.35)'
      ctx.lineWidth = 1
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * 13 * S, Math.sin(a) * 13 * S)
        ctx.lineTo(Math.cos(a) * 15 * S, Math.sin(a) * 15 * S)
        ctx.stroke()
      }
      ctx.restore()
      // 双联炮管（指向自机）
      const barrelA = aim ?? Math.PI / 2
      ctx.save()
      ctx.translate(wx, wy - 3 * S)
      ctx.rotate(barrelA)
      const bl = 32 * S
      for (const off of [-1, 1]) {
        const bw2 = 3.6 * S
        ctx.fillStyle = flash ? '#ffffff' : '#5a2430'
        ctx.strokeStyle = 'rgba(255,150,120,0.55)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.rect(2 * S, off * 4.4 * S - bw2 / 2, bl - 2 * S, bw2)
        ctx.fill()
        ctx.stroke()
        // 炮管护套
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(bl * 0.42, off * 4.4 * S - bw2 / 2, bl * 0.16, bw2)
        // 炮口
        ctx.fillStyle = 'rgba(255,210,80,0.9)'
        ctx.beginPath()
        ctx.arc(bl, off * 4.4 * S, Math.max(1.2, 2 * k), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      // 炮口聚能微光
      this.drawLaserGlow(
        wx + Math.cos(barrelA) * bl,
        wy - 3 * S + Math.sin(barrelA) * bl,
        6.5 * S,
        0.35,
        '255,180,100',
        '255,90,40'
      )
      // 炮塔指示灯
      const blink = Math.sin(now / 300 + part.id.charCodeAt(0)) > 0.2 ? 0.95 : 0.25
      ctx.fillStyle = `rgba(255,80,90,${blink})`
      ctx.beginPath()
      ctx.arc(wx, wy - 15 * S, Math.max(1, 1.2 * k), 0, Math.PI * 2)
      ctx.fill()
    } else if (part.kind === 'beam') {
      // 中枢激光塔：塔身 + 金色聚焦环 + 能量核心 + 下指聚能晶体
      ctx.fillStyle = flash ? '#8a4a52' : '#241019'
      ctx.fillRect(wx - 9 * S, wy - 20 * S, 18 * S, 9 * S)
      ctx.strokeStyle = 'rgba(255,120,140,0.35)'
      ctx.lineWidth = 1
      ctx.strokeRect(wx - 9 * S, wy - 20 * S, 18 * S, 9 * S)
      // 塔身
      ctx.fillStyle = flash ? '#9a525c' : '#2e131b'
      ctx.beginPath()
      ctx.arc(wx, wy - 4 * S, 15 * S, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,59,78,0.55)'
      ctx.lineWidth = 1.2
      ctx.stroke()
      // 金色聚焦环（旋转刻度）
      ctx.save()
      ctx.translate(wx, wy - 4 * S)
      ctx.rotate(now / 1300)
      ctx.strokeStyle = 'rgba(255,210,80,0.6)'
      ctx.lineWidth = 1.6
      ctx.setLineDash([7 * S, 5 * S])
      ctx.beginPath()
      ctx.arc(0, 0, 11 * S, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
      // 能量核心（白金色光球，蓄能脉动）
      const beamPulse = 0.6 + 0.4 * Math.sin(now / 160)
      this.drawLaserGlow(
        wx,
        wy - 4 * S,
        6 * S,
        flash ? 1 : 0.75 * beamPulse,
        '255,235,180',
        '255,150,80'
      )
      // 下指聚能晶体 + 炮口光
      const barrelA = aim ?? Math.PI / 2
      ctx.save()
      ctx.translate(wx, wy - 4 * S)
      ctx.rotate(barrelA)
      ctx.fillStyle = flash ? '#ffffff' : '#5a2430'
      ctx.beginPath()
      ctx.moveTo(6 * S, -4 * S)
      ctx.lineTo(24 * S, 0)
      ctx.lineTo(6 * S, 4 * S)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,210,120,0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
      this.drawLaserGlow(
        wx + Math.cos(barrelA) * 24 * S,
        wy - 4 * S + Math.sin(barrelA) * 24 * S,
        7 * S,
        0.4 * beamPulse,
        '255,235,180',
        '255,150,80'
      )
    } else {
      // 导弹巢：梯形舱体 + 警示条纹 + 四联待发弹头
      const w2 = 21 * S
      const h2 = 10 * S
      ctx.beginPath()
      ctx.moveTo(wx - w2, wy - h2 * 0.8)
      ctx.lineTo(wx + w2, wy - h2)
      ctx.lineTo(wx + w2 * 1.1, wy + h2)
      ctx.lineTo(wx - w2 * 1.1, wy + h2 * 0.8)
      ctx.closePath()
      ctx.fillStyle = flash ? '#8a4a52' : '#2a0f16'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,59,78,0.5)'
      ctx.lineWidth = 1
      ctx.stroke()
      // 警示条纹
      ctx.save()
      ctx.beginPath()
      ctx.rect(wx - w2 * 1.1, wy - 1.5 * S, w2 * 2.2, 3 * S)
      ctx.clip()
      ctx.fillStyle = 'rgba(255,190,60,0.5)'
      for (let ox = -w2 * 1.2; ox < w2 * 1.2; ox += 6 * S) {
        ctx.beginPath()
        ctx.moveTo(wx + ox, wy + 2 * S)
        ctx.lineTo(wx + ox + 3 * S, wy - 2 * S)
        ctx.lineTo(wx + ox + 3 * S + 1, wy - 2 * S)
        ctx.lineTo(wx + ox + 1, wy + 2 * S)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
      // 四联弹头（红色弹尖 + 白点高光）
      for (let i = -1.5; i <= 1.5; i++) {
        const mx = wx + i * 7.5 * S
        const mrr = Math.max(1.6, 3 * k)
        ctx.fillStyle = '#160a0d'
        ctx.beginPath()
        ctx.arc(mx, wy, mrr + 0.8, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = flash ? '#ffffff' : '#ff3b4e'
        ctx.beginPath()
        ctx.arc(mx, wy, mrr * 0.72, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.beginPath()
        ctx.arc(mx - mrr * 0.22, wy - mrr * 0.22, mrr * 0.28, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  /** 击毁部位残骸：焦黑底座 + 断裂部件（确定性姿态）+ 明灭余烬 */
  private drawLeviathanWreck(part: BossPart, wx: number, wy: number, S: number) {
    const ctx = this.ctx
    const now = performance.now()
    // 按部位 id 取确定性随机（残骸姿态 / 余烬位置稳定不跳变）
    const h = (part.id.charCodeAt(0) * 31 + part.id.charCodeAt(part.id.length - 1) * 7) / 997
    const rot = h * Math.PI * 2

    ctx.save()
    ctx.globalAlpha = 0.8
    // 焦黑底座
    ctx.fillStyle = '#120a0c'
    ctx.beginPath()
    ctx.arc(wx, wy, (part.kind === 'turret' ? 15 : 17) * S, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,100,90,0.28)'
    ctx.lineWidth = 1
    ctx.stroke()

    // 断裂部件
    ctx.save()
    ctx.translate(wx, wy)
    ctx.rotate(rot)
    ctx.fillStyle = '#1a0d10'
    if (part.kind === 'turret') {
      // 折断的炮管残根（两截错位）
      ctx.fillRect(2 * S, -2 * S, 16 * S, 4 * S)
      ctx.rotate(0.8 + h)
      ctx.fillRect(-6 * S, -1.5 * S, 11 * S, 3 * S)
    } else if (part.kind === 'beam') {
      // 断裂的塔身 + 碎裂的能量晶体（熄灭的核心）
      ctx.fillRect(-8 * S, -4 * S, 15 * S, 8 * S)
      ctx.rotate(1.2 + h)
      ctx.fillRect(-4 * S, -2 * S, 10 * S, 4 * S)
      ctx.fillStyle = '#0a0506'
      ctx.beginPath()
      ctx.arc(0, 0, 3.4 * S, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // 变形的舱体 + 三个空弹孔
      ctx.fillRect(-13 * S, -6 * S, 26 * S, 11 * S)
      ctx.fillStyle = '#0a0506'
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.arc(i * 8 * S, 0, 3.4 * S, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()

    // 明灭余烬（确定性位置 + 时间闪烁）
    for (let i = 0; i < 3; i++) {
      const a = h * 6.28 + i * 2.1
      const d = (6 + i * 5) * S
      const fl = 0.35 + 0.35 * Math.sin(now / (120 + i * 60) + h * 20 + i * 2)
      if (fl < 0.25) continue
      ctx.fillStyle = `rgba(255,${Math.round(120 + fl * 80)},70,${fl * 0.8})`
      ctx.beginPath()
      ctx.arc(
        wx + Math.cos(a) * d,
        wy + Math.sin(a) * d,
        Math.max(1, (1.2 + fl) * Math.min(S, 2)),
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
    // 报废标记：暗红 ✕，一眼看出该目标已失效
    ctx.strokeStyle = 'rgba(255,110,110,0.55)'
    ctx.lineWidth = 2
    const s2 = 6 * S
    ctx.beginPath()
    ctx.moveTo(wx - s2, wy - s2)
    ctx.lineTo(wx + s2, wy + s2)
    ctx.moveTo(wx + s2, wy - s2)
    ctx.lineTo(wx - s2, wy + s2)
    ctx.stroke()
    ctx.restore()
  }

  private drawParticles(pool: ParticlePool, a: number) {
    const ctx = this.ctx
    for (let i = 0; i < pool.items.length; i++) {
      const p = pool.items[i]!
      if (!p.active) continue
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(lerp(p.px, p.x, a), lerp(p.py, p.y, a), p.size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /**
   * 双子星卫（Castor & Pollux）：四颗环绕自机的金色防御卫星——
   * 淡轨道环 + 四颗均匀分布的实心金球（无光晕，避免晃眼），
   * 叠加混合调用（挡弹判定见 game.ts updateGeminiOrbs）
   */
  private drawTwinGuard(px: number, py: number, angle: number) {
    const ctx = this.ctx
    const count = BALANCE.gemini.orbCount
    const orbitR = BALANCE.gemini.orbitRadius
    const orbR = BALANCE.gemini.orbRadius

    // 轨道环：双星彼此守望的轨迹
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.14)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.arc(px, py, orbitR, 0, Math.PI * 2)
    ctx.stroke()

    for (let i = 0; i < count; i++) {
      const a = angle + (i * Math.PI * 2) / count
      const ox = px + Math.cos(a) * orbitR
      const oy = py + Math.sin(a) * orbitR

      // 实心金球（无辉光渐变）
      ctx.fillStyle = 'rgba(217, 164, 32, 0.9)'
      ctx.beginPath()
      ctx.arc(ox, oy, orbR * 0.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /**
   * 电磁脉冲全屏冲击波：从自机扩散到全屏的电弧波前——
   * 波前是逐帧随机抖动的锯齿闪电圆环（青色外发光 + 白芯两层描边），
   * 波源到波前之间填充径向渐变的能量闪光，整体随扩散淡出（叠加混合调用）
   */
  private drawEmpPulses(pulses: EmpPulse[]) {
    const ctx = this.ctx
    const w = field.width
    const h = field.height
    for (const p of pulses) {
      const prog = 1 - p.ttl / p.max
      // ease-out：波前前快后慢，铺满全屏后缓缓收尾
      const eased = 1 - (1 - prog) * (1 - prog)
      // 覆盖全屏所需半径：波源到最远屏幕角的距离 + 余量
      const maxR =
        Math.hypot(Math.max(p.x, w - p.x), Math.max(p.y, h - p.y)) + 80
      const r = Math.max(1, maxR * eased)
      const fade = p.ttl / p.max

      // 波内能量闪光：中心亮、向外淡出的径向渐变
      const fill = ctx.createRadialGradient(p.x, p.y, r * 0.1, p.x, p.y, r)
      fill.addColorStop(0, `rgba(165, 243, 252, ${0.16 * fade})`)
      fill.addColorStop(0.7, `rgba(103, 232, 249, ${0.08 * fade})`)
      fill.addColorStop(1, 'rgba(103, 232, 249, 0)')
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()

      // 电弧波前：锯齿化圆环两层描边（外层宽发光、内层亮白芯）
      const segs = 72
      const jag = 6 + r * 0.05
      this.traceJaggedRing(p.x, p.y, r, jag, segs)
      ctx.strokeStyle = `rgba(103, 232, 249, ${0.5 * fade})`
      ctx.lineWidth = 8
      ctx.stroke()
      this.traceJaggedRing(p.x, p.y, r, jag * 0.6, segs)
      ctx.strokeStyle = `rgba(236, 254, 255, ${0.95 * fade})`
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  /**
   * 电子超载电弧（EMP 干扰中的敌机 / Boss）：
   * 覆盖机体的青色电晕脉动 + 从机体向外抽出的锯齿闪电，
   * 逐帧随机抖动与随机缺帧模拟高压放电的闪烁感
   */
  private drawStunArcs(x: number, y: number, bodyR: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    // 超载电晕：随时间脉动的青色光晕
    const pulse = 0.7 + 0.3 * Math.sin(this.tick * 0.6 + x + y)
    const glowR = bodyR * 2.2
    const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR)
    grad.addColorStop(0, `rgba(103, 232, 249, ${0.35 * pulse})`)
    grad.addColorStop(1, 'rgba(103, 232, 249, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(x - glowR, y - glowR, glowR * 2, glowR * 2)

    // 抽出的电弧：从机体边缘向外放射的锯齿闪电
    for (let i = 0; i < 4; i++) {
      if (Math.random() < 0.2) continue // 随机缺帧闪烁
      const a = Math.random() * Math.PI * 2
      const r0 = bodyR * 0.4
      const r1 = bodyR + 8 + Math.random() * 10
      const x0 = x + Math.cos(a) * r0
      const y0 = y + Math.sin(a) * r0
      const x1 = x + Math.cos(a) * r1
      const y1 = y + Math.sin(a) * r1
      // 外层青色发光 + 内层白芯
      this.traceBolt(x0, y0, x1, y1, 3.5)
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)'
      ctx.lineWidth = 2.5
      ctx.stroke()
      this.traceBolt(x0, y0, x1, y1, 2.5)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    ctx.restore()
  }

  /** 锯齿闪电路径：从 (x1,y1) 到 (x2,y2) 的折线，中间点随机偏移 */
  private traceBolt(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    jag: number
  ) {
    const ctx = this.ctx
    const segs = 4
    const dx = x2 - x1
    const dy = y2 - y1
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    for (let i = 1; i < segs; i++) {
      const t = i / segs
      ctx.lineTo(
        x1 + dx * t + (Math.random() - 0.5) * 2 * jag,
        y1 + dy * t + (Math.random() - 0.5) * 2 * jag
      )
    }
    ctx.lineTo(x2, y2)
  }

  /** 锯齿圆环路径：圆周采样点加径向随机抖动，形成闪电状波前 */
  private traceJaggedRing(
    x: number,
    y: number,
    r: number,
    jag: number,
    segs: number
  ) {
    const ctx = this.ctx
    ctx.beginPath()
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2
      const rr = r + (Math.random() - 0.5) * 2 * jag
      const px = x + Math.cos(a) * rr
      const py = y + Math.sin(a) * rr
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
  }

  /**
   * 浮游炮（激光子机，需在 'lighter' 叠加混合层中调用）：
   * 缓慢自转的菱形机体 + 径向辉光 + 外圈旋转刻度环，
   * 部署途中（deploy）透明度较低，就位后全亮
   */
  private drawEnemyBits(bits: EnemyLaserBit[], a: number) {
    const ctx = this.ctx
    const now = performance.now()
    for (const b of bits) {
      const x = lerp(b.px, b.x, a)
      const y = lerp(b.py, b.y, a)
      const ready = b.state === 'active'
      const k = ready ? 1 : 0.55 + 0.2 * Math.sin(now / 90)

      // 径向辉光（预渲染光球贴图，避免逐帧渐变）
      ctx.globalAlpha = 0.5 * k
      ctx.drawImage(this.getLaserBallSprite(b.color), x - 26, y - 26, 52, 52)

      // 旋转刻度环
      ctx.globalAlpha = 0.35 * k
      ctx.strokeStyle = b.color
      ctx.lineWidth = 1.2
      ctx.setLineDash([4, 6])
      ctx.lineDashOffset = (now / 1000) * 30
      ctx.beginPath()
      ctx.arc(x, y, 11, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // 菱形机体（缓慢自转）
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(b.t * 0.02)
      ctx.globalAlpha = 0.95 * k
      ctx.fillStyle = b.color
      ctx.beginPath()
      ctx.moveTo(0, -8)
      ctx.lineTo(5.5, 0)
      ctx.lineTo(0, 8)
      ctx.lineTo(-5.5, 0)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 0.9 * k
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(0, 0, 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  /**
   * 敌激光（Boss 光束武器，需在 'lighter' 叠加混合层中调用）：
   * 三阶段绘制——telegraph 预警线脉冲闪烁；firing 全功率光束；fading 熄灭残影。
   * 性能：辉光用预渲染截面贴图拉伸绘制（每束 1 次 drawImage，无逐帧渐变/虚线），
   * 白芯单条细线、光球用预渲染径向贴图；全部光束先绘入半分辨率离屏层，
   * 最后一次性放大合成到主画布，同屏 35+ 光束保持流畅。
   */
  private drawEnemyLasers(lasers: EnemyLaser[]) {
    // 目标上下文：优先半分辨率离屏层（见 laserLayer 字段注释），不可用时回退主画布
    const layer = this.laserLayer
    const lctx = this.laserLayerCtx
    const ctx = lctx ?? this.ctx
    if (layer && lctx) {
      lctx.setTransform(1, 0, 0, 1, 0, 0)
      lctx.clearRect(0, 0, layer.width, layer.height)
      const s = this.scale * Renderer.LASER_LAYER_SCALE
      lctx.setTransform(s, 0, 0, s, 0, 0)
      // 层内同样叠加混合，保证光束交叠处亮度与直接绘制一致
      lctx.globalCompositeOperation = 'lighter'
    }
    const now = performance.now()
    ctx.lineCap = 'round'

    /** 拉伸光束贴图（save/rotate/drawImage，替代多层宽描边 + 虚线） */
    const drawBeam = (
      sprite: HTMLCanvasElement,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      width: number,
      alpha: number
    ) => {
      const len = Math.hypot(x2 - x1, y2 - y1)
      if (len < 1 || alpha <= 0.003) return
      ctx.save()
      ctx.translate(x1, y1)
      ctx.rotate(Math.atan2(y2 - y1, x2 - x1))
      ctx.globalAlpha = alpha
      ctx.drawImage(sprite, 0, -width / 2, len, width)
      ctx.restore()
    }
    /** 光球贴图 */
    const drawBall = (
      sprite: HTMLCanvasElement,
      x: number,
      y: number,
      r: number,
      alpha: number
    ) => {
      if (alpha <= 0.003) return
      ctx.globalAlpha = alpha
      ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2)
    }

    for (const l of lasers) {
      const ex = l.x + Math.cos(l.angle) * l.len
      const ey = l.y + Math.sin(l.angle) * l.len
      const beamSprite = this.getLaserBeamSprite(l.color)
      const ballSprite = this.getLaserBallSprite(l.color)
      const w = l.cfg.halfWidth

      if (l.state === 'telegraph') {
        // 预警线：透明度随预警进度上升 + 快速脉冲，宽度向最终光束收敛
        const p = Math.min(1, l.t / l.cfg.telegraph)
        const flash = 0.5 + 0.5 * Math.sin(now / 30)
        const k = (0.3 + 0.7 * p) * (0.45 + 0.55 * flash)
        drawBeam(beamSprite, l.x, l.y, ex, ey, w * 2 + 6, 0.4 * k)
        ctx.globalAlpha = 0.6 * k
        ctx.strokeStyle = l.color
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(l.x, l.y)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        // 炮口聚能点
        drawBall(ballSprite, l.x, l.y, 12 + 6 * p, 0.5 * k)
      } else if (l.state === 'firing') {
        // 全功率光束：呼吸脉动（约 0.5s 周期）
        const pulse = 0.9 + 0.1 * Math.sin(now / 80)
        drawBeam(beamSprite, l.x, l.y, ex, ey, w * 2 + 10, 0.8 * pulse)
        // 白芯
        ctx.globalAlpha = 0.9 * pulse
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = Math.max(2, w * 0.42)
        ctx.beginPath()
        ctx.moveTo(l.x, l.y)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        // 炮口聚能光球
        drawBall(ballSprite, l.x, l.y, Math.min(24, w + 8), pulse)
      } else {
        // 熄灭残影：按剩余帧数线性淡出
        const k = Math.max(0, 1 - l.t / l.cfg.fade)
        drawBeam(beamSprite, l.x, l.y, ex, ey, w * 2 + 10, 0.45 * k)
        ctx.globalAlpha = 0.8 * k
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = Math.max(2, w * 0.42)
        ctx.beginPath()
        ctx.moveTo(l.x, l.y)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    // 离屏层绘制完成：一次性放大合成到主画布（调用方已处于 'lighter' 叠加混合）
    if (layer) {
      this.ctx.drawImage(layer, 0, 0, field.width, field.height)
    }
  }

  /**
   * 激光束：流明光电风格的多层能量光束（需在 'lighter' 叠加混合层中调用）——
   * 外层橙色宽辉光 + 中层亮橙 + 白芯 + 沿光束奔流的能量段（动效），
   * 整体随呼吸节律脉动，炮口有聚能光球，命中端有爆闪光辉；
   * 松开射击后透明度随剩余帧数线性衰减
   */
  private drawLaserBeams(beams: LaserBeam[]) {
    const ctx = this.ctx
    const now = performance.now()
    // 呼吸脉动（约 0.9s 周期）叠加高频能量闪烁
    const pulse = 0.85 + 0.15 * Math.sin(now / 140)
    ctx.lineCap = 'round'
    for (const b of beams) {
      const k = Math.max(0, b.ttl / b.max) * pulse
      if (Math.hypot(b.x2 - b.x1, b.y2 - b.y1) < 1) continue
      const line = () => {
        ctx.beginPath()
        ctx.moveTo(b.x1, b.y1)
        ctx.lineTo(b.x2, b.y2)
        ctx.stroke()
      }
      // 外层橙色宽辉光
      ctx.globalAlpha = 0.16 * k
      ctx.strokeStyle = '#ff8c1e'
      ctx.lineWidth = 18
      line()
      // 中层亮橙辉光
      ctx.globalAlpha = 0.32 * k
      ctx.strokeStyle = '#ffb75e'
      ctx.lineWidth = 10
      line()
      // 沿光束奔流的能量段（移动虚线）
      ctx.globalAlpha = 0.7 * k
      ctx.strokeStyle = '#ffe9c4'
      ctx.lineWidth = 6
      ctx.setLineDash([30, 38])
      ctx.lineDashOffset = -(now / 1000) * 420
      line()
      ctx.setLineDash([])
      // 白芯
      ctx.globalAlpha = 0.95 * k
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3.5
      line()
      // 炮口聚能光球
      this.drawLaserGlow(b.x1, b.y1, 11 + 3.5 * pulse, k)
      // 命中端爆闪光辉
      if (b.hit) this.drawLaserGlow(b.x2, b.y2, 16 + 5 * pulse, k)
    }
    ctx.globalAlpha = 1
  }

  /**
   * 蓄力电弧（LW-04 特斯拉，需在 'lighter' 叠加混合层中调用）：
   * Storm Lance 风格的程序化闪电——沿射线采样节点，垂直方向叠加
   * 分段线性随机折角（逐帧重抽，等效高频重击频闪），全程抖动幅度
   * 一致、宽度均匀；宽橙辉光 + 亮橙中层 + 白芯共形三层描边，
   * 外加一条更野的伴生细弧，整体随 ttl 淡出并做量化明暗跳变
   */
  private drawArcBeams(beams: ArcBeam[]) {
    const ctx = this.ctx
    const now = performance.now()
    // 量化频闪：真闪电是明暗跳变而非平滑呼吸（约 25 次/秒，三帧一暗）
    const strobe = Math.floor(now / 40) % 3 === 0 ? 0.45 : 1
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const b of beams) {
      const k = Math.max(0, b.ttl / b.max) * strobe
      const dx = b.x2 - b.x1
      const dy = b.y2 - b.y1
      const len = Math.hypot(dx, dy)
      if (len < 1) continue
      // 垂直于射线的法向（折角偏移方向）
      const nx = -dy / len
      const ny = dx / len
      const segs = Math.max(12, Math.floor(len / 26))
      // 蓄力梯度：充能越足折角越剧烈、线宽越粗（低充能只是一缕细丝）
      const pow = b.power
      const jag = 2 + 5 * pow
      const wScale = 0.45 + 0.75 * pow
      // 蓄力等级配色：浅蓝 → 蓝 → 紫 → 红（见 utils/chargeColors.ts）
      const pal = chargePalette(pow)

      // 生成一条折角路径（全程抖动幅度一致，不做两端包络——
      // 包络会让电弧读作"前细后粗"）
      const buildPath = (jagScale: number) => {
        const pts: number[] = []
        for (let i = 0; i <= segs; i++) {
          const t = i / segs
          const off = (Math.random() - 0.5) * 2 * jag * jagScale
          pts.push(b.x1 + dx * t + nx * off, b.y1 + dy * t + ny * off)
        }
        return pts
      }
      const strokePath = (pts: number[], width: number, style: string, alpha: number) => {
        ctx.globalAlpha = alpha
        ctx.strokeStyle = style
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(pts[0]!, pts[1]!)
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!)
        ctx.stroke()
      }

      // 主弧：同一条路径画三层（辉光共形贴住白芯的每个折角）
      const main = buildPath(1)
      strokePath(main, 9 * wScale, pal.glow, 0.16 * k)
      strokePath(main, 4 * wScale, pal.mid, 0.32 * k)
      strokePath(main, 1.8 * wScale, '#ffffff', 0.95 * k)
      // 伴生细弧：独立折角、抖动更野；蓄力越足条数越多（1~3 条）
      const branches = 1 + Math.round(pow * 2)
      for (let i = 0; i < branches; i++) {
        strokePath(buildPath(1.6), 0.9 * wScale, pal.branch, 0.5 * k)
      }
      // 炮口爆闪光球（随蓄力增大）
      this.drawLaserGlow(b.x1, b.y1, 10 + 10 * pow, k, pal.glowMid, pal.glowEdge)
    }
    ctx.globalAlpha = 1
  }

  /**
   * 蓄力指示圈（LW-04 特斯拉蓄力中，需在 'lighter' 叠加混合层中调用）：
   * 炮口前方随充能逐渐变大的聚能圈——外圈 + 反向旋转的刻度虚线环 +
   * 中心聚能光球；充满后转为白炽脉动，提示可以松手发射
   */
  private drawChargeRing(p: Player, px: number, py: number, pa: number) {
    const ratio = p.chargeRatio
    const ctx = this.ctx
    const now = performance.now()
    const full = ratio >= 1
    const cx = px + Math.cos(pa) * 26
    const cy = py + Math.sin(pa) * 26
    const r = 5 + 17 * ratio
    // 蓄力等级配色：浅蓝 → 蓝 → 紫 → 红（见 utils/chargeColors.ts）
    const pal = chargePalette(ratio)

    // 外圈
    ctx.globalAlpha = 0.3 + 0.5 * ratio
    ctx.strokeStyle = pal.mid
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()

    // 旋转刻度虚线环（向中心收束的动势）
    ctx.globalAlpha = 0.2 + 0.55 * ratio
    ctx.strokeStyle = pal.glow
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 7])
    ctx.lineDashOffset = (now / 1000) * 60
    ctx.beginPath()
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // 中心聚能光球（充满时炽烈脉动）
    const pulse = full ? 0.75 + 0.25 * Math.sin(now / 60) : 1
    this.drawLaserGlow(cx, cy, Math.max(2, r * 0.8 * pulse), 0.4 + 0.6 * ratio, pal.glowMid, pal.glowEdge)
    ctx.globalAlpha = 1
  }

  /** 激光光球：白心彩边的径向渐变光晕（mid/edge 为 RGB 分量字符串，缺省橙色） */
  private drawLaserGlow(
    x: number,
    y: number,
    r: number,
    k: number,
    mid = '255,183,94',
    edge = '255,140,30'
  ) {
    const ctx = this.ctx
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`)
    g.addColorStop(0.4, `rgba(${mid},${0.5 * k})`)
    g.addColorStop(1, `rgba(${edge},0)`)
    ctx.globalAlpha = 1
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  /**
   * 冲刺尾翼：沿自机近期路径绘制连续激光光带（外层本色辉光 + 内层亮线），
   * 从自机当前位置向尾迹末端逐段渐细渐暗
   */
  private drawSprintTrail(p: Player, a: number) {
    const trail = p.sprintTrail
    const n = trail.length
    if (n < 2) return
    const ctx = this.ctx
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // 路径点：自机插值位置 → 最近尾迹点 → … → 最远尾迹点
    const sx = lerp(p.px, p.x, a)
    const sy = lerp(p.py, p.y, a)
    const pts: { x: number; y: number }[] = [{ x: sx, y: sy }]
    for (let i = n - 1; i >= 0; i--) pts.push(trail[i]!)
    const segs = pts.length - 1
    for (let i = 0; i < segs; i++) {
      const t = 1 - i / segs // 1=头部(粗亮), 0=尾部(细暗)
      // 外层辉光
      ctx.strokeStyle = p.color
      ctx.globalAlpha = 0.28 * t
      ctx.lineWidth = 8 * t + 1.5
      ctx.beginPath()
      ctx.moveTo(pts[i]!.x, pts[i]!.y)
      ctx.lineTo(pts[i + 1]!.x, pts[i + 1]!.y)
      ctx.stroke()
      // 内层亮线
      ctx.globalAlpha = 0.75 * t
      ctx.lineWidth = 2.5 * t + 0.5
      ctx.beginPath()
      ctx.moveTo(pts[i]!.x, pts[i]!.y)
      ctx.lineTo(pts[i + 1]!.x, pts[i + 1]!.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}
