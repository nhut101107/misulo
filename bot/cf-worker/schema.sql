CREATE TABLE IF NOT EXISTS orders (
  code TEXT PRIMARY KEY,
  pack_id TEXT, label TEXT, days INTEGER, price INTEGER,
  user_id INTEGER, username TEXT, status TEXT,
  created_at INTEGER, paid_at INTEGER, paid_amount INTEGER
);
CREATE TABLE IF NOT EXISTS keys (
  key TEXT PRIMARY KEY,
  label TEXT, exp TEXT, user_id INTEGER, order_code TEXT, created_at INTEGER
);
