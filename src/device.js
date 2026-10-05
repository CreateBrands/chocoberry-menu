// Device licence held by this screen/till. Issued once by admin-api
// (device_activate or device_claim_legacy) and kept in localStorage.
// { location_id, key, kind: "kds"|"pos"|"kds+pos", label, secret }
export const APP_VERSION = "2026.10.06";
const KEY = "cb_device";

export function getDevice() {
  try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); return j && j.location_id && j.key && j.secret ? j : null; } catch { return null; }
}
export function setDevice(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }
export function clearDevice() { try { localStorage.removeItem(KEY); } catch {} }

// The token sent with every operational call.
export function deviceToken() {
  const d = getDevice();
  return d ? { location_id: d.location_id, key: d.key, secret: d.secret } : null;
}

export function fingerprint() {
  try {
    const n = navigator;
    return [n.platform, n.userAgent.replace(/\([^)]*\)/g, "").slice(0, 80), screen.width + "x" + screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone].join(" | ");
  } catch { return ""; }
}

export function surfaceAllowed(kind, surface) {
  if (!kind) return true;
  if (kind === "kds+pos") return true;
  return kind === surface;
}
