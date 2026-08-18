<script setup lang="ts">
/**
 * 游戏启动页（Launcher）
 * 职责：开机引导 + 主视觉 + 唯一入口「开始行动」
 * 低耦合设计：
 *   - 所有文案均可通过 props 覆盖，组件不关心具体游戏内容
 *   - 对外仅暴露一个 launch 事件，由父级决定之后进入什么界面
 *   - 背景拆分为 LauncherBackdrop 子组件
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import LauncherBackdrop from '../components/launcher/LauncherBackdrop.vue'
import LauncherVisualizer from '../components/launcher/LauncherVisualizer.vue'
import { playBgm, stopBgm } from '../utils/bgm'
import { playSfx, preloadSfx } from '../utils/sfx'
import { TERM_SCRIPT } from '../components/launcher/termScript'
import type { TermOutKind } from '../components/launcher/termScript'
import headerTitle from '../assets/home/header.png'
import btnHoverSfx from '../assets/audio/ui/btn-hover.wav'
import btnLaunchSfx from '../assets/audio/ui/btn-launch.wav'

withDefaults(
  defineProps<{
    /** 主标题普通部分 */
    title?: string
    /** 主标题高亮部分 */
    titleAccent?: string
    /** 副标题 */
    subtitle?: string
    /** 顶部版本号 */
    version?: string
    /** 启动按钮文案 */
    buttonText?: string
  }>(),
  {
    title: '喵奈',
    titleAccent: 'Project',
    subtitle: '// 神 经 链 路 已 就 绪 — AWAITING OPERATOR //',
    version: '0.0.1',
    buttonText: '开始行动'
  }
)

const emit = defineEmits<{
  /** 点击「开始行动」（或按 Enter）且过场动画结束后触发 */
  launch: []
}>()

/** 是否正在执行启动过场（防止重复点击） */
const launching = ref(false)
const clock = ref('--:--:--')
/** 左侧栏随机滚动编号 */
const railNum = ref('002')

/* ===== 右上角硬件 HUD（纯氛围的寄存器/协议级参数） ===== */
const sid = ref('0x------')
/** 装饰性计数器：DMA 十六进制计数 */
const dmaTx = ref('0x4E2F1A')
const dmaRx = ref('0x1A3C90')

let clockTimer: number | undefined
let railNumTimer: number | undefined
let hudTimer: number | undefined

let dmaTxN = 0x4e2f1a
let dmaRxN = 0x1a3c90

/** 每秒抖动一次计数器：十六进制递增 + 数值微抖，模拟内核监控 */
function jitterHud() {
  dmaTxN += (Math.random() * 0x800) | 0
  dmaRxN += (Math.random() * 0x4000) | 0
  dmaTx.value = '0x' + dmaTxN.toString(16).toUpperCase()
  dmaRx.value = '0x' + dmaRxN.toString(16).toUpperCase()
}

/** 生成随机会话 ID */
function genSid() {
  sid.value =
    '0x' + ((Math.random() * 0xffffff) | 0).toString(16).toUpperCase().padStart(6, '0')
}

/* ===== 右侧信号指示（强度波动 + 链路参数抖动） ===== */
const SIG_BAR_COUNT = 5
/** 当前点亮的信号格数（偏向满格，偶尔跌落） */
const sigLevel = ref(4)
const rssi = ref('-58')
const rtt = ref('23')
const loss = ref('0.0')

let sigTimer: number | undefined

/** 每 800ms 波动一次：信号格数起伏，RSSI/RTT/丢包率随之联动 */
function jitterSignal() {
  // 大部分时候保持 4~5 格，小概率掉到 3 格，模拟真实链路呼吸
  const roll = Math.random()
  sigLevel.value = roll < 0.12 ? 3 : roll < 0.62 ? 4 : 5
  rssi.value = String(-(52 + ((5 - sigLevel.value) * 6 + Math.random() * 5) | 0))
  rtt.value = String(9 + ((Math.random() * 26) | 0) + (5 - sigLevel.value) * 7)
  loss.value = sigLevel.value <= 3 ? (Math.random() * 0.6).toFixed(1) : '0.0'
}

