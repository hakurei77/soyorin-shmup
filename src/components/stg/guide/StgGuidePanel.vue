<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BehaviorType, EnemyKey, EnemyWeaponKey, SkillKey, WeaponKey } from '@/types'
import {
  guideCharacters,
  guideEnemies,
  guideEnemyBehaviors,
  guideEnemyPaths,
  guideEnemyWeapons,
  guideSkills,
  guideTabs,
  guideWeapons,
  type GuideEnemyPathKey,
  type GuideEntry,
  type GuideTab
} from './guideData'
import { GUIDE_H, GUIDE_W, useGuidePreview } from './useGuidePreview'
import { playSfxStoppable, preloadSfx } from '@/utils/sfx'
import guideUrl from '@/assets/icon/guide.svg'
import bg2Url from '@/assets/background/bg2.png'
import archiveBootSfx from '@/assets/audio/ui/archive-boot.wav'

const emit = defineEmits<{ (e: 'close'): void }>()

// ==================== 入场引导序列 ====================
// CRT 质感底 → 聚焦框浮现(小) → 聚焦框扩张 → 徽标闪烁显影 + 横线/数据块 → 进度条 → 闪光进入
// 点击任意处跳过

/** 入场动画全局时间倍率：1 为正常速度，调大（如 2、3）整体变慢便于调试，调小变快 */
const BOOT_TIME_SCALE = 1
const T = (ms: number) => ms * BOOT_TIME_SCALE

const booted = ref(false)
const phase = ref(0)
const progress = ref(0)
let progressTimer = 0
let doneTimer = 0
const bootTimers: number[] = []
/** 入场加载音的停止函数（点击跳过 / 卸载时打断） */
let stopBootSfx: (() => void) | null = null

/** 阶段类累积：p1 ⊂ p2 ⊂ p3 ⊂ p4，便于 CSS 逐阶段叠加 */
const phaseClasses = computed(() =>
  [1, 2, 3, 4].filter((p) => phase.value >= p).map((p) => `guide-boot--p${p}`)
)

/** 状态字样：认证成功 → 徽标显影→读取档案库 → 满格→读取完成 */
const statusText = computed(() => {
  if (progress.value >= 100) return '读取完成'
  if (phase.value >= 3) return '正在读取档案库'
  return '信息认证成功'
})

function startProgress() {
  // 不均匀爬升，配合数据扫描节奏（约 1.5 秒跑完）
  progressTimer = window.setInterval(() => {
    // 10% 概率卡顿一拍，像真实加载
    if (Math.random() < 0.1) return
    progress.value = Math.min(100, progress.value + 2 + Math.floor(Math.random() * 5))
    if (progress.value >= 100) {
      window.clearInterval(progressTimer)
      doneTimer = window.setTimeout(finishBoot, T(160))
    }
  }, T(28))
}

function finishBoot() {
  if (booted.value) return
  progress.value = 100
  window.clearInterval(progressTimer)
  window.clearTimeout(doneTimer)
  bootTimers.forEach((t) => window.clearTimeout(t))
  stopDataScan()
  stopBootSfx?.() // 跳过 / 自然完成都立即停掉加载音
  stopBootSfx = null
  booted.value = true
}

/** 生成转储风格的数据行：长串十六进制堆 / 扇区日志 / 校验记录 */
function makeDumpLine(): string {
  const hex = () => ((Math.random() * 0xffff) | 0).toString(16).toUpperCase().padStart(4, '0')
  const hex8 = () => `${hex()}${hex()}`
  const kind = Math.random()
  if (kind < 0.35) {
    // 十六进制堆：组数随机 2-10，偶尔混入 8 位长字
    const groups = 2 + ((Math.random() * 9) | 0)
    return `0x${hex()} ${Array.from({ length: groups }, () => (Math.random() < 0.2 ? hex8() : hex())).join(' ')}`
  }
  if (kind < 0.45) {
    // 超短状态行
    return ['SYNC OK', 'RDY', `IRQ ${hex()}`, 'PING .. PONG', `FLUSH 0x${hex()}`, 'NOP'][
      (Math.random() * 6) | 0
    ]!
  }
  if (kind < 0.6) {
    return `LOG#${1000 + ((Math.random() * 9000) | 0)} .. SECTOR ${String((Math.random() * 64) | 0).padStart(2, '0')} READ ${hex()}:${hex()} OFFSET 0x${hex()}`
  }
  if (kind < 0.7) {
    // 长行：扇区日志 + 附加转储
    return `LOG#${1000 + ((Math.random() * 9000) | 0)} .. SECTOR ${String((Math.random() * 64) | 0).padStart(2, '0')} READ ${hex()}:${hex()} OFFSET 0x${hex()} :: ${hex()} ${hex()} ${hex()} ${hex()} ${hex()} ${hex()} VERIFY ${hex()}`
  }
  if (kind < 0.85) {
    return `CHK ${hex()}:${hex()}:${hex()} ...... PASS ...... ${hex()} CONFIRMED`
  }
  return `ADDR 0x${hex()} -> 0x${hex()} .. CACHED .. MAP[${hex()}] SYNC 0x${hex()}`
}

