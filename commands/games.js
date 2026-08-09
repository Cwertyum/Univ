import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { playCoinflip, playGuessNumber, TRIVIA_QUESTIONS, addBalance } from '../modules/economyManager.js';
import { successEmbed, errorEmbed, createEmbed, COLORS } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('games')
  .setDescription('Мини-игры и развлечения')
  
  // Coinflip
  .addSubcommand(sub =>
    sub.setName('coinflip')
      .setDescription('Ставка на Орел или Решка')
      .addIntegerOption(opt => opt.setName('bet').setDescription('Размер ставки').setRequired(true))
      .addStringOption(opt =>
        opt.setName('side')
          .setDescription('Выберите сторону')
          .setRequired(true)
          .addChoices(
            { name: '🦅 Орел (Heads)', value: 'heads' },
            { name: '🪙 Решка (Tails)', value: 'tails' }
          )
      )
  )

  // Guess Number
  .addSubcommand(sub =>
    sub.setName('guess')
      .setDescription('Угадай число от 1 до 5')
      .addIntegerOption(opt => opt.setName('number').setDescription('Ваше число (1-5)').setRequired(true))
  )

  // Trivia Quiz
  .addSubcommand(sub =>
    sub.setName('trivia')
      .setDescription('Викторина с вопросами на монеты')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;
  const user = interaction.user;

  if (subcommand === 'coinflip') {
    const bet = interaction.options.getInteger('bet');
    const side = interaction.options.getString('side');

    const res = playCoinflip(guild.id, user.id, bet, side);
    if (!res.success) {
      return await interaction.reply({ embeds: [errorEmbed(res.message)], ephemeral: true });
    }

    if (res.won) {
      await interaction.reply({
        embeds: [successEmbed(`Выпало: **${res.result}**!\n🎉 Вы выиграли **+${res.amount}** 🪙! Ваш баланс: **${res.newBalance}** 🪙.`)]
      });
    } else {
      await interaction.reply({
        embeds: [errorEmbed(`Выпало: **${res.result}**!\n😢 Вы проиграли **-${res.amount}** 🪙. Ваш баланс: **${res.newBalance}** 🪙.`)]
      });
    }
  }

  else if (subcommand === 'guess') {
    const num = interaction.options.getInteger('number');
    if (num < 1 || num > 5) {
      return await interaction.reply({ embeds: [errorEmbed('Укажите число от 1 до 5!')], ephemeral: true });
    }

    const res = playGuessNumber(num);
    if (res.won) {
      addBalance(guild.id, user.id, 100);
      await interaction.reply({
        embeds: [successEmbed(`🎉 Верно! Загаданное число: **${res.secret}**. Вы получили **+100** 🪙!`)]
      });
    } else {
      await interaction.reply({
        embeds: [errorEmbed(`❌ Неверно! Загаданное число было: **${res.secret}**.`)]
      });
    }
  }

  else if (subcommand === 'trivia') {
    const randomQ = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];

    const buttons = randomQ.options.map((opt, idx) =>
      new ButtonBuilder()
        .setCustomId(`trivia_ans_${idx}_${randomQ.answer}`)
        .setLabel(`${idx + 1}. ${opt}`)
        .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder().addComponents(buttons);

    const embed = createEmbed({
      title: '❓ Викторина',
      description: `**${randomQ.question}**\n\nУ вас есть 15 секунд для ответа!`,
      color: COLORS.INFO
    });

    await interaction.reply({ embeds: [embed], components: [row] });
  }
}

export async function handleTriviaButton(interaction) {
  const { customId, user, guild } = interaction;
  if (!customId.startsWith('trivia_ans_')) return false;

  const parts = customId.split('_');
  const userChoice = parseInt(parts[2], 10);
  const correctChoice = parseInt(parts[3], 10);

  if (userChoice === correctChoice) {
    addBalance(guild.id, user.id, 150);
    await interaction.update({
      embeds: [successEmbed(`🎉 Правильно, ${user}! Вы получили **+150** 🪙 монет!`)],
      components: []
    });
  } else {
    await interaction.update({
      embeds: [errorEmbed(`❌ Неправильный ответ! Попробуйте в следующий раз.`)],
      components: []
    });
  }

  return true;
}
