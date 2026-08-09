import { SlashCommandBuilder } from 'discord.js';
import db from '../database/db.js';
import { getUserData, getRequiredXP, getLeaderboard } from '../modules/levelManager.js';
import { trackQuestRep } from '../modules/questManager.js';
import { createEmbed, COLORS, successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Посмотреть профиль уровня, опыта и репутации')
  .addUserOption(opt => opt.setName('user').setDescription('Пользователь').setRequired(false));

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const userData = getUserData(interaction.guild.id, targetUser.id);

  const reqXP = getRequiredXP(userData.level);
  const currentXP = userData.xp;
  const percentage = Math.min(100, Math.floor((currentXP / reqXP) * 100));

  // Premium Progress Bar
  const barLength = 12;
  const filled = Math.floor((percentage / 100) * barLength);
  const progressBar = '🟦'.repeat(filled) + '⬛'.repeat(barLength - filled);

  const embed = createEmbed({
    title: `✨ Профиль Игрока — ${targetUser.username}`,
    color: COLORS.PRIMARY,
    thumbnail: targetUser.displayAvatarURL({ dynamic: true, size: 256 }),
    fields: [
      { name: '🎖️ Уровень', value: `\`\`\`yaml\nУровень ${userData.level}\n\`\`\``, inline: true },
      { name: '⭐ Опыт (XP)', value: `\`\`\`yaml\n${currentXP} / ${reqXP} XP\n\`\`\``, inline: true },
      { name: '💰 Монеты', value: `\`\`\`yaml\n${userData.balance} 🪙\n\`\`\``, inline: true },
      { name: '❤️ Репутация', value: `\`\`\`yaml\n+${userData.rep} Ранг\n\`\`\``, inline: true },
      { name: `📊 Прогресс до ${userData.level + 1} уровня (${percentage}%)`, value: `${progressBar}\n\`${currentXP} XP / ${reqXP} XP\``, inline: false }
    ]
  });

  await interaction.reply({ embeds: [embed] });
}

// Leaderboard Command
export const leaderboardData = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Таблица лидеров по уровню и опыту на сервере');

export async function executeLeaderboard(interaction) {
  const topUsers = getLeaderboard(interaction.guild.id);

  if (topUsers.length === 0) {
    return await interaction.reply({ embeds: [errorEmbed('Таблица лидеров пока пуста!')], ephemeral: true });
  }

  const fields = topUsers.map((u, index) => {
    const medal = index === 0 ? '👑 1 место' : index === 1 ? '🥈 2 место' : index === 2 ? '🥉 3 место' : `🎗️ #${index + 1}`;
    return {
      name: `${medal} — <@${u.user_id}>`,
      value: `> **Уровень:** \`${u.level}\` │ **XP:** \`${u.xp}\` │ **Баланс:** \`${u.balance} 🪙\``,
      inline: false
    };
  });

  const embed = createEmbed({
    title: `🏆 ТОП-10 АКТИВНЫХ УЧАСТНИКОВ — ${interaction.guild.name.toUpperCase()}`,
    color: COLORS.GOLD,
    fields,
    thumbnail: interaction.guild.iconURL({ dynamic: true })
  });

  await interaction.reply({ embeds: [embed] });
}

// Rep Command
export const repData = new SlashCommandBuilder()
  .setName('rep')
  .setDescription('Повысить репутацию пользователю (раз в 24 часа)')
  .addUserOption(opt => opt.setName('user').setDescription('Пользователь').setRequired(true));

export async function executeRep(interaction) {
  const targetUser = interaction.options.getUser('user');
  if (targetUser.id === interaction.user.id) {
    return await interaction.reply({ embeds: [errorEmbed('Вы не можете выдать репутацию самому себе!')], ephemeral: true });
  }

  const senderData = getUserData(interaction.guild.id, interaction.user.id);
  const now = Date.now();
  const Cooldown = 24 * 60 * 60 * 1000;

  if (now - senderData.last_rep < Cooldown) {
    const remainingMs = Cooldown - (now - senderData.last_rep);
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    return await interaction.reply({ embeds: [errorEmbed(`Вы уже выражали репутацию сегодня. Попробуйте через **${hours}ч**.` )], ephemeral: true });
  }

  db.prepare('UPDATE users SET last_rep = ? WHERE guild_id = ? AND user_id = ?')
    .run(now, interaction.guild.id, interaction.user.id);

  db.prepare(`
    INSERT INTO users (guild_id, user_id, rep) VALUES (?, ?, 1)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET rep = rep + 1
  `).run(interaction.guild.id, targetUser.id);

  trackQuestRep(interaction.guild.id, interaction.user.id);

  await interaction.reply({ embeds: [successEmbed(`Вы успешно выразили репутацию пользователю ${targetUser}! (+1 ❤️)`)] });
}
