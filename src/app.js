'use strict';

const { Client: BotClient, Events, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { Client: UserClient } = require('discord.js-selfbot-v13');

const { SNOWFLAKE } = require('./lib/config');
const { buildHelpEmbed } = require('./ui/embeds');
const { openCloneMenu } = require('./ui/cloneMenu');

const PREFIX = '!';
// discord.js 14.22+ renamed `ready` to `clientReady`; support both.
const READY_EVENT = Events.ClientReady ?? 'ready';

function createClients(log) {
  const bot = new BotClient({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  bot.on('error', (err) => log.error('Bot client error:', err.message));
  bot.once(READY_EVENT, () => log.info(`Bot ready as ${bot.user.tag} (${bot.guilds.cache.size} guild(s)).`));

  const userClient = new UserClient({ checkUpdate: false, patchVoice: false });
  userClient.on('error', (err) => log.error('User client error:', err.message));
  userClient.once('ready', () =>
    log.info(`User client ready as ${userClient.user.tag} (${userClient.guilds.cache.size} guild(s)).`),
  );

  return { bot, userClient };
}

/** Look a guild up in cache first, then over the API. */
async function getGuild(client, id) {
  const cached = client.guilds.cache.get(id);
  if (cached) return cached;
  try {
    return await client.guilds.fetch(id);
  } catch {
    return null;
  }
}

/**
 * Validate a `!clone` request before touching anything.
 * @returns {Promise<{ok:true, sourceGuild:object, targetGuild:object}|{ok:false, reason:string}>}
 */
async function preflight({ sourceId, targetId, bot, userClient }) {
  if (sourceId === targetId) {
    return { ok: false, reason: 'Source and target server ids are identical.' };
  }

  const sourceGuild = await getGuild(userClient, sourceId);
  if (!sourceGuild) {
    return {
      ok: false,
      reason: 'The user account cannot access the source server. Make sure `DC_TOKEN` is a member of it.',
    };
  }

  const targetGuild = await getGuild(bot, targetId);
  if (!targetGuild) {
    return { ok: false, reason: 'The bot is not in the target server. Invite it first.' };
  }

  let botMember = targetGuild.members?.me;
  if (!botMember) {
    botMember = await targetGuild.members.fetch(bot.user.id).catch(() => null);
  }
  if (!botMember) {
    return { ok: false, reason: 'Could not resolve the bot\'s member object in the target server.' };
  }

  if (!botMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return { ok: false, reason: 'The bot needs **Administrator** in the target server (its role permissions).' };
  }

  const highestPosition = [...targetGuild.roles.cache.values()].reduce(
    (max, role) => Math.max(max, role.position),
    0,
  );
  if (botMember.roles.highest.position < highestPosition) {
    return {
      ok: false,
      reason:
        'The bot\'s role is not at the top of the role list. Server Settings → Roles → drag the bot\'s role above every other role.',
    };
  }

  return { ok: true, sourceGuild, targetGuild };
}

function usageEmbed() {
  return buildHelpEmbed(PREFIX);
}

/**
 * Wire commands to both clients.
 *
 * The bot client normally receives commands; the user client is a fallback so
 * the operator can also run `!clone` in servers the bot is not in. Message ids
 * are deduplicated so a message seen by both clients is handled once.
 */
function registerHandlers({ bot, userClient, config, log }) {
  const seen = new Set();

  const onMessage = async (message) => {
    try {
      const content = message?.content;
      if (!content || !content.startsWith(PREFIX)) return;
      if (!message.author?.id) return;

      // Allowlist is the only gate: bots are allowed if their id is listed.
      if (!config.allowedIds.includes(message.author.id)) return;

      if (seen.has(message.id)) return;
      seen.add(message.id);
      if (seen.size > 1000) seen.clear();

      const [rawCommand, ...args] = content.slice(PREFIX.length).trim().split(/\s+/);
      const command = String(rawCommand || '').toLowerCase();

      if (command === 'help' || command === 'roxy') {
        await message.reply({ embeds: [usageEmbed()] }).catch(() => null);
        return;
      }

      if (command !== 'clone') return;

      const [sourceId, targetId] = args;
      if (!sourceId || !targetId) {
        await message.reply(`Usage: \`${PREFIX}clone <source_server_id> <target_server_id>\``).catch(() => null);
        return;
      }
      if (!SNOWFLAKE.test(sourceId) || !SNOWFLAKE.test(targetId)) {
        await message.reply('Both arguments must be numeric server ids (enable Developer Mode → right-click a server → Copy Server ID).').catch(() => null);
        return;
      }
      if (args.length > 2) {
        await message.reply('Too many arguments. Usage: `!clone <source_id> <target_id>`').catch(() => null);
        return;
      }

      log.info(`Clone requested by ${message.author.tag}: ${sourceId} -> ${targetId}`);

      const check = await preflight({ sourceId, targetId, bot, userClient });
      if (!check.ok) {
        await message.reply({ embeds: [{ color: 0xed4245, description: `⚠️ ${check.reason}` }] }).catch(() => null);
        return;
      }

      await openCloneMenu({
        message,
        sourceGuild: check.sourceGuild,
        targetGuild: check.targetGuild,
        config,
        log,
      });
    } catch (err) {
      log.error('Failed to handle message:', err);
    }
  };

  bot.on('messageCreate', onMessage);
  // Fallback for servers the bot is not in; selfbot only sees messages it can read.
  userClient.on('messageCreate', onMessage);
}

function createApp({ config, log }) {
  const { bot, userClient } = createClients(log);
  registerHandlers({ bot, userClient, config, log });

  return {
    bot,
    userClient,

    async start() {
      try {
        await bot.login(config.botToken);
      } catch (err) {
        throw new Error(`Bot login failed — check BOT_TOKEN. (${err?.message ?? err})`);
      }
      try {
        await userClient.login(config.userToken);
      } catch (err) {
        throw new Error(`User login failed — check DC_TOKEN. (${err?.message ?? err})`);
      }
      if (config.dryRun) log.warn('DRY_RUN is enabled: clones will only be simulated.');
    },

    async shutdown() {
      log.info('Shutting down...');
      await Promise.allSettled([
        bot.destroy(),
        typeof userClient.destroy === 'function' ? userClient.destroy() : Promise.resolve(),
      ]);
    },
  };
}

module.exports = { createApp, preflight, registerHandlers, createClients, getGuild, PREFIX, READY_EVENT };
