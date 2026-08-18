<script lang="ts">
/**
 * 语音状态挂在模块级：标题界面随 v-if 卸载/重挂时组件实例状态会重置，
 * 提升到模块作用域后问候语整场会话只播一次，返回标题不会重复播放
 */
let voiceEl: HTMLAudioElement | null = null
let voicePlaying = false
let greetingPlayed = false
</script>

<script setup lang="ts">
/**
 * 标题界面
 * 职责：主菜单入口（作战 / 任务 / 指南 / 角色 / 商店 / 工作台）
 * 布局：左侧看板娘立绘，右侧太空终端风格功能甲板（伪 3D 鼠标视差）
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { KeyBindings } from '../../types'
import {
  getBgmAnalyser,
  getBgmTracks,
  getCurrentBgmId,
  isBgmPaused,
  pauseBgm,
  playBgm,
  resumeBgm,
} from '../../utils/bgm'
import { uiSettings } from '../../utils/settings'
import { playSfx, preloadSfx } from '../../utils/sfx'
import { useInventory } from '../../composables/useInventory'
import btnHoverSfx from '../../assets/audio/ui/btn-hover.wav'
import deckClickSfx from '../../assets/audio/ui/deck-click.wav'
import voiceGreetingUrl from '../../assets/audio/voice/miaoqian/greeting.mp3'
import voiceTalk1Url from '../../assets/audio/voice/miaoqian/talk_1.mp3'
import voiceTalk2Url from '../../assets/audio/voice/miaoqian/talk_2.mp3'
import bgUrl from '../../assets/background/bg2.png'
import charaUrl from '../../assets/character/miaoqian.png'
import avatarUrl from '../../assets/avatar/default.jpg'
import crystalUrl from '../../assets/icon/crystal.png'
import settingsUrl from '../../assets/icon/settings.svg'
import mailUrl from '../../assets/icon/mail.svg'
import noticeUrl from '../../assets/icon/notice.svg'
import sortieUrl from '../../assets/icon/sortie.svg'
import guideUrl from '../../assets/icon/guide.svg'
import characterUrl from '../../assets/icon/character.svg'
import shopUrl from '../../assets/icon/shop.svg'
import storageUrl from '../../assets/icon/storage.svg'

defineProps<{
  bindings: KeyBindings
}>()

/* ---------- 水晶货币：读取全局背包数据源 ---------- */
const { crystal } = useInventory()
const crystalText = computed(() => crystal.value.toLocaleString('en-US'))

const emit = defineEmits<{
  start: []
  openGuide: []
  openSettings: []
  openFrameSettings: []
  openMail: []
  openNotice: []
  openCharacter: []
  openShop: []
  openStorage: []
}>()

/* ---------- 伪 3D 视差：鼠标驱动甲板倾斜 ---------- */
/* 基础倾角：让甲板常驻一个斜向视角，鼠标视差在此之上叠加 */
const BASE_TILT_X = 2.5
const BASE_TILT_Y = -12
const tiltX = ref(0)
const tiltY = ref(0)
let targetX = 0
let targetY = 0
let rafId = 0

function onMouseMove(e: MouseEvent) {
  const nx = (e.clientX / window.innerWidth) * 2 - 1
  const ny = (e.clientY / window.innerHeight) * 2 - 1
  targetY = nx * 5.5
  targetX = -ny * 3.5
}

/* ---------- 看板娘语音：单实例播放，播完前忽略后续触发 ---------- */
const VOICE_GREETING = voiceGreetingUrl
const VOICE_TALKS = [voiceTalk1Url, voiceTalk2Url]

/** 语音对应的台词文本（onlineStory/voice/miaoqian.md） */
const VOICE_LINES: Record<string, string> = {
  [VOICE_GREETING]: '「指挥官，你来啦！日程表已经整理好了。」',
  [voiceTalk1Url]:
    '「今天的日程我已经按优先级排好了。有什么想法，直说就好——我们一起商量。」',
  [voiceTalk2Url]:
    '「这些数据我昨晚多核对了一遍，应该没问题。……你问为什么这么做？因为交给你之前，我想让它再好一点。」',
}

/** 当前展示的台词（空串表示不显示） */
const voiceLine = ref('')

/** 播放指定语音；返回是否成功起播（可能被自动播放策略拦截） */
async function playVoice(src: string): Promise<boolean> {
  if (voicePlaying) return false
  if (!voiceEl) {
    voiceEl = new Audio()
    voiceEl.addEventListener('ended', () => {
      voicePlaying = false
      voiceLine.value = ''
    })
    voiceEl.addEventListener('error', () => {
      voicePlaying = false
      voiceLine.value = ''
    })
  }
  voiceEl.src = src
  voiceEl.volume = Math.min(1, Math.max(0, uiSettings.voiceVolume))
  voicePlaying = true
  try {
    await voiceEl.play()
    voiceLine.value = VOICE_LINES[src] ?? ''
    return true
  } catch {
    voicePlaying = false
    return false
  }
}

/** 点击看板娘：首次播问候，之后随机播闲聊 */
function playMascotVoice() {
  const src = greetingPlayed
    ? VOICE_TALKS[(Math.random() * VOICE_TALKS.length) | 0]
    : VOICE_GREETING
  greetingPlayed = true
  void playVoice(src)
}

