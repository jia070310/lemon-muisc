# 柠檬音乐下载 v1.0.7

## 更新内容

### 音源故障隔离（重点）

- **音源异常不再拖垮整个应用**：未捕获的 Promise 拒绝 / 运行时错误会自动停用当前音源，主进程继续运行
- **启动时跳过故障音源**：避免容器因反复激活坏音源而重启循环
- **全局提示弹窗**：打开 Web UI 时提示音源名称与错误信息
- **用户可选操作**：
  - **删除音源** — 移除故障脚本并清除记录
  - **删除并重新导入** — 优先从音源 homepage 链接重新下载，失败则使用本地脚本副本

### v1.0.6 — 飞牛 FPK 安装 / 启用

- compose 固定使用 `ghcr.1ms.run/jia070310/lemon-muisc`，避免短名误拉 Docker Hub
- 安装确认镜像后软启动容器；拉取不死锁；80% 假死修复
- 安装向导可选国内加速或「跳过拉取」

### v1.0.5 — 酷我 / 酷狗歌词修复

- 酷我改用 www.kuwo.cn 接口；酷狗携带 album_audio_id

## 安装 / 更新

应用中心：**手动安装** [`lemon-music-1.0.7.fpk`](https://github.com/jia070310/lemon-muisc/releases/tag/v1.0.7)  
（勿点卡片「更新」；覆盖安装即可）

**v1.0.7 含应用本体更新，建议拉取新镜像**（或选 `1.0.7` 标签）后再启用。

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:1.0.7
docker tag ghcr.1ms.run/jia070310/lemon-muisc:1.0.7 lemon-music:latest
```

本地已有 `latest` 且安装向导选「跳过拉取」时，需先 SSH 拉取上述镜像并打 tag，再覆盖安装 FPK。

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.7`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.7`
