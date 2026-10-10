#!/usr/bin/env bash
#
# Builds lomod from submodules/lomod on macOS and stages it, together with its runtime
# dependencies (libvips dylibs, ffmpeg/ffprobe, exiftool), into src-tauri/resources/lomod/.
# The macOS counterpart of scripts/build-lomod-windows.ps1.
#
# Mirrors lomod's own `make build-lomod-mac` plus the dependency half of `make release-macos`
# (reusing its scripts/macos/collect-deps.sh), for the host's architecture: run it on an Apple
# Silicon Mac for an arm64 build, on an Intel Mac for x86_64.
#
# Needs: go, and from Homebrew: vips pkgconf ffmpeg exiftool dylibbundler
#   brew install vips pkgconf ffmpeg exiftool dylibbundler
# The bundled dylibs are Homebrew's, so the result runs on the macOS version the Homebrew
# bottles were built for (the build host's) and later.
#
# The destination is rebuilt from scratch: it is staged next to it and swapped in only once
# complete, so a failed build leaves the previous contents alone.
#
# Usage: scripts/build-lomod-macos.sh [--lomod-dir <dir>] [--dest-dir <dir>]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOMOD_DIR="${REPO_ROOT}/submodules/lomod"
DEST_DIR="${REPO_ROOT}/src-tauri/resources/lomod"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --lomod-dir) LOMOD_DIR="$2"; shift 2 ;;
        --dest-dir) DEST_DIR="$2"; shift 2 ;;
        *) echo "unknown argument: $1" >&2; exit 1 ;;
    esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "this script builds the macOS lomod; run it on a Mac" >&2
    exit 1
fi
if [[ ! -d "${LOMOD_DIR}/cmd/lomod" ]]; then
    echo "lomod source not found at ${LOMOD_DIR} -- run: git submodule update --init submodules/lomod" >&2
    exit 1
fi
for tool in go brew pkg-config dylibbundler; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
        echo "${tool} not found -- see the notes at the top of this script" >&2
        exit 1
    fi
done
if ! pkg-config --exists vips; then
    echo "libvips not found by pkg-config -- brew install vips" >&2
    exit 1
fi

LOMOD_DIR="$(cd "${LOMOD_DIR}" && pwd)"
mkdir -p "$(dirname "${DEST_DIR}")"
DEST_DIR="$(cd "$(dirname "${DEST_DIR}")" && pwd)/$(basename "${DEST_DIR}")"
STAGE="${DEST_DIR}.new"
rm -rf "${STAGE}"
mkdir -p "${STAGE}"

# ---- 1. Embed web assets with go.rice, as lomod's release builds do ----
echo "--- Embedding web assets (go.rice) ---"
GOFLAGS="" go install github.com/GeertJohan/go.rice/rice@v1.0.2
RICE="$(go env GOPATH)/bin/rice"
(cd "${LOMOD_DIR}/handler" && GOFLAGS="-mod=vendor" "${RICE}" embed-go)

# ---- 2. Build lomod (same flags as lomod's build-lomod-mac) ----
echo "--- Building lomod ($(uname -m)) ---"
commit="$(git -C "${LOMOD_DIR}" rev-parse --short=7 HEAD)"
version="$(date +%Y-%m-%d.%H-%M-%S).0.${commit}"
(
    cd "${LOMOD_DIR}"
    CGO_ENABLED=1 CGO_CFLAGS_ALLOW="-Xpreprocessor" \
        go build -mod=vendor -v -tags "sqlite_trace trace" \
        -ldflags "-X bitbucket.org/lomoware/lomo-backend/common/release.Version=${version}" \
        -o "${STAGE}/lomod" ./cmd/lomod
)
echo -n "${version}" > "${STAGE}/version.txt"
echo "Built lomod ${version}"

# ---- 3. Runtime dependencies: vips dylibs, ffmpeg/ffprobe, exiftool ----
# Bundles the dylibs into libs/ (loaded via @executable_path/libs/) and ad-hoc signs them.
echo "--- Collecting runtime dependencies ---"
bash "${LOMOD_DIR}/scripts/macos/collect-deps.sh" --dest-dir "${STAGE}" --binary "${STAGE}/lomod"

# collect-deps.sh leaves exiftool as a symlink into a copy of Homebrew's exiftool Cellar dir,
# whose bin/exiftool is a wrapper that points back into /opt/homebrew (or /usr/local). Replace
# it with a wrapper that runs the bundled script with macOS's perl and the bundled modules, so
# it works without Homebrew and with no symlinks (Tauri copies resources file by file).
echo "--- Making exiftool self-contained ---"
EXIFTOOL_PKG="${STAGE}/exiftool-pkg"
[[ -d "${EXIFTOOL_PKG}" ]] || { echo "exiftool was not bundled (brew install exiftool)" >&2; exit 1; }
exiftool_script=""
while IFS= read -r f; do
    if head -n 1 "${f}" | grep -q '^#!.*perl'; then
        exiftool_script="${f}"
        break
    fi
done < <(find "${EXIFTOOL_PKG}" -type f -name exiftool)
exiftool_pm="$(find "${EXIFTOOL_PKG}" -type f -path '*/Image/ExifTool.pm' | head -n 1)"
if [[ -z "${exiftool_script}" || -z "${exiftool_pm}" ]]; then
    echo "couldn't find the exiftool perl script and Image/ExifTool.pm under ${EXIFTOOL_PKG}" >&2
    exit 1
fi
exiftool_lib="$(dirname "$(dirname "${exiftool_pm}")")"
rm -f "${STAGE}/exiftool"
cat > "${STAGE}/exiftool" <<EOF
#!/bin/sh
# Bundled exiftool: Homebrew's exiftool script and modules, run with macOS's own perl.
here="\$(cd "\$(dirname "\$0")" && pwd)"
exec /usr/bin/perl -I"\$here/${exiftool_lib#"${STAGE}/"}" "\$here/${exiftool_script#"${STAGE}/"}" "\$@"
EOF
chmod +x "${STAGE}/exiftool"

# Tauri copies resources file by file; turn any remaining symlink into a real copy (or drop it
# if it's dangling).
while IFS= read -r link; do
    if cp -RL "${link}" "${link}.deref" 2>/dev/null; then
        rm -f "${link}"
        mv "${link}.deref" "${link}"
    else
        echo "dropping dangling symlink ${link#"${STAGE}/"}"
        rm -f "${link}"
    fi
done < <(find "${STAGE}" -type l)

# ---- 4. Check that nothing still loads from Homebrew ----
echo "--- Checking dylib dependencies ---"
bad=0
while IFS= read -r f; do
    if ! file "${f}" | grep -q 'Mach-O'; then continue; fi
    if refs="$(otool -L "${f}" | tail -n +2 | awk '{print $1}' | grep -E '^(/opt/homebrew|/usr/local)/')"; then
        echo "${f#"${STAGE}/"} still links against: ${refs}" >&2
        bad=1
    fi
done < <(find "${STAGE}" -type f -perm -u+x -o -type f -name '*.dylib' -o -type f -name '*.bundle')
[[ "${bad}" == 0 ]] || { echo "bundled binaries reference Homebrew paths" >&2; exit 1; }

"${STAGE}/exiftool" -ver
"${STAGE}/ffmpeg" -hide_banner -version | sed -n 1p

# ---- 5. Swap the finished bundle into place ----
rm -rf "${DEST_DIR}"
mv "${STAGE}" "${DEST_DIR}"
echo "lomod staged at ${DEST_DIR} ($(du -sh "${DEST_DIR}" | cut -f1))"
