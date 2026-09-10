# 柠檬音乐 Lemon Music · 开发者指南

> 面向飞牛 NAS 与自托管环境的 Web 音乐工具：多平台搜索、歌单发现、在线试听、批量下载、本地标签管理。
> 本文档基于 v1.2.13.9 源码分析生成，供开发与二次开发参考。

## 1. 项目概览

| 维度 | 说明 |
|------|------|
| 定位 | NAS 个人音乐整理工具，兼容落雪音乐（LX Music）自定义音源脚本 |
| 核心能力 | 多平台搜索（酷我/酷狗/QQ/网易云/咪咕）、发现页（歌单/榜单/新歌/新碟）、试听播放、批量下载、本地标签编辑（MP3/FLAC/WAV/APE）、音乐库管理（歌手/专辑/歌单/漫游）、文件管理（查重/整理）、播放自动匹配标签、随机播放、多用户与音源健康度 |
| 部署形态 | 飞牛 FPK 原生应用（不依赖 Docker），默认端口 7983；亦可本地开发运行 |
| 音源体系 | 内置 `musicSdk.js` 直连平台接口 + 用户导入的落雪/澜音脚本沙箱运行时 |
| 仓库 | https://github.com/jia070310/lemon-muisc |

## 2. 技术栈

| 部分 | 技术 | 说明 |
|------|------|------|
| 前端 | Vue 3 + Vue Router 5 + Vite 8 | Composition API，手写 store（未用 Pinia） |
| 后端 | Node.js 20+、Express 5、ws | ESM 模块，单进程常驻，WebSocket 实时推送 |
| 数据层 | better-sqlite3 | WAL 模式，单文件 `lx-music.db` |
| 标签处理 | node-id3、music-metadata | MP3(ID3v2)/FLAC 读写 + 自实现 WAV/APE 写入 |
| 音源沙箱 | vm（Node 内置）+ needle | 落雪脚本经 vm 沙箱隔离运行 |
| 部署 | FPK 打包（PowerShell） | 依赖应用中心 Node.js v22，x86/ARM 双架构 |

## 3. 目录结构

```
lemon-muisc/
├── src/                          # 前端（Vue 3）
│   ├── main.js / App.vue / router.js
│   ├── api.js                    # 统一 API 客户端（并发限流6、JWT、401跳转）
│   ├── ws.js                     # WebSocket 客户端（指数退避重连）
│   ├── views/                    # Search/Discover/Download/Library/LibraryArtists/TagEditor/FileManager...
│   ├── components/               # PlayerBar、FullscreenPlayer、TagFileEditor 等 22 个组件
│   ├── stores/                   # 手写状态库：player(2298行)/library(1948行)/discover...
│   ├── composables/              # 批量下载、虚拟列表、封面渐进加载
│   ├── utils/                    # 认证、音质、歌词、封面、主题等
│   └── styles/global.css
├── server/                       # 后端（Node ESM）
│   ├── index.js / ws.js / db.js  # 入口 / WebSocket / SQLite
│   ├── musicSdk.js               # 内置音源 SDK（2524行，四大平台直连）
│   ├── discoverSdk.js            # 发现页 SDK（新歌/新碟/榜单）
│   ├── sourceManager.js          # 音源脚本加载沙箱与激活管理
│   ├── sourceFault.js            # 音源故障判定（临时网络错误 vs 永久故障）
│   ├── meta.js                   # 标签写入统一入口（按扩展名路由）
│   ├── routes/                   # 16 个 Express 路由模块
│   └── utils/                    # 46 个工具模块（filePaths/userSettings 等）
├── docs/                         # 发布说明、安装说明、截图
├── scripts/                      # reset-password / reset-users / build-fpk.ps1
├── fpk/                          # 飞牛打包骨架（manifest、cmd、wizard）
├── config/                       # 运行时配置目录
├── vite.config.js                # @→src 别名，/api 与 /ws 代理 → 7983
└── package.json                  # v1.2.13.9，Node >= 20
```

