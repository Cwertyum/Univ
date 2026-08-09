import { 
  ChannelType, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import db from '../database/db.js';
import { getGuildConfig } from '../database/configManager.js';
import { createEmbed, COLORS, successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';
import { logToAudit } from '../utils/logger.js';

export async function sendTicketPanel(channel) {
  const embed = createEmbed({
    title: '🎫 Система Поддержки и Тикетов',
    description: 'Нужна помощь или возник вопрос? Выберите нужную категорию в меню ниже, чтобы создать приватное обращение.',
    color: COLORS.PRIMARY,
    fields: [
      { name: '❓ Вопрос / Консультация', value: 'Общие вопросы по серверу', inline: true },
      { name: '🚨 Жалоба на игрока / персонал', value: 'Нарушение правил или превышение полномочий', inline: true },
      { name: '🛠️ Техподдержка', value: 'Баги, проблемы и предложения', inline: true }
    ],
    footer: 'Поддержка ответит вам в течение нескольких минут!'
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category_select')
    .setPlaceholder('Выберите тему обращения...')
    .addOptions([
      { label: 'Общие вопросы', description: 'Задать вопрос администрации', value: 'question', emoji: '❓' },
      { label: 'Жалоба / Репорт', description: 'Подать жалобу на игрока или члена персонала', value: 'report', emoji: '🚨' },
      { label: 'Техподдержка', description: 'Сообщить о технической проблеме', value: 'tech', emoji: '🛠️' },
      { label: 'Покупка / Донат', description: 'Вопросы по донату и услугам', value: 'donate', emoji: '💎' }
    ]);

  const row = new ActionRowBuilder().addComponents(selectMenu);
  return await channel.send({ embeds: [embed], components: [row] });
}

export async function handleTicketInteraction(interaction) {
  const { customId, guild, member, user } = interaction;
  const config = getGuildConfig(guild.id);

  // 1. Select Menu Handling
  if (interaction.isStringSelectMenu() && customId === 'ticket_category_select') {
    const categoryKey = interaction.values[0];

    // Check if user already has an open ticket
    const existing = db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'").get(guild.id, user.id);
    if (existing) {
      const ticketChan = guild.channels.cache.get(existing.channel_id);
      if (ticketChan) {
        await interaction.reply({ embeds: [errorEmbed(`У вас уже есть открытый тикет: ${ticketChan}`)], ephemeral: true });
        return true;
      }
    }

    // Special Modal for Report Category
    if (categoryKey === 'report') {
      const modal = new ModalBuilder()
        .setCustomId('ticket_modal_report')
        .setTitle('Подать Жалобу / Репорт');

      const targetInput = new TextInputBuilder()
        .setCustomId('report_target_input')
        .setLabel('Никнейм или ID нарушителя / персонала')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Укажите никнейм на кого жалуетесь')
        .setRequired(true)
        .setMaxLength(40);

      const reasonInput = new TextInputBuilder()
        .setCustomId('report_reason_input')
        .setLabel('Причина репорта и описание ситуации')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Подробно опишите нарушение')
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(
        new ActionRowBuilder().addComponents(targetInput),
        new ActionRowBuilder().addComponents(reasonInput)
      );

      await interaction.showModal(modal);
      return true;
    }

    // Direct Creation for other categories
    await createTicketChannel(interaction, categoryKey, 'Общее', null, null);
    return true;
  }

  // 2. Modal Submission for Report Ticket
  if (interaction.isModalSubmit() && customId === 'ticket_modal_report') {
    const reportedTarget = interaction.fields.getTextInputValue('report_target_input');
    const reason = interaction.fields.getTextInputValue('report_reason_input');

    // Try finding reported user ID if mentioned or by username
    let reportedUserId = null;
    const cleanTargetStr = reportedTarget.replace(/[<@!>]/g, '').trim();
    const foundMember = guild.members.cache.find(m => m.id === cleanTargetStr || m.user.tag.toLowerCase().includes(reportedTarget.toLowerCase()) || m.user.username.toLowerCase().includes(reportedTarget.toLowerCase()));
    if (foundMember) reportedUserId = foundMember.id;

    await createTicketChannel(interaction, 'report', 'Жалоба', reportedTarget, reportedUserId, reason);
    return true;
  }

  // 3. Buttons inside ticket channel
  if (interaction.isButton() && customId.startsWith('ticket_')) {
    const ticketRow = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(interaction.channelId);
    if (!ticketRow && customId !== 'ticket_close_confirm') {
      await interaction.reply({ embeds: [errorEmbed('Этот канал не является тикетом!')], ephemeral: true });
      return true;
    }

    if (customId === 'ticket_close') {
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close_confirm').setLabel('Да, закрыть тикет').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_cancel').setLabel('Отмена').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ embeds: [infoEmbed('Вы уверены, что хотите закрыть и удалить этот тикет?')], components: [confirmRow], ephemeral: true });
      return true;
    }

    if (customId === 'ticket_cancel') {
      await interaction.update({ embeds: [infoEmbed('Закрытие тикета отменено.')], components: [] });
      return true;
    }

    if (customId === 'ticket_close_confirm') {
      await interaction.deferReply();
      const channel = interaction.channel;

      // Generate Transcript text
      const messages = await channel.messages.fetch({ limit: 100 });
      const sorted = Array.from(messages.values()).reverse();

      let transcriptText = `=== ТРАНСКРИПТ ТИКЕТА ${channel.name} ===\n`;
      transcriptText += `Дата создания: ${new Date(ticketRow ? ticketRow.created_at : Date.now()).toLocaleString()}\n\n`;

      sorted.forEach(m => {
        transcriptText += `[${new Date(m.createdTimestamp).toLocaleTimeString()}] ${m.author.tag}: ${m.content}\n`;
      });

      const buffer = Buffer.from(transcriptText, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });

      // Update DB status
      if (ticketRow) {
        db.prepare("UPDATE tickets SET status = 'closed' WHERE ticket_id = ?").run(ticketRow.ticket_id);
      }

      // Send log with transcript
      if (config.ticket_log_channel_id) {
        const logChan = guild.channels.cache.get(config.ticket_log_channel_id);
        if (logChan) {
          await logChan.send({
            embeds: [createEmbed({
              title: `🔒 Тикет Закрыт: ${channel.name}`,
              description: `Закрыл: ${user}\nКатегория: ${ticketRow ? ticketRow.category : 'Н/Д'}`,
              color: COLORS.ERROR
            })],
            files: [attachment]
          }).catch(() => {});
        }
      }

      // Rating survey
      const ratingRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_rate_1').setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_rate_2').setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_rate_3').setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_rate_4').setLabel('⭐ 4').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_rate_5').setLabel('⭐ 5').setStyle(ButtonStyle.Success)
      );

      await channel.send({
        embeds: [createEmbed({
          title: '⭐ Оцените качество поддержки',
          description: 'Пожалуйста, оцените работу администрации от 1 до 5 звезд перед удалением канала:',
          color: COLORS.PRIMARY
        })],
        components: [ratingRow]
      });

      setTimeout(async () => {
        await channel.delete().catch(() => {});
      }, 10000);

      return true;
    }

    if (customId === 'ticket_transcript') {
      await interaction.deferReply({ ephemeral: true });
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const sorted = Array.from(messages.values()).reverse();

      let transcriptText = `=== ТРАНСКРИПТ ТИКЕТА ${interaction.channel.name} ===\n\n`;
      sorted.forEach(m => {
        transcriptText += `[${new Date(m.createdTimestamp).toLocaleTimeString()}] ${m.author.tag}: ${m.content}\n`;
      });

      const buffer = Buffer.from(transcriptText, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: `${interaction.channel.name}-transcript.txt` });
      await interaction.editReply({ files: [attachment] });
      return true;
    }

    if (customId === 'ticket_ping_staff') {
      await interaction.reply({ content: `🔔 Администрация была вызвана в этот тикет пользователя ${user}!`, ephemeral: false });
      return true;
    }

    if (customId === 'ticket_claim') {
      // 1. Check Staff Permissions
      const isStaffMember = member.permissions.has(PermissionFlagsBits.ManageMessages) || 
                           member.permissions.has(PermissionFlagsBits.KickMembers) || 
                           member.permissions.has(PermissionFlagsBits.Administrator) ||
                           member.roles.cache.some(r => 
                             r.name.includes('Администратор') || 
                             r.name.includes('Куратор') || 
                             r.name.includes('Модератор') || 
                             r.name.includes('Хелпер')
                           );

      if (!isStaffMember) {
        await interaction.reply({ 
          embeds: [errorEmbed('⛔ Вы не являетесь членом персонала сервера!')], 
          ephemeral: true 
        });
        return true;
      }

      // 2. Self-Report Protection Check (Reported user cannot claim!)
      if (ticketRow && ticketRow.reported_user_id && ticketRow.reported_user_id === user.id) {
        await interaction.reply({
          embeds: [errorEmbed('⛔ Вы являетесь обвиняемым по этому репорту и НЕ МОЖЕТЕ браться за его решение! Вы можете давать объяснения в чате.')],
          ephemeral: true
        });
        return true;
      }

      await interaction.reply({
        embeds: [successEmbed(`👤 Ответственный за обращение: ${user} (${user.tag}) взялся за решение задачи!`)]
      });

      logToAudit(guild, 'Тикет взят в работу', `Модератор ${user.tag} стал ответственным за тикет ${interaction.channel.name}.`, COLORS.SUCCESS);
      return true;
    }

    if (customId.startsWith('ticket_rate_')) {
      const rating = parseInt(customId.split('_')[2], 10);
      if (ticketRow) {
        db.prepare('UPDATE tickets SET rating = ? WHERE ticket_id = ?').run(rating, ticketRow.ticket_id);
      }
      await interaction.reply({ embeds: [successEmbed(`Спасибо за вашу оценку: ${'⭐'.repeat(rating)}! Канал будет удален через несколько секунд.`)] });
      return true;
    }
  }

  return false;
}

