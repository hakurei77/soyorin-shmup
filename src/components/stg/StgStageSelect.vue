<script setup lang="ts">
/**
 * 作战出击页（重构）
 * 结构：横排 3 张 Boss 卡片，难度递进（掠星者·沃恩 → 棱镜星卫 → 星渊巨构）
 * 数据源：config/stages.ts → CHAPTERS / STAGE_MAP；Boss 详情来自 config/enemies.ts
 */
import { computed, ref } from 'vue'
import { CHAPTERS, STAGE_MAP } from '../../config/stages'
import { ENEMIES } from '../../config/enemies'
import type { EnemyConfig } from '../../types'

const emit = defineEmits<{
  back: []
  start: [stageId: string]
}>()

/* ---------- 难度梯度（按关卡顺序映射） ---------- */
const DIFFICULTY = [
  { code: 'NORMAL', zh: '标准', color: '#5ee6ff' },
  { code: 'HARD', zh: '困难', color: '#b366ff' },
  { code: 'EXTREME', zh: '极限', color: '#ff3b4e' },
]

/** 按 Boss 血量映射难度标签 */
function difficultyOf(hp: number): (typeof DIFFICULTY)[number] {
  if (hp <= 500) return DIFFICULTY[0]
  if (hp < 20000) return DIFFICULTY[1]
  return DIFFICULTY[2]
}

/* ---------- Boss 卡片数据 ---------- */
interface BossCard {
  id: string
  index: string
  stageName: string
  stageDesc: string
  bossName: string
  bossEn: string
  hp: number
  hpRatio: number
  color: string
  difficulty: (typeof DIFFICULTY)[number]
}

const chapter = computed(() => CHAPTERS[0] ?? { name: '作战出击', nameEn: 'SORTIE' })

const cards = computed<BossCard[]>(() => {
  const stageIds = CHAPTERS[0]?.stageIds ?? []
  const list: BossCard[] = stageIds.map((sid, i) => {
    const stage = STAGE_MAP.get(sid)
    const enemy: EnemyConfig | undefined = stage?.boss
      ? ENEMIES[stage.boss.enemyKey]
      : undefined
    return {
      id: sid,
      index: `BOS-${String(i + 1).padStart(2, '0')}`,
      stageName: stage?.name ?? sid,
      stageDesc: stage?.desc ?? '',
      bossName: enemy?.name ?? '未知目标',
      bossEn: enemy?.en ?? 'UNKNOWN',
      hp: enemy?.hp ?? 0,
      hpRatio: 0,
      color: enemy?.iconColor ?? '#ffffff',
      difficulty: difficultyOf(enemy?.hp ?? 0),
    }
  })
  const maxHp = Math.max(...list.map(c => c.hp), 1)
  list.forEach(c => (c.hpRatio = Math.max(c.hp / maxHp, 0.02)))
  return list
})

/* ---------- 选中与出击 ---------- */
const selectedId = ref<string | null>(null)

function onCardClick(id: string) {
  selectedId.value = id
}

function sortie() {
  const id = selectedId.value ?? cards.value[0]?.id
  if (!id) return
  emit('start', id)
}
</script>

<template>
  <div class="sortie">
    <!-- 深空背景光晕 -->
    <div class="sortie__glow sortie__glow--a" />
    <div class="sortie__glow sortie__glow--b" />
    <div class="sortie__vignette" />

    <!-- 顶部 HUD -->
    <header class="sortie__header">
      <button class="sortie-back" @click="emit('back')">
        <span class="sortie-back__arrow" />
        <span class="sortie-back__label">返回</span>
      </button>
      <div class="sortie-heading">
        <p class="sortie-heading__eyebrow">OPERATION TERMINAL // {{ chapter.nameEn }}</p>
        <h2 class="sortie-heading__title">{{ chapter.name }}</h2>
      </div>
      <p class="sortie-heading__hint">共 3 个强敌目标 · 难度递进</p>
    </header>

    <!-- Boss 卡片 -->
    <main class="sortie__deck">
      <button
        v-for="card in cards"
        :key="card.id"
        class="boss-card"
        :class="{ 'boss-card--selected': selectedId === card.id }"
        :style="{ '--boss-color': card.color, '--diff-color': card.difficulty.color }"
        @click="onCardClick(card.id)"
      >
        <span class="boss-card__scanlines" />
        <span class="boss-card__corner boss-card__corner--tl" />
        <span class="boss-card__corner boss-card__corner--br" />

        <!-- Boss 徽记 -->
        <div class="boss-card__sigil">
          <span class="boss-card__sigil-ring" />
          <span class="boss-card__sigil-core" />
        </div>

        <!-- 编号 + 难度 -->
        <div class="boss-card__topline">
          <span class="boss-card__index">{{ card.index }}</span>
          <span class="boss-card__diff" :style="{ color: card.difficulty.color, borderColor: card.difficulty.color }">
            {{ card.difficulty.code }} · {{ card.difficulty.zh }}
          </span>
        </div>

        <!-- 名称 -->
        <h3 class="boss-card__name">{{ card.bossName }}</h3>
        <p class="boss-card__en">{{ card.bossEn }}</p>
        <p class="boss-card__stage">— {{ card.stageName }} —</p>

        <!-- 血条 -->
        <div class="boss-card__hp">
          <div class="boss-card__hp-track">
            <span class="boss-card__hp-fill" :style="{ width: (card.hpRatio * 100).toFixed(1) + '%' }" />
          </div>
          <p class="boss-card__hp-value">HP {{ card.hp.toLocaleString('en-US') }}</p>
        </div>

        <!-- 简介 -->
        <p class="boss-card__desc">{{ card.stageDesc }}</p>

        <!-- 出击 -->
        <span class="boss-card__sortie" :class="{ 'boss-card__sortie--active': selectedId === card.id }">
          <span class="boss-card__sortie-label">出击</span>
          <span class="boss-card__sortie-sub">SORTIE</span>
        </span>
      </button>
    </main>

    <!-- 底部出击栏 -->
    <footer class="sortie__footer">
      <p class="sortie__footer-tip">选择目标后确认出击</p>
      <button class="sortie-confirm" @click="sortie">
        <span class="sortie-confirm__label">确认出击</span>
        <span class="sortie-confirm__sub">ENGAGE</span>
      </button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/stg-vars.scss' as *;

