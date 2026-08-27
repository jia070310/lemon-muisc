# Feiniu FPK build — native app (store Node.js v22)
# Small package: dist + server + package.json only
# Set -BundleNodeModules to also pack linux node_modules (much larger)

param(
  [switch]$BundleNodeModules
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$FpkDir = Join-Path $Root "fpk"
$AppBundle = Join-Path $FpkDir "app\bundle"
$ManifestPath = Join-Path $FpkDir "manifest"

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

function Clear-AppRuntimeDirs {
  foreach ($name in @("server", "dist", "node_modules", "bundle")) {
    $p = Join-Path $FpkDir "app\$name"
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
  }
  foreach ($f in @("package.json", "package-lock.json")) {
    $p = Join-Path $FpkDir "app\$f"
    if (Test-Path $p) { Remove-Item -Force $p }
  }
}

function Install-LinuxNodeModules {
  param(
    [Parameter(Mandatory = $true)][string]$TargetDir,
    [Parameter(Mandatory = $true)][ValidateSet("x64", "arm64")][string]$Arch
  )
  $nm = Join-Path $TargetDir "node_modules"
  if (Test-Path $nm) { Remove-Item -Recurse -Force $nm }

  Write-Host ">>> npm ci --omit=dev --ignore-scripts (linux/$Arch)" -ForegroundColor Cyan
  Push-Location $TargetDir
  try {
    $env:npm_config_platform = "linux"
    $env:npm_config_arch = $Arch
    $env:npm_config_registry = "https://registry.npmmirror.com"
    $env:npm_config_disturl = "https://npmmirror.com/mirrors/node"
    $env:npm_config_build_from_source = "false"
    npm ci --omit=dev --ignore-scripts
    if ($LASTEXITCODE -ne 0) {
      npm install --omit=dev --ignore-scripts
      if ($LASTEXITCODE -ne 0) { throw "npm install --ignore-scripts failed for linux/$Arch" }
    }
  }
  finally {
    Remove-Item Env:npm_config_platform -ErrorAction SilentlyContinue
    Remove-Item Env:npm_config_arch -ErrorAction SilentlyContinue
    Remove-Item Env:npm_config_registry -ErrorAction SilentlyContinue
    Remove-Item Env:npm_config_disturl -ErrorAction SilentlyContinue
    Remove-Item Env:npm_config_build_from_source -ErrorAction SilentlyContinue
    Pop-Location
  }
}

# 1) Build frontend
Write-Host ">>> npm run build" -ForegroundColor Cyan
Set-Location $Root
if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  npm ci
}
npm run build
if (-not (Test-Path (Join-Path $Root "dist"))) {
  throw "dist/ missing after build"
}

# 2) Stage sources (no node_modules by default)
Write-Host ">>> stage app sources (small package=$(-not $BundleNodeModules))" -ForegroundColor Cyan
Clear-AppRuntimeDirs
New-Item -ItemType Directory -Path $AppBundle | Out-Null
Copy-Item -Recurse (Join-Path $Root "dist") (Join-Path $AppBundle "dist")
Copy-Item -Recurse (Join-Path $Root "server") (Join-Path $AppBundle "server")
Copy-Item (Join-Path $Root "package.json") (Join-Path $AppBundle "package.json")
if (Test-Path (Join-Path $Root "package-lock.json")) {
  Copy-Item (Join-Path $Root "package-lock.json") (Join-Path $AppBundle "package-lock.json")
}

# Flatten into fpk/app for fnpack
Copy-Item -Recurse (Join-Path $AppBundle "server") (Join-Path $FpkDir "app\server")
Copy-Item -Recurse (Join-Path $AppBundle "dist") (Join-Path $FpkDir "app\dist")
Copy-Item -Force (Join-Path $AppBundle "package.json") (Join-Path $FpkDir "app\package.json")
if (Test-Path (Join-Path $AppBundle "package-lock.json")) {
  Copy-Item -Force (Join-Path $AppBundle "package-lock.json") (Join-Path $FpkDir "app\package-lock.json")
}

Write-Host ">>> normalize cmd scripts to LF" -ForegroundColor Cyan
Get-ChildItem -Path (Join-Path $FpkDir "cmd") -File | ForEach-Object {
  $text = [IO.File]::ReadAllText($_.FullName).Replace("`r`n", "`n")
  [IO.File]::WriteAllText($_.FullName, $text)
}

$version = "1.0.0"
if (Test-Path $ManifestPath) {
  $m = Select-String -Path $ManifestPath -Pattern '^\s*version\s*=\s*(.+)\s*$' | Select-Object -First 1
  if ($m) { $version = $m.Matches[0].Groups[1].Value.Trim() }
}

$originalManifest = [IO.File]::ReadAllText($ManifestPath)
try {
  foreach ($platform in @("x86", "arm")) {
    if ($BundleNodeModules) {
      $npmArch = if ($platform -eq "arm") { "arm64" } else { "x64" }
      $stageDir = Join-Path $FpkDir "app\.stage-$platform"
      if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
      New-Item -ItemType Directory -Path $stageDir | Out-Null
      Copy-Item -Recurse (Join-Path $AppBundle "*") $stageDir
      Install-LinuxNodeModules -TargetDir $stageDir -Arch $npmArch

      $nmDest = Join-Path $FpkDir "app\node_modules"
      if (Test-Path $nmDest) { Remove-Item -Recurse -Force $nmDest }
      Copy-Item -Recurse (Join-Path $stageDir "node_modules") $nmDest
      Remove-Item -Recurse -Force $stageDir -ErrorAction SilentlyContinue
    } else {
      $nmDest = Join-Path $FpkDir "app\node_modules"
      if (Test-Path $nmDest) { Remove-Item -Recurse -Force $nmDest }
    }

    $patchedManifest = [regex]::Replace(
      $originalManifest,
      '(?m)^(\s*platform\s*=\s*).+$',
      "`$1$platform"
    )
    [IO.File]::WriteAllText($ManifestPath, $patchedManifest)

    Set-Location $FpkDir
    Write-Host ">>> fnpack build ($platform)" -ForegroundColor Cyan
    & $fnpackPath build

    $fpk = Join-Path $FpkDir "lemon-music.fpk"
    if (-not (Test-Path $fpk)) { throw "lemon-music.fpk was not created for platform $platform" }

    $versioned = Join-Path $FpkDir "lemon-music-$version-$platform.fpk"
    Copy-Item -Force $fpk $versioned
    $sizeMb = [math]::Round((Get-Item $versioned).Length / 1MB, 2)
    Write-Host "Done: $versioned ($sizeMb MB)" -ForegroundColor Green
  }
}
finally {
  [IO.File]::WriteAllText($ManifestPath, $originalManifest)
}
