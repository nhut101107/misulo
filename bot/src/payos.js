const { PayOS } = require('@payos/node');

const CLIENT_ID = process.env.PAYOS_CLIENT_ID || '';
const API_KEY = process.env.PAYOS_API_KEY || '';
const CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY || '';

let payos = null;
if (CLIENT_ID && API_KEY && CHECKSUM_KEY && !CLIENT_ID.includes('paste-')) {
  try {
    payos = new PayOS({
      clientId: CLIENT_ID,
      apiKey: API_KEY,
      checksumKey: CHECKSUM_KEY
    });
  } catch (e) {
    console.error('Loi khoi tao payOS:', e.message);
  }
}

function isPayOSConfigured() {
  return payos !== null;
}

// payOS yeu cau orderCode phai la so nguyen duong nho hon 9007199254740991
function genNumericOrderCode() {
  // Dung timestamp giay + 3 so random
  return Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 900 + 100);
}

// Tao link thanh toan qua payOS
async function createPayOSPayment({ orderCode, amount, description, returnUrl, cancelUrl }) {
  if (!payos) throw new Error('PayOS chua duoc cau hinh');
  
  // description toi da 25 ky tu, khong dau, khong ky tu dac biet
  let cleanDesc = String(description || 'Mnhut Key')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .slice(0, 25).trim();

  const body = {
    orderCode: Number(orderCode),
    amount: Number(amount),
    description: cleanDesc,
    returnUrl: returnUrl || 'https://t.me/mnhutdznecon',
    cancelUrl: cancelUrl || 'https://t.me/mnhutdznecon'
  };

  const paymentLinkRes = await payos.paymentRequests.create(body);
  return paymentLinkRes;
}

// Xac thuc webhook payOS gui ve
async function verifyWebhook(body) {
  if (!payos) throw new Error('PayOS chua duoc cau hinh');
  return await payos.webhooks.verify(body);
}

module.exports = {
  isPayOSConfigured,
  genNumericOrderCode,
  createPayOSPayment,
  verifyWebhook
};
