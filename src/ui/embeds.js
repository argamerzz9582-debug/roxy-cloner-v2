'use strict';

const { EmbedBuilder } = require('discord.js');
const { formatDuration } = require('../lib/time');
const { OPTIONS, selectedCount, hasDestructive, describeSelection } = require('./options');

const PURPLE = 0x800080;
const RED = 0xed4245;
const GREEN = 0x57f287;
const ORANGE = 0xfaa61a;

function optionLines(selection, { showState = true } = {}) {
  return OPTIONS.map((option) => {
    const mark = showState ? (selection?.[option.key] ? '`[x]`' : '`[ ]`') : '';
    const warning = option.destructive ? ' ⚠️' : '';
    return `${mark} **${option.index}.** ${option.label}${warning}\n> ${option.description}`.trim();
  }).join('\n');
}

function buildMenuEmbed({ sourceName, targetName, selection, dryRun }) {
  const chosen = selectedCount(selection);
  const embed = new EmbedBuilder()
    .setTitle('Roxy Cloner V2 — Setup')
    .setColor(dryRun ? ORANGE : PURPLE)
    .setDescription(
      `Cloning from **${sourceName}** → **${targetName}**\n\n` +
        `${optionLines(selection)}\n\n` +
        '⚠️ = destructive. Options 1-3 wipe the target server and cannot be undone.',
    )
    .addFields({ name: 'Selected', value: `${chosen}/6`, inline: true })
    .setFooter({ text: dryRun ? 'DRY RUN — nothing will actually change' : 'Toggle with the buttons, then press Start' });

  if (hasDestructive(selection)) {
    embed.addFields({ name: 'Heads up', value: 'Destructive options are on — you will be asked to confirm.', inline: true });
  }
  return embed;
}

function buildConfirmEmbed({ sourceName, targetName, selection }) {
  return new EmbedBuilder()
    .setTitle('⚠️ Confirm destructive actions')
    .setColor(RED)
    .setDescription(
      `This will **permanently delete** data in **${targetName}**:\n\n${describeSelection(selection)}\n\n` +
        `Source: **${sourceName}**\n\nThe log channel stays until the run ends. Everything else selected above is unrecoverable.`,
    )
    .setFooter({ text: 'Press Confirm to start, or Back to change the selection' });
}

function buildStartingEmbed({ sourceName, targetName, selection, dryRun }) {
  return new EmbedBuilder()
    .setTitle(dryRun ? 'Dry run starting' : 'Cloning started')
    .setColor(dryRun ? ORANGE : GREEN)
    .setDescription(`**${sourceName}** → **${targetName}**\n\n${describeSelection(selection)}`)
    .setFooter({ text: 'Progress is posted below; a summary is DM\'d when it finishes' });
}

function buildCancelledEmbed() {
  return new EmbedBuilder().setTitle('Cancelled').setColor(ORANGE).setDescription('Nothing was changed.');
}

function buildTimeoutEmbed() {
  return new EmbedBuilder()
    .setColor(ORANGE)
    .setDescription('Cloning menu timed out. Nothing was changed — run `!clone` again if you still want to.');
}

function buildHelpEmbed(prefix = '!') {
  return new EmbedBuilder()
    .setTitle('Roxy Cloner V2 — Help')
    .setColor(PURPLE)
    .setDescription(
      [
        `**${prefix}clone <source_id> <target_id>**`,
        '> Opens the clone menu with six toggles. Both ids are server (guild) ids.',
        '',
        `**${prefix}help**`,
        '> Shows this message.',
        '',
        '**Requirements**',
        '> • The user account (`DC_TOKEN`) must be a member of the source server.',
        '> • The bot (`BOT_TOKEN`) must be in the target server with **Administrator**.',
        '> • The bot\'s role must sit at the very top of the target role list.',
      ].join('\n'),
    )
    .setFooter({ text: 'Toggles: 1-3 delete, 4-6 clone' });
}

function buildSummaryEmbed(summary) {
  const { sourceName, targetName, report, elapsedMs, aborted, abortReason, dryRun } = summary;
  const categories = report.categories();
  const totals = report.totals();

  const embed = new EmbedBuilder()
    .setTitle(dryRun ? 'Dry run complete' : aborted ? 'Clone stopped early' : 'Cloning complete')
    .setColor(aborted ? RED : dryRun ? ORANGE : GREEN)
    .setDescription(`**${sourceName}** → **${targetName}**`)
    .setFooter({ text: `Finished in ${formatDuration(elapsedMs)}` });

  if (categories.length > 0) {
    for (const { label, counts } of categories) {
      const parts = [];
      if (counts.created) parts.push(`created ${counts.created}`);
      if (counts.deleted) parts.push(`deleted ${counts.deleted}`);
      if (counts.planned) parts.push(`planned ${counts.planned}`);
      if (counts.skipped) parts.push(`skipped ${counts.skipped}`);
      if (counts.failed) parts.push(`failed ${counts.failed}`);
      embed.addFields({ name: label, value: parts.join(' · ') || 'nothing to do', inline: true });
    }
  }

  const failures = report.failures();
  if (failures.length > 0) {
    const text = failures
      .slice(0, 8)
      .map((failure) => `• \`${failure.category}\` ${failure.label}${failure.error ? ` — ${failure.error.slice(0, 120)}` : ''}`)
      .join('\n');
    embed.addFields({ name: `First ${Math.min(failures.length, 8)} failure(s)`, value: text.slice(0, 1020) });
  }

  if (aborted && abortReason) {
    embed.addFields({ name: 'Stopped', value: abortReason.slice(0, 1020) });
  }

  if (totals.created + totals.deleted + totals.planned === 0 && failures.length === 0) {
    embed.addFields({ name: 'Note', value: 'No operations ran — check the selection and permissions.' });
  }

  return embed;
}

/** Plain-text twin of the summary embed, used for the DM. */
function summaryToText(summary) {
  const { sourceName, targetName, report, elapsedMs, aborted, abortReason, dryRun } = summary;
  const lines = [
    `${dryRun ? '🧪 Dry run' : aborted ? '🟠 Clone stopped early' : '✅ Cloning complete'} — ${sourceName} → ${targetName}`,
    `Duration: ${formatDuration(elapsedMs)}`,
    '',
    ...report.toLines(),
  ];
  if (aborted && abortReason) lines.push('', `Stopped: ${abortReason}`);
  const text = lines.join('\n');
  return text.length > 1900 ? `${text.slice(0, 1890)}…` : text;
}

module.exports = {
  buildMenuEmbed,
  buildConfirmEmbed,
  buildStartingEmbed,
  buildCancelledEmbed,
  buildTimeoutEmbed,
  buildHelpEmbed,
  buildSummaryEmbed,
  summaryToText,
  optionLines,
  PURPLE,
  RED,
  GREEN,
  ORANGE,
};
