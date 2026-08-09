import { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType 
} from 'discord.js';
import { 
  getMarriage, 
  createMarriageRecord, 
  deleteMarriageRecord, 
  addBabyRecord 
} from '../modules/marriageManager.js';
import { createEmbed, COLORS, successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('marry')
  .setDescription('Система бракосочетаний, свадебных ролей и семьи')
  
  // Subcommand: propose
  .addSubcommand(sub =>
    sub.setName('propose')
      .setDescription('Сделать предложение руки и сердца игроку')
      .addUserOption(opt => opt.setName('target').setDescription('Выберите вторую половинку').setRequired(true))
  )

  // Subcommand: divorce
  .addSubcommand(sub =>
    sub.setName('divorce')
      .setDescription('Развестись с текущим супругом/супругой')
  )

  // Subcommand: status
  .addSubcommand(sub =>
    sub.setName('status')
      .setDescription('Посмотреть профиль своей семьи и список детей')
      .addUserOption(opt => opt.setName('user').setDescription('Посмотреть профиль другого игрока').setRequired(false))
  )

  // Subcommand: baby
  .addSubcommand(sub =>
    sub.setName('baby')
      .setDescription('Завести ребенка в браке')
      .addStringOption(opt => opt.setName('name').setDescription('Имя ребенка').setRequired(true))
  );

export async function execute(interaction) {
  const { guild, member, user } = interaction;
  const subcommand = interaction.options.getSubcommand();

  // 1. Propose Marriage
  if (subcommand === 'propose') {
    const targetUser = interaction.options.getUser('target');
    const targetMember = interaction.options.getMember('target');

    if (targetUser.id === user.id) {
      return await interaction.reply({ embeds: [errorEmbed('Вы не можете жениться на самом себе!')], ephemeral: true });
    }

    if (targetUser.bot) {
      return await interaction.reply({ embeds: [errorEmbed('Вы не можете жениться на боте!')], ephemeral: true });
    }

    const senderMarriage = getMarriage(guild.id, user.id);
    if (senderMarriage) {
      return await interaction.reply({ embeds: [errorEmbed('Вы уже состоите в браке! Сначала разведитесь.')], ephemeral: true });
    }

    const targetMarriage = getMarriage(guild.id, targetUser.id);
    if (targetMarriage) {
      return await interaction.reply({ embeds: [errorEmbed(`Пользователь ${targetUser} уже состоит в браке!`)], ephemeral: true });
    }

    const proposeEmbed = createEmbed({
      title: '💒 ПРЕДЛОЖЕНИЕ РУКИ И СЕРДЦА!',
      description: `💍 Пользователь ${user} делает официальное предложение руки и сердца ${targetUser}!\n\n` +
                   `**${targetUser}, вы согласны вступить в брак и создать семью?**\n` +
                   `⏳ *У вас есть 60 секунд на ответ.*`,
      color: COLORS.PINK,
      thumbnail: targetUser.displayAvatarURL({ dynamic: true })
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('marry_accept').setLabel('💍 Согласиться').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('marry_decline').setLabel('💔 Отклонить').setStyle(ButtonStyle.Danger)
    );

    const msg = await interaction.reply({
      content: `${targetUser}`,
      embeds: [proposeEmbed],
      components: [row],
      fetchReply: true
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000
    });

    collector.on('collect', async btnInt => {
      if (btnInt.user.id !== targetUser.id) {
        return await btnInt.reply({ embeds: [errorEmbed('Это предложение сделано не вам!')], ephemeral: true });
      }

      if (btnInt.customId === 'marry_decline') {
        collector.stop('declined');
        await btnInt.update({
          embeds: [errorEmbed(`💔 Пользователь ${targetUser} отклонил предложение руки и сердца от ${user}.`)],
          components: []
        });
        return;
      }

      if (btnInt.customId === 'marry_accept') {
        collector.stop('accepted');

        // Create Custom Marriage Role for both spouses
        let roleId = null;
        try {
          const roleName = `💍 Муж/Жена: ${user.username} & ${targetUser.username}`;
          const marryRole = await guild.roles.create({
            name: roleName,
            color: 0xFF69B4, // Hot Pink
            hoist: true,
            reason: 'Роль для состоящих в браке'
          });

          await member.roles.add(marryRole).catch(() => {});
          await targetMember.roles.add(marryRole).catch(() => {});
          roleId = marryRole.id;
        } catch (e) {
          console.error('[Marry Role Error]', e);
        }

        createMarriageRecord(guild.id, user.id, targetUser.id, roleId);

        const successMarryEmbed = createEmbed({
          title: '🎉 ПОЗДРАВЛЯЕМ С ДНЕМ СВАДЬБЫ!',
          description: `💖 Пользователи ${user} и ${targetUser} теперь официально **МУЖ И ЖЕНА**!\n` +
                       `Создана уникальная семейная роль на сервере! 🥂✨`,
          color: COLORS.GOLD,
          thumbnail: 'https://cdn-icons-png.flaticon.com/512/3656/3656858.png'
        });

        await btnInt.update({ embeds: [successMarryEmbed], components: [] });
      }
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        await interaction.editReply({
          embeds: [errorEmbed(`⏳ Время на ответ истекло! Предложение руки и сердца от ${user} для ${targetUser} отменено.`)],
          components: []
        }).catch(() => {});
      }
    });

    return;
  }

  // 2. Divorce
  if (subcommand === 'divorce') {
    const marriage = getMarriage(guild.id, user.id);
    if (!marriage) {
      return await interaction.reply({ embeds: [errorEmbed('Вы не состоите в браке!')], ephemeral: true });
    }

    const spouseId = marriage.user1_id === user.id ? marriage.user2_id : marriage.user1_id;
    const spouseUser = await interaction.client.users.fetch(spouseId).catch(() => null);

    // Delete custom role if existing
    if (marriage.role_id) {
      const role = guild.roles.cache.get(marriage.role_id);
      if (role) await role.delete('Развод пары').catch(() => {});
    }

    deleteMarriageRecord(guild.id, user.id);

    return await interaction.reply({
      embeds: [infoEmbed(`💔 Вы официально развелись с ${spouseUser ? spouseUser : 'супругом'}. Семейная роль была удалена.`)]
    });
  }

  // 3. Status Profile
  if (subcommand === 'status') {
    const targetUser = interaction.options.getUser('user') || user;
    const marriage = getMarriage(guild.id, targetUser.id);

    if (!marriage) {
      return await interaction.reply({
        embeds: [infoEmbed(`Пользователь ${targetUser} не состоит в браке.`)]
      });
    }

    const spouseId = marriage.user1_id === targetUser.id ? marriage.user2_id : marriage.user1_id;
    const spouseUser = await interaction.client.users.fetch(spouseId).catch(() => null);

    let children = [];
    try {
      children = JSON.parse(marriage.children || '[]');
    } catch {}

    const childrenStr = children.length > 0
      ? children.map(c => `👶 **${c.name}** *(Рожден: <t:${Math.floor(c.born_at / 1000)}:R>)*`).join('\n')
      : 'Детей пока нет.';

    const statusEmbed = createEmbed({
      title: `💖 СЕМЕЙНЫЙ ПРОФИЛЬ — ${targetUser.username.toUpperCase()}`,
      description: `**Супруги:** ${targetUser} ❤️ ${spouseUser ? spouseUser : 'Неизвестно'}\n` +
                   `**Дата свадьбы:** <t:${Math.floor(marriage.married_at / 1000)}:F>\n\n` +
                   `**👨‍👩‍👧‍👦 ДЕТИ И СЕМЬЯ:**\n${childrenStr}`,
      color: COLORS.PINK,
      thumbnail: targetUser.displayAvatarURL({ dynamic: true })
    });

    return await interaction.reply({ embeds: [statusEmbed] });
  }

  // 4. Baby
  if (subcommand === 'baby') {
    const marriage = getMarriage(guild.id, user.id);
    if (!marriage) {
      return await interaction.reply({ embeds: [errorEmbed('Вы не состоите в браке! Завести ребенка можно только в семье.')], ephemeral: true });
    }

    const babyName = interaction.options.getString('name');
    addBabyRecord(guild.id, user.id, babyName);

    const spouseId = marriage.user1_id === user.id ? marriage.user2_id : marriage.user1_id;

    return await interaction.reply({
      embeds: [successEmbed(`👶 Поздравляем! В вашей семье родилось пополнение — малыш **${babyName}**!\nСчастливые родители: ${user} и <@${spouseId}>! 🎉`)]
    });
  }
}
