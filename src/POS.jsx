import { useState, useEffect, useMemo } from "react";
import { OrdersList, OrderDetailPanel } from "./OrdersStrip.jsx";

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
  const [modItem, setModItem] = useState(null);
  const [modSel, setModSel] = useState({});
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
      const url = SUPABASE_URL + "/rest/v1/menu_orders?select=id,order_no,tablet_no,table_id,order_type,pickup_name,total,paid_method,paid_amount,created_at,status,menu_tables(label),menu_order_items(id,name_snapshot,qty,price_snapshot,modifiers_snapshot,line_total)"
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
        body: JSON.stringify({ pin: posPin, action, data: dataObj }),
      });
      if (r.status === 401) { setPosPin(""); return false; } // wrong PIN — re-prompt
      await loadOrders();
      return r.ok;
    } catch { return false; } finally { setOrdersBusy(false); }
  }
  const ordPay = (o, method) => ordAction("mark_paid", { order_id: o.id, method });
  const ordUnpaid = (o) => ordAction("mark_unpaid", { order_id: o.id });
  const ordRemoveItem = (o, iid) => ordAction("remove_order_item", { order_id: o.id, order_item_id: iid });
  const ordSetQty = (o, iid, qty) => ordAction("set_order_item_qty", { order_id: o.id, order_item_id: iid, qty });
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
  const [appendTo, setAppendTo] = useState(null); // order id we're adding to
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
          if (row.available === false) continue;
          let mn = menuMap.get(row.menu_id);
          if (!mn) { mn = { id: row.menu_id, name: row.menu_name, sort: row.menu_sort ?? 0, subMap: new Map() }; menuMap.set(row.menu_id, mn); }
          let sc = mn.subMap.get(row.category_id);
          if (!sc) { sc = { id: row.category_id, name: row.category_name, sort: row.category_sort ?? 0, items: [] }; mn.subMap.set(row.category_id, sc); }
          sc.items.push({ id: row.item_id, name: row.item_name, price: Number(row.price), image_url: row.image_url, category: row.category_name, modifiers: row.modifiers || [] });
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

  function addItem(it) {
    if (it.modifiers && it.modifiers.length) {
      // pre-select the first option of any required single-select group
      const init = {};
      for (const g of it.modifiers) {
        if (g.required && (g.max_select || 1) === 1 && g.options && g.options.length) init[g.id] = [g.options[0].id];
      }
      setModItem(it); setModSel(init);
    } else pushLine(it, it.price, []);
  }
  function pushLine(it, unit, mods) {
    setTicket((prev) => {
      const sig = it.id + "|" + mods.map((x) => x.option_id).sort().join(",");
      const i = prev.findIndex((l) => l.sig === sig);
      if (i >= 0) { const c = prev.slice(); c[i] = { ...c[i], qty: c[i].qty + 1 }; return c; }
      return [...prev, { key: Math.random().toString(36).slice(2), sig, item: it, qty: 1, unit, mods }];
    });
  }
  function confirmMods() {
    const groups = modItem.modifiers || [];
    const chosen = groups.flatMap((g) => (g.options || []).filter((o) => (modSel[g.id] || []).includes(o.id)).map((o) => ({ group: g.name, name: o.name, price_delta: Number(o.price_delta || 0), option_id: o.id })));
    pushLine(modItem, modItem.price + chosen.reduce((s, x) => s + x.price_delta, 0), chosen);
    setModItem(null); setModSel({});
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
  const clearAll = () => { setTicket([]); setTable(null); setPlaced(null); setMsg(""); setPayMethod(null); setPayPin(""); };

  async function sendOrder() {
    if (!ticket.length) return;
    setSending(true); setMsg("");
    try {
      const payload = {
        qr_token: storeToken || null, location_id: loc || null,
        table_id: table ? table.id : null, order_type: table ? "dine_in" : "takeaway",
        pickup_name: null, tablet_no: "POS",
        items: ticket.map((l) => ({ item_id: l.item.id, qty: l.qty, modifiers: l.mods.map((m) => m.option_id) })),
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
        setPlaced({ id: resp.order_id, order_no: resp.order_no, total: subtotal });
        setMsg("Sent — order #" + resp.order_no);
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
  const grad = "linear-gradient(140deg," + P.tealA + "," + P.tealB + ")";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 56px)", background: P.canvas, color: P.ink, fontFamily: "'Hanken Grotesk',sans-serif" }}>
      {/* ── Slim header (single-screen: no mode switching) ── */}
      <div style={{ flexShrink: 0, background: P.panel, borderBottom: "1px solid " + P.line, padding: "10px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "-.3px" }}>Chocoberry POS</div>
        {unpaidCount > 0 && (
          <span style={{ fontSize: 12, color: "#fff", background: "#B23B3B", borderRadius: 20, padding: "5px 12px", fontWeight: 700 }}>
            {unpaidCount} unpaid · £{owedTotal.toFixed(2)}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: P.muted2 }}>London Road</span>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* COLUMN 1 — master categories (top) + orders list (below) */}
        <div style={{ width: 276, flexShrink: 0, background: P.panel, borderRight: "1px solid " + P.line, display: "flex", flexDirection: "column", position: "relative" }}>
          {!posPin && (
            <div style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(244,241,232,.97)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "#fff", borderRadius: 16, padding: "22px 20px", boxShadow: "0 12px 40px rgba(60,70,45,.18)", textAlign: "center", width: 200 }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 5 }}>Staff PIN</div>
                <div style={{ fontSize: 12, color: "#7a828e", marginBottom: 14 }}>Enter PIN to view orders and take payments.</div>
                <input type="text" inputMode="numeric" value={posPin} onChange={(e) => setPosPin(e.target.value.replace(/\D/g, ""))} placeholder="PIN"
                  autoComplete="off" data-1p-ignore data-lpignore="true" readOnly onFocus={(e) => e.target.removeAttribute("readonly")}
                  style={{ width: 150, textAlign: "center", fontSize: 20, letterSpacing: 5, padding: "12px 0", borderRadius: 12, border: "1px solid #e8e9ec", background: "#F4F1E8", color: "#262A1E", WebkitTextSecurity: "disc", textSecurity: "disc", fontFamily: "inherit" }} />
              </div>
            </div>
          )}
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
            <OrdersList orders={orders || []} now={now} selId={selOrderId} onSelect={(id) => setSelOrderId(id)} />
          </div>
        </div>

        {/* COLUMN 2 — subcategories only, full height */}
        <div style={{ width: 237, flexShrink: 0, background: P.panel, borderRight: "1px solid " + P.line, display: "flex", flexDirection: "column" }}>
          {master && <div style={{ padding: "14px 15px 9px", fontSize: 13, color: "#94a3b8", letterSpacing: ".5px", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{master.name}</div>}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 13px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {subs.map((s, i) => {
              const on = activeSub === i && !search;
              return (
                <div key={s.id} onClick={() => { setActiveSub(i); setSearch(""); }} style={{ borderRadius: 12, padding: "16px 15px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 700, lineHeight: 1.2, background: on ? grad : P.chip, color: on ? "#fff" : P.tealDeep, border: "1px solid " + (on ? "transparent" : P.chipBorder), boxShadow: on ? "0 4px 12px rgba(13,148,136,.3)" : "none" }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                </div>
              );
            })}
            {subs.length === 0 && cats !== null && <div style={{ color: P.muted2, fontSize: 14, textAlign: "center", marginTop: 20 }}>No categories</div>}
          </div>
        </div>

        {/* ITEM GRID */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 20px 0" }}>
            <div style={{ background: P.panel, border: "1px solid " + P.line, borderRadius: 14, padding: "0 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20, color: P.muted2 }}>⌕</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the menu"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "14px 0", fontSize: 16, color: P.ink, fontFamily: "inherit" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "16px 20px 10px" }}>
            <span style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-.2px" }}>{search ? "Results" : (sub ? sub.name : "")}</span>
            <span style={{ fontSize: 14, color: P.muted2 }}>{shown.length} items</span>
          </div>
          <div style={{ flex: 1, padding: "2px 20px 20px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridAutoRows: "min-content", gap: 14, overflowY: "auto" }}>
            {cats === null && <div style={{ color: P.muted2 }}>Loading menu…</div>}
            {cats && shown.length === 0 && <div style={{ color: P.muted2 }}>No items.</div>}
            {shown.map((it) => {
              const fb = fallbackFor(it.name, it.category || "");
              const hasMods = it.modifiers && it.modifiers.length;
              return (
                <div key={it.id} onClick={() => addItem(it)} style={{ background: P.panel, borderRadius: 16, overflow: "hidden", boxShadow: "0 3px 10px rgba(18,21,28,.08)", border: "1px solid #f0f1f3", cursor: "pointer", position: "relative", display: "flex", flexDirection: "column" }}>
                  {hasMods ? <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(255,255,255,.94)", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "#8a5a2c", boxShadow: "0 1px 3px rgba(0,0,0,.12)", zIndex: 2 }}>Choices</div> : null}
                  {/* square photo on top */}
                  <div style={{ width: "100%", aspectRatio: "1 / 1", background: it.image_url ? "#f0f1f3" : fb.grad, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: it.image_url ? "url(" + it.image_url + ")" : fb.grad, backgroundSize: "cover", backgroundPosition: "center" }}>
                    {!it.image_url && <span style={{ fontSize: 38 }}>{fb.icon}</span>}
                  </div>
                  {/* name + price below */}
                  <div style={{ padding: "10px 11px 12px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.25, minHeight: 34 }}>{it.name}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: "auto" }}>
                      <span style={{ color: P.ink, fontWeight: 700, fontSize: 17 }}>{gbp(it.price)}</span>
                      <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 10, background: P.tealBg, color: P.tealDeep, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 400, lineHeight: 0, paddingBottom: 2, boxShadow: "0 1px 4px rgba(13,148,136,.18)" }}>+</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL — order detail when an order is tapped, else the cart */}
        <div style={{ width: 447, flexShrink: 0, background: P.panel, borderLeft: "1px solid " + P.line, display: "flex", flexDirection: "column", boxShadow: "-6px 0 20px rgba(18,21,28,.04)" }}>
          {selOrderId && (orders || []).some((o) => o.id === selOrderId) ? (
            <OrderDetailPanel
              order={(orders || []).find((o) => o.id === selOrderId)}
              now={now}
              busy={ordersBusy}
              onClose={() => setSelOrderId(null)}
              onPay={async (o, m) => { const ok = await ordPay(o, m); if (ok !== false) setSelOrderId(null); }}
              onUnpaid={ordUnpaid}
              onAddItems={(id) => { ordAddItems(id); setSelOrderId(null); }}
              onRemoveItem={ordRemoveItem}
              onSetQty={ordSetQty}
              onReprint={ordReprint}
            />
          ) : (
          <>
          <div style={{ padding: "17px 19px 14px", borderBottom: "1px solid " + P.line2 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
              <span style={{ fontWeight: 500, fontSize: 19, letterSpacing: "-.2px" }}>Current order</span>
              <span style={{ fontSize: 12, color: P.muted, background: "#f3f4f6", padding: "5px 12px", borderRadius: 20, fontWeight: 500, fontSize: 14 }}>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <select value={table ? table.id : ""} onChange={(e) => { const t = tablesList.find((x) => x.id === e.target.value); setTable(t ? { id: t.id, label: t.label } : null); }}
                style={{ flex: 1, textAlign: "center", padding: "13px 6px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", background: table ? grad : P.chip, color: table ? "#fff" : "#7a828e", boxShadow: table ? "0 4px 10px rgba(229,57,122,.28)" : "none" }}>
                <option value="">Table…</option>
                {tablesList.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <div onClick={() => setTable(null)} style={{ flex: 1, textAlign: "center", padding: "13px 0", borderRadius: 12, background: !table ? grad : P.chip, color: !table ? "#fff" : "#7a828e", fontSize: 15, fontWeight: 500, cursor: "pointer", boxShadow: !table ? "0 4px 10px rgba(229,57,122,.28)" : "none" }}>Takeaway</div>
            </div>
          </div>

          <div style={{ flex: 1, padding: "4px 17px", overflowY: "auto" }}>
            {ticket.length === 0 && <div style={{ color: P.muted2, textAlign: "center", marginTop: 48, fontSize: 16 }}>Tap items to build the order</div>}
            {ticket.map((l) => (
              <div key={l.key} style={{ padding: "14px 0", borderBottom: "1px solid #f4f5f7" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 500, fontSize: 16 }}>{l.item.name}</span>
                  <span style={{ fontWeight: 500, fontSize: 16 }}>{gbp(l.unit * l.qty)}</span>
                </div>
                {l.mods.length > 0 && <div style={{ fontSize: 13, color: "#8a5a2c", marginTop: 4 }}>+ {l.mods.map((m) => m.name).join(", ")}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 11 }}>
                  <span onClick={() => setQty(l.key, -1)} style={{ width: 38, height: 38, borderRadius: 11, background: P.chip, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#616976", cursor: "pointer", fontSize: 22, fontWeight: 500 }}>−</span>
                  <span style={{ fontWeight: 500, minWidth: 24, textAlign: "center", fontSize: 18 }}>{l.qty}</span>
                  <span onClick={() => setQty(l.key, 1)} style={{ width: 38, height: 38, borderRadius: 11, background: P.chip, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#616976", cursor: "pointer", fontSize: 22, fontWeight: 500 }}>+</span>
                  <span onClick={() => removeLine(l.key)} style={{ marginLeft: "auto", width: 38, height: 38, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#c94a4a", cursor: "pointer", fontSize: 16 }}>✕</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid " + P.line, padding: "16px 19px", background: "#fbfbfc" }}>
            {msg && <div style={{ fontSize: 13, textAlign: "center", marginBottom: 10, color: (msg.includes("fail") || msg.includes("Wrong")) ? "#c94a4a" : "#16a34a" }}>{msg}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: "#7a828e", marginBottom: 12 }}>
              <span>Subtotal</span><span>{gbp(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 15, paddingTop: 12, borderTop: "1px dashed #e2e4e8" }}>
              <span style={{ fontSize: 18, fontWeight: 500 }}>Total</span>
              <span style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-.6px" }}>{gbp(subtotal)}</span>
            </div>

            {!placed ? (
              <div style={{ display: "flex", gap: 9 }}>
                <div onClick={clearAll} style={{ width: 58, textAlign: "center", padding: "19px 0", borderRadius: 15, background: P.chip, color: "#616976", cursor: "pointer", fontSize: 18 }}>✕</div>
                <div onClick={sendOrder} style={{ flex: 1, textAlign: "center", padding: "19px 0", borderRadius: 15, background: ticket.length ? grad : "#d7dade", color: "#fff", fontWeight: 500, fontSize: 19, cursor: ticket.length ? "pointer" : "default", boxShadow: ticket.length ? "0 7px 18px rgba(229,57,122,.34)" : "none", opacity: sending ? .6 : 1 }}>{sending ? "Sending…" : "Send to kitchen"}</div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 9 }}>
                  {[["cash", "Cash"], ["card", "Card"]].map(([m, label]) => (
                    <div key={m} onClick={() => setPayMethod(m)} style={{ flex: 1, textAlign: "center", padding: "15px 0", borderRadius: 12, cursor: "pointer", fontWeight: 500, fontSize: 17, background: payMethod === m ? grad : P.chip, color: payMethod === m ? "#fff" : "#5f6774" }}>{label}</div>
                  ))}
                </div>
                <input type="text" inputMode="numeric" value={payPin} onChange={(e) => setPayPin(e.target.value.replace(/\D/g, ""))} placeholder="Staff PIN"
                  autoComplete="off" data-1p-ignore data-lpignore="true" readOnly onFocus={(e) => e.target.removeAttribute("readonly")}
                  style={{ width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 18, letterSpacing: 5, padding: "12px 0", borderRadius: 12, border: "1px solid " + P.line, background: "#fff", color: P.ink, marginBottom: 9, WebkitTextSecurity: "disc", textSecurity: "disc", fontFamily: "inherit" }} />
                <div style={{ display: "flex", gap: 9 }}>
                  <div onClick={clearAll} style={{ padding: "17px 20px", textAlign: "center", borderRadius: 14, background: P.chip, color: "#616976", fontWeight: 500, cursor: "pointer", fontSize: 16 }}>New</div>
                  <div onClick={takePayment} style={{ flex: 1, textAlign: "center", padding: "15px 0", borderRadius: 14, background: (payMethod && payPin) ? "linear-gradient(140deg,#22c55e,#16a34a)" : "#d7dade", color: "#fff", fontWeight: 500, fontSize: 18, cursor: (payMethod && payPin) ? "pointer" : "default", opacity: payBusy ? .6 : 1 }}>{payBusy ? "…" : "Take payment"}</div>
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </div>
      </div>

      {/* MODIFIER POPUP */}
      {modItem && (
        <div onClick={() => setModItem(null)} style={{ position: "fixed", inset: 0, background: "rgba(18,21,28,.4)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 22, width: 420, maxWidth: "100%", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(18,21,28,.3)" }}>
            <div style={{ fontWeight: 500, fontSize: 22 }}>{modItem.name}</div>
            <div style={{ color: P.muted, fontSize: 14, marginBottom: 18 }}>{gbp(modItem.price)} · customise</div>
            {(modItem.modifiers || []).map((g) => {
              const chosen = modSel[g.id] || [];
              const single = (g.max_select || 1) === 1;
              return (
                <div key={g.id} style={{ marginBottom: 18, background: "#f8fafa", border: "1px solid " + P.line, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 500 }}>{g.name || ""}</span>
                    {g.required
                      ? <span style={{ fontSize: 11, fontWeight: 500, color: "#fff", background: P.tealB, padding: "3px 10px", borderRadius: 12, letterSpacing: ".04em" }}>REQUIRED</span>
                      : <span style={{ fontSize: 11, fontWeight: 500, color: P.muted }}>{(g.max_select || 1) > 1 ? "Pick up to " + g.max_select : "Optional"}</span>}
                  </div>
                  {g.description && <div style={{ fontSize: 13, color: P.muted2, marginBottom: 10, lineHeight: 1.35 }}>{g.description}</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: g.description ? 0 : 8 }}>
                    {(g.options || []).map((o) => {
                      const on = chosen.includes(o.id);
                      return (
                        <div key={o.id} onClick={() => toggleOpt(g, o.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 15px", borderRadius: 11, cursor: "pointer", fontSize: 16, fontWeight: 500, background: on ? grad : "#fff", color: on ? "#fff" : P.ink, border: "1px solid " + (on ? "transparent" : P.line) }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ width: 20, height: 20, borderRadius: single ? "50%" : 6, border: "2px solid " + (on ? "#fff" : "#cbd5cf"), display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on ? <span style={{ color: "#fff", fontSize: 13 }}>✓</span> : null}</span>
                            {o.name}
                          </span>
                          {Number(o.price_delta) ? <span style={{ fontSize: 14, fontWeight: 500, color: on ? "rgba(255,255,255,.9)" : P.tealDeep }}>+{gbp(o.price_delta)}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 9, marginTop: 10 }}>
              <div onClick={() => setModItem(null)} style={{ padding: "15px 20px", borderRadius: 13, background: P.chip, color: "#0f766e", fontWeight: 500, cursor: "pointer", fontSize: 16 }}>Cancel</div>
              <div onClick={() => !modMissing && confirmMods()} style={{ flex: 1, textAlign: "center", padding: "15px 0", borderRadius: 13, background: modMissing ? "#d7dade" : grad, color: "#fff", fontWeight: 500, fontSize: 17, cursor: modMissing ? "default" : "pointer", boxShadow: modMissing ? "none" : "0 6px 16px rgba(13,148,136,.3)" }}>{modMissing ? "Choose required options" : "Add · " + gbp(modUnit)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
