// Bot ban key MNHUT VIP: 100% Giao dien Nut Bam (Inline Buttons), Duyet tien thu cong qua Telegram, Admin Panel truc quan de hieu.
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');
const {
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
} = require('./src/store');
const { issueKey, verifyKey, orderCode } = require('./src/keys');
const { qrUrl, fmtVND } = require('./src/vietqr');
const { isPayOSConfigured, genNumericOrderCode, createPayOSPayment } = require('./src/payos');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const SALT = process.env.SALT || 'S6JKQT3UTCYtHNSvKgHXwRXHaNc248HR';
const BANK = process.env.BANK_CODE || 'MB';
const ACC = process.env.BANK_ACCOUNT || '17363999999999';
const ACC_NAME = process.env.ACCOUNT_NAME || 'BUI MINH NHUT';
const ADMIN_IDS = (process.env.ADMIN_IDS || '5992662564').split(',').map(s => s.trim()).filter(Boolean);

let PACKS = [
  { id: '7d', label: 'Gói 7 Ngày', days: 7, price: 20000 },
  { id: '30d', label: 'Gói 30 Ngày', days: 30, price: 50000 },
  { id: 'vv', label: 'Gói Vĩnh Viễn', days: 30000, price: 199000 }
];
try {
  if (process.env.PACKS) PACKS = JSON.parse(process.env.PACKS);
} catch (e) {}

const bot = new Telegraf(BOT_TOKEN);
const isAdmin = (id) => ADMIN_IDS.includes(String(id));

// Helper: Gui thong bao den tat ca Admin
async function notifyAdmins(message) {
  for (const adminId of ADMIN_IDS) {
    try {
      await bot.telegram.sendMessage(adminId, message, { parse_mode: 'HTML' });
    } catch (e) {
      console.error(`Notify admin ${adminId} err:`, e.message);
    }
  }
}

// Helper: Gui thong bao den Admin kem ban phim nut bam (Inline Keyboard)
async function notifyAdminsWithKeyboard(message, keyboard) {
  for (const adminId of ADMIN_IDS) {
    try {
      await bot.telegram.sendMessage(adminId, message, {
        parse_mode: 'HTML',
        ...keyboard
      });
    } catch (e) {
      console.error(`Notify admin ${adminId} with keyboard err:`, e.message);
    }
  }
}

// Middleware: Kiem tra User Bi Ban & Che do bao tri
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const db = load();

  // 1. Kiem tra ban
  if (isUserBanned(db, ctx.from.id) && !isAdmin(ctx.from.id)) {
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('⛔ Tài khoản của bạn đã bị khóa bởi Admin!', true);
    }
    return ctx.replyWithHTML('⛔ <b>TÀI KHOẢN CỦA BẠN ĐÃ BỊ KHÓA!</b>\nVui lòng liên hệ Admin @mnhutdznecon để được giải quyết.');
  }

  // 2. Kiem tra bao tri
  const settings = getSettings(db);
  if (settings.maintenance && !isAdmin(ctx.from.id)) {
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('⚠️ Hệ thống đang bảo trì, vui lòng quay lại sau!', true);
    }
    return ctx.replyWithHTML('⚠️ <b>HỆ THỐNG ĐANG BẢO TRÌ!</b>\nBot đang được nâng cấp tính năng. Vui lòng quay lại sau ít phút hoặc liên hệ Admin @mnhutdznecon.');
  }

  return next();
});

// Helper: Header tin nhan voi so du & tong nap
function getHeader(ctx) {
  const db = load();
  const userId = ctx.from.id;
  const username = ctx.from.username || '';
  const name = ctx.from.first_name || (username ? '@' + username : 'Bạn');
  const u = getUser(db, userId, username);
  save(db);

  return (
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Xin chào, <b>${name}</b>!\n` +
    `🆔 ID: <code>${userId}</code>\n\n` +
    `💎 <b>Tổng nạp:</b> ${fmtVND(u.totalDeposit || 0)}\n` +
    `🏛️ <b>Số dư:</b> ${fmtVND(u.balance || 0)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Chào mừng bạn đến với hệ thống bán Key <b>MNHUT VIP</b> tự động 24/7!\n` +
    `Vui lòng chọn một trong các chức năng dưới đây:`
  );
}

// Menu chinh 100% nut bam
function mainMenuKeyboard(isAdminUser = false) {
  const rows = [
    [Markup.button.callback('🏪 Cửa hàng', 'shop'), Markup.button.callback('🔗 Vượt link lấy key', 'bypass_link')],
    [Markup.button.callback('💳 Nạp tiền', 'topup'), Markup.button.callback('👤 Tài khoản', 'profile')],
    [Markup.button.callback('📜 Lịch sử mua hàng', 'order_history'), Markup.button.callback('🎁 Nhập Giftcode', 'enter_giftcode')],
    [Markup.button.callback('🔍 Kiểm tra Key', 'check_key'), Markup.button.callback('🎮 Tải Hack MNHUT VIP', 'download_apk')],
    [Markup.button.url('👨‍💻 Hỗ trợ / Liên hệ', 'https://t.me/mnhutdznecon')]
  ];
  if (isAdminUser) {
    rows.push([Markup.button.callback('⚙️ PANEL QUẢN TRỊ ADMIN', 'admin_panel')]);
  }
  return Markup.inlineKeyboard(rows);
}

// 1. Lenh /start & /menu
bot.start((ctx) => ctx.replyWithHTML(getHeader(ctx), mainMenuKeyboard(isAdmin(ctx.from.id))));
bot.command('menu', (ctx) => ctx.replyWithHTML(getHeader(ctx), mainMenuKeyboard(isAdmin(ctx.from.id))));
bot.action('back_menu', (ctx) => {
  ctx.answerCbQuery();
  return ctx.editMessageText(getHeader(ctx), {
    parse_mode: 'HTML',
    ...mainMenuKeyboard(isAdmin(ctx.from.id))
  });
});

// 2. Chuc nang: Cua hang (shop)
bot.action('shop', (ctx) => {
  ctx.answerCbQuery();
  const rows = PACKS.map(p => [Markup.button.callback(`🛒 ${p.label} — ${fmtVND(p.price)}`, `view_pack_${p.id}`)]);
  rows.push([Markup.button.callback('« Quay lại Menu', 'back_menu')]);

  ctx.editMessageText(
    `🏪 <b>CỬA HÀNG KEY MNHUT VIP</b>\n\n` +
    `Vui lòng chọn gói key bạn muốn mua:\n` +
    `• <b>Gói 7 ngày:</b> 20.000đ\n` +
    `• <b>Gói 30 ngày:</b> 50.000đ (Khuyên dùng)\n` +
    `• <b>Gói Vĩnh viễn:</b> 199.000đ\n\n` +
    `<i>Bạn có thể thanh toán bằng Số dư ví hoặc Quét mã VietQR chuyển khoản tự động.</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
  );
});

// Xem chi tiet 1 goi key
bot.action(/view_pack_(.+)/, (ctx) => {
  const packId = ctx.match[1];
  const pack = PACKS.find(p => p.id === packId);
  if (!pack) return ctx.answerCbQuery('Gói không tồn tại');
  ctx.answerCbQuery();

  const db = load();
  const u = getUser(db, ctx.from.id, ctx.from.username);
  const rows = [];

  if ((u.balance || 0) >= pack.price) {
    rows.push([Markup.button.callback(`⚡ Mua ngay bằng số dư (${fmtVND(pack.price)})`, `buy_balance_${pack.id}`)]);
  } else {
    rows.push([Markup.button.callback(`💳 Nạp thêm tiền (Thiếu ${fmtVND(pack.price - (u.balance || 0))})`, 'topup')]);
  }
  rows.push([Markup.button.callback('📱 Quét mã VietQR thanh toán', `buy_qr_${pack.id}`)]);
  rows.push([Markup.button.callback('« Quay lại Cửa hàng', 'shop')]);

  ctx.editMessageText(
    `📦 <b>THÔNG TIN GÓI: ${pack.label.toUpperCase()}</b>\n\n` +
    `• <b>Thời hạn:</b> ${pack.days >= 30000 ? 'Vĩnh viễn' : pack.days + ' ngày'}\n` +
    `• <b>Giá bán:</b> ${fmtVND(pack.price)}\n` +
    `• <b>Số dư hiện tại của bạn:</b> ${fmtVND(u.balance || 0)}\n\n` +
    `Chọn phương thức thanh toán bên dưới:`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
  );
});

