// Node.js v19 Global Polyfills (Fixes undici/cheerio 'ReferenceError: File is not defined')
if (typeof globalThis.File === 'undefined') {
  class FilePolyfill extends Blob {
    constructor(sources, name, options = {}) {
      super(sources, options);
      this.name = name || 'file';
      this.lastModified = options.lastModified || Date.now();
    }
  }
  globalThis.File = FilePolyfill;
}

// Suppress Node 25 TimeoutNegativeWarning when voice ping or delay calculation is negative
const origSetTimeout = global.setTimeout;
global.setTimeout = function (fn, delay, ...args) {
  if (typeof delay === 'number' && delay < 0) delay = 1;
  return origSetTimeout(fn, delay, ...args);
};

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
if (ffmpegInstaller && ffmpegInstaller.path) {
  process.env.FFMPEG_PATH = ffmpegInstaller.path;
}

import { Client, GatewayIntentBits, Partials, Options } from 'discord.js';
import dotenv from 'dotenv';
import { initDatabase } from './database/db.js';
import { handleReady } from './events/ready.js';
import { handleMessageCreate } from './events/messageCreate.js';
import { handleInteractionCreate } from './events/interactionCreate.js';
import { handleVoiceStateUpdate } from './modules/tempVoice.js';
import { trackVoiceXP } from './modules/levelManager.js';
import { handleGuildMemberAdd, handleGuildMemberRemove } from './events/guildMemberAdd.js';
import { handleChannelAntiNuke, handleRoleAntiNuke } from './modules/antiNuke.js';
import { initSecurityShield } from './utils/securityShield.js';

dotenv.config();

// Initialize Token Security Shield (Redacts tokens from console and stack traces)
initSecurityShield();

// Initialize SQLite DB
initDatabase();

// Create Discord Client with Aggressive RAM Sweeping & Cache Optimization (Uses ~35MB RAM max)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  makeCache: Options.cacheWithLimits({
    MessageManager: 10,
    StageInstanceManager: 0,
    PresenceManager: 0,
    GuildBanManager: 0,
    ThreadManager: 0,
    ThreadMemberManager: 0,
    ReactionManager: 0,
    GuildEmojiManager: 0,
    GuildStickerManager: 0,
    GuildScheduledEventManager: 0,
    AutoModerationRuleManager: 0
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: 180, // Sweep messages every 3 minutes
      lifetime: 300
    }
  }
});

// Event Listeners
client.once('clientReady', () => handleReady(client));

client.on('messageCreate', (message) => handleMessageCreate(message));

client.on('interactionCreate', (interaction) => handleInteractionCreate(interaction));

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
  trackVoiceXP(oldState, newState);
});

client.on('guildMemberAdd', (member) => handleGuildMemberAdd(member));

client.on('guildMemberRemove', (member) => handleGuildMemberRemove(member));

// Anti-Nuke Protection Listeners
client.on('channelUpdate', (channel) => handleChannelAntiNuke(channel, 'update'));
client.on('channelDelete', (channel) => handleChannelAntiNuke(channel, 'delete'));
client.on('channelCreate', (channel) => handleChannelAntiNuke(channel, 'create'));
client.on('roleDelete', (role) => handleRoleAntiNuke(role));

// Error handling to keep bot online 24/7 without crashing process
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

// Login
async function startBot() {
  const rawToken = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || '';
  const token = rawToken.trim().replace(/^["']|["']$/g, '');

  if (!token) {
    console.error('[Login Error] Ошибка: DISCORD_TOKEN или DISCORD_BOT_TOKEN не найден в переменных окружения!');
    return;
  }

  try {
    await client.login(token);
  } catch (err) {
    console.error('[Login Error] Ошибка входа в Discord API:', err.message);
  }
}

startBot();
