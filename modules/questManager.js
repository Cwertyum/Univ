import db from '../database/db.js';
import { addBalance } from './economyManager.js';

/**
 * Get or initialize User Quest Data
 */
export function getUserQuests(guildId, userId) {
  let row = db.prepare('SELECT * FROM user_quests WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!row) {
    db.prepare(`
      INSERT INTO user_quests (guild_id, user_id, messages, voice_minutes, reps_given, claimed_msg, claimed_voice, claimed_rep)
      VALUES (?, ?, 0, 0, 0, 0, 0, 0)
    `).run(guildId, userId);
    row = { guild_id: guildId, user_id: userId, messages: 0, voice_minutes: 0, reps_given: 0, claimed_msg: 0, claimed_voice: 0, claimed_rep: 0 };
  }
  return row;
}

/**
 * Increment Message Count for Quests
 */
export function trackQuestMessage(guildId, userId) {
  getUserQuests(guildId, userId);
  db.prepare('UPDATE user_quests SET messages = messages + 1 WHERE guild_id = ? AND user_id = ?')
    .run(guildId, userId);
}

/**
 * Increment Voice Minutes for Quests
 */
export function trackQuestVoice(guildId, userId, minutes) {
  getUserQuests(guildId, userId);
  db.prepare('UPDATE user_quests SET voice_minutes = voice_minutes + ? WHERE guild_id = ? AND user_id = ?')
    .run(minutes, guildId, userId);
}

/**
 * Increment Rep Given for Quests
 */
export function trackQuestRep(guildId, userId) {
  getUserQuests(guildId, userId);
  db.prepare('UPDATE user_quests SET reps_given = reps_given + 1 WHERE guild_id = ? AND user_id = ?')
    .run(guildId, userId);
}

/**
 * Claim Quest Reward
 */
export function claimQuestReward(guildId, userId, questType) {
  const questData = getUserQuests(guildId, userId);

  if (questType === 'msg') {
    if (questData.messages < 100) {
      return { success: false, message: `Вы еще не выполнили задание! Прогресс: **${questData.messages} / 100** сообщений.` };
    }
    if (questData.claimed_msg) {
      return { success: false, message: 'Вы уже забирали награду за это задание!' };
    }

    db.prepare('UPDATE user_quests SET claimed_msg = 1 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
    addBalance(guildId, userId, 500);
    return { success: true, reward: 500, title: '💬 100 сообщений в чате' };
  }

  if (questType === 'voice') {
    if (questData.voice_minutes < 10) {
      return { success: false, message: `Вы еще не выполнили задание! Прогресс: **${questData.voice_minutes} / 10** минут в голосе.` };
    }
    if (questData.claimed_voice) {
      return { success: false, message: 'Вы уже забирали награду за это задание!' };
    }

    db.prepare('UPDATE user_quests SET claimed_voice = 1 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
    addBalance(guildId, userId, 300);
    return { success: true, reward: 300, title: '🎙️ 10 минут в голосовом канале' };
  }

  if (questType === 'rep') {
    if (questData.reps_given < 1) {
      return { success: false, message: 'Вы еще не выражали репутацию другим участникам командой `/rep`!' };
    }
    if (questData.claimed_rep) {
      return { success: false, message: 'Вы уже забирали награду за это задание!' };
    }

    db.prepare('UPDATE user_quests SET claimed_rep = 1 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
    addBalance(guildId, userId, 200);
    return { success: true, reward: 200, title: '❤️ Выдать репутацию' };
  }

  return { success: false, message: 'Неизвестное задание.' };
}
