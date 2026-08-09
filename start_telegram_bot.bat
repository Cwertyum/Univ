@echo off
title Oktovskie Site + Telegram Bot
chcp 65001 > nul
echo ====================================================
echo 🚀 Запуск Веб-Сайта и Telegram Бота Октовские...
echo ====================================================
cd /d "%~dp0telegram-bot"
node server.js
pause
