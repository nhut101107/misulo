MICU MULTI - PATCH KIT (panel rieng + anti full)
File goc: MicuMulti_uungu.apk (31MB, com.waxmoon.ma.gp, Virbox + Mixu license v3)
Tinh trang soi duoc:
- Key cu: vn.mixu.license.v3, endpoint https://trumptg.pp.ua/panel/apiv3.php, RSA 2048 (MIIB...)
- Menu: libMixu.so 13MB (Virbox, khong patch truc tiep), dieu khien qua libMixuPanelBridge.so (panel_auth/panel_gate)
- Anti cu yeu: libCrashGuard.so chi chong crash, libma2023/px/x rat nho (6-18KB), khong co anti-frida/root that.

CACH DUNG BO NAY (khong can java/apktool tren may nay, dung MT Manager tren dien thoai):
1. Panel rieng:
   - Up 3 file trong panel/ len hosting: apiv3.php, keys.json, addkey.php
   - Doi SECRET trong apiv3.php == SECRET trong key/KeyGate.java
   - Doi PANEL_URL trong KeyGate.java thanh host cua m
   - Tao key: https://your-host/panel/addkey.php?pass=doi-pass-nay-di&days=30
2. Key:
   - Doc key/patch_key_smali.txt. Giu nguyen key cu + them KeyGate ngoai (2 lop).
   - Bien dich KeyGate.java + AntiMicu.java vao classes.dex (MT: Dex Editor Plus -> Add class).
   - Chen goi o MainActivity.onCreate (xem vi du smali trong file do).
3. Anti:
   - Doc anti/patch_anti.txt. Chen AntiMicu.run() truoc KeyGate.check().
   - Java chay ngay khong can NDK. Native libAntiMicu.cpp de sau khi co PC co NDK.
   - Dung acc clone test 2-3 ngay, loc logcat "MicuAnti" + "mixu-panel-v3:" truoc khi ban cho khach.
4. Sign + cai:
   - MT Manager tu sign sau khi save. Cai de len app cu (backup truoc).
   - Neu loi INSTALL_FAILED_CONFLICT: doi package com.waxmoon.ma.gp -> com.waxmoon.ma.gp32 (da co san 1 bien the gp32 trong manifest).

RUI RO THAT (noi 1 lan de m can):
- Hack Play Together trong multi van la hack online. Anti chi giam ti le ban, khong bao 100%.
  Nguyen nhan ban thuong nhat khong phai thieu anti ma la behavior: speed/teleport/farm qua lo bi server soi.
  Khuyen khach: speed thap, acc clone, khong khoe menu cong khai.
- Key offline cache 6h la co chu y de mat mang van choi duoc, nhung cung la cua de share key.
  Muon chat hon: giam offline_until xuong 1h trong apiv3.php.

CAU TRUC THU MUC:
panel/apiv3.php  - server key rieng
panel/keys.json  - db key demo
panel/addkey.php - tao key
key/KeyGate.java - client key
key/patch_key_smali.txt - cach chen
anti/AntiMicu.java - anti java
anti/libAntiMicu.cpp - anti native optional
anti/patch_anti.txt - cach chen anti

Can gi them: dua m link panel + 1 key test, t check response giup.
