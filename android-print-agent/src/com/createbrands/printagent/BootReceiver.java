package com.createbrands.printagent;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) { if (new Prefs(ctx).registered()) PrintService.start(ctx); }
}
