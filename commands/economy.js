import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import db from '../database/db.js';
import { getUserData } from '../modules/levelManager.js';
import { claimDaily, addBalance } from '../modules/economyManager.js';
import { successEmbed, errorEmbed, createEmbed, COLORS } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('eco')
  .setDescription('Команды экономики и магазина')
  
  // /eco balance
  .addSubcommand(sub =>
    sub.setName('balance')
      .setDescription('Просмотреть свой баланс или другого пользователя')
      .addUserOption(opt => opt.setName('user').setDescription('Пользователь').setRequired(false))
  )

  // /eco daily
  .addSubcommand(sub =>
    sub.setName('daily')
      .setDescription('Получить ежедневную награду монет')
  )

  // /eco pay
  .addSubcommand(sub =>
    sub.setName('pay')
      .setDescription('Перевести монеты другому пользователю')
      .addUserOption(opt => opt.setName('user').setDescription('Кому перевести').setRequired(true))
      .addIntegerOption(opt => opt.setName('amount').setDescription('Сумма').setRequired(true))
  )

  // /eco shop
  .addSubcommand(sub =>
    sub.setName('shop')
      .setDescription('Открыть магазин ролей')
  )

  // /eco buy
  .addSubcommand(sub =>
    sub.setName('buy')
      .setDescription('Купить роль из магазина')
      .addIntegerOption(opt => opt.setName('id').setDescription('ID товара в магазине').setRequired(true))
  )

  // /eco add-item (Admin)
  .addSubcommand(sub =>
    sub.setName('add-item')
      .setDescription('[Админ] Добавить роль в магазин')
      .addRoleOption(opt => opt.setName('role').setDescription('Роль').setRequired(true))
      .addIntegerOption(opt => opt.setName('price').setDescription('Цена ролик').setRequired(true))
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;
  const user = interaction.user;

  if (subcommand === 'balance') {
    const target = interaction.options.getUser('user') || user;
    const data = getUserData(guild.id, target.id);
    await interaction.reply({
      embeds: [successEmbed(`Баланс пользователя ${target}: **${data.balance}** 🪙 монет.`)]
    });
  }

  else if (subcommand === 'daily') {
    const res = claimDaily(guild.id, user.id);
    if (res.success) {
      await interaction.reply({
        embeds: [successEmbed(`Вы получили **+${res.reward}** 🪙 монет! Ваш баланс: **${res.newBalance}** 🪙.`)]
      });
    } else {
      await interaction.reply({ embeds: [errorEmbed(res.message)], ephemeral: true });
    }
  }

  else if (subcommand === 'pay') {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (target.id === user.id || target.bot) {
      return await interaction.reply({ embeds: [errorEmbed('Некорректный получатель!')], ephemeral: true });
    }

    if (amount <= 0) {
      return await interaction.reply({ embeds: [errorEmbed('Сумма перевода должна быть больше 0!')], ephemeral: true });
    }

    const senderData = getUserData(guild.id, user.id);
    if (senderData.balance < amount) {
      return await interaction.reply({ embeds: [errorEmbed('У вас недостаточно средств!')], ephemeral: true });
    }

    addBalance(guild.id, user.id, -amount);
    addBalance(guild.id, target.id, amount);

    await interaction.reply({
      embeds: [successEmbed(`Вы успешно перевели **${amount}** 🪙 монет пользователю ${target}!`)]
    });
  }

  else if (subcommand === 'shop') {
    const items = db.prepare('SELECT * FROM shop_items WHERE guild_id = ?').all(guild.id);
    if (items.length === 0) {
      return await interaction.reply({ embeds: [errorEmbed('В магазине пока нет товаров!')], ephemeral: true });
    }

    const fields = items.map(i => ({
      name: `Товар #${i.id} | Роль: <@&${i.role_id}>`,
      value: `Цена: **${i.price}** 🪙 | Команда: \`/eco buy id:${i.id}\``,
      inline: false
    }));

    const embed = createEmbed({
      title: `🛍️ Магазин Ролей Сервера`,
      color: COLORS.PRIMARY,
      fields
    });

    await interaction.reply({ embeds: [embed] });
  }

  else if (subcommand === 'buy') {
    const itemId = interaction.options.getInteger('id');
    const item = db.prepare('SELECT * FROM shop_items WHERE id = ? AND guild_id = ?').get(itemId, guild.id);

    if (!item) {
      return await interaction.reply({ embeds: [errorEmbed('Товар не найден!')], ephemeral: true });
    }

    const userData = getUserData(guild.id, user.id);
    if (userData.balance < item.price) {
      return await interaction.reply({ embeds: [errorEmbed(`У вас недостаточно средств! Требуется **${item.price}** 🪙.`)], ephemeral: true });
    }

    const role = guild.roles.cache.get(item.role_id);
    if (!role) {
      return await interaction.reply({ embeds: [errorEmbed('Роль больше не существует на сервере!')], ephemeral: true });
    }

    addBalance(guild.id, user.id, -item.price);
    await interaction.member.roles.add(role).catch(() => {});

    await interaction.reply({
      embeds: [successEmbed(`Вы успешно приобрели роль **${role.name}** за **${item.price}** 🪙!`)]
    });
  }

  else if (subcommand === 'add-item') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({ embeds: [errorEmbed('У вас нет прав администратора!')], ephemeral: true });
    }

    const role = interaction.options.getRole('role');
    const price = interaction.options.getInteger('price');

    db.prepare('INSERT INTO shop_items (guild_id, role_id, price) VALUES (?, ?, ?)').run(guild.id, role.id, price);

    await interaction.reply({
      embeds: [successEmbed(`Роль ${role} успешно добавлена в магазин за **${price}** 🪙.`)]
    });
  }
}
