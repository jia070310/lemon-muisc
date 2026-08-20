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

飞牛 NAS 可把路径改成盘符下的实际目录，例如：

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
      - "/vol1/1000/music:/data"
      - "/vol1/1000/lemon-music-config:/config"
```

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
docker compose up -d
```

浏览器打开 `http://127.0.0.1:7983`（NAS 用 `http://设备IP:7983`）。

```bash
docker compose pull && docker compose up -d   # 更新
docker compose logs -f                        # 日志
docker compose down                           # 停止
```
