import { useEffect, useRef, useState } from "react";

// KITCHEN BAR 2026-10-25 — the KDS has no top bar any more. Tickets get the
// whole screen and everything else lives in one small dark bar floating in
// the bottom-right corner: the Active / All-day / Done tabs, the clock (its
// dot goes red when the screen is offline) and ⋯ for the rest — today's
// stats, printer, ring, text size, the Kitchen / Performance / POS switch,
// fullscreen, this screen and reload. A printer problem or lost connection
// also shows as a red pill on the bar itself, so nothing important hides
// behind ⋯.

const DARK = "#0f2e29", TEAL = "#5eead4", MINT = "#ccfbf1";
const pink = "linear-gradient(135deg,#ec4899,#db2777)";
const teal = "linear-gradient(135deg,#14b8a6,#0d9488)";
const pill = { display: "inline-flex", alignItems: "center", gap: 7, padding: "12px 16px", borderRadius: 11, fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none", color: TEAL, background: "rgba(94,234,212,.09)" };
const tile = { display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 12, fontWeight: 700, fontSize: 14.5, cursor: "pointer", userSelect: "none", background: "rgba(94,234,212,.08)", color: MINT, border: "1px solid rgba(94,234,212,.12)" };
const dot = (c, s = 9) => <span style={{ width: s, height: s, borderRadius: "50%", background: c, display: "inline-block", flexShrink: 0 }} />;

function Seg({ value, options, onPick, active = teal }) {
  return (
    <span style={{ display: "flex", background: "rgba(94,234,212,.08)", borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map(([v, l]) => (
        <span key={v} onClick={() => onPick(v)}
          style={{ minWidth: 40, textAlign: "center", padding: "8px 10px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", borderRadius: 8, whiteSpace: "nowrap", background: value === v ? active : "transparent", color: value === v ? "#fff" : "#99f6e4" }}>{l}</span>
      ))}
    </span>
  );
}

export default function KitchenBar({ tabs = [], clock, connected, problems = 0, onPrintLog, stats = [], views = [], view, setView,
  ringMode, setRingMode, testRing, sizes = [], size, setSize, fullscreen, goFullscreen, usb, screenLabel, onScreenSetup }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [open]);
  const shut = (fn) => () => { setOpen(false); fn && fn(); };
  const usbBad = usb && usb.state !== "ready";

  return (
    <div ref={ref} style={{ position: "fixed", right: 14, bottom: 14, zIndex: 40, fontFamily: "'Hanken Grotesk',system-ui,sans-serif" }}>
      {open && (
        <div style={{ position: "absolute", right: 0, bottom: "calc(100% + 12px)", width: 380, maxWidth: "calc(100vw - 28px)", maxHeight: "calc(100vh - 110px)", overflowY: "auto", background: DARK, border: "1px solid rgba(94,234,212,.18)", borderRadius: 16, boxShadow: "0 22px 50px rgba(4,20,17,.45)", padding: 12, color: MINT, display: "grid", gap: 10 }}>
          {stats.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(" + stats.length + ", 1fr)", gap: 8 }}>
              {stats.map((s) => (
                <div key={s.label} style={{ ...tile, cursor: "default", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 6px" }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: s.color || MINT, fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                  <span style={{ fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(204,251,241,.6)" }}>{s.label}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div onClick={shut(onPrintLog)} style={{ ...tile, color: problems ? "#fca5a5" : MINT, background: problems ? "rgba(239,68,68,.12)" : tile.background, borderColor: problems ? "rgba(239,68,68,.45)" : tile.border.split(" ").pop() }}>
              {dot(problems ? "#ef4444" : "#4ade80")}{problems ? problems + " not printed" : "Printer"}
            </div>
            <div style={{ ...tile, cursor: "default", color: connected ? MINT : "#fca5a5" }}>{dot(connected ? "#4ade80" : "#ef4444")}{connected ? "Connected" : "Offline"}</div>
            {usb && <div onClick={usb.onClick} style={{ ...tile, gridColumn: "1 / 3", color: usbBad ? "#fcd34d" : MINT }}>🖨 {usb.state === "ready" ? "USB printer connected" : usb.state === "unpaired" ? "Connect USB printer" : usb.state === "unsupported" ? "USB not supported here" : "USB printer disconnected — tap to reconnect"}</div>}
          </div>
          {views.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "2px 4px" }}>
              <span style={{ fontWeight: 700, fontSize: 14.5 }}>Screen</span>
              <Seg value={view} options={views} onPick={(v) => { setOpen(false); setView(v); }} active={pink} />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "2px 4px" }}>
            <span style={{ fontWeight: 700, fontSize: 14.5 }}>New-order ring</span>
            <Seg value={ringMode} options={[["off", "Off"], ["loud", "Once"], ["repeat", "Until tap"]]}
              onPick={(m) => { setRingMode(m); if (m !== "off" && testRing) setTimeout(testRing, 50); }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "2px 4px" }}>
            <span style={{ fontWeight: 700, fontSize: 14.5 }}>Text size</span>
            <Seg value={size} options={sizes.map((z) => [z, z])} onPick={setSize} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div onClick={shut(goFullscreen)} style={{ ...tile, flexDirection: "column", gap: 4, padding: "11px 6px", fontSize: 13 }}><span style={{ fontSize: 18, color: TEAL }}>{fullscreen ? "✕" : "⛶"}</span>{fullscreen ? "Exit full" : "Fullscreen"}</div>
            <div onClick={shut(onScreenSetup)} style={{ ...tile, flexDirection: "column", gap: 4, padding: "11px 6px", fontSize: 13 }}><span style={{ fontSize: 18, color: TEAL }}>⚙</span>This screen</div>
            <div onClick={() => window.location.reload()} style={{ ...tile, flexDirection: "column", gap: 4, padding: "11px 6px", fontSize: 13 }}><span style={{ fontSize: 18, color: TEAL }}>↻</span>Reload</div>
          </div>
          {screenLabel && <div style={{ fontSize: 12, color: "rgba(204,251,241,.55)", textAlign: "center" }}>{screenLabel}</div>}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, background: DARK, borderRadius: 16, padding: 7, boxShadow: "0 10px 30px rgba(4,20,17,.35)" }}>
        {tabs.map((t) => (
          <span key={t.k} onClick={t.onClick} style={{ ...pill, ...(t.on ? { background: pink, color: "#fff", fontWeight: 800 } : {}) }}>
            {t.label}{t.count != null && <b style={{ fontSize: 16 }}>{t.count}</b>}
          </span>
        ))}
        {problems > 0 && (
          <span onClick={onPrintLog} style={{ ...pill, background: "rgba(239,68,68,.18)", color: "#fca5a5", border: "1.5px solid rgba(239,68,68,.5)" }}>{dot("#ef4444")}{problems} not printed</span>
        )}
        {usbBad && <span onClick={usb.onClick} style={{ ...pill, color: "#fcd34d", background: "rgba(253,224,71,.12)" }}>🖨 Printer</span>}
        <span title={connected ? "Live" : "Offline"} style={{ ...pill, cursor: "default", background: "transparent", color: connected ? MINT : "#fca5a5", fontWeight: 800, fontSize: 17, fontVariantNumeric: "tabular-nums", padding: "12px 10px" }}>
          {dot(connected ? "#4ade80" : "#ef4444")}{connected ? clock : "Offline"}
        </span>
        <span onClick={() => setOpen((v) => !v)} title="More" style={{ ...pill, fontWeight: 900, fontSize: 18, padding: "10px 16px", letterSpacing: 1, ...(open ? { background: teal, color: "#fff" } : {}) }}>⋯</span>
      </div>
    </div>
  );
}
