/**
 * 角色武器库（数据驱动）
 * 每把武器一个定义，出击配置（loadout.ts）通过编号引用。
 * 发射行为由 engine/player.ts 统一解释：朝瞄准方向（鼠标）一次发射一颗弹丸。
 * 新增武器：在 PLAYER_WEAPONS 里加一条定义即可，无需改引擎代码。
 *
 * 图鉴（guideData.ts）与预览（useGuidePreview.ts）同样从这里读取，
 * 保证展示参数与局内实际行为一致。
 */
import type { BulletStyleKey, WeaponKey } from '../types'
import rookieFireSfx from '../assets/audio/weapon/Rookie.wav'
import auroraFireSfx from '../assets/audio/weapon/Aurora.wav'
import vulcanFireSfx from '../assets/audio/weapon/Vulcan.wav'
import vulcanReloadSfx from '../assets/audio/weapon/Vulcan-reload.wav'
import vulcanEmptySfx from '../assets/audio/weapon/Vulcan-empty.wav'
import talosFireSfx from '../assets/audio/weapon/Talos.wav'
import talosReloadSfx from '../assets/audio/weapon/Talos-reload.wav'
import talosEmptySfx from '../assets/audio/weapon/Talos-empty.wav'
import vesperFireSfx from '../assets/audio/weapon/Vesper.wav'
import heliosFireSfx from '../assets/audio/weapon/HeliosBeam.wav'
import teslaChargeSfx from '../assets/audio/weapon/TeslaCharge.wav'
import teslaFireSfx from '../assets/audio/weapon/TeslaFire.wav'
import novaFireSfx from '../assets/audio/weapon/Nova.wav'
import novaOverheatSfx from '../assets/audio/weapon/Nova-overheat.wav'
import mjolnirFireSfx from '../assets/audio/weapon/Mjolnir.wav'
import mjolnirReloadSfx from '../assets/audio/weapon/Mjolnir-reload.wav'
import mjolnirEmptySfx from '../assets/audio/weapon/Mjolnir-empty.wav'

/** 角色武器定义 */
export interface PlayerWeaponConfig {
  /** 武器编号（如 WPN-01），出击配置通过它引用 */
  key: WeaponKey
  /** 武器名 */
  name: string
  /** 英文代号 */
  en: string
  /** 武器描述（出击配置与图鉴展示） */
  desc: string
  /** 子弹速度（逻辑像素/帧，60 帧基准） */
  bulletSpeed: number
  /** 发射间隔（帧），如 6 表示每秒 10 发 */
  fireInterval: number
  /** 单发伤害 */
  bulletDamage: number
  /** 子弹半径（逻辑像素） */
  bulletRadius: number
  /** 子弹样式（渲染层根据 key 决定颜色与形状） */
  bulletStyle: BulletStyleKey
  /** 演示弹色（图鉴预览用，与 renderer 的配色一致） */
  bulletColor: string
  /**
   * 激光武器：开火时不发射弹丸，改为瞬时射线——
   * 无限射程、命中路径上第一个敌人即止（不可穿透），
   * 命中逻辑见 engine/game.ts fireLaser()
   */
  laser?: boolean
  /** 使用技巧（图鉴展示） */
  tips: string[]
  // ---- 动能武器（弹匣 + 散射 + 右键瞄准）可选字段 ----
  /** 腰射散射角（度，单边随机） */
  spreadDeg?: number
  /** 右键瞄准时的散射角（度，单边） */
  aimSpreadDeg?: number
  /** 点射连发数：设置后每次扳机快速连射 N 发（连发间隔 burstGap），随后进入 fireInterval 冷却 */
  burst?: number
  /** 连发内每发间隔（帧），默认 3 */
  burstGap?: number
  /** 每次开火弹丸数下限（与 projectilesMax 配合，每次开火在区间内随机取整；缺省 1） */
  projectilesMin?: number
  /** 每次开火弹丸数上限 */
  projectilesMax?: number
  /** 多弹丸扇形间隔（度，相邻弹丸夹角；单发时恒为正中无偏移），默认 5 */
  pelletFanDeg?: number
  /** 弹匣容量；设置后启用弹匣系统（打空自动装填） */
  magazine?: number
  /** 装填耗时（帧） */
  reloadFrames?: number
  /** 瞄准时移速倍率（引擎兜底不低于低速模式速度） */
  aimSpeedMul?: number
  /** 开火音效（Vite 导入的音频 URL；点射武器每次扳机播放一次，见 utils/sfx.ts） */
  fireSound?: string
  /** 激光循环音效的循环起点（秒）：整段先播一遍，之后只循环该位置到结尾 */
  fireLoopFrom?: number
  /** 激光循环音效的循环终点（秒）：与 fireLoopFrom 配合裁掉素材尾部淡出段，避免循环回绕断档 */
  fireLoopTo?: number
  /**
   * 蓄力武器：按住扳机累积充能，松手即发射一道贯穿电弧（帧，60 帧基准）。
   * 此值为蓄满所需时间；伤害与电弧粗细/密度按充能比例 0~1 递增，
   * 蓄满为完整伤害。与 laser / burst 互斥
   */
  chargeFrames?: number
  /** 最小充能比例（0~1，缺省 0.15）：低于该比例松手不发射，防止反复点击 */
  chargeMinRatio?: number
  /** 蓄力循环音效（蓄力期间持续循环播放，松手/切枪即停） */
  chargeSound?: string
  /** 装填音效（弹匣式武器开始装填时播放一次） */
  reloadSound?: string
  /** 装填音效延迟（帧）：开始装填后延迟若干帧再播放，避免与开火音效叠在一起 */
  reloadSoundDelay?: number
  /** 空弹匣干火音效（弹匣打空/装填中按下扳机时播放一次） */
  emptySound?: string
  /** 过热锁机音效（热量打满进入锁机的瞬间播放一次） */
  overheatSound?: string
  // ---- 过热武器（射速极高、持续射击过热锁机）可选字段 ----
  /** 每发弹丸产生的热量：设置后启用过热系统（电源直供，与 magazine 互斥） */
  heatPerShot?: number
  /** 热量上限（默认 100）：打满即过热锁机 */
  heatMax?: number
  /** 停火时每帧散热量（默认 1），未过热时缓慢降温 */
  heatDissipate?: number
  /** 过热锁机时长（帧，默认 120）：期间无法开火，结束后热量清零 */
  overheatFrames?: number
}

