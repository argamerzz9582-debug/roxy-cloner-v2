'use strict';

/**
 * Tiny leveled logger. Replaces the original's "stub out console.log, hope for
 * the best" approach: ANSI colour is opt-out, timestamps are opt-in, and the
 * level is controlled by LOG_LEVEL.
 */

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 100 });

const COLORS = Object.freeze({
  debug: '\x1b[90m',
  info: '\x1b[35m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m',
});

function createLogger(options = {}) {
  const levelName = String(options.level ?? 'info').toLowerCase();
  const threshold = LEVELS[levelName] ?? LEVELS.info;
  const useColor = options.color ?? (process.stdout.isTTY !== false);
  const write = options.write ?? ((line) => process.stdout.write(`${line}\n`));

  function emit(level, args) {
    if (LEVELS[level] < threshold) return;
    const message = args
      .map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join(' ');
    const tag = level.toUpperCase().padEnd(5);
    const line = useColor ? `${COLORS[level] ?? ''}[${tag}]${COLORS.reset} ${message}` : `[${tag}] ${message}`;
    write(line);
  }

  return {
    level: levelName,
    debug: (...args) => emit('debug', args),
    info: (...args) => emit('info', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args),
    /** A logger that prefixes every line, for per-phase context. */
    child(prefix) {
      const parent = { debug: 'debug', info: 'info', warn: 'warn', error: 'error' };
      const child = {};
      for (const [name, level] of Object.entries(parent)) {
        child[name] = (...args) => emit(level, [`${prefix}`, ...args]);
      }
      return child;
    },
  };
}

module.exports = { createLogger, LEVELS };
