import { createEmbed, COLORS, errorEmbed, warningEmbed, successEmbed, raidShieldEmbed } from '../utils/embedBuilder.js';
import { logToAudit } from '../utils/logger.js';

// Guild Join Timestamps: guildId -> array of timestamps
const guildJoinCache = new Map();

// Guild Anti-Raid Status: guildId -> { isRaidMode: boolean, raidLockUntil: number }
const raidStateMap = new Map();

// Command Rate Limits: userId -> array of timestamps
const commandRateLimitCache = new Map();

// Minimum Account Age in Days for Anti-Alt Filter (7 days)
const MIN_ACCOUNT_AGE_DAYS = 7;

/**
 * Toggle Raid Mode Manually or Automatically
 */
export function setRaidMode(guildId, enabled, durationMinutes = 15) {
  const now = Date.now();
  const raidState = {
    isRaidMode: enabled,
    raidLockUntil: enabled ? now + durationMinutes * 60 * 1000 : 0
  };
  raidStateMap.set(guildId, raidState);
  return raidState;
}

/**
 * Get Guild Anti-Raid Status Info
 */
export function getAntiRaidStatus(guildId) {
  const state = raidStateMap.get(guildId) || { isRaidMode: false, raidLockUntil: 0 };
  if (state.isRaidMode && Date.now() > state.raidLockUntil) {
    state.isRaidMode = false;
    state.raidLockUntil = 0;
    raidStateMap.set(guildId, state);
  }
  return state;
}

/**
 * Ultra Anti-Raid Join Protection
 * Triggers when > 3 members join within 5 seconds or during active Raid Mode
 */
