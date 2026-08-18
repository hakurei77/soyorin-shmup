<script setup lang="ts">
/**
 * 符卡名横幅
 * 职责：Boss 登场 / 阶段切换时的横幅展示，bannerId 递增时重新触发入场动画
 */
defineProps<{
  banner: string | null
  bannerId: number
}>()
</script>

<template>
  <Transition name="stg-banner">
    <div v-if="banner" :key="bannerId" class="stg-banner">
      <span class="stg-banner__line"></span>
      <span class="stg-banner__text">{{ banner }}</span>
      <span class="stg-banner__line"></span>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
@use '../../styles/stg-vars.scss' as *;

.stg-banner {
  position: absolute;
  top: 34%;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  pointer-events: none;

  &__text {
    font-size: 26px;
    letter-spacing: 6px;
    color: #fff;
    text-shadow:
      0 0 12px rgba($accent-purple, 0.9),
      0 0 40px rgba($accent-purple, 0.5);
    white-space: nowrap;
  }

  &__line {
    flex: 1;
    max-width: 90px;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba($accent-purple, 0.9),
      transparent
    );
  }
}

.stg-banner-enter-active {
  transition:
    opacity 0.35s ease,
    transform 0.35s ease;
}
.stg-banner-leave-active {
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
}
.stg-banner-enter-from {
  opacity: 0;
  transform: scale(1.15);
}
.stg-banner-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
