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
add('/auth/complete-default-account', 'post', '完成默认账号改密/改名', {
  tag: 'auth',
  description: '首次使用默认账号登录后，强制修改用户名与密码时调用',
  body: {
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
        displayName: { type: 'string' },
      },
    },
  },
})
add('/auth/change-password', 'post', '修改密码', { tag: 'auth', body: {} })
add('/auth/users', 'get', '用户列表', { tag: 'auth', admin: true })
add('/auth/users', 'post', '创建用户', { tag: 'auth', admin: true, body: {} })
add('/auth/users/{id}', 'delete', '删除用户', { tag: 'auth', admin: true, parameters: [p('id', '用户 ID')] })
add('/auth/users/{id}/reset-password', 'post', '重置用户密码', { tag: 'auth', admin: true, parameters: [p('id', '用户 ID')], body: {} })
add('/auth/users/{id}', 'patch', '更新用户', { tag: 'auth', admin: true, parameters: [p('id', '用户 ID')], body: {} })
add('/auth/forgot-password', 'post', '忘记密码（发邮件）', { tag: 'auth', auth: false, body: {} })
add('/auth/reset-password', 'post', '重置密码（令牌）', { tag: 'auth', auth: false, body: {} })
add('/auth/verify-email', 'post', '验证邮箱', { tag: 'auth', auth: false, body: {} })
add('/auth/resend-verification', 'post', '重发验证邮件', { tag: 'auth' })
add('/auth/bind-email', 'post', '绑定邮箱', { tag: 'auth', body: {} })
add('/auth/mail/test', 'post', '测试 SMTP', { tag: 'auth', admin: true, body: {} })

