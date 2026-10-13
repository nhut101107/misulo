// Test worker OFFLINE: stub fetch Telegram, dung memStore, nap update gia.
// Chay: node test/worker-harness.mjs (khong can token that, khong can D1)
const tgCalls = [];
async function tgStub(url, init) {
  const u = String(url && url.href ? url.href : url);
  const m = u.split('/').pop();
  tgCalls.push({ method: m, body: JSON.parse(init.body) });
  const result = m === 'getMe'
    ? { id: 1, is_bot: true, first_name: 'T', username: 'testbot' }
    : { message_id: 1 };
  return Response.json({ ok: true, result });
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url && url.href ? url.href : url);
  if (u.includes('api.telegram.org')) return tgStub(url, init);
  return realFetch(url, init);
};
// grammY: inject fetch gia qua client config (duong chinh thong, khong prototype-hack)
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const __client = { fetch: tgStub };

const worker = (await import('../cf-worker/worker.js')).default;
const { verifyKey: verifyW } = await import('../cf-worker/keys-w.js');
const { verifyKey: verifyNode } = await import('../src/keys.js');

const env = {
  BOT_TOKEN: '000000:TEST', SALT: 'S6JKQT3UTCYtHNSvKgHXwRXHaNc248HR',
  ADMIN_IDS: '999', WEBHOOK_SECRET: 's3cr3t', SEPAY_API_KEY: 'K',
  BANK_CODE: 'MB', BANK_ACCOUNT: '0123456789', ACCOUNT_NAME: 'TEST',
  PACKS: '[{"id":"7d","label":"7 ngay","days":7,"price":20000},{"id":"30d","label":"30 ngay","days":30,"price":50000}]',
  __client: { fetch: tgStub }
};
const post = (path, obj, headers = {}) => worker.fetch(
  new Request('http://x' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(obj) }), env);
const U = (id) => ({ id, first_name: 'T', username: 't' });
const msgUpd = (text) => ({ update_id: 1, message: { message_id: 1, from: U(111), chat: { id: 111, type: 'private' }, date: 1, text, entities: [{ offset: 0, length: text.split(' ')[0].length, type: 'bot_command' }] } });
const cbUpd = (data) => ({ update_id: 2, callback_query: { id: 'c1', from: U(111), message: { message_id: 5, chat: { id: 111, type: 'private' } }, data } });
const lastCall = (m) => [...tgCalls].reverse().find(c => c.method === m);

let fail = 0;
const ok = (n, c, e) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + n + (e ? ' | ' + e : '')); if (!c) fail++; };

let r = await post('/telegram/s3cr3t', msgUpd('/start'));
ok('start_200', r.status === 200);
const m1 = lastCall('sendMessage');
ok('start_menu', !!m1 && m1.body.text.includes('MICU'), (m1 && m1.body.text.split('\n')[0]) || 'none');

await post('/telegram/s3cr3t', cbUpd('buy_30d'));
const photo = lastCall('sendPhoto');
const code = (photo && JSON.stringify(photo.body).match(/MU[A-Z0-9]{8}/) || [])[0];
ok('buy_qr', !!photo && !!code, code || 'none');

// SePay sai key -> 401
const r401 = await post('/sepay-webhook', { content: code, transferAmount: 50000 }, { authorization: 'Apikey SAI' });
ok('sepay_auth', r401.status === 401);

// SePay dung: tien ve -> nha key
const r2 = await post('/sepay-webhook', { content: `MB ${code} CK`, transferAmount: 50000 }, { authorization: 'Apikey K' });
const j2 = await r2.json();
ok('sepay_fulfill', j2.success === true && j2.ok === true, j2.key || JSON.stringify(j2));
const kmsg = lastCall('sendMessage');
ok('key_sent', !!kmsg && kmsg.body.text.includes(j2.key || 'NONE'), 'key toi user');

// Key worker de ra: verify duoc tren ca 2 runtime (Workers + Node) -> chac chan APK (Java) cung an
const vw = await verifyW(env.SALT, j2.key);
const vn = verifyNode(env.SALT, j2.key);
ok('key_verify_both', vw.ok === true && vn.ok === true, JSON.stringify(vw));

// Thieu tien -> tu choi
await post('/telegram/s3cr3t', cbUpd('buy_7d'));
const photo2 = lastCall('sendPhoto');
const code2 = (JSON.stringify(photo2.body).match(/MU[A-Z0-9]{8}/) || [])[0];
const r3 = await post('/sepay-webhook', { content: code2, transferAmount: 1000 }, { authorization: 'Apikey K' });
ok('amount_low', (await r3.json()).reason === 'amount_low');

// /setup tu set webhook (lam tu dien thoai sau deploy)
const r4 = await worker.fetch(new Request('http://x/setup?s=s3cr3t'), env);
ok('setup_route', (await r4.text()).includes('/telegram/s3cr3t'));

console.log(fail === 0 ? 'ALL_OK' : 'FAILED=' + fail);
process.exit(fail ? 1 : 0);
