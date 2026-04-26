import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import os from 'os';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { authRouter } from './routes/auth';
import { timelineRouter } from './routes/timeline';
import { assetsRouter } from './routes/assets';
import { albumsRouter } from './routes/albums';
import { stubsRouter } from './routes/stubs';

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  path: '/api/socket.io',
  cors: { origin: '*' },
});
const PORT = process.env.PROXY_PORT || 3001;
const WEB_DIR = path.resolve(process.env.WEB_DIR || path.join(__dirname, '../web'));
const HOST = '0.0.0.0';

function isPrivateIpv4(address: string): boolean {
  if (address.startsWith('10.')) {
    return true;
  }

  if (address.startsWith('192.168.')) {
    return true;
  }

  const octets = address.split('.').map((value) => Number(value));
  return octets.length === 4 && octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
}

function scoreNetworkInterface(name: string, address: string): number {
  const normalizedName = name.toLowerCase();
  let score = 0;

  if (isPrivateIpv4(address)) {
    score += 50;
  }

  if (normalizedName.includes('wi-fi') || normalizedName.includes('wifi') || normalizedName.includes('wlan') || normalizedName.includes('wireless')) {
    score += 30;
  }

  if (normalizedName.includes('ethernet') || normalizedName.includes('lan')) {
    score += 20;
  }

  if (
    normalizedName.includes('tailscale') ||
    normalizedName.includes('zerotier') ||
    normalizedName.includes('docker') ||
    normalizedName.includes('vethernet') ||
    normalizedName.includes('hyper-v') ||
    normalizedName.includes('vmware') ||
    normalizedName.includes('virtualbox') ||
    normalizedName.includes('vbox') ||
    normalizedName.includes('wsl') ||
    normalizedName.includes('loopback') ||
    normalizedName.includes('tap') ||
    normalizedName.includes('tun') ||
    normalizedName.includes('hamachi')
  ) {
    score -= 40;
  }

  if (address.startsWith('169.254.')) {
    score -= 100;
  }

  return score;
}

function getLanAddresses(): string[] {
  const candidates: Array<{ address: string; score: number }> = [];

  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) {
        continue;
      }

      candidates.push({
        address: entry.address,
        score: scoreNetworkInterface(name, entry.address),
      });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.address.localeCompare(b.address))
    .map((candidate) => candidate.address)
    .filter((address, index, values) => values.indexOf(address) === index);
}

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

// Socket.IO — stub server status so the UI shows "Server Online" + version
io.on('connection', (socket) => {
  console.log(`[socket.io] client connected: ${socket.id}`);
  socket.emit('on_server_version', { major: 1, minor: 0, patch: 0 });
  socket.on('disconnect', () => console.log(`[socket.io] client disconnected: ${socket.id}`));
});

httpServer.listen(Number(PORT), HOST, () => {
  const fs = require('fs');
  const lanAddresses = getLanAddresses();
  const lanAddress = lanAddresses[0] ?? null;
  console.log(`Lomo-Immich proxy running on http://localhost:${PORT}`);
  if (lanAddress) {
    console.log(`Mobile/LAN access available at http://${lanAddress}:${PORT}`);
    if (lanAddresses.length > 1) {
      console.log(`[proxy] Additional LAN candidates: ${lanAddresses.slice(1).join(', ')}`);
    }
  }
  console.log(`Proxying to lomo-backend at ${process.env.LOMO_BACKEND_URL || 'http://localhost:8000'}`);
  console.log(`Serving web frontend from ${WEB_DIR}`);
  console.log(`  index.html exists: ${fs.existsSync(path.join(WEB_DIR, 'index.html'))}`);
});
