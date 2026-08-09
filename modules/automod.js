import { getGuildConfig } from '../database/configManager.js';
import db from '../database/db.js';
import { warningEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { logToAudit } from '../utils/logger.js';
import { COLORS } from '../utils/embedBuilder.js';

// Anti-Spam & Duplicate Cache: userId_guildId -> array of timestamps
const spamCache = new Map();
// Last Message Cache for duplicate flood detection: userId_guildId -> { content: string, timestamp: number }
const lastMessageCache = new Map();

// Default Bad Words regex list
const DEFAULT_BADWORDS = [
  /б[ляаяде]/i, /сук[аамиое]/i, /пизд/i, /ху[йяеию]/i, /еб[аабопму]/i,
  /чмо/i, /гандон/i, /пидор/i, /ублюдок/i, /nigger/i, /fuck/i, /bitch/i
];

export async function handleAutoMod(message) {
  if (!message.guild || message.author.bot) return false;
  if (message.member?.permissions.has('Administrator') || message.member?.permissions.has('ManageMessages')) {
    return false; // Skip admins & moderators
  }

  const config = getGuildConfig(message.guild.id);
  if (!config) return false;

  const content = message.content;
  const key = `${message.author.id}_${message.guild.id}`;
  const now = Date.now();

  // 1. Bad Words Filter
  if (config.automod_badwords) {
    let isBad = false;
    let matchedWord = '';

    if (config.badwords_list && config.badwords_list.length > 0) {
      for (const word of config.badwords_list) {
        if (content.toLowerCase().includes(word.toLowerCase())) {
          isBad = true;
          matchedWord = word;
          break;
        }
      }
    }

    if (!isBad) {
      for (const regex of DEFAULT_BADWORDS) {
        if (regex.test(content)) {
          isBad = true;
          matchedWord = 'Запрещенное слово';
          break;
        }
      }
    }

    if (isBad) {
      await deleteAndPunish(message, `Использование запрещенных слов (${matchedWord})`);
      return true;
    }
  }

  // 2. Links Filter
  if (config.automod_links) {
    const linkRegex = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)|(discord\.com\/invite\/[^\s]+)/i;
    if (linkRegex.test(content)) {
      await deleteAndPunish(message, 'Размещение сторонних ссылок / приглашений');
      return true;
    }
  }

  // 3. STRICT Anti-Caps Filter (50% ratio or 6+ consecutive uppercase chars)
  if (config.automod_caps && content.length >= 6) {
    const capsCount = (content.match(/[A-ZА-ЯЁ]/g) || []).length;
    const capsRatio = capsCount / content.length;
    const hasConsecutiveCaps = /[A-ZА-ЯЁ]{6,}/.test(content);

    if (capsRatio >= 0.50 || hasConsecutiveCaps) {
      await deleteAndPunish(message, 'Чрезмерное использование КАПСА (Anti-Caps Shield)');
      return true;
    }
  }

  // 4. STRICT Anti-Flood & Duplicate Message Filter
  if (config.automod_spam) {
    // 4a. Vertical Wall / Newline Flood Check
    const lineBreaks = (content.match(/\n/g) || []).length;
    if (lineBreaks >= 5) {
      await deleteAndPunish(message, 'Вертикальный флуд строками');
      return true;
    }

    // 4b. Duplicate Message Flood Check
    const lastMsg = lastMessageCache.get(key);
    if (lastMsg && lastMsg.content.toLowerCase() === content.toLowerCase() && (now - lastMsg.timestamp < 10000)) {
      await deleteAndPunish(message, 'Повторный флуд одинаковыми сообщениями');
      return true;
    }
    lastMessageCache.set(key, { content, timestamp: now });

    // 4c. Speed Message Flood Check (3 messages in 3 seconds)
    const timestamps = spamCache.get(key) || [];
    const recent = timestamps.filter(t => now - t < 3000);
    recent.push(now);
    spamCache.set(key, recent);

    if (recent.length >= 3) {
      spamCache.delete(key);
      await message.member?.timeout(10 * 60 * 1000, '[AutoMod] Быстрый флуд сообщениями').catch(() => {});
      await deleteAndPunish(message, 'Скоростной флуд сообщениями (Мут на 10 минут)');
      return true;
    }
  }

  return false;
}

async function deleteAndPunish(message, reason) {
  try {
    if (message.deletable) {
      await message.delete().catch(() => {});
    }

    const warningMsg = await message.channel.send({
      content: `${message.author}`,
      embeds: [warningEmbed(`Ваше сообщение удалено. **Причина:** ${reason}`)]
    }).catch(() => null);

    if (warningMsg) {
      setTimeout(() => warningMsg.delete().catch(() => {}), 5000);
    }

    // Issue Warn
    const guildId = message.guild.id;
    const userId = message.author.id;
    const now = Date.now();

    db.prepare(`
      INSERT INTO warns (guild_id, user_id, moderator_id, reason, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId, message.client.user.id, `[AutoMod] ${reason}`, now);

    const warnCountRow = db.prepare('SELECT COUNT(*) as count FROM warns WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    const warnCount = warnCountRow ? warnCountRow.count : 1;

    const config = getGuildConfig(guildId);
    
    logToAudit(
      message.guild,
      'Автомодерация — Предупреждение',
      `Пользователь ${message.author} (ID: ${userId}) получил варн от **AutoMod**.`,
      COLORS.WARNING,
      [
        { name: 'Причина', value: reason, inline: true },
        { name: 'Всего варнов', value: `${warnCount} / ${config.warn_limit}`, inline: true }
      ]
    );

    // Auto Punishment if limit exceeded
    if (warnCount >= config.warn_limit) {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member) {
        if (config.warn_action === 'timeout' || config.warn_action === 'mute') {
          await member.timeout(10 * 60 * 1000, `Превышен лимит предупреждений (${warnCount}/${config.warn_limit})`).catch(() => {});
          await message.channel.send({
            embeds: [errorEmbed(`${member.user.tag} отправлен в мут на 10 минут за превышение лимита варнов.`)]
          }).catch(() => {});
        } else if (config.warn_action === 'kick') {
          await member.kick(`Превышен лимит предупреждений (${warnCount}/${config.warn_limit})`).catch(() => {});
        } else if (config.warn_action === 'ban') {
          await member.ban({ reason: `Превышен лимит предупреждений (${warnCount}/${config.warn_limit})` }).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('[AutoMod Delete/Punish Error]', err);
  }
}
