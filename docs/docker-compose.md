# Docker Compose 部署

复制下面内容，保存为 `docker-compose.yml`。把 `volumes` 里的路径改成你的音乐目录和配置目录，然后启动。

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
      DOWNLOAD_PATH: /data
      CONFIG_PATH: /config
    volumes:
      - "~/Music/data:/data"
      - "~/Music/config:/config"
```

## 修改 volumes 路径

格式：`宿主机路径:容器路径`

```yaml
volumes:
  - 左边改这里:/data      # 音乐下载、扫描
  - 左边改这里:/config    # 配置、数据库
```

**只改冒号左边**，右边 `/data`、`/config` 不要改（与 `DOWNLOAD_PATH`、`CONFIG_PATH` 对应）。

### 飞牛 NAS

在文件管理里复制真实路径，例如：

```yaml
volumes:
  - "/vol1/1000/music:/data"
  - "/vol1/1000/lemon-music-config:/config"
```

### Windows 本机

```yaml
volumes:
  - "D:/Music:/data"
  - "D:/LemonMusic/config:/config"
```

### 使用 compose 同目录下的文件夹

在 `docker-compose.yml` 旁边建 `data`、`config` 两个文件夹：

```yaml
volumes:
  - "./data:/data"
  - "./config:/config"
```

### 飞牛 Docker 项目界面（不改文件）

1. **Docker → 项目 → 添加/编辑**
2. 粘贴 compose 内容，直接改 `volumes` 左边路径
3. 保存并部署

### 修改后生效

```bash
docker compose down
docker compose up -d
```

### 与设置页的关系

挂载到 `/data` 的目录，需在应用 **设置 → 文件路径** 里添加（容器内路径一般为 `/data` 或其子目录）。

---

## ghcr.io 镜像加速（国内）

飞牛 **Docker → 镜像加速** 里的 `registry-mirrors` **只对 docker.io 有效**，不会自动加速 `ghcr.io`。

可选方式：

| 方式 | 示例 |
|------|------|
| 换加速前缀拉取 | `ghcr.1ms.run/jia070310/lemon-muisc:latest` |
| 轩辕等专属 GHCR 域名 | `xxx-ghcr.xuanyuan.run/jia070310/lemon-muisc:latest` |
| 同步到阿里云 ACR 等 | `registry.cn-hangzhou.aliyuncs.com/命名空间/lemon-music:latest` |

把 `docker-compose.yml` 里的 `image:` 改成上述地址即可。FPK 安装可在向导选「自定义镜像地址」。

---

## 字段说明

| 字段 | 说明 |
|------|------|
| `image` | GitHub 镜像，无需本地编译 |
| `ports` | 左边是访问端口，右边固定 `7983` |
| `DOWNLOAD_PATH` / `/data` | 下载与扫描的音乐目录 |
| `CONFIG_PATH` / `/config` | 配置与数据库 |
| `volumes` 冒号左边 | **改这里**：你电脑或 NAS 上的真实路径 |
| `volumes` 冒号右边 | 不要改 |

## 启动

```bash
docker compose pull
docker compose up -d
```

浏览器打开 `http://127.0.0.1:7983`（NAS 用 `http://设备IP:7983`）。

```bash
docker compose pull && docker compose up -d   # 更新
docker compose logs -f                        # 日志
docker compose down                           # 停止
```
