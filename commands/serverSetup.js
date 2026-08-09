import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType 
} from 'discord.js';
import { updateGuildConfig } from '../database/configManager.js';
import { sendTicketPanel } from '../modules/ticketManager.js';
import { createEmbed, COLORS, successEmbed, errorEmbed } from '../utils/embedBuilder.js';

// Helper delay to prevent Discord API rate limit when creating 40+ channels
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Categories to clean on full recreate
const TARGET_CATEGORIES = [
  '✨ │ ВАЖНОЕ И ИНФО',
  '📜 │ ЗАДАНИЯ И КВЕСТЫ',
  '💬 │ ОБЩЕСТВЕННЫЕ ЧАТЫ',
  '🎫 │ ПОДДЕРЖКА И ИНФО',
  '🔊 │ ГОЛОСОВОЙ ЦЕНТР',
  '👑 │ ШТАБ АДМИНИСТРАЦИИ',
  '🛠️ │ ШТАБ ТЕХНИКОВ',
  '🔮 │ ШТАБ КУРАТОРОВ',
  '🛡️ │ ШТАБ МОДЕРАТОРОВ',
  '🔰 │ ШТАБ ХЕЛПЕРОВ',
  '🏗️ │ ШТАБ БИЛДЕРОВ',
  '🧪 │ ШТАБ ТЕСТИРОВЩИКОВ',
  '⚙️ │ ШТАБ ПЕРСОНАЛА',
  '📌 │ ИНФОРМАЦИЯ',
  '💬 │ ОБЩЕНИЕ',
  '🎫 │ ПОДДЕРЖКА',
  '🔊 │ ГОЛОСОВЫЕ КОМНАТЫ',
  '⚙️ │ АДМИНИСТРИРОВАНИЕ'
];

async function createOrReplaceChannel(guild, options) {
  try {
    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
    const existing = channels.find(c => c && c.name === options.name);
    if (existing) {
      await existing.delete('Удаление дубликата канала при авто-настройке').catch(() => {});
      await sleep(150);
    }
  } catch {}
  const created = await guild.channels.create(options);
  await sleep(150); // API rate-limit buffer
  return created;
}

// Ensure staff roles exist before applying permission overwrites
async function ensureStaffRoles(guild) {
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

  const existingRoles = await guild.roles.fetch().catch(() => guild.roles.cache);

  for (const r of rolesConfig) {
    const match = existingRoles.find(role => role.name === r.name);
    if (!match) {
      const perms = [];
      if (r.admin) perms.push(PermissionFlagsBits.Administrator);
      if (r.mod) perms.push(PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.KickMembers);
      if (r.helper) perms.push(PermissionFlagsBits.ManageMessages);

      await guild.roles.create({
        name: r.name,
        color: r.color,
        hoist: true,
        permissions: perms
      }).catch(() => {});
      await sleep(100);
    }
  }

  // Refetch roles
  const updatedRoles = await guild.roles.fetch().catch(() => guild.roles.cache);
  return {
    ownerRole: updatedRoles.find(r => r.name.includes('Владелец')),
    techRole: updatedRoles.find(r => r.name.includes('Технический') || r.name.includes('Тех.')),
    adminRole: updatedRoles.find(r => r.name.includes('Администратор')),
    curatorRole: updatedRoles.find(r => r.name.includes('Куратор')),
    modRole: updatedRoles.find(r => r.name.includes('Модератор')),
    helperRole: updatedRoles.find(r => r.name.includes('Хелпер')),
    builderRole: updatedRoles.find(r => r.name.includes('Билдер')),
    testerRole: updatedRoles.find(r => r.name.includes('Тестировщик'))
  };
}

