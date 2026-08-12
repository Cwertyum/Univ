package net.universalauth.commands;

import net.universalauth.UniversalAuth;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public class CommandUnfreeze implements CommandExecutor {

    private final UniversalAuth plugin;

    public CommandUnfreeze(UniversalAuth plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("universalauth.admin.unfreeze")) {
            sender.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.no_permission")));
            return true;
        }

        if (args.length < 1) {
            sender.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + "&eИспользование: &b/unfreeze <никнейм>"));
            return true;
        }

        String targetName = args[0];
        plugin.getAuthManager().setPlayerFrozen(targetName, false);

        String msg = plugin.getConfig().getString("messages.unfrozen_admin", "&aАккаунт %player% разморожен.").replace("%player%", targetName);
        sender.sendMessage(ChatColor.translateAlternateColorCodes('&', plugin.getConfig().getString("messages.prefix") + msg));

        return true;
    }
}
