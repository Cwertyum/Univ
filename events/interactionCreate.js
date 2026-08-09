import { execute as executeMod } from '../commands/moderation.js';
import { execute as executeTicketSetup } from '../commands/ticketSetup.js';
import { execute as executeRank, executeLeaderboard, executeRep } from '../commands/leveling.js';
import { execute as executeEco } from '../commands/economy.js';
import { execute as executeGames, handleTriviaButton } from '../commands/games.js';
import { execute as executeUtil } from '../commands/utility.js';
import { execute as executeMusic } from '../commands/music.js';
import { executeChannelCreate, executeRoleCreate } from '../commands/serverSetup.js';
import { execute as executeHelp } from '../commands/help.js';
import { execute as executeRules } from '../commands/rules.js';
import { execute as executeReport, handleReportButtons } from '../commands/report.js';
import { execute as executeCreateMessage } from '../commands/createMessage.js';
import { execute as executeQuests, handleQuestButtons } from '../commands/quests.js';
import { execute as executeStaffReport } from '../commands/staffReport.js';
import { execute as executeMarry } from '../commands/marry.js';
import { execute as executeTgbot } from '../commands/tgbot.js';
import { handleStaffReportButtons } from '../modules/staffReportManager.js';
import { logCommandExecution } from '../modules/commandLogger.js';
import { checkCommandRateLimit } from '../modules/antiRaid.js';

import { handleVoiceInteraction } from '../modules/tempVoice.js';
import { handleTicketInteraction } from '../modules/ticketManager.js';
import { handleGiveawayButton } from '../modules/giveawayManager.js';
import { handleMusicButtonInteraction } from '../modules/musicManager.js';

export async function handleInteractionCreate(interaction) {
  try {
    // 1. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      // Anti-DDoS Rate Limit Check
      if (checkCommandRateLimit(interaction)) {
        return await interaction.reply({
          content: '⚠️ **[Anti-DDoS Shield]** Зафиксирована подозрительная частота запросов! Подождите 3 секунды перед следующей командой.',
          ephemeral: true
        }).catch(() => {});
      }

      // Log command execution to 📜・история-команд
      logCommandExecution(interaction).catch(() => {});

      const { commandName } = interaction;

      if (commandName === 'mod') await executeMod(interaction);
      else if (commandName === 'ticket-setup') await executeTicketSetup(interaction);
      else if (commandName === 'rank') await executeRank(interaction);
      else if (commandName === 'leaderboard') await executeLeaderboard(interaction);
      else if (commandName === 'rep') await executeRep(interaction);
      else if (commandName === 'eco') await executeEco(interaction);
      else if (commandName === 'games') await executeGames(interaction);
      else if (commandName === 'util') await executeUtil(interaction);
      else if (commandName === 'music') await executeMusic(interaction);
      else if (commandName === 'channel-create') await executeChannelCreate(interaction);
      else if (commandName === 'role-create') await executeRoleCreate(interaction);
      else if (commandName === 'help') await executeHelp(interaction);
      else if (commandName === 'rules') await executeRules(interaction);
      else if (commandName === 'report') await executeReport(interaction);
      else if (commandName === 'create-message') await executeCreateMessage(interaction);
      else if (commandName === 'quests') await executeQuests(interaction);
      else if (commandName === 'staff-report') await executeStaffReport(interaction);
      else if (commandName === 'marry') await executeMarry(interaction);
      else if (commandName === 'tgbot') await executeTgbot(interaction);
      return;
    }


    // 2. Handle Music Buttons
    const handledMusic = await handleMusicButtonInteraction(interaction);
    if (handledMusic) return;

    // 3. Handle Temp Voice Interactions
    const handledVoice = await handleVoiceInteraction(interaction);
    if (handledVoice) return;

    // 3. Handle Ticket Interactions
    const handledTicket = await handleTicketInteraction(interaction);
    if (handledTicket) return;

    // 4. Handle Giveaway Button
    const handledGW = await handleGiveawayButton(interaction);
    if (handledGW) return;

    // 5. Handle Trivia Button
    const handledTrivia = await handleTriviaButton(interaction);
    if (handledTrivia) return;

    // 6. Handle Report Buttons
    const handledReport = await handleReportButtons(interaction);
    if (handledReport) return;

    // 7. Handle Quest Buttons
    const handledQuest = await handleQuestButtons(interaction);
    if (handledQuest) return;

    // 8. Handle Staff Report Approval Buttons
    const handledStaffReport = await handleStaffReportButtons(interaction);
    if (handledStaffReport) return;

  } catch (err) {
    console.error('[InteractionCreate Error]', err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '❌ Произошла ошибка при выполнении взаимодействия!', ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: '❌ Произошла ошибка при выполнении взаимодействия!', ephemeral: true }).catch(() => {});
    }
  }
}
