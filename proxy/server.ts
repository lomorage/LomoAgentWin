import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { authRouter } from './routes/auth';
import { timelineRouter } from './routes/timeline';
import { assetsRouter } from './routes/assets';
import { albumsRouter } from './routes/albums';
import { stubsRouter } from './routes/stubs';

const app = express();
const PORT = process.env.PROXY_PORT || 3001;
const WEB_DIR = path.resolve(process.env.WEB_DIR || path.join(__dirname, '../web'));

app.use(cookieParser());
app.use(express.json());

// Log all requests for debugging
app.use((req, _res, next) => {
  console.log(`[proxy] ${req.method} ${req.path}`);
  next();
});

// Mount route handlers
app.use('/api/auth', authRouter);
app.use('/api/timeline', timelineRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/albums', albumsRouter);
app.use('/api', stubsRouter);

// Catch-all for unhandled /api routes
app.all('/api/*', (req, res) => {
  console.log(`[proxy] UNHANDLED: ${req.method} ${req.path}`);
  res.status(200).json({});
});

// Serve static Immich web build
app.use(express.static(WEB_DIR));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (_req, res) => {
  const indexPath = path.join(WEB_DIR, 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(500).send(`Web frontend not found at: ${indexPath}`);
  }
});

app.listen(PORT, () => {
  const fs = require('fs');
  console.log(`Lomo-Immich proxy running on http://localhost:${PORT}`);
  console.log(`Proxying to lomo-backend at ${process.env.LOMO_BACKEND_URL || 'http://192.168.1.73:8000'}`);
  console.log(`Serving web frontend from ${WEB_DIR}`);
  console.log(`  index.html exists: ${fs.existsSync(path.join(WEB_DIR, 'index.html'))}`);
});
