# 柠檬音乐下载 v1.0.6

## 更新内容

### 飞牛 FPK 安装 / 启用
- 默认 **在线拉取 ghcr.1ms.run**，安装 / 升级都会从仓库拉镜像，不会跳过更新
- install_init 秒退；**install_callback** 中用 docker pull（与 SSH 相同）
- 40% 为解压，55% 起为镜像下载
- **安装 / 升级时完成拉取**，到 100% 才算装完；启用时仅用本地镜像
- 拉取失败则安装 / 升级直接报错
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
