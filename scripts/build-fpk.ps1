# Feiniu FPK build — native app (store Node.js v22)
# Small package: dist + server + package.json only
# Set -BundleNodeModules to also pack linux node_modules (much larger)
# Telemetry: inject from local file / TELEMETRY_* env (never commit real secrets).
# Use -AllowNoTelemetry only for test packs without DAU endpoint.

param(
  [switch]$BundleNodeModules,
  [switch]$AllowNoTelemetry,
  [switch]$SkipFrontendBuild,
  [switch]$SkipClean
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

function Get-TelemetryConfigObject {
  $localCandidates = @(
    (Join-Path $Root "server\telemetry.local.json"),
    (Join-Path $Root "config\telemetry.local.json")
  )
  foreach ($file in $localCandidates) {
    if (-not (Test-Path $file)) { continue }
    try {
      $raw = Get-Content -Raw -Path $file | ConvertFrom-Json
      if ($null -eq $raw) { continue }
      $url = [string]$raw.url
      $secret = [string]$raw.secret
      if (-not $url -and $raw.urlB64) {
        $url = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]$raw.urlB64))
      }
      if (-not $secret -and $raw.secretB64) {
        $secret = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]$raw.secretB64))
      }
      $url = $url.Trim()
      $secret = $secret.Trim()
      if ($url -and $secret) {
        return @{ url = $url; secret = $secret; source = $file }
      }
    } catch {
      Write-Host ">>> telemetry: ignore bad file $file ($($_.Exception.Message))" -ForegroundColor Yellow
    }
  }

  $envUrl = [string]$env:TELEMETRY_URL
  $envSecret = [string]$env:TELEMETRY_SECRET
  if ($envUrl.Trim() -and $envSecret.Trim()) {
    return @{ url = $envUrl.Trim(); secret = $envSecret.Trim(); source = "TELEMETRY_URL/TELEMETRY_SECRET" }
  }
  return $null
}

function Install-TelemetryIntoServerDir {
  param([Parameter(Mandatory = $true)][string]$ServerDir)

  $dest = Join-Path $ServerDir "telemetry.local.json"
  $cfg = Get-TelemetryConfigObject
  if (-not $cfg) {
    if (Test-Path $dest) { Remove-Item -Force $dest }
    $msg = "telemetry endpoint missing. Create server/telemetry.local.json or set TELEMETRY_URL + TELEMETRY_SECRET before fpk:build (Releases packs need it). Use -AllowNoTelemetry for a test pack without DAU."
    if ($AllowNoTelemetry) {
      Write-Host ">>> telemetry: SKIPPED ($msg)" -ForegroundColor Yellow
      return
    }
    throw $msg
  }

  $payload = @{ url = $cfg.url; secret = $cfg.secret } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($dest, $payload + "`n", [Text.UTF8Encoding]::new($false))
  Write-Host ">>> telemetry: injected into FPK from $($cfg.source)" -ForegroundColor Cyan
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
    npm.cmd ci --omit=dev --ignore-scripts
    if ($LASTEXITCODE -ne 0) {
      npm.cmd install --omit=dev --ignore-scripts
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
if ($SkipFrontendBuild) {
  if (-not (Test-Path (Join-Path $Root "dist\public"))) {
    throw "dist/public missing, cannot skip frontend build"
  }
  Write-Host ">>> skip frontend build (reuse dist/public)" -ForegroundColor Cyan
} else {
  Write-Host ">>> npm run build" -ForegroundColor Cyan
  Set-Location $Root
  if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    npm.cmd ci
  }
  npm.cmd run build
  if (-not (Test-Path (Join-Path $Root "dist"))) {
    throw "dist/ missing after build"
  }
}

# 2) Stage sources (no node_modules by default)
Write-Host ">>> stage app sources (small package=$(-not $BundleNodeModules))" -ForegroundColor Cyan
Clear-AppRuntimeDirs
New-Item -ItemType Directory -Path $AppBundle | Out-Null
Copy-Item -Recurse (Join-Path $Root "dist") (Join-Path $AppBundle "dist")
Copy-Item -Recurse (Join-Path $Root "server") (Join-Path $AppBundle "server")
# Never ship the example as a real config; inject release endpoint separately
$exampleInBundle = Join-Path $AppBundle "server\telemetry.local.json.example"
if (Test-Path $exampleInBundle) { Remove-Item -Force $exampleInBundle }
Install-TelemetryIntoServerDir -ServerDir (Join-Path $AppBundle "server")
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