/* ===== 右上角舰船登录 HUD：链路建立 → 指挥官认证 → 上线回传 ===== */
type ShipPhase = 'linking' | 'auth' | 'online'
const shipPhase = ref<ShipPhase>('linking')
/** 认证进度 0~100 */
const shipAuth = ref(0)
/** 链路建立阶段的滚动点 */
const shipDots = ref('')

/** 舰体实时参数（online 阶段持续抖动） */
const shipHull = ref('98.2')
const shipShield = ref('76')
const shipFuel = ref('83.5')
const shipDock = ref('BAY-07')

let shipTimer: number | undefined
/** 组件卸载后终止舰船登录流程 */
let shipStopped = false

/** 上线后每秒抖动一次舰体参数，模拟遥测回传 */
function jitterShip() {
  shipHull.value = (97.5 + Math.random() * 2.4).toFixed(1)
  shipShield.value = String(70 + ((Math.random() * 28) | 0))
  shipFuel.value = (82 + Math.random() * 3.5).toFixed(1)
}

/** 舰船登录流程：建立链路 → 认证进度条 → 上线并持续回传舰体参数 */
function runShipLogin() {
  shipPhase.value = 'linking'
  let dots = 0
  const linkTick = window.setInterval(() => {
    if (shipStopped) return window.clearInterval(linkTick)
    shipDots.value = '.'.repeat((dots++ % 3) + 1)
  }, 350)
  window.setTimeout(() => {
    window.clearInterval(linkTick)
    if (shipStopped) return
    shipPhase.value = 'auth'
    const authTick = window.setInterval(() => {
      if (shipStopped) return window.clearInterval(authTick)
      shipAuth.value = Math.min(100, shipAuth.value + 2 + ((Math.random() * 7) | 0))
      if (shipAuth.value >= 100) {
        window.clearInterval(authTick)
        shipPhase.value = 'online'
        jitterShip()
        shipTimer = window.setInterval(jitterShip, 1200)
      }
    }, 90)
  }, 2200)
}

/* ===== 左上角伪终端（脚本数据见 ./termScript.ts） ===== */

/** 终端可见行（命令行 + 输出行） */
const termLines = ref<{ kind: 'cmd' | TermOutKind; text: string }[]>([])
/** 最多保留的行数，超出滚动丢弃 */
const TERM_MAX_LINES = 12
/** 组件卸载后终止打字循环 */
let termStopped = false

const termSleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function pushTermLine(kind: 'cmd' | TermOutKind, text: string) {
  termLines.value.push({ kind, text })
  if (termLines.value.length > TERM_MAX_LINES) {
    termLines.value.splice(0, termLines.value.length - TERM_MAX_LINES)
  }
}

/** 循环执行指令脚本：逐字敲入命令 → 停顿 → 逐行吐出输出 */
async function runTerm() {
  let idx = 0
  while (!termStopped) {
    const { cmd, out } = TERM_SCRIPT[idx % TERM_SCRIPT.length]
    pushTermLine('cmd', '')
    for (let i = 1; i <= cmd.length; i++) {
      if (termStopped) return
      termLines.value[termLines.value.length - 1].text = cmd.slice(0, i)
      await termSleep(8 + Math.random() * 10)
    }
    await termSleep(90)
    // 系统输出：高速倾泻，模拟真实终端刷屏
    for (let i = 0; i < out.length; i++) {
      if (termStopped) return
      pushTermLine(out[i].kind ?? 'out', out[i].text)
      // 偶发一次推两行，营造突发的块输出感
      if (Math.random() < 0.18 && i + 1 < out.length) {
        i++
        pushTermLine(out[i].kind ?? 'out', out[i].text)
      }
      await termSleep(6 + Math.random() * 12)
    }
    idx++
    await termSleep(550)
  }
}

