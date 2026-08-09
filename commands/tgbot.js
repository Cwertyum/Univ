import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, COLORS } from '../utils/embedBuilder.js';
import { startTelegramBot, stopTelegramBot, restartTelegramBot, getTelegramStatus } from '../modules/telegramLauncher.js';

export const data = new SlashCommandBuilder()
  .setName('tgbot')
  .setDescription('Управление и контроль Telegram Бота организации Октовские')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('start')
      .setDescription('Запустить Telegram бота')
  )
  .addSubcommand(sub =>
    sub.setName('stop')
      .setDescription('Остановить Telegram бота')
  )
  .addSubcommand(sub =>
    sub.setName('restart')
      .setDescription('Перезапустить Telegram бота')
  )
  .addSubcommand(sub =>
    sub.setName('status')
      .setDescription('Проверить статус Telegram бота')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'start') {
    const res = startTelegramBot();
    const embed = createEmbed({
      title: res.success ? '🚀 Telegram Бот Запущен' : '⚠️ Ошибка Запуска',
      description: res.message,
      color: res.success ? COLORS.SUCCESS : COLORS.ERROR
    });
    return interaction.reply({ embeds: [embed] });
  }

  if (subcommand === 'stop') {
    const res = stopTelegramBot();
    const embed = createEmbed({
      title: res.success ? '🛑 Telegram Бот Остановлен' : '⚠️ Предупреждение',
      description: res.message,
      color: res.success ? COLORS.WARNING : COLORS.ERROR
    });
    return interaction.reply({ embeds: [embed] });
  }

  if (subcommand === 'restart') {
    const res = restartTelegramBot();
    const embed = createEmbed({
      title: res.success ? '🔄 Telegram Бот Перезапущен' : '⚠️ Ошибка Перезапуска',
      description: res.message,
      color: res.success ? COLORS.SUCCESS : COLORS.ERROR
    });
    return interaction.reply({ embeds: [embed] });
  }

  if (subcommand === 'status') {
    const status = getTelegramStatus();
    const embed = createEmbed({
      title: '🤖 Статус Telegram Бота «Октовские»',
      fields: [
        { name: 'Состояние', value: status.running ? '🟢 **Работает**' : '🔴 **Остановлен**', inline: true },
        { name: 'PID Процесса', value: status.pid ? `\`${status.pid}\`` : '—', inline: true },
        { name: 'Время работы', value: status.running ? status.formattedUptime : '—', inline: true },
        { name: 'Путь к модулю', value: '`telegram-bot/index.js`', inline: false }
      ],
      color: status.running ? COLORS.SUCCESS : COLORS.ERROR
    });
    return interaction.reply({ embeds: [embed] });
  }
}
