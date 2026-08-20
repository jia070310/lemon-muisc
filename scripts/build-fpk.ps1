# 飞牛 NAS FPK 打包脚本（离线内置镜像，安装时不拉取仓库）
# 前置：Docker Desktop、fnpack（https://developer.fnnas.com/docs/cli/fnpack）

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ImageName = "lemon-music:latest"
$TarPath = Join-Path $Root "fpk\app\docker\images\lemon-music.tar"

Write-Host ">>> 构建前端..." -ForegroundColor Cyan
Set-Location $Root
npm run build

Write-Host ">>> 构建 Docker 镜像 $ImageName ..." -ForegroundColor Cyan
docker build -t $ImageName .

Write-Host ">>> 导出离线镜像 tar（FPK 安装时 docker load，不拉取远程）..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path (Split-Path $TarPath) | Out-Null
docker save -o $TarPath $ImageName
Write-Host "已写入 $TarPath"

Write-Host ">>> 打包 FPK..." -ForegroundColor Cyan
Set-Location (Join-Path $Root "fpk")
$fnpack = Get-Command fnpack -ErrorAction SilentlyContinue
if (-not $fnpack) {
  $local = Join-Path $Root "tools\fnpack.exe"
  if (Test-Path $local) { $fnpack = Get-Item $local }
}
if ($fnpack) {
  & $fnpack.Source build
  Get-ChildItem -Filter "*.fpk" | ForEach-Object { Write-Host "完成：$($_.FullName)" -ForegroundColor Green }
} else {
  Write-Host "未找到 fnpack。请从 https://developer.fnnas.com/docs/cli/fnpack 下载 Windows 版，改名为 fnpack.exe 后加入 PATH，或放到 tools\fnpack.exe" -ForegroundColor Yellow
}
