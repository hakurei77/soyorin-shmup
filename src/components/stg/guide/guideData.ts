/**
 * 出击指南图鉴数据
 * 参数描述与 config/balance.ts、engine/enemy.ts 的实现保持一致；
 * 敌人武器条目由 weapons/enemyWeapons.ts 武器库数据生成
 */
import type {
  BehaviorType,
  CharacterStats,
  EnemyKey,
  EnemyPathType,
  EnemyWeaponKey,
  SkillKey,
  WeaponKey
} from '../../../types'
import { BALANCE } from '../../../config/balance'
import { CHARACTERS, resolveCharacterStats } from '../../../config/loadout'
import { ENEMY_LIST } from '../../../config/enemies'
import { ENEMY_WEAPON_LIST } from '../../../weapons/enemyWeapons'
import { PLAYER_WEAPON_LIST } from '../../../weapons/playerWeapons'

export interface GuideParam {
  name: string
  value: string
  desc: string
}

export interface GuideEntry {
  name: string
  en: string
  desc: string
  params: GuideParam[]
  tips: string[]
}

export interface GuideEnemy extends GuideEntry {
  key: EnemyKey
  category: 'normal' | 'boss'
}
export interface GuideEnemyWeapon extends GuideEntry {
  key: EnemyWeaponKey
}
export type GuideEnemyPathKey = EnemyPathType | 'orbit'
export interface GuideEnemyPath extends GuideEntry {
  key: GuideEnemyPathKey
}
export interface GuideEnemyBehavior extends GuideEntry {
  key: BehaviorType
  /** 行为在战场中的视觉标记 */
  tag: string
}
export interface GuideWeapon extends GuideEntry {
  key: WeaponKey
}
export interface GuideSkill extends GuideEntry {
  key: SkillKey
}
export interface GuideCharacter extends GuideEntry {
  key: string
}

/** 指南一级菜单页签 */
export type GuideTab = 'character' | 'enemy' | 'enemyWeapon' | 'enemyPath' | 'enemyBehavior' | 'weapon' | 'skill'

export const guideTabs: { key: GuideTab; label: string }[] = [
  { key: 'character', label: '角色信息' },
  { key: 'enemy', label: '敌人信息' },
  { key: 'enemyWeapon', label: '敌人武器说明' },
  { key: 'enemyPath', label: '敌人轨迹' },
  { key: 'enemyBehavior', label: '敌人行为分析' },
  { key: 'weapon', label: '角色武器说明' },
  { key: 'skill', label: '角色技能说明' }
]

/**
 * 角色信息图鉴：由 config/loadout.ts 的 CHARACTERS 生成，
 * 属性经 resolveCharacterStats 补齐，desc 标注每个字段是角色覆盖还是默认值
 */
function statSource(custom: boolean, field: string, def: number): string {
  return custom
    ? `角色覆盖（loadout.ts stats，默认 ${def}）`
    : `默认值（balance.player.${field}）`
}

/** 角色档案描述（人物设定见 onlineStory/characterPersonality.md） */
const CHARACTER_DESC: Record<string, string> = {
  miaonai:
    '野性强气的战斗系少女。缺乏社会化常识但勇猛直球，世界上的一切在她眼里都是「干架」的变种。'
}

