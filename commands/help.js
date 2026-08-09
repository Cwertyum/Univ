import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, COLORS, successEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Справка по всем командам (отправляется в личные сообщения)');

export async function execute(interaction) {
  const member = interaction.member;
  const user = interaction.user;

  // Safe Null Check: Member can be null if called inside Direct Messages (DM)
  const isStaff = member ? (
    member.permissions.has(PermissionFlagsBits.ManageMessages) || 
    member.permissions.has(PermissionFlagsBits.Administrator)
  ) : false;

  const isAdmin = member ? member.permissions.has(PermissionFlagsBits.Administrator) : false;

  const playerFields = [
    {
      name: '📈 Уровни и Профиль',
      value: '> `/rank` — Посмотреть свой профиль, уровень и XP\n' +
             '> `/leaderboard` — Таблица топ-10 активных игроков\n' +
             '> `/rep @пользователь` — Повысить репутацию игроку',
      inline: false
    },
    {
      name: '💰 Экономика и Магазин',
      value: '> `/eco balance` — Баланс монет\n' +
             '> `/eco daily` — Ежедневная награда монет\n' +
             '> `/eco pay @пользователь сумма` — Перевод денег\n' +
             '> `/eco shop` — Магазин ролей на сервере\n' +
             '> `/eco buy id` — Покупка роли из магазина',
      inline: false
    },
    {
      name: '🎮 Игры и Развлечения',
      value: '> `/games coinflip` — Ставка на Орел или Решка\n' +
             '> `/games guess` — Игра «Угадай число»\n' +
             '> `/games trivia` — Викторина с вопросами за монеты',
      inline: false
    },
    {
      name: '🛠️ Полезные Утилиты',
      value: '> `/util poll` — Создать опрос\n' +
             '> `/util remind время текст` — Личное напоминание\n' +
             '> `/util afk причина` — Установить AFK-статус с авто-ответом',
      inline: false
    },
    {
      name: '🎵 Музыкальный Плеер',
      value: '> `/music play название` — Включить музыку в голосе\n' +
             '> `/music stop` — Остановить плеер\n' +
             '> `/music skip` — Пропустить трек\n' +
             '> `/music queue` — Очередь треков',
      inline: false
    }
  ];

  if (isStaff) {
    playerFields.push({
      name: '🛡️ Модерация (Для Хелперов и Модераторов)',
      value: '> `/mod warn @user причина` — Выдать варн\n' +
             '> `/mod unwarn @user` — Снять один варн\n' +
             '> `/mod warns @user` — Просмотр истории варнов\n' +
             '> `/mod mute @user мин причина` — Временный мут\n' +
             '> `/mod unmute @user` — Снять мут\n' +
             '> `/mod clear кол-во` — Быстрая очистка чата',
      inline: false
    });
  }

  if (isAdmin) {
    playerFields.push({
      name: '⚙️ Администрация и Настройки (Для Кураторов и Админов)',
      value: '> `/channel-create` — Создать структуры каналов и роли\n' +
             '> `/role-create` — Создать иерархию 15 ролей\n' +
             '> `/rules post` — Опубликовать правила Universal Realms в канале\n' +
             '> `/ticket-setup` — Отправить панель тикетов\n' +
             '> `/create-message` — Сообщения с тегами <>, ##, %%\n' +
             '> `/mod automod` — Настройка мат/ссылок/капс фильтра\n' +
             '> `/util voice-hub` — Настройка каналов "Зайти и создать"\n' +
             '> `/util audit-setup` — Настройка журнала аудита',
      inline: false
    });
  }

  const title = isStaff 
    ? '🛡️ СПРАВКА ПО КОМАНДАМ UNIVERSAL REALMS (Режим Персонала)' 
    : '📜 СПРАВКА ПО КОМАНДАМ UNIVERSAL REALMS';

  const embed = createEmbed({
    title,
    description: 'Полная личная справка по командам сервера.',
    color: isStaff ? COLORS.GOLD : COLORS.PRIMARY,
    fields: playerFields
  });

  try {
    await user.send({ embeds: [embed] });
    if (interaction.guild) {
      await interaction.reply({
        embeds: [successEmbed(`Полная справка по командам отправлена в ваши **Личные Сообщения (ЛС)**! 📩`)],
        ephemeral: true
      });
    } else {
      await interaction.reply({
        embeds: [successEmbed('Справка отправлена!')]
      });
    }
  } catch (err) {
    // Fallback if DMs are closed
    await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
  }
}
