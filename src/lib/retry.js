'use strict';

const { isRateLimit, isTransient, retryAfterMs } = require('./errors');
const { sleep: defaultSleep } = require('./time');

/**
 * Run `task` with bounded retries for transient failures only.
 *
 * Rate limits honour Discord's `retry_after`; everything else uses exponential
 * backoff. Non-transient errors (missing permissions, invalid body, ...) are
 * thrown immediately — retrying those just burns the rate limit budget.
 */
async function withRetry(task, options = {}) {
  const {
    retries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    onRetry = () => {},
    sleep = defaultSleep,
  } = options;

  let attempt = 0;
  for (;;) {
    try {
      return await task(attempt);
    } catch (err) {
      const canRetry = attempt < retries && isTransient(err);
      if (!canRetry) throw err;

      const hinted = isRateLimit(err) ? retryAfterMs(err) : null;
      const backoff = baseDelayMs * 2 ** attempt;
      const wait = Math.min(maxDelayMs, Math.max(200, hinted ?? backoff));

      await onRetry(err, attempt + 1, wait);
      await sleep(wait);
      attempt += 1;
    }
  }
}

module.exports = { withRetry };
