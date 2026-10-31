'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preflight, getGuild } = require('../src/app');

const ADMIN_BIT = 8n;

function fakeBotMember({ admin = true, highestPosition = 10 } = {}) {
  return {
    permissions: { has: (flag) => (admin ? String(flag) === String(ADMIN_BIT) : false) },
    roles: { highest: { position: highestPosition } },
  };
}

function fakeGuild({ id, member = fakeBotMember(), topRolePosition = 5 } = {}) {
  return {
    id,
    members: {
      me: member,
      async fetch() {
        return member;
      },
    },
    roles: { cache: new Map([['r', { position: topRolePosition }]]) },
  };
}

function makeClients({ sourceGuild = fakeGuild({ id: 'SRC' }), targetGuild = fakeGuild({ id: 'DST' }) } = {}) {
  const make = (guild) => ({
    guilds: {
      cache: new Map(guild ? [[guild.id, guild]] : []),
      async fetch(id) {
        if (guild && guild.id === id) return guild;
        throw new Error('Unknown Guild');
      },
    },
  });
  return {
    userClient: make(sourceGuild),
    bot: { ...make(targetGuild), user: { id: 'bot-1' } },
  };
}

test('identical ids are rejected before any lookup', async () => {
  const { userClient, bot } = makeClients();
  const result = await preflight({ sourceId: 'SRC', targetId: 'SRC', bot, userClient });
  assert.equal(result.ok, false);
  assert.match(result.reason, /identical/);
});

test('a source the user account cannot see is reported clearly', async () => {
  const { userClient, bot } = makeClients({ sourceGuild: null });
  const result = await preflight({ sourceId: 'SRC', targetId: 'DST', bot, userClient });
  assert.equal(result.ok, false);
  assert.match(result.reason, /DC_TOKEN/);
});

test('a target the bot is not in is reported clearly', async () => {
  const { userClient, bot } = makeClients({ targetGuild: null });
  const result = await preflight({ sourceId: 'SRC', targetId: 'DST', bot, userClient });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not in the target server/);
});

test('missing Administrator is rejected', async () => {
  const targetGuild = fakeGuild({ id: 'DST', member: fakeBotMember({ admin: false }) });
  const { userClient, bot } = makeClients({ targetGuild });
  const result = await preflight({ sourceId: 'SRC', targetId: 'DST', bot, userClient });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Administrator/);
});

test('a bot role below the top role is rejected', async () => {
  const targetGuild = fakeGuild({ id: 'DST', member: fakeBotMember({ highestPosition: 2 }), topRolePosition: 9 });
  const { userClient, bot } = makeClients({ targetGuild });
  const result = await preflight({ sourceId: 'SRC', targetId: 'DST', bot, userClient });
  assert.equal(result.ok, false);
  assert.match(result.reason, /top of the role list/);
});

test('a healthy setup returns both guilds', async () => {
  const { userClient, bot } = makeClients();
  const result = await preflight({ sourceId: 'SRC', targetId: 'DST', bot, userClient });
  assert.equal(result.ok, true);
  assert.equal(result.sourceGuild.id, 'SRC');
  assert.equal(result.targetGuild.id, 'DST');
});

test('getGuild falls back to the API when the cache is cold', async () => {
  const guild = { id: 'G' };
  const client = { guilds: { cache: new Map(), fetch: async (id) => (id === 'G' ? guild : Promise.reject(new Error('nope'))) } };
  assert.equal(await getGuild(client, 'G'), guild);
  assert.equal(await getGuild(client, 'MISSING'), null);
});

test('getGuild prefers the cache', async () => {
  const guild = { id: 'G' };
  const client = {
    guilds: {
      cache: new Map([['G', guild]]),
      fetch: async () => {
        throw new Error('should not be called');
      },
    },
  };
  assert.equal(await getGuild(client, 'G'), guild);
});
