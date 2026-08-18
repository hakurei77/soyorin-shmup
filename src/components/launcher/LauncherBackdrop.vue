<script setup lang="ts">
/**
 * 启动页背景层
 * 职责：网格背景 / 辉光 / 漂浮粒子 / 背景小飞机空战 / 巨型装饰文字 / 扫描线 / 四角取景框
 * 纯展示组件，无事件，仅通过 props 定制装饰文字
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

withDefaults(
  defineProps<{
    /** 左上巨型装饰文字 */
    megaTop?: string
    /** 右下巨型装饰文字 */
    megaBottom?: string
  }>(),
  { megaTop: 'MIAONAI', megaBottom: 'PRJ' }
)

const canvasRef = ref<HTMLCanvasElement | null>(null)

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  s: number
  o: number
  c: string
  /** 锁定进度 0~1（AI 检测框动画用） */
  lock: number
  /** 稳定的伪随机置信度基准，避免每帧跳动 */
  conf: number
}

interface Plane {
  x: number
  y: number
  /** 航向角（弧度） */
  angle: number
  speed: number
  /** 每帧最大转向角 */
  turn: number
  /** 0 = 青队，1 = 紫队 */
  team: 0 | 1
  hp: number
  /** 开火冷却（帧） */
  cool: number
  /** 存活帧数，到龄后脱离战场直飞离场 */
  age: number
  dead: boolean
}

interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  team: 0 | 1
  life: number
}

interface Boom {
  x: number
  y: number
  r: number
  a: number
}

/** 场上同时存在的最大飞机数 */
const PLANE_MAX = 14
/** 飞机服役帧数上限，到龄后脱离缠斗飞离背景 */
const PLANE_RETIRE_AGE = 1100
/** 开火距离 */
const FIRE_RANGE = 260
/** 子弹命中判定半径 */
const HIT_R = 10

/** 检测半径（鼠标附近多少像素内的粒子会被“识别”） */
const DETECT_RADIUS = 150
/** 检测框完全锁定后的半边长 */
const BOX_HALF = 14
/** 检测框未锁定时的半边长（从大到小收缩 = 锁定动画） */
const BOX_HALF_MAX = 34

let raf = 0
let onResize: (() => void) | null = null
let onMouseMove: ((e: MouseEvent) => void) | null = null
let onMouseOut: (() => void) | null = null

