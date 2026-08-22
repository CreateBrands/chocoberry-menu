import { useState, useMemo } from "react";

// ── Order-management screen (flagship POS design) ─────────────────────
// Self-contained. Renders inside the existing Drawer's "Till" tab.
// Reuses the Drawer's already-verified PIN + handlers via props:
//   orders        : allOrders array (from Drawer.loadAllOrders)
//   onPay(order, method, {discount})  -> calls admin-api mark_paid
//   onUnpaid(order)                   -> mark_unpaid
//   onAddItems(orderId)               -> opens the menu to append items
//   onRemoveItem(order, orderItemId)  -> admin-api remove_order_item
//   onSetQty(order, orderItemId, qty) -> admin-api set_order_item_qty
//   onReprint(order)                  -> reprint slip
//   busy          : boolean (a write is in flight)
//   now           : Date.now() for elapsed-time colouring
//
// All money in GBP. Colours match the Chocoberry admin palette.

const money = (n) => "£" + Number(n || 0).toFixed(2);

function minsAgo(ts, now) {
  const m = Math.max(0, Math.floor((now - ts) / 60000));
  return m;
}
function agoLabel(mins) {
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min";
  const h = Math.floor(mins / 60);
  return h + "h " + (mins % 60) + "m";
}
// colour by wait: <5 red (fresh/urgent for unpaid), 5-15 amber, else muted
function ageColor(mins) {
  if (mins < 5) return "#B23B3B";
  if (mins < 15) return "#C67A2C";
  return "#8B917D";
}

const T = {
  bg: "#F4F1E8", card: "#FFFFFF", ink: "#262A1E", muted: "#8B917D",
  faint: "#A8AE98", accent: "#5E7A4D", accentSoft: "#EDF0E7",
  danger: "#B23B3B", dangerSoft: "#F7E8E8", tan: "#8a5a2c", tanSoft: "#F5E9DC",
  line: "rgba(60,70,45,.09)", dot: "#DAD7C9",
};

