export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createLogger(env: string): ILogger {
  const isDev = env === 'development';

  function log(level: string, message: string, meta?: Record<string, unknown>): void {
    const entry = { timestamp: new Date().toISOString(), level, message, ...meta };

    if (isDev) {
      const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.log(`${emoji} [${level.toUpperCase()}] ${message}${metaStr}`);
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  return {
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
  };
}