export const guideCharacters: GuideCharacter[] = CHARACTERS.map((c) => {
  const s = resolveCharacterStats(c)
  const p = BALANCE.player
  const custom = (k: keyof CharacterStats) => c.stats[k] !== undefined
  return {
    key: c.key,
    name: c.name,
    en: c.key.toUpperCase(),
    desc: CHARACTER_DESC[c.key] ?? `${c.name}（${c.key}）`,
    params: [
      {
        name: '角色编号',
        value: c.key,
        desc: 'loadout.ts 的 CHARACTERS 注册编号，出击配置通过它引用'
      },
      {
        name: '血量',
        value: `${s.hp}`,
        desc: 'HP 制：归零即战斗失败，无残机无复活'
      },
      {
        name: '护盾',
        value: `${s.shield}`,
        desc:
          s.shield > 0
            ? '承伤时优先于血量扣除'
            : '未配置护盾，伤害直接扣除血量'
      },
      {
        name: '高速移动',
        value: `${s.fastSpeed} px/帧`,
        desc: statSource(custom('fastSpeed'), 'fastSpeed', p.fastSpeed)
      },
      {
        name: '低速移动',
        value: `${s.slowSpeed} px/帧`,
        desc: statSource(custom('slowSpeed'), 'slowSpeed', p.slowSpeed)
      },
      {
        name: '冲刺倍率',
        value: `× ${s.sprintSpeedMul}`,
        desc: statSource(custom('sprintSpeedMul'), 'sprintSpeedMul', p.sprintSpeedMul)
      },
      {
        name: '受击无敌',
        value: `${s.hitInvincible} 帧（${(s.hitInvincible / 60).toFixed(1)} 秒）`,
        desc: statSource(custom('hitInvincible'), 'hitInvincible', p.hitInvincible)
      },
      {
        name: '判定点半径',
        value: `${p.hitboxRadius} px`,
        desc: `全局默认值（balance.player.hitboxRadius）`
      }
    ],
    tips: [
      '血量归零即游戏结束：没有残机，也没有复活',
      `受击后获得 ${s.hitInvincible} 帧无敌时间，可趁机脱离火线`,
      '按住低速键可显示判定点并精确微移，冲刺则大幅提升机动'
    ]
  }
})

/** 敌人信息图鉴：由 config/enemies.ts 敌人库生成，参数与局内实际行为一致 */
export const guideEnemies: GuideEnemy[] = ENEMY_LIST.map((e) => ({
  key: e.key,
  category: e.category,
  name: e.name,
  en: e.en,
  desc: e.desc,
  params: [
    {
      name: '敌人编号',
      value: e.key,
      desc: '敌人库注册编号（config/enemies.ts），关卡配置通过它引用'
    },
    {
      name: '分类',
      value: e.category === 'boss' ? 'BOSS' : '普通敌人',
      desc: e.category === 'boss' ? 'Boss 单位，拥有符卡阶段，单独出场' : '道中杂兵，按编队出场'
    },
    {
      name: '图标形状',
      value:
        e.icon === 'triangle'
          ? '三角形'
          : e.icon === 'square'
            ? '正方形'
            : e.icon === 'leviathan'
              ? '巨构舰体'
              : e.icon === 'drone'
                ? '拦截机'
                : e.icon === 'laser-drone'
                  ? '激光无人机'
                  : '圆形',
      desc: `渲染层根据 icon 字段绘制，颜色 ${e.iconColor}`
    },
    {
      name: '血量',
      value: `${e.hp}`,
      desc: 'HP 制：归零即击毁'
    },
    {
      name: '护盾',
      value: `${e.shield}`,
      desc: e.shield > 0 ? '承伤时优先于血量扣除' : '未配置护盾，伤害直接扣除血量'
    },
    {
      name: '移动速度',
      value: `${e.speed} px/帧`,
      desc: '入场与移动的基础速度（逻辑像素/帧，60 帧基准）'
    },
    {
      name: '搭载武器',
      value: e.weapon,
      desc: '敌人武器编号（weapons/enemyWeapons.ts），决定弹幕行为'
    },
    {
      name: '射击延迟',
      value: `${e.fireDelay} 帧（约 ${(e.fireDelay / 60).toFixed(1)} 秒）`,
      desc: '出场后多少帧开始射击'
    }
  ],
  tips: e.tips
}))

