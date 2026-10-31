'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { chunkContent, MAX_CONTENT, createNotifier } = require('../src/notifier');

function fakeChannel() {
  const sent = [];
  return {
    id: 'log-channel',
    sent,
    async send(payload) {
      sent.push(payload);
    },
  };
}

test('short content is returned as a single chunk', () => {
  assert.deepEqual(chunkContent('hello'), ['hello']);
  assert.deepEqual(chunkContent(''), []);
});

test('long content is split below the Discord limit without breaking lines', () => {
  const lines = Array.from({ length: 400 }, (unused, index) => `line ${index}`);
  const chunks = chunkContent(lines.join('\n'));
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= MAX_CONTENT, `chunk of ${chunk.length} exceeds limit`);
    assert.equal(chunk.includes('\u0000'), false);
  }
  assert.equal(chunks.join('\n').split('\n').length, 400);
});

test('a single oversized line is hard-split', () => {
  const chunks = chunkContent('x'.repeat(MAX_CONTENT + 50));
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((chunk) => chunk.length <= MAX_CONTENT));
});

test('buffered lines flush in one message', async () => {
  const channel = fakeChannel();
  const notifier = createNotifier({ channel, flushIntervalMs: 60_000 });
  notifier.push('first');
  notifier.push('second');
  await notifier.flush();
  await notifier.stop();

  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0], 'first\nsecond');
});

test('falls back to the DM target when the channel disappears', async () => {
  const dm = fakeChannel();
  let deleted = false;
  const channel = {
    id: 'log-channel',
    async send() {
      if (deleted) throw new Error('Unknown Channel');
      return true;
    },
  };

  const notifier = createNotifier({ channel, dmTarget: dm, flushIntervalMs: 60_000 });
  notifier.push('before');
  await notifier.flush();

  deleted = true;
  notifier.push('after');
  await notifier.stop();

  assert.equal(dm.sent.length, 1);
  assert.equal(dm.sent[0], 'after');
});

test('stop() is idempotent and flushes once', async () => {
  const channel = fakeChannel();
  const notifier = createNotifier({ channel, flushIntervalMs: 60_000 });
  notifier.push('only line');
  await notifier.stop();
  await notifier.stop();
  assert.equal(channel.sent.length, 1);
});

test('embeds are delivered through the same failover path', async () => {
  const channel = fakeChannel();
  const notifier = createNotifier({ channel, flushIntervalMs: 60_000 });
  await notifier.sendEmbed({ title: 'summary' });
  await notifier.stop();
  assert.deepEqual(channel.sent[0], { embeds: [{ title: 'summary' }] });
});

test('targetId reports the active channel', async () => {
  const channel = fakeChannel();
  const notifier = createNotifier({ channel, flushIntervalMs: 60_000 });
  assert.equal(notifier.targetId(), 'log-channel');
  assert.equal(notifier.hasChannel(), true);
  await notifier.stop();
});