/** WPN-01 新人手枪：朝瞄准方向一次发射一颗弹丸 */
export const WPN_01: PlayerWeaponConfig = {
  key: 'WPN-01',
  name: '新人手枪',
  en: 'ROOKIE PISTOL',
  desc: '制式配发的入门级手枪，朝瞄准方向一次发射一颗弹丸。射速稳定、弹道笔直，是所有自机武装的起点。',
  bulletSpeed: 80,
  fireInterval: 6,
  bulletDamage: 22,
  bulletRadius: 3,
  bulletStyle: 'needle-cyan',
  bulletColor: '#33ddff',
  tips: [
    '弹道朝鼠标方向：把准星压在目标身上即可稳定输出',
    '单发伤害集中，适合点名高血量精英与 Boss',
    '射速固定，站桩输出时收益最高，配合低速模式精调走位'
  ],
  fireSound: rookieFireSfx
}

/** AH-01 伏尔甘：磐舟重工制式动能步枪（散射 + 弹匣 + 右键瞄准） */
export const AH_01: PlayerWeaponConfig = {
  key: 'AH-01',
  name: '伏尔甘',
  en: 'VULCAN',
  desc: '磐舟重工制式动能步枪，朝瞄准方向全自动发射高速钨芯弹丸。腰射散布较大，右键瞄准可显著收束弹道，但移动会变慢、冲刺会被打断。',
  bulletSpeed: 80,
  fireInterval: 8,
  bulletDamage: 42,
  bulletRadius: 3,
  bulletStyle: 'needle-gold',
  bulletColor: '#ffc233',
  tips: [
    '弹速极快，中远距离也能即瞄即中',
    '腰射散布大：近距离直接泼，远距离按住右键瞄准收束弹道',
    '瞄准时移速降低且无法冲刺，注意提前松开右键再走位',
    '25 发弹匣打空自动装填，留意装填空窗期'
  ],
  spreadDeg: 3,
  aimSpreadDeg: 0.5,
  magazine: 30,
  reloadFrames: 45,
  aimSpeedMul: 0.55,
  fireSound: vulcanFireSfx,
  reloadSound: vulcanReloadSfx,
  emptySound: vulcanEmptySfx
}

