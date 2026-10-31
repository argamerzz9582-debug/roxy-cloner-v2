'use strict';

/**
 * Emoji slot planning.
 *
 * Discord grants separate static and animated budgets per boost tier, and every
 * already-present emoji consumes a slot. Planning up front means we stop before
 * tripping the daily-upload rate limit, instead of relying on a 15s timeout to
 * discover it.
 */

const TIER_LIMITS = Object.freeze({
  0: { static: 50, animated: 50 },
  1: { static: 100, animated: 100 },
  2: { static: 150, animated: 150 },
  3: { static: 250, animated: 250 },
});

function limitsForTier(tier) {
  return TIER_LIMITS[Number(tier)] ?? TIER_LIMITS[0];
}

/**
 * @param {{sourceEmojis:Array, targetStaticCount?:number, targetAnimatedCount?:number,
 *          premiumTier?:number, maxPerRun?:number|null}} input
 */
function planEmojiClones(input = {}) {
  const sourceEmojis = input.sourceEmojis || [];
  const limits = limitsForTier(input.premiumTier ?? 0);

  const availableStatic = Math.max(0, limits.static - (input.targetStaticCount || 0));
  const availableAnimated = Math.max(0, limits.animated - (input.targetAnimatedCount || 0));

  let statics = sourceEmojis.filter((emoji) => !emoji.animated).slice(0, availableStatic);
  let animated = sourceEmojis.filter((emoji) => emoji.animated).slice(0, availableAnimated);

  const maxPerRun = Number.isFinite(input.maxPerRun) && input.maxPerRun > 0 ? input.maxPerRun : null;
  if (maxPerRun) {
    const total = statics.length + animated.length;
    if (total > maxPerRun) {
      // Trim proportionally, static first, so both kinds get a share.
      const takeStatic = Math.min(statics.length, Math.ceil(maxPerRun / 2));
      statics = statics.slice(0, takeStatic);
      animated = animated.slice(0, Math.max(0, maxPerRun - statics.length));
    }
  }

  return {
    statics,
    animated,
    availableStatic,
    availableAnimated,
    limits,
    skippedNoSlots: (input.targetStaticCount || 0) >= limits.static && (input.targetAnimatedCount || 0) >= limits.animated,
  };
}

function emojiCreatePayload(emoji, reason = 'roxy-cloner-v2') {
  return {
    attachment: typeof emoji.imageURL === 'function' ? emoji.imageURL() : emoji.url,
    name: String(emoji.name ?? 'emoji').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32) || 'emoji',
    reason,
  };
}

module.exports = { TIER_LIMITS, limitsForTier, planEmojiClones, emojiCreatePayload };
