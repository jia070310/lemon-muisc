# 柠檬音乐 v1.2.1

## 更新内容

### 多选批量下载

- 搜索页、发现页支持勾选多首歌曲后批量加入下载队列
- 统一选择音质；若某首没有该音质，**自动降到该曲可用档位**后再入队
- 表头可全选；桌面端与手机端均可使用

## 安装 / 更新

- x86：`lemon-music-1.2.1-x86.fpk`
- ARM：`lemon-music-1.2.1-arm.fpk`

依赖应用中心 **Node.js v22**。本版仍为原生独立应用，不依赖 Docker。

---

# 柠檬音乐 v1.2.0（独立原生应用）

飞牛端从 Docker 容器重写为**原生独立应用**：开机与启用不再依赖 Docker 服务，安装包体积约 0.5 MB。运行时使用应用中心 **Node.js v22**（未安装时随本应用自动安装）。

应用中心显示名：**柠檬音乐**；浏览器标题仍为「柠檬音乐下载」。

## 本次更新

### 架构重写

- 移除 Docker 运行时，避免重启后「docker服务不可用」导致自动启用失败
- 原生进程监听 IPv4 + IPv6（`::`）
- 数据目录使用 NAS 绝对路径，不再伪造容器内 `/music`、`/downloads`
- 支持同时激活多个落雪兼容音源；同一平台失败时自动尝试其他已激活音源

### 功能（沿用并增强）

- 多平台搜索、歌单发现、在线试听、批量下载、本地标签编辑
- 全屏播放：封面、滚动歌词、频谱可视化；桌面端与手机端自适应
- 底栏播放器、试听列表、后台播放、深色 / 浅色主题
- 下载队列、音质重试 / 降质、封面与歌词内嵌、独立 `.lrc`

## 安装 / 更新

飞牛应用中心安装对应架构 FPK。商店渠道可直接更新。

- x86：`lemon-music-1.2.0-x86.fpk`
- ARM：`lemon-music-1.2.0-arm.fpk`

依赖：应用中心 **Node.js v22**。请勿单独卸载该依赖。

安装时填写音乐库与下载目录的本机绝对路径即可使用。

---


# 柠檬音乐下载 v1.0.17

## 更新内容

### 手机体验与试听恢复

- 修复全屏试听列表播放/移除按钮图标错位
- 修复刷新或重新进入后试听区播放等按钮无效（尤其手机）
- 优化手机顶栏日夜切换按钮图标大小与清晰度

### 下载更稳、提示更清楚

- 同音质自动重试；仍失败时弹出确认：可重试原音质、降质下载或暂不处理
- 下载页同步提供「重试原音质 / 降质下载 / 放弃」
- 将 `socket hang up`、超时等英文/错误码转成简短中文原因说明

### 飞牛应用状态

- 修复重启后容器已运行、应用中心仍显示「启用」的问题（status 检测更可靠）
- 容器重启策略改为 `always`，降低飞牛关机后无法自启的影响

**建议拉取新镜像**（含前后端与 FPK 脚本更新）。

## 安装 / 更新

应用中心：**手动安装** 对应架构的 FPK  
（勿点卡片「更新」；覆盖安装即可）

- x86 设备：`lemon-music-1.0.17-x86.fpk`
- ARM 设备：`lemon-music-1.0.17-arm.fpk`

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:1.0.17
docker tag ghcr.1ms.run/jia070310/lemon-muisc:1.0.17 lemon-music:latest
```

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.17`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.17`

---

# 柠檬音乐下载 v1.0.16

## 更新内容

### 封面与歌词修复

- 修复搜索、歌单播放与下载时封面、歌词经常缺失的问题
- QQ 音乐歌词改用正确的 `songmid`，不再误用数字 ID
- 酷我歌单封面字段（`pic` / `albumpic` / `artistPic`）正确映射
- 播放时增加封面回退与跨平台歌词补全；新增 `/api/play/cover` 供预览补图
- 下载路径统一使用共享的封面/歌词获取逻辑，避免重复与不一致

**建议拉取新镜像**（含前后端更新）。

## 安装 / 更新

应用中心：**手动安装** 对应架构的 FPK  
（勿点卡片「更新」；覆盖安装即可）

- x86 设备：`lemon-music-1.0.16-x86.fpk`
- ARM 设备：`lemon-music-1.0.16-arm.fpk`

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:1.0.16
docker tag ghcr.1ms.run/jia070310/lemon-muisc:1.0.16 lemon-music:latest
```

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.16`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.16`