$cyan: #5ee6ff;
$ink: #0c0c1e;

.sortie {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: radial-gradient(120% 90% at 50% 0%, #10102c 0%, $ink 55%, #06060f 100%);
  user-select: none;
  display: flex;
  flex-direction: column;

  /* ---------- 背景光晕 ---------- */
  &__glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
    pointer-events: none;

    &--a {
      width: 520px;
      height: 520px;
      left: -160px;
      top: -160px;
      background: radial-gradient(circle, rgba($accent-purple, 0.4), transparent 70%);
    }

    &--b {
      width: 640px;
      height: 640px;
      right: -220px;
      bottom: -220px;
      background: radial-gradient(circle, rgba(94, 230, 255, 0.22), transparent 70%);
    }
  }

  &__vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(180deg, rgba(5, 5, 16, 0.55) 0%, transparent 24%, transparent 76%, rgba(6, 6, 15, 0.85) 100%);
  }

  /* ---------- 顶部 HUD ---------- */
  &__header {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: flex-start;
    gap: 20px;
    padding: 24px 28px;
  }

  &__deck {
    position: relative;
    z-index: 5;
    flex: 1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
    align-items: center;
    padding: 8px 48px 0;
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;
  }

  &__footer {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 48px 28px;
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;

    &-tip {
      margin: 0;
      font-size: 12px;
      letter-spacing: 3px;
      color: rgba(255, 255, 255, 0.4);
    }
  }
}

/* ---------- 返回按钮 ---------- */
.sortie-back {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px 12px 16px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(10, 10, 26, 0.6);
  border: 1px solid rgba($accent, 0.4);
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
  backdrop-filter: blur(10px);
  transition: filter 0.2s ease, translate 0.15s ease;

  &:hover {
    filter: brightness(1.3);
    translate: 0 -2px;
  }

  &__arrow {
    width: 0;
    height: 0;
    border-right: 8px solid currentColor;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
  }

  &__label {
    font-size: 14px;
    letter-spacing: 4px;
  }
}

/* ---------- 标题 ---------- */
.sortie-heading {
  &__eyebrow {
    margin: 0 0 4px;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 10px;
    letter-spacing: 3px;
    color: rgba($accent, 0.8);
  }

  &__title {
    margin: 0;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: 10px;
    color: #fff;
    text-shadow: 0 0 16px rgba($accent, 0.7);
  }

  &__hint {
    margin: 6px 0 0 auto;
    align-self: flex-end;
    font-size: 12px;
    letter-spacing: 3px;
    color: rgba(255, 255, 255, 0.45);
  }
}