约 119 个 JS + 50 个 Vue 文件。体量最大：`musicSdk.js`(2524)、`routes/download.js`(1637)、`stores/player.js`(2298)、`stores/library.js`(1948)、`views/Settings.vue`(3207)。

## 4. 总体架构

### 端口与进程

```
浏览器 ─► Vite dev(5174) ─代理─► Express(7983)
  ├─ /api/* HTTP+JWT ───────────► better-sqlite3 (config/lx-music.db)
  │                              ├─ 音源沙箱 (vm) ─► 平台 API
  └─ /ws WebSocket               ├─ 内置 SDK (needle) ─► 平台 API
                                 ├─ 下载队列（内存Map+任务表）
                                 └─ 本地文件系统（音乐库/下载/标签）
```

### 认证体系

- `POST /api/auth/login` 签发会话 → `sessions` 表；前端存 `localStorage["lemon-auth-token"]`
- 除 `/auth/*`、`/health` 外，所有 `/api/*` 均经 `requireAuth` 中间件
- WebSocket 以 URL 参数 `?token=` 校验（`validateWsToken`）
- 音频流 URL 由 `appendStreamToken` 追加短期 token（`/api/play/`、`/api/tag/cover`）
- 角色：`admin`（用户/路径管理）、`user`（普通用户）

## 5. 前端设计

### 路由

| 路径 | 页面 |
|------|------|
| `/search` | 搜索（默认首页） |
| `/discover` 及子页 | 发现（playlists/new-songs/new-albums/ranks） |
| `/library` 及子页 | 音乐库（playlists/album/albums/genres/artists/artist） |
| `/library/artists` | 歌手列表（分页卡片） |
| `/library/artist` | 歌手详情（全部歌曲、播放全部/随机、加入列表、收藏/歌单） |
| `/file-manager` | 文件管理（查重 / 整理） |
| `/download` | 下载管理 |
| `/tag`、`/tag/track` | 标签编辑 |
| `/settings` / `/about` | 设置 / 关于 |
| `/login /setup /reset-password /verify-email /auth-callback` | 认证（public） |

路由守卫：先 `initAuth()` → 需要初始化跳 `/setup` → 未登录跳 `/login`。

### 状态库

| 模块 | 职责 |
|------|------|
| `player` | 播放核心：队列、进度、歌词/封面、换源、全屏、睡眠定时、漫游/随机续播、播放自动匹配标签 |
| `library` | 音乐库：扫描、歌单、收藏、查重、歌手分组、漫游歌单（roamTracks） |
| `discover` | 发现页分区数据与分页 |
| `tagMatch` | 标签匹配任务状态（并发、暂停/停止） |
| `navigation` | 路由加载动画 |
| `downloadGuard` | 下载前试听时长守卫提示 |

### 关键组件

| 组件 | 说明 |
|------|------|
| `PlayerBar.vue`(1769行) | 底栏播放器：控制、进度、频谱、当前曲目下载、平台徽章、换源 |
| `FullscreenPlayer.vue`(1328行) | 全屏播放页：大封面、滚动歌词、沉浸频谱 |
| `TagFileEditor.vue`(727行) | 单文件标签编辑器 |
| `discover/*` | 发现页分区组件（卡片轮播、滑动分页、骨架屏） |
| `SpectrumVisualizer.vue` | Web Audio 频谱可视化 |

### Composables

`useVirtualTrackList`/`usePagedTrackRows`（虚拟滚动/分页）、`useBatchDownload`（批量下载+降档确认）、`useProgressiveTrackCovers`（封面渐进加载）、`useUpdateCheck`（版本检查）。

## 6. 后端设计

### 服务入口（server/index.js）

