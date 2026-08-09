<?php
// ====================================================================
// 🛡️ Единый Автономный PHP Движок Сайта и Телеграм Бота «Октовские»
// РАБОТАЕТ НА 100% НА ЛЮБОМ PHP ХОСТИНГЕ БЕЗ ЗАПУСКА НА ПК!
// Bypasses InfinityFree anti-bot protection using Outbound Polling.
// ====================================================================

$BOT_TOKEN = '8832683811:AAHzSybM4L-11LhQchn_n_W7HGUOOkRYmDs';
$ADMIN_CHAT_ID = '8632507406';
$ADMIN_USERNAME = 'tagevod';

$REPORTS_FILE = __DIR__ . '/reports_db.json';
$STATES_FILE = __DIR__ . '/user_states.json';
$ADMINS_FILE = __DIR__ . '/admins_db.json';
$OFFSET_FILE = __DIR__ . '/tg_offset.txt';

function getAdmins() {
    global $ADMINS_FILE, $ADMIN_USERNAME;
    $admins = [strtolower($ADMIN_USERNAME)];
    if (file_exists($ADMINS_FILE)) {
        $data = json_decode(file_get_contents($ADMINS_FILE), true);
        if (is_array($data)) {
            foreach ($data as $a) {
                $clean = strtolower(ltrim(trim($a), '@'));
                if (!empty($clean) && !in_array($clean, $admins)) {
                    $admins[] = $clean;
                }
            }
        }
    }
    return $admins;
}

