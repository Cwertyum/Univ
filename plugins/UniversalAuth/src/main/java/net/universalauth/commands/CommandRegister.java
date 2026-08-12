package net.universalauth.commands;

import net.universalauth.UniversalAuth;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public class CommandRegister implements CommandExecutor {

    private final UniversalAuth plugin;

    public CommandRegister(UniversalAuth plugin) {
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

        if (plugin.getAuthManager().isRegistered(player.getName())) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.already_registered")));
            return true;
        }

        if (args.length < 2) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.please_register")));
            return true;
        }

        String pass1 = args[0];
        String pass2 = args[1];

        if (!pass1.equals(pass2)) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.passwords_dont_match")));
            return true;
        }

        if (pass1.length() < 4) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + "&cПароль слишком короткий! Минимальная длина: 4 символа."));
            return true;
        }

        boolean success = plugin.getAuthManager().register(player, pass1);
        if (success) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + plugin.getConfig().getString("messages.register_success")));
        } else {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                    plugin.getConfig().getString("messages.prefix") + "&cОшибка при регистрации. Ссылайтесь на администрацию."));
        }

        return true;
    }
}
