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

## 数据目录（应用设置）

安装后 **不在安装向导中强制填写** 音乐库与下载路径。请在应用中心 → **柠檬音乐下载** → **应用设置** 中配置：

| 设置项 | 变量名 | 说明 |
|--------|--------|------|
| 音乐库目录 | `wizard_music_path` | NAS 绝对路径，挂载到容器 `/music` |
| 下载目录 | `wizard_downloads_path` | NAS 绝对路径，挂载到容器 `/downloads` |
| 配置目录 | `wizard_config_path` | 留空则自动使用应用数据目录，挂载到 `/config` |

**首次使用流程：**

1. 安装并完成镜像拉取
2. 打开 **应用设置**，填写音乐库与下载目录（配置目录可留空）
3. 保存后应用会自动重启容器
4. 打开 Web 界面，在 **设置 → 文件路径** 添加 `/music`、`/downloads`

首次打开 Web 界面时，若目录未配置会显示提示条。

路径持久化在 `${TRIM_PKGETC}/paths.conf`（SSH 可查看）。

---

## 修改数据目录（旧版说明）

<details>
<summary>手动编辑 compose（高级用户）</summary>

`fpk/app/docker/docker-compose.yaml` 使用环境变量：

```yaml
volumes:
  - "${wizard_music_path}:/music"
  - "${wizard_downloads_path}:/downloads"
  - "${wizard_config_path}:/config"
```

一般无需手动编辑，请优先使用应用设置。
</details>

---

## 本机打包

```powershell
npm run fpk:build
```

输出：`fpk/lemon-music.fpk`（不提交 git）。
