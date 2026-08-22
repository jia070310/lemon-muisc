# 柠檬音乐下载 v1.0.6

## 更新内容

### 飞牛 FPK 安装 / 启用
- 安装向导默认「跳过拉取」，避免进度停在 55%
- **启用**：拉镜像限时 90 秒，无镜像时快速失败并提示 SSH 命令
- 启用时路径未配置则使用默认目录，不再直接失败
- 容器已运行或挂载校验失败但进程正常时，启用视为成功

### v1.0.5 — 酷我 / 酷狗歌词修复
- 酷我改用 www.kuwo.cn 接口，修复大量歌曲歌词为空
- 酷狗携带 album_audio_id，提升歌词命中率

## 安装 / 更新

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest
docker tag ghcr.1ms.run/jia070310/lemon-muisc:latest lemon-music:latest
```

应用中心：**手动安装** `lemon-music-1.0.6.fpk` → 选「跳过拉取」→ 停用 → 启用

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.6`
