package vn.micu.gate;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

// KeyOffline: key KHONG CAN SERVER cho MicuMulti. Goi truoc khi load menu.
// Phu hop khi m khong co hosting. Key nam cung trong code + file /sdcard/micu_keys.txt (de them key khong can rebuild).
// Bao mat o muc trung binh: du cho ban le, khong chong duoc reverse chuyen nghiep. Muon chat hon thi sau nay dung panel online.
public class KeyOffline {

    // SALT nay phai KHOP 100% voi SALT trong bot (.env). Bot dung no de de key.
    // Da nap san salt that cho ban nay. KHONG doi sau khi ban key (doi la key cu chet het).
    private static final String SALT = "S6JKQT3UTCYtHNSvKgHXwRXHaNc248HR";

    // === Key do bot de (HMAC, khong can server) - THUAT TOAN PHAI KHOP src/keys.js ben bot ===
    private static final String B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final long EPOCH_DAY = 1735689600000L / 86400000L; // 2025-01-01 UTC = 20089
    private static int b32dec(String s){
        int n = 0;
        for(int i = 0; i < s.length(); i++){ int k = B32.indexOf(s.charAt(i)); if(k < 0) return -1; n = n * 32 + k; }
        return n;
    }
    // return 0=ok, 1=sai, 2=het han. clean = 15 ky tu A-Z2-7 (da bo "MICU" va gach).
    private static int verifyHmacTime(String clean){
        try{
            String payload = clean.substring(0, 9), sig = clean.substring(9, 15);
            int exp = b32dec(payload.substring(0, 3));
            if(exp < 0) return 1;
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(SALT.getBytes("UTF-8"), "HmacSHA256"));
            byte[] h = mac.doFinal(("MICU|" + payload).getBytes("UTF-8"));
            int v = ((h[0] & 0xFF) << 22) | ((h[1] & 0xFF) << 14) | ((h[2] & 0xFF) << 6) | ((h[3] & 0xFF) >>> 2);
            StringBuilder sb = new StringBuilder();
            for(int i = 0; i < 6; i++){ sb.insert(0, B32.charAt(v & 31)); v >>>= 5; }
            if(!sb.toString().equals(sig)) return 1;
            long expEnd = (EPOCH_DAY + exp + 1) * 86400000L;
            if(System.currentTimeMillis() >= expEnd) return 2;
            return 0;
        }catch(Exception e){ return 1; }
    }

    // KEY BAN THAT NAM O DAY. Dinh dang: key -> han "yyyy-MM-dd". Qua han tu block.
    // 20 key demo da nap san, m xoa / sua sau khi test.
    private static final Map<String,String> KEYS = new HashMap<String,String>();
    static{
        KEYS.put("MICU-A1B2-C3D4","2026-12-31");
        KEYS.put("MICU-E5F6-7890","2026-12-31");
        KEYS.put("MICU-1111-2222","2026-06-30");
        KEYS.put("MICU-3333-4444","2026-06-30");
        KEYS.put("MICU-5555-6666","2026-03-31");
        KEYS.put("MICU-7777-8888","2026-03-31");
        KEYS.put("MICU-9999-0000","2026-12-31");
        KEYS.put("MICU-ABCD-EFGH","2026-12-31");
        KEYS.put("MICU-IJKL-MNOP","2026-09-30");
        KEYS.put("MICU-QRST-UVWX","2026-09-30");
        KEYS.put("MICU-2468-1357","2026-12-31");
        KEYS.put("MICU-9753-8642","2026-12-31");
        KEYS.put("MICU-ZXCV-BNMK","2026-06-30");
        KEYS.put("MICU-POIU-YTRE","2026-06-30");
        KEYS.put("MICU-LOAN-2026","2026-12-31");
        KEYS.put("MICU-VIP1-2026","2026-12-31");
        KEYS.put("MICU-VIP2-2026","2026-09-30");
        KEYS.put("MICU-TEST-0001","2025-11-30");
        KEYS.put("MICU-TEST-0002","2025-11-30");
        KEYS.put("MICU-ADMIN-ROOT","2027-12-31");
    }

    public static String deviceId(Context ctx){
        try{
            String a = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ANDROID_ID);
            if(a!=null && a.length()>=4) return a;
        }catch(Exception e){}
        try{ return Build.SERIAL; }catch(Exception e){ return "unk"; }
    }

    private static String sha(String s){
        try{
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            byte[] b = d.digest((s+SALT).getBytes("UTF-8"));
            StringBuilder sb=new StringBuilder();
            for(byte x:b) sb.append(String.format("%02x",x));
            return sb.toString();
        }catch(Exception e){ return ""; }
    }

    // Doc them key tu /sdcard/micu_keys.txt (moi dong: KEY|yyyy-MM-dd). De m them key cho khach ma khong can rebuild.
    private static void loadExternal(){
        try{
            File f = new File("/sdcard/micu_keys.txt");
            if(!f.exists()) return;
            BufferedReader r = new BufferedReader(new FileReader(f));
            String l;
            while((l=r.readLine())!=null){
                l=l.trim().toUpperCase();
                if(l.isEmpty()||l.startsWith("#")) continue;
                String[] p=l.split("\\|");
                if(p.length>=2) KEYS.put(p[0].trim(), p[1].trim());
                else if(p.length==1) KEYS.put(p[0].trim(), "2026-12-31");
            }
            r.close();
        }catch(Exception e){}
    }

    // return 0=ok, 1=sai key, 2=het han, 3=sai may (da bind may khac)
    public static int verify(Context ctx, String userKey){
        if(userKey==null) return 1;
        userKey=userKey.trim().toUpperCase();
        String clean = userKey.replaceAll("[^A-Z2-7]", "");
        if(clean.startsWith("MICU")) clean = clean.substring(4); // bo prefix hien thi
        String keyId = clean.isEmpty() ? userKey : clean;
        if(clean.length()==15){
            // Key do bot de (MICU-XXXXX-XXXXX-XXXXX): check chu ky + han, khong can server
            int t = verifyHmacTime(clean);
            if(t!=0) return t;
        } else {
            loadExternal();
            String exp = KEYS.get(userKey);
            if(exp==null) return 1;
            try{
                Date d = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(exp);
                if(d!=null && d.getTime() < System.currentTimeMillis()) return 2;
            }catch(Exception e){ return 1; }
        }

        String dev = deviceId(ctx);
        SharedPreferences sp = ctx.getSharedPreferences("micu-off", 0);
        String bind = sp.getString("b_"+sha(keyId), "");
        String my = sha(keyId+"|"+dev);
        if(bind.isEmpty()){
            sp.edit().putString("b_"+sha(keyId), my).apply();
            return 0;
        }
        return bind.equals(my) ? 0 : 3;
    }

    public static boolean check(Context ctx, String userKey){
        return verify(ctx, userKey)==0;
    }

    // Doc key khach nhap:
    // 1. /sdcard/Android/data/<package>/files/micu_key.txt (Khong can quyen, Android 11+ doc 100%)
    // 2. /sdcard/micu_key.txt va /sdcard/Download/micu_key.txt
    public static String getUserKey(Context ctx){
        java.util.List<String> paths = new java.util.ArrayList<String>();
        try{
            if(ctx != null){
                File ext = ctx.getExternalFilesDir(null);
                if(ext != null) paths.add(new File(ext, "micu_key.txt").getAbsolutePath());
                paths.add("/sdcard/Android/data/" + ctx.getPackageName() + "/files/micu_key.txt");
                paths.add("/storage/emulated/0/Android/data/" + ctx.getPackageName() + "/files/micu_key.txt");
            }
        }catch(Exception e){}
        paths.add("/sdcard/micu_key.txt");
        paths.add("/storage/emulated/0/micu_key.txt");
        paths.add("/sdcard/Download/micu_key.txt");
        paths.add("/storage/emulated/0/Download/micu_key.txt");

        for(String p : paths){
            try{
                File f = new File(p);
                if(f.exists()){
                    BufferedReader r = new BufferedReader(new FileReader(f));
                    String l = r.readLine(); r.close();
                    if(l != null && !l.trim().isEmpty()) return l.trim();
                }
            }catch(Exception e){}
        }
        return "";
    }
    public static String getUserKey(){
        return getUserKey(null);
    }
    public static boolean checkUserKey(Context ctx){
        return check(ctx, getUserKey(ctx));
    }

    // Reset may khi khach doi dien thoai: goi ham nay 1 lan (gan vao nut an / lenh dac biet), hoac xoa data app.
    public static void unbind(Context ctx, String userKey){
        try{
            String k = userKey.trim().toUpperCase().replaceAll("[^A-Z2-7]", "");
            if(k.startsWith("MICU")) k = k.substring(4);
            if(k.isEmpty()) k = userKey.trim().toUpperCase();
            ctx.getSharedPreferences("micu-off",0).edit().remove("b_"+sha(k)).apply();
        }catch(Exception e){}
    }
}