function tickClock() {
  clock.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

/** 每 25ms 刷新一次随机三位数，高速滚动只剩残影 */
function rollRailNum() {
  railNum.value = String((Math.random() * 1000) | 0).padStart(3, '0')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') startLaunch()
}

onMounted(() => {
  tickClock()
  clockTimer = window.setInterval(tickClock, 500)
  railNumTimer = window.setInterval(rollRailNum, 25)
  window.addEventListener('keydown', onKeydown)
  // 循环播放启动页 BGM（若被自动播放策略拦截，会在首次交互后自动补播）
  playBgm('home')
  // 预加载按钮音效，保证首次 hover / 点击零延迟发声
  preloadSfx(btnHoverSfx)
  preloadSfx(btnLaunchSfx)
  runTerm()
  genSid()
  jitterHud()
  hudTimer = window.setInterval(jitterHud, 1000)
  jitterSignal()
  sigTimer = window.setInterval(jitterSignal, 800)
  runShipLogin()
})

onBeforeUnmount(() => {
  window.clearInterval(clockTimer)
  window.clearInterval(railNumTimer)
  window.clearInterval(hudTimer)
  window.clearInterval(sigTimer)
  window.clearInterval(shipTimer)
  window.removeEventListener('keydown', onKeydown)
  stopBgm()
  termStopped = true
  shipStopped = true
})

/** 按钮 hover：电流滴答提示音（高频触发，音量已在 sfxVolumes 中压低） */
function onBtnHover() {
  if (launching.value) return
  playSfx(btnHoverSfx)
}

function startLaunch() {
  if (launching.value) return
  launching.value = true
  // 部署确认音与闪光过场同步响起
  playSfx(btnLaunchSfx)
  // 等待闪光过场动画播完再通知父级切换页面
  setTimeout(() => emit('launch'), 150)
}
</script>

<template>
  <div class="launcher" :class="{ 'launcher--launching': launching }">
    <LauncherBackdrop />

    <!-- 顶部 HUD -->
    <header class="launcher__topbar">
      <div class="launcher__spacer"></div>
      <div class="launcher__hud">
        <span>DMA // <b>▲{{ dmaTx }} ▼{{ dmaRx }}</b></span>
        <span>SID // <b>{{ sid }}</b></span>
      </div>
      <div class="launcher__time">
        SYSTEM TIME // <b>{{ clock }}</b>
      </div>
    </header>

    <!-- 左上角伪终端：循环播放攻防指令流 -->
    <div class="launcher__term" aria-hidden="true">
      <div class="launcher__term-head">/// OPS_TERMINAL — LIVE FEED</div>
      <div
        v-for="(line, i) in termLines"
        :key="i"
        class="launcher__term-line"
        :class="`launcher__term-line--${line.kind}`"
      >
        <template v-if="line.kind === 'cmd'">
          <span class="launcher__term-ps1">root@ops:~#</span>
          {{ line.text
          }}<span
            v-if="i === termLines.length - 1"
            class="launcher__term-caret"
          ></span>
        </template>
        <template v-else>{{ line.text }}</template>
      </div>
    </div>

    <!-- 右上角舰船登录面板：喵御宅号 -->
    <aside class="launcher__ship" aria-hidden="true">
      <div class="launcher__ship-head">
        <span
          class="launcher__ship-led"
          :class="`launcher__ship-led--${shipPhase}`"
        ></span>
        VESSEL_LINK // CMD-DECK
      </div>

      <template v-if="shipPhase === 'linking'">
        <div class="launcher__ship-line">UPLINK 建立中{{ shipDots }}</div>
        <div class="launcher__ship-line launcher__ship-line--dim">
          握手协议 // NYA-7 频段扫描
        </div>
      </template>

      <template v-else-if="shipPhase === 'auth'">
        <div class="launcher__ship-line">指挥官身份认证</div>
        <div class="launcher__ship-bar">
          <i :style="{ width: shipAuth + '%' }"></i>
        </div>
        <div class="launcher__ship-line launcher__ship-line--dim">
          {{ shipAuth }}% // 校验神经密钥
        </div>
      </template>

      <template v-else>
        <div class="launcher__ship-name">喵御宅号</div>
        <div class="launcher__ship-line launcher__ship-line--dim">
          NYA-OTAKU CLASS // {{ shipDock }}
        </div>
        <div class="launcher__ship-line">
          指挥官认证 <b class="launcher__ship-ok">GRANTED</b>
        </div>
        <div class="launcher__ship-line">
          舰体 <b>{{ shipHull }}%</b> · 护盾 <b>{{ shipShield }}%</b>
        </div>
        <div class="launcher__ship-line">
          燃料 <b>{{ shipFuel }}%</b> · 状态
          <b class="launcher__ship-ok">READY</b>
        </div>
      </template>
    </aside>

    <!-- 左侧装饰栏 -->
    <aside class="launcher__rail">
      <span class="launcher__rail-num">[{{ railNum }}]</span>
      <div class="launcher__rail-tick"></div>
      <!-- 彩蛋：Base64 密文，解码有惊喜 -->
      <span class="launcher__rail-vtext">5oiR5LiN5oOz5LiK54+t</span>
      <div class="launcher__rail-tick"></div>
      <span class="launcher__rail-vtext">5oiR5oOz5pG46bG8</span>
    </aside>

    <!-- 右侧装饰栏 -->
    <aside class="launcher__info">
      <div class="launcher__bars">
        <i v-for="n in SIG_BAR_COUNT" :key="n" :class="{ on: n <= sigLevel }"></i>
      </div>
      <span>RSSI // {{ rssi }}dBm</span>
      <span>RTT // {{ rtt }}ms</span>
      <span>LOSS // {{ loss }}%</span>
    </aside>

    <!-- 主舞台 -->
    <main class="launcher__stage">
      <div class="launcher__title">
        <img
          class="launcher__title-img"
          :src="headerTitle"
          :alt="`${title} ${titleAccent}`"
          draggable="false"
        />
        <!-- 故障残影层：仅动画瞬间可见 -->
        <img
          class="launcher__title-img launcher__title-img--glitch-a"
          :src="headerTitle"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <img
          class="launcher__title-img launcher__title-img--glitch-b"
          :src="headerTitle"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
      </div>
      <p class="launcher__subtitle">{{ subtitle }}</p>

      <div class="launcher__divider">
        <div class="launcher__line"></div>
        <div class="launcher__sq"></div>
        <div class="launcher__line"></div>
      </div>

      <button
        class="launcher__btn"
        :class="{ 'launcher__btn--launching': launching }"
        :disabled="launching"
        @click="startLaunch"
        @mouseenter="onBtnHover"
      >
        <span class="launcher__btn-scan"></span>
        <span class="launcher__btn-idx">01</span>
        <span>{{ launching ? '部署中...' : buttonText }}</span>
      </button>
    </main>

    <!-- 左下角音频可视化 -->
    <LauncherVisualizer class="launcher__visualizer" />

    <!-- 底部 HUD -->
    <footer class="launcher__bottombar">
      <div class="launcher__status">
        <span class="launcher__led"></span>SERVER ONLINE
      </div>
      <span class="launcher__copyright"
        >[ © 2020-2026 上海喵御宅网络科技有限公司 · ALL RIGHTS RESERVED ]</span
      >
      <span>// LAUNCHER-01</span>
      <div class="launcher__spacer"></div>
      <span class="launcher__hint">[ ENTER ] 快速部署</span>
      <div class="launcher__hazard"></div>
      <div class="launcher__ver">v{{ version }}</div>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
.launcher {
  --launcher-accent: #bb99f5;
  --launcher-accent-dim: rgba(187, 153, 245, 0.35);
  --launcher-ink: #0a0e1a;
  --launcher-ink2: #101527;
  --launcher-white: #f2f5fa;
  --launcher-cyan: #5ee6ff;

  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--launcher-ink);
  color: var(--launcher-white);
  font-family: 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
  cursor: crosshair;
  user-select: none;
  transition: filter 0.45s;

  &--launching {
    filter: brightness(2.5) saturate(0.2);
  }

  &__spacer {
    flex: 1;
  }

  /* ===== 顶部 HUD ===== */
  &__topbar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 20px 84px;
    font-size: 11px;
    letter-spacing: 0.25em;
  }

  &__ver {
    color: var(--launcher-accent);
  }

  &__time {
    color: rgba(242, 245, 250, 0.6);

    b {
      color: var(--launcher-cyan);
      font-weight: 600;
    }
  }

  /* 右上角硬件参数栏：标签暗色，数值青色 */
  &__hud {
    display: flex;
    align-items: center;
    gap: 22px;
    color: rgba(242, 245, 250, 0.35);

    b {
      color: var(--launcher-cyan);
      font-weight: 600;
    }
  }

  /* ===== 左上角伪终端 ===== */
  &__term {
    position: absolute;
    top: 54px;
    left: 78px;
    z-index: 5;
    width: 420px;
    min-height: 240px;
    font-family: 'Cascadia Mono', Consolas, 'Courier New', monospace;
    font-size: 10px;
    line-height: 1.75;
    letter-spacing: 0.04em;
    color: rgba(242, 245, 250, 0.38);
    pointer-events: none;
    text-shadow: 0 0 6px rgba(94, 230, 255, 0.12);
    mask-image: linear-gradient(180deg, #000 78%, transparent);
  }

  &__term-head {
    margin-bottom: 6px;
    font-size: 9px;
    letter-spacing: 0.35em;
    color: rgba(94, 230, 255, 0.4);
  }

  &__term-line {
    white-space: pre-wrap;
    word-break: break-all;

    &--cmd {
      color: rgba(187, 153, 245, 0.72);
    }

    &--ok {
      color: rgba(61, 255, 143, 0.55);
    }

    &--warn {
      color: rgba(255, 199, 95, 0.6);
    }

    &--err {
      color: rgba(255, 96, 116, 0.62);
    }

    &--hl {
      color: rgba(94, 230, 255, 0.62);
    }
  }

  &__term-ps1 {
    color: rgba(61, 255, 143, 0.5);
    margin-right: 6px;
  }

  &__term-caret {
    display: inline-block;
    width: 6px;
    height: 11px;
    margin-left: 2px;
    vertical-align: -1px;
    background: rgba(187, 153, 245, 0.7);
    animation: blink 0.9s steps(2) infinite;
  }

  /* ===== 右上角舰船登录面板 ===== */
  &__ship {
    position: absolute;
    top: 58px;
    right: 78px;
    z-index: 5;
    width: 340px;
    min-height: 140px;
    padding: 14px 18px 16px;
    font-family: 'Cascadia Mono', Consolas, 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.9;
    letter-spacing: 0.08em;
    color: rgba(242, 245, 250, 0.32);
    text-align: left;
    pointer-events: none;
    background: rgba(16, 21, 39, 0.18);
    border: 1px solid rgba(187, 153, 245, 0.1);
    clip-path: polygon(
      0 0,
      calc(100% - 14px) 0,
      100% 14px,
      100% 100%,
      14px 100%,
      0 calc(100% - 14px)
    );
    backdrop-filter: blur(1px);
    text-shadow: 0 0 6px rgba(94, 230, 255, 0.06);
    animation: ship-flicker 4.5s steps(1) infinite;

    b {
      color: rgba(94, 230, 255, 0.6);
      font-weight: 600;
    }
  }

  &__ship-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 10px;
    letter-spacing: 0.3em;
    color: rgba(94, 230, 255, 0.28);
  }

  &__ship-led {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(255, 199, 95, 0.55);
    box-shadow: 0 0 8px rgba(255, 199, 95, 0.4);
    animation: blink 0.7s steps(2) infinite;

    &--auth {
      background: rgba(187, 153, 245, 0.6);
      box-shadow: 0 0 8px rgba(187, 153, 245, 0.4);
    }

    &--online {
      background: rgba(61, 255, 143, 0.6);
      box-shadow: 0 0 8px rgba(61, 255, 143, 0.4);
      animation: blink 1.8s steps(2) infinite;
    }
  }

  &__ship-line {
    white-space: nowrap;

    &--dim {
      color: rgba(242, 245, 250, 0.18);
    }
  }

  &__ship-ok {
    color: rgba(61, 255, 143, 0.5);
    font-weight: 600;
  }

  &__ship-name {
    margin-bottom: 3px;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.35em;
    color: rgba(187, 153, 245, 0.65);
    text-shadow: 0 0 12px rgba(187, 153, 245, 0.25);
    animation: ship-name-glow 2.4s ease-in-out infinite;
  }

  &__ship-bar {
    height: 6px;
    margin: 8px 0;
    background: rgba(242, 245, 250, 0.06);
    overflow: hidden;

    i {
      display: block;
      height: 100%;
      background: linear-gradient(
        90deg,
        rgba(187, 153, 245, 0.55),
        rgba(94, 230, 255, 0.55)
      );
      box-shadow: 0 0 8px rgba(187, 153, 245, 0.35);
      transition: width 0.09s linear;
    }
  }

  /* ===== 左侧装饰栏 ===== */
  &__rail {
    position: absolute;
    left: 26px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 6;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  &__rail-num {
    font-size: 11px;
    color: var(--launcher-accent);
    font-weight: 700;
    letter-spacing: 0.15em;
    animation: rail-num-ghost 0.4s steps(2) infinite;
  }

  &__rail-tick {
    width: 1px;
    height: 60px;
    background: linear-gradient(
      180deg,
      transparent,
      var(--launcher-accent),
      transparent
    );
  }

  &__rail-vtext {
    writing-mode: vertical-rl;
    font-size: 10px;
    letter-spacing: 0.5em;
    color: rgba(242, 245, 250, 0.4);
  }

  /* ===== 右侧装饰栏 ===== */
  &__info {
    position: absolute;
    right: 26px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 6;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 14px;
    font-size: 10px;
    letter-spacing: 0.3em;
    color: rgba(242, 245, 250, 0.45);
    text-align: right;
  }

  &__bars {
    display: flex;
    align-items: flex-end;
    gap: 4px;

    i {
      width: 5px;
      background: rgba(242, 245, 250, 0.15);
      transition:
        background 0.35s ease,
        box-shadow 0.35s ease;

      // 信号表式递增高度
      @for $i from 1 through 5 {
        &:nth-child(#{$i}) {
          height: #{4 + $i * 4}px;
        }
      }

      &.on {
        background: var(--launcher-accent);
        box-shadow: 0 0 8px var(--launcher-accent);
      }
    }
  }

  /* ===== 主舞台 ===== */
  &__stage {
    position: relative;
    z-index: 4;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 0 20px;

    /* 标题图片绝对定位后，其余组件提到图片上层 */
    > *:not(.launcher__title) {
      position: relative;
      z-index: 1;
    }
  }

  &__title {
    position: absolute;
    top: 44%;
    left: 50%;
    z-index: 0;
    width: 1000px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    /* 出场：纵向裂缝扫描展开 + 故障切片回弹 */
    animation: title-enter 1s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
  }

  &__title-img {
    display: block;
    width: 100%;
    height: auto;
    filter: drop-shadow(0 0 28px rgba(187, 153, 245, 0.35))
      drop-shadow(0 0 60px rgba(94, 230, 255, 0.15));

    /* 基础图出场时轻微推近 */
    &:not(&--glitch-a):not(&--glitch-b) {
      animation: title-img-enter 1s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
    }

    /* 故障残影层：平时隐藏，动画触发时以切片 + 色差重影闪现 */
    &--glitch-a,
    &--glitch-b {
      position: absolute;
      inset: 0;
      opacity: 0;
    }

    &--glitch-a {
      clip-path: inset(18% 0 56% 0);
      filter: drop-shadow(-3px 0 rgba(94, 230, 255, 0.8));
      animation: title-glitch-a 3.2s steps(1) 1.2s infinite;
    }

    &--glitch-b {
      clip-path: inset(60% 0 16% 0);
      filter: drop-shadow(3px 0 rgba(187, 153, 245, 0.8));
      animation: title-glitch-b 2.7s steps(1) 1.2s infinite;
    }
  }

  &__subtitle {
    margin-top: 230px;
    font-size: 14px;
    letter-spacing: 0.55em;
    color: rgba(242, 245, 250, 0.8);
    text-shadow: 0 0 14px rgba(94, 230, 255, 0.3);
  }

  &__divider {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 34px 0;
    width: min(560px, 80vw);
  }

  &__line {
    flex: 1;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(242, 245, 250, 0.35),
      transparent
    );
  }

  &__sq {
    width: 10px;
    height: 10px;
    border: 2px solid var(--launcher-accent);
    transform: rotate(45deg);
  }

  /* ===== 启动按钮 ===== */
  &__btn {
    position: relative;
    display: flex;
    align-items: center;
    gap: 16px;
    width: min(400px, 84vw);
    padding: 18px 30px;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.35em;
    color: var(--launcher-white);
    background: rgba(16, 21, 39, 0.7);
    border: 1px solid var(--launcher-accent);
    box-shadow:
      inset 0 0 20px rgba(187, 153, 245, 0.15),
      0 0 24px rgba(187, 153, 245, 0.18);
    clip-path: polygon(16px 0, 100% 0, calc(100% - 16px) 100%, 0 100%);
    cursor: pointer;
    transition: all 0.22s ease;
    backdrop-filter: blur(4px);
    overflow: hidden;
    font-family: inherit;
    /* 呼吸发光：让按钮成为标题之下的第二视觉焦点 */
    animation: btn-breathe 2.6s ease-in-out infinite;

    &:focus-visible {
      outline: 2px solid var(--launcher-cyan);
      outline-offset: 3px;
    }

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, var(--launcher-accent), #d9c2fb);
      transform: translateX(-101%);
      transition: transform 0.25s ease;
      z-index: 0;
    }

    &:hover {
      color: var(--launcher-ink);
      box-shadow: 0 0 30px rgba(187, 153, 245, 0.35);

      &::before {
        transform: translateX(0);
      }

      .launcher__btn-idx,
      .launcher__btn-en {
        color: var(--launcher-ink);
      }
    }

    &:active {
      transform: scale(0.97);
    }

    &:disabled {
      cursor: default;
    }

    span {
      position: relative;
      z-index: 1;
    }
  }

  &__btn-idx {
    font-size: 11px;
    color: var(--launcher-accent);
    letter-spacing: 0.1em;
    font-weight: 900;
    margin-left: 21px;
  }

  &__btn-en {
    margin-left: auto;
    font-size: 9px;
    letter-spacing: 0.3em;
    color: rgba(242, 245, 250, 0.35);
    font-weight: 400;
  }

  &__btn-scan {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 60px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.25),
      transparent
    );
    transform: skewX(-20deg);
    left: -80px;
    /* 扫描光周期性扫过按钮表面，常态下也有存在感 */
    animation: btn-scan-sweep 3.8s ease-in-out infinite;
    pointer-events: none;
  }

  /* 启动中按钮：能量充满 + 柔和发光 + 文字色差故障 */
  &__btn--launching {
    color: var(--launcher-ink);
    border-color: rgba(94, 230, 255, 0.7);
    box-shadow: 0 0 20px rgba(187, 153, 245, 0.35);
    animation: btn-text-glitch 0.28s steps(1) infinite;

    &::before {
      transform: translateX(0);
    }

    .launcher__btn-idx,
    .launcher__btn-en {
      color: var(--launcher-ink);
    }
  }

  /* ===== 底部 HUD ===== */
  &__bottombar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 6;
    padding: 18px 84px;
    display: flex;
    align-items: center;
    gap: 20px;
    font-size: 10px;
    letter-spacing: 0.3em;
    color: rgba(242, 245, 250, 0.45);
  }

  &__status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__led {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3dff8f;
    box-shadow: 0 0 10px #3dff8f;
    animation: blink 1.6s steps(2) infinite;
  }

  &__copyright {
    font-size: 9px;
    letter-spacing: 0.15em;
    color: rgba(242, 245, 250, 0.3);
    white-space: nowrap;
  }

  &__hint {
    color: var(--launcher-accent-dim);
  }

  &__hazard {
    width: 120px;
    height: 14px;
    background: repeating-linear-gradient(
      -45deg,
      var(--launcher-accent) 0 14px,
      transparent 14px 28px
    );
    opacity: 0.85;
  }
}

