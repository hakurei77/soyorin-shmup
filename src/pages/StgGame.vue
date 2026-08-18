<script setup lang="ts">
/**
 * STG 游戏容器组件
 * 职责：Canvas 挂载、游戏生命周期管理、各面板显隐状态与事件桥接
 * 所有游戏逻辑在 engine/，UI 面板在 components/stg/，本组件只做桥接
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { BALANCE } from '../config/balance'
import { getItemDef } from '../config/items'
import { CHARACTERS, resolveCharacterStats } from '../config/loadout'
import { Game } from '../engine/game'
import type { HudState, ImplantEffect, KeyBindings } from '../types'
import { isBgmPaused, pauseBgm, playBgm, resumeBgm, stopBgm } from '../utils/bgm'
import { IMPLANT_SLOT_KEYS, useEquipment } from '../composables/useEquipment'
import { NEWBIE_CRYSTAL, useInventory } from '../composables/useInventory'
import { keyLabel } from '../utils/display'
import { uiSettings } from '../utils/settings'
import StgBanner from '../components/stg/StgBanner.vue'
import {
  CrosshairClassic,
  CrosshairTriangle,
  CrosshairLaser,
  CrosshairArc,
  CrosshairHeat
} from '../components/stg/crosshair'
import { PLAYER_WEAPONS } from '../weapons/playerWeapons'
import StgHud from '../components/stg/StgHud.vue'
import StgCharacterScreen from '../components/stg/StgCharacterScreen.vue'
import StgFirstVisitPanel from '../components/stg/StgFirstVisitPanel.vue'
import StgGuidePanel from '../components/stg/guide/StgGuidePanel.vue'
import StgPauseMenu from '../components/stg/StgPauseMenu.vue'
import StgResultScreen from '../components/stg/StgResultScreen.vue'
import StgSettingsPanel from '../components/stg/StgSettingsPanel.vue'
import StgShopScreen from '../components/stg/StgShopScreen.vue'
import StgStageSelect from '../components/stg/StgStageSelect.vue'
import StgTitleScreen from '../components/stg/StgTitleScreen.vue'
import StgTrainingHud from '../components/stg/training/StgTrainingHud.vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)

/** 引擎推送的 HUD 状态（引擎不依赖 Vue，通过回调写入） */
const hud = reactive<HudState>({
  scene: 'title',
  hp: BALANCE.player.maxHp,
  maxHp: BALANCE.player.maxHp,
  shield: BALANCE.player.maxShield,
  maxShield: BALANCE.player.maxShield,
  dash: BALANCE.player.dashMaxCharges,
  dashMax: BALANCE.player.dashMaxCharges,
  dashProgress: 0,
  skillActive: false,
  skillReady: 1,
  skillCharges: 0,
  skillMaxCharges: 0,
  skillChargeProgress: 0,
  deathGuard: null,
  fps: 60,
  bosses: [],
  bossParts: null,
  dps: null,
  banner: null,
  bannerId: 0,
  hitId: 0,
  killId: 0,
  ammo: null,
  weaponSlot: 0,
  aiming: false,
  charge: 0,
  chargeMin: 0,
  heat: null
})

let game: Game | null = null
/** FPS 显示开关（设置面板可改，自动持久化） */
const showFps = computed(() => uiSettings.showFps)

// ==================== 面板显隐 ====================

/** 关卡选择页是否打开（点击「作战」后进入） */
const showStageSelect = ref(false)
/** 当前选中的关卡 id（后续接入引擎按关卡生成弹幕） */
const currentStageId = ref<string | null>(null)
/** 设置面板是否打开 */
const showSettings = ref(false)
/** 设置面板打开时默认选中的页签 */
const settingsTab = ref<'display' | 'audio' | 'controls'>('display')

// ==================== 自定义准星 ====================

/** 自定义十字准星位置（相对舞台左上角），null 表示鼠标不在舞台内 */
const crosshair = ref<{ x: number; y: number } | null>(null)

/** 当前使用中的武器对应的准星组件：蓄力武器→蓄力圆环，过热武器→热量环，技术武器→三角，动能武器→十字，激光武器→三段圆环，其他/未装备→无准星 */
const crosshairComp = computed(() => {
  const { state: equip } = useEquipment()
  const slot = hud.weaponSlot === 1 ? 'weapon-2' : 'weapon-1'
  const itemId = equip.weapons[slot]
  const def = itemId ? getItemDef(itemId) : undefined
  if (!def?.weaponKey) return null
  const wpn = PLAYER_WEAPONS[def.weaponKey]
  if (wpn.chargeFrames !== undefined) return CrosshairArc
  if (wpn.heatPerShot !== undefined) return CrosshairHeat
  if (def.kind === '技术武器') return CrosshairTriangle
  if (def.kind === '动能武器') return CrosshairClassic
  if (def.kind === '激光武器') return CrosshairLaser
  return null
})

