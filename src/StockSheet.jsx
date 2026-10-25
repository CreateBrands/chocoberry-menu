import { useMemo, useRef, useState } from "react";
import { deviceToken } from "./device.js";
import ManagerPin from "./ManagerPin.jsx";

// STOCK ON/OFF 2026-10-25 — More → Items on/off on the till, full screen.
// Any staff PIN for the store opens it. Two ways in:
//   By menu      master menu ▸ category ▸ item ▸ its options, each level
//                collapsible, with an "N off" count on every header and
//                All on / All off today for a whole category
//   All options  every option group once (Sauce, Milk, Extras…), for "we've
//                run out of oat milk" without hunting for an item
// Items and options each have On / Off today (back at 06:00) / Off. An option
// is one switch for the store: turning Lotus off under one item turns it off
// for every item that offers it, and the screen says so. Head-office
// switch-offs show read-only. Every change is logged with who made it.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };
const post = (action, data) => fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, device: deviceToken(), action, data }) })
  .then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) })).catch(() => ({ ok: false, message: "No connection" }));

const C = { ink: "#22271f", muted: "#6b7a60", faint: "#9aa39a", line: "#e6e8e1", soft: "#f6f7f3", bg: "#eef0ea", on: "#16a34a", today: "#d97706", off: "#b91c1c", dark: "#0f2e29" };
const F = "'Poppins',sans-serif";
const hhmm = (iso) => { try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const STATES = [["on", "On", C.on], ["today", "Off today", C.today], ["off", "Off", C.off]];
const isOff = (x) => x.state !== "on";

function Seg({ state, onPick, busy, small }) {
  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", background: "#fff", border: "1px solid " + C.line, borderRadius: 10, padding: 3, gap: 2, flexShrink: 0, opacity: busy ? 0.5 : 1 }}>
      {STATES.map(([k, l, c]) => (
        <span key={k} onClick={() => !busy && state !== k && onPick(k)}
          style={{ padding: small ? "7px 10px" : "9px 13px", borderRadius: 8, fontSize: small ? 12.5 : 13.5, fontWeight: 800, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", background: state === k ? c : "transparent", color: state === k ? "#fff" : C.muted }}>{l}</span>
      ))}
    </span>
  );
}
const Count = ({ n, dark }) => n > 0 ? <span style={{ padding: "2px 9px", borderRadius: 99, fontSize: 12, fontWeight: 800, background: dark ? "#fecaca" : C.off, color: dark ? C.off : "#fff", whiteSpace: "nowrap" }}>{n} off</span> : null;
const Chev = ({ open }) => <span style={{ display: "inline-block", width: 18, color: C.faint, transform: open ? "rotate(90deg)" : "none", transition: "transform .12s", fontSize: 14 }}>▶</span>;

export default function StockSheet({ loc, onClose, onChanged }) {
  const [pin, setPin] = useState(null);
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("menu");
  const [q, setQ] = useState("");
  const [onlyOff, setOnlyOff] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const [changed, setChanged] = useState(false);
  const [open, setOpen] = useState({});            // key -> bool (overrides the default)
  const opened = useRef(false);

  const close = () => { if (changed && onChanged) onChanged(); onClose(); };
  const toggle = (k, def) => setOpen((o) => ({ ...o, [k]: !(k in o ? o[k] : def) }));
  const isOpen = (k, def) => (k in open ? open[k] : def);

  async function set(kind, row, state) {
    setBusy(row.id); setErr("");
    const r = await post("stock_set", { location_id: loc, kind, id: row.id, state, staff_pin: pin, name: row.name });
    setBusy(null);
    if (!r || !r.ok) { setErr((r && r.message) || "Couldn't change " + row.name + " — try again."); return false; }
    setChanged(true);
    const key = kind === "item" ? "items" : "options";
    setD((x) => ({ ...x, [key]: x[key].map((o) => (o.id === row.id ? { ...o, state, until: r.until || null } : o)) }));
    return true;
  }
  async function setMany(list, state) {
    for (const it of list) if (it.state !== "hq" && it.state !== state) { if (!(await set("item", it, state))) break; }
  }

  const needle = q.trim().toLowerCase();
  const filtering = !!needle || onlyOff;
  const groupMap = useMemo(() => new Map(((d && d.groups) || []).map((g) => [g.id, g])), [d]);
  const optsOf = useMemo(() => {
    const m = new Map();
    for (const o of ((d && d.options) || [])) { if (!m.has(o.group_id)) m.set(o.group_id, []); m.get(o.group_id).push(o); }
    for (const l of m.values()) l.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    return m;
  }, [d]);

  // master ▸ category ▸ items, in menu order, filtered.
  const tree = useMemo(() => {
    if (!d) return [];
    const masters = [];
    const mIdx = new Map();
    for (const it of d.items) {
      const opts = (it.groups || []).flatMap((g) => optsOf.get(g) || []);
      const offOpts = opts.filter(isOff).length;
      const hit = !needle || (it.name + " " + it.category + " " + it.menu).toLowerCase().includes(needle) || opts.some((o) => o.name.toLowerCase().includes(needle));
      if (!hit) continue;
      if (onlyOff && !isOff(it) && !offOpts) continue;
      const mk = it.menu_id || it.menu || "menu";
      if (!mIdx.has(mk)) { mIdx.set(mk, { key: "m:" + mk, name: it.menu || "Menu", cats: [], cIdx: new Map() }); masters.push(mIdx.get(mk)); }
      const m = mIdx.get(mk);
      const ck = it.category_id || it.category || "cat";
      if (!m.cIdx.has(ck)) { m.cIdx.set(ck, { key: "c:" + ck, name: it.category || "Other", items: [] }); m.cats.push(m.cIdx.get(ck)); }
      m.cIdx.get(ck).items.push({ ...it, offOpts });
    }
    for (const m of masters) {
      for (const c of m.cats) c.off = c.items.filter(isOff).length;
      m.off = m.cats.reduce((a, c) => a + c.off, 0);
    }
    return masters;
  }, [d, needle, onlyOff, optsOf]);

  const allGroups = useMemo(() => {
    if (!d) return [];
    return d.groups.map((g) => {
      const opts = optsOf.get(g.id) || [];
      const shown = opts.filter((o) => (!onlyOff || isOff(o)) && (!needle || (o.name + " " + g.name).toLowerCase().includes(needle)));
      return { ...g, opts, shown, off: opts.filter(isOff).length, allOff: opts.length > 0 && opts.every(isOff) };
    }).filter((g) => g.shown.length).sort((a, b) => a.name.localeCompare(b.name));
  }, [d, needle, onlyOff, optsOf]);

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

  const nItemsOff = d.items.filter(isOff).length;
  const nOptsOff = d.options.filter(isOff).length;
  const back = (o) => o.state === "today" && o.until ? <span style={{ fontSize: 12, color: C.today, fontWeight: 700, whiteSpace: "nowrap" }}>back {hhmm(o.until)}</span> : null;
  const strike = (o) => ({ color: isOff(o) ? C.muted : C.ink, textDecoration: isOff(o) ? "line-through" : "none" });

  const optionRow = (o, indent) => (
    <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 10px 7px " + indent + "px", borderTop: "1px solid #f0f2ec" }}>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14.5, ...strike(o) }}>{o.name}</span>
      {back(o)}
      <Seg small state={o.state} busy={busy === o.id} onPick={(s) => set("option", o, s)} />
    </div>
  );
  const groupBlock = (g, indent, forItem) => {
    const opts = (optsOf.get(g.id) || []).filter((o) => !onlyOff || isOff(o) || forItem);
    const others = (g.used_by || []).filter((n) => n !== forItem);
    const allOff = (optsOf.get(g.id) || []).length > 0 && (optsOf.get(g.id) || []).every(isOff);
    return (
      <div key={g.id} style={{ margin: "6px 0 4px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", padding: "4px 10px 4px " + indent + "px" }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: C.muted }}>{g.name}</span>
          {g.required && <span style={{ fontSize: 11, fontWeight: 700, color: C.faint }}>required</span>}
          {others.length > 0 && <span style={{ fontSize: 12, color: C.faint }}>shared with {others.slice(0, 3).join(", ")}{others.length > 3 ? " +" + (others.length - 3) + " more" : ""} — changes apply to all</span>}
        </div>
        {g.required && allOff && <div style={{ fontSize: 12.5, color: C.off, fontWeight: 700, padding: "2px 10px 4px " + indent + "px" }}>⚠ Every choice is off and one is required — {forItem || "these items"} can't be ordered. Turn one back on or turn the item off.</div>}
        {opts.map((o) => optionRow(o, indent))}
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 95, background: C.bg, display: "flex", flexDirection: "column", fontFamily: F, color: C.ink }}>
      {/* Header */}
      <div style={{ background: C.dark, color: "#ccfbf1", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", color: "#fff", marginRight: 6 }}>Items on/off</span>
        {[["menu", "By menu", nItemsOff], ["opts", "All options", nOptsOff]].map(([k, l, n]) => (
          <span key={k} onClick={() => setTab(k)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 11, fontWeight: 800, fontSize: 14.5, cursor: "pointer", userSelect: "none", background: tab === k ? "linear-gradient(135deg,#14b8a6,#0d9488)" : "rgba(94,234,212,.09)", color: tab === k ? "#fff" : "#5eead4" }}>
            {l}<Count n={n} dark />
          </span>
        ))}
        <span onClick={() => setOnlyOff((v) => !v)} style={{ padding: "10px 14px", borderRadius: 11, fontWeight: 700, fontSize: 13.5, cursor: "pointer", userSelect: "none", background: onlyOff ? "#fef3c7" : "rgba(94,234,212,.09)", color: onlyOff ? "#92400e" : "#5eead4" }}>Only what's off</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items or options"
          style={{ flex: 1, minWidth: 160, padding: "11px 14px", borderRadius: 11, border: "none", background: "rgba(255,255,255,.95)", fontSize: 15, fontFamily: F, outline: "none" }} />
        {tab === "menu" && !filtering && (<>
          <span onClick={() => { const o = {}; for (const m of tree) { o[m.key] = true; for (const c of m.cats) o[c.key] = true; } setOpen(o); }} style={{ padding: "10px 12px", borderRadius: 11, fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#5eead4", background: "rgba(94,234,212,.09)" }}>Expand all</span>
          <span onClick={() => { const o = {}; for (const m of tree) { o[m.key] = false; } setOpen(o); }} style={{ padding: "10px 12px", borderRadius: 11, fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#5eead4", background: "rgba(94,234,212,.09)" }}>Collapse</span>
        </>)}
        <span onClick={close} style={{ padding: "11px 24px", borderRadius: 11, background: "#fff", color: C.ink, fontWeight: 800, cursor: "pointer", marginLeft: "auto" }}>Done</span>
      </div>
      {err && <div style={{ background: "#fef2f2", color: C.off, fontSize: 14, fontWeight: 700, padding: "8px 18px" }}>{err}</div>}

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 30px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          {tab === "menu" && (<>
            {!tree.length && <div style={{ color: C.muted, fontSize: 15, padding: 30, textAlign: "center" }}>{onlyOff ? "Everything is on." : "Nothing matches."}</div>}
            {tree.map((m) => {
              const mOpen = filtering || isOpen(m.key, tree.length <= 2);
              return (
                <div key={m.key} style={{ background: "#fff", borderRadius: 14, border: "1px solid " + C.line, marginBottom: 12, overflow: "hidden" }}>
                  <div onClick={() => toggle(m.key, tree.length <= 2)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", cursor: "pointer", userSelect: "none", background: mOpen ? "#fafbf8" : "#fff" }}>
                    <Chev open={mOpen} />
                    <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.01em", flex: 1 }}>{m.name}</span>
                    <span style={{ fontSize: 12.5, color: C.faint }}>{m.cats.length} {m.cats.length === 1 ? "category" : "categories"}</span>
                    <Count n={m.off} />
                  </div>
                  {mOpen && m.cats.map((c) => {
                    const cOpen = filtering || isOpen(c.key, false);
                    const canBulk = c.items.some((i) => i.state !== "hq");
                    return (
                      <div key={c.key} style={{ borderTop: "1px solid " + C.line }}>
                        <div onClick={() => toggle(c.key, false)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px 11px 30px", cursor: "pointer", userSelect: "none" }}>
                          <Chev open={cOpen} />
                          <span style={{ fontSize: 15.5, fontWeight: 700, flex: 1 }}>{c.name} <span style={{ fontSize: 12.5, color: C.faint, fontWeight: 500 }}>· {c.items.length}</span></span>
                          <Count n={c.off} />
                          {cOpen && canBulk && (
                            <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6 }}>
                              <span onClick={() => setMany(c.items, "on")} style={{ padding: "7px 11px", borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: "1px solid " + C.line, color: C.on }}>All on</span>
                              <span onClick={() => setMany(c.items, "today")} style={{ padding: "7px 11px", borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: "1px solid " + C.line, color: C.today }}>All off today</span>
                            </span>
                          )}
                        </div>
                        {cOpen && c.items.map((it) => {
                          const groups = (it.groups || []).map((g) => groupMap.get(g)).filter(Boolean);
                          const iKey = "i:" + it.id;
                          const iOpen = isOpen(iKey, !!needle && groups.some((g) => (optsOf.get(g.id) || []).some((o) => o.name.toLowerCase().includes(needle))));
                          return (
                            <div key={it.id} style={{ borderTop: "1px solid #f0f2ec", background: iOpen ? "#fbfcfa" : "#fff" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px 9px 72px" }}>
                                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15.5, ...strike(it) }}>{it.name}</span>
                                {groups.length > 0 && (
                                  <span onClick={() => toggle(iKey, iOpen)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", userSelect: "none", border: "1px solid " + (it.offOpts ? "#fecaca" : C.line), color: it.offOpts ? C.off : C.muted, background: iOpen ? C.soft : "#fff", whiteSpace: "nowrap" }}>
                                    <Chev open={iOpen} />Options{it.offOpts ? " · " + it.offOpts + " off" : ""}
                                  </span>
                                )}
                                {back(it)}
                                {it.state === "hq"
                                  ? <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 700, padding: "9px 4px", whiteSpace: "nowrap" }}>Off · head office</span>
                                  : <Seg state={it.state} busy={busy === it.id} onPick={(s) => set("item", it, s)} />}
                              </div>
                              {iOpen && <div style={{ paddingBottom: 6 }}>{groups.map((g) => groupBlock(g, 96, it.name))}</div>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>)}

          {tab === "opts" && (<>
            {!allGroups.length && <div style={{ color: C.muted, fontSize: 15, padding: 30, textAlign: "center" }}>{onlyOff ? "Every option is on." : "Nothing matches."}</div>}
            <div style={{ columnWidth: 520, columnGap: 12 }}>
              {allGroups.map((g) => {
                const gOpen = filtering || isOpen("g:" + g.id, true);
                return (
                  <div key={g.id} style={{ breakInside: "avoid", background: "#fff", borderRadius: 14, border: "1px solid " + C.line, marginBottom: 12, overflow: "hidden" }}>
                    <div onClick={() => toggle("g:" + g.id, true)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer", userSelect: "none" }}>
                      <Chev open={gOpen} />
                      <span style={{ fontSize: 16, fontWeight: 800, flex: 1 }}>{g.name}{g.required && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.faint, marginLeft: 8 }}>required</span>}</span>
                      <span style={{ fontSize: 12, color: C.faint }}>{(g.used_by || []).length} items</span>
                      <Count n={g.off} />
                    </div>
                    {gOpen && (<>
                      {(g.used_by || []).length > 0 && <div style={{ fontSize: 12, color: C.faint, padding: "0 14px 6px 42px" }}>{g.used_by.slice(0, 5).join(", ")}{g.used_by.length > 5 ? " +" + (g.used_by.length - 5) + " more" : ""}</div>}
                      {g.required && g.allOff && <div style={{ fontSize: 12.5, color: C.off, fontWeight: 700, padding: "0 14px 6px 42px" }}>⚠ Every choice is off and one is required — these items can't be ordered.</div>}
                      {g.shown.map((o) => optionRow(o, 42))}
                    </>)}
                  </div>
                );
              })}
            </div>
          </>)}
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: "9px 18px", background: "#fff", borderTop: "1px solid " + C.line, fontSize: 12.5, color: C.muted, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>Changes recorded as <b style={{ color: C.ink }}>{d.by}</b></span>
        <span>Off today comes back by itself at 06:00.</span>
        <span>The kiosk, QR menu and other tills pick changes up within a couple of minutes.</span>
      </div>
    </div>
  );
}
