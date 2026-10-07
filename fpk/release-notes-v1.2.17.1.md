# 柠檬音乐 v1.2.17.1

## 更新内容

- **飞牛桌面入口**：`protocol` 留空，按你打开飞牛桌面时的方式自适应（飞牛用 https 则开 https，用 http 则开 http），不再写死 http
- **飞牛证书探测**：优先 `fullchain` / `old_fullchain`、gateway 配置与最新时间戳目录；兼容 `.pem`；避免首次启动把自动模式写成强制开启
- 应用侧：有系统证书时仍可默认 HTTPS；强制 HTTP 可设 `HTTPS=0` 或 `https.json` 里 `enabled:false`

## 安装 / 更新

- x86：`lemon-music-1.2.17.1-x86.fpk`
- ARM：`lemon-music-1.2.17.1-arm.fpk`
