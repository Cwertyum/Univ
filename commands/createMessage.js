import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType 
} from 'discord.js';
import { createEmbed, COLORS, successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { scheduleMessageAutoDelete } from '../modules/commandLogger.js';

export const data = new SlashCommandBuilder()
  .setName('create-message')
  .setDescription('Конструктор красивых форматированных сообщений бота')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  
  // Subcommand: send
  .addSubcommand(sub =>
    sub.setName('send')
      .setDescription('Отправить форматированное сообщение в выбранный канал из списка')
      .addChannelOption(opt => 
        opt.setName('channel')
          .setDescription('Выберите канал из выпадающего списка')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
      .addStringOption(opt => opt.setName('message').setDescription('Текст сообщения с тегами').setRequired(true))
      .addBooleanOption(opt => opt.setName('autodelete').setDescription('Авто-удаление через 1 час').setRequired(false))
  )

  // Subcommand: guide / help
  .addSubcommand(sub =>
    sub.setName('guide')
      .setDescription('Инструкция по использованию синтаксиса форматирования (гиперссылки, жирный, цитаты, переносы)')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'guide') {
    const guideEmbed = createEmbed({
      title: '📖 ИНСТРУКЦИЯ ПО ФОРМАТИРОВАНИЮ СООБЩЕНИЙ БОТА',
      description: 'Используйте следующие теги при составлении сообщений в `/create-message send`:\n\n' +
        '**1. ↵ Перенос на новую строку**\n' +
        '> **Синтаксис:** `Первая строка | Вторая строка` \n' +
        '> **Результат в чате:** Разделяет текст на разные строки!\n\n' +
        '**2. 🔗 Гиперссылки под названием (Скрытая ссылка)**\n' +
        '> **Синтаксис:** `$(https://youtube.com)<Ютуб>$` или `$[Ютуб](https://youtube.com)$` \n' +
        '> **Результат в чате:** [Ютуб](https://youtube.com) *(ссылка спрятана под текстом Ютуб!)*\n\n' +
        '**3. ✍️ Жирный текст / Заголовки**\n' +
        '> **Синтаксис:** `##Ваш текст` \n' +
        '> **Результат в чате:** **Ваш текст**\n\n' +
        '**4. 💬 Цитата (Блок слева)**\n' +
        '> **Синтаксис:** `<Ваш текст цитаты>` \n' +
        '> **Результат в чате:** > Ваш текст цитаты\n\n' +
        '**5. 👁️‍🗨️ Скрытый текст (Спойлер)**\n' +
        '> **Синтаксис:** `%%Секретный текст%%` \n' +
        '> **Результат в чате:** ||Секретный текст||',
      color: COLORS.PRIMARY,
      footer: 'Форматирование применяется автоматически при отправке!'
    });

    return await interaction.reply({ embeds: [guideEmbed], ephemeral: true });
  }

  if (subcommand === 'send') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({
        embeds: [errorEmbed('У вас нет прав на отправку сообщений от имени бота!')],
        ephemeral: true
      });
    }

    const targetChannel = interaction.options.getChannel('channel');
    let rawText = interaction.options.getString('message');
    const autoDelete = interaction.options.getBoolean('autodelete') || false;

    // 1. Process Pipe Line Split Tag: | -> \n
    rawText = rawText.replace(/\s*\|\s*/g, '\n');

    // 2. Process Links Tag $(https://url)<Text>$ or $[Text](https://url)$
    rawText = rawText.replace(/\$\((https?:\/\/[^\s>]+)\)<([^>]+)>\$/gi, '[$2]($1)');
    rawText = rawText.replace(/\$\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\$/gi, '[$1]($2)');

    // 3. Process Quotes Tag <text> -> > text
    rawText = rawText.replace(/<([^>]+)>/g, '> $1');

    // 4. Process Bold Header Tag ##text -> **text**
    rawText = rawText.replace(/##([^#\n]+)/g, '**$1**');

    // 5. Process Spoiler Tag %%text%% -> ||text||
    rawText = rawText.replace(/%%([^%]+)%%/g, '||$1||');

    try {
      const sentMsg = await targetChannel.send({ content: rawText });

      if (autoDelete) {
        scheduleMessageAutoDelete(sentMsg, 3600000); // 1 hour
      }

      await interaction.reply({
        embeds: [successEmbed(`Сообщение успешно отправлено в канал ${targetChannel}!${autoDelete ? ' ⏳ (Удалится через 1 час)' : ''}`)],
        ephemeral: true
      });
    } catch (err) {
      console.error('[CreateMessage Error]', err);
      await interaction.reply({ embeds: [errorEmbed('Не удалось отправить сообщение в указанный канал!')], ephemeral: true });
    }
  }
}
