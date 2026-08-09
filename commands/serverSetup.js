import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType 
} from 'discord.js';
import { updateGuildConfig } from '../database/configManager.js';
import { sendTicketPanel } from '../modules/ticketManager.js';
import { createEmbed, COLORS, successEmbed, errorEmbed } from '../utils/embedBuilder.js';

// Categories to clean on full recreate
const TARGET_CATEGORIES = [
  '✨ │ ВАЖНОЕ И ИНФО',
  '📜 │ ЗАДАНИЯ И КВЕСТЫ',
  '💬 │ ОБЩЕСТВЕННЫЕ ЧАТЫ',
  '🎫 │ ПОДДЕРЖКА И ИНФО',
  '🔊 │ ГОЛОСОВОЙ ЦЕНТР',
  '⚙️ │ ШТАБ ПЕРСОНАЛА',
  '👑 │ ШТАБ АДМИНИСТРАЦИИ',
  '🔮 │ ШТАБ КУРАТОРОВ',
  '🛡️ │ ШТАБ МОДЕРАТОРОВ',
  '🔰 │ ШТАБ ХЕЛПЕРОВ',
  '🏗️ │ ШТАБ БИЛДЕРОВ',
  '🧪 │ ШТАБ ТЕСТИРОВЩИКОВ',
  '📌 │ ИНФОРМАЦИЯ',
  '💬 │ ОБЩЕНИЕ',
  '🎫 │ ПОДДЕРЖКА',
  '🔊 │ ГОЛОСОВЫЕ КОМНАТЫ',
  '⚙️ │ АДМИНИСТРИРОВАНИЕ'
];

async function createOrReplaceChannel(guild, options) {
  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
  const existing = channels.find(c => c && c.name === options.name);
  if (existing) {
    await existing.delete('Удаление дубликата канала при авто-настройке').catch(() => {});
  }
  return await guild.channels.create(options);
}

// /channel-create
export const channelCreateData = new SlashCommandBuilder()
  .setName('channel-create')
  .setDescription('Управление и авто-создание каналов сервера')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  
  .addSubcommand(sub =>
    sub.setName('full')
      .setDescription('[Админ] Развернуть идеальную структуру 35+ каналов с заданиями и отчетами персонала')
  )

  .addSubcommand(sub =>
    sub.setName('single')
      .setDescription('[Админ] Добавить 1 отдельный канал (не трогая другие каналы!)')
      .addStringOption(opt => opt.setName('name').setDescription('Название канала').setRequired(true))
      .addStringOption(opt => 
        opt.setName('type')
          .setDescription('Тип канала')
          .setRequired(true)
          .addChoices(
            { name: 'Текстовый', value: 'text' },
            { name: 'Голосовой', value: 'voice' }
          )
      )
      .addChannelOption(opt => opt.setName('category').setDescription('Категория для размещения').setRequired(false))
  );

