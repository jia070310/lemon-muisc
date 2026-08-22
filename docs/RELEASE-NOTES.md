# 柠檬音乐下载 v1.0.6

## 更新内容

### 飞牛 FPK 安装 / 启用
- 安装窗口下方显示 **「实际拉取进度 XX%」**，按 layer 实时更新（上方 55% 为飞牛系统进度）
- 启用时**仅使用本地镜像**，不再后台长时间拉取
- 拉取失败则安装 / 升级直接报错，避免「装完还要等」
- 网络极差时可选手动 SSH pull +「跳过拉取」

### v1.0.5 — 酷我 / 酷狗歌词修复
- 酷我改用 www.kuwo.cn 接口，修复大量歌曲歌词为空
- 酷狗携带 album_audio_id，提升歌词命中率

## 安装 / 更新

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest
docker tag ghcr.1ms.run/jia070310/lemon-muisc:latest lemon-music:latest
```

应用中心：**手动安装** `lemon-music-1.0.6.fpk` → 默认「在线拉取」，等待安装完成 → 配置访问权限 → 启用

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.6`
