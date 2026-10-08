package com.createbrands.printagent;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Talks to admin-api the way the POS does (pos:true calls need no PIN). */
public class Api {
    public static final String BASE = "https://qtjsdbasoouslcpinqhu.supabase.co";
    public static final String VERSION = "1.0";
    public static final String WEB = "https://chocoberry-menu.vercel.app";
    /** The public anon key. Resolved once from the web app's bundle (it is public by design) and cached in prefs. */
    public static volatile String KEY = null;
    private static android.content.SharedPreferences store;
    public static void init(android.content.Context ctx) { store = ctx.getSharedPreferences("agent", android.content.Context.MODE_PRIVATE); KEY = store.getString("anon_key", null); }
    private static String fetchText(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection(); c.setConnectTimeout(10000); c.setReadTimeout(25000);
        return read(c.getInputStream());
    }
    public static synchronized String key() throws Exception {
        if (KEY != null) return KEY;
        String html = fetchText(WEB + "/index.html");
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("src=\"(/assets/index-[^\"]+\\.js)\"").matcher(html);
        if (!m.find()) throw new Exception("Could not find the web app bundle");
        String js = fetchText(WEB + m.group(1));
        java.util.regex.Matcher k = java.util.regex.Pattern.compile("eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}").matcher(js);
        while (k.find()) {
            String tok = k.group();
            try { String payload = new String(android.util.Base64.decode(tok.split("\\.")[1], android.util.Base64.URL_SAFE | android.util.Base64.NO_PADDING | android.util.Base64.NO_WRAP), StandardCharsets.UTF_8); if (payload.contains("\"anon\"")) { KEY = tok; store.edit().putString("anon_key", tok).apply(); return tok; } } catch (Exception ignored) {}
        }
        throw new Exception("Anon key not found in the web app");
    }

    private static String read(InputStream in) throws IOException {
        if (in == null) return "";
        ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[8192]; int n;
        while ((n = in.read(b)) > 0) bo.write(b, 0, n);
        return new String(bo.toByteArray(), StandardCharsets.UTF_8);
    }

    private static JSONObject post(String action, JSONObject data) throws Exception {
        JSONObject body = new JSONObject().put("pos", true).put("action", action).put("data", data);
        HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/functions/v1/admin-api").openConnection();
        c.setConnectTimeout(10000); c.setReadTimeout(25000); c.setRequestMethod("POST"); c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        String key = key();
        c.setRequestProperty("apikey", key); c.setRequestProperty("Authorization", "Bearer " + key);
        try (OutputStream o = c.getOutputStream()) { o.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int code = c.getResponseCode();
        String txt = read(code >= 400 ? c.getErrorStream() : c.getInputStream());
        try { return new JSONObject(txt).put("_http", code); }
        catch (Exception e) { return new JSONObject().put("ok", false).put("_http", code).put("error", txt.length() > 200 ? txt.substring(0, 200) : txt); }
    }

    public static List<String[]> stores() throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(BASE + "/rest/v1/menu_locations?select=id,name&active=eq.true&order=name").openConnection();
        String key = key();
        c.setRequestProperty("apikey", key); c.setRequestProperty("Authorization", "Bearer " + key);
        JSONArray arr = new JSONArray(read(c.getInputStream()));
        List<String[]> out = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) { JSONObject o = arr.getJSONObject(i); out.add(new String[]{ o.getString("id"), o.getString("name") }); }
        return out;
    }

    public static JSONObject register(String locationId, String sn, String label, String station, String pin, String model, int paper) throws Exception {
        return post("device_printer_register", new JSONObject().put("location_id", locationId).put("sn", sn).put("label", label).put("station", station).put("manager_pin", pin).put("model", model).put("paper_mm", paper));
    }
    public static JSONArray jobs(String sn, int paper) throws Exception {
        JSONObject j = post("local_print_jobs", new JSONObject().put("sn", sn).put("agent_version", VERSION).put("paper_mm", paper));
        JSONArray a = j.optJSONArray("jobs"); return a == null ? new JSONArray() : a;
    }
    public static void done(Object id, String sn, boolean ok, String error) throws Exception {
        post("local_print_done", new JSONObject().put("id", id).put("sn", sn).put("ok", ok).put("error", error == null ? JSONObject.NULL : error));
    }
    public static JSONObject testPrint(String sn, String locationId) throws Exception {
        return post("usb_printer_test", new JSONObject().put("sn", sn).put("location_id", locationId));
    }
}
