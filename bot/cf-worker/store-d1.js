// Storage: D1 khi deploy that, memory khi test local. Cung interface.
export function d1Store(db) {
  return {
    async getOrder(code) {
      return db.prepare('SELECT * FROM orders WHERE code = ?').bind(code).first();
    },
    async putOrder(o) {
      await db.prepare(`INSERT OR REPLACE INTO orders
        (code, pack_id, label, days, price, user_id, username, status, created_at, paid_at, paid_amount)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
        o.code, o.packId, o.label, o.days, o.price, o.userId, o.username || '',
        o.status, o.createdAt, o.paidAt || null, o.paidAmount || null).run();
    },
    async putKey(k) {
      await db.prepare(`INSERT OR REPLACE INTO keys
        (key, label, exp, user_id, order_code, created_at) VALUES (?,?,?,?,?,?)`).bind(
        k.key, k.label, k.exp, k.userId, k.order, k.createdAt).run();
    },
    async keysByUser(uid) {
      const r = await db.prepare('SELECT * FROM keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').bind(uid).all();
      return r.results || [];
    },
    async stats() {
      const p = await db.prepare("SELECT COUNT(*) c, COALESCE(SUM(paid_amount),0) s FROM orders WHERE status='paid'").first();
      const k = await db.prepare('SELECT COUNT(*) c FROM keys').first();
      const q = await db.prepare("SELECT COUNT(*) c FROM orders WHERE status='pending'").first();
      return { paid: p.c, revenue: p.s, keys: k.c, pending: q.c };
    }
  };
}
export function memStore() {
  const orders = new Map(), keys = [];
  return {
    async getOrder(code) { return orders.get(code) || null; },
    async putOrder(o) { orders.set(o.code, { ...o }); },
    async putKey(k) { keys.push({ ...k }); },
    async keysByUser(uid) { return keys.filter(k => k.userId === uid).slice(-10).reverse(); },
    async stats() {
      const paid = [...orders.values()].filter(o => o.status === 'paid');
      return {
        paid: paid.length,
        revenue: paid.reduce((s, o) => s + Number(o.paidAmount || o.price), 0),
        keys: keys.length,
        pending: [...orders.values()].filter(o => o.status === 'pending').length
      };
    }
  };
}
