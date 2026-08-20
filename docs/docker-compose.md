# 使用 docker-compose.yml 部署

用仓库根目录的 `docker-compose.yml` 拉取镜像并启动，无需在设备上编译源码。

## 文件说明

当前仓库中的 `docker-compose.yml` 内容如下（可整份复制到任意目录使用）：

```yaml
services:
  lemon-music:
    image: ghcr.io/jia070310/lemon-muisc:latest
    container_name: lemon-music
    ports:
      - "7983:7983"
    volumes:
      - ./data:/data
      - ./config:/config
    environment:
      - PORT=7983
      - DOWNLOAD_PATH=/data
      - CONFIG_PATH=/config
    restart: unless-stopped
```

| 项 | 含义 |
|----|------|
| `image` | GitHub 上的现成镜像 |
| `7983:7983` | 左边是宿主机端口，右边是容器端口 |
| `./data:/data` | 音乐下载、扫描目录 |
| `./config:/config` | 配置和数据库 |
| `restart: unless-stopped` | 开机或 Docker 重启后自动拉起 |

## 本机 / 服务器

1. 安装 Docker（需带 Compose 插件）。
2. 新建一个空目录，放入上面的 `docker-compose.yml`，或克隆仓库后进入项目根目录。
3. 按实际磁盘改 `volumes`（见下文「路径示例」）。
4. 启动：

```bash
docker compose pull
docker compose up -d
```

5. 浏览器打开 `http://127.0.0.1:7983`。远程机器则用 `http://设备IP:7983`。

首次使用：设置里导入并激活音源，再添加音乐文件夹（对应你挂到 `/data` 的目录）。

## 飞牛 NAS（Docker 项目）

1. 打开 **Docker** → **项目**（或 Compose）→ **添加**。
2. 粘贴本仓库的 `docker-compose.yml`。
3. 把 `./data`、`./config` 改成飞牛真实路径，例如：

```yaml
volumes:
  - /vol1/1000/music:/data
  - /vol1/1000/lemon-music-config:/config
```

4. 部署 / 启动。
5. 用 `http://飞牛IP:7983` 访问。

## 路径示例

```yaml
# Windows（注意用正斜杠或盘符路径）
volumes:
  - D:/Music:/data
  - D:/LemonMusic/config:/config

# Linux / 本机当前目录
volumes:
  - ./data:/data
  - ./config:/config

# 飞牛
volumes:
  - /vol1/1000/music:/data
  - /vol1/1000/lemon-music-config:/config
```

左边是 **NAS/电脑上的真实文件夹**，右边固定为容器内的 `/data`、`/config`，不要改右边。

## 改端口

例如改成宿主机 `8080`：

```yaml
ports:
  - "8080:7983"
```

访问 `http://IP:8080`。容器内仍是 `7983`，`PORT` 环境变量一般不用改。

## 日常命令

在 `docker-compose.yml` 所在目录执行：

```bash
docker compose up -d          # 启动
docker compose ps             # 状态
docker compose logs -f        # 日志
docker compose pull && docker compose up -d   # 更新镜像并重启
docker compose restart        # 重启容器
docker compose down           # 停止并删除容器（数据在挂载目录里，一般会保留）
```

## 常见问题

**拉不下来镜像**  
确认能访问 `ghcr.io`。若包被设为私有：

```bash
echo 你的GitHub令牌 | docker login ghcr.io -u 你的GitHub用户名 --password-stdin
docker compose pull
```

**页面打不开**  
看端口是否被占用、防火墙是否放行 `7983`，以及 `docker compose ps` 是否为 running。

**设置里找不到音乐文件**  
宿主机挂载到 `/data` 的路径，需要和设置里填写的「音乐文件夹」一致（容器内路径一般是 `/data` 或其子目录）。
