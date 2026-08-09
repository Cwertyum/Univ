import db from '../database/db.js';
import { infoEmbed } from '../utils/embedBuilder.js';

export function addReminder(userId, channelId, text, delayMs) {
  const remindAt = Date.now() + delayMs;
  db.prepare('INSERT INTO reminders (user_id, channel_id, text, remind_at) VALUES (?, ?, ?, ?)')
    .run(userId, channelId, text, remindAt);
}

export async function checkReminders(client) {
  const now = Date.now();
  const rows = db.prepare('SELECT * FROM reminders WHERE remind_at <= ?').all(now);

  for (const r of rows) {
    try {
      db.prepare('DELETE FROM reminders WHERE id = ?').run(r.id);

      const channel = await client.channels.fetch(r.channel_id).catch(() => null);
      if (channel) {
        await channel.send({
          content: `<@${r.user_id}>`,
          embeds: [infoEmbed(r.text, '⏰ Напоминание!')]
        }).catch(() => {});
      } else {
        const user = await client.users.fetch(r.user_id).catch(() => null);
        if (user) {
          await user.send({
            embeds: [infoEmbed(r.text, '⏰ Напоминание!')]
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[Check Reminders Error]', err);
    }
  }
}
