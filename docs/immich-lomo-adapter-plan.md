# Plan: Immich Web Frontend with Lomo-Backend

## Context

We want to reuse the Immich web frontend (SvelteKit app at `submodules/immich/web/`) to browse photos stored on the Lomo-backend (`http://192.168.1.73:8000`). The two servers have completely different APIs, so we need an adapter layer to translate between them.

## Approach: API Proxy Server

Create a lightweight **Node.js proxy server** that sits between the Immich web app and lomo-backend. The Immich web app sends standard Immich API calls to `/api/*`, and the proxy translates them to lomo-backend calls and transforms responses back to Immich format.

```
Immich SvelteKit App (Vite dev server, port 3000)
    |  /api/* requests
    v
Lomo API Proxy (Node.js, port 3001)
    |  Translated requests
    v
Lomo-Backend (Go, http://192.168.1.73:8000)
```

**Why proxy over direct code modification:**
- Only 1-2 lines of Immich code need changing (vite proxy target + disable websocket)
- The generated SDK (`fetch-client.ts`) stays untouched
- Easy to upgrade Immich later
- Clean separation of concerns

---

## Files to Create

### 1. `proxy/package.json`

Dependencies: `express`, `argon2-browser` (or `argon2`), `node-fetch`, `cookie-parser`

### 2. `proxy/server.ts` — Main proxy server (~150 lines)

Express server on port 3001. Route handlers for each Immich API endpoint.

### 3. `proxy/routes/auth.ts` — Auth endpoints (~100 lines)

| Immich Endpoint | Lomo Endpoint | Transform |
|---|---|---|
| `POST /api/auth/login` `{email, password}` | `GET /login` with Basic Auth header | Hash password with Argon2 (salt=`username@lomorage.lomoware`), build Basic Auth `base64(user:hexHash00:immich-web)`, return `{accessToken: lomoToken, userId, ...}` + set cookies |
| `POST /api/auth/validateToken` | N/A | Return `{authStatus: true}` if token exists |
| `POST /api/auth/logout` | N/A | Clear cookies, return `{successful: true}` |

**Argon2 hashing logic** (ported from `src/logic/LomoUtils.ts` + `src/logic/LomoService.ts`):
```
1. argon2id(password, salt=username+"@lomorage.lomoware", time=3, mem=4096, parallelism=1, hashLen=32)
2. Take encoded result, convert to hex bytes via stringToHexByte() + append "00"
3. Basic Auth = base64(username:hexHash00:immich-web)
```

### 4. `proxy/routes/timeline.ts` — Timeline/asset listing (~150 lines)

| Immich Endpoint | Lomo Endpoint | Transform |
|---|---|---|
| `GET /api/timeline/buckets` | `GET /assets/merkletree?token=X` | Iterate Years→Months, count assets per month. Return `[{timeBucket: "YYYY-MM-01T00:00:00.000Z", count: N}]` |
| `GET /api/timeline/bucket?timeBucket=...` | `GET /assets/merkletree/YYYY/MM?token=X` | Flatten Days→Assets into column-oriented arrays (see transform details below) |

**Merkletree → TimeBuckets transform:**
```
Lomo: { Years: [{ Year: 2024, Months: [{ Month: 3, Days: [{ Day: 15, Assets: [...] }] }] }] }
  ↓
Immich: [{ timeBucket: "2024-03-01T00:00:00.000Z", count: 42 }]
```

**Month assets → TimeBucketAssetResponseDto transform (column-oriented):**
```
Lomo: { Days: [{ Assets: [{ Name: "1.jpg", Date: "...", Hash: "abc", Status: 0 }] }] }
  ↓
Immich: {
  id: ["1.jpg", "2.jpg"],
  fileCreatedAt: ["2024-03-15T10:30:00.000Z", ...],
  isImage: [true, true],
  isFavorite: [false, false],       // Status bit 4
  isTrashed: [false, false],
  visibility: ["timeline", ...],    // Status bit 2 → "hidden"
  ratio: [1.0, 1.0],               // No aspect ratio from lomo; square thumbnails
  thumbhash: [null, null],          // Lomo has no thumbhash
  ownerId: [userId, userId],
  duration: [null, null],
  city: [null, null],
  country: [null, null],
  livePhotoVideoId: [null, null],
  projectionType: [null, null],
  localOffsetHours: [0, 0],
}
```

**Asset Status bit mapping** (from lomo-backend-api.MD):
- Bit 2 (value 2) → hidden → `visibility: "hidden"`
- Bit 4 (value 8) → favorite → `isFavorite: true`

### 5. `proxy/routes/assets.ts` — Asset serving & metadata (~100 lines)

