// Cloudflare Workers KV Storage adapter for MNHUT VIP
export function kvStore(kv) {
  return {
    // --- USER MANAGEMENT ---
    async getUser(userId, username = '') {
      const uid = String(userId);
      let u = await kv.get(`user:${uid}`, 'json');
      if (!u) {
        u = { user_id: Number(uid), username: username || '', balance: 0, total_deposit: 0, banned: 0, created_at: Date.now() };
        await kv.put(`user:${uid}`, JSON.stringify(u));
        // add to users list
        const list = (await kv.get('users_list', 'json')) || [];
        if (!list.includes(Number(uid))) {
          list.push(Number(uid));
          await kv.put('users_list', JSON.stringify(list));
        }
      } else if (username && u.username !== username) {
        u.username = username;
        await kv.put(`user:${uid}`, JSON.stringify(u));
      }
      return u;
    },

    async addDeposit(userId, amount) {
      const u = await this.getUser(userId);
      const amt = Number(amount) || 0;
      u.balance = (u.balance || 0) + amt;
      u.total_deposit = (u.total_deposit || 0) + amt;
      await kv.put(`user:${userId}`, JSON.stringify(u));
      return u;
    },

    async deductBalance(userId, amount) {
      const u = await this.getUser(userId);
      const amt = Number(amount) || 0;
      if ((u.balance || 0) < amt) return { ok: false, reason: 'insufficient_funds' };
      u.balance -= amt;
      await kv.put(`user:${userId}`, JSON.stringify(u));
      return { ok: true, newBalance: u.balance };
    },

    async setUserBan(userId, banned = true) {
      const u = await this.getUser(userId);
      u.banned = banned ? 1 : 0;
      await kv.put(`user:${userId}`, JSON.stringify(u));
    },

    async listTopUsers(limit = 10) {
      const uids = (await kv.get('users_list', 'json')) || [];
      const users = [];
      for (const id of uids.slice(-30)) {
        const u = await kv.get(`user:${id}`, 'json');
        if (u) users.push(u);
      }
      return users.sort((a,b) => (b.total_deposit || 0) - (a.total_deposit || 0)).slice(0, limit);
    },

    // --- ORDER MANAGEMENT ---
    async getOrder(code) {
      return kv.get(`order:${code}`, 'json');
    },

    async putOrder(o) {
      await kv.put(`order:${o.code}`, JSON.stringify(o));
      if (o.status === 'pending') {
        const p = (await kv.get('pending_orders', 'json')) || [];
        if (!p.includes(o.code)) {
          p.push(o.code);
          await kv.put('pending_orders', JSON.stringify(p));
        }
      } else {
        const p = (await kv.get('pending_orders', 'json')) || [];
        const filtered = p.filter(c => c !== o.code);
        await kv.put('pending_orders', JSON.stringify(filtered));
      }
    },

    async listPendingOrders(limit = 10) {
      const codes = (await kv.get('pending_orders', 'json')) || [];
      const orders = [];
      for (const c of codes.slice(-limit)) {
        const o = await kv.get(`order:${c}`, 'json');
        if (o) orders.push(o);
      }
      return orders;
    },

    // --- KEY MANAGEMENT ---
    async putKey(k) {
      await kv.put(`key:${k.key}`, JSON.stringify(k));
      // store user keys index
      const uid = String(k.userId || k.user_id);
      if (uid) {
        const myKeys = (await kv.get(`user_keys:${uid}`, 'json')) || [];
        if (!myKeys.some(item => item.key === k.key)) {
          myKeys.unshift(k);
          await kv.put(`user_keys:${uid}`, JSON.stringify(myKeys.slice(0, 30)));
        }
      }
      // increment total keys count
      const totalKeys = (Number(await kv.get('total_keys_count', 'text')) || 0) + 1;
      await kv.put('total_keys_count', String(totalKeys));
    },

    async getKey(key) {
      return kv.get(`key:${key}`, 'json');
    },

    async keysByUser(uid) {
      return (await kv.get(`user_keys:${uid}`, 'json')) || [];
    },

    async unbindKey(key) {
      const k = await this.getKey(key);
      if (k) {
        k.hwid = null;
        await kv.put(`key:${key}`, JSON.stringify(k));
      }
    },

    async updateKeyExp(key, newExp) {
      const k = await this.getKey(key);
      if (k) {
        k.exp = newExp;
        await kv.put(`key:${key}`, JSON.stringify(k));
      }
    },

    async deleteKey(key) {
      await kv.delete(`key:${key}`);
    },

    async banKey(key, banned = true) {
      const k = await this.getKey(key);
      if (k) {
        k.banned = banned ? 1 : 0;
        await kv.put(`key:${key}`, JSON.stringify(k));
      }
    },

    // --- TOPUP MANAGEMENT ---
    async createTopup(t) {
      await kv.put(`topup:${t.code}`, JSON.stringify(t));
      const p = (await kv.get('pending_topups', 'json')) || [];
      if (!p.includes(t.code)) {
        p.unshift(t.code);
        await kv.put('pending_topups', JSON.stringify(p.slice(0, 50)));
      }
    },

    async getTopup(code) {
      return kv.get(`topup:${code}`, 'json');
    },

    async approveTopup(code) {
      const t = await this.getTopup(code);
      if (!t || t.status === 'approved') return null;
      t.status = 'approved';
      t.approved_at = Date.now();
      await kv.put(`topup:${code}`, JSON.stringify(t));
      // remove from pending
      const p = (await kv.get('pending_topups', 'json')) || [];
      await kv.put('pending_topups', JSON.stringify(p.filter(c => c !== code)));
      // credit balance
      await this.addDeposit(t.userId || t.user_id, t.amount);
      return t;
    },

    async rejectTopup(code) {
      const t = await this.getTopup(code);
      if (t) {
        t.status = 'rejected';
        await kv.put(`topup:${code}`, JSON.stringify(t));
      }
      const p = (await kv.get('pending_topups', 'json')) || [];
      await kv.put('pending_topups', JSON.stringify(p.filter(c => c !== code)));
    },

    async listPendingTopups(limit = 10) {
      const codes = (await kv.get('pending_topups', 'json')) || [];
      const list = [];
      for (const c of codes.slice(0, limit)) {
        const t = await kv.get(`topup:${c}`, 'json');
        if (t && t.status === 'pending') list.push(t);
      }
      return list;
    },

    // --- GIFTCODE MANAGEMENT ---
    async createGiftcode(code, amount, createdBy = 0) {
      const g = { code, amount: Number(amount), created_by: Number(createdBy), used_by: null, created_at: Date.now() };
      await kv.put(`giftcode:${code}`, JSON.stringify(g));
      const list = (await kv.get('giftcodes_list', 'json')) || [];
      list.unshift(code);
      await kv.put('giftcodes_list', JSON.stringify(list.slice(0, 50)));
    },

    async getGiftcode(code) {
      return kv.get(`giftcode:${code}`, 'json');
    },

    async useGiftcode(code, userId) {
      const g = await this.getGiftcode(code);
      if (!g) return { ok: false, reason: 'not_found' };
      if (g.used_by) return { ok: false, reason: 'already_used' };
      g.used_by = Number(userId);
      g.used_at = Date.now();
      await kv.put(`giftcode:${code}`, JSON.stringify(g));
      await this.addDeposit(userId, g.amount);
      return { ok: true, amount: g.amount };
    },

    async listGiftcodes(limit = 20) {
      const codes = (await kv.get('giftcodes_list', 'json')) || [];
      const list = [];
      for (const c of codes.slice(0, limit)) {
        const g = await kv.get(`giftcode:${c}`, 'json');
        if (g) list.push(g);
      }
      return list;
    },

    async deleteGiftcode(code) {
      await kv.delete(`giftcode:${code}`);
      const codes = (await kv.get('giftcodes_list', 'json')) || [];
      await kv.put('giftcodes_list', JSON.stringify(codes.filter(c => c !== code)));
    },

    // --- SETTINGS ---
    async getSetting(key, defVal = '') {
      const val = await kv.get(`setting:${key}`, 'text');
      return val !== null && val !== undefined ? val : defVal;
    },

    async setSetting(key, val) {
      await kv.put(`setting:${key}`, String(val));
    },

    // --- STATS ---
    async stats() {
      const uids = (await kv.get('users_list', 'json')) || [];
      const pendingTopups = (await kv.get('pending_topups', 'json')) || [];
      const pendingOrders = (await kv.get('pending_orders', 'json')) || [];
      const totalKeys = Number(await kv.get('total_keys_count', 'text')) || 0;
      return {
        paid: 0,
        revenue: 0,
        keys: totalKeys,
        pendingOrders: pendingOrders.length,
        pendingTopups: pendingTopups.length,
        users: uids.length
      };
    }
  };
}