/** 打断当前语音：玩家进行其他操作（点面板 / 按钮等）时调用 */
function stopVoice() {
  if (!voicePlaying || !voiceEl) return
  voiceEl.pause()
  voicePlaying = false
  voiceLine.value = ''
}

/** 根节点按下：点击位置不在看板娘热区内就视为一次操作，打断语音 */
function onRootPointerDown(e: PointerEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest('.chara-hit')) return
  stopVoice()
  // 按下任意按钮统一播放点击确认音（一处绑定覆盖全部按钮，含后续新增）
  if (target?.closest('button')) playSfx(deckClickSfx)
}

/** 进入页面自动播问候；被拦截则挂一次性监听，首次交互时补播 */
function autoPlayGreeting() {
  if (greetingPlayed) return
  greetingPlayed = true
  void playVoice(VOICE_GREETING).then(ok => {
    if (ok) return
    const retry = (e: Event) => {
      window.removeEventListener('pointerdown', retry)
      window.removeEventListener('keydown', retry)
      // 首次交互是点击按钮等控件：视为玩家已在操作，跳过补播
      const target = e.target as HTMLElement | null
      if (e.type === 'pointerdown' && target?.closest('button, a, input, select, textarea')) return
      void playVoice(VOICE_GREETING)
    }
    window.addEventListener('pointerdown', retry)
    window.addEventListener('keydown', retry)
  })
}

/* ---------- 背景星尘粒子 ---------- */
interface Particle {
  x: number
  y: number
  size: number
  vx: number
  vy: number
  alpha: number
  phase: number
  twinkleSpeed: number
  sprite: number
}

const PARTICLE_COLORS = ['203, 178, 255', '255, 255, 255', '240, 171, 252']
const PARTICLE_COUNT = 95
const SPRITE_SIZE = 64

const particleCanvas = ref<HTMLCanvasElement | null>(null)
let particleCtx: CanvasRenderingContext2D | null = null
let particles: Particle[] = []
let sprites: HTMLCanvasElement[] = []

/** 预渲染径向渐变精灵：中心亮核向四周柔和衰减，无硬边光圈 */
function createSprite(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SPRITE_SIZE
  c.height = SPRITE_SIZE
  const sctx = c.getContext('2d')
  if (!sctx) return c
  const half = SPRITE_SIZE / 2
  const grad = sctx.createRadialGradient(half, half, 0, half, half, half)
  grad.addColorStop(0, `rgba(${color}, 1)`)
  grad.addColorStop(0.2, `rgba(${color}, 0.55)`)
  grad.addColorStop(0.5, `rgba(${color}, 0.12)`)
  grad.addColorStop(1, `rgba(${color}, 0)`)
  sctx.fillStyle = grad
  sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
  return c
}

function spawnParticle(w: number, h: number, fromEdge = false): Particle {
  // 从左边缘或下边缘进入，往右上飘
  const edge = Math.random() < 0.5
  return {
    x: fromEdge ? (edge ? -8 : Math.random() * w) : Math.random() * w,
    y: fromEdge ? (edge ? Math.random() * h : h + 8) : Math.random() * h,
    size: Math.random() * 10 + 3,
    vx: Math.random() * 0.25 + 0.1,
    vy: -(Math.random() * 0.25 + 0.08),
    alpha: Math.random() * 0.45 + 0.2,
    phase: Math.random() * Math.PI * 2,
    twinkleSpeed: Math.random() * 0.025 + 0.008,
    sprite: (Math.random() * PARTICLE_COLORS.length) | 0,
  }
}

function initParticles() {
  const canvas = particleCanvas.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  particleCtx = canvas.getContext('2d')
  particleCtx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (sprites.length === 0) {
    sprites = PARTICLE_COLORS.map(createSprite)
  }
  particles = Array.from({ length: PARTICLE_COUNT }, () => spawnParticle(w, h))
}

function drawParticles() {
  const canvas = particleCanvas.value
  if (!canvas || !particleCtx) return
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  const ctx2d = particleCtx
  ctx2d.clearRect(0, 0, w, h)
  // 叠加发光：粒子重叠处自然提亮
  ctx2d.globalCompositeOperation = 'lighter'
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    p.phase += p.twinkleSpeed
    if (p.y < -8 || p.x > w + 8) {
      particles[i] = spawnParticle(w, h, true)
      continue
    }
    ctx2d.globalAlpha = p.alpha * (0.5 + 0.5 * Math.sin(p.phase))
    const half = p.size / 2
    ctx2d.drawImage(sprites[p.sprite], p.x - half, p.y - half, p.size, p.size)
  }
  ctx2d.globalAlpha = 1
  ctx2d.globalCompositeOperation = 'source-over'
}

function onResize() {
  initParticles()
  initViz()
}

/* ---------- 迷你音乐播放器：读取全局 BGM 单例状态 ---------- */
const bgmTracks = getBgmTracks()
const currentTrackId = ref<string | null>(null)
const trackPaused = ref(true)

const currentTrackTitle = computed(
  () =>
    bgmTracks.find(t => t.id === currentTrackId.value)?.title ?? '未在播放',
)

function syncBgmState() {
  currentTrackId.value = getCurrentBgmId()
  trackPaused.value = isBgmPaused()
}

function toggleBgm() {
  if (!currentTrackId.value) {
    if (bgmTracks.length) playBgm(bgmTracks[0].id)
    return
  }
  if (trackPaused.value) resumeBgm()
  else pauseBgm()
}

