// Bot ban key MicuMulti: menu goi -> tao don -> QR VietQR -> SePay webhook -> nha key HMAC.
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { load, save } = require('./src/store');
const { issueKey, verifyKey, orderCode } = require('./src/keys');
const { qrUrl, fmtVND } = require('./src/vietqr');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const SALT = process.env.SALT || '';
const BANK = process.env.BANK_CODE || 'MB';
const ACC = process.env.BANK_ACCOUNT || '';
const ACC_NAME = process.env.ACCOUNT_NAME || '';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
let PACKS = [];
try { PACKS = JSON.parse(process.env.PACKS || '[]'); } catch (e) { PACKS = []; }
const ORDER_TTL_MIN = 30;

if (!BOT_TOKEN || BOT_TOKEN.includes('paste-')) console.warn('[WARN] Chua cau hinh BOT_TOKEN trong .env');
if (!SALT) console.warn('[WARN] Chua cau hinh SALT');

const bot = new Telegraf(BOT_TOKEN);
const isAdmin = (id) => ADMIN_IDS.includes(String(id));

// Don het han sau 30 phut
setInterval(() => {
  const db = load(); let dirty = false;
  const now = Date.now();
  for (const o of db.orders) {
    if (o.status === 'pending' && now - o.createdAt > ORDER_TTL_MIN * 60 * 1000) { o.status = 'expired'; dirty = true; }
  }
  if (dirty) save(db);
}, 5 * 60 * 1000).unref();

function packKeyboard() {
  const rows = PACKS.map(p => [Markup.button.callback(`${p.label} - ${fmtVND(p.price)}`, `buy_${p.id}`)]);
  rows.push([Markup.button.callback('Key cua toi', 'mykeys'), Markup.button.callback('Check key', 'askcheck')]);
  return Markup.inlineKeyboard(rows);
}

bot.start((ctx) => ctx.reply(
  'MICU KEY SHOP\nMua key tu dong 24/7. Chuyen khoan theo QR la bot tu nha key.\nChon goi ben duoi:',
  packKeyboard()
));
bot.command('menu', (ctx) => ctx.reply('Chon goi key:', packKeyboard()));
bot.action('menu', (ctx) => ctx.editMessageText('Chon goi key:', packKeyboard()));

bot.action(/buy_(.+)/, async (ctx) => {
  const pack = PACKS.find(p => p.id === ctx.match[1]);
  if (!pack) return ctx.answerCbQuery('Goi khong ton tai');
  const db = load();
  const code = orderCode();
  db.orders.push({
    code, packId: pack.id, label: pack.label, days: pack.days, price: pack.price,
    userId: ctx.from.id, username: ctx.from.username || '',
    status: 'pending', createdAt: Date.now()
  });
  save(db);
  await ctx.answerCbQuery();
  await ctx.replyWithPhoto(qrUrl(BANK, ACC, pack.price, code, ACC_NAME), {
    caption: `Don ${code}\nGoi: ${pack.label}\nTien: ${fmtVND(pack.price)}\n` +
      `Noi dung CK (bat buoc ghi dung): ${code}\n` +
      `Chuyen xong bot tu check 1-3 phut va nha key. Don huy sau ${ORDER_TTL_MIN} phut neu chua thanh toan.`,
    ...Markup.inlineKeyboard([[Markup.button.callback('Huy don', `cancel_${code}`)]])
  });
});

bot.action(/cancel_(.+)/, async (ctx) => {
  const db = load();
  const o = db.orders.find(x => x.code === ctx.match[1] && x.userId === ctx.from.id);
  if (o && o.status === 'pending') { o.status = 'cancelled'; save(db); }
  await ctx.answerCbQuery('Da huy don');
  try { await ctx.deleteMessage(); } catch (e) {}
});

