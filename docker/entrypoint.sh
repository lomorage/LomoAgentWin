#!/usr/bin/env bash
# Starts lomod and the web proxy in one container, sets up the first account on first start,
# and stops the container (so Docker restarts it) as soon as either process exits.
set -euo pipefail

DATA_DIR="${LOMO_DATA_DIR:-/data}"
PHOTOS_DIR="${LOMO_PHOTOS_DIR:-/photos}"
LOMOD_PORT="${LOMOD_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3001}"
export LOMO_DATA_DIR="$DATA_DIR" LOMO_PHOTOS_DIR="$PHOTOS_DIR" LOMOD_PORT

mkdir -p "$DATA_DIR/lomod" "$DATA_DIR/proxy" "$PHOTOS_DIR"

pids=()
stop() {
  kill -TERM "${pids[@]}" 2>/dev/null || true
  wait || true
}
trap 'stop; exit 0' TERM INT

# ---- lomod: photo storage, metadata, previews; the Lomorage mobile apps talk to it directly ----
# exiftool and ffmpeg come from the image's PATH. LOMOD_ARGS adds extra lomod flags.
# shellcheck disable=SC2086
lomod --mount-dir "$PHOTOS_DIR" --base "$DATA_DIR/lomod" --port "$LOMOD_PORT" ${LOMOD_ARGS:-} &
pids+=($!)

for _ in $(seq 1 60); do
  kill -0 "${pids[0]}" 2>/dev/null || { echo "[lomo] lomod exited during startup; see $DATA_DIR/lomod/var/log/lomod.log" >&2; exit 1; }
  curl -fs -o /dev/null "http://127.0.0.1:$LOMOD_PORT/status" && break
  sleep 1
done
curl -fs -o /dev/null "http://127.0.0.1:$LOMOD_PORT/status" || { echo "[lomo] lomod did not start within 60s" >&2; stop; exit 1; }

node /app/docker/create-admin.mjs

# ---- web proxy: serves the photo web app and translates its API calls to lomod ----
PROXY_PORT="$WEB_PORT" \
WEB_DIR=/app/web \
LOMO_BACKEND_URL="http://127.0.0.1:$LOMOD_PORT" \
CONFIG_PATH="$DATA_DIR/proxy/config.json" \
  node /app/proxy/dist/server.cjs &
pids+=($!)

for _ in $(seq 1 30); do
  curl -fs -o /dev/null "http://127.0.0.1:$WEB_PORT/" && break
  sleep 1
done

# Where to point a browser or the Lomorage app. With host networking these are the machine's
# own LAN addresses; with port mapping they are the container's, so use the host's IP instead.
addrs=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+(\.[0-9]+){3}$' | grep -vE '^(127\.|172\.(1[7-9]|2[0-9]|3[01])\.)' || true)
[ -n "$addrs" ] || addrs="<this-machine-ip>"
echo "[lomo] ------------------------------------------------------------"
for a in $addrs; do
  echo "[lomo] Web app (browser, phone or computer): http://$a:$WEB_PORT"
  echo "[lomo] Lomorage mobile app server address:   http://$a:$LOMOD_PORT"
done
echo "[lomo] Photos are stored in $PHOTOS_DIR, app data in $DATA_DIR"
echo "[lomo] ------------------------------------------------------------"

# Exit (and let Docker restart the container) as soon as either process stops.
set +e
wait -n "${pids[@]}"
status=$?
echo "[lomo] a process exited (status $status); stopping the container" >&2
stop
exit "$status"
