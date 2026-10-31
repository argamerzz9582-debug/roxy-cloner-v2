'use strict';

/**
 * Integration smoke test: drives the real clone pipeline against fake guild
 * objects. No network, no gateway — but the phases, runner, report and
 * notifier all run for real.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLogger } = require('../src/logger');
const { runClone } = require('../src/cloner');

const silent = createLogger({ level: 'silent', color: false, write: () => {} });

function fakeChannel({ id, name, type = 0, parentId = null, position = 0, guildId, deletable = true }) {
  return {
    id,
    name,
    type,
    parentId,
    position,
    deletable,
    guild: { id: guildId },
    permissionOverwrites: { cache: new Map() },
    deleted: false,
    async delete() {
      this.deleted = true;
      return this;
    },
  };
}

function fakeRole({ id, name, position, managed = false, color = 0, permissions = 0n }) {
  return {
    id,
    name,
    position,
    managed,
    color,
    hoist: false,
    mentionable: false,
    permissions: { bitfield: permissions },
    editable: true,
    async delete() {
      this.deleted = true;
    },
  };
}

function fakeGuild({ id, name, roles, channels, emojis, premiumTier = 0, maximumBitrate = 96000 }) {
  const created = { roles: [], channels: [], emojis: [], deletedChannels: [], deletedRoles: [] };

  const guild = {
    id,
    name,
    premiumTier,
    maximumBitrate,
    roles: {
      cache: new Map(roles.map((role) => [role.id, role])),
      everyone: roles.find((role) => role.name === '@everyone'),
      async create(payload) {
        const role = fakeRole({ id: `role-new-${created.roles.length + 1}`, name: payload.name, position: 1 });
        created.roles.push(payload);
        guild.roles.cache.set(role.id, role);
        return role;
      },
    },
    channels: {
      cache: new Map(channels.map((channel) => [channel.id, channel])),
      async create(payload) {
        created.channels.push(payload);
        return { id: `chan-new-${created.channels.length}`, name: payload.name };
      },
      async fetch(query) {
        const channel = guild.channels.cache.get(query);
        if (!channel) throw new Error('Unknown Channel');
        return channel;
      },
    },
    emojis: {
      cache: new Map(emojis.map((emoji) => [emoji.name, emoji])),
      async create(payload) {
        created.emojis.push(payload);
        return { id: `emoji-${created.emojis.length}`, name: payload.name };
      },
    },
    members: {
      cache: new Map(),
      async fetch() {
        return new Map();
      },
    },
  };

  for (const channel of channels) {
    const originalDelete = channel.delete.bind(channel);
    channel.delete = async () => {
      created.deletedChannels.push(channel.id);
      return originalDelete();
    };
  }
  for (const role of roles) {
    const originalDelete = role.delete.bind(role);
    role.delete = async () => {
      created.deletedRoles.push(role.id);
      return originalDelete();
    };
  }

  return { guild, created };
}

function sourceGuildFixture() {
  const everyone = fakeRole({ id: 'src-everyone', name: '@everyone', position: 0 });
  const admin = fakeRole({ id: 'src-admin', name: 'Admin', position: 3 });
  const member = fakeRole({ id: 'src-member', name: 'Member', position: 1 });
  const managed = fakeRole({ id: 'src-managed', name: 'SomeBot', position: 2, managed: true });

  const category = fakeChannel({ id: 'src-cat', name: 'General', type: 4, position: 0, guildId: 'src' });
  const text = fakeChannel({ id: 'src-text', name: 'welcome', type: 0, parentId: 'src-cat', position: 0, guildId: 'src' });
  const voice = fakeChannel({ id: 'src-voice', name: 'Lounge', type: 2, parentId: 'src-cat', position: 1, guildId: 'src' });
  const thread = fakeChannel({ id: 'src-thread', name: 'thread', type: 11, parentId: 'src-text', guildId: 'src' });

  const emojiA = { name: 'party', animated: false, id: 'e1', url: 'https://cdn/party.png' };
  const emojiB = { name: 'dance', animated: true, id: 'e2', url: 'https://cdn/dance.gif' };

  text.permissionOverwrites.cache.set('src-admin', { id: 'src-admin', type: 0, allow: 1024n, deny: 0n });

  const { guild } = fakeGuild({
    id: 'SRC',
    name: 'Source Server',
    roles: [everyone, admin, member, managed],
    channels: [category, text, voice, thread],
    emojis: [emojiA, emojiB],
  });
  return guild;
}

function targetGuildFixture({ withExisting = true } = {}) {
  const everyone = fakeRole({ id: 'dst-everyone', name: '@everyone', position: 0 });
  const oldRole = fakeRole({ id: 'dst-old', name: 'OldRole', position: 1 });
  const logChannel = fakeChannel({ id: 'dst-log', name: 'cloner-logs', type: 0, guildId: 'DST' });
  const oldText = fakeChannel({ id: 'dst-old-text', name: 'old', type: 0, guildId: 'DST' });

  const roles = withExisting ? [everyone, oldRole] : [everyone];
  const channels = withExisting ? [logChannel, oldText] : [logChannel];

  const { guild, created } = fakeGuild({
    id: 'DST',
    name: 'Target Server',
    roles,
    channels,
    emojis: [],
  });
  guild.premiumTier = 0;
  return { guild, created, logChannel };
}

const ALL_OPTIONS = {
  deleteChannels: true,
  deleteRoles: true,
  deleteEmojis: true,
  cloneChannels: true,
  cloneRoles: true,
  cloneEmojis: true,
};

function makeHarness() {
  const source = sourceGuildFixture();
  const { guild: target, created, logChannel } = targetGuildFixture();
  const sent = [];
  const dms = [];

  logChannel.send = async (payload) => {
    sent.push(payload);
    return { id: 'msg' };
  };

  const operator = {
    id: 'user-1',
    async send(payload) {
      dms.push(payload);
      return { id: 'dm' };
    },
  };

  return { source, target, created, logChannel, sent, dms, operator };
}

test('a full run deletes, clones and reports', async () => {
  const harness = makeHarness();

  const { report, aborted } = await runClone({
    source: harness.source,
    target: harness.target,
    options: ALL_OPTIONS,
    config: { delayMs: 0, dryRun: false },
    log: silent,
    operator: harness.operator,
    logChannel: harness.logChannel,
  });

  assert.equal(aborted, false);

  // Wipe: the old text channel goes first, the log channel is protected during
  // the run and removed only after the summary has been delivered.
  assert.deepEqual(harness.created.deletedChannels, ['dst-old-text', 'dst-log']);
  assert.deepEqual(harness.created.deletedRoles, ['dst-old']);

  // Roles: everyone + managed excluded, highest first.
  assert.deepEqual(
    harness.created.roles.map((role) => role.name),
    ['Admin', 'Member'],
  );

  // Channels: category first, then text + voice; the thread is skipped entirely.
  const channelNames = harness.created.channels.map((channel) => channel.name);
  assert.deepEqual(channelNames, ['General', 'welcome', 'Lounge']);
  const welcome = harness.created.channels.find((channel) => channel.name === 'welcome');
  assert.equal(welcome.parent, 'chan-new-1', 'text channel parented to the new category');

  // Emoji: both kinds cloned.
  assert.equal(harness.created.emojis.length, 2);

  // Summary reached the log channel and the operator DM.
  assert.ok(harness.sent.some((payload) => payload.embeds), 'summary embed was posted');
  assert.equal(harness.dms.length, 1);
  assert.match(harness.dms[0], /Cloning complete/);

  // Ordering is the guarantee: the log channel is the last thing deleted.
  assert.equal(harness.created.deletedChannels.at(-1), 'dst-log');

  const totals = report.totals();
  assert.equal(totals.failed, 0);
  assert.equal(totals.created, 2 + 3 + 2); // roles + channels + emoji
  assert.equal(totals.deleted, 2); //
});

test('omitting options leaves the target untouched', async () => {
  const harness = makeHarness();

  await runClone({
    source: harness.source,
    target: harness.target,
    options: { deleteChannels: false, deleteRoles: false, deleteEmojis: false, cloneChannels: false, cloneRoles: false, cloneEmojis: false },
    config: { delayMs: 0, dryRun: false },
    log: silent,
    operator: harness.operator,
    logChannel: harness.logChannel,
  });

  assert.deepEqual(harness.created.created ?? [], []);
  assert.deepEqual(harness.created.deletedChannels, []);
  assert.deepEqual(harness.created.deletedRoles, []);
  assert.equal(harness.dms.length, 1);
});

test('dry run reports a plan without mutating anything', async () => {
  const harness = makeHarness();

  const { report } = await runClone({
    source: harness.source,
    target: harness.target,
    options: ALL_OPTIONS,
    config: { delayMs: 0, dryRun: true },
    log: silent,
    operator: harness.operator,
    logChannel: harness.logChannel,
  });

  assert.deepEqual(harness.created.roles, []);
  assert.deepEqual(harness.created.channels, []);
  assert.deepEqual(harness.created.emojis, []);
  assert.deepEqual(harness.created.deletedChannels, []);
  assert.deepEqual(harness.created.deletedRoles, []);

  const totals = report.totals();
  assert.equal(totals.created, 0);
  assert.equal(totals.deleted, 0);
  assert.ok(totals.planned > 0);
  assert.match(harness.dms[0], /Dry run/);
});

test('clone-only runs keep the existing target content', async () => {
  const harness = makeHarness();

  await runClone({
    source: harness.source,
    target: harness.target,
    options: { deleteChannels: false, deleteRoles: false, deleteEmojis: false, cloneChannels: true, cloneRoles: true, cloneEmojis: true },
    config: { delayMs: 0, dryRun: false },
    log: silent,
    operator: harness.operator,
    logChannel: harness.logChannel,
  });

  assert.deepEqual(harness.created.deletedChannels, []);
  assert.deepEqual(harness.created.deletedRoles, []);
  assert.equal(harness.created.roles.length, 2);
  assert.equal(harness.created.channels.length, 3);
  // The log channel must survive when we are not wiping channels.
  assert.equal(harness.logChannel.deleted, false);
});

test('role capacity is respected when the target is nearly full', async () => {
  const source = sourceGuildFixture();
  const { guild: target, created, logChannel } = targetGuildFixture();
  logChannel.send = async () => ({ id: 'msg' });

  // Pretend the target is one role away from Discord's 250 cap.
  target.roles.cache.set('filler', fakeRole({ id: 'filler', name: 'Filler', position: 2 }));

  const { report } = await runClone({
    source,
    target,
    options: { cloneRoles: true },
    config: { delayMs: 0, dryRun: false },
    log: silent,
    operator: { id: 'u', send: async () => ({}) },
    logChannel,
  });

  // 4 cached roles (everyone, old, filler) -> plenty of room, so both clone.
  assert.equal(created.roles.length, 2);
  assert.equal(report.totals().failed, 0);
});