/** 终端扫数据的最终文本（左 / 右两栏， curated + 程序生成，保证数据量扫不完） */
const BOOT_LEFT = [
  '> LINK ESTABLISHED ............. OK // NODE 07',
  'SYS.CHECK .. OK',
  'ROUTE: 星港中枢 → 外环宙域 .. ETA 00:04:12 .. WINDOW NARROW',
  'SIGNAL LOCK ............ OK .. -42dBm STABLE',
  'DUST-FIELD 0.42 ppm',
  'SHIELD GRID ............ NOMINAL .. 98.2%',
  'THERMAL 36.5C .. FAN AUTO',
  'VECTOR ........ 042.77/-18.03 .. DRIFT 0.002 .. CORRECTED',
  'UPLINK ............ 1.244 Gb/s .. AES-256 ENC',
  'ARCHIVE NODE .. NAV-07',
  'HANDSHAKE .............. DONE .. TLS1.3 .. SESSION 0x7F3A',
  '> DECRYPTING INDEX ........... 12/18 BLOCKS',
  ...Array.from({ length: 40 }, makeDumpLine)
]
const BOOT_RIGHT = [
  'ARCHIVE INDEX .......... v3.2 .. REV 2026.08',
  'RECORDS .. 18',
  'AUTH TOKEN ............ VALID .. EXPIRE 300s',
  'CLEARANCE .. OPEN .. LEVEL-0',
  'CHANNEL ................ 07-G .. ENCRYPTED',
  'ORBIT .................. LEO-422 .. DECAY 0.3M/D',
  'CHECKSUM .. PASS .. CRC32',
  'MEM ................ 42% STABLE .. 3.4/8.0 GB',
  'CPU .................. 08% IDLE .. 12 CORES',
  'RX/TX 128/512 Mbps .. LOSS 0.0%',
  'STATUS ................. STANDBY .. PWR SAVE',
  '> DECRYPTING RECORDS ..... BUF 0x4D21',
  ...Array.from({ length: 40 }, makeDumpLine)
]

/** 乱码解析用字符集 */
const SCAN_GLYPHS = '01#$%&@*+-=/<>[]ACEF09'
const randomGlyph = () => SCAN_GLYPHS[(Math.random() * SCAN_GLYPHS.length) | 0]

/** 扫描行：对象引用保证顶出旧行后乱码解析仍写到正确的行 */
interface ScanRow {
  id: number
  text: string
}

/** 当前可见的扫描行（定高容器，超出后旧行从顶部顶出，像终端滚动） */
const bootDataLeft = ref<ScanRow[]>([])
const bootDataRight = ref<ScanRow[]>([])
let scanRowId = 0
/** 与 CSS 定高对应的最大可见行数（5px 字 ≈ 7.25px/行） */
const SCAN_MAX_VISIBLE = 33
let scanTimer = 0
const scrambleTimers: number[] = []

/** 单行扫入：先整行乱码，随后从左到右逐段解析为最终文本 */
function scrambleInto(target: typeof bootDataLeft, final: string) {
  if (target.value.length >= SCAN_MAX_VISIBLE) target.value.shift()
  const row: ScanRow = {
    id: scanRowId++,
    text: final.replace(/\S/g, () => randomGlyph())
  }
  target.value.push(row)
  let tick = 0
  const t = window.setInterval(() => {
    tick++
    if (tick >= 2) {
      window.clearInterval(t)
      row.text = final
      return
    }
    const settled = (final.length * tick) / 2
    row.text = final
      .split('')
      .map((c, i) => (c === ' ' || i < settled ? c : randomGlyph()))
      .join('')
  }, T(20))
  scrambleTimers.push(t)
}

/**
 * 两栏并行扫数据：突发连扫数行后随机停顿，模拟真实扫描的不均匀节奏。
 * 与进度条完全解耦——通常数据还没扫完，入场就已结束。
 */
function startDataScan() {
  let i = 0
  let burst = 0
  const step = () => {
    // 预设数据扫完后持续生成转储行，一直扫到入场结束
    const left = i < BOOT_LEFT.length ? BOOT_LEFT[i]! : makeDumpLine()
    const right = i < BOOT_RIGHT.length ? BOOT_RIGHT[i]! : makeDumpLine()
    scrambleInto(bootDataLeft, left)
    scrambleInto(bootDataRight, right)
    i++
    let delay: number
    if (burst > 0) {
      // 突发中：极速连扫
      burst--
      delay = 3 + Math.random() * 5
    } else if (Math.random() < 0.15) {
      // 极短停顿，像在读盘
      delay = 25 + Math.random() * 45
    } else {
      // 开启下一波突发（6-14 行）
      burst = 6 + ((Math.random() * 8) | 0)
      delay = 6 + Math.random() * 10
    }
    scanTimer = window.setTimeout(step, T(delay))
  }
  scanTimer = window.setTimeout(step, T(60))
}

