# 柠檬音乐下载 v1.0.8

## 更新内容

### 发现页 / 歌单

- 新增 **发现** 导航：粘贴各平台歌单链接，浏览、试听、下载歌单歌曲
- 支持 **推荐歌单**（最热/最新），切换平台 Tab 自动刷新
- 歌单布局参照搜索页与落雪音乐

### 歌单试听修复

- 对齐落雪 **musicInfo** 字段：`songId` / `songmid` / `strMediaMid` 分开传递
- 修复 QQ 音乐歌单 `strMediaMid` 与 `songId` 混用导致 VIP 音源无法取链
- 新增 **音频代理** `/api/play/proxy`，解决浏览器 CORS / Referer 导致的「no supported sources」
- 优化播放失败提示（版权限制、参数缺失等）

## 安装 / 更新

应用中心：**手动安装** [`lemon-music-1.0.8.fpk`](https://github.com/jia070310/lemon-muisc/releases/tag/v1.0.8)  
（勿点卡片「更新」；覆盖安装即可）

**v1.0.8 含应用本体更新，建议拉取新镜像**（或选 `1.0.8` 标签）后再启用。

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:1.0.8
docker tag ghcr.1ms.run/jia070310/lemon-muisc:1.0.8 lemon-music:latest
```

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.8`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.8`
