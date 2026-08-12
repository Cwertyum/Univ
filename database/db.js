import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, 'bot_database.json');

// In-Memory Pure JavaScript Store for Zero-GLIBC Host Compatibility
class PureJSDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.tables = {
      guild_config: {},
      warns: [],
      users: {},
      tickets: {},
      marriages: {},
      reaction_roles: [],
      giveaways: {},
      reminders: [],
      custom_commands: {},
      temp_voices: {},
      shop_items: [],
      temp_mutes: {},
      user_quests: {},
      universal_auth: {}
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(data);
        this.tables = { ...this.tables, ...parsed };
      }
    } catch (e) {
      console.error('[DB] Error loading JSON database, initializing fresh state:', e.message);
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.tables, null, 2), 'utf8');
    } catch (e) {
      console.error('[DB] Error saving JSON database:', e.message);
    }
  }

  pragma() {
    return this;
  }

  exec() {
    return this;
  }

  prepare(sql) {
    const self = this;
    const cleanSql = sql.replace(/\s+/g, ' ').trim();

    return {
      get(...args) {
        return self.executeQueryGet(cleanSql, args);
      },
      all(...args) {
        return self.executeQueryAll(cleanSql, args);
      },
      run(...args) {
        return self.executeQueryRun(cleanSql, args);
      }
    };
  }

  executeQueryGet(sql, args) {
    const res = this.executeQueryAll(sql, args);
    return res.length > 0 ? res[0] : undefined;
  }

  executeQueryAll(sql, args) {
    const s = sql.toLowerCase();

    // ── GUILD CONFIG ──────────────────────────────────────────
    if (s.includes('from guild_config')) {
      const guildId = String(args[0] || '');
      const cfg = this.tables.guild_config[guildId];
      if (!cfg) {
        return [{
          guild_id: guildId,
          prefix: '!',
          warn_limit: 3,
          warn_action: 'timeout',
          automod_badwords: 1,
          automod_links: 0,
          automod_caps: 0,
          automod_spam: 0,
          badwords_list: '[]',
          level_roles: '{}'
        }];
      }
      return [cfg];
    }

    // ── USERS (LEVELS / ECO / RANK) ───────────────────────────
    if (s.includes('from users')) {
      const guildId = String(args[0] || '');
      const userId = args.length > 1 ? String(args[1] || '') : null;

      if (s.includes('order by level desc')) {
        const list = Object.values(this.tables.users)
          .filter(u => u.guild_id === guildId)
          .sort((a, b) => (b.level * 100000 + b.xp) - (a.level * 100000 + a.xp))
          .slice(0, 10);
        return list;
      }

      if (userId) {
        const key = `${guildId}_${userId}`;
        const u = this.tables.users[key];
        return u ? [u] : [];
      }
    }

    // ── TICKETS ───────────────────────────────────────────────
    if (s.includes('from tickets')) {
      if (s.includes('where channel_id = ?')) {
        const chanId = String(args[0] || '');
        const t = Object.values(this.tables.tickets).find(x => x.channel_id === chanId);
        return t ? [t] : [];
      }
      if (s.includes('where guild_id = ? and user_id = ?')) {
        const guildId = String(args[0] || '');
        const userId = String(args[1] || '');
        const t = Object.values(this.tables.tickets).find(x => x.guild_id === guildId && x.user_id === userId && x.status === 'open');
        return t ? [t] : [];
      }
    }

    // ── TEMP VOICES ───────────────────────────────────────────
    if (s.includes('from temp_voices')) {
      const chanId = String(args[0] || '');
      const tv = this.tables.temp_voices[chanId];
      return tv ? [tv] : [];
    }

    // ── MARRIAGES ─────────────────────────────────────────────
    if (s.includes('from marriages')) {
      const guildId = String(args[0] || '');
      const userId = String(args[1] || args[0] || '');
      const m = Object.values(this.tables.marriages).find(x => x.guild_id === guildId && (x.user1_id === userId || x.user2_id === userId));
      return m ? [m] : [];
    }

    // ── USER QUESTS ───────────────────────────────────────────
    if (s.includes('from user_quests')) {
      const guildId = String(args[0] || '');
      const userId = String(args[1] || '');
      const key = `${guildId}_${userId}`;
      const q = this.tables.user_quests[key];
      return q ? [q] : [];
    }

    // ── WARNS ─────────────────────────────────────────────────
    if (s.includes('from warns')) {
      const guildId = String(args[0] || '');
      const userId = args.length > 1 ? String(args[1] || '') : null;
      return this.tables.warns.filter(w => w.guild_id === guildId && (!userId || w.user_id === userId));
    }

    // ── REMINDERS ─────────────────────────────────────────────
    if (s.includes('from reminders')) {
      const now = Number(args[0] || Date.now());
      return this.tables.reminders.filter(r => r.remind_at <= now);
    }

    return [];
  }

  executeQueryRun(sql, args) {
    const s = sql.toLowerCase();

    // ── USERS UPDATE / INSERT ──────────────────────────────────
    if (s.includes('users')) {
      if (s.includes('insert into users')) {
        const guildId = String(args[0]);
        const userId = String(args[1]);
        const key = `${guildId}_${userId}`;
        this.tables.users[key] = {
          guild_id: guildId,
          user_id: userId,
          xp: 0,
          level: 1,
          balance: 100,
          rep: 0,
          last_daily: 0,
          last_rep: 0
        };
      } else if (s.includes('update users set xp = ?, level = ?')) {
        const xp = Number(args[0]);
        const level = Number(args[1]);
        const guildId = String(args[2]);
        const userId = String(args[3]);
        const key = `${guildId}_${userId}`;
        if (this.tables.users[key]) {
          this.tables.users[key].xp = xp;
          this.tables.users[key].level = level;
        }
      } else if (s.includes('balance = balance + ?')) {
        const amount = Number(args[0]);
        const lastDaily = Number(args[1]);
        const guildId = String(args[2]);
        const userId = String(args[3]);
        const key = `${guildId}_${userId}`;
        if (this.tables.users[key]) {
          this.tables.users[key].balance = (this.tables.users[key].balance || 0) + amount;
          this.tables.users[key].last_daily = lastDaily;
        }
      }
      this.save();
      return { changes: 1 };
    }

    // ── TEMP VOICES ───────────────────────────────────────────
    if (s.includes('temp_voices')) {
      if (s.includes('insert') || s.includes('replace')) {
        const chanId = String(args[0]);
        const guildId = String(args[1]);
        const ownerId = String(args[2]);
        this.tables.temp_voices[chanId] = { channel_id: chanId, guild_id: guildId, owner_id: ownerId };
      } else if (s.includes('delete')) {
        const chanId = String(args[0]);
        delete this.tables.temp_voices[chanId];
      }
      this.save();
      return { changes: 1 };
    }

    // ── TICKETS ───────────────────────────────────────────────
    if (s.includes('tickets')) {
      if (s.includes('insert into tickets')) {
        const ticketId = String(args[0]);
        const guildId = String(args[1]);
        const chanId = String(args[2]);
        const userId = String(args[3]);
        const reportedId = String(args[4] || '');
        const category = String(args[5] || 'General');
        const createdAt = Number(args[6] || Date.now());

        this.tables.tickets[ticketId] = {
          ticket_id: ticketId,
          guild_id: guildId,
          channel_id: chanId,
          user_id: userId,
          reported_user_id: reportedId,
          category: category,
          status: 'open',
          rating: 0,
          created_at: createdAt
        };
      } else if (s.includes("status = 'closed'")) {
        const ticketId = String(args[0]);
        if (this.tables.tickets[ticketId]) {
          this.tables.tickets[ticketId].status = 'closed';
        }
      } else if (s.includes('rating = ?')) {
        const rating = Number(args[0]);
        const ticketId = String(args[1]);
        if (this.tables.tickets[ticketId]) {
          this.tables.tickets[ticketId].rating = rating;
        }
      }
      this.save();
      return { changes: 1 };
    }

    // ── USER QUESTS ───────────────────────────────────────────
    if (s.includes('user_quests')) {
      const guildId = String(args[args.length - 2]);
      const userId = String(args[args.length - 1]);
      const key = `${guildId}_${userId}`;
      if (!this.tables.user_quests[key]) {
        this.tables.user_quests[key] = {
          guild_id: guildId,
          user_id: userId,
          messages: 0,
          voice_minutes: 0,
          reps_given: 0,
          claimed_msg: 0,
          claimed_voice: 0,
          claimed_rep: 0
        };
      }
      if (s.includes('messages = messages + 1')) {
        this.tables.user_quests[key].messages++;
      } else if (s.includes('voice_minutes = voice_minutes + ?')) {
        this.tables.user_quests[key].voice_minutes += Number(args[0] || 0);
      } else if (s.includes('reps_given = reps_given + 1')) {
        this.tables.user_quests[key].reps_given++;
      } else if (s.includes('claimed_msg = 1')) {
        this.tables.user_quests[key].claimed_msg = 1;
      } else if (s.includes('claimed_voice = 1')) {
        this.tables.user_quests[key].claimed_voice = 1;
      } else if (s.includes('claimed_rep = 1')) {
        this.tables.user_quests[key].claimed_rep = 1;
      }
      this.save();
      return { changes: 1 };
    }

    // ── WARNS ─────────────────────────────────────────────────
    if (s.includes('warns')) {
      if (s.includes('insert into warns')) {
        this.tables.warns.push({
          id: Date.now(),
          guild_id: String(args[0]),
          user_id: String(args[1]),
          moderator_id: String(args[2]),
          reason: String(args[3] || 'No reason'),
          timestamp: Date.now()
        });
      }
      this.save();
      return { changes: 1 };
    }

    // ── REMINDERS ─────────────────────────────────────────────
    if (s.includes('reminders')) {
      if (s.includes('insert into reminders')) {
        this.tables.reminders.push({
          id: Date.now(),
          user_id: String(args[0]),
          channel_id: String(args[1]),
          text: String(args[2]),
          remind_at: Number(args[3])
        });
      } else if (s.includes('delete from reminders')) {
        const id = Number(args[0]);
        this.tables.reminders = this.tables.reminders.filter(r => r.id !== id);
      }
      this.save();
      return { changes: 1 };
    }

    this.save();
    return { changes: 1 };
  }

  // ── UNIVERSAL AUTH (MINECRAFT 2FA & AUTH SYSTEM) ───────────
  getAuthPlayer(username) {
    if (!username) return null;
    const key = String(username).toLowerCase();
    return this.tables.universal_auth[key] || null;
  }

  getAuthPlayerBySecretKey(secretKey) {
    if (!secretKey) return null;
    const cleanInput = String(secretKey).trim().toLowerCase();
    const strippedInput = cleanInput.replace(/[^a-z0-9]/g, '');

    return Object.values(this.tables.universal_auth).find(p => {
      if (!p.secret_key) return false;
      const storedClean = String(p.secret_key).trim().toLowerCase();
      const storedStripped = storedClean.replace(/[^a-z0-9]/g, '');
      return storedClean === cleanInput || (storedStripped.length > 0 && storedStripped === strippedInput);
    }) || null;
  }

  getAuthPlayerByDiscordId(discordId) {
    if (!discordId) return null;
    return Object.values(this.tables.universal_auth).find(
      p => p.discord_id === String(discordId)
    ) || null;
  }

  saveAuthPlayer(data) {
    if (!data || !data.username) return false;
    const key = String(data.username).toLowerCase();
    const existing = this.tables.universal_auth[key] || {};
    this.tables.universal_auth[key] = {
      username: key,
      display_name: data.display_name || existing.display_name || data.username,
      password_hash: data.password_hash || existing.password_hash || '',
      ip_address: data.ip_address || existing.ip_address || '127.0.0.1',
      registration_date: data.registration_date || existing.registration_date || Date.now(),
      last_login: data.last_login || existing.last_login || Date.now(),
      is_2fa_enabled: data.is_2fa_enabled !== undefined ? Boolean(data.is_2fa_enabled) : Boolean(existing.is_2fa_enabled),
      discord_id: data.discord_id !== undefined ? data.discord_id : (existing.discord_id || null),
      secret_key: data.secret_key !== undefined ? data.secret_key : (existing.secret_key || null),
      is_frozen: data.is_frozen !== undefined ? Boolean(data.is_frozen) : Boolean(existing.is_frozen)
    };
    this.save();
    return true;
  }

  deleteAuthPlayer(username) {
    if (!username) return false;
    const key = String(username).toLowerCase();
    if (this.tables.universal_auth[key]) {
      delete this.tables.universal_auth[key];
      this.save();
      return true;
    }
    return false;
  }

  getAllAuthPlayers() {
    return Object.values(this.tables.universal_auth);
  }
}

const db = new PureJSDatabase(jsonPath);

export function initDatabase() {
  console.log('[DB] Pure JavaScript Database Engine (Zero-GLIBC, 100% Host Compatible) active.');
}

export default db;
