import db from '../database/db.js';
import { getGuildConfig } from '../database/configManager.js';
import { createEmbed, COLORS, infoEmbed } from '../utils/embedBuilder.js';
import { trackQuestVoice } from './questManager.js';

// Cooldown memory cache: guildId_userId -> timestamp
const xpCooldowns = new Map();

// Voice XP tracking: guildId_userId -> join timestamp
const voiceJoinTimes = new Map();

/**
 * Get required XP for a given level
 */
export function getRequiredXP(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/**
 * Add XP to user and handle Level Up
 */
export async function addXP(guild, member, amount, channel = null) {
  if (!guild || !member || member.user.bot) return;

  const guildId = guild.id;
  const userId = member.id;

  let row = db.prepare('SELECT * FROM users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!row) {
    db.prepare('INSERT INTO users (guild_id, user_id, xp, level) VALUES (?, ?, 0, 1)').run(guildId, userId);
    row = { guild_id: guildId, user_id: userId, xp: 0, level: 1 };
  }

  const newXP = row.xp + amount;
  let currentLevel = row.level;
  let reqXP = getRequiredXP(currentLevel);

  let leveledUp = false;
  while (newXP >= reqXP) {
    currentLevel++;
    reqXP = getRequiredXP(currentLevel);
    leveledUp = true;
  }

  db.prepare('UPDATE users SET xp = ?, level = ? WHERE guild_id = ? AND user_id = ?')
    .run(newXP, currentLevel, guildId, userId);

  if (leveledUp) {
    const levelEmbed = infoEmbed(`🎉 Поздравляем! На сервере **${guild.name}** вы достигли **${currentLevel} уровня**!`);
    
    // Try DM first
    let sentDM = false;
    try {
      await member.send({ embeds: [levelEmbed] });
      sentDM = true;
    } catch {}

    // Fallback to channel if DM fails
    if (!sentDM && channel) {
      await channel.send({
        content: `${member}`,
        embeds: [infoEmbed(`🎉 Поздравляем, ${member}! Вы достигли **${currentLevel} уровня**!`)]
      }).catch(() => {});
    }

    // Check Level Roles rewards
    const config = getGuildConfig(guildId);
    if (config && config.level_roles) {
      const rewardRoleId = config.level_roles[currentLevel.toString()];
      if (rewardRoleId) {
        const role = guild.roles.cache.get(rewardRoleId);
        if (role) {
          await member.roles.add(role).catch(() => {});
        }
      }
    }
  }
}

/**
 * Message XP Handler with 60s cooldown
 */
export async function handleMessageXP(message) {
  if (!message.guild || message.author.bot) return;

  const key = `${message.guild.id}_${message.author.id}`;
  const now = Date.now();
  const lastXP = xpCooldowns.get(key) || 0;

  if (now - lastXP < 60000) return; // 60s cooldown

  xpCooldowns.set(key, now);
  
  // Random 15 - 25 XP per message
  const randomXP = Math.floor(Math.random() * 11) + 15;
  await addXP(message.guild, message.member, randomXP, message.channel);
}

/**
 * Voice XP Handler
 */
export function trackVoiceXP(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const key = `${newState.guild.id}_${member.id}`;
  const now = Date.now();

  // User joined voice
  if (!oldState.channelId && newState.channelId) {
    voiceJoinTimes.set(key, now);
  }

  // User left voice
  if (oldState.channelId && !newState.channelId) {
    const joinTime = voiceJoinTimes.get(key);
    if (joinTime) {
      voiceJoinTimes.delete(key);
      const minutes = Math.floor((now - joinTime) / 60000);
      if (minutes >= 1) {
        trackQuestVoice(newState.guild.id, member.id, minutes);
        const xpEarned = minutes * 10; // 10 XP per minute
        addXP(newState.guild, member, xpEarned);
      }
    }
  }
}

/**
 * Get User Profile Data
 */
export function getUserData(guildId, userId) {
  let row = db.prepare('SELECT * FROM users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!row) {
    return { xp: 0, level: 1, balance: 100, rep: 0 };
  }
  return row;
}

/**
 * Get Leaderboard Top 10
 */
export function getLeaderboard(guildId) {
  return db.prepare('SELECT * FROM users WHERE guild_id = ? ORDER BY level DESC, xp DESC LIMIT 10').all(guildId);
}
