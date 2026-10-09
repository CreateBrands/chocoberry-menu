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
  // A kiosk must hold a licence. Without one it cannot print its pay-at-till
  // slip (kiosk_slip refuses calls with no device token) and the rest of the
  // system has nothing to attribute its orders to — but it would happily keep
  // taking orders from a store picked by hand, which is how Tove spent an
  // evening sending customers to the counter with no slip after the app was
  // reinstalled and its licence went with the WebView's storage.
  const dev = getDevice();
  const loc = dev && dev.location_id ? dev.location_id : null;
  const [nonce, setNonce] = useState(0);        // bump = fresh App (clears the bag)
  const [idlePrompt, setIdlePrompt] = useState(false);
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
    // Android back (and the browser's) steps back inside the menu rather than
    // leaving: the page re-pushes its history entry either way, so there is no
    // way out, but navigating the menu still feels normal.
    const onPop = () => {
      push();

      try { if (typeof window.__kioskBack === "function") window.__kioskBack(); } catch {}
    };
    const onKey = (e) => {
      const k = (e.key || "").toLowerCase();
      if (k === "f5" || (e.ctrlKey && ["r", "w", "n", "t"].includes(k)) || (e.altKey && ["arrowleft", "arrowright"].includes(k))) { e.preventDefault(); e.stopPropagation(); }
      if (k === "escape") { e.preventDefault(); try { if (typeof window.__kioskBack === "function") window.__kioskBack(); } catch {} }
    };
    const onCtx = (e) => e.preventDefault();
    // Only warn when there is something to lose: a half-built order. Setup
    // screens and staff actions navigate freely.
    const onUnload = (e) => {
      if (exiting.current) return;
      if (!(window.__kioskBagCount > 0)) return;
      e.preventDefault(); e.returnValue = ""; return "";
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("contextmenu", onCtx);
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("keydown", onKey, true); window.removeEventListener("contextmenu", onCtx); window.removeEventListener("beforeunload", onUnload); };
  }, []);

  // ---- hidden staff corners: 3 quick taps in the SAME corner ----
  // These used to be four invisible 96px divs at z-index 8000, which sat on
  // top of the app's own back arrow (top-left) and the item screen's close
  // button (top-right) — so the two controls a customer needs most were
  // unreachable, and every attempt to use them counted towards this gate.
  // Listening on the document instead means the buttons under the corner
  // still receive the tap; requiring the same corner three times inside
  // 1.2s keeps ordinary use from opening the gate by accident.
  useEffect(() => {
    if (gate || panel) return;
    const CORNER = 96, WINDOW_MS = 1200;
    let seq = [];
    const cornerAt = (x, y) => {
      const v = y <= CORNER ? "t" : y >= window.innerHeight - CORNER ? "b" : null;
      const h = x <= CORNER ? "l" : x >= window.innerWidth - CORNER ? "r" : null;
      return v && h ? v + h : null;
    };
    const onDown = (e) => {
      const c = cornerAt(e.clientX, e.clientY);
      const now = Date.now();
      if (!c) { seq = []; return; }
      seq = seq.filter((s) => s.c === c && now - s.t < WINDOW_MS);
      seq.push({ c, t: now });
      if (seq.length >= 3) { seq = []; setGate(true); setPin(""); setErr(""); }
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [gate, panel]);

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

  if (!loc) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#FFFBF2", color: "#1F2A24", fontFamily: "'Hanken Grotesk',system-ui,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: 620, maxWidth: "94vw", textAlign: "center" }}>
          <div style={{ fontSize: 46 }}>🔑</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 32, marginTop: 8 }}>This kiosk needs a licence</div>
          <div style={{ fontSize: 17, color: "#5F6B63", marginTop: 10, lineHeight: 1.5 }}>
            Enter the licence code from Admin → Devices. Until then it cannot take orders:
            an unlicensed kiosk has no store of its own, so it cannot print the pay-at-till
            slip and its orders cannot be traced back to this machine.
          </div>
          <a href="/activate" style={{ display: "inline-block", marginTop: 26, padding: "18px 40px", borderRadius: 14, background: "#344D42", color: "#FFFBF2", fontWeight: 800, fontSize: 20, textDecoration: "none" }}>Activate this kiosk</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <style>{"html,body{overscroll-behavior:none;touch-action:manipulation;-webkit-touch-callout:none}*{-webkit-tap-highlight-color:transparent}"}</style>

      {/* the menu itself — identical to the tablet */}
      <App key={nonce} kiosk kioskDevice={dev} kioskLoc={loc} />


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
              <span onClick={() => { exiting.current = true; window.location.href = "/activate"; }} style={btn(false)}>Re-licence this kiosk</span>
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