onMounted(() => {
  const cv = canvasRef.value!
  const ctx = cv.getContext('2d')!
  let w = 0
  let h = 0

  onResize = () => {
    w = cv.width = window.innerWidth
    h = cv.height = window.innerHeight
  }
  onResize()
  window.addEventListener('resize', onResize)

  // 背景层 pointer-events: none，鼠标位置从 window 监听
  const mouse = { x: 0, y: 0, active: false }
  onMouseMove = (e: MouseEvent) => {
    mouse.x = e.clientX
    mouse.y = e.clientY
    mouse.active = true
  }
  onMouseOut = () => {
    mouse.active = false
  }
  window.addEventListener('mousemove', onMouseMove)
  document.documentElement.addEventListener('mouseleave', onMouseOut)

  const parts: Particle[] = Array.from({ length: 70 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    s: Math.random() * 2 + 0.6,
    o: Math.random() * 0.5 + 0.15,
    c: Math.random() < 0.3 ? '#bb99f5' : '#5ee6ff',
    lock: 0,
    conf: 92 + Math.random() * 7.5
  }))

  /* ===== 背景小飞机空战 ===== */
  const planes: Plane[] = []
  const bullets: Bullet[] = []
  const booms: Boom[] = []
  let spawnTimer = 0

  /** 从随机一条边外生成一架朝屏幕内飞的小飞机 */
  function spawnPlane(team?: 0 | 1) {
    const edge = (Math.random() * 4) | 0
    let x = 0
    let y = 0
    if (edge === 0) {
      x = Math.random() * w
      y = -12
    } else if (edge === 1) {
      x = w + 12
      y = Math.random() * h
    } else if (edge === 2) {
      x = Math.random() * w
      y = h + 12
    } else {
      x = -12
      y = Math.random() * h
    }
    const angle = Math.atan2(
      h / 2 - y + (Math.random() - 0.5) * h * 0.7,
      w / 2 - x + (Math.random() - 0.5) * w * 0.7
    )
    planes.push({
      x,
      y,
      angle,
      speed: 1.3 + Math.random() * 0.9,
      turn: 0.03 + Math.random() * 0.025,
      team: team ?? (Math.random() < 0.5 ? 0 : 1),
      hp: 3,
      cool: 40 + Math.random() * 60,
      age: 0,
      dead: false
    })
  }

  // 开场先来一波 3v3
  for (let i = 0; i < 6; i++) spawnPlane((i % 2) as 0 | 1)

  /** 最短角差（b - a，归一化到 [-PI, PI]） */
  function angDiff(a: number, b: number) {
    let d = b - a
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return d
  }

  /** 空战模拟：补充编队 / 索敌转向 / 开火命中 / 爆炸 / 离场 */
  function updateCombat() {
    if (--spawnTimer <= 0 && planes.length < PLANE_MAX) {
      if (planes.length === 0) {
        // 场上打空了 → 双方各来一架开启新一轮
        spawnPlane(0)
        spawnPlane(1)
      } else {
        spawnPlane()
      }
      spawnTimer = 70 + Math.random() * 90
    }

    for (const p of planes) {
      p.age++
      const retiring = p.age > PLANE_RETIRE_AGE

      // 索敌：最近的敌机（退役飞机不再缠斗）
      let target: Plane | null = null
      let best = Infinity
      if (!retiring) {
        for (const q of planes) {
          if (q === p || q.dead || q.team === p.team) continue
          const dx = q.x - p.x
          const dy = q.y - p.y
          const d2 = dx * dx + dy * dy
          if (d2 < best) {
            best = d2
            target = q
          }
        }
      }

      if (target) {
        // 朝目标转向（限制角速度，形成咬尾盘旋）
        const want = Math.atan2(target.y - p.y, target.x - p.x)
        const d = angDiff(p.angle, want)
        p.angle += Math.max(-p.turn, Math.min(p.turn, d))
        // 机头大致对准且进入射程 → 开火
        if (--p.cool <= 0 && best < FIRE_RANGE * FIRE_RANGE && Math.abs(d) < 0.5) {
          bullets.push({
            x: p.x + Math.cos(p.angle) * 12,
            y: p.y + Math.sin(p.angle) * 12,
          vx: Math.cos(p.angle) * 4.2,
          vy: Math.sin(p.angle) * 4.2,
          team: p.team,
          // 无限射程：永不因距离衰减消失
          life: Infinity
        })
          p.cool = 36 + Math.random() * 60
        }
      }

      p.x += Math.cos(p.angle) * p.speed
      p.y += Math.sin(p.angle) * p.speed

      // 无仗可打或到龄退役 → 保持航向直飞，出屏即离场
      if (
        (!target || retiring) &&
        (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60)
      ) {
        p.dead = true
      }
    }

    // 子弹推进 + 命中判定
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]!
      b.x += b.vx
      b.y += b.vy
      let gone =
        --b.life <= 0 || b.x < -20 || b.x > w + 20 || b.y < -20 || b.y > h + 20
      if (!gone) {
        for (const p of planes) {
          if (p.dead || p.team === b.team) continue
          const dx = p.x - b.x
          const dy = p.y - b.y
          if (dx * dx + dy * dy < HIT_R * HIT_R) {
            if (--p.hp <= 0) p.dead = true
            gone = true
            break
          }
        }
      }
      if (gone) bullets.splice(i, 1)
    }

    // 坠毁的产生爆炸，正常离场的直接移除
    for (let i = planes.length - 1; i >= 0; i--) {
      const p = planes[i]!
      if (!p.dead) continue
      if (p.hp <= 0) booms.push({ x: p.x, y: p.y, r: 3, a: 1 })
      planes.splice(i, 1)
    }

    // 爆炸扩散
    for (let i = booms.length - 1; i >= 0; i--) {
      const bo = booms[i]!
      bo.r += 1.6
      bo.a -= 0.035
      if (bo.a <= 0) booms.splice(i, 1)
    }
  }

  /** 绘制空战：曳光弹 / 三角小飞机 / 爆炸圆环 */
  function drawCombat() {
    // 子弹：短促的曳光条
    ctx.lineWidth = 1.5
    for (const b of bullets) {
      ctx.globalAlpha = 0.85
      ctx.strokeStyle = b.team === 0 ? '#5ee6ff' : '#bb99f5'
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - b.vx * 1.6, b.y - b.vy * 1.6)
      ctx.stroke()
    }

    // 小飞机：三角机身 + 闪烁尾焰
    for (const p of planes) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angle)
      ctx.globalAlpha = 0.9
      ctx.fillStyle = p.team === 0 ? '#5ee6ff' : '#bb99f5'
      ctx.beginPath()
      ctx.moveTo(10, 0)
      ctx.lineTo(-7, 6)
      ctx.lineTo(-3.5, 0)
      ctx.lineTo(-7, -6)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 0.4 + Math.random() * 0.3
      ctx.fillStyle = '#f2f5fa'
      ctx.fillRect(-10, -1, 3, 2)
      ctx.restore()
    }

    // 爆炸：双色扩散圆环
    for (const bo of booms) {
      ctx.globalAlpha = Math.max(0, bo.a)
      ctx.strokeStyle = '#f2f5fa'
      ctx.beginPath()
      ctx.arc(bo.x, bo.y, bo.r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = Math.max(0, bo.a) * 0.6
      ctx.strokeStyle = '#bb99f5'
      ctx.beginPath()
      ctx.arc(bo.x, bo.y, bo.r * 0.6, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  /** 画 AI 检测框：四角括弧 + 标签 + 置信度 */
  function drawDetectBox(pt: Particle, idx: number) {
    // lock 越大框越小，形成“锁定收缩”动画
    const half = BOX_HALF_MAX - (BOX_HALF_MAX - BOX_HALF) * pt.lock
    const x0 = pt.x - half
    const y0 = pt.y - half
    const x1 = pt.x + half
    const y1 = pt.y + half
    const arm = Math.max(4, half * 0.4)
    const locked = pt.lock > 0.85

    ctx.globalAlpha = Math.min(1, pt.lock * 1.4)
    ctx.strokeStyle = locked ? '#bb99f5' : '#5ee6ff'
    ctx.lineWidth = 1

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

    // 锁定后：中心十字 + 标签文字
    if (locked) {
      ctx.beginPath()
      ctx.moveTo(pt.x - 4, pt.y)
      ctx.lineTo(pt.x + 4, pt.y)
      ctx.moveTo(pt.x, pt.y - 4)
      ctx.lineTo(pt.x, pt.y + 4)
      ctx.stroke()

      const label = `OBJ-${String(idx).padStart(2, '0')} ${pt.conf.toFixed(1)}%`
      ctx.font = '9px Consolas, monospace'
      const tw = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(187, 153, 245, 0.85)'
      ctx.fillRect(x0, y0 - 14, tw + 8, 12)
      ctx.fillStyle = '#0a0e1a'
      ctx.fillText(label, x0 + 4, y0 - 5)
    }
    ctx.globalAlpha = 1
  }

  const loop = () => {
    ctx.clearRect(0, 0, w, h)
    const r2 = DETECT_RADIUS * DETECT_RADIUS
    for (let i = 0; i < parts.length; i++) {
      const pt = parts[i]!
      pt.x += pt.vx
      pt.y += pt.vy
      if (pt.x < 0) pt.x = w
      if (pt.x > w) pt.x = 0
      if (pt.y < 0) pt.y = h
      if (pt.y > h) pt.y = 0

      ctx.globalAlpha = pt.o
      ctx.fillStyle = pt.c
      ctx.fillRect(pt.x, pt.y, pt.s, pt.s)

      // 鼠标靠近 → 锁定进度上升，远离 → 缓慢解除
      const dx = pt.x - mouse.x
      const dy = pt.y - mouse.y
      const inRange = mouse.active && dx * dx + dy * dy < r2
      pt.lock = Math.max(0, Math.min(1, pt.lock + (inRange ? 0.09 : -0.03)))
      if (pt.lock > 0.02) drawDetectBox(pt, i)
    }
    ctx.globalAlpha = 1

    updateCombat()
    drawCombat()

    raf = requestAnimationFrame(loop)
  }
  loop()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  if (onResize) window.removeEventListener('resize', onResize)
  if (onMouseMove) window.removeEventListener('mousemove', onMouseMove)
  if (onMouseOut)
    document.documentElement.removeEventListener('mouseleave', onMouseOut)
})
</script>

<template>
  <div class="backdrop">
    <div class="backdrop__grid"></div>
    <div class="backdrop__glow backdrop__glow--accent"></div>
    <div class="backdrop__glow backdrop__glow--cyan"></div>
    <canvas ref="canvasRef" class="backdrop__fx"></canvas>
    <div class="backdrop__mega backdrop__mega--top">{{ megaTop }}</div>
    <div class="backdrop__mega backdrop__mega--bottom">{{ megaBottom }}</div>
    <div class="backdrop__scanlines"></div>
    <div class="backdrop__scanbeam"></div>
    <div class="backdrop__corner backdrop__corner--tl"></div>
    <div class="backdrop__corner backdrop__corner--tr"></div>
    <div class="backdrop__corner backdrop__corner--bl"></div>
    <div class="backdrop__corner backdrop__corner--br"></div>
  </div>
</template>

<style lang="scss" scoped>
.backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;

  &__grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(94, 230, 255, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(94, 230, 255, 0.045) 1px, transparent 1px);
    background-size: 48px 48px;
    animation: grid-move 12s linear infinite;
  }

  &__glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(120px);

    &--accent {
      width: 520px;
      height: 520px;
      background: rgba(187, 153, 245, 0.14);
      top: -120px;
      right: -100px;
    }

    &--cyan {
      width: 460px;
      height: 460px;
      background: rgba(94, 230, 255, 0.1);
      bottom: -140px;
      left: -120px;
    }
  }

  &__fx {
    position: absolute;
    inset: 0;
  }

  &__mega {
    position: absolute;
    font-weight: 900;
    letter-spacing: 0.05em;
    color: transparent;
    -webkit-text-stroke: 1px rgba(242, 245, 250, 0.07);
    white-space: nowrap;
    line-height: 0.9;

    &--top {
      font-size: 22vw;
      top: 2%;
      left: -2%;
    }

    &--bottom {
      font-size: 16vw;
      bottom: -6%;
      right: -3%;
      -webkit-text-stroke-color: var(--launcher-accent-dim);
    }
  }

  &__scanlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.02) 0 1px,
      transparent 1px 3px
    );
  }

  &__scanbeam {
    position: absolute;
    left: 0;
    width: 100%;
    height: 16px;
    background: linear-gradient(
      180deg,
      transparent,
      rgba(94, 230, 255, 0.05),
      transparent
    );
    animation: beam 6s linear infinite;
  }

  &__corner {
    position: absolute;
    width: 46px;
    height: 46px;

    &::before,
    &::after {
      content: '';
      position: absolute;
      background: var(--launcher-accent);
    }

    &::before {
      width: 100%;
      height: 3px;
    }

    &::after {
      width: 3px;
      height: 100%;
    }

    &--tl {
      top: 18px;
      left: 18px;
    }

    &--tr {
      top: 18px;
      right: 18px;
      transform: scaleX(-1);
    }

    &--bl {
      bottom: 18px;
      left: 18px;
      transform: scaleY(-1);
    }

    &--br {
      bottom: 18px;
      right: 18px;
      transform: scale(-1);
    }
  }
}

@keyframes grid-move {
  to {
    background-position: 48px 48px;
  }
}

@keyframes beam {
  0% {
    top: -15%;
  }

  100% {
    top: 110%;
  }
}
</style>