export default function OrderManager({
  orders = [], onPay, onUnpaid, onAddItems, onRemoveItem, onSetQty, onReprint,
  busy = false, now = Date.now(),
}) {
  const [tab, setTab] = useState("unpaid");     // unpaid | paid | all
  const [selId, setSelId] = useState(null);     // selected order id
  const [payFor, setPayFor] = useState(null);   // order id in payment flow
  const [payStep, setPayStep] = useState("method"); // method | cash
  const [cashGiven, setCashGiven] = useState(null); // number
  const [editing, setEditing] = useState(false); // edit mode for selected order

  // Split orders into unpaid / paid
  const { unpaid, paid } = useMemo(() => {
    const u = [], p = [];
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      (o.paid_method ? p : u).push(o);
    }
    // unpaid: oldest first isn't ideal; show newest first but urgent ones visible
    u.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { unpaid: u, paid: p };
  }, [orders]);

  const owed = unpaid.reduce((s, o) => s + Number(o.total || 0), 0);

  const list = tab === "unpaid" ? unpaid : tab === "paid" ? paid : [...unpaid, ...paid];
  const sel = orders.find((o) => o.id === selId) || null;

  // auto-select first in list if nothing selected or selection left the list
  const visibleIds = list.map((o) => o.id);
  const effectiveSel = sel && visibleIds.includes(sel.id) ? sel : list[0] || null;

  function tableLabel(o) {
    if (o.menu_tables && o.menu_tables.label) {
      // strip a leading "Table " if present so we can show just the number big
      return String(o.menu_tables.label).replace(/^table\s*/i, "");
    }
    return null;
  }
  function isDineIn(o) { return (o.order_type || "").toLowerCase().includes("dine"); }

  // ----- tile (table number or takeaway bag) -----
  function Tile({ o, size = 52, selected = false }) {
    const tl = tableLabel(o);
    const dine = isDineIn(o);
    const bg = selected ? T.danger : dine ? "#F4ECE2" : T.accentSoft;
    const fg = selected ? "#fff" : dine ? T.tan : T.accent;
    if (!dine || !tl) {
      // takeaway bag
      return (
        <div style={{ width: size, height: size, borderRadius: size * 0.28, background: selected ? T.danger : T.accentSoft, color: selected ? "#fff" : T.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-shopping-bag" style={{ fontSize: size * 0.44 }} />
        </div>
      );
    }
    return (
      <div style={{ width: size, height: size, borderRadius: size * 0.28, background: bg, color: fg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1, flexShrink: 0, boxShadow: selected ? "0 4px 11px -3px rgba(178,59,59,.45)" : "none" }}>
        <span style={{ fontSize: size * 0.15, fontWeight: 700, opacity: .72, letterSpacing: .6 }}>TABLE</span>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: size * 0.4, marginTop: 2 }}>{tl}</span>
      </div>
    );
  }

  // ----- one order row in the list -----
  function Row({ o }) {
    const selected = effectiveSel && effectiveSel.id === o.id;
    const isPaid = !!o.paid_method;
    const its = o.menu_order_items || [];
    const mins = minsAgo(new Date(o.created_at).getTime(), now);
    const name = o.pickup_name || (o.menu_tables && o.menu_tables.label) || "Order";
    if (isPaid) {
      return (
        <div onClick={() => { setSelId(o.id); setEditing(false); setPayFor(null); }} style={{ margin: "0 13px 10px", padding: "14px 16px", borderRadius: 16, background: selected ? "#fff" : "#FBFAF6", border: "1px solid " + (selected ? "rgba(94,122,77,.3)" : "rgba(60,70,45,.06)"), display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 23 }}><i className="ti ti-circle-check" /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#5D6152" }}>{name}{tableLabel(o) && !isDineIn(o) ? "" : ""}</div>
            <div style={{ fontSize: 11.5, color: T.faint, fontWeight: 600, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <span>#{o.order_no}</span><span style={{ color: T.dot }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><i className={"ti " + (o.paid_method === "cash" ? "ti-cash" : "ti-credit-card")} style={{ fontSize: 13 }} />{o.paid_method === "cash" ? "Cash" : "Card"}</span>
            </div>
          </div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16, color: T.muted }}>{money(o.total)}</div>
        </div>
      );
    }
    // unpaid
    return (
      <div style={{ position: "relative", margin: "0 13px 10px" }}>
        {selected && <div style={{ position: "absolute", left: -1, top: 14, bottom: 14, width: 4, borderRadius: 4, background: T.danger }} />}
        <div onClick={() => { setSelId(o.id); setEditing(false); setPayFor(null); }} style={{ padding: "16px 17px", borderRadius: 16, background: "#fff", border: "1px solid " + (selected ? "rgba(178,59,59,.35)" : "rgba(60,70,45,.1)"), display: "flex", alignItems: "center", gap: 14, cursor: "pointer", boxShadow: selected ? "0 8px 22px -6px rgba(178,59,59,.2)" : "0 2px 9px -3px rgba(60,70,45,.1)" }}>
          <Tile o={o} selected={selected} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: -.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
              <span style={{ fontSize: 9, color: isDineIn(o) ? T.tan : T.accent, background: isDineIn(o) ? T.tanSoft : T.accentSoft, padding: "2.5px 8px", borderRadius: 7, fontWeight: 700, letterSpacing: .4, flexShrink: 0 }}>{isDineIn(o) ? "DINE-IN" : "TAKEAWAY"}</span>
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
              <span>#{o.order_no}</span><span style={{ color: T.dot }}>·</span>
              <span>{its.length} item{its.length === 1 ? "" : "s"}</span><span style={{ color: T.dot }}>·</span>
              <span style={{ color: ageColor(mins), display: "inline-flex", alignItems: "center", gap: 3 }}><i className="ti ti-clock" style={{ fontSize: 11.5 }} />{agoLabel(mins)}</span>
            </div>
          </div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20, color: T.danger, letterSpacing: -.6 }}>{money(o.total)}</div>
        </div>
      </div>
    );
  }

  // ----- detail / payment / edit panel -----
  function Detail() {
    const o = effectiveSel;
    if (!o) return <div style={{ padding: 40, textAlign: "center", color: T.faint, fontSize: 15 }}>Select an order to see details.</div>;
    const its = o.menu_order_items || [];
    const isPaid = !!o.paid_method;
    const mins = minsAgo(new Date(o.created_at).getTime(), now);
    const name = o.pickup_name || (o.menu_tables && o.menu_tables.label) || "Order";

    // ---- PAYMENT FLOW ----
    if (payFor === o.id) {
      if (payStep === "method") {
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ padding: "19px 24px", borderBottom: "1px solid " + T.line, display: "flex", alignItems: "center", gap: 13 }}>
              <span onClick={() => setPayFor(null)} style={{ width: 38, height: 38, borderRadius: 11, background: "#F0EDE2", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 18, cursor: "pointer" }}><i className="ti ti-arrow-left" /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 17 }}>Take payment{tableLabel(o) ? " · Table " + tableLabel(o) : ""}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Order #{o.order_no} · {name}</div>
              </div>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>BALANCE DUE</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: -.6 }}>{money(o.total)}</div></div>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div onClick={() => { setPayStep("cash"); setCashGiven(null); }} style={{ padding: "26px 0", borderRadius: 15, background: T.accent, color: "#fff", textAlign: "center", cursor: "pointer", boxShadow: "0 5px 15px -4px rgba(94,122,77,.4)" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}><i className="ti ti-cash" /></div><div style={{ fontWeight: 600, fontSize: 16 }}>Cash</div>
              </div>
              <div onClick={() => onPay(o, "card")} style={{ padding: "26px 0", borderRadius: 15, background: "#fff", border: "1.5px solid rgba(60,70,45,.15)", textAlign: "center", cursor: "pointer", opacity: busy ? .6 : 1 }}>
                <div style={{ fontSize: 32, marginBottom: 8, color: T.accent }}><i className="ti ti-credit-card" /></div><div style={{ fontWeight: 600, fontSize: 16 }}>Card</div>
              </div>
            </div>
          </div>
        );
      }
      // cash step
      const total = Number(o.total || 0);
      const given = cashGiven == null ? 0 : cashGiven;
      const change = Math.max(0, given - total);
      // quick amounts based on balance due
      const up = Math.ceil(total);
      const quick = [...new Set([up, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10])].filter((v) => v >= total).slice(0, 3);
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ padding: "18px 24px", background: "#FAF9F3", borderBottom: "1px solid " + T.line, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span onClick={() => setPayStep("method")} style={{ color: T.muted, fontSize: 18, cursor: "pointer" }}><i className="ti ti-arrow-left" /></span>
              <div><div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>BALANCE DUE</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: -.5 }}>{money(total)}</div></div>
            </div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>CHANGE DUE</div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20, color: T.accent, letterSpacing: -.5 }}>{money(change)}</div></div>
          </div>
          <div style={{ padding: "16px 24px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginBottom: 4 }}>CASH TENDERED</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 34, letterSpacing: -1 }}>{cashGiven == null ? "—" : money(given)}</div>
          </div>
          <div style={{ padding: "8px 24px 20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {quick.map((v) => (
              <div key={v} onClick={() => setCashGiven(v)} style={{ padding: "14px 0", borderRadius: 12, background: given === v ? T.accentSoft : "#F0EDE2", border: given === v ? "1.5px solid " + T.accent : "1.5px solid transparent", textAlign: "center", fontWeight: 700, fontSize: 16, color: given === v ? T.accent : "#5D6152", cursor: "pointer" }}>£{v}</div>
            ))}
            <div onClick={() => setCashGiven(total)} style={{ padding: "14px 0", borderRadius: 12, background: "#F0EDE2", textAlign: "center", fontWeight: 700, fontSize: 14, color: "#5D6152", cursor: "pointer" }}>Exact</div>
            <div style={{ gridColumn: "1 / -1", padding: "16px 0", borderRadius: 14, background: cashGiven == null ? "#c9ccc0" : T.accent, color: "#fff", textAlign: "center", fontWeight: 600, fontSize: 16, cursor: cashGiven == null ? "default" : "pointer", boxShadow: cashGiven == null ? "none" : "0 5px 15px -4px rgba(94,122,77,.4)", opacity: busy ? .6 : 1 }}
              onClick={() => { if (cashGiven != null && !busy) onPay(o, "cash"); }}>
              Confirm cash payment
            </div>
          </div>
        </div>
      );
    }

    // ---- EDIT MODE ----
    if (editing && !isPaid) {
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid " + T.line, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Tile o={o} size={44} selected />
              <div><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16 }}>Editing #{o.order_no}</div><div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{name} · changes save to this order</div></div>
            </div>
            <span onClick={() => onAddItems(o.id)} style={{ background: T.accentSoft, color: T.accent, borderRadius: 11, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}><i className="ti ti-plus" /> Add items</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 24px" }}>
            {its.map((it, j) => (
              <div key={it.id || j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: j < its.length - 1 ? "1px solid rgba(60,70,45,.05)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, background: T.bg, borderRadius: 20, padding: "5px 6px", flexShrink: 0 }}>
                    <span onClick={() => onSetQty(o, it.id, (it.qty || 1) - 1)} style={{ width: 26, height: 26, borderRadius: "50%", background: "#fff", border: "1px solid rgba(60,70,45,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: T.danger, fontWeight: 700, cursor: "pointer" }}>−</span>
                    <span style={{ fontWeight: 700, fontSize: 14, minWidth: 14, textAlign: "center" }}>{it.qty || 1}</span>
                    <span onClick={() => onSetQty(o, it.id, (it.qty || 1) + 1)} style={{ width: 26, height: 26, borderRadius: "50%", background: "#fff", border: "1px solid rgba(60,70,45,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: T.accent, fontWeight: 700, cursor: "pointer" }}>+</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name_snapshot}</div>
                    {modLine(it) && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{modLine(it)}</div>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700 }}>{money(it.line_total)}</span>
                  <span onClick={() => onRemoveItem(o, it.id)} style={{ color: "#C4988C", fontSize: 17, cursor: "pointer" }}><i className="ti ti-trash" /></span>
                </div>
              </div>
            ))}
            {its.length === 0 && <div style={{ padding: 30, textAlign: "center", color: T.faint, fontSize: 14 }}>No items. Add some or the order is empty.</div>}
          </div>
          <div style={{ padding: "16px 24px 20px", borderTop: "1px solid " + T.line, background: "#FAF9F3", display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ flex: 1 }}><span style={{ fontSize: 12, color: T.muted, fontWeight: 500 }}>New total</span><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: -.5 }}>{money(o.total)}</div></div>
            <span onClick={() => setEditing(false)} style={{ background: "#fff", border: "1px solid rgba(60,70,45,.15)", color: T.muted, padding: "14px 20px", borderRadius: 13, fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}>Done</span>
            <span onClick={() => { setEditing(false); setPayFor(o.id); setPayStep("method"); }} style={{ background: T.accent, color: "#fff", padding: "14px 22px", borderRadius: 13, fontWeight: 600, fontSize: 14.5, cursor: "pointer", boxShadow: "0 4px 12px -3px rgba(94,122,77,.4)", whiteSpace: "nowrap" }}>Take payment</span>
          </div>
        </div>
      );
    }

    // ---- DEFAULT DETAIL ----
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "22px 26px 19px", borderBottom: "1px solid " + T.line, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
            <Tile o={o} size={58} selected={!isPaid} />
            <div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: -.4 }}>{name}</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                <span>#{o.order_no}</span><span style={{ color: T.dot }}>·</span><span>{isDineIn(o) ? "Dine-in" : "Takeaway"}</span><span style={{ color: T.dot }}>·</span><span>{agoLabel(mins)} ago</span>
              </div>
            </div>
          </div>
          {isPaid
            ? <span style={{ fontSize: 10, color: T.accent, background: T.accentSoft, padding: "7px 14px", borderRadius: 20, fontWeight: 700, letterSpacing: .5, whiteSpace: "nowrap" }}>● PAID</span>
            : <span style={{ fontSize: 10, color: T.danger, background: T.dangerSoft, padding: "7px 14px", borderRadius: 20, fontWeight: 700, letterSpacing: .5, whiteSpace: "nowrap" }}>● UNPAID</span>}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 26px" }}>
          {its.map((it, j) => (
            <div key={it.id || j} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "15px 0", borderBottom: j < its.length - 1 ? "1px solid rgba(60,70,45,.05)" : "none" }}>
              <div style={{ display: "flex", gap: 14 }}>
                <span style={{ color: "#C4C9B8", fontWeight: 700, fontSize: 13, minWidth: 18 }}>{it.qty || 1}×</span>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: -.1 }}>{it.name_snapshot}</div>
                  {modLine(it) && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 4, height: 4, borderRadius: "50%", background: "#C4C9B8" }} />{modLine(it)}</div>}
                </div>
              </div>
              <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: -.2 }}>{money(it.line_total)}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: "20px 26px 24px", borderTop: "1px solid " + T.line, background: "#FAF9F3" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18, paddingTop: 4 }}>
            <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: -.4 }}>Total</span>
            <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 28, letterSpacing: -.9 }}>{money(o.total)}</span>
          </div>
          {isPaid ? (
            <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <div style={{ flex: 1, padding: "14px 16px", borderRadius: 13, background: T.accentSoft, color: T.accent, fontWeight: 600, fontSize: 14.5, display: "flex", alignItems: "center", gap: 8 }}>
                <i className={"ti " + (o.paid_method === "cash" ? "ti-cash" : "ti-credit-card")} /> Paid by {o.paid_method === "cash" ? "cash" : "card"}
              </div>
              <span onClick={() => onUnpaid(o)} style={{ padding: "14px 18px", borderRadius: 13, background: "#fff", border: "1px solid rgba(60,70,45,.15)", color: T.muted, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>Undo</span>
              <span onClick={() => onReprint(o)} style={{ width: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid rgba(60,70,45,.15)", color: T.accent, borderRadius: 13, fontSize: 19, cursor: "pointer", padding: "14px 0" }}><i className="ti ti-printer" /></span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 9 }}>
              <span onClick={() => { setPayFor(o.id); setPayStep("method"); }} style={{ flex: 1, textAlign: "center", background: T.accent, color: "#fff", padding: "17px 0", borderRadius: 15, fontWeight: 600, fontSize: 16.5, letterSpacing: -.2, cursor: "pointer", boxShadow: "0 6px 18px -4px rgba(94,122,77,.45)" }}>Take payment</span>
              <span onClick={() => setEditing(true)} style={{ width: 58, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid rgba(60,70,45,.13)", color: T.accent, borderRadius: 15, fontSize: 20, cursor: "pointer" }}><i className="ti ti-edit" /></span>
              <span onClick={() => onReprint(o)} style={{ width: 58, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid rgba(60,70,45,.13)", color: T.muted, borderRadius: 15, fontSize: 20, cursor: "pointer" }}><i className="ti ti-printer" /></span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: T.bg, borderRadius: 0, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column", fontFamily: "'Hanken Grotesk',sans-serif", color: T.ink }}>
      {/* header tabs */}
      <div style={{ background: "#fff", padding: "14px 20px", borderBottom: "1px solid " + T.line, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", flexShrink: 0 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 19, letterSpacing: -.4 }}>Orders</div>
        <div style={{ display: "inline-flex", gap: 2, background: "#F0EDE2", borderRadius: 13, padding: 4 }}>
          {[["unpaid", "Unpaid", unpaid.length, T.danger], ["paid", "Paid", paid.length, null], ["all", "All", unpaid.length + paid.length, null]].map(([k, lbl, n, col]) => {
            const on = tab === k;
            return (
              <span key={k} onClick={() => { setTab(k); setSelId(null); }} style={{ padding: "9px 16px", borderRadius: 10, background: on ? "#fff" : "transparent", color: on && col ? col : on ? T.accent : T.muted, fontSize: 13.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", boxShadow: on ? "0 1px 4px rgba(60,70,45,.12)" : "none" }}>
                {lbl} <span style={{ background: on && k === "unpaid" ? T.danger : "transparent", color: on && k === "unpaid" ? "#fff" : T.faint, borderRadius: 20, minWidth: 18, textAlign: "center", padding: on && k === "unpaid" ? "1px 6px" : "0", fontSize: 11.5, fontWeight: 700 }}>{n}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* body: split list + detail */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.05fr 1fr", minHeight: 0 }}>
        <div style={{ borderRight: "1px solid " + T.line, overflowY: "auto", paddingTop: 4, paddingBottom: 12, WebkitOverflowScrolling: "touch" }}>
          {tab !== "paid" && unpaid.length > 0 && (
            <div style={{ padding: "15px 21px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: T.danger }} /><span style={{ fontSize: 11, fontWeight: 700, color: T.danger, textTransform: "uppercase", letterSpacing: .9 }}>Awaiting payment</span></div>
              <span style={{ fontSize: 11.5, color: T.danger, fontWeight: 700, background: T.dangerSoft, padding: "4px 11px", borderRadius: 20 }}>{money(owed)} owed</span>
            </div>
          )}
          {tab !== "paid" && unpaid.map((o) => <Row key={o.id} o={o} />)}
          {tab === "all" && paid.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 22px 6px" }}><div style={{ flex: 1, height: 1, background: "rgba(60,70,45,.07)" }} /><span style={{ fontSize: 10, fontWeight: 700, color: T.faint, textTransform: "uppercase", letterSpacing: .9 }}>Paid</span><div style={{ flex: 1, height: 1, background: "rgba(60,70,45,.07)" }} /></div>
          )}
          {tab === "paid" && paid.length > 0 && (
            <div style={{ padding: "15px 21px 10px" }}><span style={{ fontSize: 11, fontWeight: 700, color: T.faint, textTransform: "uppercase", letterSpacing: .9 }}>Paid · settled</span></div>
          )}
          {tab !== "unpaid" && paid.map((o) => <Row key={o.id} o={o} />)}
          {list.length === 0 && <div style={{ padding: 50, textAlign: "center", color: T.faint, fontSize: 15 }}>{tab === "unpaid" ? "No unpaid orders." : tab === "paid" ? "No paid orders yet." : "No orders yet."}</div>}
        </div>
        <div style={{ background: "#fff", minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <Detail />
        </div>
      </div>
    </div>
  );
}

// modifiers_snapshot can be array of strings or object
function modLine(it) {
  const m = it.modifiers_snapshot;
  if (!m) return "";
  if (Array.isArray(m)) return m.join(" · ");
  if (typeof m === "object") return Object.values(m).join(" · ");
  return String(m);
}
