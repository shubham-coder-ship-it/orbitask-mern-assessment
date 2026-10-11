import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { csrfGuard } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.clientUrl.split(',').map((s) => s.trim()), credentials: true }));
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());
  app.use('/api', csrfGuard, routes);
  app.use('/api', notFound);

  // Optional: serve the built client when present (single-host deployments).
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
  if (process.env.SERVE_CLIENT === 'true' && fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
