<script setup lang="ts">
/**
 * 对局 HUD
 * 职责：分数 / 血量·护盾条 / 闪现 / FPS / Boss 血条
 */
import { computed } from 'vue'
import type { HudBossInfo, HudState } from '../../types'
import { getItemDef } from '../../config/items'
import { BALANCE } from '../../config/balance'
import { IMPLANT_SLOT_KEYS, useEquipment } from '../../composables/useEquipment'

const props = defineProps<{
  hud: HudState
  showFps: boolean
  /** 技能键的显示名（跟随键位设置） */
  skillKeyLabel: string
}>()

const inGame = computed(
  () => props.hud.scene === 'playing' || props.hud.scene === 'paused'
)
/** Boss 列表（引擎已截取最多 3 个，此处再兜底一次） */
const bosses = computed(() => props.hud.bosses.slice(0, 3))
/** 巨构 Boss 部位列表（右上角独立血条） */
const bossParts = computed(() => props.hud.bossParts ?? [])
/** 单个部位的血量百分比 */
const partPercent = (p: { hp: number; maxHp: number }) =>
  p.maxHp <= 0 ? 0 : Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100))
/** 单个 Boss 的血量百分比 */
const bossPercent = (b: HudBossInfo) =>
  b.maxHp <= 0 ? 0 : Math.max(0, Math.min(100, (b.hp / b.maxHp) * 100))
const hpPercent = computed(() => {
  if (props.hud.maxHp <= 0) return 0
  return Math.max(0, Math.min(100, (props.hud.hp / props.hud.maxHp) * 100))
})
const shieldPercent = computed(() => {
  if (props.hud.maxShield <= 0) return 0
  return Math.max(0, Math.min(100, (props.hud.shield / props.hud.maxShield) * 100))
})
/** 折跃体力上限（格，义体可扩充），用于折跃条刻度分格 */
const dashMax = computed(() => props.hud.dashMax)
/** 连续充能：整数格 + 当前格回复进度 */
const dashPercent = computed(() =>
  dashMax.value <= 0
    ? 0
    : Math.max(0, Math.min(100, ((props.hud.dash + props.hud.dashProgress) / dashMax.value) * 100))
)


// ==================== 武器 HUD ====================

const { state: equip } = useEquipment()

/** 两个武器槽的物品定义（0 = 一号位，1 = 二号位；空槽或无引擎武器为 null） */
const weaponSlots = computed(() =>
  (['weapon-1', 'weapon-2'] as const).map((slot) => {
    const itemId = equip.weapons[slot]
    const def = itemId ? getItemDef(itemId) : undefined
    return def?.weaponKey ? def : null
  })
)
/** 当前手持武器（跟随 hud.weaponSlot） */
const activeWeapon = computed(() => weaponSlots.value[props.hud.weaponSlot] ?? null)
/** 未手持的另一把武器（槽位区展示用） */
const holsteredSlot = computed(() => (props.hud.weaponSlot === 1 ? 0 : 1))
const holsteredWeapon = computed(() => weaponSlots.value[holsteredSlot.value] ?? null)

// ==================== 技能 HUD ====================

/** 技能槽已装备的技能定义（无技能为 null） */
const skillDef = computed(() => {
  const id = equip.skill
  return id ? (getItemDef(id) ?? null) : null
})
/** 能量比例（0~1，1 = 满能量）：能量条从盒底向上填充 */
const skillEnergyPercent = computed(() => Math.max(0, Math.min(1, props.hud.skillReady)))
/** 充能制技能（如电磁脉冲）：显示库存点 + 环形冷却，而非底部能量条 */
const chargeMode = computed(() => props.hud.skillMaxCharges > 0)
/** 环形冷却扫过比例（0~100%）：下一层充能回复进度 */
const chargeCooldownPercent = computed(
  () => Math.max(0, Math.min(1, props.hud.skillChargeProgress)) * 100
)
/** 环形冷却样式：锥形渐变扫圈（亮弧 = 已回复进度，暗弧 = 剩余冷却） */
const skillRadialStyle = computed(() => ({
  background: `conic-gradient(from -90deg, rgba(103, 232, 249, 0.9) ${chargeCooldownPercent.value}%, rgba(103, 232, 249, 0.12) ${chargeCooldownPercent.value}%)`
}))
/** 能量制技能的最低开启阈值（0~1）：低于该比例无法开启；双子星卫需回满（=1）才能释放 */
const skillGateRatio = computed(() =>
  skillDef.value?.skillKey === 'gemini'
    ? 1
    : BALANCE.skill.maxEnergy > 0
      ? BALANCE.skill.minActivateEnergy / BALANCE.skill.maxEnergy
      : 0
)
/** 能量条上的最低开启阈值刻度位置（%） */
const skillGatePercent = computed(() => Math.round(skillGateRatio.value * 100))
/** 技能是否就绪：能量制看是否达到最低开启阈值，充能制看有库存 */
const skillReadyState = computed(() =>
  chargeMode.value ? props.hud.skillCharges > 0 : props.hud.skillReady >= skillGateRatio.value
)