| Immich Endpoint | Lomo Endpoint | Notes |
|---|---|---|
| `GET /api/assets/:id/thumbnail` | `GET /asset/preview/{name}?token=X&width=250&height=250` | Pipe response directly. `size=preview` → width=1080 |
| `GET /api/assets/:id/original` | `GET /asset/{name}?token=X` | Pipe response directly |
| `GET /api/assets/:id` | `GET /asset/metadata/{name}?token=X` | Transform to `AssetResponseDto` (stub most fields) |

**Asset ID strategy**: Use lomo asset `Name` (e.g. `1.jpg`) directly as the Immich asset ID. No UUID mapping needed.

### 6. `proxy/routes/stubs.ts` — Synthetic/stub responses (~80 lines)

Endpoints that need hardcoded responses to prevent Immich from crashing:

| Endpoint | Response |
|---|---|
| `GET /api/server/config` | `{isInitialized: true, isOnboarded: true, loginPageMessage: "", oauthButtonText: "", ...}` |
| `GET /api/server/features` | `{passwordLogin: true, oauth: false, search: false, facialRecognition: false, map: false, ...}` — disable all unsupported features |
| `GET /api/users/me` | Return user object from stored login data |
| `GET /api/users/me/preferences` | Return default preferences |
| `GET /api/assets/statistics` | `{images: 0, videos: 0, total: 0}` |
| Other unimplemented | Return empty arrays/objects or 404 |

### 7. `proxy/session.ts` — Token/session management (~50 lines)

- On login: store `{lomoToken, userId, username}` keyed by a session UUID
- Set cookies: `immich_is_authenticated=true`, `lomo_session=<uuid>`
- On each request: read `lomo_session` cookie → look up lomoToken → attach to lomo-backend calls

---

## Files to Modify in Immich

### 1. `submodules/immich/web/vite.config.ts` (1 change)

```diff
 const upstream = {
-  target: process.env.IMMICH_SERVER_URL || 'http://immich-server:2283/',
+  target: process.env.IMMICH_SERVER_URL || 'http://localhost:3001/',
   secure: true,
   changeOrigin: true,
   logLevel: 'info',
-  ws: true,
+  ws: false,
 };
```

### 2. `submodules/immich/web/src/routes/+layout.svelte` (~2 lines)

Comment out or conditionally skip `openWebsocketConnection()` — lomo-backend has no WebSocket support.

---

## Known Limitations (v1)

| Limitation | Impact | Future Fix |
|---|---|---|
| `ratio: 1.0` for all thumbnails | Photos display as square tiles | Batch-fetch metadata in proxy to get real dimensions |
| No thumbhash | Loading spinner instead of blur preview | Generate thumbhash server-side or skip |
| No search/smart search | Search feature disabled | Implement metadata search via lomo `/assets?meta-nv=` API |
| No face recognition | People tab disabled | Not available in lomo-backend |
| No map view | Map feature disabled | Could use lomo GPS metadata |
| No albums | Albums tab disabled | Could map to lomo albums if API exists |
| No video playback | Video thumbnails show but won't play | Implement via `/asset/{name}?token=X` for video files |

---

## Development Sequence

1. **Scaffold proxy**: `proxy/` dir, package.json, express server, basic routing
2. **Stub endpoints**: `/server/config`, `/server/features`, `/users/me` — get Immich login page to load
3. **Login flow**: Argon2 hashing, Basic Auth, session/cookie management — get login working
4. **Timeline buckets**: Merkletree → TimeBuckets transform — get photo grid skeleton
5. **Thumbnail serving**: Proxy `/asset/preview/` — see actual photos
6. **Asset detail**: Metadata endpoint — click on photo to view
7. **Original serving**: Proxy full-resolution download
8. **Polish**: Error handling, caching, edge cases

## Verification

1. Start lomo proxy: `cd proxy && npx ts-node server.ts`
2. Start Immich web: `cd submodules/immich/web && npm run dev`
3. Open browser → Immich login page should load
4. Login with lomo-backend credentials (username as email field, password)
5. Photo timeline should display with thumbnails from lomo-backend
6. Click a photo to view full resolution

## Reference Files

- `src/logic/LomoService.ts` — Existing lomo API client (login, merkletree)
- `src/logic/LomoUtils.ts` — Argon2 password hashing (salt, params)
- `docs/lomo-backend-api.MD` — Complete lomo-backend API documentation
- `submodules/immich/open-api/typescript-sdk/src/fetch-client.ts` — All Immich API types/DTOs
- `submodules/immich/web/vite.config.ts` — Vite proxy configuration
- `submodules/immich/web/src/lib/utils/auth.ts` — Immich auth cookie handling
- `submodules/immich/web/src/lib/managers/timeline-manager/` — Timeline data consumption
