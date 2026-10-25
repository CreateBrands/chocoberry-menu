import { useEffect, useRef, useState } from "react";
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

export function TeamChip({ loc, onStoreName, bar = false, compact = false }) {
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
      <span onClick={() => setAsk(true)} title="Team today (managers)" style={bar ? barPill(late) : { ...chip, background: late ? "#fff7f7" : "#f8fafc", border: "1px solid " + (late ? "#fecaca" : "#e2e8f0"), color: "#1f2937" }}>
        <span style={{ fontSize: bar ? "clamp(14px,1.05vw,19px)" : 14 }}>👥</span>
        {late && <><span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: bar ? "#fca5a5" : "#b91c1c" }}>{dot("#ef4444")}{c.late} late</span>{bar ? barSep : sep}</>}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{dot(bar ? "#4ade80" : "#16a34a")}{c.on} on</span>
        {c.break > 0 && <>{bar ? barSep : sep}<span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: longBreak ? (bar ? "#fcd34d" : "#a16207") : "inherit" }}>{dot("#f59e0b")}{c.break}{compact ? "" : " break"}</span></>}
        {c.next > 0 && <>{bar ? barSep : sep}<span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{dot("#60a5fa")}{c.next} next{t.next_at && !compact ? " · " + t.next_at : ""}</span></>}
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
