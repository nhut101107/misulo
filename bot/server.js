// Web server: Telegram webhook (MODE=webhook) + SePay webhook + health check.
require('dotenv').config();
const express = require('express');
const { bot, fulfillOrder } = require('./bot');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/health', (req, res) => res.json({ ok: true, time: Date.now() }));

// SePay webhook: dang ky URL https://domain-cua-m/sepay-webhook trong dashboard SePay.
// Header: Authorization: Apikey <SEPAY_API_KEY>. Body co content + transferAmount.
app.post('/sepay-webhook', async (req, res) => {
  try {
    const auth = req.headers['authorization'] || '';
    if (auth !== 'Apikey ' + (process.env.SEPAY_API_KEY || '')) {
      return res.status(401).json({ success: false, message: 'unauthorized' });
    }
    const b = req.body || {};
    const content = String(b.content || b.description || '');
    const amount = Number(b.transferAmount || 0);
    const m = content.toUpperCase().replace(/[^A-Z0-9]/g, ' ').match(/MU[A-Z0-9]{8}/);
    if (!m) return res.json({ success: true, message: 'no_order_code' });
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
    const secret = process.env.WEBHOOK_SECRET || 'micu';
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
