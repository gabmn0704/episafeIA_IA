// Punto de entrada serverless para Vercel: reutiliza la app Express compilada.
import { createApp } from '../dist/app.js';
import { loadConfig } from '../dist/config.js';
import { createLogger } from '../dist/http/logger.js';

const config = loadConfig();
export default createApp({ config, logger: createLogger(config.LOG_LEVEL) });
