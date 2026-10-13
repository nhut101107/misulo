# MICU KEY BOT - Deploy ban key auto 24/7 (VietQR + SePay + Render)

## 1. Chuan bi (5 phut)
1. Token bot: m bao co roi. Giu ky, se dan vao Render (khong gui lung tung).
2. SePay: dang ky sepay.vn, lien ket ngan hang, lay API key.
   Trong dashboard SePay -> Webhook -> them URL: `https://<ten-app>.onrender.com/sepay-webhook`
3. VietQR: STK + ten chu TK + ma ngan hang (MB/VCB/ACB...) de hien QR.

## 2. Day code len GitHub
1. Tao repo moi (private) tren GitHub.
2. Up toan bo thu muc MicuBot len (KHONG up file `.env` that).
3. Kiem tra da co: package.json, server.js, bot.js, src/, render.yaml.

## 3. Deploy Render (free)
1. Dang nhap render.com -> New -> Blueprint -> chon repo -> Apply (doc render.yaml).
2. Dien Environment Variables: BOT_TOKEN, SALT (giua nguyen dong duoi), BANK_CODE,
   BANK_ACCOUNT, ACCOUNT_NAME, SEPAY_API_KEY, ADMIN_IDS, WEBHOOK_URL
   (WEBHOOK_URL = URL Render cap, VD https://micu-keybot.onrender.com).
3. Deploy xong mo `https://<ten-app>.onrender.com/health` phai thay {"ok":true}.
4. SALT dung cho ban nay (da nap san trong .env.example):
   SALT=S6JKQT3UTCYtHNSvKgHXwRXHaNc248HR
   SALT nay phai KHOP voi SALT trong KeyOffline.java ben APK. T da cap nhat san.

## 4. Test dong tien (bat buoc truoc khi ban)
1. Nhan /start vao bot -> chon goi re nhat -> hien QR.
2. Chuyen khoan dung so tien + dung noi dung (ma MU...).
3. 1-3 phut bot tu gui key. Neu khong thay: xem log Render + dung /don <ma> de duyet tay.
4. Lay key nhan duoc nhap vao app (ban APK da patch KeyOffline HMAC) phai bao song.

## 5. Sua goi + gia (m chon tu custom)
Sua bien PACKS (JSON 1 dong) trong Render -> Redeploy. Vi du:
[{"id":"7d","label":"7 ngay","days":7,"price":20000},{"id":"30d","label":"30 ngay","days":30,"price":50000},{"id":"vv","label":"Vinh vien","days":30000,"price":199000}]
Luu y: vinh vien de days 30000 (dung de 36500 se tran 15-bit).

## 6. Van hanh
- /stats: doanh thu + don. /gen <ngay>: cap key tay khi ho tro. /don <ma>: duyet tay.
- Doi may cho khach: huong dan xoa data app (key khoa theo may dau tien).
- Render free ngu khi 15 phut khong co request: SePay webhook se danh thuc, nhung
  Telegram webhook co the tre vai chuc giay o tin nhan dau. Chap nhan duoc cho shop nho.
  Dong khach thi nang len Starter 7$/thang.

## 7. Test local o may nay (optional)
- Cai Node portable da co san o Temp/opencode. Copy .env.example thanh .env, dien BOT_TOKEN.
- Chay: node server.js (MODE=polling). Nhan /start test menu (khong can SePay).
- Chay: npm run selftest (kiem tra engine key, khong can mang).
