# 柠檬音乐 · 开放 API

面向自托管 / NAS 上的第三方客户端（原生 APP、脚本等）。机器可读规格：

- 交互文档：`GET /api/docs` 或 `GET /api/v1/docs`（Swagger UI，无需登录）
- OpenAPI 3.1：[`openapi.json`](./openapi.json) / [`openapi.yaml`](./openapi.yaml)
- 运行时：`GET /api/openapi.json`、`GET /api/v1/openapi.json`（`info.version` 与当前 `package.json` 对齐）

开发者内部架构说明仍见 [developer-guide.md](./developer-guide.md)。

## 版本与前缀

| 前缀 | 用途 |
|------|------|
| `/api/v1` | **推荐**，开放客户端 |
| `/api` | 与现有 Web 前端兼容（同一套路由） |

响应头统一带 `X-Lemon-Api-Version: 1`。

未鉴权元信息：

```http
GET /api/v1
```

示例：

```json
{
  "ok": true,
  "name": "Lemon Music",
  "appVersion": "1.2.17.22",
  "apiVersion": 1,
  "openapi": "http://host:7983/api/openapi.json",
  "docs": "http://host:7983/api/docs",
  "ws": "ws://host:7983/ws",
  "prefixes": ["/api", "/api/v1"]
}
```

## 鉴权

1. `POST /api/v1/auth/login`，body：`{ "username", "password", "remember?: boolean" }`
2. 保存返回的会话 token
3. 后续请求：`Authorization: Bearer <token>`（也可用 cookie / `?token=`，APP 请用 Bearer）

除 `/auth/*`（部分公开）、`/health`、以及元信息 `/`、`/openapi.*`、`/docs` 外，其余接口需登录。

相关补充：

- `POST /auth/forgot-password` / `POST /auth/reset-password`：邮件找回（需管理员配置 SMTP）
- `POST /auth/complete-default-account`：默认账号首次强制改密/改名

### 媒体票（流式播放）

`POST /play/url` 返回的相对 URL 会优先带 **`?ticket=`**（HMAC 短时效，默认 **2 小时**），不必把长会话 JWT 放进播放器日志。

- 仍兼容旧的 `?token=<session JWT>`
- 单独续票：`POST /api/v1/play/ticket`（`url` 或 `trackId` / `localPath`）
- 播放器请求流时用 query 中的 `ticket` 即可，无需再塞 Authorization

## 稳定曲目 ID（trackId）

音乐库曲目带稳定字段：

- `id` / `trackId`：UUID，写入 `library_index.track_id`
- `filePath`：服务器绝对路径（对客户端应视为不透明；路径整理/重命名后 **trackId 不变**）

**在线曲目**使用平台字段（`songId` / `songmid` / `hash` 等）+ `source`，**不要**把平台 id 当作库 `trackId`。服务端仅在值为 UUID 且无在线身份字段时，才会把 `id` 当作库曲目。

常用：

```http
GET /api/v1/library/tracks?page=1&limit=50
GET /api/v1/library/tracks/{trackId}
POST /api/v1/play/url
Content-Type: application/json

{ "trackId": "<uuid>" }
```

## 最小 APP 播放链路

```bash
# 1. 登录
curl -s -X POST "$HOST/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"u","password":"p","remember":true}'
# => { "token": "...", "user": {...} }

# 2. 列库
curl -s "$HOST/api/v1/library/tracks?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"

# 3. 取播放地址（本地库）
curl -s -X POST "$HOST/api/v1/play/url" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"trackId":"YOUR_TRACK_ID"}'
# => { "ok": true, "url": "/api/play/local?trackId=...&ticket=...", "local": true }

# 4. 播放器直接请求返回的 url（相对路径拼上 HOST）
```

在线曲：

```http
POST /api/v1/play/url
{ "songId": "...", "source": "kw", "quality": "320k" }
```

可选：

| 字段 | 说明 |
|------|------|
| `sourceApiId` | 锁定某个已激活音源脚本 |
| `skipSourceIds` | 跳过已失败的脚本 |
| `smooth` | 本地请求 AAC 转码流（需 ffmpeg；对应用户设置「本地转码」）。APE / DSF / DFF 始终转码，可不传 `smooth` |
| `refresh` | 跳过播放链缓存 |

多音源失败且设置为「询问」时，可能返回 **409** `SOURCE_FALLBACK_REQUIRED`（含备选脚本列表）。  
跨平台搜同名曲由**客户端**完成后再调 `/play/url`（服务端单次请求只解析当前 `source` 平台）。

