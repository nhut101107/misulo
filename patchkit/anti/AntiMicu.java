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
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

// AntiMicu v2: full combo Java (khong can NDK). Goi AntiMicu.run(ctx) o
// Application.onCreate TRUOC khi load libMixu.
// Tang moi so voi v1: check chu ky APK (chong repack), check libMixu nguyen ven,
// mo rong dau hieu Frida/hook, CHAN THAT report (fail nhanh), tu kiem tra lai sau 60s.
// Luu y that: anti khong bao gio 100% - ban game chu yeu do server soi hanh vi.
// Test acc clone truoc khi giao khach.
public class AntiMicu {

    static final String TAG = "MicuAnti";

    // DIEN SAU KHI BUILD APK LAN DAU: lay tu logcat (tag MicuAnti, dong cert-sha256=...).
    // De nguyen placeholder thi buoc check chu ky tu bo qua (khong block).
    static final String EXPECT_CERT_SHA256 = "PUT_CERT_SHA256_HERE";
    // Kich thuoc toi thieu cua libMixu.so (byte). File hien tai ~13.9MB -> de 10MB.
    static final long MIXU_MIN_SIZE = 10L * 1024L * 1024L;

    public static boolean run(Context ctx){
        try{
            logCert(ctx); // in ra de lay hash dien vao EXPECT o tren (chi log, khong block)
            if(!verifySignature(ctx)){ Log.i(TAG,"sig"); return false; }
            if(!verifyLib(ctx)){ Log.i(TAG,"lib"); return false; }
            if(isDebugger()){ Log.i(TAG,"debug"); return false; }
            if(hasTracerPid()){ Log.i(TAG,"tracer"); return false; }
            if(hasFrida()){ Log.i(TAG,"frida"); return false; }
            if(hasHookApp(ctx)){ Log.i(TAG,"hookapp"); return false; }
            if(isRooted(ctx)){ Log.i(TAG,"rooted-log-only"); } // may root van cho chay
            if(isEmulator()){ Log.i(TAG,"emu-log-only"); } // multi hay chay ao, chi log
            blockReports();
            scheduleRecheck(ctx);
            return true;
        }catch(Exception e){ return true; }
    }

