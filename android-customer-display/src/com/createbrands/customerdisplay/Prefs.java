package com.createbrands.customerdisplay;

import android.content.Context;
import android.content.SharedPreferences;

public class Prefs {
    private final SharedPreferences sp;
    public Prefs(Context ctx) { sp = ctx.getSharedPreferences("display", Context.MODE_PRIVATE); }
    public String locationId() { return sp.getString("loc", null); }
    public String storeName() { return sp.getString("store", ""); }
    public void store(String id, String name) { sp.edit().putString("loc", id).putString("store", name).apply(); }
    /** Posters on (default) or the rear screen handed back to Android. */
    public boolean enabled() { return sp.getBoolean("enabled", true); }
    public void enabled(boolean v) { sp.edit().putBoolean("enabled", v).apply(); }
    public String lastStatus() { return sp.getString("status", "Not started"); }
    public void lastStatus(String v) { sp.edit().putString("status", v).apply(); }
    public String anonKey() { return sp.getString("anon_key", null); }
    public void anonKey(String v) { sp.edit().putString("anon_key", v).apply(); }
}
