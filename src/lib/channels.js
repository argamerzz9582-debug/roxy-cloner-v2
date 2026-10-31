'use strict';

/**
 * Channel-type handling.
 *
 * discord.js v14 uses numeric channel types. The original code compared
 * `ch.type` against both strings ('GUILD_TEXT') and numbers, so half of every
 * condition was dead. This module owns the mapping instead.
 */

const TYPES = Object.freeze({
  TEXT: 0,
  VOICE: 2,
  CATEGORY: 4,
  ANNOUNCEMENT: 5,
  STAGE: 13,
  FORUM: 15,
  MEDIA: 16,
});

const TEXT_LIKE = new Set([TYPES.TEXT, TYPES.ANNOUNCEMENT, TYPES.FORUM, TYPES.MEDIA]);
const VOICE_LIKE = new Set([TYPES.VOICE, TYPES.STAGE]);

/** 'category' | 'text' | 'announcement' | 'forum' | 'media' | 'voice' | 'stage' | null */
function classifyChannelType(type) {
  switch (type) {
    case TYPES.CATEGORY:
      return 'category';
    case TYPES.TEXT:
      return 'text';
    case TYPES.ANNOUNCEMENT:
      return 'announcement';
    case TYPES.FORUM:
      return 'forum';
    case TYPES.MEDIA:
      return 'media';
    case TYPES.VOICE:
      return 'voice';
    case TYPES.STAGE:
      return 'stage';
    default:
      return null;
  }
}

function isCloneable(type) {
  return classifyChannelType(type) !== null;
}

function isCategory(type) {
  return type === TYPES.CATEGORY;
}

function clampBitrate(bitrate, maxBitrate) {
  const value = Number(bitrate);
  const ceiling = Number(maxBitrate);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (!Number.isFinite(ceiling) || ceiling <= 0) return value;
  return Math.min(value, ceiling);
}

function mapForumTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return undefined;
  return tags.slice(0, 20).map((tag) => ({ name: String(tag.name ?? 'tag').slice(0, 20), moderated: Boolean(tag.moderated) }));
}

/**
 * Build the `channels.create()` payload for a source channel.
 *
 * `channel` is a plain object (a discord.js GuildChannel works too) so this
 * stays testable without a gateway connection.
 * Returns `null` for channel types Discord does not let bots recreate
 * (threads, directory entries, ...).
 */
function buildChannelPayload(channel, options = {}) {
  const { parentId = null, overwrites = [], maxBitrate, position } = options;
  const kind = classifyChannelType(channel?.type);
  if (!kind) return null;

  const base = { name: channel.name, permissionOverwrites: overwrites };
  if (parentId) base.parent = parentId;
  if (Number.isFinite(position)) base.position = position;

  switch (kind) {
    case 'category':
      // A category can never be parented — it *is* the parent.
      return compact({ name: channel.name, type: TYPES.CATEGORY, permissionOverwrites: overwrites });

    case 'text':
    case 'announcement':
      return compact({
        ...base,
        type: channel.type,
        topic: channel.topic || undefined,
        nsfw: Boolean(channel.nsfw),
        rateLimitPerUser: channel.rateLimitPerUser || 0,
        defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration || undefined,
      });

    case 'forum':
    case 'media': {
      const payload = {
        ...base,
        type: channel.type,
        topic: channel.topic || undefined,
        nsfw: Boolean(channel.nsfw),
        rateLimitPerUser: channel.defaultThreadRateLimitPerUser || 0,
        availableTags: mapForumTags(channel.availableTags),
      };
      // Custom-emoji default reactions get new ids on the target, so only
      // unicode emojis can be carried over safely.
      const reaction = channel.defaultReactionEmoji;
      if (reaction && !reaction.id && reaction.name) payload.defaultReactionEmoji = { name: reaction.name };
      return compact(payload);
    }

    case 'voice':
    case 'stage': {
      const payload = {
        ...base,
        type: channel.type,
        bitrate: clampBitrate(channel.bitrate, maxBitrate),
        userLimit: kind === 'voice' ? channel.userLimit || 0 : undefined,
      };
      if (kind === 'voice' && channel.rtcRegion) payload.rtcRegion = channel.rtcRegion;
      return compact(payload);
    }

    default:
      return null;
  }
}

/** Strip undefined keys so discord.js does not reject the payload. */
function compact(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Deletion order for a wipe: categories last, so their children are removed
 * first and Discord never has to re-parent anything mid-wipe.
 */
function channelDeletionRank(type) {
  if (isCategory(type)) return 2;
  if (VOICE_LIKE.has(type)) return 1;
  return 0;
}

/** Order-independent signature of how many channels of each kind a guild has. */
function summariseChannelTypes(channels) {
  const counts = { category: 0, text: 0, announcement: 0, forum: 0, media: 0, voice: 0, stage: 0, other: 0 };
  for (const channel of channels) {
    const kind = classifyChannelType(channel?.type);
    if (kind) counts[kind] += 1;
    else counts.other += 1;
  }
  return counts;
}

module.exports = {
  TYPES,
  TEXT_LIKE,
  VOICE_LIKE,
  classifyChannelType,
  isCloneable,
  isCategory,
  clampBitrate,
  mapForumTags,
  buildChannelPayload,
  compact,
  channelDeletionRank,
  summariseChannelTypes,
};
