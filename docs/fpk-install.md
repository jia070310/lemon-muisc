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
| 自定义镜像地址 | 填国内同步或加速后的完整地址 |
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

## ghcr.io 镜像加速

拉取由 **飞牛内置 Docker** 执行。Docker Hub 镜像加速 **对 ghcr.io 无效**。

### 有 ghcr 加速吗？

有，但用法和 Docker Hub 不同，需 **换域名** 或 **自定义镜像地址**，不能指望 `registry-mirrors` 自动代理 ghcr.io。

| 方式 | 说明 |
|------|------|
| 公开 GHCR 前缀 | 如 `ghcr.1ms.run`、`ghcr.m.daocloud.io`（可用性会变，需自测） |
| 商业专属域名 | 如轩辕 `xxx-ghcr.xuanyuan.run` |
| 同步到国内仓库 | 阿里云 ACR / 腾讯云 TCR（最稳） |
| 离线 `docker load` | 向导选「跳过拉取」 |

### 安装向导里使用加速

选 **「自定义镜像地址」**，填写例如：

```text
ghcr.1ms.run/jia070310/lemon-muisc:latest
```

或同步到国内后的：

```text
registry.cn-hangzhou.aliyuncs.com/你的命名空间/lemon-music:latest
```

### SSH 测试加速是否可用

```bash
docker pull ghcr.1ms.run/jia070310/lemon-muisc:latest
```

成功后再在安装向导填同一地址。

---

## 修改数据目录（volumes）

FPK 默认 compose 路径（`fpk/app/docker/docker-compose.yaml`）：

```yaml
volumes:
  - "/var/apps/lemon-music/shares/lemon-music/data:/music"
  - "/var/apps/lemon-music/shares/lemon-music/downloads:/downloads"
  - "/var/apps/lemon-music/shares/lemon-music/config:/config"
```

若要把音乐库和下载目录放到其他盘（如 `/vol1/1000/music`、`/vol1/1000/music-downloads`）：

1. 修改 `fpk/app/docker/docker-compose.yaml` 中 **冒号左边** 的路径
2. 重新打包：`npm run fpk:build`
3. 重新安装 FPK

**只改左边**，右边 `/music`、`/downloads`、`/config` 不变。详见 [docker-compose.md](./docker-compose.md#修改-volumes-路径)。

安装后在 **设置 → 文件路径** 添加的路径需与 `/music`、`/downloads` 挂载目录一致；并可在 **设置 → 下载设置 → 保存路径** 选择下载目录。

---

## 本机打包

```powershell
npm run fpk:build
```

输出：`fpk/lemon-music.fpk`（不提交 git）。
