# 柠檬音乐 v1.2.16.12

## 更新内容

### 情绪地图 · 本地启发式 v5

- 多段特征取中位数，降低单段误判
- 粗 chroma 大/小调弱先验
- 按本库相对分布（百分位）铺开坐标，非绝对情绪识别
- 新入库 / 下载文件自动后台补分析；仅处理未分析、失败或已改动文件，不因算法版本整库重跑

### 情绪地图 · AI（Essentia）

- 一键准备：自动下载 Python / 安装 Essentia / 拉取 MusiCNN + emoMusic 模型（无需终端）
- 安装包直链下载并显示进度；国内镜像优先，卡住自动换源
- AI 环境与模型写入应用配置目录，卸载勾选「保留数据」后可复用，无需重装
- 启用时再检测环境；AI 未就绪时自动回退本地启发式
- 引擎下拉与全站 AppSelect 样式统一（含倒三角指示）

### 下载 · 音乐库音质升级

- 下载页可按库内实际格式筛选（MP3 / FLAC 等），再选择目标无损档循序升级并覆盖原文件
- 有损可升无损；普通 FLAC 也可升 Hi-Res / 母带等更高档；分批入队，避免一次超量
- 目标音质下拉统一 AppSelect，并提示当前音源是否声明该档

### 文件管理 · 查重

- 「晴天」与「晴天 (Live)」等版本变体可归为同一组，是否删除由用户决定

### 漫游播放

- 随机抽歌进入漫游歌单，临近播完自动续填、已播曲目自动清理
- 鸣谢 [@theroad](https://github.com/theroad)（[PR #18](https://github.com/jia070310/lemon-muisc/pull/18)）提交漫游播放相关能力

### 开放 API

- 双挂载 `/api` 与 `/api/v1`；稳定曲目 `trackId`；播放流短时效 `ticket`
- 未登录可打开 `/api/docs`（Swagger）；规格见 `docs/openapi.yaml` / [open-api.md](../docs/open-api.md)

### 其它

- 仅 Linux x86_64 / macOS 支持官方 Essentia 预编译包；ARM NAS / Windows 请使用本地启发式

## 安装 / 更新

- x86：`lemon-music-1.2.16.12-x86.fpk`
- ARM：`lemon-music-1.2.16.12-arm.fpk`
