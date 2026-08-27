# 【更新】柠檬音乐下载 v1.0.12 发布，现已支持飞牛 ARM 设备

项目地址：  
[https://github.com/jia070310/lemon-muisc](https://github.com/jia070310/lemon-muisc)

这次更新主要完成了两件事：一是补上了飞牛 ARM 设备的适配，二是修复了全屏播放页歌词区域的显示问题。现在 `x86` 和 `ARM` 设备都可以使用对应安装包安装，Docker 镜像也已经改成多架构发布。

## 本次更新内容

### 1. 支持飞牛 ARM 设备

- Docker 镜像已改为多架构构建，同时发布 `amd64` 和 `arm64`
- 飞牛 `x86` / `ARM` 设备都可使用同一个镜像 tag，系统会自动选择对应架构
- FPK 安装包改为分别提供两个版本：
  - `lemon-music-1.0.12-x86.fpk`
  - `lemon-music-1.0.12-arm.fpk`

### 2. 修复全屏播放歌词区域显示问题

- 修复全屏播放时歌词区域底部出现横向滚动条的问题
- 优化歌词区域布局，长歌词自动换行，只保留纵向滚动

## 安装 / 更新方式

请使用 **手动安装**，不要点应用卡片上的“更新”。

- `x86` 设备安装：`lemon-music-1.0.12-x86.fpk`
- `ARM` 设备安装：`lemon-music-1.0.12-arm.fpk`

发布页下载：  
[https://github.com/jia070310/lemon-muisc/releases/tag/v1.0.12](https://github.com/jia070310/lemon-muisc/releases/tag/v1.0.12)

## Docker 镜像

官方镜像：

- `ghcr.io/jia070310/lemon-muisc:1.0.12`
- `ghcr.io/jia070310/lemon-muisc:latest`

国内加速：

- `ghcr.1ms.run/jia070310/lemon-muisc:1.0.12`

## 说明

FPK 包本身不内置 Docker 镜像，安装时会在飞牛安装窗口内拉取镜像。  
如果网络较慢，也可以先通过 SSH 手动拉取镜像，再在安装向导中选择“跳过拉取”。

如有使用问题或建议，欢迎继续反馈。  
感谢大家支持。
