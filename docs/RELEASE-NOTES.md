# 柠檬音乐下载 v1.0.10

## 更新内容

### 歌单 / 发现

- 修复 **网易云歌单** 只显示约 10 首的问题：通过 `trackIds` 批量补全全部歌曲

### 下载与歌词

- 完善 **罗马音歌词**：网易云/QQ/咪咕等平台支持内嵌与 `.lrc` 罗马音
- 启用 **跨平台歌词补全**（`download.isUseOtherSource`）：当前平台无歌词时自动尝试其他平台
- 下载设置文案修正：**按专辑名分组**（与实际逻辑一致）

### 界面

- **标签编辑**：试听、加入列表按钮移至每行末尾

## 安装 / 更新

应用中心：**手动安装** [`lemon-music-1.0.10.fpk`](https://github.com/jia070310/lemon-muisc/releases/tag/v1.0.10)  
（勿点卡片「更新」；覆盖安装即可）

**v1.0.10 含应用本体更新，建议拉取新镜像**（或选 `1.0.10` 标签）后再启用。

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:1.0.10
docker tag ghcr.1ms.run/jia070310/lemon-muisc:1.0.10 lemon-music:latest
```

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.10`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.10`