function stopDataScan() {
  window.clearTimeout(scanTimer)
  scrambleTimers.forEach((t) => window.clearInterval(t))
}

// ==================== 浏览状态 ====================
/** 页签短名与英文代号（完整名称见侧栏列表标题） */
const TAB_META: Record<GuideTab, { short: string; en: string }> = {
  character: { short: '角色信息', en: 'CHARACTERS' },
  enemy: { short: '敌人信息', en: 'ENEMIES' },
  enemyWeapon: { short: '敌人武器', en: 'ENEMY ARMS' },
  enemyPath: { short: '敌人轨迹', en: 'PATHS' },
  enemyBehavior: { short: '敌人行为分析', en: 'BEHAVIORS' },
  weapon: { short: '角色武器', en: 'WEAPONS' },
  skill: { short: '角色技能', en: 'SKILLS' }
}

const activeTab = ref<GuideTab>('character')
const selectedCharacter = ref<string>(guideCharacters[0]?.key ?? '')
const selectedEnemy = ref<EnemyKey>(guideEnemies[0].key)
const selectedEnemyWeapon = ref<EnemyWeaponKey>(guideEnemyWeapons[0].key)
const selectedEnemyPath = ref<GuideEnemyPathKey>(guideEnemyPaths[0].key)
const selectedEnemyBehavior = ref<BehaviorType>(guideEnemyBehaviors[0].key)
const selectedWeapon = ref<WeaponKey>(guideWeapons[0].key)
const selectedSkill = ref<SkillKey>(guideSkills[0].key)

/** 敌人二级导航：全部 / 普通敌人 / Boss */
type EnemySubTab = 'all' | 'normal' | 'boss'
const enemySubTab = ref<EnemySubTab>('all')
const enemySubTabs: { key: EnemySubTab; label: string }[] = [
  { key: 'all', label: '全部敌人' },
  { key: 'normal', label: '普通敌人' },
  { key: 'boss', label: 'BOSS' }
]

/** 切换敌人子标签时，若当前选中不在过滤列表内则自动选第一个 */
watch(enemySubTab, () => {
  if (activeTab.value !== 'enemy') return
  const filtered = enemySubTab.value === 'all'
    ? guideEnemies
    : guideEnemies.filter((e) => e.category === enemySubTab.value)
  if (!filtered.some((e) => e.key === selectedEnemy.value)) {
    selectedEnemy.value = filtered[0]?.key ?? guideEnemies[0].key
  }
})

const entries = computed<GuideEntry[]>(() => {
  switch (activeTab.value) {
    case 'character':
      return guideCharacters
    case 'enemy': {
      if (enemySubTab.value === 'all') return guideEnemies
      return guideEnemies.filter((e) => e.category === enemySubTab.value)
    }
    case 'enemyWeapon':
      return guideEnemyWeapons
    case 'enemyPath':
      return guideEnemyPaths
    case 'enemyBehavior':
      return guideEnemyBehaviors
    case 'weapon':
      return guideWeapons
    case 'skill':
      return guideSkills
  }
})

const selectedKey = computed(() => {
  switch (activeTab.value) {
    case 'character':
      return selectedCharacter.value
    case 'enemy':
      return selectedEnemy.value
    case 'enemyWeapon':
      return selectedEnemyWeapon.value
    case 'enemyPath':
      return selectedEnemyPath.value
    case 'enemyBehavior':
      return selectedEnemyBehavior.value
    case 'weapon':
      return selectedWeapon.value
    case 'skill':
      return selectedSkill.value
  }
})

const entry = computed(
  () => entries.value.find((e) => (e as { key?: string }).key === selectedKey.value) ?? entries.value[0]
)

function selectTab(tab: GuideTab) {
  activeTab.value = tab
}
function selectEntry(key: string) {
  if (activeTab.value === 'character') selectedCharacter.value = key
  else if (activeTab.value === 'enemy') selectedEnemy.value = key as EnemyKey
  else if (activeTab.value === 'enemyWeapon') selectedEnemyWeapon.value = key as EnemyWeaponKey
  else if (activeTab.value === 'enemyPath') selectedEnemyPath.value = key as GuideEnemyPathKey
  else if (activeTab.value === 'enemyBehavior') selectedEnemyBehavior.value = key as BehaviorType
  else if (activeTab.value === 'weapon') selectedWeapon.value = key as WeaponKey
  else selectedSkill.value = key as SkillKey
}

