# LomoAgent

Lomorage's self-hosted photo server for your own computer or home server: back up photos from your phones with the [Lomorage](https://lomorage.com) app, and browse them in a web app from any computer or phone on your network. Photos stay on your own disk.

It bundles lomod (the Lomorage storage server, with exiftool and ffmpeg) and an Immich-based web app.

| Platform | Package |
|---|---|
| Windows | Desktop app (installer) |
| Linux | Docker image |
| macOS (Apple Silicon) | Desktop app (`.dmg`); Intel Macs coming later |

## Install

### Windows

Run in PowerShell:

```powershell
irm https://github.com/lomorage/lomoagent/releases/latest/download/install.ps1 | iex
```

Or download the `*-setup.exe` from the [latest release](https://github.com/lomorage/lomoagent/releases/latest). More options: [INSTALL.md](INSTALL.md).

### Linux (Docker)

Run this on a Linux x86_64 machine; it installs Docker if needed, starts the server and prints the address to open from any computer or phone on the same network:

```bash
curl -fsSL https://raw.githubusercontent.com/lomorage/lomoagent/main/docker/install.sh | bash
```

On the first visit to that address you choose the password for the `admin` account; see [docker/README.md](docker/README.md) for options (photo folder, ports, upgrades).

### macOS (Apple Silicon)

1. Download the `.dmg` from the latest [`macos-v*` release](https://github.com/lomorage/lomoagent/releases?q=macos-v&expanded=true), open it and drag **lomorage** to **Applications**. It needs a Mac with Apple Silicon (M1 or later); the release notes give the minimum macOS version.
2. The app isn't signed with an Apple Developer ID yet, so macOS refuses to open a downloaded copy ("damaged" / "can't be opened"). Clear the download flag once, in Terminal:

   ```bash
   xattr -dr com.apple.quarantine /Applications/lomorage.app
   ```

3. Open **lomorage** from Applications and set up your photo library.

## Use

- **Browse**: open the web app (the address the installer prints, or the desktop app on Windows and macOS) and sign in.
- **Back up a phone**: in the Lomorage app (iOS / Android), use the server address or QR code from the web app's **Connect** button (top right); or upload from the phone's browser.
- After uploads from another device, click **Refresh** (top right) to show them.

## Development

Build instructions and architecture: [CLAUDE.md](CLAUDE.md). The Immich web app (`submodules/immich`) and lomod (`submodules/lomod`) are git submodules. CI (`.github/workflows/`: Windows installer, macOS app, Docker image) runs on `release/**` branches and manual runs; a manual run with `release_tag` publishes a release.
