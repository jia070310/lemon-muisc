# 柠檬音乐下载 v1.0.9

## 更新内容

### 音源故障误判修复

- **临时网络错误**（如 `socket hang up`、连接重置、超时）不再自动停用音源
- 新增 **「知道了，保留音源」**：清除故障提示，不删除音源
- 修复本地开发环境下偶发网络波动导致音源反复弹窗、重新导入仍提示的问题

## 安装 / 更新

应用中心：**手动安装** [`lemon-music-1.0.9.fpk`](https://github.com/jia070310/lemon-muisc/releases/tag/v1.0.9)  
（勿点卡片「更新」；覆盖安装即可）

**v1.0.9 含应用本体更新，建议拉取新镜像**（或选 `1.0.9` 标签）后再启用。

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:1.0.9
docker tag ghcr.1ms.run/jia070310/lemon-muisc:1.0.9 lemon-music:latest
```

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.9`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.9`