启动流程：初始化 SQLite → 迁移文件路径 → 刷新音源元数据 → 挂载 `/api` → 托管前端静态产物（SPA fallback）→ 启动 WebSocket → **恢复各用户激活音源**（跳过故障源）→ 初始化下载队列 → 内存守卫 → 遥测。SIGINT/SIGTERM 优雅停机。

### 音源沙箱（sourceManager.js）

- **LX Music 规范**：暴露 `lx` 全局（`send/on/request/utils`），utils 提供 crypto(AES/RSA/MD5)、buffer、zlib；request 经服务端代理
- **澜音 cerumusic 规范**：`createCerumusicApi()` 创建兼容对象并归一化

支持平台：`kw/kg/tx/wy/mg`（酷我/酷狗/QQ/网易云/咪咕）；动作：`musicUrl/lyric/pic`；音质：`128k/320k/flac/flac24bit/hires/atmos/atmos_plus/master`。

安全：沙箱 console 置空、require 白名单、20s 初始化超时、同 id 先卸后装；故障区分临时网络错误（不封源）与永久故障（停用并广播 `source.fault`）。

## 7. 数据模型（config/lx-music.db）

| 表 | 说明 |
|----|------|
| `settings` | 全局设置 KV（下载/音源/播放器/UI/邮件） |
| `user_apis` | 导入的音源脚本与元数据 |
| `download_tasks` | 下载任务持久化 |
| `library_index` | 音乐库扫描索引（meta_json 缓存） |
| `users` | 账号（admin/user，含 email/email_verified） |
| `sessions` | 登录会话 |
| `user_settings` | 个人歌单/收藏/音源启用 |
| `auth_tokens` | 邮件验证/找回令牌 |

`migrateSchema()` 通过 PRAGMA table_info 检测缺失列自动 ALTER，实现平滑升级。

## 8. 核心机制

### 8.1 下载流水线

`/download/add` → 质量档位校验（降档确认）→ 同名文件检测（询问/跳过/覆盖）→ 取链（同音质3次尝试+换源兜底）→ 下载+试听时长校验（短片段自动取消）→ 写入标签/封面/歌词。

- 并发上限可配；中断可续传（await_exist/await_source 等确认态）
- 「真 FLAC」校验：无损档位检查 Content-Type 与文件头，防假无损
- 状态经 `download:added` / `download:cleared` 推送；结束写入 library 索引并广播 `library:changed`

### 8.2 播放链路与换源

`POST /api/play/url` → 构建 musicInfo → URL 缓存（playUrlCache）→ 音源请求（8并发/25s超时）→ 校验 → 代理或直链 + 流 token。失败返回 `409 SOURCE_FALLBACK_REQUIRED`，前端弹「换平台/换音源」。

音频代理：
- `GET /api/play/local` — 本地文件 Range 流（白名单目录）
- `GET /api/play/local-ape` — APE 经 ffmpeg 转 WAV 缓存后流式
- `GET /api/play/proxy` — 远程反代（平台 Referer、Range 透传、8路上限、SSRF 防护拒绝内网）

### 8.3 试听短片段自动恢复

同平台换音源 → 其它平台搜同名曲 → 完整后继续播，减少「无法播放该音频格式」误报。

### 8.4 标签系统

`meta.js` 按扩展名分发：MP3(node-id3)/FLAC(music-metadata)/WAV/APE(自实现)。匹配：`matchByFilename/matchByArtistTitle`，支持手动检测、按文件名批量重设、并发 1–6 路。

### 8.5 音乐库、歌手与查重

扫描写入 `library_index`（mtime 增量）→ 内存缓存 → 智能歌单。查重按「标题+歌手」聚合，同组至少保留一份。

