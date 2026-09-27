const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const { getSecretStrengthWarning, assertSecretConfigured } = require('./services/jwtService');

const PORT = Number(process.env.PORT) || 5000;

/**
 * Boot sequence:
 *  1. connect to MongoDB   -> abort with a meaningful message on failure
 *  2. start the HTTP server
 *  3. wire graceful shutdown
 */
async function startServer() {
  console.log('[startup] Starting AI FitTrack API...');

  // Fail fast: without a JWT secret the API can neither issue nor verify
  // tokens. This throws a clear error before the database connection starts.
  assertSecretConfigured();

  const secretWarning = getSecretStrengthWarning();
  if (secretWarning) console.warn(`[startup] WARNING: ${secretWarning}`);

  // The server only starts after the database connection succeeds.
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`[startup] AI FitTrack API listening on http://localhost:${PORT}`);
    console.log(`[startup] Health check: http://localhost:${PORT}/api/health`);
    console.log(`[startup] Allowed frontend origin(s): ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[shutdown] Received ${signal}. Closing server...`);
    server.close(async () => {
      await disconnectDB();
      console.log('[shutdown] Done. Bye!');
      process.exit(0);
    });
    // Safety net if connections keep the process alive.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  ['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));

  return server;
}

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled promise rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('[fatal] Uncaught exception:', error);
  process.exit(1);
});

if (require.main === module) {
  startServer().catch((error) => {
    console.error(`[startup] Failed to start AI FitTrack API: ${error.message}`);
    process.exit(1);
  });
}

module.exports = startServer;
