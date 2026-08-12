package net.universalauth.auth;

import net.universalauth.UniversalAuth;
import net.universalauth.database.DatabaseManager;
import net.universalauth.database.DatabaseManager.PlayerData;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.entity.Player;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class AuthManager {

    private final UniversalAuth plugin;
    private final Set<String> authenticatedPlayers = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Map<String, String> pending2FARequests = new ConcurrentHashMap<>(); // username -> requestId

    private final String SALT = "UniversalAuthSalt2026";
    private final SecureRandom random = new SecureRandom();

    public AuthManager(UniversalAuth plugin) {
        this.plugin = plugin;
    }

    public boolean isRegistered(String username) {
        return plugin.getDatabaseManager().getPlayer(username) != null;
    }

    public boolean isAuthenticated(Player player) {
        return authenticatedPlayers.contains(player.getName().toLowerCase());
    }

    public boolean isPending2FA(Player player) {
        return pending2FARequests.containsKey(player.getName().toLowerCase());
    }

    public void setAuthenticated(Player player, boolean authenticated) {
        if (authenticated) {
            authenticatedPlayers.add(player.getName().toLowerCase());
            removeRestrictions(player);
        } else {
            authenticatedPlayers.remove(player.getName().toLowerCase());
            applyRestrictions(player);
        }
    }

    public boolean register(Player player, String rawPassword) {
        String username = player.getName().toLowerCase();
        if (isRegistered(username)) return false;

        String hash = hashPassword(rawPassword);
        String ip = getPlayerIp(player);

        PlayerData data = new PlayerData();
        data.username = username;
        data.displayName = player.getName();
        data.passwordHash = hash;
        data.ipAddress = ip;
        data.registrationDate = System.currentTimeMillis();
        data.lastLogin = System.currentTimeMillis();
        data.is2FAEnabled = false;
        data.discordId = null;
        data.secretKey = null;
        data.isFrozen = false;

        plugin.getDatabaseManager().savePlayer(data);
        plugin.getBridgeManager().syncPlayerToBot(username, player.getName(), hash, ip, false, null, null, false);

        setAuthenticated(player, true);
        return true;
    }

    public boolean login(Player player, String rawPassword) {
        String username = player.getName().toLowerCase();
        PlayerData data = plugin.getDatabaseManager().getPlayer(username);

        if (data == null) return false;

        if (data.isFrozen) {
            player.kickPlayer(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.account_frozen", "&cВаш аккаунт заморожен!").replace("%reason%", "Заморожен администрацией")));
            return false;
        }

        if (!verifyPassword(rawPassword, data.passwordHash)) {
            return false;
        }

        // Update IP and last login
        data.ipAddress = getPlayerIp(player);
        data.lastLogin = System.currentTimeMillis();
        plugin.getDatabaseManager().savePlayer(data);

        // Check if 2FA is enabled
        if (data.is2FAEnabled && data.discordId != null && !data.discordId.isEmpty()) {
            start2FAVerificationFlow(player, data);
            return true;
        }

        setAuthenticated(player, true);
        return true;
    }

    private void start2FAVerificationFlow(Player player, PlayerData data) {
        String username = player.getName().toLowerCase();
        player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.2fa_required")));

        applyRestrictions(player);

        String requestId = plugin.getBridgeManager().request2FA(username, data.ipAddress);
        if (requestId == null) {
            // Fallback if bridge offline
            setAuthenticated(player, true);
            return;
        }

        pending2FARequests.put(username, requestId);

        // Recurring status check task for 2FA response (every 1 sec / 20 ticks)
        final int[] secondsElapsed = {0};
        int timeoutSeconds = plugin.getConfig().getInt("bridge.timeout_seconds", 60);

        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            if (!player.isOnline()) {
                pending2FARequests.remove(username);
                task.cancel();
                return;
            }

            secondsElapsed[0]++;
            String status = plugin.getBridgeManager().check2FAStatus(requestId);

            if ("APPROVED".equalsIgnoreCase(status)) {
                pending2FARequests.remove(username);
                setAuthenticated(player, true);
                player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                        plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.2fa_approved")));
                task.cancel();
            } else if ("REJECTED".equalsIgnoreCase(status)) {
                pending2FARequests.remove(username);
                player.kickPlayer(ChatColor.translateAlternateColorCodes('&',
                        plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.2fa_rejected")));
                task.cancel();
            } else if (secondsElapsed[0] >= timeoutSeconds || "EXPIRED".equalsIgnoreCase(status)) {
                pending2FARequests.remove(username);
                player.kickPlayer(ChatColor.translateAlternateColorCodes('&',
                        plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.2fa_timeout")));
                task.cancel();
            }
        }, 20L, 20L);
    }

    public boolean changePassword(Player player, String oldPassword, String newPassword) {
        String username = player.getName().toLowerCase();
        PlayerData data = plugin.getDatabaseManager().getPlayer(username);

        if (data == null || !verifyPassword(oldPassword, data.passwordHash)) {
            return false;
        }

        String newHash = hashPassword(newPassword);
        data.passwordHash = newHash;
        plugin.getDatabaseManager().savePlayer(data);
        plugin.getBridgeManager().syncPlayerToBot(username, data.displayName, newHash, data.ipAddress, data.is2FAEnabled, data.discordId, data.secretKey, data.isFrozen);
        return true;
    }

    public String generate2FAKey(Player player) {
        String username = player.getName().toLowerCase();
        PlayerData data = plugin.getDatabaseManager().getPlayer(username);
        if (data == null) return null;

        // Complex code format: UA-XXXX-XXXX-XXXX
        String secretKey = "UA-" + generateRandomString(4) + "-" + generateRandomString(4) + "-" + generateRandomString(4);
        data.secretKey = secretKey;
        plugin.getDatabaseManager().savePlayer(data);

        plugin.getBridgeManager().syncPlayerToBot(username, data.displayName, data.passwordHash, data.ipAddress, data.is2FAEnabled, data.discordId, secretKey, data.isFrozen);
        return secretKey;
    }

    public void setPlayerFrozen(String username, boolean frozen) {
        PlayerData data = plugin.getDatabaseManager().getPlayer(username);
        if (data != null) {
            data.isFrozen = frozen;
            plugin.getDatabaseManager().savePlayer(data);
            plugin.getBridgeManager().syncPlayerToBot(username, data.displayName, data.passwordHash, data.ipAddress, data.is2FAEnabled, data.discordId, data.secretKey, frozen);
        }
    }

    public void enable2FAForPlayer(String username, String discordId) {
        PlayerData data = plugin.getDatabaseManager().getPlayer(username);
        if (data != null) {
            data.is2FAEnabled = true;
            data.discordId = discordId;
            data.secretKey = null;
            plugin.getDatabaseManager().savePlayer(data);
        }
    }

    public void disable2FAForPlayer(String username) {
        PlayerData data = plugin.getDatabaseManager().getPlayer(username);
        if (data != null) {
            data.is2FAEnabled = false;
            data.discordId = null;
            data.secretKey = null;
            plugin.getDatabaseManager().savePlayer(data);
            plugin.getBridgeManager().syncPlayerToBot(username, data.displayName, data.passwordHash, data.ipAddress, false, null, null, data.isFrozen);
        }
    }

    public void updatePasswordHash(String username, String newHash) {
        PlayerData data = plugin.getDatabaseManager().getPlayer(username);
        if (data != null) {
            data.passwordHash = newHash;
            plugin.getDatabaseManager().savePlayer(data);
        }
    }

    public void applyRestrictions(Player player) {
        if (plugin.getConfig().getBoolean("security.blindness_effect", true)) {
            player.addPotionEffect(new PotionEffect(PotionEffectType.BLINDNESS, 999999, 1, false, false));
        }
    }

    public void removeRestrictions(Player player) {
        player.removePotionEffect(PotionEffectType.BLINDNESS);
    }

    public void removePlayerSession(Player player) {
        String username = player.getName().toLowerCase();
        authenticatedPlayers.remove(username);
        pending2FARequests.remove(username);
    }

    // Password Hashing Helper
    public String hashPassword(String password) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest((password + SALT).getBytes());
            StringBuilder hexString = new StringBuilder("$SHA$" + SALT + "$");
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 Algorithm not available", e);
        }
    }

    public boolean verifyPassword(String rawPassword, String storedHash) {
        if (storedHash == null || storedHash.isEmpty()) return false;
        String hashedInput = hashPassword(rawPassword);
        return hashedInput.equalsIgnoreCase(storedHash);
    }

    public String getPlayerIp(Player player) {
        if (plugin.getConfig().getBoolean("proxy.use_proxy_ip_forwarding", true)) {
            try {
                // Spigot/Bungee raw address reflection fallback
                Object spigotObj = player.getClass().getMethod("spigot").invoke(player);
                if (spigotObj != null) {
                    java.net.InetSocketAddress rawAddr = (java.net.InetSocketAddress) spigotObj.getClass().getMethod("getRawAddress").invoke(spigotObj);
                    if (rawAddr != null && rawAddr.getAddress() != null) {
                        return rawAddr.getAddress().getHostAddress();
                    }
                }
            } catch (Exception ignored) {
                // Fallback to standard getAddress
            }
        }

        if (player.getAddress() != null && player.getAddress().getAddress() != null) {
            return player.getAddress().getAddress().getHostAddress();
        }
        return "127.0.0.1";
    }

    private String generateRandomString(int length) {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < length; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }
}
