import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import crypto from 'crypto';
import db from '../database/db.js';
import { sendCommandToPlugin } from '../modules/universalAuthBridge.js';

// ── Slash Command Definitions ────────────────────────────────
export const dataActivate = new SlashCommandBuilder()
  .setName('activate')
  .setDescription('Активировать 2FA привязку к Minecraft аккаунту по секретному ключу')
  .addStringOption(option =>
    option.setName('key')
      .setDescription('Сложный ключ активации из Minecraft (получен через /2fa)')
      .setRequired(true)
  );

export const data2FADiscord = new SlashCommandBuilder()
  .setName('2fa-discord')
  .setDescription('Управление двухфакторной аутентификацией (2FA)')
  .addStringOption(option =>
    option.setName('action')
      .setDescription('Выберите действие')
      .setRequired(false)
      .addChoices(
        { name: '📊 Проверить статус 2FA', value: 'status' },
        { name: '❌ Отключить 2FA', value: 'disable' }
      )
  );

export const dataMcFreeze = new SlashCommandBuilder()
  .setName('mc-freeze')
  .setDescription('❄️ Заморозить аккаунт игрока в Minecraft (запрет на вход)')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addStringOption(option =>
    option.setName('player')
      .setDescription('Никнейм игрока Minecraft')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Причина заморозки')
      .setRequired(false)
  );

export const dataMcUnfreeze = new SlashCommandBuilder()
  .setName('mc-unfreeze')
  .setDescription('🔥 Разморозить аккаунт игрока в Minecraft')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addStringOption(option =>
    option.setName('player')
      .setDescription('Никнейм игрока Minecraft')
      .setRequired(true)
  );

export const dataMcKick = new SlashCommandBuilder()
  .setName('mc-kick')
  .setDescription('👢 Кикнуть игрока с сервера Minecraft')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addStringOption(option =>
    option.setName('player')
      .setDescription('Никнейм игрока Minecraft')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Причина кика')
      .setRequired(false)
  );

export const dataMcChangePass = new SlashCommandBuilder()
  .setName('mc-changepass')
  .setDescription('🔑 Изменить пароль от аккаунта Minecraft игрока')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(option =>
    option.setName('player')
      .setDescription('Никнейм игрока Minecraft')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('newpassword')
      .setDescription('Новый пароль')
      .setRequired(true)
  );

export const dataMcUserInfo = new SlashCommandBuilder()
  .setName('mc-userinfo')
  .setDescription('📋 Информация об аккаунте игрока Minecraft (IP, 2FA, Статус)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addStringOption(option =>
    option.setName('player')
      .setDescription('Никнейм игрока Minecraft')
      .setRequired(true)
  );

// SHA256 Password Hash Helper (salt + password hash compatible with plugin)
function hashPassword(password, salt = 'UniversalAuthSalt2026') {
  return '$SHA$' + salt + '$' + crypto.createHash('sha256').update(password + salt).digest('hex');
}

