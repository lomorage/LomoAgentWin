#!/bin/bash
# ============================================================
# Build Lomo Photo Viewer — Tauri v2 Desktop App
# ============================================================
# Usage:
#   ./build-tauri.sh              # Full build (web + proxy + tauri)
#   ./build-tauri.sh --skip-web   # Skip web frontend rebuild
#   ./build-tauri.sh --skip-proxy # Skip proxy rebuild
#   ./build-tauri.sh --dev        # Debug build (faster, no installer)
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
export PATH="$HOME/.cargo/bin:$PATH"

SKIP_WEB=false
SKIP_PROXY=false
DEV_BUILD=false

for arg in "$@"; do
  case $arg in
    --skip-web)   SKIP_WEB=true ;;
    --skip-proxy) SKIP_PROXY=true ;;
    --dev)        DEV_BUILD=true ;;
    --help|-h)
      echo "Usage: ./build-tauri.sh [--skip-web] [--skip-proxy] [--dev] [--help]"
      echo ""
      echo "Options:"
      echo "  --skip-web    Skip rebuilding the Immich web frontend"
      echo "  --skip-proxy  Skip rebuilding the proxy executable"
      echo "  --dev         Build in debug mode (faster, no installer)"
      echo "  --help        Show this help message"
      exit 0 ;;
  esac
done

echo "=== Building Lomo Photo Viewer Tauri App ==="

# ---- Step 1: Build Immich web frontend ----
if [ "$SKIP_WEB" = false ]; then
  echo ""
  echo "--- Step 1: Building Immich web frontend ---"
  cd submodules/immich/web
  pnpm install --force
  pnpm run build

  echo "Creating web.zip in src-tauri/resources/"
  rm -f "$SCRIPT_DIR/src-tauri/resources/web.zip"
  cd build && zip -r "$SCRIPT_DIR/src-tauri/resources/web.zip" . && cd ..
  cd "$SCRIPT_DIR"
else
  echo ""
  echo "--- Step 1: Skipping web frontend build ---"
fi

# ---- Step 2: Build proxy executable ----
if [ "$SKIP_PROXY" = false ]; then
  echo ""
  echo "--- Step 2: Building proxy executable ---"
  cd proxy
  npm install

  echo "Bundling with esbuild..."
  npx esbuild server.ts --bundle --platform=node --target=node20 --outfile=dist/server.cjs

  echo "Packaging with pkg..."
  npx pkg dist/server.cjs --targets node20-win-x64 --output dist/proxy.exe

  echo "Copying proxy.exe to src-tauri/resources/"
  cp dist/proxy.exe "$SCRIPT_DIR/src-tauri/resources/proxy.exe"
  cd "$SCRIPT_DIR"
else
  echo ""
  echo "--- Step 2: Skipping proxy build ---"
fi

# ---- Step 3: Verify lomo-backend files ----
echo ""
echo "--- Step 3: Verifying lomo-backend files ---"
if [ -f "src-tauri/resources/lomod/lomod.exe" ]; then
  echo "lomod.exe: OK"
else
  echo "ERROR: lomod.exe not found in src-tauri/resources/lomod/"
  echo "Extract lomoagent.msi and copy lomod/ contents to src-tauri/resources/lomod/"
  echo "  msiexec /a lomoagent.msi /qn TARGETDIR=C:\\temp\\msi-extract"
  echo "  cp -r /c/temp/msi-extract/PFiles/Lomoware/Lomoagent/lomod/* src-tauri/resources/lomod/"
  exit 1
fi

# ---- Step 4: Build Tauri app ----
echo ""
echo "--- Step 4: Building Tauri application ---"
if [ "$DEV_BUILD" = true ]; then
  echo "Building in debug mode..."
  cargo tauri build --debug
else
  echo "Building release..."
  cargo tauri build
fi

echo ""
echo "=== Build complete! ==="
ls -lh src-tauri/target/release/bundle/msi/*.msi 2>/dev/null || echo "(MSI not found)"
ls -lh src-tauri/target/release/bundle/nsis/*-setup.exe 2>/dev/null || echo "(NSIS not found)"
