// ============================================================
// Structured Logger
// ============================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const MIN_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info'

export const logger = {
  debug: (module: string, msg: string, data?: any) => log('debug', module, msg, data),
  info: (module: string, msg: string, data?: any) => log('info', module, msg, data),
  warn: (module: string, msg: string, data?: any) => log('warn', module, msg, data),
  error: (module: string, msg: string, data?: any) => log('error', module, msg, data),
}

function log(level: LogLevel, module: string, msg: string, data?: any) {
  if (LOG_LEVELS[level] < LOG_LEVELS[MIN_LEVEL]) return
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    msg,
    ...(data ? { data } : {}),
  }
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(JSON.stringify(entry))
}

// ============================================================
// Job tracking (shared state for health check)
// ============================================================
let _lastJobRun: string | null = null

export function setLastJobRun(timestamp: string) {
  _lastJobRun = timestamp
}

export function getLastJobRun(): string | null {
  return _lastJobRun
}
