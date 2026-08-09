import db from '../database/db.js';
import { getUserData } from './levelManager.js';
import { createEmbed, COLORS, successEmbed, errorEmbed } from '../utils/embedBuilder.js';

/**
 * Add or subtract balance
 */
export function addBalance(guildId, userId, amount) {
  let userData = getUserData(guildId, userId);
  const newBalance = Math.max(0, userData.balance + amount);
  db.prepare(`
    INSERT INTO users (guild_id, user_id, balance) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET balance = ?
  `).run(guildId, userId, newBalance, newBalance);
  return newBalance;
}

/**
 * Claim Daily Reward
 */
export function claimDaily(guildId, userId) {
  const userData = getUserData(guildId, userId);
  const now = Date.now();
  const Cooldown = 24 * 60 * 60 * 1000; // 24 hours

  if (now - userData.last_daily < Cooldown) {
    const remainingMs = Cooldown - (now - userData.last_daily);
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return { success: false, message: `Вы уже получали ежедневную награду! Приходите через **${hours}ч ${minutes}мин**.` };
  }

  const reward = 250;
  db.prepare('UPDATE users SET balance = balance + ?, last_daily = ? WHERE guild_id = ? AND user_id = ?')
    .run(reward, now, guildId, userId);

  return { success: true, reward, newBalance: userData.balance + reward };
}

/**
 * Coinflip Minigame
 */
export function playCoinflip(guildId, userId, bet, choice) {
  const userData = getUserData(guildId, userId);
  if (userData.balance < bet || bet <= 0) {
    return { success: false, message: 'У вас недостаточно средств на балансе!' };
  }

  const sides = ['heads', 'tails']; // heads = орел, tails = решка
  const result = sides[Math.floor(Math.random() * sides.length)];
  const won = (result === choice);

  if (won) {
    addBalance(guildId, userId, bet);
    return { 
      success: true, 
      won: true, 
      result: result === 'heads' ? '🦅 Орел' : '🪙 Решка', 
      amount: bet, 
      newBalance: userData.balance + bet 
    };
  } else {
    addBalance(guildId, userId, -bet);
    return { 
      success: true, 
      won: false, 
      result: result === 'heads' ? '🦅 Орел' : '🪙 Решка', 
      amount: bet, 
      newBalance: userData.balance - bet 
    };
  }
}

/**
 * Guess Number Minigame
 */
export function playGuessNumber(userChoice, bet = 0) {
  const secret = Math.floor(Math.random() * 5) + 1; // 1 to 5
  const won = (parseInt(userChoice, 10) === secret);
  return { won, secret };
}

/**
 * Trivia Questions Array
 */
export const TRIVIA_QUESTIONS = [
  { question: 'Сколько планет в Солнечной системе?', options: ['7', '8', '9', '10'], answer: 1 },
  { question: 'Какая столица Франции?', options: ['Лондон', 'Берлин', 'Париж', 'Мадрид'], answer: 2 },
  { question: 'Какой элемент обозначен как O в таблице Менделеева?', options: ['Водород', 'Кислород', 'Золото', 'Железо'], answer: 1 },
  { question: 'В каком году был запущен Discord?', options: ['2012', '2015', '2018', '2020'], answer: 1 }
];
