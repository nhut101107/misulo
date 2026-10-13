CREATE TABLE IF NOT EXISTS orders (
  code TEXT PRIMARY KEY,
  pack_id TEXT,
  label TEXT,
  days INTEGER,
  price INTEGER,
  user_id INTEGER,
  username TEXT,
  status TEXT,
  created_at INTEGER,
  paid_at INTEGER,
  paid_amount INTEGER
);

CREATE TABLE IF NOT EXISTS keys (
  key TEXT PRIMARY KEY,
  label TEXT,
  exp TEXT,
  user_id INTEGER,
  order_code TEXT,
  hwid TEXT,
  banned INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  username TEXT,
  balance INTEGER DEFAULT 0,
  total_deposit INTEGER DEFAULT 0,
  banned INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS topups (
  code TEXT PRIMARY KEY,
  user_id INTEGER,
  username TEXT,
  amount INTEGER,
  status TEXT,
  created_at INTEGER,
  approved_at INTEGER
);

CREATE TABLE IF NOT EXISTS giftcodes (
  code TEXT PRIMARY KEY,
  amount INTEGER,
  created_by INTEGER,
  used_by INTEGER,
  used_at INTEGER,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