// Mua bang so du vi (Tu dong cap ngay lap tuc)
bot.action(/buy_balance_(.+)/, async (ctx) => {
  const packId = ctx.match[1];
  const pack = PACKS.find(p => p.id === packId);
  if (!pack) return ctx.answerCbQuery('Gói không tồn tại');

  const db = load();
  if (!deductBalance(db, ctx.from.id, pack.price)) {
    return ctx.answerCbQuery('Số dư không đủ! Vui lòng nạp thêm tiền.', true);
  }

  const key = issueKey(SALT, pack.days);
  const v = verifyKey(SALT, key);
  db.keys.push({
    key, label: pack.label, exp: v.expDate,
    userId: ctx.from.id, username: ctx.from.username || '',
    order: 'balance_' + Date.now(), createdAt: Date.now()
  });
  save(db);

  await ctx.answerCbQuery('Mua key thành công!');
  await ctx.editMessageText(
    `🎉 <b>MUA KEY THÀNH CÔNG!</b>\n\n` +
    `• <b>Gói:</b> ${pack.label}\n` +
    `• <b>Mã Key của bạn:</b>\n<code>${key}</code>\n\n` +
    `• <b>Hạn dùng đến:</b> ${v.expDate}\n` +
    `• <b>Số dư còn lại:</b> ${fmtVND(getUser(db, ctx.from.id).balance)}\n\n` +
    `<i>Hướng dẫn: Copy key ở trên, dán vào file <code>mnhut_key.txt</code> trong máy để kích hoạt menu game.</i>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Về Menu chính', 'back_menu')]]) }
  );

  // Thong bao Admin
  await notifyAdmins(
    `🔔 <b>[ĐƠN HÀNG MỚI BẰNG VÍ - MNHUT VIP]</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Khách hàng:</b> ${ctx.from.first_name || ''} (${ctx.from.username ? '@' + ctx.from.username : 'No user'})\n` +
    `• <b>ID Telegram:</b> <code>${ctx.from.id}</code>\n` +
    `• <b>Hình thức:</b> ⚡ Mua bằng số dư ví\n` +
    `• <b>Gói key:</b> <b>${pack.label}</b> (${fmtVND(pack.price)})\n` +
    `• <b>Mã Key đã cấp:</b>\n<code>${key}</code>\n` +
    `• <b>Hạn dùng:</b> ${v.expDate}\n` +
    `• <b>Số dư còn:</b> ${fmtVND(getUser(db, ctx.from.id).balance)}`
  );
});

// Mua bang VietQR truc tiep (Co Nut Duyet Thu Cong Cho Admin)
bot.action(/buy_qr_(.+)/, async (ctx) => {
  const packId = ctx.match[1];
  const pack = PACKS.find(p => p.id === packId);
  if (!pack) return ctx.answerCbQuery('Gói không tồn tại');

  const db = load();
  const code = orderCode();
  const payosOrderCode = genNumericOrderCode();

  db.orders.push({
    code,
    payosOrderCode,
    packId: pack.id,
    label: pack.label,
    days: pack.days,
    price: pack.price,
    userId: ctx.from.id,
    username: ctx.from.username || '',
    status: 'pending',
    createdAt: Date.now()
  });
  save(db);
  await ctx.answerCbQuery();

  // Gui thong bao kem NUT DUYET THU CONG cho Admin
  await notifyAdminsWithKeyboard(
    `🔔 <b>YÊU CẦU MUA KEY MỚI CẦN DUYỆT!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Khách hàng:</b> ${ctx.from.first_name || ''} (${ctx.from.username ? '@' + ctx.from.username : 'Chưa đặt user'})\n` +
    `• <b>ID Telegram:</b> <code>${ctx.from.id}</code>\n` +
    `• <b>Gói key:</b> <b>${pack.label}</b>\n` +
    `• <b>Số tiền cần nhận:</b> <b>${fmtVND(pack.price)}</b>\n` +
    `• <b>Nội dung CK:</b> <code>${code}</code>\n` +
    `• <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>👉 Kiểm tra app ngân hàng nổ tiền, bấm nút bên dưới để cấp key ngay cho khách:</i>`,
    Markup.inlineKeyboard([
      [Markup.button.callback(`✅ DUYỆT & CẤP KEY (${fmtVND(pack.price)})`, `appr_order_${code}`)],
      [Markup.button.callback('❌ TỪ CHỐI ĐƠN', `rej_order_${code}`)]
    ])
  );

  // Gui ma QR cho khach chuyen khoan
  await ctx.replyWithPhoto(qrUrl(BANK, ACC, pack.price, code, ACC_NAME), {
    caption:
      `🧾 <b>ĐƠN HÀNG: ${code}</b>\n` +
      `• Gói: <b>${pack.label}</b>\n` +
      `• Số tiền: <b>${fmtVND(pack.price)}</b>\n` +
      `• Ngân hàng: <b>${BANK}</b>\n` +
      `• Số tài khoản: <code>${ACC}</code>\n` +
      `• Chủ tài khoản: <b>${ACC_NAME}</b>\n` +
      `• Nội dung CK (bắt buộc đúng): <code>${code}</code>\n\n` +
      `<i>Vui lòng quét mã QR hoặc chuyển khoản chính xác nội dung trên. Admin sẽ kiểm tra và duyệt cấp key cho bạn trong 1-3 phút!</i>`,
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('❌ Hủy đơn', `cancel_${code}`)],
      [Markup.button.callback('« Về Menu chính', 'back_menu')]
    ])
  });
});

// Huy don hang / yeu cau nap tien
bot.action(/cancel_(.+)/, async (ctx) => {
  const db = load();
  const target = ctx.match[1];
  const o = db.orders.find(x => (x.code === target || String(x.payosOrderCode) === target) && x.userId === ctx.from.id);
  if (o && o.status === 'pending') { o.status = 'cancelled'; save(db); }
  const t = (db.topups || []).find(x => (x.code === target || String(x.payosOrderCode) === target) && x.userId === ctx.from.id);
  if (t && t.status === 'pending') { t.status = 'cancelled'; save(db); }
  await ctx.answerCbQuery('Đã hủy giao dịch');
  try { await ctx.deleteMessage(); } catch (e) {}
});

// 3. Chuc nang: Nap tien vao vi (Co Nut Duyet Thu Cong Cho Admin)
bot.action('topup', (ctx) => {
  ctx.answerCbQuery();
  const amounts = [20000, 50000, 100000, 200000];
  const rows = amounts.map(amt => [Markup.button.callback(`💵 Nạp ${fmtVND(amt)}`, `topup_amt_${amt}`)]);
  rows.push([Markup.button.callback('« Quay lại Menu', 'back_menu')]);

  ctx.editMessageText(
    `💳 <b>NẠP TIỀN VÀO TÀI KHOẢN BOT</b>\n\n` +
    `Chọn mệnh giá bạn muốn nạp vào ví:\n` +
    `• Tiền nạp sẽ được cộng tự động vào <b>Số dư ví</b> ngay sau khi Admin duyệt đơn.\n` +
    `• Dùng số dư để mua key bất kỳ lúc nào với 1 cú click!`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
  );
});

bot.action(/topup_amt_(\d+)/, async (ctx) => {
  const amount = parseInt(ctx.match[1], 10);
  const userId = ctx.from.id;
  const rand4 = Math.floor(1000 + Math.random() * 9000);
  const code = `NAP${userId}${rand4}`;
  const payosOrderCode = genNumericOrderCode();

  const db = load();
  if (!db.topups) db.topups = [];
  db.topups.push({
    code,
    payosOrderCode,
    amount,
    userId,
    username: ctx.from.username || '',
    status: 'pending',
    createdAt: Date.now()
  });
  save(db);
  await ctx.answerCbQuery();

  // Bắn thông báo kèm NÚT DUYỆT THỦ CÔNG cho Admin
  await notifyAdminsWithKeyboard(
    `🔔 <b>YÊU CẦU NẠP TIỀN VÍ CẦN DUYỆT!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Khách hàng:</b> ${ctx.from.first_name || ''} (${ctx.from.username ? '@' + ctx.from.username : 'Chưa đặt user'})\n` +
    `• <b>ID Telegram:</b> <code>${ctx.from.id}</code>\n` +
    `• <b>Số tiền nạp:</b> <b>${fmtVND(amount)}</b>\n` +
    `• <b>Nội dung CK:</b> <code>${code}</code>\n` +
    `• <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>👉 Kiểm tra tài khoản ngân hàng nổ tiền, bấm nút bên dưới để cộng tiền vào ví khách:</i>`,
    Markup.inlineKeyboard([
      [Markup.button.callback(`✅ DUYỆT NẠP ${fmtVND(amount)}`, `appr_topup_${code}`)],
      [Markup.button.callback('❌ TỪ CHỐI YÊU CẦU', `rej_topup_${code}`)]
    ])
  );

  // Gui ma QR cho khach chuyen khoan
  await ctx.replyWithPhoto(qrUrl(BANK, ACC, amount, code, ACC_NAME), {
    caption:
      `💳 <b>YÊU CẦU NẠP TIỀN: ${code}</b>\n\n` +
      `• Số tiền nạp: <b>${fmtVND(amount)}</b>\n` +
      `• Ngân hàng: <b>${BANK}</b>\n` +
      `• Số tài khoản: <code>${ACC}</code>\n` +
      `• Chủ tài khoản: <b>${ACC_NAME}</b>\n` +
      `• Nội dung CK (bắt buộc đúng): <code>${code}</code>\n\n` +
      `<i>Quét mã QR để chuyển khoản chính xác nội dung. Admin sẽ duyệt và cộng tiền vào ví của bạn ngay sau 1-3 phút!</i>`,
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('❌ Hủy yêu cầu', `cancel_${code}`)],
      [Markup.button.callback('« Về Menu chính', 'back_menu')]
    ])
  });
});

// ==========================================
// CÁC ACTION DUYỆT TIỀN THỦ CÔNG CỦA ADMIN
// ==========================================

// Duyet nap tien vi
bot.action(/appr_topup_(.+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const code = ctx.match[1];
  const db = load();
  const t = (db.topups || []).find(x => x.code === code);
  if (!t) return ctx.answerCbQuery('Không tìm thấy yêu cầu này!', true);
  if (t.status === 'paid') return ctx.answerCbQuery('Yêu cầu này đã được duyệt trước đó rồi!', true);
  if (t.status === 'cancelled') return ctx.answerCbQuery('Yêu cầu này đã bị khách hủy!', true);

  const res = await fulfillOrder(code, t.amount);
  ctx.answerCbQuery('Đã duyệt nạp tiền thành công!');
  return ctx.editMessageText(
    `✅ <b>ĐÃ DUYỆT NẠP TIỀN THÀNH CÔNG!</b>\n\n` +
    `• <b>Mã giao dịch:</b> <code>${code}</code>\n` +
    `• <b>Khách hàng:</b> <code>${t.userId}</code> (${t.username ? '@' + t.username : ''})\n` +
    `• <b>Số tiền nạp:</b> <b>${fmtVND(t.amount)}</b>\n` +
    `• <b>Người duyệt:</b> @${ctx.from.username || 'Admin'}\n` +
    `• <b>Thời gian duyệt:</b> ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\n\n` +
    `<i>Tiền đã được cộng vào ví khách và bot đã gửi thông báo chúc mừng cho khách.</i>`,
    { parse_mode: 'HTML' }
  );
});

// Tu choi nap tien vi
bot.action(/rej_topup_(.+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const code = ctx.match[1];
  const db = load();
  const t = (db.topups || []).find(x => x.code === code);
  if (!t) return ctx.answerCbQuery('Không tìm thấy yêu cầu!');
  if (t.status !== 'pending') return ctx.answerCbQuery('Đơn này không ở trạng thái chờ duyệt!');

  t.status = 'rejected';
  save(db);
  ctx.answerCbQuery('Đã từ chối đơn!');

  try {
    bot.telegram.sendMessage(t.userId,
      `❌ <b>YÊU CẦU NẠP TIỀN BỊ TỪ CHỐI</b>\n\n` +
      `• Mã giao dịch: <code>${code}</code>\n` +
      `• Số tiền: <b>${fmtVND(t.amount)}</b>\n\n` +
      `<i>Lý do: Chưa nhận được tiền chuyển khoản hoặc sai nội dung chuyển khoản. Vui lòng liên hệ Admin @mnhutdznecon nếu bạn đã chuyển thành công.</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}

  return ctx.editMessageText(
    `❌ <b>ĐÃ TỪ CHỐI YÊU CẦU NẠP TIỀN:</b> <code>${code}</code>.`,
    { parse_mode: 'HTML' }
  );
});

