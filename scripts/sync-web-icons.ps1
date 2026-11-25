# Resize brand orange-tile master into all webpage / PWA / root icon slots.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $PSScriptRoot
$Master = Join-Path $Root "assets\brand-icons\icon-orange-tile-master.png"
if (-not (Test-Path $Master)) { throw "missing master: $Master" }

$src = [System.Drawing.Image]::FromFile($Master)
Write-Host "master $($src.Width)x$($src.Height) from $Master"

function Save-Resized([int]$size, [string]$outPath) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
  $dir = Split-Path -Parent $outPath
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  if (Test-Path $outPath) { Remove-Item -Force $outPath }
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "wrote $outPath ($size)"
}

try {
  $targets = @(
    @{ S = 512; P = (Join-Path $Root "public\icon.png") },
    @{ S = 512; P = (Join-Path $Root "public\icon-512.png") },
    @{ S = 192; P = (Join-Path $Root "public\icon-192.png") },
    @{ S = 180; P = (Join-Path $Root "public\apple-touch-icon.png") },
    @{ S = 64;  P = (Join-Path $Root "public\favicon.png") },
    @{ S = 192; P = (Join-Path $Root "public\pwa\icon-192.png") },
    @{ S = 512; P = (Join-Path $Root "public\pwa\icon-512.png") },
    @{ S = 512; P = (Join-Path $Root "public\pwa\icon-maskable-512.png") },
    @{ S = 512; P = (Join-Path $Root "icon.png") },
    @{ S = 64;  P = (Join-Path $Root "fpk\ICON.PNG") },
    @{ S = 256; P = (Join-Path $Root "fpk\ICON_256.PNG") },
    @{ S = 32;  P = (Join-Path $Root "fpk\app\ui\images\icon_32.png") },
    @{ S = 48;  P = (Join-Path $Root "fpk\app\ui\images\icon_48.png") },
    @{ S = 64;  P = (Join-Path $Root "fpk\app\ui\images\icon_64.png") },
    @{ S = 128; P = (Join-Path $Root "fpk\app\ui\images\icon_128.png") },
    @{ S = 256; P = (Join-Path $Root "fpk\app\ui\images\icon_256.png") },
    @{ S = 32;  P = (Join-Path $Root "fpk\app\ui\images\icon-32.png") },
    @{ S = 48;  P = (Join-Path $Root "fpk\app\ui\images\icon-48.png") },
    @{ S = 64;  P = (Join-Path $Root "fpk\app\ui\images\icon-64.png") },
    @{ S = 128; P = (Join-Path $Root "fpk\app\ui\images\icon-128.png") },
    @{ S = 256; P = (Join-Path $Root "fpk\app\ui\images\icon-256.png") }
  )
  foreach ($t in $targets) { Save-Resized -size $t.S -outPath $t.P }

  $icoSrcPath = Join-Path $Root "public\favicon.png"
  $icoBmp = [System.Drawing.Bitmap]::FromFile($icoSrcPath)
  $icoPath = Join-Path $Root "public\favicon.ico"
  if (Test-Path $icoPath) { Remove-Item -Force $icoPath }
  $icoBmp.Save($icoPath, [System.Drawing.Imaging.ImageFormat]::Icon)
  $icoBmp.Dispose()
  Write-Host "wrote $icoPath"
}
finally {
  $src.Dispose()
}

Write-Host "done"
