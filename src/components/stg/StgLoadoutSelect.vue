<script setup lang="ts">
/**
 * 出击配置面板
 * 职责：选择角色 / 武器 / 技能，确认后把选择结果交给父组件开局
 */
import { ref } from 'vue'
import { CHARACTERS, SKILLS, WEAPONS } from '../../config/loadout'
import type { SkillKey, WeaponKey } from '../../types'

export interface LoadoutChoice {
  charKey: string
  weapon: WeaponKey
  skill: SkillKey
}

const emit = defineEmits<{
  confirm: [choice: LoadoutChoice]
  back: []
}>()

/** 当前选中的角色 key */
const selectedChar = ref(CHARACTERS[0]!.key)
/** 当前选中的武器 */
const selectedWeapon = ref<WeaponKey>('WPN-01')
/** 当前选中的技能 */
const selectedSkill = ref<SkillKey>('synaptic')

function confirm() {
  emit('confirm', {
    charKey: selectedChar.value,
    weapon: selectedWeapon.value,
    skill: selectedSkill.value
  })
}
</script>

<template>
  <div class="stg-overlay stg-overlay--dim">
    <h2 class="stg-overlay__title stg-overlay__title--small">出击配置</h2>
    <div class="stg-select">
      <div class="stg-select__section">
        <div class="stg-select__label">选择角色</div>
        <div class="stg-select__chars">
          <button
            v-for="c in CHARACTERS"
            :key="c.key"
            class="stg-select__char"
            :class="{ 'stg-select__char--active': selectedChar === c.key }"
            @click="selectedChar = c.key"
          >
            <span
              class="stg-select__ship"
              :style="{
                background: c.color,
                boxShadow: `0 0 14px ${c.color}`
              }"
            ></span>
            <span class="stg-select__name">{{ c.name }}</span>
          </button>
        </div>
      </div>
      <div class="stg-select__section">
        <div class="stg-select__label">选择武器</div>
        <div class="stg-select__weapons">
          <button
            v-for="w in WEAPONS"
            :key="w.key"
            class="stg-select__weapon"
            :class="{
              'stg-select__weapon--active': selectedWeapon === w.key
            }"
            @click="selectedWeapon = w.key"
          >
            <span class="stg-select__weapon-name">{{ w.name }}</span>
            <span class="stg-select__weapon-desc">{{ w.desc }}</span>
          </button>
        </div>
      </div>
      <div class="stg-select__section">
        <div class="stg-select__label">选择技能</div>
        <div class="stg-select__weapons">
          <button
            v-for="sk in SKILLS"
            :key="sk.key"
            class="stg-select__weapon"
            :class="{
              'stg-select__weapon--active': selectedSkill === sk.key
            }"
            @click="selectedSkill = sk.key"
          >
            <span class="stg-select__weapon-name">{{ sk.name }}</span>
            <span class="stg-select__weapon-desc">{{ sk.desc }}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="stg-menu">
      <button class="stg-btn stg-btn--primary" @click="confirm">出击！</button>
      <button class="stg-btn" @click="emit('back')">返回</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/stg-vars.scss' as *;

.stg-select {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 380px;
  padding: 22px 26px;
  border: 1px solid $glass-border;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);

  &__label {
    margin-bottom: 10px;
    font-size: 12px;
    letter-spacing: 4px;
    color: rgba(255, 255, 255, 0.5);
  }

  &__chars {
    display: flex;
    gap: 14px;
    justify-content: center;
  }

  &__char {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border: 1px solid $glass-border;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.8);
    font-size: 13px;
    letter-spacing: 2px;
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      background 0.2s ease,
      transform 0.15s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateY(-1px);
    }

    &--active {
      border-color: rgba($accent, 0.8);
      background: rgba($accent, 0.12);
      box-shadow: 0 0 16px rgba($accent, 0.25);
    }
  }

  // 角色占位：与游戏内一致的三角机身
  &__ship {
    width: 22px;
    height: 26px;
    clip-path: polygon(50% 0, 0 100%, 50% 78%, 100% 100%);
  }

  &__weapons {
    display: flex;
    gap: 14px;
  }

  &__weapon {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 16px;
    border: 1px solid $glass-border;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      background 0.2s ease,
      transform 0.15s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateY(-1px);
    }

    &--active {
      border-color: rgba($accent-purple, 0.8);
      background: rgba($accent-purple, 0.12);
      box-shadow: 0 0 16px rgba($accent-purple, 0.25);
    }
  }

  &__weapon-name {
    font-size: 14px;
    letter-spacing: 2px;
    color: #fff;
  }

  &__weapon-desc {
    font-size: 11px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.5);
  }
}
</style>
