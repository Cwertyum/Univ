import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { sendTicketPanel } from '../modules/ticketManager.js';
import { updateGuildConfig } from '../database/configManager.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('ticket-setup')
  .setDescription('Настройка системы тикетов и отправка панели обращений')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(opt => opt.setName('channel').setDescription('Канал для отправки панели тикетов').setRequired(true))
  .addChannelOption(opt => opt.setName('category').setDescription('Категория, где будут создаваться тикеты').setRequired(false));

export async function execute(interaction) {
  const targetChannel = interaction.options.getChannel('channel');
  const categoryChannel = interaction.options.getChannel('category');

  if (categoryChannel) {
    updateGuildConfig(interaction.guild.id, 'ticket_category_id', categoryChannel.id);
  }

  try {
    await sendTicketPanel(targetChannel);
    await interaction.reply({ embeds: [successEmbed(`Панель тикетов успешно отправлена в канал ${targetChannel}!`)], ephemeral: true });
  } catch (err) {
    console.error('[Ticket Setup Error]', err);
    await interaction.reply({ embeds: [errorEmbed('Не удалось отправить панель тикетов.')], ephemeral: true });
  }
}
