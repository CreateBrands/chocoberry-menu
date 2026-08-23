import { useState, useMemo } from "react";

// ── Always-on Orders strip for the single-screen POS (Option A) ──────
// Left column: unpaid + paid orders, tap one to open an inline detail /
// payment / edit sheet. NO icon-font dependency (uses inline SVG + text),
// high-contrast colours so paid pills and buttons are always visible.
//
// Props:
//   orders, now, busy
//   onPay(o, method), onUnpaid(o), onAddItems(orderId)
//   onRemoveItem(o, iid), onSetQty(o, iid, qty), onReprint(o)
//   selId, setSelId  (lifted so the parent can coordinate)

const money = (n) => "£" + Number(n || 0).toFixed(2);
function mins(ts, now) { return Math.max(0, Math.floor((now - ts) / 60000)); }
function agoLabel(m) { if (m < 1) return "just now"; if (m < 60) return m + " min"; return Math.floor(m / 60) + "h " + (m % 60) + "m"; }
function ageColor(m) { if (m < 5) return "#B23B3B"; if (m < 15) return "#C67A2C"; return "#6b7260"; }

// High-contrast palette (fixes the faded pills/text)
const C = {
  bg: "#F4F1E8", card: "#fff", ink: "#2A2E20", sub: "#5c6350",
  danger: "#B23B3B", dangerSoft: "#F7E8E8",
  paidGreen: "#2f6b4f", paidText: "#33402f",
  tan: "#8a5a2c", tanSoft: "#F1E4D2", line: "rgba(60,70,45,.14)",
};

// tiny inline icons (no font needed)
const Ico = {
  bag: (s = 16, c = "#2f6b4f") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" /></svg>),
  check: (s = 16, c = "#fff") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>),
  card: (s = 14, c = "#33402f") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>),
  cash: (s = 14, c = "#33402f") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>),
  printer: (s = 17, c = "#2f6b4f") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>),
  trash: (s = 16, c = "#B23B3B") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>),
  plus: (s = 16, c = "#2f6b4f") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>),
  back: (s = 18, c = "#5c6350") => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>),
};

function tableNum(o) {
  if (o.menu_tables && o.menu_tables.label) return String(o.menu_tables.label).replace(/^table\s*/i, "");
  return null;
}
function isDineIn(o) { return (o.order_type || "").toLowerCase().includes("dine"); }
function orderName(o) { return o.pickup_name || (o.menu_tables && o.menu_tables.label) || "Order"; }
function modLine(it) {
  const m = it.modifiers_snapshot;
  if (!m) return "";
  if (Array.isArray(m)) return m.join(" · ");
  if (typeof m === "object") return Object.values(m).join(" · ");
  return String(m);
}

