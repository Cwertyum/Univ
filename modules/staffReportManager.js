import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionFlagsBits 
} from 'discord.js';
import { createEmbed, COLORS, successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { logToAudit } from '../utils/logger.js';

/**
 * Higher Administration verification helper
 */
export function isHigherStaff(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.roles.cache.some(r => 
      r.name.includes('Владелец') || 
      r.name.includes('Зам. Владельца') || 
      r.name.includes('Гл. Тех. Администратор') || 
      r.name.includes('Технический Администратор') || 
      r.name.includes('Гл. Администратор') || 
      r.name.includes('Администратор') || 
      r.name.includes('Куратор')
    );
}

/**
 * Handle Buttons for Task Approval & Mod Report Verification
 */
export async function handleStaffReportButtons(interaction) {
  const { customId, member, guild, user } = interaction;
  if (!customId.startsWith('staff_task_') && !customId.startsWith('staff_mod_')) return false;

  // 1. Task Approval by Higher Administration
  if (customId.startsWith('staff_task_approve') || customId.startsWith('staff_task_reject')) {
    if (!isHigherStaff(member)) {
      await interaction.reply({
        embeds: [errorEmbed('⛔ Вы не являетесь членом Высшей Администрации!')],
        ephemeral: true
      });
      return true;
    }

    const isApproved = customId.startsWith('staff_task_approve');
    const oldEmbed = interaction.message.embeds[0];

    const updatedEmbed = createEmbed({
      title: oldEmbed.title,
      description: oldEmbed.description,
      color: isApproved ? COLORS.SUCCESS : COLORS.ERROR,
      fields: [
        ...(oldEmbed.fields || []),
        {
          name: isApproved ? '✨ СТАТУС ПРОВЕРКИ' : '❌ СТАТУС ПРОВЕРКИ',
          value: isApproved 
            ? `**✅ ОДОБРЕНО ВЫСШЕЙ АДМИНИСТРАЦИЕЙ**\n**Проверил:** ${user} (\`${user.tag}\`)\n**Дата:** <t:${Math.floor(Date.now() / 1000)}:F>`
            : `**❌ ОТКЛОНЕНО ВЫСШЕЙ АДМИНИСТРАЦИЕЙ**\n**Проверил:** ${user} (\`${user.tag}\`)\n**Дата:** <t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: false
        }
      ],
      footer: isApproved ? '✨ Проверено и одобрено Высшей Администрацией' : '❌ Отклонено Высшей Администрацией'
    });

    if (oldEmbed.image) updatedEmbed.setImage(oldEmbed.image.url);

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('approved_btn')
        .setLabel(isApproved ? '✅ ОДОБРЕНО ВЫСШЕЙ АДМИНИСТРАЦИЕЙ' : '❌ ОТКЛОНЕНО')
        .setStyle(isApproved ? ButtonStyle.Success : ButtonStyle.Danger)
        .setDisabled(true)
    );

    await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });
    logToAudit(guild, 'Проверка отчета персоналу', `Отчет/Задание в ${interaction.channel.name} был ${isApproved ? 'ОДОБРЕН' : 'ОТКЛОНЕН'} Администратором ${user.tag}.`, isApproved ? COLORS.SUCCESS : COLORS.ERROR);
    return true;
  }

  return false;
}
