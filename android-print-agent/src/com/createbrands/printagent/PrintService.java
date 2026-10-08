package com.createbrands.printagent;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import org.json.JSONArray;
import org.json.JSONObject;

/** Foreground service: polls this device's print queue and prints each job. Restarts on boot; runs with the screen off and the POS closed. */
public class PrintService extends Service {
    public static final String CH = "printagent";
    public static final String ACTION_STATUS = "com.createbrands.printagent.STATUS";
    private Thread worker; private volatile boolean running; private PowerManager.WakeLock wake;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        startForeground(1, notif("Starting…"));
        wake = ((PowerManager) getSystemService(Context.POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "printagent:poll");
        wake.acquire();
        running = true;
        worker = new Thread(new Runnable() { public void run() { loop(); } }, "print-loop");
        worker.start();
    }

    private void loop() {
        Prefs prefs = new Prefs(this); UsbPrinter usb = new UsbPrinter(this); SunmiPrinter sunmi = new SunmiPrinter(this); Api.init(this);
        long backoff = 3000;
        while (running) {
            try {
                if (!prefs.registered()) { set(prefs, "Not registered — open Print Agent to set up"); sleep(5000); continue; }
                // Which printer: the Sunmi service when this is a Sunmi device (V3 Mix, V2, D3…), else USB.
                boolean useSunmi = !"usb".equals(prefs.backend()) && sunmi.available();
                String name;
                if (useSunmi) {
                    if (!sunmi.ready()) { set(prefs, "Connecting to the Sunmi printer…"); sleep(2000); continue; }
                    int pw = sunmi.paper(); if (pw > 0 && pw != prefs.paper()) prefs.paper(pw);
                    name = "Sunmi printer " + prefs.paper() + "mm";
                } else {
                    android.hardware.usb.UsbDevice d = usb.find();
                    if (d == null) { set(prefs, "No printer found — check the printer is on / connected"); sleep(5000); continue; }
                    if (!usb.hasPermission(d)) { set(prefs, "Printer access not allowed — open Print Agent and tap Allow"); sleep(5000); continue; }
                    name = usb.describe(d);
                }
                JSONArray jobs = Api.jobs(prefs.sn(), prefs.paper());
                if (jobs.length() == 0) { set(prefs, "Online · " + name + " · " + prefs.printed() + " printed"); sleep(3000); backoff = 3000; continue; }
                for (int i = 0; i < jobs.length(); i++) {
                    JSONObject j = jobs.getJSONObject(i); Object id = j.get("id");
                    try {
                        byte[] bytes = UsbPrinter.hexToBytes(j.getString("content_hex"));
                        if (useSunmi) sunmi.print(bytes); else usb.print(bytes);
                        prefs.printed(prefs.printed() + 1);
                        Api.done(id, prefs.sn(), true, null);
                        set(prefs, "Printed " + j.optString("slip", "ticket") + " · " + prefs.printed() + " total");
                    } catch (Exception e) {
                        Api.done(id, prefs.sn(), false, e.getMessage() == null ? "print failed" : e.getMessage());
                        set(prefs, "Print failed: " + e.getMessage());
                        break;
                    }
                }
                sleep(800);
            } catch (Exception e) {
                set(new Prefs(this), "Offline: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
                sleep(backoff); backoff = Math.min(backoff * 2, 30000);
            }
        }
    }

    private void sleep(long ms) { try { Thread.sleep(ms); } catch (InterruptedException ignored) {} }

    private void set(Prefs prefs, String status) {
        prefs.lastStatus(status);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(1, notif(status));
        sendBroadcast(new Intent(ACTION_STATUS).setPackage(getPackageName()).putExtra("status", status));
    }

    // Compiled against API 23; notification channels (API 26) are reached by reflection so the
    // notification still shows on the Android 11 Sunmi devices.
    private Notification notif(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b = null;
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                Class<?> chCls = Class.forName("android.app.NotificationChannel");
                Object existing = NotificationManager.class.getMethod("getNotificationChannel", String.class).invoke(nm, CH);
                if (existing == null) {
                    Object ch = chCls.getConstructor(String.class, CharSequence.class, int.class).newInstance(CH, "Print agent", 2 /* IMPORTANCE_LOW */);
                    chCls.getMethod("setShowBadge", boolean.class).invoke(ch, false);
                    NotificationManager.class.getMethod("createNotificationChannel", chCls).invoke(nm, ch);
                }
                b = Notification.Builder.class.getConstructor(Context.class, String.class).newInstance(this, CH);
            } catch (Exception ignored) {}
        }
        if (b == null) b = new Notification.Builder(this);
        PendingIntent pi = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), 0x04000000 /* FLAG_IMMUTABLE */);
        return b.setSmallIcon(R.drawable.ic_agent).setContentTitle("Print Agent").setContentText(text).setOngoing(true).setContentIntent(pi).build();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) { return START_STICKY; }
    @Override public void onDestroy() { running = false; if (wake != null && wake.isHeld()) wake.release(); super.onDestroy(); }

    public static void start(Context ctx) {
        Intent i = new Intent(ctx, PrintService.class);
        if (Build.VERSION.SDK_INT >= 26) { try { Context.class.getMethod("startForegroundService", Intent.class).invoke(ctx, i); return; } catch (Exception ignored) {} }
        ctx.startService(i);
    }
}
