'use strict';

const { isCloneable, isCategory, buildChannelPayload, compact, summariseChannelTypes } = require('../lib/channels');
const { buildChannelOverwrites, OVERWRITE_TYPE } = require('../lib/overwrites');

const REASON = 'roxy-cloner-v2: clone channels';

function sortByPosition(a, b) {
  return (a.position ?? 0) - (b.position ?? 0);
}

/** Pull the ids referenced by member-level overwrites (roles are remapped). */
function collectMemberOverwriteIds(channels) {
  const ids = new Set();
  for (const channel of channels) {
    const overwrites = channel.permissionOverwrites?.cache?.values?.() ?? [];
    for (const overwrite of overwrites) {
      if (overwrite.type === OVERWRITE_TYPE.MEMBER) ids.add(String(overwrite.id));
    }
  }
  return ids;
}

function overwritesFor(runner, channel, memberIds) {
  const source = channel.permissionOverwrites?.cache?.values?.() ?? [];
  return buildChannelOverwrites(source, { roleMapping: runner.roleMapping, memberIds });
}

/**
 * Recreate categories first (so children can be parented), then everything
 * else in position order. Creation order determines the final ordering, since
 * Discord appends new channels.
 */
async function cloneChannels(runner) {
  const { source, target } = runner;

  const all = [...(source.channels?.cache?.values() ?? [])].filter((channel) => isCloneable(channel.type));
  const categories = all.filter((channel) => isCategory(channel.type)).sort(sortByPosition);
  const others = all.filter((channel) => !isCategory(channel.type)).sort(sortByPosition);
  const counts = summariseChannelTypes(all);

  runner.info(
    `Cloning ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} and ${others.length} channel(s) ` +
      `(text ${counts.text}, voice ${counts.voice}, forum ${counts.forum}, media ${counts.media}, ` +
      `announcement ${counts.announcement}, stage ${counts.stage})...`,
  );

  const memberIds = await runner.resolveMemberIds(collectMemberOverwriteIds(all));
  const dropped = { roles: 0, members: 0 };

  const create = async (channel, parentId, label) => {
    const { overwrites, droppedRoles, droppedMembers } = overwritesFor(runner, channel, memberIds);
    dropped.roles += droppedRoles;
    dropped.members += droppedMembers;

    const payload = compact(
      buildChannelPayload(channel, {
        parentId,
        overwrites,
        maxBitrate: target.maximumBitrate,
      }),
    );
    if (!payload) {
      runner.warn(`Skipped ${label} — unsupported channel type ${channel.type}.`);
      return null;
    }

    return runner.mutate(label, 'channels', async () => {
      const created = await target.channels.create(payload);
      if (isCategory(channel.type)) runner.categoryMapping.set(channel.id, created.id);
      return created;
    });
  };

  for (const category of categories) {
    if (runner.phaseStopped) break;
    await create(category, null, `Created category ${category.name}`);
  }

  for (const channel of others) {
    if (runner.phaseStopped) break;
    const parentId = channel.parentId ? runner.categoryMapping.get(channel.parentId) ?? null : null;
    const label = `Created ${channelKindLabel(channel.type)} ${channel.name}`;
    await create(channel, parentId, label);
  }

  const totalDropped = dropped.roles + dropped.members;
  if (totalDropped > 0) {
    runner.warn(
      `Dropped ${dropped.roles} role and ${dropped.members} member permission overwrite(s) ` +
        'that had no equivalent in the target server.',
    );
  }

  if (runner.dryRun) {
    runner.info('Dry run: permission overwrites cannot be verified without creating the roles first.');
  }
}

function channelKindLabel(type) {
  switch (type) {
    case 0:
      return 'text channel #';
    case 2:
      return 'voice channel';
    case 5:
      return 'announcement channel #';
    case 13:
      return 'stage channel';
    case 15:
      return 'forum channel';
    case 16:
      return 'media channel';
    default:
      return 'channel';
  }
}

module.exports = { cloneChannels, collectMemberOverwriteIds };
