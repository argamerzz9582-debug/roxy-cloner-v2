'use strict';

/** Promise-based sleep. Resolves immediately for non-positive values. */
function sleep(ms) {
  const delay = Number(ms);
  if (!Number.isFinite(delay) || delay <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delay);
    // Never hold the process open just to finish a cosmetic delay.
    if (typeof timer.unref === 'function') timer.unref();
  });
}

/** Human-readable duration, e.g. 95_000 -> "1m 35s". */
function formatDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

module.exports = { sleep, formatDuration };
