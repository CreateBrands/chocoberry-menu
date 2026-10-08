// Self-service kiosk (Sunmi K2, 1080x1920 portrait). Route: /kiosk
//
// Reads the store from the device licence (kind "kiosk"), loads the store's
// brand-scoped menu, and places orders through place-order with the device
// token. Pay at counter: order goes on hold with a numbered slip printed on
// the kiosk's own printer (Print Agent); the till lists it under "Kiosk ·
// awaiting payment" and the kitchen fires on payment. Pay here (card) arrives
// with Teya.
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getDevice, deviceToken } from "./device.js";
import { ingredientsFromDescription, cap1 } from "./ingredients.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY };
const gbp = (n) => "£" + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const IDLE_MS = 60000;      // idle before "Still there?"
const IDLE_GRACE_MS = 12000; // then back to attract

const THEMES = {
  chocoberry: { bg: "#F4E9DD", card: "#FBF6EC", ink: "#3A2E26", muted: "#6B5D4F", accent: "#844429", soft: "#EADFCB", line: "#E8DCC6" },
  tove: { bg: "#FFFBF2", card: "#FFFFFF", ink: "#1F2A24", muted: "#5F6B63", accent: "#344D42", soft: "#DCEBD8", line: "rgba(52,77,66,.14)" },
  still: { bg: "#F7F4EC", card: "#FFFFFF", ink: "#1D2B1F", muted: "#5B6B55", accent: "#5E7A4D", soft: "#E5EAD9", line: "#E2E6D6" },
};

async function loadSettings(loc) {
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/menu_app_settings?select=key,value", { headers: H, cache: "no-store" });
    const rows = r.ok ? await r.json() : [];
    const base = {}; const over = {};
    for (const row of rows) { if (row.key.endsWith(":" + loc)) over[row.key.slice(0, -(loc.length + 1))] = row.value; else if (!row.key.includes(":")) base[row.key] = row.value; }
    return { ...base, ...over };
  } catch { return {}; }
}

async function loadMenu(loc) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/store_menu_full", { method: "POST", headers: H, body: JSON.stringify({ loc }), cache: "no-store" });
  if (!r.ok) throw new Error("menu " + r.status);
  const rows = await r.json();
  const menus = new Map();
  for (const row of rows) {
    if (row.available === false || row.menu_open === false) continue;
    let m = menus.get(row.menu_id); if (!m) { m = { id: row.menu_id, name: row.menu_name, sort: row.menu_sort, cats: new Map() }; menus.set(row.menu_id, m); }
    let c = m.cats.get(row.category_id); if (!c) { c = { id: row.category_id, name: row.category_name, sort: row.category_sort, items: [] }; m.cats.set(row.category_id, c); }
    c.items.push({ id: row.item_id, name: row.item_name, desc: row.description, price: Number(row.price), image: row.image_url, tags: row.tags || [], contains: row.allergens_contains || [], may: row.allergens_may || [], modifiers: row.modifiers || [], menu: row.menu_name, category: row.category_name });
  }
  return [...menus.values()].sort((a, b) => a.sort - b.sort).map((m) => ({ ...m, cats: [...m.cats.values()].sort((a, b) => a.sort - b.sort) }));
}

const ALLERGENS = ["Nuts", "Peanuts", "Dairy", "Gluten", "Eggs", "Soya", "Sesame"];
const hasAllergen = (it, a) => [...(it.contains || []), ...(it.may || [])].some((x) => String(x).toLowerCase().includes(a.toLowerCase().replace("nuts", "nut")));