// ==================== 免死守护 HUD（左下状态台右侧图标块） ====================

/** 已装备的免死守护义体定义（如妙尔尼尔怒战中枢，未装备为 null） */
const guardDef = computed(() => {
  for (const key of IMPLANT_SLOT_KEYS) {
    const itemId = equip.implants[key]
    const def = itemId ? getItemDef(itemId) : undefined
    if (def?.implantEffect?.deathGuard) return def
  }
  return null
})
/** 环形冷却扫过比例（0~100%）：冷却回复进度 */
const guardCooldownPercent = computed(
  () => Math.max(0, Math.min(1, props.hud.deathGuard?.progress ?? 1)) * 100
)
/** 环形冷却样式：琥珀色弧（怒雷协议配色） */
const guardRadialStyle = computed(() => ({
  background: `conic-gradient(from -90deg, rgba(251, 191, 36, 0.9) ${guardCooldownPercent.value}%, rgba(251, 191, 36, 0.12) ${guardCooldownPercent.value}%)`
}))
/** 图标下方状态文字：发动中 / 就绪 / 剩余冷却秒数 */
const guardStatusText = computed(() => {
  const dg = props.hud.deathGuard
  const cfg = guardDef.value?.implantEffect?.deathGuard
  if (!dg || !cfg) return ''
  if (dg.active) return '发动中'
  if (dg.ready) return '就绪'
  return `${Math.ceil((1 - dg.progress) * cfg.cooldownSec)}s`
})
/** 弹药大字逐位拆分：弹匣武器补前导零（前导零半透明），无限弹药显示 ∞ */
const ammoDigits = computed(() => {
  const a = props.hud.ammo
  if (!a) return [{ ch: '∞', dim: false }]
  const s = String(a.current).padStart(2, '0')
  return s
    .split('')
    .map((ch, i) => ({ ch, dim: ch === '0' && s.slice(0, i + 1).split('').every((c) => c === '0') }))
})
</script>

