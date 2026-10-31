'use strict';

/**
 * Run bookkeeping. Pure data — no Discord objects — so it can be unit-tested
 * and rendered as either a Discord embed or console text.
 */

const OUTCOMES = Object.freeze(['created', 'deleted', 'failed', 'skipped', 'planned']);

const CATEGORY_LABELS = Object.freeze({
  roles: 'Roles',
  channels: 'Channels',
  emojis: 'Emojis',
});

const OUTCOME_LABELS = Object.freeze({
  created: 'created',
  deleted: 'deleted',
  failed: 'failed',
  skipped: 'skipped',
  planned: 'planned',
});

function emptyBucket() {
  return { created: 0, deleted: 0, failed: 0, skipped: 0, planned: 0 };
}

function createReport(options = {}) {
  const maxFailures = Number.isFinite(options.maxFailures) ? options.maxFailures : 15;
  const buckets = new Map();
  const failures = [];

  function bucketFor(category) {
    const key = String(category);
    if (!buckets.has(key)) buckets.set(key, emptyBucket());
    return buckets.get(key);
  }

  const report = {
    /** @param {'roles'|'channels'|'emojis'|string} category */
    record(category, outcome, label, error) {
      const bucket = bucketFor(category);
      const key = OUTCOMES.includes(outcome) ? outcome : 'failed';
      bucket[key] += 1;
      if (key === 'failed' && failures.length < maxFailures) {
        failures.push({ category: String(category), label: String(label ?? ''), error: error ? String(error.message ?? error) : null });
      }
      return report;
    },

    categories() {
      return [...buckets.entries()].map(([category, counts]) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        counts: { ...counts },
      }));
    },

    totals() {
      const totals = emptyBucket();
      for (const { counts } of report.categories()) {
        for (const outcome of OUTCOMES) totals[outcome] += counts[outcome];
      }
      return totals;
    },

    failures() {
      return [...failures];
    },

    isEmpty() {
      return buckets.size === 0;
    },

    /** Plain-text summary, used for console output and as the DM fallback. */
    toLines() {
      const lines = [];
      for (const { label, counts } of report.categories()) {
        const parts = OUTCOMES.filter((outcome) => counts[outcome] > 0).map(
          (outcome) => `${counts[outcome]} ${OUTCOME_LABELS[outcome]}`,
        );
        lines.push(`${label}: ${parts.join(', ') || 'nothing to do'}`);
      }
      if (failures.length) {
        lines.push('', `First ${failures.length} failure(s):`);
        for (const failure of failures) {
          lines.push(`• [${failure.category}] ${failure.label}${failure.error ? ` — ${failure.error}` : ''}`);
        }
      }
      return lines;
    },
  };

  return report;
}

module.exports = { createReport, OUTCOMES, CATEGORY_LABELS, OUTCOME_LABELS };
