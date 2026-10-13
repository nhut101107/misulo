// Web server: Telegram webhook (MODE=webhook) + payOS webhook + SePay webhook + health check.
require('dotenv').config();
const express = require('express');
const { bot, fulfillOrder } = require('./bot');
const { isPayOSConfigured, verifyWebhook } = require('./src/payos');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/health', (req, res) => res.json({ ok: true, time: Date.now() }));

// 1. payOS webhook: dang ky URL https://domain-cua-m/payos-webhook tren dashboard payos.vn
app.post('/payos-webhook', async (req, res) => {
  try {
    if (!isPayOSConfigured()) {
      return res.status(400).json({ success: false, message: 'payOS not configured' });
    }
    const webhookData = await verifyWebhook(req.body);
    console.log('[payOS Webhook] Nhan thanh toan:', webhookData.orderCode, 'So tien:', webhookData.amount);

    const r = await fulfillOrder(webhookData.orderCode, webhookData.amount);
    return res.json({ success: true, ...r });
  } catch (e) {
    console.error('[payOS Webhook Error]:', e.message);
    return res.status(400).json({ success: false, error: e.message });
  }
});

// 2. SePay webhook: dang ky URL https://domain-cua-m/sepay-webhook trong dashboard SePay.
// Header: Authorization: Apikey <SEPAY_API_KEY>. Body co content + transferAmount.
app.post('/sepay-webhook', async (req, res) => {
  try {
    const auth = req.headers['authorization'] || '';
    if (auth !== 'Apikey ' + (process.env.SEPAY_API_KEY || '')) {
      return res.status(401).json({ success: false, message: 'unauthorized' });
    }
    const b = req.body || {};
    const content = String(b.content || b.description || '');
    const cleanContent = content.toUpperCase().replace(/[^A-Z0-9]/g, ' ');
    const m = cleanContent.match(/MN[A-Z0-9]{8}/) || cleanContent.match(/MU[A-Z0-9]{8}/) || cleanContent.match(/NAP\d+[A-Z0-9]+/);
    if (!m) return res.json({ success: true, message: 'no_order_or_topup_code' });
    
    const amount = Number(b.transferAmount || b.amount || 0);
    const r = await fulfillOrder(m[0], amount);
    return res.json({ success: true, ...r });
  } catch (e) {
    console.error('sepay hook err', e);
    return res.json({ success: false });
  }
});

const MODE = process.env.MODE || 'polling';
const PORT = process.env.PORT || 3000;

async function main() {
  if (MODE === 'webhook') {
    const secret = process.env.WEBHOOK_SECRET || 'mnhut';
    const url = (process.env.WEBHOOK_URL || '').replace(/\/$/, '') + '/telegram/' + secret;
    app.use(bot.webhookCallback('/telegram/' + secret));
    app.listen(PORT, async () => {
      console.log('Webhook mode on port ' + PORT);
      await bot.telegram.setWebhook(url);
      console.log('Telegram webhook set: ' + url);
    });
  } else {
    app.listen(PORT, () => console.log('Polling mode, http on port ' + PORT));
    bot.catch((err) => console.error('Bot handler err:', err.message));
    // launch() chay vong polling vo han nen khong await (await la treo mai).
    bot.launch(() => console.log('Bot polling started')).catch(e => { console.error(e); process.exit(1); });
  }
}
main().catch(e => { console.error(e); process.exit(1); });
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
