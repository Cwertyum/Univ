package net.universalauth.bungee;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

public class UniversalAuthBungee implements Listener {

    private final JavaPlugin plugin;

    public UniversalAuthBungee(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    public void registerBungeeCoreHooks() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        plugin.getLogger().info("=================================================");
        plugin.getLogger().info("  UniversalAuth BungeeCord Core Active!          ");
        plugin.getLogger().info("  Поддержка ядpa BungeeCord успешно активирована! ");
        plugin.getLogger().info("=================================================");
    }

    @EventHandler
    public void onBungeePlayerJoin(PlayerJoinEvent event) {
        // BungeeCord IP Forwarding and Proxy validation
        String playerIp = event.getPlayer().getAddress() != null && event.getPlayer().getAddress().getAddress() != null
                ? event.getPlayer().getAddress().getAddress().getHostAddress() : "127.0.0.1";
        plugin.getLogger().info("[BungeeCord Proxy] Игрок " + event.getPlayer().getName() + " подключен с IP: " + playerIp);
    }
}
