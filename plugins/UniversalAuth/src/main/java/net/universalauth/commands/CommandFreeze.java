package net.universalauth.commands;

import net.universalauth.UniversalAuth;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public class CommandFreeze implements CommandExecutor {

    private final UniversalAuth plugin;

    public CommandFreeze(UniversalAuth plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("universalauth.admin.freeze")) {
            sender.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.no_permission")));
            return true;
        }

        if (args.length < 1) {
            sender.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + "&eИспользование: &b/freeze <никнейм> [причина]"));
            return true;
        }

        String targetName = args[0];
        StringBuilder reasonSb = new StringBuilder();
        for (int i = 1; i < args.length; i++) {
            reasonSb.append(args[i]).append(" ");
        }
        String reason = reasonSb.length() > 0 ? reasonSb.toString().trim() : "Заморожен администратором";

        plugin.getAuthManager().setPlayerFrozen(targetName, true);

        Player target = Bukkit.getPlayerExact(targetName);
        if (target != null && target.isOnline()) {
            target.kickPlayer(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.account_frozen", "&cВаш аккаунт заморожен!").replace("%reason%", reason)));
        }

        String msg = plugin.getConfig().getString("messages.frozen_admin", "&aАккаунт %player% заморожен.").replace("%player%", targetName);
        sender.sendMessage(ChatColor.translateAlternateColorCodes('&', plugin.getConfig().getString("messages.prefix") + msg));

        return true;
    }
}
