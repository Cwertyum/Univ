package net.universalauth.commands;

import net.universalauth.UniversalAuth;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public class CommandChangePassword implements CommandExecutor {

    private final UniversalAuth plugin;

    public CommandChangePassword(UniversalAuth plugin) {
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

        if (args.length < 2) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + "&eИспользование: &b/changepassword <старыйПароль> <новыйПароль>"));
            return true;
        }

        String oldPass = args[0];
        String newPass = args[1];

        if (newPass.length() < 4) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + "&cНовый пароль слишком короткий! Минимальная длина: 4 символа."));
            return true;
        }

        boolean success = plugin.getAuthManager().changePassword(player, oldPass, newPass);

        if (success) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.password_changed")));
        } else {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + "&cНеверный старый пароль!"));
        }

        return true;
    }
}
