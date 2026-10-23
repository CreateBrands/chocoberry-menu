package com.createbrands.customerdisplay;

import android.app.Activity;
import android.content.*;
import android.graphics.Color;
import android.graphics.Typeface;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Display;
import android.view.View;
import android.widget.*;
import java.util.ArrayList;
import java.util.List;

/** Set-up screen: pick the store, allow the permission, turn posters on or off. */
public class MainActivity extends Activity {
    private Prefs prefs; private final Handler ui = new Handler(Looper.getMainLooper());
    private List<String[]> stores = new ArrayList<>();
    private TextView status, screens, permText; private Spinner store, tillSpin;
    private List<String[]> tills = new ArrayList<>(); private boolean loadingTills = true; private Button allow, toggle, reload;
    private boolean loadingStores = true;
    private final BroadcastReceiver statusRx = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { status.setText(i.getStringExtra("status")); } };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = new Prefs(this);
        float dp = getResources().getDisplayMetrics().density;
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(Color.parseColor("#FFFBF2"));
        LinearLayout col = new LinearLayout(this); col.setOrientation(LinearLayout.VERTICAL); int pad = (int) (28 * dp); col.setPadding(pad, pad, pad, pad);
        sv.addView(col);

        TextView title = text("Customer Display", 28, "#1F2A24"); title.setTypeface(Typeface.DEFAULT_BOLD); col.addView(title);
        col.addView(text("Shows your store's posters on the screen facing the customer. Posters are set in Admin → store → Branding → Customer display.", 14, "#5F6B63"));

        status = text(prefs.lastStatus(), 17, "#344D42"); status.setTypeface(Typeface.DEFAULT_BOLD);
        status.setBackgroundColor(Color.parseColor("#DCEBD8")); status.setPadding((int) (16 * dp), (int) (16 * dp), (int) (16 * dp), (int) (16 * dp));
        col.addView(status, margins(18, dp));

        col.addView(text("Store", 13, "#5F6B63"), margins(18, dp));
        store = new Spinner(this); col.addView(store, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (int) (52 * dp)));
        store.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            public void onItemSelected(AdapterView<?> p, View v, int pos, long id) {
                if (loadingStores || pos < 0 || pos >= stores.size()) return;
                String[] s = stores.get(pos);
                if (s[0].equals(prefs.locationId())) return;
                prefs.store(s[0], s[1]);
                DisplayService.start(MainActivity.this);
                loadTills();
            }
            public void onNothingSelected(AdapterView<?> p) {}
        });

        // Which till this screen faces, so at a store with two tills each
        // customer sees only their own payment.
        col.addView(text("Which till is this screen on?", 13, "#5F6B63"), margins(14, dp));
        tillSpin = new Spinner(this); col.addView(tillSpin, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (int) (52 * dp)));
        tillSpin.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            public void onItemSelected(AdapterView<?> p, View v, int pos, long id) {
                if (loadingTills) return;
                String key = pos <= 0 || pos > tills.size() ? null : tills.get(pos - 1)[0];
                String label = key == null ? "" : tills.get(pos - 1)[1];
                String cur = prefs.till();
                if (key == null ? cur == null : key.equals(cur)) return;
                prefs.till(key, label);
                DisplayService.start(MainActivity.this);
            }
            public void onNothingSelected(AdapterView<?> p) {}
        });

        permText = text("", 14, "#5F6B63"); col.addView(permText, margins(14, dp));
        allow = new Button(this); allow.setText("Allow display over other apps"); col.addView(allow);
        allow.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); }
            catch (Exception e) { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); }
        }});

        toggle = new Button(this); col.addView(toggle, margins(8, dp));
        toggle.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            prefs.enabled(!prefs.enabled());
            DisplayService.start(MainActivity.this);
            render();
        }});
        reload = new Button(this); reload.setText("Reload posters now"); col.addView(reload);
        reload.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { DisplayService.reload(MainActivity.this); toast("Reloading — new posters appear in a few seconds"); } });

        Button battery = new Button(this); battery.setText("Keep running in background"); col.addView(battery);
        battery.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            try {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm.isIgnoringBatteryOptimizations(getPackageName())) { toast("Already allowed to run in the background"); return; }
                startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).setData(Uri.parse("package:" + getPackageName())));
            } catch (Exception e) { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:" + getPackageName()))); }
        }});

        screens = text("", 13, "#5F6B63"); col.addView(screens, margins(18, dp));
        setContentView(sv);

        new Thread(new Runnable() { public void run() {
            String err = null;
            try { stores = Stores.list(prefs); } catch (Exception e) { err = e.getMessage(); }
            final String fe = err;
            ui.post(new Runnable() { public void run() {
                List<String> names = new ArrayList<>();
                if (stores.isEmpty()) names.add(fe == null ? "No stores found" : "Offline — " + fe);
                for (String[] s : stores) names.add(s[1]);
                store.setAdapter(new ArrayAdapter<>(MainActivity.this, android.R.layout.simple_spinner_dropdown_item, names));
                String cur = prefs.locationId(); int sel = -1;
                if (cur != null) for (int i = 0; i < stores.size(); i++) if (stores.get(i)[0].equals(cur)) sel = i;
                if (sel >= 0) store.setSelection(sel);
                // Nothing chosen yet: take the first store so it starts showing straight away.
                if (cur == null && !stores.isEmpty()) { prefs.store(stores.get(0)[0], stores.get(0)[1]); DisplayService.start(MainActivity.this); }
                ui.post(new Runnable() { public void run() { loadingStores = false; } });
                loadTills();
            }});
        }}).start();
    }

    private void loadTills() {
        final String loc = prefs.locationId(); if (loc == null) return;
        loadingTills = true;
        new Thread(new Runnable() { public void run() {
            List<String[]> got = new ArrayList<>();
            try { got = Stores.tills(prefs, loc); } catch (Exception ignored) {}
            final List<String[]> fin = got;
            ui.post(new Runnable() { public void run() {
                if (!loc.equals(prefs.locationId())) return;
                tills = fin;
                List<String> names = new ArrayList<>(); names.add("Any till at this store");
                for (String[] t : tills) names.add(t[1]);
                tillSpin.setAdapter(new ArrayAdapter<>(MainActivity.this, android.R.layout.simple_spinner_dropdown_item, names));
                String cur = prefs.till(); int sel = 0;
                if (cur != null) for (int i = 0; i < tills.size(); i++) if (tills.get(i)[0].equals(cur)) sel = i + 1;
                // Only one till at the store: that is this one.
                if (cur == null && tills.size() == 1) { sel = 1; prefs.till(tills.get(0)[0], tills.get(0)[1]); DisplayService.start(MainActivity.this); }
                tillSpin.setSelection(sel);
                ui.post(new Runnable() { public void run() { loadingTills = false; } });
            }});
        }}).start();
    }

    private void render() {
        boolean perm = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this);
        permText.setText(perm ? "Permission: allowed ✓" : "Permission needed: tap the button, then switch on \"Allow display over other apps\" for Customer Display and come back.");
        allow.setVisibility(perm ? View.GONE : View.VISIBLE);
        toggle.setText(prefs.enabled() ? "Turn posters off" : "Turn posters on");
        reload.setEnabled(prefs.enabled());
        DisplayManager dm = (DisplayManager) getSystemService(DISPLAY_SERVICE);
        StringBuilder sb = new StringBuilder("Screens on this device:");
        for (Display d : dm.getDisplays()) sb.append("\n · ").append(d.getName()).append(d.getDisplayId() == Display.DEFAULT_DISPLAY ? " (main)" : "");
        if (dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION).length == 0) sb.append("\nNo customer screen detected.");
        screens.setText(sb.toString());
    }

    @Override protected void onResume() {
        super.onResume();
        registerReceiver(statusRx, new IntentFilter(DisplayService.ACTION_STATUS));
        status.setText(prefs.lastStatus());
        render();
        if (prefs.enabled()) DisplayService.start(this); // e.g. coming back from granting the permission
    }
    @Override protected void onPause() { super.onPause(); try { unregisterReceiver(statusRx); } catch (Exception ignored) {} }

    private TextView text(String s, int sp, String color) { TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(Color.parseColor(color)); t.setLineSpacing(0, 1.2f); return t; }
    private LinearLayout.LayoutParams margins(int top, float dp) { LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT); lp.topMargin = (int) (top * dp); return lp; }
    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }
}