export async function executeChannelCreate(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return await interaction.reply({ 
      embeds: [errorEmbed('⛔ У вас нет прав Администратора!')], 
      ephemeral: true 
    });
  }

  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;

  // Single channel addition
  if (subcommand === 'single') {
    const name = interaction.options.getString('name');
    const typeStr = interaction.options.getString('type');
    const category = interaction.options.getChannel('category');

    const channelType = typeStr === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
    const parentId = category ? category.id : null;

    try {
      const newChan = await createOrReplaceChannel(guild, {
        name,
        type: channelType,
        parent: parentId
      });

      return await interaction.reply({
        embeds: [successEmbed(`Отдельный канал ${newChan} успешно создан!`)],
        ephemeral: true
      });
    } catch (err) {
      console.error('[Single Channel Error]', err);
      return await interaction.reply({ embeds: [errorEmbed('Не удалось создать отдельный канал!')], ephemeral: true });
    }
  }

  // Full setup creation
  if (subcommand === 'full') {
    await interaction.deferReply();

    try {
      // Step 0: Cleanup old setup categories if existing
      const allChannels = await guild.channels.fetch();
      const oldCategories = allChannels.filter(c => 
        c.type === ChannelType.GuildCategory && TARGET_CATEGORIES.includes(c.name)
      );

      for (const cat of oldCategories.values()) {
        const children = allChannels.filter(c => c.parentId === cat.id);
        for (const child of children.values()) {
          await child.delete('Удаление старых каналов').catch(() => {});
        }
        await cat.delete('Удаление старой категории').catch(() => {});
      }

      // Fetch Staff Roles for exact permissions
      const ownerRole = guild.roles.cache.find(r => r.name.includes('Владелец'));
      const techRole = guild.roles.cache.find(r => r.name.includes('Технический'));
      const adminRole = guild.roles.cache.find(r => r.name.includes('Администратор'));
      const curatorRole = guild.roles.cache.find(r => r.name.includes('Куратор'));
      const modRole = guild.roles.cache.find(r => r.name.includes('Модератор'));
      const helperRole = guild.roles.cache.find(r => r.name.includes('Хелпер'));
      const builderRole = guild.roles.cache.find(r => r.name.includes('Билдер'));
      const testerRole = guild.roles.cache.find(r => r.name.includes('Тестировщик'));

      // Higher Staff Overwrites for Read-Only Channels (Only Bot, Owners, Techs, Admins, Curators can type!)
      const botId = guild.members.me?.id || guild.client.user.id;
      const higherStaffOverwrites = [
        { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ];

      if (ownerRole) higherStaffOverwrites.push({ id: ownerRole.id, allow: [PermissionFlagsBits.SendMessages] });
      if (techRole) higherStaffOverwrites.push({ id: techRole.id, allow: [PermissionFlagsBits.SendMessages] });
      if (adminRole) higherStaffOverwrites.push({ id: adminRole.id, allow: [PermissionFlagsBits.SendMessages] });
      if (curatorRole) higherStaffOverwrites.push({ id: curatorRole.id, allow: [PermissionFlagsBits.SendMessages] });

      // 1. Category 1: ✨ │ ВАЖНОЕ И ИНФО (Только Высший Персонал!)
      const infoCat = await createOrReplaceChannel(guild, { name: '✨ │ ВАЖНОЕ И ИНФО', type: ChannelType.GuildCategory });
      
      const rulesChan = await createOrReplaceChannel(guild, { 
        name: '📜・правила-сервера', 
        type: ChannelType.GuildText, 
        parent: infoCat.id,
        permissionOverwrites: higherStaffOverwrites
      });
      
      const rulesEmbed1 = createEmbed({
        title: `📜 ПРАВИЛА И РЕГЛАМЕНТ СЕРВЕРА UNIVERSAL REALMS`,
        description: `Добро пожаловать! Ниже представлен официальный свод правил проекта.\n\n` +
          `**§ 1. ОБЩИЕ ПРАВИЛА**\n` +
          `> **1.1.** Уважайте других участников и администрацию проекта.\n` +
          `> **1.2.** Запрещены любые проявления токсичности, провокации и деструктивное поведение.\n` +
          `> **1.3.** Запрещены шок-контент, 18+ материалы и вредоносные ссылки.\n\n` +
          `**§ 2. ТЕКСТОВЫЕ ЧАТЫ И АВТО-МОДЕРАЦИЯ**\n` +
          `> **2.1. Мат и ненормативная лексика** → *(Наказание: Предупреждение / Мут)*\n` +
          `> **2.2. Реклама и сторонние ссылки** → *(Наказание: Авто-удаление + Варн)*\n` +
          `> **2.3. Массовый КАПС и Спам** → *(Наказание: Таймаут)*\n` +
          `> **2.4. Массовые упоминания @everyone / @here** → *(Наказание: Варн)*`,
        color: COLORS.GOLD
      });

      await rulesChan.send({ embeds: [rulesEmbed1] });

      await createOrReplaceChannel(guild, { name: 'ℹ️・информация', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: higherStaffOverwrites });
      await createOrReplaceChannel(guild, { name: '📢・новости-проекта', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: higherStaffOverwrites });
      await createOrReplaceChannel(guild, { name: '🎁・розыгрыши', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: higherStaffOverwrites });
      const welcomeChan = await createOrReplaceChannel(guild, { name: '👋・приветствия-и-уход', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: higherStaffOverwrites });
      
      updateGuildConfig(guild.id, 'welcome_channel_id', welcomeChan.id);
      updateGuildConfig(guild.id, 'farewell_channel_id', welcomeChan.id);

      // 2. Category 2: 📜 │ ЗАДАНИЯ И КВЕСТЫ (Только Высший Персонал!)
      const questCat = await createOrReplaceChannel(guild, { name: '📜 │ ЗАДАНИЯ И КВЕСТЫ', type: ChannelType.GuildCategory });

      const taskChan = await createOrReplaceChannel(guild, {
        name: '📌・задания-проекта',
        type: ChannelType.GuildText,
        parent: questCat.id,
        permissionOverwrites: higherStaffOverwrites
      });

      await taskChan.send({
        embeds: [createEmbed({
          title: '📌 Канал Заданий Проекта',
          description: 'В этом канале **Кураторы** и **Администрация** публикуют важные задачи и квесты для сообщества!',
          color: COLORS.PRIMARY
        })]
      });

      // 3. Category 3: 💬 │ ОБЩЕСТВЕННЫЕ ЧАТЫ
      const chatCat = await createOrReplaceChannel(guild, { name: '💬 │ ОБЩЕСТВЕННЫЕ ЧАТЫ', type: ChannelType.GuildCategory });
      await createOrReplaceChannel(guild, { name: '💬・основной-чат', type: ChannelType.GuildText, parent: chatCat.id });
      await createOrReplaceChannel(guild, { name: '🤖・команды-ботов', type: ChannelType.GuildText, parent: chatCat.id });
      await createOrReplaceChannel(guild, { name: '💡・идеи-и-предложения', type: ChannelType.GuildText, parent: chatCat.id });
      await createOrReplaceChannel(guild, { name: '🎨・медиа-и-скриншоты', type: ChannelType.GuildText, parent: chatCat.id });
      await createOrReplaceChannel(guild, { name: '🏆・таблица-лидеров', type: ChannelType.GuildText, parent: chatCat.id, permissionOverwrites: higherStaffOverwrites });

      // 4. Category 4: 🎫 │ ПОДДЕРЖКА И ИНФО
      const ticketCat = await createOrReplaceChannel(guild, { name: '🎫 │ ПОДДЕРЖКА И ИНФО', type: ChannelType.GuildCategory });
      const ticketChan = await createOrReplaceChannel(guild, { name: '🎫・создать-тикет', type: ChannelType.GuildText, parent: ticketCat.id, permissionOverwrites: higherStaffOverwrites });
      await createOrReplaceChannel(guild, { name: '❓・частые-вопросы', type: ChannelType.GuildText, parent: ticketCat.id, permissionOverwrites: higherStaffOverwrites });

      updateGuildConfig(guild.id, 'ticket_category_id', ticketCat.id);
      await sendTicketPanel(ticketChan);

      // 5. Category 5: 🔊 │ ГОЛОСОВОЙ ЦЕНТР
      const voiceCat = await createOrReplaceChannel(guild, { name: '🔊 │ ГОЛОСОВОЙ ЦЕНТР', type: ChannelType.GuildCategory });
      const voiceHub = await createOrReplaceChannel(guild, { name: '➕・создать-комнату', type: ChannelType.GuildVoice, parent: voiceCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・общение-#1', type: ChannelType.GuildVoice, parent: voiceCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・общение-#2', type: ChannelType.GuildVoice, parent: voiceCat.id });
      await createOrReplaceChannel(guild, { name: '🎮・игры-и-пати', type: ChannelType.GuildVoice, parent: voiceCat.id });
      await createOrReplaceChannel(guild, { name: '💤・afk-комната', type: ChannelType.GuildVoice, parent: voiceCat.id });

      updateGuildConfig(guild.id, 'temp_voice_hub_id', voiceHub.id);

      // 6. INDIVIDUAL STAFF CATEGORIES WITH TASKS AND REPORTS

      // 👑 │ ШТАБ АДМИНИСТРАЦИИ
      const adminCat = await createOrReplaceChannel(guild, {
        name: '👑 │ ШТАБ АДМИНИСТРАЦИИ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]
      });
      await createOrReplaceChannel(guild, { name: '👑・чат-администрации', type: ChannelType.GuildText, parent: adminCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・администрация-voice', type: ChannelType.GuildVoice, parent: adminCat.id });

      // 🔮 │ ШТАБ КУРАТОРОВ (Задания & Отчеты с одобрением Высшей Администрации)
      const curatorCat = await createOrReplaceChannel(guild, {
        name: '🔮 │ ШТАБ КУРАТОРОВ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]
      });
      await createOrReplaceChannel(guild, { name: '📌・задания-кураторов', type: ChannelType.GuildText, parent: curatorCat.id });
      await createOrReplaceChannel(guild, { name: '✅・выполненные-задания', type: ChannelType.GuildText, parent: curatorCat.id });
      await createOrReplaceChannel(guild, { name: '🔮・чат-кураторов', type: ChannelType.GuildText, parent: curatorCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・кураторы-voice', type: ChannelType.GuildVoice, parent: curatorCat.id });

      // 🛡️ │ ШТАБ МОДЕРАТОРОВ (Отчеты кого замутили и доказательства)
      const modCat = await createOrReplaceChannel(guild, {
        name: '🛡️ │ ШТАБ МОДЕРАТОРОВ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]
      });
      await createOrReplaceChannel(guild, { name: '📜・отчеты-модераторов', type: ChannelType.GuildText, parent: modCat.id });
      await createOrReplaceChannel(guild, { name: '🛡️・чат-модераторов', type: ChannelType.GuildText, parent: modCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・модераторы-voice', type: ChannelType.GuildVoice, parent: modCat.id });

      // 🔰 │ ШТАБ ХЕЛПЕРОВ (Отчеты о работе хелперов)
      const helperCat = await createOrReplaceChannel(guild, {
        name: '🔰 │ ШТАБ ХЕЛПЕРОВ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]
      });
      await createOrReplaceChannel(guild, { name: '📜・отчеты-хелперов', type: ChannelType.GuildText, parent: helperCat.id });
      await createOrReplaceChannel(guild, { name: '🔰・чат-хелперов', type: ChannelType.GuildText, parent: helperCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・хелперы-voice', type: ChannelType.GuildVoice, parent: helperCat.id });

      // 🏗️ │ ШТАБ БИЛДЕРОВ (Задания & Сделанные Задания с фото ракурсов и одобрением)
      const builderCat = await createOrReplaceChannel(guild, {
        name: '🏗️ │ ШТАБ БИЛДЕРОВ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]
      });
      await createOrReplaceChannel(guild, { name: '📌・задания-билдеров', type: ChannelType.GuildText, parent: builderCat.id });
      await createOrReplaceChannel(guild, { name: '✅・сделанные-задания', type: ChannelType.GuildText, parent: builderCat.id });
      await createOrReplaceChannel(guild, { name: '🏗️・чат-билдеров', type: ChannelType.GuildText, parent: builderCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・билдеры-voice', type: ChannelType.GuildVoice, parent: builderCat.id });

      // 🧪 │ ШТАБ ТЕСТИРОВЩИКОВ
      const testerCat = await createOrReplaceChannel(guild, {
        name: '🧪 │ ШТАБ ТЕСТИРОВЩИКОВ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]
      });
      await createOrReplaceChannel(guild, { name: '🧪・чат-тестировщиков', type: ChannelType.GuildText, parent: testerCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・тестировщики-voice', type: ChannelType.GuildVoice, parent: testerCat.id });

      // System Logs
      await createOrReplaceChannel(guild, { name: '📜・история-команд', type: ChannelType.GuildText, parent: adminCat.id });
      const auditChan = await createOrReplaceChannel(guild, { name: '📝・журнал-аудита', type: ChannelType.GuildText, parent: adminCat.id });
      
      updateGuildConfig(guild.id, 'audit_log_channel_id', auditChan.id);
      updateGuildConfig(guild.id, 'ticket_log_channel_id', auditChan.id);

      try {
        await interaction.editReply({
          embeds: [successEmbed(`Полная структура 35+ каналов с заданиями билдеров/кураторов, отчетами модераторов/хелперов и защитой Высшего Персонала успешно развернута!`)]
        });
      } catch {
        await interaction.user.send({
          embeds: [successEmbed(`Каналы сервера успешно пересозданы!`)]
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[Channel Create Error]', err);
      await interaction.editReply({ embeds: [errorEmbed('Произошла ошибка при создании каналов!')] }).catch(() => {});
    }
  }
}

// /role-create
export const roleCreateData = new SlashCommandBuilder()
  .setName('role-create')
  .setDescription('[Админ] Создать иерархию ролей для Администрации, Кураторов и Персонала')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function executeRoleCreate(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return await interaction.reply({ 
      embeds: [errorEmbed('⛔ У вас нет прав Администратора!')], 
      ephemeral: true 
    });
  }

  await interaction.deferReply();
  const guild = interaction.guild;

  try {
    const rolesConfig = [
      { name: '👑 │ Владелец', color: 0xFF0044, admin: true },
      { name: '⚜️ │ Зам. Владельца', color: 0xFF4500, admin: true },
      { name: '🛠️ │ Гл. Тех. Администратор', color: 0xE74C3C, admin: true },
      { name: '🔧 │ Технический Администратор', color: 0xE67E22, admin: true },
      { name: '💻 │ Гл. Администратор', color: 0xE74C3C, admin: true },
      { name: '👑 │ Администратор', color: 0xE67E22, admin: true },
      { name: '🔮 │ Куратор', color: 0x9B59B6, admin: true },
      { name: '🛡️ │ Гл. Модератор', color: 0xF1C40F, mod: true },
      { name: '🛡️ │ Модератор', color: 0x3498DB, mod: true },
      { name: '🔰 │ Хелпер / Помощник', color: 0x2ECC71, helper: true },
      { name: '🏗️ │ Билдер / Строитель', color: 0x1ABC9C },
      { name: '🧪 │ Тестировщик', color: 0x00FFCC },
      { name: '🚀 │ Сервер Бустер', color: 0xF47FFF },
      { name: '💎 │ VIP / Supporter', color: 0x9B59B6 },
      { name: '⭐ │ Участник', color: 0x00FFCC },
      { name: '🤖 │ Бот', color: 0x95A5A6 }
    ];

    const existingRoles = await guild.roles.fetch();
    for (const r of rolesConfig) {
      const match = existingRoles.find(role => role.name === r.name);
      if (match) {
        await match.delete('Пересоздание ролей').catch(() => {});
      }
    }

    const createdRoles = [];

    for (const r of rolesConfig) {
      const perms = [];
      if (r.admin) perms.push(PermissionFlagsBits.Administrator);
      if (r.mod) perms.push(PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.KickMembers);
      if (r.helper) perms.push(PermissionFlagsBits.ManageMessages);

      const role = await guild.roles.create({
        name: r.name,
        color: r.color,
        hoist: true,
        permissions: perms
      });
      createdRoles.push(role);
    }

    const roleList = createdRoles.map(r => `${r} (${r.name})`).join('\n');

    await interaction.editReply({
      embeds: [createEmbed({
        title: '👑 Иерархия Ролей Персонала Успешно Создана',
        description: `Создано **16 ролей**:\n\n${roleList}`,
        color: COLORS.GOLD
      })]
    });
  } catch (err) {
    console.error('[Role Create Error]', err);
    await interaction.editReply({ embeds: [errorEmbed('Произошла ошибка при создании ролей!')] });
  }
}