/** AH-02 妙尔尼尔：磐舟重工反器材动能步枪（单发栓动 + 右键瞄准） */
export const AH_02: PlayerWeaponConfig = {
  key: 'AH-02',
  name: '妙尔尼尔',
  en: 'MJOLNIR',
  desc: '磐舟重工反器材动能步枪，单发装填的栓动重火力狙击枪。钨芯重弹以极高初速出膛，一发足以撕碎绝大多数目标；代价是每开一枪都要重新拉栓装填。',
  bulletSpeed: 240,
  fireInterval: 20,
  bulletDamage: 430,
  bulletRadius: 4,
  bulletStyle: 'needle-gold',
  bulletColor: '#ffc233',
  tips: [
    '弹速极快、单发伤害极高：瞄准高血量精英与 Boss 的弱点一击制胜',
    '弹匣只有 1 发，每开一枪自动拉栓装填，射速取决于装填节奏',
    '右键瞄准可将散布收束到接近零，远程狙击务必按住右键',
    '装填期间无法开火，走位回避时提前规划开火窗口'
  ],
  spreadDeg: 4,
  aimSpreadDeg: 0,
  magazine: 1,
  reloadFrames: 100,
  aimSpeedMul: 0.5,
  fireSound: mjolnirFireSfx,
  reloadSound: mjolnirReloadSfx,
  reloadSoundDelay: 20,
  emptySound: mjolnirEmptySfx
}

/** AH-03 塔罗斯：磐舟重工大口径动能手枪（重火力 + 弹匣 + 右键瞄准） */
export const AH_03: PlayerWeaponConfig = {
  key: 'AH-03',
  name: '塔罗斯',
  en: 'TALOS',
  desc: '磐舟重工大口径动能手枪，开火如一记抡圆的重锤。弹速极快、单发威力惊人，8 发弹匣打空自动装填，是近距离破甲的可靠副武器。',
  bulletSpeed: 150,
  fireInterval: 30,
  bulletDamage: 150,
  bulletRadius: 3,
  bulletStyle: 'needle-gold',
  bulletColor: '#ffc233',
  tips: [
    '弹速极快，指哪打哪，中近距离无需预判弹道',
    '单发伤害高但射速普通：稳住节奏逐发点名，别浪费弹药',
    '8 发弹匣打空自动装填，留意装填空窗期',
    '右键瞄准收束弹道，弥补腰射散布，对付远处目标更稳'
  ],
  spreadDeg: 2,
  aimSpreadDeg: 0.5,
  magazine: 8,
  reloadFrames: 60,
  aimSpeedMul: 0.6,
  fireSound: talosFireSfx,
  reloadSound: talosReloadSfx,
  emptySound: talosEmptySfx
}

/** LW-01 薇丝珀：流明光电电磁手枪（1~3 发随机弹丸 + 无限弹药，无散布、无瞄准） */
export const LW_01: PlayerWeaponConfig = {
  key: 'LW-01',
  name: '薇丝珀',
  en: 'VESPER',
  desc: '流明光电电磁手枪，线圈充能输出并不稳定——每次扳机随机射出 1 至 3 发橙色聚能弹芯，运气好时火力堪比步枪。由机载电源直接供能，无需装填，开火时只有线圈充能的低鸣。',
  bulletSpeed: 50,
  fireInterval: 15,
  bulletDamage: 30,
  bulletRadius: 3,
  bulletStyle: 'orb-orange',
  bulletColor: '#ff9a2e',
  tips: [
    '弹丸数量随机：每次开火射出 1~3 发弹芯，多发时呈扇形展开',
    '弹速极快：指哪打哪，任何距离都无需预判',
    '电源直供、无弹匣限制，火力永不中断',
    '技术武器无需瞄准：移动不受限，边走位边输出'
  ],
  projectilesMin: 1,
  projectilesMax: 3,
  pelletFanDeg: 8,
  fireSound: vesperFireSfx
}

/** LW-02 奥罗拉：流明光电电磁突击步枪（三连点射 + 无限弹药，无散布、无瞄准） */
export const LW_02: PlayerWeaponConfig = {
  key: 'LW-02',
  name: '奥罗拉',
  en: 'AURORA',
  desc: '流明光电电磁突击步枪，每次扳机以三连点射发射橙色聚能弹芯，弹着点与准星严丝合缝。由机载电源直接供能、无需装填。',
  bulletSpeed: 34,
  fireInterval: 14,
  burst: 3,
  burstGap: 3,
  bulletDamage: 30,
  bulletRadius: 3,
  bulletStyle: 'orb-orange',
  bulletColor: '#ff9a2e',
  fireSound: auroraFireSfx,
  tips: [
    '三连点射：每次扳机快速射出 3 发聚能弹芯，把握点射节奏命中更稳',
    '弹速极快、弹道笔直：指哪打哪，中远距离也能即瞄即中',
    '电源直供、无弹匣限制，可以全程保持火力压制',
    '技术武器无需瞄准：移动不受限，边走位边输出'
  ]
}