<template>
  <!-- 对局 HUD -->
  <div v-if="inGame" class="stg-hud">
    <div v-if="showFps" class="stg-hud__fps">
      {{ hud.fps }} FPS
    </div>
    <!-- 左下角状态台：伪 3D 工业面板（上 HP / 下折跃，折跃条刻度分格） -->
    <div class="stg-hud__corner">
      <div class="stg-console">
        <div class="stg-console__row">
          <span class="stg-console__label">HP</span>
          <span class="stg-console__bar">
            <span
              class="stg-console__fill stg-console__fill--hp"
              :class="{
                'stg-console__fill--mid': hpPercent <= 60 && hpPercent > 30,
                'stg-console__fill--low': hpPercent <= 30
              }"
              :style="{ width: hpPercent + '%' }"
            ></span>
            <span class="stg-console__bar-text">{{ hud.hp }}/{{ hud.maxHp }}</span>
          </span>
        </div>
        <div v-if="hud.maxShield > 0" class="stg-console__row">
          <span class="stg-console__label">SH</span>
          <span class="stg-console__bar">
            <span
              class="stg-console__fill stg-console__fill--shield"
              :style="{ width: shieldPercent + '%' }"
            ></span>
            <span class="stg-console__bar-text">{{ hud.shield }}/{{ hud.maxShield }}</span>
          </span>
        </div>

        <div class="stg-console__row">
          <span class="stg-console__label">折跃</span>
          <span
            class="stg-console__bar stg-console__bar--dash"
            :class="{ 'stg-console__bar--dash-empty': hud.dash <= 0 }"
          >
            <span
              class="stg-console__fill stg-console__fill--dash"
              :style="{ width: dashPercent + '%' }"
            ></span>
            <span
              v-for="i in dashMax - 1"
              :key="i"
              class="stg-console__tick"
              :style="{ left: (i / dashMax) * 100 + '%' }"
            ></span>
          </span>
        </div>

        <span class="stg-console__corner stg-console__corner--tl"></span>
        <span class="stg-console__corner stg-console__corner--br"></span>
      </div>

      <!-- 免死守护图标块（如妙尔尼尔怒战中枢）：状态台外侧右边，图标 + 环形冷却 + 状态文字 -->
      <div
        v-if="guardDef"
        class="stg-guard"
        :class="{
          'stg-guard--ready': hud.deathGuard?.ready && !hud.deathGuard?.active,
          'stg-guard--active': hud.deathGuard?.active,
        }"
        :title="guardDef.name"
      >
        <div class="stg-guard__icon-box">
          <img
            v-if="guardDef.icon"
            class="stg-guard__icon"
            :src="guardDef.icon"
            :alt="guardDef.name"
            draggable="false"
          />
          <span v-else class="stg-guard__no-icon">—</span>
          <span
            v-if="hud.deathGuard && !hud.deathGuard.ready"
            class="stg-guard__radial"
            :style="guardRadialStyle"
          ></span>
        </div>
        <span class="stg-guard__status">{{ guardStatusText }}</span>
      </div>
    </div>

    <!-- 右下角武器 HUD：军用喷印风（大弹药计数 / 武器剪影 / 双槽位） -->
    <div class="stg-hud__weapon-corner">
      <!-- 技能块：图标 + 能量条（底部填充，开启时消耗）+ 按键提示 -->
      <div
        class="stg-skill"
        :class="{
          'stg-skill--ready': skillDef && skillReadyState && !hud.skillActive,
          'stg-skill--active': hud.skillActive,
          'stg-skill--empty': !skillDef,
        }"
        :title="skillDef ? `${skillDef.name}（${skillKeyLabel}）` : '未装备技能'"
      >
        <div class="stg-skill__icon-box">
          <img
            v-if="skillDef?.icon"
            class="stg-skill__icon"
            :src="skillDef.icon"
            :alt="skillDef.name"
            draggable="false"
          />
          <span v-else class="stg-skill__no-skill">—</span>
          <!-- 能量制（突触超频）：底部填充能量条 -->
          <span
            v-if="skillDef && !chargeMode"
            class="stg-skill__energy"
            :class="{ 'stg-skill__energy--active': hud.skillActive }"
            :style="{ height: skillEnergyPercent * 100 + '%' }"
          ></span>
          <!-- 最低开启阈值刻度线：能量回过此线才能再次开启（双子星卫需满能量，阈值在顶端不显示刻度） -->
          <span
            v-if="skillDef && !chargeMode && skillGatePercent < 100"
            class="stg-skill__energy-gate"
            :style="{ bottom: skillGatePercent + '%' }"
          ></span>
          <!-- 充能制（电磁脉冲）：环形冷却，未满层时扫圈回复 -->
          <span
            v-if="chargeMode && hud.skillCharges < hud.skillMaxCharges"
            class="stg-skill__radial"
            :style="skillRadialStyle"
          ></span>
          <!-- 充能制：左上角库存点（亮 = 可用层数） -->
          <span v-if="chargeMode" class="stg-skill__charges">
            <span
              v-for="i in hud.skillMaxCharges"
              :key="i"
              class="stg-skill__charge"
              :class="{ 'stg-skill__charge--full': i <= hud.skillCharges }"
            ></span>
          </span>
        </div>
        <span class="stg-skill__key">{{ skillKeyLabel }}</span>
      </div>

      <div class="stg-weapon">
        <div
          class="stg-weapon__ammo"
          :class="{ 'stg-weapon__ammo--reloading': hud.ammo?.reloading }"
        >
          <div class="stg-weapon__digits">
            <span
              v-for="(d, i) in ammoDigits"
              :key="i"
              class="stg-weapon__digit"
              :class="{ 'stg-weapon__digit--dim': d.dim }"
              >{{ d.ch }}</span
            >
          </div>
          <span class="stg-weapon__reserve">
            {{ hud.ammo?.reloading ? '装填中' : `/${hud.ammo ? hud.ammo.max : '∞'}` }}
          </span>
        </div>

        <div class="stg-weapon__figure">
          <!-- 切枪交换动画：旧枪上抬收起，新枪下方抽出 -->
          <Transition name="weapon-swap" mode="out-in">
            <div :key="hud.weaponSlot" class="stg-weapon__figure-inner">
              <img
                v-if="activeWeapon?.icon"
                class="stg-weapon__img"
                :src="activeWeapon.icon"
                :alt="activeWeapon.name"
                draggable="false"
              />
              <span v-else class="stg-weapon__empty">NO WEAPON</span>
            </div>
          </Transition>
          <span class="stg-weapon__figure-corner stg-weapon__figure-corner--tl"></span>
          <span class="stg-weapon__figure-corner stg-weapon__figure-corner--tr"></span>
          <span class="stg-weapon__figure-corner stg-weapon__figure-corner--bl"></span>
          <span class="stg-weapon__figure-corner stg-weapon__figure-corner--br"></span>
        </div>

        <!-- 仅显示未手持的另一把武器（只带一把武器时隐藏；切枪时与大剪影反向联动） -->
        <div v-if="holsteredWeapon" class="stg-weapon__slots">
          <Transition name="slot-swap" mode="out-in">
            <div
              :key="holsteredSlot"
              class="stg-weapon__slot"
              :class="{ 'stg-weapon__slot--empty': !holsteredWeapon }"
            >
              <img
                v-if="holsteredWeapon?.icon"
                :src="holsteredWeapon.icon"
                :alt="holsteredWeapon.name"
                draggable="false"
              />
              <span class="stg-weapon__slot-key">{{ holsteredSlot + 1 }}</span>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>

  <!-- Boss 血条组：右上角竖直排列，最多 3 个 -->
  <div v-if="inGame && bosses.length" class="stg-boss-list">
    <div
      v-for="(b, i) in bosses"
      :key="i"
      class="stg-boss"
      :class="{ 'stg-boss--low': bossPercent(b) <= 30 }"
    >
      <div class="stg-boss__head">
        <span class="stg-boss__name">{{ b.name }}</span>
        <span class="stg-boss__hp">
          {{ b.hp.toLocaleString() }}<span class="stg-boss__hp-max">/{{ b.maxHp.toLocaleString() }}</span>
        </span>
      </div>
      <div class="stg-boss__bar">
        <div class="stg-boss__fill" :style="{ width: bossPercent(b) + '%' }">
          <span class="stg-boss__edge"></span>
        </div>
        <!-- 分段刻度（如棱镜星卫的浮游炮增援节点 2/3、1/3），把血条切成阶段 -->
        <span
          v-for="(s, si) in b.segments ?? []"
          :key="si"
          class="stg-boss__seg"
          :style="{ left: s * 100 + '%' }"
        ></span>
      </div>
    </div>

    <!-- 巨构 Boss 部位独立血条：副炮逐个显示，击毁后标记为报废 -->
    <div v-if="bossParts.length" class="stg-boss-parts">
      <div
        v-for="p in bossParts"
        :key="p.id"
        class="stg-boss-part"
        :class="{ 'stg-boss-part--dead': !p.alive }"
      >
        <span class="stg-boss-part__name">{{ p.name }}</span>
        <div class="stg-boss-part__bar">
          <div class="stg-boss-part__fill" :style="{ width: partPercent(p) + '%' }"></div>
        </div>
        <span class="stg-boss-part__hp">
          {{ p.alive ? p.hp.toLocaleString() : 'BREAK' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/stg-vars.scss' as *;

.stg-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;

  &__fps {
    position: absolute;
    top: 12px;
    right: 14px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
  }

  /* ---------- 左下角状态台（伪 3D 工业面板，参考主菜单甲板） ---------- */
  &__corner {
    position: absolute;
    left: 26px;
    bottom: 22px;
    perspective: 720px;
    display: flex;
    align-items: flex-end;
    gap: 14px;
  }

  /* ---------- 右下角武器 HUD ---------- */
  &__weapon-corner {
    position: absolute;
    right: 26px;
    bottom: 22px;
    perspective: 720px;
    display: flex;
    align-items: flex-end;
    gap: 16px;
  }
}

/* ==================== 技能冷却块（武器 HUD 左侧） ==================== */

.stg-skill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  transform: rotateX(6deg) rotateY(-11deg);
  transform-origin: 100% 100%;

  /* 图标盒：切角小方块，与武器剪影位同一套取景语言 */
  &__icon-box {
    position: relative;
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: rgba(12, 12, 28, 0.55);
    border: 1px solid rgba($accent, 0.3);
    clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  &__icon {
    max-width: 72%;
    max-height: 72%;
    object-fit: contain;
    pointer-events: none;
  }

  &__no-skill {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.18);
  }

  /* 能量条：贴盒底向上填充，关闭回能时青色，开启耗能时琥珀色 */
  &__energy {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    background: linear-gradient(0deg, rgba(#22d3ee, 0.35), rgba(#67e8f9, 0.12));
    border-top: 1px solid rgba(#67e8f9, 0.85);
    transition: height 0.1s linear;
    pointer-events: none;

    &--active {
      background: linear-gradient(0deg, rgba(#f59e0b, 0.4), rgba(#fbbf24, 0.12));
      border-top-color: rgba(#fbbf24, 0.95);
    }
  }

  /* 最低开启阈值刻度线：能量回过此线才能再次开启 */
  &__energy-gate {
    position: absolute;
    left: 0;
    width: 100%;
    height: 1px;
    background: rgba(#ffffff, 0.6);
    box-shadow: 0 0 3px rgba(#67e8f9, 0.8);
    pointer-events: none;
  }

  /* 充能制环形冷却：锥形渐变扫圈，径向遮罩抠出圆环（背景由内联样式给出） */
  &__radial {
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    pointer-events: none;
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 6px));
    mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 6px));
  }

  /* 充能制库存点：左上角小圆点，亮起 = 当前可用层数 */
  &__charges {
    position: absolute;
    top: 3px;
    left: 4px;
    display: flex;
    gap: 3px;
    pointer-events: none;
  }

  &__charge {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(#67e8f9, 0.45);

    &--full {
      background: #67e8f9;
      box-shadow: 0 0 4px rgba(#67e8f9, 0.9);
    }
  }

  /* 按键提示：小胶囊 */
  &__key {
    padding: 1px 7px;
    font-size: 9px;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba($accent, 0.28);
    background: rgba(12, 12, 28, 0.5);
  }

  /* 就绪：青色描边呼吸光 */
  &--ready &__icon-box {
    border-color: rgba(#67e8f9, 0.65);
    box-shadow: 0 0 10px rgba(#67e8f9, 0.25);
  }

  /* 激活中：琥珀色高亮脉动 */
  &--active &__icon-box {
    border-color: rgba(#fbbf24, 0.9);
    box-shadow: 0 0 14px rgba(#fbbf24, 0.5);
    animation: stg-hud-skill-active 0.6s ease-in-out infinite alternate;
  }

  /* 未装备：整体压暗 */
  &--empty {
    opacity: 0.45;
  }
}

@keyframes stg-hud-skill-active {
  from {
    filter: brightness(1);
  }
  to {
    filter: brightness(1.4);
  }
}

/* ==================== 免死守护图标块（左下状态台右侧，仿技能块语言） ==================== */

.stg-guard {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  /* 与状态台同一套伪 3D 倾斜，保持在同一平面上 */
  transform: rotateX(6deg) rotateY(11deg);
  transform-origin: 0 100%;

  /* 图标盒：切角小方块，与技能块同一套取景语言 */
  &__icon-box {
    position: relative;
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: rgba(12, 12, 28, 0.55);
    border: 1px solid rgba($accent, 0.3);
    clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  &__icon {
    max-width: 92%;
    max-height: 92%;
    object-fit: contain;
    pointer-events: none;
  }

  &__no-icon {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.18);
  }

  /* 环形冷却：锥形渐变扫圈，径向遮罩抠出圆环（背景由内联样式给出） */
  &__radial {
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    pointer-events: none;
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 6px));
    mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 6px));
  }

  /* 状态文字：就绪 / 发动中 / 剩余冷却秒数 */
  &__status {
    padding: 1px 7px;
    font-size: 9px;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba($accent, 0.28);
    background: rgba(12, 12, 28, 0.5);
    font-variant-numeric: tabular-nums;
  }

  /* 冷却就绪：琥珀色描边呼吸光（怒雷协议配色） */
  &--ready &__icon-box {
    border-color: rgba(#fbbf24, 0.65);
    box-shadow: 0 0 10px rgba(#fbbf24, 0.25);
  }

  &--ready &__status {
    color: rgba(#fbbf24, 0.85);
    border-color: rgba(#fbbf24, 0.4);
  }

  /* 发动中：琥珀色高亮脉动 */
  &--active &__icon-box {
    border-color: rgba(#fbbf24, 0.95);
    box-shadow: 0 0 14px rgba(#fbbf24, 0.55);
    animation: stg-hud-skill-active 0.6s ease-in-out infinite alternate;
  }

  &--active &__status {
    color: rgba(#fbbf24, 0.95);
    border-color: rgba(#fbbf24, 0.6);
  }
}

.stg-console {
  position: relative;
  width: 330px;
  padding: 20px 26px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transform: rotateX(6deg) rotateY(11deg);
  transform-origin: 0 100%;
  background: linear-gradient(
    155deg,
    rgba(12, 12, 28, 0.62),
    rgba(12, 12, 28, 0.34) 55%,
    rgba(12, 12, 28, 0.52)
  );
  clip-path: polygon(
    0 0,
    calc(100% - 20px) 0,
    100% 20px,
    100% 100%,
    20px 100%,
    0 calc(100% - 20px)
  );
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  overflow: hidden;
  font-variant-numeric: tabular-nums;

  &__row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__label {
    width: 50px;
    flex-shrink: 0;
    font-size: 15px;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.55);
  }

  /* 条槽：平行四边形斜切（弹匣造型） + 暗底 */
  &__bar {
    position: relative;
    flex: 1;
    height: 20px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba($accent, 0.28);
    clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);

    &--dash {
      height: 17px;
      border-color: rgba(#67e8f9, 0.32);
    }

    /* 折跃耗尽：红描边慢闪告警 */
    &--dash-empty {
      border-color: rgba(#f87171, 0.5);
      animation: stg-hud-dash-empty 1.2s steps(2, start) infinite;
    }
  }

  /* 条内数值：压条靠左，投影保证在填充上可读 */
  &__bar-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding-left: 12px;
    font-size: 12px;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.92);
    text-shadow:
      0 0 4px rgba(0, 0, 0, 0.8),
      0 1px 2px rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }

  /* 填充：与条槽同向斜切的能量块 */
  &__fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
    transition: width 0.12s linear;

    &--hp {
      background: linear-gradient(
        90deg,
        rgba(#059669, 0.75),
        rgba(#34d399, 0.85) 60%,
        rgba(#6ee7b7, 0.9)
      );
      box-shadow: 0 0 10px rgba(#34d399, 0.55);
    }

    &--mid {
      background: linear-gradient(90deg, rgba(#d97706, 0.75), rgba(#fbbf24, 0.9));
      box-shadow: 0 0 10px rgba(#fbbf24, 0.55);
    }

    &--low {
      background: linear-gradient(90deg, rgba(#dc2626, 0.75), rgba(#f87171, 0.9));
      box-shadow: 0 0 10px rgba(#f87171, 0.7);
      animation: stg-hud-hp-critical 0.9s ease-in-out infinite alternate;
    }

    &--shield {
      background: linear-gradient(90deg, rgba(#22d3ee, 0.6), rgba(#67e8f9, 0.85));
      box-shadow: 0 0 8px rgba(#67e8f9, 0.5);
    }

    &--dash {
      background: linear-gradient(90deg, rgba(#22d3ee, 0.65), rgba(#a5f3fc, 0.9));
      box-shadow: 0 0 10px rgba(#67e8f9, 0.6);
    }
  }

  /* 折跃条刻度线：按格均分，倾斜刻槽呼应平行四边形 + 右侧高光 */
  &__tick {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 2px;
    background: rgba(8, 8, 20, 0.95);
    box-shadow: 2px 0 0 rgba(255, 255, 255, 0.14);
    transform: skewX(-22deg);
    pointer-events: none;
  }

  /* 对角括号，强化"锁定框"感 */
  &__corner {
    position: absolute;
    width: 14px;
    height: 14px;
    border: 1px solid rgba($accent, 0.9);
    pointer-events: none;

    &--tl {
      left: 6px;
      top: 6px;
      border-right: none;
      border-bottom: none;
    }

    &--br {
      right: 6px;
      bottom: 6px;
      border-left: none;
      border-top: none;
    }
  }
}

/* ==================== 右下角武器 HUD（军用喷印风） ==================== */

.stg-weapon {
  position: relative;
  width: 236px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  transform: rotateX(6deg) rotateY(-11deg);
  transform-origin: 100% 100%;
  overflow: hidden;
  font-variant-numeric: tabular-nums;

  /* 弹药区：大数字与备弹水平排列，备弹对齐大数字底部 */
  &__ammo {
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 2px;
  }

  &__digits {
    display: flex;
    line-height: 1;
    font-size: 40px;
    font-weight: 700;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.92);
    text-shadow: 0 0 10px rgba($accent, 0.35);
  }

  /* 前导零半透明（参考图 039 的 0） */
  &__digit--dim {
    color: rgba(255, 255, 255, 0.28);
    text-shadow: none;
  }

  &__reserve {
    font-size: 11px;
    padding-bottom: 5px;
    color: rgba(255, 255, 255, 0.45);
  }

  /* 装填中：备弹位变红闪烁 */
  &__ammo--reloading &__reserve {
    color: rgba(#f87171, 0.95);
    animation: stg-hud-tag-blink 0.5s steps(2, start) infinite;
  }

  /* 武器剪影展示位：上下细线 + 四角取景框 */
  &__figure {
    position: relative;
    height: 70px;
    border-top: 1px solid rgba($accent, 0.22);
    border-bottom: 1px solid rgba($accent, 0.22);
    overflow: hidden;
  }

  /* 四角取景括号 */
  &__figure-corner {
    position: absolute;
    width: 10px;
    height: 10px;
    border: 1px solid rgba($accent, 0.75);
    pointer-events: none;

    &--tl {
      left: 0;
      top: 0;
      border-right: none;
      border-bottom: none;
    }

    &--tr {
      right: 0;
      top: 0;
      border-left: none;
      border-bottom: none;
    }

    &--bl {
      left: 0;
      bottom: 0;
      border-right: none;
      border-top: none;
    }

    &--br {
      right: 0;
      bottom: 0;
      border-left: none;
      border-top: none;
    }
  }

  &__figure-inner {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
  }

  &__img {
    max-width: 100%;
    max-height: 66px;
    object-fit: contain;
    /* 图标素材左侧透明留白较多，右移补偿视觉居中 */
    translate: 6px 0;
    /* 白色剪影化（参考图的白色枪形） */
    filter: brightness(0) invert(1);
    opacity: 0.85;
    pointer-events: none;
  }

  &__empty {
    font-size: 10px;
    letter-spacing: 3px;
    color: rgba(255, 255, 255, 0.25);
  }

  /* 双槽位（参考图底部 1 / 3 槽） */
  &__slots {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  &__slot {
    display: flex;
    align-items: center;
    gap: 6px;

    img {
      max-width: 44px;
      max-height: 22px;
      object-fit: contain;
      filter: brightness(0) invert(1);
      opacity: 0.45;
      pointer-events: none;
    }

    &--empty {
      opacity: 0.4;
    }
  }

  &__slot-key {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.4);
  }
}

@keyframes stg-hud-tag-blink {
  50% {
    opacity: 0.25;
  }
}

/* ==================== 切枪交换动画 ==================== */

/* 大剪影：旧枪上抬收起，新枪自下方抽出 */
.weapon-swap-enter-active {
  transition: all 0.24s cubic-bezier(0.22, 1, 0.36, 1) 0.05s;
}

.weapon-swap-leave-active {
  transition: all 0.13s ease-in;
}

.weapon-swap-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.92);
}

.weapon-swap-leave-to {
  opacity: 0;
  transform: translateY(-14px) scale(0.94);
}

/* 小槽位：与大剪影反向联动（旧枪落位，新枪自上落下） */
.slot-swap-enter-active {
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1) 0.08s;
}

.slot-swap-leave-active {
  transition: all 0.12s ease-in;
}

.slot-swap-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.slot-swap-leave-to {
  opacity: 0;
  transform: translateY(9px);
}

@keyframes stg-hud-hp-critical {
  from {
    filter: brightness(1);
  }
  to {
    filter: brightness(1.55);
  }
}

@keyframes stg-hud-dash-empty {
  50% {
    border-color: rgba(#f87171, 0.12);
  }
}

/* ==================== Boss 血条组（右上角浮空式，无面板） ==================== */

.stg-boss-list {
  position: absolute;
  top: 36px;
  right: 18px;
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  pointer-events: none;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
}

/* ==================== 巨构 Boss 部位独立血条 ==================== */

.stg-boss-parts {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
  background: rgba(10, 6, 14, 0.55);
  border: 1px solid rgba(255, 90, 110, 0.22);
  border-radius: 6px;
  box-shadow: 0 0 14px rgba(255, 59, 78, 0.12);
}

.stg-boss-part {
  display: grid;
  grid-template-columns: 64px 1fr 46px;
  align-items: center;
  gap: 8px;
  font-variant-numeric: tabular-nums;
  transition: opacity 0.25s;

  &__name {
    font-size: 10px;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.66);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__bar {
    position: relative;
    height: 3px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  &__fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      rgba(255, 90, 110, 0.6),
      rgba(255, 150, 110, 0.9) 70%,
      rgba(255, 210, 120, 1)
    );
    box-shadow: 0 0 6px rgba(255, 120, 100, 0.7);
    transition: width 0.12s linear;
  }

  &__hp {
    font-size: 9px;
    text-align: right;
    letter-spacing: 0.5px;
    color: rgba(255, 190, 140, 0.85);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  }

  /* 已击毁：整体变暗 + 报废标记 */
  &--dead {
    opacity: 0.45;

    &__name {
      text-decoration: line-through;
    }

    &__fill {
      width: 0 !important;
    }

    &__hp {
      color: rgba(255, 110, 110, 0.9);
      letter-spacing: 0;
    }
  }
}

/* 单个 Boss：无边框浮空信息，文字 + 一条细发光血线，融入画面 */
.stg-boss {
  position: relative;
  font-variant-numeric: tabular-nums;
  animation: stg-hud-boss-in 0.35s cubic-bezier(0.22, 1, 0.36, 1);

  /* 头部行：名称 + 详细血量，右对齐浮在血线上方 */
  &__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  &__name {
    min-width: 0;
    font-size: 11px;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.72);
    text-shadow:
      0 0 6px rgba($accent-purple, 0.7),
      0 1px 2px rgba(0, 0, 0, 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__hp {
    flex-shrink: 0;
    font-size: 11px;
    letter-spacing: 0.5px;
    color: rgba(#f0abfc, 0.85);
    text-shadow:
      0 0 6px rgba($accent-purple, 0.6),
      0 1px 2px rgba(0, 0, 0, 0.7);
  }

  &__hp-max {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.32);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  }

  /* 血线：近乎隐形的暗轨 + 2px 发光填充，末端一颗亮点 */
  &__bar {
    position: relative;
    margin-top: 5px;
    height: 2px;
    background: rgba(255, 255, 255, 0.1);
  }

  &__fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: linear-gradient(
      90deg,
      rgba($accent-purple, 0.55),
      rgba(#c084fc, 0.85) 60%,
      rgba(#f0abfc, 1)
    );
    box-shadow:
      0 0 8px rgba($accent-purple, 0.65),
      0 0 2px rgba(#f0abfc, 0.9);
    transition: width 0.15s linear;
  }

  /* 填充前沿亮点：血线当前位置的一颗光点 */
  &__edge {
    position: absolute;
    right: -1px;
    top: 50%;
    width: 3px;
    height: 3px;
    transform: translateY(-50%) rotate(45deg);
    background: #f0abfc;
    box-shadow: 0 0 6px rgba(#f0abfc, 1);
  }

  /* 分段刻度：竖向短刻线浮在血线上，标出阶段节点（如浮游炮增援点） */
  &__seg {
    position: absolute;
    top: 50%;
    width: 1px;
    height: 6px;
    transform: translate(-50%, -50%);
    background: rgba(255, 255, 255, 0.75);
    box-shadow: 0 0 4px rgba($accent-purple, 0.9);
    pointer-events: none;
  }

  /* 低血量：转为红色并缓慢呼吸 */
  &--low {
    animation:
      stg-hud-boss-in 0.35s cubic-bezier(0.22, 1, 0.36, 1),
      stg-hud-boss-low 1s ease-in-out 0.35s infinite alternate;
  }

  &--low &__fill {
    background: linear-gradient(90deg, rgba(#dc2626, 0.6), rgba(#f87171, 0.95));
    box-shadow:
      0 0 8px rgba(#f87171, 0.7),
      0 0 2px rgba(#fca5a5, 0.9);
  }

  &--low &__edge {
    background: #fca5a5;
    box-shadow: 0 0 6px rgba(#f87171, 1);
  }

  &--low &__hp {
    color: rgba(#fca5a5, 0.9);
    text-shadow:
      0 0 6px rgba(#f87171, 0.6),
      0 1px 2px rgba(0, 0, 0, 0.7);
  }
}

/* 出场：自右侧轻轻滑入并淡入 */
@keyframes stg-hud-boss-in {
  from {
    opacity: 0;
    transform: translateX(14px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes stg-hud-boss-low {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.55;
  }
}
</style>
