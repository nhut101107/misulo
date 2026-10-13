package vn.micu.gate;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Debug;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.InputStreamReader;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

// AntiMicu v3: manh nhat lam duoc bang Java thuan (khong NDK).
// Goi AntiMicu.run(ctx) o Application.onCreate TRUOC khi load libMixu.
// Moi so voi v2:
//  - Chuoi nhay cam ma hoa XOR (soi strings khong thay frida/su/status...).
//  - Check CRC classes.dex chong sua dex (dien EXPECT_DEX_CRC sau build dau tien).
//  - Check cheo: KeyOffline phai ton tai (chong boc lop key ra).
//  - Phat hien root rong hon: which su, getprop ro.debuggable/ro.secure.
// Honest note: khong co anti client nao tuyet doi - ban game chu yeu do server
// soi hanh vi (speed/teleport/chi so). Test acc clone truoc khi giao khach.
public class AntiMicu {

    static final String TAG = "MicuAnti";
    static final int XORK = 0x5A;

    // DIEN SAU BUILD DAU TIEN: xem logcat tag MicuAnti (cert-sha256=..., dex-crc=...).
    // De placeholder thi buoc do tu bo qua.
    static final String EXPECT_CERT_SHA256 = "PUT_CERT_SHA256_HERE";
    static final String EXPECT_DEX_CRC = "PUT_DEX_CRC_HERE";
    static final long MIXU_MIN_SIZE = 10L * 1024L * 1024L;

    // Chuoi ma hoa (gen bang gen-blobs.js, giai bang dx). Khong de lo plaintext.
    static final String S_STATUS = "752b2a363d702f383e357f222236202039";
    static final String S_MAPS = "752b2a363d702f383e357f3c372727";
    static final String S_TASK = "752b2a363d702f383e357f2537243f";
    static final String S_TRACER = "0e29393a3b2d0c343669";
    static final String S_FRIDA = "3c29313d3f";
    static final String S_GUM = "3d2e3574342c";
    static final String S_GADGET = "3d3a3c3e3b2b";
    static final String S_LIJ = "363236333b3c283220";
    static final String S_SUB = "292e3a2a2a2d3d2937";
    static final String S_XPO = "222b372a3b3b";
    static final String S_ZYG = "20223f302d34";
    static final String S_RIRU = "28322a2c";
    static final String S_HOOKZZ = "323437322425";
    static final String S_DOBBY = "3e343a3b27";
    static final String S_GMAIN = "3d36393030";
    static final String S_WHICH = "2d33313a36";
    static final String S_SU = "292e";
    static final String S_GETPROP = "3d3e2c292c302c";
    static final String S_DBG = "2834763d3b3d293a3532323d33";
    static final String S_SEC = "2834762a3b3c292f37";
    static final String S_LIB = "36323a34372729"; // libmixu
    static final String P_XPO = "3e3e762b313d2a73333d3423393e307b323b273a2b2b62242c3034202a2b2137";
    static final String P_EDX = "35293f77333a332a3132247f33332c2525382d2d60222d2323242533";
    static final String P_SUB = "393435772d3e292f3b387e2223352721382a3c2c";
    static final String P_LSP = "35293f77322c2c322136347f3b363a342d2e3a";
    static final String P_VA = "3334762f3f713925223c233432";

