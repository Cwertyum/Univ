import { 
  ChannelType, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import db from '../database/db.js';
import { getGuildConfig } from '../database/configManager.js';
import { createEmbed, COLORS, successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const config = getGuildConfig(guild.id);

  if (!config || !config.temp_voice_hub_id) return;

  // 1. User Joined the Voice Hub -> Create Personal Voice Channel
  if (newState.channelId === config.temp_voice_hub_id) {
    try {
      const hubChannel = newState.channel;
      const member = newState.member;

      const newChannel = await guild.channels.create({
        name: `🔊 | Комната ${member.displayName}`,
        type: ChannelType.GuildVoice,
        parent: hubChannel.parentId,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MuteMembers,
              PermissionFlagsBits.DeafenMembers,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.Connect
            ]
          }
        ]
      });

      // Track in DB
      db.prepare('INSERT OR REPLACE INTO temp_voices (channel_id, guild_id, owner_id) VALUES (?, ?, ?)')
        .run(newChannel.id, guild.id, member.id);

      // Move member to new channel
      await member.voice.setChannel(newChannel);

      // Send Control Panel Embed to the voice channel's text chat
      const embed = createEmbed({
        title: '🎛️ Панель Управления Голосовым Каналом',
        description: `Владелец канала: ${member}\nИспользуйте кнопки ниже для управления вашей комнатой:`,
        color: COLORS.PRIMARY,
        fields: [
          { name: '🔒 Закрыть / Открыть', value: 'Доступ только по разрешению', inline: true },
          { name: '✏️ Переименовать', value: 'Изменить имя комнаты', inline: true },
          { name: '👥 Лимит мест', value: 'Установить кол-во мест', inline: true }
        ]
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('voice_toggle_lock').setLabel('🔒 Замок').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('voice_rename').setLabel('✏️ Имя').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('voice_set_limit').setLabel('👥 Лимит').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('voice_kick').setLabel('🚫 Кикнуть').setStyle(ButtonStyle.Danger)
      );

      await newChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
    } catch (err) {
      console.error('[TempVoice Create Error]', err);
    }
  }

  // 2. User Left a Dynamic Channel -> Check if empty and delete
  if (oldState.channelId && oldState.channelId !== config.temp_voice_hub_id) {
    const channel = oldState.channel;
    if (channel && channel.members.size === 0) {
      const row = db.prepare('SELECT * FROM temp_voices WHERE channel_id = ?').get(channel.id);
      if (row) {
        db.prepare('DELETE FROM temp_voices WHERE channel_id = ?').run(channel.id);
        await channel.delete().catch(() => {});
      }
    }
  }
}

/**
 * Handle Buttons & Modals for Voice Channel Control
 */
export async function handleVoiceInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;

  const { customId, guild, member } = interaction;
  if (!customId.startsWith('voice_')) return false;

  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await interaction.reply({ embeds: [errorEmbed('Вы должны находиться в вашем голосовом канале!')], ephemeral: true });
    return true;
  }

  const voiceRow = db.prepare('SELECT * FROM temp_voices WHERE channel_id = ?').get(voiceChannel.id);
  if (!voiceRow) {
    await interaction.reply({ embeds: [errorEmbed('Этот канал не является временной комнатой!')], ephemeral: true });
    return true;
  }

  if (voiceRow.owner_id !== member.id && !member.permissions.has('Administrator')) {
    await interaction.reply({ embeds: [errorEmbed('Вы не являетесь владельцем этой комнаты!')], ephemeral: true });
    return true;
  }

  // Handle Button Interactions
  if (interaction.isButton()) {
    if (customId === 'voice_toggle_lock') {
      const currentOverwrite = voiceChannel.permissionOverwrites.cache.get(guild.roles.everyone.id);
      const isLocked = currentOverwrite?.deny.has(PermissionFlagsBits.Connect);

      if (isLocked) {
        await voiceChannel.permissionOverwrites.edit(guild.roles.everyone.id, { Connect: null });
        await interaction.reply({ embeds: [successEmbed('Канал открыт для всех!')], ephemeral: true });
      } else {
        await voiceChannel.permissionOverwrites.edit(guild.roles.everyone.id, { Connect: false });
        await interaction.reply({ embeds: [successEmbed('Канал закрыт на замок!')], ephemeral: true });
      }
      return true;
    }

    if (customId === 'voice_rename') {
      const modal = new ModalBuilder()
        .setCustomId('voice_modal_rename')
        .setTitle('Переименование комнаты');

      const nameInput = new TextInputBuilder()
        .setCustomId('voice_input_name')
        .setLabel('Новое название канала')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(voiceChannel.name)
        .setRequired(true)
        .setMaxLength(30);

      modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
      await interaction.showModal(modal);
      return true;
    }

    if (customId === 'voice_set_limit') {
      const modal = new ModalBuilder()
        .setCustomId('voice_modal_limit')
        .setTitle('Лимит участников');

      const limitInput = new TextInputBuilder()
        .setCustomId('voice_input_limit')
        .setLabel('Лимит мест (0 = без лимита, макс 99)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('0 - 99')
        .setRequired(true)
        .setMaxLength(2);

      modal.addComponents(new ActionRowBuilder().addComponents(limitInput));
      await interaction.showModal(modal);
      return true;
    }

    if (customId === 'voice_kick') {
      const membersInChannel = voiceChannel.members.filter(m => m.id !== member.id);
      if (membersInChannel.size === 0) {
        await interaction.reply({ embeds: [errorEmbed('В вашей комнате нет других участников!')], ephemeral: true });
        return true;
      }

      // Disconnect or move first member found or ask
      const target = membersInChannel.first();
      await target.voice.setChannel(null).catch(() => {});
      await interaction.reply({ embeds: [successEmbed(`Участник ${target.user.tag} исключен из комнаты.`)], ephemeral: true });
      return true;
    }
  }

  // Handle Modal Submits
  if (interaction.isModalSubmit()) {
    if (customId === 'voice_modal_rename') {
      const newName = interaction.fields.getTextInputValue('voice_input_name');
      await voiceChannel.setName(`🔊 | ${newName}`);
      await interaction.reply({ embeds: [successEmbed(`Название комнаты изменено на **${newName}**`)], ephemeral: true });
      return true;
    }

    if (customId === 'voice_modal_limit') {
      const limitStr = interaction.fields.getTextInputValue('voice_input_limit');
      const limit = parseInt(limitStr, 10);
      if (isNaN(limit) || limit < 0 || limit > 99) {
        await interaction.reply({ embeds: [errorEmbed('Пожалуйста, укажите число от 0 до 99!')], ephemeral: true });
        return true;
      }

      await voiceChannel.setUserLimit(limit);
      await interaction.reply({ embeds: [successEmbed(`Лимит мест в комнате установлен на **${limit === 0 ? 'Без ограничений' : limit}**`)], ephemeral: true });
      return true;
    }
  }

  return false;
}
