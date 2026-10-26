import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ingredientsFromDescription } from "./ingredients.js";
import { OrdersList, OrderDetailPanel } from "./OrdersStrip.jsx";
import ServiceFeedback from "./ServiceFeedback.jsx";
import { deviceToken } from "./device.js";
import { sendCustomerScreen, orderForScreen } from "./customerScreen.js";
import CartLine from "./CartLine.jsx";
import ShiftSheet from "./ShiftSheet.jsx";
import ManagerPin from "./ManagerPin.jsx";
import CashSheet from "./CashSheet.jsx";
import StockSheet from "./StockSheet.jsx";
import { Sheet, PinPanel, Btn, Btn as TBtn, Err as TillErr, Icon as TillIcon, U, FONT, NUM, Label as TLabel, Note as TNote, Stat, Verdict, Field, Keypad, DenomTile, DoneMark, Instruction, Skeleton, Receipt, CheckChip } from "./TillUI.jsx";
import PrintersModal from "./PrintersModal.jsx";
import { StripTools } from "./TillHeader.jsx";
// Currency, cash-up denominations and the variance threshold all follow the
// store this till is serving — see src/money.js. A store with no currency
// setting is GBP, which is exactly what every till did before.
import { money as gbp, currencySymbol, denominations, denomLabel, varianceNoteFrom, setActiveCurrency } from "./money.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };

const CUR_KEY = "pos_currency_";

// Category icon + gradient fallback (used when an item has no photo).
const CAT_ICONS = [
  { k: ["dessert", "kanafeh", "cake", "sweet"], icon: "🍨", grad: "linear-gradient(140deg,#fce1d0,#eba97b)" },
  { k: ["matcha", "tea"], icon: "🍵", grad: "linear-gradient(140deg,#e4eac7,#acc771)" },
  { k: ["coffee", "latte", "espresso"], icon: "☕", grad: "linear-gradient(140deg,#edd7c3,#cc9e71)" },
  { k: ["shake", "smoothie"], icon: "🥤", grad: "linear-gradient(140deg,#f9ebd1,#e1b56f)" },
  { k: ["mocktail", "drink", "juice", "lemon"], icon: "🍹", grad: "linear-gradient(140deg,#fde0ea,#f4a0c0)" },
  { k: ["hot", "cocoa", "chocolate"], icon: "🍫", grad: "linear-gradient(140deg,#eac6a3,#b97b4e)" },
];
function fallbackFor(name = "", cat = "") {
  const hay = (name + " " + cat).toLowerCase();
  for (const c of CAT_ICONS) if (c.k.some((w) => hay.includes(w))) return c;
  return { icon: "🍽", grad: "linear-gradient(140deg,#f6eedc,#dec89d)" };
}

// Top-level menu icons — same set the customer tablet uses in its bottom nav.
function menuIcon(name, active) {
  const c = active ? "#fff" : "currentColor";
  const p = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: 2.3, strokeLinecap: "round", strokeLinejoin: "round" };
  const n = (name || "").toLowerCase();
  // Round waffle — the old dome read as nothing in particular.
  if (n.includes("dessert") || n.includes("cake") || n.includes("sweet"))
    return <svg {...p}><circle cx="12" cy="12.6" r="8" /><path d="M4.6 9.4h14.8M4.6 15.8h14.8M8.8 4.9v15.4M15.2 4.9v15.4" /></svg>;
  // Toast — the one shape common to most of an all-day breakfast menu. The old
  // fried egg read as a camera lens with a handle.
  if (n.includes("breakfast") || n.includes("brunch") || n.includes("egg"))
    return <svg {...p}><path d="M5.6 9.4c0-2.6 2.9-4.6 6.4-4.6s6.4 2 6.4 4.6v8.4a1.8 1.8 0 0 1-1.8 1.8H7.4a1.8 1.8 0 0 1-1.8-1.8Z" /><path d="M8.9 12.4h6.2M8.9 15.6h4" /></svg>;
  // Fork and knife — the old dome had two floating strokes above it that read
  // as nothing at all.
  if (n.includes("dinner") || n.includes("main") || n.includes("meal"))
    return <svg {...p}><path d="M4 4v5a2.5 2.5 0 0 0 5 0V4" /><path d="M6.5 4v16" /><path d="M17.5 4c-1.8 0-2.8 2-2.8 4.6 0 2.2 1 3.4 2.8 3.4" /><path d="M17.5 4v16" /></svg>;
  // Takeaway cup with a domed lid and straw, rather than a plain tub.
  if (n.includes("cold") || n.includes("iced") || n.includes("juice") || n.includes("soft") || n.includes("shake") || n.includes("drink") || n.includes("mocktail"))
    return <svg {...p}><path d="M7.5 8.5h9l-1 11a1 1 0 0 1-1 .9h-5a1 1 0 0 1-1-.9Z" /><path d="M9.8 8.5V5.2a2.2 2.2 0 0 1 4.4 0v3.3" /><path d="M7 12h10" /></svg>;
  if (n.includes("hot") || n.includes("coffee") || n.includes("tea") || n.includes("latte") || n.includes("chocolate") || n.includes("matcha"))
    return <svg {...p}><path d="M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 10h2a2 2 0 0 1 0 4h-2M8 3c-.4 1 .4 2 0 3M12 3c-.4 1 .4 2 0 3" /></svg>;
  // A child, rather than the old shape that read as a table lamp.
  if (n.includes("kid") || n.includes("child"))
    return <svg {...p}><circle cx="12" cy="7" r="3.6" /><path d="M5.5 20.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /><path d="M9.6 6.2c.5.6 1.4.6 1.9 0M13.1 6.2c.5.6 1.4.6 1.9 0" /></svg>;
  return <svg {...p}><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4M17 3v18" /></svg>;
}

// Realistic order-type / source icons for the cart header + pickers.
const posIco = {
  takeaway: (s = 20, c = "#fff") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-1 12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /><path d="M9 12h6" /></svg>),
  dinein: (s = 20, c = "#fff") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3v7a2 2 0 0 0 4 0V3M7 10v11" /><path d="M17 3c-1.5 0-2.5 2-2.5 4.5S15.5 12 17 12v9" /></svg>),
  table: (s = 20, c = "#fff") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h18M4 10l1 4M20 10l-1 4M5 6h14a1 1 0 0 1 1 1v3H4V7a1 1 0 0 1 1-1ZM7 14v4M17 14v4" /></svg>),
  tablet: (s = 20, c = "#5E7A4D") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="10" y1="18" x2="14" y2="18" /></svg>),
  phone: (s = 20, c = "#5E7A4D") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h3l2 5-2 1a12 12 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z" /></svg>),
  web: (s = 20, c = "#5E7A4D") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><line x1="3" y1="12" x2="21" y2="12" /><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" /></svg>),
};

// ===========================================================================
// Full POS screen (large tablet, landscape). Light theme.
// Three zones: category rail · item grid · order ticket.
// Reuses store_menu_full (menu), place-order (print + KDS), admin-api mark_paid.
// ===========================================================================
// ── TOUCH FEEDBACK ──────────────────────────────────────────────────────────
// A till button that does not visibly move gives no sense of having been
// pressed, so staff double-tap or press harder. Three things fix that:
//
//   1. a press state — the tile shrinks and darkens while held, so the finger
//      sees the button react under it;
//   2. a short vibration on contact — confirms activation without needing to
//      watch the screen, which is the point during a rush;
//   3. removing the browser's 300ms tap delay and its grey flash, which make
//      a web app feel slower and cheaper than a native till.
//
// Feedback fires on POINTER DOWN, not on click: it must land the instant the
// finger touches, before any work happens.
const TAP_CSS = `
.cb-tap {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
  transition: transform 90ms cubic-bezier(.2,.8,.3,1), filter 90ms ease, box-shadow 90ms ease;
}
.cb-tap:active {
  transform: scale(.965);
  filter: brightness(.93) saturate(1.05);
}
.cb-tap-lift:active {
  transform: scale(.97) translateY(1px);
  box-shadow: inset 0 2px 6px rgba(0,0,0,.13);
}
@media (prefers-reduced-motion: reduce) {
  .cb-tap, .cb-tap-lift { transition: none; }
  .cb-tap:active, .cb-tap-lift:active { transform: none; }
}
`;

// 8ms is a tick, not a buzz — enough to feel, short enough to use hundreds of
// times a shift without becoming irritating. Silently absent on iPad, which
// does not expose the vibration API to web apps.
function tapFeedback() {
  try { if (navigator.vibrate) navigator.vibrate(8); } catch { /* not supported */ }
}


