import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OPENAPI_JSON = path.join(ROOT, 'docs', 'openapi.json')
const OPENAPI_YAML = path.join(ROOT, 'docs', 'openapi.yaml')

let cachedSpec = null
let cachedMtime = 0

function readAppVersion() {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require('../../package.json')
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function loadOpenApiSpec() {
  try {
    if (fs.existsSync(OPENAPI_JSON)) {
      const st = fs.statSync(OPENAPI_JSON)
      if (cachedSpec && st.mtimeMs === cachedMtime) return cachedSpec
      cachedSpec = JSON.parse(fs.readFileSync(OPENAPI_JSON, 'utf8'))
      cachedMtime = st.mtimeMs
      return cachedSpec
    }
  } catch (e) {
    console.warn('加载 OpenAPI JSON 失败:', e.message)
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Lemon Music Open API',
      version: readAppVersion(),
      description: '规格文件缺失，请确认 docs/openapi.json 已生成',
    },
    paths: {},
  }
}

export function apiVersionHeader(_req, res, next) {
  res.setHeader('X-Lemon-Api-Version', '1')
  next()
}

export function buildApiMeta(req) {
  const proto = req.protocol || 'http'
  const host = req.get('host') || `localhost:${process.env.PORT || 7983}`
  const base = `${proto}://${host}`
  return {
    ok: true,
    name: 'Lemon Music',
    appVersion: readAppVersion(),
    apiVersion: 1,
    openapi: `${base}/api/openapi.json`,
    docs: `${base}/api/docs`,
    ws: `${base.replace(/^http/, 'ws')}/ws`,
    prefixes: ['/api', '/api/v1'],
  }
}

export const openApiPublicRouter = Router()

openApiPublicRouter.get('/', (req, res) => {
  res.json(buildApiMeta(req))
})

openApiPublicRouter.get('/openapi.json', (_req, res) => {
  res.type('application/json').json(loadOpenApiSpec())
})

openApiPublicRouter.get('/openapi.yaml', (_req, res) => {
  if (fs.existsSync(OPENAPI_YAML)) {
    res.type('text/yaml').send(fs.readFileSync(OPENAPI_YAML, 'utf8'))
    return
  }
  res.status(404).json({ error: 'openapi.yaml 不存在' })
})

openApiPublicRouter.get('/docs', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lemon Music Open API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>body{margin:0}.topbar{display:none!important}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    const openapiUrl = location.pathname.replace(/\\/docs\\/?$/, '/openapi.json')
    window.ui = SwaggerUIBundle({
      url: openapiUrl,
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout'
    })
  </script>
</body>
</html>`)
})
