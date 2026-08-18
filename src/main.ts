import { createApp } from 'vue'
import App from './App.vue'
import './utils/devCommands'
import './assets/audio/sfxVolumes' // 注册全部音效文件的默认音量与通道
import { setSfxChannelVolume } from './utils/sfx'
import { uiSettings } from './utils/settings'

// 恢复音效通道音量（AudioContext 尚未创建也没关系，音量在播放时读取）
setSfxChannelVolume('weapon', uiSettings.weaponVolume)
setSfxChannelVolume('ui', uiSettings.uiVolume)

createApp(App).mount('#app')
