import { 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { createEmbed, COLORS, successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

let voiceModule = null;
let ytSearch = null;
let youtubedl = null;
let ytdlCore = null;
let ffmpegPath = null;
let libsLoaded = false;

async function loadMusicLibs() {
  if (libsLoaded) return { voiceModule, ytSearch, youtubedl, ytdlCore, ffmpegPath };
  libsLoaded = true;

  try { voiceModule = await import('@discordjs/voice'); } catch {}
  try {
    const m = await import('@distube/ytdl-core');
    ytdlCore = m.default || m;
  } catch {}
  try {
    const m = await import('yt-search');
    ytSearch = m.default || m;
  } catch {}
  try {
    const m = await import('youtube-dl-exec');
    youtubedl = m.default || m;
  } catch {}
  try {
    const ffInstaller = await import('@ffmpeg-installer/ffmpeg');
    const path = ffInstaller.default?.path || ffInstaller.path;
    if (path) {
      ffmpegPath = path;
      process.env.FFMPEG_PATH = path;
    }
  } catch {}
  if (!ffmpegPath) {
    try {
      const ff = await import('ffmpeg-static');
      ffmpegPath = ff.default || ff;
      if (ffmpegPath && typeof ffmpegPath === 'string') {
        process.env.FFMPEG_PATH = ffmpegPath;
      }
    } catch {}
  }

  return { voiceModule, ytSearch, youtubedl, ytdlCore, ffmpegPath };
}

// Guild music queues: guildId -> { connection, player, queue: [], current, loopMode: 'off', speed: '1.0', controlMessage: null }
const musicQueues = new Map();

export function getMusicQueue(guildId) {
  return musicQueues.get(guildId);
}

// Fetch Lyrics via LrcLib API
async function getSongLyrics(trackTitle) {
  try {
    const cleanTitle = trackTitle
      .replace(/\(Official Video\)|\(Audio\)|\(MV\)|\(Live\)|\(Official Music Video\)|\[.*\]/gi, '')
      .trim();

    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`);
    if (!res.ok) return null;
    const data = await res.json();
    
    if (data && Array.isArray(data) && data.length > 0) {
      const match = data.find(item => item.plainLyrics) || data[0];
      if (match && match.plainLyrics) {
        return match.plainLyrics;
      }
    }
  } catch (err) {
    console.error('[Lyrics Fetch Error]', err);
  }
  return null;
}

// Generate Interactive Control Buttons Rows (Row 1: Controls, Row 2: Lyrics)
function createMusicControlRows(serverQueue) {
  const pausedStatus = voiceModule?.AudioPlayerStatus?.Paused || 'paused';
  const isPaused = serverQueue.player?.state?.status === pausedStatus;
  
  let loopLabel = '🔁 Повтор: Выкл';
  let loopStyle = ButtonStyle.Secondary;
  if (serverQueue.loopMode === 'track') {
    loopLabel = '🔂 Повтор: Трек';
    loopStyle = ButtonStyle.Success;
  } else if (serverQueue.loopMode === 'queue') {
    loopLabel = '🔁 Повтор: Очередь';
    loopStyle = ButtonStyle.Success;
  }

  const speedStyle = serverQueue.speed !== '1.0' ? ButtonStyle.Primary : ButtonStyle.Secondary;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_btn_pause')
      .setLabel(isPaused ? '▶️ Продолжить' : '⏸️ Пауза')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('music_btn_skip')
      .setLabel('⏭️ Пропустить')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_btn_loop')
      .setLabel(loopLabel)
      .setStyle(loopStyle),
    new ButtonBuilder()
      .setCustomId('music_btn_speed')
      .setLabel(`⚡ Скорость: ${serverQueue.speed}x`)
      .setStyle(speedStyle),
    new ButtonBuilder()
      .setCustomId('music_btn_stop')
      .setLabel('⏹️ Стоп')
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_btn_lyrics')
      .setLabel('📜 Показать / Получить текст песни')
      .setStyle(ButtonStyle.Primary)
  );

  return [row1, row2];
}

// Generate Player Card Embed
function createPlayerEmbed(serverQueue) {
  const track = serverQueue.current;
  const loopText = serverQueue.loopMode === 'track' ? '🔂 Повтор Трека' : (serverQueue.loopMode === 'queue' ? '🔁 Повтор Очереди' : '❌ Выключен');

  return createEmbed({
    title: '🎶 СЕЙЧАС ИГРАЕТ МУЗЫКА',
    description: `**Название:** [${track.title}](${track.url})\n` +
                 `**Прямая ссылка:** [Смотреть на YouTube](${track.url})\n` +
                 `**Запросил:** ${track.requester}\n` +
                 `**Длительность:** \`${track.duration || 'Н/Д'}\` | **Скорость:** \`${serverQueue.speed}x\`\n` +
                 `**Режим повтора:** \`${loopText}\` | **В очереди:** \`${serverQueue.queue.length} треков\``,
    color: COLORS.PRIMARY,
    thumbnail: track.thumbnail,
    footer: 'Управление плеером производится кнопками ниже ⬇️'
  });
}

export async function playMusic(interaction, query) {
  const { guild, member, channel } = interaction;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ embeds: [errorEmbed('Вы должны находиться в голосовом канале!')], ephemeral: true }).catch(() => {});
    }
    return;
  }

  // Defer reply safely right away
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply().catch(() => {});
  }

  const { voiceModule: vMod, ytSearch: ytS } = await loadMusicLibs();

  if (!vMod || !vMod.joinVoiceChannel) {
    return await interaction.editReply({
      embeds: [errorEmbed('Музыкальные модули (голосовые библиотеки) пока не установлены на сервере!')]
    }).catch(() => {});
  }

  const { joinVoiceChannel, createAudioPlayer, AudioPlayerStatus, VoiceConnectionStatus, entersState } = vMod;

  // 1. Search YouTube using yt-search
  let track = null;
  try {
    if (query.startsWith('http://') || query.startsWith('https://')) {
      const searchResult = ytS ? await ytS({ videoId: getYouTubeId(query) }).catch(() => null) : null;
      if (searchResult) {
        track = {
          title: searchResult.title,
          url: searchResult.url,
          thumbnail: searchResult.thumbnail,
          duration: searchResult.timestamp,
          requester: member.user
        };
      } else {
        track = {
          title: 'YouTube Трек',
          url: query,
          thumbnail: null,
          duration: 'Н/Д',
          requester: member.user
        };
      }
    } else if (ytS) {
      const searchResult = await ytS(query).catch(() => null);
      if (searchResult && searchResult.videos && searchResult.videos.length > 0) {
        const top = searchResult.videos[0];
        track = {
          title: top.title,
          url: top.url,
          thumbnail: top.thumbnail,
          duration: top.timestamp,
          requester: member.user
        };
      }
    }
  } catch (err) {
    console.error('[yt-search Error]', err);
  }

  if (!track || !track.url) {
    return await interaction.editReply({
      embeds: [errorEmbed(`Ничего не найдено на YouTube по запросу: **${query}**`)]
    }).catch(() => {});
  }

  // 2. Initialize or fetch queue
  let serverQueue = musicQueues.get(guild.id);

  if (!serverQueue) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false
    });

    const player = createAudioPlayer();

    serverQueue = {
      voiceChannel,
      textChannel: channel,
      connection,
      player,
      queue: [],
      current: null,
      loopMode: 'off',
      speed: '1.0',
      controlMessage: null
    };

    connection.subscribe(player);
    musicQueues.set(guild.id, serverQueue);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch {
        stopMusic(guild.id);
      }
    });

    player.on(AudioPlayerStatus.Idle, () => {
      handleTrackEnd(guild.id);
    });

    player.on('error', err => {
      console.error('[Music Player Error]', err);
      handleTrackEnd(guild.id);
    });
  }

  serverQueue.queue.push(track);

  if (serverQueue.player.state.status === AudioPlayerStatus.Idle && !serverQueue.current) {
    await playNext(guild.id);
    await interaction.editReply({ embeds: [successEmbed(`Запущено воспроизведение: **${track.title}**`)] }).catch(() => {});
  } else {
    const queueEmbed = createEmbed({
      title: '🎵 ДОБАВЛЕНО В ОЧЕРЕДЬ YOUTUBE',
      description: `**Трек:** [${track.title}](${track.url})\n` +
                   `**Ссылка:** [Открыть на YouTube](${track.url})\n` +
                   `**Запросил:** ${track.requester}\n` +
                   `**Позиция в очереди:** \`#${serverQueue.queue.length}\``,
      color: COLORS.INFO,
      thumbnail: track.thumbnail
    });
    await interaction.editReply({ embeds: [queueEmbed] }).catch(() => {});
    updatePlayerCard(guild.id);
  }
}