function switchTrack(step: number) {
  if (!bgmTracks.length) return
  const idx = bgmTracks.findIndex(t => t.id === currentTrackId.value)
  const next = bgmTracks[(idx + step + bgmTracks.length) % bgmTracks.length]
  playBgm(next.id)
}

/* ---------- 播放器频谱：读取 BGM 分析器绘制迷你频谱柱 ---------- */
const VIZ_BAR_COUNT = 24
/** 频谱高频段通常为空，只取前 72% 的 bin */
const VIZ_USABLE_RATIO = 0.72

const vizCanvas = ref<HTMLCanvasElement | null>(null)
let vizCtx: CanvasRenderingContext2D | null = null
let vizW = 0
let vizH = 0
let vizIdlePhase = 0

function initViz() {
  const canvas = vizCanvas.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  vizW = canvas.clientWidth
  vizH = canvas.clientHeight
  canvas.width = vizW * dpr
  canvas.height = vizH * dpr
  vizCtx = canvas.getContext('2d')
  vizCtx?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function drawViz() {
  if (!vizCtx) return
  const ctx2d = vizCtx
  ctx2d.clearRect(0, 0, vizW, vizH)

  const gap = 2
  const barW = (vizW - gap * (VIZ_BAR_COUNT - 1)) / VIZ_BAR_COUNT
  const analyser = getBgmAnalyser()

  let levels: number[] | null = null
  if (analyser && !trackPaused.value) {
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    // 全零说明尚未真正出声（自动播放被拦截），按待机处理
    if (data.some(v => v > 0)) {
      const usable = Math.floor(data.length * VIZ_USABLE_RATIO)
      levels = Array.from({ length: VIZ_BAR_COUNT }, (_, i) => {
        const idx = Math.floor((i / VIZ_BAR_COUNT) * usable)
        return data[idx] / 255
      })
    }
  }

  if (!levels) {
    // 待机 / 暂停：缓慢呼吸波
    vizIdlePhase += 0.03
    levels = Array.from(
      { length: VIZ_BAR_COUNT },
      (_, i) => 0.1 + 0.08 * (1 + Math.sin(vizIdlePhase + i * 0.45)),
    )
  }

  const gradient = ctx2d.createLinearGradient(0, vizH, 0, 0)
  gradient.addColorStop(0, 'rgba(187, 153, 245, 0.55)')
  gradient.addColorStop(1, '#5ee6ff')
  ctx2d.fillStyle = gradient
  ctx2d.shadowColor = 'rgba(94, 230, 255, 0.6)'
  ctx2d.shadowBlur = 4

  for (let i = 0; i < VIZ_BAR_COUNT; i++) {
    const h = Math.max(1.5, levels[i] * (vizH - 3))
    ctx2d.fillRect(i * (barW + gap), vizH - h, barW, h)
  }
}

function tick() {
  tiltX.value += (targetX - tiltX.value) * 0.075
  tiltY.value += (targetY - tiltY.value) * 0.075
  drawParticles()
  syncBgmState()
  drawViz()
  rafId = requestAnimationFrame(tick)
}

/* ---------- 按钮 hover 音效：全站统一音色，音量在 sfxVolumes 中已压低 ---------- */
function onBtnHover() {
  playSfx(btnHoverSfx)
}

/* ---------- 维护中提示：任务 / 商店 / 工作台暂未开放 ---------- */
const maintenanceTip = ref('')
let maintenanceTimer = 0

function showMaintenance(name: string) {
  maintenanceTip.value = `「${name}」功能维护中，敬请期待`
  window.clearTimeout(maintenanceTimer)
  maintenanceTimer = window.setTimeout(() => {
    maintenanceTip.value = ''
  }, 1800)
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onResize)
  initParticles()
  initViz()
  rafId = requestAnimationFrame(tick)
  autoPlayGreeting()
  // 预加载按钮 hover / 点击音效，保证首次交互零延迟发声
  preloadSfx(btnHoverSfx)
  preloadSfx(deckClickSfx)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('resize', onResize)
  cancelAnimationFrame(rafId)
  window.clearTimeout(maintenanceTimer)
  voiceEl?.pause()
  voicePlaying = false
})

const deckStyle = computed(() => ({
  transform: `perspective(1100px) rotateX(${(BASE_TILT_X + tiltX.value).toFixed(2)}deg) rotateY(${(BASE_TILT_Y + tiltY.value).toFixed(2)}deg)`,
}))
</script>

