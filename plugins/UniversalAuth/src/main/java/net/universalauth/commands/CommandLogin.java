package net.universalauth.commands;

import net.universalauth.UniversalAuth;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public class CommandLogin implements CommandExecutor {

    private final UniversalAuth plugin;

    public CommandLogin(UniversalAuth plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player)) {
            sender.sendMessage("Команда доступна только для игроков!");
            return true;
        }

        Player player = (Player) sender;

        if (plugin.getAuthManager().isAuthenticated(player)) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + "&cВы уже авторизованы!"));
            return true;
        }

        if (!plugin.getAuthManager().isRegistered(player.getName())) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.not_registered")));
            return true;
        }

        if (args.length < 1) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.please_login")));
            return true;
        }

        String password = args[0];
        boolean success = plugin.getAuthManager().login(player, password);

        if (success) {
            if (!plugin.getAuthManager().isPending2FA(player)) {
                player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                        plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.login_success")));
            }
        } else {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.wrong_password")));
        }

        return true;
    }
}
