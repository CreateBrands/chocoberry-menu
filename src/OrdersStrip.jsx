import { useState, useMemo, useEffect, useRef } from "react";
import CartLine from "./CartLine.jsx";

// ── Single-screen POS orders ─────────────────────────────────────────
// OrdersList       → compact list (under master categories in col 1)
// OrderDetailPanel → fills the right panel (shared with cart) when an
//                    order is tapped: detail → payment → edit.
// No icon-font dependency (inline SVG + text); high-contrast colours.

const money = (n) => "£" + Number(n || 0).toFixed(2);
function mins(ts, now) { return Math.max(0, Math.floor((now - ts) / 60000)); }
function agoLabel(m) { if (m < 1) return "just now"; if (m < 60) return m + " min"; return Math.floor(m / 60) + "h " + (m % 60) + "m"; }
function ageColor(m) { if (m < 5) return "#B23B3B"; if (m < 15) return "#C67A2C"; return "#6b7260"; }

const C = {
  bg: "#F4F1E8", card: "#fff", ink: "#2A2E20", sub: "#5c6350",
  danger: "#B23B3B", paidGreen: "#2f6b4f", paidText: "#33402f", line: "rgba(60,70,45,.14)",
};

const Ico = {
  // Used by the split-by-item tick boxes. It was referenced there but never
  // defined, so ticking an item threw "Ico.check is not a function" and took
  // the whole panel down.
  check: (s = 13, c = "#fff") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6.5" /></svg>),
  bag: (s = 16, c = "#5E7A4D") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-1 12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /><path d="M9 12h6" /></svg>),
  utensils: (s = 16, c = "#5E7A4D") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3v7a2 2 0 0 0 4 0V3M7 10v11" /><path d="M17 3c-1.5 0-2.5 2-2.5 4.5S15.5 12 17 12v9" /></svg>),
  card: (s = 14, c = "#33402f") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>),
  cash: (s = 14, c = "#33402f") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>),
  printer: (s = 17, c = "#2f6b4f") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>),
  trash: (s = 16, c = "#B23B3B") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>),
  plus: (s = 16, c = "#3a5730") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>),
  back: (s = 18, c = "#5c6350") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>),
  x: (s = 18, c = "#5c6350") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>),
};

function tableNum(o) { if (o.menu_tables && o.menu_tables.label) return String(o.menu_tables.label).replace(/^table\s*/i, ""); return null; }
// Category icon + gradient fallback for line thumbnails (matches the POS cart).
const CB_CAT_ICONS = [
  { k: ["dessert", "kanafeh", "cake", "sweet", "waffle", "croissant", "toast"], icon: "🍰", grad: "linear-gradient(140deg,#fce1d0,#eba97b)" },
  { k: ["matcha", "tea"], icon: "🍵", grad: "linear-gradient(140deg,#e4eac7,#acc771)" },
  { k: ["coffee", "latte", "espresso", "flat white", "cappuccino"], icon: "☕", grad: "linear-gradient(140deg,#edd7c3,#cc9e71)" },
  { k: ["shake", "smoothie"], icon: "🥤", grad: "linear-gradient(140deg,#f9ebd1,#e1b56f)" },
  { k: ["mocktail", "drink", "juice", "lemon", "soda"], icon: "🍹", grad: "linear-gradient(140deg,#fde0ea,#f4a0c0)" },
  { k: ["hot", "cocoa", "chocolate"], icon: "🍫", grad: "linear-gradient(140deg,#eac6a3,#b97b4e)" },
  { k: ["breakfast", "egg", "brunch", "omelette"], icon: "🍳", grad: "linear-gradient(140deg,#fdeec2,#e8b96a)" },
  { k: ["burger", "chicken", "wings", "fries", "chips", "wrap"], icon: "🍔", grad: "linear-gradient(140deg,#f6ddc0,#d99b63)" },
];
function cbFallback(name = "") {
  const hay = name.toLowerCase();
  for (const c of CB_CAT_ICONS) if (c.k.some((w) => hay.includes(w))) return c;
  return { icon: "🍽", grad: "linear-gradient(140deg,#f6eedc,#dec89d)" };
}

function isDineIn(o) { return (o.order_type || "").toLowerCase().includes("dine"); }
// Detect where an order came from, for the source badge.
function orderSource(o) {
  const t = String(o.tablet_no || "").toLowerCase();
  const ch = String(o.channel || o.source || "").toLowerCase();
  if (t.startsWith("kiosk")) return { kind: "kiosk", label: o.status === "hold" ? "Kiosk · pay" : "Kiosk" };
  if (t.includes("phone") || ch.includes("phone") || ch.includes("retell")) return { kind: "phone", label: "Phone" };
  if (t.includes("web") || ch.includes("web") || ch.includes("foodhub") || ch.includes("online")) return { kind: "web", label: "Web" };
  if (t === "pos" || ch.includes("pos") || ch.includes("counter")) return { kind: "counter", label: "Counter" };
  return { kind: "tablet", label: "Tablet" }; // default: in-store tablet
}
// Clean inline SVG source icons (consistent set, no emoji).
function srcIcon(kind, size = 15, color = "#5E7A4D") {
  if (kind === "kiosk") kind = "counter";
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0 } };
  if (kind === "phone") return (<svg {...p}><path d="M6 3h3l2 5-2 1a12 12 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z" /></svg>);
  if (kind === "web") return (<svg {...p}><circle cx="12" cy="12" r="9" /><line x1="3" y1="12" x2="21" y2="12" /><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" /></svg>);
  if (kind === "counter") return (<svg {...p}><path d="M4 7h16l-1 5H5L4 7Z" /><path d="M5 12v7h14v-7" /><line x1="4" y1="7" x2="20" y2="7" /></svg>);
  // tablet
  return (<svg {...p}><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="10" y1="18" x2="14" y2="18" /></svg>);
}
function orderName(o) { return o.pickup_name || (o.menu_tables && o.menu_tables.label) || "Order"; }
function modLine(it) {
  const m = it.modifiers_snapshot;
  if (!m) return "";
  if (Array.isArray(m)) return m.join(" · ");
  if (typeof m === "object") return Object.values(m).join(" · ");
  return String(m);
}
// Normalize a snapshot's modifiers to a flat array of names (for CartLine).
function modArray(it) {
  const m = it.modifiers_snapshot;
  if (!m) return [];
  if (Array.isArray(m)) return m.map((x) => String(x));
  if (typeof m === "object") return Object.values(m).map((x) => String(x));
  return [String(m)];
}

