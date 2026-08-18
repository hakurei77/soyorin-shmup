<script setup lang="ts">
/**
 * 商店页
 * 职责：出售全部道具（水晶货币本身除外），统一标价 1 水晶
 * 数据源：物品定义读 config/items 注册表，货币 / 购买入账走 useInventory 全局单例
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ItemCategory, ItemRarity } from '@/types'
import { ITEM_LIST, ITEM_CRYSTAL, KIND_COLORS, KIND_COLOR_DEFAULT, RARITY_NAMES } from '@/config/items'
import { useInventory } from '@/composables/useInventory'
import { playSfx, preloadSfx } from '@/utils/sfx'
import { getCurrentBgmId, playBgm, stopBgm } from '@/utils/bgm'
import crystalIcon from '@/assets/icon/crystal.png'
import shopBuySfx from '@/assets/audio/ui/shop-buy.wav'
import btnHoverSfx from '@/assets/audio/ui/btn-hover.wav'
import deckClickSfx from '@/assets/audio/ui/deck-click.wav'

/** 进入商店前正在播放的 BGM（离开时恢复；进入时未播任何 BGM 则为 null） */
let prevBgmId: string | null = null

onMounted(() => {
  preloadSfx(shopBuySfx)
  preloadSfx(btnHoverSfx)
  preloadSfx(deckClickSfx)
  // 切到商店专属 BGM，离开时恢复之前曲目（BGM 单例不保留进度，恢复后从头播放）
  prevBgmId = getCurrentBgmId()
  playBgm('shop')
})

onBeforeUnmount(() => {
  if (prevBgmId && prevBgmId !== 'shop') playBgm(prevBgmId)
  else stopBgm()
  prevBgmId = null
})

const emit = defineEmits<{
  back: []
}>()

/* ---------- 商品列表：全部道具（水晶本身是货币，不出售），统一 1 水晶 ---------- */
const PRICE = 1

const TABS = [
  { key: 'all', label: '全部', en: 'ALL' },
  { key: 'weapon', label: '武器', en: 'WEAPON' },
  { key: 'implant', label: '义体', en: 'IMPLANT' },
  { key: 'skill', label: '技能', en: 'SKILL' },
  { key: 'material', label: '材料', en: 'MATERIAL' },
] as const

type TabKey = (typeof TABS)[number]['key']

const activeTab = ref<TabKey>('all')

/** 稀有度主题色（卡片描边 / 名称 / 悬停光晕共用） */
const RARITY_COLORS: Record<ItemRarity, string> = {
  common: '#b4bed2',
  uncommon: '#6edc8c',
  rare: '#8cb4ff',
  epic: '#f0abfc',
  legendary: '#ffc85a',
  mythic: '#ff6e78',
}

/**
 * 货架分组顺序：按子类别（kind）细分摆放
 * 武器按 动能 / 技术 / 激光，义体按 头部 / 躯干 / 腿部，技能统一「主动技能」
 */
const KIND_SECTIONS = [
  { key: '动能武器', en: 'KINETIC' },
  { key: '技术武器', en: 'TECH' },
  { key: '激光武器', en: 'LASER' },
  { key: '头部义体', en: 'HEAD' },
  { key: '躯干义体', en: 'BODY' },
  { key: '腿部义体', en: 'LEGS' },
  { key: '主动技能', en: 'ACTIVE' },
] as const

/**
 * 货架分区：按子类别（kind）分组，组间分割线隔开；
 * 页签切换只过滤大类，组内仍按 KIND_SECTIONS 顺序摆放；空组不显示
 */
const sections = computed(() => {
  const pool = ITEM_LIST.filter(item => item.id !== ITEM_CRYSTAL.id)
  const filtered =
    activeTab.value === 'all'
      ? pool
      : pool.filter(item => item.category === (activeTab.value as ItemCategory))
  return KIND_SECTIONS
    .map(({ key, en }) => ({
      key,
      label: key,
      en,
      items: filtered.filter(item => item.kind === key),
    }))
    .filter(s => s.items.length > 0)
})

/** 当前页签商品总数 */
const goodsCount = computed(() => sections.value.reduce((n, s) => n + s.items.length, 0))

/** 子类别标签颜色：与背包物品块右上角小三角同一套配色 */
function kindColor(kind: string): string {
  return KIND_COLORS[kind] ?? KIND_COLOR_DEFAULT
}

/* ---------- 货币 ---------- */
const { crystal, spendCrystal, addItem } = useInventory()
const crystalText = computed(() => crystal.value.toLocaleString('en-US'))

/* ---------- 购买提示：堆叠 toast，连续购买各自独立显示 / 消失 ---------- */
interface ShopTip {
  id: number
  text: string
}

const shopTips = ref<ShopTip[]>([])
let tipSeq = 0

