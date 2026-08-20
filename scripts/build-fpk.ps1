# Feiniu FPK build (no bundled image; NAS Docker pulls ghcr.io at install)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$FpkDir = Join-Path $Root "fpk"
$TarPath = Join-Path $Root "fpk\app\docker\images\lemon-music.tar"

if (Test-Path $TarPath) { Remove-Item -Force $TarPath -ErrorAction SilentlyContinue }

$fnpackPath = $null
if (Get-Command fnpack -ErrorAction SilentlyContinue) {
  $fnpackPath = (Get-Command fnpack).Source
} elseif (Test-Path (Join-Path $Root "tools\fnpack.exe")) {
  $fnpackPath = Join-Path $Root "tools\fnpack.exe"
}
if (-not $fnpackPath) {
  Write-Host "fnpack not found. Put fnpack.exe in tools\ or PATH." -ForegroundColor Red
  exit 1
}

Write-Host ">>> fnpack build (pull ghcr.io/jia070310/lemon-muisc:latest on NAS)" -ForegroundColor Cyan
Set-Location $FpkDir
& $fnpackPath build

$fpk = Join-Path $FpkDir "lemon-music.fpk"
if (-not (Test-Path $fpk)) { throw "lemon-music.fpk was not created" }
$sizeMb = [math]::Round((Get-Item $fpk).Length / 1MB, 2)
Write-Host "Done: $fpk ($sizeMb MB)" -ForegroundColor Green
