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
    private String discordBaseUrl;
    private String telegramBaseUrl;
    private boolean discordEnabled;
    private boolean telegramEnabled;

    public BridgeManager(UniversalAuth plugin) {
        this.plugin = plugin;
    }

    public void initialize() {
        this.discordEnabled = plugin.getConfig().getBoolean("discord.enabled", true);
        String dHost = plugin.getConfig().getString("discord.bot_host", "http://localhost");
        int dPort = plugin.getConfig().getInt("discord.bot_port", 3001);
        this.discordBaseUrl = dHost + ":" + dPort;

        this.telegramEnabled = plugin.getConfig().getBoolean("telegram.enabled", true);
        String tHost = plugin.getConfig().getString("telegram.bot_host", "http://localhost");
        int tPort = plugin.getConfig().getInt("telegram.bot_port", 3002);
        this.telegramBaseUrl = tHost + ":" + tPort;

        startCommandPollingTask();
        plugin.getLogger().info("Мост управления активирован! Discord: " + discordBaseUrl + " | Telegram: " + telegramBaseUrl);
    }

    private void startCommandPollingTask() {
        int intervalTicks = plugin.getConfig().getInt("discord.poll_interval_ticks", 20);

        Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, () -> {
            if (discordEnabled) pollEndpoint(discordBaseUrl + "/api/poll-commands");
            if (telegramEnabled) pollEndpoint(telegramBaseUrl + "/api/poll-commands");
        }, 40L, intervalTicks);
    }

    private void pollEndpoint(String urlStr) {
        try {
            String response = sendGet(urlStr);
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
        } catch (Exception ignored) {}
    }

    private void handlePluginCommand(String type, JsonObject data) {
        try {
            String username = data.has("username") ? data.get("username").getAsString() : "";
            Player target = Bukkit.getPlayerExact(username);

            switch (type) {
                case "FREEZE_PLAYER": {
                    String reason = data.has("reason") ? data.get("reason").getAsString() : "Заморожен администрацией";
                    plugin.getAuthManager().setPlayerFrozen(username, true);
                    if (target != null && target.isOnline()) {
                        target.kickPlayer(ChatColor.translateAlternateColorCodes('&',
                                plugin.getConfig().getString("messages.account_frozen", "&cВаш аккаунт заморожен!").replace("%reason%", reason)));
                    }
                    plugin.getLogger().info("Аккаунт игрока " + username + " заморожен.");
                    break;
                }
                case "UNFREEZE_PLAYER": {
                    plugin.getAuthManager().setPlayerFrozen(username, false);
                    plugin.getLogger().info("Аккаунт игрока " + username + " разморожен.");
                    break;
                }
                case "KICK_PLAYER": {
                    String reason = data.has("reason") ? data.get("reason").getAsString() : "Кикнут администрацией";
                    if (target != null && target.isOnline()) {
                        target.kickPlayer(ChatColor.RED + "Кик с сервера: " + reason);
                        plugin.getLogger().info("Игрок " + username + " кикнут с сервера.");
                    }
                    break;
                }
                case "2FA_ACTIVATED": {
                    String id = data.has("telegramId") ? data.get("telegramId").getAsString() : (data.has("discordId") ? data.get("discordId").getAsString() : "");
                    plugin.getAuthManager().enable2FAForPlayer(username, id);
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
            plugin.getLogger().log(Level.SEVERE, "Ошибка выполнения команды от Бота", e);
        }
    }

    public String request2FA(String username, String ipAddress) {
        String requestId = UUID.randomUUID().toString();
        JsonObject json = new JsonObject();
        json.addProperty("requestId", requestId);
        json.addProperty("username", username);
        json.addProperty("ipAddress", ipAddress);

        boolean sent = false;
        if (discordEnabled) {
            try { sendPost(discordBaseUrl + "/api/2fa-request", json.toString()); sent = true; } catch (Exception ignored) {}
        }
        if (telegramEnabled) {
            try { sendPost(telegramBaseUrl + "/api/tg-2fa-request", json.toString()); sent = true; } catch (Exception ignored) {}
        }

        return sent ? requestId : null;
    }

    public String check2FAStatus(String requestId) {
        if (requestId == null) return "APPROVED";

        if (discordEnabled) {
            try {
                String resp = sendGet(discordBaseUrl + "/api/2fa-status?requestId=" + requestId);
                if (resp != null && !resp.isEmpty()) {
                    JsonObject json = gson.fromJson(resp, JsonObject.class);
                    String st = json.has("status") ? json.get("status").getAsString() : "PENDING";
                    if (!"NOT_FOUND".equalsIgnoreCase(st) && !"PENDING".equalsIgnoreCase(st)) return st;
                }
            } catch (Exception ignored) {}
        }

        if (telegramEnabled) {
            try {
                String resp = sendGet(telegramBaseUrl + "/api/tg-2fa-status?requestId=" + requestId);
                if (resp != null && !resp.isEmpty()) {
                    JsonObject json = gson.fromJson(resp, JsonObject.class);
                    String st = json.has("status") ? json.get("status").getAsString() : "PENDING";
                    if (!"NOT_FOUND".equalsIgnoreCase(st) && !"PENDING".equalsIgnoreCase(st)) return st;
                }
            } catch (Exception ignored) {}
        }

        return "PENDING";
    }

    public void syncPlayerToBot(String username, String displayName, String passwordHash, String ipAddress, boolean is2fa, String discordId, String secretKey, boolean isFrozen) {
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
            if (discordEnabled) { try { sendPost(discordBaseUrl + "/api/sync-player", json.toString()); } catch (Exception ignored) {} }
            if (telegramEnabled) { try { sendPost(telegramBaseUrl + "/api/sync-player", json.toString()); } catch (Exception ignored) {} }
        });
    }

    private String sendGet(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(2000);
        conn.setReadTimeout(2000);
        if (conn.getResponseCode() != 200) return null;

        try (InputStreamReader reader = new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)) {
            StringBuilder sb = new StringBuilder();
            char[] buffer = new char[1024];
            int read;
            while ((read = reader.read(buffer)) != -1) { sb.append(buffer, 0, read); }
            return sb.toString();
        }
    }

    private String sendPost(String urlStr, String jsonBody) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setDoOutput(true);
        conn.setConnectTimeout(2000);
        conn.setReadTimeout(2000);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
        }
        if (conn.getResponseCode() != 200) return null;

        try (InputStreamReader reader = new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)) {
            StringBuilder sb = new StringBuilder();
            char[] buffer = new char[1024];
            int read;
            while ((read = reader.read(buffer)) != -1) { sb.append(buffer, 0, read); }
            return sb.toString();
        }
    }
}
