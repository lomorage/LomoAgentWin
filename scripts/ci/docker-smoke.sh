#!/usr/bin/env bash
# Smoke test for the Docker image: run it the way docker/docker-compose.yml does (host
# networking, /photos and /data volumes) and check what a new user goes through.
#
#   1. first start with LOMO_ADMIN_PASSWORD set: the bundled exiftool/ffmpeg run, the account
#      is created, and scripts/ci/smoke-test.mjs passes (web app, login, upload, timeline,
#      thumbnail, preview)
#   2. restart on the same volumes: it comes back up and doesn't try to create the account again
#   3. first start without a password: one is generated, logged and saved, and it signs in
#
# Usage: scripts/ci/docker-smoke.sh IMAGE
# Needs docker, curl and Node 20+; uses ports 3001, 8000 and 8004 on this machine.
set -euo pipefail

IMAGE="${1:?usage: $0 IMAGE}"
NAME=lomo-smoke
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"

fail() {
  echo "DOCKER SMOKE FAIL: $*" >&2
  echo "--- container log ---" >&2
  docker logs "$NAME" 2>&1 | tail -n 80 >&2 || true
  echo "--- lomod.log ---" >&2
  docker exec "$NAME" sh -c 'tail -n 40 /data/lomod/var/log/lomod.log' >&2 2>/dev/null || true
  exit 1
}
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  # files in the volumes are root-owned; remove them from a container
  docker run --rm --entrypoint sh -v "$WORK:/w" "$IMAGE" -c 'rm -rf /w/*' >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

start() { # start [extra docker args...]
  docker run -d --name "$NAME" --network host \
    -v "$WORK/photos:/photos" -v "$WORK/data:/data" "$@" "$IMAGE" >/dev/null
}
wait_up() {
  for _ in $(seq 1 90); do
    [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" = true ] || fail "container stopped"
    curl -fs -o /dev/null http://127.0.0.1:3001/ && curl -fs -o /dev/null http://127.0.0.1:8000/status && return 0
    sleep 1
  done
  fail "web app / lomod did not come up within 90s"
}

# ---- 1. first start with a configured password ----
start -e LOMO_ADMIN_PASSWORD=smoke-test-password
wait_up
echo "ok: container is up"
docker exec "$NAME" exiftool -ver >/dev/null || fail "exiftool does not run in the image"
docker exec "$NAME" ffmpeg -hide_banner -version >/dev/null || fail "ffmpeg does not run in the image"
echo "ok: bundled exiftool $(docker exec "$NAME" exiftool -ver) and ffmpeg run"
log_has() { # log_has PATTERN: the container log shows PATTERN within 15s
  for _ in $(seq 1 15); do
    docker logs "$NAME" 2>&1 | grep -q -- "$1" && return 0
    sleep 1
  done
  return 1
}
log_has 'Created the first account' || fail "no first-account message in the log"
log_has 'Web app (browser, phone or computer): http://' || fail "no access address in the log"
echo "ok: first account created and access address logged"
SMOKE_PASSWORD=smoke-test-password node "$HERE/smoke-test.mjs" || fail "smoke test failed"

# ---- 2. restart keeps the account ----
docker restart "$NAME" >/dev/null
wait_up
[ "$(docker logs "$NAME" 2>&1 | grep -c 'Created the first account')" = 1 ] || fail "account setup ran again after a restart"
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
  -d '{"email":"admin","password":"smoke-test-password"}' http://127.0.0.1:3001/api/auth/login)
[ "$code" = 201 ] || fail "login after restart returned HTTP $code"
echo "ok: restart keeps the data and the account"
docker rm -f "$NAME" >/dev/null
docker run --rm --entrypoint sh -v "$WORK:/w" "$IMAGE" -c 'rm -rf /w/*'

# ---- 3. first start without a password: one is generated ----
start
wait_up
password=$(docker exec "$NAME" sed -n 2p /data/admin-password.txt) || fail "no /data/admin-password.txt"
[ -n "$password" ] || fail "empty generated password"
log_has "password: $password" || fail "generated password not shown in the log"
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin\",\"password\":\"$password\"}" http://127.0.0.1:3001/api/auth/login)
[ "$code" = 201 ] || fail "login with the generated password returned HTTP $code"
echo "ok: generated password is logged, saved and works"

echo "DOCKER SMOKE PASS"
