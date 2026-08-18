俯视角纵版弹幕射击游戏，纯原生 Canvas 2D 实现，零第三方依赖（运行时仅依赖 Vue 3 作为 UI 外壳）。

本仓库是独立项目，可独立启动调试，也可打包后作为静态资源集成到 main-site（Nuxt）中运行。

## 快速开始

```bash
# 安装依赖（使用 pnpm）
pnpm install

# 独立开发调试（HMR，默认 http://localhost:5173/stg/）
pnpm dev

# 类型检查 + 生产构建（产物输出到 dist/，base 为 /stg/）
pnpm build

# 仅构建不跑类型检查（更快）
pnpm build:dev

# 本地预览构建产物
pnpm preview
```

## 目录结构

```
soyorin-shmup/
├── index.html            # 入口 HTML，全屏挂载点 #app
├── vite.config.ts        # Vite 配置（base 默认 /stg/，可用 VITE_BASE 覆盖）
├── package.json          # pnpm 包管理
├── public/               # 静态素材目录（图片放这里）
└── src/
    ├── main.ts           # Vue 入口：createApp(StgGame).mount('#app')
    ├── env.d.ts          # 类型声明
    ├── components/
    │   └── StgGame.vue   # Canvas 容器、游戏生命周期、HUD/菜单 DOM 覆盖层（SCSS）
    ├── engine/           # 引擎核心（纯 TS，与 Vue 完全解耦）
    │   ├── game.ts       # 主循环、固定时间步长（60 步/秒）、场景状态机、关卡编排
    │   ├── input.ts      # 键鼠输入抽象 + 键位自定义（localStorage 持久化）
    │   ├── bullet.ts     # 子弹/粒子对象池 + 弹幕发射器（解释 PatternConfig）
    │   ├── player.ts     # 自机：移动/朝鼠标旋转射击/判定点/无敌帧/残机/BOMB
    │   ├── enemy.ts      # 敌机：路径移动 + 携带弹幕 + 追踪环绕（Circle Strafing）
    │   ├── boss.ts       # Boss 状态机：多阶段符卡切换（击破/超时）
    │   ├── collision.ts  # 圆形碰撞（距离平方比较）
    │   ├── field.ts      # 战场尺寸（动态逻辑分辨率 = 窗口尺寸，含设计空间缩放比）
    │   └── renderer.ts   # 渲染层：预渲染辉光贴图、星空视差背景、特效
    ├── config/           # ===== 策划配置区：改弹幕/关卡/数值只动这里 =====
    │   ├── patterns.ts   # 弹幕模式库（aimed/spread/ring/random）
    │   ├── stages.ts     # 关卡时间轴：道中波次、编队、出场帧
    │   ├── spells.ts     # Boss 各阶段符卡（弹幕组合 + 血量 + 限时）
    │   ├── loadout.ts    # 出击配置：可选角色（颜色占位）与武器列表
    │   └── balance.ts    # 数值平衡：自机速度/火力/武器/残机/BOMB/池容量/调试开关
    ├── assets/
    │   └── sprites.ts    # 素材管理器：key → 图片路径映射，加载失败回退占位绘制
    └── types.ts          # 全局类型定义
```

## 如何新增一种弹幕

1. 在 `src/config/patterns.ts` 中加一个导出常量（字段含义见 `src/types.ts` 中
   `PatternConfig` 的注释）：

```ts
export const myPattern: PatternConfig = {
  type: 'ring', // aimed 朝自机 / spread 扇形 / ring 环弹 / random 随机
  bulletCount: 24,
  speed: 2.4,
  angularVelocity: 8, // 仅 ring：每次发射起始角旋转 8°，形成旋转弹幕
  interval: 90, // 发射间隔（帧，60 帧 = 1 秒）
  bulletStyle: 'orb-blue' // 可用样式见 types.ts BulletStyleKey
}
```

2. 在 `src/config/stages.ts`（杂鱼）或 `src/config/spells.ts`（Boss）中引用它即可。
   不需要修改 `src/engine/` 里的任何代码。

## 如何新增一张符卡（Boss 阶段）

在 `src/config/spells.ts` 的 `boss1.spells` 数组中追加一段配置即可生效：

