# 飞牛 FPK 安装说明

FPK **不包含 Docker 镜像**（约 40KB）。点击「安装」后，在**安装窗口内**完成镜像拉取，不是后台静默执行。

## 安装流程

1. 应用中心 → **手动安装** → 选择 `fpk/lemon-music.fpk`
2. **安装向导**（安装界面内）：
   - 拉取方式：官方 ghcr.io / 自定义镜像 / 跳过拉取
   - 镜像标签：`latest` 或 `v1.0.0`
   - 拉取超时：5～30 分钟
   - 网络加速说明
3. 点击「安装」→ **本窗口实时显示** `docker pull` 进度
4. 显示「安装完成」→ 应用中心 **启动** → `http://飞牛IP:7983`

## 安装向导选项

| 选项 | 说明 |
|------|------|
| 官方 ghcr.io | `ghcr.io/jia070310/lemon-muisc:<标签>` |
| 自定义镜像地址 | 填国内同步后的完整地址，如 `registry.cn-xxx.com/xxx/lemon-music:latest` |
| 跳过拉取 | 已 `docker load` 或本地有镜像时使用 |
| 拉取超时 | 超时后安装失败并提示，可延长后重装 |

## 进度与日志

| 内容 | 位置 |
|------|------|
| 安装窗口进度 | 向导确认后的 `install_callback` 输出 |
| 详细日志 | `/var/apps/lemon-music/var/log/install.log` |
| 状态文件 | `/var/apps/lemon-music/var/install.status` |
| 失败原因 | 应用中心弹窗 |

```bash
tail -f /var/apps/lemon-music/var/log/install.log
```

## 国内网络与加速器

拉取由 **飞牛内置 Docker** 执行。

| 方式 | 对 ghcr.io |
|------|------------|
| 飞牛 Docker Hub 镜像加速 | **无效** |
| 安装向导「自定义镜像地址」 | **有效**（需先同步到国内仓库） |
| 系统代理 / 科学上网 | 有效 |
| SSH `docker load` + 向导选「跳过拉取」 | 有效 |

飞牛 **Docker → 镜像加速** 仍可配置（加速 docker.io 其他镜像），但对本应用默认源无效。

### 自定义镜像示例

1. 在有网络的机器：`docker pull ghcr.io/jia070310/lemon-muisc:latest`
2. 打 tag 并 push 到阿里云 ACR：`docker tag ... registry.cn-hangzhou.aliyuncs.com/你的/lemon-music:latest`
3. 安装向导选「自定义镜像地址」并填入上述地址

## 本机打包

```powershell
npm run fpk:build
```

输出：`fpk/lemon-music.fpk`（不提交 git）。