function addAdmin($username) {
    global $ADMINS_FILE;
    $clean = strtolower(ltrim(trim($username), '@'));
    if (empty($clean)) return false;
    $admins = getAdmins();
    if (!in_array($clean, $admins)) {
        $admins[] = $clean;
        file_put_contents($ADMINS_FILE, json_encode(array_values($admins), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
    return true;
}

function removeAdmin($username) {
    global $ADMINS_FILE, $ADMIN_USERNAME;
    $clean = strtolower(ltrim(trim($username), '@'));
    if ($clean === strtolower($ADMIN_USERNAME)) return false;
    $admins = getAdmins();
    $admins = array_filter($admins, fn($a) => strtolower($a) !== $clean);
    file_put_contents($ADMINS_FILE, json_encode(array_values($admins), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    return true;
}

function isAdminUsername($username) {
    $clean = strtolower(ltrim(trim($username), '@'));
    return in_array($clean, getAdmins());
}

function getAdminsString() {
    $admins = getAdmins();
    $formatted = array_map(fn($a) => '@' . $a, $admins);
    return implode(', ', $formatted);
}

function getReports() {
    global $REPORTS_FILE;
    if (!file_exists($REPORTS_FILE)) return [];
    $data = json_decode(file_get_contents($REPORTS_FILE), true);
    return is_array($data) ? $data : [];
}

function saveReport($report) {
    global $REPORTS_FILE;
    $reports = getReports();
    $reports[$report['id']] = $report;
    file_put_contents($REPORTS_FILE, json_encode($reports, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function getUserState($userId) {
    global $STATES_FILE;
    if (!file_exists($STATES_FILE)) return null;
    $states = json_decode(file_get_contents($STATES_FILE), true);
    return $states[$userId] ?? null;
}

function setUserState($userId, $state) {
    global $STATES_FILE;
    $states = file_exists($STATES_FILE) ? json_decode(file_get_contents($STATES_FILE), true) : [];
    if ($state === null) {
        unset($states[$userId]);
    } else {
        $states[$userId] = $state;
    }
    file_put_contents($STATES_FILE, json_encode($states, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function callTg($method, $data = []) {
    global $BOT_TOKEN;
    $url = "https://api.telegram.org/bot{$BOT_TOKEN}/{$method}";
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true);
}

function processUpdate($update) {
    global $ADMIN_CHAT_ID, $ADMIN_USERNAME;

    if (isset($update['callback_query'])) {
        $cb = $update['callback_query'];
        $cbId = $cb['id'];
        $fromUser = $cb['from']['username'] ?? '';
        $data = $cb['data'] ?? '';
        $chatId = $cb['message']['chat']['id'] ?? '';
        $messageId = $cb['message']['message_id'] ?? '';

        if (!isAdminUsername($fromUser)) {
            callTg('answerCallbackQuery', ['callback_query_id' => $cbId, 'text' => '⛔ Нет доступа.', 'show_alert' => true]);
            return;
        }

        if (strpos($data, 'adm_access_') === 0) {
            $reportId = (int)str_replace('adm_access_', '', $data);
            $reports = getReports();
            if (isset($reports[$reportId])) {
                $reports[$reportId]['status'] = 'ACCESS';
                saveReport($reports[$reportId]);

                callTg('answerCallbackQuery', ['callback_query_id' => $cbId, 'text' => '✅ Жалоба выполнена!']);
                callTg('editMessageText', [
                    'chat_id' => $chatId,
                    'message_id' => $messageId,
                    'text' => $cb['message']['text'] . "\n\n✅ <b>СТАТУС: ВЫПОЛНЕНО (@{$fromUser})</b>",
                    'parse_mode' => 'HTML'
                ]);

                if (!empty($reports[$reportId]['telegram_id']) && $reports[$reportId]['telegram_id'] !== 'WEB') {
                    callTg('sendMessage', [
                        'chat_id' => $reports[$reportId]['telegram_id'],
                        'text' => "✅ <b>Обновление по вашей жалобе #OCT-{$reportId}</b>\n\nСтатус: <b>Выполнено!</b> 🎉\nВаша проблема решена администрацией <b>Октовские</b>.",
                        'parse_mode' => 'HTML'
                    ]);
                }
            }
        }

        if (strpos($data, 'adm_delete_') === 0) {
            $reportId = (int)str_replace('adm_delete_', '', $data);
            $reports = getReports();
            if (isset($reports[$reportId])) {
                $reason = 'Проблема не подтверждена или не требует вмешательства';
                $reports[$reportId]['status'] = 'DELETE';
                $reports[$reportId]['reason'] = $reason;
                saveReport($reports[$reportId]);

                callTg('answerCallbackQuery', ['callback_query_id' => $cbId, 'text' => '❌ Жалоба отклонена']);
                callTg('editMessageText', [
                    'chat_id' => $chatId,
                    'message_id' => $messageId,
                    'text' => $cb['message']['text'] . "\n\n❌ <b>СТАТУС: ОТКЛОНЕНО (@{$fromUser})</b>\nПричина: {$reason}",
                    'parse_mode' => 'HTML'
                ]);

                if (!empty($reports[$reportId]['telegram_id']) && $reports[$reportId]['telegram_id'] !== 'WEB') {
                    callTg('sendMessage', [
                        'chat_id' => $reports[$reportId]['telegram_id'],
                        'text' => "❌ <b>Обновление по вашей жалобе #OCT-{$reportId}</b>\n\nВаша проблема <b>не решена</b>.\n<b>Причина:</b> <i>{$reason}</i>",
                        'parse_mode' => 'HTML'
                    ]);
                }
            }
        }
        return;
    }

    if (isset($update['message'])) {
        $msg = $update['message'];
        $chatId = $msg['chat']['id'];
        $userId = $msg['from']['id'];
        $username = $msg['from']['username'] ?? '';
        $text = trim($msg['text'] ?? '');

        $isAdmin = isAdminUsername($username);
        $adminsListStr = getAdminsString();

        if ($text === '/start') {
            setUserState($userId, null);
            $welcome = "🛡️ <b>Организация «Октовские» — Бот Защиты Игроков</b> 🛡️\n\n"
                     . "Привет! Бот полностью встроен в веб-сайт и работает прямо на хостинге.\n\n"
                     . "👑 <b>Администраторы:</b> {$adminsListStr}\n\n"
                     . ($isAdmin ? "👑 <b>Админ-команды:</b>\n• <code>/admin add @username</code> — Добавить админа\n• <code>/admin remove @username</code> — Удалить админа\n• <code>/admin list</code> — Список админов\n• <code>/access ID</code> — Принять жалобу\n• <code>/delete ID Причина</code> — Отклонить\n• <code>/list</code> — Список жалоб\n\n" : "")
                     . "Для подачи жалобы нажмите 📝 <b>Подать жалобу</b> или напишите <code>/report</code>.";

            $keyboard = [
                'keyboard' => [
                    [['text' => '📝 Подать жалобу'], ['text' => '📋 Мои обращения']],
                    [['text' => 'ℹ️ Информация Октовские'], ['text' => '❓ Помощь']]
                ],
                'resize_keyboard' => true
            ];

            callTg('sendMessage', ['chat_id' => $chatId, 'text' => $welcome, 'parse_mode' => 'HTML', 'reply_markup' => $keyboard]);
            return;
        }

        if ($isAdmin && strpos($text, '/admin') === 0) {
            $parts = explode(' ', $text);
            $subCmd = strtolower($parts[1] ?? '');

            if ($subCmd === 'add') {
                $newAdmin = $parts[2] ?? '';
                if (empty($newAdmin)) {
                    callTg('sendMessage', ['chat_id' => $chatId, 'text' => '⚠️ Использование: <code>/admin add @username</code>', 'parse_mode' => 'HTML']);
                    return;
                }
                addAdmin($newAdmin);
                callTg('sendMessage', ['chat_id' => $chatId, 'text' => "✅ Администратор <b>@" . ltrim($newAdmin, '@') . "</b> успешно добавлен!\n\nТекущие админы: " . getAdminsString(), 'parse_mode' => 'HTML']);
                return;
            }

            if ($subCmd === 'remove' || $subCmd === 'del') {
                $targetAdmin = $parts[2] ?? '';
                if (empty($targetAdmin)) {
                    callTg('sendMessage', ['chat_id' => $chatId, 'text' => '⚠️ Использование: <code>/admin remove @username</code>', 'parse_mode' => 'HTML']);
                    return;
                }
                removeAdmin($targetAdmin);
                callTg('sendMessage', ['chat_id' => $chatId, 'text' => "❌ Администратор <b>@" . ltrim($targetAdmin, '@') . "</b> удален.\n\nТекущие админы: " . getAdminsString(), 'parse_mode' => 'HTML']);
                return;
            }

            if ($subCmd === 'list') {
                callTg('sendMessage', ['chat_id' => $chatId, 'text' => "👑 <b>Список Администраторов Октовские:</b>\n" . getAdminsString(), 'parse_mode' => 'HTML']);
                return;
            }
            return;
        }

        if ($isAdmin && strpos($text, '/access') === 0) {
            $parts = explode(' ', $text);
            if (count($parts) < 2) {
                callTg('sendMessage', ['chat_id' => $chatId, 'text' => '⚠️ Использование: <code>/access <ID></code>', 'parse_mode' => 'HTML']);
                return;
            }
            $reportId = (int)str_replace('#OCT-', '', $parts[1]);
            $reports = getReports();

            if (isset($reports[$reportId])) {
                $reports[$reportId]['status'] = 'ACCESS';
                saveReport($reports[$reportId]);

                callTg('sendMessage', ['chat_id' => $chatId, 'text' => "✅ <b>Жалоба #OCT-{$reportId} отмечена как Выполнено!</b>", 'parse_mode' => 'HTML']);
                if (!empty($reports[$reportId]['telegram_id']) && $reports[$reportId]['telegram_id'] !== 'WEB') {
                    callTg('sendMessage', [
                        'chat_id' => $reports[$reportId]['telegram_id'],
                        'text' => "✅ <b>Обновление по вашей жалобе #OCT-{$reportId}</b>\n\nСтатус: <b>Выполнено!</b> 🎉\nВаша проблема решена администрацией <b>Октовские</b>.",
                        'parse_mode' => 'HTML'
                    ]);
                }
            } else {
                callTg('sendMessage', ['chat_id' => $chatId, 'text' => "❌ Жалоба #OCT-{$reportId} не найдена."]);
            }
            return;
        }

        if ($isAdmin && strpos($text, '/delete') === 0) {
            $parts = explode(' ', $text);
            if (count($parts) < 2) {
                callTg('sendMessage', ['chat_id' => $chatId, 'text' => '⚠️ Использование: <code>/delete <ID> <Причина></code>', 'parse_mode' => 'HTML']);
                return;
            }
            $reportId = (int)str_replace('#OCT-', '', $parts[1]);
            $reason = count($parts) > 2 ? implode(' ', array_slice($parts, 2)) : 'Там ничего не случилось / не подтверждено';
            $reports = getReports();

            if (isset($reports[$reportId])) {
                $reports[$reportId]['status'] = 'DELETE';
                $reports[$reportId]['reason'] = $reason;
                saveReport($reports[$reportId]);

                callTg('sendMessage', ['chat_id' => $chatId, 'text' => "❌ <b>Жалоба #OCT-{$reportId} отклонена.</b>\nПричина: <i>{$reason}</i>", 'parse_mode' => 'HTML']);
                if (!empty($reports[$reportId]['telegram_id']) && $reports[$reportId]['telegram_id'] !== 'WEB') {
                    callTg('sendMessage', [
                        'chat_id' => $reports[$reportId]['telegram_id'],
                        'text' => "❌ <b>Обновление по вашей жалобе #OCT-{$reportId}</b>\n\nВаша проблема <b>не решена</b>.\n<b>Причина:</b> <i>{$reason}</i>",
                        'parse_mode' => 'HTML'
                    ]);
                }
            } else {
                callTg('sendMessage', ['chat_id' => $chatId, 'text' => "❌ Жалоба #OCT-{$reportId} не найдена."]);
            }
            return;
        }

        if ($isAdmin && ($text === '/list' || $text === '/pending')) {
            $reports = getReports();
            $pending = array_filter($reports, fn($r) => ($r['status'] ?? '') === 'PENDING');

            if (empty($pending)) {
                callTg('sendMessage', ['chat_id' => $chatId, 'text' => '🎉 Активных жалоб нет. Все обращения рассмотрены!']);
                return;
            }

            $listText = "📋 <b>Список ожидающих жалоб (" . count($pending) . "):</b>\n\n";
            foreach ($pending as $r) {
                $listText .= "<b>#OCT-{$r['id']}</b> | Ник: <code>{$r['nickname']}</code>\n";
                $listText .= "💬 <b>Проблема:</b> {$r['problem']}\n";
                $listText .= "<i>Для действия: /access {$r['id']} или /delete {$r['id']} причина</i>\n\n";
            }
            callTg('sendMessage', ['chat_id' => $chatId, 'text' => $listText, 'parse_mode' => 'HTML']);
            return;
        }

        if ($text === '📝 Подать жалобу' || $text === '/report') {
            setUserState($userId, ['step' => 'WAITING_PROBLEM']);
            callTg('sendMessage', [
                'chat_id' => $chatId,
                'text' => "📝 <b>Шаг 1 из 2: Описание проблемы</b>\n\nОпишите подробно, <b>в чем проблема</b>?",
                'parse_mode' => 'HTML',
                'reply_markup' => ['remove_keyboard' => true]
            ]);
            return;
        }

        $state = getUserState($userId);

        if ($state && $state['step'] === 'WAITING_PROBLEM') {
            setUserState($userId, ['step' => 'WAITING_NICKNAME', 'problem' => $text]);
            callTg('sendMessage', [
                'chat_id' => $chatId,
                'text' => "👤 <b>Шаг 2 из 2: Никнейм игрока</b>\n\nУкажите ваш игровой никнейм:",
                'parse_mode' => 'HTML'
            ]);
            return;
        }

        if ($state && $state['step'] === 'WAITING_NICKNAME') {
            $nickname = $text;
            $problem = $state['problem'];
            setUserState($userId, null);

            $reportId = rand(1000, 9999);
            $report = [
                'id' => $reportId,
                'telegram_id' => $userId,
                'telegram_username' => $username,
                'nickname' => $nickname,
                'problem' => $problem,
                'status' => 'PENDING',
                'created_at' => date('d.m.Y H:i:s')
            ];
            saveReport($report);

            $keyboard = [
                'keyboard' => [
                    [['text' => '📝 Подать жалобу'], ['text' => '📋 Мои обращения']],
                    [['text' => 'ℹ️ Информация Октовские'], ['text' => '❓ Помощь']]
                ],
                'resize_keyboard' => true
            ];

            $adminsStr = getAdminsString();
            $confirmMsg = "✨ <b>Ваше обращение #OCT-{$reportId} принято!</b>\n\n1. <b>Проблема:</b> {$problem}\n2. <b>Никнейм:</b> <code>{$nickname}</code>\n\n🛡️ <i>Скоро решим вашу проблему.</i>\nАдминистраторы <b>{$adminsStr}</b> уже уведомлены.";
            callTg('sendMessage', ['chat_id' => $chatId, 'text' => $confirmMsg, 'parse_mode' => 'HTML', 'reply_markup' => $keyboard]);

            $adminNotice = "🚨 <b>НОВОЕ ОБРАЩЕНИЕ #OCT-{$reportId}</b> 🚨\n\n1. <b>Проблема:</b> {$problem}\n2. <b>Никнейм:</b> <code>{$nickname}</code>\n\n👤 <b>Пользователь:</b> @" . ($username ? $username : 'нет') . " (ID: <code>{$userId}</code>)\n⏰ <b>Время:</b> " . date('d.m.Y H:i:s');
            callTg('sendMessage', [
                'chat_id' => $ADMIN_CHAT_ID,
                'text' => $adminNotice,
                'parse_mode' => 'HTML',
                'reply_markup' => [
                    'inline_keyboard' => [
                        [
                            ['text' => '✅ Выполнено', 'callback_data' => "adm_access_{$reportId}"],
                            ['text' => '❌ Отклонить', 'callback_data' => "adm_delete_{$reportId}"]
                        ]
                    ]
                ]
            ]);
            return;
        }

        callTg('sendMessage', ['chat_id' => $chatId, 'text' => "Здравствуйте! Напишите <code>/start</code> или нажмите 📝 <b>Подать жалобу</b>.", 'parse_mode' => 'HTML']);
        return;
    }
}

function runTelegramPolling() {
    global $OFFSET_FILE;
    $offset = file_exists($OFFSET_FILE) ? (int)file_get_contents($OFFSET_FILE) : 0;
    
    $res = callTg('getUpdates', ['offset' => $offset, 'limit' => 20, 'timeout' => 0]);
    if (!empty($res['result']) && is_array($res['result'])) {
        foreach ($res['result'] as $upd) {
            $nextOffset = $upd['update_id'] + 1;
            file_put_contents($OFFSET_FILE, $nextOffset);
            processUpdate($upd);
        }
    }
}

runTelegramPolling();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'submit_report') {
    header('Content-Type: application/json; charset=utf-8');
    
    $nickname = trim($_POST['nickname'] ?? '');
    $problem = trim($_POST['problem'] ?? '');
    $telegram = trim($_POST['telegram'] ?? '');

    if (empty($nickname) || empty($problem)) {
        echo json_encode(['success' => false, 'message' => 'Заполните никнейм и проблему!']);
        exit;
    }

    $reportId = rand(1000, 9999);
    $timeStr = date('d.m.Y H:i:s');
    $tgUser = !empty($telegram) ? '@' . ltrim($telegram, '@') : 'не указан';
    $adminsStr = getAdminsString();

    $report = [
        'id' => $reportId,
        'telegram_id' => 'WEB',
        'telegram_username' => $telegram,
        'nickname' => $nickname,
        'problem' => $problem,
        'status' => 'PENDING',
        'created_at' => $timeStr
    ];
    saveReport($report);

    $text = "🌐 <b>НОВОЕ ОБРАЩЕНИЕ С ВЕБ-САЙТА (#OCT-{$reportId})</b>\n\n";
    $text .= "1. <b>Игровой никнейм:</b> <code>" . htmlspecialchars($nickname) . "</code>\n";
    $text .= "2. <b>Суть проблемы:</b> " . htmlspecialchars($problem) . "\n\n";
    $text .= "💬 <b>Связь Telegram:</b> {$tgUser}\n";
    $text .= "⏰ <b>Время:</b> {$timeStr}\n";
    $text .= "🛡️ <i>Организация Октовские Защита</i>";

    $payload = [
        'chat_id' => $ADMIN_CHAT_ID,
        'text' => $text,
        'parse_mode' => 'HTML',
        'reply_markup' => [
            'inline_keyboard' => [
                [
                    ['text' => '✅ Выполнено', 'callback_data' => "adm_access_{$reportId}"],
                    ['text' => '❌ Отклонить', 'callback_data' => "adm_delete_{$reportId}"]
                ]
            ]
        ]
    ];

    $res = callTg('sendMessage', $payload);

    if ($res && isset($res['ok']) && $res['ok']) {
        echo json_encode([
            'success' => true,
            'message' => "Ваше обращение #OCT-{$reportId} успешно отправлено! Скоро решим вашу проблему. Администраторы {$adminsStr} уже уведомлены."
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => "Ошибка отправки в Telegram. Проверьте настройки бота."
        ]);
    }
    exit;
}

$currentAdminsStr = getAdminsString();
?>
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Октовские Защита — Веб-сайт и Портал Обращений</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@400;500;600;700&display=swap');
    
    * { margin:0; padding:0; box-sizing:border-box; font-family:'Inter', sans-serif; }
    body { background: #0a0c16; color: #f3f4f6; min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
    
    header { width: 100%; max-width: 1100px; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .logo-box { display: flex; align-items: center; gap: 12px; }
    .logo-icon { width: 44px; height: 44px; background: linear-gradient(135deg, #00f0ff, #7000ff); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    .logo-title { font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 800; color: #00f0ff; }

    .status-badge { display: flex; align-items: center; gap: 8px; background: rgba(16,185,129,0.1); border: 1px solid #10b981; color: #34d399; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; }

    main { width: 100%; max-width: 700px; padding: 40px 20px; }
    .card { background: rgba(18,22,40,0.85); border: 1px solid rgba(0,240,255,0.25); border-radius: 18px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; }
    
    h2 { font-family: 'Outfit', sans-serif; font-size: 28px; margin-bottom: 10px; }
    p.desc { color: #9ca3af; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }

    .form-group { text-align: left; margin-bottom: 18px; }
    label { font-size: 13px; font-weight: 600; color: #e5e7eb; display: block; margin-bottom: 6px; }
    input, textarea { width: 100%; background: rgba(10,12,22,0.9); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; padding: 12px 14px; color: #fff; font-size: 14px; }
    input:focus, textarea:focus { outline: none; border-color: #00f0ff; box-shadow: 0 0 10px rgba(0,240,255,0.2); }

    button { width: 100%; background: linear-gradient(135deg, #00f0ff, #7000ff); color: #fff; border: none; padding: 14px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; transition: 0.2s; }
    button:hover { opacity: 0.9; transform: translateY(-2px); }

    #alert { margin-top: 18px; padding: 14px; border-radius: 8px; display: none; text-align: left; font-size: 14px; }
    footer { margin-top: auto; padding: 20px; color: #6b7280; font-size: 13px; border-top: 1px solid rgba(255,255,255,0.08); width: 100%; text-align: center; }
  </style>
</head>
<body>

  <header>
    <div class="logo-box">
      <div class="logo-icon">🛡️</div>
      <div>
        <div class="logo-title">ОКТОВСКИЕ</div>
        <div style="font-size:11px; color:#9ca3af;">Служба Защиты Игроков</div>
      </div>
    </div>
    <div class="status-badge">
      <div class="dot"></div>
      <span>Сайт и Бот Работают на Хостинге 🟢</span>
    </div>
  </header>

  <main>
    <div class="card">
      <h2>Подать обращение в «Октовские»</h2>
      <p class="desc">Заполните форму — обращение мгновенно поступит администраторам <b><?php echo $currentAdminsStr; ?></b>.</p>

      <form id="reportForm">
        <div class="form-group">
          <label>1. Ваш игровой никнейм *</label>
          <input type="text" id="nickname" required placeholder="Например: Tagevod_Player">
        </div>

        <div class="form-group">
          <label>2. В чем суть вашей проблемы? *</label>
          <textarea id="problem" rows="4" required placeholder="Опишите подробно суть вашей проблемы..."></textarea>
        </div>

        <div class="form-group">
          <label>3. Ваш Telegram юзернейм (для связи)</label>
          <input type="text" id="telegram" placeholder="@username">
        </div>

        <button type="submit" id="submitBtn">🚀 Отправить обращение администраторам</button>
      </form>

      <div id="alert"></div>
    </div>
  </main>

  <footer>
    &copy; <?php echo date('Y'); ?> Организация «Октовские». Защита человеков.
  </footer>

  <script>
    setInterval(async () => {
      try { fetch('index.php'); } catch(e) {}
    }, 5000);

    document.getElementById('reportForm').onsubmit = async function(e) {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      const alert = document.getElementById('alert');

      const nickname = document.getElementById('nickname').value;
      const problem = document.getElementById('problem').value;
      const telegram = document.getElementById('telegram').value;

      btn.disabled = true;
      btn.innerText = '⏳ Отправка в Telegram...';
      alert.style.display = 'none';

      const formData = new FormData();
      formData.append('action', 'submit_report');
      formData.append('nickname', nickname);
      formData.append('problem', problem);
      formData.append('telegram', telegram);

      try {
        const res = await fetch('index.php', { method: 'POST', body: formData });
        const data = await res.json();

        alert.style.display = 'block';
        if (data.success) {
          alert.style.background = 'rgba(16, 185, 129, 0.15)';
          alert.style.border = '1px solid #10b981';
          alert.style.color = '#34d399';
          alert.innerHTML = `✅ <b>Успешно!</b><br>${data.message}`;
          document.getElementById('reportForm').reset();
        } else {
          alert.style.background = 'rgba(239, 68, 68, 0.15)';
          alert.style.border = '1px solid #ef4444';
          alert.style.color = '#f87171';
          alert.innerHTML = `❌ <b>Ошибка:</b><br>${data.message}`;
        }
      } catch (err) {
        alert.style.display = 'block';
        alert.style.background = 'rgba(239, 68, 68, 0.15)';
        alert.style.color = '#f87171';
        alert.innerHTML = '❌ <b>Ошибка сети при отправке.</b>';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '🚀 Отправить обращение администраторам';
      }
    };
  </script>

</body>
</html>
