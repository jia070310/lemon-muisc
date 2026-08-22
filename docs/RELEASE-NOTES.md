# 柠檬音乐下载 v1.0.2

面向飞牛 NAS 的音乐搜索、试听、下载与标签管理工具。兼容落雪音乐（LX Music）自定义音源。

## 更新内容

### 标签编辑试听
- 标签页支持本地文件试听，与底栏播放器共用试听队列
- 支持「试听全部」、加入队列、上一首/下一首
- 新增 `/api/play/local` 本地文件流式播放（支持 Range）

### 播放状态持久化
- 刷新或重新进入页面后保留当前曲目、进度与队列
- 修复刷新后列表显示暂停图标但底栏无信息、无法继续播放的问题

### 界面
- 浅色 / 深色主题切换（设置页或侧栏）
- 修复首次配置提示条被页面布局撑高的问题

## 安装 / 更新（飞牛 FPK）

1. 应用中心 → 手动安装 → 选择本页附件 `lemon-music-1.0.2.fpk`（若已发布）
2. 若镜像较旧，在 NAS 执行：

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest
docker tag ghcr.1ms.run/jia070310/lemon-muisc:latest lemon-music:latest
docker rm -f lemon-music
```

3. 应用中心：**停用 → 启用** 以加载新镜像

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.2`
- 国内镜像示例：`ghcr.1ms.run/jia070310/lemon-muisc:latest`

## 说明

请仅用于个人已合法授权的音乐资源管理，遵守当地法律法规及各平台服务条款。