/** 敌人武器图鉴：由 weapons/enemyWeapons.ts 武器库生成，参数与局内实际行为一致 */
export const guideEnemyWeapons: GuideEnemyWeapon[] = ENEMY_WEAPON_LIST.map((w) => ({
  key: w.key,
  name: w.name,
  en: w.en,
  desc: w.desc,
  params: w.laser
    ? [
        {
          name: '武器编号',
          value: w.key,
          desc: '武器库注册编号（weapons/enemyWeapons.ts），关卡配置通过它引用'
        },
        {
          name: '武器系列',
          value: `${w.series.name} ${w.series.en}`,
          desc: '同一系列的武器共用相同光束配色'
        },
        {
          name: '攻击类型',
          value: '激光光束',
          desc: '走光束状态机：预警 → 照射 → 熄灭 → 休息，不发射弹丸'
        },
        {
          name: '瞄准模式',
          value: '锁定自机（预警开始时锁定方向）',
          desc: '照射期间角度固定，预警线标出的就是真实光路'
        },
        {
          name: '预警时长',
          value: `${w.laser.telegraph} 帧（约 ${(w.laser.telegraph / 60).toFixed(1)} 秒）`,
          desc: '预警期间光束无判定，立即离开光路'
        },
        {
          name: '照射时长',
          value: `${w.laser.duration} 帧（约 ${(w.laser.duration / 60).toFixed(1)} 秒）`,
          desc: '照射期间站在光束内会按命中间隔持续受伤'
        },
        {
          name: '光束宽度',
          value: `${w.laser.halfWidth * 2} 逻辑像素`,
          desc: '判定宽度 = 光束半宽 × 2 + 自机判定半径'
        },
        {
          name: '单次伤害',
          value: `${w.laser.damage}`,
          desc: '每 hitInterval 帧结算一次，站立不动会连续受伤'
        },
        {
          name: '命中间隔',
          value: `${w.laser.hitInterval} 帧（约 ${(w.laser.hitInterval / 60).toFixed(2)} 秒）`,
          desc: '同一光束两次结算之间的最小间隔'
        },
        {
          name: '光束数量',
          value: `${w.laser.count} 条${w.laser.count > 1 ? `（平行间距 ${w.laser.spacing} 逻辑像素）` : ''}`,
          desc:
            w.laser.count > 1
              ? '同轮平行光束，垂直于照射方向排布'
              : '单条光束'
        }
      ]
    : [
        {
          name: '武器编号',
          value: w.key,
          desc: '武器库注册编号（weapons/enemyWeapons.ts），关卡配置通过它引用'
        },
        {
          name: '武器系列',
          value: `${w.series.name} ${w.series.en}`,
          desc: '同一系列的武器共用相同子弹（样式与颜色由系列决定）'
        },
        {
          name: '子弹速度',
          value: `${w.bulletSpeed} px/帧`,
          desc: '弹丸飞行速度（逻辑像素/帧，60 帧基准）'
        },
        {
          name: '弹丸伤害',
          value: `${w.damage}`,
          desc: '单颗弹丸命中自机时造成的伤害'
        },
        {
          name: '发射间隔',
          value: `${w.fireInterval} 帧（约 ${(w.fireInterval / 60).toFixed(2)} 秒）`,
          desc: '每隔 fireInterval 帧发射一轮'
        },
        {
          name: '弹丸数量',
          value: `${w.bulletCount ?? 1} 颗/轮`,
          desc:
            (w.bulletCount ?? 1) > 1
              ? `一轮 ${w.bulletCount} 颗弹丸在 ${w.spreadAngle ?? 8 * ((w.bulletCount ?? 1) - 1)}° 扇面内均匀展开，中心朝自机`
              : '一轮一颗弹丸，直指发射瞬间的自机位置'
        }
      ],
  tips: w.tips
}))

