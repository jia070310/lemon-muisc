# 柠檬音乐下载 · Lemon Music

面向飞牛 NAS 的音乐搜索、试听、下载与标签管理工具。兼容落雪音乐（LX Music）自定义音源脚本。

当前版本：**v1.0.8**  
仓库：[https://github.com/jia070310/lemon-muisc](https://github.com/jia070310/lemon-muisc)

![搜索页：检索、试听队列与底栏播放器](docs/screenshots/search.png)

> 请仅用于个人已合法授权的音乐资源管理。请遵守当地法律法规及各平台服务条款，不要将本项目用于侵权或商业用途。

## 功能

- **搜索**：按关键词检索歌曲，支持音源提供的音质档位
- **试听**：底栏播放器、试听队列、上一首/下一首、循环与随机；队列可本地持久化
- **下载**：并发任务、自定义文件名、跳过已存在文件、按专辑分子目录；可选内嵌封面/歌词，以及独立 `.lrc`
- **标签编辑**：扫描本地目录、批量读写 ID3、封面与歌词拉取、按文件名匹配元数据
- **音源**：导入/激活落雪风格 `.js` 音源（本地文件或 URL）
- **飞牛 NAS**：Web UI、Docker / FPK 部署；在飞牛环境中可通过系统文件管理器选择文件夹
- **关于页**：检测 GitHub Release，有新版本时侧栏提示

## 技术栈

| 部分 | 说明 |
|------|------|
| 前端 | Vue 3 + Vue Router + Vite |
| 后端 | Node.js 20+、Express 5、WebSocket |
| 数据 | better-sqlite3（配置与任务） |
| 标签 | node-id3、music-metadata |
| 部署 | Docker 镜像（`ghcr.io/jia070310/lemon-muisc`）、飞牛 FPK |

默认 Web 端口：**7983**。

## 快速开始（本地开发）

需要 [Node.js](https://nodejs.org/) 20 或以上。

```bash
git clone https://github.com/jia070310/lemon-muisc.git
cd lemon-muisc
npm install
npm run dev
```

`npm run dev` 会同时启动：

| 地址 | 作用 |
|------|------|
| http://localhost:5174 | Vite 开发前端（改代码会热更新） |
| http://localhost:7983 | Express 后端（API、WebSocket、下载与标签） |

开发时请用 **5174** 打开页面；`/api` 和 `/ws` 会代理到 7983。

仅生产模式（需先构建前端）：

```bash
npm run build
npm start
```

然后访问 http://localhost:7983 。7983 读取的是 `dist/public`，改源码后必须重新 `build` 才会更新界面。

### 首次使用

1. 打开 **设置 → 音源管理**，导入落雪兼容的音源脚本并激活
2. 在 **设置 → 文件路径** 中添加音乐目录（下载保存路径从这些目录里选择）
3. 到 **搜索** 试听或下载；到 **标签编辑** 整理本地文件

## Docker Compose 部署

复制下面内容保存为 `docker-compose.yml`，把 `volumes` 改成你的目录后启动。完整说明见 [docs/docker-compose.md](docs/docker-compose.md)。

```yaml
version: "3"
services:
  lemon-music:
    image: ghcr.io/jia070310/lemon-muisc:latest
    ports:
      - "7983:7983"
    restart: unless-stopped
    environment:
      PORT: 7983
      DOWNLOAD_PATH: /music
      CONFIG_PATH: /config
    volumes:
      - "/Music/data:/music"
      - "/Music/downloads:/downloads"
      - "/Music/config:/config"
```

```bash
docker compose up -d
```

飞牛把 volumes 左边改成例如 `/vol1/1000/music`、`/vol1/1000/music-downloads` 和 `/vol1/1000/lemon-music-config`。  考虑国内网络可以把ghcr.io/jia070310/lemon-muisc:latest修改为 加速器 ghcr.1ms.run/jia070310/lemon-muisc:latest
**如何改 volumes、ghcr 加速** → [docs/docker-compose.md](docs/docker-compose.md)

> FPK 安装包体积小，**不内置镜像**；安装时由飞牛 Docker 拉取 `ghcr.io`。国内网络说明见 [docs/fpk-install.md](docs/fpk-install.md)。

## 飞牛 NAS（FPK）

应用 ID：`lemon-music`，桌面显示名：**柠檬音乐下载**。  
安装时飞牛 Docker 拉取 `ghcr.io/jia070310/lemon-muisc:latest`（包约 40KB）。

**安装向导**（打开安装界面时）：可选拉取方式、超时、自定义镜像地址；点击安装后在**同一窗口**显示拉取进度。详见 [docs/fpk-install.md](docs/fpk-install.md)。

### 打包

```powershell
npm run fpk:build
```

生成 `fpk/lemon-music.fpk`，拷到飞牛 **应用中心 → 手动安装**。

### 国内拉取镜像

- 走 **飞牛内置 Docker** 的 `docker pull`
- Docker Hub **镜像加速** 对 `ghcr.io` **无效**；可用 `ghcr.1ms.run/...` 等前缀或向导自定义镜像 → [docs/fpk-install.md](docs/fpk-install.md)

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 同时启动前后端开发服务 |
| `npm run build` | 构建前端到 `dist/public` |
| `npm start` | 仅启动后端（提供 API 与静态页面） |
| `npm run docker:build` | 本地构建 Docker 镜像 `lemon-music:latest` |
| `npm run fpk:build` | 打包 FPK（不内置镜像，安装时拉 ghcr.io） |

## 目录结构

```
├── docs/                # 部署教程（compose / fpk / volumes / ghcr 加速）
├── .github/workflows/   # GHCR 镜像 + 离线 FPK 构建
├── src/                 # Vue 前端
├── server/              # Express 后端与音源运行时
├── public/              # 静态资源（图标等）
├── fpk/                 # 飞牛应用打包目录
├── scripts/             # FPK 构建脚本
├── Dockerfile
└── docker-compose.yml
```

## 版本检测

关于页会请求 GitHub `jia070310/lemon-muisc` 的 **latest release**。未发布 Release 时会显示「仓库暂无发布版本」。

## 致谢与声明

音源脚本需自行准备，本仓库不内置任何第三方平台音源。项目定位为 NAS 上的个人音乐整理工具，与落雪音乐桌面版无官方从属关系。

## License

个人使用。若需二次分发，请自行补充许可证并保留本声明。
