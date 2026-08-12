package net.universalauth.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.universalauth.UniversalAuth;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.entity.Player;

import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.logging.Level;

public class BridgeManager {

    private final UniversalAuth plugin;
    private final Gson gson = new Gson();
    private String botBaseUrl;
    private boolean enabled;

    public BridgeManager(UniversalAuth plugin) {
        this.plugin = plugin;
    }

    public void initialize() {
        this.enabled = plugin.getConfig().getBoolean("bridge.enabled", true);
        String host = plugin.getConfig().getString("bridge.bot_host", "http://localhost");
        int port = plugin.getConfig().getInt("bridge.bot_port", 3001);
        this.botBaseUrl = host + ":" + port;

        if (enabled) {
            startCommandPollingTask();
            plugin.getLogger().info("Мост с Discord Ботом активирован! Подключение к: " + botBaseUrl);
        }
    }

    // Task that polls commands sent from Discord Bot (e.g., Freeze, Unfreeze, Kick, Password Change)
    private void startCommandPollingTask() {
        int intervalTicks = plugin.getConfig().getInt("bridge.poll_interval_ticks", 20);

        Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, () -> {
            try {
                String response = sendGet(botBaseUrl + "/api/poll-commands");
                if (response == null || response.isEmpty()) return;

                JsonObject json = gson.fromJson(response, JsonObject.class);
                if (json != null && json.has("commands")) {
                    JsonArray array = json.getAsJsonArray("commands");
                    for (int i = 0; i < array.size(); i++) {
                        JsonObject cmdObj = array.get(i).getAsJsonObject();
                        String type = cmdObj.get("type").getAsString();
                        JsonObject data = cmdObj.getAsJsonObject("data");

                        Bukkit.getScheduler().runTask(plugin, () -> handlePluginCommand(type, data));
                    }
                }
            } catch (Exception e) {
                // Silent fail on connection issues to prevent log spam when bot is restarting
            }
        }, 40L, intervalTicks);
    }

    // Handle commands received from Discord Bot
    private void handlePluginCommand(String type, JsonObject data) {
        try {
            String username = data.has("username") ? data.get("username").getAsString() : "";
            Player target = Bukkit.getPlayerExact(username);

            switch (type) {
                case "FREEZE_PLAYER": {
                    String reason = data.has("reason") ? data.get("reason").getAsString() : "Заморожен через Discord";
                    plugin.getAuthManager().setPlayerFrozen(username, true);
                    if (target != null && target.isOnline()) {
                        target.kickPlayer(ChatColor.translateAlternateColorCodes('&',
                                plugin.getConfig().getString("messages.account_frozen", "&cВаш аккаунт заморожен!").replace("%reason%", reason)));
                    }
                    plugin.getLogger().info("Аккаунт игрока " + username + " заморожен по команде из Discord.");
                    break;
                }
                case "UNFREEZE_PLAYER": {
                    plugin.getAuthManager().setPlayerFrozen(username, false);
                    plugin.getLogger().info("Аккаунт игрока " + username + " разморожен по команде из Discord.");
                    break;
                }
                case "KICK_PLAYER": {
                    String reason = data.has("reason") ? data.get("reason").getAsString() : "Кикнут через Discord";
                    if (target != null && target.isOnline()) {
                        target.kickPlayer(ChatColor.RED + "Кик с сервера: " + reason);
                        plugin.getLogger().info("Игрок " + username + " кикнут с сервера по команде из Discord.");
                    }
                    break;
                }
                case "2FA_ACTIVATED": {
                    String discordId = data.has("discordId") ? data.get("discordId").getAsString() : "";
                    plugin.getAuthManager().enable2FAForPlayer(username, discordId);
                    if (target != null && target.isOnline()) {
                        target.sendMessage(ChatColor.translateAlternateColorCodes('&',
                                plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.2fa_approved")));
                    }
                    break;
                }
                case "2FA_DISABLED": {
                    plugin.getAuthManager().disable2FAForPlayer(username);
                    if (target != null && target.isOnline()) {
                        target.sendMessage(ChatColor.translateAlternateColorCodes('&',
                                plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.2fa_disabled")));
                    }
                    break;
                }
                case "CHANGE_PASS": {
                    String newPasswordHash = data.has("newPasswordHash") ? data.get("newPasswordHash").getAsString() : "";
                    plugin.getAuthManager().updatePasswordHash(username, newPasswordHash);
                    if (target != null && target.isOnline()) {
                        target.sendMessage(ChatColor.translateAlternateColorCodes('&',
                                plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.password_changed")));
                    }
                    break;
                }
            }
        } catch (Exception e) {
            plugin.getLogger().log(Level.SEVERE, "Ошибка выполнения команды от Discord бота", e);
        }
    }

    // Send 2FA Request to Discord Bot
    public String request2FA(String username, String ipAddress) {
        if (!enabled) return null;

        String requestId = UUID.randomUUID().toString();
        JsonObject json = new JsonObject();
        json.addProperty("requestId", requestId);
        json.addProperty("username", username);
        json.addProperty("ipAddress", ipAddress);

        try {
            sendPost(botBaseUrl + "/api/2fa-request", json.toString());
            return requestId;
        } catch (Exception e) {
            plugin.getLogger().log(Level.WARNING, "Не удалось отправить запрос 2FA в Discord бот для: " + username, e);
            return null;
        }
    }

    // Check status of 2FA Request (PENDING, APPROVED, REJECTED, EXPIRED)
    public String check2FAStatus(String requestId) {
        if (!enabled || requestId == null) return "APPROVED";

        try {
            String response = sendGet(botBaseUrl + "/api/2fa-status?requestId=" + requestId);
            if (response == null || response.isEmpty()) return "PENDING";

            JsonObject json = gson.fromJson(response, JsonObject.class);
            return json.has("status") ? json.get("status").getAsString() : "PENDING";
        } catch (Exception e) {
            return "PENDING";
        }
    }

    // Sync Player Record to Discord Bot DB
    public void syncPlayerToBot(String username, String displayName, String passwordHash, String ipAddress, boolean is2fa, String discordId, String secretKey, boolean isFrozen) {
        if (!enabled) return;

        JsonObject json = new JsonObject();
        json.addProperty("username", username);
        json.addProperty("display_name", displayName);
        json.addProperty("password_hash", passwordHash);
        json.addProperty("ip_address", ipAddress);
        json.addProperty("is_2fa_enabled", is2fa);
        json.addProperty("discord_id", discordId);
        json.addProperty("secret_key", secretKey);
        json.addProperty("is_frozen", isFrozen);

        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                sendPost(botBaseUrl + "/api/sync-player", json.toString());
            } catch (Exception e) {
                // Ignore sync errors
            }
        });
    }

    // HTTP Helper GET
    private String sendGet(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(3000);
        conn.setReadTimeout(3000);

        String apiKey = plugin.getConfig().getString("bridge.api_key", "");
        if (apiKey != null && !apiKey.isEmpty()) {
            conn.setRequestProperty("X-API-Key", apiKey);
        }

        if (conn.getResponseCode() != 200) return null;

        try (InputStreamReader reader = new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)) {
            StringBuilder sb = new StringBuilder();
            char[] buffer = new char[1024];
            int read;
            while ((read = reader.read(buffer)) != -1) {
                sb.append(buffer, 0, read);
            }
            return sb.toString();
        }
    }

    // HTTP Helper POST
    private String sendPost(String urlStr, String jsonBody) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        
        String apiKey = plugin.getConfig().getString("bridge.api_key", "");
        if (apiKey != null && !apiKey.isEmpty()) {
            conn.setRequestProperty("X-API-Key", apiKey);
        }

        conn.setDoOutput(true);
        conn.setConnectTimeout(3000);
        conn.setReadTimeout(3000);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
        }

        if (conn.getResponseCode() != 200) return null;

        try (InputStreamReader reader = new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)) {
            StringBuilder sb = new StringBuilder();
            char[] buffer = new char[1024];
            int read;
            while ((read = reader.read(buffer)) != -1) {
                sb.append(buffer, 0, read);
            }
            return sb.toString();
        }
    }
}