/** 敌人轨迹图鉴：10 种移动路径，全部实现在 engine/enemy.ts move() 中 */
export const guideEnemyPaths: GuideEnemyPath[] = [
  {
    key: 'straight',
    name: '直线下落',
    en: 'STRAIGHT',
    desc: '最简单的移动轨迹：敌人从出场位置以恒定速度垂直下落，到达屏幕底部后离开。',
    params: [
      { name: '速度倍率', value: '× 1.0', desc: 'y += speed，完整速度下落' },
      { name: '横向偏移', value: '无', desc: 'x 坐标始终保持不变' },
      { name: '轨迹复杂度', value: '最低', desc: '纯直线，无任何摆动或变向' }
    ],
    tips: [
      '最易预测的轨迹，适合新手练习瞄准',
      '通常速度较快（speed 值高），注意不要堵枪口',
      '单点自机狙的典型载体'
    ]
  },
  {
    key: 'sine',
    name: '正弦摆动',
    en: 'SINE WAVE',
    desc: '下落同时左右正弦摆动，振幅 70px。敌人像波浪一样蜿蜒下降，覆盖纵向面较宽。',
    params: [
      { name: '下落速度', value: '× 0.7', desc: 'y += speed × 0.7，比直线略慢' },
      { name: '摆动幅度', value: '±70 px', desc: 'x = baseX + sin(t × 0.04) × 70 × sy，以出场位置为中心摆动' },
      { name: '摆动周期', value: '≈157 帧（2.6 秒）', desc: 't × 0.04 频率，单次完整来回约 2.6 秒' }
    ],
    tips: [
      '横向覆盖广，正面硬扛容易被弹幕封位',
      '推荐从侧翼输出：摆到最左时打右半边，反之亦然',
      '与自机狙弹幕搭配时威胁显著提升'
    ]
  },
  {
    key: 'dive-left',
    name: '左斜向俯冲',
    en: 'DIVE LEFT',
    desc: '入场后向右下方向斜冲，行进中 x 轴持续左偏。常用于侧翼突袭或包围编队。',
    params: [
      { name: '下落速度', value: '× 1.0', desc: 'y += speed，垂直速度不变' },
      { name: '斜向偏移', value: 'x -= speed × 0.5', desc: '每一帧向左偏移 speed 的一半，形成 26.6° 斜角' }
    ],
    tips: [
      '预测落点在左侧，可提前向右预判躲避',
      '编队出场时多与 dive-right 配对形成交叉火网',
      '速度越快偏移越多，高速杂兵会迅速飞出屏幕左侧'
    ]
  },
  {
    key: 'dive-right',
    name: '右斜向俯冲',
    en: 'DIVE RIGHT',
    desc: '入场后向右下方向斜冲，x 轴持续右偏。与 dive-left 对称，常成对使用。',
    params: [
      { name: '下落速度', value: '× 1.0', desc: 'y += speed' },
      { name: '斜向偏移', value: 'x += speed × 0.5', desc: '每一帧向右偏移 speed 的一半，26.6° 斜角' }
    ],
    tips: [
      '预测落点在右侧，可提前向左躲避',
      '与 dive-left 搭配出场时，中间留有安全通道',
      '高速俯冲下屏幕右侧死角较大'
    ]
  },
  {
    key: 'hover',
    name: '悬停漂移',
    en: 'HOVER',
    desc: '入场后快速下落至屏幕中上部，随后在空中悬停漂移约 5.5 秒，最后加速离场。典型的「卡位型」轨迹。',
    params: [
      { name: '阶段一：入场', value: '0 → 90 帧', desc: 'y += speed，直线下落至约 90px 处' },
      { name: '阶段二：悬停', value: '90 → 420 帧', desc: 'y 停止，x 在 baseX ±40px 内正弦漂移（频率 0.02）' },
      { name: '阶段三：离场', value: '> 420 帧', desc: 'y += speed × 1.5，加速俯冲离开' }
    ],
    tips: [
      '悬停期间是绝佳输出窗口，但此时敌人也在持续射击',
      '漂移幅度不大（±40px），瞄准难度低',
      '注意悬停结束后会突然加速，不要被卡在下方'
    ]
  },
  {
    key: 'zigzag',
    name: '锯齿下落',
    en: 'ZIGZAG',
    desc: '下落过程中每 45 帧急转一次横向方向，形成锯齿状折线。行进速度比直线略慢，但横向抖动难以预判精确位置。',
    params: [
      { name: '下落速度', value: '× 0.8', desc: 'y += speed × 0.8' },
      { name: '转向间隔', value: '45 帧（0.75 秒）', desc: '每隔 45 帧 flip 一次横向方向' },
      { name: '横移速度', value: 'x ±= speed × 0.6', desc: '每次转向后以 60% speed 的速率横向移动' }
    ],
    tips: [
      '横向抖动有一定规律（固定周期），熟练后可预判',
      '弹幕会在折线顶点处集中，顶点区域比较危险',
      '自机狙弹幕 + 锯齿轨迹 = 安全区域随敌机位置变化'
    ]
  },
  {
    key: 'loop',
    name: '回旋下落',
    en: 'LOOP',
    desc: '敌人以回旋中心为轴绕圈下落，半径 65px，周期约 126 帧（2.1 秒）。中心缓慢下沉，机身画大圈降下。',
    params: [
      { name: '回旋半径', value: '65 px', desc: '以回旋中心为原点，机身绕行半径 65px' },
      { name: '回旋周期', value: '≈126 帧（2.1 秒）', desc: 't × 0.05 频率，完整一圈约 2.1 秒' },
      { name: '中心下沉速度', value: 'speed × 0.45', desc: '回旋中心以 45% speed 缓慢下移' }
    ],
    tips: [
      '画大圈下落，弹幕沿圆弧分布，不易正面封死',
      '绕圈到正上方时最危险（敌弹垂直向下）',
      '中心下沉很慢，整体滞留时间长，推荐优先集火击破'
    ]
  },
  {
    key: 'rush',
    name: '加速俯冲',
    en: 'RUSH',
    desc: '入场时以 0.4 倍速缓慢接近，随后每帧加速 2%，直到 2.2 倍高速俯冲离场。先慢后快，节奏变化明显。',
    params: [
      { name: '初始速度', value: '× 0.4', desc: '入场第一帧以 40% speed 移动' },
      { name: '加速度', value: '每帧 +0.02 倍', desc: '连续加速 90 帧后达到上限 2.2 倍' },
      { name: '速度上限', value: '× 2.2', desc: '不会超过 speed 的 2.2 倍' }
    ],
    tips: [
      '入场慢速时是输出黄金窗口，确保火力全开',
      '加速后极快，注意不要被撞到（体术碰撞伤害 50）',
      '从慢到快的时间差容易让人误判距离'
    ]
  },
  {
    key: 'sweep-left',
    name: '左向横扫',
    en: 'SWEEP LEFT',
    desc: '先垂直下落入场 40 帧，随后急转向左横穿整个战场，几乎水平掠过。典型的清场轨迹，压制力强但通过时间短。',
    params: [
      { name: '阶段一：入场', value: '0 → 40 帧', desc: 'y += speed，直线下落入场' },
      { name: '阶段二：横扫', value: '> 40 帧', desc: 'x -= speed × 1.2（高速左移），y += speed × 0.15（微幅下沉）' }
    ],
    tips: [
      '横扫速度极快（1.2 倍 speed），横向弹幕覆盖面广',
      '从屏幕左侧出场时更危险（穿越整个战场）',
      '横扫期间微幅下沉，低位输出更容易命中'
    ]
  },
  {
    key: 'sweep-right',
    name: '右向横扫',
    en: 'SWEEP RIGHT',
    desc: '先垂直下落入场 40 帧，随后急转向右横穿整个战场。与 sweep-left 对称，成对使用时形成交叉扫射。',
    params: [
      { name: '阶段一：入场', value: '0 → 40 帧', desc: 'y += speed，直线下落入场' },
      { name: '阶段二：横扫', value: '> 40 帧', desc: 'x += speed × 1.2（高速右移），y += speed × 0.15（微幅下沉）' }
    ],
    tips: [
      '与 sweep-left 对称，成对出现时战场纵向被完全压扁',
      '偏右侧站位可提前拦截，减少穿越距离',
      '微幅下沉意味着越低越容易吃到横向弹幕'
    ]
  },
  {
    key: 'orbit',
    name: '追踪环绕',
    en: 'ORBIT / ENGAGE',
    desc: '配置了 orbit 的敌机拥有两阶段行为：先按 path 路径入场，到达 engageAfter 帧后切换为追踪自机模式。敌人通过低通滤波感知自机位置（有约半秒延迟），距离远时直线逼近，逼近到环绕半径后切换为 Circle Strafing 环绕扫射。永不离场，只能被击毁。',
    params: [
      { name: '入场阶段', value: `前 engageAfter 帧`, desc: '按 path 字段指定的路径正常入场（如 straight、sine 等）' },
      { name: '感知延迟', value: 'trackResponse = 0.045', desc: 'aimX/aimY 每帧向真实自机位置逼近 4.5%，约 0.37 秒后收敛到 90%' },
      { name: '追踪速度', value: 'speed × 2.0（pursueSpeed）', desc: '追踪/环绕时速度为自身 speed 的 2 倍，比入场更快' },
      { name: '环绕半径', value: 'orbit.radius（纵向缩放）', desc: '逼近到距感知点 R × 1.15 范围内后进入环绕' },
      { name: '环绕角速度', value: '1.4°/帧（84°/秒）', desc: '顺时针或逆时针绕圈，方向按出生侧自动选择' },
      { name: '个体差异', value: 'trackResponse ±25%', desc: '每架敌机按出生坐标哈希，响应速度在 0.75~1.25 倍之间有随机差异' },
      { name: '屏外行为', value: '不离开、可被逼出屏', desc: '被逼出屏幕后仍持续环绕追踪，会绕回来，但屏外不开火' },
      { name: '敌机分离', value: 'boids 分离力', desc: '进入追踪阶段的敌机之间相互排斥，避免重叠' }
    ],
    tips: [
      '追踪型的核心威胁在环绕扫射阶段——敌人绕圈时火力持续输出',
      '自机猛冲可利用感知延迟拉开距离，敌机反应有约 0.4~0.5 秒滞后',
      '逼出屏幕可以暂时解除弹幕威胁（屏外不开火），但敌机会绕回来',
      '多架追踪型敌机相互分离，不会完全重叠，但站位可能形成交叉火网',
      '环绕方向由出生侧决定（左半屏顺时针、右半屏逆时针），并非随机'
    ]
  }
]