- **歌手**：`groupArtists(libraryTracks)` 按歌手聚合（曲目数 / 专辑数），支持 `artistToId/artistFromId`；缓存三层：SQLite `library_index` / `sessionStorage("lemon-library-tracks-v1")` / 内存 `libraryTracks`，变更（`removeLibraryTracks`/`ingestLibraryTracks`）同步刷 session 快照，整理后 `reloadLibraryTracksFromServer(api)` 全量重载
- **整理（organize）**：`POST /organize` 按歌手迁移（`scope: files` 勾选文件；目录目录名安全化、冲突加序号、EXDEV 跨盘回退复制+删除、目标目录自动加入扫描、迁移后广播 `library:removed`/`library:changed`）
- **清理**：`delete-files` 用 `isAllowedMediaPath(path, {allowMissing:true})`，文件不存在只清缓存不真删，避免幽灵记录报「路径不在允许目录内」

### 8.6 漫游歌单与随机续播

- 智能歌单 `SMART_CARDS` 含 `random-start`（随机播放入口，放「最新添加」前）与 `roam`（漫游歌单，localStorage 按用户持久化）
- `randomStartPlay`：抽 10 首（`ROAM_PICK_SIZE`）→ `setRoamTracks` → `startPlayTracks(tracks,'roam')` 立即播放
- 漫游续播（`activeDynamicList==='roam'`）：`onTrackEnded` 走 `playNextRoamAuto`——`splice` 删已播曲目 → `maybeRefillRoamQueue`（剩余 ≤ `ROAM_REFILL_THRESHOLD`=3 时再抽补 10 首去重追加）→ `resolveNextRoamIndex` 直接播当前位（避免跳过）→ 失败自动跳过下一首；补不足则清空 `activeDynamicList` 停止
- 普通列表（非 roam）不受影响；从队列移除曲目同步从漫游歌单移除

### 8.7 播放自动匹配标签

- 设置 `player.autoMatchOnPlay`（白名单 `server/utils/userSettings.js`；前端导出 `PLAYER_AUTO_MATCH_ON_PLAY_KEY`）
- 播放本地文件成功 → `fetchLocalMeta` → `autoMatchMissingOnPlay`：开关开启且 `isMissingLocalTag`（album 空 || 无封面 || 无歌词，与标签编辑器判定一致）→ `api.tag.matchBatch` → `writeBatch` 保存 → 刷新播放器元数据；`autoMatchedOnPlay` Set 去重防反复触发，失败静默

### 8.8 其它

`memoryGuard.js` 内存监控；`telemetry.js` 匿名统计（可关）；FPK 打包 manifest 声明依赖 `nodejs_v22`、端口 7983。

## 9. API 参考（/api 前缀）

> 除 `/auth/*`、`/health` 外均需 `Authorization: Bearer <token>`。

### 认证 auth
- POST `/auth/login` `/auth/logout` · GET `/auth/me` `/auth/status`
- POST `/auth/setup` `/auth/setup/test-mail`
- POST `/auth/forgot-password` `/auth/reset-password` `/auth/change-password`
- POST `/auth/verify-email` `/auth/bind-email` `/auth/resend-verification` `/auth/mail/test`(admin)
- GET/POST `/auth/users` · POST `/auth/users/:id/reset-password` · DELETE `/auth/users/:id`（admin）

### 音源 source
- GET `/source/list` · POST `/source/import`(文本/文件) `/source/import-url` · DELETE `/source/:id`
- POST `/source/activate/:id` `/source/deactivate/:id` · GET `/source/active`
- GET `/source/fault` · POST `/source/fault/delete|dismiss|reimport`
- POST `/source/health/report|dismiss|clear` · POST `/source/request` `/source/refresh-meta`

### 搜索 / 发现
- GET `/search?keyword=&source=&page=` · `/search/album` · `/search/playlist` · `/search/album/detail` · `/search/sources`
- GET `/album/search` `/album/:id`
- GET `/playlist?url=&source=`(partial) · `/playlist/recommend?source=&sort=hot|new` · `/playlist/sources`
- GET `/discover/new-songs` `/new-albums` `/toplists` `/toplist` `/regions`

