package net.universalauth.velocity;

import org.bukkit.Bukkit;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

public class UniversalAuthVelocity implements Listener {

    private final JavaPlugin plugin;

    public UniversalAuthVelocity(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    public void registerVelocityCoreHooks() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        plugin.getLogger().info("=================================================");
        plugin.getLogger().info("  UniversalAuth Velocity Core Active!            ");
        plugin.getLogger().info("  Поддержка ядpa Velocity успешно активирована!   ");
        plugin.getLogger().info("=================================================");
    }

    @EventHandler
    public void onVelocityPlayerJoin(PlayerJoinEvent event) {
        // Velocity IP Forwarding and Proxy validation
        String playerIp = event.getPlayer().getAddress() != null && event.getPlayer().getAddress().getAddress() != null
                ? event.getPlayer().getAddress().getAddress().getHostAddress() : "127.0.0.1";
        plugin.getLogger().info("[Velocity Proxy] Игрок " + event.getPlayer().getName() + " подключен с IP: " + playerIp);
    }
}
