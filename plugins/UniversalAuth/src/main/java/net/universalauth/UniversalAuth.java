package net.universalauth;

import net.universalauth.auth.AuthManager;
import net.universalauth.bridge.BridgeManager;
import net.universalauth.bungee.UniversalAuthBungee;
import net.universalauth.commands.*;
import net.universalauth.database.DatabaseManager;
import net.universalauth.hooks.LimboAuthMeHook;
import net.universalauth.listeners.PlayerListener;
import net.universalauth.velocity.UniversalAuthVelocity;
import org.bukkit.plugin.java.JavaPlugin;

public class UniversalAuth extends JavaPlugin {

    private static UniversalAuth instance;
    private DatabaseManager databaseManager;
    private BridgeManager bridgeManager;
    private AuthManager authManager;
    private LimboAuthMeHook limboAuthMeHook;
    private UniversalAuthBungee bungeeCore;
    private UniversalAuthVelocity velocityCore;

    @Override
    public void onEnable() {
        instance = this;

        saveDefaultConfig();

        // Initialize Managers
        this.databaseManager = new DatabaseManager(this);
        this.databaseManager.initialize();

        this.bridgeManager = new BridgeManager(this);
        this.bridgeManager.initialize();

        this.authManager = new AuthManager(this);

        this.limboAuthMeHook = new LimboAuthMeHook(this);
        this.limboAuthMeHook.initialize();

        // Initialize BungeeCord & Velocity Core Hooks
        if (getConfig().getBoolean("proxy.bungeecord_support", true)) {
            this.bungeeCore = new UniversalAuthBungee(this);
            this.bungeeCore.registerBungeeCoreHooks();
        }

        if (getConfig().getBoolean("proxy.velocity_support", true)) {
            this.velocityCore = new UniversalAuthVelocity(this);
            this.velocityCore.registerVelocityCoreHooks();
        }

        // Register Commands
        if (getCommand("login") != null) getCommand("login").setExecutor(new CommandLogin(this));
        if (getCommand("register") != null) getCommand("register").setExecutor(new CommandRegister(this));
        if (getCommand("changepassword") != null) getCommand("changepassword").setExecutor(new CommandChangePassword(this));
        if (getCommand("2fa") != null) getCommand("2fa").setExecutor(new Command2FA(this));
        if (getCommand("freeze") != null) getCommand("freeze").setExecutor(new CommandFreeze(this));
        if (getCommand("unfreeze") != null) getCommand("unfreeze").setExecutor(new CommandUnfreeze(this));
        if (getCommand("kick") != null) getCommand("kick").setExecutor(new CommandKick(this));

        // Register Event Listeners
        getServer().getPluginManager().registerEvents(new PlayerListener(this), this);

        getLogger().info("=================================================");
        getLogger().info("  UniversalAuth v1.0.0 успешно запущен!          ");
        getLogger().info("  Ядра: Spigot / Paper / BungeeCord / Velocity  ");
        getLogger().info("  2FA Telegram/Discord Bridge & Hooks активны.  ");
        getLogger().info("=================================================");
    }

    @Override
    public void onDisable() {
        if (databaseManager != null) {
            databaseManager.close();
        }
        getLogger().info("UniversalAuth остановлен.");
    }

    public static UniversalAuth getInstance() {
        return instance;
    }

    public DatabaseManager getDatabaseManager() {
        return databaseManager;
    }

    public BridgeManager getBridgeManager() {
        return bridgeManager;
    }

    public AuthManager getAuthManager() {
        return authManager;
    }

    public LimboAuthMeHook getLimboAuthMeHook() {
        return limboAuthMeHook;
    }

    public UniversalAuthBungee getBungeeCore() {
        return bungeeCore;
    }

    public UniversalAuthVelocity getVelocityCore() {
        return velocityCore;
    }
}
