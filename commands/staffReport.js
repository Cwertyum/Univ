import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import { createEmbed, COLORS, successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isHigherStaff } from '../modules/staffReportManager.js';

export const data = new SlashCommandBuilder()
  .setName('staff-report')
  .setDescription('Управление заданиями и отчетами персонала Universal Realms')
  
  // Subcommand 1: Assign Task (Higher Administration -> Builders / Curators)
  .addSubcommand(sub =>
    sub.setName('assign-task')
      .setDescription('[Высшая Адм.] Вывесить новое задание с дедлайном для Билдеров или Кураторов')
      .addStringOption(opt =>
        opt.setName('team')
          .setDescription('Штаб персонала')
          .setRequired(true)
          .addChoices(
            { name: 'Билдеры (📌・задания-билдеров)', value: 'builders' },
            { name: 'Кураторы (📌・задания-кураторов)', value: 'curators' }
          )
      )
      .addStringOption(opt => opt.setName('title').setDescription('Название задания').setRequired(true))
      .addStringOption(opt => opt.setName('details').setDescription('Подробное ТЗ и требования').setRequired(true))
      .addStringOption(opt => opt.setName('deadline').setDescription('Срок выполнения (например, До 5 Августа 18:00)').setRequired(true))
  )

  // Subcommand 2: Task Submission (Builders / Curators)
  .addSubcommand(sub =>
    sub.setName('task')
      .setDescription('Отправить выполненное задание (фото с разных ракурсов) на проверку Высшей Администрации')
      .addStringOption(opt => opt.setName('title').setDescription('Название выполненной работы / задания').setRequired(true))
      .addStringOption(opt => opt.setName('description').setDescription('Подробное описание работы').setRequired(true))
      .addStringOption(opt => opt.setName('photos').setDescription('Ссылка на скриншоты/фото с разных ракурсов (Imgur/Discord)').setRequired(true))
  )

  // Subcommand 3: Moderation Punishment Report (Mods / Helpers)
  .addSubcommand(sub =>
    sub.setName('mod')
      .setDescription('Отправить отчет о наказании (Ник, Пункт правил, Доказательства и Принятые меры)')
      .addStringOption(opt => opt.setName('target').setDescription('Никнейм нарушителя').setRequired(true))
      .addStringOption(opt => opt.setName('clause').setDescription('Пункт нарушенного правила (например, § 2.1. Мат)').setRequired(true))
      .addStringOption(opt => opt.setName('action').setDescription('Принятые меры (например, Мут на 30 минут)').setRequired(true))
      .addStringOption(opt => opt.setName('proof').setDescription('Ссылка на скриншот / видео доказательства').setRequired(true))
  );