---

# 柠檬音乐下载 v1.0.15

## 更新内容

### 手机全屏歌词布局

- 修复手机端全屏播放时歌词压到进度条、频谱与控制按钮上的问题
- 歌词区严格占用封面与控制栏之间的剩余高度，内部独立滚动
- 窄屏隐藏全屏音量条（与底栏一致，使用系统音量键），给歌词留出更多空间
- 降低并上移频谱区域，减少遮挡；优化矮屏 / 横屏布局与当前行滚动定位

**建议拉取新镜像**（含前端更新）。

## 安装 / 更新

应用中心：**手动安装** 对应架构的 FPK  
（勿点卡片「更新」；覆盖安装即可）

- x86 设备：`lemon-music-1.0.15-x86.fpk`
- ARM 设备：`lemon-music-1.0.15-arm.fpk`

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:1.0.15
docker tag ghcr.1ms.run/jia070310/lemon-muisc:1.0.15 lemon-music:latest
```

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.15`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.15`

---

# 柠檬音乐下载 v1.0.14

## 更新内容

### 安装向导 · 镜像标签修复

- 修复安装/升级时选择旧版本镜像标签（如 `1.0.12`）仍被拉取 `latest` 的问题
- compose 与 `image.conf` 现在**优先使用本次向导选择的 tag**，不再被上次安装的 latest 覆盖
- 本地已有镜像时，只有**同 tag** 才会跳过拉取，不会误用本机旧的 latest
- 安装日志会显示「镜像标签」与「目标镜像」，便于核对

> 本版本主要为 **FPK 安装包脚本修复**。若已安装 v1.0.13 且运行正常，可只覆盖安装 FPK 以修复安装行为；应用功能与 v1.0.13 相同。若要最新应用，安装时选 `latest` 或 `1.0.14` 镜像即可。

## 安装 / 更新

应用中心：**手动安装** 对应架构的 FPK  
（勿点卡片「更新」；覆盖安装即可）

- x86 设备：`lemon-music-1.0.14-x86.fpk`
- ARM 设备：`lemon-music-1.0.14-arm.fpk`

```bash
# 可选：拉取与 FPK 同版本镜像
docker pull ghcr.1ms.run/jia070310/lemon-muisc:1.0.14
docker tag ghcr.1ms.run/jia070310/lemon-muisc:1.0.14 lemon-music:latest
```

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.14`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.14`

---

# 柠檬音乐下载 v1.0.13

## 更新内容

### 后台播放修复

- 修复锁屏 / 黑屏、浏览器或飞牛窗口切到后台后音乐停止的问题
- 频谱分析改为 `captureStream` 旁路读取，**不再劫持** `<audio>` 原生输出，避免 Web Audio 被挂起导致停播
- 切回前台时自动恢复 AudioContext，必要时重新继续播放

### 频谱可视化修复

- 修复上述改动后频谱不再随音乐跳动的问题
- 在 `play()` 之后再建立分析链路，并增加自动重试与死链重建

### 文案与布局

- 歌手名正确解码 `\u0026` 等转义，多艺人显示为空格分隔
- 搜索 / 发现 / 下载 / 标签编辑页宽屏布局更充实，减少右侧大片空白
- 标签编辑右侧编辑区始终可见（未选中时显示占位提示）

### 卸载向导

- 改为单页单选：**保留应用数据 / 删除应用数据**（样式对齐飞牛官方 Chrome 卸载界面）
- 仍不会删除你指定的音乐库、下载目录中的音频文件

## 安装 / 更新

应用中心：**手动安装** 对应架构的 FPK  
（勿点卡片「更新」；覆盖安装即可）

- x86 设备：`lemon-music-1.0.13-x86.fpk`
- ARM 设备：`lemon-music-1.0.13-arm.fpk`

**v1.0.13 含应用本体更新，建议拉取新镜像。**

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:1.0.13
docker tag ghcr.1ms.run/jia070310/lemon-muisc:1.0.13 lemon-music:latest
```

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.13`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.13`

---

# 柠檬音乐下载 v1.0.12

