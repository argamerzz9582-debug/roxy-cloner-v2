'use strict';

/** Single source of truth for the six clone options and their metadata. */

const OPTIONS = Object.freeze([
  {
    index: 1,
    key: 'deleteChannels',
    label: 'Delete channels',
    destructive: true,
    description: 'Remove every channel in the target (the log channel is kept until the run ends)',
  },
  {
    index: 2,
    key: 'deleteRoles',
    label: 'Delete roles',
    destructive: true,
    description: 'Remove every editable role except @everyone',
  },
  {
    index: 3,
    key: 'deleteEmojis',
    label: 'Delete emojis',
    destructive: true,
    description: 'Remove every custom emoji in the target',
  },
  { index: 4, key: 'cloneChannels', label: 'Clone channels', destructive: false, description: 'Categories, text, voice, forum, media, stage and announcement channels' },
  { index: 5, key: 'cloneRoles', label: 'Clone roles', destructive: false, description: 'Names, colours, permissions and hoisting' },
  { index: 6, key: 'cloneEmojis', label: 'Clone emojis', destructive: false, description: 'Static and animated, within the target boost tier limits' },
]);

const KEYS = Object.freeze(OPTIONS.map((option) => option.key));

function emptySelection() {
  return KEYS.reduce((selection, key) => {
    selection[key] = false;
    return selection;
  }, {});
}

/** Accepts a partial object and fills in every key. */
function normalizeSelection(selection = {}) {
  const base = emptySelection();
  for (const key of KEYS) {
    if (key in selection) base[key] = Boolean(selection[key]);
  }
  return base;
}

function selectedOptions(selection) {
  return OPTIONS.filter((option) => Boolean(selection?.[option.key]));
}

function selectedCount(selection) {
  return selectedOptions(selection).length;
}

function hasDestructive(selection) {
  return selectedOptions(selection).some((option) => option.destructive);
}

function describeSelection(selection) {
  const chosen = selectedOptions(selection);
  if (chosen.length === 0) return 'Nothing selected';
  return chosen.map((option) => `${option.index}. ${option.label}`).join('\n');
}

module.exports = {
  OPTIONS,
  KEYS,
  emptySelection,
  normalizeSelection,
  selectedOptions,
  selectedCount,
  hasDestructive,
  describeSelection,
};
