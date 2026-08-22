# 柠檬音乐下载 v1.0.1

面向飞牛 NAS 的音乐搜索、试听、下载与标签管理工具。兼容落雪音乐（LX Music）自定义音源。

## 更新内容

### 下载内嵌与歌词文件
- 按设置写入**内嵌封面 / 内嵌歌词**；关闭则不写入
- 开启「下载歌词文件」时，在下载目录生成同名 `.lrc`
- 修复酷我等音源封面缺失、歌词获取失败导致内嵌为空的问题
- 封面拉取兼容酷我多镜像与尺寸回退

### 自定义音源兼容性
- 补齐 LX 官方 `lx.utils`（crypto / buffer / zlib）
- 修复沙箱 `globalThis` 被错误覆盖的问题
- 提供受限 `require`（`crypto`、`zlib`、`buffer`、`querystring`、`url`）
- 缓解社区反馈的「`require is not defined`」「`Bind must be called on a function`」激活失败

### 其它
- 搜索结果补充封面地址（酷我 / 酷狗 / 咪咕）
- 下载任务保留 `albummid`，便于 QQ 封面兜底
- 设置页歌词文件相关文案更清晰

## 安装 / 更新（飞牛 FPK）

1. 应用中心 → 手动安装 → 选择本页附件 `lemon-music-1.0.1.fpk`
2. 若镜像较旧，在 NAS 执行：

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest
docker tag ghcr.1ms.run/jia070310/lemon-muisc:latest lemon-music:latest
docker rm -f lemon-music
```

3. 应用中心：**停用 → 启用** 以加载新镜像

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.1`
- 国内镜像示例：`ghcr.1ms.run/jia070310/lemon-muisc:latest`

## 说明

请仅用于个人已合法授权的音乐资源管理，遵守当地法律法规及各平台服务条款。
