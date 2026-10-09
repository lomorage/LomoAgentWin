<#
.SYNOPSIS
  Builds lomod.exe from submodules/lomod and stages it, together with its runtime
  dependencies (libvips DLLs, exiftool, ffmpeg/ffprobe), into src-tauri/resources/lomod/.

.DESCRIPTION
  Replaces extracting lomod/ out of lomoagent.msi by hand. Mirrors lomod's own
  `make build-lomod-windows` plus the dependency half of `make release-windows`, and reuses
  lomod's scripts/windows/fetch-vips.ps1 and collect-deps.ps1 so the bundled vips/exiftool/
  ffmpeg versions stay whatever lomod pins.

  Needs on PATH: go, and a mingw-w64 UCRT toolchain providing gcc, pkg-config (or pkgconf),
  gendef, dlltool and objdump, with libintl-*.dll in the same bin dir as gcc (fetch-vips.ps1
  generates an import library from it). The prebuilt vips-dev bundle links against UCRT, so
  use a UCRT toolchain -- e.g. MSYS2 UCRT64 with mingw-w64-ucrt-x86_64-{gcc,pkgconf,
  gettext-runtime,tools-git} and its ucrt64\bin put first on PATH. This is what CI does
  (.github/workflows/build-windows.yml).

  The destination is rebuilt from scratch: it is staged next to -DestDir and swapped in only
  once complete, so a failed build leaves the previous contents alone.
#>
param(
    # Defaults to submodules\lomod (set below, not here: Windows PowerShell 5.1 leaves
    # $PSScriptRoot empty while evaluating parameter defaults).
    [string]$LomodDir = "",
    # Defaults to src-tauri\resources\lomod.
    [string]$DestDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $LomodDir) { $LomodDir = Join-Path $repoRoot "submodules\lomod" }
if (-not $DestDir) { $DestDir = Join-Path $repoRoot "src-tauri\resources\lomod" }

if (-not (Test-Path (Join-Path $LomodDir "cmd\lomod"))) {
    throw "lomod source not found at $LomodDir -- run: git submodule update --init submodules/lomod"
}
$LomodDir = (Resolve-Path $LomodDir).Path
$DestDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DestDir)

foreach ($tool in @("go", "gcc", "gendef", "dlltool", "objdump")) {
    if (-not (Get-Command "$tool.exe" -ErrorAction SilentlyContinue)) {
        throw "$tool.exe not found on PATH -- see the notes at the top of this script for the toolchain lomod needs"
    }
}
$pkgConfig = Get-Command "pkg-config.exe", "pkgconf.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pkgConfig) { throw "pkg-config.exe (or pkgconf.exe) not found on PATH" }
$mingwBin = Split-Path -Parent (Get-Command gcc.exe).Source

$depsDir = Join-Path $LomodDir "windows-deps"
$vipsDir = Join-Path $depsDir "vips"
$stage = "$DestDir.new"

# The environment variables set below are restored on exit, so running this from an
# interactive shell (or from build-tauri.ps1) doesn't leave GOOS/CGO_* behind.
$savedEnv = @{}
function Set-BuildEnv {
    param([string]$Name, [string]$Value)
    if (-not $savedEnv.ContainsKey($Name)) {
        $savedEnv[$Name] = [Environment]::GetEnvironmentVariable($Name, "Process")
    }
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
}

