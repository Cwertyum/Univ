import { getGuildConfig } from '../database/configManager.js';
import { createEmbed, COLORS } from './embedBuilder.js';

export async function logToAudit(guild, title, description, color = COLORS.INFO, fields = []) {
  try {
    const config = getGuildConfig(guild.id);
    if (!config || !config.audit_log_channel_id) return;

    const channel = guild.channels.cache.get(config.audit_log_channel_id);
    if (!channel) return;

    const embed = createEmbed({
      title: `📝 Журнал Аудита: ${title}`,
      description,
      color,
      fields
    });

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[AuditLog Error]', err);
  }
}
