import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType,
  MessageFlags
} from 'discord.js';
import { createEmbed, COLORS, successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('rules')
  .setDescription('Правила проекта Universal Realms (получить в ЛС или вывесить в канал)')
  
  // Subcommand 1: Send to DM (Available for EVERY player)
  .addSubcommand(sub =>
    sub.setName('get')
      .setDescription('Получить полный свод правил Universal Realms в Личные Сообщения')
  )

  // Subcommand 2: Post to current channel (Admin Only)
  .addSubcommand(sub =>
    sub.setName('post')
      .setDescription('[Админ] Вывесить правила в текущем канале')
  )

  // Subcommand 3: Setup Rules Channel (Admin Only)
  .addSubcommand(sub =>
    sub.setName('setup-channel')
      .setDescription('[Админ] Автоматически создать канал 📜・правила и вывесить свод правил')
  );

export async function execute(interaction) {
  const { guild, member, user } = interaction;
  
  let subcommand = 'get';
  try {
    subcommand = interaction.options.getSubcommand();
  } catch {}

  const embed1 = createEmbed({
    title: `📜 РЕГЛАМЕНТ И ПРАВИЛА ПРОЕКТА UNIVERSAL REALMS`,
    description: `Добро пожаловать на проект **Universal Realms**! Ниже представлен официальный свод правил.\n\n` +
      `**§ 1. ОБЩИЕ ПРАВИЛА**\n` +
      `> **1.1.** Уважайте участников сервера и Администрацию проекта.\n` +
      `> **1.2.** Запрещены любые проявления токсичности, провокации и деструктивное поведение.\n` +
      `> **1.3.** Запрещены шок-контент, 18+ материалы и распространение вредоносных ссылок.\n\n` +
      `**§ 2. ТЕКСТОВЫЕ ЧАТЫ И АВТО-МОДЕРАЦИЯ**\n` +
      `> **2.1. Мат и ненормативная лексика** → Запрещено. *(Наказание: Предупреждение / Мут)*\n` +
      `> **2.2. Реклама и сторонние ссылки** → Запрещено. *(Наказание: Авто-удаление + Варн)*\n` +
      `> **2.3. Массовый КАПС (≥ 50%)** → Запрещено. *(Наказание: Авто-удаление + Варн)*\n` +
      `> **2.4. Флуд и дубликаты сообщений** → Запрещено. *(Наказание: Таймаут на 10 мин)*\n` +
      `> **2.5. Массовые упоминания (@everyone / @here / > 4 меншенов)** → Запрещено. *(Наказание: Мут на 30 мин)*`,
    color: COLORS.GOLD
  });

  const embed2 = createEmbed({
    title: `🎙️ ГОЛОСОВЫЕ КАНАЛЫ, БРАКИ И ШТАБЫ СТАФФА`,
    description: `**§ 3. ГОЛОСОВЫЕ КАНАЛЫ И ПЛЕЕР**\n` +
      `> **3.1.** Запрещено включение посторонних громких звуков, пищалок и музыки без согласия в комнате.\n` +
      `> **3.2.** Запрещена помеха работе Кураторов, Модераторов и Билдеров.\n\n` +
      `**§ 4. СИСТЕМА БРАКОВ И ТИКЕТОВ**\n` +
      `> **4.1.** Предложение брака (\`/marry propose\`) автоматически создает семейную роль.\n` +
      `> **4.2.** При подаче жалобы через тикет обвиняемый сотрудник не может взять свой репорт.\n\n` +
      `**§ 5. НАКАЗАНИЯ И ВАРНЫ**\n` +
      `> **5.1.** Накопление **3 предупреждений (варнов)** ведет к автоматическому Муту или Бану.`,
    color: COLORS.PRIMARY,
    footer: 'Соблюдение правил обязательно для всех участников Universal Realms!'
  });

  // 1. Post to current channel (Admin Only)
  if (subcommand === 'post') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({
        embeds: [errorEmbed('У вас нет прав Администратора для публикации правил!')],
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.channel.send({ embeds: [embed1, embed2] });
    return await interaction.reply({
      embeds: [successEmbed('Официальный свод правил Universal Realms успешно опубликован в этом канале!')],
      flags: MessageFlags.Ephemeral
    });
  }

  // 2. Setup Rules Channel (Admin Only)
  if (subcommand === 'setup-channel') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({
        embeds: [errorEmbed('У вас нет прав Администратора для настройки канала правил!')],
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    let rulesChannel = guild.channels.cache.find(c => c.name === '📜・правила' || c.name === '📜・правила-сервера');

    if (!rulesChannel) {
      rulesChannel = await guild.channels.create({
        name: '📜・правила',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions]
          },
          {
            id: guild.client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]
          }
        ]
      });
    }

    await rulesChannel.send({ embeds: [embed1, embed2] });
    return await interaction.editReply({
      embeds: [successEmbed(`Канал ${rulesChannel} успешно создан/обновлен, и правила вывешены!`)]
    });
  }

  // Default / get / fallback: Send rules to DM or ephemeral
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  try {
    await user.send({ embeds: [embed1, embed2] });
    await interaction.editReply({
      embeds: [successEmbed(`📩 Свод правил проекта **Universal Realms** успешно отправлен вам в Личные Сообщения!`)]
    });
  } catch (dmErr) {
    await interaction.editReply({
      content: `⚠️ У вас закрыты Личные Сообщения в Discord. Правила представлены ниже:`,
      embeds: [embed1, embed2]
    });
  }
}