export default function Kiosk() {
  const dev = getDevice();
  const loc = (dev && dev.location_id) || new URLSearchParams(window.location.search).get("loc");
  const [settings, setSettings] = useState({});
  const [menus, setMenus] = useState(null);
  const [err, setErr] = useState("");
  const [screen, setScreen] = useState("attract"); // attract | browse | basket | checkout | done
  const [cat, setCat] = useState(null);            // active category id
  const [sheet, setSheet] = useState(null);        // item being customised
  const [bag, setBag] = useState([]);              // lines: { key, item, qty, mods:[option], note }
  const [avoid, setAvoid] = useState([]);          // allergen filters
  const [lowered, setLowered] = useState(false);   // accessibility: lower UI
  const [orderType, setOrderType] = useState(null);// dine_in | takeaway
  const [tableNo, setTableNo] = useState("");
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState(null);          // { order_no, total }
  const [idlePrompt, setIdlePrompt] = useState(false);
  const [staffTaps, setStaffTaps] = useState(0);
  const [staffPanel, setStaffPanel] = useState(false);
  const lastActivity = useRef(Date.now());

  const theme = THEMES[settings.theme] || THEMES.chocoberry;
  const brand = settings.brand_name || "Chocoberry";
  const logo = settings.brand_logo_url || settings.welcome_logo_url || "";
  const banner = settings.welcome_bg_url || settings.brand_banner_url || "";

  // ---- data ----
  useEffect(() => {
    if (!loc) { setErr("This kiosk isn't licensed yet. Activate it from Admin → Devices."); return; }
    let alive = true;
    const load = async () => {
      try { const [s, m] = await Promise.all([loadSettings(loc), loadMenu(loc)]); if (!alive) return; setSettings(s); setMenus(m); if (!cat && m.length && m[0].cats.length) setCat(m[0].cats[0].id); }
      catch (e) { if (alive) setErr("Can't load the menu: " + (e.message || e)); }
    };
    load();
    const id = setInterval(load, 5 * 60000);
    return () => { alive = false; clearInterval(id); };
  }, [loc]); // eslint-disable-line

  // ---- idle reset ----
  useEffect(() => {
    const bump = () => { lastActivity.current = Date.now(); if (idlePrompt) setIdlePrompt(false); };
    ["touchstart", "pointerdown", "keydown"].forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      if (screen === "attract" || screen === "done") return;
      const idle = Date.now() - lastActivity.current;
      if (idle > IDLE_MS + IDLE_GRACE_MS) reset();
      else if (idle > IDLE_MS && !idlePrompt) setIdlePrompt(true);
    }, 1000);
    return () => { clearInterval(t); ["touchstart", "pointerdown", "keydown"].forEach((e) => window.removeEventListener(e, bump)); };
  }, [screen, idlePrompt]); // eslint-disable-line

  // ---- self-update on new builds (same as the KDS) ----
  useEffect(() => {
    const mine = Array.from(document.querySelectorAll('script[type="module"]')).map((x) => x.getAttribute("src")).find((x) => x && x.includes("/assets/"));
    if (!mine) return;
    const id = setInterval(async () => {
      try { const r = await fetch("/index.html?u=" + Date.now(), { cache: "no-store" }); const html = await r.text(); const m = html.match(/src="(\/assets\/index-[^"]+\.js)"/); if (m && !mine.endsWith(m[1]) && screen === "attract") window.location.reload(); } catch {}
    }, 120000);
    return () => clearInterval(id);
  }, [screen]);

  function reset() { setBag([]); setSheet(null); setOrderType(null); setTableNo(""); setDone(null); setIdlePrompt(false); setAvoid([]); setScreen("attract"); setLowered(false); }

  const allItems = useMemo(() => (menus || []).flatMap((m) => m.cats.flatMap((c) => c.items)), [menus]);
  const activeCat = useMemo(() => (menus || []).flatMap((m) => m.cats).find((c) => c.id === cat) || null, [menus, cat]);
  const total = bag.reduce((s, l) => s + l.qty * (l.item.price + (l.mods || []).reduce((a, o) => a + Number(o.price_delta || 0), 0)), 0);
  const count = bag.reduce((s, l) => s + l.qty, 0);
  const blocked = (it) => avoid.some((a) => hasAllergen(it, a));

  // ---- upsell: drinks if the bag has none; desserts after food; else add-ons ----
  const upsell = useMemo(() => {
    if (!menus || !bag.length) return [];
    const inBag = new Set(bag.map((l) => l.item.id));
    const kind = (it) => /drink|beverage|coffee|latte|shake|juice|tea|matcha|cocoa/i.test(it.menu + " " + it.category) ? "drink" : /dessert|cake|waffle|crepe|cheesecake|tiramisu|ice/i.test(it.menu + " " + it.category) ? "dessert" : "food";
    const kinds = new Set(bag.map((l) => kind(l.item)));
    const want = !kinds.has("drink") ? "drink" : !kinds.has("dessert") && kinds.has("food") ? "dessert" : "dessert";
    return allItems.filter((it) => kind(it) === want && !inBag.has(it.id) && !blocked(it) && it.price <= 7).sort(() => 0.5 - Math.random()).slice(0, 4);
  }, [menus, bag, avoid]); // eslint-disable-line

  function addLine(item, mods, note, qty = 1) {
    setBag((b) => [...b, { key: Date.now() + Math.random(), item, mods, note, qty }]);
  }
  function setQty(key, qty) { setBag((b) => qty <= 0 ? b.filter((l) => l.key !== key) : b.map((l) => (l.key === key ? { ...l, qty } : l))); }

  async function placeOrder(payMode) {
    if (placing || !bag.length) return;
    setPlacing(true); setErr("");
    try {
      const payload = {
        location_id: loc,
        order_type: orderType === "dine_in" ? "dine_in" : "takeaway",
        tablet_no: "KIOSK " + ((dev && dev.key) || "1"),
        pickup_name: orderType === "dine_in" && tableNo ? "Table " + tableNo : null,
        customer_note: orderType === "dine_in" && tableNo ? "Table " + tableNo : null,
        device: deviceToken(),
        kiosk: true,
        hold: payMode === "counter", // pay at counter: kitchen fires when the till takes payment
        items: bag.map((l) => ({ item_id: l.item.id, qty: l.qty, modifiers: (l.mods || []).map((m) => m.id), note: l.note || null })),
      };
      const r = await fetch(SUPABASE_URL + "/functions/v1/place-order", { method: "POST", headers: H, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
      setDone({ order_no: j.order_no, total: j.total ?? total, payMode });
      setScreen("done");
      // Numbered slip from the kiosk's own printer.
      fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, device: deviceToken(), action: "kiosk_slip", data: { order_id: j.order_id, location_id: loc, pay_mode: payMode, table_no: tableNo || null } }) }).catch(() => {});
      setTimeout(() => { setScreen((s) => (s === "done" ? "attract" : s)); if (screen === "done") reset(); }, 25000);
    } catch (e) { setErr(e.message || "Could not place the order"); }
    finally { setPlacing(false); }
  }

  // ---- styles ----
  const F = (n) => n + "px";
  const S = {
    root: { position: "fixed", inset: 0, background: theme.bg, color: theme.ink, fontFamily: "'Hanken Grotesk','Poppins',system-ui,sans-serif", overflow: "hidden", userSelect: "none", WebkitUserSelect: "none" },
    btn: (primary) => ({ padding: "26px 40px", borderRadius: 24, fontSize: 30, fontWeight: 800, cursor: "pointer", textAlign: "center", background: primary ? theme.accent : theme.card, color: primary ? "#fff" : theme.ink, border: primary ? "none" : "2px solid " + theme.line }),
  };

  if (err && !menus) return <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center", padding: 60, textAlign: "center", fontSize: 28 }}>{err}</div>;
  if (!menus) return <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, color: theme.muted }}>Loading the menu…</div>;

  // Accessibility: lowered mode scales the whole UI into the bottom 55% of the screen.
  const lowerWrap = lowered ? { position: "absolute", left: 0, right: 0, bottom: 0, height: "55%", transformOrigin: "bottom center" } : { position: "absolute", inset: 0 };

  return (
    <div style={S.root}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;900&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap'); *{box-sizing:border-box} .ktile:active{transform:scale(.97)} .kbtn:active{transform:scale(.97)} ::-webkit-scrollbar{display:none} @keyframes kfade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>

      {/* Hidden staff corner: 5 taps */}
      <div onClick={() => { setStaffTaps((n) => { if (n + 1 >= 5) { setStaffPanel(true); return 0; } return n + 1; }); }} style={{ position: "absolute", top: 0, left: 0, width: 90, height: 90, zIndex: 50 }} />

      <div style={lowerWrap}>
        {/* ---------- ATTRACT ---------- */}
        {screen === "attract" && (
          <div onClick={() => { lastActivity.current = Date.now(); setScreen("browse"); }} style={{ position: "absolute", inset: 0, cursor: "pointer", background: banner ? `linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.55)), url(${banner}) center/cover` : theme.accent, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "0 80px 160px", textAlign: "center" }}>
            {logo && <img src={logo} alt="" style={{ width: 360, maxHeight: 220, objectFit: "contain", marginBottom: 40, filter: "drop-shadow(0 6px 20px rgba(0,0,0,.35))" }} />}
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 64, lineHeight: 1.1, textShadow: "0 4px 24px rgba(0,0,0,.4)" }}>{settings.welcome_subtitle || settings.brand_tagline || "Order here"}</div>
            <div style={{ marginTop: 60, padding: "30px 80px", borderRadius: 999, background: "#fff", color: theme.accent, fontWeight: 900, fontSize: 40, fontFamily: "'Poppins',sans-serif", boxShadow: "0 20px 60px rgba(0,0,0,.35)", animation: "kfade 1.2s ease infinite alternate" }}>Tap to start</div>
            <div style={{ marginTop: 28, fontSize: 22, opacity: .85 }}>Pay at the counter · Allergen filters available</div>
          </div>
        )}

        {/* ---------- BROWSE ---------- */}
        {(screen === "browse" || screen === "basket" || screen === "checkout") && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "26px 36px 18px", flexShrink: 0 }}>
              {logo ? <img src={logo} alt="" style={{ height: 64, width: "auto" }} /> : <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 40, color: theme.accent }}>{brand}</div>}
              <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
                {ALLERGENS.map((a) => <span key={a} className="kbtn" onClick={() => setAvoid((v) => (v.includes(a) ? v.filter((x) => x !== a) : [...v, a]))} style={{ padding: "14px 20px", borderRadius: 999, fontSize: 20, fontWeight: 800, cursor: "pointer", background: avoid.includes(a) ? "#b4462f" : theme.card, color: avoid.includes(a) ? "#fff" : theme.muted, border: "2px solid " + (avoid.includes(a) ? "#b4462f" : theme.line) }}>{avoid.includes(a) ? "No " + a : a}</span>)}
              </div>
            </div>
            {avoid.length > 0 && <div style={{ padding: "0 36px 12px", fontSize: 20, color: "#b4462f", fontWeight: 700 }}>Items that contain or may contain {avoid.join(", ").toLowerCase()} are greyed out.</div>}

            <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
              {/* rail */}
              <div style={{ width: 250, overflowY: "auto", padding: "0 0 140px 20px", flexShrink: 0 }}>
                {menus.map((m) => (
                  <div key={m.id} style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: theme.muted, letterSpacing: ".08em", textTransform: "uppercase", padding: "10px 12px 6px" }}>{m.name}</div>
                    {m.cats.map((c) => (
                      <div key={c.id} className="kbtn" onClick={() => { setCat(c.id); setScreen("browse"); }} style={{ padding: "18px 14px", borderRadius: 16, marginBottom: 6, fontSize: 22, fontWeight: 700, cursor: "pointer", background: cat === c.id && screen === "browse" ? theme.accent : "transparent", color: cat === c.id && screen === "browse" ? "#fff" : theme.ink, lineHeight: 1.2 }}>{c.name}</div>
                    ))}
                  </div>
                ))}
              </div>
              {/* tiles */}
              <div style={{ flex: 1, overflowY: "auto", padding: "0 36px 160px 24px" }}>
                {activeCat && <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 36, margin: "6px 0 18px" }}>{activeCat.name}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
                  {(activeCat ? activeCat.items : []).map((it) => {
                    const off = blocked(it);
                    return (
                      <div key={it.id} className="ktile" onClick={() => { if (off) return; setSheet({ item: it, mods: {}, none: [], extra: [], qty: 1 }); }} style={{ background: theme.card, borderRadius: 26, overflow: "hidden", cursor: off ? "default" : "pointer", opacity: off ? .35 : 1, border: "1px solid " + theme.line, transition: "transform .1s", display: "flex", flexDirection: "column", animation: "kfade .25s ease" }}>
                        <div style={{ height: 280, background: it.image ? `url(${it.image}) center/cover` : theme.soft }} />
                        <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                          <div style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.15 }}>{it.name}</div>
                          {it.desc && <div style={{ fontSize: 18, color: theme.muted, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{String(it.desc).replace(/\s*\|\s*/g, " · ")}</div>}
                          <div style={{ display: "flex", alignItems: "center", marginTop: "auto" }}>
                            <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 28 }}>{gbp(it.price)}</span>
                            <span style={{ marginLeft: "auto", width: 62, height: 62, borderRadius: "50%", background: theme.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 900 }}>+</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* bottom bar */}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "22px 36px 30px", background: "linear-gradient(180deg, rgba(255,255,255,0), " + theme.bg + " 35%)", display: "flex", gap: 16, alignItems: "center" }}>
              <span className="kbtn" onClick={() => setLowered((v) => !v)} style={{ ...S.btn(false), padding: "22px 26px", fontSize: 22 }}>{lowered ? "⬆ Raise screen" : "♿ Lower screen"}</span>
              <span className="kbtn" onClick={reset} style={{ ...S.btn(false), padding: "22px 26px", fontSize: 22 }}>Start over</span>
              <span className="kbtn" onClick={() => { if (count) setScreen("basket"); }} style={{ ...S.btn(true), flex: 1, opacity: count ? 1 : .45, display: "flex", justifyContent: "space-between" }}><span>{count ? `View order · ${count} item${count === 1 ? "" : "s"}` : "Your order is empty"}</span><span>{gbp(total)}</span></span>
            </div>
          </div>
        )}

        {/* ---------- ITEM SHEET ---------- */}
        {sheet && (() => {
          const it = sheet.item;
          const comps = ingredientsFromDescription(it.desc, it.name);
          const groups = it.modifiers || [];
          const chosen = (g) => sheet.mods[g.id] || [];
          const toggle = (g, o) => {
            const cur = chosen(g); const max = Number(g.max_select || 1);
            let next;
            if (cur.some((x) => x.id === o.id)) next = cur.filter((x) => x.id !== o.id);
            else next = max <= 1 ? [o] : (cur.length < max ? [...cur, o] : cur);
            setSheet({ ...sheet, mods: { ...sheet.mods, [g.id]: next } });
          };
          const missing = groups.filter((g) => (g.required || Number(g.min_select || 0) > 0) && chosen(g).length < Math.max(1, Number(g.min_select || 1)));
          const mods = groups.flatMap((g) => chosen(g));
          const unit = it.price + mods.reduce((a, o) => a + Number(o.price_delta || 0), 0);
          const note = [...sheet.none.map((c) => "No " + c), ...sheet.extra.map((c) => "Extra " + c)].join(", ");
          const cmp = (c) => ({ s: sheet.none.includes(c) ? "none" : sheet.extra.includes(c) ? "extra" : "" });
          return (
            <div onClick={() => setSheet(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 20, display: "flex", alignItems: "flex-end" }}>
              <div onClick={(e) => e.stopPropagation()} style={{ background: theme.bg, borderRadius: "36px 36px 0 0", width: "100%", maxHeight: "88%", display: "flex", flexDirection: "column", animation: "kfade .2s ease" }}>
                <div style={{ overflowY: "auto", padding: "0 0 20px" }}>
                  <div style={{ height: 420, background: it.image ? `url(${it.image}) center/cover` : theme.soft, borderRadius: "36px 36px 0 0", position: "relative" }}>
                    <span onClick={() => setSheet(null)} style={{ position: "absolute", top: 22, right: 22, width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,.9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900, cursor: "pointer" }}>✕</span>
                  </div>
                  <div style={{ padding: "26px 40px 0" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 40, lineHeight: 1.1 }}>{it.name}</div><div style={{ marginLeft: "auto", fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 32 }}>{gbp(it.price)}</div></div>
                    {it.desc && <div style={{ fontSize: 22, color: theme.muted, marginTop: 10, lineHeight: 1.4 }}>{String(it.desc).replace(/\s*\|\s*/g, " · ")}</div>}
                    {(it.contains.length > 0 || it.may.length > 0) && <div style={{ marginTop: 14, fontSize: 19, color: "#b4462f", fontWeight: 700 }}>{it.contains.length ? "Contains: " + it.contains.join(", ") : ""}{it.contains.length && it.may.length ? " · " : ""}{it.may.length ? "May contain: " + it.may.join(", ") : ""}</div>}

                    {groups.map((g) => (
                      <div key={g.id} style={{ marginTop: 28 }}>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{g.name} <span style={{ color: theme.muted, fontWeight: 600, fontSize: 18 }}>{g.required || Number(g.min_select || 0) > 0 ? "· required" : "· optional"}{Number(g.max_select || 1) > 1 ? ` · up to ${g.max_select}` : ""}</span></div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                          {(g.options || []).map((o) => { const on = chosen(g).some((x) => x.id === o.id); return <span key={o.id} className="kbtn" onClick={() => toggle(g, o)} style={{ padding: "18px 24px", borderRadius: 999, fontSize: 22, fontWeight: 700, cursor: "pointer", background: on ? theme.accent : theme.card, color: on ? "#fff" : theme.ink, border: "2px solid " + (on ? theme.accent : theme.line) }}>{o.name}{Number(o.price_delta) ? " +" + gbp(o.price_delta) : ""}</span>; })}
                        </div>
                      </div>
                    ))}

                    {comps.length > 0 && (
                      <div style={{ marginTop: 28 }}>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>Make it yours <span style={{ color: theme.muted, fontWeight: 600, fontSize: 18 }}>· tap once for none, twice for extra</span></div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                          {comps.map((c) => { const st = cmp(c).s; return <span key={c} className="kbtn" onClick={() => setSheet({ ...sheet, none: st === "" ? [...sheet.none, c] : sheet.none.filter((x) => x !== c), extra: st === "none" ? [...sheet.extra, c] : sheet.extra.filter((x) => x !== c) })} style={{ padding: "18px 24px", borderRadius: 999, fontSize: 22, fontWeight: 700, cursor: "pointer", background: st === "none" ? "#fbecea" : st === "extra" ? "#e6f1dd" : theme.card, color: st === "none" ? "#b4462f" : st === "extra" ? "#2f6b4f" : theme.ink, border: "2px solid " + (st ? "transparent" : theme.line), textDecoration: st === "none" ? "line-through" : "none" }}>{st === "extra" ? "Extra " : ""}{cap1(c)}</span>; })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ padding: "20px 40px 36px", borderTop: "1px solid " + theme.line, display: "flex", gap: 16, alignItems: "center", background: theme.bg }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 0, background: theme.card, borderRadius: 999, border: "2px solid " + theme.line }}>
                    <span className="kbtn" onClick={() => setSheet({ ...sheet, qty: Math.max(1, sheet.qty - 1) })} style={{ width: 76, height: 76, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 900, cursor: "pointer" }}>−</span>
                    <span style={{ width: 60, textAlign: "center", fontSize: 30, fontWeight: 900 }}>{sheet.qty}</span>
                    <span className="kbtn" onClick={() => setSheet({ ...sheet, qty: Math.min(20, sheet.qty + 1) })} style={{ width: 76, height: 76, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 900, cursor: "pointer" }}>+</span>
                  </div>
                  <span className="kbtn" onClick={() => { if (missing.length) return; addLine(it, mods, note, sheet.qty); setSheet(null); }} style={{ ...S.btn(true), flex: 1, opacity: missing.length ? .5 : 1, display: "flex", justifyContent: "space-between" }}><span>{missing.length ? "Choose " + missing[0].name.toLowerCase() : "Add to order"}</span><span>{gbp(unit * sheet.qty)}</span></span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ---------- BASKET ---------- */}
        {screen === "basket" && (
          <div style={{ position: "absolute", inset: 0, background: theme.bg, zIndex: 15, display: "flex", flexDirection: "column", animation: "kfade .2s ease" }}>
            <div style={{ padding: "30px 40px 10px", display: "flex", alignItems: "center", gap: 18 }}><span className="kbtn" onClick={() => setScreen("browse")} style={{ ...S.btn(false), padding: "18px 26px", fontSize: 24 }}>‹ Back to menu</span><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 40, marginLeft: 8 }}>Your order</div></div>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 40px 200px" }}>
              {bag.map((l) => (
                <div key={l.key} style={{ display: "flex", gap: 20, alignItems: "center", background: theme.card, borderRadius: 24, padding: 18, marginBottom: 14, border: "1px solid " + theme.line }}>
                  <div style={{ width: 120, height: 120, borderRadius: 18, background: l.item.image ? `url(${l.item.image}) center/cover` : theme.soft, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 27, fontWeight: 800 }}>{l.item.name}</div>
                    {(l.mods.length > 0 || l.note) && <div style={{ fontSize: 19, color: theme.muted, marginTop: 4 }}>{[...l.mods.map((m) => m.name), l.note].filter(Boolean).join(" · ")}</div>}
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 24, marginTop: 6 }}>{gbp(l.qty * (l.item.price + l.mods.reduce((a, o) => a + Number(o.price_delta || 0), 0)))}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", background: theme.bg, borderRadius: 999, border: "2px solid " + theme.line }}>
                    <span className="kbtn" onClick={() => setQty(l.key, l.qty - 1)} style={{ width: 70, height: 70, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, cursor: "pointer" }}>{l.qty === 1 ? "🗑" : "−"}</span>
                    <span style={{ width: 52, textAlign: "center", fontSize: 28, fontWeight: 900 }}>{l.qty}</span>
                    <span className="kbtn" onClick={() => setQty(l.key, l.qty + 1)} style={{ width: 70, height: 70, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, cursor: "pointer" }}>+</span>
                  </div>
                </div>
              ))}
              {bag.length === 0 && <div style={{ padding: 60, textAlign: "center", color: theme.muted, fontSize: 26 }}>Nothing yet — add something from the menu.</div>}
              {upsell.length > 0 && (
                <div style={{ marginTop: 30 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 14 }}>Goes well with it</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                    {upsell.map((it) => (
                      <div key={it.id} className="ktile" onClick={() => setSheet({ item: it, mods: {}, none: [], extra: [], qty: 1 })} style={{ background: theme.card, borderRadius: 20, overflow: "hidden", border: "1px solid " + theme.line, cursor: "pointer" }}>
                        <div style={{ height: 150, background: it.image ? `url(${it.image}) center/cover` : theme.soft }} />
                        <div style={{ padding: "12px 14px" }}><div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15 }}>{it.name}</div><div style={{ fontSize: 19, fontWeight: 800, color: theme.accent, marginTop: 4 }}>+ {gbp(it.price)}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "22px 40px 34px", background: theme.bg, borderTop: "1px solid " + theme.line }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 36, marginBottom: 18 }}><span>Total</span><span>{gbp(total)}</span></div>
              <span className="kbtn" onClick={() => { if (bag.length) setScreen("checkout"); }} style={{ ...S.btn(true), display: "block", opacity: bag.length ? 1 : .5 }}>Checkout</span>
            </div>
          </div>
        )}

        {/* ---------- CHECKOUT ---------- */}
        {screen === "checkout" && (
          <div style={{ position: "absolute", inset: 0, background: theme.bg, zIndex: 16, display: "flex", flexDirection: "column", padding: "30px 40px", animation: "kfade .2s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}><span className="kbtn" onClick={() => setScreen("basket")} style={{ ...S.btn(false), padding: "18px 26px", fontSize: 24 }}>‹ Back</span><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 40, marginLeft: 8 }}>Almost there</div></div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 40 }}>Where will you be?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 16 }}>
              {[["dine_in", "🍽", "Eat in"], ["takeaway", "🥡", "Take away"]].map(([v, ic, l]) => <span key={v} className="kbtn" onClick={() => setOrderType(v)} style={{ padding: "40px 20px", borderRadius: 28, textAlign: "center", cursor: "pointer", background: orderType === v ? theme.accent : theme.card, color: orderType === v ? "#fff" : theme.ink, border: "2px solid " + (orderType === v ? theme.accent : theme.line), fontSize: 30, fontWeight: 900 }}><div style={{ fontSize: 54, marginBottom: 8 }}>{ic}</div>{l}</span>)}
            </div>
            {orderType === "dine_in" && (
              <div style={{ marginTop: 34 }}>
                <div style={{ fontSize: 26, fontWeight: 800 }}>Table number <span style={{ color: theme.muted, fontWeight: 600, fontSize: 20 }}>· from the number on your table, or skip</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14 }}>
                  <div style={{ flex: 1, padding: "22px 26px", borderRadius: 22, background: theme.card, border: "2px solid " + theme.line, fontSize: 40, fontWeight: 900, minHeight: 92 }}>{tableNo || <span style={{ color: theme.muted, fontWeight: 600, fontSize: 26 }}>Tap the numbers</span>}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginTop: 14 }}>
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "⌫", "Clear"].map((k) => <span key={k} className="kbtn" onClick={() => setTableNo((t) => (k === "⌫" ? t.slice(0, -1) : k === "Clear" ? "" : (t + k).slice(0, 3)))} style={{ padding: "22px 0", textAlign: "center", borderRadius: 18, background: theme.card, border: "2px solid " + theme.line, fontSize: 30, fontWeight: 900, cursor: "pointer" }}>{k}</span>)}
                </div>
              </div>
            )}
            <div style={{ marginTop: "auto" }}>
              {err && <div style={{ color: "#b4462f", fontWeight: 800, fontSize: 22, marginBottom: 14 }}>{err}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 36, marginBottom: 18 }}><span>Total</span><span>{gbp(total)}</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <span className="kbtn" onClick={() => { if (orderType && !placing) placeOrder("counter"); }} style={{ ...S.btn(true), opacity: orderType && !placing ? 1 : .5 }}>{placing ? "Placing…" : "Pay at the counter"}</span>
                <span className="kbtn" style={{ ...S.btn(false), opacity: .45 }}>Pay here by card<div style={{ fontSize: 18, fontWeight: 600, color: theme.muted }}>coming soon</div></span>
              </div>
            </div>
          </div>
        )}

        {/* ---------- DONE ---------- */}
        {screen === "done" && done && (
          <div onClick={reset} style={{ position: "absolute", inset: 0, background: theme.accent, color: "#fff", zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 60, animation: "kfade .3s ease" }}>
            <div style={{ fontSize: 34, fontWeight: 700, opacity: .9 }}>Your order number</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 220, lineHeight: 1, margin: "10px 0 20px" }}>{done.order_no}</div>
            <div style={{ fontSize: 40, fontWeight: 800 }}>{done.payMode === "counter" ? "Please pay at the counter" : "Thank you"}</div>
            <div style={{ fontSize: 26, marginTop: 14, opacity: .9 }}>{done.payMode === "counter" ? "Show your number — " + gbp(done.total) + " to pay. We'll get started as soon as it's paid." : "We've started on it."}{orderType === "dine_in" && tableNo ? " Table " + tableNo + "." : ""}</div>
            <div style={{ marginTop: 60, padding: "26px 70px", borderRadius: 999, background: "#fff", color: theme.accent, fontWeight: 900, fontSize: 30 }}>Done</div>
          </div>
        )}
      </div>

      {/* idle prompt */}
      {idlePrompt && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: theme.bg, borderRadius: 36, padding: "50px 60px", textAlign: "center", width: 720 }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 44 }}>Still there?</div>
            <div style={{ fontSize: 24, color: theme.muted, marginTop: 12 }}>Your order will be cleared in a few seconds.</div>
            <div style={{ display: "flex", gap: 16, marginTop: 36 }}>
              <span className="kbtn" onClick={reset} style={{ ...S.btn(false), flex: 1 }}>Start over</span>
              <span className="kbtn" onClick={() => { lastActivity.current = Date.now(); setIdlePrompt(false); }} style={{ ...S.btn(true), flex: 1 }}>Keep ordering</span>
            </div>
          </div>
        </div>
      )}

      {/* staff panel */}
      {staffPanel && (
        <div onClick={() => setStaffPanel(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: "#111", borderRadius: 28, padding: 40, width: 640 }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 900, fontSize: 30 }}>Kiosk · staff</div>
            <div style={{ fontSize: 18, color: "#666", marginTop: 6 }}>{brand} · {dev ? dev.label || dev.key : "unlicensed"} · {menus.reduce((n, m) => n + m.cats.reduce((k, c) => k + c.items.length, 0), 0)} items</div>
            <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
              <span className="kbtn" onClick={() => window.location.reload()} style={{ ...S.btn(false), fontSize: 24, padding: 20 }}>Reload kiosk</span>
              <span className="kbtn" onClick={() => { fetch(SUPABASE_URL + "/functions/v1/admin-api", { method: "POST", headers: H, body: JSON.stringify({ pos: true, device: deviceToken(), action: "kiosk_slip", data: { location_id: loc, test: true } }) }); setStaffPanel(false); }} style={{ ...S.btn(false), fontSize: 24, padding: 20 }}>Test slip on this kiosk's printer</span>
              <span className="kbtn" onClick={() => setStaffPanel(false)} style={{ ...S.btn(true), fontSize: 24, padding: 20 }}>Close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