<template>
  <div
    class="stg-title"
    :style="{ backgroundImage: `url(${bgUrl})` }"
    @pointerdown="onRootPointerDown"
  >
    <div class="stg-title__vignette" />
    <canvas ref="particleCanvas" class="stg-title__particles" />

    <!-- 左上角：玩家信息卡 + 货币卡 -->
    <div class="stg-title__hud">
      <div class="deck-card stg-title__profile">
        <span class="profile-scanlines" />
        <span class="profile-corner profile-corner--tl" />
        <span class="profile-corner profile-corner--br" />

        <div class="profile-avatar">
          <span class="profile-avatar__ring" />
          <div class="profile-avatar__frame">
            <img :src="avatarUrl" alt="头像" draggable="false" />
            <span class="profile-avatar__scan" />
          </div>
        </div>

        <div class="profile-meta">
          <p class="profile-meta__name">指挥官_FfjiaIDJnwa</p>
          <div class="profile-player">
            <div class="profile-player__controls">
              <button
                class="profile-player__btn"
                title="上一首"
                @click="switchTrack(-1)"
                @mouseenter="onBtnHover"
              >
                <span class="pp-icon pp-icon--prev" />
              </button>
              <button
                class="profile-player__btn profile-player__btn--main"
                :title="trackPaused ? '播放' : '暂停'"
                @click="toggleBgm"
                @mouseenter="onBtnHover"
              >
                <span
                  class="pp-icon"
                  :class="trackPaused ? 'pp-icon--play' : 'pp-icon--pause'"
                />
              </button>
              <button
                class="profile-player__btn"
                title="下一首"
                @click="switchTrack(1)"
                @mouseenter="onBtnHover"
              >
                <span class="pp-icon pp-icon--next" />
              </button>
              <p class="profile-player__track">{{ currentTrackTitle }}</p>
            </div>
            <canvas ref="vizCanvas" class="profile-player__viz" />
          </div>
        </div>
      </div>

      <!-- 货币卡 -->
      <div class="deck-card stg-title__currency">
        <img class="currency-icon" :src="crystalUrl" alt="水晶" draggable="false" />
        <div class="currency-meta">
          <p class="currency-meta__amount">{{ crystalText }}</p>
        </div>
      </div>
    </div>

    <!-- 右上角：邮件 / 公告 / 设置 -->
    <div class="stg-title__actions">
      <button
        class="action-btn"
        title="邮件"
        @click="emit('openMail')"
        @mouseenter="onBtnHover"
      >
        <span class="action-btn__ring" />
        <img :src="mailUrl" alt="邮件" draggable="false" />
      </button>
      <button
        class="action-btn"
        title="公告"
        @click="emit('openNotice')"
        @mouseenter="onBtnHover"
      >
        <span class="action-btn__ring" />
        <img :src="noticeUrl" alt="公告" draggable="false" />
      </button>
      <button
        class="action-btn action-btn--gear"
        title="设置"
        @click="emit('openSettings')"
        @mouseenter="onBtnHover"
      >
        <span class="action-btn__ring" />
        <img :src="settingsUrl" alt="设置" draggable="false" />
      </button>
    </div>

    <!-- 左侧：看板娘（可在设置-界面中关闭） -->
    <div v-if="uiSettings.showMascot" class="stg-title__chara">
      <Transition name="chara-line">
        <p v-if="voiceLine" class="chara-line">{{ voiceLine }}</p>
      </Transition>
      <!-- 语音触发热区：只覆盖角色中间部分，不含立绘上下透明区 -->
      <span class="chara-hit" @click="playMascotVoice" />
      <img :src="charaUrl" alt="喵浅" draggable="false" />
    </div>

    <!-- 右侧：功能甲板（错位拼贴布局） -->
    <div class="stg-title__deck" :style="deckStyle">
      <span class="deck-plate-tag">NAV-07 // MAIN DECK</span>
      <!-- 主行动：作战 -->
      <button
        class="deck-card deck-start"
        @click="emit('start')"
        @mouseenter="onBtnHover"
      >
        <span class="deck-start__label">作战</span>
        <span class="deck-start__sub">START MISSION</span>
        <img class="deck-icon deck-start__icon" :src="sortieUrl" alt="" draggable="false" />
      </button>

      <!-- 第三排：指南（宽）+ 角色（上提加高） -->
      <div class="deck-row">
        <button
          class="deck-card deck-guide"
          @click="emit('openGuide')"
          @mouseenter="onBtnHover"
        >
          <span class="deck-guide__label">档案</span>
          <span class="deck-guide__sub">ARCHIVE</span>
          <img class="deck-icon deck-guide__icon" :src="guideUrl" alt="" draggable="false" />
        </button>
        <button
          class="deck-card deck-chara"
          @click="emit('openCharacter')"
          @mouseenter="onBtnHover"
        >
          <span class="deck-chara__label">角色</span>
          <span class="deck-chara__sub">CHARACTER</span>
          <img class="deck-icon deck-chara__icon" :src="characterUrl" alt="" draggable="false" />
        </button>
      </div>

      <!-- 第四排：商店（上提）+ 工作台（加高带红点） -->
      <div class="deck-row">
        <button
          class="deck-card deck-shop"
          @click="emit('openShop')"
          @mouseenter="onBtnHover"
        >
          <span class="deck-shop__label">商店</span>
          <span class="deck-shop__sub">SHOP</span>
          <img class="deck-icon deck-shop__icon" :src="shopUrl" alt="" draggable="false" />
        </button>
        <button
          class="deck-card deck-storage"
          @click="showMaintenance('工作台')"
          @mouseenter="onBtnHover"
        >
          <span class="deck-storage__label">工作台</span>
          <span class="deck-storage__sub">WORKBENCH</span>
          <img class="deck-icon deck-storage__icon" :src="storageUrl" alt="" draggable="false" />
        </button>
      </div>
    </div>

    <!-- 功能维护中提示 -->
    <Transition name="maintenance-tip">
      <p v-if="maintenanceTip" class="maintenance-tip">
        <span class="maintenance-tip__dot" />{{ maintenanceTip }}
      </p>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/stg-vars.scss' as *;

