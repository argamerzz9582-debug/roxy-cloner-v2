'use strict';

const { selectRolesToClone, buildRolePayload, MAX_ROLES } = require('../lib/roles');

const REASON = 'roxy-cloner-v2: clone roles';

/**
 * Recreate the source role stack in the target guild.
 *
 * @everyone is mapped to the target's @everyone so channel overwrites that
 * reference it survive. Every created role is recorded in
 * `runner.roleMapping` for the channel phase.
 */
async function cloneRoles(runner) {
  const { source, target } = runner;

  const sourceEveryone = source.roles?.everyone;
  const targetEveryone = target.roles?.everyone;
  if (sourceEveryone && targetEveryone) {
    runner.roleMapping.set(sourceEveryone.id, targetEveryone.id);
  }

  const existingCount = target.roles?.cache?.size ?? 0;
  const { roles, overflow, capacity } = selectRolesToClone([...(source.roles?.cache?.values() ?? [])], {
    limit: MAX_ROLES,
    existingCount,
  });

  if (capacity === 0) {
    runner.warn(`Target already holds ${existingCount} roles (Discord's limit is ${MAX_ROLES}). Skipping role cloning.`);
    return;
  }
  if (overflow > 0) {
    runner.warn(`Source has ${roles.length + overflow} clonable roles but only ${capacity} slot(s) are free — cloning ${roles.length}.`);
  }

  runner.info(`Cloning ${roles.length} role(s)...`);

  for (const role of roles) {
    if (runner.phaseStopped) return;
    // Highest position first: Discord inserts new roles at the bottom, so this
    // ends up matching the source stack.
    const result = await runner.mutate(`Created role ${role.name}`, 'roles', () =>
      target.roles.create(buildRolePayload(role, REASON)),
    );
    if (result.ok) runner.roleMapping.set(role.id, result.value.id);
  }
}

module.exports = { cloneRoles };
