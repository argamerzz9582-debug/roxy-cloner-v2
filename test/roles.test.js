'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { orderForCreation, selectRolesToClone, buildRolePayload, isClonableRole, MAX_ROLES } = require('../src/lib/roles');

test('everyone, managed and missing roles are not clonable', () => {
  assert.equal(isClonableRole({ name: '@everyone', position: 0 }), false);
  assert.equal(isClonableRole({ id: 'guild-id', guild: { id: 'guild-id' }, name: 'Server', position: 0 }), false);
  assert.equal(isClonableRole({ name: 'Mod', position: 3, managed: false }), true);
  assert.equal(isClonableRole({ name: 'Bot', position: 3, managed: true }), false);
  assert.equal(isClonableRole(null), false);
});

test('roles are ordered highest-position-first', () => {
  // Discord inserts new roles at the bottom, so creating the highest one first
  // makes the final stack match the source.
  const roles = [
    { id: 'a', name: 'low', position: 1 },
    { id: 'b', name: 'high', position: 9 },
    { id: 'c', name: 'mid', position: 4 },
  ];
  assert.deepEqual(
    orderForCreation(roles).map((role) => role.name),
    ['high', 'mid', 'low'],
  );
});

test('capacity is limited by the target role count', () => {
  const roles = Array.from({ length: 5 }, (unused, index) => ({ id: `r${index}`, name: `role${index}`, position: index + 1 }));
  const { roles: selected, overflow, capacity } = selectRolesToClone(roles, { limit: 10, existingCount: 8 });
  assert.equal(capacity, 2);
  assert.equal(selected.length, 2);
  assert.equal(overflow, 3);
});

test('a full target yields nothing to clone', () => {
  const { roles, capacity } = selectRolesToClone([{ id: 'r', name: 'x', position: 1 }], { existingCount: MAX_ROLES });
  assert.equal(capacity, 0);
  assert.deepEqual(roles, []);
});

test('role payload carries colour, permissions and flags', () => {
  const payload = buildRolePayload({
    name: 'Moderator',
    color: 0xff0000,
    hoist: true,
    mentionable: true,
    permissions: { bitfield: 8n },
  });
  assert.equal(payload.name, 'Moderator');
  assert.equal(payload.color, 0xff0000);
  assert.equal(payload.hoist, true);
  assert.equal(payload.mentionable, true);
  assert.equal(payload.permissions, 8n);
});

test('long role names are truncated to Discord\'s limit', () => {
  const payload = buildRolePayload({ name: 'x'.repeat(150) });
  assert.equal(payload.name.length, 100);
});

test('payload defaults are safe when fields are missing', () => {
  const payload = buildRolePayload({});
  assert.equal(payload.color, 0);
  assert.equal(payload.permissions, 0n);
  assert.equal(payload.hoist, false);
});
