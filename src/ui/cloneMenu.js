'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { sleep } = require('../lib/time');
const { OPTIONS, emptySelection, selectedCount, hasDestructive } = require('./options');
const {
  buildMenuEmbed,
  buildConfirmEmbed,
  buildStartingEmbed,
  buildCancelledEmbed,
  buildTimeoutEmbed,
} = require('./embeds');
const { runClone } = require('../cloner');

const MENU_TIMEOUT_MS = 10 * 60 * 1000;
const START_COUNTDOWN_MS = 3000;

const ID = Object.freeze({
  toggle: (key) => `roxy:toggle:${key}`,
  start: 'roxy:start',
  confirm: 'roxy:confirm',
  back: 'roxy:back',
  cancel: 'roxy:cancel',
  prefix: 'roxy:toggle:',
});

function toggleButton(option, selection) {
  const selected = Boolean(selection[option.key]);
  const button = new ButtonBuilder()
    .setCustomId(ID.toggle(option.key))
    .setLabel(`${option.index}. ${option.label}`)
    .setStyle(selected ? ButtonStyle.Success : ButtonStyle.Secondary);
  if (selected) button.setEmoji('✅');
  return button;
}

function selectRows(selection) {
  const [first, second] = [OPTIONS.slice(0, 3), OPTIONS.slice(3, 6)];
  const start = new ButtonBuilder()
    .setCustomId(ID.start)
    .setLabel('Start cloning')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(selectedCount(selection) === 0);
  const cancel = new ButtonBuilder().setCustomId(ID.cancel).setLabel('Cancel').setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder().addComponents(first.map((option) => toggleButton(option, selection))),
    new ActionRowBuilder().addComponents(second.map((option) => toggleButton(option, selection))),
    new ActionRowBuilder().addComponents(start, cancel),
  ];
}

function confirmRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(ID.confirm).setLabel('Confirm wipe').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
      new ButtonBuilder().setCustomId(ID.back).setLabel('Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ID.cancel).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/**
 * Render the interactive clone menu and drive the run once confirmed.
 *
 * Everything is scoped to the operator who issued the command: no other user
 * can toggle options or start the clone.
 */
async function openCloneMenu({ message, sourceGuild, targetGuild, config, log }) {
  const operator = message.author;
  const selection = emptySelection();

  const embed = () =>
    buildMenuEmbed({
      sourceName: sourceGuild.name,
      targetName: targetGuild.name,
      selection,
      dryRun: config.dryRun,
    });

  const menuMessage = await message.channel.send({ embeds: [embed()], components: selectRows(selection) });

  const collector = menuMessage.createMessageComponentCollector({
    filter: (interaction) => interaction.user.id === operator.id,
    time: MENU_TIMEOUT_MS,
  });

  let started = false;

  async function begin(interaction) {
    started = true;
    collector.stop('started');

    await interaction.update({
      embeds: [
        buildStartingEmbed({
          sourceName: sourceGuild.name,
          targetName: targetGuild.name,
          selection,
          dryRun: config.dryRun,
        }),
      ],
      components: [],
    });

    await message.channel
      .send(config.dryRun ? 'Starting dry run in 3 seconds...' : 'Starting cloning process in 3 seconds...')
      .catch(() => null);
    await sleep(START_COUNTDOWN_MS);

    try {
      await runClone({
        source: sourceGuild,
        target: targetGuild,
        options: { ...selection },
        config,
        log,
        operator,
        logChannel: message.channel,
      });
    } catch (err) {
      log.error('Clone run failed:', err);
      await message.channel.send(`❌ The clone run failed: \`${err?.message ?? err}\``).catch(() => null);
    }
  }

  collector.on('collect', async (interaction) => {
    try {
      const { customId } = interaction;

      if (customId.startsWith(ID.prefix)) {
        const key = customId.slice(ID.prefix.length);
        if (key in selection) selection[key] = !selection[key];
        await interaction.update({ embeds: [embed()], components: selectRows(selection) });
        return;
      }

      if (customId === ID.start) {
        if (selectedCount(selection) === 0) {
          await interaction.reply({
            content: 'Pick at least one option first.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (hasDestructive(selection)) {
          await interaction.update({
            embeds: [
              buildConfirmEmbed({
                sourceName: sourceGuild.name,
                targetName: targetGuild.name,
                selection,
              }),
            ],
            components: confirmRows(),
          });
          return;
        }
        await begin(interaction);
        return;
      }

      if (customId === ID.confirm) {
        await begin(interaction);
        return;
      }

      if (customId === ID.back) {
        await interaction.update({ embeds: [embed()], components: selectRows(selection) });
        return;
      }

      if (customId === ID.cancel) {
        collector.stop('cancelled');
        await interaction.update({ embeds: [buildCancelledEmbed()], components: [] });
      }
    } catch (err) {
      log.error('Menu interaction failed:', err);
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (started || reason === 'started' || reason === 'cancelled') return;
    try {
      await menuMessage.edit({ embeds: [buildTimeoutEmbed()], components: [] });
    } catch {
      /* message may have been deleted */
    }
  });

  return menuMessage;
}

module.exports = { openCloneMenu, MENU_TIMEOUT_MS, ID };