// ==================== Canvas 预览 ====================
const guideCanvasRef = ref<HTMLCanvasElement | null>(null)
const { start, stop } = useGuidePreview({
  canvasRef: guideCanvasRef,
  tab: activeTab,
  selectedCharacter,
  selectedEnemy,
  selectedEnemyWeapon,
  selectedEnemyPath,
  selectedEnemyBehavior,
  selectedWeapon,
  selectedSkill
})

onMounted(() => {
  start()
  preloadSfx(archiveBootSfx)
  stopBootSfx = playSfxStoppable(archiveBootSfx) // 加载音与入场动画同步起播
  bootTimers.push(
    window.setTimeout(() => (phase.value = 1), T(60)),
    window.setTimeout(() => (phase.value = 2), T(300)),
    window.setTimeout(() => {
      phase.value = 3
      startDataScan()
    }, T(520)),
    window.setTimeout(() => {
      phase.value = 4
      startProgress()
    }, T(800))
  )
})

onBeforeUnmount(() => {
  stop()
  window.clearInterval(progressTimer)
  window.clearTimeout(doneTimer)
  bootTimers.forEach((t) => window.clearTimeout(t))
  stopDataScan()
  stopBootSfx?.()
  stopBootSfx = null
})

const pad = (n: number) => String(n).padStart(2, '0')
</script>

<template>
  <div
    class="guide-page"
    :class="{ 'guide-page--booted': booted }"
    :style="{
      backgroundImage: `linear-gradient(rgba(6, 7, 18, 0.88), rgba(6, 7, 18, 0.95)), url(${bg2Url})`
    }"
  >
    <!-- 入场引导层：点击跳过 -->
    <Transition name="boot-fade">
      <div v-if="!booted" class="guide-boot" :class="phaseClasses" @click="finishBoot">
        <span class="guide-boot__blob guide-boot__blob--a" />
        <span class="guide-boot__blob guide-boot__blob--b" />

        <!-- 中央舞台 -->
        <div class="guide-boot__stage">
          <div class="guide-boot__focus">
            <span
              v-for="corner in ['tl', 'tr', 'bl', 'br']"
              :key="corner"
              class="guide-boot__corner"
              :class="`is-${corner}`"
            />
            <img class="guide-boot__emblem" :src="guideUrl" alt="" draggable="false" />
          </div>
          <div class="guide-boot__slot">
            <div class="guide-boot__headline">
              <p class="guide-boot__status">
                <span class="guide-boot__sq" />
                {{ statusText }}
                <span class="guide-boot__sq" />
              </p>
            </div>
          </div>
        </div>

        <!-- 两侧横线 -->
        <span class="guide-boot__line guide-boot__line--l" />
        <span class="guide-boot__line guide-boot__line--r" />

        <!-- 两侧数据文本块 -->
        <div class="guide-boot__data guide-boot__data--l">
          <span v-for="row in bootDataLeft" :key="row.id">{{ row.text }}</span>
        </div>
        <div class="guide-boot__data guide-boot__data--r">
          <span v-for="row in bootDataRight" :key="row.id">{{ row.text }}</span>
        </div>

        <!-- 进度条 -->
        <div class="guide-boot__bar">
          <div class="guide-boot__bar-track">
            <i :style="{ width: `${progress}%` }" />
          </div>
          <span class="guide-boot__bar-pct">{{ progress }}%</span>
        </div>

        <p class="guide-boot__skip">— CLICK TO SKIP —</p>

        <!-- CRT 质感层 -->
        <span class="guide-boot__noise" />
        <span class="guide-boot__scanlines" />
        <span class="guide-boot__vignette" />
      </div>
    </Transition>

    <!-- 页头 -->
    <header class="guide-head">
      <button class="guide-back" @click="emit('close')">
        <span class="guide-back__arrow">←</span>
        <span class="guide-back__label">返回</span>
        <span class="guide-back__en">BACK</span>
      </button>
      <div class="guide-head__title">
        <h2>档案</h2>
        <span class="guide-head__en">TACTICAL ARCHIVE // DATABASE</span>
      </div>
      <span class="guide-head__tag">ARCHIVE // NAV-07</span>
    </header>

    <!-- 主体 -->
    <div class="guide-body">
      <aside class="guide-side">
        <nav class="guide-side__menu">
          <div v-for="(tab, ti) in guideTabs" :key="tab.key" class="guide-group">
            <button
              class="guide-lv1"
              :class="{ active: activeTab === tab.key }"
              @click="selectTab(tab.key)"
            >
              <span class="guide-lv1__no">{{ pad(ti + 1) }}</span>
              <span class="guide-lv1__text">
                <span class="guide-lv1__label">{{ TAB_META[tab.key].short }}</span>
                <span class="guide-lv1__en">{{ TAB_META[tab.key].en }}</span>
              </span>
              <span class="guide-lv1__arrow">▸</span>
            </button>
            <Transition name="guide-fold">
              <div v-if="activeTab === tab.key" class="guide-group__sub">
                <!-- 敌人二级导航：普通敌人 / BOSS -->
                <div v-if="tab.key === 'enemy'" class="guide-subnav">
                  <button
                    v-for="sub in enemySubTabs"
                    :key="sub.key"
                    class="guide-subnav__item"
                    :class="{ active: enemySubTab === sub.key }"
                    @click="enemySubTab = sub.key"
                  >
                    {{ sub.label }}
                  </button>
                </div>
                <div class="guide-lv2">
                  <button
                    v-for="(item, i) in entries"
                    :key="(item as { key?: string }).key ?? item.name"
                    class="guide-lv2__item"
                    :class="{ active: (item as { key?: string }).key === selectedKey }"
                    @click="selectEntry((item as { key?: string }).key ?? '')"
                  >
                    <span class="guide-lv2__no">{{ pad(i + 1) }}</span>
                    {{ item.name }}
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </nav>
      </aside>

      <section class="guide-detail">
        <header :key="`head-${activeTab}-${selectedKey}`" class="guide-detail__head">
          <h3>
            {{ entry.name }}
            <span class="guide-detail__en">{{ entry.en }}</span>
          </h3>
          <p>{{ entry.desc }}</p>
        </header>

        <div class="guide-detail__preview">
          <div class="guide-detail__canvas-wrap">
            <canvas
              ref="guideCanvasRef"
              class="guide-detail__canvas"
              :width="GUIDE_W"
              :height="GUIDE_H"
            />
          </div>
          <div class="guide-params">
            <div v-for="p in entry.params" :key="p.name" class="guide-params__chip">
              <span class="guide-params__label">{{ p.name }}</span>
              <span class="guide-params__value">{{ p.value }}</span>
              <span class="guide-params__desc">{{ p.desc }}</span>
            </div>
          </div>
        </div>

        <ul
          v-if="entry.tips.length"
          :key="`tips-${activeTab}-${selectedKey}`"
          class="guide-detail__tips"
        >
          <li v-for="tip in entry.tips" :key="tip">{{ tip }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/stg-vars.scss' as *;

$mono: ui-monospace, 'Cascadia Mono', Consolas, monospace;

/* ==================== 页面骨架 ==================== */

.guide-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background-size: cover;
  background-position: center;
  user-select: none;
}

