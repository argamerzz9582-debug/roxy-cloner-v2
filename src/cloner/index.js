'use strict';

const { createReport } = require('../lib/report');
const { formatDuration } = require('../lib/time');
const { createNotifier } = require('../notifier');
const { buildSummaryEmbed, summaryToText } = require('../ui/embeds');
const { CloneRunner } = require('./runner');
const { deleteChannels, deleteRoles, deleteEmojis, deleteProtectedChannel } = require('./cleanup');
const roles = require('./roles');
const channels = require('./channels');
const emojis = require('./emojis');

/** Ordered phase plan. Deletes run first so cloning lands on a clean server. */
function buildPhases(options) {
  const phases = [];
  if (options.deleteChannels) phases.push({ name: 'Wipe channels', run: deleteChannels });
  if (options.deleteRoles) phases.push({ name: 'Wipe roles', run: deleteRoles });
  if (options.deleteEmojis) phases.push({ name: 'Wipe emojis', run: deleteEmojis });
  // Roles before channels: channel permission overwrites reference the new roles.
  if (options.cloneRoles) phases.push({ name: 'Clone roles', run: roles.cloneRoles });
  if (options.cloneChannels) phases.push({ name: 'Clone channels', run: channels.cloneChannels });
  if (options.cloneEmojis) phases.push({ name: 'Clone emojis', run: emojis.cloneEmojis });
  return phases;
}

/**
 * Execute a clone run end to end.
 *
 * @param {object} params
 * @param {object} params.source      source guild (read through the user client)
 * @param {object} params.target      target guild (written through the bot)
 * @param {object} params.options     { deleteChannels, deleteRoles, deleteEmojis, cloneChannels, cloneRoles, cloneEmojis }
 * @param {object} params.config      normalised config (delayMs, dryRun, ...)
 * @param {object} params.log         logger
 * @param {object} params.operator    Discord user to DM the summary to
 * @param {object} [params.logChannel] channel to stream progress into
 */
async function runClone({ source, target, options, config, log, operator, logChannel }) {
  const startedAt = Date.now();
  const report = createReport();

  const notifier = createNotifier({
    channel: logChannel,
    dmTarget: operator,
    log,
    flushIntervalMs: config.logFlushMs,
  });

  const runner = new CloneRunner({ source, target, options, config, log, report, notifier });

  // The log channel survives the wipe and is deleted at the very end, so
  // progress keeps streaming instead of dying halfway through.
  if (logChannel && logChannel.guild?.id === target.id) {
    runner.protectedChannelId = logChannel.id;
  }

  const phases = buildPhases(options);

  if (config.dryRun) {
    runner.info('**DRY RUN** — no changes will be made to the target server.');
  }
  runner.info(`Cloning **${source.name}** → **${target.name}** (${phases.length} phase(s)).`);

  try {
    for (const phase of phases) {
      if (runner.aborted) break;
      runner.beginPhase(phase.name);
      runner.info(`— ${phase.name} —`);
      await phase.run(runner);
      if (runner.phaseStopReason) {
        runner.warn(`${phase.name} stopped early: ${runner.phaseStopReason}`);
      }
    }
  } catch (err) {
    runner.error(`Clone aborted: ${err?.message ?? err}`);
    log.error(err);
  }

  const elapsedMs = Date.now() - startedAt;
  const summary = {
    sourceName: source.name,
    targetName: target.name,
    report,
    elapsedMs,
    aborted: runner.aborted,
    abortReason: runner.abortReason,
    dryRun: Boolean(config.dryRun),
  };

  // Summary into the log channel first (while it still exists)...
  try {
    await notifier.sendEmbed(buildSummaryEmbed(summary));
  } catch {
    /* best effort */
  }
  await notifier.stop();

  // ...then optionally remove the protected channel, now that logs are done.
  if (options.deleteChannels && runner.protectedChannelId && !config.dryRun) {
    const removal = await deleteProtectedChannel(runner);
    if (removal.ok) log.debug('Log channel removed.');
  }

  // Always DM the operator: the log channel may no longer exist.
  const dmText = summaryToText(summary);
  try {
    await operator.send(dmText);
  } catch {
    log.warn('Could not DM the summary (DMs may be closed).');
  }

  log.info(`Clone finished in ${formatDuration(elapsedMs)}.`);
  return { report, elapsedMs, aborted: runner.aborted };
}

module.exports = { runClone, buildPhases };
