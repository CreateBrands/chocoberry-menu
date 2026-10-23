package com.createbrands.customerdisplay;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** The store list for the picker. Same public anon key and table the Print Agent reads. */
public class Stores {
    public static final String BASE = "https://qtjsdbasoouslcpinqhu.supabase.co";
    public static final String WEB = "https://chocoberry-menu.vercel.app";

    private static String read(InputStream in) throws IOException {
        if (in == null) return "";
        ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[8192]; int n;
        while ((n = in.read(b)) > 0) bo.write(b, 0, n);
        return new String(bo.toByteArray(), StandardCharsets.UTF_8);
    }
    private static String fetch(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection(); c.setConnectTimeout(10000); c.setReadTimeout(25000);
        return read(c.getInputStream());
    }
    /** The anon key is public by design; read it from the web app's bundle once and keep it. */
    private static String key(Prefs prefs) throws Exception {
        String k = prefs.anonKey(); if (k != null) return k;
        String html = fetch(WEB + "/index.html");
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("src=\"(/assets/index-[^\"]+\\.js)\"").matcher(html);
        if (!m.find()) throw new Exception("Could not find the web app");
        String js = fetch(WEB + m.group(1));
        java.util.regex.Matcher t = java.util.regex.Pattern.compile("eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}").matcher(js);
        while (t.find()) {
            String tok = t.group();
            try {
                String payload = new String(android.util.Base64.decode(tok.split("\\.")[1], android.util.Base64.URL_SAFE | android.util.Base64.NO_PADDING | android.util.Base64.NO_WRAP), StandardCharsets.UTF_8);
                if (payload.contains("\"anon\"")) { prefs.anonKey(tok); return tok; }
            } catch (Exception ignored) {}
        }
        throw new Exception("Could not read the store list");
    }
    public static List<String[]> list(Prefs prefs) throws Exception {
        String k = key(prefs);
        HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/rest/v1/menu_locations?select=id,name&active=eq.true&order=name").openConnection();
        c.setConnectTimeout(10000); c.setReadTimeout(25000);
        c.setRequestProperty("apikey", k); c.setRequestProperty("Authorization", "Bearer " + k);
        JSONArray arr = new JSONArray(read(c.getInputStream()));
        List<String[]> out = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) { JSONObject o = arr.getJSONObject(i); out.add(new String[]{ o.getString("id"), o.getString("name") }); }
        return out;
    }
    /** The tills at a store (kds_screens licences that can take payment): { key, label }. */
    public static List<String[]> tills(Prefs prefs, String loc) throws Exception {
        String k = key(prefs);
        HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/rest/v1/kds_screens?select=screen_key,label,kind,status&location_id=eq." + loc + "&order=label").openConnection();
        c.setConnectTimeout(10000); c.setReadTimeout(25000);
        c.setRequestProperty("apikey", k); c.setRequestProperty("Authorization", "Bearer " + k);
        JSONArray arr = new JSONArray(read(c.getInputStream()));
        List<String[]> out = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.getJSONObject(i);
            String kind = o.optString("kind", ""), status = o.optString("status", "");
            if (!kind.contains("pos") || "revoked".equals(status)) continue;
            String label = o.optString("label", ""); if (label.isEmpty() || "null".equals(label)) label = o.getString("screen_key");
            out.add(new String[]{ o.getString("screen_key"), label });
        }
        return out;
    }
}
