// HMAC key engine cho Cloudflare Workers (WebCrypto, async).
// CUNG THUAT TOAN VOI src/keys.js (Node) va KeyOffline.java (Android).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const EPOCH_DAY = Math.floor(Date.UTC(2025, 0, 1) / 86400000); // 20089
const MAX_EXP = 32767;

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

async function sigFor(salt, payload9, tag = 'MNHUT') {
  const k = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(tag + '|' + payload9));
  const h = new Uint8Array(buf);
  const v = (((h[0] << 22) | (h[1] << 14) | (h[2] << 6) | (h[3] >>> 2)) >>> 0);
  return enc(v, 6);
}

async function deviceHash(salt, devId) {
  if (!devId) return 'AAAA';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(devId.trim().toLowerCase() + salt));
  const h = new Uint8Array(buf);
  const v = (((h[0] << 12) | (h[1] << 4) | (h[2] >>> 4)) >>> 0);
  return enc(v, 4);
}

async function issueKey(salt, durationDays, deviceId = null) {
  const today = Math.floor(Date.now() / 86400000);
  let exp = today - EPOCH_DAY + Math.floor(durationDays);
  if (exp > MAX_EXP) exp = MAX_EXP;
  if (exp < 0) exp = 0;

  const flag = deviceId ? 'DY' : 'DN';
  let devPart;
  if (deviceId) {
    devPart = await deviceHash(salt, deviceId);
  } else {
    const rand = new Uint8Array(4);
    crypto.getRandomValues(rand);
    const rNum = (((rand[0] << 24) | (rand[1] << 16) | (rand[2] << 8) | rand[3]) >>> 0) % (1 << 20);
    devPart = enc(rNum, 4);
  }
  const payload = enc(exp, 3) + flag + devPart;
  const sig = await sigFor(salt, payload, 'MNHUT');
  const all = payload + sig;
  return 'MNHUT-' + all.slice(0, 5) + '-' + all.slice(5, 10) + '-' + all.slice(10, 15);
}

async function verifyKey(salt, key, deviceId = null) {
  if (!key) return { ok: false, reason: 'empty' };
  let clean = String(key).trim().toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (clean.startsWith('MNHUT')) clean = clean.slice(5);
  else if (clean.startsWith('MICU')) clean = clean.slice(4);
  if (clean.length !== 15) return { ok: false, reason: 'bad_format' };
  const payload = clean.slice(0, 9);
  const sig = clean.slice(9, 15);

  const exp = dec(payload.slice(0, 3));
  if (exp < 0) return { ok: false, reason: 'bad_format' };

  // Dual HMAC: MNHUT first, fallback MICU
  let match = (await sigFor(salt, payload, 'MNHUT')) === sig;
  if (!match) {
    match = (await sigFor(salt, payload, 'MICU')) === sig;
  }
  if (!match) return { ok: false, reason: 'bad_sig' };

  const expEnd = (EPOCH_DAY + exp + 1) * 86400000;
  if (Date.now() >= expEnd) return { ok: false, reason: 'expired' };

  const flag = payload.slice(3, 5);
  const devPart = payload.slice(5, 9);
  if (flag === 'DY') {
    if (!deviceId) return { ok: false, reason: 'device_required' };
    const expected = await deviceHash(salt, deviceId);
    if (expected !== devPart) return { ok: false, reason: 'device_mismatch' };
  }

  return {
    ok: true,
    expDate: new Date(expEnd - 1).toISOString().slice(0, 10),
    boundToDevice: flag === 'DY'
  };
}

function orderCode() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  let s = 'MN';
  for (let i = 0; i < 8; i++) s += abc[b[i] % abc.length];
  return s;
}

export { ALPHABET, EPOCH_DAY, MAX_EXP, issueKey, verifyKey, orderCode, deviceHash };
