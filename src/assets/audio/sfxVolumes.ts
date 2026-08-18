/**
 * 音效文件音量统一配置
 * 每个音效文件的默认音量在这里集中管理，不在武器定义中逐个设置。
 * 调整某个音效大小，只需改这里的数值即可，全局生效。
 *
 * 音量范围 0~1，值越大越响。
 * 最终播放音量 = 此处注册的文件音量 × 通道音量（武器 / 交互，设置面板可调）。
 * 注册时必须标注通道：武器音效 'weapon'，UI 音效 'ui'（缺省默认 'ui'）。
 */

import { registerSfxVolume } from '../../utils/sfx'

// ---- 武器音效（weapon 通道） ----
import rookieFireSfx from './weapon/Rookie.wav'
import auroraFireSfx from './weapon/Aurora.wav'
import vulcanFireSfx from './weapon/Vulcan.wav'
import vulcanReloadSfx from './weapon/Vulcan-reload.wav'
import vulcanEmptySfx from './weapon/Vulcan-empty.wav'
import talosFireSfx from './weapon/Talos.wav'
import talosReloadSfx from './weapon/Talos-reload.wav'
import talosEmptySfx from './weapon/Talos-empty.wav'
import vesperFireSfx from './weapon/Vesper.wav'
import heliosFireSfx from './weapon/HeliosBeam.wav'
import teslaChargeSfx from './weapon/TeslaCharge.wav'
import teslaFireSfx from './weapon/TeslaFire.wav'
import novaFireSfx from './weapon/Nova.wav'
import novaOverheatSfx from './weapon/Nova-overheat.wav'
import mjolnirFireSfx from './weapon/Mjolnir.wav'
import mjolnirReloadSfx from './weapon/Mjolnir-reload.wav'
import mjolnirEmptySfx from './weapon/Mjolnir-empty.wav'
import weaponSwapSfx from './weapon/WeaponSwap.wav'

// ---- 战斗反馈音效（weapon 通道，随武器音量缩放） ----
import enemyHitSfx from './battle/EnemyHit.wav'
import enemyDieSfx from './battle/EnemyDie.wav'
import enemyShotSfx from './battle/EnemyShot.wav'
import bitShotASfx from './battle/BitShotA.wav'
import bitShotBSfx from './battle/BitShotB.wav'
import bossLaserChargeSfx from './battle/BossLaserCharge.wav'
import bossLaserBeamSfx from './battle/BossLaserBeam.wav'
import bossMegaBeamSfx from './battle/BossMegaBeam.wav'
import bossMissileSfx from './battle/BossMissile.wav'
import bossHeavyShotSfx from './battle/BossHeavyShot.wav'
import bossSummonSfx from './battle/BossSummon.wav'
import bossPartExplodeSfx from './battle/BossPartExplode.wav'
import bossPhaseClearSfx from './battle/BossPhaseClear.wav'
import bossFinalExplodeSfx from './battle/BossFinalExplode.wav'

// ---- 技能音效（weapon 通道，战斗表现随武器音量缩放） ----
import synapticActivateSfx from './skill/synaptic-activate.wav'
import empBurstSfx from './skill/emp-burst.wav'
import geminiSummonSfx from './skill/gemini-summon.wav'

// ---- UI 音效（ui 通道，缺省） ----
import bootLinkSfx from './ui/boot-link.wav'
import btnHoverSfx from './ui/btn-hover.wav'
import btnLaunchSfx from './ui/btn-launch.wav'
import deckClickSfx from './ui/deck-click.wav'
import itemPickupWeaponSfx from './ui/item-pickup-weapon.wav'
import itemPickupImplantSfx from './ui/item-pickup-implant.wav'
import itemPickupMaterialSfx from './ui/item-pickup-material.wav'
import itemDropSfx from './ui/item-drop.wav'
import archiveBootSfx from './ui/archive-boot.wav'
import shopBuySfx from './ui/shop-buy.wav'

// 新人手枪（WPN-01）— 射速快（10发/秒），参考火神炮压低
registerSfxVolume(rookieFireSfx, 0.3, 'weapon')

// 奥罗拉（LW-02）三连点射突击步枪 — 节奏密集，音量压低
registerSfxVolume(auroraFireSfx, 0.12, 'weapon')

// 伏尔甘（AH-01）动能步枪 — 连发速率高，音量适中偏小；空仓干火为撞针空击，偶尔触发
registerSfxVolume(vulcanFireSfx, 0.35, 'weapon')
registerSfxVolume(vulcanReloadSfx, 0.4, 'weapon')
registerSfxVolume(vulcanEmptySfx, 0.4, 'weapon')

// 妙尔尼尔（AH-02）栓动 — 单发爆发，略低于常规；空仓干火为撞针空击，偶尔触发
registerSfxVolume(mjolnirFireSfx, 0.6, 'weapon')
registerSfxVolume(mjolnirReloadSfx, 0.6, 'weapon')
registerSfxVolume(mjolnirEmptySfx, 0.45, 'weapon')

// 塔罗斯（AH-03）大口径手枪 — 单发，适中；空仓干火为撞针空击，偶尔触发
registerSfxVolume(talosFireSfx, 0.36, 'weapon')
registerSfxVolume(talosReloadSfx, 0.36, 'weapon')
registerSfxVolume(talosEmptySfx, 0.36, 'weapon')

// 薇丝珀（LW-01）电磁手枪 — 连射偏高频，稍压低
registerSfxVolume(vesperFireSfx, 0.5, 'weapon')