.guide-head {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 26px 44px 0;

  &__title {
    display: flex;
    align-items: baseline;
    gap: 16px;

    h2 {
      margin: 0;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 10px;
      color: #fff;
      text-shadow:
        0 0 16px rgba($accent, 0.65),
        0 0 48px rgba($accent-purple, 0.35);
    }
  }

  &__en {
    font-family: $mono;
    font-size: 10px;
    letter-spacing: 4px;
    color: rgba(255, 255, 255, 0.4);
  }

  &__tag {
    margin-left: auto;
    font-family: $mono;
    font-size: 9px;
    letter-spacing: 3px;
    color: rgba(255, 255, 255, 0.28);
  }
}

.guide-back {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 22px;
  font-size: 14px;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.14);
  clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    background: rgba($accent, 0.16);
    color: #fff;
    box-shadow: 0 0 16px rgba($accent, 0.3);
  }

  &__arrow {
    color: $accent;
  }

  &__en {
    font-family: $mono;
    font-size: 9px;
    letter-spacing: 3px;
    color: rgba(255, 255, 255, 0.35);
  }
}

.guide-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 20px;
  padding: 22px 44px 30px;
}

/* ==================== 侧栏 ==================== */

.guide-side {
  width: 252px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;

  &__menu {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-right: 4px;
  }
}

.guide-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 一级菜单 */
.guide-lv1 {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  text-align: left;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px);
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &__no {
    font-family: $mono;
    font-size: 9px;
    letter-spacing: 2px;
    color: rgba($accent, 0.7);
  }

  &__text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__label {
    font-size: 15px;
    letter-spacing: 3px;
  }

  &__en {
    font-family: $mono;
    font-size: 8px;
    letter-spacing: 2px;
    opacity: 0.55;
  }

  &__arrow {
    flex-shrink: 0;
    font-size: 11px;
    color: rgba($accent, 0.7);
    transition: transform 0.2s ease;
  }

  &:hover {
    background: rgba($accent, 0.1);
    color: #fff;
  }

  &.active {
    background: rgba($accent, 0.16);
    border-color: rgba($accent, 0.55);
    color: #fff;
    box-shadow: 0 0 14px rgba($accent, 0.28);

    .guide-lv1__arrow {
      transform: rotate(90deg);
    }
  }
}

/* 二级菜单展开/收起过渡：grid-template-rows 技巧实现高度动画 */
.guide-group__sub {
  display: grid;
  grid-template-rows: 1fr;
}