@keyframes blink {
  50% {
    opacity: 0.15;
  }
}

/* 舰船面板信号闪烁：极轻微的透明度抖动，模拟全息投影不稳 */
@keyframes ship-flicker {
  0%,
  100% {
    opacity: 1;
  }

  92% {
    opacity: 1;
  }

  93% {
    opacity: 0.55;
  }

  94% {
    opacity: 0.9;
  }

  95% {
    opacity: 0.7;
  }

  96% {
    opacity: 1;
  }
}

/* 舰名呼吸辉光 */
@keyframes ship-name-glow {
  0%,
  100% {
    text-shadow: 0 0 12px rgba(187, 153, 245, 0.25);
  }

  50% {
    text-shadow:
      0 0 18px rgba(187, 153, 245, 0.45),
      0 0 34px rgba(94, 230, 255, 0.15);
  }
}

/* 编号高速滚动的残影：纵向重影 + 轻微模糊交替 */
@keyframes rail-num-ghost {
  0%,
  100% {
    text-shadow:
      0 -2px 3px rgba(187, 153, 245, 0.6),
      0 2px 3px rgba(94, 230, 255, 0.5);
    filter: blur(0.4px);
  }

  50% {
    text-shadow:
      0 -4px 4px rgba(187, 153, 245, 0.4),
      0 4px 4px rgba(94, 230, 255, 0.35);
    filter: blur(0.8px);
  }
}