    static String dx(String hex){
        try{
            int n = hex.length() / 2;
            byte[] b = new byte[n];
            for(int i = 0; i < n; i++)
                b[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
            for(int i = 0; i < n; i++) b[i] = (byte) (b[i] ^ XORK ^ (i & 0xFF));
            return new String(b, "UTF-8");
        }catch(Exception e){ return ""; }
    }

    public static boolean run(Context ctx){
        try{
            logIds(ctx);
            if(!mutualCheck()){ Log.i(TAG, "e8"); return false; }
            if(!verifySignature(ctx)){ Log.i(TAG, "e5"); return false; }
            if(!verifyDex(ctx)){ Log.i(TAG, "e6"); return false; }
            if(!verifyLib(ctx)){ Log.i(TAG, "e7"); return false; }
            if(isDebugger()){ Log.i(TAG, "e1"); return false; }
            if(hasTracerPid()){ Log.i(TAG, "e2"); return false; }
            if(hasFrida()){ Log.i(TAG, "e3"); return false; }
            if(hasHookApp(ctx)){ Log.i(TAG, "e4"); return false; }
            if(isRooted(ctx)){ Log.i(TAG, "r1"); }
            if(isEmulator()){ Log.i(TAG, "emu-log-only"); }
            blockReports();
            scheduleRecheck(ctx);
            return true;
        }catch(Exception e){ return true; }
    }

    // 0. In cac id de dien EXPECT (chay 1 lan tren APK sign that, xem logcat)
    static void logIds(Context ctx){
        try{
            String h = certSha256(ctx);
            if(h != null) Log.i(TAG, "cert-sha256=" + h);
            String c = dexCrc(ctx);
            if(c != null) Log.i(TAG, "dex-crc=" + c);
        }catch(Exception e){}
    }
    static String certSha256(Context ctx){
        try{
            PackageManager pm = ctx.getPackageManager();
            PackageInfo pi = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNATURES);
            if(pi == null || pi.signatures == null || pi.signatures.length == 0) return null;
            Signature s = pi.signatures[0];
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            byte[] b = d.digest(s.toByteArray());
            StringBuilder sb = new StringBuilder();
            for(byte x : b) sb.append(String.format("%02x", x));
            return sb.toString();
        }catch(Exception e){ return null; }
    }
    static String dexCrc(Context ctx){
        try{
            java.util.zip.ZipFile z = new java.util.zip.ZipFile(ctx.getApplicationInfo().sourceDir);
            java.util.zip.ZipEntry e = z.getEntry("classes.dex");
            String c = (e == null) ? null : Long.toHexString(e.getCrc());
            z.close();
            return c;
        }catch(Exception e){ return null; }
    }
    static boolean verifySignature(Context ctx){
        try{
            if(EXPECT_CERT_SHA256.startsWith("PUT_")) return true;
            String h = certSha256(ctx);
            return h != null && h.equalsIgnoreCase(EXPECT_CERT_SHA256);
        }catch(Exception e){ return true; }
    }
    static boolean verifyDex(Context ctx){
        try{
            if(EXPECT_DEX_CRC.startsWith("PUT_")) return true;
            String c = dexCrc(ctx);
            return c != null && c.equalsIgnoreCase(EXPECT_DEX_CRC);
        }catch(Exception e){ return true; }
    }
    static boolean verifyLib(Context ctx){
        try{
            File lib = new File(ctx.getApplicationInfo().nativeLibraryDir + "/" + dx(S_LIB) + ".so");
            return lib.exists() && lib.length() >= MIXU_MIN_SIZE;
        }catch(Exception e){ return true; }
    }

    // 0b. Lop key phai di kem (chong boc KeyOffline ra khoi APK)
    static boolean mutualCheck(){
        try{
            Class.forName("vn.micu.gate.KeyOffline");
            return true;
        }catch(Exception e){ return false; }
    }

    // 1. anti-debug
    static boolean isDebugger(){
        if(Debug.isDebuggerConnected() || Debug.waitingForDebugger()) return true;
        return hasTracerPid();
    }
    static boolean hasTracerPid(){
        try{
            BufferedReader r = new BufferedReader(new FileReader(dx(S_STATUS)));
            String l; while((l = r.readLine()) != null){
                if(l.startsWith(dx(S_TRACER))){
                    int v = Integer.parseInt(l.split(":")[1].trim());
                    r.close(); return v != 0;
                }
            } r.close();
        }catch(Exception e){}
        return false;
    }

    // 2. anti-frida / hook: maps + thread + port (tu khoa giai ma runtime)
    static boolean hasFrida(){
        try{
            String[] keys = {S_FRIDA, S_GUM, S_GADGET, S_LIJ, S_SUB, S_XPO, S_HOOKZZ, S_DOBBY};
            BufferedReader r = new BufferedReader(new FileReader(dx(S_MAPS)));
            String l; while((l = r.readLine()) != null){
                String s = l.toLowerCase();
                for(String k : keys){
                    String b = dx(k);
                    if(!b.isEmpty() && s.contains(b) && !s.contains(dx(S_LIB))){ r.close(); return true; }
                }
                // zygisk/riru tren may root nhieu -> chi log o muc root, khong block o day
            } r.close();
            Set<String> bad = new HashSet<>(Arrays.asList(
                dx(S_GMAIN), dx(S_GUM) + "-loop", dx(S_FRIDA), dx(S_LIJ), "gdb", "lldb"));
            try{
                File d = new File(dx(S_TASK));
                File[] ts = d.listFiles();
                if(ts != null) for(File t : ts){
                    String n = readAll(dx(S_TASK) + "/" + t.getName() + "/comm").toLowerCase().trim();
                    if(bad.contains(n)) return true;
                }
            }catch(Exception e){}
            int[] ports = {27042, 27047};
            for(int p : ports){
                try{
                    java.net.Socket s = new java.net.Socket();
                    s.connect(new java.net.InetSocketAddress("127.0.0.1", p), 300);
                    s.close(); return true;
                }catch(Exception e){}
            }
        }catch(Exception e){}
        return false;
    }
    static String readAll(String p){
        try{
            BufferedReader r = new BufferedReader(new FileReader(p));
            String l = r.readLine(); r.close(); return l == null ? "" : l;
        }catch(Exception e){ return ""; }
    }

