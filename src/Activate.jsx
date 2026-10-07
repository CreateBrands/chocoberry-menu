import { useEffect, useState } from "react";
import { getDevice, setDevice, clearDevice, fingerprint, APP_VERSION } from "./device.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };

// /activate?code=LR-KDS-7F3K — a screen or till enters (or arrives with) its
// one-time licence code and becomes that device. Also the lock screen a
// revoked device lands on.
export default function Activate({ reason }) {
  const params = new URLSearchParams(window.location.search);
  const [code, setCode] = useState((params.get("code") || "").toUpperCase());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const existing = getDevice();

  async function activate() {
    if (!code.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, action: "device_activate", data: { code: code.trim().toUpperCase(), fingerprint: fingerprint(), app_version: APP_VERSION } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Activation failed");
      setDevice(j.device);
      try { localStorage.setItem("kds_loc", j.device.location_id); localStorage.setItem("kds_screen", j.device.key); localStorage.removeItem("kds_station"); localStorage.removeItem("kds_printer"); localStorage.removeItem("kds_allday_cat"); if (j.device.label) localStorage.setItem("kds_name", j.device.label); else localStorage.removeItem("kds_name"); } catch {}
      setDone(j.device);
      setTimeout(() => { window.location.href = j.device.kind === "pos" ? "/pos" : "/kds"; }, 1200);
    } catch (e) { setErr(e.message || "Activation failed"); } finally { setBusy(false); }
  }
  useEffect(() => { if (params.get("code") && !existing) activate(); }, []); // eslint-disable-line

  const C = { ink: "#0f172a", muted: "#64748b", line: "#e2e8f0", soft: "#f1f5f9", good: "#16a34a", bad: "#b91c1c", brand: "#ec4899" };
  const fmt = (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^([A-Z]{2})([A-Z]{3})?([A-Z0-9]{0,4})?$/, (_, a, b, c) => [a, b, c].filter(Boolean).join("-"));
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
      <div style={{ background: "#fff", borderRadius: 28, padding: "40px 44px", width: 560, maxWidth: "100%", boxShadow: "0 30px 80px rgba(0,0,0,.4)" }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".12em", color: C.brand }}>CHOCOBERRY</div>
        <div style={{ fontSize: 30, fontWeight: 900, fontFamily: "'Poppins',sans-serif", marginTop: 6 }}>{reason === "revoked" ? "Licence revoked" : reason === "wrong_surface" ? "Not licensed for this" : "Activate this device"}</div>
        {reason === "revoked" && <div style={{ marginTop: 10, fontSize: 15, color: C.muted, lineHeight: 1.5 }}>This screen's licence was revoked in the admin. Ask a manager for a new code, then enter it below.</div>}
        {reason === "wrong_surface" && <div style={{ marginTop: 10, fontSize: 15, color: C.muted, lineHeight: 1.5 }}>This device is licensed as <b>{existing?.kind === "pos" ? "a till" : "a kitchen screen"}</b> ({existing?.label}). Open <a href={existing?.kind === "pos" ? "/pos" : "/kds"} style={{ color: C.ink, fontWeight: 800 }}>{existing?.kind === "pos" ? "/pos" : "/kds"}</a>, or activate a different licence.</div>}
        {!reason && <div style={{ marginTop: 10, fontSize: 15, color: C.muted, lineHeight: 1.5 }}>Enter the licence code from the admin (Store → Devices). Each code works once and ties this screen to its store, its role and its settings.</div>}
        {done ? (
          <div style={{ marginTop: 28, padding: 20, borderRadius: 16, background: "#f0fdf4", border: "2px solid #86efac" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.good }}>✓ Activated — {done.label || done.key}</div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>{done.kind === "pos" ? "Till" : done.kind === "kds+pos" ? "Kitchen screen + till" : "Kitchen screen"} · opening…</div>
          </div>
        ) : (
          <>
            <input value={code} onChange={(e) => setCode(fmt(e.target.value))} onKeyDown={(e) => e.key === "Enter" && activate()} placeholder="LR-KDS-7F3K" autoFocus spellCheck={false}
              style={{ marginTop: 26, width: "100%", boxSizing: "border-box", padding: "18px 20px", fontSize: 28, fontWeight: 900, letterSpacing: ".12em", fontFamily: "ui-monospace, Menlo, monospace", textAlign: "center", border: "2px solid " + (err ? C.bad : C.line), borderRadius: 16, outline: "none", textTransform: "uppercase" }} />
            {err && <div style={{ marginTop: 10, color: C.bad, fontWeight: 700, fontSize: 14, lineHeight: 1.45 }}>{err}</div>}
            <button onClick={activate} disabled={busy || code.replace(/-/g, "").length < 8} style={{ marginTop: 16, width: "100%", padding: "18px 0", borderRadius: 16, border: "none", background: busy || code.replace(/-/g, "").length < 8 ? "#cbd5e1" : C.ink, color: "#fff", fontSize: 18, fontWeight: 900, cursor: "pointer" }}>{busy ? "Activating…" : "Activate"}</button>
            {existing && !reason && <div onClick={() => { clearDevice(); window.location.reload(); }} style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: C.muted, cursor: "pointer" }}>This device is currently <b>{existing.label || existing.key}</b> · tap to forget it</div>}
          </>
        )}
        <div style={{ marginTop: 26, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>v{APP_VERSION}</div>
      </div>
    </div>
  );
}
