package com.createbrands.customerdisplay;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

/**
 * Backup route to the rear screen: a full-screen activity launched onto that
 * display. Used only when the device refuses an overlay window there. It
 * lives in its own task on the rear screen, so the till in front is untouched.
 */
public class DisplayActivity extends Activity {
    public static final String ACTION_CLOSE = "com.createbrands.customerdisplay.CLOSE";
    private WebView web;
    private final BroadcastReceiver rx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (DisplayService.ACTION_RELOAD.equals(i.getAction())) { if (web != null) { web.clearCache(false); web.reload(); } }
            else finish();
        }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        final Prefs p = new Prefs(this);
        if (p.locationId() == null) { finish(); return; }
        web = Web.make(this, Web.url(p.locationId()), p.storeName(), new Web.Status() { public void set(String s) { DisplayService.report(DisplayActivity.this, s); } });
        setContentView(web);
        IntentFilter f = new IntentFilter(ACTION_CLOSE); f.addAction(DisplayService.ACTION_RELOAD);
        registerReceiver(rx, f);
    }
    @Override public void onBackPressed() { /* stays up; turn it off from the app */ }
    @Override protected void onDestroy() {
        try { unregisterReceiver(rx); } catch (Exception ignored) {}
        if (web != null) { try { web.destroy(); } catch (Exception ignored) {} }
        super.onDestroy();
    }
}
