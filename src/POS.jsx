import { useState, useEffect, useMemo } from "react";

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
  const [cats, setCats] = useState(null);   // [{id,name,items:[{id,name,price,image_url,modifiers}]}]
  const [activeCat, setActiveCat] = useState(0);
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

  // ---- Load menu (same source as the customer app) ----
  // Keep the top-level MENU grouping (Desserts, Drinks, Breakfast…) — the left
  // rail shows these, matching the customer tablet's bottom nav.
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
          if (!mn) { mn = { id: row.menu_id, name: row.menu_name, sort: row.menu_sort ?? 0, items: [] }; menuMap.set(row.menu_id, mn); }
          mn.items.push({ id: row.item_id, name: row.item_name, price: Number(row.price), image_url: row.image_url, category: row.category_name, modifiers: row.modifiers || [] });
        }
        if (alive) setCats([...menuMap.values()].sort((a, b) => a.sort - b.sort));
      } catch { if (alive) setCats([]); }
    })();
    return () => { alive = false; };
  }, [loc]);

  const catList = cats || [];
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return catList.flatMap((c) => c.items).filter((it) => it.name.toLowerCase().includes(q));
    return catList[activeCat] ? catList[activeCat].items : [];
  }, [catList, activeCat, search]);

  const itemCount = ticket.reduce((s, l) => s + l.qty, 0);
  const subtotal = ticket.reduce((s, l) => s + l.unit * l.qty, 0);

  function addItem(it) {
    if (it.modifiers && it.modifiers.length) { setModItem(it); setModSel({}); }
    else pushLine(it, it.price, []);
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
      const r = await fetch(SUPABASE_URL + "/functions/v1/place-order", { method: "POST", headers: H, body: JSON.stringify(payload) });
      const resp = await r.json();
      if (!r.ok) throw new Error(resp.message || resp.error || "Send failed");
      setPlaced({ id: resp.order_id, order_no: resp.order_no, total: subtotal });
      setMsg("Sent — order #" + resp.order_no);
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

  // palette
  const P = { canvas: "#eceef1", ink: "#12151c", panel: "#fff", line: "#e8e9ec", line2: "#f1f2f4", muted: "#868d99", muted2: "#9aa1ac", chip: "#f2f3f5", pinkA: "#f472a3", pinkB: "#e5397a", pinkBg: "#fdeef4" };
  const grad = "linear-gradient(140deg," + P.pinkA + "," + P.pinkB + ")";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 56px)", background: P.canvas, color: P.ink, fontFamily: "'Hanken Grotesk',sans-serif" }}>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* CATEGORY RAIL */}
        <div style={{ width: 114, flexShrink: 0, background: P.panel, borderRight: "1px solid " + P.line, display: "flex", flexDirection: "column", padding: "15px 12px", gap: 5, overflowY: "auto" }}>
          {catList.map((c, i) => {
            const on = activeCat === i && !search;
            return (
              <div key={c.id} onClick={() => { setActiveCat(i); setSearch(""); }} style={{ borderRadius: 16, padding: "14px 6px", textAlign: "center", cursor: "pointer", background: on ? grad : "transparent", color: on ? "#fff" : "#616976", boxShadow: on ? "0 5px 14px rgba(229,57,122,.32)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "center", height: 24 }}>{menuIcon(c.name, on)}</div>
                <div style={{ fontSize: 11, marginTop: 6, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                <div style={{ fontSize: 10, marginTop: 2, color: on ? "rgba(255,255,255,.75)" : "#b3b8c0" }}>{c.items.length}</div>
              </div>
            );
          })}
        </div>

        {/* ITEM GRID */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 20px 0" }}>
            <div style={{ background: P.panel, border: "1px solid " + P.line, borderRadius: 14, padding: "0 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, color: P.muted2 }}>⌕</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the menu"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "12px 0", fontSize: 14, color: P.ink, fontFamily: "inherit" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "16px 20px 10px" }}>
            <span style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-.2px" }}>{search ? "Results" : (catList[activeCat] ? catList[activeCat].name : "")}</span>
            <span style={{ fontSize: 12, color: P.muted2 }}>{shown.length} items</span>
          </div>
          <div style={{ flex: 1, padding: "2px 20px 20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridAutoRows: "min-content", gap: 14, overflowY: "auto" }}>
            {cats === null && <div style={{ color: P.muted2 }}>Loading menu…</div>}
            {cats && shown.length === 0 && <div style={{ color: P.muted2 }}>No items.</div>}
            {shown.map((it) => {
              const fb = fallbackFor(it.name, it.category || "");
              const hasMods = it.modifiers && it.modifiers.length;
              return (
                <div key={it.id} onClick={() => addItem(it)} style={{ background: P.panel, borderRadius: 18, overflow: "hidden", boxShadow: "0 3px 10px rgba(18,21,28,.08)", border: "1px solid #f0f1f3", cursor: "pointer", position: "relative" }}>
                  {hasMods ? <div style={{ position: "absolute", top: 9, left: 9, background: "rgba(255,255,255,.94)", borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 500, color: "#8a5a2c", boxShadow: "0 1px 3px rgba(0,0,0,.12)", zIndex: 2 }}>Choices</div> : null}
                  <div style={{ height: 82, background: it.image_url ? "#f0f1f3" : fb.grad, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: it.image_url ? "url(" + it.image_url + ")" : fb.grad, backgroundSize: "cover", backgroundPosition: "center" }}>
                    {!it.image_url && <span style={{ fontSize: 30 }}>{fb.icon}</span>}
                  </div>
                  <div style={{ padding: "11px 13px 13px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, lineHeight: 1.3, minHeight: 34 }}>{it.name}</div>
                      <div style={{ color: P.ink, fontWeight: 500, fontSize: 16, marginTop: 2 }}>{gbp(it.price)}</div>
                    </div>
                    <span style={{ width: 31, height: 31, flexShrink: 0, borderRadius: 11, background: P.pinkBg, color: P.pinkB, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 21, fontWeight: 400, lineHeight: 0, paddingBottom: 2, boxShadow: "0 1px 4px rgba(229,57,122,.18)" }}>+</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ORDER TICKET */}
        <div style={{ width: 328, flexShrink: 0, background: P.panel, borderLeft: "1px solid " + P.line, display: "flex", flexDirection: "column", boxShadow: "-6px 0 20px rgba(18,21,28,.04)" }}>
          <div style={{ padding: "17px 19px 14px", borderBottom: "1px solid " + P.line2 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
              <span style={{ fontWeight: 500, fontSize: 16, letterSpacing: "-.2px" }}>Current order</span>
              <span style={{ fontSize: 12, color: P.muted, background: "#f3f4f6", padding: "4px 11px", borderRadius: 20, fontWeight: 500 }}>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <select value={table ? table.id : ""} onChange={(e) => { const t = tablesList.find((x) => x.id === e.target.value); setTable(t ? { id: t.id, label: t.label } : null); }}
                style={{ flex: 1, textAlign: "center", padding: "10px 6px", borderRadius: 12, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", background: table ? grad : P.chip, color: table ? "#fff" : "#7a828e", boxShadow: table ? "0 4px 10px rgba(229,57,122,.28)" : "none" }}>
                <option value="">Table…</option>
                {tablesList.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <div onClick={() => setTable(null)} style={{ flex: 1, textAlign: "center", padding: "10px 0", borderRadius: 12, background: !table ? grad : P.chip, color: !table ? "#fff" : "#7a828e", fontSize: 13, fontWeight: 500, cursor: "pointer", boxShadow: !table ? "0 4px 10px rgba(229,57,122,.28)" : "none" }}>Takeaway</div>
            </div>
          </div>

          <div style={{ flex: 1, padding: "4px 17px", overflowY: "auto" }}>
            {ticket.length === 0 && <div style={{ color: P.muted2, textAlign: "center", marginTop: 48, fontSize: 14 }}>Tap items to build the order</div>}
            {ticket.map((l) => (
              <div key={l.key} style={{ padding: "14px 0", borderBottom: "1px solid #f4f5f7" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{l.item.name}</span>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{gbp(l.unit * l.qty)}</span>
                </div>
                {l.mods.length > 0 && <div style={{ fontSize: 12, color: "#8a5a2c", marginTop: 4 }}>+ {l.mods.map((m) => m.name).join(", ")}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 11 }}>
                  <span onClick={() => setQty(l.key, -1)} style={{ width: 32, height: 32, borderRadius: 10, background: P.chip, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#616976", cursor: "pointer", fontSize: 18, fontWeight: 500 }}>−</span>
                  <span style={{ fontWeight: 500, minWidth: 18, textAlign: "center", fontSize: 15 }}>{l.qty}</span>
                  <span onClick={() => setQty(l.key, 1)} style={{ width: 32, height: 32, borderRadius: 10, background: P.chip, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#616976", cursor: "pointer", fontSize: 18, fontWeight: 500 }}>+</span>
                  <span onClick={() => removeLine(l.key)} style={{ marginLeft: "auto", width: 32, height: 32, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#c94a4a", cursor: "pointer", fontSize: 16 }}>✕</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid " + P.line, padding: "16px 19px", background: "#fbfbfc" }}>
            {msg && <div style={{ fontSize: 13, textAlign: "center", marginBottom: 10, color: (msg.includes("fail") || msg.includes("Wrong")) ? "#c94a4a" : "#16a34a" }}>{msg}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#7a828e", marginBottom: 12 }}>
              <span>Subtotal</span><span>{gbp(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 15, paddingTop: 12, borderTop: "1px dashed #e2e4e8" }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>Total</span>
              <span style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-.6px" }}>{gbp(subtotal)}</span>
            </div>

            {!placed ? (
              <div style={{ display: "flex", gap: 9 }}>
                <div onClick={clearAll} style={{ width: 54, textAlign: "center", padding: "17px 0", borderRadius: 15, background: P.chip, color: "#616976", cursor: "pointer", fontSize: 15 }}>✕</div>
                <div onClick={sendOrder} style={{ flex: 1, textAlign: "center", padding: "17px 0", borderRadius: 15, background: ticket.length ? grad : "#d7dade", color: "#fff", fontWeight: 500, fontSize: 16, cursor: ticket.length ? "pointer" : "default", boxShadow: ticket.length ? "0 7px 18px rgba(229,57,122,.34)" : "none", opacity: sending ? .6 : 1 }}>{sending ? "Sending…" : "Send to kitchen"}</div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 9 }}>
                  {[["cash", "Cash"], ["card", "Card"]].map(([m, label]) => (
                    <div key={m} onClick={() => setPayMethod(m)} style={{ flex: 1, textAlign: "center", padding: "13px 0", borderRadius: 12, cursor: "pointer", fontWeight: 500, fontSize: 15, background: payMethod === m ? grad : P.chip, color: payMethod === m ? "#fff" : "#5f6774" }}>{label}</div>
                  ))}
                </div>
                <input type="text" inputMode="numeric" value={payPin} onChange={(e) => setPayPin(e.target.value.replace(/\D/g, ""))} placeholder="Staff PIN"
                  autoComplete="off" data-1p-ignore data-lpignore="true" readOnly onFocus={(e) => e.target.removeAttribute("readonly")}
                  style={{ width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 18, letterSpacing: 5, padding: "12px 0", borderRadius: 12, border: "1px solid " + P.line, background: "#fff", color: P.ink, marginBottom: 9, WebkitTextSecurity: "disc", textSecurity: "disc", fontFamily: "inherit" }} />
                <div style={{ display: "flex", gap: 9 }}>
                  <div onClick={clearAll} style={{ padding: "15px 18px", textAlign: "center", borderRadius: 14, background: P.chip, color: "#616976", fontWeight: 500, cursor: "pointer", fontSize: 14 }}>New</div>
                  <div onClick={takePayment} style={{ flex: 1, textAlign: "center", padding: "15px 0", borderRadius: 14, background: (payMethod && payPin) ? "linear-gradient(140deg,#22c55e,#16a34a)" : "#d7dade", color: "#fff", fontWeight: 500, fontSize: 15, cursor: (payMethod && payPin) ? "pointer" : "default", opacity: payBusy ? .6 : 1 }}>{payBusy ? "…" : "Take payment"}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODIFIER POPUP */}
      {modItem && (
        <div onClick={() => setModItem(null)} style={{ position: "fixed", inset: 0, background: "rgba(18,21,28,.4)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 22, width: 420, maxWidth: "100%", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(18,21,28,.3)" }}>
            <div style={{ fontWeight: 500, fontSize: 19 }}>{modItem.name}</div>
            <div style={{ color: P.muted, fontSize: 13, marginBottom: 16 }}>{gbp(modItem.price)} · choose options</div>
            {(modItem.modifiers || []).map((g) => (
              <div key={g.id} style={{ marginBottom: 15 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: P.muted, marginBottom: 7 }}>{g.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(g.options || []).map((o) => {
                    const on = (modSel[g.id] || []).includes(o.id);
                    return (
                      <div key={o.id} onClick={() => setModSel((prev) => { const cur = prev[g.id] || []; const single = g.max === 1 || g.single; const next = on ? cur.filter((x) => x !== o.id) : (single ? [o.id] : [...cur, o.id]); return { ...prev, [g.id]: next }; })}
                        style={{ padding: "10px 14px", borderRadius: 11, cursor: "pointer", fontSize: 14, fontWeight: 500, background: on ? grad : P.chip, color: on ? "#fff" : P.ink }}>
                        {o.name}{Number(o.price_delta) ? " +" + gbp(o.price_delta) : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 9, marginTop: 10 }}>
              <div onClick={() => setModItem(null)} style={{ padding: "13px 18px", borderRadius: 13, background: P.chip, color: "#616976", fontWeight: 500, cursor: "pointer" }}>Cancel</div>
              <div onClick={confirmMods} style={{ flex: 1, textAlign: "center", padding: "13px 0", borderRadius: 13, background: grad, color: "#fff", fontWeight: 500, fontSize: 15, cursor: "pointer", boxShadow: "0 6px 16px rgba(229,57,122,.3)" }}>Add to order</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
