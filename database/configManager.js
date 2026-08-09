import db from './db.js';

// Fast In-Memory Cache for Guild Configurations
const guildCache = new Map();

/**
 * Get Guild Config (Cached)
 */
export function getGuildConfig(guildId) {
  if (!guildId) return null;
  if (guildCache.has(guildId)) {
    return guildCache.get(guildId);
  }

  let row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT INTO guild_config (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  }

  // Parse JSON fields
  try {
    row.badwords_list = JSON.parse(row.badwords_list || '[]');
  } catch {
    row.badwords_list = [];
  }

  try {
    row.level_roles = JSON.parse(row.level_roles || '{}');
  } catch {
    row.level_roles = {};
  }

  guildCache.set(guildId, row);
  return row;
}

/**
 * Update Guild Config and sync RAM cache
 */
export function updateGuildConfig(guildId, key, value) {
  const config = getGuildConfig(guildId);
  let dbValue = value;

  if (typeof value === 'object') {
    dbValue = JSON.stringify(value);
  }

  db.prepare(`UPDATE guild_config SET ${key} = ? WHERE guild_id = ?`).run(dbValue, guildId);
  
  config[key] = value;
  guildCache.set(guildId, config);
}

/**
 * Clear or invalidate cache
 */
export function clearGuildCache(guildId) {
  if (guildId) {
    guildCache.delete(guildId);
  } else {
    guildCache.clear();
  }
}
