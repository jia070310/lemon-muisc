# 柠檬音乐 v1.2.16.9

## 更新内容

### 安装 / 启用（[#34](https://github.com/jia070310/lemon-muisc/issues/34)）

- 修复升级跳过 npm 后缺少 `nodemailer` 导致无法启用
- `deps.rev` 递增以触发增量补装；邮件模块改为按需加载

### 标签编辑

- 支持写入 **M4A / MP4 / M4B / AAC** 标签（封面 / 歌词等，需可用 ffmpeg）

### 播放

- **车机 / 弱网流畅播放**：本地 FLAC 等可先转约 192kbps AAC 再播，减轻无线 CarPlay 卡顿（iPhone/iPad 默认开）

### 音乐库

- 修复「最近添加专辑」点进详情显示未找到 / 暂无歌曲：专辑 id 安全编码，曲目查询与专辑聚合对齐

## 安装 / 更新

- x86：`lemon-music-1.2.16.9-x86.fpk`
- ARM：`lemon-music-1.2.16.9-arm.fpk`
