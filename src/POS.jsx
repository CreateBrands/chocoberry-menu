import { useState, useEffect, useMemo, useRef } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };

const gbp = (n) => "£" + Number(n || 0).toFixed(2);

// ===========================================================================
// Full POS screen for the KDS (large tablet, landscape).
// Left: category tabs + item grid. Right: live order ticket + pay/send.
// Reuses the customer menu (store_menu_full), place-order (print + KDS), and
// admin-api mark_paid. Rendered by KDS when the POS tab is active.
// ===========================================================================
export default function POS({ loc, storeToken, tablesList = [], pinRef }) {
  const [menus, setMenus] = useState(null);      // [{name, categories:[{name, items:[...]}]}]
  const [activeCat, setActiveCat] = useState(0);
  const [ticket, setTicket] = useState([]);      // [{key, item, qty, unit, mods:[{group,name,price_delta,option_id}]}]
  const [table, setTable] = useState(null);      // {id,label} | null = takeaway
  const [modItem, setModItem] = useState(null);  // item awaiting modifier choices
  const [modSel, setModSel] = useState({});      // {groupId:[optionId]}
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [placedOrder, setPlacedOrder] = useState(null); // {id, order_no} after send, for payment
  const [search, setSearch] = useState("");

  // ---- Load menu (same source as the customer app) ----
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const body = loc ? { loc } : { loc: null };
        const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/store_menu_full", {
          method: "POST", headers: H, body: JSON.stringify(body), cache: "no-store",
        });
        const rows = r.ok ? await r.json() : [];
        // group rows -> categories -> items (flatten menus into one category list)
        const catMap = new Map();
        for (const row of rows) {
          if (row.available === false) continue;
          let c = catMap.get(row.category_id);
          if (!c) { c = { id: row.category_id, name: row.category_name, sort: row.category_sort ?? 0, items: [] }; catMap.set(row.category_id, c); }
          c.items.push({
            id: row.item_id, name: row.item_name, price: Number(row.price),
            modifiers: row.modifiers || [],
          });
        }
        const cats = [...catMap.values()].sort((a, b) => a.sort - b.sort);
        if (alive) setMenus(cats);
      } catch { if (alive) setMenus([]); }
    })();
    return () => { alive = false; };
  }, [loc]);

  const cats = menus || [];
  const shownItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return cats.flatMap((c) => c.items).filter((it) => it.name.toLowerCase().includes(q));
    return cats[activeCat] ? cats[activeCat].items : [];
  }, [cats, activeCat, search]);

  const ticketTotal = ticket.reduce((s, l) => s + l.unit * l.qty, 0);

  // ---- Add item (open modifier popup if it has modifiers) ----
  function addItem(it) {
    if (it.modifiers && it.modifiers.length) {
      setModItem(it); setModSel({});
    } else {
      pushLine(it, it.price, []);
    }
  }
  function pushLine(it, unit, mods) {
    setTicket((prev) => {
      // merge identical lines (same item + same mods)
      const sig = it.id + "|" + mods.map((m) => m.option_id).sort().join(",");
      const idx = prev.findIndex((l) => l.sig === sig);
      if (idx >= 0) { const copy = prev.slice(); copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 }; return copy; }
      return [...prev, { key: Math.random().toString(36).slice(2), sig, item: it, qty: 1, unit, mods }];
    });
  }
  function confirmMods() {
    const groups = modItem.modifiers || [];
    const chosenMods = groups.flatMap((g) =>
      (g.options || []).filter((o) => (modSel[g.id] || []).includes(o.id))
        .map((o) => ({ group: g.name, name: o.name, price_delta: Number(o.price_delta || 0), option_id: o.id })));
    const unit = modItem.price + chosenMods.reduce((s, m) => s + m.price_delta, 0);
    pushLine(modItem, unit, chosenMods);
    setModItem(null); setModSel({});
  }
  const setQty = (key, d) => setTicket((prev) => prev.flatMap((l) => l.key === key ? (l.qty + d <= 0 ? [] : [{ ...l, qty: l.qty + d }]) : [l]));
  const removeLine = (key) => setTicket((prev) => prev.filter((l) => l.key !== key));
  const clearTicket = () => { setTicket([]); setTable(null); setPlacedOrder(null); setMsg(""); };

  // ---- Send to kitchen (print + KDS) via place-order ----
  async function sendOrder() {
    if (!ticket.length) return;
    setSending(true); setMsg("");
    try {
      const payload = {
        qr_token: storeToken || null,
        location_id: loc || null,
        table_id: table ? table.id : null,
        order_type: table ? "dine_in" : "takeaway",
        pickup_name: null,
        tablet_no: "POS",
        items: ticket.map((l) => ({ item_id: l.item.id, qty: l.qty, modifiers: l.mods.map((m) => m.option_id) })),
      };
      const r = await fetch(SUPABASE_URL + "/functions/v1/place-order", {
        method: "POST", headers: H, body: JSON.stringify(payload),
      });
      const resp = await r.json();
      if (!r.ok) throw new Error(resp.message || resp.error || "Send failed");
      setPlacedOrder({ id: resp.order_id, order_no: resp.order_no, total: ticketTotal });
      setMsg("Sent to kitchen — order #" + resp.order_no);
    } catch (e) { setMsg(e.message || "Send failed"); } finally { setSending(false); }
  }

  // ---- Payment (after send) reuses admin-api mark_paid ----
  const [payMethod, setPayMethod] = useState(null);
  const [payPin, setPayPin] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  async function takePayment() {
    if (!placedOrder || !payMethod || !payPin) { setMsg("Choose method + PIN"); return; }
    setPayBusy(true);
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pin: payPin, action: "mark_paid", data: { order_id: placedOrder.id, method: payMethod } }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error === "unauthorized" ? "Wrong PIN" : "Payment failed"); }
      setMsg("Paid — order #" + placedOrder.order_no + " complete");
      setTimeout(clearTicket, 900);
    } catch (e) { setMsg(e.message); } finally { setPayBusy(false); setPayPin(""); setPayMethod(null); }
  }

  const C = { bg: "#0f1420", panel: "#161c28", card: "#1c2431", line: "#2a3342", ink: "#eef2f7", muted: "#93a0b4", accent: "#ec4899", green: "#16a34a" };

  return (
    <div style={{ display: "flex", height: "calc(100dvh - 56px)", background: C.bg, color: C.ink, fontFamily: "'Hanken Grotesk',sans-serif" }}>
      {/* LEFT: categories + items */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* search */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid " + C.line }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 10, border: "1px solid " + C.line, background: C.panel, color: C.ink, fontSize: 15 }} />
        </div>
        {/* category tabs */}
        {!search && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 14px", borderBottom: "1px solid " + C.line, flexShrink: 0 }}>
            {cats.map((c, i) => (
              <div key={c.id} onClick={() => setActiveCat(i)} style={{ padding: "9px 16px", borderRadius: 10, whiteSpace: "nowrap", cursor: "pointer", fontSize: 14, fontWeight: 700, background: activeCat === i ? C.accent : C.panel, color: activeCat === i ? "#fff" : C.muted }}>{c.name}</div>
            ))}
          </div>
        )}
        {/* item grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, alignContent: "start" }}>
          {menus === null && <div style={{ color: C.muted }}>Loading menu…</div>}
          {menus && shownItems.length === 0 && <div style={{ color: C.muted }}>No items.</div>}
          {shownItems.map((it) => (
            <div key={it.id} onClick={() => addItem(it)} style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: 12, cursor: "pointer", minHeight: 78, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{it.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ color: C.accent, fontWeight: 800, fontSize: 15 }}>{gbp(it.price)}</span>
                {it.modifiers && it.modifiers.length ? <span style={{ fontSize: 10, color: C.muted }}>options</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: order ticket */}
      <div style={{ width: 360, flexShrink: 0, borderLeft: "1px solid " + C.line, background: C.panel, display: "flex", flexDirection: "column" }}>
        {/* table selector */}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid " + C.line, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div onClick={() => setTable(null)} style={{ padding: "7px 13px", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700, background: !table ? C.accent : C.card, color: !table ? "#fff" : C.muted }}>Takeaway</div>
          <select value={table ? table.id : ""} onChange={(e) => { const t = tablesList.find((x) => x.id === e.target.value); setTable(t ? { id: t.id, label: t.label } : null); }}
            style={{ flex: 1, minWidth: 120, padding: "8px 10px", borderRadius: 9, background: C.card, color: C.ink, border: "1px solid " + C.line, fontSize: 13 }}>
            <option value="">Select table…</option>
            {tablesList.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        {/* ticket lines */}
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {ticket.length === 0 && <div style={{ color: C.muted, textAlign: "center", marginTop: 40, fontSize: 15 }}>Tap items to build an order</div>}
          {ticket.map((l) => (
            <div key={l.key} style={{ background: C.card, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{l.item.name}</div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{gbp(l.unit * l.qty)}</div>
              </div>
              {l.mods.length > 0 && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{l.mods.map((m) => m.name).join(", ")}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <div onClick={() => setQty(l.key, -1)} style={{ width: 30, height: 30, borderRadius: 8, background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 20, fontWeight: 700 }}>−</div>
                <span style={{ minWidth: 22, textAlign: "center", fontWeight: 700 }}>{l.qty}</span>
                <div onClick={() => setQty(l.key, 1)} style={{ width: 30, height: 30, borderRadius: 8, background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 20, fontWeight: 700 }}>+</div>
                <div onClick={() => removeLine(l.key)} style={{ marginLeft: "auto", fontSize: 12, color: "#f87171", cursor: "pointer", fontWeight: 700 }}>Remove</div>
              </div>
            </div>
          ))}
        </div>
        {/* footer: total + actions */}
        <div style={{ borderTop: "1px solid " + C.line, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 800, marginBottom: 10 }}>
            <span>Total</span><span>{gbp(ticketTotal)}</span>
          </div>
          {msg && <div style={{ fontSize: 13, color: msg.includes("fail") || msg.includes("Wrong") ? "#f87171" : C.green, marginBottom: 10, textAlign: "center" }}>{msg}</div>}

          {!placedOrder ? (
            <div style={{ display: "flex", gap: 8 }}>
              <div onClick={clearTicket} style={{ padding: "13px 16px", borderRadius: 12, background: C.card, color: C.muted, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Clear</div>
              <div onClick={sendOrder} style={{ flex: 1, textAlign: "center", padding: "13px 0", borderRadius: 12, background: ticket.length ? C.accent : C.card, color: "#fff", fontWeight: 800, fontSize: 16, cursor: ticket.length ? "pointer" : "default", opacity: sending ? .6 : 1 }}>{sending ? "Sending…" : "Send to kitchen"}</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 8, textAlign: "center" }}>Order #{placedOrder.order_no} sent · take payment</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {[["cash", "Cash"], ["card", "Card"]].map(([m, label]) => (
                  <div key={m} onClick={() => setPayMethod(m)} style={{ flex: 1, textAlign: "center", padding: "12px 0", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 15, background: payMethod === m ? C.accent : C.card, border: "1px solid " + (payMethod === m ? C.accent : C.line) }}>{label}</div>
                ))}
              </div>
              <input type="text" inputMode="numeric" value={payPin} onChange={(e) => setPayPin(e.target.value.replace(/\D/g, ""))} placeholder="Staff PIN"
                autoComplete="off" data-1p-ignore data-lpignore="true" readOnly onFocus={(e) => e.target.removeAttribute("readonly")}
                style={{ width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 18, letterSpacing: 5, padding: "10px 0", borderRadius: 10, border: "1px solid " + C.line, background: C.card, color: "#fff", marginBottom: 8, WebkitTextSecurity: "disc", textSecurity: "disc" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <div onClick={clearTicket} style={{ padding: "12px 16px", borderRadius: 12, background: C.card, color: C.muted, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>New</div>
                <div onClick={takePayment} style={{ flex: 1, textAlign: "center", padding: "12px 0", borderRadius: 12, background: (payMethod && payPin) ? C.green : C.card, color: "#fff", fontWeight: 800, fontSize: 15, cursor: (payMethod && payPin) ? "pointer" : "default", opacity: payBusy ? .6 : 1 }}>{payBusy ? "…" : "Confirm payment"}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modifier popup */}
      {modItem && (
        <div onClick={() => setModItem(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: "1px solid " + C.line, borderRadius: 16, padding: 20, width: 420, maxWidth: "100%", maxHeight: "82vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 4 }}>{modItem.name}</div>
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 14 }}>{gbp(modItem.price)} · choose options</div>
            {(modItem.modifiers || []).map((g) => (
              <div key={g.id} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 6 }}>{g.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(g.options || []).map((o) => {
                    const on = (modSel[g.id] || []).includes(o.id);
                    return (
                      <div key={o.id} onClick={() => setModSel((prev) => {
                        const cur = prev[g.id] || [];
                        // single-select if group max is 1, else multi
                        const single = g.max === 1 || g.single;
                        const next = on ? cur.filter((x) => x !== o.id) : (single ? [o.id] : [...cur, o.id]);
                        return { ...prev, [g.id]: next };
                      })} style={{ padding: "9px 13px", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 600, background: on ? C.accent : C.card, color: on ? "#fff" : C.ink, border: "1px solid " + (on ? C.accent : C.line) }}>
                        {o.name}{Number(o.price_delta) ? " +" + gbp(o.price_delta) : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div onClick={() => setModItem(null)} style={{ padding: "12px 18px", borderRadius: 12, background: C.card, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Cancel</div>
              <div onClick={confirmMods} style={{ flex: 1, textAlign: "center", padding: "12px 0", borderRadius: 12, background: C.accent, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Add to order</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
