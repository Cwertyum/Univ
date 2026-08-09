import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tgProcess = null;
let startTime = null;

const tgDir = path.join(__dirname, '..', 'telegram-bot');
const indexPath = path.join(tgDir, 'index.js');

/**
 * Start Telegram Bot Process
 */
export function startTelegramBot() {
  if (tgProcess) {
    console.log('[Telegram Plugin] Бот уже запущен!');
    return { success: false, message: 'Telegram бот уже запущен.' };
  }

  if (!fs.existsSync(indexPath)) {
    console.error('[Telegram Plugin Error] Папка telegram-bot или index.js не найдены!');
    return { success: false, message: 'Папка telegram-bot или index.js не найдены.' };
  }

  try {
    tgProcess = spawn('node', ['index.js'], {
      cwd: tgDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    startTime = Date.now();
    console.log('[Telegram Plugin] 🚀 Telegram Бот успешно запущен через плагин! (PID:', tgProcess.pid, ')');

    tgProcess.stdout.on('data', (data) => {
      console.log(`[Telegram Bot Output] ${data.toString().trim()}`);
    });

    tgProcess.stderr.on('data', (data) => {
      console.error(`[Telegram Bot Error Output] ${data.toString().trim()}`);
    });

    tgProcess.on('close', (code) => {
      console.log(`[Telegram Plugin] Telegram бот остановлен с кодом выхода ${code}`);
      tgProcess = null;
      startTime = null;
    });

    return { success: true, message: `Telegram бот успешно запущен (PID: ${tgProcess.pid}).` };
  } catch (err) {
    console.error('[Telegram Plugin Exception]', err);
    return { success: false, message: `Ошибка запуска: ${err.message}` };
  }
}

/**
 * Stop Telegram Bot Process
 */
export function stopTelegramBot() {
  if (!tgProcess) {
    return { success: false, message: 'Telegram бот не запущен.' };
  }

  try {
    const pid = tgProcess.pid;
    tgProcess.kill('SIGTERM');
    tgProcess = null;
    startTime = null;
    console.log(`[Telegram Plugin] 🛑 Telegram бот (PID: ${pid}) был остановлен.`);
    return { success: true, message: `Telegram бот (PID: ${pid}) успешно остановлен.` };
  } catch (err) {
    return { success: false, message: `Ошибка при остановке: ${err.message}` };
  }
}

/**
 * Restart Telegram Bot Process
 */
export function restartTelegramBot() {
  stopTelegramBot();
  return startTelegramBot();
}

/**
 * Get Telegram Bot Running Status
 */
export function getTelegramStatus() {
  const isRunning = tgProcess !== null;
  const uptime = isRunning && startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  return {
    running: isRunning,
    pid: isRunning ? tgProcess.pid : null,
    uptimeSeconds: uptime,
    formattedUptime: `${Math.floor(uptime / 60)}м ${uptime % 60}с`
  };
}