/**
 * Helper to create ticket channel and send initial embed
 */
async function createTicketChannel(interaction, categoryKey, categoryName, reportedTarget = null, reportedUserId = null, reason = null) {
  const { guild, user } = interaction;
  const config = getGuildConfig(guild.id);

  if (interaction.deferred || interaction.replied) {
    // Already deferred
  } else {
    await interaction.deferReply({ ephemeral: true });
  }

  try {
    const ticketId = `ticket-${Date.now().toString().slice(-4)}`;
    const parentId = config.ticket_category_id || null;

    const staffRoles = guild.roles.cache.filter(r => 
      r.name.includes('Администратор') || 
      r.name.includes('Куратор') || 
      r.name.includes('Модератор') || 
      r.name.includes('Хелпер')
    );

    const botId = guild.members.me?.id || guild.client.user.id;
    const permissionOverwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
    ];

    staffRoles.forEach(role => {
      permissionOverwrites.push({
        id: role.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
      });
    });

    // If reported user is specified and on the server, allow them to type in defense
    if (reportedUserId) {
      permissionOverwrites.push({
        id: reportedUserId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
      });
    }

    const ticketChannel = await guild.channels.create({
      name: `🎫-${categoryKey}-${user.username}`,
      type: ChannelType.GuildText,
      parent: parentId,
      permissionOverwrites
    });

    // Save ticket in DB
    db.prepare("INSERT INTO tickets (ticket_id, guild_id, channel_id, user_id, reported_user_id, category, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)")
      .run(ticketId, guild.id, ticketChannel.id, user.id, reportedUserId, categoryName, Date.now());

    const fields = [
      { name: 'Категория', value: categoryName, inline: true },
      { name: 'Создатель', value: `${user.tag}`, inline: true }
    ];

    if (reportedTarget) {
      fields.push({ name: '🚨 Обвиняемый / На кого репорт', value: `**${reportedTarget}**`, inline: true });
    }
    if (reason) {
      fields.push({ name: '📋 Описание / Причина', value: reason, inline: false });
    }

    fields.push({ name: '⚠️ Примечание', value: 'Обвиняемый член персонала НЕ имееет права берется за свой репорт, но может приводить аргументы в этом чате.', inline: false });

    const ticketEmbed = createEmbed({
      title: `🎫 Приватно Обращение: ${categoryName}`,
      description: `Здравствуйте, ${user}! Ваша заявка зарегистрирована. Администрация ответит вам в ближайшее время.`,
      color: categoryKey === 'report' ? COLORS.ERROR : COLORS.SUCCESS,
      fields
    });

    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_claim').setLabel('👤 Взять тикет').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Закрыть').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_transcript').setLabel('📁 Транскрипт').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_ping_staff').setLabel('🔔 Позвать админа').setStyle(ButtonStyle.Primary)
    );

    await ticketChannel.send({ content: `${user} ${reportedUserId ? `<@${reportedUserId}>` : ''}`, embeds: [ticketEmbed], components: [buttonsRow] });
    await interaction.editReply({ embeds: [successEmbed(`Ваш тикет успешно создан: ${ticketChannel}`)] });

    logToAudit(guild, 'Тикет создан', `Пользователь ${user} создал тикет ${ticketChannel} (Категория: ${categoryName}).`, COLORS.INFO);
  } catch (err) {
    console.error('[Create Ticket Error]', err);
    await interaction.editReply({ embeds: [errorEmbed('Не удалось создать тикет. Проверьте права бота.')] });
  }
}
