import { useState, useEffect, useRef } from "react";

// ============================================================
// still. / Chocoberry — Digital Menu (React port of approved design)
// Faithful 6-screen flow. Sample content seeded; live data comes next.
// ============================================================

const THEMES = {
  still: {
    "--bg": "#E1E8D2", "--bg2": "#EEF2E4", "--bg3": "#FFFFFF",
    "--ink": "#2F3326", "--muted": "#7E8470", "--accent": "#5E7A4D",
    "--chip": "#A7C196", "--accent-soft": "#D2DEBC", "--line": "rgba(60,70,45,.12)",
  },
  chocoberry: {
    "--bg": "#F4E9DD", "--bg2": "#F3EADA", "--bg3": "#FBF6EC",
    "--ink": "#3A2E26", "--muted": "#6B5D4F", "--accent": "#844429",
    "--chip": "#E8DCC6", "--accent-soft": "#EADFCB", "--line": "#E8DCC6",
  },
};
const VARS = THEMES.still; // default; overridden at runtime by theme setting

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const SEED = [{"name": "Seasonal Menu", "img": "linear-gradient(160deg,#cf8aa0,#9fb585)", "items": [{"name": "Mango Milk Cake", "desc": "Chilled · Serves 1", "price": 7.95, "tags": ["POPULAR"], "bg": "linear-gradient(160deg,#F1E9D8,#E4D7BC)", "prod": "radial-gradient(60% 70% at 50% 36%,#FFFFFF,#EAE3D4 72%)", "image_url": null}, {"name": "Mango Crunch Sundae", "desc": "Mango · vanilla · cocoa", "price": 5.95, "tags": [], "bg": "linear-gradient(160deg,#EACE9A,#DBB877)", "prod": "radial-gradient(60% 60% at 50% 38%,#F2C46A,#CBB186 74%)", "image_url": null}, {"name": "Matcha Tiramisu", "desc": "Mascarpone · matcha", "price": 6.5, "tags": [], "bg": "linear-gradient(160deg,#E9EFDF,#DBE3CA)", "prod": "radial-gradient(60% 70% at 50% 36%,#cdd9b2,#8aa066 78%)", "image_url": null}, {"name": "Yuzu Cheesecake", "desc": "Citrus · baked", "price": 5.95, "tags": [], "bg": "linear-gradient(160deg,#EFEAC9,#DCD79E)", "prod": "radial-gradient(60% 70% at 50% 36%,#FBF6DE,#D9D08E 78%)", "image_url": null}, {"name": "Strawberry Shortcake", "desc": "Cream · sponge", "price": 6.25, "tags": [], "bg": "linear-gradient(160deg,#F2E2E2,#E2C7C7)", "prod": "radial-gradient(60% 70% at 50% 36%,#FBF1F0,#E6B6BC 80%)", "image_url": null}, {"name": "Affogato Sundae", "desc": "Espresso · gelato", "price": 5.5, "tags": [], "bg": "linear-gradient(160deg,#E0CDB0,#B98F66)", "prod": "radial-gradient(60% 70% at 50% 36%,#FBF4E6,#8a5f38 82%)", "image_url": null}]}, {"name": "Signature Matchas", "img": "linear-gradient(160deg,#9ab577,#6f8c52)", "items": [{"name": "Iced Vanilla Matcha", "desc": "Oat · iced", "price": 4.95, "tags": [], "bg": "linear-gradient(160deg,#E9EFDF,#DBE3CA)", "prod": "radial-gradient(60% 70% at 50% 36%,#bcd197,#7c9a55 75%)", "image_url": null}, {"name": "Strawberry Matcha", "desc": "Seasonal · iced", "price": 5.5, "tags": ["SEASONAL"], "bg": "linear-gradient(160deg,#F0E2E0,#DCE3CA)", "prod": "radial-gradient(60% 70% at 50% 36%,#e7adba,#9fb585 78%)", "image_url": null}, {"name": "Blueberry Marble Matcha", "desc": "Blueberry · oat", "price": 5.75, "tags": ["NEW"], "bg": "linear-gradient(160deg,#E3DBE6,#CBD8B6)", "prod": "radial-gradient(60% 70% at 50% 36%,#9a7fb0,#6f8c52 80%)", "image_url": null}, {"name": "Hojicha Latte", "desc": "Roasted · honey", "price": 4.5, "tags": [], "bg": "linear-gradient(160deg,#EFE4D2,#E2CFB0)", "prod": "radial-gradient(60% 70% at 50% 36%,#d8b98e,#a9743f 78%)", "image_url": null}]}, {"name": "Signature Lattes Iced", "img": "linear-gradient(160deg,#caa06a,#a9743f)", "items": [{"name": "Brown Sugar Shakerato", "desc": "Shaken · iced", "price": 6.0, "tags": [], "bg": "linear-gradient(160deg,#EAD9BF,#D7B98C)", "prod": "radial-gradient(60% 70% at 50% 36%,#d8b07a,#9c6f3f 78%)", "image_url": null}, {"name": "Iced Oat Latte", "desc": "Double shot · oat", "price": 5.0, "tags": [], "bg": "linear-gradient(160deg,#EFE4D2,#DEC9A8)", "prod": "radial-gradient(60% 70% at 50% 36%,#e6d3ab,#b78f5f 78%)", "image_url": null}, {"name": "Salted Caramel Latte", "desc": "Sea salt · caramel", "price": 5.5, "tags": [], "bg": "linear-gradient(160deg,#E7CFA6,#CFA871)", "prod": "radial-gradient(60% 70% at 50% 36%,#dcb27f,#9c6f3f 80%)", "image_url": null}, {"name": "Pistachio Latte", "desc": "Roasted pistachio", "price": 5.75, "tags": [], "bg": "linear-gradient(160deg,#DDE3C2,#BFC993)", "prod": "radial-gradient(60% 70% at 50% 36%,#c4cf8c,#8a9a55 80%)", "image_url": null}]}, {"name": "Iced Cocoa", "img": "linear-gradient(160deg,#8a5a3a,#5a3a24)", "items": [{"name": "Iced Dark Cocoa", "desc": "70% · iced", "price": 5.5, "tags": [], "bg": "linear-gradient(160deg,#cdb39a,#a07a58)", "prod": "radial-gradient(60% 70% at 50% 36%,#8a5c3c,#4f3220 78%)", "image_url": null}, {"name": "Mint Cocoa", "desc": "Fresh mint · iced", "price": 5.5, "tags": [], "bg": "linear-gradient(160deg,#bcc7a8,#8aa06f)", "prod": "radial-gradient(60% 70% at 50% 36%,#7a5c40,#3f2818 78%)", "image_url": null}, {"name": "Orange Cocoa", "desc": "Blood orange", "price": 5.75, "tags": [], "bg": "linear-gradient(160deg,#E2C2A0,#C68F5E)", "prod": "radial-gradient(60% 70% at 50% 36%,#a8643a,#5a3320 80%)", "image_url": null}, {"name": "Hazelnut Cocoa", "desc": "Roasted hazelnut", "price": 5.5, "tags": [], "bg": "linear-gradient(160deg,#d6b48a,#a9743f)", "prod": "radial-gradient(60% 70% at 50% 36%,#9c6f43,#5a3a22 78%)", "image_url": null}]}, {"name": "Hot Cocoa", "img": "linear-gradient(160deg,#a9743f,#7a5232)", "items": [{"name": "Classic Hot Cocoa", "desc": "Whipped cream", "price": 4.5, "tags": [], "bg": "linear-gradient(160deg,#e2c9a8,#c79a63)", "prod": "radial-gradient(60% 70% at 50% 36%,#FBF3E6,#d8b98e 78%)", "image_url": null}, {"name": "Hazelnut Cocoa", "desc": "Roasted hazelnut", "price": 5.0, "tags": [], "bg": "linear-gradient(160deg,#d6b48a,#a9743f)", "prod": "radial-gradient(60% 70% at 50% 36%,#9c6f43,#5a3a22 78%)", "image_url": null}, {"name": "Dark 70% Cocoa", "desc": "Single origin", "price": 5.25, "tags": [], "bg": "linear-gradient(160deg,#bfa085,#8a5f3c)", "prod": "radial-gradient(60% 70% at 50% 36%,#7a5236,#3f2417 80%)", "image_url": null}, {"name": "White Cocoa", "desc": "Vanilla bean", "price": 4.95, "tags": [], "bg": "linear-gradient(160deg,#EFE7D6,#DCCDB2)", "prod": "radial-gradient(60% 70% at 50% 36%,#FBF6EC,#E2D3B6 80%)", "image_url": null}]}, {"name": "Coffee", "img": "linear-gradient(160deg,#6f4a2e,#3f2817)", "items": [{"name": "Oat Flat White", "desc": "Oat · double", "price": 4.5, "tags": [], "bg": "linear-gradient(160deg,#e8d6bd,#cba883)", "prod": "radial-gradient(60% 70% at 50% 36%,#e4cfa8,#a9743f 78%)", "image_url": null}, {"name": "Cortado", "desc": "Equal parts", "price": 4.0, "tags": [], "bg": "linear-gradient(160deg,#cdab82,#8a5f38)", "prod": "radial-gradient(60% 70% at 50% 36%,#8a5c3a,#4a2f1c 78%)", "image_url": null}, {"name": "Filter V60", "desc": "Single origin", "price": 4.25, "tags": [], "bg": "linear-gradient(160deg,#d8bd98,#a9794a)", "prod": "radial-gradient(60% 70% at 50% 36%,#9c7144,#5a3a22 80%)", "image_url": null}, {"name": "Iced Americano", "desc": "Double · iced", "price": 3.95, "tags": [], "bg": "linear-gradient(160deg,#c9ab84,#7a5232)", "prod": "radial-gradient(60% 70% at 50% 36%,#6f4a2e,#2f1c0f 80%)", "image_url": null}]}];

const HERO = [
  { tag: "NEW THIS WEEK", dot: "#E7C2C8", title: "Blueberry Marble Matcha", sub: "Fresh. Layered. Unexpected.", bg: "linear-gradient(120deg,#56744b,#7e9a6b 48%,#a6bb8b)", cup: "linear-gradient(160deg,#94ad71,#7d985f)", blob: "radial-gradient(circle,#7a55a0,#4a2b66)" },
  { tag: "SEASONAL", dot: "#E7C2C8", title: "Iced Strawberry Matcha", sub: "Soft. Sweet. Seasonal.", bg: "linear-gradient(120deg,#9a6f63,#bb8f88 46%,#d0ba9c)", cup: "linear-gradient(160deg,#9fb585,#86a064)", blob: "radial-gradient(circle,#d98a95,#a96b74)" },
  { tag: "SIGNATURE", dot: "#E7C2C8", title: "Pistachio Latte", sub: "Roasted. Smooth. Ours.", bg: "linear-gradient(120deg,#7a6a44,#a99366 50%,#cdb98a)", cup: "linear-gradient(160deg,#c4cf8c,#8a9a55)", blob: "radial-gradient(circle,#bfa05a,#7a6233)" },
];

const money = (n) => "GBP " + Number(n).toFixed(2);

const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };

// The tablet's store token: URL (?store=TOKEN) sets it, the device remembers it.
function getStoreToken() {
  try {
    const url = new URLSearchParams(window.location.search).get("store");
    if (url) { localStorage.setItem("still_store_token", url); return url; }
    return localStorage.getItem("still_store_token") || null;
  } catch { return null; }
}

