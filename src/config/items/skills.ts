import type { ItemDef } from '../../types'
import synapticIcon from '../../assets/items/skills/Hyper-Synapse.png'
import empIcon from '../../assets/items/skills/EMP.png'
import geminiIcon from '../../assets/items/skills/Castor-Pollux.png'

/** 突触超频：激活期间敌机与敌弹近乎凝滞，自机移动、武器与弹丸保持原速，且全程无敌（受击闪出故障残影） */
export const ITEM_SYNAPTIC_OVERDRIVE: ItemDef = {
  id: 'skill-synaptic',
  name: '突触超频',
  category: 'skill',
  rarity: 'epic',
  kind: '主动技能',
  desc: '超频神经反射，令周遭一切近乎凝滞：激活期间敌人与敌弹速度降至 12%，自机移动、武器与弹丸均不受影响，且全程无敌——被击中时只会闪出几道彩虹故障残影，满能量可持续 6 秒。\n能量需回复至 30% 以上才能开启，完全回满约需 15 秒。',
  icon: synapticIcon,
  stackLimit: 1,
  size: { w: 1, h: 1 },
  skillKey: 'synaptic',
}

/** 电磁脉冲：释放全向冲击波，清空敌方弹药并干扰敌方使其瘫痪 */
export const ITEM_EMP_BURST: ItemDef = {
  id: 'skill-emp',
  name: '电磁脉冲',
  category: 'skill',
  rarity: 'epic',
  kind: '主动技能',
  desc: '释放全向电磁冲击波，瞬间清除所有敌方弹药，并干扰敌方单位使其在 2.5 秒内无法移动与开火。最多储存 2 层充能，每层约 10 秒回复，可连续释放。',
  icon: empIcon,
  stackLimit: 1,
  size: { w: 1, h: 1 },
  skillKey: 'emp',
}

/** 双子星卫：召唤卡斯托耳与波吕克斯两台金色防御僚机环绕自机，撞毁触碰到的敌方子弹，替自机挡弹 */
export const ITEM_GEMINI_GUARD: ItemDef = {
  id: 'skill-gemini',
  name: '双子星卫',
  category: 'skill',
  rarity: 'epic',
  kind: '主动技能',
  desc: '召唤卡斯托耳与波吕克斯共四台金色防御僚机，环绕自机飞行 15 秒，僚机撞毁触碰到的敌方子弹，替自机挡下火力。\n能量回满后才能释放，结束后约 20 秒回满。',
  icon: geminiIcon,
  stackLimit: 1,
  size: { w: 1, h: 1 },
  skillKey: 'gemini',
}

/** 技能类物品列表（新增在此追加） */
export const SKILL_ITEMS: ItemDef[] = [ITEM_SYNAPTIC_OVERDRIVE, ITEM_EMP_BURST, ITEM_GEMINI_GUARD]
