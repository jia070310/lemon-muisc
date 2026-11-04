# 柠檬音乐 v1.2.17.20

## 更新内容

### 音乐库 · 减少 NAS 空闲盘唤醒（参考 Navidrome）

- **打开网页不再触发全盘扫库**：列表仍读 SQLite 索引；软同步只问版本，不扫盘
- **封面缓存命中只读配置盘**：不再每次 `stat`/打开音乐文件解内嵌图；未命中时限制并发解图
- **后台热更新更省 IO**：先比对目录/文件名列表签名，无变化跳过全量 `stat`；约每小时兜底深比对一次
- 默认监测间隔改为 **5 分钟**；冷启动先建签名，避免一开机就狂转硬盘
- 路径统计默认读索引并短缓存，打开音乐库不再反复探测音乐根目录

### 配套说明

- FnDepot 外部源：`https://github.com/jia070310/lemon-muisc`（≥0.0.7）
- 社区客户端：iOS [lemon-music-ios](https://github.com/liangddyy/lemon-music-ios)、Android [LMplayer](https://github.com/zyhub/LMplayer)

## 安装 / 更新

- x86：`lemon-music-1.2.17.20-x86.fpk`
- ARM：`lemon-music-1.2.17.20-arm.fpk`
