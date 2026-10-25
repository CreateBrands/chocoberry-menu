import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { deviceToken } from "./device.js";
import ManagerPin from "./ManagerPin.jsx";

// TILL HEADER 2026-10-25 — what the top bar shows on the POS view, instead of
// the kitchen's ticket stats:
//   team chip     on shift / on break / late / coming up (counts for everyone;
//                 names only with a manager or owner PIN)
//   drawer chip   whose cash-drawer shift it is (tap = the Shift sheet)
//   printer       green, or red when something didn't print (tap = print log)
//   live/offline  plus a red bar under the header when the till is offline
//   ⚙ menu        text size, new-order sound, screen set-up, reload

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };
const post = (action, data) => fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, device: deviceToken(), action, data }) })
  .then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) })).catch(() => ({ ok: false }));

const chip = { display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 9, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" };
const dot = (c) => <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block", flexShrink: 0 }} />;
const sep = <span style={{ width: 1, height: 15, background: "#d6dbe1" }} />;
// Bottom-bar look: the same dark pills as the master menus.
export const barPill = (alert) => ({ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer", userSelect: "none",
  padding: "clamp(11px,.9vw,17px) clamp(10px,1vw,22px)", borderRadius: 11, fontSize: "clamp(12px,.92vw,18px)", fontWeight: 700,
  background: alert ? "rgba(239,68,68,.16)" : "rgba(94,234,212,.09)", color: "#ccfbf1", border: "1.5px solid " + (alert ? "rgba(239,68,68,.45)" : "transparent") });
const barSep = <span style={{ width: 1, height: 16, background: "rgba(204,251,241,.22)" }} />;

export function TeamChip({ loc, onStoreName, bar = false, compact = 0 }) {
  const [t, setT] = useState(null);
  const [ask, setAsk] = useState(false);
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!loc) return;
    let alive = true;
    const load = async () => { const r = await post("team_status", { location_id: loc }); if (alive && r && r.ok) { setT(r); if (onStoreName && r.store_name) onStoreName(r.store_name); } };
    load(); const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [loc]);
  if (!t || t.enabled === false) return null;
  const c = t.counts || {};
  const late = c.late > 0, longBreak = c.long_breaks > 0;
  return (
    <>
      <span onClick={() => setAsk(true)} title="Team today (managers)" style={bar ? { ...barPill(late), flexShrink: 1, minWidth: 0, overflow: "hidden" } : { ...chip, background: late ? "#fff7f7" : "#f8fafc", border: "1px solid " + (late ? "#fecaca" : "#e2e8f0"), color: "#1f2937" }}>
        <span style={{ fontSize: bar ? "clamp(14px,1.05vw,19px)" : 14 }}>👥</span>
        {late && <><span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: bar ? "#fca5a5" : "#b91c1c" }}>{dot("#ef4444")}{c.late} late</span>{bar ? barSep : sep}</>}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{dot(bar ? "#4ade80" : "#16a34a")}{c.on} on</span>
        {c.break > 0 && <>{bar ? barSep : sep}<span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: longBreak ? (bar ? "#fcd34d" : "#a16207") : "inherit" }}>{dot("#f59e0b")}{c.break}{compact >= 2 ? "" : " break"}</span></>}
        {c.next > 0 && compact < 2 && <>{bar ? barSep : sep}<span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{dot("#60a5fa")}{c.next} next{t.next_at && !compact ? " · " + t.next_at : ""}</span></>}
      </span>
      {ask && (
        <ManagerPin title="Team today" sub="Names and times are for managers and owners." confirmLabel="Show team"
          onClose={() => setAsk(false)}
          onSubmit={async (manager_pin) => {
            const r = await post("team_status", { location_id: loc, manager_pin });
            if (r && r.ok && r.people) { setList(r); return null; }
            return (r && (r.message || r.error)) || "That PIN can't open the team list.";
          }} />
      )}
      {list && <TeamPanel data={list} onClose={() => setList(null)} />}
    </>
  );
}

