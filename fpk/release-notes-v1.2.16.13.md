# 柠檬音乐 v1.2.16.13

## 更新内容

### 播放

- **修复在线试听全部失败**：开放 API 的 trackId 逻辑误把酷狗等平台曲目 `id` 当成音乐库 ID，`/play/url` 直接 404，界面卡在「跨平台补源」
- 仅真正的音乐库 `trackId`（或无在线身份时的 UUID）才走库内查找

### 构建 / 发布

- GitHub Actions 构建与发布改为**仅手动触发**（提交代码不再自动打包发版）
- 修复 Actions workflow 顶格 heredoc 导致 Invalid workflow file、定时静默不注册
- 修复 CI 中 fnpack 输出路径与 `fpk/manifest` UTF-8 损坏问题

## 安装 / 更新

- x86：`lemon-music-1.2.16.13-x86.fpk`
- ARM：`lemon-music-1.2.16.13-arm.fpk`
