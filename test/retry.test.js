'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { withRetry } = require('../src/lib/retry');

function noSleep() {
  const waits = [];
  const sleep = async (ms) => {
    waits.push(ms);
  };
  return { waits, sleep };
}

test('returns the value on first success without sleeping', async () => {
  const { waits, sleep } = noSleep();
  const value = await withRetry(async () => 42, { sleep });
  assert.equal(value, 42);
  assert.deepEqual(waits, []);
});

test('retries transient errors and then succeeds', async () => {
  const { waits, sleep } = noSleep();
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('boom'), { status: 503 });
      return 'done';
    },
    { sleep, baseDelayMs: 100 },
  );
  assert.equal(value, 'done');
  assert.equal(calls, 3);
  assert.equal(waits.length, 2);
});

test('honours retry_after for 429s', async () => {
  const { waits, sleep } = noSleep();
  let calls = 0;
  await withRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw { status: 429, rawError: { retry_after: 1.5 } };
      return 'ok';
    },
    { sleep },
  );
  assert.deepEqual(waits, [1500]);
});

test('does not retry non-transient errors', async () => {
  const { waits, sleep } = noSleep();
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls += 1;
          throw Object.assign(new Error('Missing Permissions'), { code: 50013 });
        },
        { sleep },
      ),
    /Missing Permissions/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test('gives up after the retry budget and rethrows the last error', async () => {
  const { sleep } = noSleep();
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls += 1;
          throw Object.assign(new Error('still down'), { status: 500 });
        },
        { sleep, retries: 2 },
      ),
    /still down/,
  );
  assert.equal(calls, 3); // initial + 2 retries
});