// —— Settings ——
add('/settings', 'get', '用户设置', { tag: 'settings' })
add('/settings', 'put', '更新用户设置', {
  tag: 'settings',
  description: '白名单 key + 客户端命名空间 app.*（按用户隔离）。响应含 accepted / ignored；非白名单 key 不会静默假装成功。',
  body: {},
})
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
add('/source/import-url', 'post', '从 URL 批量导入音源', {
  tag: 'source',
  admin: true,
  description: 'body.url 或 body.urls[]：http(s) 脚本地址',
  body: {
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        urls: { type: 'array', items: { type: 'string' } },
      },
    },
  },
})
add('/source/check-updates', 'post', '检查音源脚本更新', {
  tag: 'source',
  admin: true,
  description: '可选 body.id 只检查单个音源；否则检查全部可更新项',
  body: {},
})
add('/source/update/{id}', 'post', '更新指定音源脚本', {
  tag: 'source',
  admin: true,
  parameters: [p('id', '音源 ID')],
  body: {
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '可选，覆盖脚本来源 URL' },
      },
    },
  },
})
add('/source/{id}/export', 'get', '导出音源脚本（写入下载目录「音源导出」文件夹，并返回脚本内容）', { tag: 'source', admin: true, parameters: [p('id', '音源 ID')] })
add('/source/{id}', 'delete', '删除音源', { tag: 'source', admin: true, parameters: [p('id', '音源 ID')] })
add('/source/fault', 'get', '最近一次音源故障（诊断用）', {
  tag: 'source',
  description:
    '返回最近写入的音源故障记录（若有）。偶发沙箱/加载失败以服务端运行日志为准，默认不向客户端弹窗推送；本接口供管理员排查或自建监控读取。',
})
add('/source/fault/dismiss', 'post', '清除故障记录', {
  tag: 'source',
  description: '清除 settings 中保存的最近音源故障记录（不再用于强制前端弹窗）。',
})
add('/source/health', 'get', '音源健康聚合', {
  tag: 'source',
  description: '各音源近期试听片段比例与平台级健康，供客户端避开异常源',
})
add('/source/health/report', 'post', '上报音源健康（试听片段检测）', {
  tag: 'source',
  body: {
    schema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string' },
        isPreview: { type: 'boolean' },
        platform: { type: 'string', description: 'kw/tx/wy/kg/mg' },
      },
    },
  },
})
add('/source/health/dismiss', 'post', '忽略健康提示', { tag: 'source', body: {} })
add('/source/health/clear', 'post', '清除健康记录', { tag: 'source', admin: true })
add('/source/fault/delete', 'post', '删除故障记录对应音源', {
  tag: 'source',
  admin: true,
  description: '删除最近故障记录关联的 user_api，并清除故障记录。',
})
add('/source/fault/reimport', 'post', '按故障记录重导音源', {
  tag: 'source',
  admin: true,
  description: '删除故障音源后若有 homepage 则尝试重新拉取导入。',
})
add('/source/activate/{id}', 'post', '激活音源', { tag: 'source', parameters: [p('id', '音源 ID')] })
add('/source/deactivate/{id}', 'post', '停用音源', { tag: 'source', parameters: [p('id', '音源 ID')] })
add('/source/deactivate', 'post', '停用全部', { tag: 'source' })
add('/source/active', 'get', '当前激活音源', {
  tag: 'source',
  description: '返回 ids（用户激活顺序）、list（已加载脚本及声明平台）、id（最近激活）',
})
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
        trackId: { type: 'string', description: '库内稳定 UUID' },
        localPath: { type: 'string' },
        ttlSec: { type: 'integer' },
      },
    },
  },
})
add('/play/url', 'post', '解析播放地址', {
  tag: 'play',
  description: [
    '本地：传库内 `trackId`（UUID）或 `localPath`/`filePath`。',
    '在线：传平台 `songId`（或 songmid/hash 等）+ `source`（kw/tx/wy/kg/mg）+ 可选 `quality`。',
    '',
    '**重要**：在线曲目的平台 id 不得当作库 `trackId`。仅 UUID 形态（或显式 `trackId`）才走库内查找；否则会 404 `TRACK_NOT_FOUND`。',
    '',
    '`smooth=true` 时本地无损可走 AAC 转码流（需服务器 ffmpeg；APE 始终走 `/play/local-ape`；DSF/DFF 始终走 `/play/local-smooth`）。',
    '',
    '多音源：可用 `sourceApiId` 锁定脚本，或 `skipSourceIds` 跳过已失败脚本；失败且设置为询问模式时返回 409 `SOURCE_FALLBACK_REQUIRED`。',
    '',
    '成功时 `url` 为带 `?ticket=` 的相对路径，拼上 HOST 即可播放。',
  ].join('\n'),
  body: {
    schema: {
      type: 'object',
      properties: {
        trackId: { type: 'string', description: '库内稳定 UUID；勿填平台 songId' },
        id: { type: 'string', description: '仅当值为库 UUID 且无在线身份字段时才当 trackId' },
        localPath: { type: 'string' },
        filePath: { type: 'string' },
        songId: { type: 'string', description: '在线曲目平台 ID' },
        songmid: { type: 'string' },
        hash: { type: 'string' },
        copyrightId: { type: 'string' },
        source: { type: 'string', description: '平台：kw/tx/wy/kg/mg/local' },
        quality: { type: 'string', description: '如 128k / 320k / flac / flac24bit / master' },
        smooth: { type: 'boolean', description: '本地是否请求 AAC 流畅转码' },
        refresh: { type: 'boolean', description: '跳过播放链缓存' },
        sourceApiId: { type: 'string', description: '锁定使用的音源脚本 ID' },
        skipSourceIds: {
          type: 'array',
          items: { type: 'string' },
          description: '跳过的音源脚本 ID 列表',
        },
      },
    },
  },
  responses: {
    '200': {
      description: '成功',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/PlayUrlResponse' },
        },
      },
    },
    '404': {
      description: '库曲目未找到 (TRACK_NOT_FOUND)',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    },
    '409': {
      description: '需选择备用音源 (SOURCE_FALLBACK_REQUIRED)',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    },
    '401': {
      description: '未登录',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    },
  },
})
add('/play/local', 'get', '本地音频流', {
  tag: 'play',
  parameters: [
    q('trackId', '库内稳定 UUID（优先）'),
    q('path', '绝对路径（兼容）'),
    q('ticket', '媒体票'),
    q('token', '会话 JWT（兼容）'),
  ],
  responses: { '200': { description: 'audio/* Range 流' } },
})
add('/play/local-ape', 'get', 'APE 转码流（WAV）', {
  tag: 'play',
  parameters: [q('trackId', '库 UUID'), q('path', '路径'), q('ticket', '媒体票')],
  responses: { '200': { description: 'audio/* Range 流' } },
})
add('/play/dlna.mp3', 'get', '投屏用本地 MP3 流', {
  tag: 'play',
  description: '将本地音频转成 MP3，供 DLNA 音箱读取（路径带 .mp3）',
  parameters: [q('trackId', '库 UUID'), q('path', '路径'), q('ticket', '媒体票')],
  responses: { '200': { description: 'audio/mpeg Range 流' } },
})
add('/play/local-smooth', 'get', '本地 AAC 流畅转码流', {
  tag: 'play',
  description: '需 ffmpeg；客户端应在用户开启「本地转码」时再请求',
  parameters: [q('trackId', '库 UUID'), q('path', '路径'), q('ticket', '媒体票')],
  responses: { '200': { description: 'audio/* Range 流' } },
})
add('/play/smooth-warmup', 'post', '预热下一首 AAC', {
  tag: 'play',
  description: '后台转码缓存，减轻切歌卡顿（仅开本地转码时有意义）',
  body: {
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        trackId: { type: 'string' },
        filePath: { type: 'string' },
      },
    },
  },
})
add('/play/proxy', 'get', '远程音频反代', {
  tag: 'play',
  parameters: [q('url', '远程 URL'), q('source', '平台'), q('ticket', '媒体票')],
  responses: { '200': { description: 'audio/* Range 流' } },
})
add('/play/lyric', 'post', '获取歌词', { tag: 'play', body: {} })
add('/play/cover', 'post', '获取封面元数据', { tag: 'play', body: {} })
add('/play/cover-img', 'get', '封面图片', {
  tag: 'play',
  parameters: [q('url', '封面 URL'), q('ticket', '媒体票')],
  responses: { '200': { description: 'image/*' } },
})