function onStageMouseMove(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  crosshair.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function onStageMouseLeave() {
  crosshair.value = null
}
/** 指南面板是否打开 */
const showGuide = ref(false)
/** 角色页是否打开 */
const showCharacter = ref(false)
/** 商店页是否打开 */
const showShop = ref(false)
/** 首次进入引导弹窗是否打开 */
const showFirstVisit = ref(false)

// ==================== 出击 ====================

/** 根据已装备武器推导武器槽数组（[1号位, 2号位]，空槽为 null） */
function resolveEquippedWeapons(): (import('../types').WeaponKey | null)[] {
  const { state: equip } = useEquipment()
  return (['weapon-1', 'weapon-2'] as const).map((slot) => {
    const itemId = equip.weapons[slot]
    const def = itemId ? getItemDef(itemId) : undefined
    return def?.weaponKey ?? null
  })
}

/** 根据已装备技能推导 SkillKey（未装备返回 null） */
function resolveEquippedSkill(): import('../types').SkillKey | null {
  const { state: equip } = useEquipment()
  const itemId = equip.skill
  if (itemId) {
    const def = getItemDef(itemId)
    if (def?.skillKey) return def.skillKey
  }
  return null
}

/** 汇总全部已装备义体的效果（加算项累加，承伤倍率乘算；未装备返回空效果） */
function resolveImplantEffects(): ImplantEffect {
  const { state: equip } = useEquipment()
  const total: ImplantEffect = {}
  for (const key of IMPLANT_SLOT_KEYS) {
    const itemId = equip.implants[key]
    const fx = (itemId ? getItemDef(itemId) : undefined)?.implantEffect
    if (!fx) continue
    if (fx.skillRegenAdd) total.skillRegenAdd = (total.skillRegenAdd ?? 0) + fx.skillRegenAdd
    if (fx.hpAdd) total.hpAdd = (total.hpAdd ?? 0) + fx.hpAdd
    if (fx.hpPctAdd) total.hpPctAdd = (total.hpPctAdd ?? 0) + fx.hpPctAdd
    if (fx.shieldPctAdd) total.shieldPctAdd = (total.shieldPctAdd ?? 0) + fx.shieldPctAdd
    if (fx.shieldAdd) total.shieldAdd = (total.shieldAdd ?? 0) + fx.shieldAdd
    if (fx.shieldRegenAdd) total.shieldRegenAdd = (total.shieldRegenAdd ?? 0) + fx.shieldRegenAdd
    if (fx.moveSpeedAdd) total.moveSpeedAdd = (total.moveSpeedAdd ?? 0) + fx.moveSpeedAdd
    if (fx.attackAdd) total.attackAdd = (total.attackAdd ?? 0) + fx.attackAdd
    if (fx.dashChargesAdd) total.dashChargesAdd = (total.dashChargesAdd ?? 0) + fx.dashChargesAdd
    if (fx.dashInvincibleAdd) total.dashInvincibleAdd = (total.dashInvincibleAdd ?? 0) + fx.dashInvincibleAdd
    if (fx.dashDistanceAdd) total.dashDistanceAdd = (total.dashDistanceAdd ?? 0) + fx.dashDistanceAdd
    if (fx.dodgeChance) total.dodgeChance = (total.dodgeChance ?? 0) + fx.dodgeChance
    if (fx.damageTakenMul !== undefined) {
      total.damageTakenMul = (total.damageTakenMul ?? 1) * fx.damageTakenMul
    }
    if (fx.shieldBreakMul !== undefined) {
      total.shieldBreakMul = (total.shieldBreakMul ?? 1) * fx.shieldBreakMul
    }
    // 免死守护：多个并存时取冷却更短者
    if (fx.deathGuard && (total.deathGuard === undefined || fx.deathGuard.cooldownSec < total.deathGuard.cooldownSec)) {
      total.deathGuard = fx.deathGuard
    }
    // 自动索敌：多件并存时取索敌半径最大者
    if (fx.autoAimRange) total.autoAimRange = Math.max(total.autoAimRange ?? 0, fx.autoAimRange)
    // 弹丸跟踪：多件并存时取转向速率最大者
    if (fx.bulletHoming) total.bulletHoming = Math.max(total.bulletHoming ?? 0, fx.bulletHoming)
  }
  return total
}

/** 关卡页点「出击」：检查装备后直接开局 */
async function onStageStart(stageId: string) {
  const weapons = resolveEquippedWeapons()
  if (!weapons.some(Boolean)) {
    toastMsg.value = '请先在角色页面装备武器'
    setTimeout(() => { toastMsg.value = '' }, 2400)
    return
  }
  currentStageId.value = stageId
  showStageSelect.value = false
  const char = CHARACTERS[0]!
  const skill = resolveEquippedSkill()
  await game?.setLoadout(
    char.color,
    char.accent,
    weapons,
    resolveCharacterStats(char),
    skill,
    char.sprite ? { id: char.key, path: char.sprite } : null,
    resolveImplantEffects()
  )
  game?.startRun(stageId)
}

/** 角色页「模拟训练」→ 检查装备后进入训练室 */
async function onTraining() {
  const weapons = resolveEquippedWeapons()
  if (!weapons.some(Boolean)) {
    toastMsg.value = '请先在角色页面装备武器'
    setTimeout(() => { toastMsg.value = '' }, 2400)
    return
  }
  showCharacter.value = false
  currentStageId.value = 'training'
  const char = CHARACTERS[0]!
  const skill = resolveEquippedSkill()
  await game?.setLoadout(
    char.color,
    char.accent,
    weapons,
    resolveCharacterStats(char),
    skill,
    char.sprite ? { id: char.key, path: char.sprite } : null,
    resolveImplantEffects()
  )
  stopBgm() // 训练室不播放音乐
  game?.startRun('training')
}

/** 全局 Toast 消息 */
const toastMsg = ref('')

// ==================== 键位设置 ====================

/** 设置面板中展示的键位（打开面板时从引擎同步） */
const bindings = reactive<KeyBindings>({ ...BALANCE.defaultKeys })

/** 从引擎同步最新键位到面板 */
function syncBindings() {
  if (game) Object.assign(bindings, game.getKeyBindings())
}

function openSettings(tab: 'display' | 'audio' | 'controls' = 'display') {
  syncBindings()
  if (game) frameLimit.value = game.getFrameLimit()
  settingsTab.value = tab
  showSettings.value = true
}

/** 设置面板「保存配置」：草稿整体写入引擎并持久化，随后关闭面板 */
function saveBindings(next: KeyBindings) {
  game?.setKeyBindings(next)
  syncBindings()
  showSettings.value = false
}

// ==================== 帧率设置 ====================

/** 当前渲染帧率上限（0 = 不限制，跟随屏幕刷新率） */
const frameLimit = ref(0)

function setFrameLimit(fps: number) {
  frameLimit.value = fps
  game?.setFrameLimit(fps)
}

// ==================== 低速触发方式 ====================

// 面板改动即时写入引擎；引擎初始化完成后也要同步一次当前值
watch(
  () => uiSettings.slowMode,
  (mode) => game?.setSlowMode(mode)
)
watch(
  () => uiSettings.sprintMode,
  (mode) => game?.setSprintMode(mode)
)

// ==================== Esc 快捷键 ====================

/**
 * 标题界面按 Esc 打开设置；设置页打开时按 Esc 关闭返回；指南页打开时按 Esc 关闭指南。
 * 键位改绑的捕获在 capture 阶段拦截并阻断冒泡，不会触发本监听，Esc 仍可正常改绑
 */
function onGlobalKeydown(e: KeyboardEvent) {
  if (e.code !== 'Escape') return
  // 首次进入引导必须点击「开始行动」按钮关闭，Esc 不跳过（避免用户未读即消失）
  if (showFirstVisit.value) return
  if (showSettings.value) {
    showSettings.value = false
    return
  }
  if (showGuide.value) {
    showGuide.value = false
    return
  }
  if (showShop.value) {
    showShop.value = false
    return
  }
  if (showCharacter.value) {
    showCharacter.value = false
    return
  }
  if (showStageSelect.value) {
    showStageSelect.value = false
    return
  }
  if (hud.scene === 'title') {
    openSettings()
  }
}

// ==================== 生命周期 ====================

const onResize = () => game?.resize()

// ==================== 失焦静音 ====================

/** 是否由失焦静音功能触发的暂停（避免覆盖用户手动暂停的状态） */
let bgmMutedByBlur = false

function onWindowBlur() {
  if (uiSettings.muteOnBlur && !isBgmPaused()) {
    pauseBgm()
    bgmMutedByBlur = true
  }
}

function onWindowFocus() {
  if (bgmMutedByBlur) {
    resumeBgm()
    bgmMutedByBlur = false
  }
}

onMounted(() => {
  game = new Game(canvasRef.value!, {
    onHud: (h) => Object.assign(hud, h)
  })
  game.init()
  game.setSlowMode(uiSettings.slowMode)
  game.setSprintMode(uiSettings.sprintMode)
  window.addEventListener('resize', onResize)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('keydown', onGlobalKeydown)
  // 进入游戏循环播放 BGM（启动页 BGM 已在其卸载时停止）
  playBgm('gamePage')
  // 首次进入：发放新手水晶并弹出引导（标记持久化，仅触发一次）
  try {
    if (!localStorage.getItem(BALANCE.storageKeys.firstVisit)) {
      useInventory().addCrystal(NEWBIE_CRYSTAL)
      localStorage.setItem(BALANCE.storageKeys.firstVisit, '1')
      showFirstVisit.value = true
    }
  } catch {
    // 隐私模式 / 存储不可用：仍展示引导，避免静默失败
    showFirstVisit.value = true
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('focus', onWindowFocus)
  window.removeEventListener('keydown', onGlobalKeydown)
  game?.destroy()
  game = null
  stopBgm()
})

function resume() {
  game?.resume()
}
function restart() {
  if (currentStageId.value) game?.startRun(currentStageId.value)
}
function toTitle() {
  game?.quitToTitle()
  // 从训练室退出时恢复游戏页 BGM（训练室内不播放音乐）
  if (currentStageId.value === 'training') playBgm('gamePage')
}
</script>

<template>
  <div class="stg-screen">
    <div
      class="stg-stage"
      :class="{
        'stg-stage--playing': hud.scene === 'playing',
        'stg-stage--blurred': showSettings
      }"
      @mousemove="onStageMouseMove"
      @mouseleave="onStageMouseLeave"
    >
      <canvas ref="canvasRef" class="stg-stage__canvas"></canvas>

      <!-- 自定义准星（战斗中显示，替代系统鼠标；样式随装备武器类型自动切换） -->
  <component
    :is="crosshairComp"
    v-if="hud.scene === 'playing' && crosshair && crosshairComp"
    :x="crosshair.x"
    :y="crosshair.y"
    :hit-id="hud.hitId"
    :kill-id="hud.killId"
    :aiming="hud.aiming"
    :charge="hud.charge"
    :charge-min="hud.chargeMin"
    :heat="hud.heat"
  />

  <!-- 弹匣弹药数（弹匣式武器战斗中显示在准星下方） -->
  <div
    v-if="hud.scene === 'playing' && crosshair && hud.ammo"
    class="crosshair-ammo"
    :class="{ 'crosshair-ammo--reloading': hud.ammo.reloading }"
    :style="{ left: crosshair.x + 'px', top: crosshair.y + 34 + 'px' }"
  >
    {{ hud.ammo.reloading ? '装填中…' : `${hud.ammo.current} / ${hud.ammo.max}` }}
  </div>

      <!-- 对局 HUD + Boss 血条 -->
      <StgHud
        :hud="hud"
        :show-fps="showFps"
        :skill-key-label="keyLabel(bindings.skill)"
      />

      <!-- 训练室 HUD（DPS 统计 + 控制台） -->
      <StgTrainingHud
        v-if="currentStageId === 'training'"
        :hud="hud"
        :game="game"
      />

      <!-- 符卡名横幅 -->
      <StgBanner :banner="hud.banner" :banner-id="hud.bannerId" />

      <!-- 标题界面 -->
      <Transition name="stg-fade">
        <StgTitleScreen
          v-if="hud.scene === 'title' && !showGuide && !showCharacter && !showShop"
          :bindings="bindings"
          @start="showStageSelect = true"
          @open-guide="showGuide = true"
          @open-character="showCharacter = true"
          @open-shop="showShop = true"
          @open-settings="openSettings()"
          @open-frame-settings="openSettings('display')"
        />
      </Transition>

      <!-- 关卡选择（节点地图） -->
      <Transition name="stg-fade">
        <StgStageSelect
          v-if="showStageSelect && hud.scene === 'title'"
          @back="showStageSelect = false"
          @start="onStageStart"
        />
      </Transition>

      <!-- 暂停菜单 -->
      <Transition name="stg-fade">
        <StgPauseMenu
          v-if="hud.scene === 'paused'"
          @resume="resume"
          @restart="restart"
          @open-settings="openSettings()"
          @to-title="toTitle"
        />
      </Transition>

      <!-- 通关结算 -->
      <Transition name="stg-fade">
        <StgResultScreen
          v-if="hud.scene === 'clear'"
          type="clear"
          @restart="restart"
          @to-title="toTitle"
        />
      </Transition>

      <!-- 游戏结束 -->
      <Transition name="stg-fade">
        <StgResultScreen
          v-if="hud.scene === 'gameover'"
          type="gameover"
          @restart="restart"
          @to-title="toTitle"
        />
      </Transition>

      <!-- 指南（敌人出击 / 武器 / 技能） -->
      <Transition name="stg-fade">
        <StgGuidePanel v-if="showGuide" @close="showGuide = false" />
      </Transition>

      <!-- 角色页（角色信息 / 网格背包） -->
      <Transition name="stg-fade">
        <StgCharacterScreen v-if="showCharacter" @back="showCharacter = false" @training="onTraining" />
      </Transition>

      <!-- 商店页（全部道具 1 水晶） -->
      <Transition name="stg-fade">
        <StgShopScreen v-if="showShop" @back="showShop = false" />
      </Transition>

      <!-- 设置（画面 / 音频 / 按键） -->
      <Transition name="stg-fade">
        <StgSettingsPanel
          v-if="showSettings"
          :bindings="bindings"
          :frame-limit="frameLimit"
          :initial-tab="settingsTab"
          @save="saveBindings"
          @change-frame-limit="setFrameLimit"
          @close="showSettings = false"
        />
      </Transition>

      <!-- 首次进入引导弹窗 -->
      <Transition name="stg-fade">
        <StgFirstVisitPanel v-if="showFirstVisit" @close="showFirstVisit = false" />
      </Transition>

      <!-- 全局 Toast 提示 -->
      <Transition name="stg-fade">
        <div v-if="toastMsg" class="stg-toast">{{ toastMsg }}</div>
      </Transition>
    </div>
  </div>
</template>

<!-- 跨面板共享样式（非 scoped，只引入一次） -->
<style lang="scss">
@use '../styles/stg-common.scss';
</style>

<style lang="scss" scoped>
// 弹匣弹药数（跟随准星）
.crosshair-ammo {
  position: absolute;
  transform: translateX(-50%);
  font-size: 11px;
  letter-spacing: 1px;
  white-space: nowrap;
  color: #ffc233;
  text-shadow: 0 0 4px rgba(#ffc233, 0.8);
  pointer-events: none;
  z-index: 40;

  &--reloading {
    color: #ff8855;
    text-shadow: 0 0 4px rgba(#ff8855, 0.8);
    animation: crosshair-ammo-blink 0.5s ease-in-out infinite alternate;
  }
}

@keyframes crosshair-ammo-blink {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.4;
  }
}

.stg-screen {
  width: 100vw;
  height: 100vh;
  background: #03030a;
  overflow: hidden;
  user-select: none;
}

// 舞台铺满整个窗口：战场尺寸 = 窗口尺寸，屏幕越大战斗场地越大
.stg-stage {
  position: relative;
  width: 100%;
  height: 100%;
  background: #050510;

  &__canvas {
    width: 100%;
    height: 100%;
    display: block;
    cursor: crosshair;
  }

  // 战斗中隐藏鼠标指针，避免遮挡自机；菜单界面恢复默认光标
  &--playing &__canvas {
    cursor: none;
  }

  // 设置面板打开时：直接模糊背景内容，营造毛玻璃质感
  // （backdrop-filter 在部分环境不生效，模糊内容本身是可靠的等效方案）
  &--blurred {
    .stg-stage__canvas,
    :deep(.stg-title) {
      filter: blur(40px) saturate(1.3) brightness(0.85);
    }

    // 模糊会在元素边缘产生半透明晕染，标题界面放大一圈遮住边缘
    :deep(.stg-title) {
      transform: scale(1.06);
    }
  }

  .stg-stage__canvas,
  :deep(.stg-title) {
    transition:
      filter 0.3s ease,
      transform 0.3s ease;
  }
}

// 全局 Toast
.stg-toast {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 200;
  padding: 14px 32px;
  background: linear-gradient(180deg, rgb(200 50 50 / 88%), rgb(120 20 20 / 88%));
  border: 1px solid rgb(255 80 80 / 60%);
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  color: #ffcccc;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 3px;
  text-shadow: 0 0 10px rgb(255 100 100 / 50%);
  pointer-events: none;
}
</style>
