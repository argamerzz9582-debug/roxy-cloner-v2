'use strict';

/**
 * Batched Discord log sink.
 *
 * The original code awaited one channel.send() per cloned object, which burned
 * rate limit budget and duplicated logic in both branches of an if/else.
 * This buffers lines and flushes them on a timer, and transparently falls back
 * to the operator's DMs when the log channel is wiped or deleted.
 */

const MAX_CONTENT = 1900; // Discord's hard limit is 2000
const DEFAULT_FLUSH_MS = 2500;

function chunkContent(text, max = MAX_CONTENT) {
  const source = String(text ?? '');
  if (source.length <= max) return source ? [source] : [];
  const chunks = [];
  let current = '';
  for (const line of source.split('\n')) {
    if (line.length > max) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let index = 0; index < line.length; index += max) chunks.push(line.slice(index, index + max));
      continue;
    }
    if (current.length + line.length + 1 > max) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function trySend(channel, payload) {
  try {
    await channel.send(payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{channel?:object, dmTarget?:object, log?:object, flushIntervalMs?:number}} options
 * @returns {{push:Function, flush:Function, stop:Function, sendEmbed:Function, targetId:Function}}
 */
function createNotifier(options = {}) {
  const log = options.log;
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_MS;
  const dmTarget = options.dmTarget ?? null;

  let channel = options.channel && typeof options.channel.send === 'function' ? options.channel : null;
  let buffer = [];
  let timer = null;
  let chain = Promise.resolve();
  let stopped = false;

  function schedule() {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, flushIntervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  async function deliver(payload) {
    if (channel) {
      if (await trySend(channel, payload)) return;
      channel = null;
      log?.debug('Log channel is gone — continuing in DM.');
    }
    if (dmTarget) {
      if (await trySend(dmTarget, payload)) return;
    }
    log?.debug('Could not deliver log message to Discord.');
  }

  async function doFlush() {
    if (buffer.length === 0) return;
    const payload = buffer.join('\n');
    buffer = [];
    for (const chunk of chunkContent(payload)) {
      await deliver(chunk);
    }
  }

  function flush() {
    chain = chain.then(doFlush, doFlush);
    return chain;
  }

  return {
    /** Queue a line; console output is handled by the caller's logger. */
    push(line) {
      const text = String(line ?? '');
      if (!text) return;
      buffer.push(text);
      if (buffer.join('\n').length >= MAX_CONTENT) {
        void flush();
      } else {
        schedule();
      }
    },

    flush,

    sendEmbed(embed) {
      chain = chain.then(
        () => deliver({ embeds: [embed] }),
        () => deliver({ embeds: [embed] }),
      );
      return chain;
    },

    /** Flush everything and stop the timer. Safe to call twice. */
    async stop() {
      if (stopped) {
        await chain;
        return;
      }
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flush();
      await chain;
    },

    /** Id of the channel we are currently logging into, if any. */
    targetId() {
      return channel?.id ?? null;
    },

    hasChannel() {
      return Boolean(channel);
    },
  };
}

module.exports = { createNotifier, chunkContent, MAX_CONTENT };
