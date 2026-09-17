# 柠檬音乐 v1.2.16.5

## 更新

### 商店 Node / 升级卡 55%（[#27](https://github.com/jia070310/lemon-muisc/issues/27)）

按[飞牛开发文档 · 打包运行时](https://github.com/ckcoding/fnnas-docs/blob/main/ALL_DOCS.md)：

```bash
install_dep_apps=nodejs_v22
export PATH=/var/apps/nodejs_v22/target/bin:$PATH
```

**本版回到 1.2.14 稳定路径（小包 ~1MB）：**

1. **只检查**商店 Node 是否可用，**不再**长时间「等待商店安装」、**不再**对已安装包执行 `appcenter-cli install`（根因：已装仍 install → `downloading 0%` → 超时）
2. 默认打包**不再**内置 `node_modules`（体积回到约 1MB）
3. 已有业务依赖（含 `@appdata/runtime` 持久化）则升级跳过 npm

## 安装包

- x86：`lemon-music-1.2.16.5-x86.fpk`
- ARM：`lemon-music-1.2.16.5-arm.fpk`
