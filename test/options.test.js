'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OPTIONS,
  KEYS,
  emptySelection,
  normalizeSelection,
  selectedOptions,
  selectedCount,
  hasDestructive,
  describeSelection,
} = require('../src/ui/options');

test('there are six options, three of them destructive', () => {
  assert.equal(OPTIONS.length, 6);
  assert.equal(OPTIONS.filter((option) => option.destructive).length, 3);
  assert.deepEqual(
    OPTIONS.map((option) => option.index),
    [1, 2, 3, 4, 5, 6],
  );
});

test('an empty selection selects nothing', () => {
  const selection = emptySelection();
  assert.deepEqual(Object.keys(selection), [...KEYS]);
  assert.equal(selectedCount(selection), 0);
  assert.equal(hasDestructive(selection), false);
});

test('normalizeSelection fills missing keys and coerces to boolean', () => {
  const selection = normalizeSelection({ cloneRoles: 1 });
  assert.equal(selection.cloneRoles, true);
  assert.equal(selection.deleteRoles, false);
  assert.equal(selectedCount(selection), 1);
});

test('destructive detection only fires for options 1-3', () => {
  assert.equal(hasDestructive(normalizeSelection({ cloneChannels: true, cloneRoles: true })), false);
  assert.equal(hasDestructive(normalizeSelection({ deleteEmojis: true })), true);
});

test('disabled options are reported in the plan', () => {
  const selection = normalizeSelection({ deleteChannels: true, cloneChannels: true });
  assert.deepEqual(
    selectedOptions(selection).map((option) => option.index),
    [1, 4],
  );
  assert.match(describeSelection(selection), /1\. Delete channels/);
  assert.match(describeSelection(selection), /4\. Clone channels/);
});

test('describeSelection handles an empty plan', () => {
  assert.equal(describeSelection(emptySelection()), 'Nothing selected');
});
