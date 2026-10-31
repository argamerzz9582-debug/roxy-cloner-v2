'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TYPES,
  classifyChannelType,
  isCloneable,
  clampBitrate,
  buildChannelPayload,
  compact,
  channelDeletionRank,
  summariseChannelTypes,
} = require('../src/lib/channels');

test('numeric discord.js v14 types map to readable kinds', () => {
  assert.equal(classifyChannelType(TYPES.TEXT), 'text');
  assert.equal(classifyChannelType(TYPES.VOICE), 'voice');
  assert.equal(classifyChannelType(TYPES.CATEGORY), 'category');
  assert.equal(classifyChannelType(TYPES.ANNOUNCEMENT), 'announcement');
  assert.equal(classifyChannelType(TYPES.STAGE), 'stage');
  assert.equal(classifyChannelType(TYPES.FORUM), 'forum');
  assert.equal(classifyChannelType(TYPES.MEDIA), 'media');
});

test('threads and unknown types are not clonable', () => {
  for (const type of [10, 11, 12, 99, undefined]) {
    assert.equal(classifyChannelType(type), null);
    assert.equal(isCloneable(type), false);
  }
});

test('bitrate is clamped to the target ceiling', () => {
  assert.equal(clampBitrate(128000, 96000), 96000);
  assert.equal(clampBitrate(64000, 96000), 64000);
  assert.equal(clampBitrate(64000, undefined), 64000);
  assert.equal(clampBitrate(0, 96000), undefined);
  assert.equal(clampBitrate(undefined, 96000), undefined);
});

test('text channels carry topic, nsfw and slowmode', () => {
  const payload = buildChannelPayload(
    { name: 'general', type: TYPES.TEXT, topic: 'hi', nsfw: true, rateLimitPerUser: 10 },
    { parentId: 'cat-1' },
  );
  assert.equal(payload.type, 0);
  assert.equal(payload.parent, 'cat-1');
  assert.equal(payload.topic, 'hi');
  assert.equal(payload.nsfw, true);
  assert.equal(payload.rateLimitPerUser, 10);
});

test('categories never get a parent', () => {
  const payload = buildChannelPayload({ name: 'Cat', type: TYPES.CATEGORY }, { parentId: 'ignored' });
  assert.equal(payload.type, 4);
  assert.equal('parent' in payload, false);
});

test('voice channels get clamped bitrate and a user limit', () => {
  const payload = buildChannelPayload({ name: 'V', type: TYPES.VOICE, bitrate: 256000, userLimit: 5 }, { maxBitrate: 96000 });
  assert.equal(payload.bitrate, 96000);
  assert.equal(payload.userLimit, 5);
});

test('stage channels skip the voice user limit', () => {
  const payload = buildChannelPayload({ name: 'S', type: TYPES.STAGE, bitrate: 64000, userLimit: 5 });
  assert.equal(payload.type, 13);
  assert.equal('userLimit' in payload, false);
});

test('forum channels keep unicode default reactions but drop custom ones', () => {
  const unicode = buildChannelPayload({
    name: 'F',
    type: TYPES.FORUM,
    availableTags: [{ name: 'bug', moderated: true }],
    defaultReactionEmoji: { id: null, name: '🐛' },
  });
  assert.deepEqual(unicode.availableTags, [{ name: 'bug', moderated: true }]);
  assert.deepEqual(unicode.defaultReactionEmoji, { name: '🐛' });

  const custom = buildChannelPayload({
    name: 'F',
    type: TYPES.FORUM,
    defaultReactionEmoji: { id: '123456789012345678', name: null },
  });
  assert.equal('defaultReactionEmoji' in custom, false);
});

test('unsupported types build no payload at all', () => {
  assert.equal(buildChannelPayload({ name: 'thread', type: 11 }), null);
  assert.equal(buildChannelPayload(null), null);
});

test('compact strips undefined keys', () => {
  assert.deepEqual(compact({ a: 1, b: undefined, c: null }), { a: 1, c: null });
});

test('categories are deleted after their children', () => {
  assert.ok(channelDeletionRank(TYPES.TEXT) < channelDeletionRank(TYPES.CATEGORY));
  assert.ok(channelDeletionRank(TYPES.VOICE) < channelDeletionRank(TYPES.CATEGORY));
});

test('channel type summary counts each kind', () => {
  const counts = summariseChannelTypes([{ type: 0 }, { type: 0 }, { type: 2 }, { type: 4 }, { type: 11 }]);
  assert.equal(counts.text, 2);
  assert.equal(counts.voice, 1);
  assert.equal(counts.category, 1);
  assert.equal(counts.other, 1);
});
