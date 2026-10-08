package com.createbrands.printagent;

import android.content.*;
import android.os.IBinder;
import android.os.RemoteException;
import woyou.aidlservice.jiuiv5.ICallback;
import woyou.aidlservice.jiuiv5.IWoyouService;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Sunmi built-in printer via the system printer service (woyou.aidlservice.jiuiv5): V3 Mix, V2, T2, D2, D3 Pro… Raw ESC/POS pass-through. */
public class SunmiPrinter {
    private final Context ctx;
    private volatile IWoyouService svc;
    private volatile boolean binding;
    public SunmiPrinter(Context ctx) { this.ctx = ctx.getApplicationContext(); }

    private final ServiceConnection conn = new ServiceConnection() {
        public void onServiceConnected(ComponentName n, IBinder b) { svc = IWoyouService.Stub.asInterface(b); binding = false; }
        public void onServiceDisconnected(ComponentName n) { svc = null; binding = false; }
    };

    /** True when the Sunmi printer service exists on this device (false on non-Sunmi hardware). */
    public boolean available() {
        if (svc != null) return true;
        Intent i = new Intent(); i.setPackage("woyou.aidlservice.jiuiv5"); i.setAction("woyou.aidlservice.jiuiv5.IWoyouService");
        if (ctx.getPackageManager().queryIntentServices(i, 0).isEmpty()) return false;
        if (!binding) { binding = true; try { ctx.bindService(i, conn, Context.BIND_AUTO_CREATE); } catch (Exception e) { binding = false; } }
        return true;
    }
    public boolean ready() { available(); return svc != null; }

    /** Paper width in mm as the service reports it (1 = 58 mm, 2 = 80 mm); 0 if unknown. */
    public int paper() { try { return svc == null ? 0 : (svc.getPrinterPaper() == 1 ? 58 : 80); } catch (Exception e) { return 0; } }

    public void print(byte[] bytes) throws Exception {
        for (int i = 0; i < 20 && svc == null; i++) { available(); Thread.sleep(250); }
        IWoyouService s = svc; if (s == null) throw new Exception("Sunmi printer service not available");
        final CountDownLatch done = new CountDownLatch(1); final String[] err = new String[1];
        ICallback cb = new ICallback.Stub() {
            public void onRunResult(boolean ok) throws RemoteException { if (!ok) err[0] = "printer reported failure"; done.countDown(); }
            public void onReturnString(String r) throws RemoteException {}
            public void onRaiseException(int code, String msg) throws RemoteException { err[0] = "printer error " + code + ": " + msg; done.countDown(); }
            public void onPrintResult(int code, String msg) throws RemoteException {}
        };
        s.sendRAWData(bytes, cb);
        done.await(20, TimeUnit.SECONDS);
        if (err[0] != null) throw new Exception(err[0]);
    }
}