### 播放 play
- POST `/play/url` `/play/lyric` `/play/cover`
- GET `/play/local` `/play/local-ape` `/play/proxy` `/play/cover-img`

### 下载 download
- GET `/download/list` · POST `/download/add` · DELETE `/download/:id`
- POST `/download/pause/:id|resume/:id|pause-all|resume-all`
- POST `/download/dismiss` `/dismiss-all` `/clear-completed`
- 确认：`confirm-downgrade/:id` `reject-downgrade/:id` `confirm-exist/:id`(applyToRest) `skip-exist/:id` `confirm-source/:id` `reject-source/:id`

### 标签 tag
- GET `/tag/cover?path=` · POST `/tag/read` `/tag/read-batch` `/tag/write` `/tag/write-batch`
- POST `/tag/list-dir` `/tag/scan` `/tag/match` `/tag/match-apply` `/tag/match-batch`
- 旧路径 `/tag/dirs`（deprecated，由 /api/paths 取代）

### 音乐库 / 路径 / 其它
- GET `/library/tracks` · POST `/library/sync|scan-start|scan-batch` · GET `/library/scan-settings|scan-status` · PUT `/library/scan-settings`
- GET/PUT `/library/playlists` · GET/PUT `/library/user-data`
- GET `/library/duplicates` · POST `/library/delete-files`(allowMissing 宽容幽灵记录) · POST `/library/organize`(scope: all|dir|files，按歌手迁移)
- GET/POST/PUT/DELETE `/paths`(写操作 admin) · GET `/paths/stats` · PUT `/paths/download|download/mode|download/personal`
- GET/PUT `/settings` · GET `/settings/global`（播放自动匹配取 `player.autoMatchOnPlay`）
- GET `/backup/export` · POST `/backup/import`(mode: replace) · GET `/about` `/health`

## 10. WebSocket 事件

连接：`ws://host/ws?token=<jwt>`（失败 4401 关闭）；消息格式 `{ type, data }`。

| 事件 | 范围 | 说明 |
|------|------|------|
| `download:added` / `download:cleared` | 用户级 | 下载任务新增/清空 |
| `library:changed` / `library:removed` | 全员 | 音乐库变更（整理/保存标签后触发，驱动前端全量重载） |
| `library:scan-progress` / `library:scan-complete` | 全员 | 扫描进度/完成 |
| `library:user-data-changed` | 用户级 | 个人歌单/收藏变更 |
| `source.fault` | 用户级 | 音源故障推送 |

客户端：指数退避重连（1s→15s）、弱网自动恢复。

## 11. 开发与部署

```bash
git clone https://github.com/jia070310/lemon-muisc.git
cd lemon-muisc
npm install
npm run dev        # 前端 :5174 + 后端 :7983
npm run build      # → dist/public
npm start          # Express 托管
```

环境变量：`PORT`(7983)、`DOWNLOAD_PATH`(./data)、`CONFIG_PATH`(./config)。

账号恢复：

```bash
npm run auth:reset-password -- --list
CONFIG_PATH=/你的配置目录 npm run auth:reset-password -- admin 新密码
npm run auth:reset-users -- --list   # 预览
npm run auth:reset-users -- --yes    # 清空所有用户重新初始化
```

飞牛部署：

```bash
npm run fpk:build                # → fpk/lemon-music-1.2.13.9-{x86,arm}.fpk
npm run fpk:build:no-telemetry   # 无上报测试包
```

> 安装向导填本机绝对路径；依赖 Node.js v22；卸载默认保留配置，不删音乐文件。

## 12. 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 前后端并行开发 |
| `npm run build` / `npm start` | 构建 / 启动 |
| `npm run auth:reset-password` | 重置用户密码（--list 列出） |
| `npm run auth:reset-users` | 清空用户重新初始化（须 --yes） |
| `npm run fpk:build[:no-telemetry]` | 打包飞牛 FPK |

CI：`.github/workflows/fpk.yml` 自动构建双架构 FPK。