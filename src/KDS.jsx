import React, { useState, useEffect, useRef, useCallback } from "react";

// ============================================================================
// Create Brands / Chocoberry — Kitchen Display System
// Live board reading menu_orders. Station-routing ready, bump/recall, item-level
// completion, all-day counts, aging colours, timers, sound, keyboard/bump-bar.
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };

// Aging thresholds (minutes) — card turns yellow then red as it ages.
const WARN_MIN = 8;
const LATE_MIN = 15;
const POLL_MS = 4000;

// A store token/location can be passed via ?store= or ?loc= ; else all locations.
function getParam(k) {
  try { return new URLSearchParams(window.location.search).get(k); } catch { return null; }
}

function minsSince(iso, now) {
  return (now - new Date(iso).getTime()) / 60000;
}
function fmtClock(iso, now) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const m = Math.floor(s / 60), ss = s % 60;
  return m + ":" + String(ss).padStart(2, "0");
}

export default function KDS() {
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [loc, setLoc] = useState(getParam("loc"));
  const [tab, setTab] = useState("active"); // active | completed | allday
  const [station, setStation] = useState("all");
  const [soundOn, setSoundOn] = useState(true);
  const [connected, setConnected] = useState(true);
  const prevIds = useRef(new Set());
  const audioCtx = useRef(null);

  // Resolve a store token to a location id if ?store= given.
  useEffect(() => {
    const token = getParam("store");
    if (token && !loc) {
      fetch(SUPABASE_URL + "/rest/v1/rpc/resolve_store", { method: "POST", headers: H, body: JSON.stringify({ token }) })
        .then((r) => r.ok ? r.json() : []).then((rows) => { if (rows && rows.length) setLoc(rows[0].location_id); }).catch(() => {});
    }
  }, []);

  // Tick for live timers.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const beep = useCallback(() => {
    if (!soundOn) return;
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; o.type = "sine";
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start(); o.stop(ctx.currentTime + 0.4);
    } catch {}
  }, [soundOn]);

  const load = useCallback(async () => {
    try {
      let url = SUPABASE_URL + "/rest/v1/menu_orders?select=id,order_no,tablet_no,order_type,pickup_name,customer_note,kds_status,kds_started_at,kds_bumped_at,created_at,menu_tables(label),menu_order_items(id,name_snapshot,qty,modifiers_snapshot,item_done)"
        + "&closed_at=is.null"
        + "&order=created_at.asc&limit=200";
      if (loc) url += "&location_id=eq." + loc;
      const r = await fetch(url, { headers: H, cache: "no-store" });
      if (!r.ok) throw new Error("http " + r.status);
      const data = await r.json();
      setConnected(true);
      // New-order sound: any active order id we haven't seen before.
      const activeIds = new Set(data.filter((o) => o.kds_status !== "bumped").map((o) => o.id));
      let isNew = false;
      for (const id of activeIds) if (!prevIds.current.has(id)) { isNew = true; break; }
      if (isNew && prevIds.current.size > 0) beep();
      prevIds.current = activeIds;
      setOrders(data);
    } catch (e) {
      setConnected(false);
    }
  }, [loc, beep]);

  useEffect(() => { load(); const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load]);

  async function patchOrder(id, body) {
    // optimistic
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, ...body } : o));
    try {
      await fetch(SUPABASE_URL + "/rest/v1/menu_orders?id=eq." + id, {
        method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body),
      });
    } catch {}
    load();
  }
  async function patchItem(id, body) {
    setOrders((prev) => prev.map((o) => ({ ...o, menu_order_items: o.menu_order_items.map((it) => it.id === id ? { ...it, ...body } : it) })));
    try {
      await fetch(SUPABASE_URL + "/rest/v1/menu_order_items?id=eq." + id, {
        method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body),
      });
    } catch {}
  }

  const start = (o) => patchOrder(o.id, { kds_status: "preparing", kds_started_at: new Date().toISOString() });
  const bump = (o) => patchOrder(o.id, { kds_status: "bumped", kds_bumped_at: new Date().toISOString() });
  const recall = (o) => patchOrder(o.id, { kds_status: "preparing", kds_bumped_at: null });
  const toggleItem = (o, it) => patchItem(it.id, { item_done: !it.item_done });

  // Station routing: filter items by station when a station is selected.
  const stationOf = (it) => it.station || "kitchen";
  const filterStation = (o) => {
    if (station === "all") return o;
    const items = (o.menu_order_items || []).filter((it) => stationOf(it) === station);
    return items.length ? { ...o, menu_order_items: items } : null;
  };

  const active = orders.filter((o) => o.kds_status !== "bumped").map(filterStation).filter(Boolean);
  const completed = orders.filter((o) => o.kds_status === "bumped").map(filterStation).filter(Boolean)
    .sort((a, b) => new Date(b.kds_bumped_at || b.created_at) - new Date(a.kds_bumped_at || a.created_at));

  // All-day counts across active orders.
  const allday = {};
  for (const o of active) for (const it of (o.menu_order_items || [])) {
    if (it.item_done) continue;
    allday[it.name_snapshot] = (allday[it.name_snapshot] || 0) + (it.qty || 1);
  }
  const alldayRows = Object.entries(allday).sort((a, b) => b[1] - a[1]);

  // Keyboard / bump-bar: number keys 1-9 bump that positioned active card.
  useEffect(() => {
    const onKey = (e) => {
      if (tab !== "active") return;
      const n = parseInt(e.key);
      if (n >= 1 && n <= 9 && active[n - 1]) bump(active[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, tab]);

  const stations = Array.from(new Set(orders.flatMap((o) => (o.menu_order_items || []).map(stationOf))));

  return (
    <div style={{ fontFamily: "'Hanken Grotesk',system-ui,sans-serif", background: "#0f1115", color: "#fff", minHeight: "100vh", padding: "0" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#171a21", borderBottom: "1px solid #262b36", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-.02em" }}>Chocoberry KDS</span>
          <div style={{ display: "flex", gap: 6 }}>
            {["active", "allday", "completed"].map((t) => (
              <div key={t} onClick={() => setTab(t)} style={{ padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, background: tab === t ? "#3b82f6" : "#232833", textTransform: "capitalize" }}>
                {t === "allday" ? "All-day" : t}{t === "active" ? " (" + active.length + ")" : ""}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {stations.length > 1 && (
            <select value={station} onChange={(e) => setStation(e.target.value)} style={{ background: "#232833", color: "#fff", border: "1px solid #333", borderRadius: 8, padding: "6px 10px", fontSize: 14 }}>
              <option value="all">All stations</option>
              {stations.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <div onClick={() => setSoundOn((s) => !s)} style={{ cursor: "pointer", padding: "6px 10px", borderRadius: 8, background: "#232833", fontSize: 14 }}>{soundOn ? "🔔" : "🔕"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: connected ? "#4ade80" : "#f87171" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#4ade80" : "#f87171" }} />
            {connected ? "Live" : "Reconnecting"}
          </div>
        </div>
      </div>

      {/* ACTIVE board */}
      {tab === "active" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, padding: 16, alignItems: "start" }}>
          {active.length === 0 && <div style={{ color: "#6b7280", padding: 40, fontSize: 18 }}>No active orders.</div>}
          {active.map((o, i) => {
            const age = minsSince(o.created_at, now);
            const border = age >= LATE_MIN ? "#ef4444" : age >= WARN_MIN ? "#f59e0b" : "#22c55e";
            const headerBg = age >= LATE_MIN ? "#7f1d1d" : age >= WARN_MIN ? "#78350f" : "#14532d";
            const items = o.menu_order_items || [];
            const allDone = items.length > 0 && items.every((it) => it.item_done);
            const typeLabel = o.menu_tables?.label ? o.menu_tables.label : (o.order_type === "dine_in" ? "Dine In" : o.order_type === "collection" ? "Collection" : "Takeaway");
            return (
              <div key={o.id} style={{ background: "#1a1e26", borderRadius: 12, overflow: "hidden", border: "2px solid " + border, display: "flex", flexDirection: "column" }}>
                <div style={{ background: headerBg, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>{(o.tablet_no ? "T" + o.tablet_no + "-" : "#") + (o.order_no ?? "")}<span style={{ fontSize: 12, fontWeight: 600, opacity: .7, marginLeft: 8, background: "#00000033", padding: "1px 6px", borderRadius: 4 }}>{i + 1}</span></div>
                    <div style={{ fontSize: 12, opacity: .85 }}>{typeLabel}{o.pickup_name ? " · " + o.pickup_name : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{fmtClock(o.created_at, now)}</div>
                    {o.kds_status === "preparing" && <div style={{ fontSize: 10, opacity: .8 }}>preparing</div>}
                  </div>
                </div>
                <div style={{ padding: "8px 10px", flex: 1 }}>
                  {items.map((it) => {
                    const mods = it.modifiers_snapshot && typeof it.modifiers_snapshot === "object" ? Object.values(it.modifiers_snapshot) : [];
                    return (
                      <div key={it.id} onClick={() => toggleItem(o, it)} style={{ padding: "6px 4px", borderBottom: "1px solid #262b36", cursor: "pointer", opacity: it.item_done ? .4 : 1 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                          <span style={{ fontWeight: 800, fontSize: 15, color: "#fbbf24", minWidth: 22 }}>{it.qty || 1}×</span>
                          <span style={{ fontWeight: 700, fontSize: 15, textDecoration: it.item_done ? "line-through" : "none" }}>{it.name_snapshot}</span>
                        </div>
                        {mods.length > 0 && <div style={{ fontSize: 13, color: "#93c5fd", paddingLeft: 30, fontWeight: 600 }}>{mods.join(" · ")}</div>}
                      </div>
                    );
                  })}
                  {o.customer_note && <div style={{ marginTop: 6, fontSize: 13, color: "#fca5a5", background: "#450a0a", padding: "4px 8px", borderRadius: 6 }}>⚠ {o.customer_note}</div>}
                </div>
                <div style={{ display: "flex", gap: 1 }}>
                  {o.kds_status === "new" && <div onClick={() => start(o)} style={{ flex: 1, textAlign: "center", padding: "10px 0", background: "#334155", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Start</div>}
                  <div onClick={() => bump(o)} style={{ flex: 2, textAlign: "center", padding: "10px 0", background: allDone ? "#16a34a" : "#22c55e", fontWeight: 800, fontSize: 15, cursor: "pointer", color: "#04120a" }}>✓ Bump</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ALL-DAY view */}
      {tab === "allday" && (
        <div style={{ padding: 16, maxWidth: 560 }}>
          <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 12 }}>Everything working right now, across all active orders:</div>
          {alldayRows.length === 0 && <div style={{ color: "#6b7280" }}>Nothing in the queue.</div>}
          {alldayRows.map(([name, qty]) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#1a1e26", borderRadius: 10, marginBottom: 8, border: "1px solid #262b36" }}>
              <span style={{ fontWeight: 700, fontSize: 17 }}>{name}</span>
              <span style={{ fontWeight: 800, fontSize: 22, color: "#fbbf24", fontVariantNumeric: "tabular-nums" }}>{qty}</span>
            </div>
          ))}
        </div>
      )}

      {/* COMPLETED / recall */}
      {tab === "completed" && (
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 12 }}>Recently bumped — tap Recall to bring one back.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {completed.slice(0, 40).map((o) => (
              <div key={o.id} style={{ background: "#1a1e26", borderRadius: 10, border: "1px solid #262b36", overflow: "hidden", opacity: .85 }}>
                <div style={{ padding: "8px 12px", background: "#232833", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700 }}>{(o.tablet_no ? "T" + o.tablet_no + "-" : "#") + (o.order_no ?? "")}</span>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>{o.kds_bumped_at ? new Date(o.kds_bumped_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                </div>
                <div style={{ padding: "6px 12px", fontSize: 13, color: "#cbd5e1" }}>{(o.menu_order_items || []).map((it) => (it.qty > 1 ? it.qty + "× " : "") + it.name_snapshot).join(", ")}</div>
                <div onClick={() => recall(o)} style={{ textAlign: "center", padding: "8px 0", background: "#1e40af", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>↩ Recall</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
