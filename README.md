# WebPhotoViewer
web photo viewer

Self hosted Photo Cloud: https://lomorage.com

## Install

### Windows

Run in PowerShell:

```powershell
irm https://github.com/lomorage/LomoAgentWin/releases/latest/download/install.ps1 | iex
```

### Linux (Docker)

Run this on a Linux x86_64 machine; it installs Docker if needed, starts the server and prints the address to open from any computer or phone on the same network:

```bash
curl -fsSL https://raw.githubusercontent.com/lomorage/LomoAgentWin/main/docker/install.sh | bash
```

On the first visit to that address you choose the password for the `admin` account; see [docker/README.md](docker/README.md) for options (photo folder, ports, upgrades).
