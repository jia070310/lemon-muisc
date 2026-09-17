# 柠檬音乐 v1.2.16.3

## 更新

### 升级卡在约 55%（[#27](https://github.com/jia070310/lemon-muisc/issues/27)）

**1.2.16.2 仍不够**：飞牛升级会替换应用目录，旧 `node_modules` 被清掉，「跳过重装」在升级时几乎无效。

本版：

- 安装包**默认内置** Linux 业务依赖，升级一般不再联网全量装 npm
- 依赖持久化到 `@appdata/.../runtime/node_modules`，后续升级可复用
- `deps.rev` 控制是否增量更新

## 安装包

- x86：`lemon-music-1.2.16.3-x86.fpk`
- ARM：`lemon-music-1.2.16.3-arm.fpk`