function showTip(text: string) {
  const id = ++tipSeq
  shopTips.value.push({ id, text })
  window.setTimeout(() => {
    shopTips.value = shopTips.value.filter(t => t.id !== id)
  }, 1800)
}

/** 购买一件：先扣水晶再入账；背包放不下时退款并提示 */
function buy(itemId: string, name: string) {
  if (!spendCrystal(PRICE)) {
    showTip('水晶不足，无法购买')
    return
  }
  if (addItem(itemId, 1) === 0) {
    // 入账失败（背包满）：退还水晶
    addItem(ITEM_CRYSTAL.id, PRICE)
    showTip('背包已满，购买失败')
    return
  }
  playSfx(shopBuySfx) // 购买成功确认音（失败分支不播）
  showTip(`已购入「${name}」×1`)
}

/** 购买按钮 hover：水晶不足置灰时不发声 */
function onBuyHover() {
  if (crystal.value < PRICE) return
  playSfx(btnHoverSfx)
}

/** 页签 / 返回按钮 hover（全站统一音色） */
function onBtnHover() {
  playSfx(btnHoverSfx)
}

/** 页签点击：确认音 + 切换；重复点当前页签不发声 */
function onTabClick(key: TabKey) {
  if (activeTab.value === key) return
  playSfx(deckClickSfx)
  activeTab.value = key
}

/** 返回按钮点击：确认音后通知父级返回 */
function onBackClick() {
  playSfx(deckClickSfx)
  emit('back')
}
</script>

<template>
  <div class="shop-page">
    <div class="shop-page__vignette" aria-hidden="true" />

    <header class="shop-page__header">
      <button class="shop-back" @mouseenter="onBtnHover" @click="onBackClick">
        <span class="shop-back__arrow">◀</span>
        <span class="shop-back__text">返回</span>
        <span class="shop-back__sub">BACK</span>
      </button>

      <div class="shop-title-block">
        <h2 class="shop-page__title">商店</h2>
        <span class="shop-page__tag">SHOP // SUPPLY-DECK</span>
      </div>

      <div class="shop-header__meta">
        <div class="shop-currency" title="水晶">
          <img class="shop-currency__icon" :src="crystalIcon" alt="水晶" draggable="false" />
          <span class="shop-currency__amount">{{ crystalText }}</span>
        </div>
      </div>
    </header>

    <!-- 分类页签 -->
    <nav class="shop-tabs" aria-label="商品分类">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="shop-tab"
        :class="{ 'shop-tab--active': activeTab === tab.key }"
        @mouseenter="onBtnHover"
        @click="onTabClick(tab.key)"
      >
        <span class="shop-tab__label">{{ tab.label }}</span>
        <span class="shop-tab__en">{{ tab.en }}</span>
      </button>
      <span class="shop-tabs__count">{{ goodsCount }} 件商品 // 全店均一价 1 水晶</span>
    </nav>

    <!-- 货架：全部分类时分组展示，组间分割线隔开 -->
    <div class="shop-shelf">
      <template v-for="section in sections" :key="section.key">
        <div v-if="sections.length > 1" class="shop-divider">
          <span class="shop-divider__label">{{ section.label }}</span>
          <span class="shop-divider__en">{{ section.en }}</span>
          <span class="shop-divider__count">{{ section.items.length }}</span>
        </div>
        <div
          v-for="item in section.items"
          :key="item.id"
          class="goods-card"
          :style="{ '--rc': RARITY_COLORS[item.rarity] }"
        >
        <div class="goods-card__icon" :class="`rarity-bg--${item.rarity}`">
          <img
            v-if="item.icon"
            :src="item.icon"
            :alt="item.name"
            :style="{ transform: `scale(${item.iconScale ?? 1})` }"
            draggable="false"
          />
          <!-- 无图标时与背包一致：显示名字首字 -->
          <span v-else class="goods-card__glyph">{{ item.name.charAt(0) }}</span>
        </div>

        <div class="goods-card__meta">
          <p class="goods-card__name">{{ item.name }}</p>
          <p class="goods-card__sub">
            <i class="goods-card__rarity">{{ RARITY_NAMES[item.rarity] }}</i>
            <span v-if="item.kind" class="goods-card__kind" :style="{ color: kindColor(item.kind) }">
              {{ item.kind }}
            </span>
          </p>
          <p v-if="item.desc" class="goods-card__desc">{{ item.desc }}</p>
        </div>

        <div class="goods-card__trade">
          <span class="goods-card__price">
            <img :src="crystalIcon" alt="水晶" draggable="false" />
            {{ PRICE }}
          </span>
          <button
            class="goods-card__buy"
            :disabled="crystal < PRICE"
            @mouseenter="onBuyHover"
            @click="buy(item.id, item.name)"
          >
            购买
          </button>
        </div>
        </div>
      </template>
    </div>

    <!-- 购买结果提示：屏幕正中堆叠 -->
    <TransitionGroup name="shop-tip" tag="div" class="shop-tips">
      <p v-for="tip in shopTips" :key="tip.id" class="shop-tip">
        <span class="shop-tip__dot" />{{ tip.text }}
      </p>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/stg-vars.scss' as *;

