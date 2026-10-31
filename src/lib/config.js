'use strict';

/** Pure env parsing — takes a plain object so it can be unit-tested. */

const SNOWFLAKE = /^\d{17,20}$/;
const DEFAULT_DELAY_MS = 750;
const MAX_DELAY_MS = 10000;

function parseIds(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBoolean(raw) {
  return /^(1|true|yes|on)$/i.test(String(raw ?? '').trim());
}

function parseDelay(raw) {
  if (raw == null || String(raw).trim() === '') return DEFAULT_DELAY_MS;
  const value = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_DELAY_MS;
  return Math.min(value, MAX_DELAY_MS);
}

/**
 * Normalise raw env vars into a config object.
 * Returns `{ ok, errors, ...values }` — never throws, so startup can print
 * every problem at once instead of one per run.
 */
function normalizeConfig(env = {}) {
  const errors = [];

  const botToken = String(env.BOT_TOKEN ?? '').trim();
  const userToken = String(env.DC_TOKEN ?? '').trim();
  const allowedIds = parseIds(env.ALLOWED_ID);

  if (!botToken) errors.push('BOT_TOKEN is not set (needed to write to the target server).');
  if (!userToken) errors.push('DC_TOKEN is not set (needed to read the source server).');
  if (allowedIds.length === 0) errors.push('ALLOWED_ID is not set (who is allowed to run !clone).');

  for (const id of allowedIds) {
    if (!SNOWFLAKE.test(id)) {
      errors.push(`ALLOWED_ID entry "${id}" is not a valid Discord user id (17-20 digits).`);
    }
  }

  if (botToken && userToken && botToken === userToken) {
    errors.push('BOT_TOKEN and DC_TOKEN are identical — one must be a bot token, the other a user token.');
  }

  return {
    ok: errors.length === 0,
    errors,
    botToken,
    userToken,
    allowedIds,
    delayMs: parseDelay(env.CLONE_DELAY_MS),
    dryRun: parseBoolean(env.DRY_RUN),
    logLevel: String(env.LOG_LEVEL ?? 'info').trim().toLowerCase(),
    maxEmojisPerRun: Number.parseInt(env.MAX_EMOJIS_PER_RUN ?? '', 10) || null,
  };
}

module.exports = { normalizeConfig, parseIds, parseBoolean, parseDelay, DEFAULT_DELAY_MS, MAX_DELAY_MS, SNOWFLAKE };
