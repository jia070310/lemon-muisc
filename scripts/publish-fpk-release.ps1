# Pack FPK on this machine and upload GitHub Release. Requires: gh auth, fnpack.

param(
  [switch]$SkipBuild,
  [switch]$SkipFrontendBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$FpkDir = Join-Path $Root "fpk"
$ManifestPath = Join-Path $FpkDir "manifest"

$env:Path = "C:\Tools\gh\bin;C:\Program Files\GitHub CLI;C:\Program Files\Git\cmd;C:\Tools\nodejs;" + $env:Path

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "gh not found. Install GitHub CLI and run: gh auth login"
}
gh auth status 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { throw "gh is not logged in. Run: gh auth login" }

$version = "0.0.0"
$m = Select-String -Path $ManifestPath -Pattern '^\s*version\s*=\s*(.+)\s*$' | Select-Object -First 1
if ($m) { $version = $m.Matches[0].Groups[1].Value.Trim() }
$tag = "v$version"
$x86 = Join-Path $FpkDir "lemon-music-$version-x86.fpk"
$arm = Join-Path $FpkDir "lemon-music-$version-arm.fpk"

if (-not $SkipBuild) {
  Write-Host ">>> local fpk:build then pack" -ForegroundColor Cyan
  $build = Join-Path $PSScriptRoot "build-fpk.ps1"
  $args = @()
  if ($SkipFrontendBuild) { $args += "-SkipFrontendBuild" }
  & $build @args
  if ($LASTEXITCODE -ne 0) { throw "fpk:build failed" }
}

foreach ($p in @($x86, $arm)) {
  if (-not (Test-Path $p)) { throw "missing pack: $p" }
}

$notes = Join-Path $FpkDir "release-notes-$tag.md"
if (-not (Test-Path $notes)) { $notes = Join-Path $Root "docs\github-release.md" }
if (-not (Test-Path $notes)) { $notes = Join-Path $Root "docs\RELEASE-NOTES.md" }

Set-Location $Root
$remote = (git remote get-url origin).Trim()
if ($remote -notmatch "jia070310/lemon-muisc") {
  Write-Host ">>> origin is $remote" -ForegroundColor Yellow
}

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
git rev-parse --verify "refs/tags/$tag" 2>$null | Out-Null
$tagExists = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevEap
if ($tagExists) {
  Write-Host ">>> git tag $tag already exists"
} else {
  git tag $tag
  git push origin $tag
  if ($LASTEXITCODE -ne 0) { throw "git push tag failed" }
}

$repo = "jia070310/lemon-muisc"
gh release view $tag --repo $repo 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host ">>> updating GitHub Release $tag"
  gh release edit $tag --title "柠檬音乐 $tag" --notes-file $notes --repo $repo
} else {
  Write-Host ">>> creating GitHub Release $tag"
  gh release create $tag --title "柠檬音乐 $tag" --notes-file $notes --repo $repo
}

gh release upload $tag $x86 $arm --clobber --repo $repo

Write-Host ">>> update fnpack.json (FnDepot V2)" -ForegroundColor Cyan
node (Join-Path $PSScriptRoot "update-fnpack-json.mjs") --version $version --x86 $x86 --arm $arm
if ($LASTEXITCODE -ne 0) { throw "update-fnpack-json failed" }
git add fnpack.json
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "chore: update fnpack.json for v$version"
  if ($LASTEXITCODE -ne 0) { throw "git commit fnpack.json failed" }
  git push origin HEAD
  if ($LASTEXITCODE -ne 0) { throw "git push fnpack.json failed" }
} else {
  Write-Host ">>> fnpack.json unchanged"
}

Write-Host "Done: https://github.com/jia070310/lemon-muisc/releases/tag/$tag" -ForegroundColor Green
Write-Host "FnDepot source: https://github.com/jia070310/lemon-muisc" -ForegroundColor Green
