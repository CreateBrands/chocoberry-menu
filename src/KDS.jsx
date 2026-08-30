import React, { useState, useEffect, useRef, useCallback } from "react";
import POS from "./POS.jsx";

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
// Each physical KDS screen is identified by ?screen=1, ?screen=2, etc. Bump
// state is tracked PER SCREEN (in localStorage) so two screens showing the same
// orders can each bump their own copy independently — bumping on screen 1 does
// NOT clear the order from screen 2. Defaults to "main" when no param is given
// (single-screen setups behave exactly as before).
function getScreenId() { return getParam("screen") || "main"; }
// SCREEN IDENTITY. Each physical KDS is tagged with a station (which printer it
// owns) and an optional human label, set once via URL and then remembered:
//   ?station=kitchen&name=Hot%20Kitchen     ?station=counter&name=Bar
// The station is sent with every manual print so the slip comes out at THIS
// screen's printer instead of every printer in the store.
function getRemembered(key, param) {
  const v = getParam(param);
  if (v) { try { localStorage.setItem(key, v); } catch {} return v; }
  try { return localStorage.getItem(key); } catch { return null; }
}
function minsSince(iso, now) { return (now - new Date(iso).getTime()) / 60000; }
function fmtClock(iso, now) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const m = Math.floor(s / 60), ss = s % 60;
  return m + ":" + String(ss).padStart(2, "0");
}