// Duyet don mua key truc tiep
bot.action(/appr_order_(.+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const code = ctx.match[1];
  const db = load();
  const o = (db.orders || []).find(x => x.code === code);
  if (!o) return ctx.answerCbQuery('Không tìm thấy đơn hàng!', true);
  if (o.status === 'paid') return ctx.answerCbQuery('Đơn hàng này đã được duyệt trước đó!', true);
  if (o.status === 'cancelled') return ctx.answerCbQuery('Đơn hàng này đã bị hủy!', true);

  const res = await fulfillOrder(code, o.price);
  ctx.answerCbQuery('Đã duyệt đơn và cấp key thành công!');
  return ctx.editMessageText(
    `✅ <b>ĐÃ DUYỆT & CẤP KEY THÀNH CÔNG!</b>\n\n` +
    `• <b>Mã đơn hàng:</b> <code>${code}</code>\n` +
    `• <b>Khách hàng:</b> <code>${o.userId}</code> (${o.username ? '@' + o.username : ''})\n` +
    `• <b>Gói key:</b> <b>${o.label}</b> (${fmtVND(o.price)})\n` +
    `• <b>Mã key đã cấp:</b> <code>${res.key}</code>\n` +
    `• <b>Người duyệt:</b> @${ctx.from.username || 'Admin'}\n` +
    `• <b>Thời gian duyệt:</b> ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\n\n` +
    `<i>Key đã được gửi trực tiếp vào tin nhắn Telegram của khách.</i>`,
    { parse_mode: 'HTML' }
  );
});

// Tu choi don mua key
bot.action(/rej_order_(.+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const code = ctx.match[1];
  const db = load();
  const o = (db.orders || []).find(x => x.code === code);
  if (!o) return ctx.answerCbQuery('Không tìm thấy đơn hàng!');
  if (o.status !== 'pending') return ctx.answerCbQuery('Đơn này không ở trạng thái chờ duyệt!');

  o.status = 'rejected';
  save(db);
  ctx.answerCbQuery('Đã từ chối đơn hàng!');

  try {
    bot.telegram.sendMessage(o.userId,
      `❌ <b>ĐƠN HÀNG BỊ TỪ CHỐI</b>\n\n` +
      `• Mã đơn: <code>${code}</code>\n` +
      `• Gói key: <b>${o.label}</b>\n\n` +
      `<i>Lý do: Chưa nhận được tiền chuyển khoản hoặc sai nội dung. Vui lòng liên hệ Admin @mnhutdznecon nếu bạn đã chuyển thành công.</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}

  return ctx.editMessageText(
    `❌ <b>ĐÃ TỪ CHỐI ĐƠN HÀNG:</b> <code>${code}</code>.`,
    { parse_mode: 'HTML' }
  );
});

// 4. Chuc nang: Tai khoan (profile)
bot.action('profile', (ctx) => {
  ctx.answerCbQuery();
  const db = load();
  const userId = ctx.from.id;
  const u = getUser(db, userId, ctx.from.username);
  const mine = (db.keys || []).filter(k => k.userId === userId).slice(-5);

  let keyText = '<i>Chưa có key nào.</i>';
  if (mine.length > 0) {
    keyText = mine.map(k => `• <code>${k.key}</code>\n  ↳ ${k.label} (Hạn: ${k.exp})`).join('\n');
  }

  ctx.editMessageText(
    `👤 <b>THÔNG TIN TÀI KHOẢN</b>\n\n` +
    `• <b>Tên:</b> ${ctx.from.first_name || ''}\n` +
    `• <b>Username:</b> ${ctx.from.username ? '@' + ctx.from.username : 'Chưa đặt'}\n` +
    `• <b>ID Telegram:</b> <code>${userId}</code>\n` +
    `• <b>Số dư ví:</b> <code>${fmtVND(u.balance || 0)}</code>\n` +
    `• <b>Tổng nạp:</b> <code>${fmtVND(u.totalDeposit || 0)}</code>\n\n` +
    `🔑 <b>Key gần nhất:</b>\n${keyText}`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('💳 Nạp thêm tiền', 'topup'), Markup.button.callback('📜 Toàn bộ lịch sử', 'order_history')],
        [Markup.button.callback('« Quay lại Menu', 'back_menu')]
      ])
    }
  );
});

// 5. Chuc nang: Lich su mua hang (order_history)
bot.action('order_history', (ctx) => {
  ctx.answerCbQuery();
  const db = load();
  const userId = ctx.from.id;
  const myKeys = (db.keys || []).filter(k => k.userId === userId).reverse();

  if (myKeys.length === 0) {
    return ctx.editMessageText(
      `📜 <b>LỊCH SỬ MUA HÀNG CỦA BẠN</b>\n\n` +
      `<i>Bạn chưa mua key nào trên hệ thống.</i>\n\n` +
      `Hãy vào mục <b>🏪 Cửa hàng</b> để chọn gói key phù hợp nhé!`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🏪 Đến Cửa hàng', 'shop')],
          [Markup.button.callback('« Quay lại Menu', 'back_menu')]
        ])
      }
    );
  }

  const list = myKeys.slice(0, 10).map((k, idx) => {
    const isExp = k.exp && new Date(k.exp).getTime() < Date.now();
    const statusBadge = isExp ? '❌ Hết hạn' : '✅ Còn hạn';
    return (
      `<b>${idx + 1}. ${k.label}</b> (${statusBadge})\n` +
      `• Mã Key: <code>${k.key}</code>\n` +
      `• Hạn dùng: <b>${k.exp || 'Không rõ'}</b>\n` +
      `• Thiết bị: ${k.devId && k.devId !== 'all' ? `<code>${k.devId}</code>` : 'Tự do'}`
    );
  }).join('\n━━━━━━━━━━━━━━━━━━━━\n');

  return ctx.editMessageText(
    `📜 <b>LỊCH SỬ MUA HÀNG CỦA BẠN</b>\n` +
    `<i>(Chạm vào mã Key bên dưới để tự động copy)</i>\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${list}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Tổng cộng: ${myKeys.length} key đã mua.</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🏪 Mua thêm key', 'shop')],
        [Markup.button.callback('« Quay lại Menu', 'back_menu')]
      ])
    }
  );
});