// 赫利俄斯（LW-03）激光 — 持续型，适中
registerSfxVolume(heliosFireSfx, 0.4, 'weapon')

// 特斯拉（LW-04）电弧发射器 — 蓄力为循环背景音，压低；发射为单发爆发，参考栓动音量
registerSfxVolume(teslaChargeSfx, 0.2, 'weapon')
registerSfxVolume(teslaFireSfx, 0.4, 'weapon')

// 诺瓦（LW-05）电磁轻机枪 — 每发都播（30发/秒），参考火神炮压低；过热锁机为手动单发触发，中等
registerSfxVolume(novaFireSfx, 0.06, 'weapon')
registerSfxVolume(novaOverheatSfx, 0.4, 'weapon')

// 切枪 — 高频触发（按键 + 滚轮连切），参考空仓干火压低
registerSfxVolume(weaponSwapSfx, 0.35, 'weapon')

// ---- 战斗反馈注册（weapon 通道） ----

// 敌人受击（hitmarker）— 高射速武器密集触发（逻辑侧已节流至 15 次/秒），压低
registerSfxVolume(enemyHitSfx, 0.3, 'weapon')
// 敌人击毁（击杀确认叮声）— 需穿透枪声，偏亮
registerSfxVolume(enemyDieSfx, 1.5, 'weapon')
// 敌弹齐射 — 每个武器发射器每轮齐射播一次；Boss 战多门武器同拍叠加，压低避免喧宾夺主
registerSfxVolume(enemyShotSfx, 0.1, 'weapon')
// 浮游炮发射（双 biu 变体交替）— 最多 16 台错峰轮转，等效高频触发，压到最低档
registerSfxVolume(bitShotASfx, 0.08, 'weapon')
registerSfxVolume(bitShotBSfx, 0.08, 'weapon')

// ---- 巨构 Boss「绯红天幕」专属（weapon 通道） ----
// 激光预警蓄力 — 需盖过弹雨提示危险，8 帧节流（三束同帧只响一次）
registerSfxVolume(bossLaserChargeSfx, 0.3, 'weapon')
// 横扫/风车激光持续音 — 最多三条循环叠加，单条压低
registerSfxVolume(bossLaserBeamSfx, 0.3, 'weapon')
// 半屏巨幕持续音 — 单条在场的阶段高潮，给足压迫感
registerSfxVolume(bossMegaBeamSfx, 0.42, 'weapon')
// 导弹齐射 — 阶段一 0.75s 一轮高频出现，压低避免盖住 BGM
registerSfxVolume(bossMissileSfx, 0.14, 'weapon')
// 重型齐射（巨弹/方块墙/玫瑰阵/球面共用）— 10 帧节流，中低
registerSfxVolume(bossHeavyShotSfx, 0.2, 'weapon')
// 机库弹射 — 约 30s 一次的召唤事件，需要存在感
registerSfxVolume(bossSummonSfx, 0.3, 'weapon')
// 部位/炮阵击毁与连爆 — 低频大事件，26 帧节流
registerSfxVolume(bossPartExplodeSfx, 0.36, 'weapon')
// 阶段击破清屏冲击 — 全场仅数次的高潮
registerSfxVolume(bossPhaseClearSfx, 0.5, 'weapon')
// 终局巨爆 — Boss 战收束，全程只播一次
registerSfxVolume(bossFinalExplodeSfx, 0.6, 'weapon')

// 开机引导门「建立神经链路」确认音 — 一次性 UI 提示音，适中
registerSfxVolume(bootLinkSfx, 0.5, 'ui')

// 按钮 hover — 高频触发，压低避免吵
registerSfxVolume(btnHoverSfx, 0.25, 'ui')

// 启动页「开始行动」点击 — 部署确认音，一次性，适中
registerSfxVolume(btnLaunchSfx, 0.5, 'ui')

// 标题界面按钮点击确认音 — 频率中等，略低于启动音
registerSfxVolume(deckClickSfx, 0.4, 'ui')

// 背包物品拾取（武器 / 义体 / 材料，技能与义体共用）— 拖拽高频触发，中等偏低
registerSfxVolume(itemPickupWeaponSfx, 0.35, 'ui')
registerSfxVolume(itemPickupImplantSfx, 0.6, 'ui')
registerSfxVolume(itemPickupMaterialSfx, 0.35, 'ui')

// 背包物品放下 — 全种类共用，柔和不抢戏
registerSfxVolume(itemDropSfx, 0.3, 'ui')

// 档案室入场加载音 — 背景型读盘声，不盖过 BGM
registerSfxVolume(archiveBootSfx, 0.45, 'ui')

// 商店购买成功确认音 — 交易正反馈，可稍突出
registerSfxVolume(shopBuySfx, 0.5, 'ui')

// ---- 技能音效注册（weapon 通道） ----

// 突触超频激活 — 一次性关键反馈（时间凝滞启动），需穿透枪声，适中偏突出
registerSfxVolume(synapticActivateSfx, 0.5, 'weapon')

// 电磁脉冲 — 清场爆发技，闪电爆鸣需穿透枪声，适中偏突出（可连发但有人工间隔）
registerSfxVolume(empBurstSfx, 0.5, 'weapon')

// 双子星卫召唤 — 守护向正反馈，明亮但不抢戏，适中
registerSfxVolume(geminiSummonSfx, 0.45, 'weapon')
