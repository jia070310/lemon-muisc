import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import http from 'node:http'

/** 开发态后端；用 127.0.0.1 避免 localhost → IPv6 与代理串流异常 */
const API_TARGET = 'http://127.0.0.1:7983'
const WS_TARGET = 'ws://127.0.0.1:7983'

/** 音频流禁用 keep-alive，避免后端 --watch 重启后复用死连接 → ECONNRESET */
const streamAgent = new http.Agent({ keepAlive: false, maxSockets: 32 })

function isBenignProxyReset(err) {
  const code = err?.code || ''
  return code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECONNABORTED' || code === 'ECONNREFUSED'
}

/** 本地/代理音频流：关超时 + 禁用连接复用，避免大 FLAC 被 Vite 代理掐断 */
function createStreamProxy() {
  return {
    target: API_TARGET,
    changeOrigin: true,
    timeout: 0,
    proxyTimeout: 0,
    agent: streamAgent,
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setTimeout(0)
      })
      proxy.on('proxyRes', (proxyRes, req, res) => {
        try { req.socket?.setTimeout?.(0) } catch {}
        try { res.setTimeout?.(0) } catch {}
        try { proxyRes.socket?.setTimeout?.(0) } catch {}
      })
      proxy.on('error', (err, req, res) => {
        // 浏览器 Range 重协商 / 切歌 abort / 后端瞬断：常见且可恢复，勿刷屏
        if (isBenignProxyReset(err)) {
          if (res && !res.headersSent && typeof res.writeHead === 'function') {
            try { res.writeHead(502); res.end() } catch {}
          }
          return
        }
        console.error('[vite] stream proxy error:', req?.url || '', err.message)
      })
    },
  }
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve('src') },
  },
  server: {
    port: 5174,
    proxy: {
      // 更具体的规则须写在通用 /api 之前（各自独立实例，避免共享状态）
      '/api/play/local': createStreamProxy(),
      '/api/play/local-ape': createStreamProxy(),
      '/api/play/proxy': createStreamProxy(),
      '/api/tag/cover': createStreamProxy(),
      '/api': { target: API_TARGET, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
      '/ws': { target: WS_TARGET, ws: true },
    },
  },
  build: {
    outDir: 'dist/public',
  },
})
