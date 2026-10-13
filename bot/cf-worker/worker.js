// Worker ban key MicuMulti: Telegram webhook (grammY) + SePay webhook + D1.
// Deploy: Cloudflare Workers free, khong ngu, khong can PC (xem DEPLOY_CLOUDFLARE.txt).
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { issueKey, verifyKey, orderCode } from './keys-w.js';
import { d1Store, memStore } from './store-d1.js';

const ORDER_TTL_MIN = 30;

function packs(env) {
  try { return JSON.parse(env.PACKS || '[]'); } catch { return []; }
}
function fmtVND(n) { return Number(n).toLocaleString('vi-VN') + 'đ'; }
function qrUrl(bank, acc, amount, info, name) {
  return `https://img.vietqr.io/image/${bank}-${acc}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(info)}&accountName=${encodeURIComponent(name || '')}`;
}
function isAdmin(env, id) {
  return String(env.ADMIN_IDS || '').split(',').map(s => s.trim()).includes(String(id));
}
async function tgSend(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
function packKeyboard(PACKS) {
  const kb = new InlineKeyboard();
  for (const p of PACKS) kb.text(`${p.label} - ${fmtVND(p.price)}`, `buy_${p.id}`).row();
  kb.text('Key cua toi', 'mykeys').text('Check key', 'askcheck');
  return kb;
}
function expired(o) {
  return o.status === 'pending' && Date.now() - o.createdAt > ORDER_TTL_MIN * 60 * 1000;
}

function buildBot(env, store) {
  // env.__client chi dung khi test local (inject fetch gia). Production bo qua.
  const bot = new Bot(env.BOT_TOKEN, env.__client ? { client: env.__client } : undefined);
  const PACKS = packs(env);

  bot.command('start', (ctx) => ctx.reply(
    'MICU KEY SHOP\nMua key tu dong 24/7. Chuyen khoan theo QR la bot tu nha key.\nChon goi ben duoi:',
    { reply_markup: packKeyboard(PACKS) }));
  bot.command('menu', (ctx) => ctx.reply('Chon goi key:', { reply_markup: packKeyboard(PACKS) }));
  bot.callbackQuery('menu', (ctx) => ctx.editMessageText('Chon goi key:', { reply_markup: packKeyboard(PACKS) }));

  bot.callbackQuery(/buy_(.+)/, async (ctx) => {
    const pack = PACKS.find(p => p.id === ctx.match[1]);
    if (!pack) return ctx.answerCallbackQuery('Goi khong ton tai');
    const code = orderCode();
    await store.putOrder({
      code, packId: pack.id, label: pack.label, days: pack.days, price: pack.price,
      userId: ctx.from.id, username: ctx.from.username || '',
      status: 'pending', createdAt: Date.now()
    });
    await ctx.answerCallbackQuery();
    await ctx.replyWithPhoto(qrUrl(env.BANK_CODE, env.BANK_ACCOUNT, pack.price, code, env.ACCOUNT_NAME), {
      caption: `Don ${code}\nGoi: ${pack.label}\nTien: ${fmtVND(pack.price)}\n` +
        `Noi dung CK (bat buoc ghi dung): ${code}\n` +
        `Chuyen xong bot tu check 1-3 phut va nha key. Don huy sau ${ORDER_TTL_MIN} phut neu chua thanh toan.`,
      reply_markup: new InlineKeyboard().text('Huy don', `cancel_${code}`)
    });
  });

  bot.callbackQuery(/cancel_(.+)/, async (ctx) => {
    const o = await store.getOrder(ctx.match[1]);
    if (o && o.userId === ctx.from.id && o.status === 'pending') {
      o.status = 'cancelled'; await store.putOrder(o);
    }
    await ctx.answerCallbackQuery('Da huy don');
    try { await ctx.deleteMessage(); } catch {}
  });

  bot.callbackQuery('mykeys', async (ctx) => {
    const mine = await store.keysByUser(ctx.from.id);
    if (!mine.length) return ctx.answerCallbackQuery('M chua co key nao', true);
    await ctx.answerCallbackQuery();
    await ctx.reply(mine.map(k => `${k.key} (${k.label}, het han ${k.exp})`).join('\n'));
  });
  bot.callbackQuery('askcheck', (ctx) => {
    ctx.answerCallbackQuery();
    return ctx.reply('Gui key can check theo cu phap: /check MICU-XXXXX-XXXXX-XXXXX');
  });
  bot.command('check', async (ctx) => {
    const key = (ctx.message.text.split(/\s+/)[1] || '');
    const r = await verifyKey(env.SALT, key);
    await ctx.reply(r.ok ? `Key song. Het han ${r.expDate}.` : `Key loi: ${r.reason}.`);
  });

  bot.command('stats', async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return;
    const s = await store.stats();
    await ctx.reply(`Don paid: ${s.paid}\nDoanh thu: ${fmtVND(s.revenue)}\nKey da cap: ${s.keys}\nDon pending: ${s.pending}`);
  });
  bot.command('gen', async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return;
    const days = parseInt((ctx.message.text.split(/\s+/)[1] || '30'), 10);
    if (!days || days < 1) return ctx.reply('Cu phap: /gen <so_ngay>');
    const key = await issueKey(env.SALT, Math.min(days, 30000));
    const v = await verifyKey(env.SALT, key);
    await store.putKey({ key, label: `tay-${days}d`, exp: v.expDate, userId: ctx.from.id, order: 'manual', createdAt: Date.now() });
    await ctx.reply(`${key}\nHet han: ${v.expDate}`);
  });
  bot.command('don', async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return;
    const code = ((ctx.message.text.split(/\s+/)[1] || '').trim().toUpperCase());
    const r = await fulfillOrder(env, store, code, null);
    await ctx.reply(r.ok ? `Da duyet tay, key: ${r.key}` : `Loi: ${r.reason}`);
  });
  return bot;
}

