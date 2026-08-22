# 柠檬音乐下载 v1.0.5

## 更新内容

### 酷我 / 酷狗歌词修复
- 酷我：改用 `www.kuwo.cn` openapi / newh5 接口，修复大量歌曲歌词为空
- 酷我：拉取失败时按歌名搜索备用 musicId 重试
- 酷狗：歌词请求携带 `album_audio_id`（MixSongID），提升命中率
- 酷狗：多 client 回退 + 按歌名重试
- 试听、下载、标签匹配统一传递完整歌曲元数据
- 试听歌词接口增加自定义音源 `lyric` 回退

## 安装 / 更新

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest
docker tag ghcr.1ms.run/jia070310/lemon-muisc:latest lemon-music:latest
docker rm -f lemon-music
```

应用中心：**手动安装** FPK → 停用 → 启用

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.5`