async function handleTrackEnd(guildId) {
  const serverQueue = musicQueues.get(guildId);
  if (!serverQueue) return;

  if (serverQueue.loopMode === 'track' && serverQueue.current) {
    await playStream(serverQueue, serverQueue.current);
    return;
  }

  if (serverQueue.loopMode === 'queue' && serverQueue.current) {
    serverQueue.queue.push(serverQueue.current);
  }

  await playNext(guildId);
}

async function playNext(guildId) {
  const serverQueue = musicQueues.get(guildId);
  if (!serverQueue) return;

  if (serverQueue.queue.length === 0) {
    serverQueue.current = null;
    if (serverQueue.controlMessage) {
      serverQueue.controlMessage.delete().catch(() => {});
      serverQueue.controlMessage = null;
    }
    setTimeout(() => {
      const destroyedStatus = voiceModule?.VoiceConnectionStatus?.Destroyed || 'destroyed';
      if (serverQueue.queue.length === 0 && serverQueue.connection?.state?.status !== destroyedStatus) {
        serverQueue.connection.destroy();
        musicQueues.delete(guildId);
      }
    }, 30000);
    return;
  }

  const track = serverQueue.queue.shift();
  serverQueue.current = track;

  if (!track || !track.url) {
    playNext(guildId);
    return;
  }

  await playStream(serverQueue, track);
}

