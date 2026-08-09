import { AuditLogEvent } from 'discord.js';
import { logToAudit } from '../utils/logger.js';
import { COLORS } from '../utils/embedBuilder.js';

// Action Rate Cache: userId_guildId -> array of timestamps
const actionCache = new Map();

/**
 * Handle Channel Updates, Deletions, and Creations (Anti-Nuke / Anti-Rename)
 */
export async function handleChannelAntiNuke(channel, eventType) {
  const guild = channel.guild;
  if (!guild) return;

  try {
    // Determine target AuditLog event type
    let auditType = AuditLogEvent.ChannelUpdate;
    if (eventType === 'delete') auditType = AuditLogEvent.ChannelDelete;
    if (eventType === 'create') auditType = AuditLogEvent.ChannelCreate;

    // Fetch recent audit log entry
    const fetchedLogs = await guild.fetchAuditLogs({
      limit: 1,
      type: auditType
    }).catch(() => null);

    if (!fetchedLogs || !fetchedLogs.entries.size) return;

    const entry = fetchedLogs.entries.first();
    const executor = entry.executor;

    if (!executor || executor.id === guild.client.user.id || executor.id === guild.ownerId) {
      return; // Skip bot itself and Server Owner
    }

    const key = `${executor.id}_${guild.id}`;
    const now = Date.now();
    const timestamps = actionCache.get(key) || [];

    // Track actions within last 10 seconds
    const recentActions = timestamps.filter(t => now - t < 10000);
    recentActions.push(now);
    actionCache.set(key, recentActions);

    // EMERGENCY TRIGGER: If executor modifies > 2 channels in 10s -> INSTANT BAN
    if (recentActions.length >= 2) {
      actionCache.delete(key);

      // 1. BAN THE EXECUTOR IMMEDIATELY
      const targetMember = await guild.members.fetch(executor.id).catch(() => null);
      if (targetMember && targetMember.bannable) {
        await targetMember.ban({ reason: `🚨 [Anti-Nuke Shield] Массовое изменение/удаление каналов (${recentActions.length} действия за 10с)` }).catch(() => {});
      } else {
        await guild.members.ban(executor.id, { reason: `🚨 [Anti-Nuke Shield] Массовое изменение/удаление каналов` }).catch(() => {});
      }

      // 2. Urgent Emergency Log in Audit
      logToAudit(
        guild,
        '🚨 EMERGENCY ANTI-NUKE SHIELD ACTIVATED',
        `**ОБНАРУЖЕНА ПОПЫТКА УНИЧТОЖЕНИЯ / ПЕРЕИМЕНОВАНИЯ СЕРВЕРА!**\n\n` +
        `👤 **Нарушитель/Вредоносный бот:** ${executor.tag} (ID: ${executor.id})\n` +
        `⚡ **Зафиксировано действий:** **${recentActions.length} за 10 секунд**\n` +
        `🛡️ **Принятые меры:** Нарушитель **НЕМЕДЛЕННО ЗАБАНЕН** на сервере!`,
        COLORS.ERROR
      );

      // 3. Attempt to restore channel name if renamed
      if (eventType === 'update' && entry.changes) {
        const nameChange = entry.changes.find(c => c.key === 'name');
        if (nameChange && nameChange.old) {
          await channel.setName(nameChange.old, '[Anti-Nuke] Восстановление прежнего названия канала').catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('[Anti-Nuke Error]', err);
  }
}

/**
 * Handle Role Deletions & Mutations (Anti-Nuke Role Shield)
 */
export async function handleRoleAntiNuke(role) {
  const guild = role.guild;
  if (!guild) return;

  try {
    const fetchedLogs = await guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.RoleDelete
    }).catch(() => null);

    if (!fetchedLogs || !fetchedLogs.entries.size) return;

    const entry = fetchedLogs.entries.first();
    const executor = entry.executor;

    if (!executor || executor.id === guild.client.user.id || executor.id === guild.ownerId) return;

    const key = `role_${executor.id}_${guild.id}`;
    const now = Date.now();
    const timestamps = actionCache.get(key) || [];

    const recent = timestamps.filter(t => now - t < 10000);
    recent.push(now);
    actionCache.set(key, recent);

    if (recent.length >= 2) {
      actionCache.delete(key);
      await guild.members.ban(executor.id, { reason: `🚨 [Anti-Nuke Shield] Массовое удаление ролей` }).catch(() => {});

      logToAudit(
        guild,
        '🚨 ANTI-NUKE SHIELD — БАН ЗА УДАЛЕНИЕ РОЛЕЙ',
        `Нарушитель ${executor.tag} (ID: ${executor.id}) **ЗАБАНЕН** за массовое удаление ролей!`,
        COLORS.ERROR
      );
    }
  } catch (err) {
    console.error('[Anti-Nuke Role Error]', err);
  }
}