export async function execute(interaction) {
  const { guild, member, user } = interaction;
  const subcommand = interaction.options.getSubcommand();

  // 1. Assign Task (Higher Administration -> Builders / Curators)
  if (subcommand === 'assign-task') {
    if (!isHigherStaff(member)) {
      return await interaction.reply({
        embeds: [errorEmbed('⛔ Вывешивать официальные задания может только Высшая Администрация!')],
        ephemeral: true
      });
    }

    const team = interaction.options.getString('team');
    const title = interaction.options.getString('title');
    const details = interaction.options.getString('details');
    const deadline = interaction.options.getString('deadline');

    const channelName = team === 'builders' ? '📌・задания-билдеров' : '📌・задания-кураторов';
    const targetChan = guild.channels.cache.find(c => c.name === channelName);

    if (!targetChan) {
      return await interaction.reply({
        embeds: [errorEmbed(`Канал \`${channelName}\` не найден на сервере!`)],
        ephemeral: true
      });
    }

    const assignEmbed = createEmbed({
      title: `📌 НОВОЕ ЗАДАНИЕ ОТ ВЫСШЕЙ АДМИНИСТРАЦИИ: ${title.toUpperCase()}`,
      description: `**Выдал задание:** ${user} (\`${user.tag}\`)\n` +
                   `**Штаб назначения:** ${team === 'builders' ? '🏗️ Билдеры / Строители' : '🔮 Кураторы'}\n\n` +
                   `**📋 ТЕХНИЧЕСКОЕ ЗАДАНИЕ (ТЗ):**\n${details}\n\n` +
                   `**⏳ СРОК ВЫПОЛНЕНИЯ (ДЕДЛАЙН):**\n\`${deadline}\`\n\n` +
                   `**📤 ИНСТРУКЦИЯ ПО СДАЧЕ:**\n` +
                   `Вы должны выполнить данную работу до указанного срока и отправить отчет с **фото с разных ракурсов** через команду \`/staff-report task\` в соответствующий канал выполненных заданий!`,
      color: COLORS.GOLD,
      footer: 'Официальное поручение Высшей Администрации Universal Realms'
    });

    await targetChan.send({ content: '@everyone', embeds: [assignEmbed] });
    return await interaction.reply({
      embeds: [successEmbed(`Официальное задание с дедлайном успешно вывешено в канал ${targetChan}!`)],
      ephemeral: true
    });
  }

  // 2. Task Submission (Builders / Curators)
  if (subcommand === 'task') {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const photos = interaction.options.getString('photos');

    const targetChan = guild.channels.cache.find(c => 
      c.name === '✅・сделанные-задания' || 
      c.name === '✅・выполненные-задания'
    );

    if (!targetChan) {
      return await interaction.reply({
        embeds: [errorEmbed('Канал для отчетов по заданиям (`✅・сделанные-задания`) не найден!')],
        ephemeral: true
      });
    }

    const taskEmbed = createEmbed({
      title: `🏗️ ВЫПОЛНЕННОЕ ЗАДАНИЕ: ${title.toUpperCase()}`,
      description: `**Исполнитель:** ${user} (\`${user.tag}\`)\n` +
                   `**Должность:** ${member.roles.hoist ? member.roles.hoist : 'Персонал'}\n\n` +
                   `**📋 Описание работы:**\n${description}\n\n` +
                   `**📸 Фото с разных ракурсов:**\n${photos}`,
      color: COLORS.GOLD,
      footer: '⏳ Ожидает проверки и одобрения Высшей Администрацией'
    });

    if (photos.startsWith('http://') || photos.startsWith('https://')) {
      taskEmbed.setImage(photos);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('staff_task_approve').setLabel('✨ Одобрить (Высшая Адм.)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('staff_task_reject').setLabel('❌ Отклонить').setStyle(ButtonStyle.Danger)
    );

    await targetChan.send({ embeds: [taskEmbed], components: [row] });
    return await interaction.reply({
      embeds: [successEmbed(`Ваш отчет о выполненном задании успешно отправлен в ${targetChan}!`) ],
      ephemeral: true
    });
  }

  // 3. Moderation Punishment Report (Mods / Helpers)
  if (subcommand === 'mod') {
    const targetStr = interaction.options.getString('target');
    const clauseStr = interaction.options.getString('clause');
    const actionStr = interaction.options.getString('action');
    const proofStr = interaction.options.getString('proof');

    const targetChan = guild.channels.cache.find(c => 
      c.name === '📜・отчеты-модераторов' || 
      c.name === '📜・отчеты-хелперов'
    );

    if (!targetChan) {
      return await interaction.reply({
        embeds: [errorEmbed('Канал для отчетов модерации (`📜・отчеты-модераторов`) не найден!')],
        ephemeral: true
      });
    }

    const modEmbed = createEmbed({
      title: `📜 ОФИЦИАЛЬНЫЙ ОТЧЕТ О НАКАЗАНИИ НАРУШИТЕЛЯ`,
      description: `**Модератор / Хелпер:** ${user} (\`${user.tag}\`)\n` +
                   `**🎯 Нарушитель (Никнейм):** **${targetStr}**\n` +
                   `**📜 Нарушенный пункт правил:** \`${clauseStr}\`\n` +
                   `**⚡ Принятые меры:** **${actionStr}**\n\n` +
                   `**📷 Скриншот / Доказательство нарушения:**\n${proofStr}`,
      color: COLORS.PRIMARY,
      footer: 'Журнал модерации Universal Realms • Журнал наказаний'
    });

    if (proofStr.startsWith('http://') || proofStr.startsWith('https://')) {
      modEmbed.setImage(proofStr);
    }

    await targetChan.send({ embeds: [modEmbed] });
    return await interaction.reply({
      embeds: [successEmbed(`Ваш отчет о наказании нарушителя успешно зафиксирован в ${targetChan}!`) ],
      ephemeral: true
    });
  }
}
