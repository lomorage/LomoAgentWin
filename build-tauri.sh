#!/usr/bin/env bash
# ============================================================
# Build Lomo Photo Viewer — Tauri v2 Desktop App (GitBash)
# ============================================================
# Usage:
#   ./build-tauri.sh              # Full build (web + proxy + tauri)
#   ./build-tauri.sh --skip-web   # Skip web frontend rebuild
#   ./build-tauri.sh --skip-proxy # Skip proxy rebuild
#   ./build-tauri.sh --dev        # Debug build (faster, no installer)
#   ./build-tauri.sh --help       # Show help
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
export PATH="$HOME/.cargo/bin:$PATH"

SKIP_WEB=false
SKIP_PROXY=false
DEV_BUILD=false

# ---- helpers ----
info() { echo -e "\033[36m$*\033[0m"; }
step() { echo -e "\n\033[33m--- $* ---\033[0m"; }
ok()   { echo -e "\033[32m$*\033[0m"; }
err()  { echo -e "\033[31mERROR: $*\033[0m" >&2; }

for arg in "$@"; do
  case $arg in
    --skip-web)   SKIP_WEB=true ;;
    --skip-proxy) SKIP_PROXY=true ;;
    --dev)        DEV_BUILD=true ;;
    --help|-h)
      echo "Build Lomo Photo Viewer Tauri App"
      echo ""
      echo "Usage: ./build-tauri.sh [options]"
      echo ""
      echo "Options:"
      echo "  --skip-web    Skip rebuilding the Immich web frontend"
      echo "  --skip-proxy  Skip rebuilding the proxy executable"
      echo "  --dev         Build in debug mode (faster, no installer)"
      echo "  --help        Show this help message"
      echo ""
      echo "Prerequisites:"
      echo "  - Node.js 20+, pnpm, npm"
      echo "  - Rust toolchain (rustup)"
      echo "  - cargo tauri-cli v2  (cargo install tauri-cli --version '^2')"
      echo ""
      echo "src-tauri/resources/lomod/lomod.exe must exist (extract from lomoagent.msi)"
      exit 0 ;;
    *)
      err "Unknown option: $arg  (use --help for usage)"
      exit 1 ;;
  esac
done

info "=== Building Lomo Photo Viewer Tauri App ==="

# ---- Step 1: Build Immich web frontend ----
if [ "$SKIP_WEB" = false ]; then
  step "Step 1: Building Immich web frontend"
  cd "$SCRIPT_DIR/submodules/immich/web"

  echo "Installing dependencies..."
  pnpm install --force

  # CRITICAL: clean both build/ and .svelte-kit/ to prevent stale cache
  echo "Cleaning previous build..."
  rm -rf build .svelte-kit

  echo "Building static SPA..."
  pnpm run build

  echo "Creating web.zip in src-tauri/resources/..."
  WEB_ZIP="$SCRIPT_DIR/src-tauri/resources/web.zip"
  rm -f "$WEB_ZIP"
  cd build
  zip -r "$WEB_ZIP" .
  cd "$SCRIPT_DIR"

  for target_dir in "$SCRIPT_DIR/src-tauri/target/release" "$SCRIPT_DIR/src-tauri/target/debug"; do
    if [ -d "$target_dir" ]; then
      cp "$WEB_ZIP" "$target_dir/web.zip"
    fi
  done
  ok "Web build zipped to src-tauri/resources/web.zip (synced to target dirs)"
else
  step "Step 1: Skipping web frontend build"
  WEB_ZIP="$SCRIPT_DIR/src-tauri/resources/web.zip"
  if [ ! -f "$WEB_ZIP" ] && [ -f "$SCRIPT_DIR/src-tauri/target/release/web.zip" ]; then
    cp "$SCRIPT_DIR/src-tauri/target/release/web.zip" "$WEB_ZIP"
    ok "Restored missing src-tauri/resources/web.zip from target/release"
  fi
fi

