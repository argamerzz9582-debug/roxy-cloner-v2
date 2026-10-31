'use strict';

const { channelDeletionRank } = require('../lib/channels');
const { withRetry } = require('../lib/retry');
const { describeError } = require('../lib/errors');

const REASON = 'roxy-cloner-v2: wipe';

/** Delete every removable channel, children before categories. */
async function deleteChannels(runner) {
  const removable = [...runner.target.channels.cache.values()]
    .filter((channel) => channel.deletable && channel.id !== runner.protectedChannelId)
    .sort((a, b) => channelDeletionRank(a.type) - channelDeletionRank(b.type));

  runner.info(`Deleting ${removable.length} channel(s)...`);
  if (removable.length === 0) {
    runner.info('No deletable channels — nothing to wipe.');
    return;
  }

  for (const channel of removable) {
    if (runner.phaseStopped) return;
    await runner.mutate(
      `Deleted channel #${channel.name}`,
      'channels',
      () => channel.delete(REASON),
      { outcome: 'deleted' },
    );
  }
}

/** Delete every role the bot is allowed to touch. */
async function deleteRoles(runner) {
  const removable = [...runner.target.roles.cache.values()].filter(
    (role) => role.name !== '@everyone' && !role.managed && role.editable,
  );

  runner.info(`Deleting ${removable.length} role(s)...`);
  if (removable.length === 0) {
    runner.info('No deletable roles — nothing to wipe.');
    return;
  }

  // Highest first keeps the hierarchy valid while we delete.
  removable.sort((a, b) => b.position - a.position);

  for (const role of removable) {
    if (runner.phaseStopped) return;
    await runner.mutate(`Deleted role ${role.name}`, 'roles', () => role.delete(REASON), { outcome: 'deleted' });
  }
}

/** Delete all custom emojis, static and animated. */
async function deleteEmojis(runner) {
  const removable = [...runner.target.emojis.cache.values()].filter((emoji) => emoji.deletable);

  runner.info(`Deleting ${removable.length} emoji...`);
  if (removable.length === 0) {
    runner.info('No deletable emoji — nothing to wipe.');
    return;
  }

  for (const emoji of removable) {
    if (runner.phaseStopped) return;
    await runner.mutate(`Deleted emoji :${emoji.name}:`, 'emojis', () => emoji.delete(REASON), { outcome: 'deleted' });
  }
}

/**
 * Discord only lets a bot delete the channel it is "in" last, and the original
 * code had a fragile "delete the log channel then hope DM works" step. Instead
 * the log channel is protected for the whole run and removed here, at the very
 * end, after the summary has been delivered.
 */
async function deleteProtectedChannel(runner) {
  const id = runner.protectedChannelId;
  if (!id || runner.dryRun) return { ok: false, skipped: true };

  const channel =
    runner.target.channels.cache.get(id) ??
    (await runner.target.channels.fetch(id).catch(() => null));

  if (!channel || typeof channel.delete !== 'function') return { ok: false, skipped: true };

  try {
    await withRetry(() => channel.delete('roxy-cloner-v2: wipe log channel'), { retries: 2 });
    runner.log.info('Removed the log channel from the target server.');
    return { ok: true };
  } catch (err) {
    runner.debug(`Could not delete log channel: ${describeError(err)}`);
    return { ok: false, error: err };
  }
}

module.exports = { deleteChannels, deleteRoles, deleteEmojis, deleteProtectedChannel };