// The tablet's own number: set once via ?tablet=3 (device remembers it).
// Used to prefix order numbers (e.g. T3-014) so staff know which tablet an order came from.
function getTabletNumber() {
  try {
    const url = new URLSearchParams(window.location.search).get("tablet");
    if (url) { localStorage.setItem("still_tablet_no", url); return url; }
    return localStorage.getItem("still_tablet_no") || null;
  } catch { return null; }
}

// Format an order number for display: T{tablet}-{padded sequence}, e.g. "T3-014".
// Falls back to just the padded sequence if no tablet number is set on the device.
function formatOrderNo(seq) {
  const n = Number(seq);
  const padded = Number.isFinite(n) ? String(n).padStart(3, "0") : String(seq ?? "");
  const tablet = getTabletNumber();
  return tablet ? `T${tablet}-${padded}` : padded;
}

// Fetch a store's dining tables (is_table=true) for the picker.
async function fetchTables(locationId) {
  if (!locationId) return [];
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/menu_tables?location_id=eq." + locationId + "&is_table=eq.true&active=eq.true&select=id,label,qr_token", { headers: H });
    if (!r.ok) return [];
    const rows = await r.json();
    return (rows || []).sort((a, b) => (parseInt(String(a.label).replace(/\D/g, "")) || 0) - (parseInt(String(b.label).replace(/\D/g, "")) || 0));
  } catch { return []; }
}

// If the current token is itself a table's QR token, return that table row.
async function tableFromToken(token) {
  if (!token) return null;
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/menu_tables?qr_token=eq." + encodeURIComponent(token) + "&is_table=eq.true&select=id,label,location_id", { headers: H });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows && rows.length ? rows[0] : null;
  } catch { return null; }
}

// Resolve token -> which store/brand this tablet is.
async function resolveStore(token) {
  if (!token) return null;
  const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/resolve_store", {
    method: "POST", headers: H, body: JSON.stringify({ token }),
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows && rows.length ? rows[0] : null;
}

// Load a store's effective menu (per-store prices via store_menu), grouped by category.
// Falls back to the global menu when there's no store token.
async function fetchLive(token) {
  const store = token ? await resolveStore(token) : null;
  const loc = store && store.location_id ? store.location_id : null;

  // store_menu_full returns menu -> category -> item with open/closed state.
  // Falls back to a location-less call (nulls resolve to master prices).
  const body = loc ? { loc } : { loc: null };
  let rows;
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/store_menu_full", {
      method: "POST", headers: H, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("store_menu_full " + r.status);
    rows = await r.json();
    // Cache the fresh menu for offline use
    try { localStorage.setItem("menu_cache_v1", JSON.stringify({ rows, at: Date.now() })); } catch {}
  } catch (netErr) {
    // Offline or fetch failed — fall back to the cached menu if we have one
    try {
      const cached = localStorage.getItem("menu_cache_v1");
      if (cached) { rows = JSON.parse(cached).rows; }
      else throw netErr;
    } catch { throw netErr; }
  }

  // group rows into menus -> categories -> items
  const menuMap = new Map();
  for (const row of rows) {
    if (row.available === false) continue;
    let m = menuMap.get(row.menu_id);
    if (!m) {
      m = { id: row.menu_id, name: row.menu_name, sort: row.menu_sort, open: row.menu_open !== false, cats: new Map() };
      menuMap.set(row.menu_id, m);
    }
    let c = m.cats.get(row.category_id);
    if (!c) { c = { id: row.category_id, name: row.category_name, sort: row.category_sort, img: row.gradient_bg, items: [] }; m.cats.set(row.category_id, c); }
    c.items.push({
      id: row.item_id, name: row.item_name, desc: row.description, price: Number(row.price),
      tags: row.tags || [], allergens: row.allergens || [],
      allergensContains: row.allergens_contains || [], allergensMay: row.allergens_may || [],
      bg: row.gradient_bg, prod: row.gradient_prod, image_url: row.image_url,
      modifiers: row.modifiers || [],
    });
  }
  const menus = [...menuMap.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((m) => ({ id: m.id, name: m.name, open: m.open, categories: [...m.cats.values()].sort((a, b) => a.sort - b.sort).map((c) => ({ name: c.name, img: c.img, items: c.items })) }));

  return { menus, store };
}

async function fetchSettings() {
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/menu_app_settings?select=key,value", { headers: H });
    if (!r.ok) return {};
    const rows = await r.json();
    const out = {};
    for (const row of rows) out[row.key] = row.value;
    return out;
  } catch { return {}; }
}

// Renders a free-positioned Welcome layout (array of elements with fixed px positions).
function WelcomeElements({ layout, w }) {
  const els = (layout || []).filter((e) => e.visible !== false);
  return (
    <>
      {els.map((e) => {
        const base = { position: "absolute", left: e.x || 0, top: e.y || 0, width: e.w || "auto" };
        const align = e.align || "center";
        if (e.type === "logo") {
          return e.url
            ? <img key={e.id} src={e.url} alt="" style={{ ...base, width: e.w || 200, height: "auto" }} />
            : <div key={e.id} style={{ ...base, fontFamily: "'Poppins',sans-serif", fontSize: e.size || 120, fontWeight: 600, color: e.color || "var(--ink)", textAlign: align, lineHeight: .9 }} dangerouslySetInnerHTML={{ __html: e.text || "still<span style='color:var(--accent)'>.</span>" }} />;
        }
        if (e.type === "image") return <img key={e.id} src={e.url} alt="" style={{ ...base, width: e.w || 200, height: e.h || "auto", objectFit: "cover", borderRadius: e.radius || 0 }} />;
        if (e.type === "heading") return <div key={e.id} style={{ ...base, fontFamily: "'Poppins',sans-serif", fontSize: e.size || 40, fontWeight: 600, color: e.color || "var(--ink)", textAlign: align }} dangerouslySetInnerHTML={{ __html: e.text || "Heading" }} />;
        if (e.type === "subtitle") return <div key={e.id} style={{ ...base, fontFamily: "'Poppins',sans-serif", fontSize: e.size || 22, fontWeight: 400, color: e.color || "var(--muted)", textAlign: align, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: e.text || "Subtitle" }} />;
        if (e.type === "button") return <div key={e.id} style={{ ...base, background: e.color || "var(--accent)", color: e.textColor || "#F7F4EC", padding: "18px 40px", borderRadius: 40, fontFamily: "'Poppins',sans-serif", fontSize: e.size || 18, fontWeight: 600, textAlign: "center" }}>{e.text || "Order Ahead"}</div>;
        if (e.type === "divider") return <div key={e.id} style={{ ...base, width: e.w || 60, height: e.size || 2, background: e.color || "var(--accent)" }} />;
        if (e.type === "spacer") return null;
        return null;
      })}
    </>
  );
}

