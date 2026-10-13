package vn.micu.gate;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import android.os.StrictMode;
import org.json.JSONObject;
import java.io.OutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.URL;
import java.security.MessageDigest;
import javax.net.ssl.HttpsURLConnection;

// KeyGate: lop key rieng cho MicuMulti. Goi o Application.onCreate truoc khi load libMixu.
// Cach dung (apktool): them file nay -> smali vn/micu/gate/KeyGate.smali, roi chen 3 dong goi o MainActivity.
// Neu key sai / het han / sai may -> return false, caller tu finish().
public class KeyGate {
    // !!! DOI 2 DONG NAY !!!
    public static final String PANEL_URL = "https://your-host/panel/apiv3.php";
    public static final String SECRET = "thay-secret-nay-di-32-ky-tu";

    public static String deviceId(Context ctx){
        try{
            String a = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ANDROID_ID);
            if(a!=null && a.length()>=4) return a;
        }catch(Exception e){}
        return "unk-"+Build.SERIAL;
    }

    private static String sha256(String s){
        try{
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            byte[] b = d.digest(s.getBytes("UTF-8"));
            StringBuilder sb=new StringBuilder();
            for(byte x:b) sb.append(String.format("%02x", x));
            return sb.toString();
        }catch(Exception e){ return ""; }
    }

    // return true = key song, false = block
    public static boolean check(Context ctx, String userKey){
        String dev = deviceId(ctx);
        String nonce = Long.toHexString(System.nanoTime())+Integer.toHexString((int)(Math.random()*65535));
        String hash = sha256(userKey+"|"+dev+"|"+nonce+"|"+SECRET);
        SharedPreferences sp = ctx.getSharedPreferences("micu-panel-v3", 0);

        // 1. thu offline cache truoc (choi tiep 6h khi mat mang, giong co che cu continue_verified_session_until_key_expiry)
        try{
            String ck = sp.getString("k_"+userKey, "");
            long off = sp.getLong("off_"+userKey, 0);
            String cdev = sp.getString("d_"+userKey, "");
            if(ck.equals(sha256(userKey+"|"+dev+"|"+SECRET)) && off > System.currentTimeMillis()/1000 && cdev.equals(dev)){
                return true;
            }
        }catch(Exception e){}

        // 2. online verify
        try{
            StrictMode.ThreadPolicy p = new StrictMode.ThreadPolicy.Builder().permitAll().build();
            StrictMode.setThreadPolicy(p);
            URL u = new URL(PANEL_URL);
            HttpsURLConnection c = (HttpsURLConnection)u.openConnection();
            c.setConnectTimeout(8000); c.setReadTimeout(8000);
            c.setDoOutput(true); c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type","application/json; charset=utf-8");
            JSONObject o=new JSONObject();
            o.put("action","authenticate"); o.put("key",userKey);
            o.put("device_id",dev); o.put("package",ctx.getPackageName());
            o.put("nonce",nonce); o.put("hash",hash);
            byte[] body=o.toString().getBytes("UTF-8");
            c.setFixedLengthStreamingMode(body.length);
            OutputStream os=c.getOutputStream(); os.write(body); os.close();
            int code=c.getResponseCode();
            InputStream is=(code==200)?c.getInputStream():c.getErrorStream();
            ByteArrayOutputStream ba=new ByteArrayOutputStream();
            byte[] buf=new byte[2048]; int n;
            while((n=is.read(buf))>0) ba.write(buf,0,n);
            is.close();
            JSONObject r=new JSONObject(new String(ba.toByteArray(),"UTF-8"));
            if(r.optBoolean("active",false)){
                // luu cache offline
                sp.edit().putString("k_"+userKey, sha256(userKey+"|"+dev+"|"+SECRET))
                        .putLong("off_"+userKey, r.optLong("offline_until", System.currentTimeMillis()/1000+21600))
                        .putString("d_"+userKey, dev)
                        .putString("lastKey", userKey).apply();
                return true;
            }else{
                // xoa cache, tra ly do de UI hien: expired / device_mismatch / key_banned
                android.util.Log.i("mixu-panel-v3:","auth_result="+r.optString("reason"));
                return false;
            }
        }catch(Exception e){
            // network_retry_session_kept: neu da tung verify ok truoc do thi cho choi tiep 1 lan
            try{
                String last=sp.getString("lastKey","");
                if(last.equals(userKey)) return true;
            }catch(Exception x){}
            return false;
        }
    }
}
