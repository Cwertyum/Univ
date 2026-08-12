package net.universalauth.database;

import net.universalauth.UniversalAuth;
import java.io.File;
import java.sql.*;
import java.util.logging.Level;

public class DatabaseManager {

    private final UniversalAuth plugin;
    private Connection connection;
    private String tablePrefix;
    private boolean isMySQL;

    public DatabaseManager(UniversalAuth plugin) {
        this.plugin = plugin;
    }

    public void initialize() {
        String type = plugin.getConfig().getString("database.type", "sqlite").toLowerCase();
        this.tablePrefix = plugin.getConfig().getString("database.mysql.table_prefix", "ua_");

        try {
            if (type.equals("mysql")) {
                this.isMySQL = true;
                String host = plugin.getConfig().getString("database.mysql.host", "localhost");
                int port = plugin.getConfig().getInt("database.mysql.port", 3306);
                String database = plugin.getConfig().getString("database.mysql.database", "minecraft");
                String username = plugin.getConfig().getString("database.mysql.username", "root");
                String password = plugin.getConfig().getString("database.mysql.password", "");

                String url = "jdbc:mysql://" + host + ":" + port + "/" + database + "?useSSL=false&autoReconnect=true";
                this.connection = DriverManager.getConnection(url, username, password);
                plugin.getLogger().info("Успешное подключение к базе данных MySQL!");
            } else {
                this.isMySQL = false;
                File dbFile = new File(plugin.getDataFolder(), "auth_database.db");
                if (!dbFile.exists()) {
                    dbFile.getParentFile().mkdirs();
                }
                String url = "jdbc:sqlite:" + dbFile.getAbsolutePath();
                this.connection = DriverManager.getConnection(url);
                plugin.getLogger().info("Успешное подключение к локальной базе данных SQLite!");
            }

            createTables();
        } catch (SQLException e) {
            plugin.getLogger().log(Level.SEVERE, "Ошибка инициализации Базы Данных!", e);
        }
    }

    private void createTables() throws SQLException {
        String sql = "CREATE TABLE IF NOT EXISTS " + tablePrefix + "players ("
                + "username VARCHAR(36) PRIMARY KEY, "
                + "display_name VARCHAR(36), "
                + "password_hash VARCHAR(255), "
                + "ip_address VARCHAR(45), "
                + "registration_date BIGINT, "
                + "last_login BIGINT, "
                + "is_2fa_enabled INT DEFAULT 0, "
                + "discord_id VARCHAR(32), "
                + "secret_key VARCHAR(64), "
                + "is_frozen INT DEFAULT 0"
                + ");";

        try (Statement stmt = connection.createStatement()) {
            stmt.execute(sql);
        }
    }

    public synchronized Connection getConnection() {
        try {
            if (connection == null || connection.isClosed()) {
                initialize();
            }
        } catch (SQLException e) {
            plugin.getLogger().log(Level.SEVERE, "Ошибка проверки соединения с БД", e);
        }
        return connection;
    }

    public void savePlayer(PlayerData player) {
        String sql = "REPLACE INTO " + tablePrefix + "players "
                + "(username, display_name, password_hash, ip_address, registration_date, last_login, is_2fa_enabled, discord_id, secret_key, is_frozen) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";

        try (PreparedStatement stmt = getConnection().prepareStatement(sql)) {
            stmt.setString(1, player.username.toLowerCase());
            stmt.setString(2, player.displayName);
            stmt.setString(3, player.passwordHash);
            stmt.setString(4, player.ipAddress);
            stmt.setLong(5, player.registrationDate);
            stmt.setLong(6, player.lastLogin);
            stmt.setInt(7, player.is2FAEnabled ? 1 : 0);
            stmt.setString(8, player.discordId);
            stmt.setString(9, player.secretKey);
            stmt.setInt(10, player.isFrozen ? 1 : 0);
            stmt.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().log(Level.SEVERE, "Ошибка сохранения игрокав БД: " + player.username, e);
        }
    }

    public PlayerData getPlayer(String username) {
        String sql = "SELECT * FROM " + tablePrefix + "players WHERE username = ?;";

        try (PreparedStatement stmt = getConnection().prepareStatement(sql)) {
            stmt.setString(1, username.toLowerCase());
            ResultSet rs = stmt.executeQuery();
            if (rs.next()) {
                PlayerData data = new PlayerData();
                data.username = rs.getString("username");
                data.displayName = rs.getString("display_name");
                data.passwordHash = rs.getString("password_hash");
                data.ipAddress = rs.getString("ip_address");
                data.registrationDate = rs.getLong("registration_date");
                data.lastLogin = rs.getLong("last_login");
                data.is2FAEnabled = rs.getInt("is_2fa_enabled") == 1;
                data.discordId = rs.getString("discord_id");
                data.secretKey = rs.getString("secret_key");
                data.isFrozen = rs.getInt("is_frozen") == 1;
                return data;
            }
        } catch (SQLException e) {
            plugin.getLogger().log(Level.SEVERE, "Ошибка получения игрока из БД: " + username, e);
        }
        return null;
    }

    public PlayerData getPlayerBySecretKey(String key) {
        String sql = "SELECT * FROM " + tablePrefix + "players WHERE LOWER(secret_key) = ?;";

        try (PreparedStatement stmt = getConnection().prepareStatement(sql)) {
            stmt.setString(1, key.toLowerCase());
            ResultSet rs = stmt.executeQuery();
            if (rs.next()) {
                PlayerData data = new PlayerData();
                data.username = rs.getString("username");
                data.displayName = rs.getString("display_name");
                data.passwordHash = rs.getString("password_hash");
                data.ipAddress = rs.getString("ip_address");
                data.registrationDate = rs.getLong("registration_date");
                data.lastLogin = rs.getLong("last_login");
                data.is2FAEnabled = rs.getInt("is_2fa_enabled") == 1;
                data.discordId = rs.getString("discord_id");
                data.secretKey = rs.getString("secret_key");
                data.isFrozen = rs.getInt("is_frozen") == 1;
                return data;
            }
        } catch (SQLException e) {
            plugin.getLogger().log(Level.SEVERE, "Ошибка поиска игрока по ключу 2FA в БД", e);
        }
        return null;
    }

    public void close() {
        try {
            if (connection != null && !connection.isClosed()) {
                connection.close();
            }
        } catch (SQLException e) {
            plugin.getLogger().log(Level.SEVERE, "Ошибка закрытия БД", e);
        }
    }

    public static class PlayerData {
        public String username;
        public String displayName;
        public String passwordHash;
        public String ipAddress;
        public long registrationDate;
        public long lastLogin;
        public boolean is2FAEnabled;
        public String discordId;
        public String secretKey;
        public boolean isFrozen;
    }
}
