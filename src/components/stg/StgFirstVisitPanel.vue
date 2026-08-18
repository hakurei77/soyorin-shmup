<script setup lang="ts">
/**
 * 首次进入引导弹窗
 * 职责：新用户第一次进入游戏时展示，说明「无新手教学、操作看设置、装备去商店」，
 *      并告知已发放的新手水晶福利。仅能通过点击「开始行动」按钮关闭，防止用户未读即跳过。
 * 显隐与首访标记由父组件 StgGame.vue 管理，本组件只负责展示与上抛 close。
 */
import crystalIcon from '../../assets/icon/crystal.png'

const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div class="first-visit">
    <div class="first-visit__card">
      <p class="first-visit__kicker">// 初次接入</p>
      <h2 class="first-visit__title">欢迎登舰，新锐驾驶员</h2>

      <p class="first-visit__body">
        本作暂未开放新手教学，基础操作方式可在「设置」中查看，武器与装备请前往「商店」购买。
      </p>

      <div class="first-visit__gift">
        <img class="first-visit__gift-icon" :src="crystalIcon" alt="" draggable="false" />
        <span class="first-visit__gift-label">已为你准备启动资金</span>
        <b class="first-visit__gift-amount">×5000</b>
      </div>

      <button class="first-visit__confirm" @click="emit('close')">开始行动</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/stg-vars.scss' as *;

.first-visit {
  position: absolute;
  inset: 0;
  z-index: 180;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 5, 15, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);

  &__card {
    position: relative;
    width: min(520px, calc(100vw - 48px));
    padding: 34px 38px 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    text-align: center;
    background: linear-gradient(
      180deg,
      rgba(22, 22, 44, 0.72) 0%,
      rgba(13, 13, 30, 0.82) 100%
    );
    border: 1px solid rgba($accent, 0.35);
    border-radius: 16px;
    box-shadow:
      0 0 40px rgba($accent, 0.25),
      inset 0 0 60px rgba($accent, 0.05);
    // 切角装饰，呼应其他面板
    clip-path: polygon(
      0 0,
      calc(100% - 16px) 0,
      100% 16px,
      100% 100%,
      16px 100%,
      0 calc(100% - 16px)
    );
  }

  &__kicker {
    margin: 0;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 12px;
    letter-spacing: 5px;
    color: rgba($accent, 0.85);
    text-shadow: 0 0 10px rgba($accent, 0.6);
  }

  &__title {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 4px;
    color: #fff;
    text-shadow:
      0 0 16px rgba($accent, 0.7),
      0 0 40px rgba($accent-purple, 0.4);
  }

  &__body {
    margin: 0;
    font-size: 14px;
    line-height: 1.9;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.72);
  }

  &__gift {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 22px;
    border: 1px solid rgba($accent, 0.35);
    border-radius: 999px;
    background: rgba($accent, 0.1);
  }

  &__gift-icon {
    width: 22px;
    height: 22px;
    filter: drop-shadow(0 0 8px rgba($accent, 0.7));
  }

  &__gift-label {
    font-size: 13px;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.8);
  }

  &__gift-amount {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 18px;
    letter-spacing: 1px;
    color: $accent-purple;
    text-shadow: 0 0 12px rgba($accent-purple, 0.7);
  }

  &__confirm {
    min-width: 200px;
    padding: 13px 34px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 4px;
    color: #0a0a1a;
    background: linear-gradient(135deg, $accent, $accent-purple);
    border: none;
    border-radius: 999px;
    box-shadow: 0 0 22px rgba($accent, 0.4);
    transition: filter 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;

    &:hover {
      filter: brightness(1.15);
      transform: translateY(-1px);
      box-shadow: 0 0 30px rgba($accent, 0.6);
    }
  }
}
</style>
