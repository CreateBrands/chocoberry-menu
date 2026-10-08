package com.createbrands.printagent;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.*;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.widget.*;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private Prefs prefs; private UsbPrinter printer; private List<String[]> stores = new ArrayList<>();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView status, sn, registeredText, usbInfo; private Spinner store; private EditText label, station, pin;
    private View registeredBox, setupBox; private Button usbPerm;
    private final BroadcastReceiver statusRx = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { status.setText(i.getStringExtra("status")); } };
    private final BroadcastReceiver usbRx = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { render(); } };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_main);
        prefs = new Prefs(this); printer = new UsbPrinter(this); Api.init(this);
        status = (TextView) findViewById(R.id.status); sn = (TextView) findViewById(R.id.sn); registeredText = (TextView) findViewById(R.id.registeredText); usbInfo = (TextView) findViewById(R.id.usbInfo);
        store = (Spinner) findViewById(R.id.store); label = (EditText) findViewById(R.id.label); station = (EditText) findViewById(R.id.station); pin = (EditText) findViewById(R.id.pin);
        registeredBox = findViewById(R.id.registeredBox); setupBox = findViewById(R.id.setupBox); usbPerm = (Button) findViewById(R.id.usbPerm);
        sn.setText("This device prints as  " + prefs.sn());
        label.setText(prefs.label()); status.setText(prefs.lastStatus());
        render();

        new Thread(new Runnable() { public void run() {
            try { stores = Api.stores(); } catch (Exception ignored) {}
            ui.post(new Runnable() { public void run() {
                List<String> names = new ArrayList<>(); for (String[] s : stores) names.add(s[1]);
                store.setAdapter(new ArrayAdapter<>(MainActivity.this, android.R.layout.simple_spinner_dropdown_item, names));
                String cur = prefs.locationId(); if (cur != null) for (int i = 0; i < stores.size(); i++) if (stores.get(i)[0].equals(cur)) store.setSelection(i);
            }});
        }}).start();

        findViewById(R.id.register).setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            final int idx = store.getSelectedItemPosition();
            if (idx < 0 || idx >= stores.size()) { toast("Pick a store"); return; }
            final String p = pin.getText().toString().trim(); if (p.length() < 4) { toast("Enter the store manager PIN"); return; }
            final String locId = stores.get(idx)[0], storeName = stores.get(idx)[1];
            final String lbl = label.getText().toString().trim().isEmpty() ? "Till printer" : label.getText().toString().trim();
            final String st = station.getText().toString().trim().isEmpty() ? "kitchen" : station.getText().toString().trim();
            new Thread(new Runnable() { public void run() {
                JSONObject r; try { r = Api.register(locId, prefs.sn(), lbl, st, p, Build.MODEL); } catch (Exception e) { r = new JSONObject(); try { r.put("error", e.getMessage()); } catch (Exception ignored) {} }
                final JSONObject res = r;
                ui.post(new Runnable() { public void run() {
                    if (res.optBoolean("ok")) { prefs.locationId(locId); prefs.storeName(storeName); prefs.registered(true); prefs.label(lbl); pin.setText(""); toast("Registered as " + lbl + " at " + storeName); PrintService.start(MainActivity.this); render(); askUsbPermission(); }
                    else toast(res.optString("message", res.optString("error", "Registration failed")));
                }});
            }}).start();
        }});
        findViewById(R.id.test).setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            final String loc = prefs.locationId(); if (loc == null) return;
            new Thread(new Runnable() { public void run() {
                JSONObject r; try { r = Api.testPrint(prefs.sn(), loc); } catch (Exception e) { r = new JSONObject(); try { r.put("error", e.getMessage()); } catch (Exception ignored) {} }
                final JSONObject res = r; ui.post(new Runnable() { public void run() { toast(res.optBoolean("ok") ? "Test slip queued — printing in a few seconds" : "Test failed: " + res.optString("error")); } });
            }}).start();
        }});
        usbPerm.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { askUsbPermission(); } });
        findViewById(R.id.battery).setOnClickListener(new View.OnClickListener() { public void onClick(View v) {
            try {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm.isIgnoringBatteryOptimizations(getPackageName())) { toast("Already allowed to run in the background"); return; }
                startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).setData(Uri.parse("package:" + getPackageName())));
            } catch (Exception e) { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:" + getPackageName()))); }
        }});
        findViewById(R.id.unregister).setOnClickListener(new View.OnClickListener() { public void onClick(View v) { prefs.registered(false); stopService(new Intent(MainActivity.this, PrintService.class)); render(); } });
    }

    private void askUsbPermission() {
        UsbManager usb = (UsbManager) getSystemService(USB_SERVICE);
        UsbDevice dev = printer.find();
        if (dev == null) { toast("No printer found on USB"); return; }
        if (usb.hasPermission(dev)) { toast("Printer already allowed: " + printer.describe(dev)); render(); return; }
        PendingIntent pi = PendingIntent.getBroadcast(this, 0, new Intent("com.createbrands.printagent.USB_PERMISSION"), Build.VERSION.SDK_INT >= 31 ? 0x02000000 /* FLAG_MUTABLE */ : 0);
        usb.requestPermission(dev, pi);
    }

    private void render() {
        boolean reg = prefs.registered();
        registeredBox.setVisibility(reg ? View.VISIBLE : View.GONE);
        setupBox.setVisibility(reg ? View.GONE : View.VISIBLE);
        if (reg) {
            registeredText.setText(prefs.label() + " · " + prefs.storeName() + "\nSerial " + prefs.sn());
            UsbDevice d = printer.find();
            usbInfo.setText(d == null ? "Printer: none found on USB" : "Printer: " + printer.describe(d) + (printer.hasPermission(d) ? " · allowed" : " · NOT allowed yet"));
            usbPerm.setVisibility(d != null && !printer.hasPermission(d) ? View.VISIBLE : View.GONE);
            PrintService.start(this);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        registerReceiver(statusRx, new IntentFilter(PrintService.ACTION_STATUS));
        IntentFilter f = new IntentFilter("com.createbrands.printagent.USB_PERMISSION"); f.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED); f.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        registerReceiver(usbRx, f);
        render();
    }
    @Override protected void onPause() { super.onPause(); try { unregisterReceiver(statusRx); unregisterReceiver(usbRx); } catch (Exception ignored) {} }
    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }
}
