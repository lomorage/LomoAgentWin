# WebPhotoViewer Architecture

## Overview

This repository currently contains two frontend paths:

- The active product path is a Tauri desktop app that launches a local `lomod` backend and a local Node proxy, then serves an Immich web build through the proxy.
- An older React + webpack frontend still exists under `src/`, but it appears to be a legacy/prototype path rather than the packaged desktop runtime.

## Runtime Architecture

```text
Build Time
==========
build-tauri.ps1
  |
  +--> build submodules/immich/web
  |      |
  |      +--> web.zip
  |
  +--> bundle proxy/server.ts
  |      |
  |      +--> proxy.exe
  |
  +--> package Tauri app
         |
         +--> resources: lomod/, web.zip, proxy.exe, sharp.zip


Runtime
=======
+--------------------------------------------------------------+
| Tauri Desktop Shell                                          |
|  WebView URL: http://localhost:3001                          |
|  IPC: get_app_settings / pick_folder / save_app_settings     |
+---------------------------+----------------------------------+
                            |
                            v
+--------------------------------------------------------------+
| Local Node Proxy (Express, port 3001)                        |
|  - serves extracted Immich static web build                  |
|  - /api/auth      -> login/session cookies                   |
|  - /api/timeline  -> merkletree -> Immich timeline DTOs      |
|  - /api/assets    -> thumbnail/original/metadata/upload      |
|  - /api/albums    -> album CRUD and asset membership         |
|  - /api/* stubs   -> fake Immich endpoints/settings          |
|  - /lomo-settings -> HTML page calling Tauri IPC             |
+---------------------------+----------------------------------+
                            |
                            v
+--------------------------------------------------------------+
| lomod backend (local process, port 8000)                     |
|  - asset metadata                                            |
|  - previews/originals                                        |
|  - merkletree timeline                                       |
|  - albums                                                    |
|  - local photo storage under configured photos_dir           |
+--------------------------------------------------------------+


Legacy / Separate Path Still in Repo
====================================
React + webpack app (src/, package.json)
  -> AuthContext/App/MUILoginForm/ImageGrid/GridScrollBar
  -> LomoService (direct HTTP to lomod)
  -> Web Worker
  -> IndexedDB/localforage cache
```

## Main Components

### 1. Tauri shell

- Configured to load `http://localhost:3001`.
- Bundles `lomod`, `proxy.exe`, `web.zip`, and `sharp.zip` as application resources.
- Owns native settings actions such as folder picking and persisted app settings.

### 2. Proxy server

- Acts as an adapter between the Immich web frontend and the Lomo backend.
- Translates authentication, timeline, asset, and album APIs into the Lomo backend format.
- Serves the extracted web assets and provides stub endpoints for unsupported Immich features.

### 3. Lomo backend

- Runs locally as `lomod.exe`.
- Stores and serves the photo library.
- Provides timeline, asset preview, original file, metadata, and album APIs used by the proxy.

### 4. Legacy React client

- Lives under `src/`.
- Talks directly to the backend using `LomoService`.
- Uses a web worker and IndexedDB cache for asset fetching and local storage.
- Is not the primary packaged runtime used by the current Tauri build flow.