.shop-page {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  padding: 24px 32px 28px;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(40, 28, 72, 0.5), transparent 60%),
    rgba(6, 6, 18, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  user-select: none;
  overflow: hidden;

  &__vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse at center,
      transparent 55%,
      rgba(3, 3, 12, 0.6) 100%
    );
    pointer-events: none;
  }

  &__header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba($accent, 0.22);
  }

  &__title {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 10px;
    color: #fff;
    text-shadow:
      0 0 12px rgba($accent, 0.7),
      0 0 30px rgba($accent-purple, 0.35);
  }

  &__tag {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 10px;
    letter-spacing: 3px;
    color: rgba($accent, 0.6);
  }
}

.shop-title-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* ---------- 返回按钮 ---------- */
.shop-back {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  cursor: pointer;
  color: rgba($accent, 0.95);
  background: rgba($accent, 0.08);
  border: 1px solid rgba($accent, 0.4);
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
  transition: background 0.15s ease, filter 0.15s ease;

  &:hover {
    background: rgba($accent, 0.22);
    filter: brightness(1.2);
  }

  &__arrow {
    font-size: 11px;
  }

  &__text {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 4px;
  }

  &__sub {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 9px;
    letter-spacing: 2px;
    color: rgba($accent, 0.55);
  }
}

/* ---------- 头部货币 ---------- */
.shop-header__meta {
  margin-left: auto;
  display: flex;
  align-items: center;
}

.shop-currency {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(10, 10, 26, 0.6);
  border: 1px solid rgba($accent, 0.35);
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));

  &__icon {
    width: 24px;
    height: 24px;
    object-fit: contain;
    filter: drop-shadow(0 0 5px rgba(96, 200, 255, 0.8));
  }

  &__amount {
    min-width: 6ch;
    text-align: right;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 1px;
    color: #aee6ff;
    text-shadow: 0 0 10px rgba(96, 200, 255, 0.65);
  }
}

/* ---------- 分类页签 ---------- */
.shop-tabs {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 0;

  &__count {
    margin-left: auto;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 10px;
    letter-spacing: 2px;
    color: rgba($accent, 0.55);
  }
}

.shop-tab {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.55);
  background: rgba(10, 10, 26, 0.5);
  border: 1px solid rgba($accent, 0.2);
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;

  &:hover {
    color: rgba(255, 255, 255, 0.85);
    border-color: rgba($accent, 0.5);
  }

  &--active {
    color: #fff;
    background: rgba($accent, 0.18);
    border-color: rgba($accent, 0.7);
    text-shadow: 0 0 8px rgba($accent, 0.6);
  }

  &__label {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 4px;
  }

  &__en {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 9px;
    letter-spacing: 2px;
    opacity: 0.6;
  }
}

/* ---------- 货架：横向卡片网格，行高由内容决定（不被拉伸） ---------- */
.shop-shelf {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
  grid-auto-rows: max-content;
  gap: 14px;
  padding: 4px 4px 12px;
  scrollbar-width: thin;
  scrollbar-color: rgba($accent, 0.45) transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba($accent, 0.4);
  }
}

/* ---------- 分类分割线：横贯整行的分组标题 ---------- */
.shop-divider {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 2px 0;

  /* 两侧渐隐细线 */
  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
  }

  &::before {
    background: linear-gradient(90deg, transparent, rgba($accent, 0.5));
  }

  &::after {
    background: linear-gradient(90deg, rgba($accent, 0.5), transparent);
  }

  &__label {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 6px;
    color: rgba($accent, 0.95);
    text-shadow: 0 0 10px rgba($accent, 0.5);
  }

  &__en {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 9px;
    letter-spacing: 3px;
    color: rgba($accent, 0.5);
  }

  /* 组内商品数：小胶囊 */
  &__count {
    min-width: 22px;
    padding: 1px 7px;
    text-align: center;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 10px;
    color: rgba($accent, 0.85);
    background: rgba($accent, 0.12);
    border: 1px solid rgba($accent, 0.35);
    clip-path: polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px));
  }

  /* 第一组与页签之间无需额外留白 */
  &:first-child {
    padding-top: 0;
  }
}