try {
    # ---- 1. libvips dev bundle (headers, pkgconfig, import libs, DLLs) ----
    Write-Host "--- Fetching vips-dev ---"
    & (Join-Path $LomodDir "scripts\windows\fetch-vips.ps1") -VipsDir $vipsDir

    # The bundle's .pc files hardcode the prefix it was cross-built under
    # (/usr/local/mxe/...). pkg-config-lite rewrites that on the fly, but pkgconf builds
    # don't all do so, so point the prefix at the .pc file's own location instead.
    Get-ChildItem -Path (Join-Path $vipsDir "lib\pkgconfig") -Filter "*.pc" | ForEach-Object {
        $text = [IO.File]::ReadAllText($_.FullName)
        $match = [regex]::Match($text, '(?m)^prefix=([^\r\n]+)')
        if ($match.Success -and -not $match.Groups[1].Value.StartsWith('${pcfiledir}')) {
            [IO.File]::WriteAllText($_.FullName, $text.Replace($match.Groups[1].Value, '${pcfiledir}/../..'))
        }
    }

    Push-Location $LomodDir
    try {
        # ---- 2. Embed web assets with go.rice, as lomod's release builds do ----
        Write-Host "--- Embedding web assets (go.rice) ---"
        Set-BuildEnv "GOFLAGS" ""
        go install github.com/GeertJohan/go.rice/rice@v1.0.2
        if ($LASTEXITCODE -ne 0) { throw "go install rice failed" }
        $rice = Join-Path (go env GOPATH) "bin\rice.exe"
        Set-BuildEnv "GOFLAGS" "-mod=vendor"
        Push-Location "handler"
        try {
            & $rice embed-go
            if ($LASTEXITCODE -ne 0) { throw "rice embed-go failed" }
        } finally {
            Pop-Location
        }

        # ---- 3. Build lomod.exe (same flags as lomod's build-lomod-windows) ----
        Write-Host "--- Building lomod.exe ---"
        $commit = (git rev-parse --short=7 HEAD).Trim()
        $version = "{0}.0.{1}" -f (Get-Date -Format "yyyy-MM-dd.HH-mm-ss"), $commit
        Set-BuildEnv "GOOS" "windows"
        Set-BuildEnv "GOARCH" "amd64"
        Set-BuildEnv "CGO_ENABLED" "1"
        Set-BuildEnv "CGO_CFLAGS_ALLOW" "-Xpreprocessor"
        Set-BuildEnv "CC" "gcc"
        Set-BuildEnv "PKG_CONFIG" $pkgConfig.Source
        Set-BuildEnv "PKG_CONFIG_PATH" (Join-Path $vipsDir "lib\pkgconfig")

        Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
        New-Item -ItemType Directory -Force -Path $stage | Out-Null
        go build -v -tags "sqlite_trace trace" `
            -ldflags "-X bitbucket.org/lomoware/lomo-backend/common/release.Version=$version" `
            -o (Join-Path $stage "lomod.exe") ./cmd/lomod
        if ($LASTEXITCODE -ne 0) { throw "go build lomod failed" }
        Set-Content -Path (Join-Path $stage "version.txt") -Value $version -Encoding ASCII
        Write-Host "Built lomod $version"
    } finally {
        Pop-Location
    }

    # ---- 4. Runtime dependencies: vips DLLs, exiftool, ffmpeg/ffprobe ----
    Write-Host "--- Collecting runtime dependencies ---"
    & (Join-Path $LomodDir "scripts\windows\collect-deps.ps1") -DestDir $stage -VipsDir $vipsDir

    # ---- 5. Make sure every DLL lomod.exe and the bundled DLLs import is present ----
    # Anything not shipped in the bundle and not part of Windows (e.g. a toolchain runtime
    # such as libwinpthread-1.dll) is copied from the toolchain's bin dir; anything that
    # can't be found there fails the build rather than lomod failing to start for users.
    Write-Host "--- Checking DLL dependencies ---"
    $system32 = Join-Path $env:WINDIR "System32"
    $queue = New-Object System.Collections.Queue
    Get-ChildItem -Path $stage -File | Where-Object { $_.Extension -in ".exe", ".dll" } |
        ForEach-Object { $queue.Enqueue($_.FullName) }
    $checked = @{}
    while ($queue.Count -gt 0) {
        $file = $queue.Dequeue()
        if ($checked.ContainsKey($file)) { continue }
        $checked[$file] = $true
        $imports = & objdump.exe -p $file | Select-String -Pattern 'DLL Name:\s*(\S+)' |
            ForEach-Object { $_.Matches[0].Groups[1].Value }
        foreach ($dll in $imports) {
            if ($dll -match '^(api|ext)-ms-') { continue }
            if (Test-Path (Join-Path $stage $dll)) { continue }
            if (Test-Path (Join-Path $system32 $dll)) { continue }
            $fromToolchain = Join-Path $mingwBin $dll
            if (-not (Test-Path $fromToolchain)) {
                throw "$(Split-Path -Leaf $file) imports $dll, which is neither bundled, a Windows DLL, nor in $mingwBin"
            }
            Write-Host "Adding $dll from $mingwBin (imported by $(Split-Path -Leaf $file))"
            Copy-Item $fromToolchain (Join-Path $stage $dll)
            $queue.Enqueue((Join-Path $stage $dll))
        }
    }

    # ---- 6. Swap the finished bundle into place ----
    Remove-Item -Recurse -Force $DestDir -ErrorAction SilentlyContinue
    Move-Item -Path $stage -Destination $DestDir
    Write-Host "lomod staged at $DestDir" -ForegroundColor Green
} finally {
    foreach ($name in $savedEnv.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], "Process")
    }
}
