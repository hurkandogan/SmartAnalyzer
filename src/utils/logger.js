import { createLogger, format, transports } from 'winston';
import { existsSync, mkdirSync } from 'node:fs';

if (!existsSync('logs')) mkdirSync('logs');

export const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      return stack
        ? `${timestamp} [${level.toUpperCase()}] ${message}\n${stack}`
        : `${timestamp} [${level.toUpperCase()}] ${message}`;
    }),
  ),
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    }),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
});

export const dbLogger = async (source, level, message, details = null) => {
  // First, log to local Winston
  if (level.toLowerCase() === 'error') {
    logger.error(`[${source}] ${message}`);
  } else {
    logger.info(`[${source}] ${message}`);
  }

  // Then, send to Python DB
  // Dynamically import to avoid circular dependency
  const { pythonClient } = await import('../services/pythonClient.js');
  await pythonClient.postLog(level, source, message, details);
};
