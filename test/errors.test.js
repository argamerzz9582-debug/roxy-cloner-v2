'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isRateLimit,
  retryAfterMs,
  isMissingPermissions,
  isEmojiLimit,
  isTransient,
  describeError,
} = require('../src/lib/errors');

test('rate limits are detected across discord.js error shapes', () => {
  assert.equal(isRateLimit({ status: 429 }), true);
  assert.equal(isRateLimit({ httpStatus: 429 }), true);
  assert.equal(isRateLimit({ code: 429 }), true);
  assert.equal(isRateLimit({ rawError: { retry_after: 2.5 } }), true);
  assert.equal(isRateLimit({ status: 500, code: 50013 }), false);
  assert.equal(isRateLimit(null), false);
});

test('retry_after seconds are converted to milliseconds', () => {
  assert.equal(retryAfterMs({ rawError: { retry_after: 1.5 } }), 1500);
  assert.equal(retryAfterMs({ retryAfter: 2 }), 2000);
  assert.equal(retryAfterMs({}), null);
});

test('permission failures are recognised', () => {
  assert.equal(isMissingPermissions({ code: 50013 }), true);
  assert.equal(isMissingPermissions({ code: 50001 }), true);
  assert.equal(isMissingPermissions({ message: 'Missing Permissions' }), true);
  assert.equal(isMissingPermissions({ code: 30013 }), false);
});

test('emoji slot errors are recognised', () => {
  assert.equal(isEmojiLimit({ code: 30008 }), true);
  assert.equal(isEmojiLimit({ message: 'Maximum number of emojis reached (200)' }), true);
  assert.equal(isEmojiLimit({ message: 'nope' }), false);
});

test('only genuinely transient failures are retried', () => {
  assert.equal(isTransient({ status: 429 }), true);
  assert.equal(isTransient({ status: 502 }), true);
  assert.equal(isTransient({ code: 'ECONNRESET' }), true);
  assert.equal(isTransient({ name: 'AbortError' }), true);

  assert.equal(isTransient({ code: 50013 }), false);
  assert.equal(isTransient({ status: 400 }), false);
  assert.equal(isTransient(new Error('Invalid Form Body')), false);
});

test('describeError stays on one line and is length-capped', () => {
  assert.equal(describeError({ name: 'DiscordAPIError', message: 'Missing   Access', code: 50001 }), 'DiscordAPIError: Missing Access (code 50001)');
  const long = describeError(new Error('x'.repeat(500)));
  assert.ok(long.length <= 220);
  assert.equal(long.includes('\n'), false);
});