## 更新内容

### ARM 适配

- Docker 镜像改为 **多架构构建**：同时发布 `linux/amd64` 与 `linux/arm64`
- 飞牛 ARM 设备可直接拉取同一镜像 tag，Docker 会自动选择匹配架构
- FPK 改为 **双安装包发布**：
  - `lemon-music-1.0.12-x86.fpk`
  - `lemon-music-1.0.12-arm.fpk`

### 全屏播放修复

- 修复全屏歌词区域底部出现**横向滚动条**的问题
- 限制歌词区仅纵向滚动，长歌词自动换行，当前行高亮不再撑宽容器

## 安装 / 更新

应用中心：**手动安装** 对应架构的 FPK  
（勿点卡片「更新」；覆盖安装即可）

- x86 设备：`lemon-music-1.0.12-x86.fpk`
- ARM 设备：`lemon-music-1.0.12-arm.fpk`

**v1.0.12 含应用本体更新，建议拉取新镜像。**

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:1.0.12
docker tag ghcr.1ms.run/jia070310/lemon-muisc:1.0.12 lemon-music:latest
```

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.12`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.12`

---

# 柠檬音乐下载 v1.0.11

## 更新内容

### 全屏播放页（新功能）

- 点击底栏封面打开全屏播放：大封面、实时滚动歌词、进度条、音量、播放控制
- 支持 `Esc` 键 / 右上角关闭；键盘空格暂停 / 播放
- 移动端横竖屏自适应布局

### 音频可视化（新功能）

- **播放栏背景频谱**：播放时底部显示蓝绿渐变细柱动效
- **全屏频谱**：底部沉浸式宽频谱 + 下方镜像反射
- 暂停时自动切换为柔和待机波动
- 设置 → 试听设置 → **音频可视化**开关可关闭

### 音量控制优化

- 垂直滑杆精确调节（0–100%，步进 1%）
- 一键静音 / 恢复，静音状态持久化
- 桌面：悬停展开滑杆面板，滚轮微调；点击图标静音
- 移动端：隐藏音量按钮（使用物理音量键）
- 修复新浏览器默认静音问题（`audio.muted` 代替 `volume=0`）

### 播放器响应式

- 宽屏完整控制栏（进度、音量、队列、循环）
- 窄屏 / 移动端（≤980px）自动切换紧凑布局：保留核心控制与循环按钮，隐藏进度条和音量（音量用物理键）
- 基于 `ResizeObserver` 检测宽度，滞回区间避免频繁切换

### 安装程序完善（FPK）

- 安装向导新增**注意事项**步骤（路径获取方法、镜像说明等）
- **卸载向导**：新增「保留数据 / 删除数据」选项；删除数据不会删除用户音乐文件
- 重装时可自动恢复上次保留的配置

## 安装 / 更新

应用中心：**手动安装** `lemon-music-1.0.11.fpk`  
（勿点卡片「更新」；覆盖安装即可）

**v1.0.11 含应用本体更新，建议拉取新镜像。**

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:1.0.11
docker tag ghcr.1ms.run/jia070310/lemon-muisc:1.0.11 lemon-music:latest
```

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:latest`
- `ghcr.io/jia070310/lemon-muisc:1.0.11`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.11`

---

# 柠檬音乐下载 v1.0.10

## 更新内容

### 歌单 / 发现

- 修复 **网易云歌单** 只显示约 10 首的问题：通过 `trackIds` 批量补全全部歌曲

### 下载与歌词

- 完善 **罗马音歌词**：网易云/QQ/咪咕等平台支持内嵌与 `.lrc` 罗马音
- 启用 **跨平台歌词补全**（`download.isUseOtherSource`）：当前平台无歌词时自动尝试其他平台
- 下载设置文案修正：**按专辑名分组**（与实际逻辑一致）

### 界面

- **标签编辑**：试听、加入列表按钮移至每行末尾

## 安装 / 更新

应用中心：**手动安装** [`lemon-music-1.0.10.fpk`](https://github.com/jia070310/lemon-muisc/releases/tag/v1.0.10)

## Docker 镜像

- `ghcr.io/jia070310/lemon-muisc:1.0.10`
- 国内加速：`ghcr.1ms.run/jia070310/lemon-muisc:1.0.10`