$deck-cut: 18px;
$card-bg: rgba(10, 10, 26, 0.58);
$card-border: rgba($accent, 0.35);

.stg-title {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  user-select: none;

  &__vignette {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(
        90deg,
        rgba(5, 5, 16, 0.55) 0%,
        rgba(5, 5, 16, 0.18) 42%,
        rgba(5, 5, 16, 0.62) 100%
      ),
      radial-gradient(
        ellipse at center,
        transparent 55%,
        rgba(3, 3, 12, 0.55) 100%
      );
    pointer-events: none;
  }

  &__particles {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* ---------- 左上角 HUD：信息卡 + 货币卡 ---------- */
  &__hud {
    position: absolute;
    left: 24px;
    top: 24px;
    display: flex;
    align-items: stretch;
    gap: 12px;
  }

  /* ---------- 左侧看板娘 ---------- */
  &__chara {
    /* 调大小只需改这一个值（也可在 DevTools 里实时改） */
    --chara-height: 137%;
    position: absolute;
    left: 0;
    /* 基础左移：相对立绘自身宽度，裁切比例恒定 */
    --chara-shift: -14%;
    /* 避让补偿：屏幕窄于 1600px 时开始生效，越窄左移越多（每窄 100px 多移 15px），宽屏恒为 0 */
    --chara-dodge: min(0px, (100vw - 1900px) * 0.45);
    translate: calc(var(--chara-shift) + var(--chara-dodge)) 0;
    bottom: -47%;
    height: var(--chara-height);
    pointer-events: none;

    img {
      height: 100%;
      width: auto;
      object-fit: contain;
    }
  }

  /* ---------- 语音触发热区：只覆盖角色中间部分 ---------- */
  .chara-hit {
    /* 热区范围微调改这四个值即可 */
    --hit-left: 34%;
    --hit-top: 8%;
    --hit-width: 32%;
    --hit-height: 68%;
    position: absolute;
    left: var(--hit-left);
    top: var(--hit-top);
    width: var(--hit-width);
    height: var(--hit-height);
    z-index: 1;
    cursor: pointer;
    pointer-events: auto;
  }

  /* ---------- 看板娘台词气泡：角色中心偏左 ---------- */
  .chara-line {
    /* 位置微调改这两个值即可 */
    --line-left: 50%;
    --line-top: 38%;
    position: absolute;
    left: var(--line-left);
    top: var(--line-top);
    /* 整体移到中心点左侧，垂直居中 */
    transform: translate(-106%, -50%);
    z-index: 2;
    margin: 0;
    max-width: 320px;
    padding: 10px 14px;
    font-size: 13px;
    line-height: 1.75;
    letter-spacing: 1px;
    color: #eaf6ff;
    text-shadow: 0 0 8px rgba($accent, 0.35);
    background: rgba(10, 10, 26, 0.72);
    border: 1px solid rgba($accent, 0.45);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    clip-path: polygon(
      0 0,
      calc(100% - 10px) 0,
      100% 10px,
      100% 100%,
      10px 100%,
      0 calc(100% - 10px)
    );
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    pointer-events: none;

    /* 指向角色的小尾巴 */
    &::after {
      content: '';
      position: absolute;
      right: -5px;
      top: 50%;
      width: 8px;
      height: 8px;
      background: rgba($accent, 0.55);
      clip-path: polygon(0 0, 100% 50%, 0 100%);
      transform: translateY(-50%);
    }
  }

  /* ---------- 右侧功能甲板 ---------- */
  &__deck {
    position: absolute;
    right: 4%;
    top: 50%;
    translate: 0 -50%;
    width: min(640px, 52%);
    display: flex;
    flex-direction: column;
    gap: 16px;
    transform-style: preserve-3d;
    will-change: transform;

    /* 背板：玻璃底 + 科技网格 + 边角刻度，置于卡片之后 */
    &::before {
      content: '';
      position: absolute;
      inset: -24px -28px;
      background:
        /* 四角刻度（避开切角，只放未切的左上 / 右下） */
        linear-gradient(rgba($accent, 0.55) 0 0) left 12px top 12px / 20px 1px,
        linear-gradient(rgba($accent, 0.55) 0 0) left 12px top 12px / 1px 20px,
        linear-gradient(rgba($accent, 0.55) 0 0) right 12px bottom 12px / 20px 1px,
        linear-gradient(rgba($accent, 0.55) 0 0) right 12px bottom 12px / 1px 20px,
        /* 左侧虚线脊柱 */
        repeating-linear-gradient(
            180deg,
            rgba($accent, 0.3) 0 5px,
            transparent 5px 11px
          )
          left 14px top 16px / 1px calc(100% - 32px),
        /* 细网格 */
        repeating-linear-gradient(0deg, rgba($accent, 0.05) 0 1px, transparent 1px 26px),
        repeating-linear-gradient(90deg, rgba($accent, 0.05) 0 1px, transparent 1px 26px),
        /* 玻璃底色 */
        linear-gradient(
          155deg,
          rgba(12, 12, 28, 0.52),
          rgba(12, 12, 28, 0.18) 55%,
          rgba(12, 12, 28, 0.46)
        );
      background-repeat: no-repeat;
      border: 1px solid rgba($accent, 0.16);
      clip-path: polygon(
        0 0,
        calc(100% - 28px) 0,
        100% 28px,
        100% 100%,
        28px 100%,
        0 calc(100% - 28px)
      );
      transform: translateZ(-45px);
      pointer-events: none;
    }

    /* 背板扫光：缓慢横掠的高亮带 */
 
  }
}

@keyframes deck-sweep {
  0% {
    left: -160px;
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  60% {
    opacity: 1;
  }
  75%,
  100% {
    left: 110%;
    opacity: 0;
  }
}

/* 背板右上 HUD 标签：闪烁指示点 + 编号 */
.deck-plate-tag {
  position: absolute;
  top: -17px;
  right: -12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 9px;
  letter-spacing: 2px;
  color: rgba($accent, 0.65);
  transform: translateZ(-40px);
  pointer-events: none;

  &::before {
    content: '';
    width: 5px;
    height: 5px;
    background: rgba($accent, 0.9);
    animation: tag-blink 1.8s steps(2, start) infinite;
  }
}

@keyframes tag-blink {
  50% {
    opacity: 0.25;
  }
}

/* ---------- 右上角：邮件 / 公告 / 设置 按钮组 ---------- */
.stg-title__actions {
  position: absolute;
  right: 28px;
  top: 28px;
  display: flex;
  gap: 12px;
}

.action-btn {
  position: relative;
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  cursor: pointer;
  background: rgba(10, 10, 26, 0.58);
  border: 1px solid rgba($accent, 0.45);
  clip-path: polygon(
    0 0,
    calc(100% - 12px) 0,
    100% 12px,
    100% 100%,
    12px 100%,
    0 calc(100% - 12px)
  );
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  transition: filter 0.2s ease, translate 0.15s ease, border-color 0.2s ease;

  img {
    width: 30px;
    height: 30px;
    filter: drop-shadow(0 0 6px rgba($accent, 0.75));
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }

  &:hover {
    filter: brightness(1.3);
    translate: 0 -2px;
    border-color: rgba($accent, 0.85);

    img {
      transform: scale(1.12);
    }
  }

  &:active {
    translate: 0 0;
  }

  /* 设置齿轮：悬停时改为旋转 */
  &--gear:hover img {
    transform: rotate(90deg);
  }
}

/* 悬停时外圈虚线环旋转 */
.action-btn__ring {
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  border: 1px dashed rgba($accent, 0.4);
  pointer-events: none;
  transition: border-color 0.2s ease;

  .action-btn:hover & {
    border-color: rgba($accent, 0.8);
    animation: ring-spin 8s linear infinite;
  }
}

/* ---------- 通用卡片：切角 + 玻璃 + 深度 ---------- */
.deck-card {
  position: relative;
  background: $card-bg;
  border: 1px solid $card-border;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  clip-path: polygon(
    0 0,
    calc(100% - #{$deck-cut}) 0,
    100% #{$deck-cut},
    100% 100%,
    #{$deck-cut} 100%,
    0 calc(100% - #{$deck-cut})
  );
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

/* ---------- 玩家信息卡 ---------- */
.deck-card.stg-title__profile {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px 14px 14px;
  overflow: hidden;
}

/* ---------- 货币卡（与信息卡并排） ---------- */
.deck-card.stg-title__currency {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px 10px 12px;
  height: fit-content;
}

/* ---------- 卡片水印序号（错位拼贴的层次细节） ---------- */
%deck-num {
  position: absolute;
  right: 12px;
  bottom: 0;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
  color: rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

/* ---------- 甲板按钮右侧艺术图标 ---------- */
.deck-icon {
  flex-shrink: 0;
  align-self: center;
  pointer-events: none;
  opacity: 0.6;
  filter: drop-shadow(0 0 8px rgba($accent, 0.4));
  transition:
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease,
    filter 0.2s ease;

  .deck-card:hover & {
    transform: scale(1.08);
    opacity: 0.95;
    filter: drop-shadow(0 0 13px rgba($accent, 0.85));
  }
}

/* ---------- 主行动：作战（ hero 大卡） ---------- */
.deck-start {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 30px 32px;
  cursor: pointer;
  background: linear-gradient(
    120deg,
    rgba($accent, 0.32),
    rgba($accent-purple, 0.22) 60%,
    rgba($accent, 0.12)
  );
  border-color: rgba($accent, 0.65);
  color: #fff;
  text-align: left;
  transform: translateZ(90px);
  transition: filter 0.2s ease, translate 0.15s ease;

  &::after {
    content: '01';
    @extend %deck-num;
    color: rgba(255, 255, 255, 0.1);
  }

  &:hover {
    filter: brightness(1.3);
    translate: 0 -2px;
  }

  &__label {
    font-size: 34px;
    font-weight: 700;
    letter-spacing: 12px;
    text-shadow: 0 0 14px rgba($accent, 0.8);
  }

  &__sub {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 11px;
    letter-spacing: 3px;
    color: rgba(255, 255, 255, 0.6);
  }

  &__icon {
    margin-left: auto;
    width: 84px;
    height: 84px;
    filter: drop-shadow(0 0 10px rgba($accent, 0.6));
  }

}

/* ---------- 双卡横排容器 ---------- */
.deck-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  transform-style: preserve-3d;
}

/* ---------- 指南：宽卡，顶线收尾 ---------- */
.deck-guide {
  flex: 1.35;
  margin-top: -16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px 20px 17px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.88);
  text-align: left;
  transform: translateZ(45px);
  transition: background 0.2s ease, border-color 0.2s ease, translate 0.15s ease;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 2px;
    background: linear-gradient(90deg, rgba($accent, 0.8), transparent 70%);
  }

  &::after {
    content: '02';
    @extend %deck-num;
  }

  &:hover {
    background: rgba($accent, 0.16);
    border-color: rgba($accent, 0.7);
    translate: 0 -3px;
  }

  &__label {
    font-size: 19px;
    font-weight: 600;
    letter-spacing: 6px;
  }

  &__sub {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 9px;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.4);
  }

  &__icon {
    position: absolute;
    right: 16px;
    top: 50%;
    translate: 0 -50%;
    width: 64px;
    height: 64px;

    .deck-guide:hover & {
      transform: scale(1.08);
    }
  }
}

/* ---------- 角色：上提加高，紫调切角卡 ---------- */
.deck-chara {
  flex: 1;
  margin-top: -18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 26px 20px 23px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.92);
  text-align: left;
  background: linear-gradient(
    140deg,
    rgba($accent-purple, 0.3),
    rgba(10, 10, 26, 0.62) 70%
  );
  border-color: rgba($accent-purple, 0.55);
  clip-path: polygon(
    #{$deck-cut} 0,
    100% 0,
    100% 100%,
    0 100%,
    0 #{$deck-cut}
  );
  transform: translateZ(80px);
  transition: filter 0.2s ease, translate 0.15s ease;

  /* 右上角括号 */
  &::before {
    content: '';
    position: absolute;
    top: 8px;
    right: 8px;
    width: 12px;
    height: 12px;
    border-top: 1px solid rgba($accent-purple, 0.9);
    border-right: 1px solid rgba($accent-purple, 0.9);
  }

  &::after {
    content: '03';
    @extend %deck-num;
    color: rgba(255, 255, 255, 0.1);
  }

  &:hover {
    filter: brightness(1.3);
    translate: 0 -3px;
  }

  &__label {
    font-size: 19px;
    font-weight: 600;
    letter-spacing: 6px;
  }

  &__sub {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 9px;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.45);
  }

  &__icon {
    position: absolute;
    right: 16px;
    top: 50%;
    translate: 0 -50%;
    width: 64px;
    height: 64px;
    filter: drop-shadow(0 0 9px rgba($accent-purple, 0.55));

    .deck-chara:hover & {
      filter: drop-shadow(0 0 14px rgba($accent-purple, 0.95));
    }
  }
}