function TeamPanel({ data, onClose }) {
  const groups = [["late", "LATE", "#dc2626"], ["on", "ON SHIFT", "#16a34a"], ["break", "ON BREAK", "#f59e0b"], ["next", "COMING UP", "#3b82f6"]];
  const people = data.people || [];
  const line = (p) => p.state === "late" ? "due " + p.due + " · " + p.late_min + " min late"
    : p.state === "on" ? "in " + p.since + (p.until ? " · until " + p.until : "")
    : p.state === "break" ? "since " + p.since + " · " + p.break_min + " min"
    : p.due + (p.until ? " – " + p.until : "");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(18,21,28,.5)", zIndex: 96, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, width: 420, maxWidth: "100%", maxHeight: "86vh", overflowY: "auto", padding: "16px 18px", boxShadow: "0 30px 80px rgba(18,21,28,.35)", fontFamily: "'Poppins',sans-serif", color: "#1f2937" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>Team today</span>
          <span style={{ fontSize: 12, color: "#64748b" }}>{data.store_name}{data.viewer ? " · seen by " + data.viewer : ""}</span>
        </div>
        {!people.length && <div style={{ fontSize: 13.5, color: "#64748b", marginTop: 12 }}>Nobody is clocked in or on today's rota.</div>}
        {groups.map(([k, label, c]) => {
          const g = people.filter((p) => p.state === k);
          if (!g.length) return null;
          return (
            <div key={k}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".07em", color: k === "late" ? "#b91c1c" : "#64748b", margin: "12px 0 2px" }}>{label}</div>
              {g.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid #eef0f3", fontSize: 14 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>{dot(c)}{p.name}</span>
                  <span style={{ fontSize: 12.5, color: p.state === "break" && p.break_min >= 30 ? "#a16207" : "#64748b", fontWeight: p.state === "break" && p.break_min >= 30 ? 700 : 400 }}>{line(p)}</span>
                </div>
              ))}
            </div>
          );
        })}
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 10 }}>From clock-ins and the published rota. Breaks over 30 minutes show in amber.</div>
        <div onClick={onClose} style={{ marginTop: 12, textAlign: "center", padding: "12px 0", borderRadius: 11, background: "#f1f5f9", fontWeight: 800, cursor: "pointer" }}>Close</div>
      </div>
    </div>
  );
}

export function DrawerChip({ loc }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    if (!loc) return;
    let alive = true;
    const load = async () => { const r = await post("shift_status", { location_id: loc }); if (alive && r && r.ok) setS(r); };
    load(); const id = setInterval(load, 60000);
    const again = () => load();
    window.addEventListener("pos:shift-changed", again);
    return () => { alive = false; clearInterval(id); window.removeEventListener("pos:shift-changed", again); };
  }, [loc]);
  if (!s || s.enabled === false) return null;
  const sh = s.shift;
  const open = () => window.dispatchEvent(new Event("pos:open-shift"));
  if (!sh) return <span onClick={open} style={{ ...chip, background: "#fff", color: "#854d0e", border: "1.5px dashed #f59e0b" }}>💷 Start drawer</span>;
  return <span onClick={open} style={{ ...chip, background: "#fef3c7", color: "#854d0e", border: "1px solid #fde68a" }}>💷 {sh.status === "counting" ? "Drawer · counting" : "Drawer · " + String(sh.opened_by || "").split(" ")[0]}</span>;
}

export function PrinterChip({ problems, onOpen, bar = false }) {
  const bad = problems > 0;
  if (bar) return (
    <span onClick={onOpen} title="What the printers did" style={{ ...barPill(bad), color: bad ? "#fca5a5" : "#ccfbf1" }}>
      {dot(bad ? "#ef4444" : "#4ade80")}{bad ? problems + " not printed" : "Printer"}
    </span>
  );
  return (
    <span onClick={onOpen} title="What the printers did" style={{ ...chip, background: bad ? "#fef2f2" : "#f0fdf4", color: bad ? "#991b1b" : "#166534", border: "1px solid " + (bad ? "#fecaca" : "transparent") }}>
      {dot(bad ? "#dc2626" : "#16a34a")}{bad ? "Printer · " + problems + " not printed" : "Printer"}
    </span>
  );
}