.guide-fold-enter-active,
.guide-fold-leave-active {
  transition:
    grid-template-rows 0.26s cubic-bezier(0.16, 0.84, 0.3, 1),
    opacity 0.22s ease;

  .guide-lv2__item {
    transition:
      opacity 0.18s ease,
      transform 0.24s cubic-bezier(0.16, 0.84, 0.3, 1);
  }
}

.guide-fold-enter-from,
.guide-fold-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;

  .guide-lv2__item {
    opacity: 0;
    transform: translateX(-8px);
  }
}

/* 敌人二级导航（普通敌人 / BOSS） */
.guide-subnav {
  display: flex;
  gap: 6px;
  margin-left: 6px;
  padding: 6px 6px 6px 8px;

  &__item {
    flex: 1;
    padding: 5px 10px;
    text-align: center;
    font-size: 11px;
    font-family: var(--font-mono, 'Courier New', monospace);
    color: rgba($accent, 0.55);
    background: rgba($accent, 0.06);
    border: 1px solid rgba($accent, 0.12);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      color: rgba($accent, 0.8);
      background: rgba($accent, 0.1);
      border-color: rgba($accent, 0.25);
    }
    &.active {
      color: #e0d5c0;
      background: rgba($accent, 0.18);
      border-color: rgba($accent, 0.45);
      box-shadow: inset 0 0 8px rgba($accent, 0.12);
    }
  }
}

/* 二级菜单 */
.guide-lv2 {
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 12px;
  padding-left: 10px;
  border-left: 1px solid rgba($accent, 0.18);

  &__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    text-align: left;
    font-size: 13px;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.55);
    background: transparent;
    border: 1px solid transparent;
    border-left: 2px solid rgba(255, 255, 255, 0.12);
    cursor: pointer;
    transition:
      background 0.18s ease,
      color 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;

    &:hover {
      color: #fff;
      border-left-color: rgba($accent, 0.6);
      background: rgba($accent, 0.07);
    }

    &.active {
      color: #fff;
      border-left-color: $accent;
      background: rgba($accent, 0.13);
      box-shadow: 0 0 12px rgba($accent, 0.2);
    }
  }

  &__no {
    font-family: $mono;
    font-size: 9px;
    letter-spacing: 1px;
    color: rgba($accent, 0.55);
  }
}

/* ==================== 详情面板 ==================== */

.guide-detail {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px 32px;
  background: $glass-bg;
  border: 1px solid $glass-border;
  clip-path: polygon(28px 0, 100% 0, 100% calc(100% - 28px), calc(100% - 28px) 100%, 0 100%, 0 28px);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  &__head {
    h3 {
      margin: 0 0 6px;
      font-size: 22px;
      letter-spacing: 4px;
      color: #fff;
    }

    p {
      margin: 0;
      font-size: 13px;
      letter-spacing: 1px;
      line-height: 1.7;
      color: rgba(255, 255, 255, 0.6);
    }
  }

  &__en {
    margin-left: 6px;
    font-family: $mono;
    font-size: 11px;
    letter-spacing: 2px;
    color: rgba($accent, 0.75);
  }

  &__preview {
    display: flex;
    align-items: flex-start;
    gap: 22px;
  }

  &__canvas-wrap {
    padding: 4px;
    background: rgba(6, 6, 18, 0.6);
    border: 1px dashed rgba($accent, 0.4);
    border-radius: 4px;
  }

  &__canvas {
    display: block;
  }

  &__tips {
    margin: 0;
    padding: 12px 18px 12px 32px;
    background: rgba($accent, 0.05);
    border-left: 2px solid rgba($accent, 0.3);

    li {
      font-size: 12.5px;
      letter-spacing: 1px;
      line-height: 1.8;
      color: rgba(255, 255, 255, 0.6);

      &::marker {
        color: $accent;
      }
    }
  }
}

.guide-params {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-content: start;

  &__chip {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  }

  &__label {
    font-family: $mono;
    font-size: 9px;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.45);
  }

  &__value {
    font-family: $mono;
    font-size: 13px;
    letter-spacing: 1px;
    color: $accent;
  }

  &__desc {
    font-size: 11px;
    letter-spacing: 0.5px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.42);
  }
}

/* ==================== 入场引导层 ==================== */

