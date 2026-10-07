# Docker 部署说明

柠檬音乐支持两种部署方式，互不影响：

| 方式 | 适用 | HTTPS |
|------|------|--------|
| **飞牛原生 FPK** | 飞牛应用中心 | 自动读取飞牛「系统设置 → 证书」，一般不用配 |
| **Docker**（本文） | 任意 Linux 服务器 / NAS Docker / 群晖等 | **需自行挂载证书**（或只用 HTTP） |

飞牛商店安装的是原生 FPK，**不要**再把本文的 Docker 套进 FPK。Docker 面向自建服务器与通用容器环境。

---

## 1. 快速开始（HTTP）

需要已安装 Docker 与 Docker Compose。

```bash
git clone https://github.com/jia070310/lemon-muisc.git
cd lemon-muisc

mkdir -p data/music data/downloads data/config

# 本机构建并启动
docker compose up -d --build
```

或使用已发布镜像（仓库名历史拼写为 `lemon-muisc`）：

```bash
docker compose pull
docker compose up -d
```

浏览器打开：`http://服务器IP:7983`

首次登录默认账号：`admin123` / `admin123`，登录后立即改密。

### 目录挂载

| 宿主机（示例） | 容器内 | 用途 |
|----------------|--------|------|
| `./data/music` | `/music` | 音乐库 |
| `./data/downloads` | `/downloads` | 下载保存 |
| `./data/config` | `/config` | 数据库与设置 |

可按需改成绝对路径，例如 `/mnt/music:/music`。

### 常用环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `7983` | 监听端口 |
| `DOWNLOAD_PATH` | `/downloads` | 下载目录（容器内） |
| `CONFIG_PATH` | `/config` | 配置目录（容器内） |
| `MUSIC_HOST_PATH` | （空） | 可选，界面展示用的宿主机音乐路径 |
| `DOWNLOADS_HOST_PATH` | （空） | 可选，界面展示用的宿主机下载路径 |
| `HTTPS` | （自动） | `1` 强制开 HTTPS；`0` 强制 HTTP |
| `SSL_CERT` | （空） | 证书文件路径（容器内），如 `/certs/fullchain.pem` |
| `SSL_KEY` | （空） | 私钥路径（容器内），如 `/certs/privkey.pem` |

---

## 2. HTTPS（Docker 必须自己挂证书）

Docker 容器里**没有**飞牛证书目录，不会自动拿到系统证书。要用 HTTPS，二选一：

1. **应用内 TLS（推荐简单场景）**：把证书文件挂进容器，设置 `SSL_CERT` / `SSL_KEY`
2. **前面再挂反向代理**：Caddy / Nginx / Traefik 终止 TLS，容器继续 HTTP `:7983`（本文不展开反代细节）

### 2.1 准备证书文件

把下列两个文件放到项目旁的 `certs/` 目录（名称可改，与 compose 一致即可）：

```text
certs/
  fullchain.pem   # 完整证书链（含中间证书）
  privkey.pem     # 私钥
```

常见来源：

- **Let's Encrypt**（certbot / acme.sh）：一般是 `fullchain.pem` + `privkey.pem`
- **云厂商 / 免费 DV 证书**：下载后通常得到 `.crt` / `.pem` 与 `.key`，重命名或改 compose 路径即可
- **自签**（仅内网测试）：

```bash
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/privkey.pem \
  -out certs/fullchain.pem \
  -subj "/CN=localhost"
```

自签证书浏览器会提示不安全，需手动信任；生产请用正式域名证书。

### 2.2 用叠加 compose 启用 HTTPS

```bash
mkdir -p certs
# 放入 fullchain.pem、privkey.pem 后：

docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
```

`docker-compose.https.yml` 会：

- 挂载 `./certs` → 容器内 `/certs`（只读）
- 设置 `HTTPS=1`、`SSL_CERT=/certs/fullchain.pem`、`SSL_KEY=/certs/privkey.pem`

启动后访问：**`https://服务器IP或域名:7983`**（同一端口，协议变为 https）。

日志中应出现类似：

```text
Lemon Music running at https://[::]:7983
HTTPS enabled: /certs/fullchain.pem
```

### 2.3 不改叠加文件时手动挂载

也可直接改 `docker-compose.yml`：

```yaml
services:
  lemon-music:
    environment:
      HTTPS: "1"
      SSL_CERT: /certs/fullchain.pem
      SSL_KEY: /certs/privkey.pem
    volumes:
      - ./data/music:/music
      - ./data/downloads:/downloads
      - ./data/config:/config
      - ./certs:/certs:ro
```

### 2.4 证书更新

证书续期后，用新文件覆盖 `certs/` 里对应文件，然后重启容器：

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml restart
```

### 2.5 强制关闭 HTTPS

```yaml
environment:
  HTTPS: "0"
```

---

## 3. 与飞牛 FPK 的差异（对照）

| 项目 | 飞牛 FPK | Docker |
|------|----------|--------|
| 安装 | 应用中心 FPK | `docker compose` |
| 运行时 | 商店 Node.js v22 | 镜像内 Node 22 |
| 证书 | 自动读飞牛证书 | **自行挂载** `SSL_CERT` / `SSL_KEY` |
| 默认协议 | 有证书 → HTTPS | 无证书 → HTTP；挂了证书 → HTTPS |
| 配置目录 | `/volX/@appdata/lemon-music/config` | 你映射的 `/config` |
| 重置密码 | 见登录页「忘记密码」（`node .../reset-password.js`） | 见下方 |

---

## 4. 重置管理员密码（容器内）

```bash
docker compose exec lemon-music \
  node scripts/reset-password.js --list

docker compose exec lemon-music \
  node scripts/reset-password.js 用户名 新密码
```

`CONFIG_PATH` 已在环境变量里指向 `/config`，一般不必再写。

---

## 5. 更新镜像

```bash
docker compose pull
docker compose up -d
```

本机构建：

```bash
docker compose up -d --build
```

数据在 `data/`（或你改过的挂载）里，更新镜像不会清库。

---

## 6. 中国大陆拉取 GHCR 较慢时

可先用镜像站拉取再改 tag：

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest
docker tag ghcr.1ms.run/jia070310/lemon-muisc:latest ghcr.io/jia070310/lemon-muisc:latest
docker compose up -d
```

或把 `docker-compose.yml` 里的 `image:` 改成你可用的镜像地址。

---

## 7. 健康检查与端口

- 应用监听容器内 `7983`（HTTP 或 HTTPS，由是否挂证书决定）
- WebSocket 路径：`/ws`（同一端口）
- OpenAPI 文档：`http(s)://主机:7983/api/docs`
