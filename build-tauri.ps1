# ============================================================
# Build Lomo Photo Viewer — Tauri v2 Desktop App
# ============================================================
# Usage:
#   .\build-tauri.ps1              # Full build (web + proxy + tauri)
#   .\build-tauri.ps1 -SkipWeb     # Skip web frontend rebuild
#   .\build-tauri.ps1 -SkipProxy   # Skip proxy rebuild
#   .\build-tauri.ps1 -DevBuild    # Debug build (faster, no installer)
# ============================================================

param(
    [switch]$SkipWeb,
    [switch]$SkipProxy,
    [switch]$DevBuild,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Help) {
    Write-Host @"
Build Lomo Photo Viewer Tauri App

Usage: .\build-tauri.ps1 [options]

Options:
  -SkipWeb      Skip rebuilding the Immich web frontend
  -SkipProxy    Skip rebuilding the proxy executable
  -DevBuild     Build in debug mode (faster, no installer)
  -Help         Show this help message

Prerequisites:
  - Node.js 20+
  - pnpm
  - Rust toolchain (rustup)
  - cargo tauri-cli v2 (cargo install tauri-cli --version "^2")

Directory structure expected:
  src-tauri/resources/lomod/    — lomo-backend files (lomod.exe, ffmpeg, DLLs)
  src-tauri/resources/web.zip   — zipped Immich web frontend (extracted at runtime)
  src-tauri/resources/proxy.exe — compiled proxy server
"@
    exit 0
}

Write-Host "=== Building Lomo Photo Viewer Tauri App ===" -ForegroundColor Cyan

# ---- Step 1: Build Immich web frontend ----
if (-not $SkipWeb) {
    Write-Host "`n--- Step 1: Building Immich web frontend ---" -ForegroundColor Yellow
    Push-Location "$ScriptDir\submodules\immich\web"

    Write-Host "Installing dependencies..."
    pnpm install --force
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

    Write-Host "Building static SPA..."
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build failed" }

    # Create web.zip for Tauri resources (preserves directory structure)
    $webZip = "$ScriptDir\src-tauri\resources\web.zip"
    if (Test-Path $webZip) { Remove-Item -Force $webZip }
    Compress-Archive -Path "build\*" -DestinationPath $webZip
    Write-Host "Web build zipped to src-tauri/resources/web.zip" -ForegroundColor Green

    Pop-Location
} else {
    Write-Host "`n--- Step 1: Skipping web frontend build ---" -ForegroundColor DarkGray
}

# ---- Step 2: Build proxy executable ----
if (-not $SkipProxy) {
    Write-Host "`n--- Step 2: Building proxy executable ---" -ForegroundColor Yellow
    Push-Location "$ScriptDir\proxy"

    Write-Host "Installing dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    Write-Host "Bundling with esbuild..."
    npx esbuild server.ts --bundle --platform=node --target=node20 --outfile=dist/server.cjs --external:sharp
    if ($LASTEXITCODE -ne 0) { throw "esbuild bundle failed" }

    Write-Host "Packaging with pkg..."
    npx pkg dist/server.cjs --targets node20-win-x64 --output dist/proxy.exe
    if ($LASTEXITCODE -ne 0) { throw "pkg build failed" }

    # Copy to Tauri resources
    Copy-Item "dist\proxy.exe" "$ScriptDir\src-tauri\resources\proxy.exe" -Force

    # Create sharp.zip for HEIC support (Tauri flattens resources, zip preserves directory structure)
    $sharpZip = "$ScriptDir\src-tauri\resources\sharp.zip"
    $sharpStaging = "$ScriptDir\proxy\dist\sharp_staging"
    if (Test-Path $sharpStaging) { Remove-Item -Recurse -Force $sharpStaging }
    New-Item -ItemType Directory -Path "$sharpStaging\node_modules\sharp\lib" -Force | Out-Null
    New-Item -ItemType Directory -Path "$sharpStaging\node_modules\@img\sharp-win32-x64\lib" -Force | Out-Null
    Copy-Item "node_modules\sharp\lib\*" "$sharpStaging\node_modules\sharp\lib\" -Force
    Copy-Item "node_modules\sharp\package.json" "$sharpStaging\node_modules\sharp\" -Force
    Copy-Item "node_modules\@img\sharp-win32-x64\lib\*" "$sharpStaging\node_modules\@img\sharp-win32-x64\lib\" -Force
    Copy-Item "node_modules\@img\sharp-win32-x64\package.json" "$sharpStaging\node_modules\@img\sharp-win32-x64\" -Force
    # Sharp's JS dependencies
    foreach ($dep in @("detect-libc", "semver", "@img\colour")) {
        $src = "node_modules\$dep"
        $dst = "$sharpStaging\node_modules\$dep"
        if (Test-Path $src) {
            Copy-Item $src $dst -Recurse -Force
        }
    }
    if (Test-Path $sharpZip) { Remove-Item -Force $sharpZip }
    Compress-Archive -Path "$sharpStaging\*" -DestinationPath $sharpZip
    Remove-Item -Recurse -Force $sharpStaging
    Write-Host "sharp.zip created at src-tauri/resources/sharp.zip" -ForegroundColor Green

    Pop-Location
} else {
    Write-Host "`n--- Step 2: Skipping proxy build ---" -ForegroundColor DarkGray
}

# ---- Step 3: Verify lomo-backend files ----
Write-Host "`n--- Step 3: Verifying lomo-backend files ---" -ForegroundColor Yellow
$lomodExe = "$ScriptDir\src-tauri\resources\lomod\lomod.exe"
if (Test-Path $lomodExe) {
    Write-Host "lomod.exe: OK" -ForegroundColor Green
} else {
    Write-Host "ERROR: lomod.exe not found at $lomodExe" -ForegroundColor Red
    Write-Host "Extract lomoagent.msi and copy lomod/ contents to src-tauri/resources/lomod/" -ForegroundColor Red
    Write-Host "  msiexec /a lomoagent.msi /qn TARGETDIR=C:\temp\msi-extract" -ForegroundColor DarkGray
    Write-Host "  Copy-Item -Recurse C:\temp\msi-extract\PFiles\Lomoware\Lomoagent\lomod\* src-tauri\resources\lomod\" -ForegroundColor DarkGray
    exit 1
}

# ---- Step 4: Build Tauri app ----
Write-Host "`n--- Step 4: Building Tauri application ---" -ForegroundColor Yellow
Push-Location "$ScriptDir"

if ($DevBuild) {
    Write-Host "Building in debug mode..."
    cargo tauri build --debug
} else {
    Write-Host "Building release..."
    cargo tauri build
}
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

Pop-Location

# ---- Done ----
Write-Host "`n=== Build complete! ===" -ForegroundColor Cyan

$msi = Get-ChildItem "$ScriptDir\src-tauri\target\release\bundle\msi\*.msi" -ErrorAction SilentlyContinue
$nsis = Get-ChildItem "$ScriptDir\src-tauri\target\release\bundle\nsis\*-setup.exe" -ErrorAction SilentlyContinue

if ($msi) { Write-Host "MSI:  $($msi.FullName) ($([math]::Round($msi.Length/1MB))MB)" -ForegroundColor Green }
if ($nsis) { Write-Host "NSIS: $($nsis.FullName) ($([math]::Round($nsis.Length/1MB))MB)" -ForegroundColor Green }
