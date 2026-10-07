# 柠檬音乐 v1.2.17.1

## 更新内容

- **飞牛桌面入口**：协议留空，跟随飞牛桌面当前是 http 还是 https（不再写死 http）
- **飞牛证书探测**：优先完整链（fullchain）、网关配置与最新证书目录；兼容 pem / old_fullchain
- **同端口双协议**：有证书时 HTTP / HTTPS 都能打开（修 http 502）
- **音源**：多文件 / 多 URL 批量导入；检查更新并原地升级脚本
- 应用有证书时仍可默认 HTTPS；需要纯 HTTP 时设 `HTTPS=0`

## 安装 / 更新

- x86：`lemon-music-1.2.17.1-x86.fpk`
- ARM：`lemon-music-1.2.17.1-arm.fpk`
