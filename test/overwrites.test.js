'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildChannelOverwrites, toBits } = require('../src/lib/overwrites');

const roleOverwrite = (id, allow = 1024n) => ({ id, type: 0, allow, deny: 0n });
const memberOverwrite = (id) => ({ id, type: 1, allow: 2048n, deny: 0n });

test('role overwrites are remapped through the role mapping', () => {
  const roleMapping = new Map([['src-role', 'dst-role']]);
  const { overwrites, droppedRoles } = buildChannelOverwrites([roleOverwrite('src-role')], { roleMapping });
  assert.equal(droppedRoles, 0);
  assert.deepEqual(overwrites, [{ id: 'dst-role', type: 0, allow: 1024n, deny: 0n }]);
});

test('roles that were not cloned are dropped and counted', () => {
  const { overwrites, droppedRoles } = buildChannelOverwrites([roleOverwrite('ghost-role')], {
    roleMapping: new Map(),
  });
  assert.deepEqual(overwrites, []);
  assert.equal(droppedRoles, 1);
});

test('member overwrites are kept only for members present in the target', () => {
  const kept = buildChannelOverwrites([memberOverwrite('user-1')], { memberIds: new Set(['user-1']) });
  assert.equal(kept.overwrites.length, 1);
  assert.equal(kept.overwrites[0].type, 1);
  assert.equal(kept.overwrites[0].allow, 2048n);

  const dropped = buildChannelOverwrites([memberOverwrite('user-2')], { memberIds: new Set(['user-1']) });
  assert.deepEqual(dropped.overwrites, []);
  assert.equal(dropped.droppedMembers, 1);
});

test('member overwrites are preserved when no member filter is provided', () => {
  const result = buildChannelOverwrites([memberOverwrite('user-9')], { memberIds: null });
  assert.equal(result.overwrites.length, 1);
});

test('@everyone mapping flows through like any other role', () => {
  const roleMapping = new Map([['src-everyone', 'dst-everyone']]);
  const { overwrites } = buildChannelOverwrites([{ id: 'src-everyone', type: 0, allow: 0n, deny: 1n }], { roleMapping });
  assert.deepEqual(overwrites, [{ id: 'dst-everyone', type: 0, allow: 0n, deny: 1n }]);
});

test('bitfields are normalised to BigInt from every shape', () => {
  assert.equal(toBits(undefined), 0n);
  assert.equal(toBits(8), 8n);
  assert.equal(toBits('16'), 16n);
  assert.equal(toBits({ bitfield: 32n }), 32n);
  assert.equal(toBits('SendMessages'), 0n);
});

test('a plain object role map works too', () => {
  const { overwrites } = buildChannelOverwrites([roleOverwrite('a')], { roleMapping: { a: 'b' } });
  assert.equal(overwrites[0].id, 'b');
});

test('the total count reflects every overwrite inspected', () => {
  const { total } = buildChannelOverwrites([roleOverwrite('x'), memberOverwrite('y')], { roleMapping: new Map() });
  assert.equal(total, 2);
});
