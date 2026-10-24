package com.createbrands.customerdisplay;

import android.content.Context;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** The poster page in a WebView, shared by both ways of reaching the rear screen. */
public class Web {
    public interface Status { void set(String s); }

    // Heartbeat from the page (window.CD.alive every 5s): when it stops, the
    // page has frozen and DisplayService rebuilds it. `link` is the page's
    // live-link state: "live" when the till's payments will arrive.
    public static volatile long lastAlive = 0;
    public static volatile String link = "";
    public static volatile long errorAt = 0;   // last failed page load (offline): not a freeze
    public static class Bridge {
        @android.webkit.JavascriptInterface
        public void alive(String state) { lastAlive = System.currentTimeMillis(); link = state == null ? "" : state; }
    }
    private static final long RETRY_MS = 20000;

    public static String url(String loc, String till) {
        String u = Stores.WEB + "/display?loc=" + loc + "&src=app";
        if (till != null && !till.isEmpty()) { try { u += "&till=" + java.net.URLEncoder.encode(till, "UTF-8"); } catch (Exception ignored) {} }
        return u;
    }

    public static WebView make(Context ctx, final String url, final String storeName, final Status status) {
        final WebView w = new WebView(ctx);
        final Handler ui = new Handler(Looper.getMainLooper());
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // the page caches the last good posters for offline
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        w.setBackgroundColor(Color.BLACK);
        w.setVerticalScrollBarEnabled(false); w.setHorizontalScrollBarEnabled(false);
        w.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        lastAlive = System.currentTimeMillis(); link = "";
        w.addJavascriptInterface(new Bridge(), "CD");
        w.setWebViewClient(new WebViewClient() {
            @SuppressWarnings("deprecation")
            @Override public void onReceivedError(WebView v, int code, String desc, String failing) {
                errorAt = System.currentTimeMillis();
                status.set("Offline — retrying (" + desc + ")");
                ui.postDelayed(new Runnable() { public void run() { try { w.loadUrl(url); } catch (Exception ignored) {} } }, RETRY_MS);
            }
            @Override public void onPageFinished(WebView v, String u) { status.set("Showing posters · " + (storeName == null ? "" : storeName)); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, String u) { return !u.startsWith(Stores.WEB); }
        });
        w.loadUrl(url);
        return w;
    }
}
