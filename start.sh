#!/bin/bash
# WebPhotoViewer Local Startup Script
# Run from: h:/myproject/lomoware/WebPhotoViewer

set -e
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- 1. Install proxy dependencies ---
echo "=== Installing proxy dependencies ==="
cd "$ROOT_DIR/proxy"
npm install

# --- 2. Install Immich web dependencies ---
echo "=== Installing Immich web dependencies ==="
cd "$ROOT_DIR/submodules/immich"
pnpm install --force

# --- 3. Build the @immich/sdk (required on first run) ---
echo "=== Building @immich/sdk ==="
cd "$ROOT_DIR/submodules/immich/open-api/typescript-sdk"
npx tsc || true

# --- 4. Start the proxy server (background) ---
echo "=== Starting proxy server on port 3001 ==="
cd "$ROOT_DIR/proxy"
npx tsx server.ts &
PROXY_PID=$!
echo "Proxy PID: $PROXY_PID"
sleep 2

# --- 5. Start the Immich web frontend ---
echo "=== Starting Immich web frontend on port 3000 ==="
cd "$ROOT_DIR/submodules/immich/web"
pnpm run dev &
WEB_PID=$!
echo "Web PID: $WEB_PID"

echo ""
echo "============================================"
echo "  Proxy server:  http://localhost:3001"
echo "  Web frontend:  http://localhost:3000"
echo "  Lomo backend:  ${LOMO_BACKEND_URL:-http://192.168.1.73:8000}"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop both servers"

# Cleanup on exit
trap "kill $PROXY_PID $WEB_PID 2>/dev/null; exit" INT TERM
wait
