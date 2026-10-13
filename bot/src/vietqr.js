// VietQR image (mien phi, khong can API key): https://api.vietqr.io
function qrUrl(bank, account, amount, addInfo, accountName) {
  const info = encodeURIComponent(addInfo);
  const name = encodeURIComponent(accountName || '');
  return `https://img.vietqr.io/image/${bank}-${account}-compact2.png?amount=${amount}&addInfo=${info}&accountName=${name}`;
}
function fmtVND(n) {
  return Number(n).toLocaleString('vi-VN') + 'đ';
}
module.exports = { qrUrl, fmtVND };
