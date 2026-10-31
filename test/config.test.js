'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeConfig, parseIds, parseDelay, parseBoolean, DEFAULT_DELAY_MS, MAX_DELAY_MS } = require('../src/lib/config');

const VALID = {
  BOT_TOKEN: 'bot-token',
  DC_TOKEN: 'user-token',
  ALLOWED_ID: '123456789012345678',
};

test('parseIds accepts comma, space and newline separated ids', () => {
  assert.deepEqual(parseIds('1,2 3\n4'), ['1', '2', '3', '4']);
  assert.deepEqual(parseIds(''), []);
  assert.deepEqual(parseIds(undefined), []);
  assert.deepEqual(parseIds(' 111 , 222 , '), ['111', '222']);
});

test('parseBoolean understands common truthy spellings', () => {
  for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) assert.equal(parseBoolean(value), true);
  for (const value of ['', '0', 'false', 'no', undefined]) assert.equal(parseBoolean(value), false);
});

test('parseDelay falls back to the default and clamps the ceiling', () => {
  assert.equal(parseDelay(undefined), DEFAULT_DELAY_MS);
  assert.equal(parseDelay('abc'), DEFAULT_DELAY_MS);
  assert.equal(parseDelay('-5'), DEFAULT_DELAY_MS);
  assert.equal(parseDelay('0'), 0);
  assert.equal(parseDelay('400'), 400);
  assert.equal(parseDelay('999999'), MAX_DELAY_MS);
});

test('a complete environment is accepted', () => {
  const config = normalizeConfig(VALID);
  assert.equal(config.ok, true);
  assert.deepEqual(config.errors, []);
  assert.deepEqual(config.allowedIds, [VALID.ALLOWED_ID]);
  assert.equal(config.dryRun, false);
});

test('missing tokens are all reported at once', () => {
  const config = normalizeConfig({});
  assert.equal(config.ok, false);
  assert.equal(config.errors.length, 3);
  assert.match(config.errors.join('\n'), /BOT_TOKEN/);
  assert.match(config.errors.join('\n'), /DC_TOKEN/);
  assert.match(config.errors.join('\n'), /ALLOWED_ID/);
});

test('malformed allowlist ids are rejected', () => {
  const config = normalizeConfig({ ...VALID, ALLOWED_ID: '123, not-an-id' });
  assert.equal(config.ok, false);
  assert.match(config.errors.join('\n'), /not-an-id/);
});

test('using the same token twice is rejected', () => {
  const config = normalizeConfig({ ...VALID, DC_TOKEN: VALID.BOT_TOKEN });
  assert.equal(config.ok, false);
  assert.match(config.errors.join('\n'), /identical/);
});

test('dry run and delay are picked up', () => {
  const config = normalizeConfig({ ...VALID, DRY_RUN: 'true', CLONE_DELAY_MS: '1500' });
  assert.equal(config.dryRun, true);
  assert.equal(config.delayMs, 1500);
});