```ts
{
  name: '新符「示例」',
  hp: 1000,          // 本阶段血量
  timeLimit: 45,     // 限时（秒），超时进入下一阶段且无奖励分
  bonus: 150000,     // 可选：击破奖励分
  patterns: [myPattern, fairyAimed3] // 多个弹幕模式同时进行，可自由叠加
}
```

已实际验证：追加配置后 Boss 会自动增加一个阶段，阶段切换时清屏并显示符卡名横幅。

## 如何调整关卡流程

编辑 `src/config/stages.ts` 的 `stage1Waves`：

- `at`：本波在第几帧触发（60 帧 = 1 秒）
- `spawns`：本波的敌机编队列表，`count` 架敌机以 `gap` 帧间隔依次出场
- `path`：`straight` 直线 / `sine` 正弦 / `dive-left|right` 斜冲 / `hover` 悬停 /
  `zigzag` 锯齿 / `loop` 回旋 / `rush` 加速俯冲 / `sweep-left|right` 横扫
- Boss 在全部波次生成完毕且场上杂鱼清空后自动登场

### 追踪型敌机（Circle Strafing / 轨道机动）

编队配置加 `orbit` 字段即可让敌机更有侵略性：

```ts
{
  path: 'sine', // 先按 path 入场
  // ...
  orbit: {
    radius: 120, // 与自机保持的环绕半径（设计空间像素，可调）
    angularSpeed: 1.5, // 环绕角速度（度/帧）
    speedMul: 2.2, // 追踪速度倍率
    engageAfter: 80 // 出场多少帧后开始追踪
  }
}
```

行为：先按 `path` 入场，`engageAfter` 帧后切换为追踪自机，直线逼近到
`radius` 距离后保持该半径环绕扫射；不会离场、不会飞出屏幕，只能被击毁。
默认值见 `src/config/balance.ts` 的 `enemyAi`，`orbit` 各字段可单独覆盖。
注意：带 `orbit` 的敌机必须全部击毁才会进入 Boss 战。

## 如何替换美术素材

1. 把图片放入 `public/` 目录（如 `public/player.png`）
2. 在 `src/assets/sprites.ts` 的 `SPRITE_PATHS` 中填上路径：

```ts
const SPRITE_PATHS = {
  player: '/stg/player.png',   // 集成到 main-site 时（base 为 /stg/）
  enemy: '/stg/enemy.png',
  boss: '/stg/boss.png',
  background: '/stg/background.png'
}
```

> **路径前缀说明**：`vite.config.ts` 中 `base` 默认为 `/stg/`（用于集成到
> main-site）。Vite 会自动给所有资源路径加上该前缀，所以素材路径写
> `/stg/player.png` 在独立开发和集成部署下都能正确加载。
> 若要独立部署到根路径，设环境变量 `VITE_BASE=/` 后素材路径改为 `/player.png`。

未配置（空字符串）或加载失败时自动回退到代码绘制的占位图形，
不需要修改任何游戏代码。

## 集成到 main-site（上线）

本游戏构建产物是纯静态文件，集成方式是把 `dist/` 拷贝到 main-site 的
`public/stg/` 目录，Nuxt 会原样输出，上线后通过 `https://你的域名/stg/` 访问，
不经过 Nuxt 渲染、零运行时成本。

main-site 侧已配置好前置构建脚本（见 main-site `package.json` 的 `build:stg`）：

```bash
# 在 main-site 目录执行，会自动构建本游戏并同步产物
yarn build:stg

# 完整上线构建（先构建游戏，再构建主站）
yarn build
```

同步逻辑在 `main-site/scripts/sync-stg.mjs`，使用 Node 原生 `fs.cp` 跨平台拷贝。

### 独立部署

若要把游戏部署到独立域名（根路径），修改 base 后构建：

```bash
# 方式一：环境变量（推荐，不改代码）
VITE_BASE=/ pnpm build

# 方式二：直接改 vite.config.ts 的 base 为 '/'
```

构建出的 `dist/` 可直接扔到任何静态服务器。

## 性能设计

- 敌弹 / 自机弹 / 粒子全部对象池复用（容量见 `balance.ts pools`），
  运行时不创建新对象，同屏 500+ 子弹稳定 60fps
