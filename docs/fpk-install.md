# 飞牛 FPK 安装说明

FPK **不包含 Docker 镜像**，体积约几 MB。安装/启动时由 **飞牛系统内置 Docker** 按 `docker-compose.yaml` 拉取：

```text
ghcr.io/jia070310/lemon-muisc:latest
```

## 安装

1. 应用中心 → **手动安装** → 选择 `fpk/lemon-music.fpk`
2. 首次启动会自动 `docker pull`（走飞牛 Docker 引擎）
3. 浏览器打开 `http://飞牛IP:7983`

## 国内网络与镜像加速

**是的**：拉取由飞牛 **Docker** 完成，不是 FPK 自己下载。

但要注意：

| 加速类型 | 能否加速本镜像 |
|----------|----------------|
| 飞牛 Docker 里配的 **Docker Hub 镜像站**（docker.io） | **不能**，本镜像在 **ghcr.io**（GitHub），不是 Docker Hub |
| 代理 / 科学上网 | 可以 |
| 手动导入离线 tar | 可以 |

### 在飞牛里配置 Docker Hub 加速（仍建议配置）

路径一般为：**控制面板 / 系统设置 → Docker → 镜像加速**（不同版本菜单名可能略有差异）。

示例（仅对 `docker.io` 有效）：

```json
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me"
  ]
}
```

保存后重启 Docker 服务。这**不能**直接加速 `ghcr.io`，但以后拉其他 Hub 镜像会更快。

### ghcr.io 拉不动时的办法

**办法 1：SSH 预拉（有代理时）**

```bash
docker pull ghcr.io/jia070310/lemon-muisc:latest
```

拉成功后再在应用中心启动「柠檬音乐下载」。

**办法 2：离线导入（无公网时）**

在有网络的电脑上：

```bash
docker pull ghcr.io/jia070310/lemon-muisc:latest
docker save -o lemon-music.tar ghcr.io/jia070310/lemon-muisc:latest
```

把 `lemon-music.tar` 上传到飞牛，SSH 执行：

```bash
docker load -i /path/to/lemon-music.tar
```

**办法 3：自建镜像加速（进阶）**

把 `ghcr.io/jia070310/lemon-muisc:latest` 同步到阿里云 ACR / 腾讯云 / Docker Hub，并修改 `fpk/app/docker/docker-compose.yaml` 里的 `image` 为你的仓库地址，再重新 `npm run fpk:build`。

> 飞牛目前**没有**像 Docker Hub 那样通用的「ghcr.io 一键加速」；`registry-mirrors` 主要面向 `docker.io`。若官方后续支持按 registry 配置代理，可在 Docker 高级设置里为 `ghcr.io` 单独加代理。

## 本机打包 FPK

```powershell
npm run fpk:build
```

输出：`fpk/lemon-music.fpk`（不提交 git）。
