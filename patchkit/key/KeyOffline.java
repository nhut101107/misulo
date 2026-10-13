package vn.micu.gate;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

// KeyOffline: Key khong can server cho MicuMulti, co khoa HWID thiet bi va Watchdog tu dong kick khi het han.
public class KeyOffline {

    private static final String SALT = "S6JKQT3UTCYtHNSvKgHXwRXHaNc248HR";
    private static final String B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final long EPOCH_DAY = 1735689600000L / 86400000L; // 2025-01-01 UTC = 20089

    private static boolean watchdogActive = false;

    private static int b32dec(String s){
        int n = 0;
        for(int i = 0; i < s.length(); i++){
            int k = B32.indexOf(s.charAt(i));
            if(k < 0) return -1;
            n = n * 32 + k;
        }
        return n;
    }

    public static String deviceId(Context ctx){
        try{
            if(ctx != null){
                String a = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ANDROID_ID);
                if(a != null && a.length() >= 4) return a.trim().toLowerCase();
            }
        }catch(Exception e){}
        try{
            if(Build.SERIAL != null && !Build.SERIAL.equalsIgnoreCase("unknown")) return Build.SERIAL.trim().toLowerCase();
        }catch(Exception e){}
        return "device";
    }

    // Hash 4 ky tu Base32 cua DeviceID de nhung vao key
    public static String getDeviceHash(Context ctx){
        try{
            String dev = deviceId(ctx);
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest((dev.trim().toLowerCase() + SALT).getBytes("UTF-8"));
            int v = ((h[0] & 0xFF) << 12) | ((h[1] & 0xFF) << 4) | ((h[2] & 0xF0) >>> 4);
            StringBuilder sb = new StringBuilder();
            for(int i = 0; i < 4; i++){
                sb.insert(0, B32.charAt(v & 31));
                v >>>= 5;
            }
            return sb.toString();
        }catch(Exception e){ return "AAAA"; }
    }

    private static String sha(String s){
        try{
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            byte[] b = d.digest((s + SALT).getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for(byte x : b) sb.append(String.format("%02x", x));
            return sb.toString();
        }catch(Exception e){ return ""; }
    }

    // 0=ok, 1=sai key, 2=het han, 3=sai thiet bi (HWID mismatch)
    private static int verifyHmacTime(Context ctx, String clean, long[] outExp){
        try{
            String payload = clean.substring(0, 9);
            String sig = clean.substring(9, 15);
            int exp = b32dec(payload.substring(0, 3));
            if(exp < 0) return 1;

            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(SALT.getBytes("UTF-8"), "HmacSHA256"));
            byte[] h = mac.doFinal(("MICU|" + payload).getBytes("UTF-8"));
            int v = ((h[0] & 0xFF) << 22) | ((h[1] & 0xFF) << 14) | ((h[2] & 0xFF) << 6) | ((h[3] & 0xFF) >>> 2);
            StringBuilder sb = new StringBuilder();
            for(int i = 0; i < 6; i++){
                sb.insert(0, B32.charAt(v & 31));
                v >>>= 5;
            }
            if(!sb.toString().equals(sig)) return 1;

            // Kiem tra flag khoa may:
            // "DY" = Khoa cung thiet bi
            // "DN" hoac khac = Tu do
            String flag = payload.substring(3, 5);
            String devPart = payload.substring(5, 9);
            if(flag.equals("DY")){
                String myDevHash = getDeviceHash(ctx);
                if(!devPart.equals(myDevHash)) return 3; // Sai thiet bi
            }

            long expEnd = (EPOCH_DAY + exp + 1) * 86400000L;
            if(outExp != null && outExp.length > 0) outExp[0] = expEnd;
            if(System.currentTimeMillis() >= expEnd) return 2;
            return 0;
        }catch(Exception e){ return 1; }
    }

    private static final Map<String, String> KEYS = new HashMap<String, String>();
    static{
        KEYS.put("MICU-A1B2-C3D4", "2026-12-31");
        KEYS.put("MICU-E5F6-7890", "2026-12-31");
        KEYS.put("MICU-1111-2222", "2026-06-30");
        KEYS.put("MICU-3333-4444", "2026-06-30");
        KEYS.put("MICU-5555-6666", "2026-03-31");
        KEYS.put("MICU-7777-8888", "2026-03-31");
        KEYS.put("MICU-9999-0000", "2026-12-31");
        KEYS.put("MICU-ABCD-EFGH", "2026-12-31");
        KEYS.put("MICU-IJKL-MNOP", "2026-09-30");
        KEYS.put("MICU-QRST-UVWX", "2026-09-30");
        KEYS.put("MICU-2468-1357", "2026-12-31");
        KEYS.put("MICU-9753-8642", "2026-12-31");
        KEYS.put("MICU-ZXCV-BNMK", "2026-06-30");
        KEYS.put("MICU-POIU-YTRE", "2026-06-30");
        KEYS.put("MICU-LOAN-2026", "2026-12-31");
        KEYS.put("MICU-VIP1-2026", "2026-12-31");
        KEYS.put("MICU-VIP2-2026", "2026-09-30");
        KEYS.put("MICU-TEST-0001", "2025-11-30");
        KEYS.put("MICU-TEST-0002", "2025-11-30");
        KEYS.put("MICU-ADMIN-ROOT", "2027-12-31");
    }

    private static void loadExternal(){
        try{
            File f = new File("/sdcard/micu_keys.txt");
            if(!f.exists()) return;
            BufferedReader r = new BufferedReader(new FileReader(f));
            String l;
            while((l = r.readLine()) != null){
                l = l.trim().toUpperCase();
                if(l.isEmpty() || l.startsWith("#")) continue;
                String[] p = l.split("\\|");
                if(p.length >= 2) KEYS.put(p[0].trim(), p[1].trim());
                else if(p.length == 1) KEYS.put(p[0].trim(), "2026-12-31");
            }
            r.close();
        }catch(Exception e){}
    }

    // return 0=ok, 1=sai key, 2=het han, 3=sai thiet bi
    public static int verify(Context ctx, String userKey, long[] outExp){
        if(userKey == null) return 1;
        userKey = userKey.trim().toUpperCase();
        String clean = userKey.replaceAll("[^A-Z2-7]", "");
        if(clean.startsWith("MICU")) clean = clean.substring(4);
        String keyId = clean.isEmpty() ? userKey : clean;

        if(clean.length() == 15){
            int t = verifyHmacTime(ctx, clean, outExp);
            if(t != 0) return t;
        } else {
            loadExternal();
            String exp = KEYS.get(userKey);
            if(exp == null) return 1;
            try{
                Date d = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(exp);
                if(d != null){
                    long expTime = d.getTime();
                    if(outExp != null && outExp.length > 0) outExp[0] = expTime;
                    if(expTime < System.currentTimeMillis()) return 2;
                }
            }catch(Exception e){ return 1; }
        }

        // Khoa theo may dau tien cho cac key khong dung HMAC D1
        String dev = deviceId(ctx);
        if(ctx != null){
            SharedPreferences sp = ctx.getSharedPreferences("micu-off", 0);
            String bind = sp.getString("b_" + sha(keyId), "");
            String my = sha(keyId + "|" + dev);
            if(bind.isEmpty()){
                sp.edit().putString("b_" + sha(keyId), my).apply();
                return 0;
            }
            return bind.equals(my) ? 0 : 3;
        }
        return 0;
    }

    public static int verify(Context ctx, String userKey){
        return verify(ctx, userKey, null);
    }

    public static void showToast(final Context ctx, final String msg){
        if(ctx == null) return;
        try{
            new Handler(Looper.getMainLooper()).post(new Runnable(){
                public void run(){
                    try{
                        Toast.makeText(ctx.getApplicationContext(), msg, Toast.LENGTH_LONG).show();
                    }catch(Exception e){}
                }
            });
        }catch(Exception e){}
    }

    // Auto-Kick Watchdog: Chay ngam moi 30s, dung luc het han se tu dong da vang app
    public static void startWatchdog(final Context ctx, final long expEndMillis){
        if(watchdogActive || ctx == null || expEndMillis <= 0) return;
        watchdogActive = true;
        final Handler h = new Handler(Looper.getMainLooper());
        h.postDelayed(new Runnable(){
            public void run(){
                try{
                    if(System.currentTimeMillis() >= expEndMillis){
                        showToast(ctx, "✕ MICU VIP: Key đã hết hạn sử dụng!\nỨng dụng sẽ tự động đóng.");
                        h.postDelayed(new Runnable(){
                            public void run(){
                                android.os.Process.killProcess(android.os.Process.myPid());
                            }
                        }, 2500);
                        return;
                    }
                    h.postDelayed(this, 30000);
                }catch(Exception e){}
            }
        }, 30000);
    }

    public static boolean check(Context ctx, String userKey){
        long[] expArr = new long[]{0L};
        int code = verify(ctx, userKey, expArr);
        String dev = deviceId(ctx);

        if(code == 0){
            long expEnd = expArr[0];
            long remainDays = Math.max(0, (expEnd - System.currentTimeMillis()) / 86400000L);
            String expDateStr = "Vĩnh viễn";
            if(expEnd > 0){
                expDateStr = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(new Date(expEnd));
            }
            showToast(ctx, "★ MICU VIP: KÍCH HOẠT THÀNH CÔNG ★\n✓ Hạn dùng: " + expDateStr + " (Còn " + remainDays + " ngày)\n✓ Mã máy: " + dev);
            startWatchdog(ctx, expEnd);
            return true;
        } else {
            String errReason = "Key không hợp lệ!";
            if(code == 2) errReason = "Key đã hết hạn sử dụng!";
            else if(code == 3) errReason = "Key không dùng cho thiết bị này (Sai HWID)!";

            showToast(ctx, "✕ MICU VIP: " + errReason + "\n(Mã máy của bạn: " + dev + ")");
            return false;
        }
    }

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

    public static void unbind(Context ctx, String userKey){
        try{
            String k = userKey.trim().toUpperCase().replaceAll("[^A-Z2-7]", "");
            if(k.startsWith("MICU")) k = k.substring(4);
            if(k.isEmpty()) k = userKey.trim().toUpperCase();
            ctx.getSharedPreferences("micu-off", 0).edit().remove("b_" + sha(k)).apply();
        }catch(Exception e){}
    }
}