/* ---------- 商店：上提，斜纹底 + 左侧粗紫条 ---------- */
.deck-shop {
  flex: 1;
  margin-top: -12px;
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 19px 18px 17px 24px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.88);
  text-align: left;
  background:
    repeating-linear-gradient(
      135deg,
      rgba($accent-purple, 0.12) 0 6px,
      transparent 6px 14px
    ),
    $card-bg;
  border-color: rgba($accent-purple, 0.45);
  transform: translateZ(60px);
  transition: background 0.2s ease, border-color 0.2s ease, translate 0.15s ease;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    background: linear-gradient(180deg, $accent-purple, $accent);
  }

  &::after {
    content: '04';
    @extend %deck-num;
    font-size: 20px;
  }

  &:hover {
    border-color: rgba($accent-purple, 0.85);
    translate: 0 -3px;
  }

  &__label {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 5px;
  }

  &__sub {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 9px;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.4);
  }

  &__icon {
    margin-left: auto;
    width: 54px;
    height: 54px;
    filter: drop-shadow(0 0 8px rgba($accent-purple, 0.5));

    .deck-shop:hover & {
      filter: drop-shadow(0 0 13px rgba($accent-purple, 0.9));
    }
  }
}

/* ---------- 工作台：加高压底，红点提醒 ---------- */
.deck-storage {
  flex: 1.3;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 22px 20px 20px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.8);
  text-align: left;
  clip-path: polygon(
    0 0,
    calc(100% - 14px) 0,
    100% 14px,
    100% 100%,
    0 100%
  );
  transform: translateZ(35px);
  transition: background 0.2s ease, border-color 0.2s ease, translate 0.15s ease;

  &::after {
    content: '05';
    @extend %deck-num;
    font-size: 20px;
  }

  &:hover {
    background: rgba($accent, 0.16);
    border-color: rgba($accent, 0.7);
    translate: 0 -3px;
  }

  &__label {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 6px;
  }

  &__sub {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 10px;
    letter-spacing: 3px;
    color: rgba(255, 255, 255, 0.4);
  }

  &__icon {
    margin-left: auto;
    width: 54px;
    height: 54px;
  }
}