/* ---------- 商品卡：左图标 / 中信息 / 右价格购买 ---------- */
.goods-card {
  /* --rc：稀有度主题色，由模板内联注入 */
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  background: rgba(10, 10, 26, 0.58);
  border: 1px solid rgba($accent, 0.22);
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, translate 0.15s ease;

  /* 左侧稀有度色条 */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, var(--rc), transparent 130%);
    opacity: 0.75;
  }

  &:hover {
    translate: 0 -2px;
    border-color: var(--rc);
    box-shadow:
      0 8px 22px rgba(0, 0, 0, 0.35),
      0 0 18px color-mix(in srgb, var(--rc) 30%, transparent);
  }

  &__icon {
    position: relative;
    flex-shrink: 0;
    width: 84px;
    height: 84px;
    display: grid;
    place-items: center;
    clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);

    img {
      width: 62%;
      height: 62%;
      object-fit: contain;
      filter: drop-shadow(0 0 8px rgba($accent, 0.4));
    }
  }

  /* 无图标物品的名字首字 */
  &__glyph {
    font-size: 32px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.92);
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.35);
  }

  &__meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  &__name {
    margin: 0;
    font-size: 19px;
    font-weight: 600;
    letter-spacing: 2px;
    color: var(--rc);
    text-shadow: 0 0 10px color-mix(in srgb, var(--rc) 45%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__sub {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    letter-spacing: 2px;
  }

  &__rarity {
    font-style: normal;
    color: var(--rc);
    opacity: 0.85;
  }

  &__kind {
    color: rgba(255, 255, 255, 0.45);
  }

  &__desc {
    margin: 0;
    font-size: 11px;
    line-height: 1.6;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.42);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 右侧交易区：价格在上，购买按钮在下 */
  &__trade {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    width: 96px;
  }

  &__price {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 16px;
    font-weight: 700;
    color: #aee6ff;
    text-shadow: 0 0 8px rgba(96, 200, 255, 0.6);

    img {
      width: 19px;
      height: 19px;
      object-fit: contain;
      filter: drop-shadow(0 0 4px rgba(96, 200, 255, 0.8));
    }
  }

  &__buy {
    padding: 9px 0;
    cursor: pointer;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 4px;
    text-indent: 4px;
    color: #fff;
    background: linear-gradient(120deg, rgba($accent, 0.35), rgba($accent-purple, 0.25));
    border: 1px solid rgba($accent, 0.6);
    clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px));
    transition: filter 0.15s ease;

    &:hover:not(:disabled) {
      filter: brightness(1.35);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.35;
    }
  }
}

/* ---------- 稀有度底色（与背包物品块同一套宝石色） ---------- */
.rarity-bg--common {
  background: linear-gradient(180deg, rgb(66 70 86), rgb(42 45 58));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 6%),
    inset 0 0 0 2px rgb(180 190 210 / 35%);
}

.rarity-bg--uncommon {
  background: linear-gradient(180deg, rgb(28 104 62), rgb(16 62 38));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 6%),
    inset 0 0 0 2px rgb(110 220 140 / 60%),
    inset 0 0 10px rgb(110 220 140 / 16%);
}

.rarity-bg--rare {
  background: linear-gradient(180deg, rgb(32 76 144), rgb(18 46 92));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 6%),
    inset 0 0 0 2px rgb(140 180 255 / 65%),
    inset 0 0 10px rgb(140 180 255 / 18%);
}

.rarity-bg--epic {
  background: linear-gradient(180deg, rgb(104 52 158), rgb(64 32 100));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 6%),
    inset 0 0 0 2px rgb(240 171 252 / 70%),
    inset 0 0 12px rgb(240 171 252 / 22%);
}

.rarity-bg--legendary {
  background: linear-gradient(180deg, rgb(170 116 30), rgb(106 68 17));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 7%),
    inset 0 0 0 2px rgb(255 200 90 / 75%),
    inset 0 0 12px rgb(255 200 90 / 22%);
}

.rarity-bg--mythic {
  background: rgb(122 28 44);
  box-shadow:
    inset 0 0 14px rgb(255 80 80 / 25%),
    0 0 12px rgb(255 80 80 / 22%);
}

/* ---------- 购买结果提示：屏幕正中纵向堆叠 ---------- */
.shop-tips {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}

.shop-tip {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  font-size: 13px;
  letter-spacing: 2px;
  color: #d9f5ff;
  text-shadow: 0 0 8px rgba($accent, 0.5);
  background: rgba(10, 10, 26, 0.78);
  border: 1px solid rgba($accent, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  pointer-events: none;

  &__dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    background: rgba($accent, 0.95);
    box-shadow: 0 0 8px rgba($accent, 0.9);
  }
}

.shop-tip-enter-active {
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.shop-tip-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
  /* 离场时脱离文档流，让剩余提示平滑补位 */
  position: absolute;
}

.shop-tip-move {
  transition: transform 0.3s ease;
}

.shop-tip-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.shop-tip-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
