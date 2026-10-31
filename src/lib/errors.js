'use strict';

/**
 * Pure error-classification helpers (no discord.js import, unit-testable).
 *
 * The cloner needs three questions answered about any thrown error:
 *   1. Is it worth retrying?  (rate limits, 5xx, socket hiccups)
 *   2. How long should we wait before retrying?
 *   3. Is it fatal enough that we should stop hammering the API?
 */

const RATE_LIMIT_STATUS = 429;

// Discord JSON error codes we treat as "stop the phase, permissions are gone".
const PERMISSION_CODES = new Set([
  50001, // Missing Access
  50013, // Missing Permissions
  50074, // Missing 2FA
]);

// Network-level codes from Node's socket layer.
const TRANSIENT_NET_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function isRateLimit(err) {
  if (!err) return false;
  if (err.status === RATE_LIMIT_STATUS) return true;
  if (err.httpStatus === RATE_LIMIT_STATUS) return true;
  if (err.rawError && err.rawError.retry_after != null) return true;
  // discord.js surfaces Discord's JSON code 429 on some paths.
  return err.code === RATE_LIMIT_STATUS;
}

/** Milliseconds to wait before retrying, or null when unknown. */
function retryAfterMs(err) {
  if (!err) return null;
  const raw = err.retryAfter ?? err.retry_after ?? err.rawError?.retry_after;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    // Discord reports seconds; discord.js's `retryAfter` is also seconds.
    return Math.ceil(raw * 1000);
  }
  return null;
}

function isMissingPermissions(err) {
  if (!err) return false;
  if (PERMISSION_CODES.has(err.code)) return true;
  return typeof err.message === 'string' && /missing (permissions|access)/i.test(err.message);
}

function isEmojiLimit(err) {
  if (!err) return false;
  if (err.code === 30008) return true; // Maximum number of emojis reached
  const message = String(err.message ?? err);
  return /maximum number of emojis|emoji limit/i.test(message);
}

function isTransient(err) {
  if (!err) return false;
  if (isRateLimit(err)) return true;
  if (typeof err.status === 'number' && err.status >= 500) return true;
  if (typeof err.httpStatus === 'number' && err.httpStatus >= 500) return true;
  if (TRANSIENT_NET_CODES.has(err.code)) return true;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  return false;
}

/** Short, log-friendly one-liner. */
function describeError(err) {
  if (!err) return 'unknown error';
  const name = err.name && err.name !== 'Error' ? `${err.name}: ` : '';
  const code = err.code != null ? ` (code ${err.code})` : '';
  const message = err.message ?? String(err);
  const line = `${name}${message}${code}`.replace(/\s+/g, ' ').trim();
  return line.length > 220 ? `${line.slice(0, 217)}...` : line;
}

module.exports = {
  isRateLimit,
  retryAfterMs,
  isMissingPermissions,
  isEmojiLimit,
  isTransient,
  describeError,
  PERMISSION_CODES,
};