// Pull the components of a dish out of its menu description so the kitchen-note
// chips say "No mushrooms" rather than a generic "No onion".
// "Two eggs any style, served with mushrooms, hash browns & baked beans" →
// ["eggs", "mushrooms", "hash browns", "baked beans"]
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function POS({ loc, storeToken, tablesList = [], barTeam = null, barKit = null, textSize = "M", bare = false }) {
  const [cats, setCats] = useState(null);   // masters: [{id,name,subs:[{id,name,items:[...]}]}]
  const [activeCat, setActiveCat] = useState(0);   // master index
  const [activeSub, setActiveSub] = useState(0);   // subcategory index within active master
  const [search, setSearch] = useState("");
  const [merges, setMerges] = useState([]);        // [{id,menu_id,new_name,category_ids:[catId..]}]
  const [showMerge, setShowMerge] = useState(false); // merge editor popup
  const [ticket, setTicket] = useState([]);
  const [table, setTable] = useState(null);
  const [appendTo, setAppendTo] = useState(null); // order id we're adding to

  // ── Cart persistence (survives refresh / accidental reload / crash) ──
  // The in-progress ticket is mirrored to localStorage so a refresh never
  // loses a half-built order — the #1 reliability expectation for a POS.
  // Keyed per device/location so two tablets never share a draft.
  const CART_KEY = "pos_cart_" + (loc || storeToken || "default");
  const cartHydrated = useRef(false);
  // Restore any saved draft once, on first mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const fresh = saved && saved.at && (Date.now() - saved.at) < 12 * 60 * 60 * 1000;
        if (fresh && Array.isArray(saved.ticket) && saved.ticket.length) {
          setTicket(saved.ticket);
          if (saved.table) setTable(saved.table);
          if (saved.appendTo) setAppendTo(saved.appendTo);
        }
      }
    } catch { /* ignore corrupt draft */ }
    cartHydrated.current = true;
  }, []); // eslint-disable-line
  // Persist on every change (after the initial hydrate, so we don't clobber it).
  useEffect(() => {
    if (!cartHydrated.current) return;
    try {
      if (ticket.length) {
        localStorage.setItem(CART_KEY, JSON.stringify({ ticket, table, appendTo, at: Date.now() }));
      } else {
        localStorage.removeItem(CART_KEY); // empty cart → clear the draft
      }
    } catch { /* storage full / disabled — non-fatal */ }
  }, [ticket, table]); // eslint-disable-line
  const [modItem, setModItem] = useState(null);
  const [modSel, setModSel] = useState({});
  const [modNote, setModNote] = useState("");     // per-item kitchen note in the sheet
  const [editKey, setEditKey] = useState(null);   // cart line being edited (null = adding new)
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [placed, setPlaced] = useState(null);
  const [payMethod, setPayMethod] = useState(null);
  const [payPin, setPayPin] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  // ---- Orders mode (New order | Orders) ----
  const DEFAULT_KEY = "pos_default_view"; // per-device preference
  const [mode, setMode] = useState("new"); // new | orders
  const [defaultView, setDefaultView] = useState(() => {
    try { return localStorage.getItem(DEFAULT_KEY) || "new"; } catch { return "new"; }
  });
  const [orders, setOrders] = useState(null);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [selOrderId, setSelOrderId] = useState(null); // order tapped → shows in right panel
  const [selPayNow, setSelPayNow] = useState(false);  // opened via "Pay now" → jump to payment
  const [showTablePicker, setShowTablePicker] = useState(false); // table picker sheet
  const [orderKind, setOrderKind] = useState("takeaway"); // takeaway | dinein | phone | web
  const [orderNote, setOrderNote] = useState(""); // order-level instructions
  const [payNowOrder, setPayNowOrder] = useState(null); // locally-built order for instant panel
  // The basket as it was when "Pay" was pressed. Pay creates the order on
  // hold and empties the basket; if the pay screen is then closed without
  // any money taken, this goes back into the basket and the hold is
  // cancelled, instead of leaving an invisible unpaid order on the KDS.
  const payDraft = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [posPin, setPosPin] = useState(""); // PIN captured once for order actions
  const [feedbackFor, setFeedbackFor] = useState(null); // order → FOH feedback sheet

  // On first mount, honour the saved default view for this tablet.
  useEffect(() => { setMode(defaultView === "orders" ? "orders" : "new"); }, []); // eslint-disable-line

  // ORIENTATION 2026-10-26 — the till is laid out for landscape. A tablet whose
  // home-screen app was installed from the menu page (or from /activate, which
  // gets the menu's manifest) is locked to portrait by that app, and turning
  // the tablet does nothing (Zahia). Ask for landscape: an installed or
  // fullscreen app may grant it; a plain browser tab ignores it, harmlessly.
  useEffect(() => {
    const lock = () => {
      try { const o = window.screen && window.screen.orientation; if (o && o.lock) o.lock("landscape").catch(() => {}); } catch { /* not supported */ }
    };
    lock();
    document.addEventListener("fullscreenchange", lock);
    document.addEventListener("visibilitychange", lock);
    return () => { document.removeEventListener("fullscreenchange", lock); document.removeEventListener("visibilitychange", lock); };
  }, []);
  // Tick for live elapsed-time colouring in the orders list.
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);

  // Currency for this store. money() keeps the active code in module state, so
  // nothing re-renders on its own — hence the bump. The last answer is cached
  // per store because the fetch is async and a till that reloads mid-service
  // would otherwise paint pounds for a frame. No setting at all means GBP.
  const [, bumpCur] = useState(0);
  useEffect(() => {
    if (!loc) return;
    let gone = false;
    try {
      const cached = localStorage.getItem(CUR_KEY + loc);
      if (cached) { setActiveCurrency(cached); bumpCur((n) => n + 1); }
    } catch { /* private mode — fall through to the fetch */ }
    fetch(SUPABASE_URL + "/rest/v1/menu_app_settings?select=value&key=eq." + encodeURIComponent("currency:" + loc), { headers: H })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (gone) return;
        const code = (rows && rows[0] ? String(rows[0].value || "") : "").trim().toUpperCase() || "GBP";
        setActiveCurrency(code);
        try { localStorage.setItem(CUR_KEY + loc, code); } catch { /* ignore */ }
        bumpCur((n) => n + 1);
      })
      .catch(() => { /* keep whatever was cached rather than blanking prices */ });
    return () => { gone = true; };
  }, [loc]);

  function setDefault(v) {
    setDefaultView(v);
    try { localStorage.setItem(DEFAULT_KEY, v); } catch { /* ignore */ }
  }

  const ordersReqRef = useRef(0);
  async function loadOrders() {
    const myReq = ++ordersReqRef.current;
    setOrdersBusy(true);
    try {
      const url = SUPABASE_URL + "/rest/v1/menu_orders?select=id,order_no,discount_amount,discount_type,discount_value,discount_reason,refund_total,refund_reason,tablet_no,table_id,order_type,pickup_name,customer_note,print_failed,print_error,total,paid_method,paid_amount,amount_paid,is_split,created_at,status,menu_tables(label),menu_order_items(id,item_id,name_snapshot,qty,price_snapshot,modifiers_snapshot,line_total,note,menu_items(image_url))"
        + (loc ? "&location_id=eq." + loc : "")
        + "&closed_at=is.null&order=created_at.desc&limit=200";
      const r = await fetch(url, { headers: H });
      const data = r.ok ? await r.json() : [];
      // Ignore a response that is no longer the latest request in flight — this
      // prevents a slow/stale poll from overwriting fresher state (e.g. clobbering
      // a just-paid order back to unpaid).
      if (myReq === ordersReqRef.current) setOrders(data);
    } catch { if (myReq === ordersReqRef.current) setOrders([]); } finally { setOrdersBusy(false); }
  }
  // Orders strip is always visible — load on mount and refresh every 20s.
  useEffect(() => {
    loadOrders();
    const id = setInterval(loadOrders, 20000);
    return () => clearInterval(id);
  }, [loc]); // eslint-disable-line

  // Order action handlers (reuse admin-api actions).
  async function ordAction(action, dataObj) {
    setOrdersBusy(true);
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pos: true, device: deviceToken(), action, data: dataObj }),
      });
      await loadOrders();
      return r.ok;
    } catch { return false; } finally { setOrdersBusy(false); }
  }
  // Like ordAction but returns the parsed JSON (for payment flows that need
  // the running balance back).
  async function ordActionJson(action, dataObj) {
    setOrdersBusy(true);
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pos: true, device: deviceToken(), action, data: dataObj }),
      });
      const j = await r.json().catch(() => ({}));
      await loadOrders();
      return { ok: r.ok, ...j };
    } catch { return { ok: false }; } finally { setOrdersBusy(false); }
  }
  // ---- No sale: open the cash drawer for change or the float ----
  // PIN-gated, and the server logs who opened it against the device. An
  // unlogged drawer button is how cash leaves without a trace.
  const [drawerAsk, setDrawerAsk] = useState(null); // null | { pin, busy, err }
  // A manager PIN for: undoing a payment, printing an X read (ManagerPin sheet).
  const [mgrAsk, setMgrAsk] = useState(null); // null | { kind: "unpaid", order } | { kind: "xread" }
  // ---- Shifts: handover between the people on this till ----
  // shift_status is blind (no expected cash). Refreshed every minute and after
  // each step; a store without the till_shifts table gets enabled:false and
  // the button stays hidden.
  const [shift, setShift] = useState(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);   // CASH MOVEMENTS: pay out / pay in / drop / safe
  const loadShift = useCallback(async () => {
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pos: true, device: deviceToken(), action: "shift_status", data: { location_id: loc } }),
      });
      if (!r.ok) return;
      const j = await r.json().catch(() => null);
      if (j) setShift(j);
    } catch { /* offline — keep the last status */ }
  }, [loc]);
  // TILL HEADER: the drawer chip in the top bar opens the Shift sheet.
  useEffect(() => {
    const open = () => { loadShift(); setShiftOpen(true); };
    window.addEventListener("pos:open-shift", open);
    return () => window.removeEventListener("pos:open-shift", open);
  }, [loadShift]);
  useEffect(() => {
    if (!loc) return;
    loadShift();
    const t = setInterval(loadShift, 60000);
    return () => clearInterval(t);
  }, [loc, loadShift]);
  // ---- Open item: something not on the menu, priced by hand ----
  // The only line whose price the till decides rather than the menu, so it
  // takes a staff PIN. The PIN travels with the order and the server records
  // who keyed it on the line itself.
  const [openAsk, setOpenAsk] = useState(null); // null | { name, price, qty, pin, err }
  const [openPin, setOpenPin] = useState("");   // last PIN that authorised an open line
  async function doOpenDrawer() {
    const a = drawerAsk; if (!a || a.busy || a.pin.length < 4) return;
    setDrawerAsk({ ...a, busy: true, err: "" });
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pos: true, device: deviceToken(), action: "open_drawer", data: { location_id: loc, staff_pin: a.pin } }),
      });
      const j = await r.json().catch(() => ({}));
      if (j && j.ok) { setDrawerAsk(null); setMsg("Drawer opened" + (j.by ? " by " + String(j.by).split(" ")[0] : "")); }
      else setDrawerAsk({ ...a, busy: false, err: j && j.message ? j.message : "Could not open the drawer." });
    } catch { setDrawerAsk({ ...a, busy: false, err: "Could not reach the till printer." }); }
  }

  // ---- Close till (end of day) ----
  // Shows today's tenders from order_payments, takes a cash count + manager
  // PIN, then admin-api close_day archives the open orders, writes
  // till_closures and prints the Z-report on this store's printer.
  const [closeTill, setCloseTill] = useState(null); // null | { step: "summary"|"done", summary, counted, float, pin, by, note, busy, err, result }
  // Trading day ends 04:00: after 4am the default is to close up to 4am only,
  // so this morning's orders stay open; before 4am (end of night) close all.
  // Keeps the server's reason. "Could not load today's totals" covers a
  // refused licence, a kitchen-only screen attempting a till action and a
  // genuine failure alike, which leaves staff with nothing to act on.
  const closeTillErr = useRef("");
  const closeTillCache = useRef({});   // mode -> summary, so the toggle is instant
  // The till has no keyboard — that is why the PIN step has its own pad.
  // The cash-count and float fields relied on the system one, so on the
  // actual hardware they could not be typed into at all.
  const [padFor, setPadFor] = useState(null);  // null | {kind:"float"|"counted"} | {kind:"denom", d}
  // The variance note was the one field left on the system keyboard, so on the
  // till it could not be typed into either. Same treatment: its own letters.
  const [noteKb, setNoteKb] = useState(false);
  const [kbCaps, setKbCaps] = useState(true);  // sentences start capitalised
  const [kbNum, setKbNum] = useState(false);   // letters ⇄ numbers/symbols layer
  async function loadCloseTillSummary(mode) {
    const r = await ordActionJson("day_summary", { location_id: loc, mode });
    if (!r || !r.summary) closeTillErr.current = (r && (r.message || r.error)) || "";
    else closeTillErr.current = "";
    return (r && r.summary) || null;
  }
  async function openCloseTill() {
    closeTillCache.current = {};   // fresh figures each time the sheet opens
    setCloseTill({ step: "summary", stage: 0, mode: "all", summary: null, counted: "", float: "", denoms: {}, countMode: "denoms", pin: "", by: "", note: "", busy: true, err: "", preview: null, floatEdit: false, mgrPin: "", pinFor: "staff" });
    let sm = await loadCloseTillSummary("trading_day");
    let mode = "trading_day";
    // Nothing before the cutoff (or we're before 4am) → close everything up to now.
    if (!sm || !sm.before_cutoff_count) { mode = "all"; sm = await loadCloseTillSummary("all"); }
    if (sm) closeTillCache.current[mode] = sm;
    // With shifts, the day's float is the one the first shift opened with.
    // TILLFIX 2026-10-25: the server's float (first shift / last close / store float).
    const prevFloat = sm && sm.float_known != null ? String(Number(sm.float_known).toFixed(2))
      : sm && sm.first_float != null ? String(Number(sm.first_float).toFixed(2))
      : sm && sm.previous && sm.previous.float_amount != null ? String(Number(sm.previous.float_amount).toFixed(2)) : "";
    setCloseTill((c) => c && { ...c, busy: false, mode, summary: sm, floatKnown: prevFloat, float: c.float || prevFloat, err: sm ? "" : (closeTillErr.current || "Could not load today's totals") });
  }
  // Look the PIN up as it's typed so the sheet can greet the closer by name.
  const staffLookupTimer = useRef(null);
  function lookupStaffPin(pin) {
    if (staffLookupTimer.current) clearTimeout(staffLookupTimer.current);
    if (!pin || pin.length < 4) { setCloseTill((c) => c && { ...c, staff: null }); return; }
    staffLookupTimer.current = setTimeout(async () => {
      const r = await ordActionJson("staff_lookup", { pin, location_id: loc });
      setCloseTill((c) => c && c.pin === pin ? { ...c, staff: r.ok ? { name: r.name } : { unknown: true, reason: r.reason } } : c);
    }, 350);
  }
  // ZREPORT 2026-10-24 — print an X read (no close, no reset, no Z number).
  // CASH CONTROLS: it prints the cash taken so far, so it needs a manager PIN.
  function printXRead() { if (closeTill && !closeTill.xPrinting) setMgrAsk({ kind: "xread" }); }
  async function doPrintXRead(manager_pin) {
    const c = closeTill; if (!c) return "Open Close till first.";
    setCloseTill((x) => x && { ...x, xPrinting: true, xPrinted: null });
    const r = await ordActionJson("print_x_read", { location_id: loc, mode: c.mode, manager_pin, float_amount: c.floatEdit && c.float !== "" ? Number(c.float) : (c.floatKnown !== "" && c.floatKnown != null ? Number(c.floatKnown) : null) });
    setCloseTill((x) => x && { ...x, xPrinting: false, xPrinted: !!(r && r.ok) });
    if (r && (r.error === "manager_required" || r.error === "bad_pin" || r.error === "pin_locked")) return r.message || "That PIN can't print the X read.";
    return null;
  }
  // Blind close: the till only shows what the drawer should hold once the
  // count is in. Every check is logged on the server and printed on the Z.
  async function checkCloseCount(countedVal) {
    const c = closeTill; if (!c || countedVal == null) return;
    const key = countedVal + "|" + (c.floatEdit ? c.float : "") + "|" + c.mode;
    setCloseTill((x) => x && { ...x, busy: true, err: "" });
    const r = await ordActionJson("close_preview", { location_id: loc, mode: c.mode, cash_counted: countedVal, float_amount: c.floatEdit && c.float !== "" ? Number(c.float) : null });
    if (r && r.ok && r.preview) setCloseTill((x) => x && { ...x, busy: false, preview: { ...r.preview, key }, checks: (x.checks || 0) + 1 });
    else setCloseTill((x) => x && { ...x, busy: false, err: (r && (r.message || r.error)) || "Couldn't check the count." });
  }
  async function reprintClosure() {
    const c = closeTill; if (!c || !c.result || !c.result.closure_id) return;
    setCloseTill((x) => x && { ...x, reprinting: true });
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pin: c.pin, device: deviceToken(), action: "reprint_closure", data: { closure_id: c.result.closure_id, location_id: loc, staff_pin: c.pin } }) });
      const j = await r.json().catch(() => ({}));
      setCloseTill((x) => x && { ...x, reprinting: false, reprinted: !!j.ok });
    } catch { setCloseTill((x) => x && { ...x, reprinting: false, reprinted: false }); }
  }
  // Each switch re-queried the server — several seconds of staring at a
  // spinner to compare two numbers. The two summaries are a snapshot of the
  // same moment, so keep both once fetched and flip instantly.
  async function switchCloseTillMode(mode) {
    const hit = closeTillCache.current[mode];
    if (hit) { setCloseTill((c) => c && { ...c, busy: false, mode, summary: hit, err: "" }); return; }
    setCloseTill((c) => c && { ...c, busy: true, err: "" });
    const sm = await loadCloseTillSummary(mode);
    if (sm) closeTillCache.current[mode] = sm;
    setCloseTill((c) => c && { ...c, busy: false, mode, summary: sm, err: sm ? "" : (closeTillErr.current || "Could not load totals") });
  }
  async function confirmCloseTill(overrides = {}) {
    setCloseTill((c) => c && { ...c, ...overrides, busy: true, err: "" });
    const c = { ...closeTill, ...overrides };
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pin: c.pin, device: deviceToken(), action: "close_day", data: {
        location_id: loc, mode: c.mode, staff_pin: c.pin, cash_counted: c.counted === "" ? null : Number(c.counted),
        float_amount: c.floatEdit && c.float !== "" ? Number(c.float) : null, note: c.note.trim() || null, manager_pin: c.mgrPin || null,
      } }) });
      const j = await r.json().catch(() => ({}));
      if (j && j.error === "manager_required") setCloseTill((x) => x && { ...x, pinFor: "manager", mgrPin: "", mgrForced: true });
      if (!r.ok) throw new Error(j.error === "unauthorized" ? "PIN not recognised" : (j.message || j.error || "Close failed"));
      setCloseTill((x) => x && { ...x, busy: false, step: "done", result: j });
      await loadOrders();
      loadShift();   // a running shift ended with the day
      window.dispatchEvent(new Event("pos:shift-changed"));
      setSelOrderId(null); setPayNowOrder(null);
    } catch (e) { setCloseTill((x) => x && { ...x, busy: false, err: e.message || "Close failed" }); }
  }

  // ---- Teya card machine (POSLink) ----
  // If this store has a Teya terminal mapped (teya_terminals), "Card" pushes the
  // amount to the machine and waits for the cardholder instead of trusting a
  // manual tap. The server books the tender itself on SUCCESSFUL, so a dead
  // tab mid-payment cannot leave a paid order showing as unpaid.
  const [teyaTerminal, setTeyaTerminal] = useState(null);
  useEffect(() => {
    if (!loc) { setTeyaTerminal(null); return; }
    fetch(SUPABASE_URL + "/rest/v1/teya_terminals?select=id,label,tablet_no&active=eq.true&location_id=eq." + loc, { headers: H })
      .then((r) => r.ok ? r.json() : []).then((rows) => setTeyaTerminal((rows || []).length ? rows : null)).catch(() => setTeyaTerminal(null));
  }, [loc]); // eslint-disable-line
  const [teyaWait, setTeyaWait] = useState(null); // { amount, label, prId, status, reason, note }
  const teyaCancelRef = useRef(false);
  // Card failures used to go only to `msg`, which renders inside the cart panel
  // — and payment is taken from the orders strip, so every Teya error landed
  // where nobody was looking. A dead Card button was actually a 400 from Teya
  // that nobody could see. This toast sits above everything, so it is visible
  // wherever the member of staff happens to be.
  const [teyaErr, setTeyaErr] = useState("");
  const teyaErrTimer = useRef(null);
  function teyaSay(text) {
    setMsg(text);
    setTeyaErr(text);
    if (teyaErrTimer.current) clearTimeout(teyaErrTimer.current);
    teyaErrTimer.current = setTimeout(() => setTeyaErr(""), 9000);
  }
  useEffect(() => () => { if (teyaErrTimer.current) clearTimeout(teyaErrTimer.current); }, []);
  async function teyaCall(action, dataObj) {
    const r = await fetch(SUPABASE_URL + "/functions/v1/teya-pay", { method: "POST", headers: H, body: JSON.stringify({ action, data: dataObj }) });
    const j = await r.json().catch(() => ({}));
    return { httpOk: r.ok, ...j };
  }
  async function teyaTakeCard(o, amount, extra = {}) {
    setOrdersBusy(true);
    teyaCancelRef.current = false;
    let prId = null;
    try {
      // Pass the till that rang the order up, so a store with one machine per
      // till reaches the right one. teya-pay falls back to the store default
      // when there is no exact match, which is the single-terminal case.
      const start = await teyaCall("start", { order_id: o.id, amount, tablet_no: o.tablet_no ?? null, note: extra.note || null });
      if (!start.httpOk || !start.payment_request_id) {
        teyaSay(start.message || "Could not reach the card machine — take the card manually or try again.");
        return { ok: false, teya_error: true };
      }
      prId = start.payment_request_id;
      setTeyaWait({ amount: start.amount, label: start.terminal, prId, status: start.status || "NEW" });
      // Poll until a terminal state. Each status call waits up to ~8s on Teya's
      // event stream, so this is cheap on the network.
      for (let i = 0; i < 200; i++) {
        if (teyaCancelRef.current) {
          const c = await teyaCall("cancel", { payment_request_id: prId });
          // Teya answers 406 "cannot be cancelled" once the customer has begun
          // paying. Closing the overlay on that would stop the poll while the
          // payment runs to completion — card charged, tender never booked,
          // and nothing reconciles it afterwards. So only stop when the cancel
          // is actually accepted; otherwise carry on waiting for the machine.
          if (c.httpOk && c.ok !== false) { setTeyaWait(null); return { ok: false, cancelled: true }; }
          teyaCancelRef.current = false;
          setTeyaWait((w) => w && { ...w, note: "Too late to cancel — the customer is paying. Wait for the machine." });
        }
        const st = await teyaCall("status", { payment_request_id: prId });
        const status = String(st.status || "").toUpperCase();
        setTeyaWait((w) => w && { ...w, status, reason: st.reason || null });
        if (status === "SUCCESSFUL") { setTeyaWait(null); await loadOrders(); return { ok: true, ...st }; }
        if (status === "FAILED" || status === "CANCELLED") {
          setTeyaWait(null);
          const why = st.reason ? String(st.reason).replace(/_/g, " ").toLowerCase() : null;
          teyaSay(status === "FAILED" ? ("Card payment failed" + (why ? " — " + why : "") + ". Try again or take another method.") : "Card payment cancelled on the machine.");
          return { ok: false, [status.toLowerCase()]: true };
        }
        await new Promise((res) => setTimeout(res, status === "IN_PROGRESS" ? 800 : 1500));
      }
      setTeyaWait(null); teyaSay("The card machine did not respond — check it is online, then try again.");
      return { ok: false, timeout: true };
    } catch {
      setTeyaWait(null); teyaSay("Lost contact with the card machine — check the order before taking payment again.");
      return { ok: false };
    } finally { setOrdersBusy(false); }
  }
  const applyDiscount = (o, payload) => ordActionJson("apply_discount", { order_id: o.id, ...payload });
  const removeDiscount = (o, pin) => ordActionJson("remove_discount", { order_id: o.id, staff_pin: pin });
  const applyItemDiscount = (o, order_item_id, payload) => ordActionJson("apply_item_discount", { order_id: o.id, order_item_id, ...payload });
  const removeItemDiscount = (o, order_item_id, pin) => ordActionJson("remove_item_discount", { order_id: o.id, order_item_id, staff_pin: pin });
  const refundPayment = (o, payload) => ordActionJson("refund_payment", { order_id: o.id, ...payload });
  const printRefundReceipt = (o) => ordActionJson("print_refund_receipt", { order_id: o.id });
  // Take a (possibly partial) payment. amount defaults to the full balance.
  const ordTakePayment = (o, method, amount, extra = {}) =>
    (method === "card" && teyaTerminal)
      ? teyaTakeCard(o, amount, extra)
      : ordActionJson("take_payment", { order_id: o.id, method, amount, ...extra });
  // Legacy single-shot pay (full balance) — kept for the simple Cash/Card path.
  const ordPay = (o, method) => (method === "card" && teyaTerminal)
    ? teyaTakeCard(o, Number(o.total || 0))
    : ordActionJson("take_payment", { order_id: o.id, method, amount: Number(o.total || 0) });
  // CASH CONTROLS 2026-10-24 — undoing a payment needs a manager PIN and a reason.
  const ordUnpaid = (o) => setMgrAsk({ kind: "unpaid", order: o });
  const ordRemoveItem = (o, iid) => ordAction("remove_order_item", { order_id: o.id, order_item_id: iid });
  const ordSetQty = (o, iid, qty) => ordAction("set_order_item_qty", { order_id: o.id, order_item_id: iid, qty });
  const ordSetType = (o, order_type) => ordAction("set_order_type", { order_id: o.id, order_type });
  const ordSetTable = (o, table_id) => ordActionJson("set_order_table", { order_id: o.id, table_id });
  // Void the whole order: manager PIN, a reason, and a VOID chit to the
  // kitchen. Refuses once money has been taken — that is a refund.
  const ordVoidOrder = (o, reason, manager_pin) => ordActionJson("void_order", { order_id: o.id, reason, manager_pin });
  // Void a single already-fired item, with a reason (prints a VOID chit).
  const ordVoidFired = (o, iid, reason) => ordAction("void_fired_item", { order_id: o.id, order_item_id: iid, reason, location_id: loc || null });
  // A customer receipt belongs at the COUNTER, not on the kitchen printer.
  // Without a target sunmi-print falls back to default routing, which sends it
  // to every printer at the location — so every receipt reprint was also
  // spitting a slip out of the kitchen machine mid-service.
  // Shown for a few seconds after a payment completes, so the sale visibly
  // ends rather than the panel just disappearing.
  const [paidBanner, setPaidBanner] = useState(null);
  useEffect(() => {
    if (!paidBanner) return;
    const t = setTimeout(() => setPaidBanner(null), 4000);
    return () => clearTimeout(t);
  }, [paidBanner]);
  // ---- Customer-facing screen (rear screen of the till) ----
  // Mirrors the payment, not the till: the order and balance once Pay is
  // pressed, the card prompt while the machine waits, the change for cash,
  // then a thank-you. Posters the rest of the time. See customerScreen.js.
  const [panelView, setPanelView] = useState(null);   // { orderId, mode, tendered } from the open order panel
  const [screenThanks, setScreenThanks] = useState(null);
  useEffect(() => {
    if (!screenThanks) return;
    const t = setTimeout(() => setScreenThanks(null), 8000);
    return () => clearTimeout(t);
  }, [screenThanks]);
  const thankCustomer = (o, method, amount, extra) => {
    const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
    const total = r2(Number(o.total || 0) - Number(o.discount_amount || 0));
    const change = method === "cash" && extra && extra.tendered != null ? Math.max(0, r2(Number(extra.tendered) - Number(amount != null ? amount : total))) : 0;
    setScreenThanks({ total: gbp(total), method: method === "cash" ? "cash" : "card", change: change > 0.004 ? gbp(change) : "" });
  };
  const PAY_MODES = ["method", "cash", "splitAmt", "splitEven", "splitItem"];
  const screenOrder = panelView && selOrderId === panelView.orderId
    ? ((payNowOrder && payNowOrder.id === selOrderId) ? payNowOrder : (orders || []).find((x) => x.id === selOrderId))
    : null;
  let screenState = { view: "idle" };
  if (screenThanks) screenState = { view: "paid", ...screenThanks };
  else if (teyaWait) screenState = { view: "card", amount: gbp(Number(teyaWait.amount || 0)), status: teyaWait.status || "NEW", order: screenOrder ? orderForScreen(screenOrder, gbp) : null };
  else if (screenOrder && PAY_MODES.includes(panelView.mode)) {
    const ord = orderForScreen(screenOrder, gbp);
    const tendered = panelView.mode === "cash" && panelView.tendered != null ? Number(panelView.tendered) : null;
    screenState = { view: "order", stage: panelView.mode, order: ord,
      tendered: tendered != null ? gbp(tendered) : "",
      change: tendered != null && tendered > ord.dueValue ? gbp(Math.round((tendered - ord.dueValue) * 100) / 100) : "" };
  }
  const screenKey = JSON.stringify(screenState);
  const screenLast = useRef("");
  useEffect(() => {
    if (!loc) return;
    // First idle after a payment goes out once; anything else is repeated
    // every few seconds so the screen can tell a live till from a gone one.
    if (screenKey !== screenLast.current) { screenLast.current = screenKey; sendCustomerScreen(loc, screenState); }
    if (screenState.view === "idle") return;
    const t = setInterval(() => sendCustomerScreen(loc, screenState), 4000);
    return () => clearInterval(t);
  }, [screenKey, loc]); // eslint-disable-line

  const [printingId, setPrintingId] = useState(null);
  const [printedAt, setPrintedAt] = useState({});   // order id -> ms of last OK
  const PRINT_COOLDOWN_MS = 8000;

  async function ordReprint(o) {
    // The button gave no feedback at all, so staff pressed it again — and
    // again — believing nothing had happened. Same cause as the kitchen
    // reprint storm. Ignore repeats while in flight and for a short window
    // after, and show what is actually going on.
    if (printingId === o.id) return;
    const last = printedAt[o.id] || 0;
    if (Date.now() - last < PRINT_COOLDOWN_MS) {
      setMsg("Already sent to the counter printer — give it a few seconds.");
      return;
    }
    setPrintingId(o.id);
    try {
      const res = await fetch(SUPABASE_URL + "/functions/v1/sunmi-print", {
        method: "POST", headers: H,
        body: JSON.stringify({
          action: "print-order", order_id: o.id, force: true,
          // Name the SLIP as well as the station. The counter may be set to
          // print both a kitchen ticket and a receipt; a customer asking for
          // their receipt should not also produce a kitchen ticket.
          station: "counter",
          slip: "receipt",
        }),
      });
      const ok = res.ok;
      setPrintedAt((m) => ({ ...m, [o.id]: Date.now() }));
      setMsg(ok ? "Receipt sent to the counter printer." : "Printer did not accept the job — try again.");
      await loadOrders(); // refresh so the print-failure banner clears on success
    } catch {
      setMsg("Could not reach the printer — check it is on and connected.");
    } finally {
      setPrintingId(null);
    }
  }
  // "Add items" to an existing order: load that order into the current-order
  // ticket in append mode, switch to New order to pick items.
  function ordAddItems(orderId) {
    const o = (orders || []).find((x) => x.id === orderId);
    setAppendTo(orderId);
    if (o && o.table_id) setTable({ id: o.table_id, label: (o.menu_tables && o.menu_tables.label) || "Table" });
    setTicket([]); // fresh lines to append
    setMsg("Adding items to order #" + (o ? o.order_no : "") + " — pick items, then Send.");
  }

  const unpaidCount = (orders || []).filter((o) => o.status !== "cancelled" && !o.paid_method).length;
  const owedTotal = (orders || []).filter((o) => o.status !== "cancelled" && !o.paid_method).reduce((s, o) => s + Number(o.total || 0), 0);
  // Orders that failed to print — surfaced as an un-ignorable banner so a
  // print failure during a rush can't be missed. The 2-min sweep will often
  // clear these automatically; staff can also tap to reprint immediately.
  const failedPrintOrders = (orders || []).filter((o) => o.status !== "cancelled" && o.print_failed);

  // ── LAYOUT: tile size + arrangement ───────────────────────────────────────
  // Stored per device rather than per account: two tills at the same store can
  // reasonably want different sizes, and it needs no authenticated write path
  // from the POS. Lifting it to the server later changes nothing here.
  // Text size from More: the whole till scales, in gentler steps than the
  // kitchen screens so the four columns still fit.
  const zoom = { S: 0.9, M: 1, L: 1.1, XL: 1.2 }[textSize] || 1;
  // Re-render on a window resize so the strip's labels follow the screen.
  const [viewW, setViewW] = useState(() => window.innerWidth);
  useEffect(() => { const f = () => setViewW(window.innerWidth); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const LAYOUT_KEY = "cb_pos_layout_v1";
  const [layout, setLayout] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch { return {}; }
  });
  const saveLayout = (next) => {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch {}
  };
  const catSize = layout.catSize || "m";
  const itemSize = layout.itemSize || "m";
  // Editing is an explicit mode. Without it a drag on a touchscreen also reads
  // as a tap and adds the item to the order — the one thing that must not
  // happen by accident on a till.
  const [editLayout, setEditLayout] = useState(false);
  const [dragKey, setDragKey] = useState(null);

  // Sizes are named steps, not free pixels: easier to hit, impossible to leave
  // in a broken state, and consistent across every till.
  const SIZE = {
    cat:  { s: { pad: ".7vw",  font: ".72vw", row: "clamp(38px,3vw,56px)" },
            m: { pad: "1vw",    font: ".88vw", row: "clamp(46px,3.7vw,70px)" },
            l: { pad: "1.4vw",  font: "1.1vw", row: "clamp(56px,4.6vw,88px)" } },
    item: { s: { h: "4.6vw", thumb: "3.2vw", font: ".88vw", price: "1vw", col: "16vw" },
            m: { h: "6.2vw", thumb: "4.2vw", font: "1.05vw", price: "1.25vw", col: "21vw" },
            l: { h: "8.2vw", thumb: "5.6vw", font: "1.3vw",  price: "1.5vw",  col: "27vw" } },
  };
  const CS = SIZE.cat[catSize], IS = SIZE.item[itemSize];
  const CAT_DEF = { w: 2, h: 1 };   // full width, one per row

  // Per-tile span, keyed by id. Absent = 1x1, so nothing needs migrating and a
  // new item is a normal tile until someone decides otherwise.
  const spanOf = (id, def) => (layout.span || {})[id] || def || { w: 1, h: 1 };
  const setSpan = (id, w, h) => setLayout((prev) => {
    const next = { ...prev, span: { ...(prev.span || {}), [id]: { w, h } } };
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch {}
    return next;
  });
  const cycleSpan = (id, def) => {
    // 1x1 → 2x1 → 2x2 → 1x2 → back. One control, every useful shape.
    const { w, h } = spanOf(id, def);
    const next = w === 1 && h === 1 ? [2, 1] : w === 2 && h === 1 ? [2, 2] : w === 2 && h === 2 ? [1, 2] : [1, 1];
    setSpan(id, next[0], next[1]);
  };
  // A bigger tile should USE the space: thumbnail, name and price scale with
  // the span rather than staying at base size and leaving the tile half empty.
  const spanScale = (id, def) => {
    const { w, h } = spanOf(id, def);
    return 1 + (w - 1) * 0.42 + (h - 1) * 0.42;
  };
  const spanStyle = (id, def) => {
    const { w, h } = spanOf(id, def);
    return { gridColumn: "span " + w, gridRow: "span " + h };
  };

  // Apply a saved arrangement to a list, keeping anything new at the end so a
  // newly added item never disappears because it is missing from the order.
  const arrange = (list, key) => {
    const saved = (layout.order || {})[key];
    if (!saved || !saved.length) return list;
    const pos = new Map(saved.map((id, i) => [id, i]));
    return [...list].sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 9999) - (pos.has(b.id) ? pos.get(b.id) : 9999));
  };
  const reorder = (key, list, fromId, toId) => {
    const ids = list.map((x) => x.id);
    const from = ids.indexOf(fromId), to = ids.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    saveLayout({ ...layout, order: { ...(layout.order || {}), [key]: ids } });
  };
  // Open tables for the unpaid strip. Paid is decided by paid_method, the same
  // test OrdersList uses — NOT by amount_paid, which stays at zero on orders
  // settled at the counter and made paid orders look outstanding.
  const unpaidOrders = (orders || [])
    // 'hold' is a half-started pay-now transaction, not a table owing money.
    // Counting them put 12 phantom entries and £111 of imaginary debt in this
    // list and made it disagree with the Orders screen, which excludes them.
    //
    // UNLESS money has already been taken against it. A split bill paid from
    // the Pay button creates the order on hold, and the first tender leaves it
    // hold (it is only released to the kitchen once the balance clears). With
    // no paid_method yet it is not in the settled list either, so a half-paid
    // order disappeared off the till entirely with the rest still owing. A
    // hold carrying money is a real debt and belongs in this list.
    .filter((o) => o.status !== "cancelled" && (o.status !== "hold" || /^KIOSK/i.test(String(o.tablet_no || "")) || Number(o.amount_paid || 0) > 0) && !o.paid_method)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  // Settled orders, newest first, shown under the unpaid ones so staff can
  // reopen or reprint a recent order without leaving the till screen.
  const paidOrders = (orders || [])
    .filter((o) => o.status !== "cancelled" && o.paid_method)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Menu reload: after Items on/off, and every 2 minutes so a change made on
  // another till (or in the admin) shows here without a reload.
  const [menuTick, setMenuTick] = useState(0);
  const [stockOpen, setStockOpen] = useState(false);
  // More → Printers: the Admin printer screen, for this store only, behind a
  // manager PIN. printerPin holds the PIN while the screen is open.
  const [printerAsk, setPrinterAsk] = useState(false);
  const [printerPin, setPrinterPin] = useState(null);
  const [storeLoc, setStoreLoc] = useState(null);
  const printerCall = async (action, data) => {
    const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, device: deviceToken(), action, data: { ...(data || {}), manager_pin: printerPin } }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.message || j.error || ("HTTP " + r.status));
    return j;
  };
  useEffect(() => { const id = setInterval(() => setMenuTick((t) => t + 1), 120000); return () => clearInterval(id); }, []);

  // ---- Load menu (same source as the customer app) ----
  // Three levels: master MENU (Breakfast, Desserts…) → subcategory → items.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const body = loc ? { loc } : { loc: null };
        const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/store_menu_full", { method: "POST", headers: H, body: JSON.stringify(body), cache: "no-store" });
        // A failed refresh keeps the menu on screen rather than blanking it.
        if (!r.ok) throw new Error("menu " + r.status);
        const rows = await r.json();

        // Short till labels, Toast-style. store_menu_full is shared with
        // place-order and the customer app, so rather than change its return
        // shape for a display string we fetch the labels separately and merge
        // by id. Receipts and kitchen tickets keep the full name regardless.
        let posNames = new Map();
        const posCats = new Map();
        const posMenus = new Map();
        try {
          const [cr, mr] = await Promise.all([
            fetch(SUPABASE_URL + "/rest/v1/menu_categories?select=id,pos_name&pos_name=not.is.null", { headers: H, cache: "no-store" }),
            fetch(SUPABASE_URL + "/rest/v1/menu_menus?select=id,pos_name&pos_name=not.is.null", { headers: H, cache: "no-store" }),
          ]);
          if (cr.ok) for (const c of await cr.json()) posCats.set(c.id, c.pos_name);
          if (mr.ok) for (const m of await mr.json()) posMenus.set(m.id, m.pos_name);
        } catch { /* labels are cosmetic — never block the menu on them */ }
        try {
          const pr = await fetch(SUPABASE_URL + "/rest/v1/menu_items?select=id,pos_name&pos_name=not.is.null",
            { headers: H, cache: "no-store" });
          if (pr.ok) for (const it of await pr.json()) posNames.set(it.id, it.pos_name);
        } catch { /* labels are cosmetic — never block the menu on them */ }

        const menuMap = new Map();
        for (const row of rows) {
          let mn = menuMap.get(row.menu_id);
          if (!mn) { mn = { id: row.menu_id, name: row.menu_name, posName: posMenus.get(row.menu_id) || row.menu_name, sort: row.menu_sort ?? 0, subMap: new Map() }; menuMap.set(row.menu_id, mn); }
          let sc = mn.subMap.get(row.category_id);
          if (!sc) { sc = { id: row.category_id, name: row.category_name, posName: posCats.get(row.category_id) || row.category_name, sort: row.category_sort ?? 0, items: [] }; mn.subMap.set(row.category_id, sc); }
          sc.items.push({ id: row.item_id, name: row.item_name,
            // What the button shows. Falls back to the real name.
            posName: posNames.get(row.item_id) || row.item_name,
            price: Number(row.price), image_url: row.image_url, category: row.category_name, description: row.description || "", modifiers: row.modifiers || [], available: row.available !== false });
        }
        const masters = [...menuMap.values()].sort((a, b) => a.sort - b.sort)
          .map((m) => ({ id: m.id, name: m.name, posName: m.posName, subs: [...m.subMap.values()].sort((a, b) => a.sort - b.sort) }));
        if (alive) setCats(masters);
      } catch { if (alive) setCats((c) => (c && c.length ? c : [])); }
    })();
    return () => { alive = false; };
  }, [loc, menuTick]);

  // Load display-only category merges (saved in DB, shared across devices).
  const loadMerges = useCallback(async () => {
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pos: true, device: deviceToken(), action: "merges_list" }),
      });
      const j = await r.json();
      if (Array.isArray(j.merges)) setMerges(j.merges);
    } catch { /* ignore — no merges shown */ }
  }, []);
  useEffect(() => { loadMerges(); }, [loadMerges]);

  const saveMerge = async ({ id, menu_id, new_name, category_ids }) => {
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pos: true, device: deviceToken(), action: "merge_save", data: { id, menu_id, new_name, category_ids } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { alert("Merge failed: " + (j.error || ("HTTP " + r.status))); return false; }
      await loadMerges();
      return true;
    } catch (e) {
      alert("Merge failed: " + String(e && e.message ? e.message : e));
      return false;
    }
  };
  const deleteMerge = async (id) => {
    try {
      await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pos: true, device: deviceToken(), action: "merge_delete", data: { id } }),
      });
      await loadMerges();
    } catch { /* ignore */ }
  };

  const catList = cats || [];
  const master = catList[activeCat] || null;
  // Apply display-only merges: fold merged sub-categories into one synthetic
  // category (custom name + combined items); hide the originals. DB untouched.
  const subs = useMemo(() => {
    if (!master) return [];
    const raw = master.subs;
    const relevant = merges.filter((m) => Array.isArray(m.category_ids) && m.category_ids.length >= 2
      && m.category_ids.some((cid) => raw.some((s) => s.id === cid)));
    if (relevant.length === 0) return raw;
    const mergedIds = new Set();
    relevant.forEach((m) => m.category_ids.forEach((cid) => mergedIds.add(cid)));
    const out = [];
    const placed = new Set();
    for (const s of raw) {
      const m = relevant.find((mm) => mm.category_ids.includes(s.id));
      if (!m) { out.push(s); continue; }
      if (placed.has(m.id)) continue; // already emitted this merged group
      placed.add(m.id);
      const items = [];
      const groups = [];
      for (const cid of m.category_ids) {
        const src = raw.find((x) => x.id === cid);
        if (src && src.items.length) { items.push(...src.items); groups.push({ name: src.name, items: src.items }); }
      }
      out.push({ id: "merge:" + m.id, name: m.new_name, items, groups, _merged: true });
    }
    return out;
  }, [master, merges]);
  const sub = subs[activeSub] || null;
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return catList.flatMap((m) => m.subs.flatMap((s) => s.items)).filter((it) => it.name.toLowerCase().includes(q));
    return sub ? sub.items : [];
  }, [catList, sub, search]);

  const itemCount = ticket.reduce((s, l) => s + l.qty, 0);
  const subtotal = ticket.reduce((s, l) => s + l.unit * l.qty, 0);
  // Live per-item quantity in the current order (sum across lines / modifiers),
  // so a tile can show its count instead of the + button.
  const qtyInCart = useMemo(() => {
    const m = {};
    for (const l of ticket) { const id = l.item && l.item.id; if (id) m[id] = (m[id] || 0) + l.qty; }
    return m;
  }, [ticket]);

  function addItem(it) {
    if (it.modifiers && it.modifiers.length) {
      // pre-select the first option of any required single-select group
      const init = {};
      for (const g of it.modifiers) {
        if (g.required && (g.max_select || 1) === 1 && g.options && g.options.length) init[g.id] = [g.options[0].id];
      }
      setEditKey(null); setModNote(""); setModItem(it); setModSel(init);
    } else pushLine(it, it.price, [], "");
  }
  // Open the customise sheet for an EXISTING cart line, pre-filled with its
  // current choices + note, so staff can change a modifier without re-adding.
  function editLine(l) {
    const sel = {};
    for (const g of (l.item.modifiers || [])) {
      const ids = (l.mods || []).filter((m) => m.group === g.name).map((m) => m.option_id);
      if (ids.length) sel[g.id] = ids;
    }
    setEditKey(l.key); setModNote(l.note || ""); setModItem(l.item); setModSel(sel);
  }
  function pushLine(it, unit, mods, note) {
    setTicket((prev) => {
      const sig = it.id + "|" + mods.map((x) => x.option_id).sort().join(",") + "|" + (note || "");
      const i = prev.findIndex((l) => l.sig === sig);
      if (i >= 0) { const c = prev.slice(); c[i] = { ...c[i], qty: c[i].qty + 1 }; return c; }
      return [...prev, { key: Math.random().toString(36).slice(2), sig, item: it, qty: 1, unit, mods, note: note || "" }];
    });
  }
  function confirmMods() {
    const groups = modItem.modifiers || [];
    const chosen = groups.flatMap((g) => (g.options || []).filter((o) => (modSel[g.id] || []).includes(o.id)).map((o) => ({ group: g.name, name: o.name, price_delta: Number(o.price_delta || 0), option_id: o.id })));
    const unit = modItem.price + chosen.reduce((s, x) => s + x.price_delta, 0);
    const note = modNote.trim();
    if (note && modItem) { try { const k = "pos_recent_notes_" + modItem.id; const cur = JSON.parse(localStorage.getItem(k) || "[]"); const parts = note.split(",").map((x) => x.trim()).filter(Boolean); localStorage.setItem(k, JSON.stringify([...parts, ...cur.filter((x) => !parts.includes(x))].slice(0, 6))); } catch {} }
    if (editKey) {
      // Update the existing line in place (keep its qty).
      setTicket((prev) => prev.map((l) => l.key === editKey
        ? { ...l, unit, mods: chosen, note, sig: modItem.id + "|" + chosen.map((x) => x.option_id).sort().join(",") + "|" + note }
        : l));
    } else {
      pushLine(modItem, unit, chosen, note);
    }
    setModItem(null); setModSel({}); setModNote(""); setEditKey(null);
  }
  function toggleOpt(g, optId) {
    setModSel((prev) => {
      const cur = prev[g.id] || [];
      const single = (g.max_select || 1) === 1;
      const on = cur.includes(optId);
      let next;
      if (single) next = on ? [] : [optId];
      else if (on) next = cur.filter((x) => x !== optId);
      else next = cur.length < (g.max_select || 99) ? [...cur, optId] : cur;
      return { ...prev, [g.id]: next };
    });
  }
  // required groups must have their minimum satisfied before Add is allowed
  const modMissingReq = (modItem?.modifiers || []).some((g) => g.required && (modSel[g.id] || []).length < (g.min_select || 1));
  // A carrier item costs nothing until a choice is made — "Add Ons" on the
  // breakfast menu is priced at zero and takes all its money from its options
  // — so adding one untouched puts a 0.00 line on the ticket that tells the
  // kitchen nothing. The option group itself cannot be made required: it is
  // shared by twenty-four breakfast dishes. Scoped to items that HAVE groups
  // and have had NOTHING chosen, so a free item with no groups still adds and
  // so does a choice deliberately priced at zero.
  const modReqGroups = (modItem?.modifiers || []).filter((g) => g.required);
  const modReqDone = modReqGroups.filter((g) => (modSel[g.id] || []).length >= (g.min_select || 1)).length;
  const modUnit = modItem ? modItem.price + (modItem.modifiers || []).flatMap((g) => (g.options || []).filter((o) => (modSel[g.id] || []).includes(o.id))).reduce((s, o) => s + Number(o.price_delta || 0), 0) : 0;
  // Declared after modUnit on purpose — it reads it.
  const modEmptyCarrier = !!modItem && (modItem.modifiers || []).length > 0
    && (modItem.modifiers || []).every((g) => !(modSel[g.id] || []).length)
    && modUnit === 0;
  const modMissing = modMissingReq || modEmptyCarrier;
  const setQty = (key, d) => setTicket((p) => p.flatMap((l) => l.key === key ? (l.qty + d <= 0 ? [] : [{ ...l, qty: l.qty + d }]) : [l]));
  const removeLine = (key) => setTicket((p) => p.filter((l) => l.key !== key));
  const clearAll = () => { setTicket([]); setTable(null); setAppendTo(null); setOrderKind("takeaway"); setOrderNote(""); setPlaced(null); setMsg(""); setPayMethod(null); setPayPin(""); };

  async function sendOrder(thenPay = false) {
    if (!ticket.length) return;
    setSending(true); setMsg("");
    try {
      const kindType = orderKind === "dinein" ? "dine_in" : "takeaway";
      const kindSource = orderKind === "phone" ? "phone" : orderKind === "web" ? "web" : "POS";
      const payload = {
        qr_token: storeToken || null, location_id: loc || null,
        table_id: table ? table.id : null, order_type: kindType,
        pickup_name: null, tablet_no: kindSource, customer_note: orderNote.trim() || null,
        // PAY-FIRST: when the staff pressed "Pay", create the order on HOLD so it
        // does NOT print or hit the KDS until payment completes. The payment
        // (admin-api) releases it to the kitchen on success. "Send to kitchen"
        // (thenPay=false) fires immediately as before.
        hold: thenPay ? true : false,
        items: ticket.map((l) => l.open
          ? ({ open: true, name: l.item.name, price: l.unit, qty: l.qty, note: l.note || null })
          : ({ item_id: l.item.id, qty: l.qty, modifiers: l.mods.map((m) => m.option_id), note: l.note || null })),
      };
      if (appendTo) payload.append_to_order_id = appendTo;
      if (ticket.some((l) => l.open)) payload.staff_pin = openPin;
      const r = await fetch(SUPABASE_URL + "/functions/v1/place-order", { method: "POST", headers: H, body: JSON.stringify(payload) });
      const resp = await r.json();
      if (!r.ok) throw new Error(resp.message || resp.error || "Send failed");
      if (appendTo) {
        // Added to an existing order — clear the ticket and refresh the strip.
        setAppendTo(null); setTicket([]); setTable(null); setOrderNote(""); setMsg("Items added to the order.");
        loadOrders();
      } else {
        setMsg(thenPay ? "Take payment to send to kitchen" : "Sent — order #" + resp.order_no);
        // Build a local order object so the payment panel can open instantly and
        // reliably (no waiting for the list reload to propagate into state).
        const localOrder = {
          id: resp.order_id, order_no: resp.order_no,
          table_id: table ? table.id : null,
          order_type: kindType,
          pickup_name: null, tablet_no: kindSource,
          total: subtotal, amount_paid: 0, paid_method: null, status: thenPay ? "hold" : "placed",
          created_at: new Date().toISOString(),
          menu_tables: table ? { label: table.label } : null,
          menu_order_items: ticket.map((l) => ({
            id: l.key, name_snapshot: l.item.name, qty: l.qty,
            price_snapshot: l.unit, line_total: Math.round(l.unit * l.qty * 100) / 100,
            modifiers_snapshot: (l.mods || []).map((m) => m.name),
          })),
        };
        payDraft.current = (thenPay && resp.order_id)
          ? { orderId: resp.order_id, orderNo: resp.order_no, ticket, table, orderNote, orderKind }
          : null;
        // Clear the cart; the order now lives in the strip.
        setTicket([]); setTable(null); setOrderNote(""); setPlaced(null); setPayMethod(null); setPayPin("");
        if (thenPay && resp.order_id) {
          setPayNowOrder(localOrder);   // drives the panel immediately
          setSelPayNow(true);
          setSelOrderId(resp.order_id);
        }
        loadOrders(); // refresh the strip in the background
      }
    } catch (e) { setMsg(e.message || "Send failed"); } finally { setSending(false); }
  }
  // Undo a Pay that was closed before any money was taken: cancel the hold on
  // the server first, and only then put the items back. If the server refuses
  // (a card is still on the machine, a tender landed) the basket stays empty,
  // so the same order can't be rung up a second time.
  async function abandonHold(draft) {
    const res = await ordActionJson("abandon_hold", { order_id: draft.orderId });
    if (!res.ok) {
      setMsg(res.message || ("Order #" + draft.orderNo + " is still waiting for payment — open it from the orders list."));
      return;
    }
    setTicket((cur) => [...draft.ticket, ...cur]);
    setTable((cur) => cur || draft.table);
    setOrderNote((cur) => cur || draft.orderNote);
    setOrderKind(draft.orderKind);
    setMsg("Payment not taken — the order is back in the basket.");
  }
  async function takePayment() {
    if (!placed || !payMethod || !payPin) { setMsg("Choose method + PIN"); return; }
    setPayBusy(true);
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pin: payPin, action: "mark_paid", data: { order_id: placed.id, method: payMethod } }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error === "unauthorized" ? "Wrong PIN" : "Payment failed"); }
      setMsg("Paid — #" + placed.order_no + " complete");
      setTimeout(clearAll, 900);
    } catch (e) { setMsg(e.message); } finally { setPayBusy(false); }
  }

  // palette — emerald/teal POS scheme
  const P = { canvas: "#eceef1", ink: "#12151c", panel: "#fff", line: "#e8e9ec", line2: "#f1f2f4", muted: "#868d99", muted2: "#9aa1ac", chip: "#f0fdfa", chipBorder: "#ccfbf1", tealA: "#14b8a6", tealB: "#0d9488", tealDeep: "#0f766e", masterBg: "#0f2e29", masterMuted: "#5eead4", tealBg: "#f0fdfa" };

  // Colour a tile by its top-level menu group. Broad zones keep the colour
  // meaningful (drinks / breakfast / food / bowls / desserts / kids) rather
  // than one colour per sub-category (which becomes noise). bar = left border,
  // bg = tinted background, ink = readable text on that tint.
  const catColor = (menuName) => {
    const n = (menuName || "").toLowerCase();
    const COLORS = {
      coldDrink: { bar: "#185FA5", bg: "#eaf3fb", ink: "#0C447C", g1: "#eaf3fb", g2: "#d3e6f7" },
      hotDrink:  { bar: "#378ADD", bg: "#e6f1fb", ink: "#0C447C", g1: "#eaf3fb", g2: "#d3e6f7" },
      breakfast: { bar: "#BA7517", bg: "#faeeda", ink: "#633806", g1: "#faeeda", g2: "#f6dcae" },
      food:      { bar: "#C0532E", bg: "#faece7", ink: "#7A2E15", g1: "#faece7", g2: "#f3d0c4" },
      bowls:     { bar: "#639922", bg: "#eaf3de", ink: "#27500A", g1: "#eaf3de", g2: "#d5e8bd" },
      dessert:   { bar: "#7F77DD", bg: "#eeedfe", ink: "#3C3489", g1: "#eeedfe", g2: "#dcd9f7" },
      kids:      { bar: "#D4537E", bg: "#fbeaf0", ink: "#993556", g1: "#fbeaf0", g2: "#f5cfdd" },
      neutral:   { bar: "#94a3b8", bg: "#f1f5f9", ink: "#475569", g1: "#f1f5f9", g2: "#e2e8f0" },
    };
    if (/kid/.test(n)) return COLORS.kids;
    if (/iced|cold|soft drink|juice|mocktail|shake|cooler|falooda|matcha/.test(n)) return COLORS.coldDrink;
    if (/coffee|latte|chai|tea|chocolate|cappuccino|cortado/.test(n)) return COLORS.hotDrink;
    if (/breakfast|egg|toast|french toast|skillet|shakshuka/.test(n)) return COLORS.breakfast;
    if (/steak|grill|burger|pasta|light bite|chicken|main/.test(n)) return COLORS.food;
    if (/bowl|granola|salad/.test(n)) return COLORS.bowls;
    if (/dessert|cake|cheesecake|kanafeh|waffle|crepe|churro|cookie|ice cream|strawberr|treat|milk cake/.test(n)) return COLORS.dessert;
    return COLORS.neutral;
  };
  const grad = "linear-gradient(140deg," + P.tealA + "," + P.tealB + ")";

  // One item tile (shared by flat grids and grouped merged views).
  const renderTile = (it, listKey) => {
    const lk = listKey || ("item:" + (sub ? sub.id : "all"));
    // Which list this tile was rendered from, so a drop reorders the right one.
    // Derived from sub rather than showGroups so it does not depend on where
    // that constant happens to be declared.
    const k = spanScale(it.id);
    const tall = spanOf(it.id).h > 1;
    const gi = listKey ? Number(listKey.split(":").pop()) : NaN;
    const curList = (!isNaN(gi) && sub && Array.isArray(sub.groups) && sub.groups[gi])
      ? sub.groups[gi].items
      : shown;
    const fb = fallbackFor(it.name, it.category || "");
    const hasMods = it.modifiers && it.modifiers.length;
    const cc = catColor(it.category || (master && master.name));
    const inCart = qtyInCart[it.id] || 0;
    const soldOut = it.available === false;
    // ROW LAYOUT — photo left, name centre, price right.
    // The square photo tiles put the name over the image, where a long name
    // like "Pistachio Kanafeh Chocolate Dream Cake" wrapped across a busy
    // photo, hid the price, and fitted only six items on screen. A fixed
    // three-column grid gives each element its own lane so nothing can
    // overlap, and roughly triples how much of the menu is visible.
    const chip = soldOut
      ? { text: "BACK 6AM", fg: "#8A5A15", bg: "#F6E9D5" }
      : hasMods ? { text: "OPTIONS", fg: "#8A6A3E", bg: "#FBF2E4" } : null;
    return (
      <div key={it.id}
        draggable={editLayout}
        onDragStart={() => setDragKey(it.id)}
        onDragOver={(e) => { if (editLayout) e.preventDefault(); }}
        onDrop={(e) => { if (!editLayout) return; e.preventDefault(); reorder(lk, arrange(curList, lk), dragKey, it.id); setDragKey(null); }}
        className={soldOut ? undefined : "cb-tap cb-tap-lift"}
        onPointerDown={(editLayout || soldOut) ? undefined : tapFeedback}
        onClick={() => { if (editLayout) return; if (!soldOut) addItem(it); }}
        style={{
          display: "grid", gridTemplateColumns: "4px calc(clamp(46px," + IS.thumb + ",118px) * " + k + ") minmax(0,1fr) calc(clamp(76px," + IS.price + ",150px) * " + Math.min(k, 1.5) + ")",
          alignItems: "center", columnGap: 12,
          ...spanStyle(it.id), height: "100%", boxSizing: "border-box", overflow: "hidden",
          padding: "10px 12px 10px 0", borderRadius: 14, opacity: dragKey === it.id ? .45 : 1, position: "relative",
          cursor: editLayout ? "grab" : (soldOut ? "not-allowed" : "pointer"),
          background: soldOut ? "#F0EADF" : inCart ? "#F7FAF3" : "#fff",
          border: inCart ? "1.5px solid #5E7A4D" : "1px solid " + (soldOut ? "#E4DCCB" : "#E7E0D1"),
          boxShadow: inCart ? "0 3px 10px rgba(94,122,77,.14)" : (soldOut ? "none" : "0 1px 3px rgba(34,39,31,.05)"),
        }}>
        <span style={{ width: 4, height: 80, background: cc.bar, opacity: soldOut ? .4 : 1 }} />
        <span style={{ position: "relative", width: "100%", height: tall ? "88%" : "auto", aspectRatio: tall ? "auto" : "1", alignSelf: "center" }}>
          <span style={{
            display: "block", width: "100%", height: "100%", borderRadius: 14,
            background: it.image_url ? "#E7E0D1" : "linear-gradient(150deg," + cc.bar + "," + cc.ink + ")",
            backgroundImage: it.image_url ? "url(" + it.image_url + ")" : undefined,
            backgroundSize: "cover", backgroundPosition: "center",
            filter: soldOut ? "grayscale(1)" : "none", opacity: soldOut ? .55 : 1,
          }}>
            {!it.image_url && <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 26, color: "rgba(255,255,255,.92)" }}>{fb.icon}</span>}
          </span>
          {!soldOut && inCart > 0 && (
            <span style={{ position: "absolute", top: -7, right: -7, minWidth: 23, height: 23, padding: "0 6px", borderRadius: 12, background: P.tealA, color: "#06231f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 800, border: "2.5px solid #F7FAF3", fontVariantNumeric: "tabular-nums" }}>{inCart}</span>
          )}
        </span>
        <span style={{ minWidth: 0 }}>
          <span title={it.name} style={{ display: "-webkit-box", WebkitLineClamp: tall ? (chip ? 4 : 5) : (chip ? 2 : 3), WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: "calc(clamp(12.5px," + IS.font + ",26px) * " + k + ")", fontWeight: 600, lineHeight: 1.3, letterSpacing: "-.005em", color: soldOut ? "#8A8170" : "#221D17" }}>
            {it.posName || it.name}
          </span>
          {chip && (
            <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, letterSpacing: ".04em", fontWeight: 700, color: chip.fg, background: chip.bg, borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap" }}>{chip.text}</span>
          )}
        </span>
        {editLayout && (
          <span
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); cycleSpan(it.id); }}
            draggable={false} title="Resize this tile"
            style={{ position: "absolute", top: 5, right: 5, zIndex: 3, background: P.tealDeep, color: "#fff", borderRadius: 7, padding: "4px 8px", fontSize: 12, fontWeight: 800, cursor: "pointer", touchAction: "none" }}>
            {spanOf(it.id).w}×{spanOf(it.id).h}
          </span>
        )}
        <span style={{ textAlign: "right", fontSize: "calc(clamp(14px," + IS.price + ",30px) * " + Math.min(k, 1.6) + ")", fontWeight: 700, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", color: soldOut ? "#B6AA96" : inCart ? "#3F5A2F" : "#221D17" }}>
          {gbp(it.price)}
        </span>
      </div>
    );
  };
  const gridCols = "repeat(auto-fill, minmax(clamp(240px, " + IS.col + ", 520px), 1fr))";
  const showGroups = sub && sub._merged && Array.isArray(sub.groups) && sub.groups.length > 0 && !search;

  return (
    <div style={{ display: "flex", flexDirection: "column", zoom, height: bare ? "calc(100dvh / " + zoom + ")" : "calc((100dvh - 56px) / " + zoom + ")", background: P.canvas, color: P.ink, fontFamily: "'Hanken Grotesk',sans-serif" }}>
      {/* ── Un-ignorable print-failure banner (Oracle-style) ── */}
      {failedPrintOrders.length > 0 && (
        <>
          <style>{`@keyframes cbFailFlash { 0%,100%{background:#dc2626;} 50%{background:#a01515;} }`}</style>
          <div style={{ flexShrink: 0, animation: "cbFailFlash 1.1s ease-in-out infinite", color: "#fff", padding: "11px 18px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 3px 10px rgba(220,38,38,.35)" }}>
            <span style={{ fontSize: 20 }}>⚠</span>
            <span style={{ fontWeight: 800, fontSize: 15.5, letterSpacing: ".01em" }}>
              {failedPrintOrders.length === 1
                ? "ORDER #" + failedPrintOrders[0].order_no + " DID NOT PRINT"
                : failedPrintOrders.length + " ORDERS DID NOT PRINT"}
              <span style={{ fontWeight: 600, opacity: .95, display: "block", fontSize: 13.5, marginTop: 2 }}>
                {(() => { const reasons = [...new Set(failedPrintOrders.map((o) => o.print_error).filter(Boolean))]; return reasons.length ? reasons.join(" · ") : "Printer did not accept the job — check it is on, connected and has paper"; })()}
              </span>
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <span onClick={async () => { for (const o of failedPrintOrders.slice(0, 20)) await ordAction("clear_print_flag", { order_id: o.id }); loadOrders(); }} title="Dismiss the alarm"
                style={{ cursor: "pointer", background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.4)", borderRadius: 9, padding: "6px 12px", fontWeight: 800, fontSize: 13 }}>Dismiss</span>
              {failedPrintOrders.slice(0, 4).map((o) => (
                <span key={o.id} onClick={() => ordReprint(o)} title={"Reprint order #" + o.order_no}
                  style={{ cursor: "pointer", background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.55)", borderRadius: 9, padding: "6px 12px", fontWeight: 800, fontSize: 14 }}>
                  ⟳ #{o.order_no}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── SIX-COLUMN SHELL ────────────────────────────────────────────────
          84px icon rail · 140px category rail · item grid · 330px order panel
          · 104px unpaid strip. The old layout spent ~625px of width on two
          navigation columns and left the order panel empty until someone
          tapped something; this reclaims both.
          The item grid, order panel and modifier sheet below are unchanged. */}
      <style>{TAP_CSS}</style>

      {/* PAID — the sale is finished. Sits above everything, clears itself. */}
      {teyaWait && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(20,24,18,.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 420, maxWidth: "90vw", background: "#fff", borderRadius: 20, padding: "30px 28px 24px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: "#6b7a60", textTransform: "uppercase" }}>{teyaWait.label ? "Card machine · " + teyaWait.label : "Card machine"}</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 44, letterSpacing: "-1px", margin: "10px 0 4px", color: "#22271f" }}>{gbp(teyaWait.amount)}</div>
            <div style={{ fontSize: 15, color: "#4b5543", minHeight: 22 }}>
              {teyaWait.status === "IN_PROGRESS" ? "Customer is paying…" : teyaWait.status === "CANCELLING" ? "Cancelling…" : "Ask the customer to tap or insert their card"}
            </div>
            {teyaWait.note && <div style={{ fontSize: 14, color: "#9a3412", fontWeight: 700, marginTop: 8, lineHeight: 1.4 }}>{teyaWait.note}</div>}
            <div style={{ margin: "18px auto 22px", width: 54, height: 54, borderRadius: "50%", border: "5px solid #e6ecdd", borderTopColor: "#5E7A4D", animation: "teyaspin 1s linear infinite" }} />
            <div onClick={() => { teyaCancelRef.current = true; setTeyaWait((w) => w && { ...w, status: "CANCELLING" }); }} style={{ display: "inline-block", padding: "12px 26px", borderRadius: 12, background: "#f3f4ef", color: "#9a3412", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Cancel</div>
            <style>{"@keyframes teyaspin{to{transform:rotate(360deg)}}"}</style>
          </div>
        </div>
      )}
      {/* Card errors, above everything — see the note by teyaErr. */}
      {teyaErr && (
        <div onClick={() => setTeyaErr("")}
          style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 1300, maxWidth: "92vw", padding: "14px 20px", borderRadius: 14, background: "#7f1d1d", color: "#fff", fontSize: 15.5, fontWeight: 700, lineHeight: 1.4, textAlign: "center", boxShadow: "0 14px 40px rgba(0,0,0,.35)", cursor: "pointer" }}>
          {teyaErr}
        </div>
      )}
      {feedbackFor && <ServiceFeedback order={feedbackFor} locationId={loc} supabaseUrl={SUPABASE_URL} headers={H} source="pos" onClose={() => setFeedbackFor(null)} onSaved={(j) => setMsg("Feedback logged for #" + feedbackFor.order_no + (j && j.logged_by ? " as " + j.logged_by : ""))} />}

      {drawerAsk && (
        <Sheet icon={<TillIcon.drawer size={24} />} title="Open the drawer" sub="For change or the float — your PIN is recorded against it" width={480}
          busy={drawerAsk.busy} onClose={() => setDrawerAsk(null)}
          footer={<><Btn kind="secondary" onClick={() => !drawerAsk.busy && setDrawerAsk(null)}>Cancel</Btn><Btn kind="teal" icon={<TillIcon.drawer size={18} />} disabled={drawerAsk.busy || drawerAsk.pin.length < 4} onClick={doOpenDrawer}>{drawerAsk.busy ? "Opening…" : "Open drawer"}</Btn></>}>
          <PinPanel label="Your PIN" value={drawerAsk.pin} onChange={(v) => setDrawerAsk({ ...drawerAsk, pin: v, err: "" })} error={drawerAsk.err} />
          <TillErr>{drawerAsk.err}</TillErr>
        </Sheet>
      )}
      {openAsk && (() => {
        const px = Math.round(Number(openAsk.price) * 100) / 100;
        const priceOk = openAsk.price !== "" && isFinite(px) && px >= 0 && px <= 500;
        const ready = openAsk.name.trim().length > 0 && priceOk && openAsk.pin.length >= 4;
        const add = () => {
          if (!ready) return;
          const key = Math.random().toString(36).slice(2);
          setTicket((prev) => [...prev, {
            key, sig: "open:" + key, open: true, qty: Math.max(1, parseInt(openAsk.qty) || 1),
            unit: px, mods: [], note: "",
            item: { id: null, name: openAsk.name.trim().slice(0, 60), price: px, modifiers: [], image_url: null, category: "Open item" },
          }]);
          setOpenPin(openAsk.pin);
          setOpenAsk(null);
        };
        return (
          <div onClick={() => setOpenAsk(null)} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(8,15,20,.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 400, maxWidth: "94vw", background: "#fff", borderRadius: 18, padding: 24, fontFamily: "'Poppins',sans-serif", boxShadow: "0 30px 60px -20px rgba(0,0,0,.5)" }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", color: "#22271f" }}>Open item</div>
              <div style={{ fontSize: 14, color: "#6b7a60", marginTop: 6, lineHeight: 1.5 }}>Something not on the menu. Your PIN is recorded against the price you key.</div>
              <input value={openAsk.name} onChange={(e) => setOpenAsk({ ...openAsk, name: e.target.value.slice(0, 60), err: "" })}
                autoFocus placeholder="What is it?"
                style={{ width: "100%", boxSizing: "border-box", marginTop: 16, padding: "13px 15px", fontSize: 17, borderRadius: 12, border: "1px solid #e2e8f0", background: "#f8fafc", fontFamily: "'Poppins',sans-serif" }} />
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <input value={openAsk.price} onChange={(e) => setOpenAsk({ ...openAsk, price: e.target.value.replace(/[^0-9.]/g, "").slice(0, 7), err: "" })}
                  inputMode="decimal" placeholder={"Price " + currencySymbol().trim()}
                  style={{ flex: 2, minWidth: 0, boxSizing: "border-box", padding: "13px 15px", fontSize: 19, fontWeight: 700, textAlign: "center", borderRadius: 12, border: "1px solid " + (openAsk.price !== "" && !priceOk ? "#c94a4a" : "#e2e8f0"), background: "#f8fafc", fontFamily: "'Poppins',sans-serif" }} />
                <input value={openAsk.qty} onChange={(e) => setOpenAsk({ ...openAsk, qty: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                  inputMode="numeric" placeholder="Qty"
                  style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "13px 15px", fontSize: 19, fontWeight: 700, textAlign: "center", borderRadius: 12, border: "1px solid #e2e8f0", background: "#f8fafc", fontFamily: "'Poppins',sans-serif" }} />
              </div>
              <input value={openAsk.pin} onChange={(e) => setOpenAsk({ ...openAsk, pin: e.target.value.replace(/\D/g, "").slice(0, 8), err: "" })}
                inputMode="numeric" type="password" placeholder="Your PIN"
                style={{ width: "100%", boxSizing: "border-box", marginTop: 10, padding: "13px 15px", fontSize: 20, letterSpacing: ".3em", textAlign: "center", borderRadius: 12, border: "1px solid #e2e8f0", background: "#f8fafc", fontFamily: "'Poppins',sans-serif" }} />
              {openAsk.price !== "" && !priceOk && <div style={{ color: "#b4462f", fontSize: 13.5, marginTop: 10, fontWeight: 600 }}>Price must be between {gbp(0)} and {gbp(500)}.</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <span onClick={() => setOpenAsk(null)} style={{ flex: 1, textAlign: "center", padding: "14px 0", borderRadius: 12, background: "#f1f5f9", color: "#22271f", fontWeight: 800, cursor: "pointer" }}>Cancel</span>
                <span onClick={add} style={{ flex: 1, textAlign: "center", padding: "14px 0", borderRadius: 12, background: ready ? "#22271f" : "#cbd5e1", color: "#fff", fontWeight: 800, cursor: ready ? "pointer" : "default" }}>Add{priceOk && openAsk.price !== "" ? " " + gbp(px * Math.max(1, parseInt(openAsk.qty) || 1)) : ""}</span>
              </div>
            </div>
          </div>
        );
      })()}
      {paidBanner && (
        <div onClick={() => setPaidBanner(null)}
          style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
            background: "linear-gradient(140deg,#3E8E75,#2E7D68)", color: "#fff", borderRadius: 14,
            padding: "14px 26px", boxShadow: "0 10px 30px rgba(15,46,41,.35)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>✓</span>
          <span>
            <span style={{ display: "block", fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>
              {paidBanner.label} paid — {gbp(paidBanner.total)}
            </span>
            <span style={{ display: "block", fontSize: 12.5, opacity: .85, marginTop: 2 }}>
              {paidBanner.method === "cash" ? "Cash" : paidBanner.method === "card" ? "Card" : "Payment"} taken
            </span>
          </span>
        </div>
      )}

      {/* ── THREE COLUMNS — categories over orders · items · order panel ── */}
      <div style={{ display: "grid", gridTemplateColumns: "clamp(230px,15vw,340px) minmax(0,1fr) clamp(300px,20vw,470px) clamp(148px,10vw,215px)", gridTemplateRows: "minmax(0,1fr) auto", gap: 9, padding: 9, flex: 1, minHeight: 0 }}>

        {/* 1 — CATEGORIES (top) over ORDERS (below) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9, minHeight: 0, gridColumn: 1, gridRow: 1 }}>
          <div style={{ background: P.panel, border: "1px solid " + P.line, borderRadius: 12, padding: 8, boxShadow: "0 1px 3px rgba(34,39,31,.05)", display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
            <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gridAutoRows: CS.row, gap: 5, alignContent: "start" }}>
              {arrange(subs, "cat:" + (master ? master.id : "")).map((sc) => {
                const i = subs.indexOf(sc);
                const on = activeSub === i && !search;
                const scc = catColor(sc.name + " " + (master ? master.name : ""));
                return (
                  <div key={sc.id}
                    draggable={editLayout}
                    onDragStart={() => setDragKey(sc.id)}
                    onDragOver={(e) => { if (editLayout) e.preventDefault(); }}
                    onDrop={(e) => { if (!editLayout) return; e.preventDefault(); reorder("cat:" + (master ? master.id : ""), arrange(subs, "cat:" + (master ? master.id : "")), dragKey, sc.id); setDragKey(null); }}
                    className="cb-tap"
                    onPointerDown={editLayout ? undefined : tapFeedback}
                    onClick={() => { if (editLayout) return; setActiveSub(i); setSearch(""); }} title={sc.name}
                    style={{ borderRadius: 10, padding: "clamp(10px," + CS.pad + ",26px) clamp(11px,1vw,18px)", cursor: editLayout ? "grab" : "pointer",
                      ...spanStyle(sc.id, CAT_DEF), position: "relative",
                      display: "flex", alignItems: "center", opacity: dragKey === sc.id ? .45 : 1,
                      fontSize: "calc(clamp(11px," + CS.font + ",20px) * " + Math.min(spanScale(sc.id, CAT_DEF), 1.35) + ")", fontWeight: on ? 800 : 700, lineHeight: 1.25, letterSpacing: "-.01em",
                      background: on ? P.masterBg : scc.bg,
                      color: on ? "#fff" : scc.ink,
                      borderLeft: "5px solid " + (on ? P.masterMuted : scc.bar),
                      boxShadow: on ? "0 4px 12px rgba(15,46,41,.28)" : "none" }}>
                    {editLayout && (
                      <span
                        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); cycleSpan(sc.id, CAT_DEF); }}
                        draggable={false} title="Resize this tile"
                        style={{ position: "absolute", top: 3, right: 4, zIndex: 3, background: P.tealDeep, color: "#fff", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 800, cursor: "pointer", touchAction: "none" }}>
                        {spanOf(sc.id, CAT_DEF).w}×{spanOf(sc.id, CAT_DEF).h}
                      </span>
                    )}
                    <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {sc.posName || sc.name}
                    </span>
                  </div>
                );
              })}
              {subs.length === 0 && cats !== null && <div style={{ color: P.muted2, fontSize: 12.5, textAlign: "center", marginTop: 16 }}>No categories</div>}
            </div>
            {/* Search sits at the foot of the categories, where the hand
                already is after choosing one. */}
            <div style={{ marginTop: 7, paddingTop: 8, borderTop: "1px solid " + P.line2, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, background: P.canvas, border: "1px solid " + P.line, borderRadius: 11, padding: "0 13px" }}>
                <span style={{ fontSize: 18, color: P.muted2 }}>⌕</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search"
                  style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", padding: "clamp(12px,1vw,18px) 0", fontSize: "clamp(13px,1vw,18px)", color: P.ink, fontFamily: "inherit" }} />
                {search && <span onClick={() => setSearch("")} style={{ fontSize: 18, color: P.muted2, cursor: "pointer" }}>×</span>}
              </div>
            </div>
          </div>

        </div>

        {/* 2 — MASTER MENUS over the ITEM GRID. The menus sit above the items
             they filter, not across the whole screen, so the category column
             and the cart both start at the top of the display. */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, gridColumn: 2, gridRow: 1 }}>
          <div style={{ flexShrink: 0, background: P.masterBg, borderRadius: 12, padding: "8px 9px", display: "flex", gap: 7, alignItems: "center", marginBottom: 9, boxShadow: "0 2px 10px rgba(15,46,41,.2)", overflowX: "auto" }}>
            {catList.map((m, i) => {
              const on = activeCat === i;
              return (
                <div key={m.id} className="cb-tap" onPointerDown={tapFeedback}
                  onClick={() => { setActiveCat(i); setActiveSub(0); setSearch(""); }} title={m.name}
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", flexShrink: 0,
                    padding: "clamp(11px,.9vw,17px) clamp(15px,1.3vw,26px)", borderRadius: 11,
                    fontSize: "clamp(12px,.95vw,18px)", fontWeight: on ? 800 : 700,
                    background: on ? grad : "rgba(94,234,212,.09)",
                    color: on ? "#fff" : P.masterMuted,
                    boxShadow: on ? "0 4px 12px rgba(13,148,136,.4)" : "none" }}>
                  <span style={{ display: "flex", height: "clamp(16px,1.25vw,23px)" }}>{menuIcon(m.name, on)}</span>
                  {m.posName || m.name}
                </div>
              );
            })}
          </div>

          {showGroups ? (
            <div style={{ flex: 1, padding: "2px 20px 20px", overflowY: "auto" }}>
              {sub.groups.map((g, gi) => (
                <div key={gi} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 9, margin: "6px 2px 11px" }}>
                    <span title={g.name} style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.2px" }}>{g.posName || g.name}</span>
                    <span style={{ fontSize: 13.5, color: P.muted2 }}>{g.items.length}</span>
                    <span style={{ flex: 1, height: 1, background: P.line, marginLeft: 4 }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: gridCols, gridAutoRows: "clamp(72px," + IS.h + ",170px)", gap: 10 }}>
                    {arrange(g.items, "item:" + (sub ? sub.id : "all") + ":" + gi).map((it) => renderTile(it, "item:" + (sub ? sub.id : "all") + ":" + gi))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ flex: 1, padding: "2px 20px 20px", display: "grid", gridTemplateColumns: gridCols, gridAutoRows: "clamp(72px," + IS.h + ",170px)", gap: 10, overflowY: "auto" }}>
              {cats === null && <div style={{ color: P.muted2 }}>Loading menu…</div>}
              {cats && shown.length === 0 && <div style={{ color: P.muted2 }}>No items.</div>}
              {arrange(shown, "item:" + (sub ? sub.id : "all")).map((it) => renderTile(it))}
            </div>
          )}

          {/* Layout size controls — open just above the till-actions strip. */}
          {editLayout && (
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "#fff", border: "1px solid " + P.line, borderRadius: 12, padding: "8px 12px", marginTop: 9 }}>
              {[["Categories", "catSize", catSize], ["Items", "itemSize", itemSize]].map(([label, key, cur]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "clamp(11px,.82vw,14px)", fontWeight: 700, color: P.muted }}>{label}</span>
                  {["s", "m", "l"].map((z) => (
                    <span key={z} onClick={() => saveLayout({ ...layout, [key]: z })}
                      style={{ width: 34, textAlign: "center", padding: "7px 0", borderRadius: 8, cursor: "pointer",
                        fontSize: "clamp(11px,.8vw,14px)", fontWeight: 800,
                        background: cur === z ? P.tealDeep : "#fff", color: cur === z ? "#fff" : P.muted,
                        border: "1px solid " + (cur === z ? P.tealDeep : P.line) }}>{z.toUpperCase()}</span>
                  ))}
                </div>
              ))}
              <span style={{ fontSize: "clamp(10.5px,.76vw,13px)", color: P.muted2 }}>Drag to rearrange. Tap the badge on a tile to resize it. Saved on this till.</span>
            </div>
          )}
        </div>

        {/* 3 — ORDER PANEL */}
        <div style={{ minWidth: 0, gridColumn: 3, gridRow: "1 / 3", background: P.panel, border: "1px solid " + P.line, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 1px 3px rgba(34,39,31,.05)" }}>
          {selOrderId && ((payNowOrder && payNowOrder.id === selOrderId) || (orders || []).some((o) => o.id === selOrderId)) ? (
            <OrderDetailPanel onDiscount={applyDiscount} onRemoveDiscount={removeDiscount} onItemDiscount={applyItemDiscount} onRemoveItemDiscount={removeItemDiscount} onRefund={refundPayment} onPrintRefund={printRefundReceipt} onSetTable={ordSetTable} onVoidOrder={ordVoidOrder} tables={tablesList}
              printingId={printingId}
              order={(payNowOrder && payNowOrder.id === selOrderId) ? payNowOrder : (orders || []).find((o) => o.id === selOrderId)}
              now={now}
              busy={ordersBusy}
              initialMode={selPayNow ? "method" : "detail"}
              onCustomerView={setPanelView}
              onClose={() => {
                const draft = payDraft.current;
                const closing = (payNowOrder && payNowOrder.id === selOrderId) ? payNowOrder : null;
                setSelOrderId(null); setSelPayNow(false); setPayNowOrder(null);
                // Closed the pay screen of an order this till just put on hold,
                // with nothing taken: undo the Pay rather than strand the order.
                if (draft && closing && draft.orderId === closing.id
                    && Number(closing.amount_paid || 0) === 0 && !closing.paid_method) {
                  payDraft.current = null;
                  abandonHold(draft);
                }
              }}
              onTakePayment={async (o, method, amount, extra) => {
                // Split payments came through here unwrapped, so a split that
                // settled the bill neither confirmed nor closed the panel.
                const res = await ordTakePayment(o, method, amount, extra);
                // A part payment has to be written back into the local order
                // the pay-now panel is driven from, or the panel keeps showing
                // the ORIGINAL balance and the second half gets charged at the
                // full amount.
                if (res && res.ok && !res.fully_paid && res.paid != null) {
                  setPayNowOrder((p) => (p && p.id === o.id)
                    ? { ...p, amount_paid: Number(res.paid), is_split: !!res.is_split }
                    : p);
                }
                if (res && res.ok && res.fully_paid) {
                  thankCustomer(o, method, amount, extra);
                  setPaidBanner({ label: o.menu_tables?.label || (o.tablet_no ? "T" + o.tablet_no : "#" + o.order_no), total: o.total, method });
                  try { if (navigator.vibrate) navigator.vibrate([12, 40, 12]); } catch { /* no haptics */ }
                  setSelOrderId(null); setSelPayNow(false); setPayNowOrder(null);
                }
                return res;
              }}
              onPay={async (o, m) => {
                const res = await ordPay(o, m);
                if (res && res.ok && res.fully_paid) {
                  thankCustomer(o, m, null, null);
                  setPaidBanner({ label: o.menu_tables?.label || (o.tablet_no ? "T" + o.tablet_no : "#" + o.order_no), total: o.total, method: m });
                  try { if (navigator.vibrate) navigator.vibrate([12, 40, 12]); } catch { /* no haptics */ }
                  setSelOrderId(null); setSelPayNow(false); setPayNowOrder(null);
                }
                return res;
              }}
              onUnpaid={ordUnpaid}
              onAddItems={(id) => { ordAddItems(id); setSelOrderId(null); setSelPayNow(false); setPayNowOrder(null); }}
              onRemoveItem={ordRemoveItem}
              onSetQty={ordSetQty}
              onSetType={ordSetType}
              onVoidFired={ordVoidFired}
              onReprint={ordReprint}
              onFeedback={(o) => setFeedbackFor(o)}
            />
          ) : (
          <>
          {appendTo && (
            <div style={{ background: "#fff7ed", borderBottom: "1px solid #fed7aa", padding: "10px 18px", display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#f59e0b", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15.5, fontWeight: 700, flexShrink: 0 }}>+</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#9a3412" }}>Adding to an existing order</div>
                <div style={{ fontSize: 13, color: "#c2703a" }}>New items append to the same bill</div>
              </div>
              <span onClick={clearAll} style={{ fontSize: 14, fontWeight: 700, color: "#9a3412", cursor: "pointer", padding: "4px 8px", background: "#fef0e0", borderRadius: 8 }}>Cancel</span>
            </div>
          )}
          <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid " + P.line2 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 17, letterSpacing: "-.3px" }}>{appendTo ? "Extra items" : "Current order"}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {itemCount > 0 && <span style={{ fontSize: 14, color: "#3a5730", background: "#eef4e8", padding: "4px 11px", borderRadius: 20, fontWeight: 700 }}>{itemCount} item{itemCount === 1 ? "" : "s"}</span>}
                {ticket.length > 0 && <span onClick={clearAll} title="Clear order" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1.5px solid #eee", borderRadius: 9, color: "#c94a4a", cursor: "pointer", fontSize: 15 }}>🗑</span>}
              </div>
            </div>
            {!appendTo && (
              <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                {(() => {
                  const kinds = [
                    { key: "dinein", label: table ? table.label : "Dine-in", icon: posIco.table },
                    { key: "takeaway", label: "Takeaway", icon: posIco.takeaway },
                    { key: "phone", label: "Phone", icon: posIco.phone },
                    { key: "web", label: "Web", icon: posIco.web },
                  ];
                  const pick = (k) => {
                    setOrderKind(k);
                    if (k === "dinein") { setShowTablePicker(true); }
                    else { setTable(null); }
                  };
                  return kinds.map((kd) => {
                    const on = orderKind === kd.key;
                    return (
                      <div key={kd.key} onClick={() => pick(kd.key)} title={kd.label}
                        style={{ display: "flex", alignItems: "center", gap: 7, flex: on ? 1 : "0 0 auto", justifyContent: "center", background: on ? "#5E7A4D" : "#eef4e8", color: on ? "#fff" : "#3a5730", border: "1.5px solid " + (on ? "transparent" : "#d4e3c6"), padding: on ? "12px 16px" : "12px", height: 48, boxSizing: "border-box", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {kd.icon(20, on ? "#fff" : "#5E7A4D")}
                        {on && <span>{kd.label}</span>}
                        {on && kd.key === "dinein" && <span style={{ marginLeft: "auto", opacity: .7, fontSize: 13 }}>change ›</span>}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          <div style={{ flex: 1, padding: "6px 18px", overflowY: "auto" }}>
            {ticket.length === 0 && (
              <div style={{ color: P.muted2, textAlign: "center", marginTop: 64, padding: "0 20px" }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#f5f6f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 14px" }}>🧾</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#6b7280" }}>No items yet</div>
                <div style={{ fontSize: 15, color: "#9aa1ac", marginTop: 3 }}>Tap menu items to build the order</div>
              </div>
            )}
            {ticket.map((l) => {
              const hasMods = l.item.modifiers && l.item.modifiers.length;
              return (
                <CartLine key={l.key}
                  line={{ name: l.item.name, qty: l.qty, unitPrice: l.unit, image_url: l.item.image_url, category: l.item.category, mods: l.mods.map((m) => m.name), note: l.note }}
                  onDec={() => setQty(l.key, -1)}
                  onInc={() => setQty(l.key, 1)}
                  onEdit={l.open ? undefined : () => editLine(l)}
                  editLabel={hasMods ? (l.note ? "✎ Edit · note" : "✎ Edit") : (l.note ? "✎ Note" : "+ Note")}
                  onRemove={() => removeLine(l.key)}
                />
              );
            })}
          </div>

          <div style={{ borderTop: "1px solid " + P.line, padding: "15px 18px", background: "#faf9f5" }}>
            {msg && <div style={{ fontSize: 15, textAlign: "center", marginBottom: 10, color: (msg.includes("fail") || msg.includes("Wrong")) ? "#c94a4a" : "#16a34a" }}>{msg}</div>}
            {ticket.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <input type="text" value={orderNote} onChange={(e) => setOrderNote(e.target.value)} placeholder="📝 Order note (e.g. allergy, ring on arrival)…"
                  style={{ width: "100%", boxSizing: "border-box", background: "#fff", border: "1.5px solid " + (orderNote ? "#c2703a" : "#e2e4e8"), borderRadius: 11, padding: "12px 14px", fontSize: 14, color: "#5b5540", fontFamily: "inherit", outline: "none" }} />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15, fontWeight: 700 }}>Total</div>
                {itemCount > 0 && <div style={{ fontSize: 13.5, color: "#9aa1ac", marginTop: 1 }}>{itemCount} item{itemCount === 1 ? "" : "s"}{table ? " · " + table.label : (appendTo ? "" : " · Takeaway")}</div>}
              </div>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: "-.6px", lineHeight: 1 }}>{gbp(subtotal)}</span>
            </div>

            {!appendTo ? (
              <div style={{ display: "flex", gap: 9 }}>
                <div onClick={() => { if (ticket.length && !sending) sendOrder(false); }} style={{ flex: 1, textAlign: "center", padding: "17px 0", borderRadius: 13, background: "#fff", border: "1.5px solid " + (ticket.length ? "#d4d8dd" : "#eceef0"), color: ticket.length ? "#2A2E20" : "#aeb4bd", fontWeight: 700, fontSize: 15, cursor: ticket.length ? "pointer" : "default", opacity: sending ? .6 : 1 }}>{sending ? "…" : "Send to kitchen"}</div>
                <div onClick={() => { if (ticket.length && !sending) sendOrder(true); }} style={{ flex: 1, textAlign: "center", padding: "17px 0", borderRadius: 13, background: ticket.length ? "linear-gradient(140deg,#5E7A4D,#4a6b3a)" : "#d7dade", color: "#fff", fontWeight: 700, fontSize: 16, cursor: ticket.length ? "pointer" : "default", boxShadow: ticket.length ? "0 6px 16px rgba(94,122,77,.34)" : "none", opacity: sending ? .6 : 1 }}>{sending ? "Sending…" : "Pay" + (ticket.length ? " · " + gbp(subtotal) : "")}</div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <div onClick={clearAll} style={{ width: 50, textAlign: "center", padding: "16px 0", borderRadius: 13, background: "#fff", border: "1.5px solid #eee", color: "#616976", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</div>
                <div onClick={() => { if (ticket.length && !sending) sendOrder(false); }} style={{ flex: 1, textAlign: "center", padding: "16px 0", borderRadius: 13, background: ticket.length ? "linear-gradient(140deg,#5E7A4D,#4a6b3a)" : "#d7dade", color: "#fff", fontWeight: 700, fontSize: 16, cursor: ticket.length ? "pointer" : "default", boxShadow: ticket.length ? "0 6px 16px rgba(94,122,77,.34)" : "none", opacity: sending ? .6 : 1 }}>{sending ? "Adding…" : "Add to order"}</div>
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* 4 — ORDERS, far right. A dark column so it reads as its own zone
             next to the light cart: unpaid at the top in warm amber with the
             owed total, settled orders muted beneath. */}
        <div style={{ minWidth: 0, gridColumn: 4, gridRow: "1 / 3", background: P.masterBg, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 1px 3px rgba(15,46,41,.18)" }}>
          <div style={{ flexShrink: 0, padding: "clamp(11px,.9vw,16px) clamp(10px,.8vw,15px) clamp(9px,.7vw,13px)", borderBottom: "1px solid rgba(94,234,212,.14)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ fontSize: "clamp(21px,1.7vw,34px)", fontWeight: 800, color: unpaidOrders.length ? "#F0B27A" : P.masterMuted, lineHeight: 1 }}>{unpaidOrders.length}</span>
              <span style={{ fontSize: "clamp(9.5px,.72vw,13px)", letterSpacing: ".09em", color: P.masterMuted, fontWeight: 700 }}>UNPAID</span>
            </div>
            {unpaidOrders.length > 0 && (
              <div style={{ fontSize: "clamp(13px,1vw,19px)", color: "#F0B27A", fontWeight: 800, marginTop: 4 }}>
                {gbp(unpaidOrders.reduce((t, o) => t + (Number(o.total) || 0), 0))}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "clamp(8px,.65vw,12px)", display: "flex", flexDirection: "column", gap: 6 }}>
            {unpaidOrders.map((o) => {
              const on = selOrderId === o.id;
              const mins = Math.max(0, Math.round((now - new Date(o.created_at).getTime()) / 60000));
              const age = mins < 60 ? mins + "m" : Math.floor(mins / 60) + "h " + (mins % 60) + "m";
              const late = mins >= 75;
              return (
                <div key={o.id} className="cb-tap" onPointerDown={tapFeedback}
                  onClick={() => { setSelPayNow(false); setPayNowOrder(null); setSelOrderId(o.id); }}
                  title={"Order #" + o.order_no}
                  style={{ borderRadius: 11, padding: "clamp(9px,.75vw,14px) clamp(9px,.7vw,13px)", cursor: "pointer",
                    background: on ? grad : "rgba(240,178,122,.11)",
                    borderLeft: "4px solid " + (on ? P.masterMuted : (late ? "#E0685C" : "#F0B27A")),
                    boxShadow: on ? "0 4px 12px rgba(13,148,136,.4)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: "clamp(13px,1.02vw,19px)", fontWeight: 800, color: "#fff", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                      {o.menu_tables?.label || (o.tablet_no ? "T" + o.tablet_no : "#" + o.order_no)}
                    </span>
                    <span style={{ fontSize: "clamp(9px,.7vw,13px)", color: on ? "rgba(255,255,255,.75)" : (late ? "#E0685C" : P.masterMuted), fontWeight: 700, whiteSpace: "nowrap" }}>{age}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 3 }}>
                    <span style={{ fontSize: "clamp(9.5px,.72vw,13px)", color: on ? "rgba(255,255,255,.6)" : "rgba(94,234,212,.6)", flex: 1 }}>#{o.order_no}</span>
                    <span style={{ fontSize: "clamp(12px,.95vw,18px)", fontWeight: 800, color: on ? "#fff" : "#F0B27A", fontVariantNumeric: "tabular-nums" }}>{gbp(o.total)}</span>
                  </div>
                </div>
              );
            })}

            {unpaidOrders.length === 0 && (
              <div style={{ fontSize: "clamp(11px,.82vw,15px)", color: P.masterMuted, textAlign: "center", padding: "18px 6px", lineHeight: 1.5, opacity: .8 }}>
                Everything paid
              </div>
            )}

            {paidOrders.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "9px 2px 1px" }}>
                <span style={{ fontSize: "clamp(9px,.68vw,12px)", letterSpacing: ".09em", color: "rgba(94,234,212,.5)", fontWeight: 700 }}>PAID</span>
                <span style={{ flex: 1, height: 1, background: "rgba(94,234,212,.14)" }} />
                <span style={{ fontSize: "clamp(9px,.68vw,12px)", color: "rgba(94,234,212,.4)" }}>{paidOrders.length}</span>
              </div>
            )}
            {paidOrders.slice(0, 30).map((o) => {
              const on = selOrderId === o.id;
              return (
                <div key={o.id} onClick={() => { setSelPayNow(false); setPayNowOrder(null); setSelOrderId(o.id); }}
                  title={"Order #" + o.order_no}
                  style={{ borderRadius: 10, padding: "clamp(8px,.62vw,12px) clamp(9px,.7vw,13px)", cursor: "pointer",
                    display: "flex", alignItems: "baseline", gap: 6,
                    background: on ? grad : "rgba(255,255,255,.04)",
                    borderLeft: "4px solid " + (on ? P.masterMuted : "rgba(94,234,212,.22)") }}>
                  <span style={{ fontSize: "clamp(11.5px,.88vw,17px)", fontWeight: 700, color: on ? "#fff" : "#BFD6D0", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.menu_tables?.label || (o.tablet_no ? "T" + o.tablet_no : "#" + o.order_no)}
                  </span>
                  <span style={{ fontSize: "clamp(11px,.85vw,16px)", fontWeight: 700, color: on ? "rgba(255,255,255,.85)" : "rgba(191,214,208,.65)", fontVariantNumeric: "tabular-nums" }}>{gbp(o.total)}</span>
                </div>
              );
            })}
          </div>
          {/* Open item — something not on the menu. At the foot of the orders
              column so the basket keeps its space for lines and Pay. */}
          <div style={{ flexShrink: 0, padding: "clamp(8px,.65vw,12px)", borderTop: "1px solid rgba(94,234,212,.14)" }}>
            <div className="cb-tap" onPointerDown={tapFeedback} onClick={() => setOpenAsk({ name: "", price: "", qty: 1, pin: openPin, err: "" })} title="Open item — something not on the menu"
              style={{ textAlign: "center", padding: "clamp(11px,.9vw,17px) 6px", borderRadius: 11, border: "1.5px dashed rgba(94,234,212,.45)", color: P.masterMuted, background: "rgba(94,234,212,.08)", fontSize: "clamp(12px,.92vw,18px)", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
              + Open item
            </div>
          </div>
        </div>

        {/* TILL ACTIONS — a strip under the categories and items (it stops at
             the basket, which keeps the full height) in the same style as the
             master menus on top: team today, shift, drawer, cash, close till,
             and More for everything else. */}
        {(() => {
          const vw = viewW / zoom, wide = vw >= 1600;
          const sh = shift && shift.enabled !== false ? shift.shift : undefined;
          const t = (iso) => { try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
          const shiftLabel = sh === undefined ? null : !sh ? "Start shift" : sh.status === "counting" ? "Counting" : String(sh.opened_by || "").split(" ")[0] + (vw >= 1250 ? " · since " : " · ") + t(sh.opened_at);
          const pill = (key, icon, label, onClick, o = {}) => (
            <div key={key} className="cb-tap" onPointerDown={tapFeedback} onClick={onClick} title={o.title || label}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", flexShrink: o.shrink ? 1 : 0, minWidth: 0,
                padding: "clamp(11px,.9vw,17px) clamp(10px,1vw,24px)", borderRadius: 11,
                fontSize: "clamp(12px,.92vw,18px)", fontWeight: o.on ? 800 : 700,
                background: o.on ? grad : o.bg || "rgba(94,234,212,.09)",
                color: o.on ? "#fff" : o.color || P.masterMuted,
                border: o.dashed ? "1.5px dashed rgba(253,224,71,.55)" : "1.5px solid transparent",
                boxShadow: o.on ? "0 4px 12px rgba(13,148,136,.4)" : "none" }}>
              <span style={{ fontSize: "clamp(14px,1.1vw,20px)", lineHeight: 1, flexShrink: 0 }}>{icon}</span>{label && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
            </div>
          );
          return (
            <div style={{ flexShrink: 0, background: P.masterBg, borderRadius: 12, padding: "8px 9px", display: "flex", gap: 6, alignItems: "center", gridColumn: "1 / 3", gridRow: 2, minWidth: 0, boxShadow: "0 2px 10px rgba(15,46,41,.2)", position: "relative", zIndex: 30 }}>
              {barTeam && barTeam(Math.min(2, (vw >= 1600 ? 0 : vw >= 1250 ? 1 : 2) + (barKit && barKit.views && barKit.views.length ? 1 : 0)))}
              {shiftLabel && pill("shift", "◷", shiftLabel, () => { loadShift(); setShiftOpen(true); },
                { color: "#fde68a", bg: sh ? "rgba(253,224,71,.10)" : "rgba(253,224,71,.16)", dashed: !sh })}
              {pill("drawer", "⇥", wide ? "Open drawer" : "Drawer", () => setDrawerAsk({ pin: "", busy: false, err: "" }), { color: "#cbd5e1", bg: "rgba(148,163,184,.12)" })}
              {pill("cash", currencySymbol().trim(), "Cash", () => setCashOpen(true), { color: "#fdba74", bg: "rgba(253,186,116,.12)" })}
              {pill("close", "✓", "Close till", openCloseTill)}
              {editLayout && pill("layout", "✓", "Done", () => setEditLayout(false), { on: true, title: "Finish arranging" })}
              <StripTools kit={barKit} extra={editLayout ? [
                { k: "stock", icon: "⊘", label: "Items on/off", tile: "Items on/off", onClick: () => setStockOpen(true) },
                { k: "printers", icon: "🖨", label: "Printers", tile: "Printer setup", onClick: () => setPrinterAsk(true) },
                { k: "merge", icon: "⇱", label: "Merge", tile: "Merge categories", onClick: () => setShowMerge(true) },
              ] : [
                { k: "stock", icon: "⊘", label: "Items on/off", tile: "Items on/off", onClick: () => setStockOpen(true) },
                { k: "printers", icon: "🖨", label: "Printers", tile: "Printer setup", onClick: () => setPrinterAsk(true) },
                { k: "layout", icon: "⇕", label: "Layout", tile: "Arrange tiles", onClick: () => setEditLayout(true) },
                { k: "merge", icon: "⇱", label: "Merge", tile: "Merge categories", onClick: () => setShowMerge(true) },
              ]} />
            </div>
          );
        })()}
      </div>


      {mgrAsk && mgrAsk.kind === "unpaid" && (
        <ManagerPin title={"Undo payment on #" + mgrAsk.order.order_no}
          sub="The payment stays on record with a matching reversal. Only for a payment taken in this shift — otherwise refund it."
          reasons={["Wrong payment type", "Paid twice", "Customer changed mind", "Rung up by mistake"]}
          confirmLabel="Undo payment"
          onClose={() => setMgrAsk(null)}
          onSubmit={async (manager_pin, reason) => {
            const r = await ordActionJson("mark_unpaid", { order_id: mgrAsk.order.id, manager_pin, reason });
            if (r && r.ok) { setMsg("Payment undone on #" + mgrAsk.order.order_no); return null; }
            return (r && (r.message || r.error)) || "Couldn't undo the payment.";
          }} />
      )}
      {mgrAsk && mgrAsk.kind === "xread" && (
        <ManagerPin title="Print X read" sub="The X read shows the cash taken so far, so it needs a manager."
          confirmLabel="Print" onClose={() => setMgrAsk(null)} onSubmit={(p) => doPrintXRead(p)} />
      )}

      {cashOpen && <CashSheet loc={loc} act={ordActionJson} onClose={() => setCashOpen(false)} />}
      {printerAsk && (
        <ManagerPin title="Printer setup" sub="Add, rename, test and set up this store's printers. Manager PIN needed." confirmLabel="Open"
          onClose={() => setPrinterAsk(false)}
          onSubmit={async (pin) => {
            const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, device: deviceToken(), action: "printer_list", data: { manager_pin: pin } }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.ok === false) return j.message || j.error || "That PIN can't open printer setup.";
            let name = "This store";
            try { const lr = await fetch(SUPABASE_URL + "/rest/v1/menu_locations?select=id,name&id=eq." + loc, { headers: H }); const rows = lr.ok ? await lr.json() : []; if (rows[0] && rows[0].name) name = rows[0].name; } catch {}
            setStoreLoc({ id: loc, name }); setPrinterPin(pin);
            return null;
          }} />
      )}
      {printerPin && storeLoc && <PrintersModal call={printerCall} locations={[storeLoc]} zIndex={96} onClose={() => { setPrinterPin(null); setStoreLoc(null); }} />}
      {stockOpen && <StockSheet loc={loc} onClose={() => setStockOpen(false)} onChanged={() => setMenuTick((t) => t + 1)} />}

      {shiftOpen && shift && (
        <ShiftSheet loc={loc} status={shift} act={ordActionJson} onClose={() => setShiftOpen(false)} onChanged={() => { loadShift(); window.dispatchEvent(new Event("pos:shift-changed")); }} />
      )}

      {/* CLOSE TILL — guided closing report: Review → Cash → Sign off → Done */}
      {closeTill && (() => {
        // Notes and coins of whatever the store takes. UK stores get the same
        // twelve buttons they have always had.
        const DENOMS = denominations();
        const dLabel = denomLabel;
        const denomTotal = Math.round(DENOMS.reduce((t, d) => t + d * (Number(closeTill.denoms?.[d]) || 0), 0) * 100) / 100;
        const denomsTouched = Object.values(closeTill.denoms || {}).some((v) => v !== "" && v != null);
        const countedVal = closeTill.countMode === "denoms" ? (denomsTouched ? denomTotal : null) : (closeTill.counted === "" ? null : Number(closeTill.counted));
        const sm = closeTill.summary;
        // The day's float as the till knows it (the server has the final say in close_preview).
        const knownFloatStr = closeTill.floatKnown != null ? closeTill.floatKnown : "";
        const flt = closeTill.floatEdit ? (closeTill.float === "" ? 0 : Number(closeTill.float)) : Number(knownFloatStr || 0);
        // Cash dropped to the safe at shift handovers has left the drawer.
        const dropped = sm ? Number(sm.cash_dropped || 0) : 0;
        // Blind: figures come from the server's check of THIS count (pv), never before it.
        const pvKey = countedVal + "|" + (closeTill.floatEdit ? closeTill.float : "") + "|" + closeTill.mode;
        const pv = closeTill.preview && closeTill.preview.key === pvKey ? closeTill.preview : null;
        const expected = pv ? Number(pv.expected) : null;
        const variance = pv ? Number(pv.variance) : null;
        const VARIANCE_NOTE_FROM = varianceNoteFrom(); // beyond this a note is required
        // TILL UI 2026-10-25 — the close uses the same sheet, keypads, note and
        // coin tiles and result banners as Shift and Cash. Logic unchanged.
        const C = { ink: U.ink, muted: U.sub, line: U.line, soft: U.soft, brand: U.teal, good: U.good, bad: U.bad, over: U.over, warn: U.warn };
        const F = FONT;
        const typeLabel = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery", collection: "Collection" };
        const fmtT = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
        const fmtD = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "";
        const delta = (a, b) => { if (b == null) return null; const d = Math.round((a - b) * 100) / 100; const pct = b ? Math.round((d / b) * 100) : null; return { d, pct }; };
        const Section = ({ title, right, children, style }) => (
          <div style={{ marginTop: 20, ...style }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10 }}>
              <TLabel style={{ marginBottom: 0 }}>{title}</TLabel>{right}
            </div>
            {children}
          </div>
        );
        const Line = ({ l, v, sub, strong, color }) => (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "9px 2px", borderBottom: "1px solid " + C.line, fontSize: strong ? 16.5 : 14.5, fontWeight: strong ? 800 : 500, color: color || C.ink }}>
            <span style={{ color: color || (strong ? C.ink : C.muted) }}>{l}{sub && <span style={{ fontSize: 12.5, color: U.faint, marginLeft: 6 }}>{sub}</span>}</span><span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{v}</span>
          </div>
        );
        const Bar = ({ label, value, max, right, share }) => (
          <div style={{ display: "grid", gridTemplateColumns: "96px 1fr 40px auto", gap: 10, alignItems: "center", padding: "5px 0", fontSize: 13.5 }}>
            <span style={{ color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 600 }}>{label}</span>
            <div style={{ height: 10, background: "#eef0f3", borderRadius: 5, overflow: "hidden" }}><div style={{ width: (max ? Math.max(3, (value / max) * 100) : 0) + "%", height: "100%", background: "linear-gradient(90deg," + U.tealL + "," + U.teal + ")", borderRadius: 5, transition: "width .4s" }} /></div>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: U.teal, textAlign: "right", ...NUM }}>{share != null ? share + "%" : ""}</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{right}</span>
          </div>
        );
        const Alert = ({ tone, children }) => (
          <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14, color: tone === "bad" ? U.bad : U.warn, background: tone === "bad" ? U.badBg : U.warnBg, boxShadow: "inset 0 0 0 1.5px " + (tone === "bad" ? "#fecaca" : U.amber), borderRadius: 14, padding: "12px 14px", lineHeight: 1.5 }}>
            <span style={{ width: 24, height: 24, borderRadius: 12, background: tone === "bad" ? U.bad : U.warn, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>!</span>
            <div>{children}</div>
          </div>
        );
        const Seg = ({ options, value, onPick }) => (
          <div style={{ display: "flex", gap: 4, background: U.soft, borderRadius: 12, padding: 4 }}>
            {options.map(([m, l]) => <div key={m} className="tu-btn" onClick={() => onPick(m)} style={{ padding: "8px 13px", borderRadius: 9, fontSize: 13.5, fontWeight: 800, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", background: value === m ? "#fff" : "transparent", color: value === m ? U.ink : U.sub, boxShadow: value === m ? "0 1px 3px rgba(18,21,28,.12)" : "none" }}>{l}</div>)}
          </div>
        );
        const input = (extra) => ({ display: "block", width: "100%", boxSizing: "border-box", padding: "13px 14px", fontSize: 15, fontWeight: 500, border: "2px solid " + C.line, borderRadius: 14, outline: "none", fontFamily: "inherit", background: "#fff", ...extra });
        const stages = ["Review", "Cash", "Sign off"];
        const stage = closeTill.step === "done" ? 3 : closeTill.stage;
        const varianceNeedsNote = !!(pv && pv.note_needed) && !closeTill.note.trim();
        const closer = closeTill.staff && closeTill.staff.name ? closeTill.staff.name : null;
        const signoffOk = closeTill.pin.length >= 4 && !varianceNeedsNote;
        const Btn = ({ primary, grow, ...p }) => <TBtn kind={primary ? "primary" : "secondary"} grow={grow || 1} {...p} />;
        const shut = () => { if (closeTill.busy) return; setNoteKb(false); setPadFor(null); setCloseTill(null); };
        const when = sm && sm.first_order ? (() => {
          const a = new Date(sm.first_order), b = new Date(sm.last_order || sm.first_order);
          const sameDay = a.toDateString() === b.toDateString();
          const short = (d) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
          return sameDay ? fmtD(sm.first_order) + " · " + fmtT(sm.first_order) + " – " + fmtT(sm.last_order)
            : short(a) + " " + fmtT(sm.first_order) + " – " + short(b) + " " + fmtT(sm.last_order);
        })() + (sm.mode === "trading_day" ? " · trading day to 04:00" : "") : "Closing report";
        const vs = (x) => (x.d >= 0 ? "▲ " : "▼ ") + gbp(Math.abs(x.d));
        const mmss = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");

        // ---------------- body ----------------
        let body = null;
        if (closeTill.busy && !sm) body = (
          <div aria-label="Loading the day's figures">
            <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr 1fr 1fr", gap: 10 }}>
              <Skeleton h={104} r={18} /><Skeleton h={104} r={18} /><Skeleton h={104} r={18} /><Skeleton h={104} r={18} />
            </div>
            <Skeleton h={44} style={{ marginTop: 10 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginTop: 22 }}>
              <div style={{ display: "grid", gap: 10 }}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={18} w={(92 - i * 6) + "%"} />)}</div>
              <Skeleton h={130} />
            </div>
            <div style={{ textAlign: "center", color: C.muted, fontWeight: 600, fontSize: 14, marginTop: 22 }}>Loading the day's figures…</div>
          </div>
        );
        else if (closeTill.err && !sm) body = <div style={{ padding: "50px 0" }}><TillErr>{closeTill.err}</TillErr></div>;

        // ---- STAGE 0: REVIEW ----
        else if (sm && closeTill.step === "summary" && stage === 0) body = (
          <>
            {sm.mode === "trading_day" && sm.later_count > 0 && (
              <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: C.muted, background: U.soft, borderRadius: 12, padding: "9px 13px" }}><TillIcon.clock size={16} />{sm.later_count} order{sm.later_count === 1 ? "" : "s"} since 4:00 stay open for today's trade.</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr 1fr 1fr", gap: 10 }}>
              {pv
                ? <Stat big tone="dark" icon={<TillIcon.cash size={15} />} label="Total taken" money={sm.total}
                    note={[sm.previous && vs(delta(sm.total, sm.previous.total)) + " vs last close", sm.last_week && (() => { const x = delta(sm.total, sm.last_week.total); return vs(x) + (x.pct != null ? " (" + Math.abs(x.pct) + "%)" : "") + " vs last " + new Date(sm.last_week.closed_at).toLocaleDateString("en-GB", { weekday: "short" }); })()].filter(Boolean).join(" · ") || null} />
                : <Stat big tone="dark" icon={<TillIcon.lock size={15} />} label="Total taken" value={<span style={{ fontSize: 19, letterSpacing: 0 }}>After the cash count</span>} note="Blind close — count first" />}
              <Stat label="Orders" value={String(sm.order_count)} note={sm.cancelled_count ? sm.cancelled_count + " cancelled" : (sm.last_week ? "last wk " + sm.last_week.orders : null)} />
              <Stat label="Avg order" money={sm.avg_ticket} note={sm.items_sold ? sm.items_sold + " items sold" : null} />
              <Stat label="Busiest hour" value={sm.peak_hour ? sm.peak_hour.hour + ":00" : "—"} note={sm.peak_hour ? gbp(sm.peak_hour.amount) + " · " + sm.peak_hour.count + " orders" : null} />
            </div>
            {sm.kitchen && sm.kitchen.tickets > 0 && (
              <div style={{ marginTop: 10, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", background: U.soft, borderRadius: 14, padding: "11px 15px", fontSize: 14 }}>
                <TLabel style={{ marginBottom: 0 }}>Kitchen</TLabel>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 70, height: 8, borderRadius: 4, background: "#e5e7eb", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: sm.kitchen.on_time_pct + "%", background: sm.kitchen.on_time_pct >= 80 ? U.good : sm.kitchen.on_time_pct >= 60 ? "#f59e0b" : U.bad }} /></span>
                  <b>{sm.kitchen.on_time_pct}%</b> on time at {sm.kitchen.target_min} min
                </span>
                <span>typical <b style={NUM}>{mmss(sm.kitchen.median_secs)}</b></span>
                <span>90th pct <b style={NUM}>{mmss(sm.kitchen.p90_secs)}</b></span>
                <span style={{ color: C.muted, marginLeft: "auto" }}>{sm.kitchen.tickets} tickets</span>
              </div>
            )}
            {/* Ready to close? — the things that stop or spoil a close, at a glance. */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 }}>
              <TLabel style={{ marginBottom: 0, marginRight: 4 }}>Ready to close?</TLabel>
              {sm.unpaid_count > 0 ? <CheckChip state="warn">{sm.unpaid_count} unpaid order{sm.unpaid_count === 1 ? "" : "s"}</CheckChip> : <CheckChip>All orders paid</CheckChip>}
              {(sm.shifts || []).some((x) => x.status === "counting") ? <CheckChip state="bad">Handover being counted</CheckChip>
                : <CheckChip>{(sm.shifts || []).length ? (sm.shifts || []).length + " shift" + ((sm.shifts || []).length === 1 ? "" : "s") + " handed over" : "No handover open"}</CheckChip>}
              {closeTill.xPrinted === true ? <CheckChip>X read printed</CheckChip> : <CheckChip state="todo" onClick={() => printXRead()}>X read — optional</CheckChip>}
            </div>
            {(sm.shifts || []).some((x) => x.status === "counting") && (
              <Alert tone="bad"><b>A shift handover is being counted.</b> Finish it from the Shift button (or tap "Not yet") before closing the till.</Alert>
            )}
            {sm.unpaid_count > 0 && (
              <Alert><b>{sm.unpaid_count} order{sm.unpaid_count === 1 ? "" : "s"} still unpaid — {gbp(sm.unpaid_total)}.</b> {(sm.unpaid || []).slice(0, 6).map((u) => "#" + u.order_no + " (" + gbp(u.due) + ")").join(", ")}{sm.unpaid_count > 6 ? "…" : ""}. Take payment or cancel them before closing, otherwise they'll be archived as unpaid.</Alert>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
              <div>
                <Section title="Tenders">
                  <Line l="Cash" sub={sm.tenders?.cash ? sm.tenders.cash + " payments" : ""} v={pv ? gbp(sm.cash) : <span style={{ color: U.faint, fontWeight: 600 }}>after the count</span>} />
                  <Line l="Card" sub={sm.tenders?.card ? sm.tenders.card + " payments" : ""} v={gbp(sm.card)} />
                  {sm.other > 0 && <Line l="Other" sub={sm.tenders?.other ? sm.tenders.other + " payments" : ""} v={gbp(sm.other)} />}
                  {sm.discount_total > 0 && <Line l="Discounts given" v={"−" + gbp(sm.discount_total)} color={C.muted} />}
                  {sm.refund_total > 0 && <Line l={"Refunds (" + (sm.refund_count || 0) + ")"} v={"−" + gbp(sm.refund_total)} color={U.bad} />}
                  {sm.cancelled_total > 0 && <Line l={"Cancelled (" + sm.cancelled_count + ")"} v={gbp(sm.cancelled_total)} color={C.muted} />}
                  <Line l="Total taken" v={pv ? gbp(sm.total) : <span style={{ color: U.faint, fontWeight: 600 }}>after the count</span>} strong />
                </Section>
                <Section title="Orders by type">
                  {(() => { const e = Object.entries(sm.by_type || {}).sort((a, b) => b[1].amount - a[1].amount); const max = e[0]?.[1].amount || 0; const tot = e.reduce((t, [, v]) => t + Number(v.amount || 0), 0); return e.map(([k, v]) => <Bar key={k} label={typeLabel[k] || k} value={v.amount} max={max} share={tot ? Math.round((v.amount / tot) * 100) : null} right={v.count + " · " + gbp(v.amount)} />); })()}
                </Section>
                {Object.keys(sm.by_source || {}).length > 1 && (
                  <Section title="By source">
                    {(() => { const e = Object.entries(sm.by_source || {}).sort((a, b) => b[1].amount - a[1].amount); const max = e[0]?.[1].amount || 0; const tot = e.reduce((t, [, v]) => t + Number(v.amount || 0), 0); return e.map(([k, v]) => <Bar key={k} label={k} value={v.amount} max={max} share={tot ? Math.round((v.amount / tot) * 100) : null} right={v.count + " · " + gbp(v.amount)} />); })()}
                  </Section>
                )}
              </div>
              <div>
                <Section title="Sales by hour">
                  {(() => {
                    const hrs = Object.entries(sm.by_hour || {}).sort((a, b) => a[0].localeCompare(b[0]));
                    const max = Math.max(1, ...hrs.map(([, v]) => v.amount));
                    return (
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 112, padding: "0 2px", background: "linear-gradient(180deg,transparent 0 24px," + U.soft + " 24px)", borderRadius: 12, paddingTop: 4 }}>
                        {hrs.map(([h, v]) => {
                          const peak = sm.peak_hour && sm.peak_hour.hour === h;
                          return (
                            <div key={h} title={h + ":00 · " + v.count + " orders · " + gbp(v.amount)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 }}>
                              {peak && <span style={{ fontSize: 10, fontWeight: 800, color: U.teal, ...NUM }}>{gbp(v.amount).replace(/\.\d+$/, "")}</span>}
                              <div style={{ width: "100%", height: Math.max(3, (v.amount / max) * 72), background: peak ? "linear-gradient(180deg," + U.tealL + "," + U.teal + ")" : "#c7ece6", borderRadius: "4px 4px 2px 2px", transition: "height .4s" }} />
                              <span style={{ fontSize: 10, color: peak ? U.ink : C.muted, fontWeight: peak ? 800 : 500, ...NUM }}>{h}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </Section>
                <Section title="Top sellers">
                  {(sm.top_items || []).slice(0, 7).map((it, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid " + C.line, fontSize: 14 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 7, background: i === 0 ? U.ink : U.soft, color: i === 0 ? "#fff" : C.muted, fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b style={{ marginRight: 7, ...NUM }}>{it.qty}×</b>{it.name}</span>
                      <span style={{ color: C.muted, fontWeight: 700, ...NUM }}>{gbp(it.sales)}</span>
                    </div>
                  ))}
                  {!(sm.top_items || []).length && <div style={{ fontSize: 13.5, color: C.muted }}>No items</div>}
                </Section>
              </div>
            </div>
          </>
        );

        // ---- STAGE 1: CASH (blind) ----
        else if (sm && closeTill.step === "summary" && stage === 1) body = (() => {
          const isDenoms = closeTill.countMode === "denoms";
          const target = padFor || (isDenoms ? { kind: "denom", d: DENOMS[0] } : { kind: "counted" });
          const curVal = target.kind === "denom" ? String(closeTill.denoms?.[target.d] ?? "")
            : target.kind === "float" ? String(closeTill.float || "") : String(closeTill.counted || "");
          const setVal = (t, next) => setCloseTill((c) => t.kind === "denom"
            ? { ...c, denoms: { ...(c.denoms || {}), [t.d]: next } }
            : t.kind === "float" ? { ...c, float: next } : { ...c, counted: next });
          const goNext = () => {
            if (target.kind === "denom") {
              const i = DENOMS.indexOf(target.d);
              setPadFor(i >= 0 && i < DENOMS.length - 1 ? { kind: "denom", d: DENOMS[i + 1] } : { kind: "denom", d: DENOMS[0] });
            } else setPadFor(isDenoms ? { kind: "denom", d: DENOMS[0] } : { kind: "counted" });
          };
          const showResult = pv && !padFor;
          const notes = DENOMS.filter((d) => d >= 5), coins = DENOMS.filter((d) => d < 5);
          const part = (list) => Math.round(list.reduce((t, d) => t + d * (Number(closeTill.denoms?.[d]) || 0), 0) * 100) / 100;
          const group = (name, list) => (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <TLabel style={{ marginBottom: 0 }}>{name}</TLabel>
                <span style={{ fontSize: 14, fontWeight: 800, color: part(list) ? U.ink : U.faint, ...NUM }}>{gbp(part(list))}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))", gap: 8 }}>
                {list.map((d) => (
                  <DenomTile key={d} d={d} label={dLabel(d)} count={closeTill.denoms?.[d]} subtotal={(Number(closeTill.denoms?.[d]) || 0) * d} fmt={gbp}
                    active={!showResult && target.kind === "denom" && target.d === d}
                    onSelect={() => setPadFor({ kind: "denom", d })}
                    onStep={(k) => { setPadFor({ kind: "denom", d }); setVal({ kind: "denom", d }, String(Math.max(0, (Number(closeTill.denoms?.[d]) || 0) + k))); }} />
                ))}
              </div>
            </div>
          );
          return (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 330px", gap: 22 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <Seg value={closeTill.countMode} options={[["denoms", "Notes & coins"], ["total", "One total"]]} onPick={(m) => { setCloseTill((c) => ({ ...c, countMode: m })); setPadFor(m === "denoms" ? { kind: "denom", d: DENOMS[0] } : { kind: "counted" }); }} />
                  <span style={{ flex: 1 }} />
                  {isDenoms && denomsTouched && <span className="tu-btn" onClick={() => { setCloseTill((c) => ({ ...c, denoms: {} })); setPadFor({ kind: "denom", d: DENOMS[0] }); }} style={{ fontSize: 14, fontWeight: 800, color: U.bad, cursor: "pointer", padding: "8px 10px" }}>Clear all</span>}
                </div>
                {isDenoms
                  ? <>{group("Notes", notes)}{group("Coins", coins)}</>
                  : <Field label="Cash counted — everything in the drawer, float included" money={Number(closeTill.counted) || 0} active={!showResult && target.kind === "counted"} onClick={() => setPadFor({ kind: "counted" })} />}
                {/* CASH CONTROLS 2026-10-24: the float is the one the day started on.
                    Changing it needs a note and a manager PIN at sign-off. */}
                <div className="tu-tile" onClick={() => closeTill.floatEdit && setPadFor({ kind: "float" })} style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 12, background: closeTill.floatEdit ? U.warnBg : U.soft, borderRadius: 16, padding: "12px 15px", border: "2px solid " + (!showResult && target.kind === "float" ? U.teal : closeTill.floatEdit ? U.amber : "transparent"), cursor: closeTill.floatEdit ? "pointer" : "default" }}>
                  <span style={{ width: 38, height: 38, borderRadius: 11, background: "#fff", border: "1px solid " + C.line, color: closeTill.floatEdit ? U.warn : U.teal, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><TillIcon.drawer size={19} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: closeTill.floatEdit ? U.warn : C.muted }}>{closeTill.floatEdit ? "Actual float — a note and a manager PIN at sign-off" : "Float at the start of the day"}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, ...NUM }}>{closeTill.floatEdit ? (closeTill.float ? gbp(Number(closeTill.float)) : "—") : (knownFloatStr === "" ? "—" : gbp(Number(knownFloatStr)))}</div>
                  </div>
                  {!closeTill.floatEdit
                    ? <span className="tu-btn" onClick={(e) => { e.stopPropagation(); setCloseTill((c) => ({ ...c, floatEdit: true, float: "" })); setPadFor({ kind: "float" }); }} style={{ fontSize: 13.5, color: U.teal, fontWeight: 800, cursor: "pointer", padding: "8px 10px", borderRadius: 10, background: "#fff", border: "1px solid " + C.line }}>Different?</span>
                    : <span className="tu-btn" onClick={(e) => { e.stopPropagation(); setPadFor(null); setCloseTill((c) => ({ ...c, floatEdit: false, float: c.floatKnown || "" })); }} style={{ fontSize: 13.5, color: C.muted, fontWeight: 800, cursor: "pointer", padding: "8px 10px", borderRadius: 10, background: "#fff", border: "1px solid " + C.line }}>Undo</span>}
                </div>
              </div>
              <div>
                <Stat tone="dark" label="Counted so far" money={countedVal || 0} note={isDenoms ? Object.values(closeTill.denoms || {}).filter((v) => Number(v) > 0).length + " of " + DENOMS.length + " counted" : null} />
                {showResult ? (
                  <div className="tu-stepin" style={{ marginTop: 14 }}>
                    <Verdict variance={variance} fmt={gbp} counted={countedVal} expected={expected} compact />
                    <div style={{ background: U.soft, borderRadius: 16, padding: "4px 14px", marginTop: 10 }}>
                      <Line l="Cash taken" v={gbp(pv.cash)} />
                      <Line l="+ Float" v={gbp(pv.float_used)} />
                      {Number(pv.cash_dropped) > 0 && <Line l="− To safe" sub={(sm.shifts || []).length + " shifts"} v={gbp(pv.cash_dropped)} />}
                      {Number(pv.dropped_mid_shift) > 0 && <Line l="− Mid-shift drops" v={gbp(pv.dropped_mid_shift)} />}
                      {Number(pv.paid_out) > 0 && <Line l="− Paid out" v={gbp(pv.paid_out)} />}
                      {Number(pv.paid_in) > 0 && <Line l="+ Paid in" v={gbp(pv.paid_in)} />}
                      <Line l="Expected" v={gbp(expected)} strong />
                    </div>
                    {pv.manager_needed && <TNote tone={U.warn}>{pv.float_changed ? "The float changed" : "Out by " + gbp(pv.limit) + " or more"} — a note and a manager PIN at sign-off.</TNote>}
                    <div style={{ marginTop: 10 }}><TBtn kind="secondary" icon={<TillIcon.back size={17} />} onClick={() => setPadFor(isDenoms ? { kind: "denom", d: DENOMS[0] } : { kind: "counted" })}>Change the count</TBtn></div>
                  </div>
                ) : (
                  <div style={{ marginTop: 14 }}>
                    <TLabel>{target.kind === "denom" ? "How many " + dLabel(target.d) + "?" : target.kind === "float" ? "Actual float" : "Cash counted"}</TLabel>
                    <Keypad key={target.kind + (target.d ?? "")} value={curVal} decimal={target.kind !== "denom"} money={target.kind !== "denom"} max={target.kind === "denom" ? 4 : 9}
                      onChange={(v) => { setPadFor(target); setVal(target, v); }} />
                    <div style={{ marginTop: 9 }}>
                      <TBtn kind="secondary" icon={<TillIcon.chev size={17} />} onClick={goNext}>{target.kind === "denom" ? (DENOMS.indexOf(target.d) < DENOMS.length - 1 ? "Next: " + dLabel(DENOMS[DENOMS.indexOf(target.d) + 1]) : "Back to " + dLabel(DENOMS[0])) : "Done"}</TBtn>
                    </div>
                    {pv && <div className="tu-btn" onClick={() => setPadFor(null)} style={{ marginTop: 10, textAlign: "center", fontSize: 14, fontWeight: 800, color: U.teal, cursor: "pointer" }}>Show the result</div>}
                    {!pv && closeTill.checks > 0 && <TNote tone={U.warn}>Changed the count — check it again. Every count is printed on the Z report.</TNote>}
                    {!pv && !closeTill.checks && <TNote>Count <b style={{ color: U.ink }}>everything</b> in the drawer, then tap <b style={{ color: U.ink }}>Check count</b>. What the till expected shows only after you've counted.</TNote>}
                  </div>
                )}
                <TillErr>{closeTill.err}</TillErr>
              </div>
            </div>
          );
        })();

        // ---- STAGE 2: SIGN OFF ----
        else if (sm && closeTill.step === "summary" && stage === 2) {
          const needMgr = pv && (pv.manager_needed || closeTill.mgrForced);
          const forMgr = needMgr && (closeTill.pinFor || "staff") === "manager";
          body = (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 330px", gap: 24 }}>
              <div>
                {variance != null && <Verdict variance={variance} fmt={gbp} counted={countedVal} expected={expected} />}
                <Section title={varianceNeedsNote ? "Note — required for the variance" : "Note"} style={{ marginTop: variance != null ? 16 : 0 }}>
                  {/* readOnly + blur on focus, like every other field in
                      this sheet: the device has no system keyboard, and
                      letting it try just put a caret in a dead box. */}
                  <textarea value={closeTill.note} readOnly onFocus={(e) => e.target.blur()} onClick={() => setNoteKb(true)}
                    placeholder={varianceNeedsNote ? "Required: explain the cash variance" : "Note (optional — petty cash taken, reason for variance…)"} rows={2}
                    style={input({ resize: "none", cursor: "pointer", borderColor: varianceNeedsNote ? U.amber : noteKb ? U.teal : C.line, background: varianceNeedsNote ? U.warnBg : "#fff" })} />
                  {/* Most variances have one of a handful of causes. One
                      tap beats spelling it out on a glass keyboard, and
                      head office gets wording it can actually group by. */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
                    {["Petty cash taken", "Wrong change given", "Cash refund", "Supplier paid in cash", "Float miscounted", "Miscount"].map((r) => {
                      const on = (closeTill.note || "").toLowerCase().includes(r.toLowerCase());
                      return (
                        <span key={r} className="tu-chip tu-btn" onClick={() => setCloseTill((c) => {
                          const cur = (c.note || "").trim();
                          if (cur.toLowerCase().includes(r.toLowerCase())) return c;
                          return { ...c, note: (cur ? cur.replace(/[.,\s]*$/, "") + ", " + r.charAt(0).toLowerCase() + r.slice(1) : r).slice(0, 240) };
                        })}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "9px 13px", borderRadius: 999, background: on ? U.ink : "#fff", color: on ? "#fff" : U.ink, border: "1px solid " + (on ? U.ink : C.line), fontSize: 13.5, fontWeight: 700, cursor: "pointer", userSelect: "none" }}>{on && <TillIcon.check size={13} sw={3} />}{r}</span>
                      );
                    })}
                    {closeTill.note ? (
                      <span className="tu-btn" onClick={() => setCloseTill((c) => ({ ...c, note: "" }))}
                        style={{ padding: "9px 13px", borderRadius: 999, border: "1px solid " + C.line, fontSize: 13.5, fontWeight: 800, cursor: "pointer", userSelect: "none", color: C.bad }}>Clear</span>
                    ) : null}
                  </div>
                </Section>
                <Section title="What will print" >
                  <Receipt title="Z REPORT" sub={when}
                    lines={[
                      ["Orders archived", String(sm.order_count + (sm.cancelled_count || 0))],
                      ["Cash", gbp(sm.cash)], ["Card", gbp(sm.card)],
                      sm.other > 0 && ["Other", gbp(sm.other)],
                      sm.discount_total > 0 && ["Discounts", "-" + gbp(sm.discount_total), { dim: true }],
                      sm.refund_total > 0 && ["Refunds", "-" + gbp(sm.refund_total), { dim: true }],
                      "-",
                      ["TOTAL", gbp(sm.total), { strong: true }],
                      "-",
                      pv && ["Float", gbp(pv.float_used), pv.float_changed ? { tone: U.warn } : null],
                      ["Counted", countedVal == null ? "not counted" : gbp(countedVal), countedVal == null ? { tone: U.warn } : null],
                      expected != null && ["Expected", gbp(expected)],
                      variance != null && [variance === 0 ? "Balanced" : variance > 0 ? "Over" : "Short", (variance < 0 ? "-" : variance > 0 ? "+" : "") + gbp(Math.abs(variance)), { strong: true, tone: variance === 0 ? U.good : variance > 0 ? U.over : U.bad }],
                      sm.unpaid_count > 0 && ["Unpaid archived (" + sm.unpaid_count + ")", gbp(sm.unpaid_total), { tone: U.warn }],
                    ]}
                    foot={closer ? "Closed by " + closer : "Signed with your staff PIN"} />
                  <TNote><span style={{ display: "inline-flex", verticalAlign: "-3px", marginRight: 6, color: U.teal }}><TillIcon.printer size={16} /></span>The Z-report prints on this store's printer and the close is saved for head office. {sm.mode === "trading_day" && sm.later_count > 0 ? sm.later_count + " orders since 4:00 stay open." : ""}</TNote>
                </Section>
              </div>
              <div>
                {needMgr && (
                  <div style={{ marginBottom: 14 }}>
                    <Seg value={closeTill.pinFor || "staff"} onPick={(m) => setCloseTill((c) => ({ ...c, pinFor: m }))}
                      options={[["staff", closeTill.pin.length >= 4 ? "✓ Your PIN" : "Your PIN"], ["manager", closeTill.mgrPin.length >= 4 ? "✓ Manager PIN" : "Manager PIN"]]} />
                  </div>
                )}
                {forMgr ? (
                  <PinPanel label="Manager PIN" tone={U.warn} hint="A manager approves this close (not needed if you're the manager)." value={closeTill.mgrPin} error={closeTill.err}
                    onChange={(v) => setCloseTill((c) => ({ ...c, err: "", mgrPin: v }))} />
                ) : (<>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, marginBottom: 6, padding: "8px 12px", borderRadius: 12, background: closer ? U.goodBg : closeTill.staff?.unknown ? U.warnBg : U.soft, color: closer ? U.good : closeTill.staff?.unknown ? U.warn : C.muted, fontSize: 14, fontWeight: 700 }}>
                    <span style={{ display: "flex" }}>{closer ? <TillIcon.check size={18} sw={3} /> : <TillIcon.user size={18} />}</span>
                    {closer ? "Closing as " + closer : closeTill.staff?.unknown ? (closeTill.staff.reason === "not_this_store" ? "That PIN isn't assigned to this store" : "PIN not recognised — a manager PIN also works") : closeTill.pin.length >= 4 ? "Checking…" : "The PIN you use for the staff app"}
                  </div>
                  <PinPanel label="Your staff PIN" value={closeTill.pin} error={closeTill.err === "Wrong PIN" || closeTill.err === "PIN not recognised" ? closeTill.err : ""}
                    onChange={(next) => { setCloseTill((c) => ({ ...c, err: "", pin: next, staff: next.length < 4 ? null : c.staff })); lookupStaffPin(next); }} />
                </>)}
                <TillErr>{closeTill.err}</TillErr>
              </div>
            </div>
          );
        }

        // ---- DONE ----
        else if (closeTill.step === "done") body = (() => {
          const r = closeTill.result || {}; const rs = r.summary || {};
          return (
            <>
              <DoneMark title={(rs.z_number != null ? "Z No. " + String(rs.z_number).padStart(6, "0") + " · " : "") + "Day closed"}
                sub={<>{r.closed_orders} order{r.closed_orders === 1 ? "" : "s"} archived and the close saved{closer ? " by " + closer : ""}. {r.printed ? "The Z-report is printing." : r.printed === false ? <span style={{ color: C.warn, fontWeight: 700 }}>The Z-report couldn't print — check the printer, then tap Print again.</span> : "Z-report not sent."}</>} />
              {rs.cash_counted != null && rs.to_bank != null && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 }}>
                  <Instruction dark n="1" icon={<TillIcon.bag size={26} />} title="Bank / safe" money={rs.to_bank} note="Bag it with the Z-report, into the safe" />
                  <Instruction n="2" icon={<TillIcon.drawer size={26} />} title="Float for tomorrow" money={rs.float_left} note="Leave it in the drawer" />
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 28 }}>
                <Section title="Z report">
                  <Receipt title={rs.z_number != null ? "Z No. " + String(rs.z_number).padStart(6, "0") : "Z REPORT"} sub={when}
                    lines={[
                      ["Cash", gbp(rs.cash)], ["Card", gbp(rs.card)], rs.other > 0 && ["Other", gbp(rs.other)],
                      "-", ["TOTAL", gbp(rs.total), { strong: true }],
                      rs.unpaid_count > 0 && ["Unpaid archived (" + rs.unpaid_count + ")", gbp(rs.unpaid_total), { tone: U.warn }],
                    ]}
                    foot={closer ? "Closed by " + closer : null} />
                </Section>
                <div>
                  <Section title="Cash drawer">
                    {rs.cash_counted == null ? <div style={{ fontSize: 14, color: C.muted }}>No cash count recorded</div>
                      : <Verdict compact variance={rs.cash_variance || 0} fmt={gbp} counted={rs.cash_counted} expected={rs.cash_expected} />}
                  </Section>
                  {/* Before you go — tap each one off. Just a prompt on the screen; nothing is saved. */}
                  <Section title="Before you go">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {["Z-report signed", "Cash bagged into the safe", "Float left in the drawer", "Drawer and safe locked"].map((t) => {
                        const on = !!(closeTill.ticks || {})[t];
                        return <CheckChip key={t} state={on ? "ok" : "todo"} onClick={() => setCloseTill((c) => ({ ...c, ticks: { ...(c.ticks || {}), [t]: !on } }))}>{t}</CheckChip>;
                      })}
                    </div>
                  </Section>
                </div>
              </div>
            </>
          );
        })();

        // ---------------- footer ----------------
        let footer = null;
        if (closeTill.step === "summary" && stage === 0) footer = (<>
          <Btn onClick={shut}>Cancel</Btn>
          {/* ZREPORT 2026-10-24 — X read: the day so far on paper, nothing closed or reset. */}
          <Btn icon={<TillIcon.printer size={18} />} disabled={closeTill.busy || !sm || closeTill.xPrinting} onClick={() => printXRead()}>{closeTill.xPrinting ? "Printing…" : closeTill.xPrinted === true ? "X read printed ✓" : closeTill.xPrinted === false ? "X read failed — retry" : "Print X read"}</Btn>
          <Btn primary grow={1.6} icon={<TillIcon.chev size={18} />} disabled={closeTill.busy || !sm || (sm.shifts || []).some((x) => x.status === "counting")} onClick={() => { setPadFor(closeTill.countMode === "denoms" ? { kind: "denom", d: DENOMS[0] } : { kind: "counted" }); setCloseTill((c) => ({ ...c, stage: 1 })); }}>Next: count cash</Btn>
        </>);
        else if (closeTill.step === "summary" && stage === 1) footer = (<>
          <Btn icon={<TillIcon.back size={18} />} onClick={() => { setPadFor(null); setCloseTill((c) => ({ ...c, stage: 0 })); }}>Back</Btn>
          {pv ? (
            <Btn primary grow={2} icon={<TillIcon.chev size={18} />} onClick={() => { setPadFor(null); setCloseTill((c) => ({ ...c, stage: 2, err: "" })); }}>Next: sign off</Btn>
          ) : (
            <Btn primary grow={2} icon={<TillIcon.check size={18} sw={2.6} />} disabled={closeTill.busy || countedVal == null || (closeTill.floatEdit && closeTill.float === "")} onClick={() => { setPadFor(null); checkCloseCount(countedVal); }}>{closeTill.busy ? "Checking…" : countedVal == null ? "Count the drawer" : "Check count"}</Btn>
          )}
        </>);
        else if (closeTill.step === "summary" && stage === 2) footer = (<>
          <Btn icon={<TillIcon.back size={18} />} onClick={() => { if (closeTill.busy) return; setNoteKb(false); setCloseTill((c) => ({ ...c, stage: 1, err: "" })); }}>Back</Btn>
          <Btn primary grow={2} icon={<TillIcon.printer size={18} />} disabled={closeTill.busy || !signoffOk} onClick={() => confirmCloseTill({ counted: countedVal == null ? "" : String(countedVal) })}>
            {closeTill.busy ? "Closing…" : varianceNeedsNote ? "Add a note for the variance" : closeTill.pin.length < 4 ? "Enter your PIN" : closer ? "Close till as " + closer.split(" ")[0] : "Close till & print Z-report"}
          </Btn>
        </>);
        else if (closeTill.step === "done") footer = (<>
          <Btn icon={<TillIcon.printer size={18} />} onClick={() => !closeTill.reprinting && reprintClosure()}>{closeTill.reprinting ? "Printing…" : closeTill.reprinted ? "Printed ✓" : "Print again"}</Btn>
          <TBtn kind="teal" grow={2} icon={<TillIcon.check size={18} sw={2.6} />} onClick={() => setCloseTill(null)}>Done</TBtn>
        </>);
        else footer = <Btn onClick={shut}>Close</Btn>;

        // Letters for the note — slides up over the footer, the till has no keyboard.
        const noteKeyboard = closeTill.step === "summary" && stage === 2 && noteKb ? (() => {
          const rows = kbNum
            ? ["1234567890", "£.,-/:", "()&%!?'"]
            : ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
          const type = (ch) => {
            setCloseTill((c) => ({ ...c, note: ((c.note || "") + ch).slice(0, 240) }));
            if (!kbNum && kbCaps) setKbCaps(false);
          };
          const Key = ({ label, on, grow = 1, tone }) => (
            <div className="tu-key" onClick={on} style={{ flex: grow, minWidth: 0, padding: "14px 0", textAlign: "center", borderRadius: 11,
              background: tone === "dark" ? U.ink : tone === "soft" ? "#eef0f3" : "#fff",
              color: tone === "dark" ? "#fff" : U.ink,
              border: "1px solid " + C.line, boxShadow: "0 1px 0 rgba(18,21,28,.06)", fontWeight: 700, fontSize: 17, cursor: "pointer", userSelect: "none" }}>{label}</div>
          );
          return (
            <div className="tu-card" style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#f7f8fa", borderTop: "1px solid " + C.line, padding: "12px 14px 14px", boxShadow: "0 -18px 40px -18px rgba(8,15,20,.4)", zIndex: 30 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <TLabel style={{ marginBottom: 0 }}>Note</TLabel>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: closeTill.note ? U.ink : U.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", direction: "rtl", textAlign: "left" }}>{closeTill.note || "Start typing…"}</span>
                <span style={{ fontSize: 12.5, color: C.muted, ...NUM }}>{(closeTill.note || "").length}/240</span>
                <span className="tu-btn" onClick={() => setNoteKb(false)} style={{ fontWeight: 800, fontSize: 15, cursor: "pointer", padding: "8px 16px", borderRadius: 10, background: U.ink, color: "#fff" }}>Done</span>
              </div>
              {rows.map((r, ri) => (
                <div key={ri} style={{ display: "flex", gap: 6, marginBottom: 6, paddingInline: ri === 1 ? 18 : ri === 2 ? 36 : 0 }}>
                  {r.split("").map((ch) => {
                    const out = !kbNum && kbCaps ? ch.toUpperCase() : ch;
                    return <Key key={ch} label={out} on={() => type(out)} />;
                  })}
                </div>
              ))}
              <div style={{ display: "flex", gap: 6 }}>
                <Key label={kbNum ? "ABC" : "123"} grow={1.4} tone="soft" on={() => setKbNum((v) => !v)} />
                {!kbNum && <Key label="⇧" grow={1} tone={kbCaps ? "dark" : "soft"} on={() => setKbCaps((v) => !v)} />}
                <Key label="space" grow={4} on={() => type(" ")} />
                <Key label="⌫" grow={1.4} tone="soft" on={() => setCloseTill((c) => ({ ...c, note: (c.note || "").slice(0, -1) }))} />
              </div>
            </div>
          );
        })() : null;

        return (
          <Sheet icon={<TillIcon.check size={24} sw={2.4} />} title={closeTill.step === "done" ? "Till closed" : "Close till"} sub={when}
            onClose={shut} busy={closeTill.busy} width={1060} height="min(94vh, 860px)" zIndex={90}
            tabs={closeTill.step === "summary" && sm && sm.later_count > 0 && stage === 0 ? [["trading_day", "To 4:00", <TillIcon.clock size={15} />], ["all", "Up to now", null]] : null}
            tab={closeTill.mode} onTab={(m) => m !== closeTill.mode && switchCloseTillMode(m)}
            steps={[...stages, "Done"]} step={closeTill.step === "done" ? "Done" : stages[stage]}
            onStep={(i) => { if (closeTill.step === "summary" && i < stage) { setNoteKb(false); setPadFor(null); setCloseTill((c) => ({ ...c, stage: i, err: "" })); } }}
            bodyKey={closeTill.step + stage} footer={footer} overlay={noteKeyboard}>
            {body}
          </Sheet>
        );
      })()}

      {/* TABLE PICKER SHEET */}
      {showTablePicker && (
        <div onClick={() => { if (!table) setOrderKind("takeaway"); setShowTablePicker(false); }} style={{ position: "fixed", inset: 0, background: "rgba(18,21,28,.4)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, width: 460, maxWidth: "100%", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(18,21,28,.3)" }}>
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid " + P.line2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 19, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>{posIco.table(22, "#5E7A4D")} Choose a table</span>
              <span onClick={() => { if (!table) setOrderKind("takeaway"); setShowTablePicker(false); }} style={{ width: 34, height: 34, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, color: "#6b7280", cursor: "pointer" }}>✕</span>
            </div>
            <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {tablesList.map((t) => {
                const on = table && table.id === t.id;
                return (
                  <div key={t.id} onClick={() => { setTable({ id: t.id, label: t.label }); setOrderKind("dinein"); setShowTablePicker(false); }} style={{ aspectRatio: "1", borderRadius: 13, background: on ? "#5E7A4D" : "#f4f5f7", color: on ? "#fff" : "#2A2E20", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontWeight: 700, cursor: "pointer", boxShadow: on ? "0 4px 12px -3px rgba(94,122,77,.5)" : "none" }}>
                    <span style={{ fontSize: 22 }}>{t.label}</span>
                    {on && <span style={{ fontSize: 10, opacity: .85, marginTop: 1 }}>selected</span>}
                  </div>
                );
              })}
              {tablesList.length === 0 && <div style={{ gridColumn: "1 / -1", textAlign: "center", color: P.muted, padding: 24, fontSize: 15 }}>No tables configured</div>}
            </div>
            <div style={{ padding: "6px 20px 20px" }}>
              <div onClick={() => { setTable(null); setOrderKind("takeaway"); setShowTablePicker(false); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "14px 0", borderRadius: 12, background: "#fff", border: "1.5px solid #d4d8dd", fontWeight: 700, fontSize: 15, color: "#6b7280", cursor: "pointer" }}>{posIco.takeaway(18, "#6b7280")} Switch to Takeaway</div>
            </div>
          </div>
        </div>
      )}

      {/* MODIFIER POPUP */}
      {modItem && (
        <div onClick={() => { setModItem(null); setEditKey(null); setModNote(""); }} style={{ position: "fixed", inset: 0, background: "rgba(18,21,28,.45)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 26, padding: 0, width: (modItem.modifiers || []).length ? 1180 : 820, maxWidth: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 70px rgba(18,21,28,.28)" }}>
          <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", gap: 17 }}>
              <div style={{ width: 70, height: 70, borderRadius: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, color: "#fff", background: modItem.image_url ? "#f0f1f3" : "linear-gradient(135deg," + catColor(modItem.category || (master && master.name)).bar + "," + catColor(modItem.category || (master && master.name)).ink + ")", backgroundImage: modItem.image_url ? "url(" + modItem.image_url + ")" : undefined, backgroundSize: "cover", backgroundPosition: "center", boxShadow: "0 6px 16px rgba(0,0,0,.18)" }}>{!modItem.image_url && fallbackFor(modItem.name, modItem.category || "").icon}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.08 }}>{modItem.name}</div>
                <div style={{ fontSize: 15, color: "#9aa1ac", marginTop: 4, fontWeight: 600 }}>{gbp(modItem.price)} · {(modItem.modifiers || []).length ? (editKey ? "editing" : "customise") : "note for the kitchen"}</div>
                {modItem.description && <div style={{ fontSize: 14, color: "#6b7280", marginTop: 6, lineHeight: 1.4, maxWidth: 760 }}>{modItem.description}</div>}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 28px 10px" }}>

            {/* required progress */}
            {modReqGroups.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 24px" }}>
                <div style={{ display: "flex", gap: 6, flex: 1 }}>
                  {modReqGroups.map((g, i) => (
                    <span key={i} style={{ flex: 1, height: 8, borderRadius: 5, background: i < modReqDone ? P.tealDeep : "#eef0f2" }} />
                  ))}
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: P.tealDeep, whiteSpace: "nowrap" }}>{modReqDone} of {modReqGroups.length} done</span>
              </div>
            )}

            {/* groups */}
            <div style={{ display: "grid", gridTemplateColumns: (modItem.modifiers || []).length ? "1.15fr 1fr" : "1fr", gap: 22, alignItems: "start", marginTop: 18 }}>
              <div style={{ minWidth: 0 }}>
            {(modItem.modifiers || []).map((g) => {
              const chosen = modSel[g.id] || [];
              const single = (g.max_select || 1) === 1;
              const gDone = !g.required || chosen.length >= (g.min_select || 1);
              return (
                <div key={g.id} style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 15 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.015em" }}>{g.name || ""}</span>
                    {g.required && <span style={{ fontSize: 11, fontWeight: 800, color: P.tealDeep, background: "#f0fdfa", border: "1.5px solid #ccfbf1", padding: "4px 11px", borderRadius: 20, letterSpacing: ".05em" }}>REQUIRED</span>}
                    {(g.max_select || 1) > 1 && <span style={{ fontSize: 14, color: "#aeb4bd", fontWeight: 600 }}>up to {g.max_select}</span>}
                    {g.required
                      ? <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: gDone ? P.tealDeep : "#c99a2e" }}>{gDone ? "✓ Done" : "• Pick one"}</span>
                      : <span style={{ marginLeft: "auto", fontSize: 14, color: "#aeb4bd", fontWeight: 600 }}>Optional</span>}
                  </div>
                  {g.description && <div style={{ fontSize: 15, color: P.muted2, marginBottom: 12, lineHeight: 1.35 }}>{g.description}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                    {(g.options || []).map((o) => {
                      const on = chosen.includes(o.id);
                      return (
                        <div key={o.id} onClick={() => toggleOpt(g, o.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "19px 18px", borderRadius: 17, cursor: "pointer", fontSize: 17, fontWeight: 600, background: on ? "linear-gradient(135deg,#eafaf7,#d9f5ee)" : "#fff", color: on ? "#0d4f48" : P.ink, border: "2px solid " + (on ? P.tealDeep : "#eaedf0"), boxShadow: on ? "0 5px 16px rgba(15,118,110,.16)" : "none" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
                            <span style={{ width: 27, height: 27, borderRadius: single ? "50%" : 8, border: "2.5px solid " + (on ? P.tealDeep : "#d3d8dd"), background: on ? P.tealDeep : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff", fontSize: 16 }}>{on ? "✓" : ""}</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</span>
                          </span>
                          {Number(o.price_delta) ? <span style={{ fontSize: 15, fontWeight: 800, color: P.tealDeep, flexShrink: 0 }}>+{gbp(o.price_delta)}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

              </div>
              <div style={{ minWidth: 0, position: "sticky", top: 0 }}>
            {/* kitchen note */}
            {(() => {
              const name = (modItem.name || "").toLowerCase();
              const cat = String(modItem.category || "").toLowerCase();
              const isDrink = /shake|coffee|latte|tea|juice|smoothie|drink|frapp|mocha|chai|hot choc|mocktail|cooler|matcha/.test(name + " " + cat);
              const isDessert = /dessert|waffle|crepe|cake|cookie|ice cream|sundae|kanafeh|kunafa|churro|falooda|pudding|brownie|cheesecake/.test(name + " " + cat);
              const ingredients = ingredientsFromDescription(modItem.description, modItem.name);
              const fromDesc = ingredients.flatMap((ing) => ["No " + ing, "Extra " + ing]);
              const generic = isDrink
                ? ["No ice", "Extra ice", "Extra hot", "Less sweet", "No sugar", "Oat milk", "Decaf", "Take away cup"]
                : isDessert
                  ? ["No cream", "No sauce", "Sauce on side", "No nuts", "To share", "Candle"]
                  : ["Sauce on side", "Well done", "Medium", "Spicy", "Mild", "Kids portion", "No salad", "No onion"];
              const presets = [...fromDesc, ...generic.filter((g) => !fromDesc.some((f) => f.toLowerCase() === g.toLowerCase()))];
              const allergyPresets = ["Nut allergy", "Dairy allergy", "Gluten free", "Egg allergy", "Vegan", "Halal only"];
              let recent = []; try { recent = JSON.parse(localStorage.getItem("pos_recent_notes_" + modItem.id) || "[]"); } catch {}
              const parts = (modNote || "").split(",").map((x) => x.trim()).filter(Boolean);
              const has = (v) => parts.includes(v);
              const toggle = (v) => setModNote(has(v) ? parts.filter((x) => x !== v).join(", ") : [...parts, v].join(", "));
              const isAllergy = /allerg|gluten|vegan|halal|intoler/i.test(modNote || "");
              const Chip = ({ v, tone }) => <span onClick={() => toggle(v)} style={{ fontSize: 16, fontWeight: 700, cursor: "pointer", padding: "11px 18px", borderRadius: 22, border: "1.5px solid " + (has(v) ? (tone === "al" ? "#c0392b" : "#3a5730") : (tone === "al" ? "#e6b8b0" : "#ead9bd")), background: has(v) ? (tone === "al" ? "#c0392b" : "#3a5730") : "#fff", color: has(v) ? "#fff" : (tone === "al" ? "#8a2a1e" : "#5b5540"), userSelect: "none", whiteSpace: "nowrap" }}>{has(v) ? "✓ " : ""}{v}</span>;
              return (
                <div style={{ background: isAllergy ? "#fff4f2" : "#fffbf4", border: "1.5px solid " + (isAllergy ? "#e6b8b0" : "#f0e2cc"), borderRadius: 16, padding: "16px 18px", marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>📝 Kitchen note <span style={{ fontSize: 14, color: "#b0a48a", fontWeight: 500 }}>(optional)</span></div>
                    {isAllergy && <span style={{ fontSize: 12.5, fontWeight: 800, color: "#c0392b", letterSpacing: ".05em" }}>⚠ PRINTS AS ALLERGY</span>}
                  </div>
                  {parts.length > 0 && <div style={{ marginBottom: 10, padding: "9px 12px", borderRadius: 11, background: isAllergy ? "#c0392b" : "#3d3829", color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1.35, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}><span>Ticket will say: {isAllergy ? "!! " + (modNote || "").toUpperCase() + " !!" : "** " + modNote + " **"}</span><span onClick={() => setModNote("")} style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 800, opacity: .85, whiteSpace: "nowrap", background: "rgba(255,255,255,.18)", padding: "4px 9px", borderRadius: 7 }}>Clear</span></div>}
                  {recent.filter((v) => !has(v)).length > 0 && (
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginBottom: 9 }}>
                      <span style={{ fontSize: 12.5, color: "#b0a48a", fontWeight: 700 }}>Recent</span>
                      {recent.filter((v) => !has(v)).slice(0, 4).map((v) => <Chip key={"r" + v} v={v} tone={/allerg|gluten|vegan|halal/i.test(v) ? "al" : undefined} />)}
                    </div>
                  )}
                  {ingredients.length > 0 && (
                    <div style={{ marginBottom: 9 }}>
                      <div style={{ fontSize: 13.5, color: "#8a7f66", fontWeight: 800, letterSpacing: ".04em", marginBottom: 8 }}>IN THIS DISH <span style={{ fontWeight: 500, letterSpacing: 0 }}>· tap to leave out or add extra</span></div>
                      <div style={{ display: "grid", gridTemplateColumns: ingredients.some((x) => x.length > 13) ? "1fr" : "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
                        {ingredients.map((ing) => (
                          <div key={ing} style={{ display: "flex", alignItems: "center", gap: 5, background: has("No " + ing) ? "#fdf2f0" : has("Extra " + ing) ? "#eef4e8" : "#fff", border: "1.5px solid " + (has("No " + ing) ? "#e6b8b0" : has("Extra " + ing) ? "#b9ceab" : "#ead9bd"), borderRadius: 14, padding: "6px 6px 6px 12px" }}>
                            <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "#3d3829", lineHeight: 1.2, textDecoration: has("No " + ing) ? "line-through" : "none" }}>{cap1(ing)}</span>
                            <span onClick={() => { const no = "No " + ing, ex = "Extra " + ing; const p = parts.filter((x) => x !== ex); setModNote(has(no) ? p.filter((x) => x !== no).join(", ") : [...p, no].join(", ")); }} style={{ cursor: "pointer", fontSize: 14, fontWeight: 800, padding: "9px 12px", borderRadius: 10, background: has("No " + ing) ? "#c0392b" : "#fdf2f0", color: has("No " + ing) ? "#fff" : "#8a2a1e", userSelect: "none" }}>None</span>
                            <span onClick={() => { const no = "No " + ing, ex = "Extra " + ing; const p = parts.filter((x) => x !== no); setModNote(has(ex) ? p.filter((x) => x !== ex).join(", ") : [...p, ex].join(", ")); }} style={{ cursor: "pointer", fontSize: 14, fontWeight: 800, padding: "9px 12px", borderRadius: 10, background: has("Extra " + ing) ? "#3a5730" : "#eef4e8", color: has("Extra " + ing) ? "#fff" : "#3a5730", userSelect: "none" }}>Extra</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 13.5, color: "#8a7f66", fontWeight: 800, letterSpacing: ".04em", margin: "4px 0 8px" }}>QUICK</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {generic.map((v) => <Chip key={v} v={v} />)}
                  </div>
                  <div style={{ fontSize: 13.5, color: "#8a2a1e", fontWeight: 800, letterSpacing: ".04em", margin: "4px 0 8px" }}>⚠ ALLERGY & DIET</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                    {allergyPresets.map((v) => <Chip key={v} v={v} tone="al" />)}
                  </div>
                  <input type="text" value={modNote} onChange={(e) => setModNote(e.target.value)} placeholder="Type anything else — or edit the note above"
                    style={{ width: "100%", boxSizing: "border-box", background: "#fff", border: "1.5px solid " + (isAllergy ? "#e6b8b0" : "#ead9bd"), borderRadius: 13, padding: "15px 17px", fontSize: 17, color: isAllergy ? "#8a2a1e" : "#5b5540", fontWeight: isAllergy ? 700 : 500, fontFamily: "inherit", outline: "none" }} />
                </div>
              );
            })()}

              </div>
            </div>
          </div>
            {/* footer */}
            <div style={{ display: "flex", gap: 12, padding: "14px 28px 22px", borderTop: "1px solid #eef0f3", flexShrink: 0, background: "#fff" }}>
              <div onClick={() => { setModItem(null); setEditKey(null); setModNote(""); }} style={{ padding: "19px 28px", borderRadius: 18, background: "#f4f6f8", color: "#5b6472", fontWeight: 700, cursor: "pointer", fontSize: 17 }}>Cancel</div>
              <div onClick={() => !modMissing && confirmMods()} style={{ flex: 1, textAlign: "center", padding: "19px 0", borderRadius: 18, background: modMissing ? "#dde1e5" : grad, color: modMissing ? "#8a929c" : "#fff", fontWeight: 700, fontSize: 19, letterSpacing: "-.01em", cursor: modMissing ? "default" : "pointer", boxShadow: modMissing ? "none" : "0 10px 26px rgba(13,148,136,.34)" }}>{modMissingReq ? "Choose required options" : modEmptyCarrier ? "Choose an option" : (editKey ? "Update · " : "Add · ") + gbp(modUnit)}</div>
            </div>
          </div>
        </div>
      )}
      {showMerge && master && (
        <MergeEditor
          master={master}
          merges={merges.filter((m) => (m.category_ids || []).some((cid) => master.subs.some((s) => s.id === cid)))}
          P={P} grad={grad} gbp={gbp}
          onSave={saveMerge}
          onDelete={deleteMerge}
          onClose={() => setShowMerge(false)}
        />
      )}
    </div>
  );
}

// Merge editor — pick 2+ sub-categories of the active menu, name the group,
// and save. Display-only (DB stores the grouping, real menu untouched).
// Existing merges can be reverted with one tap.
function MergeEditor({ master, merges, P, grad, gbp, onSave, onDelete, onClose }) {
  const [sel, setSel] = useState({});
  const [name, setName] = useState("");
  const raw = master.subs;
  const chosen = raw.filter((s) => sel[s.id]);
  const canMerge = chosen.length >= 2 && name.trim().length > 0;
  const toggle = (id) => setSel((s) => ({ ...s, [id]: !s[id] }));
  const doMerge = async () => {
    if (!canMerge) return;
    const ok = await onSave({ menu_id: master.id, new_name: name.trim(), category_ids: chosen.map((s) => s.id) });
    if (ok) { setSel({}); setName(""); }
  };
  const catName = (id) => (raw.find((s) => s.id === id) || {}).name || "—";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(18,21,28,.45)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 96vw)", maxHeight: "88vh", overflowY: "auto", background: "#fff", borderRadius: 18, padding: 22, boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Merge categories</div>
          <div onClick={onClose} style={{ marginLeft: "auto", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f2f4", borderRadius: 9, cursor: "pointer", fontSize: 17, color: "#666" }}>✕</div>
        </div>
        <div style={{ fontSize: 13.5, color: "#8a8f98", marginBottom: 16 }}>In <b>{master.name}</b>. This only changes how the POS groups items — your real menu is untouched, and you can un-merge any time.</div>

        {/* existing merges */}
        {merges.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 8 }}>Current merges</div>
            {merges.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #eceef1", borderRadius: 11, marginBottom: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{m.new_name}</div>
                  <div style={{ fontSize: 12.5, color: "#8a8f98", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(m.category_ids || []).map(catName).join(" + ")}</div>
                </div>
                <div onClick={() => onDelete(m.id)} style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: "#b4462f", background: "#fbeaea", border: "1px solid #f0c9c2", borderRadius: 9, padding: "7px 12px", cursor: "pointer" }}>Un-merge</div>
              </div>
            ))}
          </div>
        )}

        {/* build a new merge */}
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 8 }}>New merge — pick 2 or more</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
          {raw.map((s) => {
            const on = !!sel[s.id];
            return (
              <div key={s.id} onClick={() => toggle(s.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 13px", borderRadius: 11, cursor: "pointer", border: "1.5px solid " + (on ? P.tealDeep : "#eceef1"), background: on ? P.chip : "#fff" }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: on ? P.tealDeep : "#fff", border: "1.5px solid " + (on ? P.tealDeep : "#cfd4da"), color: "#fff", fontSize: 14 }}>{on ? "✓" : ""}</span>
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ fontSize: 13, color: "#9aa1ac", flexShrink: 0 }}>{s.items.length}</span>
              </div>
            );
          })}
        </div>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name for the merged group…"
          style={{ width: "100%", boxSizing: "border-box", background: "#fff", border: "1px solid #dfe2e6", borderRadius: 11, padding: "13px 14px", fontSize: 16, color: "#12151c", fontFamily: "inherit", outline: "none", marginBottom: 12 }} />
        <div onClick={doMerge} style={{ textAlign: "center", padding: "15px 0", borderRadius: 13, background: canMerge ? grad : "#d7dade", color: "#fff", fontWeight: 600, fontSize: 16.5, cursor: canMerge ? "pointer" : "default", boxShadow: canMerge ? "0 6px 16px rgba(13,148,136,.3)" : "none" }}>
          {chosen.length < 2 ? "Pick at least 2 categories" : !name.trim() ? "Type a name for the group" : "Merge " + chosen.length + " into “" + name.trim() + "”"}
        </div>
      </div>
    </div>
  );
}
