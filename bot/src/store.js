// JSON store: data/db.json
const fs = require('fs');
const path = require('path');
const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!data.orders) data.orders = [];
    if (!data.keys) data.keys = [];
    if (!data.users) data.users = {};
    if (!data.topups) data.topups = [];
    if (!data.bannedUsers) data.bannedUsers = [];
    if (!data.giftcodes) data.giftcodes = [];
    if (!data.settings) data.settings = { maintenance: false, downloadUrl: '' };
    return data;
  } catch (e) {
    return {
      orders: [],
      keys: [],
      users: {},
      topups: [],
      bannedUsers: [],
      giftcodes: [],
      settings: { maintenance: false, downloadUrl: '' },
      seq: 0
    };
  }
}

function save(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

function getUser(db, userId, username) {
  if (!db.users) db.users = {};
  const idStr = String(userId);
  if (!db.users[idStr]) {
    db.users[idStr] = {
      balance: 0,
      totalDeposit: 0,
      username: username || '',
      createdAt: Date.now()
    };
  } else if (username && db.users[idStr].username !== username) {
    db.users[idStr].username = username;
  }
  return db.users[idStr];
}

function addDeposit(db, userId, amount) {
  const u = getUser(db, userId);
  const amt = Number(amount) || 0;
  u.balance = (u.balance || 0) + amt;
  u.totalDeposit = (u.totalDeposit || 0) + amt;
  return u;
}

function deductBalance(db, userId, amount) {
  const u = getUser(db, userId);
  const amt = Number(amount) || 0;
  if ((u.balance || 0) < amt) return false;
  u.balance -= amt;
  return true;
}

// Quan ly Ban / Unban User
function isUserBanned(db, userId) {
  if (!db.bannedUsers) db.bannedUsers = [];
  return db.bannedUsers.includes(String(userId));
}

function banUser(db, userId) {
  if (!db.bannedUsers) db.bannedUsers = [];
  const idStr = String(userId);
  if (!db.bannedUsers.includes(idStr)) {
    db.bannedUsers.push(idStr);
  }
}

function unbanUser(db, userId) {
  if (!db.bannedUsers) db.bannedUsers = [];
  const idStr = String(userId);
  db.bannedUsers = db.bannedUsers.filter(id => id !== idStr);
}

// Quan ly Giftcode
function createGiftcode(db, { code, type = 'fixed', value = 0, maxUses = 100 }) {
  if (!db.giftcodes) db.giftcodes = [];
  const cleanCode = String(code).trim().toUpperCase();
  // Xoa code cu neu trung
  db.giftcodes = db.giftcodes.filter(c => c.code !== cleanCode);
  const gc = {
    code: cleanCode,
    type, // 'percent' (VD: 20%) hoac 'fixed' (VD: 10000d)
    value: Number(value),
    maxUses: Number(maxUses),
    usedCount: 0,
    usedBy: [],
    createdAt: Date.now()
  };
  db.giftcodes.push(gc);
  return gc;
}

function redeemGiftcode(db, userId, code) {
  if (!db.giftcodes) return { ok: false, reason: 'no_codes' };
  const cleanCode = String(code).trim().toUpperCase();
  const gc = db.giftcodes.find(c => c.code === cleanCode);
  if (!gc) return { ok: false, reason: 'not_found' };

  const idStr = String(userId);
  if (gc.usedBy && gc.usedBy.includes(idStr)) {
    return { ok: false, reason: 'already_used' };
  }
  if (gc.usedCount >= gc.maxUses) {
    return { ok: false, reason: 'out_of_uses' };
  }

  // Neu la fixed -> cong tien truc tiep vao vi
  let rewardAmount = 0;
  if (gc.type === 'fixed') {
    rewardAmount = gc.value;
    addDeposit(db, userId, rewardAmount);
  }

  gc.usedCount = (gc.usedCount || 0) + 1;
  if (!gc.usedBy) gc.usedBy = [];
  gc.usedBy.push(idStr);

  return { ok: true, giftcode: gc, rewardAmount };
}

// Cai dat he thong (Settings)
function getSettings(db) {
  if (!db.settings) db.settings = { maintenance: false, downloadUrl: '' };
  return db.settings;
}

function setSetting(db, key, value) {
  if (!db.settings) db.settings = { maintenance: false, downloadUrl: '' };
  db.settings[key] = value;
  return db.settings;
}

// Quan ly Key
function updateKeyExp(db, targetKey, additionalDays) {
  if (!db.keys) return null;
  const clean = targetKey.trim().toUpperCase();
  const k = db.keys.find(x => x.key && x.key.toUpperCase().includes(clean));
  if (!k) return null;

  const days = Number(additionalDays) || 0;
  const curExp = k.exp ? new Date(k.exp).getTime() : Date.now();
  const baseTime = curExp > Date.now() ? curExp : Date.now();
  const newExpTime = baseTime + days * 86400000;
  k.exp = new Date(newExpTime).toISOString().slice(0, 10);
  return k;
}

function deleteKey(db, targetKey) {
  if (!db.keys) return false;
  const clean = targetKey.trim().toUpperCase();
  const before = db.keys.length;
  db.keys = db.keys.filter(x => !x.key || !x.key.toUpperCase().includes(clean));
  return db.keys.length < before;
}

function banKey(db, targetKey) {
  if (!db.keys) return null;
  const clean = targetKey.trim().toUpperCase();
  const k = db.keys.find(x => x.key && x.key.toUpperCase().includes(clean));
  if (!k) return null;
  k.banned = true;
  return k;
}

function unbindKey(db, targetKey) {
  if (!db.keys) return null;
  const clean = targetKey.trim().toUpperCase();
  const k = db.keys.find(x => x.key && x.key.toUpperCase().includes(clean));
  if (!k) return null;
  k.devId = 'all';
  return k;
}

module.exports = {
  load,
  save,
  getUser,
  addDeposit,
  deductBalance,
  isUserBanned,
  banUser,
  unbanUser,
  createGiftcode,
  redeemGiftcode,
  getSettings,
  setSetting,
  updateKeyExp,
  deleteKey,
  banKey,
  unbindKey
};
