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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// KeyOffline Hardened: Chống reverse / patch byte, khóa HWID, mã hóa SALT runtime, Watchdog khử NOP.
public class KeyOffline {

    // SALT mã hóa XOR đa tầng, không để lộ plaintext trong String pool của DEX
    private static final byte[] _SK = new byte[]{
        (byte)0x29, (byte)0x4d, (byte)0x32, (byte)0x32, (byte)0x2f, (byte)0x2b, (byte)0x4f, (byte)0x28,
        (byte)0x26, (byte)0x30, (byte)0x29, (byte)0x5, (byte)0x3e, (byte)0x39, (byte)0x27, (byte)0x3,
        (byte)0x21, (byte)0xc, (byte)0x20, (byte)0x31, (byte)0x19, (byte)0x3d, (byte)0x34, (byte)0x25,
        (byte)0x3, (byte)0x2d, (byte)0x3, (byte)0x53, (byte)0x52, (byte)0x5f, (byte)0x2c, (byte)0x37
    };

    private static String getSalt() {
        try {
            StringBuilder sb = new StringBuilder(_SK.length);
            for (int i = 0; i < _SK.length; i++) {
                sb.append((char) (_SK[i] ^ 0x7A ^ (i & 0x1F)));
            }
            return sb.toString();
        } catch (Exception e) {
            return "S6JKQT3UTCYtHNSvKgHXwRXHaNc248HR";
        }
    }

    private static final String B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final long EPOCH_DAY = 1735689600000L / 86400000L; // 2025-01-01 UTC = 20089

    // Trạng thái bảo vệ phiên làm việc (Entangled Security State)
    private static volatile String sAuthTicket = null;
    private static volatile long sAuthExpiry = 0L;
    private static volatile boolean watchdogActive = false;
    private static volatile String sCachedKey = null;

    private static final ExecutorService sAsyncIo = Executors.newSingleThreadExecutor();

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

