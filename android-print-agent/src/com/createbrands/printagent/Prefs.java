package com.createbrands.printagent;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;

public class Prefs {
    private final SharedPreferences sp;
    private final String androidId;
    public Prefs(Context ctx) {
        sp = ctx.getSharedPreferences("agent", Context.MODE_PRIVATE);
        String id = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ANDROID_ID);
        androidId = id == null ? "device00" : id;
    }
    /** Printer serial this device answers to on the server. Fixed per device. */
    public String sn() { String t = androidId.length() > 8 ? androidId.substring(androidId.length() - 8) : androidId; return "agent:" + t; }
    public String locationId() { return sp.getString("loc", null); }
    public void locationId(String v) { sp.edit().putString("loc", v).apply(); }
    public String storeName() { return sp.getString("store", ""); }
    public void storeName(String v) { sp.edit().putString("store", v).apply(); }
    public String label() { return sp.getString("label", "Till printer"); }
    public void label(String v) { sp.edit().putString("label", v).apply(); }
    public boolean registered() { return sp.getBoolean("registered", false); }
    public void registered(boolean v) { sp.edit().putBoolean("registered", v).apply(); }
    public String lastStatus() { return sp.getString("status", "Not started"); }
    public void lastStatus(String v) { sp.edit().putString("status", v).apply(); }
    public int printed() { return sp.getInt("printed", 0); }
    public void printed(int v) { sp.edit().putInt("printed", v).apply(); }
}
