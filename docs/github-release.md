# 柠檬音乐 v1.2.16.4

## 更新

### 商店 Node.js 检测（[#27](https://github.com/jia070310/lemon-muisc/issues/27)）

按[飞牛开发文档 · 打包运行时环境](https://github.com/ckcoding/fnnas-docs/blob/main/ALL_DOCS.md)：依赖由 `install_dep_apps=nodejs_v22` 安装，脚本使用：

`export PATH=/var/apps/nodejs_v22/target/bin:$PATH`

**修复**：

- **禁止**对已安装的 `nodejs_v22` 再执行 `appcenter-cli install`（会卡在 `downloading 0.00%` 直至超时）
- 按官方路径 + 动态扫描 `/vol*/@appcenter/nodejs_v22` 探测 `node`
- 判定改为「`node` 可运行」即可；等待超时缩短；目录已存在时软通过
- `better-sqlite3` 不再误把 `darwin-*.node` 当成 Linux 原生库

请用本版 FPK。若仍失败，附上 `@appdata/lemon-music/log/runtime-install.log` 与 `install.log` 末尾。

## 安装包

- x86：`lemon-music-1.2.16.4-x86.fpk`
- ARM：`lemon-music-1.2.16.4-arm.fpk`