## 功能域速查

| 域 | 主要路径 | 说明 |
|----|----------|------|
| 搜索 | `/search`、`/search/album`、`/playlist` | 需已激活音源 |
| 发现 | `/discover/*` | 新歌 / 新碟 / 榜单 |
| 播放 | `/play/url`、`/play/local*`、`/play/proxy`、`/play/lyric` | 流为二进制 Range |
| 下载 | `/download/*` | 服务端入队；进度见 WS；循序任务可 pause/continue |
| 音乐库 | `/library/tracks|artists|albums|…` | SQLite 索引 |
| 情绪地图 | `/library/mood-map`、`/mood/*` | 点位 JSON；画布客户端自绘 |
| 文件管理 | `/tag/*`、`/library/duplicates|organize|…` | 操作 **服务器磁盘** |
| 路径 | `/paths` | 共享根目录多为 admin |
| 音源 | `/source/*` | 导入/检查更新多为 admin；`/source/active` 含激活顺序 |
| 设置 | `/settings`、`/settings/ffmpeg/*` | ffmpeg 安装为 admin |
| 备份 | `/backup/export|import` | |
| 关于 | `/about`、`/about/diagnostics` | 版本、FPK、运行诊断 |
| DLNA 投屏 | `/dlna/devices` `/dlna/play` `/dlna/status` `/dlna/pause` `/dlna/resume` `/dlna/stop` `/dlna/session` | **连播由服务端推进**；`POST /dlna/play` 可带可选 `queue`/`index`/`playMode` |

完整路径与参数见 OpenAPI。

## WebSocket

```
ws://host:7983/ws?token=<sessionJWT>
```

消息形态：`{ "type": "<event>", "data": ... }`。常用事件：

| type | 含义 |
|------|------|
| `download:added` / `progress` / `status` / `removed` / `cleared` | 下载队列 |
| `download:exist-summary` / `source-switched` / `platform-switched` | 下载交互 |
| `playlist-download:progress` / `done` / `cancelled` | 循序下载 |
| `library:scan-progress` / `scan-complete` / `changed` / `removed` | 扫库 |
| `library:mood-progress` / `mood-complete` | 情绪分析 |
| `library:user-data-changed` | 收藏/歌单等 |
| `dlna:now-playing` / `dlna:transport` / `dlna:queue-ended` | 服务端投屏连播（页面关闭后仍切歌）；`transport` 同步设备端暂停/继续 |

无 WS 时可轮询对应 `*-status` / `list` HTTP 接口。

投屏连播由服务端持有队列：`POST /dlna/play` 可带可选 `queue` / `index` / `playMode`；`GET|POST /dlna/session` 查询或只更新队列。设备端暂停/停止由服务端识别（曲中 STOPPED 不当作播完）。`POST /dlna/pause` / `/dlna/resume` 把控制转到音箱。

## 角色

- `user`：搜索、播放、个人库、个人下载路径等
- `admin`：用户管理、共享路径、音源导入、ffmpeg/AI 安装、FPK 下载等（OpenAPI 中标注）

## 兼容说明

- Web 继续使用 `/api` + `filePath`；流 URL 可带 `ticket` 或 `token`
- 本地流优先 `?trackId=`（短），仍兼容 `?path=`
- 不强制迁移到 `/api/v1`
- 不提供第三方 OAuth / 开发者应用注册（本轮范围外）

## 接口稳定性约定（给第三方客户端）

开放 API **尽量固定、少改**，避免对接方反复重写前端。

| 原则 | 说明 |
|------|------|
| 已有路径与字段保持兼容 | 不随意改 URL、方法、必填项、成功/错误语义；扩展优先**新增可选字段** |
| 新功能新开接口 | 新能力用**新路径**（或新可选参数且默认行为不变），不要把旧接口改成另一套契约 |
| 废弃须过渡 | 确需淘汰时：先并存兼容一段时间并在文档标明 deprecated，再移除；重大破坏性变更走更高 `apiVersion` / 新前缀，而非默默改 `/api/v1` |
| 文档与实现同步 | 路由变更后执行 `npm run openapi:build`，并更新本文 |

实现侧与内部协作同样遵守上述约定（见开发者指南）。

## 重新生成规格

路由增删后执行：

```bash
npm run openapi:build
```

或 `node scripts/build-openapi.mjs`。
