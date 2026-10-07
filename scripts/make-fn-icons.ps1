# Build fnNAS-compliant icons from the 3D lemon-headphones glyph:
# rounded-rect tile + transparent outside the tile.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $PSScriptRoot
$SrcCandidates = @(
  (Join-Path $Root "assets\brand-icons\headphones-3d-source.png"),
  (Join-Path $Root "dist\public\icon.png"),
  (Join-Path $Root "public\icon.png")
)
$Src = $SrcCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Src) { throw "missing 3D headphones source PNG" }
Write-Host "source: $Src"

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-FnIcon([int]$size, [string]$outPath, [System.Drawing.Image]$headphones) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  # Small outer margin only — leave room for soft shadow while maximizing tile
  $inset = [math]::Max(2.0, $size * 0.05)
  $tile = $size - (2 * $inset)
  $radius = [math]::Max(6.0, $tile * 0.22)

  $shadowPath = New-RoundedRectPath ($inset + $size * 0.015) ($inset + $size * 0.03) $tile $tile $radius
  $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
  $g.FillPath($shadowBrush, $shadowPath)
  $shadowBrush.Dispose()
  $shadowPath.Dispose()

  $tilePath = New-RoundedRectPath $inset $inset $tile $tile $radius

  # Bright orange cushioned tile (match reference: vivid orange + soft 3D)
  $cTop = [System.Drawing.Color]::FromArgb(255, 255, 156, 58)
  $cMid = [System.Drawing.Color]::FromArgb(255, 255, 122, 28)
  $cBot = [System.Drawing.Color]::FromArgb(255, 230, 88, 12)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    (New-Object System.Drawing.RectangleF $inset, $inset, $tile, $tile),
    $cTop, $cBot,
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
  )
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
  $blend.Colors = @($cTop, $cMid, $cBot)
  $blend.Positions = @(0.0, 0.45, 1.0)
  $brush.InterpolationColors = $blend
  $g.FillPath($brush, $tilePath)
  $brush.Dispose()

  $g.SetClip($tilePath)
  # Top gloss / convex highlight
  $hi = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    (New-Object System.Drawing.RectangleF $inset, $inset, $tile, ($tile * 0.55)),
    ([System.Drawing.Color]::FromArgb(95, 255, 255, 255)),
    ([System.Drawing.Color]::FromArgb(0, 255, 255, 255)),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
  )
  $g.FillRectangle($hi, $inset, $inset, $tile, ($tile * 0.55))
  $hi.Dispose()
  # Bottom inner shadow for cushion depth
  $shade = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    (New-Object System.Drawing.RectangleF $inset, ($inset + $tile * 0.55), $tile, ($tile * 0.45)),
    ([System.Drawing.Color]::FromArgb(0, 120, 40, 0)),
    ([System.Drawing.Color]::FromArgb(55, 120, 40, 0)),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
  )
  $g.FillRectangle($shade, $inset, ($inset + $tile * 0.55), $tile, ($tile * 0.45))
  $shade.Dispose()
  $g.ResetClip()

  # Headphones ~70% of tile (not too small)
  $pad = $tile * 0.05
  $dest = New-Object System.Drawing.RectangleF (
    ($inset + $pad),
    ($inset + $pad),
    ($tile - 2 * $pad),
    ($tile - 2 * $pad)
  )
  $g.SetClip($tilePath)
  $g.DrawImage($headphones, $dest)
  $g.ResetClip()

  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(35, 90, 30, 0)), ([math]::Max(1.0, $size / 160.0))
  $g.DrawPath($pen, $tilePath)
  $pen.Dispose()
  $tilePath.Dispose()

  $dir = Split-Path -Parent $outPath
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  if (Test-Path $outPath) { Remove-Item $outPath -Force }
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "wrote $outPath ($size x $size)"
}

function New-PlainResize([int]$size, [string]$outPath, [System.Drawing.Image]$headphones) {
  # Transparent glyph only (no tile) — for web favicon variants if needed
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)
  $pad = [math]::Max(1.0, $size * 0.06)
  $dest = New-Object System.Drawing.RectangleF $pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad)
  $g.DrawImage($headphones, $dest)
  $dir = Split-Path -Parent $outPath
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  if (Test-Path $outPath) { Remove-Item $outPath -Force }
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "wrote $outPath ($size x $size plain)"
}

$headphones = [System.Drawing.Image]::FromFile($Src)
try {
  $tileTargets = @(
    @{ Size = 512; Path = (Join-Path $Root "icon.png") },
    @{ Size = 64; Path = (Join-Path $Root "fpk\ICON.PNG") },
    @{ Size = 256; Path = (Join-Path $Root "fpk\ICON_256.PNG") },
    @{ Size = 32; Path = (Join-Path $Root "fpk\app\ui\images\icon_32.png") },
    @{ Size = 48; Path = (Join-Path $Root "fpk\app\ui\images\icon_48.png") },
    @{ Size = 64; Path = (Join-Path $Root "fpk\app\ui\images\icon_64.png") },
    @{ Size = 128; Path = (Join-Path $Root "fpk\app\ui\images\icon_128.png") },
    @{ Size = 256; Path = (Join-Path $Root "fpk\app\ui\images\icon_256.png") },
    @{ Size = 32; Path = (Join-Path $Root "fpk\app\ui\images\icon-32.png") },
    @{ Size = 48; Path = (Join-Path $Root "fpk\app\ui\images\icon-48.png") },
    @{ Size = 64; Path = (Join-Path $Root "fpk\app\ui\images\icon-64.png") },
    @{ Size = 128; Path = (Join-Path $Root "fpk\app\ui\images\icon-128.png") },
    @{ Size = 256; Path = (Join-Path $Root "fpk\app\ui\images\icon-256.png") },
    # Web / PWA (source under public/; dist rebuilt by vite)
    @{ Size = 512; Path = (Join-Path $Root "public\icon.png") },
    @{ Size = 192; Path = (Join-Path $Root "public\icon-192.png") },
    @{ Size = 512; Path = (Join-Path $Root "public\icon-512.png") },
    @{ Size = 180; Path = (Join-Path $Root "public\apple-touch-icon.png") },
    @{ Size = 64; Path = (Join-Path $Root "public\favicon.png") },
    @{ Size = 192; Path = (Join-Path $Root "public\pwa\icon-192.png") },
    @{ Size = 512; Path = (Join-Path $Root "public\pwa\icon-512.png") },
    @{ Size = 512; Path = (Join-Path $Root "public\pwa\icon-maskable-512.png") }
  )
  foreach ($t in $tileTargets) {
    New-FnIcon -size $t.Size -outPath $t.Path -headphones $headphones
  }

  # Also keep a plain transparent glyph copy as legacy black-name slot if present
  $legacy = Join-Path $Root "public\icon-black-legacy.png"
  if (Test-Path $legacy) {
    New-PlainResize -size 512 -outPath $legacy -headphones $headphones
  }

  # favicon.ico from 64 tile
  $icoSrc = Join-Path $Root "public\favicon.png"
  if (Test-Path $icoSrc) {
    $icoBmp = [System.Drawing.Bitmap]::FromFile($icoSrc)
    $icoPath = Join-Path $Root "public\favicon.ico"
    if (Test-Path $icoPath) { Remove-Item $icoPath -Force }
    $icoBmp.Save($icoPath, [System.Drawing.Imaging.ImageFormat]::Icon)
    $icoBmp.Dispose()
    Write-Host "wrote $icoPath"
  }
} finally {
  $headphones.Dispose()
}

Write-Host "done"
