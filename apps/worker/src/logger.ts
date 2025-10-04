interface LoggerContext {
  workerId: string;
}

type LogLevel = 'info' | 'warn' | 'error';

type LogPayload = Record<string, unknown>;

function log(level: LogLevel, message: string, context: LoggerContext, meta?: LogPayload) {
  const prefix = `[worker:${context.workerId}]`;
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  if (level === 'info') {
    console.log(prefix, message, payload);
  } else if (level === 'warn') {
    console.warn(prefix, message, payload);
  } else {
    console.error(prefix, message, payload);
  }
}

export interface Logger {
  info: (message: string, meta?: LogPayload) => void;
  warn: (message: string, meta?: LogPayload) => void;
  error: (message: string, meta?: LogPayload) => void;
}

export function createLogger(context: LoggerContext): Logger {
  return {
    info: (message, meta) => log('info', message, context, meta),
    warn: (message, meta) => log('warn', message, context, meta),
    error: (message, meta) => log('error', message, context, meta),
  };
}
