/**
 * 出击配置：可选角色与技能
 * 新增角色只动这里，不需要修改 engine/ 代码；
 * 角色武器定义已迁移至 weapons/playerWeapons.ts（此处仅做兼容导出）
 */
import type { CharacterStats, ResolvedCharacterStats, SkillKey } from '../types'
import { BALANCE } from './balance'

export { PLAYER_WEAPON_LIST as WEAPONS } from '../weapons/playerWeapons'
export type { PlayerWeaponConfig as WeaponOption } from '../weapons/playerWeapons'

/** 可选角色（sprite 未配置时用机身颜色占位绘制） */
export interface CharacterOption {
  key: string
  /** 角色名 */
  name: string
  /** 机身主色（占位绘制用） */
  color: string
  /** 描边 / 高光色 */
  accent: string
  /**
   * 战斗属性：hp / shield 必填，其余字段缺省时回退 balance.player 默认值
   * （HP 制，无残机无 BOMB，血量归零即游戏结束）
   */
  stats: CharacterStats
  /**
   * 皮肤素材。推荐 'frame:xxx'：素材为 src/assets/frame/xxx.json + 对应图片
   * （编译期打包，独立运行与部署 main-site 均可用，不依赖 public/）；
   * 也可填 public/ 下的 .json 路径（如 '/stg/player.json'）或图片路径（自动找同名 .json）。
   * json 里 image 字段写图片文件名（换图只改 json），
   * 动作写在 animations 里按名字自动调用：右移（D）播 right、其余播 move、
   * 左移（A）自动镜像无需 left；新增动作零改代码。
   * 不配置 = 使用颜色占位图形
   */
  sprite?: string
}

/** 可选技能 */
export interface SkillOption {
  key: SkillKey
  /** 技能名 */
  name: string
  /** 一句话说明 */
  desc: string
}

export const CHARACTERS: CharacterOption[] = [
  // 皮肤：soyorin-png 工具导出的 player.json + player.png 放 src/assets/frame/ 即可
  {
    key: 'miaonai',
    name: '喵奈',
    color: '#bb99f5',
    accent: '#f0abfc',
    stats: { hp: 100, shield: 0 }, // 其余属性使用 balance.player 默认配置
    sprite: 'frame:player'
  }
  // 新角色在这里追加一条即可，例：
  // {
  //   key: 'xxx',
  //   name: 'xxx',
  //   color: '#...',
  //   accent: '#...',
  //   stats: { hp: 80, shield: 20, fastSpeed: 5.2 } // 可选字段覆盖默认值
  // }
]

/**
 * 补齐角色属性的可选字段（未覆盖的字段回退 balance.player 默认值），
 * 引擎统一消费补齐后的完整形态，不再关心缺省逻辑
 */
export function resolveCharacterStats(char: CharacterOption): ResolvedCharacterStats {
  return {
    hp: char.stats.hp,
    shield: char.stats.shield,
    fastSpeed: char.stats.fastSpeed ?? BALANCE.player.fastSpeed,
    slowSpeed: char.stats.slowSpeed ?? BALANCE.player.slowSpeed,
    sprintSpeedMul: char.stats.sprintSpeedMul ?? BALANCE.player.sprintSpeedMul,
    hitInvincible: char.stats.hitInvincible ?? BALANCE.player.hitInvincible
  }
}

export const SKILLS: SkillOption[] = [
  {
    key: 'synaptic',
    name: '突触超频',
    desc: '神经加速器过载，全场敌人及弹幕进入极慢时间流，自身不受影响'
  },
  {
    key: 'emp',
    name: '电磁脉冲',
    desc: '释放全向冲击波，清除所有敌弹并干扰敌方，使其数秒内无法移动与开火'
  },
  {
    key: 'gemini',
    name: '双子星卫',
    desc: '召唤四颗环绕自机的金色卫星，持续 15 秒，撞毁触碰到的敌弹'
  }
]