# ---- Step 2: Build proxy executable ----
if [ "$SKIP_PROXY" = false ]; then
  step "Step 2: Building proxy executable"
  cd "$SCRIPT_DIR/proxy"

  echo "Installing dependencies..."
  npm install

  echo "Bundling with esbuild..."
  # --external:sharp keeps the native module out of the bundle (loaded at runtime from sharp.zip)
  npx esbuild server.ts --bundle --platform=node --target=node20 \
    --outfile=dist/server.cjs --external:sharp

  echo "Packaging with pkg..."
  npx pkg dist/server.cjs --targets node20-win-x64 --output dist/proxy.exe

  cp dist/proxy.exe "$SCRIPT_DIR/src-tauri/resources/proxy.exe"
  ok "proxy.exe copied to src-tauri/resources/"

  # ---- Create sharp.zip (preserves node_modules directory structure) ----
  echo "Creating sharp.zip..."
  SHARP_ZIP="$SCRIPT_DIR/src-tauri/resources/sharp.zip"
  SHARP_STAGING="$SCRIPT_DIR/proxy/dist/sharp_staging"
  rm -rf "$SHARP_STAGING"
  mkdir -p "$SHARP_STAGING/node_modules/sharp/lib"
  mkdir -p "$SHARP_STAGING/node_modules/@img/sharp-win32-x64/lib"

  cp node_modules/sharp/lib/*             "$SHARP_STAGING/node_modules/sharp/lib/"
  cp node_modules/sharp/package.json      "$SHARP_STAGING/node_modules/sharp/"
  cp node_modules/@img/sharp-win32-x64/lib/* \
                                          "$SHARP_STAGING/node_modules/@img/sharp-win32-x64/lib/"
  cp node_modules/@img/sharp-win32-x64/package.json \
                                          "$SHARP_STAGING/node_modules/@img/sharp-win32-x64/"

  for dep in detect-libc semver @img/colour; do
    src="node_modules/$dep"
    if [ -e "$src" ]; then
      mkdir -p "$SHARP_STAGING/node_modules/$(dirname "$dep")"
      cp -r "$src" "$SHARP_STAGING/node_modules/$dep"
    fi
  done

  rm -f "$SHARP_ZIP"
  (cd "$SHARP_STAGING" && zip -r "$SHARP_ZIP" .)
  rm -rf "$SHARP_STAGING"
  ok "sharp.zip created at src-tauri/resources/sharp.zip"

  cd "$SCRIPT_DIR"
else
  step "Step 2: Skipping proxy build"
fi

# Sync proxy resources to existing target dirs
for target_dir in "$SCRIPT_DIR/src-tauri/target/release" "$SCRIPT_DIR/src-tauri/target/debug"; do
  if [ -d "$target_dir" ]; then
    [ -f "$SCRIPT_DIR/src-tauri/resources/proxy.exe" ] && \
      cp "$SCRIPT_DIR/src-tauri/resources/proxy.exe" "$target_dir/proxy.exe"
    [ -f "$SCRIPT_DIR/src-tauri/resources/sharp.zip" ] && \
      cp "$SCRIPT_DIR/src-tauri/resources/sharp.zip" "$target_dir/sharp.zip"
  fi
done
ok "Proxy resources synced to existing target directories"

# ---- Step 3: Verify lomo-backend files ----
step "Step 3: Verifying lomo-backend files"
LOMOD_EXE="$SCRIPT_DIR/src-tauri/resources/lomod/lomod.exe"
if [ -f "$LOMOD_EXE" ]; then
  ok "lomod.exe: OK"
else
  err "lomod.exe not found at $LOMOD_EXE"
  echo "Extract lomoagent.msi and copy lomod/ contents to src-tauri/resources/lomod/:"
  echo "  msiexec /a lomoagent.msi /qn TARGETDIR=C:\\temp\\msi-extract"
  echo "  cp -r /c/temp/msi-extract/PFiles/Lomoware/Lomoagent/lomod/* src-tauri/resources/lomod/"
  exit 1
fi

# ---- Step 4: Build Tauri app ----
step "Step 4: Building Tauri application"
cd "$SCRIPT_DIR"

if [ "$DEV_BUILD" = true ]; then
  echo "Building in debug mode..."
  cargo tauri build --debug
else
  echo "Building release..."
  cargo tauri build
fi

# ---- Done ----
info "\n=== Build complete! ==="
if [ "$DEV_BUILD" = false ]; then
  ls -lh src-tauri/target/release/bundle/msi/*.msi      2>/dev/null && true
  ls -lh src-tauri/target/release/bundle/nsis/*-setup.exe 2>/dev/null && true
fi