/* ---------- 玩家信息卡：背景细节 ---------- */
.profile-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.03) 0 1px,
    transparent 1px 3px
  );
  pointer-events: none;
}

/* 对角括号，强化"锁定框"感 */
.profile-corner {
  position: absolute;
  width: 10px;
  height: 10px;
  border: 1px solid rgba($accent, 0.9);
  pointer-events: none;

  &--tl {
    left: 4px;
    top: 4px;
    border-right: none;
    border-bottom: none;
  }

  &--br {
    right: 4px;
    bottom: 4px;
    border-left: none;
    border-top: none;
  }
}

/* ---------- 头像：虚线雷达环 + 切角相框 + 等级徽章 ---------- */
.profile-avatar {
  position: relative;
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;

  &__ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1px dashed rgba($accent, 0.55);
    animation: ring-spin 14s linear infinite;

    /* 环上的指示点 */
    &::after {
      content: '';
      position: absolute;
      top: -2px;
      left: 50%;
      width: 4px;
      height: 4px;
      margin-left: -2px;
      border-radius: 50%;
      background: $accent;
      box-shadow: 0 0 6px rgba($accent, 0.9);
    }
  }

  &__frame {
    position: relative;
    width: 50px;
    height: 50px;
    border: 1px solid rgba($accent, 0.65);
    clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
    box-shadow: 0 0 14px rgba($accent, 0.3);
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  /* 头像内部缓慢下移的扫描线 */
  &__scan {
    position: absolute;
    left: 0;
    right: 0;
    top: -20%;
    height: 20%;
    background: linear-gradient(
      180deg,
      transparent,
      rgba($accent, 0.28),
      transparent
    );
    animation: avatar-scan 3s ease-in-out infinite;
    pointer-events: none;
  }
}

