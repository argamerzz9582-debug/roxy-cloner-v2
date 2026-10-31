'use strict';

const { planEmojiClones, emojiCreatePayload } = require('../lib/emojis');
const { isEmojiLimit, isRateLimit } = require('../lib/errors');

const REASON = 'roxy-cloner-v2: clone emojis';

/**
 * Clone emoji within the target's slot budget.
 *
 * Instead of racing every upload against a 15s timer to discover the daily cap,
 * we compute how many slots exist up front and stop cleanly on the first hard
 * limit error.
 */
async function cloneEmojis(runner) {
  const { source, target } = runner;

  const sourceEmojis = [...(source.emojis?.cache?.values() ?? [])];
  const targetEmojis = [...(target.emojis?.cache?.values() ?? [])];
  const targetStatic = targetEmojis.filter((emoji) => !emoji.animated).length;
  const targetAnimated = targetEmojis.filter((emoji) => emoji.animated).length;

  const plan = planEmojiClones({
    sourceEmojis,
    targetStaticCount: targetStatic,
    targetAnimatedCount: targetAnimated,
    premiumTier: target.premiumTier ?? 0,
    maxPerRun: runner.config.maxEmojisPerRun,
  });

  const queue = [...plan.statics, ...plan.animated];
  const unavailable = sourceEmojis.length - queue.length;

  runner.info(
    `Emoji slots: ${plan.availableStatic} static / ${plan.availableAnimated} animated free ` +
      `(tier ${target.premiumTier ?? 0}). Cloning ${queue.length} of ${sourceEmojis.length}.`,
  );
  if (unavailable > 0) {
    runner.warn(`${unavailable} source emoji cannot be cloned — no free slots or per-run cap reached.`);
  }
  if (queue.length === 0) return;

  for (const emoji of queue) {
    if (runner.phaseStopped) return;

    const result = await runner.mutate(`Created emoji :${emoji.name}:`, 'emojis', () =>
      target.emojis.create(emojiCreatePayload(emoji, REASON)),
    );

    if (!result.ok && result.error) {
      if (isEmojiLimit(result.error)) {
        runner.warn('Maximum emoji slots reached — skipping the rest of the emoji.');
        return;
      }
      if (isRateLimit(result.error)) {
        runner.warn('Emoji upload rate limit reached (Discord caps emoji uploads per day) — skipping the rest.');
        return;
      }
    }
  }
}

module.exports = { cloneEmojis };
