#!/usr/bin/env node
'use strict';

/**
 * Roxy Cloner V2 — entry point.
 *
 * Two clients run side by side:
 *   BOT_TOKEN (discord.js)              writes to the target server
 *   DC_TOKEN  (discord.js-selfbot-v13)  reads the source server
 *
 * See README.md for setup. The clone logic lives in src/.
 */

const { printBanner } = require('./src/banner');
const { loadConfig } = require('./src/config');
const { createLogger } = require('./src/logger');
const { createApp, PREFIX } = require('./src/app');

async function main() {
  printBanner();

  const config = loadConfig();
  const log = createLogger({ level: config.logLevel });

  if (!config.ok) {
    log.error('Configuration problem(s):');
    for (const problem of config.errors) log.error(`  • ${problem}`);
    log.error('Copy .env.example to .env and fill it in (see README.md).');
    process.exitCode = 1;
    return;
  }

  log.info(`Allowed operator(s): ${config.allowedIds.join(', ')}`);
  log.info(`Pace between API calls: ${config.delayMs}ms${config.dryRun ? ' · DRY RUN' : ''}`);
  log.info(`Waiting for ${PREFIX}clone — the bot(s) may take a few seconds to connect.`);

  const app = createApp({ config, log });
  await app.start();
  log.info('Ready.');

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.warn(`Received ${signal}.`);
    await app.shutdown().catch((err) => log.error('Shutdown error:', err?.message ?? err));
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Never swallow these silently — a crashed clone with no trace is worse than a noisy log.
  process.on('unhandledRejection', (reason) => log.error('Unhandled rejection:', reason));
  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception:', err);
    process.exitCode = 1;
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console -- last-resort reporting
  console.error(`\x1b[31mFatal: ${err?.message ?? err}\x1b[0m`);
  process.exit(1);
});
