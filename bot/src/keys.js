// HMAC key engine - DUNG CHUNG THUAT TOAN VOI KeyOffline.java (Android).
// Doi 1 ben la gay ben kia. Test vector nam o test/selftest.js
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32 RFC4648, khong padding
const EPOCH_DAY = Math.floor(Date.UTC(2025, 0, 1) / 86400000); // 20089
const MAX_EXP = 32767; // 15 bit

function enc(n, len) {
  n = n >>> 0;
  let s = '';
  for (let i = 0; i < len; i++) { s = ALPHABET[n & 31] + s; n >>>= 5; }
  return s;
}
function dec(str) {
  let n = 0;
  for (const ch of str) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) return -1;
    n = n * 32 + i;
  }
  return n;
}
function sigFor(salt, payload9) {
  const h = crypto.createHmac('sha256', Buffer.from(salt, 'utf8'))
    .update(Buffer.from('MICU|' + payload9, 'utf8')).digest();
  const v = (((h[0] << 22) | (h[1] << 14) | (h[2] << 6) | (h[3] >>> 2)) >>> 0);
  return enc(v, 6);
}
// durationDays: so ngay su dung ke tu hom nay (UTC). Vinh vien = 30000.
function issueKey(salt, durationDays) {
  const today = Math.floor(Date.now() / 86400000);
  let exp = today - EPOCH_DAY + Math.floor(durationDays);
  if (exp > MAX_EXP) exp = MAX_EXP;
  if (exp < 0) exp = 0;
  const rand = crypto.randomInt(0, 1 << 30);
  const payload = enc(exp, 3) + enc(rand, 6);
  const all = payload + sigFor(salt, payload);
  return 'MICU-' + all.slice(0, 5) + '-' + all.slice(5, 10) + '-' + all.slice(10, 15);
}
function verifyKey(salt, key) {
  if (!key) return { ok: false, reason: 'empty' };
  let clean = String(key).trim().toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (clean.startsWith('MICU')) clean = clean.slice(4); // bo prefix hien thi
  if (clean.length !== 15) return { ok: false, reason: 'bad_format' };
  const payload = clean.slice(0, 9), sig = clean.slice(9, 15);
  const exp = dec(payload.slice(0, 3));
  if (exp < 0) return { ok: false, reason: 'bad_format' };
  if (sigFor(salt, payload) !== sig) return { ok: false, reason: 'bad_sig' };
  const expEnd = (EPOCH_DAY + exp + 1) * 86400000;
  if (Date.now() >= expEnd) return { ok: false, reason: 'expired' };
  return { ok: true, expDate: new Date(expEnd - 1).toISOString().slice(0, 10) };
}
function orderCode() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = 'MU';
  const b = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) s += abc[b[i] % abc.length];
  return s; // VD: MUK7D2QX9P4
}
module.exports = { ALPHABET, EPOCH_DAY, MAX_EXP, issueKey, verifyKey, orderCode };