bot.action('mykeys', async (ctx) => {
  const db = load();
  const mine = db.keys.filter(k => k.userId === ctx.from.id).slice(-10);
  if (!mine.length) return ctx.answerCbQuery('M chua co key nao', true);
  await ctx.answerCbQuery();
  await ctx.reply(mine.map(k => `${k.key} (${k.label}, het han ${k.exp})`).join('\n'));
});

bot.action('askcheck', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Gui key can check theo cu phap: /check MICU-XXXXX-XXXXX-XXXXX');
});
bot.command('check', (ctx) => {
  const key = ctx.message.text.split(/\s+/)[1] || '';
  const r = verifyKey(SALT, key);
  ctx.reply(r.ok ? `Key song. Het han ${r.expDate}.` : `Key loi: ${r.reason}.`);
});

// Ham nay duoc server.js goi khi SePay bao tien ve
async function fulfillOrder(code, amount) {
  const db = load();
  const o = db.orders.find(x => x.code === code && x.status === 'pending');
  if (!o) return { ok: false, reason: 'order_not_found' };
  if (Number(amount) < Number(o.price)) return { ok: false, reason: 'amount_low' };
  const key = issueKey(SALT, o.days);
  const v = verifyKey(SALT, key); // tu check lai truoc khi giao
  if (!v.ok) return { ok: false, reason: 'gen_fail' };
  o.status = 'paid'; o.paidAt = Date.now(); o.paidAmount = amount;
  db.keys.push({ key, label: o.label, exp: v.expDate, userId: o.userId, order: code, createdAt: Date.now() });
  save(db);
  try {
    await bot.telegram.sendMessage(o.userId,
      `Thanh toan thanh cong don ${code}.\nKey ${o.label} cua m:\n${key}\nHet han: ${v.expDate}\nNhap key vao app de kich hoat.`);
  } catch (e) { console.error('send key fail', e.message); }
  return { ok: true, key };
}

// Admin
bot.command('stats', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const db = load();
  const paid = db.orders.filter(o => o.status === 'paid');
  const rev = paid.reduce((s, o) => s + Number(o.paidAmount || o.price), 0);
  ctx.reply(`Don paid: ${paid.length}\nDoanh thu: ${fmtVND(rev)}\nKey da cap: ${db.keys.length}\nDon pending: ${db.orders.filter(o => o.status === 'pending').length}`);
});
bot.command('gen', (ctx) => { // /gen <so_ngay> [DeviceID]
  if (!isAdmin(ctx.from.id)) return;
  const parts = ctx.message.text.split(/\s+/);
  const days = parseInt(parts[1] || '30', 10);
  const devId = (parts[2] && parts[2].length >= 4 && !parts[2].startsWith('#')) ? parts[2].trim() : null;
  if (!days || days < 1) {
    return ctx.reply('Cu phap:\n/gen <so_ngay> [DeviceID]\nVD: /gen 30\nVD: /gen 30 8a3f12bc (khoa dung may nay)');
  }
  const key = issueKey(SALT, Math.min(days, 30000), devId);
  const v = verifyKey(SALT, key, devId);
  const db = load();
  db.keys.push({ key, label: `tay-${days}d`, devId: devId || 'all', exp: v.expDate, userId: ctx.from.id, order: 'manual', createdAt: Date.now() });
  save(db);
  ctx.reply(`${key}\nHet han: ${v.expDate}\nKhoa may: ${devId ? devId : 'Khong (tu do)'}`);
});
bot.command('don', async (ctx) => { // /don MUXXXXXXXX (duyet tay khi SePay loi)
  if (!isAdmin(ctx.from.id)) return;
  const code = (ctx.message.text.split(/\s+/)[1] || '').trim().toUpperCase();
  const db = load();
  const o = db.orders.find(x => x.code === code);
  if (!o) return ctx.reply('Khong thay don');
  const r = await fulfillOrder(code, o.price);
  ctx.reply(r.ok ? `Da duyet tay, key: ${r.key}` : `Loi: ${r.reason}`);
});

module.exports = { bot, fulfillOrder, PACKS };
