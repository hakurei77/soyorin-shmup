# Launcher 启动页

游戏启动页由两个组件组成：

- `GameLauncher.vue` — 页面主体：HUD 信息栏、主标题、启动按钮
- `LauncherBackdrop.vue` — 纯展示背景层：网格 / 辉光 / 粒子 / 空战动画 / 巨型装饰文字 / 扫描线

本文档列出启动页**所有可编辑文字**及其修改位置。

---

## 一、通过 props 修改（推荐，无需改组件源码）

### `GameLauncher.vue` 的 props

在父组件中这样使用即可覆盖：

```vue
<GameLauncher
  title="喵奈"
  title-accent="Project"
  subtitle="// 神 经 链 路 已 就 绪 — AWAITING OPERATOR //"
  version="0.0.1"
  button-text="开始行动"
  @launch="onLaunch"
/>
```

| Prop         | 默认值                                            | 显示位置             | 源码位置                        |
| ------------ | ------------------------------------------------- | -------------------- | ------------------------------- |
| `title`      | `喵奈`                                            | 主标题普通部分       | `GameLauncher.vue` 第 27 行     |
| `titleAccent`| `Project`                                         | 主标题高亮（紫色）部分 | `GameLauncher.vue` 第 28 行   |
| `subtitle`   | `// 神 经 链 路 已 就 绪 — AWAITING OPERATOR //`  | 主标题下方副标题     | `GameLauncher.vue` 第 29 行     |
| `version`    | `0.0.1`                                           | 右下角版本号 `v0.0.1` | `GameLauncher.vue` 第 30 行    |
| `buttonText` | `开始行动`                                        | 启动按钮文字         | `GameLauncher.vue` 第 31 行     |

### `LauncherBackdrop.vue` 的 props

在 `GameLauncher.vue` 模板中给 `<LauncherBackdrop />` 传参（当前未传，用的默认值）：

```vue
<LauncherBackdrop mega-top="MIAONAI" mega-bottom="PRJ" />
```

| Prop         | 默认值    | 显示位置             | 源码位置                          |
| ------------ | --------- | -------------------- | --------------------------------- |
| `megaTop`    | `MIAONAI` | 背景左上巨型镂空文字 | `LauncherBackdrop.vue` 第 16 行   |
| `megaBottom` | `PRJ`     | 背景右下巨型镂空文字 | `LauncherBackdrop.vue` 第 16 行   |

---

## 二、写死在模板中的装饰文字（需改源码）

以下文字是 HUD 装饰文案，直接写在 `GameLauncher.vue` 的 `<template>` 里：

| 文字内容                                                       | 显示位置         | 源码位置                        |
| -------------------------------------------------------------- | ---------------- | ------------------------------- |
| `SYSTEM TIME //`                                               | 顶部栏右侧（时间前缀，时间本身自动生成） | `GameLauncher.vue` 第 81 行 |
| `[002]`（随机滚动三位数，每 25ms 刷新）                          | 左侧装饰栏编号   | `GameLauncher.vue` 模板 `launcher__rail-num`，滚动逻辑见 `rollRailNum()` |
| `5oiR5LiN5oOz5LiK54+t`（彩蛋：Base64，解码为「我不想上班」）      | 左侧装饰栏竖排文字 | `GameLauncher.vue` 第 90 行   |
| `5oiR5oOz5pG46bG8`（彩蛋：Base64，解码为「我想摸鱼」）            | 左侧装饰栏竖排文字 | `GameLauncher.vue` 第 92 行   |
| `SIGNAL: STRONG` / `NODE: v26.3.0` / `PING: 0ms`              | 右侧装饰栏状态行（中间一行为写死的 Node 版本号） | `GameLauncher.vue` 模板 `launcher__info` |
| `01`                                                           | 启动按钮左侧编号 | `GameLauncher.vue` 第 127 行    |
| `部署中...`                                                    | 点击后按钮 loading 文字 | `GameLauncher.vue` 第 128 行 |
| `SERVER ONLINE`                                                | 底部栏左侧状态   | `GameLauncher.vue` 第 135 行    |
| `[ © 2020-2026 上海喵御宅网络科技有限公司 · ALL RIGHTS RESERVED ]` | 底部栏版权信息 | `GameLauncher.vue` 第 138 行    |
| `// LAUNCHER-01`                                               | 底部栏中部标识   | `GameLauncher.vue` 第 140 行    |
| `[ ENTER ] 快速部署`                                           | 底部栏快捷键提示 | `GameLauncher.vue` 第 142 行    |

---

## 三、Canvas 动画中的文字（需改源码）

背景粒子被鼠标"锁定"时会显示 AI 检测框标签，格式为 `OBJ-XX 99.9%`：

```374:374:soyorin/soyorin-shmup/src/components/launcher/LauncherBackdrop.vue
const label = `OBJ-${String(idx).padStart(2, '0')} ${pt.conf.toFixed(1)}%`
```

- `OBJ-` 前缀和置信度格式在 `LauncherBackdrop.vue` 第 374 行
- 置信度数值范围（92%~99.5%）在第 125 行 `conf: 92 + Math.random() * 7.5`

---

## 四、常见问题

- **想改游戏名？** 改 `title` / `titleAccent` props，同时建议把 `megaTop`（背景大字）一起改。
- **想改版权信息？** 改 `GameLauncher.vue` 第 138 行。
- **想完全去掉某条装饰文字？** 直接删除模板中对应的 `<span>` / `<div>` 即可，均为纯装饰元素，互不影响。