// 6. Chuc nang: Nhap giftcode (enter_giftcode)
bot.action('enter_giftcode', (ctx) => {
  ctx.answerCbQuery();
  const db = load();
  const activeCodes = (db.giftcodes || []).filter(c => c.usedCount < c.maxUses && !(c.usedBy || []).includes(String(ctx.from.id)));

  const rows = [];
  if (activeCodes.length > 0) {
    activeCodes.slice(0, 3).forEach(c => {
      rows.push([Markup.button.callback(`🎁 Nhận ngay Code ${c.code} (+${fmtVND(c.value)})`, `claim_code_${c.code}`)]);
    });
  }
  rows.push([Markup.button.callback('« Quay lại Menu', 'back_menu')]);

  ctx.editMessageText(
    `🎁 <b>NHẬP MÃ GIFTCODE / KHUYẾN MÃI</b>\n\n` +
    `Nếu bạn có mã Giftcode từ Admin hoặc từ sự kiện:\n` +
    `• Bấm vào các nút nhận nhanh bên dưới (nếu có).\n` +
    `• Hoặc <b>chỉ cần gửi thẳng mã Giftcode vào khung chat</b>, bot sẽ tự nhận diện và cộng tiền ví ngay lập tức!`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

bot.action(/claim_code_(.+)/, (ctx) => {
  const code = ctx.match[1];
  const db = load();
  const res = redeemGiftcode(db, ctx.from.id, code);
  if (!res.ok) {
    let msg = 'Mã code không tồn tại hoặc đã hết lượt!';
    if (res.reason === 'already_used') msg = 'Bạn đã dùng mã này rồi!';
    return ctx.answerCbQuery(msg, true);
  }
  save(db);
  const u = getUser(db, ctx.from.id);
  ctx.answerCbQuery('Nhận thưởng thành công!');
  return ctx.editMessageText(
    `🎉 <b>KÍCH HOẠT GIFTCODE THÀNH CÔNG!</b>\n\n` +
    `• Mã: <code>${res.giftcode.code}</code>\n` +
    `• Tiền thưởng cộng ví: <b>+${fmtVND(res.rewardAmount)}</b>\n` +
    `• Số dư hiện tại của bạn: <b>${fmtVND(u.balance)}</b>\n\n` +
    `<i>Dùng số dư để mua key ngay tại mục Cửa hàng!</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🏪 Đến Cửa hàng', 'shop')], [Markup.button.callback('« Về Menu chính', 'back_menu')]])
    }
  );
});

// 7. Chuc nang: Vuot link lay key free (bypass_link)
bot.action('bypass_link', (ctx) => {
  ctx.answerCbQuery();
  ctx.editMessageText(
    `🔗 <b>VƯỢT LINK LẤY KEY MIỄN PHÍ HÀNG NGÀY</b>\n\n` +
    `• Key miễn phí có hạn dùng trong ngày và <b>tự động reset vào đúng 12h đêm (00:00)</b> mỗi ngày.\n` +
    `• <b>Quy trình nhận key:</b> Vượt link quảng cáo để nhận mã mở khóa 24h.\n\n` +
    `⚠️ <i>Hệ thống cổng vượt link đang được kết nối API. Trong thời gian này, bạn có thể mua key VIP giá rẻ chỉ từ 20k tại Cửa hàng hoặc nhắn Admin để nhận key trải nghiệm!</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🏪 Đến Cửa hàng', 'shop')],
        [Markup.button.callback('« Quay lại Menu', 'back_menu')]
      ])
    }
  );
});

// 8. Chuc nang: Kiem tra / Reset key (check_key)
bot.action('check_key', (ctx) => {
  ctx.answerCbQuery();
  const db = load();
  const userId = ctx.from.id;
  const myKeys = (db.keys || []).filter(k => k.userId === userId).slice(-5);

  const rows = [];
  if (myKeys.length > 0) {
    myKeys.forEach(k => {
      rows.push([Markup.button.callback(`🔍 Kiểm tra: ${k.label} (${k.exp})`, `chk_key_${k.key.slice(6, 11)}`)]);
    });
  }
  rows.push([Markup.button.url('👨‍💻 Nhắn Admin đổi máy', 'https://t.me/mnhutdznecon')]);
  rows.push([Markup.button.callback('« Quay lại Menu', 'back_menu')]);

  ctx.editMessageText(
    `🔍 <b>KIỂM TRA & RESET THIẾT BỊ KEY</b>\n\n` +
    `• Bấm vào các nút key của bạn bên dưới để xem tình trạng trực tiếp.\n` +
    `• Hoặc chỉ cần <b>gửi mã key vào tin nhắn chat</b>, bot sẽ tự kiểm tra hạn dùng và loại key cho bạn!\n\n` +
    `• <b>Đổi điện thoại / Reset thiết bị:</b>\n` +
    `Nếu bạn đổi máy mới và cần reset key, bấm nút Nhắn Admin bên dưới để được unbind trong 1 nốt nhạc!`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

bot.action(/chk_key_(.+)/, (ctx) => {
  const shortPart = ctx.match[1];
  const db = load();
  const k = (db.keys || []).find(x => x.key && x.key.includes(shortPart));
  if (!k) return ctx.answerCbQuery('Không tìm thấy key');
  ctx.answerCbQuery();

  const r = verifyKey(SALT, k.key);
  const isExp = k.exp && new Date(k.exp).getTime() < Date.now();
  ctx.editMessageText(
    `🔍 <b>THÔNG TIN CHI TIẾT KEY:</b>\n\n` +
    `• <b>Mã Key:</b> <code>${k.key}</code>\n` +
    `• <b>Gói:</b> ${k.label}\n` +
    `• <b>Hạn dùng:</b> <b>${k.exp}</b> (${isExp ? '❌ Đã hết hạn' : '✅ Đang hoạt động'})\n` +
    `• <b>Loại key:</b> ${k.devId && k.devId !== 'all' ? `Khóa máy (<code>${k.devId}</code>)` : 'Key tự do'}\n` +
    `• <b>Trạng thái:</b> ${r.ok ? '🟢 Hợp lệ trên hệ thống' : '🔴 Lỗi: ' + r.reason}`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('« Quay lại Kiểm tra Key', 'check_key')],
        [Markup.button.callback('« Về Menu chính', 'back_menu')]
      ])
    }
  );
});

// 9. Chuc nang: Tai file hack (download_apk)
bot.action('download_apk', async (ctx) => {
  ctx.answerCbQuery();
  const db = load();
  const settings = getSettings(db);
  const apkPath = path.join(__dirname, '..', 'mnhutv3.6.apk');

  const caption =
    `🎮 <b>BẢN MOD PLAY TOGETHER (mnhutv3.6.apk)</b>\n\n` +
    `✓ Đã tích hợp Anti-Cheat v3 & Menu Hack MNHUT VIP.\n` +
    `✓ Tự động nhận diện key, hiển thị hạn dùng và thông tin máy.\n\n` +
    `📋 <b>HƯỚNG DẪN DÁN KEY:</b>\n` +
    `1. Cài đặt file APK vào máy.\n` +
    `2. Dùng app quản lý file tạo file tên <code>mnhut_key.txt</code>.\n` +
    `3. Dán 1 dòng mã Key của bạn vào và lưu tại:\n` +
    `<code>/sdcard/Android/data/com.waxmoon.ma.gp/files/mnhut_key.txt</code>\n` +
    `(Hoặc dán vào <code>/sdcard/mnhut_key.txt</code>).\n` +
    `4. Mở lại game là menu VIP tự động kích hoạt!`;

  // Neu co link tai ngoai
  if (settings.downloadUrl) {
    return ctx.replyWithHTML(
      caption + `\n\n🔗 <b>LINK TẢI FILE:</b>\n👉 <a href="${settings.downloadUrl}">${settings.downloadUrl}</a>`,
      Markup.inlineKeyboard([
        [Markup.button.url('⚡ Tải ngay tại đây', settings.downloadUrl)],
        [Markup.button.callback('« Quay lại Menu', 'back_menu')]
      ])
    );
  }

  // Gui file truc tiep
  if (fs.existsSync(apkPath)) {
    await ctx.replyWithDocument({ source: apkPath, filename: 'mnhutv3.6.apk' }, {
      caption,
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Quay lại Menu', 'back_menu')]])
    });
  } else {
    await ctx.replyWithHTML(
      caption + `\n\n<i>File đang được cập nhật ở máy chủ. Vui lòng liên hệ Admin @mnhutdznecon!</i>`,
      Markup.inlineKeyboard([[Markup.button.callback('« Quay lại Menu', 'back_menu')]])
    );
  }
});

// ==========================================
// 10. ADMIN PANEL: 100% NÚT BẤM & HƯỚNG DẪN DỄ HIỂU
// ==========================================

function getAdminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⏳ Đơn Chờ Duyệt Tiền', 'adm_pending_orders')],
    [Markup.button.callback('🔑 Quản lý Key', 'adm_keys'), Markup.button.callback('👤 Quản lý User', 'adm_users')],
    [Markup.button.callback('🎁 Quản lý Giftcode', 'adm_giftcodes'), Markup.button.callback('⚙️ Cài đặt hệ thống', 'adm_settings')],
    [Markup.button.callback('📊 Thống kê doanh thu', 'adm_stats'), Markup.button.callback('« Thoát về Menu', 'back_menu')]
  ]);
}