export default function OrdersStrip({
  orders = [], now = Date.now(), busy = false,
  onPay, onUnpaid, onAddItems, onRemoveItem, onSetQty, onReprint,
}) {
  const [tab, setTab] = useState("unpaid"); // unpaid | paid
  const [selId, setSelId] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [payStep, setPayStep] = useState("method");
  const [cashGiven, setCashGiven] = useState(null);
  const [editing, setEditing] = useState(false);

  const { unpaid, paid } = useMemo(() => {
    const u = [], p = [];
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      (o.paid_method ? p : u).push(o);
    }
    u.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { unpaid: u, paid: p };
  }, [orders]);

  const owed = unpaid.reduce((s, o) => s + Number(o.total || 0), 0);
  const list = tab === "unpaid" ? unpaid : paid;
  const sel = orders.find((o) => o.id === selId) || null;

  // ---- order tile (table number / bag) ----
  function Tile({ o, size = 38, paid = false }) {
    const tn = tableNum(o);
    const dine = isDineIn(o);
    if (!dine || !tn) {
      return (
        <div style={{ width: size, height: size, borderRadius: 10, background: paid ? "#e3ead9" : "#e9edd8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {Ico.bag(size * 0.5, paid ? C.paidGreen : "#5E7A4D")}
        </div>
      );
    }
    // table tile — solid, high contrast
    const tileBg = paid ? C.paidGreen : C.danger;
    return (
      <div style={{ width: size, height: size, borderRadius: 10, background: tileBg, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1, flexShrink: 0 }}>
        <span style={{ fontSize: size * 0.16, fontWeight: 700, opacity: .9, letterSpacing: .5 }}>TABLE</span>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: size * 0.36 }}>{tn}</span>
      </div>
    );
  }

  function Row({ o, paid }) {
    const selected = selId === o.id;
    const m = mins(new Date(o.created_at).getTime(), now);
    return (
      <div onClick={() => { setSelId(o.id); setPayFor(null); setEditing(false); }}
        style={{ background: C.card, border: "1.5px solid " + (selected ? (paid ? C.paidGreen : C.danger) : C.line), borderRadius: 12, padding: "10px 11px", marginBottom: 7, display: "flex", alignItems: "center", gap: 9, cursor: "pointer", boxShadow: selected ? "0 3px 10px -3px rgba(60,70,45,.2)" : "none" }}>
        <Tile o={o} paid={paid} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{orderName(o)}</div>
          <div style={{ fontSize: 10.5, color: paid ? C.sub : ageColor(m), fontWeight: 600, marginTop: 2 }}>
            #{o.order_no}{paid ? " · " + (o.paid_method === "cash" ? "Cash" : "Card") : " · " + agoLabel(m)}
          </div>
        </div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 14, color: paid ? C.paidText : C.danger }}>{money(o.total)}</div>
      </div>
    );
  }

  // ---- detail / payment / edit sheet (slides over the strip) ----
  function Sheet() {
    const o = sel;
    if (!o) return null;
    const its = o.menu_order_items || [];
    const isPaid = !!o.paid_method;

    // PAYMENT
    if (payFor === o.id) {
      if (payStep === "method") {
        return (
          <Overlay onClose={() => setPayFor(null)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span onClick={() => setPayFor(null)} style={{ cursor: "pointer" }}>{Ico.back()}</span>
              <div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16 }}>Take payment</div><div style={{ fontSize: 12, color: C.sub }}>#{o.order_no} · {orderName(o)}</div></div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}><div style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>DUE</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20 }}>{money(o.total)}</div></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div onClick={() => { setPayStep("cash"); setCashGiven(null); }} style={{ padding: "22px 0", borderRadius: 14, background: "#5E7A4D", color: "#fff", textAlign: "center", cursor: "pointer", fontWeight: 700, fontSize: 16 }}>Cash</div>
              <div onClick={() => onPay(o, "card")} style={{ padding: "22px 0", borderRadius: 14, background: C.paidGreen, color: "#fff", textAlign: "center", cursor: "pointer", fontWeight: 700, fontSize: 16, opacity: busy ? .6 : 1 }}>Card</div>
            </div>
          </Overlay>
        );
      }
      const total = Number(o.total || 0);
      const given = cashGiven == null ? 0 : cashGiven;
      const change = Math.max(0, given - total);
      const quick = [...new Set([Math.ceil(total), Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10])].filter((v) => v >= total).slice(0, 3);
      return (
        <Overlay onClose={() => setPayFor(null)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span onClick={() => setPayStep("method")} style={{ cursor: "pointer" }}>{Ico.back()}</span>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>DUE</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>{money(total)}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: "#2f6b4f", fontWeight: 700 }}>CHANGE</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, color: "#2f6b4f" }}>{money(change)}</div></div>
          </div>
          <div style={{ textAlign: "center", marginBottom: 12 }}><div style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>TENDERED</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 30 }}>{cashGiven == null ? "—" : money(given)}</div></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginBottom: 10 }}>
            {quick.map((v) => (
              <div key={v} onClick={() => setCashGiven(v)} style={{ padding: "13px 0", borderRadius: 11, background: given === v ? "#e6ecd9" : "#efeadf", border: given === v ? "1.5px solid #5E7A4D" : "1.5px solid transparent", textAlign: "center", fontWeight: 700, fontSize: 15, color: "#33402f", cursor: "pointer" }}>£{v}</div>
            ))}
          </div>
          <div onClick={() => { if (cashGiven != null && !busy) onPay(o, "cash"); }} style={{ padding: "15px 0", borderRadius: 13, background: cashGiven == null ? "#c9ccc0" : "#5E7A4D", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 15, cursor: cashGiven == null ? "default" : "pointer" }}>Confirm cash</div>
        </Overlay>
      );
    }

    // EDIT
    if (editing && !isPaid) {
      return (
        <Overlay onClose={() => setEditing(false)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span onClick={() => setEditing(false)} style={{ cursor: "pointer" }}>{Ico.back()}</span><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15 }}>Edit #{o.order_no}</div></div>
            <span onClick={() => onAddItems(o.id)} style={{ background: "#e9edd8", color: "#3a5730", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>{Ico.plus(14, "#3a5730")} Add items</span>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {its.map((it, j) => (
              <div key={it.id || j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(60,70,45,.07)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#f0ede3", borderRadius: 18, padding: "4px 5px", flexShrink: 0 }}>
                    <span onClick={() => onSetQty(o, it.id, (it.qty || 1) - 1)} style={{ width: 24, height: 24, borderRadius: "50%", background: "#fff", border: "1px solid " + C.line, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: C.danger, fontWeight: 700, cursor: "pointer" }}>−</span>
                    <span style={{ fontWeight: 700, fontSize: 13, minWidth: 12, textAlign: "center" }}>{it.qty || 1}</span>
                    <span onClick={() => onSetQty(o, it.id, (it.qty || 1) + 1)} style={{ width: 24, height: 24, borderRadius: "50%", background: "#fff", border: "1px solid " + C.line, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#3a5730", fontWeight: 700, cursor: "pointer" }}>+</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name_snapshot}</div>
                    {modLine(it) && <div style={{ fontSize: 11, color: C.sub, marginTop: 1 }}>{modLine(it)}</div>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{money(it.line_total)}</span>
                  <span onClick={() => onRemoveItem(o, it.id)} style={{ cursor: "pointer" }}>{Ico.trash(15)}</span>
                </div>
              </div>
            ))}
            {its.length === 0 && <div style={{ padding: 24, textAlign: "center", color: C.sub, fontSize: 13 }}>No items yet.</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 14, paddingTop: 12, borderTop: "1px solid " + C.line }}>
            <div style={{ flex: 1 }}><span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>Total</span><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20 }}>{money(o.total)}</div></div>
            <span onClick={() => { setEditing(false); setPayFor(o.id); setPayStep("method"); }} style={{ background: "#5E7A4D", color: "#fff", padding: "13px 20px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Take payment</span>
          </div>
        </Overlay>
      );
    }

    // DETAIL
    return (
      <Overlay onClose={() => setSelId(null)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span onClick={() => setSelId(null)} style={{ cursor: "pointer" }}>{Ico.back()}</span>
          <Tile o={o} size={46} paid={isPaid} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16 }}>{orderName(o)}</div>
            <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2, fontWeight: 600 }}>#{o.order_no} · {isDineIn(o) ? "Dine-in" : "Takeaway"}</div>
          </div>
          {isPaid
            ? <span style={{ fontSize: 10, color: "#fff", background: C.paidGreen, padding: "6px 12px", borderRadius: 20, fontWeight: 700, letterSpacing: .4 }}>PAID</span>
            : <span style={{ fontSize: 10, color: "#fff", background: C.danger, padding: "6px 12px", borderRadius: 20, fontWeight: 700, letterSpacing: .4 }}>UNPAID</span>}
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 12 }}>
          {its.map((it, j) => (
            <div key={it.id || j} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "11px 0", borderBottom: j < its.length - 1 ? "1px solid rgba(60,70,45,.06)" : "none" }}>
              <div style={{ display: "flex", gap: 11 }}>
                <span style={{ color: "#8a9078", fontWeight: 700, fontSize: 13, minWidth: 20 }}>{it.qty || 1}×</span>
                <div><div style={{ fontSize: 14, fontWeight: 600 }}>{it.name_snapshot}</div>{modLine(it) && <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>{modLine(it)}</div>}</div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{money(it.line_total)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 10, borderTop: "1px dashed " + C.line, marginBottom: 14 }}>
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 17 }}>Total</span>
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 24 }}>{money(o.total)}</span>
        </div>
        {isPaid ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1, padding: "13px 14px", borderRadius: 12, background: "#e6ecdd", color: C.paidText, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
              {o.paid_method === "cash" ? Ico.cash(15) : Ico.card(15)} Paid · {o.paid_method === "cash" ? "Cash" : "Card"}
            </div>
            <span onClick={() => onUnpaid(o)} style={{ padding: "13px 16px", borderRadius: 12, background: "#fff", border: "1.5px solid " + C.line, color: C.ink, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Undo</span>
            <span onClick={() => onReprint(o)} style={{ padding: "12px 14px", borderRadius: 12, background: "#fff", border: "1.5px solid " + C.line, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, color: "#2f6b4f" }}>{Ico.printer(16)} Print</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <span onClick={() => { setPayFor(o.id); setPayStep("method"); }} style={{ flex: 1, textAlign: "center", background: "#5E7A4D", color: "#fff", padding: "15px 0", borderRadius: 13, fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>Take payment</span>
            <span onClick={() => setEditing(true)} style={{ padding: "15px 18px", background: "#fff", border: "1.5px solid " + C.line, color: C.ink, borderRadius: 13, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Edit</span>
            <span onClick={() => onReprint(o)} style={{ padding: "13px 15px", background: "#fff", border: "1.5px solid " + C.line, borderRadius: 13, cursor: "pointer", display: "flex", alignItems: "center" }}>{Ico.printer(17)}</span>
          </div>
        )}
      </Overlay>
    );
  }

  return (
    <div style={{ width: 234, flexShrink: 0, background: C.bg, borderRight: "1px solid " + C.line, display: "flex", flexDirection: "column", position: "relative", fontFamily: "'Hanken Grotesk',sans-serif", color: C.ink }}>
      {/* tabs */}
      <div style={{ padding: "11px 11px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 3, background: "#e7e3d7", borderRadius: 10, padding: 3 }}>
          <span onClick={() => { setTab("unpaid"); setSelId(null); }} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: tab === "unpaid" ? "#fff" : "transparent", color: tab === "unpaid" ? C.danger : C.sub, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            Unpaid {unpaid.length > 0 && <span style={{ background: C.danger, color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 10.5, fontWeight: 700 }}>{unpaid.length}</span>}
          </span>
          <span onClick={() => { setTab("paid"); setSelId(null); }} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: tab === "paid" ? "#fff" : "transparent", color: tab === "paid" ? C.paidGreen : C.sub }}>
            Paid {paid.length > 0 && <span style={{ color: C.sub, fontSize: 11 }}>{paid.length}</span>}
          </span>
        </div>
      </div>
      {tab === "unpaid" && unpaid.length > 0 && (
        <div style={{ padding: "0 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.danger, textTransform: "uppercase", letterSpacing: .5 }}>Owed</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.danger }}>{money(owed)}</span>
        </div>
      )}
      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 11px 12px", WebkitOverflowScrolling: "touch" }}>
        {list.map((o) => <Row key={o.id} o={o} paid={tab === "paid"} />)}
        {list.length === 0 && <div style={{ padding: "36px 10px", textAlign: "center", color: C.sub, fontSize: 13 }}>{tab === "unpaid" ? "No unpaid orders." : "No paid orders yet."}</div>}
      </div>
      {sel && <Sheet />}
    </div>
  );
}

// A sheet that slides over the strip (kept within the strip's column)
function Overlay({ children, onClose }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 15, display: "flex", flexDirection: "column" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(40,46,32,.35)" }} />
      <div style={{ marginTop: "auto", position: "relative", background: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, boxShadow: "0 -8px 30px rgba(40,46,32,.22)", padding: "18px 18px 20px", maxHeight: "88%", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}
