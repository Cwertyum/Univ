import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../database/db.js';
import { createEmbed, COLORS, successEmbed, errorEmbed } from '../utils/embedBuilder.js';

// Cache for active participants: giveawayId -> Set(userIds)
const participantsMap = new Map();

export async function createGiveaway(client, channel, prize, winnersCount, durationMs, hostUser) {
  const endsAt = Date.now() + durationMs;
  const giveawayId = `gw-${Date.now()}`;

  const embed = createEmbed({
    title: `🎉 РОЗЫГРЫШ: ${prize}`,
    description: `Нажмите на кнопку ниже, чтобы принять участие!\n\n**Победителей:** ${winnersCount}\n**Организатор:** ${hostUser}\n**Окончание:** <t:${Math.floor(endsAt / 1000)}:R>`,
    color: COLORS.PRIMARY
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw_enter_${giveawayId}`).setLabel('🎉 Участвовать').setStyle(ButtonStyle.Success)
  );

  const message = await channel.send({ embeds: [embed], components: [row] });

  db.prepare(`
    INSERT INTO giveaways (giveaway_id, guild_id, channel_id, message_id, prize, winners_count, ends_at, host_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(giveawayId, channel.guild.id, channel.id, message.id, prize, winnersCount, endsAt, hostUser.id);

  participantsMap.set(giveawayId, new Set());
  return message;
}

export async function handleGiveawayButton(interaction) {
  const { customId, user } = interaction;
  if (!customId.startsWith('gw_enter_')) return false;

  const giveawayId = customId.replace('gw_enter_', '');
  const row = db.prepare('SELECT * FROM giveaways WHERE giveaway_id = ? AND ended = 0').get(giveawayId);
  if (!row) {
    await interaction.reply({ embeds: [errorEmbed('Этот розыгрыш уже завершен!')], ephemeral: true });
    return true;
  }

  let set = participantsMap.get(giveawayId);
  if (!set) {
    set = new Set();
    participantsMap.set(giveawayId, set);
  }

  if (set.has(user.id)) {
    set.delete(user.id);
    await interaction.reply({ embeds: [errorEmbed('Вы вышли из участия в розыгрыше.')], ephemeral: true });
  } else {
    set.add(user.id);
    await interaction.reply({ embeds: [successEmbed('Вы успешно зарегистрировались в розыгрыше!')], ephemeral: true });
  }

  return true;
}

export async function checkGiveaways(client) {
  const now = Date.now();
  const endedRows = db.prepare('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= ?').all(now);

  for (const gw of endedRows) {
    try {
      db.prepare('UPDATE giveaways SET ended = 1 WHERE giveaway_id = ?').run(gw.giveaway_id);

      const channel = await client.channels.fetch(gw.channel_id).catch(() => null);
      if (!channel) continue;

      const message = await channel.messages.fetch(gw.message_id).catch(() => null);
      const set = participantsMap.get(gw.giveaway_id) || new Set();
      const participants = Array.from(set);

      if (participants.length === 0) {
        if (message) {
          await message.edit({
            embeds: [createEmbed({
              title: `🎉 РОЗЫГРЫШ ЗАВЕРШЕН: ${gw.prize}`,
              description: 'Победители не определены (нет участников).',
              color: COLORS.DARK
            })],
            components: []
          });
        }
        continue;
      }

      // Pick random winners
      const shuffled = participants.sort(() => 0.5 - Math.random());
      const winners = shuffled.slice(0, gw.winners_count).map(id => `<@${id}>`);

      if (message) {
        await message.edit({
          embeds: [createEmbed({
            title: `🎉 РОЗЫГРЫШ ЗАВЕРШЕН: ${gw.prize}`,
            description: `Победители: ${winners.join(', ')}\nСпасибо всем за участие!`,
            color: COLORS.SUCCESS
          })],
          components: []
        });

        await channel.send({
          content: `🥳 Поздравляем ${winners.join(', ')}! Вы выиграли **${gw.prize}**!`
        });
      }
    } catch (err) {
      console.error('[Check Giveaways Error]', err);
    }
  }
}
