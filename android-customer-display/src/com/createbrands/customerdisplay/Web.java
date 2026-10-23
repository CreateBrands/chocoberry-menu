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
    private static final long RETRY_MS = 20000;

    public static String url(String loc) { return Stores.WEB + "/display?loc=" + loc + "&src=app"; }

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
        w.setWebViewClient(new WebViewClient() {
            @SuppressWarnings("deprecation")
            @Override public void onReceivedError(WebView v, int code, String desc, String failing) {
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
