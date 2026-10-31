'use strict';

/**
 * Role planning.
 *
 * Creation order matters: Discord inserts a brand-new role at the BOTTOM of the
 * list (just above @everyone). So creating highest-position-first leaves the
 * final stack matching the source. (Verified against Discord's role docs:
 * "New roles are placed at the bottom of the hierarchy".)
 */

const MAX_ROLES = 250; // Discord's per-guild role cap
const MAX_ROLE_NAME = 100;

/** Roles a bot is able to recreate at all. */
function isClonableRole(role) {
  if (!role) return false;
  if (role.name === '@everyone') return false;
  // A guild's @everyone role shares its id with the guild itself.
  if (role.id != null && role.guild?.id != null && String(role.id) === String(role.guild.id)) return false;
  if (role.managed) return false; // bot/integration roles are owned by their app
  return true;
}

/** Highest position first — the order Discord needs for a faithful stack. */
function orderForCreation(roles) {
  return [...roles].filter(isClonableRole).sort((a, b) => b.position - a.position);
}

/**
 * Pick the roles to clone, respecting the target guild's remaining capacity.
 * @returns {{roles:Array, overflow:number, capacity:number}}
 */
function selectRolesToClone(roles, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : MAX_ROLES;
  const existingCount = Number.isFinite(options.existingCount) ? options.existingCount : 0;
  const capacity = Math.max(0, limit - existingCount);
  const ordered = orderForCreation(roles);
  return { roles: ordered.slice(0, capacity), overflow: Math.max(0, ordered.length - capacity), capacity };
}

function buildRolePayload(role, reason = 'roxy-cloner-v2') {
  const payload = {
    name: String(role.name ?? 'role').slice(0, MAX_ROLE_NAME),
    color: typeof role.color === 'number' ? role.color : 0,
    hoist: Boolean(role.hoist),
    mentionable: Boolean(role.mentionable),
    permissions: role.permissions?.bitfield != null ? BigInt(role.permissions.bitfield) : 0n,
    reason,
  };
  if (role.unicodeEmoji) payload.unicodeEmoji = role.unicodeEmoji;
  return payload;
}

module.exports = { MAX_ROLES, isClonableRole, orderForCreation, selectRolesToClone, buildRolePayload };
