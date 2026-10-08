package com.createbrands.printagent;

import android.content.Context;
import android.hardware.usb.*;

/** ESC/POS over the Android USB host API. Finds a printer-class (7) or vendor-class device with a bulk OUT endpoint — the Sunmi built-in printer appears this way ("Printer Gadget"), as do external USB printers. */
public class UsbPrinter {
    private final UsbManager usb;
    public UsbPrinter(Context ctx) { usb = (UsbManager) ctx.getSystemService(Context.USB_SERVICE); }

    public static boolean looksLikePrinter(UsbDevice d) {
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface inf = d.getInterface(i);
            int c = inf.getInterfaceClass();
            if (c != UsbConstants.USB_CLASS_PRINTER && c != UsbConstants.USB_CLASS_VENDOR_SPEC) continue;
            for (int e = 0; e < inf.getEndpointCount(); e++) { UsbEndpoint x = inf.getEndpoint(e); if (x.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && x.getDirection() == UsbConstants.USB_DIR_OUT) return true; }
        }
        return false;
    }
    public UsbDevice find() {
        UsbDevice best = null;
        for (UsbDevice d : usb.getDeviceList().values()) {
            if (!looksLikePrinter(d)) continue;
            // Prefer a true printer-class device over a vendor-specific one.
            boolean printerClass = false;
            for (int i = 0; i < d.getInterfaceCount(); i++) if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) printerClass = true;
            if (best == null || printerClass) best = d;
            if (printerClass) break;
        }
        return best;
    }
    public boolean hasPermission(UsbDevice d) { return d != null && usb.hasPermission(d); }
    public String describe(UsbDevice d) { if (d == null) return "no printer found"; String n = d.getProductName(); return (n == null ? "USB device" : n) + " (vid " + d.getVendorId() + " pid " + d.getProductId() + ")"; }

    public static byte[] hexToBytes(String hex) {
        String h = hex.replaceAll("\\s", ""); byte[] out = new byte[h.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(h.substring(i * 2, i * 2 + 2), 16);
        return out;
    }

    public void print(byte[] bytes) throws Exception {
        UsbDevice d = find();
        if (d == null) throw new Exception("No printer attached");
        if (!usb.hasPermission(d)) throw new Exception("Printer access not allowed yet — open Print Agent and tap Allow");
        UsbInterface iface = null; UsbEndpoint ep = null;
        outer:
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface inf = d.getInterface(i); int c = inf.getInterfaceClass();
            if (c != UsbConstants.USB_CLASS_PRINTER && c != UsbConstants.USB_CLASS_VENDOR_SPEC) continue;
            for (int e = 0; e < inf.getEndpointCount(); e++) { UsbEndpoint x = inf.getEndpoint(e); if (x.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && x.getDirection() == UsbConstants.USB_DIR_OUT) { iface = inf; ep = x; break outer; } }
        }
        if (ep == null) throw new Exception("USB device has no printer endpoint");
        UsbDeviceConnection conn = usb.openDevice(d);
        if (conn == null) throw new Exception("Could not open the printer");
        try {
            if (!conn.claimInterface(iface, true)) throw new Exception("Could not claim the printer interface");
            int off = 0;
            while (off < bytes.length) {
                int n = Math.min(4096, bytes.length - off);
                byte[] chunk = new byte[n]; System.arraycopy(bytes, off, chunk, 0, n);
                int w = conn.bulkTransfer(ep, chunk, n, 8000);
                if (w < 0) throw new Exception("USB write failed at byte " + off);
                off += w;
            }
            conn.releaseInterface(iface);
        } finally { conn.close(); }
    }
}