export default function KDS() {
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(Date.now());
  // Remember the linked location: URL (?loc= or resolved from ?store=) sets it,
  // then the screen remembers it — so you scan the KDS QR once and it stays linked.
  const [loc, setLoc] = useState(getParam("loc") || (() => { try { return localStorage.getItem("kds_loc"); } catch { return null; } })());
  const [tab, setTab] = useState("active");
  const [station, setStation] = useState("all");
  // This screen's own identity (not the item-filter dropdown above).
  const [myStation] = useState(() => getRemembered("kds_station", "station"));
  const [myName] = useState(() => getRemembered("kds_name", "name"));
  const [soundOn, setSoundOn] = useState(true);
  const [connected, setConnected] = useState(true);
  const [size, setSize] = useState(() => localStorage.getItem("kds_size") || "M");
  const [fullscreen, setFullscreen] = useState(false);
  const [undo, setUndo] = useState(null);
  const [armedBump, setArmedBump] = useState(null); // {id, timer} — first tap arms, second confirms
  const [rushIds, setRushIds] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("kds_rush") || "[]")); } catch { return new Set(); } });
  // Orders/payment view state
  const [view, setView] = useState("kitchen");      // "kitchen" | "orders"
  const [orderFilter, setOrderFilter] = useState("unpaid"); // unpaid | paid | all
  const [payFor, setPayFor] = useState(null);       // order awaiting payment action
  const [payPin, setPayPin] = useState("");         // PIN entered to confirm payment
  const [payMethod, setPayMethod] = useState(null); // cash | card chosen, awaiting PIN
  const [payDiscType, setPayDiscType] = useState(null); // null | percent | amount
  const [payDiscVal, setPayDiscVal] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState("");
  const prevIds = useRef(new Set());
  const audioCtx = useRef(null);
  const scale = SIZES[size] || 1;

  useEffect(() => { localStorage.setItem("kds_size", size); }, [size]);
  useEffect(() => { try { localStorage.setItem("kds_rush", JSON.stringify([...rushIds])); } catch {} }, [rushIds]);
  // Remember the linked location so a reload keeps this screen pointed at its store.
  useEffect(() => { if (loc) { try { localStorage.setItem("kds_loc", loc); } catch {} } }, [loc]);
  // Tables for the POS table selector (dining tables at this location).
  const [posTables, setPosTables] = useState([]);
  useEffect(() => {
    if (!loc) return;
    fetch(SUPABASE_URL + "/rest/v1/menu_tables?location_id=eq." + loc + "&is_table=eq.true&active=eq.true&select=id,label&order=label.asc", { headers: H })
      .then((r) => r.ok ? r.json() : []).then((rows) => setPosTables(rows || [])).catch(() => {});
  }, [loc]);

  useEffect(() => {
    const token = getParam("store");
    if (token) {
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
      let url = SUPABASE_URL + "/rest/v1/menu_orders?select=id,order_no,tablet_no,order_type,pickup_name,customer_note,status,print_failed,total,paid_method,paid_amount,kds_started_at,kds_bumped_at,created_at,menu_tables(label),menu_order_items(id,name_snapshot,qty,modifiers_snapshot,item_status,menu_items(category_id,menu_categories(menu_menus(name))))"
        + "&status=in.(placed,preparing,ready,served)"
        + "&closed_at=is.null&order=created_at.asc&limit=200";
      if (loc) url += "&location_id=eq." + loc;
      const r = await fetch(url, { headers: H, cache: "no-store" });
      if (!r.ok) throw new Error("http " + r.status);
      const data = await r.json();
      setConnected(true);
      // Beep only for genuinely new orders (not yet served).
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

  // Take payment on an order — PIN is verified at this moment (viewing is open,
  // paying needs the staff PIN). Reuses the same admin-api mark_paid the till uses.
  async function takePayment() {
    if (!payFor || !payMethod || !payPin) { setPayErr("Enter the staff PIN."); return; }
    setPayBusy(true); setPayErr("");
    try {
      const data = { order_id: payFor.id, method: payMethod };
      if (payDiscType && payDiscVal) { data.discount_type = payDiscType; data.discount_value = Number(payDiscVal); }
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pin: payPin, action: "mark_paid", data }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error === "unauthorized" ? "Wrong PIN." : "Payment failed."); }
      // Close the pay panel and refresh.
      setPayFor(null); setPayMethod(null); setPayPin(""); setPayDiscType(null); setPayDiscVal("");
      load();
    } catch (e) { setPayErr(e.message || "Payment failed."); } finally { setPayBusy(false); }
  }
  // Void an order (unpaid only) with a reason — PIN-gated, like taking payment.
  const [voidFor, setVoidFor] = useState(null);      // order being voided
  const [voidReason, setVoidReason] = useState("");  // chosen/typed reason
  const [voidPin, setVoidPin] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidErr, setVoidErr] = useState("");
  const VOID_REASONS = ["Wrong order", "Customer left", "Duplicate", "Kitchen error", "Out of stock", "Test order"];
  function closeVoid() { setVoidFor(null); setVoidReason(""); setVoidPin(""); setVoidErr(""); }
  async function voidOrder() {
    if (!voidFor || !voidReason.trim() || !voidPin) { setVoidErr("Pick a reason and enter the PIN."); return; }
    setVoidBusy(true); setVoidErr("");
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pin: voidPin, action: "void_order", data: { order_id: voidFor.id, reason: voidReason.trim() } }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error === "unauthorized" ? "Wrong PIN." : e.message || "Void failed."); }
      closeVoid();
      load();
    } catch (e) { setVoidErr(e.message || "Void failed."); } finally { setVoidBusy(false); }
  }

  function closePay() { setPayFor(null); setPayMethod(null); setPayPin(""); setPayDiscType(null); setPayDiscVal(""); setPayErr(""); }

  // Print (reprint) a slip for an order from the KDS Orders view — same action the
  // staff drawer uses. force:true so it always prints even if already printed.
  const [printingId, setPrintingId] = useState(null);
  const [printMsg, setPrintMsg] = useState(null);
  // Guard against reprint storms. Without this, repeated taps each fire a push;
  // with copies:2 on the kitchen printer that is 2 slips per tap. (25 Aug: one
  // order accumulated ~30 slips this way while the board was blank.)
  const lastPrintRef = useRef({});
  const PRINT_COOLDOWN_MS = 10000;
  async function printSlip(o, e) {
    if (e) e.stopPropagation();
    if (!o.id) return;
    if (printingId) return;                       // a print is already in flight
    const last = lastPrintRef.current[o.id] || 0;
    if (Date.now() - last < PRINT_COOLDOWN_MS) {  // slips take a moment to emerge
      setPrintMsg({ id: o.id, text: "Just printed \u2014 wait" });
      setTimeout(() => setPrintMsg(null), 2000);
      return;
    }
    lastPrintRef.current[o.id] = Date.now();
    setPrintingId(o.id); setPrintMsg(null);
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/sunmi-print", {
        method: "POST", headers: H,
        body: JSON.stringify({
          action: "print-order", order_id: o.id, force: true,
          // Target THIS screen's printer. Omitted when the screen has no
          // station set, which preserves the old all-printers behaviour.
          ...(myStation ? { station: myStation } : {}),
        }),
      });
      if (!r.ok) throw new Error("http " + r.status);
      setPrintMsg({ id: o.id, text: "Slip sent to printer" });
    } catch { setPrintMsg({ id: o.id, text: "Print failed — try again" }); }
    finally { setPrintingId(null); setTimeout(() => setPrintMsg(null), 3000); }
  }

  const start = (o) => patchOrder(o.id, { status: "preparing", kds_started_at: new Date().toISOString() });
  const bump = (o) => {
    const prevStatus = o.status;
    patchOrder(o.id, { status: BUMP_TO, kds_bumped_at: new Date().toISOString() });
    if (undo && undo.timer) clearTimeout(undo.timer);
    const timer = setTimeout(() => setUndo(null), 6000);
    setUndo({ order: o, prevStatus, timer });
  };
  // First tap arms the button ("Tap again"); a second tap within 2.5s actually
  // bumps. Prevents accidental single touches (brushes, cleaning) on the large
  // touch targets from completing an order without a deliberate action.
  const requestBump = (o) => {
    if (armedBump && armedBump.id === o.id) {
      if (armedBump.timer) clearTimeout(armedBump.timer);
      setArmedBump(null);
      bump(o);
      return;
    }
    if (armedBump && armedBump.timer) clearTimeout(armedBump.timer);
    const timer = setTimeout(() => setArmedBump(null), 2500);
    setArmedBump({ id: o.id, timer });
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
  // Master category name from the nested join (item -> category -> menu.name).
  const catOf = (it) => {
    try { return (it.menu_items?.menu_categories?.menu_menus?.name || "").toUpperCase() || "OTHER"; }
    catch { return "OTHER"; }
  };
  // Group a list of items by master category, preserving first-seen order.
  const groupByCat = (list) => {
    const order = [];
    const groups = {};
    for (const it of list) {
      const c = catOf(it);
      if (!groups[c]) { groups[c] = []; order.push(c); }
      groups[c].push(it);
    }
    return order.map((c) => [c, groups[c]]);
  };
  const filterStation = (o) => {
    if (station === "all") return o;
    const items = (o.menu_order_items || []).filter((it) => stationOf(it) === station);
    return items.length ? { ...o, menu_order_items: items } : null;
  };

  // Active/completed are decided PER SCREEN by this screen's local bump set —
  // not the shared DB status — so each screen is independent. An order is
  // "active" here until THIS screen bumps it; "completed" once it has.
  let active = orders.filter((o) => o.status !== BUMP_TO).map(filterStation).filter(Boolean);
  active.sort((a, b) => (rushIds.has(b.id) ? 1 : 0) - (rushIds.has(a.id) ? 1 : 0));
  // Orders that failed to print — shown as an un-ignorable banner across the KDS.
  const failedOrders = orders.filter((o) => o.status !== BUMP_TO && o.status !== "cancelled" && o.print_failed);
  const completed = orders.filter((o) => o.status === BUMP_TO).map(filterStation).filter(Boolean)
    .sort((a, b) => new Date(b.kds_bumped_at || b.created_at) - new Date(a.kds_bumped_at || a.created_at));

  // Orders/payment view: all non-closed orders, split by paid state. Unpaid float
  // to the top (most-waited first) so staff see what needs collecting.
  const isPaid = (o) => !!o.paid_method;
  const payOrders = orders.slice();
  const unpaidOrders = payOrders.filter((o) => !isPaid(o)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const paidOrders = payOrders.filter((o) => isPaid(o)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const shownOrders = orderFilter === "unpaid" ? unpaidOrders : orderFilter === "paid" ? paidOrders : [...unpaidOrders, ...paidOrders];
  const totalUnpaid = unpaidOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalTaken = paidOrders.reduce((s, o) => s + Number(o.paid_amount != null ? o.paid_amount : o.total || 0), 0);

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
  const BOLT = "\u26A1", PRINTER = "\uD83D\uDDA8", CHECK = "\u2713", ARROW = "\u21A9", WARN = "\u26A0", DOT = "\u00B7", TIMES = "\u00D7", BELL = "\uD83D\uDD14", BELLOFF = "\uD83D\uDD15", EXPAND = "\u26F6", X = "\u2715";

  return (
    <div style={{ fontFamily: "'Hanken Grotesk',system-ui,-apple-system,sans-serif", background: "radial-gradient(1200px 600px at 50% -10%, #12151d, #0b0d11)", color: "#f8fafc", minHeight: "100vh", cursor: fullscreen ? "none" : "auto" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800;900&display=swap');@keyframes kpop{0%{transform:scale(.96) translateY(6px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}@keyframes kpulse{0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,.5)}50%{box-shadow:0 0 0 5px rgba(244,63,94,0)}}@keyframes klate{0%,100%{opacity:1}50%{opacity:.72}}@keyframes ktoast{0%{transform:translate(-50%,20px);opacity:0}100%{transform:translate(-50%,0);opacity:1}}@keyframes kfailflash{0%,100%{background:#dc2626}50%{background:#8f1414}}.kcard{animation:kpop .22s cubic-bezier(.2,.8,.2,1)}.krush{animation:kpulse 1.5s infinite}.klate .ktime{animation:klate 1.6s infinite}.kbtn{transition:filter .12s,transform .08s}.kbtn:hover{filter:brightness(1.12)}.kbtn:active{transform:translateY(1px) scale(.99)}.kitem{transition:opacity .15s,background .12s;border-radius:6px}.kitem:hover{background:#ffffff08}::-webkit-scrollbar{width:9px}::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px}::-webkit-scrollbar-thumb:hover{background:#353c49}"}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 20px", background: "linear-gradient(180deg,#161a23,#0f131a)", borderBottom: "1px solid #20252f", position: "sticky", top: 0, zIndex: 20, boxShadow: "0 4px 16px -8px rgba(0,0,0,.6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontWeight: 800, fontSize: 21, letterSpacing: "-.02em" }}>Chocoberry <span style={{ color: "#f472b6" }}>KDS</span></span>
          <div style={{ display: "flex", background: "#0c0f16", borderRadius: 10, padding: 3, gap: 2 }}>
            {[["kitchen", "Kitchen"], ["orders", "Orders"], ["pos", "POS"]].map(([v, label]) => (
              <div key={v} onClick={() => setView(v)} className="kbtn" style={{ padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 800, background: view === v ? "#ec4899" : "transparent", color: view === v ? "#fff" : "#9aa3b2" }}>
                {label}{v === "orders" && unpaidOrders.length ? " " + unpaidOrders.length : ""}
              </div>
            ))}
          </div>
          {view === "kitchen" && (
          <div style={{ display: "flex", gap: 6 }}>
            {[["active", "Active"], ["allday", "All-day"], ["completed", "Done"]].map(([t, label]) => (
              <div key={t} onClick={() => setTab(t)} className="kbtn" style={{ padding: "7px 15px", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 700, background: tab === t ? "#ec4899" : "#20242f", transition: "background .12s" }}>
                {label}{t === "active" ? " " + active.length : ""}
              </div>
            ))}
          </div>
          )}
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
          {/* ALWAYS shown. Previously this rendered only when ?screen= was
              present, so an unlabelled screen displayed no identity at all —
              exactly the screens most likely to be misconfigured. */}
          <div style={{ fontSize: 12, fontWeight: 800, color: myStation ? "#052e16" : "#cbd5e1", background: myStation ? "#4ade80" : "#20242f", padding: "5px 10px", borderRadius: 8, marginLeft: 2, letterSpacing: ".02em" }} title={"Screen " + getScreenId() + (myStation ? " \u00B7 prints to " + myStation : " \u00B7 NO STATION SET \u2014 prints to every printer")}>
            {(myName || ("Screen " + getScreenId())) + (myStation ? " \u00B7 " + myStation : " \u00B7 no station")}
          </div>
        </div>
      </div>

      {failedOrders.length > 0 && (
        <div style={{ animation: "kfailflash 1.1s ease-in-out infinite", color: "#fff", padding: "12px 20px", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 19, boxShadow: "0 4px 14px rgba(220,38,38,.4)" }}>
          <span style={{ fontSize: F(20) }}>{WARN}</span>
          <span style={{ fontWeight: 900, fontSize: F(16), letterSpacing: ".02em" }}>
            {failedOrders.length === 1
              ? "ORDER #" + failedOrders[0].order_no + " DID NOT PRINT"
              : failedOrders.length + " ORDERS DID NOT PRINT"}
            <span style={{ fontWeight: 600, opacity: .9 }}> — check the printer (paper / power / jam)</span>
          </span>
          <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: F(13), opacity: .9 }}>
            #{failedOrders.slice(0, 6).map((o) => o.order_no).join("  #")}
          </span>
        </div>
      )}

      {view === "kitchen" && tab === "active" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(" + F(268) + "px, 1fr))", gap: F(12), padding: F(16), alignItems: "start" }}>
          {active.length === 0 && <div style={{ color: "#6b7280", padding: 48, fontSize: 18 }}>No active orders.</div>}
          {active.map((o, i) => {
            const age = minsSince(o.created_at, now);
            const isRush = rushIds.has(o.id);
            const isLate = age >= LATE_MIN;
            const pal = isRush
              ? { accent: "#fb7185", tint: "#1c1215", head: "#7f1d2e" }
              : isLate
              ? { accent: "#f87171", tint: "#1a1315", head: "#7f1d1d" }
              : age >= WARN_MIN
              ? { accent: "#fbbf24", tint: "#1a1712", head: "#733f12" }
              : { accent: "#34d399", tint: "#121a16", head: "#14532d" };
            const items = o.menu_order_items || [];
            const doneCount = items.filter((it) => it.item_status === DONE_ITEM).length;
            const allDone = items.length > 0 && doneCount === items.length;
            const typeLabel = o.menu_tables?.label ? o.menu_tables.label : (o.order_type === "dine_in" ? "Dine In" : o.order_type === "collection" ? "Collection" : "Takeaway");
            // A kitchen ticket's job is to answer "where does this food go?".
            // Dine-in is routed by TABLE; takeaway is routed by the fact it
            // leaves the building. The order number is a reference, not a
            // destination, so it drops to the second line.
            const isDineIn = !!o.menu_tables?.label || o.order_type === "dine_in";
            const headline = o.menu_tables?.label
              ? o.menu_tables.label
              : (o.order_type === "collection" ? "COLLECTION" : o.order_type === "dine_in" ? "DINE IN" : "TAKEAWAY");
            const refCode = (o.tablet_no ? "T" + o.tablet_no + "-" : "#") + (o.order_no ?? "");
            const note = (o.customer_note || "").trim();
            return (
              <div key={o.id} className={"kcard" + (isRush ? " krush" : "") + (isLate ? " klate" : "")} style={{ background: pal.tint, borderRadius: F(14), overflow: "hidden", boxShadow: "0 1px 0 #ffffff08 inset, 0 6px 20px -8px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", borderLeft: "4px solid " + pal.accent }}>
                <div style={{ background: pal.head, padding: F(9) + "px " + F(12) + "px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: F(19), letterSpacing: "-.01em", display: "flex", alignItems: "center", gap: 6 }}>
                      {isRush && <span style={{ fontSize: F(15) }}>{BOLT}</span>}
                      {!isDineIn && (
                        <span style={{ fontSize: F(11), fontWeight: 800, letterSpacing: ".06em", background: "#00000040", padding: "2px 8px", borderRadius: 6 }}>
                          {headline}
                        </span>
                      )}
                      {isDineIn && headline}
                      {/* On a takeaway the NAME is what gets called out, so it
                          belongs on the headline beside the type. */}
                      {!isDineIn && o.pickup_name && <span>{o.pickup_name}</span>}
                      <span style={{ fontSize: F(11), fontWeight: 700, opacity: .55, background: "#00000033", padding: "1px 7px", borderRadius: 20 }}>{i + 1}</span>
                    </div>
                    <div style={{ fontSize: F(12), opacity: .82, fontWeight: 500, marginTop: 1 }}>
                      {refCode}{isDineIn && o.pickup_name ? " " + DOT + " " + o.pickup_name : ""}
                    </div>
                    {o.print_failed && <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5, background: "#dc2626", color: "#fff", fontSize: F(11), fontWeight: 800, padding: "2px 8px", borderRadius: 6, letterSpacing: ".02em" }}>⚠ NOT PRINTED</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="ktime" style={{ fontWeight: 900, fontSize: F(20), fontVariantNumeric: "tabular-nums", color: pal.accent, letterSpacing: "-.02em" }}>{fmtClock(o.created_at, now)}</div>
                    <div style={{ fontSize: F(10), opacity: .7, fontWeight: 600, marginTop: 1 }}>{items.length ? doneCount + "/" + items.length : ""}{o.status === "preparing" ? " " + DOT + " prep" : ""}</div>
                  </div>
                </div>
                <div style={{ padding: F(8) + "px " + F(9) + "px", flex: 1 }}>
                  {groupByCat(items).map(([cat, catItems]) => (
                    <div key={cat} style={{ marginBottom: F(4) }}>
                      <div style={{ fontSize: F(11), fontWeight: 800, letterSpacing: .8, color: "#94a3b8", borderBottom: "1px solid #ffffff1f", paddingBottom: F(2), marginBottom: F(3), marginTop: F(2) }}>{cat}</div>
                      {catItems.map((it) => {
                        const done = it.item_status === DONE_ITEM;
                        const mods = it.modifiers_snapshot && typeof it.modifiers_snapshot === "object" ? Object.values(it.modifiers_snapshot) : [];
                        return (
                          <div key={it.id} className="kitem" onClick={() => toggleItem(o, it)} style={{ padding: F(6) + "px " + F(6) + "px", cursor: "pointer", opacity: done ? .34 : 1 }}>
                            <div style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
                              <span style={{ fontWeight: 900, fontSize: F(15), color: pal.accent, minWidth: F(26), fontVariantNumeric: "tabular-nums" }}>{(it.qty || 1) + TIMES}</span>
                              <span style={{ fontWeight: 700, fontSize: F(15.5), lineHeight: 1.25, textDecoration: done ? "line-through" : "none" }}>{it.name_snapshot}</span>
                            </div>
                            {mods.length > 0 && <div style={{ fontSize: F(13), color: "#7dd3fc", paddingLeft: F(35), fontWeight: 600, marginTop: 1 }}>{mods.join(" " + DOT + " ")}</div>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {note && <div style={{ marginTop: F(7), fontSize: F(13), color: "#fecaca", background: "#7f1d1d33", border: "1px solid #7f1d1d", padding: F(5) + "px " + F(9) + "px", borderRadius: 8, fontWeight: 600 }}>{WARN + "  " + note}</div>}
                </div>
                <div style={{ display: "flex", gap: 2, padding: 2 }}>
                  <div onClick={() => toggleRush(o)} className="kbtn" style={{ width: F(46), textAlign: "center", padding: F(11) + "px 0", background: isRush ? "#fb7185" : "#ffffff0d", borderRadius: 9, fontWeight: 800, fontSize: F(15), cursor: "pointer", color: isRush ? "#1a0a0d" : "#fff" }} title="Rush">{BOLT}</div>
                  {/* Print slip. Deliberately on the LEFT, far from Bump: Bump is
                      destructive and a mis-tap on a wall screen loses the ticket. */}
                  <div onClick={(e) => printSlip(o, e)} className="kbtn" style={{ width: F(46), textAlign: "center", padding: F(11) + "px 0", background: "#ffffff0d", borderRadius: 9, fontWeight: 800, fontSize: F(15), cursor: "pointer", color: "#fff", opacity: printingId === o.id ? .5 : 1 }} title="Print slip">
                    {printingId === o.id ? "\u2026" : PRINTER}
                  </div>
                  {o.status === "placed" && <div onClick={() => start(o)} className="kbtn" style={{ flex: 1, textAlign: "center", padding: F(11) + "px 0", background: "#ffffff14", borderRadius: 9, fontWeight: 700, fontSize: F(14), cursor: "pointer" }}>Start</div>}
                  <div onClick={() => requestBump(o)} className="kbtn" style={{ flex: 2, textAlign: "center", padding: F(11) + "px 0", background: (armedBump && armedBump.id === o.id) ? "#f59e0b" : (allDone ? "#34d399" : "#22c55e"), borderRadius: 9, fontWeight: 800, fontSize: F(15), cursor: "pointer", color: (armedBump && armedBump.id === o.id) ? "#3a2400" : "#052e16", boxShadow: "0 2px 8px -2px " + (allDone ? "#34d39966" : "#22c55e55") }}>{(armedBump && armedBump.id === o.id) ? "Tap again ✓" : (CHECK + " Bump")}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "kitchen" && tab === "allday" && (
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

      {view === "kitchen" && tab === "completed" && (
        <div style={{ padding: F(16) }}>
          <div style={{ fontSize: F(14), color: "#9ca3af", marginBottom: 12 }}>Recently bumped {DOT} tap Recall to bring one back.{bumpedToday.length ? "  Avg today " + avgLabel + (onTimePct !== null ? " " + DOT + " " + onTimePct + "% on-time" : "") : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(" + F(244) + "px, 1fr))", gap: F(12) }}>
            {completed.slice(0, 40).map((o) => (
              <div key={o.id} style={{ background: "#161a22", borderRadius: 10, border: "1px solid #262b36", overflow: "hidden", opacity: .9 }}>
                <div style={{ padding: F(8) + "px " + F(12) + "px", background: "#20242f", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: F(15) }}>{(o.tablet_no ? "T" + o.tablet_no + "-" : "#") + (o.order_no ?? "")}</span>
                  <span style={{ fontSize: F(12), color: "#9ca3af" }}>{o.kds_bumped_at ? new Date(o.kds_bumped_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                </div>
                <div style={{ padding: F(8) + "px " + F(12) + "px", fontSize: F(13), color: "#cbd5e1", display: "flex", flexDirection: "column", gap: F(3) }}>
                  {(o.menu_order_items || []).map((it) => (
                    <div key={it.id} style={{ display: "flex", gap: F(6), lineHeight: 1.3 }}>
                      <span style={{ fontWeight: 700, color: "#f472b6", flexShrink: 0, minWidth: F(20) }}>{it.qty}{TIMES}</span>
                      <span>{it.name_snapshot}</span>
                    </div>
                  ))}
                </div>
                <div onClick={() => recall(o)} className="kbtn" style={{ textAlign: "center", padding: F(8) + "px 0", background: "#1e40af", fontWeight: 700, fontSize: F(13), cursor: "pointer" }}>{ARROW + " Recall"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "pos" && (
        <POS loc={loc} storeToken={getParam("store") || null} tablesList={posTables} />
      )}

      {view === "orders" && (
        <div style={{ padding: F(16) }}>
          {/* Summary strip */}
          <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160, background: "linear-gradient(180deg,#1c1712,#161009)", border: "1px solid #3a2e17", borderRadius: 12, padding: "12px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", letterSpacing: ".04em" }}>UNPAID</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>GBP {totalUnpaid.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: "#9aa3b2", marginTop: 2 }}>{unpaidOrders.length} order{unpaidOrders.length === 1 ? "" : "s"}</div>
            </div>
            <div style={{ flex: 1, minWidth: 160, background: "linear-gradient(180deg,#121a16,#0d130f)", border: "1px solid #1c3a2a", borderRadius: 12, padding: "12px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", letterSpacing: ".04em" }}>TAKEN TODAY</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>GBP {totalTaken.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: "#9aa3b2", marginTop: 2 }}>{paidOrders.length} paid</div>
            </div>
          </div>
          {/* Filter chips */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["unpaid", "Unpaid", unpaidOrders.length], ["paid", "Paid", paidOrders.length], ["all", "All", unpaidOrders.length + paidOrders.length]].map(([f, label, n]) => (
              <div key={f} onClick={() => setOrderFilter(f)} className="kbtn" style={{ padding: "8px 16px", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 700, background: orderFilter === f ? "#ec4899" : "#20242f", color: orderFilter === f ? "#fff" : "#cbd5e1" }}>{label} {n}</div>
            ))}
          </div>
          {/* Order rows */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
            {shownOrders.length === 0 && <div style={{ color: "#6b7280", padding: 40, fontSize: 17 }}>No {orderFilter === "all" ? "" : orderFilter} orders.</div>}
            {shownOrders.map((o) => {
              const paid = isPaid(o);
              const items = o.menu_order_items || [];
              const preview = items.map((it) => it.qty + "x " + it.name_snapshot).join(", ");
              const tbl = o.menu_tables?.label || (o.order_type === "dine_in" ? "Dine In" : "Takeaway");
              const waited = Math.floor(minsSince(o.created_at, now));
              return (
                <div key={o.id} onClick={() => { if (!paid) { setPayFor(o); setPayMethod(null); setPayPin(""); setPayErr(""); } }}
                  style={{ background: paid ? "linear-gradient(180deg,#121a16,#0e130f)" : "linear-gradient(180deg,#1c1712,#15100a)", border: "1px solid " + (paid ? "#1c3a2a" : "#3a2e17"), borderLeft: "4px solid " + (paid ? "#4ade80" : "#fbbf24"), borderRadius: 12, padding: "12px 14px", cursor: paid ? "default" : "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 17 }}>{(o.tablet_no ? "T" + o.tablet_no + "-" : "#") + (o.order_no ?? "")}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: paid ? "#14532d" : "#7c5310", color: paid ? "#86efac" : "#fcd34d" }}>{paid ? (o.paid_method === "card" ? "PAID · CARD" : "PAID · CASH") : "UNPAID"}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 600 }}>{tbl}{!paid && <span style={{ color: "#9aa3b2", fontWeight: 500 }}> · waiting {waited}m</span>}</div>
                  <div style={{ fontSize: 12, color: "#9aa3b2", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 800 }}>GBP {Number(paid && o.paid_amount != null ? o.paid_amount : o.total || 0).toFixed(2)}</span>
                    {!paid && <span style={{ fontSize: 13, fontWeight: 700, color: "#f472b6" }}>Take payment ›</span>}
                  </div>
                  <div onClick={(e) => printSlip(o, e)} className="kbtn" style={{ marginTop: 8, textAlign: "center", padding: "8px 0", borderRadius: 8, background: "#20242f", border: "1px solid #2f3542", fontSize: 13, fontWeight: 700, color: "#cbd5e1", cursor: "pointer", opacity: printingId === o.id ? .6 : 1 }}>
                    {printingId === o.id ? "Printing…" : (printMsg && printMsg.id === o.id ? printMsg.text : "🖨 Print slip")}
                  </div>
                  {!paid && (
                    <div onClick={(e) => { e.stopPropagation(); setVoidFor(o); setVoidReason(""); setVoidPin(""); setVoidErr(""); }} className="kbtn" style={{ marginTop: 6, textAlign: "center", padding: "8px 0", borderRadius: 8, background: "transparent", border: "1px solid #7f1d1d", fontSize: 13, fontWeight: 700, color: "#f87171", cursor: "pointer" }}>
                      ✕ Void order
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Void panel */}
      {voidFor && (
        <div onClick={closeVoid} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "linear-gradient(180deg,#1a212c,#12161d)", border: "1px solid #3a2020", borderRadius: 18, padding: 22, width: 400, maxWidth: "100%", boxShadow: "0 30px 80px -20px rgba(0,0,0,.8)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 19, color: "#f87171" }}>Void {(voidFor.tablet_no ? "T" + voidFor.tablet_no + "-" : "#") + (voidFor.order_no ?? "")}</span>
              <span onClick={closeVoid} className="kbtn" style={{ cursor: "pointer", color: "#9aa3b2", fontSize: 20 }}>{X}</span>
            </div>
            <div style={{ fontSize: 13, color: "#9aa3b2", marginBottom: 14 }}>This cancels the order and removes it from the board. Pick a reason:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {VOID_REASONS.map((rsn) => (
                <div key={rsn} onClick={() => setVoidReason(rsn)} className="kbtn" style={{ padding: "8px 12px", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700, background: voidReason === rsn ? "#b4462f" : "#20242f", color: voidReason === rsn ? "#fff" : "#cbd5e1", border: "1px solid " + (voidReason === rsn ? "#b4462f" : "#2a3340") }}>{rsn}</div>
              ))}
            </div>
            <input type="text" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Or type a reason…"
              style={{ width: "100%", boxSizing: "border-box", fontSize: 15, padding: "10px 12px", borderRadius: 10, border: "1px solid #374151", background: "#0f131a", color: "#fff", marginBottom: 12 }} />
            <input type="text" inputMode="numeric" value={voidPin} onChange={(e) => setVoidPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && voidOrder()} placeholder="Staff PIN to confirm"
              autoComplete="off" name="kds-void-nosave" data-1p-ignore data-lpignore="true" readOnly onFocus={(e) => e.target.removeAttribute("readonly")}
              style={{ width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 20, letterSpacing: 6, padding: "12px 0", borderRadius: 12, border: "1px solid #374151", background: "#0f131a", color: "#fff", marginBottom: 8, WebkitTextSecurity: "disc", textSecurity: "disc" }} />
            {voidErr && <div style={{ color: "#f87171", fontSize: 13, textAlign: "center", marginBottom: 8 }}>{voidErr}</div>}
            <div onClick={voidOrder} className="kbtn" style={{ textAlign: "center", padding: "13px 0", borderRadius: 30, background: (voidReason.trim() && voidPin) ? "#b4462f" : "#334155", color: "#fff", fontWeight: 800, fontSize: 16, cursor: (voidReason.trim() && voidPin) ? "pointer" : "default", opacity: voidBusy ? .6 : 1 }}>{voidBusy ? "Voiding…" : "Confirm void"}</div>
          </div>
        </div>
      )}

      {/* Payment panel */}
      {payFor && (
        <div onClick={closePay} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "linear-gradient(180deg,#1a212c,#12161d)", border: "1px solid #2a3340", borderRadius: 18, padding: 22, width: 380, maxWidth: "100%", boxShadow: "0 30px 80px -20px rgba(0,0,0,.8)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 19 }}>{(payFor.tablet_no ? "T" + payFor.tablet_no + "-" : "#") + (payFor.order_no ?? "")}</span>
              <span onClick={closePay} className="kbtn" style={{ cursor: "pointer", color: "#9aa3b2", fontSize: 20 }}>{X}</span>
            </div>
            <div style={{ fontSize: 13, color: "#9aa3b2", marginBottom: 12 }}>{payFor.menu_tables?.label || "Takeaway"}</div>
            {(() => { const base = Number(payFor.total || 0); let due = base; if (payDiscType === "percent" && payDiscVal) due = base * (1 - Number(payDiscVal) / 100); else if (payDiscType === "amount" && payDiscVal) due = base - Number(payDiscVal); due = Math.max(0, due);
              return (
                <div style={{ textAlign: "center", padding: "10px 0 16px" }}>
                  <div style={{ fontSize: 13, color: "#9aa3b2" }}>Amount due</div>
                  <div style={{ fontSize: 34, fontWeight: 800 }}>GBP {due.toFixed(2)}</div>
                  {payDiscType && payDiscVal ? <div style={{ fontSize: 12, color: "#fbbf24" }}>was GBP {base.toFixed(2)}</div> : null}
                </div>
              ); })()}
            {/* Discount (optional) */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div onClick={() => { setPayDiscType(payDiscType === "percent" ? null : "percent"); setPayDiscVal(""); }} className="kbtn" style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700, background: payDiscType === "percent" ? "#3730a3" : "#20242f" }}>% off</div>
              <div onClick={() => { setPayDiscType(payDiscType === "amount" ? null : "amount"); setPayDiscVal(""); }} className="kbtn" style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700, background: payDiscType === "amount" ? "#3730a3" : "#20242f" }}>GBP off</div>
              {payDiscType && <input type="number" value={payDiscVal} onChange={(e) => setPayDiscVal(e.target.value)} placeholder={payDiscType === "percent" ? "%" : "GBP"} style={{ width: 70, textAlign: "center", borderRadius: 9, border: "1px solid #374151", background: "#0f131a", color: "#fff", fontSize: 15 }} />}
            </div>
            {/* Method */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              {[["cash", "Cash"], ["card", "Card"]].map(([m, label]) => (
                <div key={m} onClick={() => setPayMethod(m)} className="kbtn" style={{ flex: 1, textAlign: "center", padding: "14px 0", borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 800, background: payMethod === m ? "#ec4899" : "#20242f", border: "1px solid " + (payMethod === m ? "#ec4899" : "#2a3340") }}>{label}</div>
              ))}
            </div>
            {/* PIN — required to confirm */}
            <input type="text" inputMode="numeric" value={payPin} onChange={(e) => setPayPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && takePayment()} placeholder="Staff PIN to confirm"
              autoComplete="off" name="kds-code-nosave" data-1p-ignore data-lpignore="true" readOnly onFocus={(e) => e.target.removeAttribute("readonly")}
              style={{ width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 20, letterSpacing: 6, padding: "12px 0", borderRadius: 12, border: "1px solid #374151", background: "#0f131a", color: "#fff", marginBottom: 8, WebkitTextSecurity: "disc", textSecurity: "disc" }} />
            {payErr && <div style={{ color: "#f87171", fontSize: 13, textAlign: "center", marginBottom: 8 }}>{payErr}</div>}
            <div onClick={takePayment} className="kbtn" style={{ textAlign: "center", padding: "13px 0", borderRadius: 30, background: (payMethod && payPin) ? "#16a34a" : "#334155", color: "#fff", fontWeight: 800, fontSize: 16, cursor: (payMethod && payPin) ? "pointer" : "default", opacity: payBusy ? .6 : 1 }}>{payBusy ? "Processing…" : "Confirm payment"}</div>
          </div>
        </div>
      )}

      {undo && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", animation: "ktoast .2s cubic-bezier(.2,.8,.2,1)", background: "linear-gradient(180deg,#232b39,#1a212c)", border: "1px solid #374151", borderRadius: 14, padding: "12px 14px 12px 18px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 16px 48px -12px rgba(0,0,0,.7)", zIndex: 50 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Bumped <b style={{ fontWeight: 800 }}>{(undo.order.tablet_no ? "T" + undo.order.tablet_no + "-" : "#") + (undo.order.order_no ?? "")}</b></span>
          <div onClick={doUndo} className="kbtn" style={{ background: "#ec4899", padding: "8px 18px", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer", color: "#fff", boxShadow: "0 2px 10px -2px #ec489988" }}>Undo</div>
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
