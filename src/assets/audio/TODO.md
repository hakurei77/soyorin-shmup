# 音效工作指南（写给后续接手的 AI）

本文记录在本项目中设计 / 生成 / 接入音效的标准流程与踩过的坑。**新增任何音效前请先读完本文。**

---

## 一、音效体系速览

- **播放器**：`src/utils/sfx.ts`（Web Audio）
  - `playSfx(url, volume?)` 播一次；`preloadSfx(url)` 预解码；`startSfxLoop(url, volume?, loopFrom?, loopTo?)` 循环（返回停止函数）
  - `url` 必须是 **Vite 静态导入**的音频资源（`import xx from './xx.wav'`），不是字符串路径
- **音量集中管理**：`src/assets/audio/sfxVolumes.ts`（在 `main.ts` 顶部导入，App 启动时一次性注册）
  - 新增音效**必须**在这里 `registerSfxVolume(url, 0~1, channel)`，禁止在使用处硬编码音量
  - `channel` 必须标注：武器音效 `'weapon'`，UI 音效 `'ui'`（缺省默认 `'ui'`）
- **音量体系（四路，默认均为 5 / 0.5）**：
  - 音乐：`utils/bgm.ts` 用户音量 × `bgm.json` 曲目补偿
  - 角色语音：`uiSettings.voiceVolume`（语音走 HTMLAudioElement，播放时读取）
  - 武器 / 交互：`sfx.ts` 通道音量 × 文件注册音量，设置面板调 `setSfxChannelVolume`
- **目录分类**：`weapon/` 武器、`ui/` 界面、`voice/<角色名>/` 角色语音。新分类自建子目录
- **署名文档**：`src/assets/audio/README.md`
  - 第三方素材（Freesound 等）→ 记作者 / 链接 / 许可 / 修改说明
  - AI 生成素材 → 记模型 / 提示词 / 时长 / 种子

## 二、AI 生成音效的标准流程（SOP）

生成工具用法见 `c:\CodeDrive\FeProject\aimodules\README.md`（audio.cpp + Stable Audio 3 Medium，CUDA）。

1. **先读懂场景**：看相关组件的代码与视觉风格（配色、动画时长、文案），让音效质感与画面同步
   - 本游戏风格：二次元 × 赛博朋克 × 霓虹（紫 `#bb99f5` / 青 `#5ee6ff`），音效走科幻电子风，不要写实粗粝风（武器类除外）
2. **写英文提示词**：`主体声音 + 质感/环境 + 用途`，结尾加 `game sound effect`；UI 音 1~2 秒，氛围音可更长
3. **一次生成 3 个变体**（同一提示词，seed 1/2/3），输出到 `c:\CodeDrive\FeProject\aimodules\audio\`
4. **让用户选，不要自己选**（重要）：
   - 生成后直接把 3 个变体路径列给用户，请用户试听后指定用哪个
   - 不要替用户做审美判断，不要自己分析波形挑一个就接入
5. **复制入选文件**到本目录对应分类子目录，命名用 `kebab-case`（如 `boot-link.wav`）
6. **接入代码**：使用处 `import` + 按需 `preloadSfx`（首次播放要求零延迟的场景，在 `onMounted` 预加载）+ `playSfx`
7. **注册音量**：在 `sfxVolumes.ts` 补一行 `registerSfxVolume`，并写注释说明该音效为何定这个音量
8. **更新 `README.md`** 署名文档（见上方分类规则）

已完成样例（可直接参考）：`ui/boot-link.wav` + `src/pages/BootGate.vue`，全流程均按上述 SOP 执行。

## 三、踩坑记录

- **首次点击无声**：AudioContext 在用户首个手势前是 `suspended`，`resume()` 是异步的。`sfx.ts` 的 `playBuffer` 已修复为「resume 完成后补播」，**不要回退这段逻辑**，否则 BootGate 这类「首个手势即播音」的场景会静默
- **生成目录纪律**：AI 生成的原始产物一律先放 `c:\CodeDrive\FeProject\aimodules\audio\`（用户会定期清理），只有入选文件才复制进项目
- **提示词必须英文**，模型不支持中文
- **连发武器音量要压得很低**（参考 `Vulcan` 0.04），单发 / UI 音可以高些；音量宁小勿大，交给用户调
- 本机无 Python，分析音频文件用 Node 脚本
