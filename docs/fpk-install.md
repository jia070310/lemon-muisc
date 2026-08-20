# 飞牛 FPK 安装说明

FPK **不包含 Docker 镜像**（约 40KB）。点击「安装」后，在**安装窗口内**完成镜像拉取，不是后台静默执行。

## 安装流程

1. 应用中心 → **手动安装** → 选择 `fpk/lemon-music.fpk`
2. **安装向导**：
   - **数据目录**：填写你自己的音乐库、下载目录（NAS 原始路径，必填）
   - 拉取方式 / 镜像标签 / 超时
3. 点击「安装」→ 拉取镜像，并把你填的路径写入 Docker 挂载
4. 启动应用 → `http://飞牛IP:7983`，工具内使用 `/music`、`/downloads`

> 路径因人而异。在文件管理中右键文件夹 → 详细信息 → **复制原始路径**，不要照抄别人的 `/vol1/1000/...`。

## 安装向导选项

| 选项 | 说明 |
|------|------|
| 音乐库目录 | 挂载到容器 `/music`，必填 |
| 下载目录 | 挂载到容器 `/downloads`，必填 |
| 官方 / 加速镜像 | `ghcr.1ms.run/jia070310/lemon-muisc:<标签>` |
| 自定义镜像地址 | 国内同步后的完整地址 |
| 跳过拉取 | 已 `docker load` 或本地有镜像时使用 |

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

## 数据目录（安装时配置）

安装向导会要求填写音乐库与下载目录，并写入 Docker 挂载。之后可在 **应用设置 → 运行设置** 修改。

| 设置项 | 变量名 | 说明 |
|--------|--------|------|
| 音乐库目录 | `wizard_music_path` | 安装/运行设置中填写，挂载到 `/music` |
| 下载目录 | `wizard_downloads_path` | 安装/运行设置中填写，挂载到 `/downloads` |
| 配置目录 | （自动） | 使用应用数据目录，挂载到 `/config` |

**任意用户首次安装：**

1. 安装向导填写自己的两个 NAS 路径
2. 安装完成 → 启用应用
3. 在 Docker「存储位置」确认已是自己填的路径（不是 `@appdata/.../music`）
4. Web 设置里使用容器路径 `/music`、`/downloads`

路径持久化在 `${TRIM_PKGETC}/paths.conf`。

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
