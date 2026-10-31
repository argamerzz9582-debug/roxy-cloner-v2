'use strict';

/**
 * Permission-overwrite translation.
 *
 * Discord overwrites point at role/member ids. After cloning, every id is
 * different, so an overwrite is only meaningful when we can remap it:
 *   - roles   -> via the source->target role map built during role cloning
 *   - members -> only when that human is actually in the target guild
 * Everything else is dropped (and counted) instead of silently vanishing.
 */

const OVERWRITE_TYPE = Object.freeze({ ROLE: 0, MEMBER: 1 });

function toBits(value) {
  if (value == null) return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'object' && value.bitfield != null) return BigInt(value.bitfield);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  return 0n;
}

function normalizeType(type) {
  if (type === OVERWRITE_TYPE.MEMBER || type === 'member' || type === '1') return OVERWRITE_TYPE.MEMBER;
  return OVERWRITE_TYPE.ROLE;
}

/**
 * @param {Iterable<{id:string|number, type:number|string, allow:any, deny:any}>} overwrites
 * @param {{roleMapping?: Map<string,string>|Record<string,string>, memberIds?: Set<string>|null}} options
 *   `memberIds` = ids present in the target guild; pass `null` to keep every member overwrite.
 * @returns {{overwrites: Array<{id:string,type:number,allow:bigint,deny:bigint}>, droppedRoles:number, droppedMembers:number, total:number}}
 */
function buildChannelOverwrites(overwrites, options = {}) {
  const roleMapping =
    options.roleMapping instanceof Map
      ? options.roleMapping
      : new Map(Object.entries(options.roleMapping || {}).map(([key, value]) => [String(key), String(value)]));
  const memberIds = options.memberIds ?? null;

  const out = [];
  let droppedRoles = 0;
  let droppedMembers = 0;
  let total = 0;

  for (const overwrite of overwrites || []) {
    total += 1;
    const type = normalizeType(overwrite?.type);
    const sourceId = String(overwrite?.id ?? '');

    if (type === OVERWRITE_TYPE.ROLE) {
      const mapped = roleMapping.get(sourceId);
      if (!mapped) {
        droppedRoles += 1;
        continue;
      }
      out.push({ id: mapped, type: OVERWRITE_TYPE.ROLE, allow: toBits(overwrite.allow), deny: toBits(overwrite.deny) });
    } else {
      if (memberIds && !memberIds.has(sourceId)) {
        droppedMembers += 1;
        continue;
      }
      out.push({ id: sourceId, type: OVERWRITE_TYPE.MEMBER, allow: toBits(overwrite.allow), deny: toBits(overwrite.deny) });
    }
  }

  return { overwrites: out, droppedRoles, droppedMembers, total };
}

module.exports = { buildChannelOverwrites, toBits, OVERWRITE_TYPE };
