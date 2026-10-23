package com.createbrands.customerdisplay;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Display;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Puts the store's posters (/display?loc=…) on the till's customer-facing screen.
 *
 * Android mirrors the till onto a Sunmi's rear screen until an app claims it.
 * This claims it with a Presentation — Android's API for a second screen —
 * drawn from a foreground service, so it stays up whatever the till's main
 * screen is doing (Chrome running the POS in front, screen locked, app closed).
 * A window owned by a service needs "display over other apps", hence the
 * overlay window type. Starts on boot and comes back if the screen is
 * unplugged and replugged.
 */
public class DisplayService extends Service {
    public static final String CH = "customerdisplay";
    public static final String ACTION_STATUS = "com.createbrands.customerdisplay.STATUS";
    public static final String ACTION_RELOAD = "com.createbrands.customerdisplay.RELOAD";
    private static final long RETRY_MS = 20000;               // page failed to load (offline)
    private static final long FRESH_MS = 6L * 3600 * 1000;    // pick up new web builds a few times a day

    private Handler ui; private DisplayManager dm;
    private Presentation shown; private WebView web; private int shownOn = -1; private String shownLoc;

    private final DisplayManager.DisplayListener displays = new DisplayManager.DisplayListener() {
        public void onDisplayAdded(int id) { refresh(); }
        public void onDisplayRemoved(int id) { if (id == shownOn) dismiss(); refresh(); }
        public void onDisplayChanged(int id) { }
    };
    private final Runnable freshen = new Runnable() { public void run() { if (web != null) web.reload(); ui.postDelayed(this, FRESH_MS); } };

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        startForeground(1, notif("Starting…"));
        ui = new Handler(Looper.getMainLooper());
        dm = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
        dm.registerDisplayListener(displays, ui);
        ui.postDelayed(freshen, FRESH_MS);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        boolean reload = intent != null && ACTION_RELOAD.equals(intent.getAction());
        if (reload && web != null) { web.clearCache(false); web.reload(); status("Reloading posters…"); }
        else refresh();
        return START_STICKY;
    }

    /** Make the rear screen match the settings: posters for the chosen store, or nothing. */
    private void refresh() {
        Prefs p = new Prefs(this);
        if (!p.enabled()) { dismiss(); status("Off — the customer screen is back to normal"); stopSelf(); return; }
        String loc = p.locationId();
        if (loc == null) { dismiss(); status("Pick the store in Customer Display"); return; }
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this)) { dismiss(); status("Needs permission — open Customer Display and tap Allow"); return; }
        Display d = pick();
        if (d == null) { dismiss(); status("No customer screen found on this device"); return; }
        if (shown != null && shownOn == d.getDisplayId() && loc.equals(shownLoc)) return;
        dismiss();
        show(d, loc, p.storeName());
    }

    /** The rear screen: Android lists it as a presentation display; otherwise any screen that isn't the main one. */
    private Display pick() {
        Display[] ds = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        if (ds != null && ds.length > 0) return ds[0];
        for (Display x : dm.getDisplays()) if (x.getDisplayId() != Display.DEFAULT_DISPLAY) return x;
        return null;
    }

    private void show(Display d, String loc, String storeName) {
        Presentation pr = new Presentation(this, d, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        // A service has no window of its own to hang this from: it must be an
        // overlay window (TYPE_APPLICATION_OVERLAY on 8+, TYPE_SYSTEM_ALERT before).
        pr.getWindow().setType(Build.VERSION.SDK_INT >= 26 ? 2038 : 2003);
        pr.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        final WebView w = new WebView(pr.getContext());
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // the page caches the last good posters for offline
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        w.setBackgroundColor(Color.BLACK);
        w.setVerticalScrollBarEnabled(false); w.setHorizontalScrollBarEnabled(false);
        w.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        final String url = Stores.WEB + "/display?loc=" + loc + "&src=app";
        w.setWebViewClient(new WebViewClient() {
            @SuppressWarnings("deprecation")
            @Override public void onReceivedError(WebView v, int code, String desc, String failing) {
                status("Offline — retrying (" + desc + ")");
                ui.postDelayed(new Runnable() { public void run() { if (web == w) w.loadUrl(url); } }, RETRY_MS);
            }
            @Override public void onPageFinished(WebView v, String u) { if (web == w) status("Showing posters · " + storeName()); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, String u) { return !u.startsWith(Stores.WEB); }
        });
        pr.setContentView(w);
        try { pr.show(); }
        catch (Exception e) { w.destroy(); status("Couldn't open the customer screen: " + e.getClass().getSimpleName()); return; }
        shown = pr; web = w; shownOn = d.getDisplayId(); shownLoc = loc;
        w.loadUrl(url);
        status("Loading posters · " + (storeName == null ? "" : storeName));
    }

    private String storeName() { return new Prefs(this).storeName(); }

    private void dismiss() {
        if (shown != null) { try { shown.dismiss(); } catch (Exception ignored) {} }
        if (web != null) { try { web.destroy(); } catch (Exception ignored) {} }
        shown = null; web = null; shownOn = -1; shownLoc = null;
    }

    private void status(String s) {
        new Prefs(this).lastStatus(s);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(1, notif(s));
        sendBroadcast(new Intent(ACTION_STATUS).setPackage(getPackageName()).putExtra("status", s));
    }

    @Override public void onDestroy() {
        try { dm.unregisterDisplayListener(displays); } catch (Exception ignored) {}
        ui.removeCallbacksAndMessages(null);
        dismiss();
        super.onDestroy();
    }

    // Compiled against API 23; notification channels (26+) by reflection, as in the Print Agent.
    private Notification notif(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b = null;
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                Class<?> chCls = Class.forName("android.app.NotificationChannel");
                Object existing = NotificationManager.class.getMethod("getNotificationChannel", String.class).invoke(nm, CH);
                if (existing == null) {
                    Object ch = chCls.getConstructor(String.class, CharSequence.class, int.class).newInstance(CH, "Customer display", 2 /* IMPORTANCE_LOW */);
                    chCls.getMethod("setShowBadge", boolean.class).invoke(ch, false);
                    NotificationManager.class.getMethod("createNotificationChannel", chCls).invoke(nm, ch);
                }
                b = Notification.Builder.class.getConstructor(Context.class, String.class).newInstance(this, CH);
            } catch (Exception ignored) {}
        }
        if (b == null) b = new Notification.Builder(this);
        PendingIntent pi = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), 0x04000000 /* FLAG_IMMUTABLE */);
        return b.setSmallIcon(R.drawable.ic_display).setContentTitle("Customer Display").setContentText(text).setOngoing(true).setContentIntent(pi).build();
    }

    public static void start(Context ctx) { send(ctx, new Intent(ctx, DisplayService.class)); }
    public static void reload(Context ctx) { send(ctx, new Intent(ctx, DisplayService.class).setAction(ACTION_RELOAD)); }
    private static void send(Context ctx, Intent i) {
        if (Build.VERSION.SDK_INT >= 26) { try { Context.class.getMethod("startForegroundService", Intent.class).invoke(ctx, i); return; } catch (Exception ignored) {} }
        ctx.startService(i);
    }
}
