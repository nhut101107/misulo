// Selftest: chay `npm run selftest` de kiem tra engine key truoc khi deploy.
// Khong can BOT_TOKEN. Test vector nay phai KHOP voietcher KeyOffline.java ben Android.
const { issueKey, verifyKey } = require('../src/keys');
const SALT = process.env.SALT || 'S6JKQT3UTCYtHNSvKgHXwRXHaNc248HR';

let fail = 0;
function ok(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : ''));
  if (!cond) fail++;
}
// 1. Sinh -> verify phai song
const k1 = issueKey(SALT, 30);
const v1 = verifyKey(SALT, k1);
ok('gen30_verify', v1.ok === true, k1 + ' -> ' + JSON.stringify(v1));
// 2. Dinh dang: MICU-XXXXX-XXXXX-XXXXX
ok('format', /^MICU-[A-Z2-7]{5}-[A-Z2-7]{5}-[A-Z2-7]{5}$/.test(k1), k1);
// 3. Sua 1 ky tu -> chet
const bad = k1.slice(0, 8) + (k1[8] === 'A' ? 'B' : 'A') + k1.slice(9);
ok('tamper_reject', verifyKey(SALT, bad).ok === false);
// 4. Sai SALT -> chet
ok('wrong_salt', verifyKey(SALT + 'x', k1).ok === false);
// 5. Vinh vien 30000 ngay van verify duoc
const kvv = issueKey(SALT, 30000);
ok('lifetime', verifyKey(SALT, kvv).ok === true, kvv);
// 6. Test vector co dinh de doi chieu voi Android (SALT + payload co dinh):
//    Thay SALT_TEST + key mau ben duoi vao app Android, phai bao song.
console.log('SAMPLE_KEY_30D=' + k1);
console.log(fail === 0 ? 'ALL_OK' : 'FAILED=' + fail);
process.exit(fail === 0 ? 0 : 1);
