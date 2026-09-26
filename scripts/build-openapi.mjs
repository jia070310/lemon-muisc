/**
 * 生成 docs/openapi.json 与 docs/openapi.yaml（全量开放 API 规格）
 * 运行: node scripts/build-openapi.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const version = require('../package.json').version || '0.0.0'

const bearer = [{ bearerAuth: [] }]
const adminNote = '需要管理员权限 (admin)'

function op(summary, opts = {}) {
  const {
    tag = 'general',
    auth = true,
    admin = false,
    description = '',
    parameters = [],
    body = null,
    responses = null,
  } = opts
  const desc = [description, admin ? adminNote : ''].filter(Boolean).join('\n\n')
  const out = {
    tags: [tag],
    summary,
    ...(desc ? { description: desc } : {}),
    ...(auth ? { security: bearer } : { security: [] }),
    ...(parameters.length ? { parameters } : {}),
    responses: responses || {
      '200': { description: '成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/Ok' } } } },
      '401': { description: '未登录', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      ...(admin ? { '403': { description: '需要管理员', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } : {}),
    },
  }
  if (body) {
    out.requestBody = {
      required: body.required !== false,
      content: {
        [body.contentType || 'application/json']: {
          schema: body.schema || { type: 'object', additionalProperties: true },
        },
      },
    }
  }
  return out
}

function q(name, description, extra = {}) {
  return { name, in: 'query', description, schema: { type: 'string', ...extra.schema }, ...extra }
}

function p(name, description) {
  return { name, in: 'path', required: true, description, schema: { type: 'string' } }
}

const paths = {}

function add(pathKey, method, summary, opts) {
  if (!paths[pathKey]) paths[pathKey] = {}
  paths[pathKey][method] = op(summary, opts)
}

// —— Meta / OpenAPI ——
add('/', 'get', 'API 元信息', { tag: 'meta', auth: false, description: '返回 appVersion、apiVersion、openapi/docs/ws 地址' })
add('/openapi.json', 'get', 'OpenAPI JSON', { tag: 'meta', auth: false })
add('/openapi.yaml', 'get', 'OpenAPI YAML', { tag: 'meta', auth: false })
add('/docs', 'get', 'Swagger UI', { tag: 'meta', auth: false, responses: { '200': { description: 'HTML' } } })

// —— Health ——
add('/health', 'get', '健康检查', { tag: 'health', auth: false, description: '内存、扫库、下载队列状态（挂在 requireAuth 之前）' })

// —— Auth ——
add('/auth/status', 'get', '认证状态（是否已初始化）', { tag: 'auth', auth: false })
add('/auth/setup/test-mail', 'post', '初始化前测试邮件', { tag: 'auth', auth: false, body: {} })
add('/auth/setup', 'post', '首次初始化管理员', { tag: 'auth', auth: false, body: {} })
add('/auth/login', 'post', '登录', {
  tag: 'auth', auth: false, body: {
    schema: {
      type: 'object',
      required: ['username', 'password'],
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
        remember: { type: 'boolean' },
      },
    },
  },
})
add('/auth/logout', 'post', '登出', { tag: 'auth' })
add('/auth/me', 'get', '当前用户', { tag: 'auth' })
add('/auth/profile', 'patch', '更新资料', { tag: 'auth', body: {} })
add('/auth/change-password', 'post', '修改密码', { tag: 'auth', body: {} })
add('/auth/users', 'get', '用户列表', { tag: 'auth', admin: true })
add('/auth/users', 'post', '创建用户', { tag: 'auth', admin: true, body: {} })
add('/auth/users/{id}', 'delete', '删除用户', { tag: 'auth', admin: true, parameters: [p('id', '用户 ID')] })
add('/auth/users/{id}/reset-password', 'post', '重置用户密码', { tag: 'auth', admin: true, parameters: [p('id', '用户 ID')], body: {} })
add('/auth/users/{id}', 'patch', '更新用户', { tag: 'auth', admin: true, parameters: [p('id', '用户 ID')], body: {} })
add('/auth/forgot-password', 'post', '忘记密码', { tag: 'auth', auth: false, body: {} })
add('/auth/reset-password', 'post', '重置密码（令牌）', { tag: 'auth', auth: false, body: {} })
add('/auth/verify-email', 'post', '验证邮箱', { tag: 'auth', auth: false, body: {} })
add('/auth/resend-verification', 'post', '重发验证邮件', { tag: 'auth' })
add('/auth/bind-email', 'post', '绑定邮箱', { tag: 'auth', body: {} })
add('/auth/mail/test', 'post', '测试 SMTP', { tag: 'auth', admin: true, body: {} })

// —— Settings ——
add('/settings', 'get', '用户设置', { tag: 'settings' })
add('/settings', 'put', '更新用户设置', { tag: 'settings', body: {} })
add('/settings/global', 'get', '全局设置', { tag: 'settings', admin: true })
add('/settings/ffmpeg', 'get', 'ffmpeg 状态', { tag: 'settings' })
add('/settings/ffmpeg/detect', 'post', '检测 ffmpeg', { tag: 'settings' })
add('/settings/ffmpeg/install', 'post', '安装 ffmpeg', { tag: 'settings', admin: true })
add('/settings/ffmpeg/install-status', 'get', 'ffmpeg 安装进度', { tag: 'settings', admin: true })
add('/settings/ffmpeg/enable', 'post', '启用 ffmpeg', { tag: 'settings', admin: true })
add('/settings/ffmpeg/disable', 'post', '禁用 ffmpeg', { tag: 'settings', admin: true })

// —— Source ——
add('/source/list', 'get', '音源列表', { tag: 'source' })
add('/source/import', 'post', '导入音源脚本（文件）', { tag: 'source', admin: true, body: { contentType: 'multipart/form-data' } })
add('/source/import-url', 'post', '从 URL 导入音源', { tag: 'source', admin: true, body: {} })
add('/source/{id}', 'delete', '删除音源', { tag: 'source', admin: true, parameters: [p('id', '音源 ID')] })
add('/source/fault', 'get', '音源故障信息', { tag: 'source' })
add('/source/fault/dismiss', 'post', '忽略故障提示', { tag: 'source' })
add('/source/health/report', 'post', '上报音源健康', { tag: 'source', body: {} })
add('/source/health/dismiss', 'post', '忽略健康提示', { tag: 'source', body: {} })
add('/source/health/clear', 'post', '清除健康记录', { tag: 'source', admin: true })
add('/source/fault/delete', 'post', '删除故障音源', { tag: 'source', admin: true })
add('/source/fault/reimport', 'post', '重导故障音源', { tag: 'source', admin: true })
add('/source/activate/{id}', 'post', '激活音源', { tag: 'source', parameters: [p('id', '音源 ID')] })
add('/source/deactivate/{id}', 'post', '停用音源', { tag: 'source', parameters: [p('id', '音源 ID')] })
add('/source/deactivate', 'post', '停用全部', { tag: 'source' })
add('/source/active', 'get', '当前激活音源', { tag: 'source' })
add('/source/request', 'post', '代理音源请求', { tag: 'source', body: {} })
add('/source/refresh-meta', 'post', '刷新音源元数据', { tag: 'source', admin: true })

// —— Search ——
add('/search', 'get', '搜索歌曲', { tag: 'search', parameters: [q('keyword', '关键词'), q('source', '平台'), q('page', '页码')] })
add('/search/album', 'get', '搜索专辑', { tag: 'search', parameters: [q('keyword', '关键词')] })
add('/search/playlist', 'get', '搜索歌单', { tag: 'search', parameters: [q('keyword', '关键词')] })
add('/search/album/detail', 'get', '专辑详情', { tag: 'search', parameters: [q('id', '专辑 ID'), q('source', '平台')] })
add('/search/sources', 'get', '可用搜索源', { tag: 'search' })

// —— Album ——
add('/album/search', 'get', '专辑搜索（兼容）', { tag: 'album', parameters: [q('keyword', '关键词')] })
add('/album', 'get', '专辑详情（兼容）', { tag: 'album', parameters: [q('id', '专辑 ID')] })

// —— Playlist ——
add('/playlist/sources', 'get', '歌单平台列表', { tag: 'playlist' })
add('/playlist/recommend', 'get', '推荐歌单', { tag: 'playlist', parameters: [q('source', '平台'), q('page', '页')] })
add('/playlist', 'get', '解析歌单（链接或 ID）', { tag: 'playlist', parameters: [q('url', '歌单链接或 ID'), q('source', '平台')] })

// —— Discover ——
add('/discover/regions', 'get', '发现页地区', { tag: 'discover' })
add('/discover/new-songs', 'get', '新歌', { tag: 'discover', parameters: [q('source', '平台'), q('region', '地区')] })
add('/discover/new-albums', 'get', '新碟', { tag: 'discover', parameters: [q('source', '平台')] })
add('/discover/toplists', 'get', '榜单列表', { tag: 'discover', parameters: [q('source', '平台')] })
add('/discover/toplist', 'get', '榜单详情', { tag: 'discover', parameters: [q('id', '榜单 ID'), q('source', '平台')] })

// —— Play ——
add('/play/ticket', 'post', '签发/续签媒体票', {
  tag: 'play',
  description: '对本地曲目或流式相对 URL 签发短时效 ticket（默认 2h）',
  body: {
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '相对流式路径' },
        trackId: { type: 'string' },
        localPath: { type: 'string' },
        ttlSec: { type: 'integer' },
      },
    },
  },
})
add('/play/url', 'post', '解析播放地址', {
  tag: 'play',
  description: '本地：传 trackId 或 localPath/filePath；在线：传 songId+source。返回的 url 带 ?ticket=',
  body: {
    schema: {
      type: 'object',
      properties: {
        trackId: { type: 'string' },
        localPath: { type: 'string' },
        filePath: { type: 'string' },
        songId: { type: 'string' },
        source: { type: 'string' },
        quality: { type: 'string' },
        smooth: { type: 'boolean' },
        refresh: { type: 'boolean' },
      },
    },
  },
})
add('/play/local', 'get', '本地音频流', {
  tag: 'play',
  parameters: [q('path', '绝对路径'), q('ticket', '媒体票'), q('token', '会话 JWT（兼容）')],
  responses: { '200': { description: 'audio/* Range 流' } },
})
add('/play/local-ape', 'get', 'APE 转码流', { tag: 'play', parameters: [q('path', '路径'), q('ticket', '媒体票')] })
add('/play/local-smooth', 'get', '流畅 AAC 流', { tag: 'play', parameters: [q('path', '路径'), q('ticket', '媒体票')] })
add('/play/smooth-warmup', 'post', '预热下一首 AAC', { tag: 'play', body: {} })
add('/play/proxy', 'get', '远程音频反代', { tag: 'play', parameters: [q('url', '远程 URL'), q('source', '平台'), q('ticket', '媒体票')] })
add('/play/lyric', 'post', '获取歌词', { tag: 'play', body: {} })
add('/play/cover', 'post', '获取封面元数据', { tag: 'play', body: {} })
add('/play/cover-img', 'get', '封面图片', { tag: 'play', parameters: [q('url', '封面 URL'), q('ticket', '媒体票')], responses: { '200': { description: 'image/*' } } })

// —— Download ——
add('/download/list', 'get', '下载任务列表', { tag: 'download' })
add('/download/add', 'post', '添加下载', { tag: 'download', body: {} })
add('/download/playlist-jobs', 'get', '循序下载任务列表', { tag: 'download' })
add('/download/playlist-jobs/active', 'get', '进行中的循序任务', { tag: 'download' })
add('/download/playlist-job', 'post', '创建循序下载', { tag: 'download', body: {} })
add('/download/playlist-job/{id}/cancel', 'post', '取消循序下载', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/playlist-job/{id}', 'get', '循序下载详情', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/pause/{id}', 'post', '暂停任务', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/resume/{id}', 'post', '继续任务', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/pause-all', 'post', '全部暂停', { tag: 'download' })
add('/download/resume-all', 'post', '全部继续', { tag: 'download' })
add('/download/confirm-downgrade/{id}', 'post', '确认降档', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/reject-downgrade/{id}', 'post', '拒绝降档', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/confirm-exist/{id}', 'post', '确认覆盖同名', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/skip-exist/{id}', 'post', '跳过同名', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/confirm-source/{id}', 'post', '确认换源', { tag: 'download', parameters: [p('id', '任务 ID')], body: {} })
add('/download/reject-source/{id}', 'post', '拒绝换源', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/{id}', 'delete', '删除任务', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/dismiss', 'post', '忽略任务', { tag: 'download', body: {} })
add('/download/dismiss-all', 'post', '忽略全部可忽略项', { tag: 'download' })
add('/download/clear-completed', 'post', '清除已完成', { tag: 'download' })

// —— Tag / File manager ——
add('/tag/cover', 'get', '嵌入封面', { tag: 'tag', parameters: [q('path', '文件路径'), q('ticket', '媒体票')], responses: { '200': { description: 'image/*' } } })
add('/tag/dirs', 'get', '标签目录书签（deprecated）', { tag: 'tag' })
add('/tag/dirs', 'post', '添加目录书签', { tag: 'tag', body: {} })
add('/tag/dirs', 'delete', '删除目录书签', { tag: 'tag', body: {} })
add('/tag/read', 'post', '读取标签', { tag: 'tag', body: {} })
add('/tag/read-batch', 'post', '批量读取标签', { tag: 'tag', body: {} })
add('/tag/write', 'post', '写入标签', { tag: 'tag', body: {} })
add('/tag/write-batch', 'post', '批量写入标签', { tag: 'tag', body: {} })
add('/tag/list-dir', 'post', '列出目录音频', { tag: 'tag', body: {} })
add('/tag/scan', 'post', '递归扫描音频', { tag: 'tag', body: {} })
add('/tag/match', 'post', '在线匹配元数据', { tag: 'tag', body: {} })
add('/tag/match-apply', 'post', '应用匹配结果', { tag: 'tag', body: {} })
add('/tag/match-batch', 'post', '批量匹配', { tag: 'tag', body: {} })

// —— Library ——
add('/library/tracks', 'get', '曲目列表', {
  tag: 'library',
  description: '分页；?all=1 全量。每条含稳定 id/trackId 与 filePath',
  parameters: [
    q('page', '页'), q('limit', '每页'), q('q', '搜索'), q('sort', '排序'),
    q('artist', '歌手'), q('album', '专辑'), q('genre', '流派'), q('all', '1=全量'),
  ],
})
add('/library/tracks/count', 'get', '曲目总数', { tag: 'library' })
add('/library/tracks/{trackId}', 'get', '按 trackId 取单曲', {
  tag: 'library',
  parameters: [p('trackId', '稳定曲目 ID')],
})
add('/library/tracks/by-paths', 'post', '按路径批量取曲', { tag: 'library', body: {} })
add('/library/artists', 'get', '歌手聚合', { tag: 'library', parameters: [q('page', '页'), q('q', '搜索')] })
add('/library/albums', 'get', '专辑聚合', { tag: 'library', parameters: [q('page', '页'), q('q', '搜索')] })
add('/library/genres', 'get', '流派聚合', { tag: 'library' })
add('/library/sync', 'post', '同步索引', { tag: 'library', body: {} })
add('/library/scan-settings', 'get', '扫描设置', { tag: 'library' })
add('/library/scan-settings', 'put', '更新扫描设置', { tag: 'library', body: {} })
add('/library/scan-start', 'post', '开始扫描', { tag: 'library', body: {} })
add('/library/scan-status', 'get', '扫描状态', { tag: 'library' })
add('/library/mood/analyze-start', 'post', '开始情绪分析', { tag: 'mood', body: {} })
add('/library/mood/analyze-stop', 'post', '停止情绪分析', { tag: 'mood' })
add('/library/mood/analyze-status', 'get', '情绪分析状态', { tag: 'mood' })
add('/library/mood/ai-status', 'get', 'AI 情绪引擎状态', { tag: 'mood', parameters: [q('probe', '1=探测')] })
add('/library/mood/ai-prepare', 'post', '准备 AI 环境', { tag: 'mood' })
add('/library/mood/ai-prepare-status', 'get', 'AI 准备进度', { tag: 'mood' })
add('/library/mood-map', 'get', '情绪地图点', { tag: 'mood', parameters: [q('limit', '上限')] })
add('/library/mood-map/tracks', 'post', '圈选区域曲目', { tag: 'mood', body: { schema: { type: 'object', properties: { bbox: { type: 'object' }, polygon: { type: 'array' }, limit: { type: 'integer' } } } } })
add('/library/scan-batch', 'post', '批量补扫标签', { tag: 'library', body: {} })
add('/library/duplicates', 'get', '查重分组', { tag: 'library' })
add('/library/delete-files', 'post', '删除文件', { tag: 'library', body: {} })
add('/library/scan-fake-flac', 'post', '伪 FLAC 扫描', { tag: 'library', body: {} })
add('/library/rename-file', 'post', '重命名文件（保留 trackId）', { tag: 'library', body: {} })
add('/library/user-data', 'get', '用户库数据（收藏等）', { tag: 'library' })
add('/library/user-data', 'put', '更新用户库数据', { tag: 'library', body: {} })
add('/library/playlists', 'get', '库内歌单', { tag: 'library' })
add('/library/playlists', 'put', '更新库内歌单', { tag: 'library', body: {} })
add('/library/organize', 'post', '整理/迁移文件', { tag: 'library', body: {} })

// —— Album sync / Quality upgrade ——
add('/library/album-sync/preview', 'post', '专辑缺曲预览', { tag: 'albumSync', body: {} })
add('/library/quality-upgrade/options', 'get', '音质升级选项', { tag: 'qualityUpgrade' })
add('/library/quality-upgrade/scan', 'post', '扫描可升级曲目', { tag: 'qualityUpgrade', body: {} })
add('/library/quality-upgrade/match', 'post', '匹配升级源', { tag: 'qualityUpgrade', body: {} })
add('/library/quality-upgrade/start', 'post', '开始循序升级', { tag: 'qualityUpgrade', body: {} })
add('/library/quality-upgrade/active-job', 'get', '进行中的升级任务', { tag: 'qualityUpgrade' })
add('/library/quality-upgrade/cancel', 'post', '取消升级', { tag: 'qualityUpgrade' })

// —— Paths ——
add('/paths/stats', 'get', '路径统计', { tag: 'paths' })
add('/paths', 'get', '音乐库路径', { tag: 'paths' })
add('/paths', 'post', '添加路径', { tag: 'paths', body: {}, description: '共享路径通常需管理员' })
add('/paths', 'put', '更新路径', { tag: 'paths', body: {} })
add('/paths', 'delete', '删除路径', { tag: 'paths', body: {} })
add('/paths/download', 'put', '设置共享下载目录', { tag: 'paths', admin: true, body: {} })
add('/paths/download/mode', 'put', '下载路径模式', { tag: 'paths', body: {} })
add('/paths/download/personal', 'put', '个人下载目录', { tag: 'paths', body: {} })

// —— About / Backup ——
add('/about', 'get', '关于 / 版本信息', { tag: 'about' })
add('/about/download-fpk', 'post', '下载 FPK 更新包到 NAS', { tag: 'about', admin: true, body: {} })
add('/about/download-fpk/status', 'get', 'FPK 下载状态', { tag: 'about', admin: true })
add('/backup/export', 'get', '导出备份', { tag: 'backup' })
add('/backup/import', 'post', '导入备份', { tag: 'backup', body: {} })

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Lemon Music Open API',
    version,
    description: [
      '柠檬音乐自托管开放 API。路径同时挂载在 `/api` 与 `/api/v1`（推荐客户端使用 `/api/v1`）。',
      '',
      '鉴权：`Authorization: Bearer <sessionToken>`；音频流可用 `?ticket=` 短时效媒体票（也可兼容 `?token=` 会话 JWT）。',
      '',
      '曲目稳定 ID：`id` / `trackId`（UUID），路径变更后保持不变；仍返回 `filePath` 以兼容 Web。',
      '',
      '人读文档见 docs/open-api.md；交互文档 `GET /api/docs`。',
    ].join('\n'),
    license: { name: 'MIT' },
  },
  servers: [
    { url: '/api/v1', description: '推荐（开放客户端）' },
    { url: '/api', description: '兼容 Web' },
  ],
  tags: [
    { name: 'meta', description: '元信息与文档' },
    { name: 'health', description: '健康检查' },
    { name: 'auth', description: '登录与用户' },
    { name: 'settings', description: '设置 / ffmpeg' },
    { name: 'source', description: '音源脚本' },
    { name: 'search', description: '搜索' },
    { name: 'album', description: '专辑' },
    { name: 'playlist', description: '歌单' },
    { name: 'discover', description: '发现' },
    { name: 'play', description: '播放与流' },
    { name: 'download', description: '下载队列' },
    { name: 'tag', description: '标签 / 文件管理' },
    { name: 'library', description: '音乐库' },
    { name: 'mood', description: '情绪地图' },
    { name: 'albumSync', description: '专辑缺曲同步' },
    { name: 'qualityUpgrade', description: '音质升级' },
    { name: 'paths', description: '路径管理' },
    { name: 'about', description: '关于' },
    { name: 'backup', description: '备份' },
  ],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '登录返回的 session token',
      },
      streamTicket: {
        type: 'apiKey',
        in: 'query',
        name: 'ticket',
        description: '短时效媒体票（HMAC，默认 2h）',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
        },
      },
      Ok: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
        },
        additionalProperties: true,
      },
      SessionUser: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          username: { type: 'string' },
          displayName: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'user'] },
          email: { type: 'string' },
        },
      },
      Track: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '稳定 trackId（UUID）' },
          trackId: { type: 'string', description: '与 id 相同' },
          filePath: { type: 'string', description: '服务器绝对路径（不透明 ID）' },
          title: { type: 'string' },
          artist: { type: 'string' },
          album: { type: 'string' },
          duration: { type: 'number' },
          format: { type: 'string' },
          mtime: { type: 'number' },
          size: { type: 'integer' },
        },
      },
      DownloadTask: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' },
          progress: { type: 'number' },
          filePath: { type: 'string' },
        },
        additionalProperties: true,
      },
      ApiMeta: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          name: { type: 'string' },
          appVersion: { type: 'string' },
          apiVersion: { type: 'integer' },
          openapi: { type: 'string' },
          docs: { type: 'string' },
          ws: { type: 'string' },
          prefixes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

function toYaml(value, indent = 0) {
  const pad = '  '.repeat(indent)
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    if (value.includes('\n') || /[:#{}[\],&*!|>'"%@`]/.test(value) || value === '' || /^\s|\s$/.test(value)) {
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
      return `"${escaped}"`
    }
    return value
  }
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return value.map((item) => {
      if (item !== null && typeof item === 'object') {
        const nested = toYaml(item, indent + 1)
        const lines = nested.split('\n')
        return `${pad}- ${lines[0].trimStart()}\n${lines.slice(1).map((l) => (l ? `${pad}  ${l.trimStart()}` : '')).join('\n')}`.replace(/\n+$/, '')
      }
      return `${pad}- ${toYaml(item, 0)}`
    }).join('\n')
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (!keys.length) return '{}'
    return keys.map((k) => {
      const v = value[k]
      const key = /^[A-Za-z0-9_./-]+$/.test(k) ? k : JSON.stringify(k)
      if (v !== null && typeof v === 'object') {
        const nested = toYaml(v, indent + 1)
        if (nested === '{}' || nested === '[]') return `${pad}${key}: ${nested}`
        return `${pad}${key}:\n${nested}`
      }
      return `${pad}${key}: ${toYaml(v, 0)}`
    }).join('\n')
  }
  return JSON.stringify(value)
}

const docsDir = path.join(root, 'docs')
fs.mkdirSync(docsDir, { recursive: true })
const jsonPath = path.join(docsDir, 'openapi.json')
const yamlPath = path.join(docsDir, 'openapi.yaml')
fs.writeFileSync(jsonPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8')
fs.writeFileSync(yamlPath, `# Lemon Music Open API — generated by scripts/build-openapi.mjs\n${toYaml(spec)}\n`, 'utf8')
console.log(`Wrote ${jsonPath}`)
console.log(`Wrote ${yamlPath}`)
console.log(`Paths: ${Object.keys(paths).length}`)
