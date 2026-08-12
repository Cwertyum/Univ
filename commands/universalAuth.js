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
  .setDescription('❄️ Заморозить свой (или чужой для Админов) аккаунт в Minecraft')
  .addStringOption(option =>
    option.setName('player')
      .setDescription('Никнейм игрока (Оставьте пустым для своего аккаунта)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Причина заморозки')
      .setRequired(false)
  );

export const dataMcUnfreeze = new SlashCommandBuilder()
  .setName('mc-unfreeze')
  .setDescription('🔥 Разморозить свой (или чужой для Админов) аккаунт в Minecraft')
  .addStringOption(option =>
    option.setName('player')
      .setDescription('Никнейм игрока (Оставьте пустым для своего аккаунта)')
      .setRequired(false)
  );

export const dataMcKick = new SlashCommandBuilder()
  .setName('mc-kick')
  .setDescription('👢 Кикнуть свой аккаунт (или чужой для Админов) с сервера Minecraft')
  .addStringOption(option =>
    option.setName('player')
      .setDescription('Никнейм игрока (Оставьте пустым для своего аккаунта)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Причина кика')
      .setRequired(false)
  );

export const dataMcChangePass = new SlashCommandBuilder()
  .setName('mc-changepass')
  .setDescription('🔑 Изменить пароль своего (или чужого для Админов) аккаунта Minecraft')
  .addStringOption(option =>
    option.setName('newpassword')
      .setDescription('Новый пароль')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('player')
      .setDescription('Никнейм игрока (Только для Админов!)')
      .setRequired(false)
  );

export const dataMcUserInfo = new SlashCommandBuilder()
  .setName('mc-userinfo')
  .setDescription('📋 Информация об аккаунте игрока Minecraft (IP, 2FA, Статус)')
  .addStringOption(option =>
    option.setName('player')
      .setDescription('Никнейм игрока (Оставьте пустым для своего профиля)')
      .setRequired(false)
  );

// SHA256 Password Hash Helper (salt + password hash compatible with plugin)
function hashPassword(password, salt = 'UniversalAuthSalt2026') {
  return '$SHA$' + salt + '$' + crypto.createHash('sha256').update(password + salt).digest('hex');
}

/**
 * Helper to resolve target player and check permissions:
 * - Regular user: Can ONLY manage their OWN linked Minecraft account!
 * - Admin user (BanMembers / KickMembers / Admin): Can manage ANY player.
 */
function resolveTargetPlayer(interaction, inputPlayer) {
  const linkedPlayer = db.getAuthPlayerByDiscordId(interaction.user.id);
  const isAdmin = Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );

  if (!inputPlayer || inputPlayer.trim().length === 0) {
    if (!linkedPlayer) {
      return { error: 'ℹ️ **К вашему Discord аккаунту не привязан ни один профиль Minecraft.** Зайдите на сервер и введите `/2fa`.' };
    }
    return { player: linkedPlayer, targetUsername: linkedPlayer.username, isSelf: true };
  }

  const cleanInput = inputPlayer.trim().toLowerCase();

  if (linkedPlayer && linkedPlayer.username.toLowerCase() === cleanInput) {
    return { player: linkedPlayer, targetUsername: linkedPlayer.username, isSelf: true };
  }

  if (!isAdmin) {
    return { error: '⛔ **Ошибка доступа!** Вы можете управлять (кикать, замораживать, менять пароль) только **своим собственным аккаунтом Minecraft**!' };
  }

  const foundPlayer = db.getAuthPlayer(cleanInput) || { username: cleanInput, display_name: inputPlayer.trim() };
  return { player: foundPlayer, targetUsername: cleanInput, isSelf: false };
}

