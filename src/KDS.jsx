import React, { useState, useEffect, useRef, useCallback } from "react";

// ============================================================================
// Create Brands / Chocoberry — Kitchen Display System (v2, comprehensive)
// Live board on menu_order_status lifecycle. Station-routing ready.
// Features: aging colours + timers, item-level complete, whole-ticket bump,
// rush/priority flag, undo bump, all-day counts, completed/recall,
// prep-time analytics, adjustable text size, fullscreen, sound, keyboard bump.
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };

const WARN_MIN = 8;
const LATE_MIN = 15;
const POLL_MS = 4000;
const BUMP_TO = "served";
const DONE_ITEM = "ready";

const SIZES = { S: 0.85, M: 1, L: 1.18, XL: 1.4 };

function getParam(k) { try { return new URLSearchParams(window.location.search).get(k); } catch { return null; } }
function minsSince(iso, now) { return (now - new Date(iso).getTime()) / 60000; }
function fmtClock(iso, now) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const m = Math.floor(s / 60), ss = s % 60;
  return m + ":" + String(ss).padStart(2, "0");
}

export default function KDS() {
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [loc, setLoc] = useState(getParam("loc"));
  const [tab, setTab] = useState("active");
  const [station, setStation] = useState("all");
  const [soundOn, setSoundOn] = useState(true);
  const [connected, setConnected] = useState(true);
  const [size, setSize] = useState(() => localStorage.getItem("kds_size") || "M");
  const [fullscreen, setFullscreen] = useState(false);
  const [undo, setUndo] = useState(null);
  const [rushIds, setRushIds] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("kds_rush") || "[]")); } catch { return new Set(); } });
  const prevIds = useRef(new Set());
  const audioCtx = useRef(null);
  const scale = SIZES[size] || 1;

  useEffect(() => { localStorage.setItem("kds_size", size); }, [size]);
  useEffect(() => { try { localStorage.setItem("kds_rush", JSON.stringify([...rushIds])); } catch {} }, [rushIds]);

  useEffect(() => {
    const token = getParam("store");
    if (token && !loc) {
      fetch(SUPABASE_URL + "/rest/v1/rpc/resolve_store", { method: "POST", headers: H, body: JSON.stringify({ token }) })
        .then((r) => r.ok ? r.json() : []).then((rows) => { if (rows && rows.length) setLoc(rows[0].location_id); }).catch(() => {});
    }
  }, []);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const beep = useCallback(() => {
    if (!soundOn) return;
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; o.type = "sine";
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start(); o.stop(ctx.currentTime + 0.4);
    } catch {}
  }, [soundOn]);

  const load = useCallback(async () => {
    try {
      let url = SUPABASE_URL + "/rest/v1/menu_orders?select=id,order_no,tablet_no,order_type,pickup_name,customer_note,status,kds_started_at,kds_bumped_at,created_at,menu_tables(label),menu_order_items(id,name_snapshot,qty,modifiers_snapshot,item_status,station)"
        + "&status=in.(placed,preparing,ready,served)"
        + "&closed_at=is.null&order=created_at.asc&limit=200";
      if (loc) url += "&location_id=eq." + loc;
      const r = await fetch(url, { headers: H, cache: "no-store" });
      if (!r.ok) throw new Error("http " + r.status);
      const data = await r.json();
      setConnected(true);
      const activeIds = new Set(data.filter((o) => o.status !== BUMP_TO).map((o) => o.id));
      let isNew = false;
      for (const id of activeIds) if (!prevIds.current.has(id)) { isNew = true; break; }
      if (isNew && prevIds.current.size > 0) beep();
      prevIds.current = activeIds;
      setOrders(data);
    } catch { setConnected(false); }
  }, [loc, beep]);

  useEffect(() => { load(); const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load]);

  async function patchOrder(id, body) {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, ...body } : o));
    try { await fetch(SUPABASE_URL + "/rest/v1/menu_orders?id=eq." + id, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body) }); } catch {}
    load();
  }
  async function patchItem(id, body) {
    setOrders((prev) => prev.map((o) => ({ ...o, menu_order_items: o.menu_order_items.map((it) => it.id === id ? { ...it, ...body } : it) })));
    try { await fetch(SUPABASE_URL + "/rest/v1/menu_order_items?id=eq." + id, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body) }); } catch {}
  }

  const start = (o) => patchOrder(o.id, { status: "preparing", kds_started_at: new Date().toISOString() });
  const bump = (o) => {
    const prevStatus = o.status;
    patchOrder(o.id, { status: BUMP_TO, kds_bumped_at: new Date().toISOString() });
    if (undo && undo.timer) clearTimeout(undo.timer);
    const timer = setTimeout(() => setUndo(null), 6000);
    setUndo({ order: o, prevStatus, timer });
  };
  const doUndo = () => {
    if (!undo) return;
    patchOrder(undo.order.id, { status: undo.prevStatus, kds_bumped_at: null });
    if (undo.timer) clearTimeout(undo.timer);
    setUndo(null);
  };
  const recall = (o) => patchOrder(o.id, { status: "preparing", kds_bumped_at: null });
  const toggleItem = (o, it) => patchItem(it.id, { item_status: it.item_status === DONE_ITEM ? "preparing" : DONE_ITEM });
  const toggleRush = (o) => setRushIds((prev) => { const n = new Set(prev); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n; });

  const stationOf = (it) => it.station || "kitchen";
  const filterStation = (o) => {
    if (station === "all") return o;
    const items = (o.menu_order_items || []).filter((it) => stationOf(it) === station);
    return items.length ? { ...o, menu_order_items: items } : null;
  };

  let active = orders.filter((o) => o.status !== BUMP_TO).map(filterStation).filter(Boolean);
  active.sort((a, b) => (rushIds.has(b.id) ? 1 : 0) - (rushIds.has(a.id) ? 1 : 0));
  const completed = orders.filter((o) => o.status === BUMP_TO).map(filterStation).filter(Boolean)
    .sort((a, b) => new Date(b.kds_bumped_at || b.created_at) - new Date(a.kds_bumped_at || a.created_at));

  const allday = {};
  for (const o of active) for (const it of (o.menu_order_items || [])) {
    if (it.item_status === DONE_ITEM) continue;
    allday[it.name_snapshot] = (allday[it.name_snapshot] || 0) + (it.qty || 1);
  }
  const alldayRows = Object.entries(allday).sort((a, b) => b[1] - a[1]);

  const bumpedToday = completed.filter((o) => o.kds_bumped_at);
  let avgSecs = 0, onTime = 0;
  if (bumpedToday.length) {
    let total = 0;
    for (const o of bumpedToday) {
      const secs = (new Date(o.kds_bumped_at) - new Date(o.created_at)) / 1000;
      total += secs;
      if (secs <= LATE_MIN * 60) onTime++;
    }
    avgSecs = total / bumpedToday.length;
  }
  const avgLabel = avgSecs ? Math.floor(avgSecs / 60) + ":" + String(Math.floor(avgSecs % 60)).padStart(2, "0") : "\u2014";
  const onTimePct = bumpedToday.length ? Math.round((onTime / bumpedToday.length) * 100) : null;

  useEffect(() => {
    const onKey = (e) => {
      if (tab !== "active") return;
      const n = parseInt(e.key);
      if (n >= 1 && n <= 9 && active[n - 1]) bump(active[n - 1]);
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) doUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, tab, undo]);

  const goFullscreen = () => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen?.(); setFullscreen(true); }
    else { document.exitFullscreen?.(); setFullscreen(false); }
  };
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const stations = Array.from(new Set(orders.flatMap((o) => (o.menu_order_items || []).map(stationOf))));
  const nowClock = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const F = (px) => Math.round(px * scale);
  const BOLT = "\u26A1", CHECK = "\u2713", ARROW = "\u21A9", WARN = "\u26A0", DOT = "\u00B7", TIMES = "\u00D7", BELL = "\uD83D\uDD14", BELLOFF = "\uD83D\uDD15", EXPAND = "\u26F6", X = "\u2715";

  return (
    <div style={{ fontFamily: "'Hanken Grotesk',system-ui,-apple-system,sans-serif", background: "#0d0f13", color: "#fff", minHeight: "100vh", cursor: fullscreen ? "none" : "auto" }}>
      <style>{"@keyframes kpop{0%{transform:scale(.94);opacity:0}100%{transform:scale(1);opacity:1}}@keyframes kpulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}.kcard{animation:kpop .18s ease-out}.krush{animation:kpulse 1.4s infinite}.kbtn:active{transform:translateY(1px)}::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:4px}"}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "linear-gradient(180deg,#191d26,#141821)", borderBottom: "1px solid #262b36", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontWeight: 800, fontSize: 21, letterSpacing: "-.02em" }}>Chocoberry <span style={{ color: "#f472b6" }}>KDS</span></span>
          <div style={{ display: "flex", gap: 6 }}>
            {[["active", "Active"], ["allday", "All-day"], ["completed", "Done"]].map(([t, label]) => (
              <div key={t} onClick={() => setTab(t)} className="kbtn" style={{ padding: "7px 15px", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 700, background: tab === t ? "#ec4899" : "#20242f", transition: "background .12s" }}>
                {label}{t === "active" ? " " + active.length : ""}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 13 }}>
          <Stat label="Time" value={nowClock} />
          <Stat label="Working" value={active.length} accent="#fbbf24" />
          <Stat label="Avg today" value={avgLabel} accent="#60a5fa" />
          {onTimePct !== null && <Stat label="On-time" value={onTimePct + "%"} accent={onTimePct >= 80 ? "#4ade80" : "#f59e0b"} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {stations.length > 1 && (
            <select value={station} onChange={(e) => setStation(e.target.value)} style={{ background: "#20242f", color: "#fff", border: "1px solid #333", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>
              <option value="all">All stations</option>
              {stations.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <div style={{ display: "flex", background: "#20242f", borderRadius: 8, overflow: "hidden" }}>
            {Object.keys(SIZES).map((s) => (
              <div key={s} onClick={() => setSize(s)} className="kbtn" style={{ padding: "6px 9px", cursor: "pointer", fontSize: 12, fontWeight: 700, background: size === s ? "#ec4899" : "transparent" }}>{s}</div>
            ))}
          </div>
          <div onClick={() => setSoundOn((v) => !v)} className="kbtn" style={{ cursor: "pointer", padding: "6px 10px", borderRadius: 8, background: "#20242f", fontSize: 15 }}>{soundOn ? BELL : BELLOFF}</div>
          <div onClick={goFullscreen} className="kbtn" style={{ cursor: "pointer", padding: "6px 10px", borderRadius: 8, background: "#20242f", fontSize: 15 }} title="Fullscreen">{fullscreen ? X : EXPAND}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: connected ? "#4ade80" : "#f87171", marginLeft: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#4ade80" : "#f87171" }} />
            {connected ? "Live" : "\u2026"}
          </div>
        </div>
      </div>

      {tab === "active" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(" + F(268) + "px, 1fr))", gap: F(12), padding: F(16), alignItems: "start" }}>
          {active.length === 0 && <div style={{ color: "#6b7280", padding: 48, fontSize: 18 }}>No active orders.</div>}
          {active.map((o, i) => {
            const age = minsSince(o.created_at, now);
            const isRush = rushIds.has(o.id);
            const border = isRush ? "#ef4444" : age >= LATE_MIN ? "#ef4444" : age >= WARN_MIN ? "#f59e0b" : "#22c55e";
            const headerBg = isRush ? "#991b1b" : age >= LATE_MIN ? "#7f1d1d" : age >= WARN_MIN ? "#78350f" : "#14532d";
            const items = o.menu_order_items || [];
            const doneCount = items.filter((it) => it.item_status === DONE_ITEM).length;
            const allDone = items.length > 0 && doneCount === items.length;
            const typeLabel = o.menu_tables?.label ? o.menu_tables.label : (o.order_type === "dine_in" ? "Dine In" : o.order_type === "collection" ? "Collection" : "Takeaway");
            const note = (o.customer_note || "").trim();
            return (
              <div key={o.id} className={"kcard" + (isRush ? " krush" : "")} style={{ background: "#161a22", borderRadius: F(13), overflow: "hidden", border: "2px solid " + border, display: "flex", flexDirection: "column" }}>
                <div style={{ background: headerBg, padding: F(8) + "px " + F(12) + "px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: F(18), display: "flex", alignItems: "center", gap: 6 }}>
                      {isRush && <span>{BOLT}</span>}{(o.tablet_no ? "T" + o.tablet_no + "-" : "#") + (o.order_no ?? "")}
                      <span style={{ fontSize: F(11), fontWeight: 700, opacity: .65, background: "#00000040", padding: "1px 6px", borderRadius: 4 }}>{i + 1}</span>
                    </div>
                    <div style={{ fontSize: F(12), opacity: .9 }}>{typeLabel}{o.pickup_name ? " " + DOT + " " + o.pickup_name : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: F(19), fontVariantNumeric: "tabular-nums" }}>{fmtClock(o.created_at, now)}</div>
                    <div style={{ fontSize: F(10), opacity: .8 }}>{items.length ? doneCount + "/" + items.length : ""}{o.status === "preparing" ? " " + DOT + " prep" : ""}</div>
                  </div>
                </div>
                <div style={{ padding: F(7) + "px " + F(10) + "px", flex: 1 }}>
                  {items.map((it) => {
                    const done = it.item_status === DONE_ITEM;
                    const mods = it.modifiers_snapshot && typeof it.modifiers_snapshot === "object" ? Object.values(it.modifiers_snapshot) : [];
                    return (
                      <div key={it.id} onClick={() => toggleItem(o, it)} style={{ padding: F(6) + "px " + F(4) + "px", borderBottom: "1px solid #23283340", cursor: "pointer", opacity: done ? .38 : 1, transition: "opacity .1s" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <span style={{ fontWeight: 800, fontSize: F(15), color: "#fbbf24", minWidth: F(24) }}>{(it.qty || 1) + TIMES}</span>
                          <span style={{ fontWeight: 700, fontSize: F(15), textDecoration: done ? "line-through" : "none" }}>{it.name_snapshot}</span>
                        </div>
                        {mods.length > 0 && <div style={{ fontSize: F(13), color: "#93c5fd", paddingLeft: F(32), fontWeight: 600 }}>{mods.join(" " + DOT + " ")}</div>}
                      </div>
                    );
                  })}
                  {note && <div style={{ marginTop: F(6), fontSize: F(13), color: "#fca5a5", background: "#450a0a", padding: F(4) + "px " + F(8) + "px", borderRadius: 6, fontWeight: 600 }}>{WARN + " " + note}</div>}
                </div>
                <div style={{ display: "flex", gap: 1 }}>
                  <div onClick={() => toggleRush(o)} className="kbtn" style={{ width: F(46), textAlign: "center", padding: F(10) + "px 0", background: isRush ? "#ef4444" : "#2a3040", fontWeight: 800, fontSize: F(15), cursor: "pointer" }} title="Rush">{BOLT}</div>
                  {o.status === "placed" && <div onClick={() => start(o)} className="kbtn" style={{ flex: 1, textAlign: "center", padding: F(10) + "px 0", background: "#334155", fontWeight: 700, fontSize: F(14), cursor: "pointer" }}>Start</div>}
                  <div onClick={() => bump(o)} className="kbtn" style={{ flex: 2, textAlign: "center", padding: F(10) + "px 0", background: allDone ? "#16a34a" : "#22c55e", fontWeight: 800, fontSize: F(15), cursor: "pointer", color: "#04120a" }}>{CHECK + " Bump"}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "allday" && (
        <div style={{ padding: F(16), maxWidth: 620 }}>
          <div style={{ fontSize: F(14), color: "#9ca3af", marginBottom: 12 }}>Everything working right now, across all active orders:</div>
          {alldayRows.length === 0 && <div style={{ color: "#6b7280" }}>Nothing in the queue.</div>}
          {alldayRows.map(([name, qty]) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: F(12) + "px " + F(16) + "px", background: "#161a22", borderRadius: 10, marginBottom: 8, border: "1px solid #262b36" }}>
              <span style={{ fontWeight: 700, fontSize: F(17) }}>{name}</span>
              <span style={{ fontWeight: 800, fontSize: F(23), color: "#fbbf24", fontVariantNumeric: "tabular-nums" }}>{qty}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "completed" && (
        <div style={{ padding: F(16) }}>
          <div style={{ fontSize: F(14), color: "#9ca3af", marginBottom: 12 }}>Recently bumped {DOT} tap Recall to bring one back.{bumpedToday.length ? "  Avg today " + avgLabel + (onTimePct !== null ? " " + DOT + " " + onTimePct + "% on-time" : "") : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(" + F(244) + "px, 1fr))", gap: F(12) }}>
            {completed.slice(0, 40).map((o) => (
              <div key={o.id} style={{ background: "#161a22", borderRadius: 10, border: "1px solid #262b36", overflow: "hidden", opacity: .9 }}>
                <div style={{ padding: F(8) + "px " + F(12) + "px", background: "#20242f", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: F(15) }}>{(o.tablet_no ? "T" + o.tablet_no + "-" : "#") + (o.order_no ?? "")}</span>
                  <span style={{ fontSize: F(12), color: "#9ca3af" }}>{o.kds_bumped_at ? new Date(o.kds_bumped_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                </div>
                <div style={{ padding: F(6) + "px " + F(12) + "px", fontSize: F(13), color: "#cbd5e1" }}>{(o.menu_order_items || []).map((it) => (it.qty > 1 ? it.qty + TIMES + " " : "") + it.name_snapshot).join(", ")}</div>
                <div onClick={() => recall(o)} className="kbtn" style={{ textAlign: "center", padding: F(8) + "px 0", background: "#1e40af", fontWeight: 700, fontSize: F(13), cursor: "pointer" }}>{ARROW + " Recall"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {undo && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#1f2937", border: "1px solid #374151", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 12px 40px rgba(0,0,0,.5)", zIndex: 50 }}>
          <span style={{ fontSize: 14 }}>Bumped {(undo.order.tablet_no ? "T" + undo.order.tablet_no + "-" : "#") + (undo.order.order_no ?? "")}</span>
          <div onClick={doUndo} className="kbtn" style={{ background: "#ec4899", padding: "7px 16px", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Undo</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ textAlign: "center", lineHeight: 1.1 }}>
      <div style={{ fontWeight: 800, fontSize: 17, color: accent || "#fff", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
    </div>
  );
}
