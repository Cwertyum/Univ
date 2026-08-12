import http from 'http';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import db from '../database/db.js';

// In-Memory Pending 2FA Requests Store
// requestId -> { username, discordId, ipAddress, status: 'PENDING'|'APPROVED'|'REJECTED'|'EXPIRED', timestamp }
const pending2FARequests = new Map();

// Pending Kick/Freeze Commands Queue to execute on MC Plugin
const pendingPluginCommands = [];

let bridgeServer = null;
let discordClient = null;

export function startUniversalAuthBridge(client) {
  discordClient = client;
  const port = parseInt(process.env.MC_BRIDGE_PORT || '3001', 10);

  if (bridgeServer) {
    return bridgeServer;
  }

  bridgeServer = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      // 1. POST /api/2fa-request (Plugin -> Bot)
      if (pathname === '/api/2fa-request' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const { requestId, username, ipAddress } = body;

        if (!requestId || !username) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing requestId or username' }));
        }

        const player = db.getAuthPlayer(username);
        if (!player || !player.discord_id) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Player or linked Discord ID not found' }));
        }

        // Store pending request
        const requestData = {
          requestId,
          username: player.username,
          displayName: player.display_name || username,
          discordId: player.discord_id,
          ipAddress: ipAddress || '127.0.0.1',
          status: 'PENDING',
          timestamp: Date.now()
        };
        pending2FARequests.set(requestId, requestData);

        // Send DM to linked Discord User
        try {
          const user = await discordClient.users.fetch(player.discord_id);
          if (user) {
            const embed = new EmbedBuilder()
              .setTitle('🛡️ Двухфакторная Аутентификация (2FA) UniversalAuth')
              .setDescription(`Зафиксирована попытка входа в аккаунт **${player.display_name || username}** на сервере Minecraft!`)
              .addFields(
                { name: '👤 Никнейм в игре', value: `\`${player.display_name || username}\``, inline: true },
                { name: '🌐 IP адрес', value: `\`${ipAddress || 'Неизвестен'}\``, inline: true },
                { name: '⏰ Время запроса', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
              )
              .setColor(0x3b82f6)
              .setTimestamp()
              .setFooter({ text: 'Подтвердите или отклоните вход. Игнорирование закикнет игрока через 60 сек.' });

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`accept_2fa_${requestId}`)
                .setLabel('✅ Принять')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`refuse_2fa_${requestId}`)
                .setLabel('❌ Отказать (Kick)')
                .setStyle(ButtonStyle.Danger)
            );

            const msg = await user.send({ embeds: [embed], components: [row] });
            requestData.dmMessageId = msg.id;
            requestData.dmChannelId = msg.channel.id;
          }
        } catch (dmErr) {
          console.error(`[UniversalAuth Bridge] Ошибка отправки ЛС пользователю ${player.discord_id}:`, dmErr.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'OK', sent: true }));
      }

      // 2. GET /api/2fa-status (Plugin -> Bot)
      if (pathname === '/api/2fa-status' && req.method === 'GET') {
        const requestId = url.searchParams.get('requestId');
        if (!requestId || !pending2FARequests.has(requestId)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'NOT_FOUND' }));
        }

        const reqData = pending2FARequests.get(requestId);
        // Timeout after 60 seconds
        if (reqData.status === 'PENDING' && Date.now() - reqData.timestamp > 60000) {
          reqData.status = 'EXPIRED';
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: reqData.status }));
      }

      // 3. POST /api/sync-player (Plugin -> Bot)
      if (pathname === '/api/sync-player' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        if (!body || !body.username) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing username' }));
        }

        db.saveAuthPlayer(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'OK' }));
      }

      // 4. GET /api/get-player (Plugin -> Bot)
      if (pathname === '/api/get-player' && req.method === 'GET') {
        const username = url.searchParams.get('username');
        const player = db.getAuthPlayer(username);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ player: player || null }));
      }

      // 5. GET /api/poll-commands (Plugin -> Bot)
      if (pathname === '/api/poll-commands' && req.method === 'GET') {
        const commandsToExec = [...pendingPluginCommands];
        pendingPluginCommands.length = 0; // Clear queue
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ commands: commandsToExec }));
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Endpoint not found' }));

    } catch (err) {
      console.error('[UniversalAuth Bridge Error]', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  });

  bridgeServer.listen(port, () => {
    console.log(`[UniversalAuth Bridge] Сервер успешно запущен на порту :${port}`);
  });

  return bridgeServer;
}

// Helper to parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Add command to queue for Plugin to execute & push instantly
export function sendCommandToPlugin(commandType, data) {
  pendingPluginCommands.push({ type: commandType, data, timestamp: Date.now() });

  // Direct instant push attempt to Minecraft server plugin HTTP port 3003
  const mcHost = process.env.MC_SERVER_HOST || '127.0.0.1';
  const mcPort = process.env.MC_SERVER_PORT || '3003';
  try {
    const req = http.request(`http://${mcHost}:${mcPort}/api/mc-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 1500
    });
    req.on('error', () => {});
    req.write(JSON.stringify({ type: commandType, data }));
    req.end();
  } catch {}
}

// Discord Interaction Button Handler for 2FA Accept/Refuse
export async function handleUniversalAuthButton(interaction) {
  if (!interaction.isButton()) return false;
  const { customId } = interaction;

  if (!customId.startsWith('accept_2fa_') && !customId.startsWith('refuse_2fa_')) {
    return false;
  }

  const isAccept = customId.startsWith('accept_2fa_');
  const requestId = customId.replace(isAccept ? 'accept_2fa_' : 'refuse_2fa_', '');

  const reqData = pending2FARequests.get(requestId);
  if (!reqData) {
    await interaction.reply({ content: '⚠️ Запрос аутентификации устарел или не найден.', ephemeral: true }).catch(() => {});
    return true;
  }

  if (isAccept) {
    reqData.status = 'APPROVED';
    const embed = new EmbedBuilder()
      .setTitle('✅ Вход Подтвержден!')
      .setDescription(`Вы успешно подтвердили вход в аккаунт **${reqData.displayName}** в Minecraft.`)
      .setColor(0x22c55e)
      .setTimestamp();

    await interaction.update({ embeds: [embed], components: [] }).catch(() => {});
  } else {
    reqData.status = 'REJECTED';
    const embed = new EmbedBuilder()
      .setTitle('⛔ Вход Отклонен!')
      .setDescription(`Вы отклонили вход в аккаунт **${reqData.displayName}**. Игрок был немедленно кикнут с сервера.`)
      .setColor(0xef4444)
      .setTimestamp();

    await interaction.update({ embeds: [embed], components: [] }).catch(() => {});
  }

  return true;
}
