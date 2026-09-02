柠檬音乐 · 初始化完成
时间: 2026/9/1 10:36:05
管理员用户名: admin
绑定邮箱: （未填写）
账号恢复方式: 本地保存账号文件
账号文件: D:\项目\Lx-music-web(lemon)\config\ADMIN_CREDENTIALS.txt
配置目录: D:\项目\Lx-music-web(lemon)\config
数据库文件: D:\项目\Lx-music-web(lemon)\config\lx-music.db
—— 忘记密码怎么办？ ——
方式一：查看本地账号文件
  D:\项目\Lx-music-web(lemon)\config\ADMIN_CREDENTIALS.txt
  文件内含初始化时设置的用户名与密码，请妥善保管。
方式二：命令行重置（NAS SSH）
  CONFIG_PATH="D:\项目\Lx-music-web(lemon)\config" npm run auth:reset-password -- admin 新密码
安全提示：
  · 本文件不含密码。
  · 账号密码保存在 ADMIN_CREDENTIALS.txt，请勿泄露或上传到公网。
  · 请勿删除 lx-music.db，除非你知道如何恢复数据。