bot.action('admin_panel', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Bạn không phải Admin!', true);
  ctx.answerCbQuery();
  const db = load();
  const settings = getSettings(db);
  const pendingCount = (db.topups || []).filter(t => t.status === 'pending').length + (db.orders || []).filter(o => o.status === 'pending').length;

  ctx.editMessageText(
    `⚙️ <b>BẢNG ĐIỀU KHIỂN QUẢN TRỊ (ADMIN PANEL)</b>\n` +
    `👑 Chào mừng Sếp @${ctx.from.username || 'Admin'}!\n\n` +
    `📌 <b>HƯỚNG DẪN DÙNG NHANH CÁC NÚT BÊN DƯỚI:</b>\n` +
    `• <b>⏳ Đơn Chờ Duyệt Tiền (${pendingCount}):</b> Bấm để xem khách vừa chuyển khoản và bấm 1 nút Duyệt cộng tiền/cấp key.\n` +
    `• <b>🔑 Quản lý Key:</b> Bấm tạo key mới (1d/7d/30d/vv), xóa key, gia hạn ngày hoặc reset máy cho khách.\n` +
    `• <b>👤 Quản lý User:</b> Xem số dư khách, bấm cộng tiền ví hoặc cấm user phá hoại.\n` +
    `• <b>🎁 Quản lý Giftcode:</b> Tạo mã quà tặng nạp tiền (10k, 20k...) phát cho khách.\n` +
    `• <b>⚙️ Cài đặt hệ thống:</b> Bật/tắt bảo trì bot, đổi link tải game, gửi tin nhắn toàn server.\n\n` +
    `Bấm chọn danh mục quản lý bằng nút bên dưới:`,
    { parse_mode: 'HTML', ...getAdminPanelKeyboard() }
  );
});

bot.command('admin', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('Lệnh này chỉ dành cho Admin.');
  const db = load();
  const settings = getSettings(db);
  const pendingCount = (db.topups || []).filter(t => t.status === 'pending').length + (db.orders || []).filter(o => o.status === 'pending').length;

  ctx.replyWithHTML(
    `⚙️ <b>BẢNG ĐIỀU KHIỂN QUẢN TRỊ (ADMIN PANEL)</b>\n` +
    `👑 Chào mừng Sếp @${ctx.from.username || 'Admin'}!\n\n` +
    `📌 <b>HƯỚNG DẪN DÙNG NHANH:</b>\n` +
    `• <b>⏳ Đơn Chờ Duyệt:</b> Có <b>${pendingCount}</b> đơn đang chờ bạn duyệt nạp tiền.\n` +
    `• Toàn bộ chức năng bên dưới đều bấm nút 1-click, không cần gõ lệnh!\n\n` +
    `Bấm chọn danh mục bên dưới:`,
    getAdminPanelKeyboard()
  );
});

// 10.1 Danh Sách Đơn Chờ Duyệt (Pending Approvals)
bot.action('adm_pending_orders', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  const db = load();
  const pendTopups = (db.topups || []).filter(t => t.status === 'pending').reverse();
  const pendOrders = (db.orders || []).filter(o => o.status === 'pending').reverse();

  if (pendTopups.length === 0 && pendOrders.length === 0) {
    return ctx.editMessageText(
      `⏳ <b>DANH SÁCH ĐƠN CHỜ DUYỆT</b>\n\n` +
      `🟢 <b>Hiện tại không có đơn nào đang chờ duyệt!</b>\n` +
      `Tất cả giao dịch chuyển khoản đã được xử lý xong xuôi.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« Quay lại Admin Panel', 'admin_panel')]])
      }
    );
  }

  const rows = [];
  // Danh sach nap tien
  pendTopups.slice(0, 5).forEach(t => {
    rows.push([
      Markup.button.callback(`✅ Duyệt Nạp: ${t.code} (${fmtVND(t.amount)})`, `appr_topup_${t.code}`),
      Markup.button.callback(`❌ Hủy`, `rej_topup_${t.code}`)
    ]);
  });
  // Danh sach mua key
  pendOrders.slice(0, 5).forEach(o => {
    rows.push([
      Markup.button.callback(`✅ Duyệt Key: ${o.code} (${fmtVND(o.price)})`, `appr_order_${o.code}`),
      Markup.button.callback(`❌ Hủy`, `rej_order_${o.code}`)
    ]);
  });
  rows.push([Markup.button.callback('« Quay lại Admin Panel', 'admin_panel')]);

  return ctx.editMessageText(
    `⏳ <b>DANH SÁCH ĐƠN CHỜ DUYỆT TIỀN</b>\n\n` +
    `• Yêu cầu nạp ví chờ duyệt: <b>${pendTopups.length}</b> đơn\n` +
    `• Yêu cầu mua key chờ duyệt: <b>${pendOrders.length}</b> đơn\n\n` +
    `<i>Bấm vào nút ✅ của đơn tương ứng để duyệt tiền hoặc cấp key ngay lập tức:</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

// 10.2 Quản lý Key: Hướng Dẫn & Nút Bấm Trực Quan
bot.action('adm_keys', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  ctx.editMessageText(
    `🔑 <b>QUẢN LÝ KEY (KEY MANAGER)</b>\n\n` +
    `📖 <b>Giải thích chi tiết các nút:</b>\n` +
    `• <b>➕ Tạo Key Nhanh:</b> Bấm chọn 1d/7d/30d/vv -> Sinh key ngay lập tức cho bạn copy.\n` +
    `• <b>🔓 Reset HWID:</b> Khi khách đổi điện thoại và báo sai mã máy, bấm nút này để mở khóa key về tự do cho khách gắn máy mới.\n` +
    `• <b>⏳ Gia Hạn Key:</b> Bấm để cộng thêm 30 ngày sử dụng cho khách.\n` +
    `• <b>🗑️ Xóa Key:</b> Xóa vĩnh viễn key khỏi hệ thống.\n\n` +
    `Bấm chọn thao tác bên dưới:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Tạo Key Nhanh (1-Click)', 'adm_key_gen_menu')],
        [Markup.button.callback('🔓 Reset / Unbind HWID Key', 'adm_key_unbind_menu'), Markup.button.callback('⏳ Gia Hạn Key (+30d)', 'adm_key_ext_menu')],
        [Markup.button.callback('🗑️ Xóa Key Khỏi Hệ Thống', 'adm_key_del_menu'), Markup.button.callback('📋 Xem Danh Sách Key', 'adm_key_list_0')],
        [Markup.button.callback('« Quay lại Admin Panel', 'admin_panel')]
      ])
    }
  );
});

// Menu tao key nhanh bang nut
bot.action('adm_key_gen_menu', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  ctx.editMessageText(
    `➕ <b>TẠO KEY NHANH (1-CLICK KEYGEN)</b>\n\n` +
    `Bấm chọn thời hạn bạn muốn tạo cho khách:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⚡ Gói 1 Ngày', 'adm_gen_1d'), Markup.button.callback('⚡ Gói 7 Ngày', 'adm_gen_7d')],
        [Markup.button.callback('⚡ Gói 30 Ngày', 'adm_gen_30d'), Markup.button.callback('⚡ Gói Vĩnh Viễn', 'adm_gen_vv')],
        [Markup.button.callback('« Quay lại Quản lý Key', 'adm_keys')]
      ])
    }
  );
});

bot.action(/adm_gen_(1d|7d|30d|vv)/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const type = ctx.match[1];
  let days = 30;
  let label = '30 Ngày';
  if (type === '1d') { days = 1; label = '1 Ngày'; }
  else if (type === '7d') { days = 7; label = '7 Ngày'; }
  else if (type === 'vv') { days = 30000; label = 'Vĩnh Viễn'; }

  const key = issueKey(SALT, days);
  const v = verifyKey(SALT, key);
  const db = load();
  db.keys.push({
    key, label: `Admin-${label}`, devId: 'all', exp: v.expDate,
    userId: ctx.from.id, order: 'admin_panel', createdAt: Date.now()
  });
  save(db);

  ctx.answerCbQuery(`Đã tạo key ${label}`);
  return ctx.editMessageText(
    `🎉 <b>ĐÃ SINH KEY MỚI THÀNH CÔNG!</b>\n\n` +
    `• Mã Key:\n<code>${key}</code>\n\n` +
    `• Gói: <b>${label}</b>\n` +
    `• Hạn dùng: <b>${v.expDate}</b>\n` +
    `• Loại key: <b>Key tự do (Dùng cho mọi máy)</b>\n\n` +
    `<i>(Chạm vào mã key ở trên để tự động copy)</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Tạo tiếp Key khác', 'adm_key_gen_menu')],
        [Markup.button.callback('« Về Quản lý Key', 'adm_keys')]
      ])
    }
  );
});

// Menu Unbind Key bang nut
bot.action('adm_key_unbind_menu', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  const db = load();
  const lockedKeys = (db.keys || []).slice(-6).reverse();

  if (lockedKeys.length === 0) {
    return ctx.editMessageText(
      `🔓 <b>RESET / UNBIND HWID CHO KEY</b>\n\n` +
      `<i>Hiện tại chưa có key nào trong hệ thống.</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« Quay lại Quản lý Key', 'adm_keys')]])
      }
    );
  }

  const rows = lockedKeys.map(k => [
    Markup.button.callback(`🔓 Reset: ${k.key.slice(0, 16)}...`, `do_unbind_${k.key.slice(6, 11)}`)
  ]);
  rows.push([Markup.button.callback('« Quay lại Quản lý Key', 'adm_keys')]);

  return ctx.editMessageText(
    `🔓 <b>RESET / UNBIND HWID CHO KEY</b>\n\n` +
    `Bấm vào nút key bạn muốn mở khóa thiết bị để khách gắn vào điện thoại mới:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

bot.action(/do_unbind_(.+)/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const shortPart = ctx.match[1];
  const db = load();
  const k = unbindKey(db, shortPart);
  if (!k) return ctx.answerCbQuery('Không tìm thấy key!', true);
  save(db);
  ctx.answerCbQuery('Đã reset thiết bị!');
  return ctx.editMessageText(
    `✅ <b>ĐÃ RESET THIẾT BỊ CHO KEY:</b>\n<code>${k.key}</code>\n\nKey hiện đã chuyển về chế độ tự do, khách có thể dán vào máy mới và mở game bình thường!`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Về Quản lý Key', 'adm_keys')]])
    }
  );
});

// Menu Gia Han Key bang nut (+30d)
bot.action('adm_key_ext_menu', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  const db = load();
  const recentKeys = (db.keys || []).slice(-6).reverse();

  const rows = recentKeys.map(k => [
    Markup.button.callback(`⏳ +30 Ngày: ${k.key.slice(0, 16)}... (Hạn: ${k.exp})`, `do_ext30_${k.key.slice(6, 11)}`)
  ]);
  rows.push([Markup.button.callback('« Quay lại Quản lý Key', 'adm_keys')]);

  return ctx.editMessageText(
    `⏳ <b>GIA HẠN THỜI HẠN KEY (+30 NGÀY)</b>\n\n` +
    `Bấm vào nút key bạn muốn cộng thêm 30 ngày sử dụng:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

bot.action(/do_ext30_(.+)/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const shortPart = ctx.match[1];
  const db = load();
  const k = updateKeyExp(db, shortPart, 30);
  if (!k) return ctx.answerCbQuery('Không tìm thấy key!', true);
  save(db);
  ctx.answerCbQuery('Đã gia hạn +30 ngày!');
  return ctx.editMessageText(
    `✅ <b>ĐÃ GIA HẠN KEY THÀNH CÔNG:</b>\n<code>${k.key}</code>\n\n• Hạn dùng mới: <b>${k.exp}</b> (+30 ngày).`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Về Quản lý Key', 'adm_keys')]])
    }
  );
});

