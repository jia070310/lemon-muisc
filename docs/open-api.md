# 柠檬音乐 · 开放 API

面向自托管 / NAS 上的第三方客户端（原生 APP、脚本等）。机器可读规格：

- 交互文档：`GET /api/docs` 或 `GET /api/v1/docs`（Swagger UI，无需登录）
- OpenAPI 3.1：[`openapi.json`](./openapi.json) / [`openapi.yaml`](./openapi.yaml)
- 运行时：`GET /api/openapi.json`、`GET /api/v1/openapi.json`

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
  "appVersion": "1.2.16.12",
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

除 `/auth/*`、`/health`、以及元信息 `/`、`/openapi.*`、`/docs` 外，其余接口需登录。

### 媒体票（流式播放）

`POST /play/url` 返回的相对 URL 会优先带 **`?ticket=`**（HMAC 短时效，默认 **2 小时**），不必把长会话 JWT 放进播放器日志。

- 仍兼容旧的 `?token=<session JWT>`
- 单独续票：`POST /api/v1/play/ticket`（`url` 或 `trackId` / `localPath`）
- 播放器请求流时用 query 中的 `ticket` 即可，无需再塞 Authorization

## 稳定曲目 ID（trackId）

音乐库曲目带稳定字段：

- `id` / `trackId`：UUID，写入 `library_index.track_id`
- `filePath`：服务器绝对路径（对客户端应视为不透明；路径整理/重命名后 **trackId 不变**）

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

# 3. 取播放地址
curl -s -X POST "$HOST/api/v1/play/url" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"trackId":"YOUR_TRACK_ID"}'
# => { "ok": true, "url": "/api/play/local?path=...&ticket=...", "local": true }

# 4. 播放器直接请求返回的 url（相对路径拼上 HOST）
```

在线曲：`POST /play/url` 传 `songId` + `source`（及可选 `quality`），再播返回的 `/api/play/proxy?...&ticket=`。

## 功能域速查

| 域 | 主要路径 | 说明 |
|----|----------|------|
| 搜索 | `/search`、`/search/album`、`/playlist` | 需已激活音源 |
| 发现 | `/discover/*` | 新歌 / 新碟 / 榜单 |
| 播放 | `/play/url`、`/play/local*`、`/play/proxy`、`/play/lyric` | 流为二进制 Range |
| 下载 | `/download/*` | 服务端入队；进度见 WS |
| 音乐库 | `/library/tracks|artists|albums|…` | SQLite 索引 |
| 情绪地图 | `/library/mood-map`、`/mood/*` | 点位 JSON；画布客户端自绘 |
| 文件管理 | `/tag/*`、`/library/duplicates|organize|…` | 操作 **服务器磁盘** |
| 路径 | `/paths` | 共享根目录多为 admin |
| 音源 | `/source/*` | 导入脚本多为 admin |
| 设置 | `/settings`、`/settings/ffmpeg/*` | ffmpeg 安装为 admin |
| 备份 | `/backup/export|import` | |
| 关于 | `/about` | 版本与 FPK 更新（admin） |

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

无 WS 时可轮询对应 `*-status` / `list` HTTP 接口。

## 角色

- `user`：搜索、播放、个人库、个人下载路径等
- `admin`：用户管理、共享路径、音源导入、ffmpeg/AI 安装、FPK 下载等（OpenAPI 中标注）

## 兼容说明

- Web 继续使用 `/api` + `filePath`；流 URL 可带 `ticket` 或 `token`
- 不强制迁移到 `/api/v1`
- 不提供第三方 OAuth / 开发者应用注册（本轮范围外）

## 重新生成规格

路由增删后执行：

```bash
node scripts/build-openapi.mjs
```

或 `npm run openapi:build`。
