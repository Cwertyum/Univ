import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { updateGuildConfig } from '../database/configManager.js';
import { createEmbed, successEmbed, errorEmbed, infoEmbed, COLORS } from '../utils/embedBuilder.js';
import { createGiveaway } from '../modules/giveawayManager.js';
import { addReminder } from '../modules/reminderManager.js';
import db from '../database/db.js';

export const data = new SlashCommandBuilder()
  .setName('util')
  .setDescription('Настройки утилит, уведомлений и серверов')
  
  // /util embed channel title description color
  .addSubcommand(sub =>
    sub.setName('embed')
      .setDescription('Отправить красивое Embed-сообщение в любой канал')
      .addChannelOption(opt => opt.setName('channel').setDescription('Канал').setRequired(true))
      .addStringOption(opt => opt.setName('title').setDescription('Заголовок').setRequired(true))
      .addStringOption(opt => opt.setName('description').setDescription('Текст').setRequired(true))
      .addStringOption(opt => opt.setName('color').setDescription('Цвет (HEX напр. #5865F2)').setRequired(false))
  )

  // /util poll question
  .addSubcommand(sub =>
    sub.setName('poll')
      .setDescription('Создать опрос для участников сервера')
      .addStringOption(opt => opt.setName('question').setDescription('Вопрос опроса').setRequired(true))
  )

  // /util remind time text
  .addSubcommand(sub =>
    sub.setName('remind')
      .setDescription('Установить себе напоминание')
      .addStringOption(opt => opt.setName('time').setDescription('Время (напр. 10m, 1h, 1d)').setRequired(true))
      .addStringOption(opt => opt.setName('text').setDescription('Текст напоминания').setRequired(true))
  )

  // /util giveaway prize winners duration
  .addSubcommand(sub =>
    sub.setName('giveaway')
      .setDescription('Запустить розыгрыш призов')
      .addStringOption(opt => opt.setName('prize').setDescription('Приз').setRequired(true))
      .addIntegerOption(opt => opt.setName('winners').setDescription('Кол-во победителей').setRequired(true))
      .addStringOption(opt => opt.setName('duration').setDescription('Длительность (напр. 30m, 2h, 1d)').setRequired(true))
  )

  // /util voice-hub channel
  .addSubcommand(sub =>
    sub.setName('voice-hub')
      .setDescription('[Админ] Установить канал "Зайти и создать"')
      .addChannelOption(opt => opt.setName('channel').setDescription('Голосовой канал').setRequired(true))
  )

  // /util audit-setup channel
  .addSubcommand(sub =>
    sub.setName('audit-setup')
      .setDescription('[Админ] Установить канал для Журнала Аудита (Логов)')
      .addChannelOption(opt => opt.setName('channel').setDescription('Канал логов').setRequired(true))
  )

  // /util afk reason
  .addSubcommand(sub =>
    sub.setName('afk')
      .setDescription('Установить AFK-статус с авто-ответом')
      .addStringOption(opt => opt.setName('reason').setDescription('Причина AFK').setRequired(false))
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;
  const user = interaction.user;

  if (subcommand === 'embed') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return await interaction.reply({ embeds: [errorEmbed('У вас нет прав на отправку сообщений!')], ephemeral: true });
    }

    const targetChannel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const hexColor = interaction.options.getString('color') || '#5865F2';

    let colorInt = COLORS.PRIMARY;
    try {
      if (hexColor.startsWith('#')) {
        colorInt = parseInt(hexColor.replace('#', ''), 16);
      }
    } catch {}

    const embed = createEmbed({ title, description, color: colorInt });
    await targetChannel.send({ embeds: [embed] });
    await interaction.reply({ embeds: [successEmbed(`Сообщение успешно отправлено в канал ${targetChannel}!`)], ephemeral: true });
  }

  else if (subcommand === 'poll') {
    const question = interaction.options.getString('question');

    const embed = createEmbed({
      title: '📊 Опрос / Голосование',
      description: question,
      color: COLORS.PRIMARY,
      footer: `Опрос создан пользователем ${user.tag}`
    });

    const pollMsg = await interaction.reply({ embeds: [embed], fetchReply: true });
    await pollMsg.react('👍');
    await pollMsg.react('👎');
  }

  else if (subcommand === 'remind') {
    const timeStr = interaction.options.getString('time');
    const text = interaction.options.getString('text');

    const ms = parseDuration(timeStr);
    if (!ms) {
      return await interaction.reply({ embeds: [errorEmbed('Неверный формат времени! Используйте напр. 10m, 1h, 1d.')], ephemeral: true });
    }

    addReminder(user.id, interaction.channel.id, text, ms);
    await interaction.reply({ embeds: [successEmbed(`Напоминание установлено на **${timeStr}**!`) ], ephemeral: true });
  }

  else if (subcommand === 'giveaway') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({ embeds: [errorEmbed('У вас нет прав на проведение розыгрышей!')], ephemeral: true });
    }

    const prize = interaction.options.getString('prize');
    const winners = interaction.options.getInteger('winners');
    const durStr = interaction.options.getString('duration');

    const durMs = parseDuration(durStr);
    if (!durMs) {
      return await interaction.reply({ embeds: [errorEmbed('Неверный формат времени! Используйте 30m, 2h, 1d.')], ephemeral: true });
    }

    await createGiveaway(interaction.client, interaction.channel, prize, winners, durMs, user);
    await interaction.reply({ embeds: [successEmbed('Розыгрыш запущен!')], ephemeral: true });
  }

  else if (subcommand === 'voice-hub') {
    const chan = interaction.options.getChannel('channel');
    if (chan.type !== ChannelType.GuildVoice) {
      return await interaction.reply({ embeds: [errorEmbed('Канал должен быть голосовым!')], ephemeral: true });
    }

    updateGuildConfig(guild.id, 'temp_voice_hub_id', chan.id);
    await interaction.reply({ embeds: [successEmbed(`Канал **${chan.name}** теперь установлен как Хаб "Зайти и создать"!`)] });
  }

  else if (subcommand === 'audit-setup') {
    const chan = interaction.options.getChannel('channel');
    updateGuildConfig(guild.id, 'audit_log_channel_id', chan.id);
    await interaction.reply({ embeds: [successEmbed(`Канал **${chan.name}** установлен для Журнала Аудита (Логов).`)] });
  }

  else if (subcommand === 'afk') {
    const reason = interaction.options.getString('reason') || 'Занят / Отсутствую';
    db.prepare(`
      INSERT INTO users (guild_id, user_id, afk_reason) VALUES (?, ?, ?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET afk_reason = ?
    `).run(guild.id, user.id, reason, reason);

    await interaction.reply({ embeds: [infoEmbed(`Вы установили AFK-статус. **Причина:** ${reason}`)] });
  }
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2];

  if (unit === 's') return num * 1000;
  if (unit === 'm') return num * 60 * 1000;
  if (unit === 'h') return num * 60 * 60 * 1000;
  if (unit === 'd') return num * 24 * 60 * 60 * 1000;
  return null;
}