// Menu Xoa Key bang nut
bot.action('adm_key_del_menu', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  const db = load();
  const recentKeys = (db.keys || []).slice(-6).reverse();

  const rows = recentKeys.map(k => [
    Markup.button.callback(`🗑️ Xóa: ${k.key.slice(0, 16)}... (${k.label})`, `do_del_${k.key.slice(6, 11)}`)
  ]);
  rows.push([Markup.button.callback('« Quay lại Quản lý Key', 'adm_keys')]);

  return ctx.editMessageText(
    `🗑️ <b>XÓA KEY KHỎI HỆ THỐNG</b>\n\n` +
    `Bấm nút key bạn muốn xóa vĩnh viễn khỏi CSDL:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

bot.action(/do_del_(.+)/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const shortPart = ctx.match[1];
  const db = load();
  const ok = deleteKey(db, shortPart);
  if (!ok) return ctx.answerCbQuery('Không tìm thấy key!', true);
  save(db);
  ctx.answerCbQuery('Đã xóa key!');
  return ctx.editMessageText(
    `🗑️ Đã xóa vĩnh viễn key khỏi cơ sở dữ liệu hệ thống.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Về Quản lý Key', 'adm_keys')]])
    }
  );
});

// Danh sach key phan trang bang nut
bot.action(/adm_key_list_(\d+)/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  const page = parseInt(ctx.match[1], 10) || 0;
  const pageSize = 5;
  const db = load();
  const allKeys = (db.keys || []).slice().reverse();
  const total = allKeys.length;
  const pageItems = allKeys.slice(page * pageSize, (page + 1) * pageSize);

  if (total === 0) {
    return ctx.editMessageText(
      `📋 <b>DANH SÁCH KEY HỆ THỐNG</b>\n\n<i>Chưa có key nào được cấp.</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« Quay lại Quản lý Key', 'adm_keys')]])
      }
    );
  }

  const textList = pageItems.map((k, idx) => {
    return (
      `<b>${page * pageSize + idx + 1}. ${k.label}</b> (Hạn: ${k.exp})\n` +
      `• Key: <code>${k.key}</code>\n` +
      `• Khóa máy: ${k.devId && k.devId !== 'all' ? k.devId : 'Tự do'}`
    );
  }).join('\n━━━━━━━━━━━━━━━━━━━━\n');

  const navRow = [];
  if (page > 0) navRow.push(Markup.button.callback('« Trang trước', `adm_key_list_${page - 1}`));
  if ((page + 1) * pageSize < total) navRow.push(Markup.button.callback('Trang sau »', `adm_key_list_${page + 1}`));

  return ctx.editMessageText(
    `📋 <b>DANH SÁCH KEY (Trang ${page + 1}/${Math.ceil(total / pageSize)}):</b>\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${textList}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Tổng số: ${total} key trong CSDL.</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        ...(navRow.length > 0 ? [navRow] : []),
        [Markup.button.callback('« Quay lại Quản lý Key', 'adm_keys')]
      ])
    }
  );
});

// 10.3 Quản lý User: Hướng Dẫn & Nút Bấm Trực Quan
bot.action('adm_users', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  const db = load();
  const userIds = Object.keys(db.users || {});

  if (userIds.length === 0) {
    return ctx.editMessageText(
      `👤 <b>QUẢN LÝ NGƯỜI DÙNG</b>\n\n<i>Chưa có khách nào tương tác với bot.</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« Quay lại Admin Panel', 'admin_panel')]])
      }
    );
  }

  const rows = userIds.slice(-8).reverse().map(uid => {
    const u = db.users[uid];
    const isBan = isUserBanned(db, uid);
    return [
      Markup.button.callback(
        `${isBan ? '⛔' : '👤'} ${u.username ? '@' + u.username : uid} — Ví: ${fmtVND(u.balance || 0)}`,
        `adm_uview_${uid}`
      )
    ];
  });
  rows.push([Markup.button.callback('« Quay lại Admin Panel', 'admin_panel')]);

  return ctx.editMessageText(
    `👤 <b>QUẢN LÝ NGƯỜI DÙNG (USER MANAGER)</b>\n\n` +
    `📖 <b>Hướng dẫn:</b>\n` +
    `Bấm vào tên khách bên dưới để xem chi tiết số dư, cộng tiền ví (+20k, +50k...) hoặc cấm/mở cấm tài khoản:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

bot.action(/adm_uview_(.+)/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const uid = ctx.match[1];
  const db = load();
  const u = (db.users || {})[uid];
  if (!u) return ctx.answerCbQuery('User không tồn tại');
  ctx.answerCbQuery();

  const isBan = isUserBanned(db, uid);
  const myKeys = (db.keys || []).filter(k => String(k.userId) === String(uid));

  return ctx.editMessageText(
    `👤 <b>HỒ SƠ KHÁCH HÀNG:</b>\n\n` +
    `• <b>ID Telegram:</b> <code>${uid}</code>\n` +
    `• <b>Username:</b> ${u.username ? '@' + u.username : 'Chưa đặt'}\n` +
    `• <b>Số dư ví:</b> <b>${fmtVND(u.balance || 0)}</b>\n` +
    `• <b>Tổng nạp:</b> <b>${fmtVND(u.totalDeposit || 0)}</b>\n` +
    `• <b>Số key đã mua:</b> <b>${myKeys.length}</b> key\n` +
    `• <b>Trạng thái:</b> ${isBan ? '⛔ ĐANG BỊ CẤM' : '🟢 Bình thường'}\n\n` +
    `Bấm các nút hành động bên dưới:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('💰 +20.000đ', `adm_uadd_20000_${uid}`),
          Markup.button.callback('💰 +50.000đ', `adm_uadd_50000_${uid}`),
          Markup.button.callback('💰 +100.000đ', `adm_uadd_100000_${uid}`)
        ],
        [
          isBan
            ? Markup.button.callback('✅ Mở khóa User', `adm_uunban_${uid}`)
            : Markup.button.callback('⛔ Cấm User Này', `adm_uban_${uid}`)
        ],
        [Markup.button.callback('« Quay lại Danh sách User', 'adm_users')]
      ])
    }
  );
});

bot.action(/adm_uadd_(\d+)_(.+)/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const amount = parseInt(ctx.match[1], 10);
  const uid = ctx.match[2];
  const db = load();
  const u = addDeposit(db, uid, amount);
  save(db);
  ctx.answerCbQuery(`Đã cộng ${fmtVND(amount)}`);

  try {
    bot.telegram.sendMessage(uid, `🎉 Bạn vừa được Admin cộng <b>${fmtVND(amount)}</b> vào số dư ví! Số dư hiện tại: <b>${fmtVND(u.balance)}</b>.`, { parse_mode: 'HTML' });
  } catch (e) {}

  return ctx.editMessageText(
    `✅ Đã cộng <b>${fmtVND(amount)}</b> cho user <code>${uid}</code>.\n• Số dư mới của khách: <b>${fmtVND(u.balance)}</b>.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('« Về Hồ sơ User', `adm_uview_${uid}`)],
        [Markup.button.callback('« Về Danh sách User', 'adm_users')]
      ])
    }
  );
});