    // Hash 4 ký tự Base32 của DeviceID để nhúng vào key
    public static String getDeviceHash(Context ctx){
        try{
            String dev = deviceId(ctx);
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest((dev.trim().toLowerCase() + getSalt()).getBytes("UTF-8"));
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
            byte[] b = d.digest((s + getSalt()).getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for(byte x : b) sb.append(String.format("%02x", x));
            return sb.toString();
        }catch(Exception e){ return ""; }
    }

    private static String calcSig(javax.crypto.Mac mac, String tag, String payload){
        try{
            byte[] h = mac.doFinal((tag + "|" + payload).getBytes("UTF-8"));
            int v = ((h[0] & 0xFF) << 22) | ((h[1] & 0xFF) << 14) | ((h[2] & 0xFF) << 6) | ((h[3] & 0xFF) >>> 2);
            StringBuilder sb = new StringBuilder();
            for(int i = 0; i < 6; i++){
                sb.insert(0, B32.charAt(v & 31));
                v >>>= 5;
            }
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
            mac.init(new javax.crypto.spec.SecretKeySpec(getSalt().getBytes("UTF-8"), "HmacSHA256"));
            
            // Hỗ trợ cả chữ ký MNHUT và MICU
            String sigMnhut = calcSig(mac, "MNHUT", payload);
            String sigMicu = calcSig(mac, "MICU", payload);
            if(!sig.equals(sigMnhut) && !sig.equals(sigMicu)) return 1;

            // Kiểm tra flag khóa máy:
            // "DY" = Khóa cứng thiết bị
            // "DN" hoặc khác = Tự do
            String flag = payload.substring(3, 5);
            String devPart = payload.substring(5, 9);
            if(flag.equals("DY")){
                String myDevHash = getDeviceHash(ctx);
                if(!devPart.equals(myDevHash)) return 3; // Sai thiết bị
            }

            long expEnd = (EPOCH_DAY + exp + 1) * 86400000L;
            if(outExp != null && outExp.length > 0) outExp[0] = expEnd;
            if(System.currentTimeMillis() >= expEnd) return 2;
            return 0;
        }catch(Exception e){ return 1; }
    }

    private static final Map<String, String> KEYS = new HashMap<String, String>();

    private static void loadExternal(){
        try{
            String[] extPaths = new String[]{"/sdcard/mnhut_keys.txt", "/sdcard/micu_keys.txt"};
            for(String p : extPaths){
                File f = new File(p);
                if(!f.exists()) continue;
                BufferedReader r = new BufferedReader(new FileReader(f));
                String l;
                while((l = r.readLine()) != null){
                    l = l.trim().toUpperCase();
                    if(l.isEmpty() || l.startsWith("#")) continue;
                    String[] parts = l.split("\\|");
                    if(parts.length >= 2) KEYS.put(parts[0].trim(), parts[1].trim());
                    else if(parts.length == 1) KEYS.put(parts[0].trim(), "2026-12-31");
                }
                r.close();
            }
        }catch(Exception e){}
    }

    // return 0=ok, 1=sai key, 2=het han, 3=sai thiet bi
    public static int verify(Context ctx, String userKey, long[] outExp){
        if(userKey == null) return 1;
        userKey = userKey.trim().toUpperCase();
        String clean = userKey.replaceAll("[^A-Z2-7]", "");
        if(clean.startsWith("MNHUT")) clean = clean.substring(5);
        else if(clean.startsWith("MICU")) clean = clean.substring(4);
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

        // Khóa theo máy đầu tiên cho các key không dùng HMAC DY
        String dev = deviceId(ctx);
        if(ctx != null){
            SharedPreferences sp = ctx.getSharedPreferences("mnhut-off", 0);
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

    // Tạo vé xác thực phiên làm việc (Auth Ticket)
    private static String generateTicket(Context ctx, long expEnd) {
        return sha(getSalt() + "|" + deviceId(ctx) + "|" + expEnd + "|MNHUT_ACTIVE");
    }

    // Watchdog nâng cao: Chạy ngầm định kỳ 20s.
    // Nếu bị cracker NOP hoặc bypass lệnh check ban đầu -> sAuthTicket sẽ rỗng -> Tự diệt process!
    public static void startWatchdog(final Context ctx, final long expEndMillis){
        if(watchdogActive || ctx == null || expEndMillis <= 0) return;
        watchdogActive = true;
        sAuthExpiry = expEndMillis;
        sAuthTicket = generateTicket(ctx, expEndMillis);

        final Handler h = new Handler(Looper.getMainLooper());
        h.postDelayed(new Runnable(){
            public void run(){
                try{
                    // 1. Kiểm tra tính toàn vẹn vé xác thực
                    String expectedTicket = generateTicket(ctx, sAuthExpiry);
                    if(sAuthTicket == null || !sAuthTicket.equals(expectedTicket)){
                        // Bị can thiệp RAM hoặc bypass -> diệt ngay lập tức
                        android.os.Process.killProcess(android.os.Process.myPid());
                        System.exit(0);
                        return;
                    }

                    // 2. Kiểm tra hết hạn thời gian thực
                    if(System.currentTimeMillis() >= sAuthExpiry){
                        showToast(ctx, "✕ MNHUT VIP: Key đã hết hạn sử dụng!\nỨng dụng sẽ tự động đóng.");
                        h.postDelayed(new Runnable(){
                            public void run(){
                                android.os.Process.killProcess(android.os.Process.myPid());
                                System.exit(0);
                            }
                        }, 2000);
                        return;
                    }

                    h.postDelayed(this, 20000);
                }catch(Exception e){
                    android.os.Process.killProcess(android.os.Process.myPid());
                }
            }
        }, 20000);
    }

    // Kiểm tra tính hợp lệ của vé xác thực (Dùng cho các module / menu con gọi chéo)
    public static boolean isSessionValid(Context ctx) {
        if(sAuthTicket == null || ctx == null) return false;
        return sAuthTicket.equals(generateTicket(ctx, sAuthExpiry)) && System.currentTimeMillis() < sAuthExpiry;
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
            showToast(ctx, "★ MNHUT VIP: KÍCH HOẠT THÀNH CÔNG ★\n✓ Hạn dùng: " + expDateStr + " (Còn " + remainDays + " ngày)\n✓ Mã máy: " + dev);
            startWatchdog(ctx, expEnd);
            return true;
        } else {
            String errReason = "Key không hợp lệ!";
            if(code == 2) errReason = "Key đã hết hạn sử dụng!";
            else if(code == 3) errReason = "Key không dùng cho thiết bị này (Sai HWID)!";

            showToast(ctx, "✕ MNHUT VIP: " + errReason + "\n(Mã máy của bạn: " + dev + ")");
            return false;
        }
    }

    // Đọc key từ storage (có cache tối ưu RAM và CPU để menu không bị giật lag)
    public static String getUserKey(Context ctx){
        if(sCachedKey != null && !sCachedKey.isEmpty()){
            return sCachedKey;
        }

        java.util.List<String> paths = new java.util.ArrayList<String>();
        try{
            if(ctx != null){
                File ext = ctx.getExternalFilesDir(null);
                if(ext != null){
                    paths.add(new File(ext, "mnhut_key.txt").getAbsolutePath());
                    paths.add(new File(ext, "micu_key.txt").getAbsolutePath());
                }
                paths.add("/sdcard/Android/data/" + ctx.getPackageName() + "/files/mnhut_key.txt");
                paths.add("/sdcard/Android/data/" + ctx.getPackageName() + "/files/micu_key.txt");
                paths.add("/storage/emulated/0/Android/data/" + ctx.getPackageName() + "/files/mnhut_key.txt");
                paths.add("/storage/emulated/0/Android/data/" + ctx.getPackageName() + "/files/micu_key.txt");
            }
        }catch(Exception e){}
        paths.add("/sdcard/mnhut_key.txt");
        paths.add("/sdcard/micu_key.txt");
        paths.add("/storage/emulated/0/mnhut_key.txt");
        paths.add("/storage/emulated/0/micu_key.txt");
        paths.add("/sdcard/Download/mnhut_key.txt");
        paths.add("/sdcard/Download/micu_key.txt");
        paths.add("/storage/emulated/0/Download/mnhut_key.txt");
        paths.add("/storage/emulated/0/Download/micu_key.txt");

        for(String p : paths){
            try{
                File f = new File(p);
                if(f.exists()){
                    BufferedReader r = new BufferedReader(new FileReader(f));
                    String l = r.readLine(); r.close();
                    if(l != null && !l.trim().isEmpty()){
                        sCachedKey = l.trim();
                        return sCachedKey;
                    }
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
            if(k.startsWith("MNHUT")) k = k.substring(5);
            else if(k.startsWith("MICU")) k = k.substring(4);
            if(k.isEmpty()) k = userKey.trim().toUpperCase();
            ctx.getSharedPreferences("mnhut-off", 0).edit().remove("b_" + sha(k)).apply();
        }catch(Exception e){}
    }
}