// —— Download ——
add('/download/list', 'get', '下载任务列表', { tag: 'download' })
add('/download/add', 'post', '添加下载', { tag: 'download', body: {} })
add('/download/playlist-jobs', 'get', '循序下载任务列表', { tag: 'download' })
add('/download/playlist-jobs/active', 'get', '进行中的循序任务', { tag: 'download' })
add('/download/playlist-job', 'post', '创建循序下载', { tag: 'download', body: {} })
add('/download/playlist-job/{id}/cancel', 'post', '取消循序下载', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/playlist-job/{id}/pause', 'post', '暂停循序下载', { tag: 'download', parameters: [p('id', '任务 ID')] })
add('/download/playlist-job/{id}/continue', 'post', '继续循序下载', { tag: 'download', parameters: [p('id', '任务 ID')] })
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
add('/library/sync-state', 'get', '曲库版本信号（updated 0/1，无扫盘）', {
  tag: 'library',
  description: '返回 revision / dirty / trackCount。索引变更也会通过 WS `library:index-changed` 推送。',
})
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
add('/library/user-data', 'get', '用户库数据（收藏等）', {
  tag: 'library',
  description: '支持 ?sinceRevision=N（未变返回 unchanged:true）与 If-None-Match → 304。响应带 ETag。',
  parameters: [q('sinceRevision', '客户端已知 revision；相等则 unchanged')],
})
add('/library/user-data', 'put', '更新用户库数据', {
  tag: 'library',
  description: [
    '部分更新：传 playlists / favorites / recentPlays / playStats 等。',
    '冲突：传 baseRevision（须等于服务端）或 revision（须大于服务端）；否则 409 + 服务端 data。',
    '写入时对 favorites / recentPlays / playStats 做跨平台同曲归并。',
  ].join('\n'),
  body: {
    schema: {
      type: 'object',
      properties: {
        playlists: { type: 'array' },
        favorites: { type: 'array' },
        favoriteAlbums: { type: 'array' },
        favoriteArtists: { type: 'array' },
        recentPlays: { type: 'array' },
        playStats: { type: 'array' },
        revision: { type: 'integer', description: '期望写入的新 revision（须 > 服务端）' },
        baseRevision: { type: 'integer', description: '基于的服务端 revision（乐观锁）' },
      },
    },
  },
  responses: {
    '200': { description: '成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/Ok' } } } },
    '401': { description: '未登录', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    '409': {
      description: 'revision 冲突，body 含 serverRevision 与 data',
      content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
    },
  },
})
add('/library/match-same-song', 'post', '跨平台同曲判定/归并', {
  tag: 'library',
  description: '传 { a, b } 判断是否同曲，或传 { tracks } 返回归并后的列表。口径：标题归一化+主唱+无 Live/remix 冲突+时长差≤5s。',
  body: {
    schema: {
      type: 'object',
      properties: {
        a: { type: 'object' },
        b: { type: 'object' },
        tracks: { type: 'array', items: { type: 'object' } },
      },
    },
  },
})
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
add('/about/diagnostics', 'get', '运行诊断（HTTPS/路径等）', {
  tag: 'about',
  description: '供关于页与运维排查；含证书探测、监听模式等摘要',
})
add('/about/download-fpk', 'post', '下载 FPK 更新包到 NAS', { tag: 'about', admin: true, body: {} })
add('/about/download-fpk/status', 'get', 'FPK 下载状态', { tag: 'about', admin: true })
add('/backup/export', 'get', '导出备份', { tag: 'backup' })
add('/backup/import', 'post', '导入备份', { tag: 'backup', body: {} })

