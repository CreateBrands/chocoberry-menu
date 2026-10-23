package com.createbrands.customerdisplay;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        Prefs p = new Prefs(ctx);
        if (p.enabled() && p.locationId() != null) DisplayService.start(ctx);
    }
}
