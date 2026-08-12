package net.universalauth.commands;

import net.universalauth.UniversalAuth;
import net.universalauth.database.DatabaseManager.PlayerData;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public class Command2FA implements CommandExecutor {

    private final UniversalAuth plugin;

    public Command2FA(UniversalAuth plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player)) {
            sender.sendMessage("Команда доступна только для игроков!");
            return true;
        }

        Player player = (Player) sender;

        if (!plugin.getAuthManager().isAuthenticated(player)) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + "&cВы должны сначала авторизоваться!"));
            return true;
        }

        String sub = args.length > 0 ? args[0].toLowerCase() : "setup";

        if (sub.equals("disable") || sub.equals("off")) {
            plugin.getAuthManager().disable2FAForPlayer(player.getName());
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.2fa_disabled")));
            return true;
        }

        if (sub.equals("status")) {
            PlayerData data = plugin.getDatabaseManager().getPlayer(player.getName());
            if (data != null && data.is2FAEnabled) {
                player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                        plugin.getConfig().getString("messages.prefix") + "&a2FA заблокирована на аккаунте. Discord ID: &b" + data.discordId));
            } else {
                player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                        plugin.getConfig().getString("messages.prefix") + "&c2FA отключена. Введите &b/2fa &cдля привязки."));
            }
            return true;
        }

        // Setup / Generate Key
        PlayerData data = plugin.getDatabaseManager().getPlayer(player.getName());
        if (data != null && data.is2FAEnabled) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.2fa_already_enabled")));
            return true;
        }

        String key = plugin.getAuthManager().generate2FAKey(player);
        if (key != null) {
            String msg = plugin.getConfig().getString("messages.2fa_key_generated", "&aСекретный ключ: &b%key%").replace("%key%", key);
            player.sendMessage(ChatColor.translateAlternateColorCodes('&', plugin.getConfig().getString("messages.prefix") + msg));
        } else {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + "&cОшибка генерации ключа."));
        }

        return true;
    }
}
