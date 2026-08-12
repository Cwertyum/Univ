package net.universalauth.listeners;

import net.universalauth.UniversalAuth;
import net.universalauth.database.DatabaseManager.PlayerData;
import org.bukkit.ChatColor;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.*;

public class PlayerListener implements Listener {

    private final UniversalAuth plugin;

    public PlayerListener(UniversalAuth plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onPreLogin(AsyncPlayerPreLoginEvent event) {
        String username = event.getName().toLowerCase();
        PlayerData data = plugin.getDatabaseManager().getPlayer(username);

        if (data != null && data.isFrozen) {
            String kickMsg = ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.account_frozen", "&cВаш аккаунт заморожен!").replace("%reason%", "Заморожен администрацией"));
            event.disallow(AsyncPlayerPreLoginEvent.Result.KICK_OTHER, kickMsg);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        String username = player.getName().toLowerCase();
        PlayerData data = plugin.getDatabaseManager().getPlayer(username);

        if (data != null && data.isFrozen) {
            player.kickPlayer(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.account_frozen", "&cВаш аккаунт заморожен!").replace("%reason%", "Заморожен администрацией")));
            return;
        }

        plugin.getAuthManager().setAuthenticated(player, false);

        if (plugin.getAuthManager().isRegistered(username)) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.please_login")));
        } else {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.please_register")));
        }
    }

    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        plugin.getAuthManager().removePlayerSession(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onPlayerMove(PlayerMoveEvent event) {
        Player player = event.getPlayer();
        if (!plugin.getAuthManager().isAuthenticated(player)) {
            if (plugin.getConfig().getBoolean("security.freeze_position", true)) {
                Location from = event.getFrom();
                Location to = event.getTo();
                if (to != null && (from.getX() != to.getX() || from.getZ() != to.getZ())) {
                    from.setPitch(to.getPitch());
                    from.setYaw(to.getYaw());
                    event.setTo(from);
                }
            }
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onPlayerChat(AsyncPlayerChatEvent event) {
        Player player = event.getPlayer();
        if (!plugin.getAuthManager().isAuthenticated(player)) {
            if (plugin.getConfig().getBoolean("security.prevent_chat", true)) {
                event.setCancelled(true);
                player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                        plugin.getConfig().getString("messages.prefix") + "&cСначала пройдите авторизацию!"));
            }
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onPlayerCommand(PlayerCommandPreprocessEvent event) {
        Player player = event.getPlayer();
        if (!plugin.getAuthManager().isAuthenticated(player)) {
            if (plugin.getConfig().getBoolean("security.prevent_commands", true)) {
                String message = event.getMessage().toLowerCase();
                if (!message.startsWith("/login ") && !message.startsWith("/l ") &&
                    !message.startsWith("/register ") && !message.startsWith("/reg ") &&
                    !message.startsWith("/2fa")) {

                    event.setCancelled(true);
                    player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                            plugin.getConfig().getString("messages.prefix") + "&cСначала пройдите авторизацию!"));
                }
            }
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onEntityDamage(EntityDamageEvent event) {
        if (event.getEntity() instanceof Player) {
            Player player = (Player) event.getEntity();
            if (!plugin.getAuthManager().isAuthenticated(player)) {
                if (plugin.getConfig().getBoolean("security.prevent_damage", true)) {
                    event.setCancelled(true);
                }
            }
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onEntityDamageByEntity(EntityDamageByEntityEvent event) {
        if (event.getDamager() instanceof Player) {
            Player player = (Player) event.getDamager();
            if (!plugin.getAuthManager().isAuthenticated(player)) {
                event.setCancelled(true);
            }
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onDrop(PlayerDropItemEvent event) {
        if (!plugin.getAuthManager().isAuthenticated(event.getPlayer())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onPickup(PlayerPickupItemEvent event) {
        if (!plugin.getAuthManager().isAuthenticated(event.getPlayer())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onInventoryClick(InventoryClickEvent event) {
        if (event.getWhoClicked() instanceof Player) {
            Player player = (Player) event.getWhoClicked();
            if (!plugin.getAuthManager().isAuthenticated(player)) {
                event.setCancelled(true);
            }
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onInteract(PlayerInteractEvent event) {
        if (!plugin.getAuthManager().isAuthenticated(event.getPlayer())) {
            event.setCancelled(true);
        }
    }
}
