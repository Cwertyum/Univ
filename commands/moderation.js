import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import db from '../database/db.js';
import { getGuildConfig, updateGuildConfig } from '../database/configManager.js';
import { successEmbed, errorEmbed, infoEmbed, COLORS, createEmbed, raidShieldEmbed } from '../utils/embedBuilder.js';
import { logToAudit } from '../utils/logger.js';
import { setRaidMode, getAntiRaidStatus } from '../modules/antiRaid.js';

export const data = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Команды модерации и настройки авто-мода')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  
  // /mod warn @user reason
  .addSubcommand(sub =>
    sub.setName('warn')
      .setDescription('Выдать предупреждение (варн) участнику')
      .addUserOption(opt => opt.setName('user').setDescription('Пользователь').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Причина').setRequired(false))
  )
  
  // /mod unwarn @user
  .addSubcommand(sub =>
    sub.setName('unwarn')
      .setDescription('Снять одно предупреждение у пользователя')
      .addUserOption(opt => opt.setName('user').setDescription('Пользователь').setRequired(true))
  )
  
  // /mod warns @user
  .addSubcommand(sub =>
    sub.setName('warns')
      .setDescription('Посмотреть историю варнов участника')
      .addUserOption(opt => opt.setName('user').setDescription('Пользователь').setRequired(true))
  )

  // /mod mute @user duration_minutes reason
  .addSubcommand(sub =>
    sub.setName('mute')
      .setDescription('Временно замутить (Таймаут) участника')
      .addUserOption(opt => opt.setName('user').setDescription('Пользователь').setRequired(true))
      .addIntegerOption(opt => opt.setName('minutes').setDescription('Длительность в минутах').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Причина').setRequired(false))
  )

  // /mod unmute @user
  .addSubcommand(sub =>
    sub.setName('unmute')
      .setDescription('Снять мут (таймаут) с участника')
      .addUserOption(opt => opt.setName('user').setDescription('Пользователь').setRequired(true))
  )

  // /mod clear amount
  .addSubcommand(sub =>
    sub.setName('clear')
      .setDescription('Очистить указанное количество сообщений в канале')
      .addIntegerOption(opt => opt.setName('amount').setDescription('Количество (1-100)').setRequired(true))
  )

  // /mod automod badwords/links/caps/spam
  .addSubcommand(sub =>
    sub.setName('automod')
      .setDescription('Настройка модулей автомодерации')
      .addStringOption(opt =>
        opt.setName('feature')
          .setDescription('Выберите функцию')
          .setRequired(true)
          .addChoices(
            { name: 'Фильтр плохих слов', value: 'automod_badwords' },
            { name: 'Фильтр ссылок', value: 'automod_links' },
            { name: 'Фильтр КАПСА', value: 'automod_caps' },
            { name: 'Анти-спам', value: 'automod_spam' }
          )
      )
      .addBooleanOption(opt => opt.setName('enabled').setDescription('Включить или выключить').setRequired(true))
  )

  // /mod raidmode enabled
  .addSubcommand(sub =>
    sub.setName('raidmode')
      .setDescription('[Админ] Экстренный режим защиты от рейдов (Блокировка входа ботов/твинков)')
      .addBooleanOption(opt => opt.setName('enabled').setDescription('Включить (true) или Выключить (false)').setRequired(true))
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;
  const config = getGuildConfig(guild.id);

  if (subcommand === 'warn') {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'Без причины';
    const member = await guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      return await interaction.reply({ embeds: [errorEmbed('Участник не найден на сервере!')], ephemeral: true });
    }

    const now = Date.now();
    db.prepare(`
      INSERT INTO warns (guild_id, user_id, moderator_id, reason, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(guild.id, targetUser.id, interaction.user.id, reason, now);

    const warnCountRow = db.prepare('SELECT COUNT(*) as count FROM warns WHERE guild_id = ? AND user_id = ?').get(guild.id, targetUser.id);
    const warnCount = warnCountRow ? warnCountRow.count : 1;

    await interaction.reply({
      embeds: [successEmbed(`Выдано предупреждение пользователю ${targetUser}.\n**Причина:** ${reason}\n**Всего варнов:** ${warnCount}/${config.warn_limit}`)]
    });

    logToAudit(guild, 'Выдача предупреждения', `Модератор ${interaction.user} выдал варн пользователю ${targetUser}.\nПричина: ${reason}`, COLORS.WARNING);

    // Auto Punishment check
    if (warnCount >= config.warn_limit) {
      if (config.warn_action === 'timeout' || config.warn_action === 'mute') {
        await member.timeout(10 * 60 * 1000, `Превышен лимит предупреждений`).catch(() => {});
        await interaction.channel.send({ embeds: [errorEmbed(`${targetUser} отправлен в мут на 10 минут за превышение лимита варнов.`)] });
      }
    }
  }

  else if (subcommand === 'unwarn') {
    const targetUser = interaction.options.getUser('user');
    const lastWarn = db.prepare('SELECT id FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1').get(guild.id, targetUser.id);

    if (!lastWarn) {
      return await interaction.reply({ embeds: [errorEmbed(`У пользователя ${targetUser} нет активных предупреждений.`)], ephemeral: true });
    }

    db.prepare('DELETE FROM warns WHERE id = ?').run(lastWarn.id);
    await interaction.reply({ embeds: [successEmbed(`Одно предупреждение у ${targetUser} было успешно снято.`)] });

    logToAudit(guild, 'Снятие предупреждения', `Модератор ${interaction.user} снял варн у ${targetUser}.`, COLORS.SUCCESS);
  }

  else if (subcommand === 'warns') {
    const targetUser = interaction.options.getUser('user');
    const warns = db.prepare('SELECT * FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY id DESC').all(guild.id, targetUser.id);

    if (warns.length === 0) {
      return await interaction.reply({ embeds: [infoEmbed(`У пользователя ${targetUser} нет предупреждений!`) ] });
    }

    const fields = warns.map((w, index) => ({
      name: `#${index + 1} | Выдал: <@${w.moderator_id}> | <t:${Math.floor(w.timestamp / 1000)}:R>`,
      value: `**Причина:** ${w.reason}`,
      inline: false
    }));

    const embed = createEmbed({
      title: `⚠️ История предупреждений: ${targetUser.tag}`,
      description: `Всего предупреждений: **${warns.length} / ${config.warn_limit}**`,
      color: COLORS.WARNING,
      fields
    });

    await interaction.reply({ embeds: [embed] });
  }

  else if (subcommand === 'mute') {
    const targetUser = interaction.options.getUser('user');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason') || 'Без причины';
    const member = await guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      return await interaction.reply({ embeds: [errorEmbed('Участник не найден!')], ephemeral: true });
    }

    await member.timeout(minutes * 60 * 1000, reason).catch(() => {});
    await interaction.reply({ embeds: [successEmbed(`Пользователь ${targetUser} отправлен в мут на **${minutes} минут**.\n**Причина:** ${reason}`)] });

    logToAudit(guild, 'Выдача мута', `Модератор ${interaction.user} замутил ${targetUser} на ${minutes} мин.\nПричина: ${reason}`, COLORS.ERROR);
  }

  else if (subcommand === 'unmute') {
    const targetUser = interaction.options.getUser('user');
    const member = await guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      return await interaction.reply({ embeds: [errorEmbed('Участник не найден!')], ephemeral: true });
    }

    await member.timeout(null).catch(() => {});
    await interaction.reply({ embeds: [successEmbed(`Мут с пользователя ${targetUser} успешно снят.`)] });
  }

  else if (subcommand === 'clear') {
    const amount = interaction.options.getInteger('amount');
    if (amount < 1 || amount > 100) {
      return await interaction.reply({ embeds: [errorEmbed('Укажите количество от 1 до 100.')], ephemeral: true });
    }

    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
    const count = deleted ? deleted.size : 0;

    await interaction.reply({ embeds: [successEmbed(`Успешно удалено **${count}** сообщений.`)], ephemeral: true });
  }

  else if (subcommand === 'automod') {
    const feature = interaction.options.getString('feature');
    const enabled = interaction.options.getBoolean('enabled');

    updateGuildConfig(guild.id, feature, enabled ? 1 : 0);

    const featureNames = {
      automod_badwords: 'Фильтр плохих слов',
      automod_links: 'Фильтр ссылок',
      automod_caps: 'Фильтр КАПСА',
      automod_spam: 'Анти-спам'
    };

    await interaction.reply({
      embeds: [successEmbed(`Модуль **${featureNames[feature]}** был успешно **${enabled ? 'ВКЛЮЧЕН ✅' : 'ВЫКЛЮЧЕН ❌'}**.`)]
    });
  }

  else if (subcommand === 'raidmode') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({ embeds: [errorEmbed('Только Администраторы могут управлять режимом Raid Mode!')], ephemeral: true });
    }

    const enabled = interaction.options.getBoolean('enabled');
    const status = setRaidMode(guild.id, enabled, 30);

    logToAudit(
      guild,
      `🚨 RAID MODE ${enabled ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'} АДМИНИСТРАТОРОМ`,
      `Администратор ${interaction.user.tag} вручную **${enabled ? 'АКТИВИРОВАЛ' : 'ДЕАКТИВИРОВАЛ'}** режим экстренной защиты от рейдов!`,
      enabled ? COLORS.CRIMSON : COLORS.SUCCESS
    );

    await interaction.reply({
      embeds: [raidShieldEmbed(
        enabled 
          ? `🚨 **РЕЖИМ БЛОКИРОВКИ СЕРВЕРА (RAID MODE) УСПЕШНО ВКЛЮЧЕН!**\n` +
            `• Свежие аккаунты (< 7 дней) и спам-боты будут авто-кикаться.\n` +
            `• Статус: **АКТИВЕН НА 30 МИНУТ**.`
          : `✅ **Режим экстренной защиты от рейдов ВЫКЛЮЧЕН.** Сервер работает в штатном режиме.`
      )]
    });
  }
}
