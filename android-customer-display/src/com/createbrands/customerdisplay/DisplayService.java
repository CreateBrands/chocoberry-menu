package com.createbrands.customerdisplay;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Display;
import android.view.Gravity;
import android.view.WindowManager;
import android.webkit.WebView;

/**
 * Puts the store's posters (/display?loc=…) on the till's customer-facing screen.
 *
 * Android mirrors the till onto a Sunmi's rear screen until an app claims it.
 * Two ways to claim it, tried in order:
 *  1. An overlay window added straight to the rear screen from this service
 *     (needs "display over other apps"). On Android 11+ the window has to be
 *     made from a window context of the overlay type — a Presentation can't be
 *     used here, it insists on its own window type and the D3 Pro refused it
 *     with IllegalArgumentException.
 *  2. If the device still refuses, a full-screen activity launched onto the
 *     rear screen (DisplayActivity), which keeps its own task there.
 * Runs as a foreground service so it stays up whatever the till's main screen
 * is doing; starts on boot; follows the rear screen being unplugged/replugged.
 */
public class DisplayService extends Service {
    public static final String CH = "customerdisplay";
    public static final String ACTION_STATUS = "com.createbrands.customerdisplay.STATUS";
    public static final String ACTION_RELOAD = "com.createbrands.customerdisplay.RELOAD";
    private static final int TYPE_OVERLAY = Build.VERSION.SDK_INT >= 26 ? 2038 /* APPLICATION_OVERLAY */ : 2003 /* SYSTEM_ALERT */;
    private static final long FRESH_MS = 6L * 3600 * 1000;    // pick up new web builds a few times a day

    private Handler ui; private DisplayManager dm;
    private WindowManager shownWm; private WebView web;       // route 1
    private boolean activityMode;                             // route 2
    private int shownOn = -1; private String shownLoc;

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
        else if (reload && activityMode) { sendBroadcast(new Intent(ACTION_RELOAD).setPackage(getPackageName())); status("Reloading posters…"); }
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
        String key = loc + "|" + (p.till() == null ? "" : p.till());   // a new till pairing reloads the page
        if ((web != null || activityMode) && shownOn == d.getDisplayId() && key.equals(shownLoc)) return;
        dismiss();
        show(d, key, p.storeName());
    }

    /** The rear screen: Android lists it as a presentation display; otherwise any screen that isn't the main one. */
    private Display pick() {
        Display[] ds = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        if (ds != null && ds.length > 0) return ds[0];
        for (Display x : dm.getDisplays()) if (x.getDisplayId() != Display.DEFAULT_DISPLAY) return x;
        return null;
    }

    private void show(Display d, String loc, String storeName) {
        String why1;
        try { showOverlay(d, storeName); shownOn = d.getDisplayId(); shownLoc = loc; return; }
        catch (Throwable e) { why1 = describe(e); dismissOverlay(); }
        String why2;
        try { showActivity(d); activityMode = true; shownOn = d.getDisplayId(); shownLoc = loc; status("Loading posters (screen mode) · " + storeName); return; }
        catch (Throwable e) { why2 = describe(e); }
        status("Couldn't open the customer screen. 1: " + why1 + " · 2: " + why2);
    }

    /** Route 1: an overlay window on the rear screen. */
    private void showOverlay(Display d, String storeName) throws Exception {
        Prefs p = new Prefs(this);
        Context dc = createDisplayContext(d);
        Context wc = dc;
        if (Build.VERSION.SDK_INT >= 30) {
            // Context.createWindowContext(int, Bundle) is API 30; this is built against 23.
            wc = (Context) Context.class.getMethod("createWindowContext", int.class, Bundle.class).invoke(dc, TYPE_OVERLAY, null);
        }
        WindowManager wm = (WindowManager) wc.getSystemService(Context.WINDOW_SERVICE);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, TYPE_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE            // never takes the keyboard from the till
                        | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_FULLSCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.OPAQUE);
        lp.gravity = Gravity.TOP | Gravity.START;
        WebView w = Web.make(wc, Web.url(p.locationId(), p.till()), storeName, new Web.Status() { public void set(String s) { status(s); } });
        web = w; shownWm = wm;
        wm.addView(w, lp);
        status("Loading posters · " + (storeName == null ? "" : storeName));
    }

    /** Route 2: a full-screen activity launched onto the rear screen. */
    private void showActivity(Display d) throws Exception {
        if (Build.VERSION.SDK_INT < 26) throw new Exception("needs Android 8");
        ActivityOptions o = ActivityOptions.makeBasic();
        ActivityOptions.class.getMethod("setLaunchDisplayId", int.class).invoke(o, d.getDisplayId());
        Intent i = new Intent(this, DisplayActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        startActivity(i, o.toBundle());
    }

    private void dismissOverlay() {
        if (web != null && shownWm != null) { try { shownWm.removeView(web); } catch (Exception ignored) {} }
        if (web != null) { try { web.destroy(); } catch (Exception ignored) {} }
        web = null; shownWm = null;
    }

    private void dismiss() {
        dismissOverlay();
        if (activityMode) { sendBroadcast(new Intent(DisplayActivity.ACTION_CLOSE).setPackage(getPackageName())); activityMode = false; }
        shownOn = -1; shownLoc = null;
    }

    private static String describe(Throwable e) {
        Throwable c = e; while (c.getCause() != null && c != c.getCause()) c = c.getCause();   // unwrap reflection
        String m = c.getMessage();
        return c.getClass().getSimpleName() + (m == null ? "" : ": " + (m.length() > 140 ? m.substring(0, 140) : m));
    }

    private void status(String s) { report(this, s); }
    /** Status line in the app and the notification; also used by DisplayActivity. */
    static void report(Context ctx, String s) {
        new Prefs(ctx).lastStatus(s);
        ((NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE)).notify(1, notif(ctx, s));
        ctx.sendBroadcast(new Intent(ACTION_STATUS).setPackage(ctx.getPackageName()).putExtra("status", s));
    }

    @Override public void onDestroy() {
        try { dm.unregisterDisplayListener(displays); } catch (Exception ignored) {}
        ui.removeCallbacksAndMessages(null);
        dismiss();
        super.onDestroy();
    }

    private Notification notif(String text) { return notif(this, text); }
    // Compiled against API 23; notification channels (26+) by reflection, as in the Print Agent.
    private static Notification notif(Context ctx, String text) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
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
                b = Notification.Builder.class.getConstructor(Context.class, String.class).newInstance(ctx, CH);
            } catch (Exception ignored) {}
        }
        if (b == null) b = new Notification.Builder(ctx);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, new Intent(ctx, MainActivity.class), 0x04000000 /* FLAG_IMMUTABLE */);
        return b.setSmallIcon(R.drawable.ic_display).setContentTitle("Customer Display").setContentText(text).setOngoing(true).setContentIntent(pi).build();
    }

    public static void start(Context ctx) { send(ctx, new Intent(ctx, DisplayService.class)); }
    public static void reload(Context ctx) { send(ctx, new Intent(ctx, DisplayService.class).setAction(ACTION_RELOAD)); }
    private static void send(Context ctx, Intent i) {
        if (Build.VERSION.SDK_INT >= 26) { try { Context.class.getMethod("startForegroundService", Intent.class).invoke(ctx, i); return; } catch (Exception ignored) {} }
        ctx.startService(i);
    }
}