export function LiveChip({ connected, bar = false }) {
  if (bar) return <span style={{ ...barPill(!connected), cursor: "default", color: connected ? "#ccfbf1" : "#fca5a5" }}>{dot(connected ? "#4ade80" : "#ef4444")}{connected ? "Live" : "Offline"}</span>;
  return <span style={{ ...chip, cursor: "default", background: connected ? "#f0fdf4" : "#fef2f2", color: connected ? "#166534" : "#991b1b" }}>{dot(connected ? "#16a34a" : "#dc2626")}{connected ? "Live" : "Offline"}</span>;
}

export function OfflineBar({ connected, bare = false }) {
  if (connected) return null;
  return (
    <div style={{ ...(bare ? { position: "fixed", top: 0, left: 0, right: 0, zIndex: 90 } : { position: "sticky", top: 57, zIndex: 19 }), background: "#dc2626", color: "#fff", fontWeight: 800, fontSize: 14, padding: "8px 20px", display: "flex", alignItems: "center", gap: 8 }}>
      ⚠ No connection — new orders and payments can't be saved. Reconnecting…
    </div>
  );
}

export function SettingsMenu({ sizes, size, setSize, soundOn, setSoundOn, screenLabel, onScreenSetup, fullscreen, goFullscreen, bar = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [open]);
  const icon = { cursor: "pointer", padding: "6px 10px", borderRadius: 8, background: "#ffffff", border: "1px solid #d8dce2", fontSize: 15, userSelect: "none" };
  const row = { padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 14, cursor: "pointer", borderRadius: 8 };
  return (
    <>
      {!bar && <div onClick={goFullscreen} style={icon} title="Fullscreen">{fullscreen ? "✕" : "⛶"}</div>}
      <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
        {bar
          ? <div onClick={() => setOpen((v) => !v)} title="Settings" style={{ ...barPill(false), background: open ? "linear-gradient(135deg,#14b8a6,#0d9488)" : "rgba(94,234,212,.09)", color: open ? "#fff" : "#5eead4", padding: "clamp(11px,.9vw,17px) clamp(12px,1vw,18px)" }}><span style={{ fontSize: "clamp(14px,1.05vw,19px)", lineHeight: 1 }}>⚙</span></div>
          : <div onClick={() => setOpen((v) => !v)} style={{ ...icon, borderColor: open ? "#3f7d4e" : "#d8dce2" }} title="Settings">⚙</div>}
        {open && (
          <div style={{ position: "absolute", right: 0, ...(bar ? { bottom: "calc(100% + 10px)" } : { top: 42 }), width: 270, background: "#fff", border: "1px solid #e3e6ea", borderRadius: 12, boxShadow: "0 12px 34px rgba(15,23,42,.16)", padding: 6, zIndex: 40 }}>
            <div style={{ ...row, cursor: "default" }}>Text size
              <span style={{ display: "flex", background: "#e2e5ea", borderRadius: 8, overflow: "hidden" }}>
                {sizes.map((s) => <span key={s} onClick={() => setSize(s)} style={{ padding: "4px 8px", fontSize: 12, fontWeight: 800, cursor: "pointer", background: size === s ? "#3f7d4e" : "transparent", color: size === s ? "#fff" : "#475569" }}>{s}</span>)}
              </span>
            </div>
            <div onClick={() => setSoundOn((v) => !v)} style={row}>Sound for new orders<b style={{ color: soundOn ? "#3f7d4e" : "#94a3b8" }}>{soundOn ? "On" : "Off"}</b></div>
            <div onClick={() => { setOpen(false); onScreenSetup(); }} style={{ ...row, borderTop: "1px solid #eef0f3" }}>This screen<span style={{ fontSize: 12.5, color: "#64748b" }}>{screenLabel} ⚙</span></div>
            <div onClick={() => window.location.reload()} style={{ ...row, borderTop: "1px solid #eef0f3" }}>Reload the till<span>↻</span></div>
          </div>
        )}
      </div>
    </>
  );
}

// STRIP TOOLS 2026-10-25 — the right-hand end of the till's bottom strip.
// Fullscreen, printer, connection, clock and the screen tools sit on the
// strip while there is room, in that order of importance; whatever doesn't
// fit moves into More automatically, so the strip is always full and nothing
// is ever cut off. More also holds text size, sound, this screen and reload,
// and shows a red dot when the printer or connection needs attention.

const tileBase = { display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 12, fontWeight: 700, fontSize: 14.5, cursor: "pointer", userSelect: "none", background: "rgba(94,234,212,.08)", color: "#ccfbf1", border: "1px solid rgba(94,234,212,.12)" };

