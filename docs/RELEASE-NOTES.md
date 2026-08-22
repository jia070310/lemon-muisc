# 柠檬音乐下载 v1.0.6

## 更新内容

### 飞牛 FPK 安装 / 启用（2026-08-22 修复版 FPK）
- 修复安装脚本 **无 Docker 权限**（`permission denied`）时仍显示「安装完成」的问题；必要时自动尝试 `sudo docker`
- 修复 **retag / compose 镜像名被安装日志污染**（日志混入 `lemon-music:latest`）导致启用失败
- 拉取结果需 **日志 + 本地 inspect 双重确认**，避免假成功
- `install_init` 仍秒退（避免 40% 卡住）；**install_callback** 中在线 `docker pull`（与 SSH 相同）
- 默认 **在线拉取 ghcr.1ms.run**，安装 / 升级都会从仓库拉镜像
- 40% 为解压，55% 为飞牛系统进度；请看安装窗口下方 **「实际拉取进度 xx%」**
- **安装 / 升级时完成拉取**，到 100% 才算装完；启用时仅用本地镜像
- 拉取失败则安装 / 升级 **直接报错**（不再静默完成）
- 网络极差或 Docker 不稳定时可选手动 SSH pull +「跳过拉取」
- 安装向导可选 **国内镜像加速**：1ms.run / 南大 nju / dockerproxy / DaoCloud；失败自动换源
- 修复应用中心安装无网速：避免卡在需密码的 `sudo docker`（与 SSH 用户权限不一致时）
- **恢复飞牛 docker-project**：安装时系统进度条可再 55→65 递增（与早期版本一致）
- 脚本 `docker pull` 输出到安装窗口（tee），不再只写文件导致假死
- 脚本 pull 与 docker-project **并行**，轮询等待镜像就绪

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