/** LW-03 赫利俄斯：流明光电重型磁轨枪（激光持续照射，无弹匣、无右键瞄准） */
export const LW_03: PlayerWeaponConfig = {
  key: 'LW-03',
  name: '赫利俄斯',
  en: 'HELIOS',
  desc: '流明光电重型磁轨枪，堆叠式加速线圈组的集大成之作。光束由机载电源直接供能，可不间断持续照射；光速之下，众生平等。',
  bulletSpeed: 60,
  fireInterval: 20,
  bulletDamage: 80,
  bulletRadius: 4,
  bulletStyle: 'needle-gold',
  bulletColor: '#ffc233',
  laser: true,
  fireSound: heliosFireSfx,
  // 循环区间取素材内双声道零交叉点对（0.0218s / 2.4474s），裁掉尾部淡出段，保证回绕无缝
  fireLoopFrom: 0.0218,
  fireLoopTo: 2.4474,
  tips: [
    '激光瞬时命中、无限射程：指哪打哪，无需预判弹道',
    '光束无法穿透敌人，只命中路径上的第一个目标：小心被小怪挡枪',
    '单发伤害极高：瞄准高血量精英与 Boss 的弱点持续照射',
    '电源直供、无弹匣限制，火力永不中断'
  ]
}

/** LW-04 特斯拉：流明光电电弧发射器（长按蓄力 3 秒发射一颗弹丸，无散布、无瞄准、无弹匣） */
export const LW_04: PlayerWeaponConfig = {
  key: 'LW-04',
  name: '特斯拉',
  en: 'TESLA',
  desc: '流明光电电弧发射器。扣住扳机持续充能，松手即放出一道贯穿战场的无限射程电弧——蓄力越久电弧越粗越密、伤害越高，蓄满 3 秒释放完整威力。',
  bulletSpeed: 70,
  fireInterval: 30,
  bulletDamage: 600,
  bulletRadius: 5,
  bulletStyle: 'orb-blue',
  bulletColor: '#60a5fa',
  chargeFrames: 180,
  chargeMinRatio: 0.15,
  chargeSound: teslaChargeSfx,
  fireSound: teslaFireSfx,
  tips: [
    '按住左键蓄力、松手发射：蓄力越久电弧越粗越密，伤害越高',
    '蓄满 3 秒释放完整伤害；轻点一下不会发射，别急着松手',
    '电弧无限射程且穿透路径上所有目标：一列敌人，一击全穿',
    '电源直供、无弹匣限制，蓄力期间可自由移动走位'
  ]
}

/** LW-05 诺瓦：流明光电电磁轻机枪（超高射速 + 持续射击过热锁机，无散布、无瞄准、无弹匣） */
export const LW_05: PlayerWeaponConfig = {
  key: 'LW-05',
  name: '诺瓦',
  en: 'NOVA',
  desc: '流明光电电磁轻机枪，多级线圈组以极限转速倾泻聚能弹芯，是班组火力压制的答案。持续射击会使线圈组热量飙升——打满热量即过热锁机，必须等待完全冷却才能再度开火。',
  bulletSpeed: 45,
  fireInterval: 2,
  bulletDamage: 11,
  bulletRadius: 3,
  bulletStyle: 'orb-orange',
  bulletColor: '#ff9a2e',
  heatPerShot: 0.6,
  heatMax: 100,
  heatDissipate: 1.2,
  overheatFrames: 120,
  fireSound: novaFireSfx,
  emptySound: novaOverheatSfx,
  overheatSound: novaOverheatSfx,
  tips: [
    '射速极高：每秒 30 发聚能弹芯，近中距离持续压制成片目标',
    '可持续扫射约 5.5 秒：打满 100 热量即过热锁机 2 秒，注意把握输出节奏',
    '过热锁机期间无法开火；未过热时停火散热很快，短促点射可永续输出',
    '电源直供、无弹匣限制；技术武器无需瞄准，边走位边输出'
  ]
}

/** 角色武器注册表：编号 → 武器定义 */
export const PLAYER_WEAPONS: Record<WeaponKey, PlayerWeaponConfig> = {
  'WPN-01': WPN_01,
  'AH-01': AH_01,
  'AH-02': AH_02,
  'AH-03': AH_03,
  'LW-01': LW_01,
  'LW-02': LW_02,
  'LW-03': LW_03,
  'LW-04': LW_04,
  'LW-05': LW_05
}

/** 角色武器列表（出击配置、图鉴等按数组遍历用） */
export const PLAYER_WEAPON_LIST: PlayerWeaponConfig[] = Object.values(PLAYER_WEAPONS)
