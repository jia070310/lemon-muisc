import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import './styles/global.css'
import './utils/theme.js'
import { installAppTooltip } from './utils/tooltip.js'
import { registerServiceWorker } from './utils/pwa.js'
import { installRuntimeLog } from './utils/runtimeLog.js'

installRuntimeLog()
installAppTooltip()
registerServiceWorker()
createApp(App).use(router).mount('#app')