bot.action(/adm_uban_(.+)/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const uid = ctx.match[1];
  const db = load();
  banUser(db, uid);
  save(db);
  ctx.answerCbQuery('Đã cấm user!');
  return ctx.editMessageText(
    `⛔ Đã cấm user <code>${uid}</code> sử dụng bot.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Về Hồ sơ User', `adm_uview_${uid}`)]])
    }
  );
});

bot.action(/adm_uunban_(.+)/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const uid = ctx.match[1];
  const db = load();
  unbanUser(db, uid);
  save(db);
  ctx.answerCbQuery('Đã mở cấm user!');
  return ctx.editMessageText(
    `✅ Đã mở cấm user <code>${uid}</code>. Khách có thể dùng bot bình thường.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Về Hồ sơ User', `adm_uview_${uid}`)]])
    }
  );
});

// 10.4 Quản lý Giftcode: Hướng Dẫn & Nút Bấm Trực Quan
bot.action('adm_giftcodes', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  const db = load();
  const codes = (db.giftcodes || []);

  let codeList = '<i>Chưa có mã giftcode nào.</i>';
  if (codes.length > 0) {
    codeList = codes.map(c => `• <code>${c.code}</code>: +${fmtVND(c.value)} (Dùng: ${c.usedCount}/${c.maxUses})`).join('\n');
  }

  return ctx.editMessageText(
    `🎁 <b>QUẢN LÝ GIFTCODE (PROMO CODES)</b>\n\n` +
    `📖 <b>Hướng dẫn:</b>\n` +
    `• Bấm các nút tạo code 10k, 20k, 50k, 100k bên dưới.\n` +
    `• Bot sẽ sinh mã ngẫu nhiên dạng <code>MNHUT20K-8492</code>.\n` +
    `• Bạn copy mã đem phát cho khách. Khách nhập mã là được cộng tiền vào ví ngay!\n\n` +
    `Danh sách mã đang mở:\n${codeList}\n\n` +
    `Bấm tạo mã mới:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🎁 Tạo Code 10k (50 lượt)', 'adm_gcgen_10000_50'),
          Markup.button.callback('🎁 Tạo Code 20k (50 lượt)', 'adm_gcgen_20000_50')
        ],
        [
          Markup.button.callback('🎁 Tạo Code 50k (20 lượt)', 'adm_gcgen_50000_20'),
          Markup.button.callback('🎁 Tạo Code 100k (10 lượt)', 'adm_gcgen_100000_10')
        ],
        [Markup.button.callback('🗑️ Quản lý & Xóa Mã Đang Có', 'adm_gc_list')],
        [Markup.button.callback('« Quay lại Admin Panel', 'admin_panel')]
      ])
    }
  );
});

bot.action(/adm_gcgen_(\d+)_(\d+)/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const value = parseInt(ctx.match[1], 10);
  const maxUses = parseInt(ctx.match[2], 10);
  const rand4 = Math.floor(1000 + Math.random() * 9000);
  const code = `MNHUT${value / 1000}K-${rand4}`;

  const db = load();
  const gc = createGiftcode(db, { code, type: 'fixed', value, maxUses });
  save(db);
  ctx.answerCbQuery('Đã tạo Giftcode!');

  return ctx.editMessageText(
    `🎉 <b>ĐÃ TẠO GIFTCODE MỚI THÀNH CÔNG!</b>\n\n` +
    `• Mã Giftcode: <code>${gc.code}</code>\n` +
    `• Tiền thưởng nạp: <b>+${fmtVND(gc.value)}</b>\n` +
    `• Giới hạn: <b>${gc.maxUses} lượt dùng đầu tiên</b>\n\n` +
    `<i>(Chạm vào mã code ở trên để copy đem phát cho khách)</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Tạo Code khác', 'adm_giftcodes')],
        [Markup.button.callback('« Về Quản lý Giftcode', 'adm_giftcodes')]
      ])
    }
  );
});

bot.action('adm_gc_list', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  const db = load();
  const codes = (db.giftcodes || []);

  if (codes.length === 0) {
    return ctx.editMessageText(
      `🗑️ <b>XÓA MÃ GIFTCODE</b>\n\n<i>Hiện chưa có mã giftcode nào để xóa.</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« Quay lại Quản lý Giftcode', 'adm_giftcodes')]])
      }
    );
  }

  const rows = codes.map(c => [
    Markup.button.callback(`🗑️ Xóa: ${c.code} (+${fmtVND(c.value)})`, `do_gcdel_${c.code}`)
  ]);
  rows.push([Markup.button.callback('« Quay lại Quản lý Giftcode', 'adm_giftcodes')]);

  return ctx.editMessageText(
    `🗑️ <b>XÓA MÃ GIFTCODE</b>\n\n` +
    `Bấm vào nút mã bạn muốn xóa khỏi hệ thống:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(rows)
    }
  );
});

bot.action(/do_gcdel_(.+)/, (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const code = ctx.match[1];
  const db = load();
  db.giftcodes = (db.giftcodes || []).filter(c => c.code !== code);
  save(db);
  ctx.answerCbQuery('Đã xóa code!');
  return ctx.editMessageText(
    `🗑️ Đã xóa mã giftcode <code>${code}</code> thành công.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Về Quản lý Giftcode', 'adm_giftcodes')]])
    }
  );
});

// 10.5 Cài đặt Hệ thống: Hướng Dẫn & Nút Bấm Trực Quan
bot.action('adm_settings', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  const db = load();
  const s = getSettings(db);

  ctx.editMessageText(
    `⚙️ <b>CÀI ĐẶT HỆ THỐNG & BOT</b>\n\n` +
    `📖 <b>Hướng dẫn các chức năng:</b>\n` +
    `• <b>Bật/Tắt bảo trì:</b> Bật khi bạn đang cập nhật game để khách không nạp nhầm. Khi bảo trì chỉ Admin dùng được bot.\n` +
    `• <b>Chế độ gửi APK:</b> Đặt bot gửi trực tiếp file <code>mnhutv3.6.apk</code> vào chat khi khách bấm Tải hack.\n` +
    `• <b>Broadcast:</b> Bấm 1 nút để bot tự động gửi thông báo đến TOÀN BỘ khách hàng.\n\n` +
    `Bấm các nút điều khiển bên dưới:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(s.maintenance ? '🟢 Tắt Bảo Trì Bot' : '🔴 Bật Bảo Trì Bot', 'toggle_maint')],
        [Markup.button.callback('📁 Chuyển Về Gửi Trực Tiếp APK', 'adm_set_direct_apk')],
        [Markup.button.callback('📢 Broadcast Thông Báo Cho Toàn Bộ Khách', 'adm_broadcast_menu')],
        [Markup.button.callback('« Quay lại Admin Panel', 'admin_panel')]
      ])
    }
  );
});

bot.action('toggle_maint', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const db = load();
  const s = getSettings(db);
  s.maintenance = !s.maintenance;
  setSetting(db, 'maintenance', s.maintenance);
  save(db);
  ctx.answerCbQuery(`Đã ${s.maintenance ? 'BẬT' : 'TẮT'} bảo trì`);
  return ctx.editMessageText(
    `⚙️ <b>ĐÃ CẬP NHẬT TRẠNG THÁI:</b>\nChế độ bảo trì hiện tại: <b>${s.maintenance ? '🔴 ĐANG BẬT' : '🟢 ĐANG TẮT'}</b>.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Về Cài đặt', 'adm_settings')]])
    }
  );
});

bot.action('adm_set_direct_apk', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  const db = load();
  setSetting(db, 'downloadUrl', '');
  save(db);
  ctx.answerCbQuery('Đã đặt gửi trực tiếp file APK!');
  return ctx.editMessageText(
    `✅ <b>ĐÃ CÀI ĐẶT:</b> Khi khách bấm "Tải File Hack", bot sẽ tự động gửi thẳng file <code>mnhutv3.6.apk</code> vào Telegram.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Về Cài đặt', 'adm_settings')]])
    }
  );
});

// Menu Broadcast Nhanh Bang Nut
bot.action('adm_broadcast_menu', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  return ctx.editMessageText(
    `📢 <b>BROADCAST THÔNG BÁO CHO TOÀN BỘ KHÁCH HÀNG</b>\n\n` +
    `Bấm 1 nút bên dưới để gửi thông báo tự động đến tất cả khách hàng trong hệ thống:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📢 Thông báo: Đã có bản Hack v3.6 mới!', 'do_bc_v36')],
        [Markup.button.callback('📢 Thông báo: Khuyến mãi nạp ví hôm nay!', 'do_bc_promo')],
        [Markup.button.callback('📢 Thông báo: Bảo trì hệ thống hoàn tất!', 'do_bc_done')],
        [Markup.button.callback('« Quay lại Cài đặt', 'adm_settings')]
      ])
    }
  );
});

async function sendBroadcast(ctx, message) {
  const db = load();
  const users = Object.keys(db.users || {});
  let sent = 0;
  for (const uid of users) {
    try {
      await bot.telegram.sendMessage(uid, `📢 <b>THÔNG BÁO TỪ ADMIN MNHUT VIP:</b>\n\n${message}`, { parse_mode: 'HTML' });
      sent++;
    } catch (e) {}
  }
  ctx.answerCbQuery(`Đã gửi ${sent}/${users.length} khách!`);
  return ctx.editMessageText(
    `📢 <b>KẾT QUẢ GỬI THÔNG BÁO:</b>\n\nĐã gửi thành công tới <b>${sent}/${users.length}</b> khách hàng trong hệ thống.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Về Cài đặt', 'adm_settings')]])
    }
  );
}