// ── Command Handlers ──────────────────────────────────────────
export async function executeActivate(interaction) {
  const keyInput = interaction.options.getString('key').trim();
  const player = db.getAuthPlayerBySecretKey(keyInput);

  if (!player) {
    return await interaction.reply({
      content: '❌ **Неверный ключ активации!** Убедитесь, что вы ввели код правильно из Minecraft (`/2fa`).',
      ephemeral: true
    });
  }

  // Link Discord account
  player.is_2fa_enabled = true;
  player.discord_id = interaction.user.id;
  player.secret_key = null; // Clear used secret key
  db.saveAuthPlayer(player);

  // Notify Plugin via Bridge
  sendCommandToPlugin('2FA_ACTIVATED', {
    username: player.username,
    discordId: interaction.user.id
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ 2FA Успешно Подключена!')
    .setDescription(`Ваш Discord аккаунт **${interaction.user.tag}** был успешно привязан к профилю **${player.display_name}** в Minecraft!`)
    .addFields(
      { name: '🛡️ Защита', value: 'Теперь при входе на сервер вы будете получать запрос с кнопками подтверждения в ЛС Discord.', inline: false }
    )
    .setColor(0x22c55e)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function execute2FADiscord(interaction) {
  const action = interaction.options.getString('action') || 'status';
  const player = db.getAuthPlayerByDiscordId(interaction.user.id);

  if (!player) {
    return await interaction.reply({
      content: 'ℹ️ **К вашему Discord аккаунту не привязан ни один профиль Minecraft.** Зайдите на сервер и введите `/2fa`.',
      ephemeral: true
    });
  }

  if (action === 'disable') {
    player.is_2fa_enabled = false;
    player.discord_id = null;
    db.saveAuthPlayer(player);

    sendCommandToPlugin('2FA_DISABLED', { username: player.username });

    return await interaction.reply({
      content: `❌ **2FA отключена** для аккаунта **${player.display_name}**. Связь с Discord удалена.`
    });
  }

  // Action status
  const embed = new EmbedBuilder()
    .setTitle(`🛡️ Статус 2FA: ${player.display_name}`)
    .addFields(
      { name: '👤 Никнейм', value: `\`${player.display_name}\``, inline: true },
      { name: '🔒 2FA Включена', value: player.is_2fa_enabled ? '✅ Да' : '❌ Нет', inline: true },
      { name: '❄️ Статус аккаунта', value: player.is_frozen ? '❄️ Заморожен' : '🟢 Активен', inline: true },
      { name: '🌐 Последний IP', value: `\`${player.ip_address || '127.0.0.1'}\``, inline: true }
    )
    .setColor(0x3b82f6)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeMcFreeze(interaction) {
  const targetUsername = interaction.options.getString('player').trim();
  const reason = interaction.options.getString('reason') || 'Нарушение правил / Безопасность';

  const player = db.getAuthPlayer(targetUsername) || { username: targetUsername.toLowerCase(), display_name: targetUsername };
  player.is_frozen = true;
  db.saveAuthPlayer(player);

  sendCommandToPlugin('FREEZE_PLAYER', { username: player.username, reason });

  const embed = new EmbedBuilder()
    .setTitle('❄️ Аккаунт Заморожен!')
    .setDescription(`Аккаунт **${player.display_name}** успешно заморожен. Игрок не сможет зайти на сервер Minecraft.`)
    .addFields({ name: '📝 Причина', value: reason })
    .setColor(0x3b82f6)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeMcUnfreeze(interaction) {
  const targetUsername = interaction.options.getString('player').trim();
  const player = db.getAuthPlayer(targetUsername);

  if (!player) {
    return await interaction.reply({ content: `❌ Аккаунт игрока \`${targetUsername}\` не найден в Базе Данных.`, ephemeral: true });
  }

  player.is_frozen = false;
  db.saveAuthPlayer(player);

  sendCommandToPlugin('UNFREEZE_PLAYER', { username: player.username });

  const embed = new EmbedBuilder()
    .setTitle('🔥 Аккаунт Разморожен!')
    .setDescription(`Аккаунт **${player.display_name}** разморожен. Игрок снова может заходить на сервер.`)
    .setColor(0x22c55e)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeMcKick(interaction) {
  const targetUsername = interaction.options.getString('player').trim();
  const reason = interaction.options.getString('reason') || 'Кикнут администратором через Discord';

  sendCommandToPlugin('KICK_PLAYER', { username: targetUsername, reason });

  const embed = new EmbedBuilder()
    .setTitle('👢 Команда Кика Отправлена')
    .setDescription(`Запрос на кик игрока **${targetUsername}** с сервера Minecraft отправлен.`)
    .addFields({ name: '📝 Причина', value: reason })
    .setColor(0xeab308)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeMcChangePass(interaction) {
  const targetUsername = interaction.options.getString('player').trim();
  const newPassword = interaction.options.getString('newpassword').trim();

  const player = db.getAuthPlayer(targetUsername);
  if (!player) {
    return await interaction.reply({ content: `❌ Аккаунт игрока \`${targetUsername}\` не найден в Базе Данных.`, ephemeral: true });
  }

  const hash = hashPassword(newPassword);
  player.password_hash = hash;
  db.saveAuthPlayer(player);

  sendCommandToPlugin('CHANGE_PASS', { username: player.username, newPasswordHash: hash });

  const embed = new EmbedBuilder()
    .setTitle('🔑 Пароль Успешно Изменен')
    .setDescription(`Пароль для аккаунта **${player.display_name}** был успешно обновлен!`)
    .setColor(0x22c55e)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function executeMcUserInfo(interaction) {
  const targetUsername = interaction.options.getString('player').trim();
  const player = db.getAuthPlayer(targetUsername);

  if (!player) {
    return await interaction.reply({ content: `❌ Аккаунт игрока \`${targetUsername}\` не найден в Базе Данных.`, ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle(`📋 Профиль Игрока: ${player.display_name}`)
    .addFields(
      { name: '👤 Никнейм', value: `\`${player.display_name}\``, inline: true },
      { name: '🌐 IP Адрес', value: `\`${player.ip_address || '127.0.0.1'}\``, inline: true },
      { name: '🛡️ 2FA Статус', value: player.is_2fa_enabled ? '✅ Включена' : '❌ Отключена', inline: true },
      { name: '❄️ Статус Заморозки', value: player.is_frozen ? '❄️ Заморожен' : '🟢 Активен', inline: true },
      { name: '💬 Discord ID', value: player.discord_id ? `<@${player.discord_id}> (\`${player.discord_id}\`)` : '❌ Не привязан', inline: true },
      { name: '📅 Дата регистрации', value: `<t:${Math.floor((player.registration_date || Date.now()) / 1000)}:f>`, inline: false },
      { name: '🕒 Последний вход', value: `<t:${Math.floor((player.last_login || Date.now()) / 1000)}:R>`, inline: false }
    )
    .setColor(0x3b82f6)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
