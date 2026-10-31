'use strict';

const { withRetry } = require('../lib/retry');
const { sleep } = require('../lib/time');
const { describeError, isMissingPermissions } = require('../lib/errors');

// Stop a phase after this many permission failures in a row: the bot has lost
// its access and continuing would just spam the log.
const ABORT_THRESHOLD = 5;

/**
 * Shared state and helpers for the clone phases.
 * Owns the role/category id maps, the politeness delay, dry-run behaviour and
 * failure bookkeeping.
 */
class CloneRunner {
  constructor(options) {
    this.source = options.source;
    this.target = options.target;
    this.options = options.options;
    this.config = options.config ?? {};
    this.log = options.log;
    this.report = options.report;
    this.notifier = options.notifier ?? null;

    this.roleMapping = new Map(); // source role id -> target role id
    this.categoryMapping = new Map(); // source category id -> target category id

    this.delayMs = Number.isFinite(this.config.delayMs) ? this.config.delayMs : 750;
    this.dryRun = Boolean(this.config.dryRun);

    this.protectedChannelId = null;
    this.abortReason = null;
    this.phaseStopReason = null;
    this.lastError = null;
    this.fatalStreak = 0;
  }

  get aborted() {
    return Boolean(this.abortReason);
  }

  get phaseStopped() {
    return Boolean(this.phaseStopReason) || this.aborted;
  }

  currentPhase = null;

  /** Called at the start of each phase to clear per-phase state. */
  beginPhase(name) {
    this.currentPhase = name;
    this.phaseStopReason = null;
    this.fatalStreak = 0;
  }

  async sleep() {
    if (this.delayMs > 0) await sleep(this.delayMs);
  }

  info(message) {
    this.log.info(message);
    this.notifier?.push(message);
  }

  warn(message) {
    this.log.warn(message);
    this.notifier?.push(`⚠️ ${message}`);
  }

  debug(message) {
    this.log.debug(message);
  }

  error(message) {
    this.log.error(message);
    this.notifier?.push(`❌ ${message}`);
  }

  trackFailure(err) {
    if (isMissingPermissions(err)) {
      this.fatalStreak += 1;
    } else {
      this.fatalStreak = 0;
    }
    if (this.fatalStreak >= ABORT_THRESHOLD && !this.abortReason) {
      this.abortReason = `stopped after ${this.fatalStreak} consecutive permission errors — check that the bot still has Administrator in the target server`;
      this.error(this.abortReason);
    }
  }

  /**
   * Run one mutating API call with retries, reporting and pacing.
   * @returns {Promise<{ok:boolean, value?:any, error?:Error, dryRun?:boolean, aborted?:boolean}>}
   */
  async mutate(label, category, task, options = {}) {
    const { outcome = 'created', stopOn = null, retries } = options;

    if (this.aborted) return { ok: false, aborted: true };

    if (this.dryRun) {
      this.report.record(category, 'planned', label);
      this.info(`[dry-run] ${label}`);
      return { ok: false, dryRun: true };
    }

    try {
      const value = await withRetry(task, {
        retries: retries ?? this.config.retries ?? 3,
        onRetry: (err, attempt, wait) => this.debug(`retrying "${label}" in ${wait}ms (attempt ${attempt}) — ${describeError(err)}`),
      });
      this.fatalStreak = 0;
      this.report.record(category, outcome, label);
      this.info(`✅ ${label}`);
      return { ok: true, value };
    } catch (err) {
      this.lastError = err;
      this.report.record(category, 'failed', label, err);
      this.warn(`${label} — ${describeError(err)}`);
      if (stopOn && stopOn(err)) this.phaseStopReason = describeError(err);
      this.trackFailure(err);
      return { ok: false, error: err };
    } finally {
      await this.sleep();
    }
  }

  /**
   * Narrow a list of source member ids down to those actually present in the
   * target guild, so member-level overwrites are kept when possible instead of
   * being dropped wholesale.
   */
  async resolveMemberIds(ids) {
    const wanted = [...new Set([...ids].map(String))];
    const found = new Set();
    if (wanted.length === 0) return found;

    const cache = this.target.members?.cache;
    const missing = [];
    for (const id of wanted) {
      if (cache?.has(id)) found.add(id);
      else missing.push(id);
    }

    if (missing.length > 0 && typeof this.target.members?.fetch === 'function' && !this.dryRun) {
      try {
        // Fetching only the referenced members keeps this cheap on big guilds.
        const fetched = await this.target.members.fetch({ user: missing.slice(0, 100) });
        for (const id of fetched.keys()) found.add(id);
      } catch (err) {
        this.debug(`Could not fetch members for overwrites: ${describeError(err)}`);
      }
    }

    return found;
  }
}

module.exports = { CloneRunner, ABORT_THRESHOLD };