/* ---------- Boss 卡片 ---------- */
.boss-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 26px 22px 22px;
  cursor: pointer;
  text-align: center;
  color: #fff;
  background: rgba(10, 10, 26, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.14);
  clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
  backdrop-filter: blur(12px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  transition: translate 0.22s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.22s ease, box-shadow 0.22s ease, filter 0.22s ease;

  &:hover {
    translate: 0 -8px;
    border-color: color-mix(in srgb, var(--boss-color) 55%, transparent);
    box-shadow: 0 24px 54px rgba(0, 0, 0, 0.55), 0 0 32px color-mix(in srgb, var(--boss-color) 22%, transparent);
  }

  &--selected {
    translate: 0 -10px;
    border-color: color-mix(in srgb, var(--boss-color) 90%, transparent);
    box-shadow: 0 26px 58px rgba(0, 0, 0, 0.6), 0 0 40px color-mix(in srgb, var(--boss-color) 34%, transparent);
  }

  /* 扫描线 */
  &__scanlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 3px);
    pointer-events: none;
  }

  /* 对角括号 */
  &__corner {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 1px solid color-mix(in srgb, var(--boss-color) 80%, transparent);
    pointer-events: none;

    &--tl {
      left: 7px;
      top: 7px;
      border-right: none;
      border-bottom: none;
    }

    &--br {
      right: 7px;
      bottom: 7px;
      border-left: none;
      border-top: none;
    }
  }

  /* Boss 徽记 */
  &__sigil {
    position: relative;
    width: 96px;
    height: 96px;
    display: grid;
    place-items: center;
    background: radial-gradient(circle, color-mix(in srgb, var(--boss-color) 16%, transparent) 0%, transparent 70%);

    &-ring {
      position: absolute;
      inset: 4px;
      border-radius: 50%;
      border: 1px dashed color-mix(in srgb, var(--boss-color) 55%, transparent);
      animation: sigil-spin 16s linear infinite;
    }

    &-core {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--boss-color);
      box-shadow: 0 0 22px var(--boss-color), 0 0 46px color-mix(in srgb, var(--boss-color) 55%, transparent);
      animation: sigil-pulse 2.4s ease-in-out infinite;
    }
  }

  &__topline {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 2px;
  }

  &__index {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 3px;
    color: color-mix(in srgb, var(--boss-color) 90%, #fff);
  }

  &__diff {
    padding: 2px 8px;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 9px;
    letter-spacing: 2px;
    border: 1px solid;
  }

  &__name {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 5px;
    text-shadow: 0 0 16px color-mix(in srgb, var(--boss-color) 55%, transparent);
  }

  &__en {
    margin: 0;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 10px;
    letter-spacing: 3px;
    color: rgba(255, 255, 255, 0.5);
  }

  &__stage {
    margin: 0;
    font-size: 13px;
    letter-spacing: 4px;
    color: rgba(255, 255, 255, 0.65);
  }

  &__hp {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-top: 4px;

    &-track {
      position: relative;
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      overflow: hidden;
    }

    &-fill {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, color-mix(in srgb, var(--boss-color) 70%, transparent), var(--boss-color));
      box-shadow: 0 0 10px color-mix(in srgb, var(--boss-color) 70%, transparent);
    }

    &-value {
      margin: 0;
      text-align: right;
      font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
      font-size: 10px;
      letter-spacing: 1px;
      color: rgba(255, 255, 255, 0.45);
    }
  }

  &__desc {
    margin: 4px 0 8px;
    font-size: 12px;
    line-height: 1.8;
    color: rgba(255, 255, 255, 0.55);
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  &__sortie {
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 12px 0;
    background: linear-gradient(120deg, rgba($accent, 0.32), rgba($accent-purple, 0.24));
    border: 1px solid rgba($accent, 0.65);
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
    transition: filter 0.2s ease, box-shadow 0.2s ease;

    &--active {
      filter: brightness(1.25);
      box-shadow: 0 0 22px color-mix(in srgb, var(--boss-color) 40%, transparent);
    }

    &-label {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 6px;
      text-shadow: 0 0 10px rgba($accent, 0.8);
    }

    &-sub {
      font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
      font-size: 9px;
      letter-spacing: 3px;
      color: rgba(255, 255, 255, 0.6);
    }
  }
}

/* ---------- 底部确认出击 ---------- */
.sortie-confirm {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 14px 30px;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(120deg, rgba($accent, 0.45), rgba($accent-purple, 0.32));
  border: 1px solid rgba($accent, 0.85);
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
  box-shadow: 0 0 24px rgba($accent, 0.35);
  transition: filter 0.2s ease, translate 0.15s ease;

  &:hover {
    filter: brightness(1.3);
    translate: 0 -2px;
  }

  &__label {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 8px;
    text-shadow: 0 0 10px rgba($accent, 0.8);
  }

  &__sub {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 10px;
    letter-spacing: 3px;
    color: rgba(255, 255, 255, 0.6);
  }
}

@keyframes sigil-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes sigil-pulse {
  50% {
    transform: scale(1.25);
    opacity: 0.75;
  }
}

/* ---------- 响应式 ---------- */
@media (max-width: 1020px) {
  .sortie__deck {
    grid-template-columns: 1fr;
    gap: 18px;
    align-items: stretch;
    overflow-y: auto;
  }

  .boss-card {
    flex-direction: row;
    flex-wrap: wrap;
    text-align: left;
    gap: 12px;
    padding: 20px;

    &__sigil {
      width: 64px;
      height: 64px;
      flex-shrink: 0;
    }

    &__topline {
      width: 100%;
      margin-top: 0;
    }

    &__name {
      font-size: 20px;
    }

    &__desc {
      width: 100%;
      min-height: 0;
    }
  }
}
</style>
