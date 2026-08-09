import db from '../database/db.js';

export function getMarriage(guildId, userId) {
  return db.prepare(`
    SELECT * FROM marriages 
    WHERE guild_id = ? AND (user1_id = ? OR user2_id = ?)
  `).get(guildId, userId, userId);
}

export function createMarriageRecord(guildId, user1Id, user2Id, roleId = null) {
  db.prepare(`
    INSERT INTO marriages (guild_id, user1_id, user2_id, married_at, children, role_id)
    VALUES (?, ?, ?, ?, '[]', ?)
  `).run(guildId, user1Id, user2Id, Date.now(), roleId);
}

export function deleteMarriageRecord(guildId, userId) {
  const marriage = getMarriage(guildId, userId);
  if (marriage) {
    db.prepare(`
      DELETE FROM marriages 
      WHERE guild_id = ? AND (user1_id = ? OR user2_id = ?)
    `).run(guildId, userId, userId);
  }
  return marriage;
}

export function addBabyRecord(guildId, userId, babyName) {
  const marriage = getMarriage(guildId, userId);
  if (!marriage) return null;

  let children = [];
  try {
    children = JSON.parse(marriage.children || '[]');
  } catch {
    children = [];
  }

  children.push({ name: babyName, born_at: Date.now() });

  db.prepare(`
    UPDATE marriages SET children = ?
    WHERE guild_id = ? AND (user1_id = ? OR user2_id = ?)
  `).run(JSON.stringify(children), guildId, userId, userId);

  return children;
}