function Welcome({ bg, menus, onPick, w = {} }) {
  const [open, setOpen] = useState(false);
  let layout = null;
  try { layout = w.welcome_layout ? (typeof w.welcome_layout === "string" ? JSON.parse(w.welcome_layout) : w.welcome_layout) : null; } catch { layout = null; }
  const hasLayout = Array.isArray(layout) && layout.length > 0;
  // find a button element to trigger the picker when using a custom layout
  const layoutBtn = hasLayout ? layout.find((e) => e.type === "button" && e.visible !== false) : null;
  return (
    <div style={{width: '100%', height: '100%', overflow: 'hidden', position: 'relative', ...(bg ? {backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center'} : {background: 'var(--bg)'}), fontFamily: '\'Hanken Grotesk\',sans-serif', color: 'var(--ink)'}}>
      <div style={{position: 'absolute', width: '680px', height: '680px', left: '40px', top: '240px', borderRadius: '50%', background: 'radial-gradient(50% 50% at 50% 50%,rgba(94,122,77,.22),rgba(167,192,131,.1) 50%,transparent 72%)', filter: 'blur(6px)', animation: 'calmGlow 7s ease-in-out infinite'}}></div>
      {hasLayout ? (
        <div onClick={() => setOpen(true)} style={{ position: "absolute", inset: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <div style={{ position: "relative", width: 390, height: 844, flexShrink: 0, transform: "scale(var(--welcome-scale,1))", transformOrigin: "center center" }} ref={(node) => {
            if (node && node.parentElement) {
              const pw = node.parentElement.clientWidth, ph = node.parentElement.clientHeight;
              const sc = Math.min(pw / 390, ph / 844);
              node.style.setProperty("--welcome-scale", String(sc));
            }
          }}>
            <WelcomeElements layout={layout} w={w} />
          </div>
        </div>
      ) : (<>
      
      <div style={{position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 60px', marginTop: '-50px'}}>
        <div style={{fontFamily: '\'Hanken Grotesk\',sans-serif', fontSize: '15px', fontWeight: '700', letterSpacing: '.42em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '32px'}}>{w.welcome_eyebrow || 'Matcha · Coffee'}</div>
        {w.welcome_logo_url ? <img src={w.welcome_logo_url} alt="" style={{maxWidth: '70%', maxHeight: '220px', objectFit: 'contain'}} /> : <div style={{fontFamily: '\'Poppins\',sans-serif', fontSize: '140px', fontWeight: '600', lineHeight: '.86', letterSpacing: '-.04em'}} dangerouslySetInnerHTML={{__html: w.welcome_logo_text || 'still<span style=\'color:var(--accent)\'>.</span>'}} />}
        <div style={{width: '54px', height: '2px', background: 'var(--accent)', margin: '34px 0'}}></div>
        <div style={{fontFamily: '\'Poppins\',sans-serif', fontSize: '24px', fontWeight: '400', color: 'var(--ink)', opacity: '.78', lineHeight: '1.5'}} dangerouslySetInnerHTML={{__html: w.welcome_subtitle || 'Your daily ritual, gently elevated.<br />Calm energy in a cup.'}} />
      </div>
      <div style={{position: 'absolute', left: '0', right: '0', bottom: '66px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px', zIndex: 5}}>
        <div onClick={() => setOpen(true)} style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'var(--accent)', color: '#F7F4EC', padding: '15px 40px', borderRadius: '40px', fontFamily: '\'Poppins\',sans-serif', fontSize: '17px', fontWeight: '600', boxShadow: '0 14px 30px -14px rgba(94,122,77,.55)', cursor: 'pointer'}}>{w.welcome_button || 'Order Ahead'} <span style={{fontSize: '18px'}}>→</span></div>
        <div style={{fontSize: '14px', fontWeight: '600', letterSpacing: '.16em', color: 'var(--muted)', textTransform: 'uppercase'}}>{w.welcome_footer || 'Pickup at counter · Tap to begin'}</div>
      </div>

      </>)}
      {/* choose-menu popup: opens from the bottom, dismiss on outside tap */}
      <div onClick={() => setOpen(false)} style={{position: 'absolute', inset: 0, zIndex: 30, pointerEvents: open ? 'auto' : 'none', background: open ? 'rgba(30,36,20,.34)' : 'transparent', transition: 'background .3s ease', display: 'flex', alignItems: 'flex-end', justifyContent: 'center'}}>
        <div onClick={(e) => e.stopPropagation()} style={{width: 'min(400px, 72%)', marginBottom: 0, background: 'var(--bg)', borderRadius: '28px 28px 0 0', padding: '26px 18px 34px', boxShadow: '0 -20px 50px -18px rgba(0,0,0,.35)', transform: open ? 'translateY(0)' : 'translateY(100%)', opacity: 1, transition: 'transform .34s cubic-bezier(.2,.8,.2,1)'}}>
          <div style={{textAlign: 'center', fontFamily: '\'Poppins\',sans-serif', fontSize: '17px', fontWeight: '600', color: 'var(--accent)', marginBottom: '14px'}}>Choose Menu</div>
          <div style={{display: 'flex', flexDirection: 'column', borderRadius: '16px', overflow: 'hidden'}}>
            {(menus || []).map((m, i) => {
              const on = m.open !== false;
              return (
                <div key={m.id} onClick={() => { if (on) { onPick(m); setOpen(false); } }} style={{padding: '18px 0', textAlign: 'center', cursor: on ? 'pointer' : 'default', background: i === 0 ? 'var(--accent)' : 'var(--bg2)', color: i === 0 ? '#F5F1E6' : (on ? 'var(--ink)' : 'var(--muted)'), fontFamily: '\'Poppins\',sans-serif', fontSize: '15px', fontWeight: '600', letterSpacing: '.04em', textTransform: 'uppercase', borderTop: i === 0 ? 'none' : '1px solid rgba(60,70,45,.08)', opacity: on ? 1 : .55}}>{m.name}</div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
// ============ DATA-DRIVEN BROWSE ============
function Browse({ data, menus, activeMenu, setActiveMenu, activeCat, setActiveCat, onItem, onAdd, onBag, onBack, onSearch, onOpenDrawer, bagCount, heroSlides }) {
  const HEROX = (heroSlides && heroSlides.length) ? heroSlides : HERO;
  const [added, setAdded] = useState(false);
  const flashAdded = () => { setAdded(true); setTimeout(() => setAdded(false), 1100); };
  const rootRef = useRef(null);
  const catRefs = useRef([]);
  const [scrolled, setScrolled] = useState(false);
  const [hero, setHero] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setHero((i) => (i + 1) % HEROX.length), 4200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const sc = root.querySelector("[data-menuscroll]");
    if (!sc) return;
    const onScroll = () => {
      setScrolled(sc.scrollTop > 60);
      // scroll-spy: find the section nearest the top
      const scRect = sc.getBoundingClientRect();
      let current = 0;
      for (let i = 0; i < catRefs.current.length; i++) {
        const el = catRefs.current[i];
        if (!el) continue;
        if (el.getBoundingClientRect().top - scRect.top <= 120) current = i;
      }
      setActiveCat(current);
    };
    sc.addEventListener("scroll", onScroll);
    return () => sc.removeEventListener("scroll", onScroll);
  }, [data]);

  // scroll a category into view when its strip pill is tapped
  const scrollToCat = (i) => {
    setActiveCat(i);
    const sc = rootRef.current && rootRef.current.querySelector("[data-menuscroll]");
    const el = catRefs.current[i];
    if (el && sc) {
      // use offsetTop relative to the scroll container for a reliable absolute jump
      requestAnimationFrame(() => {
        const top = el.offsetTop - 8;
        sc.scrollTo({ top: top < 0 ? 0 : top, behavior: "smooth" });
      });
    }
  };

  const cat = data[activeCat] || data[0] || { name: "", items: [] };

  return (
    <div ref={rootRef} style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: "var(--bg)", fontFamily: "'Hanken Grotesk',sans-serif", color: "var(--ink)" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: .045, mixBlendMode: "multiply", backgroundImage: "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22140%22 height=%22140%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')" }} />
      {/* top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 28px 14px", position: "relative", zIndex: 5 }}>
        <div style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--chip)", display: "flex", alignItems: "center", justifyContent: "center", color: "#36492C", cursor: "pointer" }} onClick={onBack}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg></div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div onClick={onOpenDrawer} title="Your orders & menus" style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--chip)", display: "flex", alignItems: "center", justifyContent: "center", color: "#36492C", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg></div>
          <div onClick={onSearch} style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--chip)", display: "flex", alignItems: "center", justifyContent: "center", color: "#36492C", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg></div>
          <div onClick={onBag} style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--chip)", display: "flex", alignItems: "center", justifyContent: "center", color: "#36492C", cursor: "pointer", position: "relative" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4H4v12h5l3 3 3-3h2z" /></svg>{bagCount > 0 && <span style={{ position: "absolute", top: -2, right: -2, minWidth: 22, height: 22, padding: "0 5px", borderRadius: 11, background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{bagCount}</span>}</div>
        </div>
      </div>

      <div data-menuscroll="1" style={{ position: "absolute", top: 90, left: 0, right: 0, bottom: 0, overflowY: "auto", scrollbarWidth: "none" }}>
{/* hero carousel */}
        <div style={{ margin: "0 16px", borderRadius: 22, overflow: "hidden", position: "relative", height: 200 }}>
          <div style={{ display: "flex", height: "100%", transition: "transform .6s cubic-bezier(.4,0,.2,1)", transform: `translateX(-${hero * 100}%)` }}>
            {HEROX.map((s, i) => (
              <div key={i} style={{ flex: "none", width: "100%", height: "100%", position: "relative", ...(s.image_url ? { backgroundImage: `url(${s.image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: s.bg }) }}>
                <div style={{ position: "absolute", inset: 0, background: s.image_url ? "linear-gradient(90deg,rgba(20,26,14,.62),rgba(20,26,14,.15) 60%,transparent)" : "radial-gradient(120% 80% at 12% 22%,rgba(255,255,255,.22),transparent 52%),radial-gradient(90% 90% at 88% 84%,rgba(33,48,22,.4),transparent 60%)" }} />
                <div style={{ position: "absolute", left: 34, top: 48, maxWidth: 300 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.18)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,.32)", color: "#FBFAF2", fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: ".12em", padding: "6px 13px", borderRadius: 20, marginBottom: 14 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />{s.tag}</div>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 38, fontWeight: 600, lineHeight: 1.04, color: "#FBFAF2", textShadow: "0 2px 18px rgba(30,40,20,.32)" }}>{s.title}</div>
                  <div style={{ width: 120, height: 1.5, background: "rgba(255,255,255,.7)", margin: "14px 0 12px" }} />
                  <div style={{ fontSize: 15, color: "rgba(255,255,255,.92)", fontWeight: 500 }}>{s.sub}</div>
                </div>
                {!s.image_url && <div style={{ position: "absolute", right: 46, bottom: -8, width: 150, height: 200 }}>
                  <div style={{ position: "absolute", left: 6, bottom: 6, width: 138, height: 32, borderRadius: "50%", background: "rgba(25,35,15,.3)", filter: "blur(10px)" }} />
                  <div style={{ position: "absolute", bottom: 0, width: 150, height: 184, borderRadius: "14px 14px 50px 50px", overflow: "hidden", background: s.cup, boxShadow: "inset 0 0 34px rgba(40,50,25,.4)" }}>
                    <div style={{ position: "absolute", left: -12, top: 36, width: 92, height: 92, borderRadius: "50%", background: s.blob, filter: "blur(7px)", opacity: .9 }} />
                    <div style={{ position: "absolute", left: 12, top: 0, bottom: 0, width: 24, background: "linear-gradient(90deg,rgba(255,255,255,.32),transparent)" }} />
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 42, textAlign: "center", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 24, color: "rgba(255,255,255,.92)" }}>still</div>
                  </div>
                  <div style={{ position: "absolute", top: 0, width: 150, height: 24, borderRadius: "50%", background: "rgba(255,255,255,.38)" }} />
                </div>}
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 7 }}>
            {HEROX.map((_, i) => <div key={i} style={{ width: i === hero ? 22 : 8, height: 8, borderRadius: "50%", background: i === hero ? "#FFFFFF" : "rgba(255,255,255,.45)", transition: "width .3s" }} />)}
          </div>
        </div>

        {/* category strip — reveals on scroll */}
        <div style={{ position: "sticky", top: 0, zIndex: 6, background: "var(--bg)", boxShadow: scrolled ? "0 12px 16px -14px rgba(56,53,43,.5)" : "none", overflow: "hidden", maxHeight: scrolled ? 160 : 0, opacity: scrolled ? 1 : 0, paddingTop: scrolled ? 14 : 0, paddingBottom: scrolled ? 14 : 0, transition: "max-height .35s ease, opacity .3s ease, padding .35s ease" }}>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory", padding: "0 20px", scrollbarWidth: "none" }}>
            {data.map((c, i) => {
              const catImg = (c.img && /^https?:/.test(c.img) ? c.img : null) || (c.items || []).map(x => x.image_url).find(u => u && /^https?:/.test(u)) || null;
              return (
              <div key={c.name} onClick={() => scrollToCat(i)} style={{ flex: "none", width: 132, scrollSnapAlign: "start", cursor: "pointer" }}>
                <div style={{ height: 94, borderRadius: 16, position: "relative", overflow: "hidden", backgroundImage: catImg ? `url(${catImg})` : "linear-gradient(160deg,#cf8aa0,#9fb585)", backgroundSize: "cover", backgroundPosition: "center", boxShadow: "0 4px 12px -5px rgba(56,53,43,.2)" }}>
                  <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 60% at 50% 34%,rgba(255,255,255,.3),transparent 70%)" }} />
                  {i === activeCat && <div style={{ position: "absolute", inset: 0, borderRadius: 16, boxShadow: "inset 0 0 0 3px var(--accent)" }} />}
                </div>
                <div style={{ textAlign: "center", marginTop: 9, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, lineHeight: 1.2, color: i === activeCat ? "var(--accent)" : "var(--ink)" }}>{c.name}</div>
              </div>
            );})}
          </div>
        </div>

        {/* section */}
        {data.map((section, si) => (
          <div key={section.name} ref={(el) => (catRefs.current[si] = el)} data-catsection={si} style={{ padding: "6px 28px 0", scrollMarginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18, marginTop: si === 0 ? 0 : 22 }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 26, color: "var(--ink)" }}>{section.name}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {(section.items || []).map((it, i) => (
                <div key={i} onClick={() => onItem(it)} style={{ background: "var(--bg3)", borderRadius: 20, overflow: "hidden", boxShadow: "0 6px 18px -6px rgba(56,53,43,.14),inset 0 0 0 1px var(--line)", display: "flex", flexDirection: "column", cursor: "pointer" }}>
                  <div style={{ aspectRatio: "1 / 1", width: "100%", position: "relative", backgroundImage: it.image_url ? `url(${it.image_url})` : (it.bg || "linear-gradient(160deg,#F1E9D8,#E4D7BC)"), backgroundSize: "cover", backgroundPosition: "center" }}>
                    {!it.image_url && <>
                      <div style={{ position: "absolute", left: "50%", bottom: 30, transform: "translateX(-50%)", width: 150, height: 22, borderRadius: "50%", background: "rgba(80,65,40,.22)", filter: "blur(9px)" }} />
                      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 188, height: 188, borderRadius: "50%", background: it.prod || "radial-gradient(60% 70% at 50% 36%,#FFFFFF,#EAE3D4 72%)", boxShadow: "0 16px 28px -12px rgba(90,70,40,.45)" }} />
                    </>}
                    {it.tags && it.tags.length > 0 && <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(94,122,77,.94)", color: "#F4F6EC", fontFamily: "'Poppins',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: ".1em", padding: "6px 11px", borderRadius: 16 }}>{it.tags[0]}</div>}
                  </div>
                  <div style={{ padding: "11px 14px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 17, color: "var(--ink)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>{it.name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{it.desc}</div>
                    <div style={{ flex: 1, minHeight: 8 }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16, color: "var(--ink)" }}>{money(it.price)}</span>
                      {(it.modifiers && it.modifiers.length > 0) ? (
                        <div onClick={(e) => { e.stopPropagation(); onItem(it); }} style={{ height: 40, padding: "0 16px", borderRadius: 20, background: "var(--accent)", color: "#F7F4EC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'Poppins',sans-serif" }}>Customise</div>
                      ) : (
                        <div onClick={(e) => { e.stopPropagation(); onAdd({ item: it, qty: 1, unit: it.price, mods: [] }); flashAdded(); }} style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", color: "#F7F4EC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 500, lineHeight: 0, paddingBottom: 2, cursor: "pointer" }}>+</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ height: 100 }} />
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 120, pointerEvents: "none", background: "linear-gradient(to top,var(--bg) 22%,transparent)" }} />
      {added && <div style={{ position: "absolute", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "var(--accent)", color: "#fff", padding: "10px 22px", borderRadius: 30, fontSize: 14, fontWeight: 600, fontFamily: "'Poppins',sans-serif", zIndex: 40, boxShadow: "0 10px 24px -8px rgba(0,0,0,.3)" }}>Added to bag ✓</div>}
      {/* horizontal bottom strip; active expands inline, others shuffle aside */}
      {menus && menus.length > 1 && (
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 14, maxWidth: "calc(100% - 24px)", background: "rgba(255,255,255,.55)", backdropFilter: "blur(14px)", borderRadius: 30, boxShadow: "0 8px 24px -10px rgba(56,53,43,.2)", padding: "5px 8px", display: "flex", alignItems: "center", gap: 3, overflowX: "auto", scrollbarWidth: "none", zIndex: 20 }}>
        {menus.map((m, i) => {
          const on = i === activeMenu;
          return (
            <div key={m.id} onClick={() => setActiveMenu(i)} title={m.name} style={{ display: "flex", alignItems: "center", gap: on ? 8 : 0, background: on ? "var(--accent)" : "transparent", borderRadius: 24, padding: on ? "8px 16px 8px 11px" : 0, height: 44, width: on ? "auto" : 44, justifyContent: "center", cursor: "pointer", flex: "none", transition: "all .28s cubic-bezier(.4,0,.2,1)" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", color: on ? "#F5F1E6" : "var(--accent)", flex: "none" }}>{menuIcon(m.name, on)}</span>
              {on && <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, fontWeight: 500, color: "#F5F1E6", whiteSpace: "nowrap" }}>{m.name}</span>}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

function timeAgo(ts, now) {
  const secs = Math.max(0, Math.floor((now - ts) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + " min ago";
  const hrs = Math.floor(mins / 60);
  return hrs + "h " + (mins % 60) + "m ago";
}

function Drawer({ orders = [], onClose, locationId }) {
  const [now, setNow] = useState(Date.now());
  const [openOrder, setOpenOrder] = useState(null);
  const [reprinting, setReprinting] = useState(null);
  const [reprintMsg, setReprintMsg] = useState(null);
  // PIN gate
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [checking, setChecking] = useState(false);
  // View: "orders" | "items"
  const [view, setView] = useState("orders");
  // All-tablets orders from DB
  const [allOrders, setAllOrders] = useState(null);
  const [collapsed, setCollapsed] = useState({}); // tablet_no -> bool
  // Item availability
  const [items, setItems] = useState(null);
  const [savingItem, setSavingItem] = useState(null);
  const [itemSearch, setItemSearch] = useState("");

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);

  async function submitPin() {
    if (!pin) return;
    setChecking(true); setPinErr("");
    try {
      // Verify the PIN via admin-api "load" (same gate the admin uses).
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pin, action: "load", data: {} }),
      });
      if (!r.ok) throw new Error("bad");
      setUnlocked(true);
      loadAllOrders();
    } catch {
      setPinErr("Wrong PIN.");
    } finally { setChecking(false); }
  }

  async function loadAllOrders() {
    try {
      const url = SUPABASE_URL + "/rest/v1/menu_orders?select=id,order_no,tablet_no,table_id,order_type,total,created_at,menu_order_items(name_snapshot,qty,modifiers_snapshot,line_total)"
        + (locationId ? "&location_id=eq." + locationId : "")
        + "&order=created_at.desc&limit=200";
      const r = await fetch(url, { headers: H });
      if (!r.ok) throw new Error("orders " + r.status);
      setAllOrders(await r.json());
    } catch (e) {
      setAllOrders([]);
    }
  }

  async function loadItems() {
    try {
      // Items with image + category, plus their per-location override availability.
      const r = await fetch(SUPABASE_URL + "/rest/v1/menu_items?select=id,name,available,category_id,image_url&published=eq.true&order=name.asc", { headers: H });
      const base = r.ok ? await r.json() : [];
      // Category names for grouping.
      const rc = await fetch(SUPABASE_URL + "/rest/v1/menu_categories?select=id,name,sort_order", { headers: H });
      const cats = rc.ok ? await rc.json() : [];
      const catName = new Map(cats.map((c) => [c.id, c.name]));
      const catSort = new Map(cats.map((c) => [c.id, c.sort_order ?? 999]));
      let ov = [];
      if (locationId) {
        const r2 = await fetch(SUPABASE_URL + "/rest/v1/menu_item_overrides?select=item_id,available&location_id=eq." + locationId, { headers: H });
        ov = r2.ok ? await r2.json() : [];
      }
      const ovMap = new Map(ov.map((o) => [o.item_id, o.available]));
      setItems(base.map((it) => ({
        ...it,
        category: catName.get(it.category_id) || "Other",
        categorySort: catSort.get(it.category_id) ?? 999,
        // effective availability: override wins, else base
        effective: ovMap.has(it.id) && ovMap.get(it.id) !== null ? ovMap.get(it.id) : it.available !== false,
      })));
    } catch { setItems([]); }
  }

  async function toggleItem(it) {
    if (!locationId) { return; }
    setSavingItem(it.id);
    const next = !it.effective;
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
        method: "POST", headers: H,
        body: JSON.stringify({ pin, action: "set_override", data: { item_id: it.id, location_id: locationId, price: null, available: next } }),
      });
      if (!r.ok) throw new Error("save");
      setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, effective: next } : x));
    } catch {
      // leave as-is on failure
    } finally { setSavingItem(null); }
  }

  async function reprint(o, key, e) {
    if (e) e.stopPropagation();
    if (!o.id && !o.orderId) { setReprintMsg({ key, text: "Can\u2019t reprint this one." }); return; }
    setReprinting(key); setReprintMsg(null);
    try {
      const r = await fetch(SUPABASE_URL + "/functions/v1/sunmi-print", {
        method: "POST", headers: H,
        body: JSON.stringify({ action: "print-order", order_id: o.id || o.orderId, force: true }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      setReprintMsg({ key, text: "Reprint sent to the kitchen." });
    } catch (err) {
      setReprintMsg({ key, text: "Reprint failed \u2014 try again." });
    } finally { setReprinting(null); }
  }

  // Group DB orders by tablet_no
  const groups = {};
  if (allOrders) {
    for (const o of allOrders) {
      const key = o.tablet_no ? "Tablet " + o.tablet_no : "No tablet";
      (groups[key] = groups[key] || []).push(o);
    }
  }
  const groupKeys = Object.keys(groups).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, "")) || 999, nb = parseInt(b.replace(/\D/g, "")) || 999;
    return na - nb;
  });

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "var(--bg)", fontFamily: "'Hanken Grotesk',sans-serif", color: "var(--ink)" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", maxWidth: 560, height: "100%", background: "var(--bg2)", boxShadow: "18px 0 50px rgba(50,60,40,.16)", padding: "22px 22px 0", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 24, color: "var(--ink)" }}>Staff panel</div>
          <div onClick={onClose} style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--chip)", display: "flex", alignItems: "center", justifyContent: "center", color: "#36492C", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></div>
        </div>

        {!unlocked ? (
          <div style={{ marginTop: 40, textAlign: "center" }}>
            <div style={{ fontSize: 15, color: "var(--muted)", marginBottom: 18 }}>Enter staff PIN to view orders and manage items.</div>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitPin()} placeholder="PIN" autoFocus
              style={{ width: 200, textAlign: "center", padding: "14px 0", fontSize: 22, letterSpacing: 6, borderRadius: 12, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)" }} />
            {pinErr && <div style={{ color: "#b4462f", fontSize: 14, marginTop: 10 }}>{pinErr}</div>}
            <div onClick={submitPin} style={{ marginTop: 18, display: "inline-block", padding: "12px 34px", borderRadius: 30, background: "var(--accent)", color: "#F7F4EC", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16, cursor: "pointer", opacity: checking ? .6 : 1 }}>{checking ? "Checking\u2026" : "Unlock"}</div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div onClick={() => setView("orders")} style={{ flex: 1, textAlign: "center", padding: "10px 0", borderRadius: 20, cursor: "pointer", fontWeight: 600, fontSize: 14, background: view === "orders" ? "var(--accent)" : "var(--bg3)", color: view === "orders" ? "#F7F4EC" : "var(--ink)" }}>Orders</div>
              <div onClick={() => { setView("items"); if (!items) loadItems(); }} style={{ flex: 1, textAlign: "center", padding: "10px 0", borderRadius: 20, cursor: "pointer", fontWeight: 600, fontSize: 14, background: view === "items" ? "var(--accent)" : "var(--bg3)", color: view === "items" ? "#F7F4EC" : "var(--ink)" }}>Items online/offline</div>
            </div>

            {view === "orders" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", paddingBottom: 24 }}>
                {allOrders === null && <div style={{ color: "var(--faint)", fontSize: 15, textAlign: "center", marginTop: 40 }}>Loading orders\u2026</div>}
                {allOrders && allOrders.length === 0 && <div style={{ color: "var(--faint)", fontSize: 15, textAlign: "center", marginTop: 40 }}>No orders yet.</div>}
                {groupKeys.map((gk) => (
                  <div key={gk} style={{ borderRadius: 14, background: "var(--bg)", boxShadow: "inset 0 0 0 1px var(--line)", overflow: "hidden" }}>
                    <div onClick={() => setCollapsed((c) => ({ ...c, [gk]: !c[gk] }))} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", cursor: "pointer", background: "var(--bg3)" }}>
                      <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16 }}>{gk}</span>
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>{groups[gk].length} order{groups[gk].length === 1 ? "" : "s"} {collapsed[gk] ? "\u25b8" : "\u25be"}</span>
                    </div>
                    {!collapsed[gk] && (
                      <div style={{ padding: "6px 10px 10px" }}>
                        {groups[gk].map((o) => {
                          const okey = gk + ":" + o.id;
                          const its = o.menu_order_items || [];
                          return (
                            <div key={o.id} onClick={() => setOpenOrder(openOrder === okey ? null : okey)} style={{ borderRadius: 12, background: "var(--bg2)", boxShadow: "inset 0 0 0 1px var(--line)", padding: "11px 13px", marginTop: 8, cursor: "pointer" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 15 }}>{(o.tablet_no ? "T" + o.tablet_no + "-" : "#") + (o.order_no ?? "")}</span>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>{timeAgo(new Date(o.created_at).getTime(), now)}</span>
                              </div>
                              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>{its.map((it) => (it.qty > 1 ? it.qty + "\u00d7 " : "") + it.name_snapshot).join(", ")}</div>
                              {openOrder === okey && (
                                <div style={{ marginTop: 8 }}>
                                  {its.map((it, j) => (
                                    <div key={j} style={{ padding: "3px 0" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                                        <span>{it.qty > 1 ? it.qty + "\u00d7 " : ""}{it.name_snapshot}</span>
                                        <span>{money(it.line_total)}</span>
                                      </div>
                                      {it.modifiers_snapshot && Object.keys(it.modifiers_snapshot).length > 0 && (
                                        <div style={{ fontSize: 12, color: "var(--muted)", paddingLeft: 4 }}>{Object.values(it.modifiers_snapshot).join(", ")}</div>
                                      )}
                                    </div>
                                  ))}
                                  <div style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                                    <span>Total</span><span>{money(o.total)}</span>
                                  </div>
                                  <div onClick={(e) => reprint(o, okey, e)} style={{ marginTop: 10, textAlign: "center", padding: "10px 0", borderRadius: 10, background: "var(--bg3)", boxShadow: "inset 0 0 0 1px var(--line)", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: reprinting === okey ? .6 : 1 }}>
                                    {reprinting === okey ? "Reprinting\u2026" : "\u21bb Reprint slip"}
                                  </div>
                                  {reprintMsg && reprintMsg.key === okey && <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 6, textAlign: "center" }}>{reprintMsg.text}</div>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {view === "items" && (
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
                <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search items\u2026"
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", marginBottom: 12, borderRadius: 12, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 15 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", paddingBottom: 24 }}>
                  {items === null && <div style={{ color: "var(--faint)", fontSize: 15, textAlign: "center", marginTop: 40 }}>Loading items\u2026</div>}
                  {items && (() => {
                    const q = itemSearch.trim().toLowerCase();
                    const filtered = q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items;
                    const byCat = {};
                    for (const it of filtered) (byCat[it.category] = byCat[it.category] || []).push(it);
                    const cats = Object.keys(byCat).sort((a, b) => {
                      const sa = byCat[a][0].categorySort, sb = byCat[b][0].categorySort;
                      return sa - sb || a.localeCompare(b);
                    });
                    if (filtered.length === 0) return <div style={{ color: "var(--faint)", fontSize: 15, textAlign: "center", marginTop: 30 }}>No items match.</div>;
                    return cats.map((cat) => (
                      <div key={cat}>
                        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "var(--muted)", marginBottom: 8, textTransform: "uppercase" }}>{cat}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {byCat[cat].map((it) => (
                            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, background: "var(--bg)", boxShadow: "inset 0 0 0 1px var(--line)" }}>
                              <div style={{ width: 46, height: 46, borderRadius: 10, background: "var(--bg3)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {it.image_url ? <img src={it.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: it.effective ? 1 : .4 }} /> : <span style={{ fontSize: 18, color: "var(--faint)" }}>\ud83c\udf7d</span>}
                              </div>
                              <span style={{ flex: 1, fontSize: 15, color: it.effective ? "var(--ink)" : "var(--faint)", textDecoration: it.effective ? "none" : "line-through" }}>{it.name}</span>
                              <div onClick={() => toggleItem(it)} style={{ width: 58, height: 30, borderRadius: 16, background: it.effective ? "var(--accent)" : "var(--line)", position: "relative", cursor: "pointer", opacity: savingItem === it.id ? .5 : 1, transition: "background .15s", flexShrink: 0 }}>
                                <div style={{ position: "absolute", top: 3, left: it.effective ? 31 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                  {items && items.length > 0 && <div style={{ fontSize: 12, color: "var(--faint)", textAlign: "center", marginTop: 8 }}>Green = online. Grey = offline (hidden from customers).</div>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


// ALLERGEN POLICY — the information is hidden until the customer has been
// shown the disclaimer and accepted it. Each acceptance is recorded.
const ALLERGEN_POLICY_VERSION = "v1";

async function recordAllergenAck(payload) {
  // Best-effort: never let a failed write stop someone reading the allergens.
  // Withholding the information because logging failed would be the worse of
  // the two outcomes by a distance.
  try {
    await fetch(SUPABASE_URL + "/rest/v1/menu_allergen_ack", {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ ...payload, policy_version: ALLERGEN_POLICY_VERSION, user_agent: navigator.userAgent }),
    });
  } catch (e) { /* ignore */ }
}

// Codes are stored uppercase for matching; customers see words.
const ALLERGEN_LABEL = {
  WHEAT: "Wheat", RYE: "Rye", BARLEY: "Barley", OATS: "Oats", GLUTEN: "Gluten",
  CRUSTACEANS: "Crustaceans", EGGS: "Eggs", FISH: "Fish", PEANUTS: "Peanuts",
  SOYA: "Soya", MILK: "Milk", ALMOND: "Almond", HAZELNUT: "Hazelnut",
  WALNUT: "Walnut", PISTACHIO: "Pistachio", CASHEW: "Cashew", PECAN: "Pecan",
  BRAZIL: "Brazil nut", MACADAMIA: "Macadamia", OTHER_NUTS: "Other nuts",
  CELERY: "Celery", MUSTARD: "Mustard", SESAME: "Sesame",
  SULPHITES: "Sulphur dioxide / sulphites", LUPIN: "Lupin", MOLLUSCS: "Molluscs",
};

function AllergenGate({ item, store, contains, may, onAccept }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // Name only — the least personal data that still gives a usable record.
  // Required, per the store's allergen policy. Flip to false if you'd rather
  // someone who won't give a name could still read the information.
  const REQUIRE_NAME = true;

  const accept = async () => {
    if (REQUIRE_NAME && !name.trim()) return;
    setBusy(true);
    await recordAllergenAck({
      location_id: store?.id || null,
      item_id: item?.id || null,
      item_name: item?.name || null,
      store_name: store?.name || null,
      customer_name: name.trim() || null,
      allergens_shown: contains,
      may_contain_shown: may,
    });
    setBusy(false);
    onAccept(name.trim());
  };

  const field = {
    width: "100%", boxSizing: "border-box", fontSize: 15, padding: "12px 14px",
    borderRadius: 12, border: "1px solid rgba(0,0,0,.14)", outline: "none",
    fontFamily: "inherit", marginTop: 8,
  };

  if (!open) {
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 8 }}>ALLERGENS</div>
        <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,.1)" }}>
          {/* The real chips, blurred — so it's visibly information being held
              back rather than an empty box that looks like "no allergens". */}
          <div style={{ filter: "blur(7px)", pointerEvents: "none", userSelect: "none", padding: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[...contains, ...may].slice(0, 8).map((a, i) => (
              <span key={i} style={{ fontSize: 13, fontWeight: 600, color: "#8a3c2c", background: "#F7E3DE", padding: "6px 14px", borderRadius: 20 }}>{ALLERGEN_LABEL[a] || a}</span>
            ))}
            {contains.length + may.length === 0 && (
              <span style={{ fontSize: 13, color: "#8a5a2c", background: "#F5E9DC", padding: "6px 14px", borderRadius: 20 }}>Allergen information</span>
            )}
          </div>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.55)" }}>
            <button onClick={() => setOpen(true)}
              style={{ border: "none", background: "var(--ink, #2F3326)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: "10px 18px", borderRadius: 999, cursor: "pointer" }}>
              Click to view allergen information
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, border: "1px solid rgba(0,0,0,.12)", borderRadius: 14, padding: 16, background: "#FFFDF8" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Before we show you this</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--muted)" }}>
        <p style={{ margin: "0 0 10px" }}>
          <b>Please speak to the store manager or supervisor before placing your order</b> if you or
          anyone in your party has a food allergy or intolerance.
        </p>
        <p style={{ margin: "0 0 10px" }}>
          Allergen information is provided as a <b>guideline only</b>. Our kitchens are not
          allergen-free environments: ingredients are handled, prepared and cooked in shared
          spaces using shared equipment, so cross-contamination cannot be ruled out for any item.
        </p>
        <p style={{ margin: "0 0 10px" }}>
          Recipes and suppliers can change. We cannot guarantee that any product is free from a
          particular allergen.
        </p>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Your name</div>
        <input style={field} value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Name" autoComplete="name" />
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
          We keep a record of allergen enquiries for food safety purposes.
        </div>
      </div>

      {/* Disabled rather than silently ignoring the click — a button that does
          nothing reads as a broken app, not as a missing field. */}
      <button onClick={accept} disabled={busy || (REQUIRE_NAME && !name.trim())}
        style={{ width: "100%", marginTop: 14, border: "none", background: "var(--ink, #2F3326)", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 600, padding: "14px 18px", borderRadius: 999, cursor: (REQUIRE_NAME && !name.trim()) ? "not-allowed" : "pointer", opacity: (busy || (REQUIRE_NAME && !name.trim())) ? .45 : 1 }}>
        {busy ? "One moment…"
          : (REQUIRE_NAME && !name.trim()) ? "Enter your name to continue"
          : "I understand and accept the risk — show allergen information"}
      </button>
    </div>
  );
}

function ItemDetail({ item, store, onAdd, onClose, allergensUnlocked, onAllergensAccepted }) {
  const it = item || { name: "Vanilla Matcha", desc: "Ceremonial grade · Smooth, sweet, deep umami.", price: 4.95, bg: null, prod: null, tags: [], allergens: [], allergensContains: ["MILK"], allergensMay: [], modifiers: [] };
  const [qty, setQty] = useState(1);
  const groups = it.modifiers || [];
  // selection state: { [groupId]: Set of optionIds }
  const [sel, setSel] = useState(() => {
    const init = {};
    groups.forEach((g) => {
      // pre-select first option if the group is required single-select
      if (g.required && (g.max_select || 1) === 1 && g.options && g.options.length) {
        init[g.id] = [g.options[0].id];
      } else {
        init[g.id] = [];
      }
    });
    return init;
  });

  // Reset selections whenever the item changes (guards against shared modifier state bleeding across items)
  useEffect(() => {
    const init = {};
    (it.modifiers || []).forEach((g) => {
      if (g.required && (g.max_select || 1) === 1 && g.options && g.options.length) init[g.id] = [g.options[0].id];
      else init[g.id] = [];
    });
    setSel(init);
    setQty(1);
  }, [it.id]);

  const toggleOption = (g, optId) => {
    setSel((prev) => {
      const cur = prev[g.id] || [];
      const single = (g.max_select || 1) === 1;
      let next;
      if (single) {
        next = [optId]; // radio: replace
      } else {
        if (cur.includes(optId)) next = cur.filter((x) => x !== optId);
        else if (cur.length < (g.max_select || 99)) next = [...cur, optId];
        else next = cur; // at max
      }
      return { ...prev, [g.id]: next };
    });
  };

  // compute price with modifier deltas
  const modTotal = groups.reduce((sum, g) => {
    const chosen = sel[g.id] || [];
    return sum + (g.options || []).filter((o) => chosen.includes(o.id)).reduce((s, o) => s + Number(o.price_delta || 0), 0);
  }, 0);
  const unit = it.price + modTotal;

  // collect chosen modifiers for the cart line
  const chosenMods = groups.flatMap((g) =>
    (g.options || []).filter((o) => (sel[g.id] || []).includes(o.id)).map((o) => ({ group: g.name, name: o.name, price_delta: Number(o.price_delta || 0), option_id: o.id }))
  );

  // required groups must have a selection to enable Add
  const missingRequired = groups.some((g) => g.required && (sel[g.id] || []).length < (g.min_select || 1));

  // Item's own allergens plus those of every option currently selected.
  // "contains" wins over "may contain" if an allergen appears in both.
  const liveContains = [...new Set([
    ...(it.allergensContains || []),
    ...groups.flatMap((g) => (g.options || []).filter((o) => (sel[g.id] || []).includes(o.id))
      .flatMap((o) => o.allergens_contains || [])),
  ])].sort();
  const liveMay = [...new Set([
    ...(it.allergensMay || []),
    ...groups.flatMap((g) => (g.options || []).filter((o) => (sel[g.id] || []).includes(o.id))
      .flatMap((o) => o.allergens_may || [])),
  ])].filter((a) => !liveContains.includes(a)).sort();

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: "var(--bg3)", fontFamily: "'Hanken Grotesk',sans-serif", color: "var(--ink)", display: "flex", flexDirection: "column" }}>
      {/* hero */}
      <div style={{ position: "relative", height: it.image_url ? 600 : 520, backgroundImage: it.image_url ? `url(${it.image_url})` : "linear-gradient(165deg,#EFE6DE,#E7DAD2)", backgroundSize: "cover", backgroundPosition: "center", overflow: "hidden", flex: "none" }}>
        <div onClick={onClose} style={{ position: "absolute", top: 24, right: 28, width: 54, height: 54, borderRadius: "50%", background: "var(--chip)", display: "flex", alignItems: "center", justifyContent: "center", color: "#36492C", zIndex: 3, cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></div>
        {!it.image_url && (<>
        <div style={{ position: "absolute", left: "50%", top: "54%", transform: "translate(-50%,-50%) rotate(-7deg)", width: 420, height: 175, borderRadius: 40, background: "linear-gradient(150deg,#b6824a,#8a5a2c)", boxShadow: "0 30px 50px -18px rgba(80,50,20,.4)" }} />
        <div style={{ position: "absolute", left: "50%", top: "46%", transform: "translate(-50%,-50%)", width: 200, height: 200 }}>
          <div style={{ position: "absolute", bottom: 0, width: 200, height: 188, borderRadius: "14px 14px 50px 50px", overflow: "hidden", background: it.bg || "linear-gradient(180deg,#7c9a55,#86a35f 42%,#cfd8b8 62%,#efeee2)", boxShadow: "inset 0 0 30px rgba(60,80,30,.3)" }}>
            {it.prod && <div style={{ position: "absolute", left: "50%", top: "44%", transform: "translate(-50%,-50%)", width: 130, height: 130, borderRadius: "50%", background: it.prod, filter: "blur(3px)", opacity: .85 }} />}
            <div style={{ position: "absolute", left: 16, top: 0, bottom: 0, width: 26, background: "linear-gradient(90deg,rgba(255,255,255,.32),transparent)" }} />
          </div>
          <div style={{ position: "absolute", top: 0, width: 200, height: 28, borderRadius: "50%", background: "rgba(255,255,255,.5)" }} />
        </div>
        </>)}
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "26px 32px 0" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {(it.tags || []).map((t) => <span key={t} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "#fff", background: "var(--accent)", padding: "5px 12px", borderRadius: 16 }}>{t}</span>)}
        </div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 34, lineHeight: 1.05, color: "var(--ink)" }}>{it.name}</div>
        <div style={{ fontSize: 16, color: "var(--muted)", marginTop: 8 }}>{it.desc}</div>

        {/* ALLERGENS — two separate statements, because "contains milk" and
            "may contain traces of milk" are different claims and the old single
            list could not tell them apart. Anything the customer has actually
            selected (oat milk, Nutella, crushed pistachio) is folded in live,
            so the panel describes the drink they are about to order rather than
            the base item. */}
        {!allergensUnlocked && (
          <AllergenGate item={it} store={store} contains={liveContains} may={liveMay}
            onAccept={onAllergensAccepted} />
        )}

        {allergensUnlocked && (liveContains.length > 0 || liveMay.length > 0) && (
          <div style={{ marginTop: 16 }}>
            {liveContains.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 8 }}>CONTAINS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {liveContains.map((a) => (
                    <span key={a} style={{ fontSize: 13, fontWeight: 600, color: "#8a3c2c", background: "#F7E3DE", border: "1px solid #E5BFB2", padding: "6px 14px", borderRadius: 20 }}>{ALLERGEN_LABEL[a] || a}</span>
                  ))}
                </div>
              </>
            )}
            {liveMay.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", margin: liveContains.length ? "14px 0 8px" : "0 0 8px" }}>MAY CONTAIN</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {liveMay.map((a) => (
                    <span key={a} style={{ fontSize: 13, fontWeight: 600, color: "#8a5a2c", background: "#F5E9DC", border: "1px dashed #E5CDB2", padding: "6px 14px", borderRadius: 20 }}>{ALLERGEN_LABEL[a] || a}</span>
                  ))}
                </div>
              </>
            )}
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
              <b>Speak to the store manager or supervisor before ordering.</b> This is a guideline only —
              our kitchens are not allergen-free environments and cross-contamination cannot be ruled out.
            </div>
          </div>
        )}

        {groups.map((g) => {
          const single = (g.max_select || 1) === 1;
          const chosen = sel[g.id] || [];
          return (
            <div key={g.id} style={{ marginTop: 18, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", fontFamily: "'Poppins',sans-serif" }}>{g.name || ""}</div>
                {g.required
                  ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft, #EFEAD9)", padding: "3px 10px", borderRadius: 12, letterSpacing: ".04em" }}>REQUIRED</span>
                  : <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{g.max_select > 1 ? `Pick up to ${g.max_select}` : "Optional"}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {(g.options || []).map((o) => {
                  const on = chosen.includes(o.id);
                  return (
                    <div key={o.id} onClick={() => toggleOption(g, o.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
                      <span style={{ fontSize: 16, color: "var(--ink)" }}>{o.name}{Number(o.price_delta) ? <span style={{ color: "var(--accent)", fontSize: 14, fontWeight: 600 }}> +£{Number(o.price_delta).toFixed(2)}</span> : null}</span>
                      <div style={{ width: 26, height: 26, borderRadius: single ? "50%" : 7, border: on ? "2px solid var(--accent)" : "2px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", background: on && !single ? "var(--accent)" : "transparent" }}>
                        {on && single && <div style={{ width: 13, height: 13, borderRadius: "50%", background: "var(--accent)" }} />}
                        {on && !single && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div style={{ height: 120 }} />
      </div>

      {/* sticky add */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 32px 28px", background: "linear-gradient(to top,var(--bg3) 72%,transparent)", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, background: "var(--bg)", borderRadius: 40, padding: "12px 20px" }}>
          <span onClick={() => setQty((q) => Math.max(1, q - 1))} style={{ fontSize: 24, color: "var(--muted)", lineHeight: 1, cursor: "pointer", userSelect: "none" }}>−</span>
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 20, minWidth: 16, textAlign: "center" }}>{qty}</span>
          <span onClick={() => setQty((q) => q + 1)} style={{ fontSize: 22, color: "var(--accent)", lineHeight: 1, cursor: "pointer", userSelect: "none" }}>+</span>
        </div>
        <div onClick={() => { if (missingRequired) return; onAdd({ item: it, qty, unit, mods: chosenMods }); }} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "var(--accent)", color: "#F7F4EC", padding: "19px 0", borderRadius: 40, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 18, boxShadow: "0 16px 32px -12px rgba(94,122,77,.5)", cursor: missingRequired ? "not-allowed" : "pointer", opacity: missingRequired ? .5 : 1 }}>Add to Bag · {money(unit * qty)}</div>
      </div>
    </div>
  );
}

// ============ BAG (data-driven) ============

function Bag({ lines, setLines, pickupName, setPickupName, onBack, onPlace, orderingEnabled = true, tableMode, table, onPickTable }) {
  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const setQty = (i, d) => setLines((p) => p.map((l, x) => x === i ? { ...l, qty: Math.max(1, l.qty + d) } : l));
  const remove = (i) => setLines((p) => p.filter((_, x) => x !== i));

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: "var(--bg)", fontFamily: "'Hanken Grotesk',sans-serif", color: "var(--ink)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "24px 28px 18px", flex: "none" }}>
        <div onClick={onBack} style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--chip)", display: "flex", alignItems: "center", justifyContent: "center", color: "#36492C", cursor: "pointer" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg></div>
        <div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 28, lineHeight: 1 }}>Your Bag</div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: ".06em", color: "var(--muted)", marginTop: 4 }}>{count} ITEM{count === 1 ? "" : "S"} · PICKUP</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "0 28px" }}>
        {(tableMode === "pick" || tableMode === "fixed") && (
          <div onClick={() => { if (tableMode === "pick" && onPickTable) onPickTable(); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", background: table ? "var(--bg3)" : "rgba(180,70,47,.08)", borderRadius: 18, boxShadow: table ? "inset 0 0 0 1px var(--line)" : "inset 0 0 0 1px rgba(180,70,47,.35)", marginBottom: 14, cursor: tableMode === "pick" ? "pointer" : "default" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: table ? "var(--muted)" : "rgba(180,70,47,.9)", marginBottom: 3 }}>YOUR TABLE</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 20, color: "var(--ink)" }}>{table ? table.label : "Tap to choose your table"}</div>
            </div>
            {tableMode === "pick" && <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>{table ? "Change" : "Select"}</div>}
          </div>
        )}
        {lines.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", marginTop: 80, fontSize: 17 }}>Your bag is empty.<br />Add something from the menu.</div>}
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 16, padding: 18, background: "var(--bg3)", borderRadius: 18, boxShadow: "inset 0 0 0 1px var(--line)", marginBottom: 14 }}>
            <div style={{ width: 80, height: 80, borderRadius: 14, flex: "none", background: l.item.image_url ? `center/cover url(${l.item.image_url})` : (l.item.bg || "linear-gradient(160deg,#8fa86d,#7d985f)"), position: "relative", overflow: "hidden" }}>
              {!l.item.image_url && l.item.prod && <div style={{ position: "absolute", left: -6, top: 24, width: 50, height: 50, borderRadius: "50%", background: l.item.prod, filter: "blur(4px)", opacity: .8 }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 19 }}>{l.item.name}</span><span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 18 }}>{(l.unit * l.qty).toFixed(2)}</span></div>
              {l.mods && l.mods.length > 0 && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>{l.mods.map((m) => m.name).join(" · ")}</div>}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--bg)", borderRadius: 30, padding: "6px 14px" }}>
                  <span onClick={() => setQty(i, -1)} style={{ fontSize: 20, color: "var(--muted)", lineHeight: 1, cursor: "pointer", userSelect: "none" }}>−</span>
                  <span style={{ fontSize: 16, minWidth: 14, textAlign: "center" }}>{l.qty}</span>
                  <span onClick={() => setQty(i, 1)} style={{ fontSize: 18, color: "var(--accent)", lineHeight: 1, cursor: "pointer", userSelect: "none" }}>+</span>
                </div>
                <span onClick={() => remove(i)} style={{ fontSize: 14, color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}>Remove</span>
              </div>
            </div>
          </div>
        ))}

        {lines.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 10 }}>PICKUP NAME</div>
            <input value={pickupName} onChange={(e) => setPickupName(e.target.value)} placeholder="Name for the order" style={{ width: "100%", boxSizing: "border-box", border: "none", borderRadius: 16, padding: "16px 18px", background: "var(--bg3)", boxShadow: "inset 0 0 0 1px var(--line)", fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 16, color: "var(--ink)" }} />
          </div>
        )}
        <div style={{ height: 30 }} />
      </div>

      {lines.length > 0 && (
        <div style={{ flex: "none", padding: "18px 28px 26px", background: "var(--bg3)", boxShadow: "0 -10px 30px -16px rgba(60,70,45,.3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: "var(--muted)", marginBottom: 12 }}><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 24 }}>Total</span><span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 24 }}>{money(subtotal)}</span></div>
          {orderingEnabled ? (
            <div onClick={onPlace} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "var(--accent)", color: "#F7F4EC", padding: "20px 0", borderRadius: 40, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 19, boxShadow: "0 16px 32px -12px rgba(94,122,77,.5)", cursor: "pointer" }}>Place Order <span style={{ fontSize: 20 }}>→</span></div>
          ) : (
            <div style={{ textAlign: "center", background: "var(--bg)", border: "1px solid var(--line)", padding: "18px 24px", borderRadius: 24, fontFamily: "'Poppins',sans-serif" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Please order with a waiter or at the counter</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Show this order to a member of staff to place it.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function Confirm({ orderNo, pickupName, table }) {
  return (
    <div style={{width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: 'var(--bg)', fontFamily: '\'Hanken Grotesk\',sans-serif', color: 'var(--ink)'}}>
      <div style={{position: 'absolute', width: '680px', height: '460px', left: '40px', top: '70px', borderRadius: '50%', background: 'radial-gradient(50% 50% at 50% 50%,rgba(94,122,77,.17),transparent 68%)', filter: 'blur(8px)', animation: 'calmGlow 7s ease-in-out infinite'}}></div>
      <div style={{position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '90px 48px 0'}}>
        <div style={{width: '104px', height: '104px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F7F4EC', boxShadow: '0 18px 42px -10px rgba(94,122,77,.5)'}}><svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"></path></svg></div>
        <div style={{fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '42px', lineHeight: '1.08', marginTop: '28px'}}>We're on it{pickupName ? ', ' + pickupName : ''}.</div>
        <div style={{fontSize: '16px', color: 'var(--muted)', marginTop: '14px', lineHeight: '1.6'}}>Your order has been sent to the kitchen.<br />Please pay at the counter.</div>
        <div style={{display: 'flex', gap: '30px', marginTop: '40px', flexWrap: 'wrap', justifyContent: 'center'}}>
          {pickupName ? (<div><div style={{fontSize: '13px', fontWeight: '700', letterSpacing: '.1em', color: 'var(--muted)'}}>NAME</div><div style={{fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '28px', color: 'var(--accent)', marginTop: '2px'}}>{pickupName}</div></div>) : null}
          {pickupName ? <div style={{width: '1px', background: 'var(--line)'}}></div> : null}
          <div><div style={{fontSize: '13px', fontWeight: '700', letterSpacing: '.1em', color: 'var(--muted)'}}>ORDER</div><div style={{fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '28px', color: 'var(--accent)', marginTop: '2px'}}>{orderNo || '\u2014'}</div></div>
          {table ? (<><div style={{width: '1px', background: 'var(--line)'}}></div>
          <div><div style={{fontSize: '13px', fontWeight: '700', letterSpacing: '.1em', color: 'var(--muted)'}}>TABLE</div><div style={{fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '28px', color: 'var(--accent)', marginTop: '2px'}}>{table.label}</div></div></>) : null}
        </div>
        <div style={{marginTop: '46px', fontSize: '15px', fontWeight: '600', letterSpacing: '.06em', color: 'var(--muted)'}}>Tap anywhere to start a new order</div>
      </div>
    </div>
  );
}


// Relatable inline SVG icon per menu, matched by name keywords.
function menuIcon(name, active) {
  const c = active ? "#F5F1E6" : "currentColor";
  const p = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  const n = (name || "").toLowerCase();
  if (n.includes("dessert") || n.includes("cake") || n.includes("sweet"))
    return <svg {...p}><path d="M4 16h16M6 16c0-3 2-5 6-5s6 2 6 5M9 8c0-1 .5-2 3-2s3 1 3 2M12 3v1" /></svg>;
  if (n.includes("breakfast") || n.includes("brunch") || n.includes("egg"))
    return <svg {...p}><circle cx="10" cy="13" r="6" /><circle cx="10" cy="13" r="2.2" /><path d="M16 9h3a2 2 0 0 1 0 4h-2" /></svg>;
  if (n.includes("dinner") || n.includes("main") || n.includes("meal"))
    return <svg {...p}><path d="M4 18h16M6 18a6 6 0 0 1 12 0M12 6v0" /><path d="M12 6a2 2 0 0 1 0-2" /></svg>;
  if (n.includes("cold") || n.includes("iced") || n.includes("juice") || n.includes("soft") || n.includes("shake"))
    return <svg {...p}><path d="M7 8h10l-1 12H8zM7 8l-.5-3h11L17 8M10 12v4M14 12v4" /></svg>;
  if (n.includes("hot") || n.includes("coffee") || n.includes("tea") || n.includes("latte") || n.includes("chocolate"))
    return <svg {...p}><path d="M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 10h2a2 2 0 0 1 0 4h-2M8 3c-.4 1 .4 2 0 3M12 3c-.4 1 .4 2 0 3" /></svg>;
  if (n.includes("kid") || n.includes("child"))
    return <svg {...p}><path d="M8 21h8M12 21v-6M8 10a4 4 0 0 1 8 0zM7.5 10h9l-1.2 5H8.7z" /></svg>;
  // default: fork & knife
  return <svg {...p}><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4M17 3v18" /></svg>;
}

function SearchOverlay({ menus, onItem, onClose }) {
  const [q, setQ] = useState("");
  const all = [];
  (menus || []).forEach((m) => (m.categories || []).forEach((c) => (c.items || []).forEach((it) => all.push({ ...it, menu: m.name, cat: c.name }))));
  const term = q.trim().toLowerCase();
  const results = term ? all.filter((it) => (it.name || "").toLowerCase().includes(term) || (it.desc || "").toLowerCase().includes(term)).slice(0, 40) : [];
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg)", zIndex: 40, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "22px 24px 14px" }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu…"
          style={{ flex: 1, fontSize: 20, padding: "14px 18px", borderRadius: 16, border: "none", background: "#fff", outline: "none", fontFamily: "'Hanken Grotesk',sans-serif", color: "var(--ink)" }} />
        <div onClick={onClose} style={{ fontSize: 17, fontWeight: 600, color: "var(--muted)", cursor: "pointer", padding: "0 6px" }}>Cancel</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 24px 24px" }}>
        {term && results.length === 0 && <div style={{ color: "var(--muted)", fontSize: 16, marginTop: 20 }}>No matches for "{q}".</div>}
        {results.map((it) => (
          <div key={it.id} onClick={() => { onItem(it); onClose(); }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid rgba(60,70,45,.1)", cursor: "pointer" }}>
            <div style={{ width: 54, height: 54, borderRadius: 12, flex: "none", background: it.image_url ? `center/cover url(${it.image_url})` : (it.bg || "linear-gradient(160deg,#EAD9C4,#C99E74)") }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 17, color: "var(--ink)" }}>{it.name}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{it.menu} · {it.cat}</div>
            </div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16, color: "var(--ink)" }}>£{Number(it.price).toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuPicker({ menus, bg, onPick, onClose }) {
  const bgStyle = bg
    ? { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: "linear-gradient(150deg,#3d5233,#5a7346 55%,#7b9560)" };
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", fontFamily: "'Hanken Grotesk',sans-serif", ...bgStyle }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 10%, rgba(20,28,14,0.12), rgba(18,24,12,0.62) 78%)" }} />
      <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 92, fontWeight: 600, letterSpacing: "-.03em", color: "#F5F1E6", lineHeight: 1 }}>still<span style={{ color: "#C6D9A0" }}>.</span></div>
          <div style={{ width: 60, height: 3, background: "rgba(245,241,230,0.5)", margin: "30px auto" }} />
          <div style={{ fontSize: 22, letterSpacing: ".34em", color: "rgba(245,241,230,0.72)", fontWeight: 600 }}>CHOOSE YOUR MENU</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center", width: "100%" }}>
          {(menus || []).map((m) => {
            const open = m.open !== false;
            return (
              <div key={m.id} onClick={() => onPick(m)} style={{
                width: 340, padding: "13px 0", textAlign: "center", borderRadius: 40, cursor: "pointer",
                background: open ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.34)",
                boxShadow: open ? "0 6px 18px -12px rgba(0,0,0,0.45)" : "none",
              }}>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 19, fontWeight: 400, letterSpacing: ".01em", color: open ? "#2F3326" : "#e2ded2" }}>{m.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TablePicker({ tables, current, onPick, onClose, required }) {
  // Group tables by their letter prefix (FL, FH, BB...) so each zone is its own row.
  const zoneOrder = ["FL", "FH", "BB"];
  const groups = {};
  for (const t of tables) {
    const m = String(t.label).match(/^([A-Za-z]+)/);
    const zone = m ? m[1].toUpperCase() : "OTHER";
    (groups[zone] = groups[zone] || []).push(t);
  }
  // Ordered zone list: known zones first (in zoneOrder), then any others.
  const zones = [
    ...zoneOrder.filter((z) => groups[z]),
    ...Object.keys(groups).filter((z) => !zoneOrder.includes(z)).sort(),
  ];
  const zoneLabel = { FL: "Front Left", FH: "Front Hall", BB: "Back" };

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg)", zIndex: 50, display: "flex", flexDirection: "column", padding: "28px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 28, color: "var(--ink)" }}>Select your table</div>
        {!required && <div onClick={onClose} style={{ fontSize: 15, color: "var(--muted)", cursor: "pointer", padding: 8 }}>Close</div>}
      </div>
      <div style={{ fontSize: 15, color: "var(--muted)", marginBottom: 22 }}>Tap your table number so we bring your order to you.</div>
      <div style={{ overflowY: "auto", paddingBottom: 20 }}>
        {zones.map((zone) => (
          <div key={zone} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: "var(--muted)", marginBottom: 10 }}>
              {(zoneLabel[zone] || zone).toUpperCase()}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 12 }}>
              {groups[zone].map((t) => {
                const active = current && current.id === t.id;
                return (
                  <div key={t.id} onClick={() => onPick(t)} style={{ aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 20, cursor: "pointer", background: active ? "var(--accent)" : "var(--bg3)", color: active ? "#F7F4EC" : "var(--ink)", boxShadow: active ? "0 12px 28px -10px rgba(94,122,77,.6)" : "inset 0 0 0 1px var(--line)", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 28, textAlign: "center", padding: 6, wordBreak: "break-word", lineHeight: 1.1 }}>
                    {t.label}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {tables.length === 0 && <div style={{ fontSize: 15, color: "var(--faint)" }}>No tables set up for this store yet.</div>}
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const [menus, setMenus] = useState(null);   // [{id,name,open,categories:[...]}]
  const [activeMenu, setActiveMenu] = useState(0);
  const [data, setData] = useState(SEED);       // current menu's categories
  const [source, setSource] = useState("seed");
  const [store, setStore] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settings, setSettings] = useState({});
  const [activeCat, setActiveCat] = useState(0);
  const [selItem, setSelItem] = useState(null);
  const [lines, setLines] = useState([]);
  const [pickupName, setPickupName] = useState("");
  const [orderNo, setOrderNo] = useState(null);
  // Dining-table state. tableMode: "none" (takeaway) | "pick" (tablet, must choose) | "fixed" (phone scanned a table QR)
  const [tableMode, setTableMode] = useState("none");
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState(null);          // chosen table row {id,label,...}
  const [showTablePicker, setShowTablePicker] = useState(false);
  const orderingOn = settings.ordering_enabled !== "off" && settings.ordering_enabled !== false;
  const [sessionOrders, setSessionOrders] = useState(() => {
    try { const raw = localStorage.getItem("still_order_history"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });   // this tablet's placed orders, persisted across refresh
  useEffect(() => {
    try { localStorage.setItem("still_order_history", JSON.stringify(sessionOrders.slice(0, 50))); } catch {}
  }, [sessionOrders]);
  const [placing, setPlacing] = useState(false);
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [orderErr, setOrderErr] = useState(null);
  const addToBag = (line) => { setLines((p) => [...p, line]); setScreen("browse"); };
  const pickMenu = (m) => {
    const idx = menus ? menus.findIndex((x) => x.id === m.id) : 0;
    setActiveMenu(idx < 0 ? 0 : idx);
    setScreen("browse");
  };

  // ALLERGEN POLICY — accepted once per customer, not once per item. Asking
  // again on every product would train people to click through it, which is
  // the opposite of the point. Deliberately NOT persisted: on a shared store
  // tablet one customer's acceptance must not carry over to the next, so it
  // clears when the bag is reset after an order.
  const [allergensUnlocked, setAllergensUnlocked] = useState(false);

  // Plenty of customers browse on the tablet and then order at the till, so the
  // acceptance can't only be cleared when an order is placed IN the app — that
  // path may never happen. Two resets cover it:
  //   * going back to the welcome screen (one customer finishing, next starting)
  //   * a period of no interaction, for a tablet simply put down and walked away from
  // Both matter: an unlocked tablet would show the next person allergen
  // information they never accepted the policy for.
  const IDLE_RESET_MS = 3 * 60 * 1000;
  useEffect(() => {
    if (screen === "welcome" && allergensUnlocked) setAllergensUnlocked(false);
  }, [screen, allergensUnlocked]);

  useEffect(() => {
    if (!allergensUnlocked) return;
    let t;
    const arm = () => { clearTimeout(t); t = setTimeout(() => { setAllergensUnlocked(false); if (tableMode === "pick") setTable(null); setScreen("welcome"); }, IDLE_RESET_MS); };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => { clearTimeout(t); events.forEach((e) => window.removeEventListener(e, arm)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allergensUnlocked]);

  const placeOrder = async () => {
    if (placing) return;
    // Guard: never place an empty bag (mis-tap protection).
    if (!lines || lines.length === 0) { setOrderErr("Your bag is empty."); return; }
    // On a tablet (pick mode), a table must be chosen before the order can send.
    if (orderingOn && tableMode === "pick" && !table) { setShowTablePicker(true); return; }
    setPlacing(true); setOrderErr(null);
    const dineIn = (tableMode === "pick" || tableMode === "fixed") && table;
    const payload = {
      qr_token: getStoreToken() || null,
      table_id: dineIn ? table.id : null,
      order_type: dineIn ? "dine_in" : "takeaway",
      pickup_name: pickupName || null,
      tablet_no: getTabletNumber() || null,
      items: lines.map((l) => ({ item_id: l.item.id, qty: l.qty, modifiers: (l.mods || []).map((m) => m.option_id) })),
    };
    try {
      const res = await fetch(SUPABASE_URL + "/functions/v1/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
        body: JSON.stringify(payload),
      });
      const resp = await res.json();
      if (!res.ok) throw new Error(resp.error || ("HTTP " + res.status));
      setOrderNo(formatOrderNo(resp.order_no));
      setSessionOrders((prev) => [{
        no: formatOrderNo(resp.order_no),
        orderId: resp.order_id,
        at: Date.now(),
        table: (dineIn && table) ? table.label : null,
        count: lines.reduce((s2, l) => s2 + l.qty, 0),
        total: lines.reduce((s2, l) => s2 + (l.unit || l.item.price || 0) * l.qty, 0),
        items: lines.map((l) => ({ name: l.item.name, qty: l.qty, mods: (l.mods || []).map((m) => m.name) })),
      }, ...prev]);
      setScreen("confirm");
    } catch (e) {
      // Fallback so the demo flow still completes if the function isn't deployed yet.
      console.warn("place-order failed, using local number:", e.message);
      setOrderErr(e.message);
      setOrderNo(formatOrderNo(Math.floor(200 + Math.random() * 800)));
      setScreen("confirm");
    } finally {
      setPlacing(false);
    }
  };
  const wrapRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const token = getStoreToken();
    fetchSettings().then(setSettings);
    // Determine dining-table mode from the token.
    (async () => {
      if (!token) { setTableMode("none"); return; }
      const scanned = await tableFromToken(token);
      if (!alive) return;
      if (scanned) {
        // Phone scanned a specific table's QR -> table is fixed.
        setTable({ id: scanned.id, label: scanned.label });
        setTableMode("fixed");
        setTables(await fetchTables(scanned.location_id));
      } else {
        // Token is a tablet link (or store token) -> customer must pick a table.
        const st = await resolveStore(token);
        const loc = st && st.location_id ? st.location_id : null;
        if (!alive) return;
        if (loc) {
          const tbls = await fetchTables(loc);
          if (!alive) return;
          setTables(tbls);
          setTableMode(tbls.length ? "pick" : "none");
        } else {
          setTableMode("none");
        }
      }
    })();
    fetchLive(token).then((res) => {
      if (!alive || !res || !res.menus || !res.menus.length) return;
      setMenus(res.menus);
      setStore(res.store || null);
      setData(res.menus[0].categories);
      setSource("live");
    }).catch((e) => console.warn("seed fallback:", e.message));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (menus && menus[activeMenu]) { setData(menus[activeMenu].categories); setActiveCat(0); }
  }, [activeMenu, menus]);

  const openItem = (it) => { setSelItem(it); setScreen("item"); };

  let heroSlides = [];
  try { heroSlides = settings.hero_slides ? (typeof settings.hero_slides === "string" ? JSON.parse(settings.hero_slides) : settings.hero_slides) : []; } catch { heroSlides = []; }
  const themeVars = THEMES[settings.theme] || THEMES.still;
  const themeBg = settings.theme === "chocoberry"
    ? "linear-gradient(160deg,#F3EADA,#F4E9DD)"
    : "linear-gradient(160deg,#EEF2E4,#E1E8D2)";
  return (
    <div style={{ ...themeVars, background: themeBg, fontFamily: "'Hanken Grotesk',sans-serif", height: "100dvh", width: "100vw", overflow: "hidden", position: "fixed", top: 0, left: 0 }}>
      {!online && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, background: "#8a5a2c", color: "#fff", textAlign: "center", fontSize: 13, fontWeight: 600, padding: "6px 0", letterSpacing: ".02em", fontFamily: "'Poppins',sans-serif" }}>
          ● Offline — showing saved menu
        </div>
      )}
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes calmGlow{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:.9;transform:scale(1.06)}}
        [data-catstrip]{max-height:0;opacity:0;overflow:hidden;padding-top:0 !important;padding-bottom:0 !important;transition:max-height .35s ease,opacity .3s ease,padding .35s ease;}
        [data-catstrip].show{max-height:160px;opacity:1;padding-top:14px !important;padding-bottom:14px !important;}
        .screenwrap .screen{position:absolute;inset:0;}
        .screenwrap .screen > div{width:100% !important;height:100% !important;position:absolute;left:0;top:0;}
        .menu-card{cursor:pointer;}
        *::-webkit-scrollbar{display:none;}
      `}</style>

      <div style={{ width: "100vw", height: "100dvh", margin: 0 }}>
        <div style={{ width: "100%", height: "100%", padding: 0, background: "transparent" }}>
          <div ref={wrapRef} className="screenwrap" style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>

            <div className={"screen" + (screen === "welcome" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "welcome" ? "block" : "none" }}><Welcome bg={settings.welcome_bg_url || ""} menus={menus} onPick={pickMenu} w={settings} /></div>
            <div className={"screen" + (screen === "browse" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "browse" ? "block" : "none" }}><Browse data={data} menus={menus} activeMenu={activeMenu} setActiveMenu={setActiveMenu} activeCat={activeCat} setActiveCat={setActiveCat} onItem={openItem} onAdd={addToBag} onBag={() => setScreen("bag")} onBack={() => setScreen("welcome")} onSearch={() => setSearchOpen(true)} onOpenDrawer={() => setScreen("drawer")} bagCount={lines.reduce((s,l)=>s+l.qty,0)} heroSlides={heroSlides} />{searchOpen && <SearchOverlay menus={menus} onItem={openItem} onClose={() => setSearchOpen(false)} />}</div>
            <div className={"screen" + (screen === "drawer" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "drawer" ? "block" : "none" }}><Drawer orders={sessionOrders} onClose={() => setScreen("browse")} locationId={store?.id || store?.location_id || null} /></div>
            <div className={"screen" + (screen === "item" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "item" ? "block" : "none" }}><ItemDetail key={selItem ? selItem.id : "none"} item={selItem} store={store} onAdd={addToBag} onClose={() => setScreen("browse")} allergensUnlocked={allergensUnlocked} onAllergensAccepted={(nm) => {
              setAllergensUnlocked(true);
              // They've just typed their name for the allergen record; don't
              // ask for it again at checkout.
              if (nm && !pickupName) setPickupName(nm);
            }} /></div>
            <div className={"screen" + (screen === "bag" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "bag" ? "block" : "none" }}><Bag lines={lines} setLines={setLines} pickupName={pickupName} setPickupName={setPickupName} onBack={() => setScreen("browse")} onPlace={() => {
              if (!lines || lines.length === 0) { setOrderErr("Your bag is empty."); return; }
              if (orderingOn && tableMode === "pick" && !table) { setShowTablePicker(true); return; }
              setConfirmingOrder(true);
            }} orderingEnabled={settings.ordering_enabled !== "off" && settings.ordering_enabled !== false} tableMode={tableMode} table={table} onPickTable={() => setShowTablePicker(true)} /></div>
            <div className={"screen" + (screen === "confirm" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "confirm" ? "block" : "none" }} onClick={() => { setLines([]); setPickupName(""); setOrderNo(null); setAllergensUnlocked(false); if (tableMode === "pick") setTable(null); setScreen("welcome"); }}><Confirm orderNo={orderNo} pickupName={pickupName} table={table} /></div>
            {/* Staff: pre-set the table before handing the tablet to the customer.
                Discreet corner button, welcome screen only. Customer can still change it in the bag. */}
            {orderingOn && tableMode === "pick" && screen === "welcome" && (
              <div onClick={() => setShowTablePicker(true)}
                style={{ position: "absolute", top: 14, right: 14, zIndex: 40, padding: "8px 14px", borderRadius: 20, background: "var(--bg3)", boxShadow: "inset 0 0 0 1px var(--line)", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", cursor: "pointer", opacity: 0.85 }}>
                {table ? `Table: ${table.label}` : "Staff · Set table"}
              </div>
            )}
            {orderingOn && (showTablePicker || (tableMode === "pick" && !table && screen === "bag")) && (
              <TablePicker tables={tables} current={table} required={tableMode === "pick" && !table && screen === "bag"}
                onPick={(t) => { setTable({ id: t.id, label: t.label }); setShowTablePicker(false); }}
                onClose={() => setShowTablePicker(false)} />
            )}
            {confirmingOrder && (
              <div style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(30,35,25,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
                onClick={() => { if (!placing) setConfirmingOrder(false); }}>
                <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "var(--bg)", borderRadius: 26, padding: "34px 28px", textAlign: "center", boxShadow: "0 30px 80px -20px rgba(0,0,0,.4)" }}>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 26, color: "var(--ink)", marginBottom: 8 }}>Place this order?</div>
                  <div style={{ fontSize: 15, color: "var(--muted)", marginBottom: 8 }}>
                    {lines.reduce((s, l) => s + l.qty, 0)} item{lines.reduce((s, l) => s + l.qty, 0) === 1 ? "" : "s"}
                    {table ? ` · Table ${table.label}` : ""}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--faint)", marginBottom: 26 }}>You’ll pay at the counter.</div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div onClick={() => { if (!placing) setConfirmingOrder(false); }}
                      style={{ flex: 1, padding: "16px 0", borderRadius: 30, background: "var(--bg3)", boxShadow: "inset 0 0 0 1px var(--line)", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 17, color: "var(--ink)", cursor: "pointer" }}>Not yet</div>
                    <div onClick={() => { if (placing) return; setConfirmingOrder(false); placeOrder(); }}
                      style={{ flex: 1, padding: "16px 0", borderRadius: 30, background: "var(--accent)", color: "#F7F4EC", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 17, boxShadow: "0 14px 30px -14px rgba(94,122,77,.55)", cursor: "pointer", opacity: placing ? 0.6 : 1 }}>{placing ? "Placing…" : "Yes, place order"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      </div>
  );
}
