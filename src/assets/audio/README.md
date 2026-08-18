# 音频资源署名说明

本目录下的音频分为三类：
- **weapon/**：全部由本地 AI 模型生成。
  - `WeaponSwap.wav`：切枪音。提示词 `weapon switch draw sound, quick gun handling foley, mechanical slide rack and cloth rustle, short crisp, game sound effect`，seed 1，时长 1s，无后处理。
- **battle/**：战斗反馈音效（敌人受击 / 击毁 / 敌弹发射），本地 AI 模型生成。
  - `EnemyShot.wav`：敌弹齐射音（打击乐向，踩节拍用）。提示词 `very short electronic drum hit, punchy laser snare, sharp transient attack, instant decay, percussive sci-fi zap, single hit, dry, no reverb, rhythm game percussion sfx`，seed 7，时长 2s，无后处理。每个武器发射器每次齐射只播一次。
  - `BitShotA.wav` / `BitShotB.wav`：浮游炮发射音（复古街机 biu 声，两个变体交替播放）。提示词 `very short retro arcade biu laser sound, cute descending pitch pew, chiptune square wave zap, single shot, playful, dry, no reverb, classic shmup game sfx`，seed 11 / 13，时长 2s，无后处理。带短冷却节流，同帧多台齐射只响一次。
  - 巨构 Boss「绯红天幕」（FIN-01）战斗音效组，2026-08 生成（Stable Audio 3 Medium，audio.cpp CUDA）。每种出 seed 11/22/33 三变体人工挑选，均无后处理：
    - `BossLaserCharge.wav`：激光 telegraph 预警蓄力音。提示词 `energy weapon charge up, rising electronic hum, laser telegraph warning, sci-fi game sound effect`，seed 22，时长 2s。8 帧节流（三束同帧只响一次）。
    - `BossLaserBeam.wav`：横扫/风车激光持续循环音。提示词 `continuous laser beam, buzzing electronic energy sustained, sci-fi weapon, seamless loopable, game sound effect`，seed 11，时长 3s。startSfxLoop 循环，照射+残影结束停播。
    - `BossMegaBeam.wav`：半屏巨幕光束持续循环音。提示词 `massive deep laser cannon beam, low rumbling sustained energy, heavy sci-fi, game sound effect`，seed 11，时长 3s。
    - `BossMissile.wav`：追踪导弹蜂群齐射音。提示词 `missile launch whoosh, rocket propel burst, short punchy, game sound effect`，seed 22，时长 1s。
    - `BossHeavyShot.wav`：重型齐射音（巨型弹/方块墙/玫瑰阵/球面弹幕共用）。提示词 `heavy plasma cannon shot, deep energy blast, punchy, game sound effect`，seed 33，时长 1s。10 帧节流。
    - `BossSummon.wav`：机库弹射护卫机编队音。提示词 `mechanical hangar door opening, metallic eject launch, sci-fi deployment, game sound effect`，seed 11，时长 2s。
    - `BossPartExplode.wav`：副炮/炮阵击毁 + 转阶段/死亡连爆音。提示词 `large mechanical explosion, metal debris shatter, heavy impact, game sound effect`，seed 22，时长 2s。26 帧节流。
    - `BossPhaseClear.wav`：阶段击破清屏冲击波音。提示词 `massive shockwave blast, energy burst with shimmering tail, deep boom, game sound effect`，seed 22，时长 3s。
    - `BossFinalExplode.wav`：死亡演出终局巨爆音。提示词 `colossal final explosion, white-hot core detonation, long rumbling decay, epic, game sound effect`，seed 11，时长 4s。
- **ui/**：由本地 AI 模型生成。
  - `btn-launch.wav`：启动页「开始行动」按钮点击音（激光触发感）。提示词 `short sci-fi laser blaster pulse, bright energy burst, instant sharp attack, quick sizzling decay, crisp, game sound effect`，seed 33，时长 1s，无后处理。
- **skill/**：技能音效，本地 AI 模型生成（Stable Audio 3 Medium）：
  - `synaptic-activate.wav`：突触超频激活音。提示词 `cyberpunk time slow activation, sharp digital glitch burst followed by deep sub bass drop, neural implant power surge, futuristic, game sound effect`，seed 2，时长 2s，无后处理。
  - `emp-burst.wav`：电磁脉冲释放音（闪电爆发向）。提示词 `massive lightning bolt strike burst, violent electric thunder crack explosion, sizzling high voltage arcs, shockwave of electricity, game sound effect`，seed 2，时长 2s，无后处理。
  - `gemini-summon.wav`：双子星卫召唤音。提示词 `golden guardian drones summon, shimmering celestial chimes with mechanical materialization, warm energy shield activation, bright and protective, game sound effect`，seed 3，时长 2s，无后处理。

