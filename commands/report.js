import { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import { getGuildConfig } from '../database/configManager.js';
import { createEmbed, COLORS, successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { logToAudit } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('report')
  .setDescription('Подать жалобу на игрока или сообщить о баге')
  .addSubcommand(sub =>
    sub.setName('user')
      .setDescription('Отправить жалобу на участника сервера')
      .addUserOption(opt => opt.setName('target').setDescription('Нарушитель').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Причина жалобы / нарушение').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('bug')
      .setDescription('Сообщить о техническом баге или ошибке')
      .addStringOption(opt => opt.setName('description').setDescription('Описание бага').setRequired(true))
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const { guild, user } = interaction;
  const config = getGuildConfig(guild.id);

  if (subcommand === 'user') {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');

    if (target.id === user.id) {
      return await interaction.reply({ embeds: [errorEmbed('Вы не можете отправлять жалобу на самого себя!')], ephemeral: true });
    }

    // Find Moderator Channel
    const modChan = guild.channels.cache.find(c => c.name === '🛡️・чат-модераторов' || c.name === '📝-журнал-аудита');

    const reportEmbed = createEmbed({
      title: '🚨 НОВАЯ ЖАЛОБА НА ИГРОКА',
      description: `Отправитель: ${user} (ID: ${user.id})\nНарушитель: ${target} (ID: ${target.id})`,
      color: COLORS.ERROR,
      fields: [
        { name: 'Причина жалобы', value: `> ${reason}`, inline: false }
      ],
      thumbnail: target.displayAvatarURL({ dynamic: true })
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`report_warn_${target.id}`).setLabel('⚠️ Выдать Варн').setStyle(ButtonStyle.Warning),
      new ButtonBuilder().setCustomId(`report_mute_${target.id}`).setLabel('🔇 Замутить (10м)').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`report_dismiss`).setLabel('❌ Отклонить').setStyle(ButtonStyle.Secondary)
    );

    if (modChan) {
      await modChan.send({ embeds: [reportEmbed], components: [row] });
    }

    logToAudit(guild, 'Репорт отправлен', `Пользователь ${user.tag} отправил жалобу на ${target.tag}.\nПричина: ${reason}`, COLORS.WARNING);

    await interaction.reply({
      embeds: [successEmbed('Ваша жалоба успешно передана модераторам сервера! Спасибо за помощь.')],
      ephemeral: true
    });
  }

  else if (subcommand === 'bug') {
    const desc = interaction.options.getString('description');

    const techChan = guild.channels.cache.find(c => c.name === '🔧・чат-техников' || c.name === '🔮・чат-кураторов' || c.name === '👑・чат-администрации');

    const bugEmbed = createEmbed({
      title: '🐛 БАГ-РЕПОРТ СЕРВЕРА',
      description: `Отправитель: ${user} (ID: ${user.id})`,
      color: COLORS.WARNING,
      fields: [
        { name: 'Описание ошибки / бага', value: `> ${desc}`, inline: false }
      ]
    });

    if (techChan) {
      await techChan.send({ embeds: [bugEmbed] });
    }

    await interaction.reply({
      embeds: [successEmbed('Баг-репорт успешно отправлен технической администрации!')],
      ephemeral: true
    });
  }
}

export async function handleReportButtons(interaction) {
  const { customId, member, guild, user } = interaction;
  if (!customId.startsWith('report_')) return false;

  if (!member.permissions.has('ManageMessages') && !member.permissions.has('Administrator')) {
    await interaction.reply({ embeds: [errorEmbed('У вас нет прав на обработку репортов!')], ephemeral: true });
    return true;
  }

  if (customId === 'report_dismiss') {
    await interaction.update({
      embeds: [createEmbed({ title: '❌ Жалоба отклонена', description: `Модератор ${user} отклонил данную жалобу.`, color: COLORS.DARK })],
      components: []
    });
    return true;
  }

  const parts = customId.split('_');
  const action = parts[1];
  const targetId = parts[2];

  const targetMember = await guild.members.fetch(targetId).catch(() => null);

  if (action === 'warn') {
    await interaction.update({
      embeds: [createEmbed({ title: '⚠️ Варн Выдан по Репорту', description: `Модератор ${user} выдал варн нарушителю <@${targetId}>.`, color: COLORS.WARNING })],
      components: []
    });
    return true;
  }

  if (action === 'mute') {
    if (targetMember) {
      await targetMember.timeout(10 * 60 * 1000, 'Наказание по репорту игрока').catch(() => {});
    }
    await interaction.update({
      embeds: [createEmbed({ title: '🔇 Мут Выдан по Репорту', description: `Модератор ${user} отправлен в мут нарушителя <@${targetId}> на 10 минут.`, color: COLORS.ERROR })],
      components: []
    });
    return true;
  }

  return false;
}