/**
 * 敌人行为分析：可叠加在路径移动上的 AI 行为
 * 每个行为都是一层独立的移动影响，多行为可组合使用
 */
export const guideEnemyBehaviors: GuideEnemyBehavior[] = [
  {
    key: 'flock',
    name: '群体鸟群',
    en: 'FLOCK / BOIDS',
    tag: '群体',
    desc: '经典鸟群算法（Boids）的完整实现：同群敌机之间同时施加分离、对齐、凝聚三种力，形成类似鸟群/鱼群的自然编队运动。相同 groupId 的敌机视为同一群体，跨群不相互影响。与追踪环绕系统独立共存。',
    params: [
      { name: '分离 (Separation)', value: `半径 ${BALANCE.enemyRadius * BALANCE.enemyAi.separation.radiusMul} px`, desc: '敌机过近时互相推开，避免完全重叠。推力随重叠深度线性增强，单帧上限 0.9 px' },
      { name: '对齐 (Alignment)', value: `半径 ${BALANCE.enemyAi.alignment.radius} px`, desc: '每架敌机向视野内邻居的平局速度方向靠拢 3%/帧，群体运动方向趋于一致' },
      { name: '凝聚 (Cohesion)', value: `半径 ${BALANCE.enemyAi.cohesion.radius} px`, desc: '每架敌机被拉向周围邻居的几何中心，力度上限 0.35 px/帧，群体不散开' },
      { name: '分组机制', value: 'groupId 字符串', desc: '相同 groupId 的敌机互斥/对齐/凝聚；不同组之间完全独立' },
      { name: '三力权重', value: '分离 > 凝聚 > 对齐', desc: '分离力直接修改坐标（防止碰撞），凝聚和对齐通过行为偏移累加' }
    ],
    tips: [
      '鸟群行为 + 追踪环绕同时使用时，一队敌机像狼群一样围猎自机',
      '分离力最强，确保即使凝聚再紧也不会碰撞重叠',
      '对齐力最弱但累积效果明显——鸟群会慢慢形成一致的运动节奏',
      '通过不同 groupId 可以在同一画面上创建多群独立运动的敌机'
    ]
  },
  {
    key: 'evade',
    name: '弹幕回避',
    en: 'EVADE / DODGE',
    tag: '防御',
    desc: '感知前方一定半径内的自机弹幕，计算各子弹的危险度（危险度 = 1/距离），取反方向加权和作为回避偏移。敌机像有"自保意识"一样主动躲避玩家火力，迫使玩家修正射击角度或使用预判弹幕。',
    params: [
      { name: '感知半径', value: `${BALANCE.enemyAi.evade.radius} px`, desc: '仅对此范围内的自机弹幕产生回避反应，距离越近反应越强' },
      { name: '回避力度', value: `× ${BALANCE.enemyAi.evade.strength}`, desc: '总危险方向矢量 × 强度 × 速度 × 0.3 作为帧偏移输出' },
      { name: '危险权重', value: '1/distance', desc: '危险度与距离成反比：贴脸弹幕危险度极高，远距弹幕几乎忽略' },
      { name: '方向计算', value: '矢量加权和', desc: '每发弹幕贡献 (敌机→弹幕方向) × 危险度，全量累加后归一化回避' }
    ],
    tips: [
      '配合追踪环绕使用时，敌机边绕圈边躲避，形成"灵活的威胁"',
      '从两个角度交替射击可压制回避行为——敌机刚躲A方向又被B方向逼迫',
      '扩散弹对回避型敌机最有效：子弹分散进入感知半径，回避方向模糊化',
      '回避力度不会覆盖主运动，只是微小偏移；弹幕密集时偏移才显著'
    ]
  },
  {
    key: 'guard',
    name: '护卫编队',
    en: 'GUARD / ESCORT',
    tag: '编队',
    desc: '护卫敌机围绕首位队长围绕圈飞行，形成保护阵型。每架护卫以不同初始角度均匀分布在圆周上，按帧数转动保持等距环绕。队长可以是任意敌机（通常为 Boss 或精英），护卫不止提供火力支援还形成物理护盾。',
    params: [
      { name: '护卫半径', value: `${BALANCE.enemyAi.guard.radius} px`, desc: '护卫到队长的等距环绕距离' },
      { name: '角速度', value: `${BALANCE.enemyAi.guard.angularSpeed}°/帧`, desc: '每帧绕队长转动的角度，所有护卫同步同向旋转' },
      { name: '初始相位', value: 'hash 随机', desc: '每架护卫按出生坐标哈希生成唯一初始角度，自动均匀分布' },
      { name: '跟随平滑', value: 'max 2.0 px/帧', desc: '护卫以 15% 比例步进向目标卫位移动，转动时带惯性缓冲，不突兀' }
    ],
    tips: [
      '想打队长先破护卫：护卫既是火力来源也是物理屏障',
      '护卫的环绕角度是固定相位关系——不会突然换位',
      '多架护卫均分 360°，火力覆盖完整圆周；如果只剩一两架则有明显缺口',
      '队长移动时护卫平滑跟随（非瞬移），自机可以预测缺口出现位置'
    ]
  },
  {
    key: 'ambush',
    name: '伏击突袭',
    en: 'AMBUSH / RUSH',
    tag: '奇袭',
    desc: '入场后按路径飞入屏幕边缘，随即进入待机潜伏状态（微幅漂移）。当自机进入触发范围内时，敌机突然以 3.5 倍速度向自机方向全速冲刺。冲刺方向锁定为触发瞬间的自机位置（不做动态修正），飞离屏幕后消失。不成功便成仁的奇袭型行为。',
    params: [
      { name: '入场阶段', value: '前 30 帧', desc: '按 path 路径正常飞行入场，30 帧后到达屏幕上方待机位' },
      { name: '待机漂移', value: '±0.4 px/帧 正弦', desc: '待机期 y 轴微幅正弦漂移，模拟"潜伏警惕"的视觉效果' },
      { name: '触发距离', value: `${BALANCE.enemyAi.ambush.triggerDist} px`, desc: '自机进入此半径即触发突袭，一瞬间切换状态' },
      { name: '冲刺速度', value: `× ${BALANCE.enemyAi.ambush.dashSpeedMul}`, desc: '触发后以 speed × 3.5 全速冲向触发时的自机位置' },
      { name: '预判偏移', value: '+30 px 下方', desc: '冲刺目标在自机位置下方偏移 30px，防止自机小幅度上移轻松躲开' }
    ],
    tips: [
      '伏击触发的响应时间极短——看到敌机动起来已经晚了',
      '预判偏移 +30px 意味着向下闪避反而可能迎面撞上；向上闪避更安全',
      '多架伏击型敌机同时触发时形成"猎杀网"——几架从不同方向冲刺包夹',
      '冲刺方向锁定（不动态修正）：触发瞬间移动即可让敌机冲向错误位置'
    ]
  }
]

