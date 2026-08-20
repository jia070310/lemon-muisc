# 飞牛 NAS FPK 打包脚本
# 前置：安装 fnpack 并加入 PATH（https://developer.fnnas.com/）

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host ">>> 构建前端..." -ForegroundColor Cyan
Set-Location $Root
npm run build

Write-Host ">>> 构建 Docker 镜像 lemon-music:latest ..." -ForegroundColor Cyan
docker build -t lemon-music:latest .

Write-Host ">>> 打包 FPK..." -ForegroundColor Cyan
Set-Location "$Root\fpk"
if (Get-Command fnpack -ErrorAction SilentlyContinue) {
  fnpack build
  Write-Host "完成：fpk\lemon-music.fpk" -ForegroundColor Green
} else {
  Write-Host "未找到 fnpack，请手动在 fpk 目录执行: fnpack build" -ForegroundColor Yellow
}
