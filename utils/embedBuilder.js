import { EmbedBuilder } from 'discord.js';

export const COLORS = {
  PRIMARY: 0x5865F2,    // Blurple
  SUCCESS: 0x2ECC71,    // Emerald Green
  WARNING: 0xF1C40F,    // Gold / Yellow
  ERROR: 0xE74C3C,      // Coral Red
  INFO: 0x3498DB,       // Sky Blue
  PURPLE: 0x9B59B6,     // Royal Purple
  DARK: 0x1E1F22,       // Dark Discord Slate
  GOLD: 0xFFD700,       // Bright Gold
  PINK: 0xEB459E,       // Neon Pink
  CYAN: 0x00F5FF,       // Bright Cyan
  MAGENTA: 0xFF007F,    // Vibrant Magenta
  INDIGO: 0x6C5CE7,     // Deep Indigo
  EMERALD: 0x00B894,    // Rich Emerald
  CRIMSON: 0xD63031     // Deep Crimson
};

/**
 * Premium Embed Builder with sleek aesthetics and rich formatting
 */
export function createEmbed({ 
  title, 
  description, 
  color = COLORS.PRIMARY, 
  fields = [], 
  footer, 
  image, 
  thumbnail,
  author,
  url
}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (url) embed.setUrl(url);
  if (description) embed.setDescription(description);
  if (author) embed.setAuthor(typeof author === 'string' ? { name: author } : author);
  if (fields && fields.length > 0) embed.addFields(fields);
  
  if (footer) {
    embed.setFooter(typeof footer === 'string' ? { text: footer } : footer);
  } else {
    embed.setFooter({ text: '⚡ Universal Realms System • Премиум Бот' });
  }

  if (image) embed.setImage(image);
  if (thumbnail) embed.setThumbnail(thumbnail);

  return embed;
}

export function successEmbed(description, title = '✨ Действие Выполнено') {
  return createEmbed({ 
    title: `✅ ${title}`, 
    description: `> ${description}`, 
    color: COLORS.SUCCESS 
  });
}

export function errorEmbed(description, title = 'Ошибка Доступа / Выполнения') {
  return createEmbed({ 
    title: `⛔ ${title}`, 
    description: `> ${description}`, 
    color: COLORS.ERROR 
  });
}

export function warningEmbed(description, title = 'Системное Предупреждение') {
  return createEmbed({ 
    title: `⚠️ ${title}`, 
    description: `> ${description}`, 
    color: COLORS.WARNING 
  });
}

export function infoEmbed(description, title = 'Информация') {
  return createEmbed({ 
    title: `ℹ️ ${title}`, 
    description: description, 
    color: COLORS.INFO 
  });
}

export function raidShieldEmbed(description, title = '🚨 ULTRA ANTI-RAID SHIELD') {
  return createEmbed({
    title,
    description,
    color: COLORS.CRIMSON,
    footer: '🛡️ Universal Realms • Ultra Security Shield 24/7'
  });
}
