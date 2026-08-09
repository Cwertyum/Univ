import { ActivityType, REST, Routes } from 'discord.js';
import { checkGiveaways } from '../modules/giveawayManager.js';
import { checkReminders } from '../modules/reminderManager.js';

// Import slash command definitions
import { data as modData } from '../commands/moderation.js';
import { data as ticketData } from '../commands/ticketSetup.js';
import { data as rankData, leaderboardData, repData } from '../commands/leveling.js';
import { data as ecoData } from '../commands/economy.js';
import { data as gamesData } from '../commands/games.js';
import { data as utilData } from '../commands/utility.js';
import { data as musicData } from '../commands/music.js';
import { channelCreateData, roleCreateData } from '../commands/serverSetup.js';
import { data as helpData } from '../commands/help.js';
import { data as rulesData } from '../commands/rules.js';
import { data as reportData } from '../commands/report.js';
import { data as createMessageData } from '../commands/createMessage.js';
import { data as questsData } from '../commands/quests.js';
import { data as staffReportData } from '../commands/staffReport.js';
import { data as marryData } from '../commands/marry.js';
import { data as tgbotData, execute as executeTgbot } from '../commands/tgbot.js';
import { startTelegramBot } from '../modules/telegramLauncher.js';

export async function handleReady(client) {
  console.log(`[Bot Ready] Успешно авторизован как ${client.user.tag}!`);

  // Auto-launch Telegram Bot Plugin
  try {
    startTelegramBot();
  } catch (e) {
    console.error('[Telegram Plugin Error]', e.message);
  }

  client.user.setPresence({
    activities: [{ name: '/help | Команды бота', type: ActivityType.Watching }],
    status: 'online'
  });

  // Register Global Slash Commands
  const slashCommands = [
    modData.toJSON(),
    ticketData.toJSON(),
    rankData.toJSON(),
    leaderboardData.toJSON(),
    repData.toJSON(),
    ecoData.toJSON(),
    gamesData.toJSON(),
    utilData.toJSON(),
    musicData.toJSON(),
    tgbotData.toJSON(),

    channelCreateData.toJSON(),
    roleCreateData.toJSON(),
    helpData.toJSON(),
    rulesData.toJSON(),
    reportData.toJSON(),
    createMessageData.toJSON(),
    questsData.toJSON(),
    staffReportData.toJSON(),
    marryData.toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('[Slash Commands] Регистрация глобальных и серверных слэш-команд...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: slashCommands }
    );

    // Instant registration for each active guild
    for (const guild of client.guilds.cache.values()) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: slashCommands }
      ).catch(() => {});
    }

    console.log('[Slash Commands] Все слэш-команды успешно мгновенно зарегистрированы!');
  } catch (err) {
    console.error('[Slash Commands Error]', err);
  }

  // Periodic Background Timers (Giveaways & Reminders every 10 seconds)
  setInterval(() => {
    checkGiveaways(client).catch(() => {});
    checkReminders(client).catch(() => {});
  }, 10000);
}
