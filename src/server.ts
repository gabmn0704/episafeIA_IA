import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './http/logger.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const app = createApp({ config, logger });

const server = app.listen(config.PORT, () => {
  logger.info('episafe-ia listening', {
    port: config.PORT,
    explain: config.ANTHROPIC_API_KEY ? `claude (${config.ANTHROPIC_MODEL})` : 'templates',
  });
});

function shutdown(signal: string): void {
  logger.info('shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
