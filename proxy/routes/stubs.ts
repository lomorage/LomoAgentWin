import { Router } from 'express';
import { getLomoToken } from '../session';

export const stubsRouter = Router();

// GET /api/server/config
stubsRouter.get('/server/config', (_req, res) => {
  res.json({
    externalDomain: '',
    isInitialized: true,
    isOnboarded: true,
    loginPageMessage: '',
    maintenanceMode: false,
    mapDarkStyleUrl: '',
    mapLightStyleUrl: '',
    oauthButtonText: '',
    publicUsers: false,
    trashDays: 30,
    userDeleteDelay: 7,
  });
});

// GET /api/server/features
stubsRouter.get('/server/features', (_req, res) => {
  res.json({
    configFile: false,
    duplicateDetection: false,
    email: false,
    facialRecognition: false,
    importFaces: false,
    map: false,
    oauth: false,
    oauthAutoLaunch: false,
    ocr: false,
    passwordLogin: true,
    reverseGeocoding: false,
    search: false,
    sidecar: false,
    smartSearch: false,
    trash: false,
  });
});

// GET /api/server/version
stubsRouter.get('/server/version', (_req, res) => {
  res.json({ major: 1, minor: 0, patch: 0 });
});

// GET /api/server/about
stubsRouter.get('/server/about', (_req, res) => {
  res.json({
    version: '1.0.0',
    versionUrl: '',
    licensed: true,
    build: 'lomo-proxy',
    buildUrl: '',
    buildImage: '',
    buildImageUrl: '',
    repository: '',
    repositoryUrl: '',
    sourceRef: '',
    sourceCommit: '',
    sourceUrl: '',
    nodejs: process.version,
    ffmpeg: '',
    imagemagick: '',
    libvips: '',
    exiftool: '',
  });
});

// GET /api/server/storage
stubsRouter.get('/server/storage', (_req, res) => {
  res.json({
    diskAvailable: '100 GB',
    diskSize: '500 GB',
    diskUse: '400 GB',
    diskUsagePercentage: 80,
  });
});

// GET /api/users/me
stubsRouter.get('/users/me', (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  res.json({
    avatarColor: 'primary',
    createdAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    email: auth.username,
    id: auth.userId,
    isAdmin: true,
    license: null,
    name: auth.username,
    oauthId: '',
    profileChangedAt: '2024-01-01T00:00:00.000Z',
    profileImagePath: '',
    quotaSizeInBytes: null,
    quotaUsageInBytes: null,
    shouldChangePassword: false,
    status: 'active',
    storageLabel: null,
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
});

// GET /api/users/me/preferences
stubsRouter.get('/users/me/preferences', (_req, res) => {
  res.json({
    albums: { defaultAssetOrder: 'desc' },
    cast: { gCastEnabled: false },
    download: { archiveSize: 4294967296, includeEmbeddedVideos: false },
    emailNotifications: { albumInvite: false, albumUpdate: false, enabled: false },
    folders: { enabled: false, sidebarWeb: false },
    memories: { duration: 10, enabled: false },
    people: { enabled: false, sidebarWeb: false },
    purchase: { hideBuyButtonUntil: '2099-01-01T00:00:00.000Z', showSupportBadge: false },
    ratings: { enabled: false },
    sharedLinks: { enabled: false, sidebarWeb: false },
    tags: { enabled: false, sidebarWeb: false },
  });
});

// GET /api/assets/statistics
stubsRouter.get('/assets/statistics', (_req, res) => {
  res.json({ images: 0, videos: 0, total: 0 });
});

// GET /api/notifications
stubsRouter.get('/notifications', (_req, res) => {
  res.json([]);
});

// GET /api/memories
stubsRouter.get('/memories', (_req, res) => {
  res.json([]);
});

// GET /api/shared-links
stubsRouter.get('/shared-links', (_req, res) => {
  res.json([]);
});

// GET /api/server/license
stubsRouter.get('/server/license', (_req, res) => {
  res.json({ licenseKey: '', activationKey: '', activatedAt: '' });
});

// GET /api/search/suggestions
stubsRouter.get('/search/suggestions', (_req, res) => {
  res.json([]);
});

// GET /api/server/media-types
stubsRouter.get('/server/media-types', (_req, res) => {
  res.json({
    image: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff', 'image/dng', 'image/x-adobe-dng'],
    sidecar: ['application/xml', 'text/xml'],
    video: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/3gpp'],
  });
});

// GET /api/server/version-history
stubsRouter.get('/server/version-history', (_req, res) => {
  res.json([{ version: '1.0.0', createdAt: '2024-01-01T00:00:00.000Z' }]);
});

// GET /api/partners
stubsRouter.get('/partners', (_req, res) => {
  res.json([]);
});

// GET /api/api-keys
stubsRouter.get('/api-keys', (_req, res) => {
  res.json([]);
});

// GET /api/sessions
stubsRouter.get('/sessions', (_req, res) => {
  res.json([]);
});

// POST /api/trash/restore/assets — stub (lomo has no restore)
stubsRouter.post('/trash/restore/assets', (_req, res) => {
  res.status(204).end();
});