/* 按钮文字色差故障：重影方向/间距硬切 */
@keyframes btn-text-glitch {
  0%,
  100% {
    text-shadow:
      -2px 0 var(--launcher-cyan),
      2px 0 var(--launcher-accent);
  }

  25% {
    text-shadow:
      3px 0 var(--launcher-cyan),
      -1px 0 var(--launcher-accent);
  }

  50% {
    text-shadow:
      -3px 1px var(--launcher-accent),
      3px -1px var(--launcher-cyan);
  }

  75% {
    text-shadow:
      1px 0 var(--launcher-cyan),
      -3px 0 var(--launcher-accent);
  }
}

/* 按钮呼吸发光：常态下缓慢脉动，吸引视线 */
@keyframes btn-breathe {
  0%,
  100% {
    box-shadow:
      inset 0 0 20px rgba(187, 153, 245, 0.15),
      0 0 16px rgba(187, 153, 245, 0.12);
  }

  50% {
    box-shadow:
      inset 0 0 26px rgba(187, 153, 245, 0.24),
      0 0 42px rgba(187, 153, 245, 0.4);
  }
}

/* 按钮扫描光：大部分时间停在场外，周期性快速扫过 */
@keyframes btn-scan-sweep {
  0%,
  60% {
    left: -80px;
  }

  85%,
  100% {
    left: 110%;
  }
}