.guide-boot {
  position: absolute;
  inset: 0;
  z-index: 10;
  overflow: hidden;
  cursor: pointer;
  background: linear-gradient(180deg, #0a0c1a 0%, #12102a 55%, #1a1236 100%);

  /* 背景模糊团块 */
  &__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(72px);

    &--a {
      width: 44%;
      height: 58%;
      left: 5%;
      top: 6%;
      background: rgba(58, 40, 96, 0.55);
    }

    &--b {
      width: 40%;
      height: 54%;
      right: 4%;
      bottom: 4%;
      background: rgba(30, 36, 84, 0.6);
    }
  }

  /* 中央舞台：聚焦框 + 徽标 + 标题，整体带 CRT 明灭闪烁 */
  &__stage {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    animation: guide-boot-crt 3.6s steps(14) infinite;
  }

  &__focus {
    position: relative;
    width: 230px;
    height: 230px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__corner {
    position: absolute;
    width: 30px;
    height: 30px;
    opacity: 0;
    transition:
      top 0.22s cubic-bezier(0.3, 0.9, 0.25, 1),
      left 0.22s cubic-bezier(0.3, 0.9, 0.25, 1),
      right 0.22s cubic-bezier(0.3, 0.9, 0.25, 1),
      bottom 0.22s cubic-bezier(0.3, 0.9, 0.25, 1),
      opacity 0.16s ease;

    &.is-tl {
      top: 68px;
      left: 68px;
      border-top: 3px solid rgba(203, 194, 228, 0.8);
      border-left: 3px solid rgba(203, 194, 228, 0.8);
    }

    &.is-tr {
      top: 68px;
      right: 68px;
      border-top: 3px solid rgba(203, 194, 228, 0.8);
      border-right: 3px solid rgba(203, 194, 228, 0.8);
    }

    &.is-bl {
      bottom: 68px;
      left: 68px;
      border-bottom: 3px solid rgba(203, 194, 228, 0.8);
      border-left: 3px solid rgba(203, 194, 228, 0.8);
    }

    &.is-br {
      bottom: 68px;
      right: 68px;
      border-bottom: 3px solid rgba(203, 194, 228, 0.8);
      border-right: 3px solid rgba(203, 194, 228, 0.8);
    }
  }

  &__emblem {
    width: 64px;
    height: 64px;
    opacity: 0;
  }

  &__slot {
    position: relative;
    width: 100%;
    height: 92px;
    margin-top: 22px;
    display: flex;
    justify-content: center;
  }

  &__headline {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    opacity: 0;
    transform: translateY(10px);
    transition:
      opacity 0.28s ease,
      transform 0.28s cubic-bezier(0.16, 0.84, 0.3, 1);
  }

  /* 两侧横线 */
  &__line {
    position: absolute;
    top: 50%;
    height: 2px;
    width: 0;
    transition: width 0.28s cubic-bezier(0.2, 0.8, 0.3, 1);

    &--l {
      left: 0;
      background: linear-gradient(90deg, rgba(203, 194, 228, 0.6), rgba(203, 194, 228, 0.08));
    }

    &--r {
      right: 0;
      background: linear-gradient(270deg, rgba(203, 194, 228, 0.6), rgba(203, 194, 228, 0.08));
    }
  }

  /* 两侧数据文本块（终端扫入，由 JS 逐行驱动） */
  &__data {
    position: absolute;
    top: 22%;
    height: 240px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-family: $mono;
    font-size: 5px;
    line-height: 1.25;
    letter-spacing: 0.5px;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.36);

    &--l {
      top: auto;
      left: 14%;
      bottom: 16%;
      justify-content: flex-end;
    }

    &--r {
      right: 12%;
      text-align: right;
    }
  }

  /* 状态字样（标题区，随认证/读取进度切换） */
  &__status {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 14px;
    font-family: $mono;
    font-size: 12px;
    letter-spacing: 5px;
    color: rgba(203, 194, 228, 0.75);
    opacity: 0;
    transition: opacity 0.35s ease;
  }

  &__sq {
    width: 8px;
    height: 8px;
    border: 2px solid rgba(203, 194, 228, 0.75);
  }

  /* 分段式进度条：切角轨道 + 能量块填充 + 百分比读数 */
  &__bar {
    position: absolute;
    bottom: 23%;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 14px;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  &__bar-track {
    position: relative;
    width: 340px;
    height: 12px;
    padding: 2px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba($accent, 0.35);
    clip-path: polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px);

    i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, rgba($accent, 0.5), rgba($accent-purple, 0.85));
      -webkit-mask-image: repeating-linear-gradient(
        90deg,
        #000 0 6px,
        transparent 6px 9px
      );
      mask-image: repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 9px);
      transition: width 0.05s linear;
    }
  }

  &__bar-pct {
    width: 44px;
    flex-shrink: 0;
    text-align: left;
    font-family: $mono;
    font-size: 11px;
    letter-spacing: 2px;
    color: rgba($accent, 0.85);
  }

  &__skip {
    position: absolute;
    bottom: 34px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    font-family: $mono;
    font-size: 10px;
    letter-spacing: 4px;
    color: rgba(255, 255, 255, 0.3);
    opacity: 0;
    animation:
      guide-boot-fade 0.4s 1.2s both,
      guide-boot-blink 1.6s 1.8s ease-in-out infinite;
  }

  /* CRT 质感层 */
  &__noise {
    position: absolute;
    inset: -30px;
    pointer-events: none;
    opacity: 0.1;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/></filter><rect width="180" height="180" filter="url(%23n)"/></svg>');
    animation: guide-boot-noise 0.5s steps(3) infinite;
  }

  &__scanlines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(
      0deg,
      rgba(0, 0, 0, 0.28) 0,
      rgba(0, 0, 0, 0.28) 1px,
      transparent 1px,
      transparent 3px
    );
  }

  &__vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(ellipse at center, transparent 42%, rgba(0, 0, 0, 0.62) 100%);
  }

}

