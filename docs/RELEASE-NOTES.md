# 柠檬音乐下载 v1.0.6

## 更新内容

### 飞牛 FPK 安装 / 启用（2026-08-23 最新修复版）

- **禁止 compose 使用短名 `lemon-music`**：短名会被飞牛当成 Docker Hub（`registry-1.docker.io`）拉取并超时；compose 固定写 `ghcr.1ms.run/jia070310/lemon-muisc:latest`
- **安装确认镜像后软启动容器**：减少「启用」时偶发「docker不可用」导致无容器的情况
- **安装拉取不死锁**：飞牛 `docker-project` 主拉取 + 脚本后台短 pull（≤120s）+ `docker images` 列表轮询，避免卡住数十分钟
- **80% 假死修复**：镜像已在「本地镜像」列表即可判定成功；安装阶段不与飞牛抢建容器
- 安装向导可选 **国内加速**：1ms / 南大 nju / dockerproxy / DaoCloud；也可「跳过拉取」
- 默认在线拉取 `ghcr.1ms.run`；本地已有镜像时建议选手动安装 +「跳过拉取」
- 启用时优先用本地镜像；Docker 不可用时给出可操作提示

### v1.0.5 — 酷我 / 酷狗歌词修复

- 酷我改用 www.kuwo.cn 接口，修复大量歌曲歌词为空
- 酷狗携带 album_audio_id，提升歌词命中率

## 安装 / 更新

应用中心：**手动安装** [`lemon-music-1.0.6.fpk`](https://github.com/jia070310/lemon-muisc/releases/tag/v1.0.6)  
（勿点卡片「更新」；覆盖安装即可）

本地已有镜像时：向导选 **「跳过拉取」** → 装完点 **「启用」** → `http://<NAS_IP>:7983`

```bash
# 可选：SSH 预拉 / 打短名
docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest
docker tag ghcr.1ms.run/jia070310/lemon-muisc:latest lemon-music:latest
```

## Docker 镜像

- **无需单独升镜像**：本轮仅 FPK 安装脚本修复，应用本体与 v1.0.6 镜像一致
- `ghcr.io/jia070310/lemon-muisc:latest`（可用加速：`ghcr.1ms.run/jia070310/lemon-muisc:latest`）
- `ghcr.io/jia070310/lemon-muisc:1.0.6`