/** 角色武器图鉴：由 weapons/playerWeapons.ts 武器库生成，参数与局内实际行为一致 */
export const guideWeapons: GuideWeapon[] = PLAYER_WEAPON_LIST.map((w) => ({
  key: w.key,
  name: w.name,
  en: w.en,
  desc: w.desc,
  params: [
    {
      name: '武器编号',
      value: w.key,
      desc: '武器库注册编号（weapons/playerWeapons.ts），出击配置通过它引用'
    },
    {
      name: '子弹速度',
      value: `${w.bulletSpeed} px/帧`,
      desc: '弹丸飞行速度（逻辑像素/帧，60 帧基准）'
    },
    {
      name: '发射间隔',
      value: `${w.fireInterval} 帧（约 ${(60 / w.fireInterval).toFixed(1)} 发/秒）`,
      desc: '每隔 fireInterval 帧发射一颗弹丸'
    },
    {
      name: '单发伤害',
      value: `${w.bulletDamage}`,
      desc: '每颗弹丸命中造成的伤害'
    }
  ],
  tips: w.tips
}))

/** 技能图鉴（参数与 config/balance.ts 的 skill 段保持一致） */
export const guideSkills: GuideSkill[] = [
  {
    key: 'synaptic',
    name: '突触超频',
    en: 'SYNAPTIC OVERDRIVE',
    desc: '神经加速器过载，令敌方一侧进入极慢时间流：敌人与敌弹近乎凝滞，自机移动、武器射速与弹速均不受影响；激活期间自机无敌，被击中不会受伤，只会在周围闪出彩虹故障残影。能量条机制：随时开启 / 关闭，开启时持续耗能，仅关闭时回复能量，耗尽自动关闭。',
    params: [
      {
        name: '能量上限',
        value: '360 帧（满能量可持续 6 秒）',
        desc: 'BALANCE.skill.maxEnergy'
      },
      {
        name: '回复速度',
        value: '0.6 / 帧（10 秒回满）',
        desc: 'BALANCE.skill.regenRate，仅在技能关闭时回复'
      },
      {
        name: '全局时间缩放',
        value: '× 0.12',
        desc: 'BALANCE.skill.timeScale，敌人 / 敌弹 / 自机弹 / 武器射速均降至 12%'
      }
    ],
    tips: [
      '弹幕最密集时短开一下即可穿过缺口，点按比长开更省能量',
      '激活期间无敌且火力不减：武器射速与弹速不受影响，被击中只会闪出故障残影',
      '能量耗尽会自动关闭，关闭后才会回复，注意留出回能窗口',
      '激活时自机留下彩虹残影，画面叠加冷绿色滤镜与扫描线'
    ]
  },
  {
    key: 'emp',
    name: '电磁脉冲',
    en: 'EMP BURST',
    desc: '瞬时释放的全向电磁冲击波：清除场上所有敌方弹药，并干扰所有敌方单位（含 Boss）的电子设备，使其在一段时间内无法移动与开火。与突触超频共用能量条，能量随时间自动回复。',
    params: [
      {
        name: '能量消耗',
        value: '180（半管能量）',
        desc: 'BALANCE.emp.energyCost，能量不足时无法释放'
      },
      {
        name: '干扰时长',
        value: '240 帧（4 秒）',
        desc: 'BALANCE.emp.stunDuration，期间敌方不能移动与开火'
      }
    ],
    tips: [
      '被弹幕包围时释放，瞬间清出安全区',
      '干扰期间敌方完全瘫痪，是全力输出的最佳窗口',
      '对 Boss 同样生效：可用来打断高压弹幕阶段',
      '能量与突触超频共用：能量随时间自动回复，注意留够半管'
    ]
  },
  {
    key: 'gemini',
    name: '双子星卫',
    en: 'CASTOR & POLLUX',
    desc: '召唤卡斯托耳与波吕克斯共四台金色防御僚机，环绕自机持续飞行，僚机撞毁触碰到的敌方子弹，替自机挡下火力。能量回满后才能释放，激活期间持续耗能，耗尽自动结束。',
    params: [
      {
        name: '持续时间',
        value: '900 帧（15 秒）',
        desc: 'BALANCE.gemini.duration，激活期间每帧耗 1 点能量'
      },
      {
        name: '回复速度',
        value: '0.75 / 帧（约 20 秒回满）',
        desc: 'BALANCE.gemini.regenRate，仅在技能结束时回复，回满才能再次释放'
      },
      {
        name: '环绕参数',
        value: '半径 46 / 角速度 3.2°/帧',
        desc: 'BALANCE.gemini.orbitRadius / angularSpeed，四颗卫星均匀分布'
      }
    ],
    tips: [
      '进入弹幕密集区域前释放，四颗卫星会持续吞噬靠近的敌弹',
      '卫星只挡子弹不挡撞击，仍需与敌机本体保持距离',
      '能量必须回满才能再次释放，结束后留意 20 秒的回能窗口',
      '卫星均匀环绕，移动自机可以让轨道主动迎向弹幕来袭方向'
    ]
  }
]