// Dung chung cho SePay webhook va lenh /don. amount=null nghia la duyet tay (lay gia don).
async function fulfillOrder(env, store, code, amount) {
  const o = await store.getOrder(code);
  if (!o || o.status !== 'pending') return { ok: false, reason: 'order_not_found' };
  if (expired(o)) { o.status = 'expired'; await store.putOrder(o); return { ok: false, reason: 'order_expired' }; }
  const pay = amount === null ? o.price : Number(amount);
  if (pay < Number(o.price)) return { ok: false, reason: 'amount_low' };
  const key = await issueKey(env.SALT, o.days);
  const v = await verifyKey(env.SALT, key);
  if (!v.ok) return { ok: false, reason: 'gen_fail' };
  o.status = 'paid'; o.paidAt = Date.now(); o.paidAmount = pay;
  await store.putOrder(o);
  await store.putKey({ key, label: o.label, exp: v.expDate, userId: o.userId, order: code, createdAt: Date.now() });
  try {
    await tgSend(env, o.userId,
      `Thanh toan thanh cong don ${code}.\nKey ${o.label} cua m:\n${key}\nHet han: ${v.expDate}\nNhap key vao app de kich hoat.`);
  } catch (e) { console.error('send key fail', e.message); }
  return { ok: true, key };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // Khong co D1 (test local): dung 1 store chung cho moi request trong isolate
    const store = env.DB ? d1Store(env.DB) : MEM_FALLBACK;

    if (url.pathname === '/health') return Response.json({ ok: true, time: Date.now() });

    // Cai 1 lan tu trinh duyet dien thoai: /setup?s=WEBHOOK_SECRET -> tu set webhook Telegram
    if (url.pathname === '/setup') {
      if (url.searchParams.get('s') !== env.WEBHOOK_SECRET) return new Response('no', { status: 403 });
      const hook = url.origin + '/telegram/' + env.WEBHOOK_SECRET;
      const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: hook, drop_pending_updates: true })
      });
      return new Response('webhook -> ' + hook + '\n' + (await r.text()));
    }

    if (url.pathname === '/telegram/' + env.WEBHOOK_SECRET) {
      const bot = buildBot(env, store);
      return webhookCallback(bot, 'std/http')(req);
    }

    if (url.pathname === '/sepay-webhook' && req.method === 'POST') {
      try {
        if ((req.headers.get('authorization') || '') !== 'Apikey ' + (env.SEPAY_API_KEY || '')) {
          return Response.json({ success: false, message: 'unauthorized' }, { status: 401 });
        }
        const b = await req.json();
        const content = String(b.content || b.description || '');
        const amount = Number(b.transferAmount || 0);
        const m = content.toUpperCase().replace(/[^A-Z0-9]/g, ' ').match(/MU[A-Z0-9]{8}/);
        if (!m) return Response.json({ success: true, message: 'no_order_code' });
        const r = await fulfillOrder(env, store, m[0], amount);
        return Response.json({ success: true, ...r });
      } catch (e) {
        console.error('sepay hook err', e);
        return Response.json({ success: false });
      }
    }
    return new Response('not found', { status: 404 });
  }
};
export { buildBot, fulfillOrder };
const MEM_FALLBACK = memStore();