bot.action('do_bc_v36', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  return sendBroadcast(
    ctx,
    `🔥 <b>ĐÃ CÓ BẢN CẬP NHẬT MOD MNHUT V3.6 MỚI!</b>\n\n` +
    `✓ Tối ưu chống văng, mượt mà hơn.\n` +
    `✓ Tự động hiển thị hạn dùng và thông tin máy.\n` +
    `👉 Bấm ngay vào mục <b>🎮 Tải File Hack</b> trên Menu Bot để cài đặt bản mới nhất!`
  );
});

bot.action('do_bc_promo', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  return sendBroadcast(
    ctx,
    `🎁 <b>CHƯƠNG TRÌNH KHUYẾN MÃI HÔM NAY!</b>\n\n` +
    `• Mua key VIP giá ưu đãi chỉ từ 20k.\n` +
    `• Duyệt nạp tiền tự động qua ngân hàng nhận key tức thì!\n` +
    `👉 Vào ngay mục <b>🏪 Cửa hàng</b> để mua key trải nghiệm!`
  );
});

bot.action('do_bc_done', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  return sendBroadcast(
    ctx,
    `✅ <b>BẢO TRÌ HỆ THỐNG HOÀN TẤT!</b>\n\n` +
    `Hệ thống bán key tự động 24/7 đã hoạt động trở lại bình thường. Chúc ae chơi game vui vẻ!`
  );
});

// 10.6 Thống kê doanh thu
bot.action('adm_stats', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Quyền bị từ chối');
  ctx.answerCbQuery();
  const db = load();
  const paid = (db.orders || []).filter(o => o.status === 'paid');
  const rev = paid.reduce((s, o) => s + Number(o.paidAmount || o.price), 0);
  const totalTopup = (db.topups || []).filter(t => t.status === 'paid').reduce((s, t) => s + Number(t.amount), 0);
  const totalUsers = Object.keys(db.users || {}).length;

  ctx.editMessageText(
    `📊 <b>THỐNG KÊ DOANH THU HỆ THỐNG:</b>\n\n` +
    `• <b>Tổng người dùng bot:</b> ${totalUsers} user\n` +
    `• <b>Tổng tiền nạp vào ví:</b> ${fmtVND(totalTopup)}\n` +
    `• <b>Đơn mua trực tiếp:</b> ${paid.length} đơn (${fmtVND(rev)})\n` +
    `• <b>Tổng số key đã xuất:</b> ${(db.keys || []).length} key\n` +
    `• <b>Đơn đang chờ (pending):</b> ${(db.orders || []).filter(o => o.status === 'pending').length} đơn`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('« Quay lại Admin Panel', 'admin_panel')]
      ])
    }
  );
});

// ==========================================
// 11. BẮT TIN NHẮN TỰ ĐỘNG (AUTO DETECT KEY & CODE)
// ==========================================

bot.on('text', async (ctx, next) => {
  const text = (ctx.message.text || '').trim();
  if (text.startsWith('/')) return next(); // Bo qua slash commands

  const db = load();
  const upper = text.toUpperCase();

  // 1. Kiem tra xem co phai la ma giftcode khong
  const gc = (db.giftcodes || []).find(c => c.code === upper);
  if (gc) {
    const res = redeemGiftcode(db, ctx.from.id, upper);
    if (res.ok) {
      save(db);
      const u = getUser(db, ctx.from.id);
      return ctx.replyWithHTML(
        `🎉 <b>KÍCH HOẠT GIFTCODE THÀNH CÔNG!</b>\n\n` +
        `• Mã: <code>${res.giftcode.code}</code>\n` +
        `• Tiền thưởng: <b>+${fmtVND(res.rewardAmount)}</b>\n` +
        `• Số dư ví hiện tại: <b>${fmtVND(u.balance)}</b>`,
        Markup.inlineKeyboard([[Markup.button.callback('🏪 Mua key ngay', 'shop')]])
      );
    } else {
      let msg = 'Mã code này đã hết lượt sử dụng!';
      if (res.reason === 'already_used') msg = 'Bạn đã sử dụng mã này rồi!';
      return ctx.replyWithHTML(`❌ <b>LỖI:</b> ${msg}`);
    }
  }

  // 2. Kiem tra xem co phai la ma Key khong (MNHUT-... hoac MICU-...)
  if (upper.startsWith('MNHUT-') || upper.startsWith('MICU-') || upper.length >= 15) {
    const r = verifyKey(SALT, upper);
    if (r.ok) {
      return ctx.replyWithHTML(
        `✅ <b>KEY HỢP LỆ!</b>\n\n` +
        `• Mã Key: <code>${upper}</code>\n` +
        `• Hạn dùng: <b>${r.expDate}</b>\n` +
        `• Loại key: <b>${r.deviceLocked ? 'Khóa thiết bị (HWID)' : 'Key tự do'}</b>`
      );
    } else {
      return ctx.replyWithHTML(`❌ <b>KEY LỖI:</b> ${r.reason}`);
    }
  }

  return next();
});

// Giữ lại slash command hỗ trợ admin nhanh nếu muốn
bot.command('gen', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const parts = ctx.message.text.split(/\s+/);
  const days = parseInt(parts[1] || '30', 10);
  const devId = (parts[2] && parts[2].length >= 4 && !parts[2].startsWith('#')) ? parts[2].trim() : null;
  const key = issueKey(SALT, Math.min(days, 30000), devId);
  const v = verifyKey(SALT, key, devId);
  const db = load();
  db.keys.push({ key, label: `tay-${days}d`, devId: devId || 'all', exp: v.expDate, userId: ctx.from.id, order: 'manual', createdAt: Date.now() });
  save(db);
  ctx.replyWithHTML(`🔑 <b>ĐÃ SINH KEY THÀNH CÔNG:</b>\n<code>${key}</code>\n• Hạn dùng: <b>${v.expDate}</b>\n• Khóa máy: <b>${devId ? devId : 'Không (Key tự do)'}</b>`);
});

bot.command('congtien', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const parts = ctx.message.text.split(/\s+/);
  const targetId = parts[1];
  const amount = parseInt(parts[2] || '0', 10);
  if (!targetId || !amount) return ctx.reply('Cú pháp: /congtien <userId> <số_tiền>');
  const db = load();
  const u = addDeposit(db, targetId, amount);
  save(db);
  ctx.replyWithHTML(`Đã cộng <b>${fmtVND(amount)}</b> cho user <code>${targetId}</code>. Số dư mới: <b>${fmtVND(u.balance)}</b>.`);
});

// ==========================================
// 12. XỬ LÝ NẠP TIỀN & ĐƠN HÀNG TỰ ĐỘNG
// ==========================================

async function fulfillOrder(identifier, amount) {
  const db = load();
  const idStr = String(identifier || '').trim();
  const idNum = Number(identifier);

  // 1. Kiem tra neu la nap tien vi (topup)
  const t = (db.topups || []).find(x =>
    x.status === 'pending' &&
    (x.code === idStr || (idNum && x.payosOrderCode === idNum))
  );
  if (t) {
    t.status = 'paid';
    t.paidAmount = amount || t.amount;
    t.paidAt = Date.now();
    const u = addDeposit(db, t.userId, t.paidAmount);
    save(db);

    try {
      await bot.telegram.sendMessage(t.userId,
        `🎉 <b>NẠP TIỀN THÀNH CÔNG!</b>\n\n` +
        `• Mã giao dịch: <code>${t.code}</code>\n` +
        `• Số tiền nạp: <b>${fmtVND(t.paidAmount)}</b>\n` +
        `• Số dư hiện tại: <b>${fmtVND(u.balance)}</b>\n\n` +
        `<i>Bạn có thể dùng số dư để mua key ngay tại mục Cửa hàng!</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      console.error('Notify topup fail:', e.message);
    }

    return { ok: true, type: 'topup', amount: t.paidAmount };
  }

  // 2. Kiem tra neu la mua truc tiep (order)
  const o = (db.orders || []).find(x =>
    x.status === 'pending' &&
    (x.code === idStr || (idNum && x.payosOrderCode === idNum))
  );
  if (!o) return { ok: false, reason: 'order_not_found' };
  if (amount && Number(amount) < Number(o.price)) return { ok: false, reason: 'amount_low' };

  const key = issueKey(SALT, o.days);
  const v = verifyKey(SALT, key);
  if (!v.ok) return { ok: false, reason: 'gen_fail' };

  o.status = 'paid';
  o.paidAt = Date.now();
  o.paidAmount = amount || o.price;
  db.keys.push({ key, label: o.label, exp: v.expDate, userId: o.userId, order: o.code, createdAt: Date.now() });
  save(db);

  try {
    await bot.telegram.sendMessage(o.userId,
      `🎉 <b>THANH TOÁN THÀNH CÔNG ĐƠN HÀNG: ${o.code}</b>\n\n` +
      `• Gói key: <b>${o.label}</b>\n` +
      `• Mã Key của bạn:\n<code>${key}</code>\n\n` +
      `• Hạn dùng: <b>${v.expDate}</b>\n\n` +
      `<i>Hướng dẫn: Copy key ở trên, dán vào file <code>mnhut_key.txt</code> trong máy để kích hoạt menu game.</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    console.error('send key fail', e.message);
  }

  return { ok: true, type: 'order', key };
}

module.exports = { bot, fulfillOrder, PACKS, notifyAdmins };
