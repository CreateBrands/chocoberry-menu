// Self-service kiosk (Sunmi K2). Route: /kiosk
//
// The kiosk IS the tablet menu — same layout, branding and flow — wrapped with
// the three things a kiosk needs on top: the surface is locked (no back, no
// refresh, no context menu), it resets to the welcome screen when a customer
// walks away, and staff reach settings or leave through a hidden corner + PIN.
// Ordering differences (eat in / take away instead of a table, pay at the
// counter, hold until the till takes payment) live in App's `kiosk` mode.
import { useState, useEffect, useRef } from "react";
import App from "./App.jsx";
import { getDevice, deviceToken } from "./device.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY };
const IDLE_MS = 75000;        // quiet before "still there?"
const IDLE_GRACE_MS = 15000;  // then start over

export default function Kiosk() {
  const dev = getDevice();
  const urlLoc = new URLSearchParams(window.location.search).get("loc");
  const saved = (() => { try { return localStorage.getItem("kiosk_loc"); } catch { return null; } })();
  const loc = (dev && dev.location_id) || urlLoc || saved || null;
  useEffect(() => { if (urlLoc) { try { localStorage.setItem("kiosk_loc", urlLoc); } catch {} } }, [urlLoc]);
  const [pickStores, setPickStores] = useState(null);   // store list when nothing is set yet
  const [nonce, setNonce] = useState(0);        // bump = fresh App (clears the bag)
  const [idlePrompt, setIdlePrompt] = useState(false);
  const [taps, setTaps] = useState(0);
  const [gate, setGate] = useState(false);
  const [panel, setPanel] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [by, setBy] = useState("");
  const last = useRef(Date.now());
  const exiting = useRef(false);

  // ---- lock the surface ----
  useEffect(() => {
    const push = () => { try { history.pushState({ k: 1 }, "", window.location.href); } catch {} };
    push(); push();
    const onPop = () => { push(); setTaps(0); };
    const onKey = (e) => {
      const k = (e.key || "").toLowerCase();
      if (k === "f5" || (e.ctrlKey && ["r", "w", "n", "t"].includes(k)) || (e.altKey && ["arrowleft", "arrowright"].includes(k))) { e.preventDefault(); e.stopPropagation(); }
    };
    const onCtx = (e) => e.preventDefault();
    const onUnload = (e) => { if (!exiting.current) { e.preventDefault(); e.returnValue = ""; return ""; } };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("contextmenu", onCtx);
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("keydown", onKey, true); window.removeEventListener("contextmenu", onCtx); window.removeEventListener("beforeunload", onUnload); };
  }, []);

  // ---- idle reset ----
  useEffect(() => {
    const bump = () => { last.current = Date.now(); if (idlePrompt) setIdlePrompt(false); };
    ["touchstart", "pointerdown", "keydown"].forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      if (gate || panel) { last.current = Date.now(); return; }
      const idle = Date.now() - last.current;
      if (idle > IDLE_MS + IDLE_GRACE_MS) startOver();
      else if (idle > IDLE_MS && !idlePrompt) setIdlePrompt(true);
    }, 1000);
    return () => { clearInterval(t); ["touchstart", "pointerdown", "keydown"].forEach((e) => window.removeEventListener(e, bump)); };
  }, [idlePrompt, gate, panel]); // eslint-disable-line

  // ---- self-update when a new build ships (only while idle) ----
  useEffect(() => {
    const mine = Array.from(document.querySelectorAll('script[type="module"]')).map((x) => x.getAttribute("src")).find((x) => x && x.includes("/assets/"));
    if (!mine) return;
    const id = setInterval(async () => {
      if (Date.now() - last.current < 60000) return;
      try {
        const r = await fetch("/index.html?u=" + Date.now(), { cache: "no-store" });
        const html = await r.text();
        const m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
        if (m && !mine.endsWith(m[1])) { exiting.current = true; window.location.reload(); }
      } catch {}
    }, 120000);
    return () => clearInterval(id);
  }, []);

  function startOver() { setIdlePrompt(false); setNonce((n) => n + 1); last.current = Date.now(); }

  async function checkPin(p) {
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, device: deviceToken(), action: "staff_lookup", data: { pin: p, location_id: loc } }) });
      const j = await r.json().catch(() => ({}));
      if (j && j.ok) return { ok: true, name: j.name };
      const r2 = await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, action: "manager_pin_check", data: { location_id: loc, manager_pin: p } }) });
      const j2 = await r2.json().catch(() => ({}));
      return j2 && j2.ok ? { ok: true, name: "Manager" } : { ok: false };
    } catch { return { ok: false }; }
  }

  const sheet = { position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Hanken Grotesk',system-ui,sans-serif" };
  const card = { background: "#fff", color: "#111", borderRadius: 28, padding: "40px 44px", width: 560, maxWidth: "92vw", textAlign: "center", boxShadow: "0 30px 80px rgba(0,0,0,.4)" };
  const btn = (primary) => ({ padding: "16px 22px", borderRadius: 14, fontWeight: 800, fontSize: 18, cursor: "pointer", background: primary ? "#344D42" : "#f3f4f6", color: primary ? "#fff" : "#111", textAlign: "center" });

  // No licence and no store yet: ask once, rather than showing every brand's menu.
  useEffect(() => {
    if (loc) return;
    fetch(SUPABASE_URL + "/rest/v1/menu_locations?select=id,name&active=eq.true&order=name", { headers: H })
      .then((r) => (r.ok ? r.json() : [])).then(setPickStores).catch(() => setPickStores([]));
  }, [loc]);

  if (!loc) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#FFFBF2", color: "#1F2A24", fontFamily: "'Hanken Grotesk',system-ui,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: 620, maxWidth: "94vw", textAlign: "center" }}>
          <div style={{ fontSize: 46 }}>🖥️</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 32, marginTop: 8 }}>Which store is this kiosk in?</div>
          <div style={{ fontSize: 17, color: "#5F6B63", marginTop: 8 }}>Pick the store to load its menu and branding. Activate the device in Admin → Devices to lock this in.</div>
          <div style={{ display: "grid", gap: 10, marginTop: 26, maxHeight: "52vh", overflowY: "auto" }}>
            {(pickStores || []).map((st) => (
              <span key={st.id} onClick={() => { try { localStorage.setItem("kiosk_loc", st.id); } catch {} window.location.search = "?loc=" + st.id; }}
                style={{ padding: "18px 16px", borderRadius: 14, background: "#fff", border: "1px solid rgba(52,77,66,.16)", fontWeight: 800, fontSize: 20, cursor: "pointer" }}>{st.name}</span>
            ))}
            {pickStores && pickStores.length === 0 && <div style={{ color: "#5F6B63" }}>Could not load the store list — check the connection.</div>}
            {!pickStores && <div style={{ color: "#5F6B63" }}>Loading stores…</div>}
          </div>
          <a href="/activate" style={{ display: "inline-block", marginTop: 24, color: "#344D42", fontWeight: 700 }}>Activate this device instead ›</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <style>{"html,body{overscroll-behavior:none;touch-action:manipulation;-webkit-touch-callout:none}*{-webkit-tap-highlight-color:transparent}"}</style>

      {/* the menu itself — identical to the tablet */}
      <App key={nonce} kiosk kioskDevice={dev} />

      {/* hidden staff corners: 3 taps on ANY corner */}
      {[["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]].map(([v, h]) => (
        <div key={v + h} onClick={() => setTaps((n) => { if (n + 1 >= 3) { setGate(true); setPin(""); setErr(""); return 0; } return n + 1; })}
          style={{ position: "fixed", [v]: 0, [h]: 0, width: 96, height: 96, zIndex: 8000 }} />
      ))}

      {idlePrompt && (
        <div style={sheet}>
          <div style={card}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 34 }}>Still there?</div>
            <div style={{ fontSize: 18, color: "#666", marginTop: 10 }}>Your order will be cleared in a few seconds.</div>
            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              <span onClick={startOver} style={{ ...btn(false), flex: 1 }}>Start over</span>
              <span onClick={() => { last.current = Date.now(); setIdlePrompt(false); }} style={{ ...btn(true), flex: 1 }}>Keep ordering</span>
            </div>
          </div>
        </div>
      )}

      {gate && (
        <div style={sheet} onClick={() => setGate(false)}>
          <div style={card} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 40 }}>🔒</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 28, marginTop: 4 }}>Staff only</div>
            <div style={{ fontSize: 17, color: "#666", marginTop: 8 }}>Enter your punch-in PIN to open kiosk settings.</div>
            <div style={{ fontSize: 14, color: "#999", marginTop: 4 }}>Tap any corner 3 times to get here.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", margin: "22px 0 18px" }}>{[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: i < pin.length ? (err ? "#b4462f" : "#111") : "#e5e7eb" }} />)}{pin.length > 4 && <span style={{ color: "#666" }}>+{pin.length - 4}</span>}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"].map((k) => (
                <span key={k} onClick={async () => {
                  if (k === "⌫") { setPin((p) => p.slice(0, -1)); setErr(""); return; }
                  if (k === "✓") { if (pin.length < 4) return; const r = await checkPin(pin); if (r.ok) { setBy(r.name || "Staff"); setGate(false); setPanel(true); setPin(""); } else { setErr("PIN not recognised"); setPin(""); } return; }
                  setPin((p) => (p + k).slice(0, 8)); setErr("");
                }} style={{ padding: "18px 0", borderRadius: 14, background: k === "✓" ? (pin.length >= 4 ? "#16a34a" : "#e5e7eb") : "#f3f4f6", color: k === "✓" && pin.length >= 4 ? "#fff" : "#111", fontSize: 24, fontWeight: 900, cursor: "pointer", userSelect: "none" }}>{k}</span>
              ))}
            </div>
            {err && <div style={{ color: "#b4462f", fontWeight: 800, marginTop: 14 }}>{err}</div>}
            <div onClick={() => setGate(false)} style={{ marginTop: 18, color: "#666", fontWeight: 700, cursor: "pointer" }}>Cancel</div>
          </div>
        </div>
      )}

      {panel && (
        <div style={sheet} onClick={() => setPanel(false)}>
          <div style={card} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 28 }}>Kiosk · staff</div>
            <div style={{ fontSize: 16, color: "#666", marginTop: 6 }}>{by} · {dev ? (dev.label || dev.key) : "unlicensed"}</div>
            <div style={{ display: "grid", gap: 10, marginTop: 24 }}>
              <span onClick={() => { setPanel(false); startOver(); }} style={btn(false)}>Clear the current order</span>
              <span onClick={() => { try { localStorage.removeItem("kiosk_loc"); } catch {} exiting.current = true; window.location.search = ""; }} style={btn(false)}>Change store</span>
              <span onClick={() => { exiting.current = true; window.location.reload(); }} style={btn(false)}>Reload kiosk</span>
              <span onClick={async () => { await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, device: deviceToken(), action: "kiosk_slip", data: { location_id: loc, test: true } }) }); setPanel(false); }} style={btn(false)}>Test slip on this kiosk's printer</span>
              <span onClick={() => { exiting.current = true; window.location.href = "/activate"; }} style={{ ...btn(false), color: "#b4462f" }}>Leave kiosk mode</span>
              <span onClick={() => { setPanel(false); setBy(""); }} style={btn(true)}>Back to ordering</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
