package net.universalauth.hooks;

import net.universalauth.UniversalAuth;
import org.bukkit.Bukkit;

public class LimboAuthMeHook {

    private final UniversalAuth plugin;
    private boolean isAuthMePresent;
    private boolean isLimboAuthPresent;

    public LimboAuthMeHook(UniversalAuth plugin) {
        this.plugin = plugin;
    }

    public void initialize() {
        if (Bukkit.getPluginManager().isPluginEnabled("AuthMe")) {
            this.isAuthMePresent = true;
            plugin.getLogger().info("[Hook] Успешно обнаружен и сопряжен плагин AuthMe!");
        }

        if (Bukkit.getPluginManager().isPluginEnabled("LimboAuth")) {
            this.isLimboAuthPresent = true;
            plugin.getLogger().info("[Hook] Успешно обнаружен и сопряжен плагин LimboAuth!");
        }

        if (!isAuthMePresent && !isLimboAuthPresent) {
            plugin.getLogger().info("[Hook] AuthMe / LimboAuth не найдены. UniversalAuth работает в независимом (Standalone) режиме.");
        }
    }

    public boolean isAuthMePresent() {
        return isAuthMePresent;
    }

    public boolean isLimboAuthPresent() {
        return isLimboAuthPresent;
    }
}
