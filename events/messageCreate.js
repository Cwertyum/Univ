import db from '../database/db.js';
import { handleAutoMod } from '../modules/automod.js';
import { handleMassMentionShield, handleInviteLinkShield } from '../modules/antiRaid.js';
import { handleMessageXP, getUserData } from '../modules/levelManager.js';
import { trackQuestMessage } from '../modules/questManager.js';
import { infoEmbed } from '../utils/embedBuilder.js';

export async function handleMessageCreate(message) {
  if (!message.guild || message.author.bot) return;

  // 1. Anti-Raid Shield Checks (Invite links & Mass Mention)
  const wasInvite = await handleInviteLinkShield(message);
  if (wasInvite) return;

  const wasMassMentioned = await handleMassMentionShield(message);
  if (wasMassMentioned) return;

  // 2. AutoMod Check
  const wasPunished = await handleAutoMod(message);
  if (wasPunished) return;

  // 2. AFK Status Handling
  const authorData = getUserData(message.guild.id, message.author.id);
  if (authorData && authorData.afk_reason) {
    db.prepare('UPDATE users SET afk_reason = NULL WHERE guild_id = ? AND user_id = ?')
      .run(message.guild.id, message.author.id);

    const reply = await message.reply({
      embeds: [infoEmbed(`С возвращением, ${message.author}! Ваш AFK-статус был успешно снят.`)]
    });
    setTimeout(() => reply.delete().catch(() => {}), 5000);
  }

  // Check if mentioned users are AFK
  if (message.mentions.users.size > 0) {
    message.mentions.users.forEach(mentioned => {
      if (mentioned.id !== message.author.id) {
        const data = getUserData(message.guild.id, mentioned.id);
        if (data && data.afk_reason) {
          message.channel.send({
            embeds: [infoEmbed(`Пользователь **${mentioned.tag}** сейчас AFK.\n**Причина:** ${data.afk_reason}`)]
          }).catch(() => {});
        }
      }
    });
  }

  // 3. Custom Commands Check
  const content = message.content.trim();
  if (content.startsWith('!')) {
    const cmdName = content.slice(1).split(' ')[0].toLowerCase();
    const customCmd = db.prepare('SELECT response FROM custom_commands WHERE guild_id = ? AND name = ?')
      .get(message.guild.id, cmdName);

    if (customCmd) {
      await message.channel.send({ content: customCmd.response });
      return;
    }
  }

  // 4. Message XP Granting & Quest Progress
  trackQuestMessage(message.guild.id, message.author.id);
  await handleMessageXP(message);
}