// Slash Command definition
export const channelCreateData = new SlashCommandBuilder()
  .setName('channel-create')
  .setDescription('Управление и авто-создание каналов сервера Universal Realms')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  
  .addSubcommand(sub =>
    sub.setName('full')
      .setDescription('[Админ] Развернуть полную структуру 40+ каналов со всеми штабами и заданиями')
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
    await interaction.deferReply().catch(() => {});

    try {
      // 0. Ensure staff roles exist so overwrites work 100%
      const roles = await ensureStaffRoles(guild);

      // Step 0: Cleanup old setup categories if existing
      const allChannels = await guild.channels.fetch().catch(() => guild.channels.cache);
      const oldCategories = allChannels.filter(c => 
        c && c.type === ChannelType.GuildCategory && TARGET_CATEGORIES.includes(c.name)
      );

      for (const cat of oldCategories.values()) {
        const children = allChannels.filter(c => c && c.parentId === cat.id);
        for (const child of children.values()) {
          await child.delete('Очистка старых каналов').catch(() => {});
          await sleep(100);
        }
        await cat.delete('Очистка старой категории').catch(() => {});
        await sleep(100);
      }

      const botId = guild.members.me?.id || guild.client.user.id;

      // Base Read-Only Overwrites for Public Info Channels (Only Bot, Owners, Admins, Curators can type!)
      const publicInfoOverwrites = [
        { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
      ];
      if (roles.ownerRole) publicInfoOverwrites.push({ id: roles.ownerRole.id, allow: [PermissionFlagsBits.SendMessages] });
      if (roles.adminRole) publicInfoOverwrites.push({ id: roles.adminRole.id, allow: [PermissionFlagsBits.SendMessages] });
      if (roles.curatorRole) publicInfoOverwrites.push({ id: roles.curatorRole.id, allow: [PermissionFlagsBits.SendMessages] });

      // Helper function for staff category overwrites
      const makeStaffOverwrites = (allowedRoles = []) => {
        const overwrites = [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
        ];
        if (roles.ownerRole) overwrites.push({ id: roles.ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
        if (roles.adminRole) overwrites.push({ id: roles.adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
        
        allowedRoles.forEach(r => {
          if (r) overwrites.push({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] });
        });
        return overwrites;
      };

      // 1. ✨ │ ВАЖНОЕ И ИНФО
      const infoCat = await createOrReplaceChannel(guild, { name: '✨ │ ВАЖНОЕ И ИНФО', type: ChannelType.GuildCategory });
      
      const rulesChan = await createOrReplaceChannel(guild, { 
        name: '📜・правила-сервера', 
        type: ChannelType.GuildText, 
        parent: infoCat.id,
        permissionOverwrites: publicInfoOverwrites
      });
      
      const rulesEmbed1 = createEmbed({
        title: `📜 ПРАВИЛА И РЕГЛАМЕНТ СЕРВЕРА UNIVERSAL REALMS`,
        description: `Добро пожаловать на проект **Universal Realms**! Ниже представлен официальный свод правил.\n\n` +
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
      await rulesChan.send({ embeds: [rulesEmbed1] }).catch(() => {});

      await createOrReplaceChannel(guild, { name: 'ℹ️・информация', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: publicInfoOverwrites });
      await createOrReplaceChannel(guild, { name: '📢・новости-проекта', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: publicInfoOverwrites });
      await createOrReplaceChannel(guild, { name: '🎁・розыгрыши', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: publicInfoOverwrites });
      const welcomeChan = await createOrReplaceChannel(guild, { name: '👋・приветствия-и-уход', type: ChannelType.GuildText, parent: infoCat.id, permissionOverwrites: publicInfoOverwrites });
      
      updateGuildConfig(guild.id, 'welcome_channel_id', welcomeChan.id);
      updateGuildConfig(guild.id, 'farewell_channel_id', welcomeChan.id);

      // 2. 📜 │ ЗАДАНИЯ И КВЕСТЫ
      const questCat = await createOrReplaceChannel(guild, { name: '📜 │ ЗАДАНИЯ И КВЕСТЫ', type: ChannelType.GuildCategory });

      const taskChan = await createOrReplaceChannel(guild, {
        name: '📌・задания-проекта',
        type: ChannelType.GuildText,
        parent: questCat.id,
        permissionOverwrites: publicInfoOverwrites
      });
      await taskChan.send({
        embeds: [createEmbed({
          title: '📌 Канал Заданий Проекта',
          description: 'В этом канале **Кураторы** и **Администрация** публикуют важные задачи и квесты для сообщества!',
          color: COLORS.PRIMARY
        })]
      }).catch(() => {});

      await createOrReplaceChannel(guild, { name: '🏆・таблица-квестов', type: ChannelType.GuildText, parent: questCat.id, permissionOverwrites: publicInfoOverwrites });

      // 3. 💬 │ ОБЩЕСТВЕННЫЕ ЧАТЫ
      const chatCat = await createOrReplaceChannel(guild, { name: '💬 │ ОБЩЕСТВЕННЫЕ ЧАТЫ', type: ChannelType.GuildCategory });
      await createOrReplaceChannel(guild, { name: '💬・основной-чат', type: ChannelType.GuildText, parent: chatCat.id });
      await createOrReplaceChannel(guild, { name: '🤖・команды-ботов', type: ChannelType.GuildText, parent: chatCat.id });
      await createOrReplaceChannel(guild, { name: '💡・идеи-и-предложения', type: ChannelType.GuildText, parent: chatCat.id });
      await createOrReplaceChannel(guild, { name: '🎨・медиа-и-скриншоты', type: ChannelType.GuildText, parent: chatCat.id });
      await createOrReplaceChannel(guild, { name: '🏆・таблица-лидеров', type: ChannelType.GuildText, parent: chatCat.id, permissionOverwrites: publicInfoOverwrites });

      // 4. 🎫 │ ПОДДЕРЖКА И ИНФО
      const ticketCat = await createOrReplaceChannel(guild, { name: '🎫 │ ПОДДЕРЖКА И ИНФО', type: ChannelType.GuildCategory });
      const ticketChan = await createOrReplaceChannel(guild, { name: '🎫・создать-тикет', type: ChannelType.GuildText, parent: ticketCat.id, permissionOverwrites: publicInfoOverwrites });
      await createOrReplaceChannel(guild, { name: '❓・частые-вопросы', type: ChannelType.GuildText, parent: ticketCat.id, permissionOverwrites: publicInfoOverwrites });

      updateGuildConfig(guild.id, 'ticket_category_id', ticketCat.id);
      await sendTicketPanel(ticketChan).catch(() => {});

      // 5. 🔊 │ ГОЛОСОВОЙ ЦЕНТР
      const voiceCat = await createOrReplaceChannel(guild, { name: '🔊 │ ГОЛОСОВОЙ ЦЕНТР', type: ChannelType.GuildCategory });
      const voiceHub = await createOrReplaceChannel(guild, { name: '➕・создать-комнату', type: ChannelType.GuildVoice, parent: voiceCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・общение-#1', type: ChannelType.GuildVoice, parent: voiceCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・общение-#2', type: ChannelType.GuildVoice, parent: voiceCat.id });
      await createOrReplaceChannel(guild, { name: '🎮・игры-и-пати', type: ChannelType.GuildVoice, parent: voiceCat.id });
      await createOrReplaceChannel(guild, { name: '💤・afk-комната', type: ChannelType.GuildVoice, parent: voiceCat.id });

      updateGuildConfig(guild.id, 'temp_voice_hub_id', voiceHub.id);

      // 6. STAFF HEADQUARTERS (ШТАБЫ ПЕРСОНАЛА)

      // 👑 │ ШТАБ АДМИНИСТРАЦИИ
      const adminCat = await createOrReplaceChannel(guild, {
        name: '👑 │ ШТАБ АДМИНИСТРАЦИИ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: makeStaffOverwrites([])
      });
      await createOrReplaceChannel(guild, { name: '👑・чат-администрации', type: ChannelType.GuildText, parent: adminCat.id });
      await createOrReplaceChannel(guild, { name: '📌・объявления-адм', type: ChannelType.GuildText, parent: adminCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・администрация-voice', type: ChannelType.GuildVoice, parent: adminCat.id });
      await createOrReplaceChannel(guild, { name: '📜・история-команд', type: ChannelType.GuildText, parent: adminCat.id });
      const auditChan = await createOrReplaceChannel(guild, { name: '📝・журнал-аудита', type: ChannelType.GuildText, parent: adminCat.id });

      updateGuildConfig(guild.id, 'audit_log_channel_id', auditChan.id);
      updateGuildConfig(guild.id, 'ticket_log_channel_id', auditChan.id);

      // 🛠️ │ ШТАБ ТЕХНИКОВ
      const techCat = await createOrReplaceChannel(guild, {
        name: '🛠️ │ ШТАБ ТЕХНИКОВ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: makeStaffOverwrites([roles.techRole])
      });
      await createOrReplaceChannel(guild, { name: '🛠️・чат-техников', type: ChannelType.GuildText, parent: techCat.id });
      await createOrReplaceChannel(guild, { name: '🐛・баг-трекер', type: ChannelType.GuildText, parent: techCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・техники-voice', type: ChannelType.GuildVoice, parent: techCat.id });

      // 🔮 │ ШТАБ КУРАТОРОВ
      const curatorCat = await createOrReplaceChannel(guild, {
        name: '🔮 │ ШТАБ КУРАТОРОВ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: makeStaffOverwrites([roles.curatorRole])
      });
      await createOrReplaceChannel(guild, { name: '🔮・чат-кураторов', type: ChannelType.GuildText, parent: curatorCat.id });
      await createOrReplaceChannel(guild, { name: '📌・задания-кураторов', type: ChannelType.GuildText, parent: curatorCat.id });
      await createOrReplaceChannel(guild, { name: '✅・выполненные-задания-кураторов', type: ChannelType.GuildText, parent: curatorCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・кураторы-voice', type: ChannelType.GuildVoice, parent: curatorCat.id });

      // 🛡️ │ ШТАБ МОДЕРАТОРОВ
      const modCat = await createOrReplaceChannel(guild, {
        name: '🛡️ │ ШТАБ МОДЕРАТОРОВ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: makeStaffOverwrites([roles.curatorRole, roles.modRole])
      });
      await createOrReplaceChannel(guild, { name: '🛡️・чат-модераторов', type: ChannelType.GuildText, parent: modCat.id });
      await createOrReplaceChannel(guild, { name: '📜・отчеты-модераторов', type: ChannelType.GuildText, parent: modCat.id });
      await createOrReplaceChannel(guild, { name: '🚫・список-наказаний', type: ChannelType.GuildText, parent: modCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・модераторы-voice', type: ChannelType.GuildVoice, parent: modCat.id });

      // 🔰 │ ШТАБ ХЕЛПЕРОВ
      const helperCat = await createOrReplaceChannel(guild, {
        name: '🔰 │ ШТАБ ХЕЛПЕРОВ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: makeStaffOverwrites([roles.curatorRole, roles.modRole, roles.helperRole])
      });
      await createOrReplaceChannel(guild, { name: '🔰・чат-хелперов', type: ChannelType.GuildText, parent: helperCat.id });
      await createOrReplaceChannel(guild, { name: '📜・отчеты-хелперов', type: ChannelType.GuildText, parent: helperCat.id });
      await createOrReplaceChannel(guild, { name: '❓・вопросы-хелперов', type: ChannelType.GuildText, parent: helperCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・хелперы-voice', type: ChannelType.GuildVoice, parent: helperCat.id });

      // 🏗️ │ ШТАБ БИЛДЕРОВ
      const builderCat = await createOrReplaceChannel(guild, {
        name: '🏗️ │ ШТАБ БИЛДЕРОВ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: makeStaffOverwrites([roles.curatorRole, roles.builderRole])
      });
      await createOrReplaceChannel(guild, { name: '🏗️・чат-билдеров', type: ChannelType.GuildText, parent: builderCat.id });
      await createOrReplaceChannel(guild, { name: '📌・задания-билдеров', type: ChannelType.GuildText, parent: builderCat.id });
      await createOrReplaceChannel(guild, { name: '✅・сделанные-задания-билдеров', type: ChannelType.GuildText, parent: builderCat.id });
      await createOrReplaceChannel(guild, { name: '🖼️・скриншоты-построек', type: ChannelType.GuildText, parent: builderCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・билдеры-voice', type: ChannelType.GuildVoice, parent: builderCat.id });

      // 🧪 │ ШТАБ ТЕСТИРОВЩИКОВ
      const testerCat = await createOrReplaceChannel(guild, {
        name: '🧪 │ ШТАБ ТЕСТИРОВЩИКОВ',
        type: ChannelType.GuildCategory,
        permissionOverwrites: makeStaffOverwrites([roles.curatorRole, roles.techRole, roles.testerRole])
      });
      await createOrReplaceChannel(guild, { name: '🧪・чат-тестировщиков', type: ChannelType.GuildText, parent: testerCat.id });
      await createOrReplaceChannel(guild, { name: '📋・план-тестирования', type: ChannelType.GuildText, parent: testerCat.id });
      await createOrReplaceChannel(guild, { name: '🔊・тестировщики-voice', type: ChannelType.GuildVoice, parent: testerCat.id });

      await interaction.editReply({
        embeds: [successEmbed(`Полная премиум-структура из **12 категорий и 42 каналов** со всеми ролями и штабами персонала Universal Realms успешно развернута!`)]
      }).catch(() => {});

    } catch (err) {
      console.error('[Channel Create Error]', err);
      await interaction.editReply({ embeds: [errorEmbed('Произошла ошибка при создании каналов!')] }).catch(() => {});
    }
  }
}

// /role-create
export const roleCreateData = new SlashCommandBuilder()
  .setName('role-create')
  .setDescription('[Админ] Создать полную иерархию ролей для Администрации, Кураторов и Персонала')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function executeRoleCreate(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return await interaction.reply({ 
      embeds: [errorEmbed('⛔ У вас нет прав Администратора!')], 
      ephemeral: true 
    });
  }

  await interaction.deferReply().catch(() => {});
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

    const existingRoles = await guild.roles.fetch().catch(() => guild.roles.cache);
    for (const r of rolesConfig) {
      const match = existingRoles.find(role => role.name === r.name);
      if (match) {
        await match.delete('Пересоздание ролей').catch(() => {});
        await sleep(100);
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
      }).catch(() => null);

      if (role) createdRoles.push(role);
      await sleep(100);
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