export function StripTools({ kit, extra = [], onAnyTap }) {
  const { problems = 0, onPrintLog, connected, usb, clock, fullscreen, goFullscreen } = kit || {};
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState([]);
  const [rowH, setRowH] = useState(null);
  const wrap = useRef(null), box = useRef(null), moreBtn = useRef(null);
  const alert = problems > 0 || connected === false || (usb && usb.state !== "ready");

  // Everything that can live on the strip, most important first.
  const items = [
    goFullscreen && { k: "full", icon: fullscreen ? "✕" : "⛶", label: fullscreen ? "Exit" : "", title: "Fullscreen", tile: fullscreen ? "Leave fullscreen" : "Fullscreen", onClick: goFullscreen },
    kit && { k: "printer", dot: problems ? "#ef4444" : "#4ade80", label: problems ? problems + " not printed" : "Printer", tile: problems ? problems + " not printed" : "Printer · all printed", title: "What the printers did", onClick: onPrintLog, alert: problems > 0 },
    usb && { k: "usb", icon: "🖨", label: usb.state === "ready" ? "USB" : usb.state === "unpaired" ? "Connect printer" : usb.state === "unsupported" ? "USB not supported" : "Printer disconnected", tile: usb.state === "ready" ? "USB printer connected" : "Connect USB printer", onClick: usb.onClick, alert: usb.state !== "ready" },
    kit && { k: "live", dot: connected ? "#4ade80" : "#ef4444", label: connected ? "Live" : "Offline", tile: connected ? "Connected" : "Offline", alert: !connected },
    kit && clock && { k: "clock", label: clock, tile: clock, clock: true },
    ...extra.map((x) => ({ ...x, k: x.k || x.label })),
  ].filter(Boolean);
  const keyStr = items.map((x) => x.k + ":" + x.label).join("|");

  // Work out which pills fit on one row; the rest go into More.
  const measure = () => {
    const el = box.current, mb = moreBtn.current;
    if (!el || !mb) return;
    const h = mb.offsetHeight; if (h && h !== rowH) setRowH(h);
    const out = [];
    for (const c of el.children) if (c.offsetTop > 2 || c.offsetLeft < 0) out.push(c.dataset.k);
    setHidden((prev) => (prev.join() === out.join() ? prev : out));
  };
  useLayoutEffect(measure);
  useEffect(() => {
    if (!wrap.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []); // eslint-disable-line
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [open]);

  const pillStyle = (x) => ({ ...barPill(x.alert), flexShrink: 0, color: x.alert ? "#fca5a5" : x.clock ? "#ccfbf1" : "#5eead4",
    cursor: x.onClick ? "pointer" : "default", fontVariantNumeric: x.clock ? "tabular-nums" : undefined, fontWeight: x.clock ? 800 : 700,
    background: x.on ? "linear-gradient(135deg,#14b8a6,#0d9488)" : x.clock ? "transparent" : barPill(x.alert).background, ...(x.on ? { color: "#fff" } : {}) });
  const tap = (fn) => () => { setOpen(false); onAnyTap && onAnyTap(); fn && fn(); };
  const inMore = items.filter((x) => hidden.includes(x.k));
  const sizes = (kit && kit.sizes) || [];

  return (
    <div ref={wrap} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
      <div ref={box} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "row-reverse", flexWrap: "wrap", alignContent: "flex-start", gap: 6, overflow: "hidden", position: "relative", height: rowH || "auto", contain: "inline-size" }}>
        {items.map((x) => (
          <span key={x.k} data-k={x.k} title={x.title || x.label} onClick={x.onClick ? tap(x.onClick) : undefined}
            style={{ ...pillStyle(x), visibility: hidden.includes(x.k) ? "hidden" : "visible" }}>
            {x.dot && <span style={{ width: 9, height: 9, borderRadius: "50%", background: x.dot, flexShrink: 0 }} />}
            {x.icon && <span style={{ fontSize: "clamp(14px,1.05vw,19px)", lineHeight: 1 }}>{x.icon}</span>}
            {x.label}
          </span>
        ))}
      </div>
      <div ref={moreBtn} onClick={() => setOpen((v) => !v)} title="More"
        style={{ ...barPill(false), flexShrink: 0, position: "relative", fontWeight: 800, background: open ? "linear-gradient(135deg,#14b8a6,#0d9488)" : "rgba(94,234,212,.09)", color: open ? "#fff" : "#5eead4" }}>
        <span style={{ fontSize: "clamp(15px,1.15vw,21px)", lineHeight: 1, letterSpacing: 1 }}>⋯</span>More
        {alert && !open && <span style={{ position: "absolute", top: 5, right: 5, width: 10, height: 10, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 0 2px #0f2e29" }} />}
      </div>
      {open && (
        <div style={{ position: "absolute", right: 0, bottom: "calc(100% + 16px)", width: 360, maxWidth: "92vw", background: "#0f2e29", border: "1px solid rgba(94,234,212,.18)", borderRadius: 16, boxShadow: "0 22px 50px rgba(4,20,17,.45)", padding: 12, zIndex: 60, fontFamily: "'Hanken Grotesk',system-ui,sans-serif", color: "#ccfbf1", display: "grid", gap: 10 }}>
          {inMore.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {inMore.map((x) => (
                <div key={x.k} onClick={x.onClick ? tap(x.onClick) : undefined}
                  style={{ ...tileBase, cursor: x.onClick ? "pointer" : "default", color: x.alert ? "#fca5a5" : "#ccfbf1", borderColor: x.alert ? "rgba(239,68,68,.45)" : "rgba(94,234,212,.12)", background: x.on ? "linear-gradient(135deg,#14b8a6,#0d9488)" : x.alert ? "rgba(239,68,68,.12)" : tileBase.background, fontVariantNumeric: x.clock ? "tabular-nums" : undefined }}>
                  {x.dot && <span style={{ width: 9, height: 9, borderRadius: "50%", background: x.dot, flexShrink: 0 }} />}
                  {x.icon && <span style={{ fontSize: 17, lineHeight: 1, color: "#5eead4" }}>{x.icon}</span>}
                  {x.tile || x.label}
                </div>
              ))}
            </div>
          )}
          {kit && (<>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "4px 4px 0" }}>
              <span style={{ fontWeight: 700, fontSize: 14.5 }}>Text size</span>
              <span style={{ display: "flex", background: "rgba(94,234,212,.08)", borderRadius: 10, padding: 3, gap: 2 }}>
                {sizes.map((z) => <span key={z} onClick={() => kit.setSize(z)} style={{ minWidth: 40, textAlign: "center", padding: "8px 0", fontSize: 13.5, fontWeight: 800, cursor: "pointer", borderRadius: 8, background: kit.size === z ? "linear-gradient(135deg,#14b8a6,#0d9488)" : "transparent", color: kit.size === z ? "#fff" : "#99f6e4" }}>{z}</span>)}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "4px 4px 0" }}>
              <span style={{ fontWeight: 700, fontSize: 14.5 }}>New-order ring</span>
              <span style={{ display: "flex", background: "rgba(94,234,212,.08)", borderRadius: 10, padding: 3, gap: 2 }}>
                {[["off", "Off"], ["loud", "Once"], ["repeat", "Until tap"]].map(([m, l]) => (
                  <span key={m} onClick={() => { kit.setRingMode && kit.setRingMode(m); if (m !== "off" && kit.testRing) setTimeout(kit.testRing, 50); }}
                    style={{ padding: "8px 10px", fontSize: 13, fontWeight: 800, cursor: "pointer", borderRadius: 8, whiteSpace: "nowrap", background: kit.ringMode === m ? "linear-gradient(135deg,#14b8a6,#0d9488)" : "transparent", color: kit.ringMode === m ? "#fff" : "#99f6e4" }}>{l}</span>
                ))}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div onClick={tap(kit.onScreenSetup)} style={tileBase}><span style={{ fontSize: 17, color: "#5eead4" }}>⚙</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>This screen</span></div>
              <div onClick={() => window.location.reload()} style={tileBase}><span style={{ fontSize: 17, color: "#5eead4" }}>↻</span>Reload till</div>
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(204,251,241,.5)", textAlign: "center" }}>{kit.screenLabel}</div>
          </>)}
        </div>
      )}
    </div>
  );
}
