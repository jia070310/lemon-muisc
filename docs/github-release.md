# 柠檬音乐 v1.2.16.1

## 更新

### 下载

- 修复真 FLAC 因 CDN 误报 `Content-Type=audio/mpeg` 被当成假无损拒存
- 下载/探测补齐平台 Referer 与 UA，减少「音源拒绝访问」
- 识别带 ID3 头的真 FLAC，避免误判为 MP3

### 安装 / 升级

- 等待应用中心装好依赖 Node.js 后，本应用才继续安装
- 进度文案：**等待商店安装依赖 Node.js**

本版仍为原生独立应用（不依赖 Docker），依赖应用中心 Node.js v22。

## 安装包

- x86：`lemon-music-1.2.16.1-x86.fpk`
- ARM：`lemon-music-1.2.16.1-arm.fpk`