async function playStream(serverQueue, track) {
  try {
    const createAudioResource = voiceModule?.createAudioResource;
    const StreamType = voiceModule?.StreamType;
    if (!createAudioResource) {
      throw new Error('Музыкальные модули не загружены');
    }

    let stream = null;
    let streamType = StreamType?.Arbitrary || 'arbitrary';

    // 1. Try @distube/ytdl-core first (pure JS, ultra fast, no binary dependencies)
    if (ytdlCore && typeof ytdlCore === 'function') {
      try {
        process.env.YTDL_NO_UPDATE = 'true';
        stream = ytdlCore(track.url, {
          filter: 'audioonly',
          highWaterMark: 1 << 25
        });
      } catch (err) {
        console.warn('[ytdl-core Warning]', err.message);
      }
    }

    // 2. Fallback to youtube-dl-exec
    if (!stream && youtubedl) {
      const postArgs = serverQueue.speed !== '1.0'
        ? ['-af', `atempo=${serverQueue.speed}`]
        : [];

      const options = { 
        output: '-', 
        format: 'bestaudio/best',
        noCheckCertificates: true,
        noWarnings: true
      };
      if (postArgs.length) {
        options.postprocessorArgs = `ffmpeg:${postArgs.join(' ')}`;
      }

      const proc = youtubedl.exec(
        track.url,
        options,
        { stdio: ['ignore', 'pipe', 'ignore'] }
      );
      stream = proc.stdout;
    }

    if (!stream) {
      throw new Error('Не удалось создать аудиопоток ни одним из доступных способов');
    }

    let resource;
    const demuxProbe = voiceModule?.demuxProbe;
    if (demuxProbe && typeof demuxProbe === 'function') {
      try {
        const { stream: probedStream, type } = await demuxProbe(stream);
        resource = createAudioResource(probedStream, { inputType: type });
      } catch (probeErr) {
        resource = createAudioResource(stream, { inputType: streamType });
      }
    } else {
      resource = createAudioResource(stream, { inputType: streamType });
    }

    serverQueue.player.play(resource);

    // Send or update control panel message
    const embed = createPlayerEmbed(serverQueue);
    const rows = createMusicControlRows(serverQueue);

    if (serverQueue.controlMessage) {
      serverQueue.controlMessage.edit({ embeds: [embed], components: rows }).catch(async () => {
        serverQueue.controlMessage = await serverQueue.textChannel.send({ embeds: [embed], components: rows }).catch(() => null);
      });
    } else {
      serverQueue.controlMessage = await serverQueue.textChannel.send({ embeds: [embed], components: rows }).catch(() => null);
    }
  } catch (err) {
    console.error('[Stream Error]', err);
    serverQueue.textChannel.send({ embeds: [errorEmbed(`Не удалось воспроизвести поток: ${track.title}`)] }).catch(() => {});
    handleTrackEnd(serverQueue.voiceChannel.guild.id);
  }
}

async function updatePlayerCard(guildId) {
  const serverQueue = musicQueues.get(guildId);
  if (!serverQueue || !serverQueue.controlMessage || !serverQueue.current) return;

  const embed = createPlayerEmbed(serverQueue);
  const rows = createMusicControlRows(serverQueue);
  await serverQueue.controlMessage.edit({ embeds: [embed], components: rows }).catch(() => {});
}

