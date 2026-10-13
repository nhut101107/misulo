// Harness test bot end-to-end OFFLINE: stub Telegram API, nap update gia,
// kiem tra menu -> mua -> fulfill (nhu SePay) -> key song.
// Chay: node test/harness.js (khong can token that, khong can mang Telegram)
process.env.BOT_TOKEN = '000000:TESTTOKEN_DO_NOT_USE';
process.env.SALT = 'S6JKQT3UTCYtHNSvKgHXwRXHaNc248HR';
process.env.ADMIN_IDS = '999';
process.env.PACKS = '[{"id":"7d","label":"7 ngay","days":7,"price":20000},{"id":"30d","label":"30 ngay","days":30,"price":50000}]';
process.env.BANK_CODE = 'MB'; process.env.BANK_ACCOUNT = '0123456789'; process.env.ACCOUNT_NAME = 'TEST';

const sent = []; // capture moi goi API di
const { Telegram } = require('telegraf');
const { bot, fulfillOrder } = require('../bot');
const { verifyKey } = require('../src/keys');

// Stub o prototype vi telegraf tao Telegram moi cho moi update (handleUpdate)
Telegram.prototype.callApi = async function (method, payload) {
  sent.push({ method, payload });
  if (method === 'getMe') return { id: 1, username: 'testbot' };
  if (method === 'deleteWebhook') return true;
  if (method === 'getUpdates') return [];
  if (method === 'answerCallbackQuery') return true;
  return { message_id: 1, chat: { id: 1 }, date: 1, text: 'ok' };
};

const U = (id) => ({ id, first_name: 'T', username: 't' });
async function sendText(text) {
  await bot.handleUpdate({ update_id: 1, message: { message_id: 1, from: U(111), chat: { id: 111, type: 'private' }, date: 1, text, entities: [{ offset: 0, length: text.split(' ')[0].length, type: 'bot_command' }] } });
}
async function sendCb(data) {
  await bot.handleUpdate({ update_id: 2, callback_query: { id: 'cb1', from: U(111), message: { message_id: 5, chat: { id: 111, type: 'private' } }, data } });
}
const last = (m) => [...sent].reverse().find(x => x.method === m);

(async () => {
  let fail = 0;
  const ok = (n, c, e) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + n + (e ? ' | ' + e : '')); if (!c) fail++; };

  await sendText('/start');
  const m1 = last('sendMessage');
  ok('start_menu', !!m1 && m1.payload.text.includes('MICU') && m1.payload.text.includes('Chon goi'), (m1 && m1.payload.text.split('\n')[0]) || 'no msg');

  await sendCb('buy_30d');
  const photo = last('sendPhoto');
  ok('buy_qr', !!photo && String(photo.payload.caption).includes('30 ngay'), (photo && photo.payload.caption.split('\n').slice(0, 2).join(' / ')) || 'no photo');
  const code = (photo.payload.caption.match(/MU[A-Z0-9]{8}/) || [])[0];
  ok('order_code', !!code, code || 'none');

  // Gia lap SePay bao tien ve
  const r = await fulfillOrder(code, 50000);
  ok('fulfill', r.ok === true, r.key || r.reason);
  const kmsg = last('sendMessage');
  ok('key_sent', !!kmsg && kmsg.payload.text.includes(r.key || 'NONE'), 'key gui cho user');

  // Key bot de ra phai verify duoc (cung thuat toan voi APK)
  const v = verifyKey(process.env.SALT, r.key);
  ok('key_verify', v.ok === true, JSON.stringify(v));

  // Thieu tien -> tu choi
  await sendCb('buy_7d');
  const photo2 = last('sendPhoto');
  const code2 = (photo2.payload.caption.match(/MU[A-Z0-9]{8}/) || [])[0];
  const r2 = await fulfillOrder(code2, 1000);
  ok('amount_low_reject', r2.ok === false && r2.reason === 'amount_low');

  // Non-admin goi /stats -> khong rep
  const n0 = sent.length;
  await sendText('/stats');
  ok('stats_nonadmin_silent', sent.length === n0);

  // /check
  await sendText('/check ' + r.key);
  const chk = last('sendMessage');
  ok('check_cmd', !!chk && chk.payload.text.includes('song'), chk && chk.payload.text);

  console.log(fail === 0 ? 'ALL_OK' : 'FAILED=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('HARNESS_ERR ' + e.stack); process.exit(1); });