    // 0. In hash chu ky de dien EXPECT (chay 1 lan tren APK da sign that)
    static void logCert(Context ctx){
        try{
            String h = certSha256(ctx);
            if(h != null) Log.i(TAG, "cert-sha256=" + h);
        }catch(Exception e){}
    }
    static String certSha256(Context ctx){
        try{
            PackageManager pm = ctx.getPackageManager();
            String pkg = ctx.getPackageName();
            PackageInfo pi = pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES);
            if(pi == null || pi.signatures == null || pi.signatures.length == 0) return null;
            Signature s = pi.signatures[0];
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            byte[] b = d.digest(s.toByteArray());
            StringBuilder sb = new StringBuilder();
            for(byte x : b) sb.append(String.format("%02x", x));
            return sb.toString();
        }catch(Exception e){ return null; }
    }
    // Chong repack: APK bi ky lai bang key khac la chet. Chua dien EXPECT thi bo qua.
    static boolean verifySignature(Context ctx){
        try{
            if(EXPECT_CERT_SHA256.startsWith("PUT_")) return true;
            String h = certSha256(ctx);
            return h != null && h.equalsIgnoreCase(EXPECT_CERT_SHA256);
        }catch(Exception e){ return true; }
    }

    // 0b. libMixu.so phai ton tai va du lon (chong xoa/thay lib)
    static boolean verifyLib(Context ctx){
        try{
            File lib = new File(ctx.getApplicationInfo().nativeLibraryDir + "/libMixu.so");
            return lib.exists() && lib.length() >= MIXU_MIN_SIZE;
        }catch(Exception e){ return true; }
    }

    // 1. anti-debug
    static boolean isDebugger(){
        if(Debug.isDebuggerConnected() || Debug.waitingForDebugger()) return true;
        return hasTracerPid();
    }
    static boolean hasTracerPid(){
        try{
            BufferedReader r = new BufferedReader(new FileReader("/proc/self/status"));
            String l; while((l = r.readLine()) != null){
                if(l.startsWith("TracerPid:")){
                    int v = Integer.parseInt(l.split(":")[1].trim());
                    r.close(); return v != 0;
                }
            } r.close();
        }catch(Exception e){}
        return false;
    }

    // 2. anti-frida / hook mo rong: maps + thread + port + app hook
    static final Set<String> MAPS_BAD = new HashSet<>(Arrays.asList(
        "frida", "gum-js", "gadget", "linjector", "substrate", "cydia",
        "hookzz", "shadowhook", "dobby", "whale", "xposed", "edxp",
        "riru", "zygisk", "lsposed", "edxposed", "pool-frida", "frida-agent"
    ));
    static boolean hasFrida(){
        try{
            BufferedReader r = new BufferedReader(new FileReader("/proc/self/maps"));
            String l; while((l = r.readLine()) != null){
                String s = l.toLowerCase();
                for(String b : MAPS_BAD){
                    // bo qua dong cua chinh lib he thong co ten trung lap tinh co
                    if(s.contains(b) && !s.contains("libmixu")){
                        // magisk/zygisk chi log o muc root, o day chi block frida/hook that
                        if(b.equals("zygisk") || b.equals("riru")) continue;
                        r.close(); return true;
                    }
                }
            } r.close();
            Set<String> bad = new HashSet<>(Arrays.asList(
                "gmain", "gum-js-loop", "frida", "linjector", "gdb", "lldb"));
            try{
                File d = new File("/proc/self/task");
                File[] ts = d.listFiles();
                if(ts != null) for(File t : ts){
                    String n = readAll("/proc/self/task/" + t.getName() + "/comm").toLowerCase().trim();
                    if(bad.contains(n)) return true;
                }
            }catch(Exception e){}
            int[] ports = {27042, 27047}; // frida server mac dinh
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

    // 2b. app hook cai tren may (xposed/edxposed/substrate). Block vi de bi soi menu.
    static boolean hasHookApp(Context ctx){
        try{
            String[] pkgs = {"de.robv.android.xposed.installer", "org.meowcat.edxposed.manager",
                "com.saurik.substrate", "org.lsposed.manager", "io.va.exposed"};
            PackageManager pm = ctx.getPackageManager();
            for(String p : pkgs){
                try{ pm.getPackageInfo(p, 0); return true; }catch(Exception e){}
            }
        }catch(Exception e){}
        return false;
    }

    // 3. root (log only) + emulator (log only - multi hay chay ao)
    static boolean isRooted(Context ctx){
        String[] paths = {"/system/bin/su", "/system/xbin/su", "/sbin/su", "/sbin/.magisk",
            "/system/app/Superuser.apk", "/data/adb/magisk", "/data/adb/modules", "/data/adb/ksu"};
        for(String p : paths) if(new File(p).exists()) return true;
        try{
            String tags = android.os.Build.TAGS;
            if(tags != null && tags.contains("test-keys")) return true;
        }catch(Exception e){}
        return false;
    }
    static boolean isEmulator(){
        try{
            String f = android.os.Build.FINGERPRINT;
            String m = android.os.Build.MODEL;
            String p = android.os.Build.PRODUCT;
            if(f != null && (f.contains("generic") || f.contains("vbox") || f.contains("test-keys"))) return true;
            if(m != null && (m.contains("Emulator") || m.contains("Android SDK"))) return true;
            if(p != null && (p.contains("sdk") || p.contains("vbox"))) return true;
        }catch(Exception e){}
        return false;
    }

    // 4. CHAN THAT report: host nam trong den -> di qua proxy chet (127.0.0.1:9) nen fail nhanh.
    //    Ban cu chi log. Test acc clone: neu game crash/mat mang thi rut bot domain do ra khoi den.
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
                            // chi chan duong dan report, tha duong dan choi game de tranh mat ket noi
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

    // 5. tu kiem tra lai sau 60s (bat debug/frida tre). Phat hien la kill process.
    static void scheduleRecheck(final Context ctx){
        try{
            final Context app = ctx.getApplicationContext();
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable(){
                public void run(){
                    try{
                        if(isDebugger() || hasTracerPid() || hasFrida()){
                            Log.i(TAG, "recheck-dirty");
                            android.os.Process.killProcess(android.os.Process.myPid());
                        } else {
                            scheduleRecheck(app);
                        }
                    }catch(Exception e){}
                }
            }, 60000);
        }catch(Exception e){}
    }

    // 6. native manh hon (optional): build libAntiMicu.so bang NDK roi goi o day
    static{
        try{ System.loadLibrary("AntiMicu"); }catch(Exception e){}
    }
    public static native int nativeGate(); // tra 0 = sach, !=0 = bi debug
}