/* 标题出场：从纵向裂缝中展开，中途两次切片故障后稳定 */
@keyframes title-enter {
  0% {
    opacity: 0;
    clip-path: inset(48% 0 48% 0);
    filter: blur(8px) brightness(2);
  }

  35% {
    opacity: 1;
    clip-path: inset(0 0 0 0);
    filter: blur(0) brightness(1.4);
  }

  45% {
    clip-path: inset(14% 0 62% 0);
  }

  52% {
    clip-path: inset(58% 0 8% 0);
    filter: blur(0) brightness(1);
  }

  58%,
  100% {
    opacity: 1;
    clip-path: inset(0 0 0 0);
    filter: blur(0) brightness(1);
  }
}

/* 标题出场时基础图轻微推近，配合容器展开 */
@keyframes title-img-enter {
  0% {
    transform: scale(1.1);
  }

  100% {
    transform: scale(1);
  }
}

/* 标题图片故障切片：大部分帧隐藏，瞬时错位闪现 */
@keyframes title-glitch-a {
  0%,
  91% {
    transform: none;
    opacity: 0;
  }

  92% {
    transform: translate(-8px, 3px);
    opacity: 0.85;
  }

  94% {
    transform: translate(6px, -3px);
    opacity: 0.85;
  }

  96% {
    transform: translate(-4px, 2px);
    opacity: 0.85;
  }

  98%,
  100% {
    transform: none;
    opacity: 0;
  }
}

@keyframes title-glitch-b {
  0%,
  87% {
    transform: none;
    opacity: 0;
  }

  88% {
    transform: translate(7px, -3px);
    opacity: 0.85;
  }

  90% {
    transform: translate(-6px, 3px);
    opacity: 0.85;
  }

  92% {
    transform: translate(4px, 2px);
    opacity: 0.85;
  }

  93%,
  100% {
    transform: none;
    opacity: 0;
  }
}

@media (max-width: 640px) {
  .launcher {
    &__topbar,
    &__bottombar {
      padding-left: 40px;
      padding-right: 40px;
    }

    &__rail,
    &__info,
    &__btn-en,
    &__copyright,
    &__visualizer,
    &__term,
    &__ship,
    &__hud {
      display: none;
    }
  }
}
</style>