// ── Command Handlers ──────────────────────────────────────────
export async function executeActivate(interaction) {
  const keyInput = interaction.options.getString('key').trim();
  let player = db.getAuthPlayerBySecretKey(keyInput);

  if (!player) {
    const allPlayers = db.getAllAuthPlayers();
    player = allPlayers.find(p => p.secret_key && p.secret_key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === keyInput.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
  }

  if (!player && /^UA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(keyInput)) {
    const autoUsername = `player_${interaction.user.id.slice(-6)}`;
    player = {
      username: autoUsername,
      display_name: interaction.user.username,
      is_2fa_enabled: true,
      discord_id: interaction.user.id,
      secret_key: null
    };
    db.saveAuthPlayer(player);
  }

  if (!player) {
    return await interaction.reply({
      content: '❌ **Неверный ключ активации!** Убедитесь, что вы правильно скопировали код из Minecraft (`/2fa`).',
      ephemeral: true
    });
  }

  player.is_2fa_enabled = true;
  player.discord_id = interaction.user.id;
  player.secret_key = null;
  db.saveAuthPlayer(player);

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
  const inputPlayer = interaction.options.getString('player');
  const reason = interaction.options.getString('reason') || 'Заморожено владельцем аккаунта / безопасности';

  const res = resolveTargetPlayer(interaction, inputPlayer);
  if (res.error) {
    return await interaction.reply({ content: res.error, ephemeral: true });
  }

  const player = res.player;
  player.is_frozen = true;
  db.saveAuthPlayer(player);

  sendCommandToPlugin('FREEZE_PLAYER', { username: player.username, reason });

  const embed = new EmbedBuilder()
    .setTitle('❄️ Аккаунт Заморожен!')
    .setDescription(res.isSelf 
      ? `Вы успешно заморозили **свой собственный аккаунт ${player.display_name}**! Вход на сервер для вашей безопасности заблокирован.`
      : `Аккаунт **${player.display_name}** успешно заморожен администратором.`)
    .addFields({ name: '📝 Причина', value: reason })
    .setColor(0x3b82f6)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeMcUnfreeze(interaction) {
  const inputPlayer = interaction.options.getString('player');

  const res = resolveTargetPlayer(interaction, inputPlayer);
  if (res.error) {
    return await interaction.reply({ content: res.error, ephemeral: true });
  }

  const player = res.player;
  player.is_frozen = false;
  db.saveAuthPlayer(player);

  sendCommandToPlugin('UNFREEZE_PLAYER', { username: player.username });

  const embed = new EmbedBuilder()
    .setTitle('🔥 Аккаунт Разморожен!')
    .setDescription(res.isSelf
      ? `Вы успешно разморозили **свой собственный аккаунт ${player.display_name}**! Теперь вы снова можете заходить на сервер.`
      : `Аккаунт **${player.display_name}** разморожен администратором.`)
    .setColor(0x22c55e)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeMcKick(interaction) {
  const inputPlayer = interaction.options.getString('player');
  const reason = interaction.options.getString('reason') || 'Кик по запросу владельца через Discord';

  const res = resolveTargetPlayer(interaction, inputPlayer);
  if (res.error) {
    return await interaction.reply({ content: res.error, ephemeral: true });
  }

  sendCommandToPlugin('KICK_PLAYER', { username: res.targetUsername, reason });

  const embed = new EmbedBuilder()
    .setTitle('👢 Команда Кика Отправлена')
    .setDescription(res.isSelf
      ? `Запрос на кик **вашего собственного аккаунта ${res.targetUsername}** с сервера Minecraft отправлен.`
      : `Запрос на кик игрока **${res.targetUsername}** отправлен администратором.`)
    .addFields({ name: '📝 Причина', value: reason })
    .setColor(0xeab308)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeMcChangePass(interaction) {
  const inputPlayer = interaction.options.getString('player');
  const newPassword = interaction.options.getString('newpassword').trim();

  const res = resolveTargetPlayer(interaction, inputPlayer);
  if (res.error) {
    return await interaction.reply({ content: res.error, ephemeral: true });
  }

  const newHash = hashPassword(newPassword);
  res.player.password_hash = newHash;
  db.saveAuthPlayer(res.player);

  sendCommandToPlugin('CHANGE_PASS', {
    username: res.targetUsername,
    newPasswordHash: newHash
  });

  const embed = new EmbedBuilder()
    .setTitle('🔑 Пароль Успешно Изменен')
    .setDescription(res.isSelf
      ? `Пароль от **вашего собственного аккаунта ${res.targetUsername}** в Minecraft был успешно изменен!`
      : `Пароль от аккаунта **${res.targetUsername}** был успешно изменен администратором.`)
    .setColor(0x22c55e)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export async function executeMcUserInfo(interaction) {
  const inputPlayer = interaction.options.getString('player');

  const res = resolveTargetPlayer(interaction, inputPlayer);
  if (res.error) {
    return await interaction.reply({ content: res.error, ephemeral: true });
  }

  const player = res.player;

  const embed = new EmbedBuilder()
    .setTitle(`📋 Профиль Игрока: ${player.display_name || res.targetUsername}`)
    .addFields(
      { name: '👤 Никнейм', value: `\`${player.display_name || res.targetUsername}\``, inline: true },
      { name: '🌐 IP Адрес', value: `\`${player.ip_address || '127.0.0.1'}\``, inline: true },
      { name: '🔒 2FA Защита', value: player.is_2fa_enabled ? '✅ Включена' : '❌ Отключена', inline: true },
      { name: '❄️ Заморозка', value: player.is_frozen ? '❄️ Заморожен' : '🟢 Активен', inline: true },
      { name: '📅 Регистрация', value: player.registration_date ? `<t:${Math.floor(player.registration_date / 1000)}:f>` : 'Неизвестно', inline: true }
    )
    .setColor(0x3b82f6)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
