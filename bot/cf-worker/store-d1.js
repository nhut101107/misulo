// Storage cho Cloudflare D1 va In-memory mock
export function d1Store(db) {
  return {
    // --- USER MANAGEMENT ---
    async getUser(userId, username = '') {
      const uid = Number(userId);
      let u = await db.prepare('SELECT * FROM users WHERE user_id = ?').bind(uid).first();
      if (!u) {
        await db.prepare('INSERT INTO users (user_id, username, balance, total_deposit, banned, created_at) VALUES (?, ?, 0, 0, 0, ?)')
          .bind(uid, username || '', Date.now()).run();
        u = { user_id: uid, username: username || '', balance: 0, total_deposit: 0, banned: 0, created_at: Date.now() };
      } else if (username && u.username !== username) {
        await db.prepare('UPDATE users SET username = ? WHERE user_id = ?').bind(username, uid).run();
        u.username = username;
      }
      return u;
    },

    async addDeposit(userId, amount) {
      const uid = Number(userId);
      const amt = Number(amount) || 0;
      await this.getUser(uid);
      await db.prepare('UPDATE users SET balance = balance + ?, total_deposit = total_deposit + ? WHERE user_id = ?')
        .bind(amt, amt, uid).run();
      return this.getUser(uid);
    },

    async deductBalance(userId, amount) {
      const uid = Number(userId);
      const amt = Number(amount) || 0;
      const u = await this.getUser(uid);
      if (u.balance < amt) return { ok: false, reason: 'insufficient_funds' };
      await db.prepare('UPDATE users SET balance = balance - ? WHERE user_id = ?').bind(amt, uid).run();
      return { ok: true, newBalance: u.balance - amt };
    },

    async setUserBan(userId, banned = true) {
      const uid = Number(userId);
      await this.getUser(uid);
      await db.prepare('UPDATE users SET banned = ? WHERE user_id = ?').bind(banned ? 1 : 0, uid).run();
    },

    async listTopUsers(limit = 10) {
      const r = await db.prepare('SELECT * FROM users ORDER BY total_deposit DESC, balance DESC LIMIT ?').bind(limit).all();
      return r.results || [];
    },

    // --- ORDER MANAGEMENT ---
    async getOrder(code) {
      return db.prepare('SELECT * FROM orders WHERE code = ?').bind(code).first();
    },

    async putOrder(o) {
      await db.prepare(`INSERT OR REPLACE INTO orders
        (code, pack_id, label, days, price, user_id, username, status, created_at, paid_at, paid_amount)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
        o.code, o.packId || o.pack_id, o.label, o.days, o.price, o.userId || o.user_id, o.username || '',
        o.status, o.createdAt || o.created_at, o.paidAt || o.paid_at || null, o.paidAmount || o.paid_amount || null).run();
    },

    async listPendingOrders(limit = 10) {
      const r = await db.prepare("SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT ?").bind(limit).all();
      return r.results || [];
    },

    // --- KEY MANAGEMENT ---
    async putKey(k) {
      await db.prepare(`INSERT OR REPLACE INTO keys
        (key, label, exp, user_id, order_code, hwid, banned, created_at) VALUES (?,?,?,?,?,?,?,?)`).bind(
        k.key, k.label, k.exp, k.userId || k.user_id, k.order || k.order_code || '', k.hwid || null, k.banned ? 1 : 0, k.createdAt || k.created_at).run();
    },

    async getKey(key) {
      return db.prepare('SELECT * FROM keys WHERE key = ?').bind(key).first();
    },

    async keysByUser(uid) {
      const r = await db.prepare('SELECT * FROM keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').bind(Number(uid)).all();
      return r.results || [];
    },

    async unbindKey(key) {
      await db.prepare('UPDATE keys SET hwid = NULL WHERE key = ?').bind(key).run();
    },

    async updateKeyExp(key, newExp) {
      await db.prepare('UPDATE keys SET exp = ? WHERE key = ?').bind(newExp, key).run();
    },

    async deleteKey(key) {
      await db.prepare('DELETE FROM keys WHERE key = ?').bind(key).run();
    },

    async banKey(key, banned = true) {
      await db.prepare('UPDATE keys SET banned = ? WHERE key = ?').bind(banned ? 1 : 0, key).run();
    },

    // --- TOPUP MANAGEMENT ---
    async createTopup(t) {
      await db.prepare('INSERT OR REPLACE INTO topups (code, user_id, username, amount, status, created_at, approved_at) VALUES (?,?,?,?,?,?,?)')
        .bind(t.code, t.userId || t.user_id, t.username || '', t.amount, t.status || 'pending', t.createdAt || Date.now(), t.approvedAt || null).run();
    },

    async getTopup(code) {
      return db.prepare('SELECT * FROM topups WHERE code = ?').bind(code).first();
    },

    async approveTopup(code) {
      const t = await this.getTopup(code);
      if (!t || t.status === 'approved') return null;
      await db.prepare("UPDATE topups SET status = 'approved', approved_at = ? WHERE code = ?").bind(Date.now(), code).run();
      await this.addDeposit(t.user_id, t.amount);
      return t;
    },

    async rejectTopup(code) {
      await db.prepare("UPDATE topups SET status = 'rejected' WHERE code = ?").bind(code).run();
    },

    async listPendingTopups(limit = 10) {
      const r = await db.prepare("SELECT * FROM topups WHERE status = 'pending' ORDER BY created_at DESC LIMIT ?").bind(limit).all();
      return r.results || [];
    },

    // --- GIFTCODE MANAGEMENT ---
    async createGiftcode(code, amount, createdBy = 0) {
      await db.prepare('INSERT OR REPLACE INTO giftcodes (code, amount, created_by, used_by, used_at, created_at) VALUES (?,?,?,NULL,NULL,?)')
        .bind(code, Number(amount), Number(createdBy), Date.now()).run();
    },

    async getGiftcode(code) {
      return db.prepare('SELECT * FROM giftcodes WHERE code = ?').bind(code).first();
    },

    async useGiftcode(code, userId) {
      const g = await this.getGiftcode(code);
      if (!g) return { ok: false, reason: 'not_found' };
      if (g.used_by) return { ok: false, reason: 'already_used' };
      const uid = Number(userId);
      await db.prepare('UPDATE giftcodes SET used_by = ?, used_at = ? WHERE code = ?').bind(uid, Date.now(), code).run();
      await this.addDeposit(uid, g.amount);
      return { ok: true, amount: g.amount };
    },

    async listGiftcodes(limit = 20) {
      const r = await db.prepare('SELECT * FROM giftcodes ORDER BY created_at DESC LIMIT ?').bind(limit).all();
      return r.results || [];
    },

    async deleteGiftcode(code) {
      await db.prepare('DELETE FROM giftcodes WHERE code = ?').bind(code).run();
    },

    // --- SETTINGS ---
    async getSetting(key, defVal = '') {
      const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
      return row ? row.value : defVal;
    },

    async setSetting(key, val) {
      await db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, String(val)).run();
    },

    // --- STATS ---
    async stats() {
      const p = await db.prepare("SELECT COUNT(*) c, COALESCE(SUM(paid_amount),0) s FROM orders WHERE status='paid'").first();
      const k = await db.prepare('SELECT COUNT(*) c FROM keys').first();
      const q = await db.prepare("SELECT COUNT(*) c FROM orders WHERE status='pending'").first();
      const t = await db.prepare("SELECT COUNT(*) c FROM topups WHERE status='pending'").first();
      const u = await db.prepare('SELECT COUNT(*) c FROM users').first();
      return { paid: p.c, revenue: p.s, keys: k.c, pendingOrders: q.c, pendingTopups: t.c, users: u.c };
    }
  };
}

// In-memory store for local testing
export function memStore() {
  const orders = new Map(), keys = new Map(), users = new Map(), topups = new Map(), giftcodes = new Map(), settings = new Map();
  return {
    async getUser(userId, username = '') {
      const uid = Number(userId);
      let u = users.get(uid);
      if (!u) {
        u = { user_id: uid, username: username || '', balance: 0, total_deposit: 0, banned: 0, created_at: Date.now() };
        users.set(uid, u);
      }
      return u;
    },
    async addDeposit(userId, amount) {
      const u = await this.getUser(userId);
      const amt = Number(amount) || 0;
      u.balance += amt;
      u.total_deposit += amt;
      return u;
    },
    async deductBalance(userId, amount) {
      const u = await this.getUser(userId);
      const amt = Number(amount) || 0;
      if (u.balance < amt) return { ok: false, reason: 'insufficient_funds' };
      u.balance -= amt;
      return { ok: true, newBalance: u.balance };
    },
    async setUserBan(userId, banned) {
      const u = await this.getUser(userId);
      u.banned = banned ? 1 : 0;
    },
    async listTopUsers() { return [...users.values()].sort((a,b) => b.total_deposit - a.total_deposit); },
    async getOrder(code) { return orders.get(code) || null; },
    async putOrder(o) { orders.set(o.code, { ...o }); },
    async listPendingOrders() { return [...orders.values()].filter(o => o.status === 'pending'); },
    async putKey(k) { keys.set(k.key, { ...k }); },
    async getKey(key) { return keys.get(key) || null; },
    async keysByUser(uid) { return [...keys.values()].filter(k => k.user_id === Number(uid)); },
    async unbindKey(key) { const k = keys.get(key); if (k) k.hwid = null; },
    async updateKeyExp(key, newExp) { const k = keys.get(key); if (k) k.exp = newExp; },
    async deleteKey(key) { keys.delete(key); },
    async banKey(key, banned) { const k = keys.get(key); if (k) k.banned = banned ? 1 : 0; },
    async createTopup(t) { topups.set(t.code, { ...t }); },
    async getTopup(code) { return topups.get(code) || null; },
    async approveTopup(code) {
      const t = topups.get(code);
      if (!t || t.status === 'approved') return null;
      t.status = 'approved';
      await this.addDeposit(t.user_id, t.amount);
      return t;
    },
    async rejectTopup(code) { const t = topups.get(code); if (t) t.status = 'rejected'; },
    async listPendingTopups() { return [...topups.values()].filter(t => t.status === 'pending'); },
    async createGiftcode(code, amount, createdBy) { giftcodes.set(code, { code, amount, created_by: createdBy, used_by: null, created_at: Date.now() }); },
    async getGiftcode(code) { return giftcodes.get(code) || null; },
    async useGiftcode(code, userId) {
      const g = giftcodes.get(code);
      if (!g) return { ok: false, reason: 'not_found' };
      if (g.used_by) return { ok: false, reason: 'already_used' };
      g.used_by = Number(userId);
      await this.addDeposit(userId, g.amount);
      return { ok: true, amount: g.amount };
    },
    async listGiftcodes() { return [...giftcodes.values()]; },
    async deleteGiftcode(code) { giftcodes.delete(code); },
    async getSetting(key, defVal) { return settings.get(key) !== undefined ? settings.get(key) : defVal; },
    async setSetting(key, val) { settings.set(key, String(val)); },
    async stats() {
      const paid = [...orders.values()].filter(o => o.status === 'paid');
      return {
        paid: paid.length,
        revenue: paid.reduce((s, o) => s + Number(o.paidAmount || o.price || 0), 0),
        keys: keys.size,
        pendingOrders: [...orders.values()].filter(o => o.status === 'pending').length,
        pendingTopups: [...topups.values()].filter(t => t.status === 'pending').length,
        users: users.size
      };
    }
  };
}
