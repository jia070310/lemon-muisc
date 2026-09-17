# 柠檬音乐 v1.2.16.2

## 更新

### 升级体验（[#27](https://github.com/jia070310/lemon-muisc/issues/27)）

- 修复升级时每次强制清空并重装 npm 依赖，导致进度长时间停在约 55%、最终被飞牛回滚
- 现改为：依赖清单（package-lock）未变且模块齐全时**跳过**重装；仅清单变更或模块缺失时才安装
- 进度停在约 55% 时是在装本应用 npm 包（express 等），**不是** ffmpeg

本版仍为原生独立应用（不依赖 Docker），依赖应用中心 Node.js v22。

## 安装包

- x86：`lemon-music-1.2.16.2-x86.fpk`
- ARM：`lemon-music-1.2.16.2-arm.fpk`