@keyframes ring-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 台词气泡过渡：进入自下方浮入，退出向上淡出 */
.chara-line-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

.chara-line-leave-active {
  transition:
    opacity 0.35s ease,
    transform 0.35s ease;
}

.chara-line-enter-from {
  opacity: 0;
  transform: translate(-100%, -50%) translateY(8px);
}

.chara-line-leave-to {
  opacity: 0;
  transform: translate(-106%, -50%) translateY(-8px);
}

@keyframes avatar-scan {
  0%,
  100% {
    top: -20%;
  }
  50% {
    top: 100%;
  }
}

/* ---------- 昵称与数据区 ---------- */
.profile-meta {
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 8px;
  padding-top: 2px;

  &__name {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 4px;
    color: #fff;
    text-shadow:
      0 0 10px rgba($accent, 0.6),
      0 0 28px rgba($accent-purple, 0.35);
  }
}

/* ---------- 迷你音乐播放器 ---------- */
.profile-player {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;

  &__controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__viz {
    width: 100%;
    height: 18px;
    opacity: 0.9;
  }

  &__btn {
    flex-shrink: 0;
    width: 26px;
    height: 22px;
    display: grid;
    place-items: center;
    cursor: pointer;
    background: rgba($accent, 0.1);
    border: 1px solid rgba($accent, 0.4);
    color: rgba($accent, 0.95);
    clip-path: polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 0 100%);
    transition: background 0.15s ease, filter 0.15s ease;

    &:hover {
      background: rgba($accent, 0.28);
      filter: brightness(1.25);
    }

    &--main {
      width: 30px;
      border-color: rgba($accent, 0.7);
      background: rgba($accent, 0.22);
    }
  }

  &__track {
    margin: 0;
    min-width: 0;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 10px;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

/* 播放 / 暂停 / 上一首 / 下一首 图标（纯 CSS 绘制） */
.pp-icon {
  display: block;

  &--play {
    width: 0;
    height: 0;
    border-left: 8px solid currentColor;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
  }

  &--pause {
    width: 8px;
    height: 10px;
    border-left: 3px solid currentColor;
    border-right: 3px solid currentColor;
  }

  &--prev,
  &--next {
    position: relative;
    width: 11px;
    height: 10px;
  }

  &--prev {
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 2.5px;
      background: currentColor;
    }

    &::after {
      content: '';
      position: absolute;
      left: 3.5px;
      top: 0;
      border-right: 7px solid currentColor;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
    }
  }

  &--next {
    &::before {
      content: '';
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 2.5px;
      background: currentColor;
    }

    &::after {
      content: '';
      position: absolute;
      right: 3.5px;
      top: 0;
      border-left: 7px solid currentColor;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
    }
  }
}

/* ---------- 货币卡内部 ---------- */
.currency-icon {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(96, 200, 255, 0.8));
}

/* ---------- 功能维护中提示：甲板左侧浮出 ---------- */
.maintenance-tip {
  position: absolute;
  left: 50%;
  bottom: 8%;
  transform: translateX(-50%);
  z-index: 5;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  font-size: 13px;
  letter-spacing: 2px;
  color: #ffe9c9;
  text-shadow: 0 0 8px rgba(255, 190, 106, 0.5);
  background: rgba(10, 10, 26, 0.78);
  border: 1px solid rgba(255, 190, 106, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  clip-path: polygon(
    0 0,
    calc(100% - 10px) 0,
    100% 10px,
    100% 100%,
    10px 100%,
    0 calc(100% - 10px)
  );
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  pointer-events: none;

  &__dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    background: rgba(255, 190, 106, 0.95);
    box-shadow: 0 0 8px rgba(255, 190, 106, 0.9);
    animation: tag-blink 1.2s steps(2, start) infinite;
  }
}

.maintenance-tip-enter-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.maintenance-tip-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.maintenance-tip-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

.maintenance-tip-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

.currency-meta {
  &__amount {
    margin: 0 12px;
    min-width: 8ch;
    text-align: right;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 1px;
    line-height: 1.2;
    color: #aee6ff;
    text-shadow: 0 0 10px rgba(96, 200, 255, 0.65);
  }
}
</style>
