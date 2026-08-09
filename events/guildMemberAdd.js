import { getGuildConfig } from '../database/configManager.js';
import { createEmbed, COLORS } from '../utils/embedBuilder.js';
import { logToAudit } from '../utils/logger.js';
import { handleMemberJoinRaidProtection } from '../modules/antiRaid.js';

export async function handleGuildMemberAdd(member) {
  const guild = member.guild;
  const config = getGuildConfig(guild.id);
  if (!config) return;

  // 1. Anti-Raid & Anti-Bot Join Flood Check
  const isFlaggedRaid = await handleMemberJoinRaidProtection(member);
  if (isFlaggedRaid) return; // Skip role assignment for fresh/raid accounts

  // 2. Auto-assign Member Role
  const memberRole = guild.roles.cache.find(r => r.name.includes('Участник') || r.name.includes('Member'));
  if (memberRole) {
    await member.roles.add(memberRole).catch(() => {});
  }

  // 2. Welcome Message
  if (config.welcome_channel_id) {
    const channel = guild.channels.cache.get(config.welcome_channel_id);
    if (channel) {
      const embed = createEmbed({
        title: `👋 Добро пожаловать на ${guild.name}!`,
        description: `Приветствуем тебя, ${member}! Рады видеть тебя на нашем сервере.\nОзнакомься с правилами в канале <#${config.rules_channel_id || ''}> и приятного общения!`,
        color: COLORS.SUCCESS,
        thumbnail: member.user.displayAvatarURL({ dynamic: true })
      });
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  // 2. Audit Log Entry
  logToAudit(
    guild,
    'Новый участник',
    `Пользователь ${member.user.tag} (ID: ${member.id}) присоединился к серверу.\nДата регистрации аккаунта: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
    COLORS.SUCCESS
  );
}

export async function handleGuildMemberRemove(member) {
  const guild = member.guild;
  const config = getGuildConfig(guild.id);
  if (!config) return;

  // Farewell Message
  if (config.farewell_channel_id) {
    const channel = guild.channels.cache.get(config.farewell_channel_id);
    if (channel) {
      const embed = createEmbed({
        title: `👋 Участник покинул сервер`,
        description: `Пользователь **${member.user.tag}** покинул наше сообщество.`,
        color: COLORS.ERROR
      });
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  logToAudit(
    guild,
    'Участник покинул сервер',
    `Пользователь ${member.user.tag} (ID: ${member.id}) вышел с сервера.`,
    COLORS.ERROR
  );
}
