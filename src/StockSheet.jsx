import { useMemo, useRef, useState } from "react";
import { deviceToken } from "./device.js";
import ManagerPin from "./ManagerPin.jsx";

// STOCK ON/OFF 2026-10-25 — More → Items on/off on the till. Any staff PIN
// for the store opens it. Items and modifier options each have three states:
//   On         selling
//   Off today  back by itself at 06:00 (the usual "we've run out")
//   Off        stays off at this store until someone turns it back on
// Head-office switch-offs show as "Off · head office" and can't be changed
// here. Every change is logged with who made it.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };
const post = (action, data) => fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, device: deviceToken(), action, data }) })
  .then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) })).catch(() => ({ ok: false, message: "No connection" }));

const C = { ink: "#22271f", muted: "#6b7a60", line: "#e6e8e1", soft: "#f6f7f3", on: "#16a34a", today: "#d97706", off: "#b91c1c" };
const F = "'Poppins',sans-serif";
const hhmm = (iso) => { try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const STATES = [["on", "On", C.on], ["today", "Off today", C.today], ["off", "Off", C.off]];

function Seg({ state, onPick, busy }) {
  return (
    <span style={{ display: "flex", background: C.soft, border: "1px solid " + C.line, borderRadius: 10, padding: 3, gap: 2, flexShrink: 0, opacity: busy ? 0.5 : 1 }}>
      {STATES.map(([k, l, c]) => (
        <span key={k} onClick={() => !busy && state !== k && onPick(k)}
          style={{ padding: "9px 12px", borderRadius: 8, fontSize: 13.5, fontWeight: 800, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", background: state === k ? c : "transparent", color: state === k ? "#fff" : C.muted }}>{l}</span>
      ))}
    </span>
  );
}

export default function StockSheet({ loc, onClose, onChanged }) {
  const [pin, setPin] = useState(null);
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("items");
  const [q, setQ] = useState("");
  const [onlyOff, setOnlyOff] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const [changed, setChanged] = useState(false);
  const opened = useRef(false);

  const close = () => { if (changed && onChanged) onChanged(); onClose(); };

  async function set(kind, row, state) {
    setBusy(row.id); setErr("");
    const r = await post("stock_set", { location_id: loc, kind, id: row.id, state, staff_pin: pin, name: row.name });
    setBusy(null);
    if (!r || !r.ok) { setErr((r && r.message) || "Couldn't change " + row.name + " — try again."); return; }
    setChanged(true);
    const key = kind === "item" ? "items" : "options";
    setD((x) => ({ ...x, [key]: x[key].map((o) => (o.id === row.id ? { ...o, state, until: r.until || null } : o)) }));
  }

  const needle = q.trim().toLowerCase();
  const items = useMemo(() => {
    if (!d) return [];
    const g = new Map();
    for (const it of d.items) {
      if (onlyOff && it.state === "on") continue;
      if (needle && !(it.name + " " + it.category).toLowerCase().includes(needle)) continue;
      const k = it.category || "Other";
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(it);
    }
    return [...g.entries()];
  }, [d, needle, onlyOff]);
  const groups = useMemo(() => {
    if (!d) return [];
    return d.groups.map((g) => {
      const opts = d.options.filter((o) => o.group_id === g.id).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
      const shown = opts.filter((o) => (!onlyOff || o.state !== "on") && (!needle || (o.name + " " + g.name).toLowerCase().includes(needle)));
      return { ...g, opts, shown, allOff: opts.length > 0 && opts.every((o) => o.state !== "on") };
    }).filter((g) => g.shown.length).sort((a, b) => a.name.localeCompare(b.name));
  }, [d, needle, onlyOff]);

  if (!pin) {
    return (
      <ManagerPin title="Items on/off" sub="Turn items and extras off when you run out. Your PIN is recorded against each change." pinLabel="YOUR PIN" confirmLabel="Open"
        onClose={() => { if (!opened.current) onClose(); }}
        onSubmit={async (p) => {
          const r = await post("stock_list", { location_id: loc, staff_pin: p });
          if (r && r.ok) { opened.current = true; setD(r); setPin(p); return null; }
          return (r && (r.message || r.error)) || "That PIN isn't recognised here.";
        }} />
    );
  }

  const nItemsOff = d.items.filter((i) => i.state !== "on").length;
  const nOptsOff = d.options.filter((o) => o.state !== "on").length;
  const row = { display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderBottom: "1px solid #eef0eb" };
  const head = { fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", color: C.muted, margin: "16px 4px 2px", textTransform: "uppercase" };
  const note = (o) => o.state === "today" && o.until ? <span style={{ fontSize: 12, color: C.today, fontWeight: 700 }}>back {hhmm(o.until)}</span> : null;

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(18,21,28,.58)", zIndex: 95, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, fontFamily: F, color: C.ink }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 22, width: 760, maxWidth: "100%", height: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(18,21,28,.35)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 12px", borderBottom: "1px solid " + C.line }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.02em" }}>Items on/off</span>
            <span style={{ fontSize: 12.5, color: C.muted }}>changes recorded as {d.by}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            {[["items", "Items", nItemsOff], ["mods", "Extras & options", nOptsOff]].map(([k, l, n]) => (
              <span key={k} onClick={() => setTab(k)} style={{ padding: "10px 16px", borderRadius: 11, fontWeight: 800, fontSize: 14.5, cursor: "pointer", userSelect: "none", background: tab === k ? C.ink : C.soft, color: tab === k ? "#fff" : C.ink, border: "1px solid " + (tab === k ? C.ink : C.line) }}>
                {l}{n > 0 && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 99, fontSize: 12, background: tab === k ? "#fff" : C.off, color: tab === k ? C.off : "#fff" }}>{n} off</span>}
              </span>
            ))}
            <span onClick={() => setOnlyOff((v) => !v)} style={{ padding: "10px 14px", borderRadius: 11, fontWeight: 700, fontSize: 13.5, cursor: "pointer", userSelect: "none", background: onlyOff ? "#fef3c7" : "#fff", color: onlyOff ? "#92400e" : C.muted, border: "1px solid " + (onlyOff ? "#fcd34d" : C.line) }}>Only show what's off</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
              style={{ flex: 1, minWidth: 140, padding: "11px 14px", borderRadius: 11, border: "1px solid " + C.line, background: C.soft, fontSize: 15, fontFamily: F, outline: "none" }} />
          </div>
          {err && <div style={{ color: C.off, fontSize: 13.5, fontWeight: 600, marginTop: 8 }}>{err}</div>}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 16px" }}>
          {tab === "items" && (<>
            {!items.length && <div style={{ color: C.muted, fontSize: 14, marginTop: 20 }}>{onlyOff ? "Everything is on." : "No items match."}</div>}
            {items.map(([cat, list]) => (
              <div key={cat}>
                <div style={head}>{cat}</div>
                {list.map((it) => (
                  <div key={it.id} style={row}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15, color: it.state === "on" ? C.ink : C.muted, textDecoration: it.state === "on" ? "none" : "line-through" }}>{it.name}</span>
                    {note(it)}
                    {it.state === "hq"
                      ? <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 700, padding: "9px 4px" }}>Off · head office</span>
                      : <Seg state={it.state} busy={busy === it.id} onPick={(s) => set("item", it, s)} />}
                  </div>
                ))}
              </div>
            ))}
          </>)}
          {tab === "mods" && (<>
            {!groups.length && <div style={{ color: C.muted, fontSize: 14, marginTop: 20 }}>{onlyOff ? "Every option is on." : "No options match."}</div>}
            {groups.map((g) => (
              <div key={g.id}>
                <div style={{ ...head, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  {g.name}
                  <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#9aa39a" }}>{g.used_by.join(", ")}{g.used_by.length >= 4 ? "…" : ""}</span>
                </div>
                {g.required && g.allOff && (
                  <div style={{ fontSize: 12.5, color: C.off, fontWeight: 700, margin: "4px 4px 2px" }}>⚠ Every choice here is off and a choice is required — customers can't order {g.used_by[0] || "these items"}. Turn one back on or turn the item off.</div>
                )}
                {g.shown.map((o) => (
                  <div key={o.id} style={row}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15, color: o.state === "on" ? C.ink : C.muted, textDecoration: o.state === "on" ? "none" : "line-through" }}>{o.name}</span>
                    {note(o)}
                    <Seg state={o.state} busy={busy === o.id} onPick={(s) => set("option", o, s)} />
                  </div>
                ))}
              </div>
            ))}
          </>)}
        </div>

        <div style={{ padding: "12px 22px", borderTop: "1px solid " + C.line, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ flex: 1, fontSize: 12.5, color: C.muted, lineHeight: 1.4 }}>Off today comes back by itself at 06:00. The kiosk, QR menu and other tills pick changes up within a couple of minutes.</span>
          <span onClick={close} style={{ padding: "13px 26px", borderRadius: 12, background: C.ink, color: "#fff", fontWeight: 800, cursor: "pointer" }}>Done</span>
        </div>
      </div>
    </div>
  );
}
