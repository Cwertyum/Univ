import { createEmbed, COLORS } from '../utils/embedBuilder.js';
import db from '../database/db.js';

// Auto-delete timer map or DB tracking for 1 hour message cleanup
export async function logCommandExecution(interaction) {
  try {
    if (!interaction.guild) return;

    const { guild, user, commandName, channel } = interaction;
    const logChan = guild.channels.cache.find(c => c.name === '📜・история-команд' || c.name === '📝-журнал-аудита');

    if (logChan) {
      const optionsStr = interaction.options.data.map(opt => {
        if (opt.value !== undefined) return `${opt.name}:${opt.value}`;
        if (opt.options) return `${opt.name} [${opt.options.map(o => `${o.name}:${o.value}`).join(' ')}]`;
        return opt.name;
      }).join(' ');

      const embed = createEmbed({
        title: '📜 ЛОГ ВЫПОЛНЕНИЯ КОМАНДЫ',
        description: `**Исполнитель:** ${user} (\`${user.tag}\` | ID: \`${user.id}\`)\n` +
                     `**Команда:** \`/${commandName} ${optionsStr}\`\n` +
                     `**Канал:** ${channel ? channel : 'ЛС / Автомат'}\n` +
                     `**Время:** <t:${Math.floor(Date.now() / 1000)}:F>`,
        color: COLORS.INFO
      });

      await logChan.send({ embeds: [embed] }).catch(() => {});
    }

    // Command Channel Redirect Notice
    handleCommandChannelRouting(interaction).catch(() => {});
  } catch (err) {
    console.error('[CommandLogger Error]', err);
  }
}

/**
 * Automatically route/notify command executions in dedicated 🤖・команды-ботов channel
 */
export async function handleCommandChannelRouting(interaction) {
  try {
    const { guild, user, commandName, channel } = interaction;
    if (!guild || !channel) return;

    // Allowed native channels where command outputs stay local
    const isBotChannel = channel.name.includes('команды') || channel.name.includes('cmd');
    const isStaffOrTicket = channel.name.includes('штаб') || channel.name.includes('тикет') || channel.name.includes('отчет') || channel.name.includes('задан');

    if (!isBotChannel && !isStaffOrTicket) {
      const targetBotChan = guild.channels.cache.find(c => c.name === '🤖・команды-ботов' || c.name.includes('команды'));
      if (targetBotChan) {
        const optionsStr = interaction.options?.data?.map(o => `${o.name}:${o.value}`).join(' ') || '';
        const embed = createEmbed({
          title: '🤖 АВТО-МАРШРУТИЗАЦИЯ КОМАНДЫ БОТА',
          description: `Игрок ${user} (\`${user.tag}\`) использовал команду **\`/${commandName} ${optionsStr}\`** в канале ${channel}.\n\n` +
                       `> 💡 **Рекомендация:** Для использования команд бота используйте специально отведенный канал ${targetBotChan}!`,
          color: COLORS.PRIMARY
        });

        await targetBotChan.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[Command Routing Error]', err);
  }
}

/**
 * Schedule message auto-deletion after 1 hour (3,600,000 ms)
 */
export function scheduleMessageAutoDelete(message, delayMs = 3600000) {
  if (!message || !message.delete) return;
  setTimeout(() => {
    message.delete().catch(() => {});
  }, delayMs);
}
