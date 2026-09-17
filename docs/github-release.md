# 柠檬音乐 v1.2.16.3

## 更新

### 升级卡在约 55%（[#27](https://github.com/jia070310/lemon-muisc/issues/27)）

**1.2.16.2 仍不够**：飞牛升级会**替换应用目录**，旧的 `node_modules` 一起被清掉，所以「清单未变则跳过」在升级路径上几乎用不上，仍会重新联网装 npm。

本版：

- **安装包默认内置** Linux 业务依赖（`node_modules`），升级/安装一般**不再**长时间卡在 55% 装 npm
- 依赖同时落到数据目录 `@appdata/.../runtime/node_modules`，后续升级可复用
- 继续用 `deps.rev` 控制是否增量更新（改业务版本号不必重装依赖）

请改用本版 FPK。若仍失败，把 `/vol*/@appdata/lemon-music/log/npm-install.log` 末尾发出来。

## 安装包

- x86：`lemon-music-1.2.16.3-x86.fpk`
- ARM：`lemon-music-1.2.16.3-arm.fpk`