    static boolean hasHookApp(Context ctx){
        try{
            String[] pkgs = {dx(P_XPO), dx(P_EDX), dx(P_SUB), dx(P_LSP), dx(P_VA)};
            PackageManager pm = ctx.getPackageManager();
            for(String p : pkgs){
                if(p.isEmpty()) continue;
                try{ pm.getPackageInfo(p, 0); return true; }catch(Exception e){}
            }
        }catch(Exception e){}
        return false;
    }

    // 3. root rong hon (log only - khong duoi khach root) + emulator (log only)
    static boolean isRooted(Context ctx){
        String[] paths = {"/system/bin/su", "/system/xbin/su", "/sbin/su", "/sbin/.magisk",
            "/system/app/Superuser.apk", "/data/adb/magisk", "/data/adb/modules", "/data/adb/ksu"};
        for(String p : paths) if(new File(p).exists()) return true;
        try{
            String tags = android.os.Build.TAGS;
            if(tags != null && tags.contains("test-keys")) return true;
        }catch(Exception e){}
        if(shellHas(dx(S_WHICH), dx(S_SU))) return true; // which su
        String dbg = getProp(dx(S_DBG));
        String sec = getProp(dx(S_SEC));
        if("1".equals(dbg) || "0".equals(sec)) return true; // rom debug
        return false;
    }
    static boolean shellHas(String cmd, String arg){
        try{
            Process p = Runtime.getRuntime().exec(new String[]{cmd, arg});
            BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String l = r.readLine(); r.close();
            p.destroy();
            return l != null && l.trim().length() > 0;
        }catch(Exception e){ return false; }
    }
    static String getProp(String k){
        try{
            Process p = Runtime.getRuntime().exec(new String[]{dx(S_GETPROP), k});
            BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String l = r.readLine(); r.close();
            p.destroy();
            return l == null ? "" : l.trim();
        }catch(Exception e){ return ""; }
    }
    static boolean isEmulator(){
        try{
            String f = android.os.Build.FINGERPRINT;
            String m = android.os.Build.MODEL;
            String pr = android.os.Build.PRODUCT;
            if(f != null && (f.contains("generic") || f.contains("vbox") || f.contains("test-keys"))) return true;
            if(m != null && (m.contains("Emulator") || m.contains("Android SDK"))) return true;
            if(pr != null && (pr.contains("sdk") || pr.contains("vbox"))) return true;
        }catch(Exception e){}
        return false;
    }

    // 4. CHAN THAT report: host/den co duong dan report -> proxy chet (fail nhanh).
    static final Set<String> BLOCK = new HashSet<>(Arrays.asList(
        "report", "abuse", "cheat", "hack", "log-collect", "feedback",
        "analytics", "haegin", "playtogether"
    ));
    static void blockReports(){
        try{
            final java.net.Proxy dead = new java.net.Proxy(java.net.Proxy.Type.HTTP,
                new java.net.InetSocketAddress("127.0.0.1", 9));
            final java.util.List<java.net.Proxy> noProxy =
                java.util.Collections.singletonList(java.net.Proxy.NO_PROXY);
            final java.util.List<java.net.Proxy> deadList =
                java.util.Collections.singletonList(dead);
            java.net.ProxySelector.setDefault(new java.net.ProxySelector(){
                public java.util.List<java.net.Proxy> select(java.net.URI u){
                    try{
                        String h = (u.getHost() == null ? "" : u.getHost().toLowerCase())
                            + (u.getPath() == null ? "" : u.getPath().toLowerCase());
                        for(String b : BLOCK){
                            if(h.contains(b) && (h.contains("report") || h.contains("log")
                                || h.contains("analytic") || h.contains("abuse") || h.contains("ban"))){
                                Log.i(TAG, "block-report:" + u);
                                return deadList;
                            }
                        }
                    }catch(Exception e){}
                    return noProxy;
                }
                public void connectFailed(java.net.URI u, java.net.SocketAddress s, java.io.IOException e){}
            });
        }catch(Exception e){}
    }

    // 5. tu kiem tra lai sau 60s (bat debug tre). Dinh la kill process.
    static void scheduleRecheck(final Context ctx){
        try{
            final Context app = ctx.getApplicationContext();
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable(){
                public void run(){
                    try{
                        if(isDebugger() || hasTracerPid() || hasFrida()){
                            Log.i(TAG, "e9");
                            android.os.Process.killProcess(android.os.Process.myPid());
                        } else {
                            scheduleRecheck(app);
                        }
                    }catch(Exception e){}
                }
            }, 60000);
        }catch(Exception e){}
    }

    // 6. native manh hon (optional): build libAntiMicu.so bang NDK
    static{
        try{ System.loadLibrary("AntiMicu"); }catch(Exception e){}
    }
    public static native int nativeGate();
}
