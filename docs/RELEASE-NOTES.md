# 柠檬音乐下载 v1.0.4

面向飞牛 NAS 的音乐搜索、试听、下载与标签管理工具。兼容落雪音乐（LX Music）自定义音源。

## 更新内容

### v1.0.4 — 镜像同步修复
- 修复多次升级拉取新镜像后，容器仍使用旧 `lemon-music:latest` 的问题
- 拉取后自动将最新远程镜像 retag 为 `lemon-music:latest`
- compose 统一使用短名，避免镜像管理里堆叠带前缀的未使用镜像

### v1.0.3 — 飞牛升级修复
- 升级时镜像拉取失败不再中断 FPK 安装
- 保留路径配置，升级后自动重建容器
- 升级向导说明需使用「手动安装」而非应用卡片「更新」

### v1.0.2 — 功能增强
- 标签页本地文件试听，与底栏播放器共用队列
- 刷新页面后保留曲目、进度与试听队列
- 浅色 / 深色主题切换
- 修复首次配置提示条布局问题

## 安装 / 更新（飞牛 FPK）

1. 应用中心 → **手动安装** → 选择 `lemon-music-1.0.4.fpk`
2. 推荐先 SSH 拉镜像：

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest
docker tag ghcr.1ms.run/jia070310/lemon-muisc:latest lemon-music:latest
```

3. 升级向导选「跳过拉取」，完成后 **停用 → 启用**

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.4`
- 国内镜像示例：`ghcr.1ms.run/jia070310/lemon-muisc:latest`

## 说明

请仅用于个人已合法授权的音乐资源管理，遵守当地法律法规及各平台服务条款。
