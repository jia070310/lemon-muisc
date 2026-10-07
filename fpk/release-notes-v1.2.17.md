# 柠檬音乐 v1.2.17

自 **v1.2.16.19** 以来的修改与修复。

## 更新内容

### 飞牛 HTTPS

- 有系统证书时**默认**应用内 HTTPS（同端口），无需反代与设置页；无证书回退 HTTP；`HTTPS=0` 可强制 HTTP

### Docker

- 恢复 Docker 部署（`Dockerfile` / Compose）；HTTPS 需自行挂载证书（`SSL_CERT` / `SSL_KEY`），说明见仓库 `docs/docker.md`

### 音乐库推荐

- **每日推荐**：一天最多换一批 20 次；本地与平台曲目约各一半；减少「最近听过」权重
- **深夜电台**：偏向轻音乐 / 舒缓曲风

### 登录 / 忘记密码

- 登录页密码旁「忘记密码？」说明（飞牛 Node 路径、`@appdata`、勿用 npm）

## 安装 / 更新

- x86：`lemon-music-1.2.17-x86.fpk`
- ARM：`lemon-music-1.2.17-arm.fpk`