/* ---- 阶段驱动 ---- */

/* p1：聚焦框(小)浮现 */
.guide-boot--p1 {
  .guide-boot__corner {
    opacity: 1;
  }

  .guide-boot__headline {
    opacity: 1;
    transform: none;
  }

  .guide-boot__status {
    opacity: 1;
  }
}

/* p2：聚焦框向外扩张 */
.guide-boot--p2 {
  .guide-boot__corner.is-tl {
    top: 0;
    left: 0;
  }

  .guide-boot__corner.is-tr {
    top: 0;
    right: 0;
  }

  .guide-boot__corner.is-bl {
    bottom: 0;
    left: 0;
  }

  .guide-boot__corner.is-br {
    bottom: 0;
    right: 0;
  }
}

/* p3：聚焦框退场，徽标闪烁显影 + 横线 + 数据块 */
.guide-boot--p3 {
  .guide-boot__corner {
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .guide-boot__emblem {
    animation: guide-boot-flicker 0.22s steps(6) both;
  }

  .guide-boot__line--l,
  .guide-boot__line--r {
    width: 32%;
  }
}

/* p4：进度条填充 */
.guide-boot--p4 {
  .guide-boot__bar {
    opacity: 1;
  }
}

.boot-fade-leave-active {
  transition: opacity 0.3s ease;
}
.boot-fade-leave-to {
  opacity: 0;
}

/* ==================== 内容梯次入场 ==================== */

.guide-page:not(.guide-page--booted) {
  .guide-head,
  .guide-body {
    opacity: 0;
  }
}

.guide-page--booted {
  .guide-head {
    animation: guide-rise 0.5s cubic-bezier(0.16, 0.84, 0.3, 1) both;
  }

  .guide-group {
    animation: guide-slide-l 0.45s cubic-bezier(0.16, 0.84, 0.3, 1) both;

    @for $i from 1 through 5 {
      &:nth-child(#{$i}) {
        animation-delay: #{0.05 + $i * 0.06}s;
      }
    }
  }

  .guide-lv2__item {
    animation: guide-slide-l 0.4s ease both;

    @for $i from 1 through 10 {
      &:nth-child(#{$i}) {
        animation-delay: #{0.2 + $i * 0.045}s;
      }
    }
  }

  .guide-detail {
    animation: guide-clip 0.6s 0.18s cubic-bezier(0.16, 0.84, 0.3, 1) both;
  }

  .guide-detail__head,
  .guide-detail__tips {
    animation: guide-detail-in 0.35s ease both;
  }
}

/* ==================== 关键帧 ==================== */

@keyframes guide-boot-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes guide-boot-flicker {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  35% {
    opacity: 0.15;
  }
  50% {
    opacity: 1;
  }
  65% {
    opacity: 0.35;
  }
  100% {
    opacity: 1;
  }
}

@keyframes guide-boot-crt {
  0%,
  100% {
    opacity: 1;
  }
  7% {
    opacity: 0.82;
  }
  8% {
    opacity: 1;
  }
  46% {
    opacity: 0.9;
  }
  47% {
    opacity: 1;
  }
  78% {
    opacity: 0.85;
  }
  79% {
    opacity: 1;
  }
}

@keyframes guide-boot-noise {
  0% {
    transform: translate(0, 0);
  }
  33% {
    transform: translate(-14px, 9px);
  }
  66% {
    transform: translate(11px, -7px);
  }
  100% {
    transform: translate(0, 0);
  }
}

@keyframes guide-boot-blink {
  0%,
  100% {
    opacity: 0.9;
  }
  50% {
    opacity: 0.25;
  }
}

@keyframes guide-rise {
  from {
    opacity: 0;
    transform: translateY(-14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes guide-slide-l {
  from {
    opacity: 0;
    transform: translateX(-16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes guide-clip {
  from {
    opacity: 0;
    clip-path: polygon(0 0, 0 0, 0 calc(100% - 28px), 0 calc(100% - 28px), 0 100%, 0 28px);
  }
  to {
    opacity: 1;
    clip-path: polygon(
      28px 0,
      100% 0,
      100% calc(100% - 28px),
      calc(100% - 28px) 100%,
      0 100%,
      0 28px
    );
  }
}

@keyframes guide-detail-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 滚动条 */
.guide-side__menu,
.guide-detail {
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba($accent, 0.3);
    border-radius: 3px;
  }
}
</style>
