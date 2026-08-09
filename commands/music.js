import { SlashCommandBuilder } from 'discord.js';
import { playMusic, stopMusic, skipMusic, getMusicQueue } from '../modules/musicManager.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('music')
  .setDescription('Управление музыкой в голосовом канале')
  
  .addSubcommand(sub =>
    sub.setName('play')
      .setDescription('Воспроизвести трек или ссылку')
      .addStringOption(opt => opt.setName('query').setDescription('Название или ссылка').setRequired(true))
  )

  .addSubcommand(sub =>
    sub.setName('stop')
      .setDescription('Остановить музыку и очистить очередь')
  )

  .addSubcommand(sub =>
    sub.setName('skip')
      .setDescription('Пропустить текущий трек')
  )

  .addSubcommand(sub =>
    sub.setName('queue')
      .setDescription('Посмотреть очередь треков')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;

  if (subcommand === 'play') {
    const query = interaction.options.getString('query');
    await playMusic(interaction, query);
  }

  else if (subcommand === 'stop') {
    const stopped = stopMusic(guild.id);
    if (stopped) {
      await interaction.reply({ embeds: [successEmbed('Музыка остановлена, плеер отключен!')] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Музыка сейчас не играет!')], ephemeral: true });
    }
  }

  else if (subcommand === 'skip') {
    const skipped = skipMusic(guild.id);
    if (skipped) {
      await interaction.reply({ embeds: [successEmbed('Трек пропущен!')] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Нет трека для пропуска!')], ephemeral: true });
    }
  }

  else if (subcommand === 'queue') {
    const queue = getMusicQueue(guild.id);
    if (!queue || (!queue.current && queue.queue.length === 0)) {
      return await interaction.reply({ embeds: [infoEmbed('Очередь воспроизведения пуста!')], ephemeral: true });
    }

    let description = `🎶 **Сейчас играет:** ${queue.current ? queue.current.title : 'Ничего'}\n\n**Очередь:**\n`;
    queue.queue.forEach((t, i) => {
      description += `${i + 1}. ${t.title} (Запросил: ${t.requester})\n`;
    });

    await interaction.reply({ embeds: [infoEmbed(description, '🎵 Очередь музыки')] });
  }
}
