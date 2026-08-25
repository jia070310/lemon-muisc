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