function Tile({ o, size = 38, paid = false }) {
  const tn = tableNum(o);
  if (!tn) {
    return (<div style={{ width: size, height: size, borderRadius: 10, background: paid ? "#e3ead9" : "#e9edd8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{Ico.bag(size * 0.5, paid ? C.paidGreen : "#5E7A4D")}</div>);
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 10, background: paid ? C.paidGreen : C.danger, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1, flexShrink: 0 }}>
      <span style={{ fontSize: size * 0.16, fontWeight: 700, opacity: .9, letterSpacing: .5 }}>TABLE</span>
      <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: size * 0.36 }}>{tn}</span>
    </div>
  );
}

// ═══ ORDERS LIST (column 1, under masters) ═══
export function OrdersList({ orders = [], now = Date.now(), selId, onSelect }) {
  const [tab, setTab] = useState("unpaid");
  const { unpaid, paid } = useMemo(() => {
    const u = [], p = [];
    for (const o of orders) { if (o.status === "cancelled") continue; (o.paid_method ? p : u).push(o); }
    u.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { unpaid: u, paid: p };
  }, [orders]);
  const owed = unpaid.reduce((s, o) => s + Number(o.total || 0), 0);
  const list = tab === "unpaid" ? unpaid : paid;

  function Row({ o, paid }) {
    const selected = selId === o.id;
    const m = mins(new Date(o.created_at).getTime(), now);
    return (
      <div onClick={() => onSelect(o.id)} style={{ background: C.card, border: "1.5px solid " + (selected ? (paid ? C.paidGreen : C.danger) : C.line), borderRadius: 12, padding: "9px 10px", marginBottom: 7, display: "flex", alignItems: "center", gap: 9, cursor: "pointer", boxShadow: selected ? "0 3px 10px -3px rgba(60,70,45,.2)" : "none" }}>
        <Tile o={o} paid={paid} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{orderName(o)}</div>
          <div style={{ fontSize: 10.5, color: paid ? C.sub : ageColor(m), fontWeight: 600, marginTop: 2 }}>#{o.order_no}{paid ? " · " + (o.paid_method === "cash" ? "Cash" : "Card") : " · " + agoLabel(m)}{o.status === "hold" ? " · " : ""}{o.status === "hold" && <span style={{ color: "#fff", background: "#C67A2C", fontWeight: 800, fontSize: 9.5, padding: "1px 6px", borderRadius: 5, letterSpacing: ".02em" }}>HOLD · NOT SENT</span>}{o.print_failed ? " · " : ""}{o.print_failed && <span style={{ color: "#fff", background: "#dc2626", fontWeight: 800, fontSize: 9.5, padding: "1px 6px", borderRadius: 5, letterSpacing: ".02em" }}>⚠ NOT PRINTED</span>}</div>
        </div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 14, color: paid ? C.paidText : C.danger }}>{money(o.total)}</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, background: C.bg, display: "flex", flexDirection: "column", fontFamily: "'Hanken Grotesk',sans-serif", color: C.ink }}>
      <div style={{ padding: "10px 10px 7px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 3, background: "#e7e3d7", borderRadius: 10, padding: 3 }}>
          <span onClick={() => setTab("unpaid")} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: tab === "unpaid" ? "#fff" : "transparent", color: tab === "unpaid" ? C.danger : C.sub, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            Unpaid {unpaid.length > 0 && <span style={{ background: C.danger, color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 10.5, fontWeight: 700 }}>{unpaid.length}</span>}
          </span>
          <span onClick={() => setTab("paid")} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: tab === "paid" ? "#fff" : "transparent", color: tab === "paid" ? C.paidGreen : C.sub }}>
            Paid {paid.length > 0 && <span style={{ color: C.sub, fontSize: 11 }}>{paid.length}</span>}
          </span>
        </div>
      </div>
      {tab === "unpaid" && unpaid.length > 0 && (
        <div style={{ padding: "0 11px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.danger, textTransform: "uppercase", letterSpacing: .5 }}>Owed</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.danger }}>{money(owed)}</span>
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 10px 12px", WebkitOverflowScrolling: "touch" }}>
        {list.map((o) => <Row key={o.id} o={o} paid={tab === "paid"} />)}
        {list.length === 0 && <div style={{ padding: "30px 10px", textAlign: "center", color: C.sub, fontSize: 12.5 }}>{tab === "unpaid" ? "No unpaid orders." : "No paid orders yet."}</div>}
      </div>
    </div>
  );
}

// ═══ ORDER DETAIL PANEL (right, shared with cart) ═══
export function OrderDetailPanel({ order, now = Date.now(), busy = false, initialMode = "detail", onClose, onTakePayment, onPay, onUnpaid, onAddItems, onRemoveItem, onSetQty, onSetType, onVoidFired, onReprint, onFeedback, onDiscount, onRemoveDiscount, onRefund, onPrintRefund, onSetTable, tables = [], printingId = null }) {
  // modes: detail | method | cash | splitAmt | splitEven | splitItem | edit | voidReason
  const [mode, setMode] = useState(initialMode);
  const [cashGiven, setCashGiven] = useState(null);
  const payingRef = useRef(false);                     // in-flight payment latch
  const [paying, setPaying] = useState(false);         // local; `busy` is a prop
  const isBusy = busy || paying;
  const [splitAmt, setSplitAmt] = useState("");        // typed amount for split-by-amount
  const [evenN, setEvenN] = useState(2);               // number of ways for split-evenly
  const [evenGiven, setEvenGiven] = useState(null);    // cash tendered for current even share
  const [pickIds, setPickIds] = useState({});          // {itemId:true} chosen for split-by-item
  const [voidItem, setVoidItem] = useState(null);      // item pending a void reason
  const [note, setNote] = useState("");                // transient status line
  const o = order;
  // When the panel is (re)opened for a NEW order via "Pay now", jump straight
  // to the payment method picker. Keyed on the order id so it fires once per
  // order even if initialMode was captured before the order object arrived.
  const oid = o ? o.id : null;
  useEffect(() => {
    if (initialMode === "method") setMode("method");
    else setMode("detail");
    // reset transient inputs for the newly-shown order
    setCashGiven(null); setSplitAmt(""); setEvenGiven(null); setPickIds({}); setVoidItem(null); setNote("");
  }, [oid, initialMode]); // eslint-disable-line
  // Sheets (declared before any early return so hook order is stable)
  const [moveTable, setMoveTable] = useState(false);
  const [dsc, setDsc] = useState(null);   // { type: "percent"|"amount", value, reason, pin }
  const [rfd, setRfd] = useState(null);   // { amount, method, reason, pin }
  const [sheetErr, setSheetErr] = useState("");
  const [sheetBusy, setSheetBusy] = useState(false);
  if (!o) return null;
  const its = o.menu_order_items || [];
  const gross = Math.round(Number(o.total || 0) * 100) / 100;
  const discount = Math.round(Number(o.discount_amount || 0) * 100) / 100;
  const total = Math.round((gross - discount) * 100) / 100; // amount due after discount
  const paidSoFar = Math.round(Number(o.amount_paid || 0) * 100) / 100;
  const refunded = Math.round(Number(o.refund_total || 0) * 100) / 100;
  const remaining = Math.round((total - paidSoFar) * 100) / 100;
  const isPaid = !!o.paid_method || remaining <= 0.001;
  const PinPad = ({ value, onChange }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, maxWidth: 300, margin: "0 auto" }}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "C"].map((k) => (
        <span key={k} onClick={() => onChange(k === "⌫" ? value.slice(0, -1) : k === "C" ? "" : (value + k).slice(0, 8))} style={{ padding: "14px 0", textAlign: "center", borderRadius: 10, background: "#f3f4f6", fontWeight: 800, fontSize: 18, cursor: "pointer", userSelect: "none" }}>{k}</span>
      ))}
    </div>
  );
  const Dots = ({ n }) => <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "10px 0 12px" }}>{[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: i < n ? C.ink : "#e5e7eb" }} />)}{n > 4 && <span style={{ fontSize: 12, color: C.sub }}>+{n - 4}</span>}</div>;

  async function pay(method, amount, extra) {
    // DOUBLE-TAP GUARD. `busy` was checked on some buttons but never set here,
    // so two taps fired two identical tenders milliseconds apart and the order
    // was recorded as paid twice. The database now refuses the duplicate; this
    // stops it being attempted at all, so staff see nothing rather than an error.
    if (payingRef.current) return { ok: false, duplicate: true };
    payingRef.current = true;
    setPaying(true);
    const fn = onTakePayment || onPay;
    let res;
    try {
      res = await fn(o, method, amount, extra || {});
    } finally {
      setPaying(false);
      // Short tail so a second tap landing just after the response still misses.
      setTimeout(() => { payingRef.current = false; }, 1200);
    }
    if (res && res.unauthorized) { setNote("Enter your PIN and try again."); return res; }
    if (res && res.ok === false) { setNote("Payment failed — try again."); return res; }
    if (res && res.fully_paid) { /* parent closes panel */ return res; }
    // partial: reset transient inputs, stay on detail with updated remaining
    setCashGiven(null); setSplitAmt(""); setEvenGiven(null);
    setNote(res && res.remaining != null ? ("£" + Number(res.remaining).toFixed(2) + " left to pay") : "");
    setMode("detail");
    return res;
  }

  const HeaderBar = (title) => (
    <div style={{ padding: "12px 15px", borderBottom: "1px solid #f1f2f4", display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
      <Tile o={o} size={44} paid={isPaid} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title || orderName(o)}</div>
        <div style={{ fontSize: 10.5, color: C.sub, marginTop: 3, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>#{o.order_no}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f3f4f6", padding: "3px 8px", borderRadius: 8 }} title={orderSource(o).label + " order"}>{srcIcon(orderSource(o).kind, 13)} {orderSource(o).label}</span>
          {!isPaid && onSetType ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#eef1f4", borderRadius: 9, padding: 2 }}>
              <span onClick={() => !isDineIn(o) && onSetType(o, "dine-in")} title="Dine-in" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: isDineIn(o) ? "5px 10px" : "5px 7px", borderRadius: 7, cursor: "pointer", background: isDineIn(o) ? "#5E7A4D" : "transparent", color: isDineIn(o) ? "#fff" : C.sub }}>{Ico.utensils(13, isDineIn(o) ? "#fff" : C.sub)}{isDineIn(o) && <span>Dine-in</span>}</span>
              <span onClick={() => isDineIn(o) && onSetType(o, "takeaway")} title="Takeaway" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: !isDineIn(o) ? "5px 10px" : "5px 7px", borderRadius: 7, cursor: "pointer", background: !isDineIn(o) ? "#5E7A4D" : "transparent", color: !isDineIn(o) ? "#fff" : C.sub }}>{Ico.bag(13, !isDineIn(o) ? "#fff" : C.sub)}{!isDineIn(o) && <span>Takeaway</span>}</span>
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{isDineIn(o) ? Ico.utensils(13) : Ico.bag(13)} {isDineIn(o) ? "Dine-in" : "Takeaway"}</span>
          )}
          {onSetTable && tables.length > 0 && o.status !== "cancelled" && (
            <span onClick={(e) => { e.stopPropagation(); setMoveTable(true); }} title="Move this order to another table" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#eef1f4", padding: "4px 9px", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>{Ico.utensils(12)} {o.menu_tables && o.menu_tables.label ? o.menu_tables.label : "No table"} · Move</span>
          )}
          {paidSoFar > 0 && !isPaid ? <span>· £{paidSoFar.toFixed(2)} paid</span> : null}
        </div>
      </div>
      {isPaid
        ? <span style={{ fontSize: 9, color: "#fff", background: C.paidGreen, padding: "5px 10px", borderRadius: 14, fontWeight: 700, letterSpacing: .4 }}>{o.is_split ? "SPLIT PAID" : "PAID"}</span>
        : <span style={{ fontSize: 9, color: "#fff", background: paidSoFar > 0 ? "#C67A2C" : C.danger, padding: "5px 10px", borderRadius: 14, fontWeight: 700, letterSpacing: .4 }}>{paidSoFar > 0 ? "PART PAID" : "UNPAID"}</span>}
      <span onClick={onClose} style={{ cursor: "pointer", marginLeft: 2 }}>{Ico.x(18)}</span>
    </div>
  );

  // ── MOVE TABLE (overlay, independent of the panel mode) ──
  const MoveSheet = () => !moveTable ? null : (
    <div onClick={() => setMoveTable(false)} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 40, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", borderRadius: "18px 18px 0 0", padding: 16, maxHeight: "85%", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><span style={{ fontWeight: 700, fontSize: 15 }}>Which table is order #{o.order_no} at now?</span><span onClick={() => setMoveTable(false)} style={{ marginLeft: "auto", cursor: "pointer", fontWeight: 800 }}>✕</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 9 }}>
          {tables.map((t) => <span key={t.id} onClick={async () => { const r = await onSetTable(o, t.id); setMoveTable(false); setNote(r && r.ok ? "Moved to " + t.label + " · kitchen notified" : "Could not move the table" + (r && (r.error || r.message) ? ": " + (r.error || r.message) : "")); }} style={{ padding: "18px 0", textAlign: "center", borderRadius: 12, background: o.table_id === t.id ? C.ink : "#f3f4f6", color: o.table_id === t.id ? "#fff" : C.ink, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{t.label}</span>)}
        </div>
        <span onClick={async () => { const r = await onSetTable(o, null); setMoveTable(false); setNote(r && r.ok ? "Switched to takeaway · kitchen notified" : "Could not change the order" + (r && (r.error || r.message) ? ": " + (r.error || r.message) : "")); }} style={{ display: "inline-block", marginTop: 16, padding: "12px 16px", borderRadius: 10, border: "1.5px solid " + C.line, fontWeight: 700, cursor: "pointer" }}>No table — takeaway</span>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 14 }}>The kitchen gets a "TABLE CHANGE" slip so the plates go to the right place. Nothing is reprinted or re-cooked.</div>
      </div>
    </div>
  );
  const Wrap = (children) => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff", fontFamily: "'Hanken Grotesk',sans-serif", color: C.ink, position: "relative" }}>{children}<MoveSheet /></div>
  );

  // ── METHOD PICKER ──
  if (mode === "method") {
    return Wrap(<>
      {HeaderBar("Take payment")}
      <div style={{ padding: "16px", flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span onClick={() => setMode("detail")} style={{ cursor: "pointer" }}>{Ico.back()}</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Choose payment</span>
          <span style={{ marginLeft: "auto", textAlign: "right" }}><div style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>BALANCE</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20 }}>{money(remaining)}</div></span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div onClick={() => { setMode("cash"); setCashGiven(null); }} style={{ padding: "28px 0", borderRadius: 14, background: "#5E7A4D", color: "#fff", textAlign: "center", cursor: "pointer", fontWeight: 700, fontSize: 17, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>{Ico.cash(22, "#fff")} Cash</div>
          <div onClick={() => { if (!isBusy) pay("card", remaining); }} style={{ padding: "28px 0", borderRadius: 14, background: C.paidGreen, color: "#fff", textAlign: "center", cursor: "pointer", fontWeight: 700, fontSize: 17, opacity: isBusy ? .6 : 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>{Ico.card(22, "#fff")} Card</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: .5, margin: "18px 2px 9px" }}>Split the bill</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
          {[
            // Same tile language as Cash and Card, one step quieter: white with
            // a green edge rather than solid green, so they read as the same
            // family without competing with the two primary actions.
            { key: "amt",  label: "By amount", hint: "£X, rest after", icon: Ico.cash,     go: () => { setSplitAmt(""); setMode("splitAmt"); } },
            { key: "even", label: "Evenly",    hint: "2, 3, 4 ways",   icon: Ico.card,     go: () => { setEvenN(2); setEvenGiven(null); setMode("splitEven"); } },
            { key: "item", label: "By item",   hint: "pick items",     icon: Ico.utensils, go: () => { setPickIds({}); setMode("splitItem"); } },
          ].map((o2) => (
            <div key={o2.key} onClick={o2.go}
              style={{ padding: "18px 8px 15px", borderRadius: 14, background: "#fff", border: "1.5px solid #5E7A4D",
                textAlign: "center", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
              {o2.icon(20, "#5E7A4D")}
              <span style={{ fontWeight: 700, fontSize: 14, color: "#3d4a33", lineHeight: 1.2 }}>{o2.label}</span>
              <span style={{ fontSize: 10.5, color: C.sub, fontWeight: 600, lineHeight: 1.25 }}>{o2.hint}</span>
            </div>
          ))}
        </div>
      </div>
    </>);
  }

  // ── CASH (pays the full remaining) ──
  if (mode === "cash") {
    const due = remaining;
    const given = cashGiven == null ? 0 : cashGiven;
    const change = Math.max(0, given - due);
    const quick = [...new Set([Math.ceil(due), Math.ceil(due / 5) * 5, Math.ceil(due / 10) * 10, due])].filter((v) => v >= due).slice(0, 3);
    return Wrap(<>
      {HeaderBar("Cash")}
      <div style={{ padding: "14px 16px", flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span onClick={() => setMode("method")} style={{ cursor: "pointer" }}>{Ico.back()}</span>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>DUE</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>{money(due)}</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: "#2f6b4f", fontWeight: 700 }}>CHANGE</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, color: "#2f6b4f" }}>{money(change)}</div></div>
        </div>
        <div style={{ textAlign: "center", marginBottom: 12 }}><div style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>TENDERED</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 30 }}>{cashGiven == null ? "—" : money(given)}</div></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginBottom: 10 }}>
          {quick.map((v) => (<div key={v} onClick={() => setCashGiven(v)} style={{ padding: "13px 0", borderRadius: 11, background: given === v ? "#e6ecd9" : "#efeadf", border: given === v ? "1.5px solid #5E7A4D" : "1.5px solid transparent", textAlign: "center", fontWeight: 700, fontSize: 15, color: "#33402f", cursor: "pointer" }}>£{Number(v).toFixed(2).replace(/\.00$/, "")}</div>))}
        </div>
        <div onClick={() => { if (cashGiven != null && !isBusy) pay("cash", due, { tendered: given }); }} style={{ padding: "15px 0", borderRadius: 13, background: cashGiven == null ? "#c9ccc0" : "#5E7A4D", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 15, cursor: cashGiven == null ? "default" : "pointer" }}>Confirm cash</div>
      </div>
    </>);
  }

  // ── SPLIT BY AMOUNT / TENDER ──
  if (mode === "splitAmt") {
    const amt = Math.round((parseFloat(splitAmt) || 0) * 100) / 100;
    const valid = amt > 0 && amt <= remaining + 0.001;
    return Wrap(<>
      {HeaderBar("Split by amount")}
      <div style={{ padding: "14px 16px", flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span onClick={() => setMode("method")} style={{ cursor: "pointer" }}>{Ico.back()}</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Pay part of the bill</span>
          <span style={{ marginLeft: "auto", textAlign: "right" }}><div style={{ fontSize: 10, color: C.danger, fontWeight: 700 }}>REMAINING</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, color: C.danger }}>{money(remaining)}</div></span>
        </div>
        <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, marginBottom: 5 }}>AMOUNT FOR THIS PAYMENT</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F4F1E8", borderRadius: 12, padding: "6px 14px", marginBottom: 10 }}>
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 22 }}>£</span>
          <input type="text" inputMode="decimal" value={splitAmt} onChange={(e) => setSplitAmt(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={remaining.toFixed(2)} autoFocus
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 22, color: C.ink }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[remaining / 2, remaining].map((v, i) => (<div key={i} onClick={() => setSplitAmt((Math.round(v * 100) / 100).toFixed(2))} style={{ flex: 1, textAlign: "center", padding: "10px 0", borderRadius: 10, background: "#efeadf", fontWeight: 700, fontSize: 13, color: "#4a4f3d", cursor: "pointer" }}>{i === 0 ? "Half" : "All"} · £{(Math.round(v * 100) / 100).toFixed(2)}</div>))}
        </div>
        <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, marginBottom: 7 }}>TAKE THIS PART AS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          <div onClick={() => { if (valid && !isBusy) pay("cash", amt, { tendered: amt }); }} style={{ padding: "18px 0", borderRadius: 12, background: valid ? "#5E7A4D" : "#c9ccc0", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 15, cursor: valid ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>{Ico.cash(18, "#fff")} Cash</div>
          <div onClick={() => { if (valid && !isBusy) pay("card", amt); }} style={{ padding: "18px 0", borderRadius: 12, background: valid ? C.paidGreen : "#c9ccc0", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 15, cursor: valid ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>{Ico.card(18, "#fff")} Card</div>
        </div>
        <div style={{ fontSize: 11, color: C.sub, marginTop: 12, textAlign: "center" }}>Repeat until the balance reaches £0.</div>
      </div>
    </>);
  }

  // ── SPLIT EVENLY (N ways) ──
  if (mode === "splitEven") {
    const share = Math.round((remaining / Math.max(1, evenN)) * 100) / 100;
    const given = evenGiven == null ? 0 : evenGiven;
    const change = Math.max(0, given - share);
    return Wrap(<>
      {HeaderBar("Split evenly")}
      <div style={{ padding: "14px 16px", flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span onClick={() => setMode("method")} style={{ cursor: "pointer" }}>{Ico.back()}</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Split evenly</span>
          <span style={{ marginLeft: "auto", textAlign: "right" }}><div style={{ fontSize: 10, color: C.danger, fontWeight: 700 }}>REMAINING</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, color: C.danger }}>{money(remaining)}</div></span>
        </div>
        <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, marginBottom: 7 }}>SPLIT REMAINING BETWEEN</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 12 }}>
          <span onClick={() => setEvenN(Math.max(2, evenN - 1))} style={{ width: 44, height: 44, borderRadius: "50%", background: "#efeadf", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: C.danger, cursor: "pointer" }}>−</span>
          <div style={{ textAlign: "center", minWidth: 60 }}><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 30 }}>{evenN}</div><div style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>WAYS</div></div>
          <span onClick={() => setEvenN(Math.min(12, evenN + 1))} style={{ width: 44, height: 44, borderRadius: "50%", background: "#efeadf", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "#3a5730", cursor: "pointer" }}>+</span>
        </div>
        <div style={{ background: "#F4F1E8", borderRadius: 12, padding: "12px 14px", textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.sub, fontWeight: 700 }}>EACH SHARE</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 26 }}>{money(share)}</div>
        </div>
        <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, marginBottom: 7 }}>TAKE ONE SHARE ({money(share)})</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 8 }}>
          <div onClick={() => { if (!isBusy) pay("cash", share, { tendered: share, note: "even 1/" + evenN }); }} style={{ padding: "16px 0", borderRadius: 12, background: "#5E7A4D", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>{Ico.cash(17, "#fff")} Cash share</div>
          <div onClick={() => { if (!isBusy) pay("card", share, { note: "even 1/" + evenN }); }} style={{ padding: "16px 0", borderRadius: 12, background: C.paidGreen, color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>{Ico.card(17, "#fff")} Card share</div>
        </div>
        <div style={{ fontSize: 11, color: C.sub, textAlign: "center" }}>Tap once per guest — the balance drops each time.</div>
      </div>
    </>);
  }

  // ── SPLIT BY ITEM (pay for selected items now) ──
  if (mode === "splitItem") {
    const chosen = its.filter((it) => pickIds[it.id]);
    const sub = Math.round(chosen.reduce((s, it) => s + Number(it.line_total || 0), 0) * 100) / 100;
    const capped = Math.min(sub, remaining);
    const valid = capped > 0;
    return Wrap(<>
      {HeaderBar("Split by item")}
      <div style={{ padding: "12px 15px 4px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span onClick={() => setMode("method")} style={{ cursor: "pointer" }}>{Ico.back()}</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Pick items to pay</span>
        <span style={{ marginLeft: "auto", textAlign: "right" }}><div style={{ fontSize: 10, color: C.danger, fontWeight: 700 }}>REMAINING</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: C.danger }}>{money(remaining)}</div></span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 15px" }}>
        {its.map((it, j) => {
          const on = !!pickIds[it.id];
          return (
            <div key={it.id || j} onClick={() => setPickIds((p) => ({ ...p, [it.id]: !p[it.id] }))} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderBottom: "1px solid rgba(60,70,45,.07)", cursor: "pointer" }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, border: "2px solid " + (on ? "#5E7A4D" : "#c9ccc0"), background: on ? "#5E7A4D" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on && Ico.check(13, "#fff")}</span>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{(it.qty || 1) + "× " + it.name_snapshot}</div>{modLine(it) && <div style={{ fontSize: 11, color: C.sub }}>{modLine(it)}</div>}</div>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{money(it.line_total)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "12px 15px", borderTop: "1px solid " + C.line, background: "#faf9f5", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontWeight: 700, fontSize: 13 }}>Selected</span><span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>{money(capped)}</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          <div onClick={() => { if (valid && !isBusy) pay("cash", capped, { tendered: capped, note: "by item" }); }} style={{ padding: "15px 0", borderRadius: 12, background: valid ? "#5E7A4D" : "#c9ccc0", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 14, cursor: valid ? "pointer" : "default" }}>Cash</div>
          <div onClick={() => { if (valid && !isBusy) pay("card", capped, { note: "by item" }); }} style={{ padding: "15px 0", borderRadius: 12, background: valid ? C.paidGreen : "#c9ccc0", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 14, cursor: valid ? "pointer" : "default" }}>Card</div>
        </div>
      </div>
    </>);
  }

  // ── VOID REASON (item already fired) ──
  if (mode === "voidReason" && voidItem) {
    const reasons = ["Wrong order", "Customer changed mind", "86'd / out of stock", "Kitchen delay", "Duplicate"];
    return Wrap(<>
      {HeaderBar("Void item")}
      <div style={{ padding: "16px", flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span onClick={() => { setMode("edit"); setVoidItem(null); }} style={{ cursor: "pointer" }}>{Ico.back()}</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Why void this item?</span>
        </div>
        <div style={{ background: "#F7E8E8", borderRadius: 11, padding: "11px 13px", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.danger }}>{(voidItem.qty || 1) + "× " + voidItem.name_snapshot}</div>
          <div style={{ fontSize: 11, color: "#8a5a5a", marginTop: 2 }}>A VOID chit prints so the kitchen stops making it.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reasons.map((r) => (
            <div key={r} onClick={async () => { if (busy) return; await onVoidFired(o, voidItem.id, r); setVoidItem(null); setMode("edit"); setNote("Voided: " + r); }} style={{ padding: "15px 15px", borderRadius: 12, background: "#fff", border: "1.5px solid " + C.line, fontWeight: 700, fontSize: 14, color: C.ink, cursor: "pointer" }}>{r}</div>
          ))}
        </div>
      </div>
    </>);
  }

  // ── EDIT (unpaid) ──
  if (mode === "edit" && !isPaid) {
    return Wrap(<>
      {HeaderBar("Edit order")}
      <div style={{ padding: "10px 15px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span onClick={() => setMode("detail")} style={{ cursor: "pointer" }}>{Ico.back()}</span><span style={{ fontWeight: 700, fontSize: 14 }}>Edit — sent to kitchen</span></div>
        <span onClick={() => onAddItems(o.id)} style={{ background: "#e9edd8", color: "#3a5730", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>{Ico.plus(14)} Add items</span>
      </div>
      {note && <div style={{ margin: "4px 15px", fontSize: 11.5, color: "#2f6b4f", fontWeight: 600 }}>{note}</div>}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 15px" }}>
        {its.map((it, j) => (
          <CartLine key={it.id || j} last={j === its.length - 1}
            line={{ name: it.name_snapshot, qty: it.qty || 1, lineTotal: Number(it.line_total || 0), image_url: (it.menu_items && it.menu_items.image_url) || it.image_url, mods: modArray(it), note: it.note }}
            onDec={() => onSetQty(o, it.id, (it.qty || 1) - 1)}
            onInc={() => onSetQty(o, it.id, (it.qty || 1) + 1)}
            onRemove={() => { setVoidItem(it); setMode("voidReason"); }}
          />
        ))}
        {its.length === 0 && <div style={{ padding: 24, textAlign: "center", color: C.sub, fontSize: 13 }}>No items left.</div>}
      </div>
      <div style={{ padding: "12px 15px", borderTop: "1px solid " + C.line, background: "#faf9f5", display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
        <div style={{ flex: 1 }}><span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>Total</span><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 19 }}>{money(o.total)}</div></div>
        <span onClick={() => setMode("method")} style={{ background: "#5E7A4D", color: "#fff", padding: "13px 20px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Take payment</span>
      </div>
    </>);
  }

  // ── DISCOUNT SHEET ──
  if (dsc) {
    const preview = Math.min(gross, dsc.type === "percent" ? gross * Number(dsc.value || 0) / 100 : Number(dsc.value || 0));
    const pct = gross > 0 ? preview / gross * 100 : 0;
    const apply = async () => {
      if (!(Number(dsc.value) > 0)) { setSheetErr("Choose a discount"); return; }
      if (dsc.pin.length < 4) { setSheetErr("Enter your PIN"); return; }
      setSheetBusy(true); setSheetErr("");
      const r = await onDiscount(o, { discount_type: dsc.type, discount_value: Number(dsc.value), reason: dsc.reason, staff_pin: dsc.pin });
      setSheetBusy(false);
      if (r && r.ok) { setDsc(null); setNote("Discount applied" + (r.by ? " by " + r.by : "")); }
      else setSheetErr((r && (r.message || r.error)) || "Could not apply the discount");
    };
    return Wrap(<>
      {HeaderBar("Discount")}
      <div style={{ padding: 16, flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><span onClick={() => setDsc(null)} style={{ cursor: "pointer" }}>{Ico.back()}</span><span style={{ fontWeight: 700, fontSize: 15 }}>Apply a discount</span><span style={{ marginLeft: "auto", fontSize: 13, color: C.sub }}>Order {money(gross)}</span></div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Percent off</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 12 }}>
          {[5, 10, 15, 20, 25, 50, 100].map((v) => <span key={v} onClick={() => setDsc({ ...dsc, type: "percent", value: v })} style={{ padding: "13px 0", textAlign: "center", borderRadius: 10, background: dsc.type === "percent" && Number(dsc.value) === v ? C.ink : "#f3f4f6", color: dsc.type === "percent" && Number(dsc.value) === v ? "#fff" : C.ink, fontWeight: 800, cursor: "pointer" }}>{v}%</span>)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Or £ off</div>
        <input inputMode="decimal" placeholder="e.g. 2.50" value={dsc.type === "amount" ? dsc.value : ""} onChange={(e) => setDsc({ ...dsc, type: "amount", value: e.target.value.replace(/[^0-9.]/g, "") })} style={{ width: "100%", boxSizing: "border-box", padding: "12px 13px", fontSize: 16, border: "1.5px solid " + C.line, borderRadius: 10, marginBottom: 14 }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Reason</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
          {["Staff", "Complaint", "Loyal customer", "Manager's discretion", "Promotion", "Wrong item"].map((rs) => <span key={rs} onClick={() => setDsc({ ...dsc, reason: rs })} style={{ padding: "8px 12px", borderRadius: 999, background: dsc.reason === rs ? C.ink : "#fff", color: dsc.reason === rs ? "#fff" : C.ink, border: "1.5px solid " + (dsc.reason === rs ? C.ink : C.line), fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{rs}</span>)}
        </div>
        <div style={{ padding: "12px 14px", borderRadius: 12, background: "#f0f5ea", marginBottom: 14, display: "flex", justifyContent: "space-between", fontWeight: 800 }}><span>Discount {money(preview)}{pct > 25 && <span style={{ color: "#b4462f", fontWeight: 700, fontSize: 12 }}> · manager PIN needed</span>}</span><span>Due {money(Math.max(0, gross - preview))}</span></div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: .5, textAlign: "center" }}>{pct > 25 ? "Manager PIN" : "Your punch-in PIN"}</div>
        <Dots n={dsc.pin.length} />
        <PinPad value={dsc.pin} onChange={(v) => { setDsc({ ...dsc, pin: v }); setSheetErr(""); }} />
        {sheetErr && <div style={{ color: "#b4462f", fontWeight: 700, textAlign: "center", marginTop: 12 }}>{sheetErr}</div>}
      </div>
      <div style={{ padding: "12px 15px", borderTop: "1px solid #eef0f2", display: "flex", gap: 8 }}>
        <span onClick={() => setDsc(null)} style={{ padding: "14px 18px", borderRadius: 13, background: "#fff", border: "1.5px solid " + C.line, fontWeight: 700, cursor: "pointer" }}>Cancel</span>
        <span onClick={() => { if (!sheetBusy) apply(); }} style={{ flex: 1, textAlign: "center", padding: "14px 0", borderRadius: 13, background: C.ink, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: sheetBusy ? .6 : 1 }}>{sheetBusy ? "Applying…" : "Apply discount"}</span>
      </div>
    </>);
  }
  // ── REFUND SHEET ──
  if (rfd) {
    const refundable = Math.max(0, Math.round((paidSoFar - refunded) * 100) / 100);
    const amt = Number(rfd.amount || 0);
    const doRefund = async () => {
      if (!(amt > 0) || amt > refundable + 0.001) { setSheetErr("Enter an amount up to " + money(refundable)); return; }
      if (rfd.pin.length < 4) { setSheetErr("Manager PIN required"); return; }
      setSheetBusy(true); setSheetErr("");
      const r = await onRefund(o, { amount: amt, method: rfd.method, reason: rfd.reason, manager_pin: rfd.pin });
      setSheetBusy(false);
      if (r && r.ok) { setRfd(null); setNote("Refunded " + money(r.refunded) + (r.by ? " · " + r.by : "")); }
      else setSheetErr((r && (r.message || r.error)) || "Could not refund");
    };
    return Wrap(<>
      {HeaderBar("Refund")}
      <div style={{ padding: 16, flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><span onClick={() => setRfd(null)} style={{ cursor: "pointer" }}>{Ico.back()}</span><span style={{ fontWeight: 700, fontSize: 15 }}>Refund</span><span style={{ marginLeft: "auto", fontSize: 13, color: C.sub }}>Paid {money(paidSoFar)}{refunded > 0 ? " · refunded " + money(refunded) : ""}</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <span onClick={() => setRfd({ ...rfd, amount: refundable.toFixed(2) })} style={{ padding: "14px 0", textAlign: "center", borderRadius: 10, background: amt === refundable ? C.ink : "#f3f4f6", color: amt === refundable ? "#fff" : C.ink, fontWeight: 800, cursor: "pointer" }}>Full · {money(refundable)}</span>
          <input inputMode="decimal" placeholder="Part amount" value={rfd.amount} onChange={(e) => setRfd({ ...rfd, amount: e.target.value.replace(/[^0-9.]/g, "") })} style={{ padding: "12px 13px", fontSize: 16, border: "1.5px solid " + C.line, borderRadius: 10 }} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Refund to</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
          {[["cash", "Cash from drawer"], ["card", "Card (on the terminal)"]].map(([m, l]) => <span key={m} onClick={() => setRfd({ ...rfd, method: m })} style={{ padding: "13px 0", textAlign: "center", borderRadius: 10, background: rfd.method === m ? C.ink : "#f3f4f6", color: rfd.method === m ? "#fff" : C.ink, fontWeight: 800, cursor: "pointer" }}>{l}</span>)}
        </div>
        {rfd.method === "card" && <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>Process the refund on the card machine as well — this records it on the till and the Z-report.</div>}
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: .5, margin: "8px 0" }}>Reason</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
          {["Wrong order", "Quality", "Long wait", "Customer changed mind", "Charged twice", "Other"].map((rs) => <span key={rs} onClick={() => setRfd({ ...rfd, reason: rs })} style={{ padding: "8px 12px", borderRadius: 999, background: rfd.reason === rs ? C.ink : "#fff", color: rfd.reason === rs ? "#fff" : C.ink, border: "1.5px solid " + (rfd.reason === rs ? C.ink : C.line), fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{rs}</span>)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: .5, textAlign: "center" }}>Manager PIN</div>
        <Dots n={rfd.pin.length} />
        <PinPad value={rfd.pin} onChange={(v) => { setRfd({ ...rfd, pin: v }); setSheetErr(""); }} />
        {sheetErr && <div style={{ color: "#b4462f", fontWeight: 700, textAlign: "center", marginTop: 12 }}>{sheetErr}</div>}
      </div>
      <div style={{ padding: "12px 15px", borderTop: "1px solid #eef0f2", display: "flex", gap: 8 }}>
        <span onClick={() => setRfd(null)} style={{ padding: "14px 18px", borderRadius: 13, background: "#fff", border: "1.5px solid " + C.line, fontWeight: 700, cursor: "pointer" }}>Cancel</span>
        <span onClick={() => { if (!sheetBusy) doRefund(); }} style={{ flex: 1, textAlign: "center", padding: "14px 0", borderRadius: 13, background: "#b4462f", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: sheetBusy ? .6 : 1 }}>{sheetBusy ? "Refunding…" : "Refund " + (amt > 0 ? money(amt) : "")}</span>
      </div>
    </>);
  }

  // ── DETAIL (default) ──
  return Wrap(<>
    {HeaderBar()}
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 15px" }}>
      {note && <div style={{ fontSize: 11.5, color: "#2f6b4f", fontWeight: 600, padding: "4px 0 8px" }}>{note}</div>}
      {o.customer_note && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: /allerg|nut|dairy|gluten/i.test(o.customer_note) ? "#fbecea" : "#fffbf4", border: "1px solid " + (/allerg|nut|dairy|gluten/i.test(o.customer_note) ? "#e6b8b0" : "#f0e2cc"), borderRadius: 11, padding: "10px 12px", marginBottom: 10 }}>
          <span style={{ fontSize: 14 }}>{/allerg|nut|dairy|gluten/i.test(o.customer_note) ? "⚠" : "📝"}</span>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: /allerg|nut|dairy|gluten/i.test(o.customer_note) ? "#c0392b" : "#9a6a2c", lineHeight: 1.35 }}>{o.customer_note}</div>
        </div>
      )}
      {its.map((it, j) => (
        <CartLine key={it.id || j} last={j === its.length - 1}
          line={{ name: it.name_snapshot, qty: it.qty || 1, lineTotal: Number(it.line_total || 0), image_url: (it.menu_items && it.menu_items.image_url) || it.image_url, mods: modArray(it), note: it.note }}
        />
      ))}
      {its.length === 0 && <div style={{ padding: 24, textAlign: "center", color: C.sub, fontSize: 13 }}>No items.</div>}
    </div>
    <div style={{ padding: "13px 15px", borderTop: "1px solid #eef0f2", background: "#faf9f5", flexShrink: 0 }}>
      {discount > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: "#2f6b4f", fontWeight: 700, marginBottom: 6 }}><span>Discount{o.discount_reason ? " · " + o.discount_reason : ""}{o.discount_type === "percent" ? " (" + Number(o.discount_value) + "%)" : ""}</span><span>−{money(discount)}{!isPaid && onRemoveDiscount && <span onClick={() => { const pin = window.prompt("Your PIN to remove the discount"); if (pin) onRemoveDiscount(o, pin); }} style={{ marginLeft: 10, color: C.sub, cursor: "pointer", fontWeight: 700 }}>✕</span>}</span></div>
      )}
      {refunded > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: "#b4462f", fontWeight: 700, marginBottom: 6 }}><span>Refunded{o.refund_reason ? " · " + o.refund_reason : ""}</span><span>−{money(refunded)}{onPrintRefund && <span onClick={() => { onPrintRefund(o); setNote("Refund receipt sent to the printer"); }} style={{ marginLeft: 10, padding: "3px 8px", borderRadius: 7, border: "1px solid #e4b4ab", color: "#b4462f", cursor: "pointer", fontSize: 11.5 }}>Print receipt</span>}</span></div>
      )}
      {paidSoFar > 0 && !isPaid && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#C67A2C", fontWeight: 700, marginBottom: 6 }}><span>Part paid</span><span>{money(paidSoFar)} of {money(total)}</span></div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, paddingTop: 4, borderTop: "1px dashed " + C.line }}>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16 }}>{isPaid ? "Total" : "Balance"}</span>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 22 }}>{money(isPaid ? total : remaining)}</span>
      </div>
      {isPaid ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1, padding: "12px 13px", borderRadius: 12, background: "#e6ecdd", color: C.paidText, fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", gap: 7 }}>{o.paid_method === "cash" ? Ico.cash(15) : Ico.card(15)} Paid{o.is_split ? " · Split" : o.paid_method === "cash" ? " · Cash" : " · Card"}</div>
          {onFeedback && <span onClick={() => onFeedback(o)} title="Log how this table went" style={{ padding: "12px 13px", borderRadius: 12, background: "#fff", border: "1.5px solid " + C.line, color: C.ink, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🙂 Feedback</span>}
          {onRefund && paidSoFar - refunded > 0.001 && <span onClick={() => { setRfd({ amount: "", method: o.paid_method === "card" ? "card" : "cash", reason: "", pin: "" }); setSheetErr(""); }} style={{ padding: "12px 14px", borderRadius: 12, background: "#fff", border: "1.5px solid #e4b4ab", color: "#b4462f", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Refund</span>}
          <span onClick={() => onUnpaid(o)} style={{ padding: "12px 15px", borderRadius: 12, background: "#fff", border: "1.5px solid " + C.line, color: C.ink, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Undo</span>
          {(() => {
            // A silent button is why staff pressed it repeatedly and got a
            // stack of slips. It now says what it is doing and refuses a
            // second press while the first is still going.
            const p = printingId === o.id;
            return (
              <span onClick={() => { if (!p) onReprint(o); }}
                style={{ padding: "11px 13px", borderRadius: 12, background: p ? "#e6ecdd" : "#fff", border: "1.5px solid " + C.line, cursor: p ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12.5, color: "#2f6b4f", opacity: p ? .7 : 1 }}>
                {Ico.printer(16)} {p ? "Sending…" : "Print"}
              </span>
            );
          })()}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <span onClick={() => setMode("method")} style={{ flex: 1, textAlign: "center", background: "#5E7A4D", color: "#fff", padding: "14px 0", borderRadius: 13, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Take payment</span>
          <span onClick={() => setMode("edit")} style={{ padding: "14px 17px", background: "#fff", border: "1.5px solid " + C.line, color: C.ink, borderRadius: 13, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>Edit</span>
          {onDiscount && <span onClick={() => { setDsc({ type: "percent", value: discount > 0 ? Number(o.discount_value) : 0, reason: o.discount_reason || "", pin: "" }); setSheetErr(""); }} style={{ padding: "14px 14px", background: discount > 0 ? "#e6ecdd" : "#fff", border: "1.5px solid " + C.line, color: C.ink, borderRadius: 13, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>{discount > 0 ? "−" + money(discount) : "Discount"}</span>}
          {onFeedback && <span onClick={() => onFeedback(o)} title="Log how this table went" style={{ padding: "14px 13px", background: "#fff", border: "1.5px solid " + C.line, color: C.ink, borderRadius: 13, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>🙂</span>}
          <span onClick={() => { if (printingId !== o.id) onReprint(o); }}
            style={{ padding: "12px 14px", background: printingId === o.id ? "#e6ecdd" : "#fff", border: "1.5px solid " + C.line, borderRadius: 13, cursor: printingId === o.id ? "default" : "pointer", display: "flex", alignItems: "center", opacity: printingId === o.id ? .7 : 1 }}>{Ico.printer(17)}</span>
        </div>
      )}
    </div>
  </>);
}
