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

// Age bands for ticket colour. Industry norm is tight — most operators run
// green under ~5 min, amber to ~8, red beyond. Set these to YOUR speed-of-
// service standard: if nearly every ticket sits red, the colour stops being a
// signal and staff learn to ignore it.
const WARN_MIN = 6;
const LATE_MIN = 12;
// FLIPDISH-KDS 2026-09-27a: how external (Flipdish / aggregator) orders are labelled
const CHANNEL_LABEL = { Deliveroo: "DELIVEROO", UberEats: "UBER EATS", JustEat: "JUST EAT", Flipdish: "FLIPDISH", Kiosk: "KIOSK", POS: "POS" };
// KDS-TYPE 2026-10-03: every card carries a coloured order-type badge so dine-in / takeaway / collection / delivery read at a glance
const TYPE_BADGE = {
  dine_in:    { bg: "#1d4ed8", label: "DINE IN",  short: "DINE",    icon: "\uD83C\uDF7D\uFE0F" }, // 🍽️
  takeaway:   { bg: "#d97706", label: "TAKEAWAY", short: "T/A",   icon: "\uD83E\uDD61" },       // 🥡
  collection: { bg: "#7c3aed", label: "COLLECTION", short: "COLL", icon: "\uD83D\uDECD\uFE0F" }, // 🛍️
  delivery:   { bg: "#0f766e", label: "DELIVERY", short: "DELIV",   icon: "\uD83D\uDEF5" },       // 🛵
};
const typeKey = (o) => (o.menu_tables?.label || o.order_type === "dine_in") ? "dine_in" : (TYPE_BADGE[o.order_type] ? o.order_type : "takeaway");
const typeBadge = (o, F) => { const b = TYPE_BADGE[typeKey(o)]; return (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: F(12), fontWeight: 900, letterSpacing: ".08em", background: b.bg, color: "#fff", padding: F(4) + "px " + F(10) + "px", borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,.18)", lineHeight: 1 }}>
    <span style={{ fontSize: F(13) }}>{b.icon}</span>{b.label}
  </span>
); };
// KDS-MODS 2026-10-03: show the choice, not the price. "Ice Cream: Ice Cream · Full (+£2.50)" → "Ice Cream · Full"
const cleanMod = (m) => String(m || "").replace(/\s*\(\+?£?-?\d[\d.,]*\)\s*/g, "").replace(/^[^:]{1,40}:\s*/, "").trim();
const cleanMods = (mods) => { const out = []; for (const m of mods) { const c = cleanMod(m); if (c && !out.includes(c)) out.push(c); } return out; };
const ALLERGY_RE = /allerg|nut|gluten|coeliac|celiac|dairy|lactose|vegan|halal|sesame|egg|shellfish|soy/i;
const noteBox = (text, F) => {
  const allergy = ALLERGY_RE.test(text || "");
  const st = allergy ? { color: "#fff", background: "#b91c1c", border: "1px solid #991b1b" } : { color: "#7f1d1d", background: "#fee2e2", border: "1px solid #fca5a5" };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: F(13), fontWeight: 700, padding: F(3) + "px " + F(9) + "px", borderRadius: 7, ...st }}>
    <span style={{ fontSize: F(9), fontWeight: 900, letterSpacing: ".1em", opacity: .9 }}>{allergy ? "ALLERGY" : "NOTE"}</span>{text}
  </span>;
};
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + k)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + k)), b = Math.max(0, Math.min(255, (n & 255) + k)); return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); };
// The type block is set like a piece of signage: each word is justified to the full
// width of the block (SVG textLength), so the colour panel is filled edge to edge
// whatever the word length, and the two-word types stack with equal measure.
// Order-type tile: kitchen shorthand large (DINE / T/A / COLL / DELIV), full word small beneath,
// on a square colour tile the full height of the header. Set to fill its measure at every size.
const typeBlock = (o, F) => { const b = TYPE_BADGE[typeKey(o)]; const grad = "linear-gradient(180deg," + shade(b.bg, 18) + " 0%," + b.bg + " 55%," + shade(b.bg, -14) + " 100%)";
  return (
    <div style={{ alignSelf: "stretch", width: F(66), flex: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: grad, color: "#fff", marginRight: F(12), borderRadius: F(13) + "px 0 0 0", boxShadow: "inset -1px 0 0 rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.28)", padding: "0 " + F(4) + "px", boxSizing: "border-box" }}>
      <span style={{ fontSize: b.short.length > 4 ? F(17) : F(21), fontWeight: 900, letterSpacing: b.short.length > 4 ? "-.02em" : "-.01em", lineHeight: 1, textShadow: "0 1px 1px rgba(0,0,0,.28)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{b.short}</span>
      <span style={{ marginTop: F(4), fontSize: F(7.5), fontWeight: 800, letterSpacing: ".12em", lineHeight: 1, whiteSpace: "nowrap", opacity: .92, borderTop: "1px solid rgba(255,255,255,.35)", paddingTop: F(3) }}>{b.label}</span>
    </div>
  );
};
const CHANNEL_BG = { Deliveroo: "#00ccbc", UberEats: "#06c167", JustEat: "#ff8000", Flipdish: "#1d4ed8", Kiosk: "#6b7280", POS: "#6b7280" };
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
// Persisted like loc/station/printer. Previously this read the URL every time,
// so ANY reload without the full query string (home-screen shortcut, crash
// recovery, tab reopened) silently reverted the screen to "main" — losing its
// identity and, with it, its kds_screens printer preference.
function getScreenId() {
  try {
    const url = getParam("screen");
    if (url) { localStorage.setItem("kds_screen", url); return url; }
    return localStorage.getItem("kds_screen") || "main";
  } catch { return getParam("screen") || "main"; }
}
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
  // Designated printer for MANUAL prints from this screen, by serial:
  //   ?printer=N450263A10230
  // Serial rather than station, deliberately: both printers share the
  // "kitchen" station so that AUTOMATIC printing sends the complete order to
  // both. Targeting by station would therefore hit both on a manual print too.
  // A serial narrows to exactly one device (sunmi-print gives printer_sn
  // precedence over station in narrowToTarget).
  const [myPrinter, setMyPrinter] = useState(() => getRemembered("kds_printer", "printer"));
  // Orders THIS screen has bumped, from kds_bumps. Kept in the DB rather than
  // localStorage so it survives a reload and so other screens are unaffected:
  // bumping here no longer clears the ticket on the other screen.
  const [myBumps, setMyBumps] = useState(() => new Set());
  const [myBumpAt, setMyBumpAt] = useState({}); // order_id -> when THIS screen bumped it
  // Load THIS screen's bumps on start and keep them fresh, so a reload (or a
  // replaced tablet) does not resurrect tickets this screen already cleared.
  useEffect(() => {
    if (!loc) return;
    let alive = true;
    const load = () => {
      // Must cover at least the order window (20h) or bumped tickets resurrect.
      const since = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
      fetch(SUPABASE_URL + "/rest/v1/kds_bumps?location_id=eq." + encodeURIComponent(loc)
            + "&screen_key=eq." + encodeURIComponent(getScreenId())
            + "&bumped_at=gte." + encodeURIComponent(since)
            + "&select=order_id,bumped_at", { headers: H, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => { if (alive) { setMyBumps(new Set((rows || []).map((r) => r.order_id))); setMyBumpAt(Object.fromEntries((rows || []).map((r) => [r.order_id, r.bumped_at]))); } })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [loc]);
  // The DB is the source of truth for this screen's printer. kds_screens is
  // keyed (location_id, screen_key) and is managed centrally, so a replaced
  // tablet or a cleared browser picks its printer back up on load instead of
  // silently falling back to "every printer". The URL param / localStorage
  // value above is only the initial seed for a screen not yet registered.
  useEffect(() => {
    if (!loc) return;
    let alive = true;
    const url = SUPABASE_URL + "/rest/v1/kds_screens?location_id=eq." + encodeURIComponent(loc)
      + "&screen_key=eq." + encodeURIComponent(getScreenId())
      + "&select=printer_sn,label,station&limit=1";
    fetch(url, { headers: H, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!alive || !rows.length) return;
        const sn = rows[0].printer_sn;
        if (sn) { setMyPrinter(sn); try { localStorage.setItem("kds_printer", sn); } catch {} }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [loc]);
  const [myName] = useState(() => getRemembered("kds_name", "name"));
  const [soundOn, setSoundOn] = useState(true);
  const [connected, setConnected] = useState(true);
  const [size, setSize] = useState(() => localStorage.getItem("kds_size") || "M");
  const [fullscreen, setFullscreen] = useState(false);
  const [undo, setUndo] = useState(null);
  const [armedBump, setArmedBump] = useState(null); // {id, timer} — first tap arms, second confirms
  const [rushIds, setRushIds] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("kds_rush") || "[]")); } catch { return new Set(); } });
  // Orders/payment view state
  const [view, setView] = useState("kitchen");      // "kitchen" | "pos" (the old "orders" screen was removed — payments live on the POS)
  const [orderFilter, setOrderFilter] = useState("unpaid"); // unpaid | paid | all
  const [payFor, setPayFor] = useState(null);       // order awaiting payment action
  const [payPin, setPayPin] = useState("");         // PIN entered to confirm payment
  const [payMethod, setPayMethod] = useState(null); // cash | card chosen, awaiting PIN
  const [payDiscType, setPayDiscType] = useState(null); // null | percent | amount
  const [payDiscVal, setPayDiscVal] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState("");
  const prevIds = useRef(new Set());
  const prevCounts = useRef(new Map());
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
      let url = SUPABASE_URL + "/rest/v1/menu_orders?select=id,order_no,tablet_no,order_type,pickup_name,customer_note,status,print_failed,print_error,total,paid_method,paid_amount,kds_started_at,kds_bumped_at,items_added_at,created_at,order_channel,external_channel,external_ref,requested_for,menu_tables(label),menu_order_items(id,name_snapshot,qty,added_batch,modifiers_snapshot,note,item_status,menu_items(category_id,menu_categories(menu_menus(name))))"
        + "&status=in.(placed,preparing,ready,served)"
        + "&closed_at=is.null&order=created_at.desc&limit=500";
      // Only today's trade: a busy day passed 200 open orders and the old
      // ascending limit silently dropped the NEWEST tickets. Fetch newest-first,
      // cap generously, and skip orders older than 20h (unclosed days pile up).
      url += "&created_at=gte." + encodeURIComponent(new Date(Date.now() - 20 * 3600 * 1000).toISOString());
      if (loc) url += "&location_id=eq." + loc;
      const r = await fetch(url, { headers: H, cache: "no-store" });
      if (!r.ok) throw new Error("http " + r.status);
      const data = (await r.json()).reverse(); // back to oldest-first for the ticket rail
      setConnected(true);
      // Beep for genuinely new orders (not yet served) AND for items appended
      // to an order this screen already knows about — the append reopens the
      // ticket server-side, but the id is not new, so track item counts too.
      const activeIds = new Set(data.filter((o) => o.status !== BUMP_TO).map((o) => o.id));
      let isNew = false;
      for (const id of activeIds) if (!prevIds.current.has(id)) { isNew = true; break; }
      const counts = new Map(data.map((o) => [o.id, (o.menu_order_items || []).length]));
      const grewIds = [];
      for (const [id, n] of counts) { const was = prevCounts.current.get(id); if (was != null && n > was) grewIds.push(id); }
      if ((isNew || grewIds.length) && prevIds.current.size > 0) beep();
      prevIds.current = activeIds;
      prevCounts.current = counts;
      // An append clears this screen's bump in kds_bumps; drop it locally too so
      // the ticket comes back at once instead of on the next 15s bump refresh.
      if (grewIds.length) setMyBumps((prev) => { const next = new Set(prev); grewIds.forEach((id) => next.delete(id)); return next; });
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
          ...(myPrinter ? { printer_sn: myPrinter } : myStation ? { station: myStation } : {}),
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
    // Record WHICH screen bumped, so a ticket that vanishes unexpectedly can be
    // traced. If kds_bumped_at is ever set while kds_bumped_by is null, the
    // write did not come from this KDS at all — which narrows it immediately.
    // Record THIS screen's bump, then let the server decide whether every
    // active screen has now bumped it (only then does it become "served").
    const who = (myName || ("screen " + getScreenId())) + (myStation ? " / " + myStation : "");
    setMyBumps((prev) => new Set(prev).add(o.id));
    (async () => {
      try {
        await fetch(SUPABASE_URL + "/rest/v1/kds_bumps", {
          method: "POST",
          headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            order_id: o.id, screen_key: getScreenId(), location_id: loc, bumped_by: who,
            // Re-bumping an order that already has a row (e.g. one reopened by an
            // append, or an old ticket) must refresh the timestamp, or the row
            // stays outside the load window and the ticket comes straight back.
            bumped_at: new Date().toISOString(),
          }),
        });
        await fetch(SUPABASE_URL + "/rest/v1/rpc/kds_settle_order", {
          method: "POST", headers: H, body: JSON.stringify({ p_order_id: o.id }),
        });
      } catch {}
    })();
    if (undo && undo.timer) clearTimeout(undo.timer);
    const timer = setTimeout(() => setUndo(null), 20000);
    setUndo({ order: o, prevStatus, timer });
  };
  // Bump needs TWO deliberate taps. Two guards make that reliable on a
  // touchscreen:
  //   MIN_CONFIRM_MS — a single physical tap can emit two click events (touch
  //     -> click emulation, finger roll, contact bounce). Without a floor, one
  //     tap arms AND confirms, and the ticket vanishes with nobody having
  //     pressed twice. Anything faster than a human double-tap is ignored and
  //     the card simply stays armed.
  //   ARM_WINDOW_MS — 2.5s was too tight on a busy pass; the card disarmed
  //     before the second tap landed, so staff learned to tap fast, which made
  //     the double-fire above more likely.
  const MIN_CONFIRM_MS = 400;
  const ARM_WINDOW_MS = 8000;
  const requestBump = (o) => {
    if (armedBump && armedBump.id === o.id) {
      if (Date.now() - armedBump.at < MIN_CONFIRM_MS) return; // stays armed
      if (armedBump.timer) clearTimeout(armedBump.timer);
      setArmedBump(null);
      bump(o);
      return;
    }
    if (armedBump && armedBump.timer) clearTimeout(armedBump.timer);
    const timer = setTimeout(() => setArmedBump(null), ARM_WINDOW_MS);
    setArmedBump({ id: o.id, at: Date.now(), timer });
  };
  const doUndo = () => {
    if (!undo) return;
    unbumpHere(undo.order);
    if (undo.timer) clearTimeout(undo.timer);
    setUndo(null);
  };
  const unbumpHere = async (o) => {
    setMyBumps((prev) => { const n = new Set(prev); n.delete(o.id); return n; });
    try {
      await fetch(SUPABASE_URL + "/rest/v1/rpc/kds_unbump", {
        method: "POST", headers: H,
        body: JSON.stringify({ p_order_id: o.id, p_screen_key: getScreenId() }),
      });
    } catch {}
  };
  const recall = (o) => unbumpHere(o);
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
  let active = orders.filter((o) => !myBumps.has(o.id) && o.status !== "cancelled").map(filterStation).filter(Boolean);
  active.sort((a, b) => (rushIds.has(b.id) ? 1 : 0) - (rushIds.has(a.id) ? 1 : 0));
  // Orders that failed to print — shown as an un-ignorable banner across the KDS.
  const failedOrders = orders.filter((o) => !myBumps.has(o.id) && o.status !== "cancelled" && o.print_failed);
  const [retryingPrint, setRetryingPrint] = useState(false);
  async function retryPrint(list) {
    if (retryingPrint) return;
    setRetryingPrint(true);
    try {
      for (const o of list.slice(0, 10)) {
        await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, action: "retry_print", data: { order_id: o.id } }) });
      }
      await load();
    } catch {} finally { setRetryingPrint(false); }
  }
  async function dismissPrint(list) {
    try {
      for (const o of list.slice(0, 20)) {
        await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, action: "clear_print_flag", data: { order_id: o.id } }) });
      }
      setOrders((prev) => prev.map((o) => list.some((x) => x.id === o.id) ? { ...o, print_failed: false, print_error: null } : o));
    } catch {}
  }
  const completed = orders.filter((o) => myBumps.has(o.id)).map(filterStation).filter(Boolean)
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

  // Header stats: how fast THIS screen cleared its tickets today (its own bump
  // times), not the all-screens settle that rarely completes.
  const bumpedToday = completed.filter((o) => myBumpAt[o.id] || o.kds_bumped_at);
  let avgSecs = 0, onTime = 0;
  if (bumpedToday.length) {
    let total = 0;
    for (const o of bumpedToday) {
      const secs = (new Date(myBumpAt[o.id] || o.kds_bumped_at) - new Date(o.created_at)) / 1000;
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
    <div style={{ fontFamily: "'Hanken Grotesk',system-ui,-apple-system,sans-serif", background: "#eef0f3", color: "#1f2937", minHeight: "100vh", cursor: fullscreen ? "none" : "auto" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800;900&display=swap');@keyframes kpop{0%{transform:scale(.96) translateY(6px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}@keyframes kpulse{0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,.5)}50%{box-shadow:0 0 0 5px rgba(244,63,94,0)}}@keyframes klate{0%,100%{opacity:1}50%{opacity:.72}}@keyframes ktoast{0%{transform:translate(-50%,20px);opacity:0}100%{transform:translate(-50%,0);opacity:1}}@keyframes kfailflash{0%,100%{background:#dc2626}50%{background:#8f1414}}.kcard{animation:kpop .22s cubic-bezier(.2,.8,.2,1)}.krush{animation:kpulse 1.5s infinite}.klate .ktime{animation:klate 1.6s infinite}.kbtn{transition:filter .12s,transform .08s}.kbtn:hover{filter:brightness(1.12)}.kbtn:active{transform:translateY(1px) scale(.99)}.kitem{transition:opacity .15s,background .12s;border-radius:6px}.kitem:hover{background:#00000008}::-webkit-scrollbar{width:9px}::-webkit-scrollbar-thumb{background:#c3c9d2;border-radius:5px}::-webkit-scrollbar-thumb:hover{background:#a8b0bb}"}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 20px", background: "#ffffff", borderBottom: "1px solid #d8dce2", position: "sticky", top: 0, zIndex: 20, boxShadow: "0 1px 3px rgba(15,23,42,.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontWeight: 800, fontSize: 21, letterSpacing: "-.02em" }}>Chocoberry <span style={{ color: "#f472b6" }}>KDS</span></span>
          <div style={{ display: "flex", background: "#e2e5ea", borderRadius: 10, padding: 3, gap: 2 }}>
            {[["kitchen", "Kitchen"], ["perf", "Performance"], ["pos", "POS"]].map(([v, label]) => (
              <div key={v} onClick={() => setView(v)} className="kbtn" style={{ padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 800, background: view === v ? "#ec4899" : "transparent", color: view === v ? "#fff" : "#475569" }}>
                {label}
              </div>
            ))}
          </div>
          {view === "kitchen" && (
          <div style={{ display: "flex", gap: 6 }}>
            {[["active", "Active"], ["allday", "All-day"], ["completed", "Done"]].map(([t, label]) => (
              <div key={t} onClick={() => setTab(t)} className="kbtn" style={{ padding: "7px 15px", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 700, background: tab === t ? "#ec4899" : "#ffffff", color: tab === t ? "#ffffff" : "#475569", border: "1px solid #d8dce2", transition: "background .12s" }}>
                {label}{t === "active" ? " " + active.length : ""}
              </div>
            ))}
          </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 13 }}>
          <Stat label="Time" value={nowClock} />
          <Stat label="Working" value={active.length} accent="#b45309" />
          <Stat label="Avg today" value={avgLabel} accent="#1d4ed8" />
          {onTimePct !== null && <Stat label="On-time" value={onTimePct + "%"} accent={onTimePct >= 80 ? "#15803d" : "#b45309"} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {stations.length > 1 && (
            <select value={station} onChange={(e) => setStation(e.target.value)} style={{ background: "#ffffff", color: "#1f2937", border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>
              <option value="all">All stations</option>
              {stations.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <div style={{ display: "flex", background: "#e2e5ea", border: "1px solid #d8dce2", borderRadius: 8, overflow: "hidden" }}>
            {Object.keys(SIZES).map((s) => (
              <div key={s} onClick={() => setSize(s)} className="kbtn" style={{ padding: "6px 9px", cursor: "pointer", fontSize: 12, fontWeight: 700, background: size === s ? "#ec4899" : "transparent", color: size === s ? "#ffffff" : "#475569" }}>{s}</div>
            ))}
          </div>
          <div onClick={() => setSoundOn((v) => !v)} className="kbtn" style={{ cursor: "pointer", padding: "6px 10px", borderRadius: 8, background: "#ffffff", border: "1px solid #d8dce2", fontSize: 15 }}>{soundOn ? BELL : BELLOFF}</div>
          <div onClick={goFullscreen} className="kbtn" style={{ cursor: "pointer", padding: "6px 10px", borderRadius: 8, background: "#ffffff", border: "1px solid #d8dce2", fontSize: 15 }} title="Fullscreen">{fullscreen ? X : EXPAND}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: connected ? "#15803d" : "#b91c1c", marginLeft: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#16a34a" : "#dc2626" }} />
            {connected ? "Live" : "\u2026"}
          </div>
          {/* ALWAYS shown. Previously this rendered only when ?screen= was
              present, so an unlabelled screen displayed no identity at all —
              exactly the screens most likely to be misconfigured. */}
          <div style={{ fontSize: 12, fontWeight: 800, color: myStation ? "#052e16" : "#cbd5e1", background: myStation ? "#4ade80" : "#20242f", padding: "5px 10px", borderRadius: 8, marginLeft: 2, letterSpacing: ".02em" }} title={"Screen " + getScreenId() + (myStation ? " \u00B7 prints to " + myStation : " \u00B7 NO STATION SET \u2014 prints to every printer")}>
            {(myName || ("Screen " + getScreenId())) + (myPrinter ? " \u00B7 prints here" : myStation ? " \u00B7 " + myStation : " \u00B7 no printer set")}
          </div>
        </div>
      </div>

      {failedOrders.length > 0 && view !== "pos" && (
        <div style={{ animation: "kfailflash 1.1s ease-in-out infinite", color: "#fff", padding: "10px 18px", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 19, boxShadow: "0 4px 14px rgba(0,0,0,.25)", flexWrap: "wrap" }}>
          <span style={{ fontSize: F(20) }}>{WARN}</span>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontWeight: 900, fontSize: F(15), letterSpacing: ".02em" }}>
              {failedOrders.length === 1 ? "ORDER #" + failedOrders[0].order_no + " DID NOT PRINT" : failedOrders.length + " ORDERS DID NOT PRINT" + " · #" + failedOrders.slice(0, 6).map((o) => o.order_no).join(" #")}
            </div>
            <div style={{ fontWeight: 600, fontSize: F(13), opacity: .95, marginTop: 2 }}>
              {(() => { const reasons = [...new Set(failedOrders.map((o) => o.print_error).filter(Boolean))]; return reasons.length ? reasons.join(" · ") : "Printer did not accept the job — check it is on, connected and has paper"; })()}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <span onClick={() => retryPrint(failedOrders)} className="kbtn" style={{ cursor: "pointer", background: "#fff", color: "#991b1b", borderRadius: 9, padding: "8px 14px", fontWeight: 900, fontSize: F(13) }}>{retryingPrint ? "Retrying…" : "⟳ Retry " + (failedOrders.length === 1 ? "print" : "all")}</span>
            <span onClick={() => dismissPrint(failedOrders)} className="kbtn" style={{ cursor: "pointer", background: "rgba(255,255,255,.18)", border: "1px solid rgba(255,255,255,.55)", borderRadius: 9, padding: "8px 14px", fontWeight: 800, fontSize: F(13) }}>Dismiss</span>
          </div>
        </div>
      )}

      {view === "kitchen" && tab === "active" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(" + F(268) + "px, 1fr))", gap: F(12), padding: F(16), alignItems: "start" }}>
          {active.length === 0 && <div style={{ color: "#64748b", padding: 48, fontSize: 18 }}>No active orders.</div>}
          {active.map((o, i) => {
            const age = minsSince(o.created_at, now);
            const isRush = rushIds.has(o.id);
            const isLate = age >= LATE_MIN;
            const pal = isRush
              ? { accent: "#e11d48", tint: "#ffffff", head: "#ffe4e6", headText: "#881337", body: "#1f2937", sub: "#9f1239", rule: "#00000014" }
              : isLate
              ? { accent: "#dc2626", tint: "#ffffff", head: "#fee2e2", headText: "#7f1d1d", body: "#1f2937", sub: "#991b1b", rule: "#00000014" }
              : age >= WARN_MIN
              ? { accent: "#d97706", tint: "#ffffff", head: "#fef3c7", headText: "#78350f", body: "#1f2937", sub: "#92400e", rule: "#00000014" }
              : { accent: "#16a34a", tint: "#ffffff", head: "#dcfce7", headText: "#14532d", body: "#1f2937", sub: "#15803d", rule: "#00000014" };
            const items = o.menu_order_items || [];
            const doneCount = items.filter((it) => it.item_status === DONE_ITEM).length;
            const allDone = items.length > 0 && doneCount === items.length;
            const typeLabel = o.menu_tables?.label ? o.menu_tables.label : (o.order_type === "dine_in" ? "Dine In" : o.order_type === "collection" ? "Collection" : o.order_type === "delivery" ? "Delivery" : "Takeaway");
            const note = (o.customer_note || "").trim();
            return (
              <div key={o.id} className={"kcard" + (isRush ? " krush" : "") + (isLate ? " klate" : "")} style={{ background: pal.tint, color: pal.body, borderRadius: F(14), overflow: "hidden", border: "1px solid #d8dce2", borderLeft: "4px solid " + pal.accent, boxShadow: "0 1px 3px rgba(15,23,42,.08)", display: "flex", flexDirection: "column" }}>
                <div style={{ background: pal.head, color: pal.headText, padding: "0 " + F(12) + "px 0 0", display: "flex", justifyContent: "space-between", alignItems: "stretch", minHeight: F(64) }}>
                  {typeBlock(o, F)}
                  <div style={{ padding: F(8) + "px 0", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: F(19), letterSpacing: "-.01em", display: "flex", alignItems: "center", gap: 7 }}>
                      {isRush && <span style={{ fontSize: F(15) }}>{BOLT}</span>}
                      {/* A kitchen ticket answers "where does this food go?".
                          Dine-in is routed by TABLE, takeaway by the fact it
                          leaves. The order number is a reference, not a
                          destination, so it moves to the line below. */}
                      {(o.menu_tables?.label || o.order_type === "dine_in") ? (
                        <span style={{ fontSize: F(24), fontWeight: 900, letterSpacing: "-.02em" }}>{o.menu_tables?.label || "Table"}</span>
                      ) : (
                        <>
                          {/* FLIPDISH-KDS 2026-09-27a: aggregator / Flipdish orders carry their channel */}
                          {o.external_channel && <span style={{ fontSize: F(11), fontWeight: 800, letterSpacing: ".04em", background: CHANNEL_BG[o.external_channel] || "#1d4ed8", color: "#fff", padding: "2px 8px", borderRadius: 6 }}>{CHANNEL_LABEL[o.external_channel] || o.external_channel}</span>}
                          {(o.pickup_name || !o.external_channel) && <span style={{ fontSize: F(22), fontWeight: 900, letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.pickup_name || "#" + (o.order_no ?? "")}</span>}
                          {o.requested_for && <span style={{ fontSize: F(11), fontWeight: 700, opacity: .8 }}>for {new Date(o.requested_for).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
                        </>
                      )}
                      <span style={{ fontSize: F(10), fontWeight: 800, opacity: .7, border: "1.5px solid currentColor", padding: "0 6px", borderRadius: 20, lineHeight: 1.6 }}>{i + 1}</span>
                    </div>
                    <div style={{ fontSize: F(11.5), opacity: .85, fontWeight: 600, marginTop: 2, letterSpacing: ".02em" }}>
                      {"#" + (o.order_no ?? "") + (o.tablet_no ? "  " + DOT + "  Tablet " + o.tablet_no : "")}
                      {(o.menu_tables?.label || o.order_type === "dine_in") && o.pickup_name ? " " + DOT + " " + o.pickup_name : ""}
                    </div>
                    {o.print_failed && <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5, background: "#dc2626", color: "#fff", fontSize: F(11), fontWeight: 800, padding: "2px 8px", borderRadius: 6, letterSpacing: ".02em" }}>⚠ NOT PRINTED</div>}
                  </div>
                  <div style={{ textAlign: "right", flex: "none", marginLeft: 8, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div className="ktime" style={{ fontWeight: 900, fontSize: F(19), fontVariantNumeric: "tabular-nums", color: "#fff", background: pal.accent, letterSpacing: "-.02em", padding: "2px " + F(9) + "px", borderRadius: 8, display: "inline-block", lineHeight: 1.3 }}>{fmtClock(o.created_at, now)}</div>
                    <div style={{ fontSize: F(10), opacity: .9, fontWeight: 700, marginTop: 3 }}>{items.length ? doneCount + "/" + items.length + " done" : ""}{o.status === "preparing" ? " " + DOT + " prep" : ""}</div>
                  </div>
                </div>
                <div style={{ height: 3, background: "#00000012" }}><div style={{ height: "100%", width: (items.length ? Math.round(doneCount / items.length * 100) : 0) + "%", background: pal.accent, transition: "width .25s ease" }} /></div>
                <div style={{ padding: F(8) + "px " + F(9) + "px", flex: 1 }}>
                  {groupByCat(items).map(([cat, catItems]) => (
                    <div key={cat} style={{ marginBottom: F(4) }}>
                      <div style={{ fontSize: F(10.5), fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: pal.sub, borderBottom: "1px solid " + pal.rule, paddingBottom: F(3), marginBottom: F(3), marginTop: F(3), display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 3, height: F(10), borderRadius: 2, background: TYPE_BADGE[typeKey(o)].bg, display: "inline-block" }} />{cat}</div>
                      {catItems.map((it) => {
                        const done = it.item_status === DONE_ITEM;
                        const mods = cleanMods(it.modifiers_snapshot && typeof it.modifiers_snapshot === "object" ? Object.values(it.modifiers_snapshot) : []);
                        return (
                          <div key={it.id} className="kitem" onClick={() => toggleItem(o, it)} style={{ padding: F(7) + "px " + F(6) + "px", cursor: "pointer", opacity: done ? .34 : 1, borderBottom: "1px dashed #00000010" }}>
                            <div style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
                              <span style={{ fontWeight: 900, fontSize: F(15), color: (it.qty || 1) > 1 ? "#92400e" : pal.accent, background: (it.qty || 1) > 1 ? "#fde68a" : "transparent", padding: (it.qty || 1) > 1 ? "0 " + F(6) + "px" : 0, borderRadius: 6, minWidth: F(26), textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{(it.qty || 1) + TIMES}</span>
                              <span style={{ fontWeight: 700, fontSize: F(15.5), lineHeight: 1.25, textDecoration: done ? "line-through" : "none" }}>{it.name_snapshot}</span>
                              {(it.added_batch || 0) > 0 && !done && <span style={{ fontSize: F(10), fontWeight: 900, letterSpacing: ".06em", background: "#7c3aed", color: "#fff", padding: "1px 6px", borderRadius: 5 }}>ADDED</span>}
                            </div>
                            {mods.length > 0 && <div style={{ paddingLeft: F(35), marginTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>{mods.map((m, k) => <div key={k} style={{ fontSize: F(13), color: "#0369a1", fontWeight: 600, lineHeight: 1.25 }}>{m}</div>)}</div>}
                          {it.note && <div style={{ marginLeft: F(35), marginTop: 4 }}>{noteBox(it.note, F)}</div>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {note && <div style={{ marginTop: F(8) }}>{noteBox(note, F)}</div>}
                </div>
                <div style={{ display: "flex", gap: 2, padding: 2 }}>
                  <div onClick={() => toggleRush(o)} className="kbtn" style={{ width: F(46), textAlign: "center", padding: F(11) + "px 0", background: isRush ? "#e11d48" : "#ffffff", border: "1px solid #94a3b8", borderRadius: 9, fontWeight: 800, fontSize: F(15), cursor: "pointer", color: isRush ? "#ffffff" : "#475569" }} title="Rush">{BOLT}</div>
                  {/* Print slip. Deliberately on the LEFT, far from Bump: Bump is
                      destructive and a mis-tap on a wall screen loses the ticket. */}
                  <div onClick={(e) => printSlip(o, e)} className="kbtn" style={{ width: F(46), textAlign: "center", padding: F(11) + "px 0", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: 9, fontWeight: 800, fontSize: F(15), cursor: "pointer", color: "#334155", opacity: printingId === o.id ? .5 : 1 }} title="Print slip">
                    {printingId === o.id ? "\u2026" : PRINTER}
                  </div>
                  {o.status === "placed" && <div onClick={() => start(o)} className="kbtn" style={{ flex: 1, textAlign: "center", padding: F(11) + "px 0", background: "#ffffff14", borderRadius: 9, fontWeight: 700, fontSize: F(14), cursor: "pointer" }}>Start</div>}
                  <div onClick={() => requestBump(o)} className="kbtn" style={{ flex: 2, textAlign: "center", padding: F(11) + "px 0", background: (armedBump && armedBump.id === o.id) ? "#b45309" : (allDone ? "#15803d" : "#16a34a"), borderRadius: 9, fontWeight: 800, fontSize: F(15.5), cursor: "pointer", color: "#ffffff", boxShadow: "none" }}>{(armedBump && armedBump.id === o.id) ? "Tap again ✓" : (CHECK + " Bump")}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "kitchen" && tab === "allday" && (
        <div style={{ padding: F(16), maxWidth: 620 }}>
          <div style={{ fontSize: F(14), color: "#64748b", marginBottom: 12 }}>Everything working right now, across all active orders:</div>
          {alldayRows.length === 0 && <div style={{ color: "#64748b" }}>Nothing in the queue.</div>}
          {alldayRows.map(([name, qty]) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: F(12) + "px " + F(16) + "px", background: "#ffffff", borderRadius: 10, marginBottom: 8, border: "1px solid #d8dce2" }}>
              <span style={{ fontWeight: 700, fontSize: F(17) }}>{name}</span>
              <span style={{ fontWeight: 800, fontSize: F(23), color: "#fbbf24", fontVariantNumeric: "tabular-nums" }}>{qty}</span>
            </div>
          ))}
        </div>
      )}

      {view === "kitchen" && tab === "completed" && (
        <div style={{ padding: F(16) }}>
          <div style={{ fontSize: F(14), color: "#64748b", marginBottom: 12 }}>Recently bumped {DOT} tap Recall to bring one back.{bumpedToday.length ? "  Avg today " + avgLabel + (onTimePct !== null ? " " + DOT + " " + onTimePct + "% on-time" : "") : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(" + F(268) + "px, 1fr))", gap: F(12), alignItems: "start" }}>
            {completed.slice(0, 40).map((o) => {
              // Identical structure to an ACTIVE ticket — same header, table
              // label, station groupings, modifiers and note — so the two tabs
              // read the same. Only the palette is neutral (it is finished) and
              // the footer is Recall instead of Bump.
              const pal = { accent: "#64748b", tint: "#ffffff", head: "#e8ebef", headText: "#334155", body: "#1f2937", sub: "#64748b", rule: "#00000014" };
              const items = o.menu_order_items || [];
              const typeLabel = o.menu_tables?.label ? o.menu_tables.label : (o.order_type === "dine_in" ? "Dine In" : o.order_type === "collection" ? "Collection" : o.order_type === "delivery" ? "Delivery" : "Takeaway");
              const note = (o.customer_note || "").trim();
              const served = o.kds_bumped_at ? new Date(o.kds_bumped_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
              return (
                <div key={o.id} style={{ background: pal.tint, color: pal.body, borderRadius: F(14), overflow: "hidden", border: "1px solid #d8dce2", borderLeft: "4px solid " + pal.accent, boxShadow: "0 1px 3px rgba(15,23,42,.08)", display: "flex", flexDirection: "column" }}>
                  <div style={{ background: pal.head, color: pal.headText, padding: F(9) + "px " + F(12) + "px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: F(19), letterSpacing: "-.01em" }}>
                        {(o.tablet_no ? "T" + o.tablet_no + "-" : "#") + (o.order_no ?? "")}
                      </div>
                      <div style={{ fontSize: F(12), opacity: .82, fontWeight: 500, marginTop: 1 }}>{typeLabel}{o.pickup_name ? " " + DOT + " " + o.pickup_name : ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900, fontSize: F(20), fontVariantNumeric: "tabular-nums", color: pal.accent, letterSpacing: "-.02em" }}>{served}</div>
                      <div style={{ fontSize: F(10), opacity: .7, fontWeight: 600, marginTop: 1 }}>{items.length ? items.length + " items" : ""}</div>
                    </div>
                  </div>
                  <div style={{ padding: F(8) + "px " + F(9) + "px", flex: 1 }}>
                    {groupByCat(items).map(([cat, catItems]) => (
                      <div key={cat} style={{ marginBottom: F(4) }}>
                        <div style={{ fontSize: F(10.5), fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: pal.sub, borderBottom: "1px solid " + pal.rule, paddingBottom: F(3), marginBottom: F(3), marginTop: F(3), display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 3, height: F(10), borderRadius: 2, background: TYPE_BADGE[typeKey(o)].bg, display: "inline-block" }} />{cat}</div>
                        {catItems.map((it) => {
                          const mods = cleanMods(it.modifiers_snapshot && typeof it.modifiers_snapshot === "object" ? Object.values(it.modifiers_snapshot) : []);
                          return (
                            <div key={it.id} style={{ padding: F(6) + "px " + F(6) + "px" }}>
                              <div style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
                                <span style={{ fontWeight: 900, fontSize: F(15), color: (it.qty || 1) > 1 ? "#92400e" : pal.accent, background: (it.qty || 1) > 1 ? "#fde68a" : "transparent", padding: (it.qty || 1) > 1 ? "0 " + F(6) + "px" : 0, borderRadius: 6, minWidth: F(26), textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{(it.qty || 1) + TIMES}</span>
                                <span style={{ fontWeight: 700, fontSize: F(15.5), lineHeight: 1.25 }}>{it.name_snapshot}</span>
                              </div>
                              {mods.length > 0 && <div style={{ paddingLeft: F(35), marginTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>{mods.map((m, k) => <div key={k} style={{ fontSize: F(13), color: "#0369a1", fontWeight: 600, lineHeight: 1.25 }}>{m}</div>)}</div>}
                            {it.note && <div style={{ marginLeft: F(35), marginTop: 4 }}>{noteBox(it.note, F)}</div>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {note && <div style={{ marginTop: F(8) }}>{noteBox(note, F)}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 2, padding: 2 }}>
                    <div onClick={(e) => printSlip(o, e)} className="kbtn" style={{ width: F(46), textAlign: "center", padding: F(11) + "px 0", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: 9, fontWeight: 800, fontSize: F(15), cursor: "pointer", color: "#334155", opacity: printingId === o.id ? .5 : 1 }} title="Print slip">
                      {printingId === o.id ? "\u2026" : PRINTER}
                    </div>
                    <div onClick={() => recall(o)} className="kbtn" style={{ flex: 2, textAlign: "center", padding: F(11) + "px 0", background: "#475569", borderRadius: 9, fontWeight: 800, fontSize: F(15.5), cursor: "pointer", color: "#ffffff" }}>{ARROW + " Recall"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "perf" && <PerformanceView loc={loc} F={F} lateMin={LATE_MIN} />}

      {view === "pos" && (
        <POS loc={loc} storeToken={getParam("store") || null} tablesList={posTables} />
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
              style={{ width: "100%", boxSizing: "border-box", fontSize: 15, padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#ffffff", color: "#1f2937", marginBottom: 12 }} />
            <input type="text" inputMode="numeric" value={voidPin} onChange={(e) => setVoidPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && voidOrder()} placeholder="Staff PIN to confirm"
              autoComplete="off" name="kds-void-nosave" data-1p-ignore data-lpignore="true" readOnly onFocus={(e) => e.target.removeAttribute("readonly")}
              style={{ width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 20, letterSpacing: 6, padding: "12px 0", borderRadius: 12, border: "1px solid #cbd5e1", background: "#ffffff", color: "#1f2937", marginBottom: 8, WebkitTextSecurity: "disc", textSecurity: "disc" }} />
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
              {payDiscType && <input type="number" value={payDiscVal} onChange={(e) => setPayDiscVal(e.target.value)} placeholder={payDiscType === "percent" ? "%" : "GBP"} style={{ width: 70, textAlign: "center", borderRadius: 9, border: "1px solid #cbd5e1", background: "#ffffff", color: "#1f2937", fontSize: 15 }} />}
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
              style={{ width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 20, letterSpacing: 6, padding: "12px 0", borderRadius: 12, border: "1px solid #cbd5e1", background: "#ffffff", color: "#1f2937", marginBottom: 8, WebkitTextSecurity: "disc", textSecurity: "disc" }} />
            {payErr && <div style={{ color: "#f87171", fontSize: 13, textAlign: "center", marginBottom: 8 }}>{payErr}</div>}
            <div onClick={takePayment} className="kbtn" style={{ textAlign: "center", padding: "13px 0", borderRadius: 30, background: (payMethod && payPin) ? "#16a34a" : "#334155", color: "#fff", fontWeight: 800, fontSize: 16, cursor: (payMethod && payPin) ? "pointer" : "default", opacity: payBusy ? .6 : 1 }}>{payBusy ? "Processing…" : "Confirm payment"}</div>
          </div>
        </div>
      )}

      {undo && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", animation: "ktoast .2s cubic-bezier(.2,.8,.2,1)", background: "#ffffff", border: "1px solid #d8dce2", borderRadius: 14, padding: "12px 14px 12px 18px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 16px 48px -12px rgba(0,0,0,.7)", zIndex: 50 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Bumped <b style={{ fontWeight: 800 }}>{(undo.order.tablet_no ? "T" + undo.order.tablet_no + "-" : "#") + (undo.order.order_no ?? "")}</b></span>
          <div onClick={doUndo} className="kbtn" style={{ background: "#ec4899", padding: "8px 18px", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer", color: "#fff", boxShadow: "0 2px 10px -2px #ec489988" }}>Undo</div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PERFORMANCE — kitchen speed for the trading day (04:00 → now) with a 7-day
// comparison. Reads menu_orders directly (archived-by-close-till orders still
// count, since closed_at doesn't matter here) and kds_bumps for per-screen
// times. Everything is computed on the screen; nothing is written.
// ============================================================================
function tradingDayStart(d = new Date()) {
  const t = new Date(d);
  if (t.getHours() < 4) t.setDate(t.getDate() - 1);
  t.setHours(4, 0, 0, 0);
  return t;
}
const mmss = (secs) => {
  if (secs == null || !isFinite(secs)) return "—";
  if (secs >= 3600) return Math.floor(secs / 3600) + "h " + String(Math.floor((secs % 3600) / 60)).padStart(2, "0") + "m";
  return Math.floor(secs / 60) + ":" + String(Math.floor(secs % 60)).padStart(2, "0");
};
const pct = (arr, q) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); const i = Math.min(a.length - 1, Math.floor(q * (a.length - 1))); return a[i]; };
const avg = (arr) => arr.length ? arr.reduce((t, x) => t + x, 0) / arr.length : null;

// Breakdown table used by the Performance tab. Module-level so its own state
// (show all / sort) survives the view's 30s refreshes.
function PerfTable({ rows: rs, label, limit, sortable, C, F, PF, T, onRow }) {
  const [all, setAll] = useState(false);
  const [sortBy, setSortBy] = useState("n");
  const sorted = sortable ? [...rs].sort((a, b) => sortBy === "n" ? b.n - a.n : sortBy === "slow" ? (b.avg || 0) - (a.avg || 0) : a.on - b.on) : rs;
  const shown = limit && !all ? sorted.slice(0, limit) : sorted;
  const maxAvg = Math.max(1, ...rs.map((r) => r.avg || 0));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 76px 64px 54px", gap: 6, fontSize: F(10.5), fontWeight: 800, color: C.muted, letterSpacing: ".04em", padding: "0 0 6px", alignItems: "center" }}>
        <span>{label}{sortable && <span style={{ marginLeft: 8, fontWeight: 600, letterSpacing: 0 }}>{[["n", "most tickets"], ["slow", "slowest"], ["on", "worst on-time"]].map(([k, l]) => <span key={k} onClick={() => setSortBy(k)} style={{ cursor: "pointer", marginRight: 6, color: sortBy === k ? C.ink : "#a3aab0", textDecoration: sortBy === k ? "underline" : "none" }}>{l}</span>)}</span>}</span>
        <span style={{ textAlign: "right" }}>TKTS</span><span style={{ textAlign: "right" }}>AVG</span><span style={{ textAlign: "right" }}>P90</span><span style={{ textAlign: "right" }}>ON-TIME</span>
      </div>
      {shown.map((r) => (
        <div key={r.k} onClick={() => onRow(label.charAt(0) + label.slice(1).toLowerCase() + ": " + r.k, r.rows)} className="kbtn" style={{ display: "grid", gridTemplateColumns: "1fr 40px 76px 64px 54px", gap: 6, fontSize: F(13.5), padding: "7px 0", borderTop: "1px solid " + C.line, alignItems: "center", cursor: r.rows ? "pointer" : "default" }}>
          <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.k}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.muted }}>{r.n}</span>
          <span style={{ position: "relative", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800, fontFamily: PF, color: r.avg != null && r.avg > T ? C.bad : C.ink }}>
            <span style={{ position: "absolute", left: 0, right: 0, bottom: -3, height: 3, borderRadius: 2, background: C.soft }}><span style={{ display: "block", height: "100%", width: ((r.avg || 0) / maxAvg) * 100 + "%", borderRadius: 2, background: r.avg != null && r.avg > T ? "#fca5a5" : "#86efac" }} /></span>
            {mmss(r.avg)}
          </span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.muted }}>{mmss(r.p90)}</span>
          <span style={{ textAlign: "right" }}><span style={{ display: "inline-block", minWidth: 42, textAlign: "center", padding: "2px 6px", borderRadius: 6, fontWeight: 800, fontSize: F(12), background: r.on >= 80 ? C.goodBg : r.on >= 60 ? C.warnBg : C.badBg, color: r.on >= 80 ? C.good : r.on >= 60 ? C.warn : C.bad }}>{r.on}%</span></span>
        </div>
      ))}
      {limit && rs.length > limit && <div onClick={() => setAll((a) => !a)} className="kbtn" style={{ cursor: "pointer", textAlign: "center", padding: "8px 0 2px", fontSize: F(12), fontWeight: 800, color: C.muted }}>{all ? "Show fewer" : "Show all " + rs.length}</div>}
      {!rs.length && <div style={{ fontSize: F(13), color: C.muted, padding: "8px 0" }}>No completed tickets</div>}
    </div>
  );
}

function PerformanceView({ loc, F, lateMin }) {
  const [period, setPeriod] = useState("today");   // today | yesterday | 7d | 30d
  const [rows, setRows] = useState(null);           // orders in period
  const [prev, setPrev] = useState(null);           // comparison period (completed only)
  const [trend, setTrend] = useState(null);         // last 14 trading days, completed only
  const [screens, setScreens] = useState([]);
  const [target, setTarget] = useState(lateMin);
  const [editTarget, setEditTarget] = useState(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const [drill, setDrill] = useState(null); // { title, rows } — drill-down panel
  const [drillOpen, setDrillOpen] = useState({});
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 30000); return () => clearInterval(id); }, []);

  const range = (() => {
    const t0 = tradingDayStart();
    const day = 86400000;
    if (period === "today") return { from: t0, to: new Date(t0.getTime() + day), prevFrom: new Date(t0.getTime() - 7 * day), prevTo: t0, label: "Today" };
    if (period === "yesterday") return { from: new Date(t0.getTime() - day), to: t0, prevFrom: new Date(t0.getTime() - 8 * day), prevTo: new Date(t0.getTime() - day), label: "Yesterday" };
    const n = period === "7d" ? 7 : 30;
    return { from: new Date(t0.getTime() - (n - 1) * day), to: new Date(t0.getTime() + day), prevFrom: new Date(t0.getTime() - (2 * n - 1) * day), prevTo: new Date(t0.getTime() - (n - 1) * day), label: "Last " + n + " days" };
  })();

  useEffect(() => {
    if (!loc) return;
    let alive = true;
    const rpc = (from, to) => fetch(SUPABASE_URL + "/rest/v1/rpc/kds_ticket_times", { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ p_location: loc, p_from: from.toISOString(), p_to: to.toISOString() }), cache: "no-store" }).then(async (r) => { if (r.ok) return r.json(); let msg = String(r.status); try { const j = await r.json(); msg += " " + (j.message || j.hint || j.details || JSON.stringify(j)).slice(0, 200); } catch {} throw new Error(msg); });
    const t0 = tradingDayStart();
    Promise.all([
      rpc(range.from, range.to),
      rpc(range.prevFrom, range.prevTo),
      rpc(new Date(t0.getTime() - 13 * 86400000), new Date(t0.getTime() + 86400000)),
      fetch(SUPABASE_URL + "/rest/v1/kds_screens?select=screen_key,label,station&location_id=eq." + loc, { headers: H, cache: "no-store" }).then((r) => r.ok ? r.json() : []),
      fetch(SUPABASE_URL + "/rest/v1/menu_app_settings?select=value&key=eq." + encodeURIComponent("kds_target_minutes:" + loc), { headers: H, cache: "no-store" }).then((r) => r.ok ? r.json() : []),
    ]).then(([r, p, tr, sc, tg]) => {
      if (!alive) return;
      setRows(r || []); setPrev(p || []); setTrend(tr || []); setScreens(sc || []); setUpdatedAt(new Date());
      if (tg && tg[0] && Number(tg[0].value) > 0) setTarget(Number(tg[0].value));
    }).catch((e) => alive && setErr("Could not load performance data: " + (e && e.message ? e.message : e) + " — if it mentions kds_ticket_times, run db/kds_perf.sql"));
    return () => { alive = false; };
  }, [loc, tick, period]); // eslint-disable-line

  const [printing, setPrinting] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  async function printSummary(lines, title) {
    setPrinting(true);
    try { await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, action: "print_kitchen_summary", data: { location_id: loc, title, lines } }) }); }
    catch {} finally { setTimeout(() => setPrinting(false), 1500); }
  }
  async function saveTarget(m) {
    const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, action: "set_kds_target", data: { location_id: loc, minutes: m } }) }).then((x) => x.json()).catch(() => ({}));
    if (r.ok) setTarget(r.minutes);
    setEditTarget(null);
  }

  const C = { ink: "#0f172a", muted: "#64748b", line: "#e2e8f0", soft: "#f1f5f9", good: "#15803d", warn: "#b45309", bad: "#b91c1c", brand: "#ec4899", goodBg: "#dcfce7", warnBg: "#fef3c7", badBg: "#fee2e2" };
  const PF = "'Poppins',sans-serif";
  if (err) return <div style={{ padding: 30, color: C.bad, fontWeight: 700 }}>{err}</div>;
  if (!rows) return <div style={{ padding: 40, color: C.muted }}>Loading figures…</div>;

  const now = Date.now();
  const T = target * 60;
  // Completion: the latest bump within 30 min of the FIRST bump on the order.
  // A screen bumping an old ticket hours later is housekeeping, not cooking,
  // and must not count — otherwise one stale-clearing screen inflates every day.
  const HOUSEKEEPING_GAP = 30 * 60 * 1000;
  const completionOf = (o) => {
    const bs = (o.bumps || []).map((b) => new Date(b.bumped_at).getTime()).filter((t) => isFinite(t)).sort((a, b) => a - b);
    if (!bs.length) return o.completed_at ? new Date(o.completed_at).getTime() : null;
    const first = bs[0];
    let last = first;
    for (const t of bs) if (t - first <= HOUSEKEEPING_GAP) last = t;
    return last;
  };
  const live = rows.map((o) => ({ ...o, _done: completionOf(o) }));
  const done = live.filter((o) => o._done != null);
  const open = period === "today" ? live.filter((o) => o._done == null) : [];
  const tt = (o) => (o._done - new Date(o.created_at)) / 1000;
  const ts = (o) => o.kds_started_at ? (new Date(o.kds_started_at) - new Date(o.created_at)) / 1000 : null;
  const times = done.map(tt);
  const starts = done.map(ts).filter((x) => x != null);
  const onTime = times.filter((x) => x <= T).length;
  const onTimePct = times.length ? Math.round(onTime / times.length * 100) : null;
  const waiting = open.map((o) => (now - new Date(o.created_at)) / 1000);
  const overNow = waiting.filter((x) => x > T).length;
  const items = live.reduce((t, o) => t + (o.item_count || 0), 0);
  const med = pct(times, 0.5);
  const pTimes = (prev || []).map((o) => ({ ...o, _done: completionOf(o) })).filter((o) => o._done != null).map(tt);
  const pAvg = avg(pTimes), pOn = pTimes.length ? Math.round(pTimes.filter((x) => x <= T).length / pTimes.length * 100) : null;
  const dAvg = pAvg != null && times.length ? avg(times) - pAvg : null;
  const grade = onTimePct == null ? null : onTimePct >= 90 ? "A" : onTimePct >= 80 ? "B" : onTimePct >= 65 ? "C" : "D";
  const gradeTone = grade === "A" || grade === "B" ? "good" : grade === "C" ? "warn" : "bad";
  const toneColor = (t) => t === "good" ? C.good : t === "warn" ? C.warn : t === "bad" ? C.bad : C.ink;

  // trend: last 14 trading days
  const trendDays = (() => {
    const m = {};
    for (const o0 of trend || []) { const o = { ...o0, _done: completionOf(o0) }; if (o._done == null) continue; const k = tradingDayStart(new Date(o.created_at)).toDateString(); (m[k] ||= { t: [], d: tradingDayStart(new Date(o.created_at)) }).t.push(tt(o)); }
    const out = []; const t0 = tradingDayStart();
    for (let i = 13; i >= 0; i--) { const d = new Date(t0.getTime() - i * 86400000); const e = m[d.toDateString()]; out.push({ d, n: e ? e.t.length : 0, avg: e ? avg(e.t) : null, on: e ? Math.round(e.t.filter((x) => x <= T).length / e.t.length * 100) : null }); }
    return out;
  })();
  // Cap the scale at 4x target so one forgotten ticket doesn't flatten the chart.
  const trendMax = Math.min(T * 4, Math.max(T * 1.5, ...trendDays.map((x) => x.avg || 0)));

  // distribution
  const buckets = [["< 5", 0, 300], ["5–10", 300, 600], ["10–15", 600, 900], ["15–20", 900, 1200], ["20–30", 1200, 1800], ["30+", 1800, Infinity]].map(([l, a, b]) => { const rs = done.filter((o) => tt(o) >= a && tt(o) < b); return { l, n: rs.length, late: a >= T, rows: rs }; });
  const bMax = Math.max(1, ...buckets.map((b) => b.n));

  // by hour
  const byHour = {};
  for (const o of live) { const h = String(new Date(o.created_at).getHours()).padStart(2, "0"); (byHour[h] ||= { n: 0, t: [], late: 0, rows: [] }); byHour[h].n++; byHour[h].rows.push(o); if (o._done != null) { const x = tt(o); byHour[h].t.push(x); if (x > T) byHour[h].late++; } }
  const hours = Object.entries(byHour).sort((a, b) => a[0].localeCompare(b[0]));
  const maxN = Math.max(1, ...hours.map(([, v]) => v.n));
  const maxT = Math.min(T * 4, Math.max(T * 1.5, ...hours.map(([, v]) => avg(v.t) || 0)));
  const peak = hours.slice().sort((a, b) => b[1].n - a[1].n)[0];
  const worst = hours.filter(([, v]) => v.t.length >= 3).sort((a, b) => (avg(b[1].t) || 0) - (avg(a[1].t) || 0))[0];

  const typeLabel = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery", collection: "Collection" };
  const pack = (k, list) => { const v = list.map(tt); return { k, n: v.length, avg: avg(v), p90: pct(v, 0.9), on: v.length ? Math.round(v.filter((x) => x <= T).length / v.length * 100) : 0, rows: list }; };
  const grp = (key) => { const m = {}; for (const o of done) { const k = key(o); (m[k] ||= []).push(o); } return Object.entries(m).map(([k, v]) => pack(k, v)).sort((a, b) => b.n - a.n); };
  const grpMulti = (keys) => { const m = {}; for (const o of done) for (const k of new Set(keys(o))) (m[k] ||= []).push(o); return Object.entries(m).map(([k, v]) => pack(k, v)).sort((a, b) => b.n - a.n); };
  const itemName = (it) => typeof it === "string" ? it : (it && it.name) || "";
  const itemCat = (it) => (it && typeof it === "object" && it.category) || "Other";
  const itemMenu = (it) => (it && typeof it === "object" && it.menu) || "Other";
  const byCategory = grpMulti((o) => (o.items || []).map(itemCat));
  const byMenu = grpMulti((o) => (o.items || []).map(itemMenu));
  // Shifts = dayparts on the 04:00 trading day.
  const SHIFTS = [["Morning", 4, 12, "04:00–12:00"], ["Afternoon", 12, 17, "12:00–17:00"], ["Evening", 17, 21, "17:00–21:00"], ["Late", 21, 28, "21:00–04:00"]];
  const shiftOf = (o) => { let h = new Date(o.created_at).getHours(); if (h < 4) h += 24; return (SHIFTS.find(([, a, b]) => h >= a && h < b) || SHIFTS[3])[0]; };
  const byShift = SHIFTS.map(([k, , , span]) => ({ ...pack(k, done.filter((o) => shiftOf(o) === k)), span })).filter((r) => r.n > 0);
  const shiftCats = (() => {
    const cats = byCategory.slice(0, 14).map((r) => r.k);
    const cell = {};
    for (const o of done) { const sh = shiftOf(o); for (const c of new Set((o.items || []).map(itemCat))) { (cell[sh + "|" + c] ||= []).push(o); } }
    return { cats, cell: Object.fromEntries(Object.entries(cell).map(([k, v]) => [k, pack(k, v)])) };
  })();
  const byType = grp((o) => typeLabel[o.order_type] || o.order_type || "Other");
  const bySource = grp((o) => o.external_channel ? String(o.external_channel) : o.tablet_no === "POS" ? "Till" : o.tablet_no === "phone" ? "Phone" : o.tablet_no === "web" ? "Web" : o.tablet_no == null ? "App" : "Tablet");
  const bySize = grp((o) => { const n = o.item_count || 0; return n <= 2 ? "1–2 items" : n <= 5 ? "3–5 items" : n <= 9 ? "6–9 items" : "10+ items"; }).sort((a, b) => a.k.localeCompare(b.k));
  const scName = (k) => { const sc = screens.find((x) => x.screen_key === k); if (!sc) return "Screen " + k; const label = sc.label || sc.station || "Screen " + k; const st = sc.station || ""; return st && sc.label && !label.toLowerCase().includes(st.toLowerCase()) ? label + " · " + st : label; };
  const byScreen = (() => { const m = {}; const rowsBy = {}; for (const o of live) { const first = Math.min(...(o.bumps || []).map((b) => new Date(b.bumped_at).getTime())); for (const b of (o.bumps || [])) { const t = new Date(b.bumped_at).getTime(); if (t - first > HOUSEKEEPING_GAP) continue; (m[b.screen_key] ||= []).push((t - new Date(o.created_at)) / 1000); (rowsBy[b.screen_key] ||= []).push(o); } } return Object.entries(m).map(([k, v]) => ({ k: scName(k), n: v.length, avg: avg(v), p90: pct(v, 0.9), on: Math.round(v.filter((x) => x <= T).length / v.length * 100), rows: rowsBy[k] })).filter((r) => r.n >= 3).sort((a, b) => b.n - a.n); })();
  const slowest = [...done].sort((a, b) => tt(b) - tt(a)).slice(0, 7);

  // ---- load vs speed: how many tickets were already open when each was placed ----
  const loadBuckets = (() => {
    // A ticket nobody ever bumped is treated as open for 90 min, not forever —
    // otherwise every later ticket looks like it joined a huge queue.
    const ev = live.map((o) => ({ c: new Date(o.created_at).getTime(), d: o._done == null ? new Date(o.created_at).getTime() + 90 * 60000 : o._done })).sort((a, b) => a.c - b.c);
    const out = { "1–2 open": [], "3–4 open": [], "5–7 open": [], "8+ open": [] };
    for (const o of done) {
      const c = new Date(o.created_at).getTime();
      const openAt = ev.filter((e) => e.c <= c && (e.d == null || e.d > c)).length; // includes itself
      const k = openAt <= 2 ? "1–2 open" : openAt <= 4 ? "3–4 open" : openAt <= 7 ? "5–7 open" : "8+ open";
      out[k].push(o);
    }
    return Object.entries(out).map(([k, v]) => pack(k, v)).filter((r) => r.n > 0);
  })();
  const maxOpen = (() => { const ev = live.map((o) => ({ c: new Date(o.created_at).getTime(), d: o._done == null ? new Date(o.created_at).getTime() + 90 * 60000 : o._done })); let m = 0, at = null; for (const o of live) { const c = new Date(o.created_at).getTime(); const n = ev.filter((e) => e.c <= c && (e.d == null || e.d > c)).length; if (n > m) { m = n; at = c; } } return { n: m, at }; })();

  // ---- items that slow tickets down (tickets containing the item vs the rest) ----
  const itemImpact = (() => {
    if (done.length < 8) return [];
    const overall = avg(times);
    const m = {};
    for (const o of done) for (const name of new Set((o.items || []).map(itemName).filter(Boolean))) (m[name] ||= []).push(o);
    return Object.entries(m).filter(([, v]) => v.length >= 4).map(([k, v]) => ({ k, n: v.length, avg: avg(v.map(tt)), delta: avg(v.map(tt)) - overall, rows: v })).sort((a, b) => b.delta - a.delta);
  })();
  const slowItems = itemImpact.filter((x) => x.delta > 120).slice(0, 6);
  const fastItems = itemImpact.filter((x) => x.delta < -120).slice(-4).reverse();

  // ---- weekday pattern (7d / 30d) ----
  const byWeekday = (() => { if (period === "today" || period === "yesterday") return []; const m = {}; for (const o of done) { const k = tradingDayStart(new Date(o.created_at)).toLocaleDateString("en-GB", { weekday: "short" }); (m[k] ||= []).push(o); } const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; return order.filter((k) => m[k]).map((k) => pack(k, m[k])); })();

  // ---- insights: plain-English findings + what to try ----
  const insights = (() => {
    const out = [];
    const push = (tone, title, body) => out.push({ tone, title, body });
    if (!times.length) return out;
    const a = avg(times), m = med;
    // 1. target realism
    const p80 = pct(times, 0.8);
    if (onTimePct != null && onTimePct < 50 && p80 > T * 1.5) { push("warn", "The target doesn't match reality", "Only " + onTimePct + "% of tickets make " + target + " min, while 8 in 10 finish within " + mmss(p80) + ". Either set the target to what you want the kitchen to hit (" + Math.ceil(p80 / 60) + " min would be ~80% on-time today) or treat " + target + " as a stretch goal and track the trend."); out[out.length - 1].action = { label: "Set target to " + Math.min(60, Math.ceil(p80 / 60)) + " min", run: () => saveTarget(Math.min(60, Math.ceil(p80 / 60))) }; }
    // 2. forgotten tickets
    const stale = done.filter((o) => tt(o) > 3600).length;
    if (stale) push("info", stale + " ticket" + (stale === 1 ? "" : "s") + " sat over an hour", "These are almost always bumps that were forgotten rather than food that took an hour. They inflate the average (" + mmss(a) + ") — the median (" + mmss(m) + ") is the truer number. Bump when the plate leaves the pass.");
    // 3. small vs large
    const small = bySize.find((r) => r.k === "1–2 items"), large = bySize.find((r) => r.k === "6–9 items" || r.k === "10+ items");
    if (small && large && small.n >= 4 && large.n >= 3 && small.avg > large.avg * 0.9) push("warn", "Small orders aren't getting out faster", "1–2 item tickets average " + mmss(small.avg) + " vs " + mmss(large.avg) + " for " + large.k + ". Drinks and desserts are queuing behind big breakfasts. Try: make single drinks/desserts as they arrive on a separate station, and bump them straight away.");
    // 4. load
    const lo = loadBuckets.find((r) => r.k === "1–2 open"), hi = loadBuckets.find((r) => r.k === "5–7 open") || loadBuckets.find((r) => r.k === "8+ open");
    if (lo && hi && lo.n >= 3 && hi.n >= 3 && hi.avg > lo.avg * 1.4) push("warn", "Speed collapses once " + hi.k.replace(" open", "") + " tickets are open", "Quiet tickets take " + mmss(lo.avg) + "; with " + hi.k + " they take " + mmss(hi.avg) + ". The kitchen's comfortable capacity is about " + (lo.k === "1–2 open" ? "3–4" : "4") + " tickets at once. Peak today was " + maxOpen.n + " open" + (maxOpen.at ? " at " + new Date(maxOpen.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "") + " — that's where a second pair of hands or pre-prep pays off.");
    else if (lo && hi && lo.n >= 3 && hi.n >= 3) push("good", "Holds up under load", "Ticket times stay close whether " + lo.k + " (" + mmss(lo.avg) + ") or " + hi.k + " (" + mmss(hi.avg) + ") — the kitchen scales well; the gains are in the baseline pace.");
    // 5. worst hour
    if (worst && peak && worst[0] !== peak[0] && avg(worst[1].t) > a * 1.3) push("info", "Slowest hour is " + worst[0] + ":00, not the busiest", "At " + worst[0] + ":00 tickets averaged " + mmss(avg(worst[1].t)) + " on " + worst[1].n + " orders, while the busiest hour (" + peak[0] + ":00, " + peak[1].n + " orders) ran " + mmss(avg(peak[1].t)) + ". That points at setup, breaks or staffing at " + worst[0] + ":00 rather than volume.");
    else if (worst && peak && worst[0] === peak[0]) push("info", "The rush is the slow point", "The busiest hour (" + peak[0] + ":00, " + peak[1].n + " orders) is also the slowest at " + mmss(avg(peak[1].t)) + ". Pre-prep the top sellers before " + peak[0] + ":00 and hold the simplest items ready.");
    // 6. items
    if (slowItems.length) push("warn", "Items that drag tickets", slowItems.slice(0, 3).map((x) => x.k + " (+" + mmss(x.delta) + ")").join(", ") + " — tickets containing these run well over the average. Check prep, portioning, or whether they're built to order when they could be part-prepped.");
    // 6a. shift
    if (byShift.length >= 2) { const sl = [...byShift].filter((r) => r.n >= 5).sort((a, b) => b.avg - a.avg); if (sl.length >= 2 && sl[0].avg > sl[sl.length - 1].avg * 1.3) push("info", sl[0].k + " shift is the slow one", sl[0].k + " (" + sl[0].span + ") averages " + mmss(sl[0].avg) + " at " + sl[0].on + "% on-time on " + sl[0].n + " tickets, against " + mmss(sl[sl.length - 1].avg) + " on " + sl[sl.length - 1].k + ". Look at that shift's staffing level and who is on the line before anything else."); }
    // 6b. category
    if (byCategory.length >= 2) { const worstCat = byCategory.filter((r) => r.n >= 4).sort((a, b) => b.avg - a.avg)[0]; const bestCat = byCategory.filter((r) => r.n >= 4).sort((a, b) => a.avg - b.avg)[0]; if (worstCat && bestCat && worstCat.k !== bestCat.k && worstCat.avg > bestCat.avg * 1.4) push("info", worstCat.k + " is the slow section", "Tickets with " + worstCat.k + " average " + mmss(worstCat.avg) + " (" + worstCat.on + "% on-time) against " + mmss(bestCat.avg) + " for " + bestCat.k + ". That section's prep and station layout are where the minutes are."); }
    // 7. takeaway vs dine-in
    const di = byType.find((r) => r.k === "Dine in"), ta = byType.find((r) => r.k === "Takeaway");
    if (di && ta && di.n >= 4 && ta.n >= 4 && ta.avg > di.avg * 1.2) push("info", "Takeaways are waiting longer than dine-in", "Takeaway " + mmss(ta.avg) + " vs dine-in " + mmss(di.avg) + ". Customers at the counter notice this most — consider calling takeaway tickets first when they're ready to go.");
    // 8. start usage
    if (starts.length === 0 && done.length >= 5) push("info", "Start isn't being used", "Without a Start tap, waiting time and cooking time are one number. Tapping Start when a ticket is picked up shows whether slow tickets are slow to begin or slow to cook.");
    // 9. trend
    const recent = trendDays.slice(-4).filter((d) => d.avg != null), earlier = trendDays.slice(0, 10).filter((d) => d.avg != null);
    if (recent.length >= 3 && earlier.length >= 4) { const ra = avg(recent.map((d) => d.avg)), ea = avg(earlier.map((d) => d.avg)); if (ra < ea * 0.85) push("good", "Getting faster", "Last few days average " + mmss(ra) + " against " + mmss(ea) + " earlier in the fortnight — keep whatever changed."); else if (ra > ea * 1.15) push("warn", "Getting slower", "Last few days average " + mmss(ra) + " against " + mmss(ea) + " earlier in the fortnight. Worth asking what changed: menu, staffing, equipment."); }
    if (!out.length) push("good", "Nothing stands out", "Ticket times are consistent across sizes, hours and load. Pushing the baseline pace is the lever now.");
    return out.slice(0, 6);
  })();
  const toneBg = (t) => t === "good" ? C.goodBg : t === "warn" ? C.badBg : "#eff6ff";
  const toneFg = (t) => t === "good" ? C.good : t === "warn" ? C.bad : "#1d4ed8";

  // ---- drill-down explorer: any number opens the tickets behind it, and the
  // subset can be sliced again (breadcrumbs), browsed by items, or exported.
  const openDrill = (title, list) => { if (!list || !list.length) return; setDrill({ stack: [{ title, rows: list }], view: "tickets", filter: "all", sort: "slowest" }); setDrillOpen({}); };
  const DrillPanel = () => {
    if (!drill || !drill.stack.length) return null;
    const cur = drill.stack[drill.stack.length - 1];
    const pushDrill = (title, rows) => { if (!rows || !rows.length) return; setDrill((d) => ({ ...d, stack: [...d.stack, { title, rows }], view: "tickets" })); setDrillOpen({}); };
    const popTo = (i) => setDrill((d) => ({ ...d, stack: d.stack.slice(0, i + 1) }));
    const base = cur.rows;
    const filtered = base.filter((o) => drill.filter === "all" ? true : drill.filter === "open" ? o._done == null : o._done != null && (drill.filter === "late" ? tt(o) > T : tt(o) <= T));
    const list = [...filtered].sort((a, b) => drill.sort === "slowest" ? ((b._done == null ? Infinity : tt(b)) - (a._done == null ? Infinity : tt(a))) : drill.sort === "newest" ? (new Date(b.created_at) - new Date(a.created_at)) : (a.order_no - b.order_no));
    const doneList = base.filter((o) => o._done != null);
    const dt = doneList.map(tt);
    const subsetAvg = avg(dt), overallAvg = avg(times);
    const fmt = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const fmtS = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const fmtD = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
    const multiDay = period === "7d" || period === "30d";
    const typeLabel2 = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery", collection: "Collection" };
    const srcOf = (o) => o.external_channel ? String(o.external_channel) : o.tablet_no === "POS" ? "Till" : o.tablet_no === "phone" ? "Phone" : o.tablet_no === "web" ? "Web" : o.tablet_no == null ? "App" : "Tablet " + o.tablet_no;
    // within-subset breakdowns (each row drills further)
    const sub = (key, multi) => { const m = {}; for (const o of doneList) { const ks = multi ? new Set(key(o)) : [key(o)]; for (const k of ks) (m[k] ||= []).push(o); } return Object.entries(m).map(([k, v]) => pack(k, v)).sort((a, b) => b.avg - a.avg); };
    const bd = {
      "Category": sub((o) => (o.items || []).map(itemCat), true),
      "Shift": sub((o) => shiftOf(o)).sort((a, b) => SHIFTS.findIndex((x) => x[0] === a.k) - SHIFTS.findIndex((x) => x[0] === b.k)),
      "Hour": sub((o) => String(new Date(o.created_at).getHours()).padStart(2, "0") + ":00").sort((a, b) => a.k.localeCompare(b.k)),
      "Type": sub((o) => typeLabel2[o.order_type] || o.order_type || "Other"),
      "Source": sub((o) => srcOf(o)),
      "Size": sub((o) => { const n = o.item_count || 0; return n <= 2 ? "1–2 items" : n <= 5 ? "3–5 items" : n <= 9 ? "6–9 items" : "10+ items"; }).sort((a, b) => a.k.localeCompare(b.k)),
      "Screen": (() => { const m = {}; for (const o of doneList) { const first = Math.min(...(o.bumps || []).map((b) => new Date(b.bumped_at).getTime())); for (const b of (o.bumps || [])) { if (new Date(b.bumped_at).getTime() - first > HOUSEKEEPING_GAP) continue; (m[scName(b.screen_key)] ||= []).push(o); } } return Object.entries(m).map(([k, v]) => pack(k, v)).sort((a, b) => b.n - a.n); })(),
    };
    // items inside the subset
    const itemRows = (() => { const m = {}; for (const o of doneList) for (const it of (o.items || [])) { const k = itemName(it); if (!k) continue; (m[k] ||= { qty: 0, rows: [], cat: itemCat(it) }); m[k].qty += Number(it.qty || 1); if (!m[k].rows.includes(o)) m[k].rows.push(o); } return Object.entries(m).map(([k, v]) => ({ k, cat: v.cat, qty: v.qty, n: v.rows.length, avg: avg(v.rows.map(tt)), rows: v.rows })).sort((a, b) => b.qty - a.qty); })();
    const exportCsv = () => {
      const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
      const head = ["order_no", "type", "source", "table", "items", "placed", "started", "completed", "ticket_secs", "on_time", "item_list", "note"];
      const lines = [head.join(",")].concat(list.map((o) => [o.order_no, typeLabel2[o.order_type] || o.order_type, srcOf(o), o.table_label || "", o.item_count, new Date(o.created_at).toISOString(), o.kds_started_at ? new Date(o.kds_started_at).toISOString() : "", o._done ? new Date(o._done).toISOString() : "", o._done ? Math.round(tt(o)) : "", o._done ? (tt(o) <= T ? "yes" : "no") : "", (o.items || []).map((it) => (it.qty > 1 ? it.qty + "x " : "") + itemName(it)).join("; "), o.customer_note || ""].map(esc).join(",")));
      const blob = new Blob([lines.join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "kitchen-" + cur.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    const Chip = ({ on, children, onClick }) => <span onClick={onClick} className="kbtn" style={{ cursor: "pointer", padding: "5px 11px", borderRadius: 8, fontSize: F(12), fontWeight: 800, background: on ? C.ink : C.soft, color: on ? "#fff" : C.muted }}>{children}</span>;
    const MiniTable = ({ rows: rs, label }) => (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 64px 56px", gap: 6, fontSize: F(10.5), fontWeight: 800, color: C.muted, letterSpacing: ".05em", padding: "0 0 4px" }}><span>{label.toUpperCase()}</span><span style={{ textAlign: "right" }}>TKTS</span><span style={{ textAlign: "right" }}>AVG</span><span style={{ textAlign: "right" }}>ON-TIME</span></div>
        {rs.map((r) => (
          <div key={r.k} onClick={() => pushDrill(label + ": " + r.k, r.rows)} className="kbtn" style={{ display: "grid", gridTemplateColumns: "1fr 44px 64px 56px", gap: 6, fontSize: F(13), padding: "6px 0", borderTop: "1px solid " + C.line, alignItems: "center", cursor: "pointer" }}>
            <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.k}</span>
            <span style={{ textAlign: "right", color: C.muted }}>{r.n}</span>
            <span style={{ textAlign: "right", fontWeight: 800, fontFamily: PF, color: r.avg > T ? C.bad : C.ink }}>{mmss(r.avg)}</span>
            <span style={{ textAlign: "right", fontWeight: 800, color: r.on >= 80 ? C.good : r.on >= 60 ? C.warn : C.bad }}>{r.on}%</span>
          </div>
        ))}
        {!rs.length && <div style={{ fontSize: F(12), color: C.muted }}>—</div>}
      </div>
    );
    return (
      <div onClick={() => setDrill(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,.35)" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(640px, 94vw)", background: "#fff", boxShadow: "-12px 0 40px rgba(0,0,0,.25)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: F(14) + "px " + F(18) + "px " + F(10) + "px", borderBottom: "1px solid " + C.line }}>
            {drill.stack.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: F(11.5), color: C.muted, marginBottom: 6 }}>
                {drill.stack.slice(0, -1).map((f, i) => <span key={i}><span onClick={() => popTo(i)} style={{ cursor: "pointer", textDecoration: "underline" }}>{f.title}</span> ›&nbsp;</span>)}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: F(17), fontWeight: 900, fontFamily: PF, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur.title}</div>
                <div style={{ fontSize: F(12.5), color: C.muted, marginTop: 3 }}>{base.length} ticket{base.length === 1 ? "" : "s"}{dt.length ? " · avg " + mmss(subsetAvg) + (overallAvg != null && base.length !== done.length ? " (" + (subsetAvg >= overallAvg ? "+" : "−") + mmss(Math.abs(subsetAvg - overallAvg)) + " vs all)" : "") + " · median " + mmss(pct(dt, 0.5)) + " · " + Math.round(dt.filter((x) => x <= T).length / dt.length * 100) + "% on-time" : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <div onClick={exportCsv} className="kbtn" title="Download these tickets as CSV" style={{ cursor: "pointer", height: 34, padding: "0 12px", borderRadius: 9, background: C.soft, display: "flex", alignItems: "center", fontWeight: 800, fontSize: F(12) }}>⇩ CSV</div>
                <div onClick={() => setDrill(null)} className="kbtn" style={{ cursor: "pointer", width: 34, height: 34, borderRadius: 9, background: C.soft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>✕</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[["tickets", "Tickets"], ["breakdown", "Breakdown"], ["items", "Items"]].map(([v, l]) => <Chip key={v} on={drill.view === v} onClick={() => setDrill((d) => ({ ...d, view: v }))}>{l}</Chip>)}
              </div>
              {drill.view === "tickets" && (
                <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                  {[["all", "All", base.length], ["late", "Late", doneList.filter((o) => tt(o) > T).length], ["ontime", "On time", doneList.filter((o) => tt(o) <= T).length], ...(period === "today" ? [["open", "Open", base.filter((o) => o._done == null).length]] : [])].map(([v, l, n]) => <Chip key={v} on={drill.filter === v} onClick={() => setDrill((d) => ({ ...d, filter: v }))}>{l} <span style={{ opacity: .6 }}>{n}</span></Chip>)}
                  <span style={{ width: 1, height: 18, background: C.line, margin: "0 4px" }} />
                  {[["slowest", "Slowest"], ["newest", "Newest"], ["number", "#"]].map(([v, l]) => <Chip key={v} on={drill.sort === v} onClick={() => setDrill((d) => ({ ...d, sort: v }))}>{l}</Chip>)}
                </div>
              )}
              {drill.view === "items" && (
                <input value={drill.q || ""} onChange={(e) => setDrill((d) => ({ ...d, q: e.target.value }))} placeholder="Search items…" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid " + C.line, fontSize: F(12.5), outline: "none", width: 180 }} />
              )}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "4px " + F(18) + "px " + F(18) + "px" }}>

            {/* ---------- BREAKDOWN ---------- */}
            {drill.view === "breakdown" && (
              <div style={{ paddingTop: 12, display: "grid", gap: 14 }}>
                {Object.entries(bd).map(([k, rs]) => {
                  if (rs.length < 2) return null;
                  const maxAvg = Math.max(1, ...rs.map((r) => r.avg || 0));
                  return (
                    <div key={k} style={{ background: C.soft, borderRadius: 14, padding: "10px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: F(10.5), fontWeight: 800, color: C.muted, letterSpacing: ".06em", marginBottom: 6 }}><span>{k.toUpperCase()}</span><span>AVG · ON-TIME</span></div>
                      {rs.map((r) => (
                        <div key={r.k} onClick={() => pushDrill(k + ": " + r.k, r.rows)} className="kbtn" style={{ cursor: "pointer", padding: "6px 0", borderTop: "1px solid #e5e9ef" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: F(13), gap: 8 }}>
                            <span style={{ fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.k} <span style={{ color: C.muted, fontWeight: 500 }}>· {r.n}</span></span>
                            <span style={{ whiteSpace: "nowrap" }}><b style={{ fontFamily: PF, color: r.avg > T ? C.bad : C.ink }}>{mmss(r.avg)}</b> <span style={{ display: "inline-block", minWidth: 36, textAlign: "center", marginLeft: 6, padding: "1px 5px", borderRadius: 5, fontSize: F(11), fontWeight: 800, background: r.on >= 80 ? C.goodBg : r.on >= 60 ? C.warnBg : C.badBg, color: r.on >= 80 ? C.good : r.on >= 60 ? C.warn : C.bad }}>{r.on}%</span></span>
                          </div>
                          <div style={{ height: 4, background: "#e5e9ef", borderRadius: 2, marginTop: 4 }}><div style={{ width: ((r.avg || 0) / maxAvg) * 100 + "%", height: "100%", borderRadius: 2, background: r.avg > T ? "#fca5a5" : "#86efac" }} /></div>
                        </div>
                      ))}
                    </div>
                  );
                })}
                <div style={{ fontSize: F(11.5), color: C.muted }}>Tap any row to narrow these tickets further.</div>
              </div>
            )}

            {/* ---------- ITEMS ---------- */}
            {drill.view === "items" && (() => {
              const q = (drill.q || "").trim().toLowerCase();
              const rows = itemRows.filter((r) => !q || r.k.toLowerCase().includes(q) || (r.cat || "").toLowerCase().includes(q));
              const overall = avg(dt);
              return (
                <div style={{ paddingTop: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 40px 72px 64px", gap: 6, fontSize: F(10.5), fontWeight: 800, color: C.muted, letterSpacing: ".05em", padding: "0 0 4px" }}><span>ITEM</span><span style={{ textAlign: "right" }}>QTY</span><span style={{ textAlign: "right" }}>TKTS</span><span style={{ textAlign: "right" }}>AVG TKT</span><span style={{ textAlign: "right" }}>VS ALL</span></div>
                  {rows.slice(0, 80).map((r) => { const d = overall == null ? null : r.avg - overall; return (
                    <div key={r.k} onClick={() => pushDrill("With " + r.k, r.rows)} className="kbtn" style={{ display: "grid", gridTemplateColumns: "1fr 40px 40px 72px 64px", gap: 6, fontSize: F(13), padding: "7px 0", borderTop: "1px solid " + C.line, alignItems: "center", cursor: "pointer" }}>
                      <span style={{ minWidth: 0 }}><div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.k}</div><div style={{ color: C.muted, fontSize: F(11) }}>{r.cat}</div></span>
                      <span style={{ textAlign: "right", fontWeight: 800 }}>{r.qty}</span>
                      <span style={{ textAlign: "right", color: C.muted }}>{r.n}</span>
                      <span style={{ textAlign: "right", fontWeight: 800, fontFamily: PF, color: r.avg > T ? C.bad : C.ink }}>{mmss(r.avg)}</span>
                      <span style={{ textAlign: "right", fontWeight: 800, fontSize: F(12), color: d == null ? C.muted : d > 60 ? C.bad : d < -60 ? C.good : C.muted }}>{d == null ? "" : (d >= 0 ? "+" : "−") + mmss(Math.abs(d))}</span>
                    </div>
                  ); })}
                  {!rows.length && <div style={{ fontSize: F(12.5), color: C.muted, padding: "12px 0" }}>{itemRows.length ? "No items match." : "No item data for these tickets."}</div>}
                </div>
              );
            })()}

            {/* ---------- TICKETS ---------- */}
            {drill.view === "tickets" && list.slice(0, 250).map((o) => {
              const open = !!drillOpen[o.order_id];
              const secs = o._done == null ? null : tt(o);
              const placed = new Date(o.created_at).getTime();
              const bumpsSorted = (o.bumps || []).slice().sort((a, b) => new Date(a.bumped_at) - new Date(b.bumped_at));
              const late = secs != null && secs > T;
              const steps = [
                { t: placed, l: "Placed", d: null },
                ...(o.kds_started_at ? [{ t: new Date(o.kds_started_at).getTime(), l: "Started", d: (new Date(o.kds_started_at).getTime() - placed) / 1000 }] : []),
                ...bumpsSorted.map((b) => { const t = new Date(b.bumped_at).getTime(); const hk = t - new Date(bumpsSorted[0].bumped_at).getTime() > HOUSEKEEPING_GAP; return { t, l: "Bumped · " + scName(b.screen_key), hk, d: (t - placed) / 1000 }; }),
              ];
              return (
                <div key={o.order_id} style={{ borderBottom: "1px solid " + C.line }}>
                  <div onClick={() => setDrillOpen((d) => ({ ...d, [o.order_id]: !open }))} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", cursor: "pointer" }}>
                    <span style={{ width: 4, alignSelf: "stretch", borderRadius: 2, background: secs == null ? C.warn : late ? C.bad : C.good, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 900, fontFamily: PF, fontSize: F(14) }}>#{o.order_no}</span>
                        <span style={{ fontSize: F(11), fontWeight: 800, padding: "1px 7px", borderRadius: 6, background: C.soft, color: C.muted }}>{(typeLabel2[o.order_type] || o.order_type || "").toUpperCase()}{o.table_label ? " " + o.table_label : ""}</span>
                        <span style={{ fontSize: F(11.5), color: C.muted }}>{srcOf(o)} · {o.item_count} item{o.item_count === 1 ? "" : "s"}</span>
                      </div>
                      <div style={{ fontSize: F(12), color: C.muted, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{multiDay ? fmtD(o.created_at) + " " : ""}{fmt(o.created_at)}{o._done ? " → " + fmt(new Date(o._done).toISOString()) : " · still open"}{o.customer_note ? " · 📝" : ""}</div>
                    </div>
                    <span style={{ fontWeight: 900, fontFamily: PF, fontVariantNumeric: "tabular-nums", fontSize: F(15), color: secs == null ? C.warn : late ? C.bad : C.good, whiteSpace: "nowrap" }}>{secs == null ? mmss((Date.now() - placed) / 1000) : mmss(secs)}</span>
                    <span style={{ color: C.muted, fontSize: F(12), transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
                  </div>
                  {open && (
                    <div style={{ padding: "0 0 14px 14px", display: "flex", flexWrap: "wrap", gap: 16 }}>
                      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                        <div style={{ fontSize: F(10.5), fontWeight: 800, color: C.muted, letterSpacing: ".06em", marginBottom: 6 }}>ITEMS</div>
                        {(o.items || []).map((it, i) => {
                          const mods = it.mods == null ? "" : Array.isArray(it.mods) ? it.mods.map((m) => (m && typeof m === "object") ? (m.name || m.label || m.option || "") : String(m)).filter(Boolean).join(", ") : typeof it.mods === "object" ? Object.values(it.mods).flat().map((m) => (m && typeof m === "object") ? (m.name || m.label || "") : String(m)).filter(Boolean).join(", ") : String(it.mods);
                          return (
                            <div key={i} style={{ padding: "5px 0", borderTop: i ? "1px solid " + C.soft : "none", fontSize: F(12.5) }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                                <span style={{ fontWeight: 700, textDecoration: it.status === "voided" ? "line-through" : "none" }}>{it.qty > 1 && <span style={{ color: C.muted }}>{it.qty}× </span>}{itemName(it)}</span>
                                <span style={{ fontSize: F(10.5), fontWeight: 800, padding: "1px 6px", borderRadius: 5, background: C.soft, color: C.muted, whiteSpace: "nowrap" }}>{itemCat(it)}</span>
                              </div>
                              {mods && <div style={{ color: C.muted, fontSize: F(11.5), marginTop: 1 }}>{mods}</div>}
                              {it.note && <div style={{ color: C.warn, fontSize: F(11.5) }}>Note: {it.note}</div>}
                            </div>
                          );
                        })}
                        {!(o.items || []).length && <div style={{ color: C.muted, fontSize: F(12.5) }}>No item data</div>}
                        {o.customer_note && <div style={{ marginTop: 8, fontSize: F(12), color: C.warn, background: "#fff7ed", borderRadius: 8, padding: "6px 8px" }}>📝 {o.customer_note}</div>}
                      </div>
                      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                        <div style={{ fontSize: F(10.5), fontWeight: 800, color: C.muted, letterSpacing: ".06em", marginBottom: 6 }}>TIMELINE</div>
                        <div style={{ position: "relative", paddingLeft: 14 }}>
                          <div style={{ position: "absolute", left: 4, top: 6, bottom: 6, width: 2, background: C.line }} />
                          {steps.map((e, i) => (
                            <div key={i} style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: F(12.5), color: e.hk ? C.muted : C.ink }}>
                              <span style={{ position: "absolute", left: -14, top: 9, width: 10, height: 10, borderRadius: "50%", background: e.d == null ? C.muted : e.hk ? "#cbd5e1" : e.d > T ? C.bad : C.good, border: "2px solid #fff" }} />
                              <span style={{ minWidth: 0 }}><span style={{ color: C.muted, fontVariantNumeric: "tabular-nums", marginRight: 6 }}>{fmtS(e.t)}</span>{e.l}{e.hk && <span style={{ color: C.muted }}> (tidy-up, ignored)</span>}</span>
                              <span style={{ fontWeight: 800, fontFamily: PF, whiteSpace: "nowrap", color: e.d == null ? C.muted : e.hk ? C.muted : e.d > T ? C.bad : C.good }}>{e.d == null ? "" : "+" + mmss(e.d)}</span>
                            </div>
                          ))}
                          {!bumpsSorted.length && o._done && <div style={{ fontSize: F(12), color: C.muted }}>Completed {fmtS(o._done)} (all screens)</div>}
                          {!bumpsSorted.length && !o._done && <div style={{ fontSize: F(12), color: C.warn }}>Not bumped yet</div>}
                        </div>
                        {steps.length > 2 && steps[1].d != null && <div style={{ fontSize: F(11.5), color: C.muted, marginTop: 8 }}>{o.kds_started_at ? "Waited " + mmss(steps[1].d) + " before Start" : "First screen cleared it at +" + mmss(steps[1].d) + (steps.length > 2 ? ", last at +" + mmss(steps.filter((x) => !x.hk).slice(-1)[0].d) : "")}</div>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {drill.view === "tickets" && list.length > 250 && <div style={{ padding: 12, color: C.muted, fontSize: F(12) }}>Showing 250 of {list.length} — use CSV for the full list.</div>}
            {drill.view === "tickets" && !list.length && <div style={{ padding: 20, color: C.muted, fontSize: F(13) }}>No tickets match this filter.</div>}
          </div>
        </div>
      </div>
    );
  };

  const Tile = ({ label, value, sub, tone, big, onClick }) => (
    <div onClick={onClick} className={onClick ? "kbtn" : undefined} style={{ background: tone === "dark" ? C.ink : "#fff", color: tone === "dark" ? "#fff" : C.ink, border: tone === "dark" ? "none" : "1px solid " + C.line, borderRadius: 18, padding: F(14) + "px " + F(16) + "px", minWidth: 0, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: F(11), fontWeight: 800, letterSpacing: ".09em", opacity: .65 }}>{label}{onClick && <span style={{ float: "right", opacity: .5 }}>›</span>}</div>
      <div style={{ fontSize: F(big ? 34 : 28), fontWeight: 900, letterSpacing: "-.025em", marginTop: 2, fontVariantNumeric: "tabular-nums", fontFamily: PF, color: tone === "dark" ? "#fff" : toneColor(tone) }}>{value}</div>
      {sub && <div style={{ fontSize: F(12), marginTop: 4, opacity: .75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
  );
  const Card = ({ title, children, right, style }) => (
    <div style={{ background: "#fff", border: "1px solid " + C.line, borderRadius: 18, padding: F(14) + "px " + F(16) + "px", minWidth: 0, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 8 }}><span style={{ fontSize: F(12), fontWeight: 800, letterSpacing: ".08em", color: C.muted }}>{title}</span>{right}</div>
      {children}
    </div>
  );
  const tp = { C, F, PF, T, onRow: (title, rows) => openDrill(title, rows) };
  const Ring = ({ value, size, stroke, color }) => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = value == null ? 0 : Math.max(0, Math.min(100, value));
    return (
      <svg width={size} height={size} style={{ display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.soft} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform={"rotate(-90 " + size / 2 + " " + size / 2 + ")"} style={{ transition: "stroke-dashoffset .6s" }} />
      </svg>
    );
  };
  const Seg = ({ value, options, onChange }) => (
    <div style={{ display: "flex", gap: 3, background: C.soft, borderRadius: 11, padding: 3 }}>
      {options.map(([v, l]) => <div key={v} onClick={() => onChange(v)} className="kbtn" style={{ padding: "7px 13px", borderRadius: 8, fontSize: F(13), fontWeight: 800, cursor: "pointer", background: value === v ? "#fff" : "transparent", color: value === v ? C.ink : C.muted, boxShadow: value === v ? "0 1px 3px rgba(0,0,0,.12)" : "none" }}>{l}</div>)}
    </div>
  );

  return (
    <div style={{ padding: F(16), display: "grid", gap: F(14) }}>
      {/* header row (sticky) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, position: "sticky", top: 0, zIndex: 5, background: "#f8fafc", margin: -F(16) + "px " + -F(16) + "px 0", padding: F(12) + "px " + F(16) + "px" }}>
        <div>
          <div style={{ fontSize: F(21), fontWeight: 900, fontFamily: PF, letterSpacing: "-.02em" }}>Kitchen performance</div>
          <div style={{ fontSize: F(12.5), color: C.muted, marginTop: 2 }}>{range.label} · trading days run 04:00–04:00 · ticket time = placed → bumped (later tidy-up bumps ignored){period === "today" ? " · live, refreshes every 30s" : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {updatedAt && <span style={{ fontSize: F(11), color: C.muted }}>updated {updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
          <div onClick={() => !printing && printSummary([
            range.label + (period === "today" ? " to " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""),
            "Tickets: " + done.length + "   Target: " + target + " min",
            "On-time: " + (onTimePct == null ? "-" : onTimePct + "%") + (grade ? "   Grade " + grade : ""),
            "Typical: " + mmss(med) + "   Average: " + mmss(avg(times)),
            "90th pct: " + mmss(pct(times, 0.9)),
            ...(peak ? ["Busiest: " + peak[0] + ":00 (" + peak[1].n + ")" + (worst ? "  Slowest: " + worst[0] + ":00 " + mmss(avg(worst[1].t)) : "")] : []),
            "",
            ...byScreen.slice(0, 4).map((r) => r.k.slice(0, 18).padEnd(18) + " " + String(r.n).padStart(4) + " " + mmss(r.avg).padStart(7) + " " + (r.on + "%").padStart(5)),
            "",
            ...insights.slice(0, 3).map((x) => "* " + x.title),
          ], "KITCHEN SPEED")} className="kbtn" style={{ cursor: "pointer", background: "#fff", border: "1px solid " + C.line, borderRadius: 11, padding: "7px 13px", fontSize: F(13), fontWeight: 800 }}>{printing ? "Printing…" : "🖨 Print"}</div>
          <Seg value={period} options={[["today", "Today"], ["yesterday", "Yesterday"], ["7d", "7 days"], ["30d", "30 days"]]} onChange={setPeriod} />
          <div onClick={() => setEditTarget(editTarget == null ? target : null)} className="kbtn" style={{ cursor: "pointer", background: "#fff", border: "1px solid " + C.line, borderRadius: 11, padding: "7px 13px", fontSize: F(13), fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.muted, fontWeight: 700 }}>Target</span> {target} min <span style={{ color: C.muted }}>✎</span>
          </div>
        </div>
      </div>
      {editTarget != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid " + C.line, borderRadius: 14, padding: "10px 14px" }}>
          <span style={{ fontSize: F(13), fontWeight: 700 }}>Target ticket time for this store</span>
          <div onClick={() => setEditTarget(Math.max(3, editTarget - 1))} className="kbtn" style={{ cursor: "pointer", width: 36, height: 36, borderRadius: 9, background: C.soft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18 }}>−</div>
          <span style={{ fontFamily: PF, fontWeight: 900, fontSize: F(22), minWidth: 70, textAlign: "center" }}>{editTarget} min</span>
          <div onClick={() => setEditTarget(Math.min(60, editTarget + 1))} className="kbtn" style={{ cursor: "pointer", width: 36, height: 36, borderRadius: 9, background: C.soft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18 }}>+</div>
          <div onClick={() => saveTarget(editTarget)} className="kbtn" style={{ cursor: "pointer", background: C.ink, color: "#fff", borderRadius: 9, padding: "8px 16px", fontWeight: 800, fontSize: F(13) }}>Save</div>
          <div onClick={() => setEditTarget(null)} className="kbtn" style={{ cursor: "pointer", color: C.muted, fontWeight: 700, fontSize: F(13), padding: "8px 6px" }}>Cancel</div>
          <span style={{ fontSize: F(12), color: C.muted, marginLeft: "auto" }}>Used for on-time %, the late colour on tickets, and the dashed line on the charts.</span>
        </div>
      )}

      {/* hero: grade ring + tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: F(14) }}>
        <div onClick={() => openDrill("Late tickets (over " + target + " min)", done.filter((o) => tt(o) > T))} className="kbtn" style={{ background: "#fff", border: "1px solid " + C.line, borderRadius: 18, padding: F(16), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}>
          <div style={{ position: "relative", width: F(130), height: F(130) }}>
            <Ring value={onTimePct} size={F(130)} stroke={F(12)} color={toneColor(gradeTone)} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: PF, fontWeight: 900, fontSize: F(30), letterSpacing: "-.03em", lineHeight: 1, color: toneColor(gradeTone) }}>{onTimePct == null ? "—" : onTimePct + "%"}</span>
              <span style={{ fontSize: F(10.5), fontWeight: 800, letterSpacing: ".08em", color: C.muted, marginTop: 4 }}>ON-TIME</span>
            </div>
          </div>
          <div style={{ fontFamily: PF, fontWeight: 900, fontSize: F(15), color: toneColor(gradeTone) }}>{grade ? "Grade " + grade : "No tickets yet"}</div>
          <div style={{ fontSize: F(12), color: C.muted, textAlign: "center" }}>{onTime} of {times.length} within {target} min{pOn != null ? " · prev " + pOn + "%" : ""}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: F(10) }}>
          <Tile onClick={() => openDrill("All completed tickets", done)} big label="AVG TICKET" value={mmss(avg(times))} tone="dark" sub={dAvg == null ? (pAvg != null ? "prev " + mmss(pAvg) : "—") : (dAvg <= 0 ? "▼ " : "▲ ") + mmss(Math.abs(dAvg)) + " vs prev " + mmss(pAvg)} />
          <Tile onClick={() => openDrill("All completed tickets", done)} label="TYPICAL (MEDIAN)" value={mmss(med)} sub="half of tickets faster than this" tone={med != null && med > T ? "bad" : "good"} />
          <Tile onClick={() => openDrill("Slowest 10% of tickets", done.filter((o) => tt(o) >= (pct(times, 0.9) || 0)))} label="90TH PERCENTILE" value={mmss(pct(times, 0.9))} sub={starts.length ? "time to start avg " + mmss(avg(starts)) : "9 in 10 faster than this"} tone={pct(times, 0.9) != null && pct(times, 0.9) > T ? "bad" : undefined} />
          <Tile onClick={() => openDrill("All tickets", live)} label="TICKETS" value={String(done.length)} sub={items + " items · " + (done.length ? (items / Math.max(1, live.length)).toFixed(1) + " per ticket" : "")} />
          {period === "today"
            ? <Tile onClick={() => openDrill("Waiting now", open)} label="WAITING NOW" value={String(open.length)} tone={overNow ? "bad" : open.length ? "warn" : "good"} sub={overNow ? overNow + " over target · oldest " + mmss(Math.max(0, ...waiting)) : open.length ? "oldest " + mmss(Math.max(0, ...waiting)) : "kitchen clear"} />
            : <Tile onClick={() => openDrill("Late tickets", done.filter((o) => tt(o) > T))} label="LATE TICKETS" value={String(times.length - onTime)} tone={times.length - onTime ? "bad" : "good"} sub={times.length ? Math.round((times.length - onTime) / times.length * 100) + "% of tickets" : ""} />}
        </div>
      </div>

      {/* insights */}
      <Card title="WHAT THE NUMBERS SAY" right={<span style={{ fontSize: F(11), color: C.muted }}>findings and what to try · recalculated with the data</span>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + Math.min(3, Math.max(1, insights.length)) + ", 1fr)", gap: F(10) }}>
          {insights.map((x, i) => (
            <div key={i} style={{ background: toneBg(x.tone), borderRadius: 14, padding: F(12) + "px " + F(14) + "px" }}>
              <div style={{ fontSize: F(13.5), fontWeight: 800, color: toneFg(x.tone), fontFamily: PF }}>{x.title}</div>
              <div style={{ fontSize: F(12.5), color: C.ink, marginTop: 4, lineHeight: 1.45 }}>{x.body}</div>
              {x.action && <div onClick={x.action.run} className="kbtn" style={{ display: "inline-block", marginTop: 8, padding: "6px 12px", borderRadius: 8, background: "#fff", border: "1px solid " + C.line, fontSize: F(12), fontWeight: 800, cursor: "pointer" }}>{x.action.label}</div>}
            </div>
          ))}
          {!insights.length && <div style={{ fontSize: F(13), color: C.muted }}>Findings appear once there are completed tickets.</div>}
        </div>
      </Card>

      {/* trend + distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: F(14) }}>
        <Card title="14-DAY TREND" right={<span style={{ fontSize: F(11), color: C.muted }}>avg ticket time per day · dashed = target · badge = on-time</span>}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: F(140), position: "relative", paddingBottom: F(30) }}>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: F(30) + (T / trendMax) * F(100), borderTop: "1.5px dashed " + C.warn, opacity: .7 }} />
            {trendDays.map((d, i) => {
              const h = d.avg == null ? 0 : (Math.min(d.avg, trendMax) / trendMax) * F(100);
              const isToday = i === trendDays.length - 1;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", minWidth: 0 }} title={d.d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + " · " + d.n + " tickets · avg " + mmss(d.avg) + (d.on != null ? " · " + d.on + "% on-time" : "")}>
                  {d.avg != null && <span style={{ fontSize: F(9.5), fontWeight: 800, color: d.avg > T ? C.bad : C.muted, marginBottom: 2 }}>{mmss(d.avg)}</span>}
                  <div style={{ width: "72%", height: Math.max(d.avg == null ? 0 : 3, h), background: d.avg == null ? "transparent" : d.avg > T ? "#fca5a5" : isToday ? C.ink : "#94a3b8", borderRadius: 4, transition: "height .4s" }} />
                  <div style={{ position: "absolute", bottom: 0, textAlign: "center" }}>
                    <div style={{ fontSize: F(10), color: isToday ? C.ink : C.muted, fontWeight: isToday ? 900 : 600 }}>{d.d.toLocaleDateString("en-GB", { weekday: "narrow" })}</div>
                    {d.on != null && <div style={{ fontSize: F(9), fontWeight: 800, color: d.on >= 80 ? C.good : d.on >= 60 ? C.warn : C.bad }}>{d.on}%</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="TICKET TIME SPREAD" right={<span style={{ fontSize: F(11), color: C.muted }}>minutes</span>}>
          {buckets.map((b) => (
            <div key={b.l} onClick={() => openDrill("Tickets " + b.l + " min", b.rows)} className="kbtn" style={{ display: "grid", gridTemplateColumns: "54px 1fr 44px", gap: 10, alignItems: "center", padding: "5px 0", cursor: b.n ? "pointer" : "default" }}>
              <span style={{ fontSize: F(13), fontWeight: 700, color: b.late ? C.bad : C.ink, fontVariantNumeric: "tabular-nums" }}>{b.l}</span>
              <div style={{ height: F(12), background: C.soft, borderRadius: 6, overflow: "hidden" }}><div style={{ width: (b.n / bMax) * 100 + "%", height: "100%", background: b.late ? "#fca5a5" : "#86efac", borderRadius: 6, transition: "width .4s" }} /></div>
              <span style={{ fontSize: F(13), fontWeight: 800, textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.muted }}>{b.n}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* by hour + slowest */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: F(14) }}>
        <Card title="BY HOUR" right={<span style={{ fontSize: F(11), color: C.muted }}>{peak ? "busiest " + peak[0] + ":00 (" + peak[1].n + ")" : ""}{worst ? " · slowest " + worst[0] + ":00 (" + mmss(avg(worst[1].t)) + ")" : ""}</span>}>
          <div style={{ position: "relative", height: F(150) }}>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: F(18), height: F(120), borderBottom: "1px solid " + C.line }}>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: (T / maxT) * 100 + "%", borderTop: "1.5px dashed " + C.warn, opacity: .7 }} />
            </div>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 4, padding: "0 2px " + F(18) + "px" }}>
              {hours.map(([h, v]) => {
                const a = avg(v.t);
                return (
                  <div key={h} onClick={() => openDrill(h + ":00 – " + h + ":59", v.rows)} className="kbtn" style={{ flex: 1, position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", minWidth: 0, cursor: "pointer" }} title={h + ":00 · " + v.n + " tickets · avg " + mmss(a) + (v.late ? " · " + v.late + " late" : "")}>
                    {a != null && <div style={{ position: "absolute", bottom: (Math.min(a, maxT) / maxT) * F(120) - 4, width: 10, height: 10, borderRadius: "50%", background: a > T ? C.bad : C.ink, border: "2px solid #fff", zIndex: 2 }} />}
                    <div style={{ width: "70%", height: (v.n / maxN) * F(110), background: v.late ? "#fecaca" : "#cbd5e1", borderRadius: 4 }} />
                    <span style={{ position: "absolute", bottom: 0, fontSize: F(10), color: C.muted }}>{h}</span>
                  </div>
                );
              })}
              {!hours.length && <div style={{ color: C.muted, fontSize: F(13) }}>No orders in this period</div>}
            </div>
          </div>
        </Card>
        <Card title="SLOWEST TICKETS">
          {slowest.map((o) => (
            <div key={o.order_id} onClick={() => { openDrill("Ticket #" + o.order_no, [o]); setTimeout(() => setDrillOpen({ [o.order_id]: true }), 0); }} className="kbtn" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderTop: "1px solid " + C.line, fontSize: F(13.5), cursor: "pointer" }}>
              <span><b>#{o.order_no}</b> <span style={{ color: C.muted }}>{typeLabel[o.order_type] || o.order_type} · {o.item_count} items · {new Date(o.created_at).toLocaleString("en-GB", period === "today" || period === "yesterday" ? { hour: "2-digit", minute: "2-digit" } : { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span></span>
              <span style={{ fontWeight: 900, fontVariantNumeric: "tabular-nums", fontFamily: PF, color: tt(o) > T ? C.bad : C.ink }}>{mmss(tt(o))}</span>
            </div>
          ))}
          {!slowest.length && <div style={{ fontSize: F(13), color: C.muted }}>No completed tickets</div>}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: byWeekday.length ? "1fr 1fr 1fr" : "1fr 1fr", gap: F(14) }}>
        <Card title="LOAD VS SPEED" right={<span style={{ fontSize: F(11), color: C.muted }}>tickets already open when placed{maxOpen.n ? " · peak " + maxOpen.n : ""}</span>}>
          <PerfTable {...tp} rows={loadBuckets} label="QUEUE" />
        </Card>
        <Card title="ITEMS THAT SLOW TICKETS" right={<span style={{ fontSize: F(11), color: C.muted }}>vs overall avg · min 4 tickets</span>}>
          {slowItems.length ? slowItems.map((x) => (
            <div key={x.k} onClick={() => openDrill("Tickets with " + x.k, x.rows)} className="kbtn" style={{ display: "grid", gridTemplateColumns: "1fr 40px 64px 64px", gap: 6, fontSize: F(13.5), padding: "7px 0", borderTop: "1px solid " + C.line, alignItems: "center", cursor: "pointer" }}>
              <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.k}{x.rows && x.rows[0] && (() => { const it = (x.rows[0].items || []).find((i) => itemName(i) === x.k); return it ? <span style={{ color: C.muted, fontWeight: 500, fontSize: F(11.5) }}> · {itemCat(it)}</span> : null; })()}</span>
              <span style={{ textAlign: "right", color: C.muted, fontVariantNumeric: "tabular-nums" }}>{x.n}</span>
              <span style={{ textAlign: "right", fontWeight: 800, fontFamily: PF, fontVariantNumeric: "tabular-nums" }}>{mmss(x.avg)}</span>
              <span style={{ textAlign: "right", fontWeight: 800, color: C.bad, fontVariantNumeric: "tabular-nums" }}>+{mmss(x.delta)}</span>
            </div>
          )) : <div style={{ fontSize: F(13), color: C.muted }}>{done.length < 8 ? "Needs more completed tickets" : "No item adds more than 2 min over the average"}</div>}
          {fastItems.length > 0 && <div style={{ fontSize: F(11.5), color: C.muted, marginTop: 8 }}>Quickest: {fastItems.map((x) => x.k + " (" + mmss(x.delta) + ")").join(", ")}</div>}
        </Card>
        {byWeekday.length > 0 && <Card title="BY WEEKDAY"><PerfTable {...tp} rows={byWeekday} label="DAY" /></Card>}
      </div>

      {/* shifts */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) 2fr", gap: F(14) }}>
        <Card title="BY SHIFT" right={<span style={{ fontSize: F(11), color: C.muted }}>dayparts on the 04:00 trading day</span>}>
          <div style={{ display: "grid", gap: 8 }}>
            {byShift.map((r) => (
              <div key={r.k} onClick={() => openDrill(r.k + " shift (" + r.span + ")", r.rows)} className="kbtn" style={{ cursor: "pointer", borderRadius: 14, padding: "10px 12px", background: r.on >= 80 ? C.goodBg : r.on >= 60 ? C.warnBg : C.badBg }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span><b style={{ fontFamily: PF, fontSize: F(14) }}>{r.k}</b> <span style={{ fontSize: F(11), color: C.muted }}>{r.span}</span></span>
                  <span style={{ fontWeight: 900, fontFamily: PF, fontSize: F(18), color: r.on >= 80 ? C.good : r.on >= 60 ? C.warn : C.bad }}>{r.on}%</span>
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: F(12), color: C.muted, marginTop: 4 }}>
                  <span>{r.n} tickets</span><span>avg <b style={{ color: C.ink, fontFamily: PF }}>{mmss(r.avg)}</b></span><span>p90 <b style={{ color: C.ink, fontFamily: PF }}>{mmss(r.p90)}</b></span>
                  <span>{Math.round(r.n / Math.max(1, (period === "today" || period === "yesterday") ? 1 : period === "7d" ? 7 : 30))}/day</span>
                </div>
              </div>
            ))}
            {!byShift.length && <div style={{ fontSize: F(13), color: C.muted }}>No completed tickets</div>}
          </div>
        </Card>
        <Card title="CATEGORY × SHIFT" right={<span style={{ fontSize: F(11), color: C.muted }}>avg ticket time · colour = on-time · tap a cell</span>}>
          {shiftCats.cats.length ? (
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1.4fr) repeat(" + byShift.length + ", minmax(84px, 1fr))", gap: 4, fontSize: F(12.5), minWidth: 420 }}>
                <span />
                {byShift.map((sh) => <span key={sh.k} style={{ fontSize: F(10.5), fontWeight: 800, color: C.muted, letterSpacing: ".05em", textAlign: "center", paddingBottom: 4 }}>{sh.k.toUpperCase()}</span>)}
                {shiftCats.cats.map((c) => (
                  <React.Fragment key={c}>
                    <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", alignSelf: "center" }}>{c}</span>
                    {byShift.map((sh) => {
                      const cl = shiftCats.cell[sh.k + "|" + c];
                      if (!cl || cl.n < 2) return <span key={sh.k} style={{ textAlign: "center", color: "#cbd5e1", padding: "6px 0" }}>·</span>;
                      const bg = cl.on >= 80 ? C.goodBg : cl.on >= 60 ? C.warnBg : cl.on >= 35 ? "#fee2e2" : "#fecaca";
                      return (
                        <span key={sh.k} onClick={() => openDrill(sh.k + " · " + c, cl.rows)} className="kbtn" title={cl.n + " tickets · " + cl.on + "% on-time · p90 " + mmss(cl.p90)} style={{ cursor: "pointer", textAlign: "center", padding: "6px 4px", borderRadius: 8, background: bg }}>
                          <div style={{ fontWeight: 800, fontFamily: PF, color: cl.avg > T ? C.bad : C.ink }}>{mmss(cl.avg)}</div>
                          <div style={{ fontSize: F(10), color: C.muted }}>{cl.n} · {cl.on}%</div>
                        </span>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ) : <div style={{ fontSize: F(13), color: C.muted }}>Needs item data — run db/kds_perf.sql if categories are empty.</div>}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: F(14) }}>
        <Card title="BY CATEGORY" right={<span style={{ fontSize: F(11), color: C.muted }}>tickets containing an item from the category · tap a row for the tickets</span>}>{done.length && !done.some((o) => (o.items || []).length) ? <div style={{ fontSize: F(13), color: C.warn }}>Item data isn't coming through — run the latest db/kds_perf.sql in Supabase.</div> : <PerfTable {...tp} rows={byCategory} label="CATEGORY" limit={12} sortable />}</Card>
        <Card title="BY MENU"><PerfTable {...tp} rows={byMenu} label="MENU" sortable /></Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: F(14) }}>
        <Card title="BY SCREEN"><PerfTable {...tp} rows={byScreen} label="SCREEN" /></Card>
        <Card title="BY ORDER TYPE"><PerfTable {...tp} rows={byType} label="TYPE" /></Card>
        <Card title="BY SOURCE"><PerfTable {...tp} rows={bySource} label="SOURCE" /></Card>
        <Card title="BY TICKET SIZE"><PerfTable {...tp} rows={bySize} label="SIZE" /></Card>
      </div>
      <DrillPanel />
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ textAlign: "center", lineHeight: 1.1 }}>
      <div style={{ fontWeight: 800, fontSize: 17, color: accent || "#fff", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
    </div>
  );
}
