import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import api from './routes/api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api', api);

/**
 * Production: Express serves the built React app from /dist.
 * Development: Vite serves the UI on :5180 and proxies /api here.
 * Run both with `npm run dev`.
 */
const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    hint: 'API routes live under /api. In development the UI runs on http://localhost:5180.',
  });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error('[api]', error);
  const status = Number(error.status) || 500;
  res.status(status).json({
    error: status === 400 ? 'Invalid request' : 'Request failed',
    message: config.nodeEnv === 'development' ? error.message : 'See server logs.',
  });
});

app.listen(config.port, () => {
  console.log(`\n  Beyond the Known · API`);
  console.log(`  http://localhost:${config.port}/api/health`);
  console.log(`  data mode: ${config.databaseUrl ? 'DATABASE_URL set (mock until wired)' : 'illustrative mock'}\n`);
});
