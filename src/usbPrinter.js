// USB receipt printer over WebUSB (Chrome on Android / Windows / ChromeOS).
// The server renders ESC/POS bytes; this module just gets them down the cable.
//
//   await usbPrinter.pair()        — Chrome's chooser, once; remembered after
//   usbPrinter.hasPairedDevice()   — a device was granted before
//   await usbPrinter.print(hex)    — write ESC/POS hex to the printer
//   usbPrinter.status()            — "unsupported" | "unpaired" | "ready"

const KEY = "usb_printer";
let device = null;

export const supported = () => typeof navigator !== "undefined" && !!navigator.usb;

function remembered() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
function remember(d) { try { localStorage.setItem(KEY, JSON.stringify({ vendorId: d.vendorId, productId: d.productId, productName: d.productName, manufacturerName: d.manufacturerName, serialNumber: d.serialNumber })); } catch {} }
export function forget() { try { localStorage.removeItem(KEY); } catch {} device = null; }
export function info() { return remembered(); }
export function hasPairedDevice() { return !!remembered(); }

export async function pair() {
  if (!supported()) throw new Error("This browser can't use USB printers. Use Chrome.");
  // Printer class is 7; many ESC/POS units report vendor-specific (0xFF). Let the user choose.
  const d = await navigator.usb.requestDevice({ filters: [{ classCode: 7 }, { classCode: 0xff }, {}] });
  remember(d); device = d;
  await open(d);
  return remembered();
}

async function reconnect() {
  if (device && device.opened) return device;
  const want = remembered(); if (!want) return null;
  const list = await navigator.usb.getDevices();
  const d = list.find((x) => x.vendorId === want.vendorId && x.productId === want.productId && (!want.serialNumber || x.serialNumber === want.serialNumber)) || list.find((x) => x.vendorId === want.vendorId && x.productId === want.productId);
  if (!d) return null;
  device = d; await open(d); return d;
}

let iface = null, epOut = null, altSetting = 0;
async function open(d) {
  if (!d.opened) await d.open();
  if (d.configuration === null) await d.selectConfiguration(1);
  // Find the first interface with a bulk OUT endpoint (printer or vendor class).
  iface = null; epOut = null; altSetting = 0;
  for (const inf of d.configuration.interfaces) {
    for (const alt of inf.alternates) {
      if (![7, 0xff].includes(alt.interfaceClass)) continue;
      const out = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      if (out) { iface = inf.interfaceNumber; epOut = out.endpointNumber; altSetting = alt.alternateSetting; break; }
    }
    if (iface !== null) break;
  }
  if (iface === null) throw new Error("No printer interface found on this USB device");
  try { await d.claimInterface(iface); } catch (e) { if (!String(e).includes("already")) throw e; }
  // The endpoint above was found by searching EVERY alternate setting, but
  // claiming an interface selects none of them. Until the setting that owns
  // the endpoint is selected, the endpoint is not addressable and the write
  // fails with "The specified endpoint is not part of a claimed and selected
  // alternate interface" — which is exactly what the XP-Q80A at Al Zahia did,
  // silently, on every job.
  try {
    await d.selectAlternateInterface(iface, altSetting);
  } catch (e) {
    // Devices exposing a single setting sometimes reject the call outright.
    // Ignoring that is only safe when the default was the one we wanted.
    if (altSetting !== 0) throw e;
  }
}

const hexToBytes = (hex) => { const h = String(hex).replace(/\s+/g, ""); const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; };

async function writeAll(d, bytes) {
  const CHUNK = 4096;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const r = await d.transferOut(epOut, bytes.slice(i, i + CHUNK));
    if (r.status !== "ok") throw new Error("USB transfer " + r.status);
  }
}

export async function print(hex) {
  const d = await reconnect();
  if (!d) throw new Error("USB printer not connected");
  const bytes = hexToBytes(hex);
  try {
    await writeAll(d, bytes);
  } catch (e) {
    // A claim can lapse without the disconnect event firing — the tablet
    // sleeping, or Android's own print service taking the interface back.
    // Re-open and try once more before reporting a failure, because the job is
    // marked failed on the server and a three-strike streak pauses the printer.
    if (!/claimed|selected|interface|endpoint|transfer/i.test(String(e))) throw e;
    await open(d);
    await writeAll(d, bytes);
  }
  return true;
}

// Hand the printer back. Claiming a USB interface is exclusive, so while this
// till holds it nothing else on the cable can print — which matters where a
// printer is shared with another POS during a trial. close() drops the claim;
// on most hosts that is enough for the other side to take over without a
// replug, though Windows print drivers sometimes need the cable pulled.
export async function release() {
  try {
    if (device && device.opened) {
      if (iface !== null) { try { await device.releaseInterface(iface); } catch { /* already released */ } }
      await device.close();
    }
  } catch { /* already unplugged — nothing to release */ }
  device = null; iface = null; epOut = null; altSetting = 0;
  forget();
}

export async function status() {
  if (!supported()) return "unsupported";
  if (!remembered()) return "unpaired";
  try { const d = await reconnect(); return d ? "ready" : "disconnected"; } catch { return "error"; }
}

if (supported()) {
  navigator.usb.addEventListener("disconnect", (e) => { if (device && e.device === device) device = null; });
}