// Handle Interactive Music Buttons (Pause, Skip, Loop, Speed, Stop, Lyrics)
export async function handleMusicButtonInteraction(interaction) {
  const { customId, guild } = interaction;
  if (!customId.startsWith('music_btn_')) return false;

  const serverQueue = musicQueues.get(guild.id);
  if (!serverQueue) {
    await interaction.reply({ embeds: [errorEmbed('Музыкальный плеер сейчас не активен!')], ephemeral: true }).catch(() => {});
    return true;
  }

  const voiceChannel = interaction.member.voice.channel;
  if (!voiceChannel || voiceChannel.id !== serverQueue.voiceChannel.id) {
    await interaction.reply({ embeds: [errorEmbed('Вы должны находиться в одном голосовом канале с ботом!')], ephemeral: true }).catch(() => {});
    return true;
  }

  // 1. Pause / Resume
  if (customId === 'music_btn_pause') {
    const isPaused = serverQueue.player.state.status === AudioPlayerStatus.Paused;
    if (isPaused) {
      serverQueue.player.unpause();
      await interaction.reply({ embeds: [successEmbed('▶️ Воспроизведение возобновлено!')], ephemeral: true }).catch(() => {});
    } else {
      serverQueue.player.pause();
      await interaction.reply({ embeds: [infoEmbed('⏸️ Воспроизведение поставлено на паузу!')], ephemeral: true }).catch(() => {});
    }
    updatePlayerCard(guild.id);
    return true;
  }

  // 2. Skip
  if (customId === 'music_btn_skip') {
    await interaction.reply({ embeds: [successEmbed('⏭️ Трек пропущен!')], ephemeral: true }).catch(() => {});
    serverQueue.player.stop();
    return true;
  }

  // 3. Loop Mode Toggle (off -> track -> queue -> off)
  if (customId === 'music_btn_loop') {
    if (serverQueue.loopMode === 'off') {
      serverQueue.loopMode = 'track';
      await interaction.reply({ embeds: [successEmbed('🔂 Включен повтор текущего трека!')], ephemeral: true }).catch(() => {});
    } else if (serverQueue.loopMode === 'track') {
      serverQueue.loopMode = 'queue';
      await interaction.reply({ embeds: [successEmbed('🔁 Включен повтор всей очереди!')], ephemeral: true }).catch(() => {});
    } else {
      serverQueue.loopMode = 'off';
      await interaction.reply({ embeds: [infoEmbed('❌ Повтор отключен!')], ephemeral: true }).catch(() => {});
    }
    updatePlayerCard(guild.id);
    return true;
  }

  // 4. Speed Toggle (1.0x -> 1.25x -> 1.5x -> 2.0x -> 0.75x -> 1.0x)
  if (customId === 'music_btn_speed') {
    const speeds = ['1.0', '1.25', '1.5', '2.0', '0.75'];
    const currentIndex = speeds.indexOf(serverQueue.speed);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    serverQueue.speed = nextSpeed;

    await interaction.reply({ embeds: [successEmbed(`⚡ Скорость воспроизведения изменена на **${nextSpeed}x**! Перезапуск трека...`)], ephemeral: true }).catch(() => {});
    
    if (serverQueue.current) {
      await playStream(serverQueue, serverQueue.current);
    } else {
      updatePlayerCard(guild.id);
    }
    return true;
  }

  // 5. Stop
  if (customId === 'music_btn_stop') {
    stopMusic(guild.id);
    await interaction.reply({ embeds: [successEmbed('⏹️ Воспроизведение остановлено, бот отключен от канала!')], ephemeral: true }).catch(() => {});
    return true;
  }

  // 6. Lyrics Button (Show Lyrics in Ephemeral & Send DM)
  if (customId === 'music_btn_lyrics') {
    if (!serverQueue.current) {
      await interaction.reply({ embeds: [errorEmbed('Сейчас ничего не играет!')], ephemeral: true }).catch(() => {});
      return true;
    }

    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const lyrics = await getSongLyrics(serverQueue.current.title);

    if (!lyrics) {
      await interaction.editReply({ embeds: [errorEmbed(`К сожалению, текст для песни **${serverQueue.current.title}** не найден в базе!`)] }).catch(() => {});
      return true;
    }

    const lyricsEmbed = createEmbed({
      title: `📜 ТЕКСТ ПЕСНИ: ${serverQueue.current.title}`,
      description: lyrics.length > 3900 ? lyrics.substring(0, 3900) + '...\n\n*(Текст сокращен из-за лимита)*' : lyrics,
      color: COLORS.PRIMARY,
      footer: 'Universal Realms Music • Текст песни'
    });

    // Send in ephemeral response immediately so user sees it right away on screen
    await interaction.editReply({ embeds: [lyricsEmbed] }).catch(() => {});

    // Try to send to DM as well
    interaction.user.send({ embeds: [lyricsEmbed] }).catch(() => {});
    return true;
  }

  return false;
}

function getYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : url;
}

export function stopMusic(guildId) {
  const serverQueue = musicQueues.get(guildId);
  if (serverQueue) {
    serverQueue.queue = [];
    serverQueue.player.stop();
    if (serverQueue.controlMessage) {
      serverQueue.controlMessage.delete().catch(() => {});
      serverQueue.controlMessage = null;
    }
    if (serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      serverQueue.connection.destroy();
    }
    musicQueues.delete(guildId);
    return true;
  }
  return false;
}

export function skipMusic(guildId) {
  const serverQueue = musicQueues.get(guildId);
  if (serverQueue && serverQueue.player) {
    serverQueue.player.stop();
    return true;
  }
  return false;
}
