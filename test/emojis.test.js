'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { limitsForTier, planEmojiClones, emojiCreatePayload, TIER_LIMITS } = require('../src/lib/emojis');

const emoji = (name, animated = false) => ({ name, animated, id: `id-${name}` });

test('boost tiers expose their slot budgets', () => {
  assert.deepEqual(limitsForTier(0), TIER_LIMITS[0]);
  assert.equal(limitsForTier(2).static, 150);
  assert.equal(limitsForTier(3).animated, 250);
  assert.deepEqual(limitsForTier(99), TIER_LIMITS[0]); // unknown tier falls back
});

test('only source emoji that fit in free slots are planned', () => {
  const plan = planEmojiClones({
    sourceEmojis: [emoji('a'), emoji('b'), emoji('c')],
    targetStaticCount: 48,
    targetAnimatedCount: 0,
    premiumTier: 0, // 50 static slots at tier 0
  });
  assert.equal(plan.statics.length, 2);
  assert.equal(plan.availableStatic, 2);
});

test('static and animated budgets are counted separately', () => {
  const plan = planEmojiClones({
    sourceEmojis: [emoji('s1'), emoji('a1', true)],
    targetStaticCount: 50,
    targetAnimatedCount: 0,
    premiumTier: 0,
  });
  assert.deepEqual(plan.statics, []);
  assert.equal(plan.animated.length, 1);
});

test('a full target yields no emoji and reports the condition', () => {
  const plan = planEmojiClones({
    sourceEmojis: [emoji('a')],
    targetStaticCount: 50,
    targetAnimatedCount: 50,
    premiumTier: 0,
  });
  assert.deepEqual(plan.statics, []);
  assert.deepEqual(plan.animated, []);
  assert.equal(plan.skippedNoSlots, true);
});

test('the per-run cap trims the plan', () => {
  const sourceEmojis = Array.from({ length: 10 }, (unused, index) => emoji(`e${index}`, index % 2 === 1));
  const plan = planEmojiClones({ sourceEmojis, premiumTier: 3, maxPerRun: 4 });
  assert.equal(plan.statics.length + plan.animated.length, 4);
});

test('emoji payload sanitises the name and uses imageURL when available', () => {
  const payload = emojiCreatePayload({ name: 'party-parrot!', imageURL: () => 'https://cdn/x.png' });
  assert.equal(payload.attachment, 'https://cdn/x.png');
  assert.equal(payload.name, 'party_parrot_');
});

test('emoji payload falls back to .url for plain objects', () => {
  const payload = emojiCreatePayload({ name: 'ok', url: 'https://cdn/y.png' });
  assert.equal(payload.attachment, 'https://cdn/y.png');
});