export async function handleMemberJoinRaidProtection(member) {
  const guild = member.guild;
  const now = Date.now();

  const joins = guildJoinCache.get(guild.id) || [];
  const recentJoins = joins.filter(t => now - t < 5000); // within last 5s
  recentJoins.push(now);
  guildJoinCache.set(guild.id, recentJoins);

  let raidState = getAntiRaidStatus(guild.id);

  // Trigger Raid Mode automatically if 3+ joins in 5s
  if (recentJoins.length >= 3 && !raidState.isRaidMode) {
    raidState = setRaidMode(guild.id, true, 15); // 15 minutes emergency lockdown

    logToAudit(
      guild,
      '🚨 ULTRA ANTI-RAID SHIELD АКТИВИРОВАН',
      `**ОБНАРУЖЕНА МАССОВАЯ РЕЙД-АТАКА БОТОВ / ТВИНКОВ!**\n` +
      `⚡ **Зафиксировано:** **${recentJoins.length} входов за 5 секунд**.\n\n` +
      `🛡️ **Принятые экстренные меры:**\n` +
      `- Включена блокировка сервера (Lockdown Mode) на 15 минут.\n` +
      `- Подозрительные свежие аккаунты (< 7 дней) автоматические авто-кикаются/банятся.`,
      COLORS.CRIMSON
    );
  }

  const accountAgeDays = (now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  const hasDefaultAvatar = !member.user.avatar;

  // Active Raid Mode Handling: KICK suspicious bots and fresh accounts instantly
  if (raidState.isRaidMode || accountAgeDays < MIN_ACCOUNT_AGE_DAYS) {
    const isSuspicious = accountAgeDays < MIN_ACCOUNT_AGE_DAYS || hasDefaultAvatar || raidState.isRaidMode;

    if (isSuspicious) {
      try {
        // DM notify user before kick
        await member.user.send({
          embeds: [raidShieldEmbed(`Вы были автоматически кикнуты с сервера **${guild.name}** в связи с активацией режима защиты от рейдов (Anti-Raid Shield).\nВозраст вашего аккаунта: ${accountAgeDays.toFixed(1)} дн. (Минимум: ${MIN_ACCOUNT_AGE_DAYS} дн.).`)]
        }).catch(() => {});

        // Kick raid bot / fresh alt
        await member.kick(`[Ultra Anti-Raid Shield] Защита от спам-ботов / твинков (Возраст: ${accountAgeDays.toFixed(1)} дн.)`);

        logToAudit(
          guild,
          '🛡️ Ultra Anti-Raid: АВТО-КИК ТВИНКА / БОТА',
          `Участник **${member.user.tag}** (ID: \`${member.id}\`) автоматически кикнут.\n` +
          `• Возраст аккаунта: **${accountAgeDays.toFixed(1)} дней** (Порог: ${MIN_ACCOUNT_AGE_DAYS} дн.)\n` +
          `• Стандартная аватарка: **${hasDefaultAvatar ? 'Да (Подозрительно)' : 'Нет'}**\n` +
          `• Режим Raid Mode: **${raidState.isRaidMode ? 'АКТИВЕН' : 'Неактивен'}**`,
          COLORS.WARNING
        );
        return true; // Flagged & kicked
      } catch (err) {
        console.error('[Anti-Raid Kick Error]', err);
      }
    }
  }

  return false;
}

/**
 * Anti-Invite Links & Advertising Shield
 */
export async function handleInviteLinkShield(message) {
  if (!message.guild || message.author.bot) return false;
  if (message.member?.permissions.has('Administrator') || message.member?.permissions.has('ManageMessages')) return false;

  const inviteRegex = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/[a-zA-Z0-9]+/gi;

  if (inviteRegex.test(message.content)) {
    if (message.deletable) await message.delete().catch(() => {});

    await message.member?.timeout(60 * 60 * 1000, '[Anti-Raid] Запрещена реклама сторонних Discord серверов').catch(() => {});

    logToAudit(
      message.guild,
      '🚨 ANTI-INVITE SHIELD — МУТ ЗА РЕКЛАМУ',
      `Пользователь ${message.author} (\`${message.author.tag}\`) замучен на 1 час за отправку ссылки-приглашения.\n` +
      `Сообщение: \`${message.content.substring(0, 100)}\``,
      COLORS.ERROR
    );

    const warnMsg = await message.channel.send({
      embeds: [errorEmbed(`${message.author}, реклама сторонних Discord-серверов запрещена! Вы выведены из строя на 1 час.`)]
    }).catch(() => {});

    setTimeout(() => warnMsg?.delete().catch(() => {}), 7000);
    return true;
  }

  return false;
}

/**
 * Mass Mention & Raid Spam Filter
 */
export async function handleMassMentionShield(message) {
  if (!message.guild || message.author.bot) return false;
  if (message.member?.permissions.has('Administrator') || message.member?.permissions.has('ManageMessages')) return false;

  const mentionsCount = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 5 : 0);

  if (mentionsCount >= 4) {
    if (message.deletable) await message.delete().catch(() => {});

    await message.member?.timeout(60 * 60 * 1000, '[Anti-Raid] Массовый спам упоминаниями').catch(() => {});

    logToAudit(
      message.guild,
      '🚨 ANTI-RAID SHIELD — МУТ ЗА МАСС-МЕНШЕН',
      `Пользователь ${message.author} (\`${message.author.tag}\`) отправлен в мут на 1 час за массовые упоминания (${mentionsCount}).`,
      COLORS.ERROR
    );

    const warnMsg = await message.channel.send({
      embeds: [errorEmbed(`${message.author}, массовый спам упоминаниями запрещен! Вы отправлены в мут на 1 час.`)]
    }).catch(() => {});

    setTimeout(() => warnMsg?.delete().catch(() => {}), 7000);
    return true;
  }

  return false;
}

/**
 * Command DDoS & Rate Limit Protection
 * Max 4 commands per 5 seconds per user
 */
export function checkCommandRateLimit(interaction) {
  if (interaction.member?.permissions.has('Administrator')) return false;

  const userId = interaction.user.id;
  const now = Date.now();
  const timestamps = commandRateLimitCache.get(userId) || [];

  const recent = timestamps.filter(t => now - t < 5000);
  recent.push(now);
  commandRateLimitCache.set(userId, recent);

  if (recent.length > 4) {
    return true;
  }

  return false;
}
