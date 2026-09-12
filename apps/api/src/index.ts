import { env } from './config/env.js';
import { createApiServer } from './server/index.js';
import { log } from './util/log.js';

const main = async () => {
  const server = await createApiServer(env);
  const httpServer = server.app.listen(env.port, '0.0.0.0', () => {
    log.info(`FitBuilder API listening on http://0.0.0.0:${env.port}/api (env=${env.nodeEnv})`);
    log.info(`data dir: ${env.dataDir}; job concurrency: ${env.jobConcurrency}`);
  });
  // Image jobs can take minutes; do not let Node kill long-polling clients.
  httpServer.requestTimeout = 5 * 60 * 1000;
  httpServer.headersTimeout = 5 * 60 * 1000 + 1000;

  const shutdown = (signal: string) => {
    log.info(`${signal} received, shutting down`);
    httpServer.close(() => {
      void server.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

main().catch((err) => {
  log.error('fatal', err);
  process.exit(1);
});
