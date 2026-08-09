import { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import { getUserQuests, claimQuestReward } from '../modules/questManager.js';
import { createEmbed, COLORS, successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('quests')
  .setDescription('Ежедневные задания и квесты сервера с наградой монетами');

export async function execute(interaction) {
  const { guild, user } = interaction;
  const questData = getUserQuests(guild.id, user.id);

  const msgStatus = questData.claimed_msg ? '✅ Получено (+500 🪙)' : (questData.messages >= 100 ? '🎁 Готово к получению!' : `${questData.messages} / 100 сообщений`);
  const voiceStatus = questData.claimed_voice ? '✅ Получено (+300 🪙)' : (questData.voice_minutes >= 10 ? '🎁 Готово к получению!' : `${questData.voice_minutes} / 10 минут`);
  const repStatus = questData.claimed_rep ? '✅ Получено (+200 🪙)' : (questData.reps_given >= 1 ? '🎁 Готово к получению!' : `${questData.reps_given} / 1 rep`);

  const embed = createEmbed({
    title: '📜 ЕЖЕДНЕВНЫЕ ЗАДАНИЯ И КВЕСТЫ',
    description: 'Выполняйте задания на сервере и получайте виртуальные монеты!',
    color: COLORS.GOLD,
    fields: [
      { name: '💬 Задание #1: Общение в чате', value: `Написать 100 сообщений в текстовых чатах.\n**Награда:** +500 🪙\n**Прогресс:** \`${msgStatus}\``, inline: false },
      { name: '🎙️ Задание #2: Общение в голосе', value: `Пробыть 10 минут в голосовых каналах.\n**Награда:** +300 🪙\n**Прогресс:** \`${voiceStatus}\``, inline: false },
      { name: '❤️ Задание #3: Дружелюбие', value: `Повысить репутацию игроку командой \`/rep\`.\n**Награда:** +200 🪙\n**Прогресс:** \`${repStatus}\``, inline: false }
    ],
    thumbnail: user.displayAvatarURL({ dynamic: true })
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quest_claim_msg')
      .setLabel('💬 Забрать 500 🪙')
      .setStyle(questData.claimed_msg ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(Boolean(questData.claimed_msg)),
    new ButtonBuilder()
      .setCustomId('quest_claim_voice')
      .setLabel('🎙️ Забрать 300 🪙')
      .setStyle(questData.claimed_voice ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(Boolean(questData.claimed_voice)),
    new ButtonBuilder()
      .setCustomId('quest_claim_rep')
      .setLabel('❤️ Забрать 200 🪙')
      .setStyle(questData.claimed_rep ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(Boolean(questData.claimed_rep))
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

export async function handleQuestButtons(interaction) {
  const { customId, user, guild } = interaction;
  if (!customId.startsWith('quest_claim_')) return false;

  const questType = customId.replace('quest_claim_', '');
  const res = claimQuestReward(guild.id, user.id, questType);

  if (!res.success) {
    await interaction.reply({ embeds: [errorEmbed(res.message)], ephemeral: true });
    return true;
  }

  await interaction.reply({
    embeds: [successEmbed(`Вы успешно выполнили задание **${res.title}** и получили **+${res.reward}** 🪙 монет!`)]
  });

  return true;
}
