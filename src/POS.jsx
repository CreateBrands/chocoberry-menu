import { useState, useEffect, useMemo, useRef } from "react";
import { OrdersList, OrderDetailPanel } from "./OrdersStrip.jsx";
import CartLine from "./CartLine.jsx";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };

const gbp = (n) => "£" + Number(n || 0).toFixed(2);

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
  const p = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  const n = (name || "").toLowerCase();
  if (n.includes("dessert") || n.includes("cake") || n.includes("sweet"))
    return <svg {...p}><path d="M4 16h16M6 16c0-3 2-5 6-5s6 2 6 5M9 8c0-1 .5-2 3-2s3 1 3 2M12 3v1" /></svg>;
  if (n.includes("breakfast") || n.includes("brunch") || n.includes("egg"))
    return <svg {...p}><circle cx="10" cy="13" r="6" /><circle cx="10" cy="13" r="2.2" /><path d="M16 9h3a2 2 0 0 1 0 4h-2" /></svg>;
  if (n.includes("dinner") || n.includes("main") || n.includes("meal"))
    return <svg {...p}><path d="M4 18h16M6 18a6 6 0 0 1 12 0M12 6v0" /><path d="M12 6a2 2 0 0 1 0-2" /></svg>;
  if (n.includes("cold") || n.includes("iced") || n.includes("juice") || n.includes("soft") || n.includes("shake") || n.includes("drink") || n.includes("mocktail"))
    return <svg {...p}><path d="M7 8h10l-1 12H8zM7 8l-.5-3h11L17 8M10 12v4M14 12v4" /></svg>;
  if (n.includes("hot") || n.includes("coffee") || n.includes("tea") || n.includes("latte") || n.includes("chocolate") || n.includes("matcha"))
    return <svg {...p}><path d="M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 10h2a2 2 0 0 1 0 4h-2M8 3c-.4 1 .4 2 0 3M12 3c-.4 1 .4 2 0 3" /></svg>;
  if (n.includes("kid") || n.includes("child"))
    return <svg {...p}><path d="M8 21h8M12 21v-6M8 10a4 4 0 0 1 8 0zM7.5 10h9l-1.2 5H8.7z" /></svg>;
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
export default function POS({ loc, storeToken, tablesList = [] }) {
  const [cats, setCats] = useState(null);   // masters: [{id,name,subs:[{id,name,items:[...]}]}]
  const [activeCat, setActiveCat] = useState(0);   // master index
  const [activeSub, setActiveSub] = useState(0);   // subcategory index within active master
  const [search, setSearch] = useState("");
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
  const [now, setNow] = useState(Date.now());
  const [posPin, setPosPin] = useState(""); // PIN captured once for order actions

  // On first mount, honour the saved default view for this tablet.
  useEffect(() => { setMode(defaultView === "orders" ? "orders" : "new"); }, []); // eslint-disable-line
  // Tick for live elapsed-time colouring in the orders list.
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);

  function setDefault(v) {
    setDefaultView(v);
    try { localStorage.setItem(DEFAULT_KEY, v); } catch { /* ignore */ }
  }

  async function loadOrders() {
    setOrdersBusy(true);
    try {
      const url = SUPABASE_URL + "/rest/v1/menu_orders?select=id,order_no,tablet_no,table_id,order_type,pickup_name,customer_note,print_failed,total,paid_method,paid_amount,created_at,status,menu_tables(label),menu_order_items(id,item_id,name_snapshot,qty,price_snapshot,modifiers_snapshot,line_total,note,menu_items(image_url))"
        + (loc ? "&location_id=eq." + loc : "")
        + "&closed_at=is.null&order=created_at.desc&limit=200";
      const r = await fetch(url, { headers: H });
      setOrders(r.ok ? await r.json() : []);
    } catch { setOrders([]); } finally { setOrdersBusy(false); }
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
        body: JSON.stringify({ pos: true, action, data: dataObj }),
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
        body: JSON.stringify({ pos: true, action, data: dataObj }),
      });
      const j = await r.json().catch(() => ({}));
      await loadOrders();
      return { ok: r.ok, ...j };
    } catch { return { ok: false }; } finally { setOrdersBusy(false); }
  }
  // Take a (possibly partial) payment. amount defaults to the full balance.
  const ordTakePayment = (o, method, amount, extra = {}) =>
    ordActionJson("take_payment", { order_id: o.id, method, amount, ...extra });
  // Legacy single-shot pay (full balance) — kept for the simple Cash/Card path.
  const ordPay = (o, method) => ordActionJson("take_payment", { order_id: o.id, method, amount: Number(o.total || 0) });
  const ordUnpaid = (o) => ordAction("mark_unpaid", { order_id: o.id });
  const ordRemoveItem = (o, iid) => ordAction("remove_order_item", { order_id: o.id, order_item_id: iid });
  const ordSetQty = (o, iid, qty) => ordAction("set_order_item_qty", { order_id: o.id, order_item_id: iid, qty });
  const ordSetType = (o, order_type) => ordAction("set_order_type", { order_id: o.id, order_type });
  // Void a single already-fired item, with a reason (prints a VOID chit).
  const ordVoidFired = (o, iid, reason) => ordAction("void_fired_item", { order_id: o.id, order_item_id: iid, reason, location_id: loc || null });
  async function ordReprint(o) {
    try {
      await fetch(SUPABASE_URL + "/functions/v1/sunmi-print", {
        method: "POST", headers: H,
        body: JSON.stringify({ action: "print-order", order_id: o.id, force: true }),
      });
    } catch { /* ignore */ }
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

  // ---- Load menu (same source as the customer app) ----
  // Three levels: master MENU (Breakfast, Desserts…) → subcategory → items.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const body = loc ? { loc } : { loc: null };
        const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/store_menu_full", { method: "POST", headers: H, body: JSON.stringify(body), cache: "no-store" });
        const rows = r.ok ? await r.json() : [];
        const menuMap = new Map();
        for (const row of rows) {
          let mn = menuMap.get(row.menu_id);
          if (!mn) { mn = { id: row.menu_id, name: row.menu_name, sort: row.menu_sort ?? 0, subMap: new Map() }; menuMap.set(row.menu_id, mn); }
          let sc = mn.subMap.get(row.category_id);
          if (!sc) { sc = { id: row.category_id, name: row.category_name, sort: row.category_sort ?? 0, items: [] }; mn.subMap.set(row.category_id, sc); }
          sc.items.push({ id: row.item_id, name: row.item_name, price: Number(row.price), image_url: row.image_url, category: row.category_name, modifiers: row.modifiers || [], available: row.available !== false });
        }
        const masters = [...menuMap.values()].sort((a, b) => a.sort - b.sort)
          .map((m) => ({ id: m.id, name: m.name, subs: [...m.subMap.values()].sort((a, b) => a.sort - b.sort) }));
        if (alive) setCats(masters);
      } catch { if (alive) setCats([]); }
    })();
    return () => { alive = false; };
  }, [loc]);

  const catList = cats || [];
  const master = catList[activeCat] || null;
  const subs = master ? master.subs : [];
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
  const modMissing = (modItem?.modifiers || []).some((g) => g.required && (modSel[g.id] || []).length < (g.min_select || 1));
  const modUnit = modItem ? modItem.price + (modItem.modifiers || []).flatMap((g) => (g.options || []).filter((o) => (modSel[g.id] || []).includes(o.id))).reduce((s, o) => s + Number(o.price_delta || 0), 0) : 0;
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
        items: ticket.map((l) => ({ item_id: l.item.id, qty: l.qty, modifiers: l.mods.map((m) => m.option_id), note: l.note || null })),
      };
      if (appendTo) payload.append_to_order_id = appendTo;
      const r = await fetch(SUPABASE_URL + "/functions/v1/place-order", { method: "POST", headers: H, body: JSON.stringify(payload) });
      const resp = await r.json();
      if (!r.ok) throw new Error(resp.message || resp.error || "Send failed");
      if (appendTo) {
        // Added to an existing order — clear the ticket and refresh the strip.
        setAppendTo(null); setTicket([]); setTable(null); setMsg("Items added to the order.");
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
        // Clear the cart; the order now lives in the strip.
        setTicket([]); setTable(null); setPlaced(null); setPayMethod(null); setPayPin("");
        if (thenPay && resp.order_id) {
          setPayNowOrder(localOrder);   // drives the panel immediately
          setSelPayNow(true);
          setSelOrderId(resp.order_id);
        }
        loadOrders(); // refresh the strip in the background
      }
    } catch (e) { setMsg(e.message || "Send failed"); } finally { setSending(false); }
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 56px)", background: P.canvas, color: P.ink, fontFamily: "'Hanken Grotesk',sans-serif" }}>
      {/* ── Slim header (single-screen: no mode switching) ── */}
      <div style={{ flexShrink: 0, background: P.panel, borderBottom: "1px solid " + P.line, padding: "10px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "-.3px" }}>Chocoberry POS</div>
        {unpaidCount > 0 && (
          <span style={{ fontSize: 14, color: "#fff", background: "#B23B3B", borderRadius: 20, padding: "5px 12px", fontWeight: 700 }}>
            {unpaidCount} unpaid · £{owedTotal.toFixed(2)}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 14, color: P.muted2 }}>London Road</span>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* COLUMN 1 — master categories (top) + orders list (below) */}
        <div style={{ width: "clamp(230px, 18vw, 300px)", flexShrink: 0, background: P.panel, borderRight: "1px solid " + P.line, display: "flex", flexDirection: "column", position: "relative" }}>
          {/* master categories — top, dark zone */}
          <div style={{ background: P.masterBg, padding: "11px 11px", display: "flex", flexDirection: "column", gap: 7, flexShrink: 0 }}>
            {catList.map((m, i) => {
              const on = activeCat === i;
              return (
                <div key={m.id} onClick={() => { setActiveCat(i); setActiveSub(0); setSearch(""); }} style={{ borderRadius: 12, padding: "14px 15px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontSize: 17, fontWeight: 700, background: on ? grad : "transparent", color: on ? "#fff" : P.masterMuted, boxShadow: on ? "0 4px 12px rgba(13,148,136,.4)" : "none" }}>
                  <span style={{ display: "flex", height: 24 }}>{menuIcon(m.name, on)}</span>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                </div>
              );
            })}
          </div>
          {/* orders list — fills the rest */}
          <div style={{ borderTop: "1px solid " + P.line, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <OrdersList orders={orders || []} now={now} selId={selOrderId} onSelect={(id) => { setSelPayNow(false); setPayNowOrder(null); setSelOrderId(id); }} />
          </div>
        </div>

        {/* COLUMN 2 — subcategories only, full height */}
        <div style={{ width: "clamp(195px, 15vw, 255px)", flexShrink: 0, background: P.panel, borderRight: "1px solid " + P.line, display: "flex", flexDirection: "column" }}>
          {master && <div style={{ padding: "14px 15px 9px", fontSize: 15, color: "#94a3b8", letterSpacing: ".5px", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{master.name}</div>}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 13px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {subs.map((s, i) => {
              const on = activeSub === i && !search;
              return (
                <div key={s.id} onClick={() => { setActiveSub(i); setSearch(""); }} style={{ borderRadius: 12, padding: "16px 15px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 700, lineHeight: 1.2, background: on ? grad : P.chip, color: on ? "#fff" : P.tealDeep, border: "1px solid " + (on ? "transparent" : P.chipBorder), boxShadow: on ? "0 4px 12px rgba(13,148,136,.3)" : "none" }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                </div>
              );
            })}
            {subs.length === 0 && cats !== null && <div style={{ color: P.muted2, fontSize: 15.5, textAlign: "center", marginTop: 20 }}>No categories</div>}
          </div>
        </div>

        {/* ITEM GRID */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#12161f" }}>
          <div style={{ padding: "16px 20px 0" }}>
            <div style={{ background: "#1c2230", border: "1px solid #2c3444", borderRadius: 14, padding: "0 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20, color: "#7b8698" }}>⌕</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the menu"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "14px 0", fontSize: 16, color: "#f1f3f7", fontFamily: "inherit" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "16px 20px 10px" }}>
            <span style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-.2px", color: "#f1f3f7" }}>{search ? "Results" : (sub ? sub.name : "")}</span>
            <span style={{ fontSize: 15.5, color: "#7b8698" }}>{shown.length} items</span>
          </div>
          <div style={{ flex: 1, padding: "2px 20px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gridAutoRows: "min-content", gap: 15, overflowY: "auto" }}>
            {cats === null && <div style={{ color: "#7b8698" }}>Loading menu…</div>}
            {cats && shown.length === 0 && <div style={{ color: "#7b8698" }}>No items.</div>}
            {shown.map((it) => {
              const fb = fallbackFor(it.name, it.category || "");
              const hasMods = it.modifiers && it.modifiers.length;
              const cc = catColor(it.category || (master && master.name));
              const inCart = qtyInCart[it.id] || 0;
              const soldOut = it.available === false;
              return (
                <div key={it.id} onClick={() => { if (!soldOut) addItem(it); }} style={{ borderRadius: 18, cursor: soldOut ? "not-allowed" : "pointer", position: "relative", overflow: "hidden", aspectRatio: "1 / 1", display: "flex", flexDirection: "column", justifyContent: "flex-end", boxShadow: inCart ? "0 0 0 2.5px " + P.tealA + ", 0 4px 14px rgba(0,0,0,.28)" : "0 4px 14px rgba(0,0,0,.28)", opacity: soldOut ? 0.5 : 1, background: it.image_url ? "#20242f" : "linear-gradient(150deg, " + cc.bar + ", " + cc.ink + ")", backgroundImage: it.image_url ? "url(" + it.image_url + ")" : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
                  {/* big icon for colour-block (no photo) */}
                  {!it.image_url && <span style={{ position: "absolute", top: "34%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 60, color: "rgba(255,255,255,.9)", filter: soldOut ? "grayscale(1)" : "none" }}>{fb.icon}</span>}
                  {/* readability gradient */}
                  <div style={{ position: "absolute", inset: 0, background: it.image_url ? "linear-gradient(to top, rgba(0,0,0,.76) 0%, rgba(0,0,0,.12) 48%, rgba(0,0,0,0) 72%)" : "linear-gradient(to top, rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 55%)" }} />
                  {/* category / sold-out chip */}
                  <span style={{ position: "absolute", top: 13, left: 13, fontSize: 11, fontWeight: 700, color: "#fff", background: soldOut ? "rgba(180,70,47,.9)" : "rgba(255,255,255,.24)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", padding: "3px 11px", borderRadius: 20, letterSpacing: ".01em" }}>{soldOut ? "86 · SOLD OUT" : (it.category || "").slice(0, 16)}</span>
                  {/* quantity badge / modifier / add */}
                  {!soldOut && inCart ? (
                    <span style={{ position: "absolute", top: 11, right: 11, minWidth: 40, height: 40, padding: "0 10px", borderRadius: 13, background: P.tealA, color: "#06231f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, boxShadow: "0 2px 8px rgba(0,0,0,.25)" }}>{inCart}</span>
                  ) : !soldOut ? (
                    <span style={{ position: "absolute", top: 11, right: 11, width: 40, height: 40, borderRadius: 13, background: "rgba(255,255,255,.24)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22, fontWeight: 400, lineHeight: 0, paddingBottom: 2 }}>+</span>
                  ) : null}
                  {/* modifier hint (bottom, subtle) shown via 'from' price */}
                  {/* name + price overlay */}
                  <div style={{ position: "relative", padding: 14, color: "#fff" }}>
                    <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-.01em", textShadow: "0 1px 5px rgba(0,0,0,.4)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.name}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3, opacity: 0.96, textShadow: "0 1px 4px rgba(0,0,0,.4)", fontVariantNumeric: "tabular-nums" }}>{hasMods ? "from " : ""}{gbp(it.price)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL — order detail when an order is tapped, else the cart */}
        <div style={{ width: "clamp(380px, 30vw, 560px)", flexShrink: 0, background: P.panel, borderLeft: "1px solid " + P.line, display: "flex", flexDirection: "column", boxShadow: "-6px 0 20px rgba(18,21,28,.04)" }}>
          {selOrderId && ((payNowOrder && payNowOrder.id === selOrderId) || (orders || []).some((o) => o.id === selOrderId)) ? (
            <OrderDetailPanel
              order={(payNowOrder && payNowOrder.id === selOrderId) ? payNowOrder : (orders || []).find((o) => o.id === selOrderId)}
              now={now}
              busy={ordersBusy}
              initialMode={selPayNow ? "method" : "detail"}
              onClose={() => { setSelOrderId(null); setSelPayNow(false); setPayNowOrder(null); }}
              onTakePayment={ordTakePayment}
              onPay={async (o, m) => { const res = await ordPay(o, m); if (res && res.ok && res.fully_paid) { setSelOrderId(null); setSelPayNow(false); setPayNowOrder(null); } return res; }}
              onUnpaid={ordUnpaid}
              onAddItems={(id) => { ordAddItems(id); setSelOrderId(null); setSelPayNow(false); setPayNowOrder(null); }}
              onRemoveItem={ordRemoveItem}
              onSetQty={ordSetQty}
              onSetType={ordSetType}
              onVoidFired={ordVoidFired}
              onReprint={ordReprint}
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
                  onEdit={hasMods ? () => editLine(l) : undefined}
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
      </div>

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
        <div onClick={() => { setModItem(null); setEditKey(null); setModNote(""); }} style={{ position: "fixed", inset: 0, background: "rgba(18,21,28,.4)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 22, width: 420, maxWidth: "100%", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(18,21,28,.3)" }}>
            <div style={{ fontWeight: 500, fontSize: 22 }}>{modItem.name}</div>
            <div style={{ color: P.muted, fontSize: 15.5, marginBottom: 18 }}>{gbp(modItem.price)} · {editKey ? "editing" : "customise"}</div>
            {(modItem.modifiers || []).map((g) => {
              const chosen = modSel[g.id] || [];
              const single = (g.max_select || 1) === 1;
              return (
                <div key={g.id} style={{ marginBottom: 18, background: "#f8fafa", border: "1px solid " + P.line, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 500 }}>{g.name || ""}</span>
                    {g.required
                      ? <span style={{ fontSize: 13, fontWeight: 500, color: "#fff", background: P.tealB, padding: "3px 10px", borderRadius: 12, letterSpacing: ".04em" }}>REQUIRED</span>
                      : <span style={{ fontSize: 13, fontWeight: 500, color: P.muted }}>{(g.max_select || 1) > 1 ? "Pick up to " + g.max_select : "Optional"}</span>}
                  </div>
                  {g.description && <div style={{ fontSize: 15, color: P.muted2, marginBottom: 10, lineHeight: 1.35 }}>{g.description}</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: g.description ? 0 : 8 }}>
                    {(g.options || []).map((o) => {
                      const on = chosen.includes(o.id);
                      return (
                        <div key={o.id} onClick={() => toggleOpt(g, o.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 15px", borderRadius: 11, cursor: "pointer", fontSize: 16, fontWeight: 500, background: on ? grad : "#fff", color: on ? "#fff" : P.ink, border: "1px solid " + (on ? "transparent" : P.line) }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ width: 20, height: 20, borderRadius: single ? "50%" : 6, border: "2px solid " + (on ? "#fff" : "#cbd5cf"), display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on ? <span style={{ color: "#fff", fontSize: 15 }}>✓</span> : null}</span>
                            {o.name}
                          </span>
                          {Number(o.price_delta) ? <span style={{ fontSize: 15.5, fontWeight: 500, color: on ? "rgba(255,255,255,.9)" : P.tealDeep }}>+{gbp(o.price_delta)}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div style={{ background: "#fffbf4", border: "1px solid #f0e2cc", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>📝 Kitchen note <span style={{ fontSize: 14, color: "#b0a48a", fontWeight: 400 }}>(optional)</span></div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {(() => {
                  const name = (modItem.name || "").toLowerCase();
                  const isDrink = /shake|coffee|latte|tea|juice|smoothie|drink|frapp|mocha|chai|hot choc/.test(name);
                  const chips = isDrink ? ["No ice", "Extra hot", "Less sweet", "Oat milk"] : ["No onion", "Well done", "On the side", "Extra sauce"];
                  chips.push("⚠ Allergy");
                  return chips.map((c) => {
                    const active = (modNote || "").split(",").map((s) => s.trim()).includes(c.replace("⚠ ", ""));
                    const isAl = c.includes("Allergy");
                    return (
                      <span key={c} onClick={() => {
                        const val = c.replace("⚠ ", "");
                        const parts = (modNote || "").split(",").map((s) => s.trim()).filter(Boolean);
                        if (parts.includes(val)) setModNote(parts.filter((p) => p !== val).join(", "));
                        else setModNote([...parts, val].join(", "));
                      }} style={{ fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "6px 12px", borderRadius: 20, border: "1px solid " + (isAl ? "#e6b8b0" : "#ead9bd"), background: active ? (isAl ? "#f7e0dc" : "#f6ead2") : "#fff", color: isAl ? "#c0392b" : "#9a6a2c" }}>{c}{active ? " ✓" : ""}</span>
                    );
                  });
                })()}
              </div>
              <input type="text" value={modNote} onChange={(e) => setModNote(e.target.value)} placeholder="Add a note for the kitchen…"
                style={{ width: "100%", boxSizing: "border-box", background: "#fff", border: "1px solid #ead9bd", borderRadius: 10, padding: "11px 13px", fontSize: 15.5, color: "#5b5540", fontFamily: "inherit", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 9, marginTop: 10 }}>
              <div onClick={() => { setModItem(null); setEditKey(null); setModNote(""); }} style={{ padding: "15px 20px", borderRadius: 13, background: P.chip, color: "#0f766e", fontWeight: 500, cursor: "pointer", fontSize: 16 }}>Cancel</div>
              <div onClick={() => !modMissing && confirmMods()} style={{ flex: 1, textAlign: "center", padding: "15px 0", borderRadius: 13, background: modMissing ? "#d7dade" : grad, color: "#fff", fontWeight: 500, fontSize: 17, cursor: modMissing ? "default" : "pointer", boxShadow: modMissing ? "none" : "0 6px 16px rgba(13,148,136,.3)" }}>{modMissing ? "Choose required options" : (editKey ? "Update · " : "Add · ") + gbp(modUnit)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
