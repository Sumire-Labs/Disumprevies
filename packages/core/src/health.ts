// ---------------------------------------------------------------------------
// Health check HTTP server
//
// Exposes GET /health on port 8080 (default).
// Used by Docker HEALTHCHECK and external orchestration tools.
//
// Response 200:  { status: "ok",    uptime: <seconds>, guilds: <count> }
// Response 503:  { status: "error", reason: "<description>" }
//
// The server tracks two bits of state that must be kept up-to-date by the bot:
//   setReady(true)      — called once Discord client emits ClientReady
//   setGuildCount(n)    — called whenever the guild cache size changes
// ---------------------------------------------------------------------------

import { createServer, type Server } from 'http';
import { prisma } from './db.js';
import { logger } from './logger/index.js';

const DEFAULT_PORT = 8_080;

interface HealthState {
  ready: boolean;
  guildCount: number;
}

const state: HealthState = {
  ready: false,
  guildCount: 0,
};

/** Mark the bot as ready (called after ClientReady fires). */
export function setHealthReady(ready: boolean): void {
  state.ready = ready;
}

/** Update the guild count shown in the health response. */
export function setHealthGuildCount(count: number): void {
  state.guildCount = count;
}

let serverInstance: Server | null = null;

/**
 * Start the health-check HTTP server.
 * Safe to call multiple times — only one server is created.
 */
export function startHealthServer(port = DEFAULT_PORT): void {
  if (serverInstance !== null) return;

  serverInstance = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') {
      res.writeHead(404);
      res.end();
      return;
    }

    void handleHealth(res);
  });

  serverInstance.listen(port, () => {
    logger.info('Health check server listening', { port });
  });

  serverInstance.on('error', (err) => {
    logger.error('Health check server error', { error: err.message });
  });
}

/** Stop the health-check server (called during graceful shutdown). */
export function stopHealthServer(): Promise<void> {
  return new Promise((resolve) => {
    if (serverInstance === null) {
      resolve();
      return;
    }
    serverInstance.close(() => {
      serverInstance = null;
      resolve();
    });
  });
}

async function handleHealth(
  res: import('http').ServerResponse,
): Promise<void> {
  // Require both Discord readiness AND a live DB connection.
  if (!state.ready) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', reason: 'Bot not ready' }));
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', reason: 'Database unavailable' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      guilds: state.guildCount,
    }),
  );
}