// —— Podcasts / DLNA ——
add('/podcasts', 'get', '播客订阅列表', { tag: 'podcasts' })
add('/podcasts', 'post', '订阅 RSS', { tag: 'podcasts', body: { schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } })
add('/podcasts/{id}', 'get', '订阅详情', { tag: 'podcasts', parameters: [p('id', '订阅 ID')] })
add('/podcasts/{id}', 'delete', '取消订阅', { tag: 'podcasts', parameters: [p('id', '订阅 ID')] })
add('/podcasts/{id}/episodes', 'get', '节目标题分页', { tag: 'podcasts', parameters: [p('id', '订阅 ID'), q('page', '页'), q('limit', '每页')] })
add('/podcasts/{id}/refresh', 'post', '刷新订阅', { tag: 'podcasts', parameters: [p('id', '订阅 ID')] })
add('/dlna/devices', 'get', '搜索 DLNA 渲染器', { tag: 'dlna', parameters: [q('refresh', '1=重新 SSDP')] })
add('/dlna/play', 'post', '投送到设备（本地、播客或在线平台曲目）。可选 queue/index/playMode，服务端持有队列并连播', { tag: 'dlna', body: {} })
add('/dlna/status', 'get', '查询投屏播放状态（连播用）', { tag: 'dlna', parameters: [q('udn', '设备 UDN')] })
add('/dlna/pause', 'post', '暂停当前投屏（设备端 Pause）', { tag: 'dlna', body: {} })
add('/dlna/resume', 'post', '继续当前投屏（设备端 Play）', { tag: 'dlna', body: {} })
add('/dlna/stop', 'post', '停止投屏并结束服务端连播会话', { tag: 'dlna', body: {} })
add('/dlna/session', 'get', '当前用户的服务端投屏连播会话', { tag: 'dlna' })
add('/dlna/session', 'post', '更新投屏队列或播放模式（不重新开播）', { tag: 'dlna', body: {} })

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
      '曲目稳定 ID：库内 `id` / `trackId` 为 UUID；在线曲目请用 `songId`+`source`，勿把平台 id 当作 trackId。',
      '',
      '播放换源：同一次 `/play/url` 内可用 `sourceApiId` / `skipSourceIds` 控制音源脚本；跨平台搜曲由客户端自行完成后再调本接口。',
      '',
      '本地转码：`smooth=true` 请求 AAC 流；关闭用户设置「本地转码」时客户端应直出 `/play/local`（APE / DSF / DFF 除外，始终转码）。',
      '',
      '稳定性：已公开路径与字段尽量固定；新功能新开路由或可选字段，避免破坏第三方客户端（详见 docs/open-api.md）。',
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
    { name: 'podcasts', description: '播客 RSS 订阅' },
    { name: 'dlna', description: 'DLNA 投屏' },
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
      PlayUrlResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          url: { type: 'string', description: '相对播放路径，含 ticket' },
          local: { type: 'boolean' },
          smooth: { type: 'boolean' },
          format: { type: 'string' },
          cached: { type: 'boolean' },
          sourceInfo: {
            type: 'object',
            description: '实际取链的音源脚本信息',
            additionalProperties: true,
          },
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
