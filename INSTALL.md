# Installing Lomo Photo Viewer

## Option 1 — One-line PowerShell install (recommended)

Open **PowerShell** and run:

```powershell
irm https://github.com/lomorage/LomoAgentWin/releases/latest/download/install.ps1 | iex
```

This will:
1. Fetch the latest release from GitHub
2. Download the installer automatically
3. Install silently (no prompts)
4. Launch Lomo Photo Viewer when done

> **Note:** If your system blocks script execution, run PowerShell as Administrator or prepend the bypass flag:
> ```powershell
> powershell -ExecutionPolicy Bypass -Command "irm https://github.com/lomorage/LomoAgentWin/releases/latest/download/install.ps1 | iex"
> ```

---

## Option 2 — Manual download

### NSIS installer (`.exe`)

1. Go to the [latest release](https://github.com/lomorage/LomoAgentWin/releases/latest)
2. Download `LomoPhotoViewer_*_x64-setup.exe`
3. Double-click the file and follow the prompts

### MSI package (`.msi`)

1. Go to the [latest release](https://github.com/lomorage/LomoAgentWin/releases/latest)
2. Download `LomoPhotoViewer_*_x64_en-US.msi`
3. Double-click to install, or deploy silently via:
   ```powershell
   msiexec /i LomoPhotoViewer_1.0.1_x64_en-US.msi /qn /norestart
   ```

---

## System requirements

| | |
|---|---|
| OS | Windows 10 / 11 (64-bit) |
| Architecture | x64 |
| Network | Local or remote Lomo backend |

---

## First run

On first launch the app will ask you to choose a storage mode:

- **This machine** — stores photos locally; bundled `lomod` runs on `localhost:8000`
- **Remote server** — connects to an existing Lomo backend on your network or in the cloud

Follow the on-screen setup to select a photos folder and create an admin password.

---

## Uninstall

Open **Settings → Apps → Installed apps**, search for **Lomo Photo Viewer**, and click **Uninstall**.  
Or run:
```powershell
msiexec /x LomoPhotoViewer_1.0.1_x64_en-US.msi /qn
```