- 逻辑固定 60 步/秒，渲染用 requestAnimationFrame，帧率波动不影响弹幕轨迹
- 渲染插值：各实体每步快照上一步位置（`px/py/pAngle`），渲染时按
  `alpha = acc / STEP` 在两步之间插值（`game.ts loop` 计算，各实体
  `update/integrate` 内快照，`renderer.ts` 插值绘制），高刷屏（>60Hz）
  下画面接近原生刷新率的顺滑度；闪现/重生等瞬移操作会同步重置快照
  保持瞬间到位。开关见 `balance.ts debug.interpolation`
- 渲染帧率上限（`game.ts frameLimit`）：标题界面可设，逻辑仍固定 60 步/秒
  照跑，只是跳过部分渲染回调；上限高于屏幕刷新率时自动等于无上限。
  限制到 30/60 时配合渲染插值，运动画面依然连贯不卡顿
- 子弹辉光在初始化时预渲染为贴图，运行时只用 drawImage（避免 shadowBlur）
- 碰撞为圆形判定 + 距离平方比较，出屏立即回收
- 动态逻辑分辨率：战场 = 窗口尺寸（`engine/field.ts`），屏幕越大战斗场地越大；
  config 中的坐标基于 480×640 设计空间，横向以屏幕中心为基准映射
  （`field.mapX`：设计空间中央 x=240 永远对齐屏幕正中，偏移量按纵向比例
  `sy` 等比缩放），宽屏下敌人始终集中在中间区域，不会散到两侧；
  画布位图按 devicePixelRatio 缩放保证清晰，窗口 resize 时自动重建战场与星空

## 出击配置（角色与武器）

点击标题界面「开始游戏」后进入出击配置页，选择角色与武器后出击。
新增角色 / 武器只需编辑 `src/config/loadout.ts`：

- 角色：暂无立绘，用机身颜色区分（`color` 主色 + `accent` 描边色），
  渲染层的占位三角机身会使用所选颜色
- 武器：
  - `rifle` 突击步枪：默认武器，双发平行实弹（数值沿用
    `balance.ts player.fireInterval/bullet*`）
  - `laser` 激光枪：持续光束，命中射程上最近的第一个目标后停止
    （**不穿透**），按帧分摊 DPS（数值见 `balance.ts weapons.laser`：
    `dps` 每秒伤害 / `range` 射程 / `hitWidth` 判定宽度）
  - `homing` 跟踪弹：齐射导弹出膛即各自锁定最近的敌方（敌机优先，
    无敌机时锁定 Boss），按限速转向追踪；**只锁定一次**——目标死亡后
    该导弹变回普通直线弹，不会重新锁定。数值见 `balance.ts
    weapons.homing`（`turnRate` 转向角速度 / `spreadAngle` 齐射散开角等）

激光结算在 `engine/game.ts updateLaser`（射线 vs 圆求最近交点），
光束渲染在 `engine/renderer.ts drawLaser`；跟踪目标由
`engine/game.ts acquireHomingTarget` 挑选，转向逻辑在
`engine/bullet.ts BulletPool.integrate`（敌弹不设置 `target`，行为不变）。

## 操作方式

- 移动：WASD（默认，可在标题/暂停界面的「键位设置」中修改）
- 射击：按住鼠标左键，自机始终朝鼠标方向旋转并开火
- 低速 + 显示判定点：Z（默认）
- 闪现：移动中按 Left Shift（默认），朝移动方向瞬移一小段距离；
  3 格体力，每 3 秒回复 1 格（数值见 `balance.ts player.dash*`）
- BOMB：X（默认）· 暂停：Esc / P
- 键位修改即时生效并持久化到 localStorage（key 见 `balance.ts storageKeys.keybinds`），
  若新按键与其他动作冲突会自动交换两者键位
- 帧率：标题界面「帧率设置」可选 30 / 60 / 120 / 144 / 跟随屏幕（无上限），
  即时生效并持久化（key 见 `balance.ts storageKeys.frameLimit`）

## 调试

- FPS 显示：`src/config/balance.ts` 中 `debug.showFps` 开关
- 最高分持久化：localStorage（key 见 `balance.ts storageKeys`）
