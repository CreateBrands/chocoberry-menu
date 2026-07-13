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
  const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/store_menu_full", {
    method: "POST", headers: H, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("store_menu_full " + r.status);
  const rows = await r.json();

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
      bg: row.gradient_bg, prod: row.gradient_prod, image_url: row.image_url,
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

function Welcome({ bg }) {
  return (
    <div style={{width: '100%', height: '100%', overflow: 'hidden', position: 'relative', ...(bg ? {backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center'} : {background: 'var(--bg)'}), fontFamily: '\'Hanken Grotesk\',sans-serif', color: 'var(--ink)'}}>
      <div style={{position: 'absolute', width: '680px', height: '680px', left: '40px', top: '240px', borderRadius: '50%', background: 'radial-gradient(50% 50% at 50% 50%,rgba(94,122,77,.22),rgba(167,192,131,.1) 50%,transparent 72%)', filter: 'blur(6px)', animation: 'calmGlow 7s ease-in-out infinite'}}></div>
      <div style={{position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px 6px', fontSize: '15px', color: 'var(--muted)', fontWeight: '600'}}>
        <span>7:42</span>
        <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}><span style={{letterSpacing: '.06em'}}>Wi-Fi</span><span>100%</span><div style={{width: '24px', height: '12px', border: '1.5px solid var(--muted)', borderRadius: '3px', padding: '1.5px'}}><div style={{width: '100%', height: '100%', background: 'var(--muted)', borderRadius: '1px'}}></div></div></div>
      </div>
      <div style={{position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 60px', marginTop: '-50px'}}>
        <div style={{fontFamily: '\'Hanken Grotesk\',sans-serif', fontSize: '15px', fontWeight: '700', letterSpacing: '.42em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '32px'}}>Matcha · Coffee</div>
        <div style={{fontFamily: '\'Poppins\',sans-serif', fontSize: '140px', fontWeight: '600', lineHeight: '.86', letterSpacing: '-.04em'}}>still<span style={{color: 'var(--accent)'}}>.</span></div>
        <div style={{width: '54px', height: '2px', background: 'var(--accent)', margin: '34px 0'}}></div>
        <div style={{fontFamily: '\'Poppins\',sans-serif', fontSize: '24px', fontWeight: '400', color: 'var(--ink)', opacity: '.78', lineHeight: '1.5'}}>Your daily ritual, gently elevated.<br />Calm energy in a cup.</div>
      </div>
      <div style={{position: 'absolute', left: '0', right: '0', bottom: '66px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--accent)', color: '#F7F4EC', padding: '22px 58px', borderRadius: '60px', fontFamily: '\'Poppins\',sans-serif', fontSize: '20px', fontWeight: '600', boxShadow: '0 18px 38px -14px rgba(94,122,77,.55)'}}>Order Ahead <span style={{fontSize: '22px'}}>→</span></div>
        <div style={{fontSize: '14px', fontWeight: '600', letterSpacing: '.16em', color: 'var(--muted)', textTransform: 'uppercase'}}>Pickup at counter · Tap to begin</div>
      </div>
    </div>
  );
}
// ============ DATA-DRIVEN BROWSE ============
function Browse({ data, menus, activeMenu, setActiveMenu, activeCat, setActiveCat, onItem, onBag, onBack, onSearch, bagCount }) {
  const rootRef = useRef(null);
  const catRefs = useRef([]);
  const [scrolled, setScrolled] = useState(false);
  const [hero, setHero] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setHero((i) => (i + 1) % HERO.length), 4200);
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
    const el = catRefs.current[i];
    const sc = rootRef.current && rootRef.current.querySelector("[data-menuscroll]");
    if (el && sc) {
      const scRect = sc.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      sc.scrollTo({ top: sc.scrollTop + (elRect.top - scRect.top) - 8, behavior: "smooth" });
    }
    setActiveCat(i);
  };

  const cat = data[activeCat] || data[0] || { name: "", items: [] };

  return (
    <div ref={rootRef} style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: "var(--bg)", fontFamily: "'Hanken Grotesk',sans-serif", color: "var(--ink)" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: .045, mixBlendMode: "multiply", backgroundImage: "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22140%22 height=%22140%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')" }} />
      {/* top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 28px 14px", position: "relative", zIndex: 5 }}>
        <div style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--chip)", display: "flex", alignItems: "center", justifyContent: "center", color: "#36492C", cursor: "pointer" }} onClick={onBack}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg></div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div onClick={onSearch} style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--chip)", display: "flex", alignItems: "center", justifyContent: "center", color: "#36492C", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg></div>
          <div onClick={onBag} style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--chip)", display: "flex", alignItems: "center", justifyContent: "center", color: "#36492C", cursor: "pointer", position: "relative" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4H4v12h5l3 3 3-3h2z" /></svg>{bagCount > 0 && <span style={{ position: "absolute", top: -2, right: -2, minWidth: 22, height: 22, padding: "0 5px", borderRadius: 11, background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{bagCount}</span>}</div>
        </div>
      </div>

      <div data-menuscroll="1" style={{ position: "absolute", top: 90, left: 0, right: 0, bottom: 0, overflowY: "auto", scrollbarWidth: "none" }}>
{/* hero carousel */}
        <div style={{ margin: "0 28px", borderRadius: 26, overflow: "hidden", position: "relative", height: 300 }}>
          <div style={{ display: "flex", height: "100%", transition: "transform .6s cubic-bezier(.4,0,.2,1)", transform: `translateX(-${hero * 100}%)` }}>
            {HERO.map((s, i) => (
              <div key={i} style={{ flex: "none", width: "100%", height: "100%", position: "relative", background: s.bg }}>
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 12% 22%,rgba(255,255,255,.22),transparent 52%),radial-gradient(90% 90% at 88% 84%,rgba(33,48,22,.4),transparent 60%)" }} />
                <div style={{ position: "absolute", left: 34, top: 48, maxWidth: 300 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.18)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,.32)", color: "#FBFAF2", fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: ".12em", padding: "6px 13px", borderRadius: 20, marginBottom: 14 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />{s.tag}</div>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 38, fontWeight: 600, lineHeight: 1.04, color: "#FBFAF2", textShadow: "0 2px 18px rgba(30,40,20,.32)" }}>{s.title}</div>
                  <div style={{ width: 120, height: 1.5, background: "rgba(255,255,255,.7)", margin: "14px 0 12px" }} />
                  <div style={{ fontSize: 15, color: "rgba(255,255,255,.92)", fontWeight: 500 }}>{s.sub}</div>
                </div>
                <div style={{ position: "absolute", right: 46, bottom: -8, width: 150, height: 200 }}>
                  <div style={{ position: "absolute", left: 6, bottom: 6, width: 138, height: 32, borderRadius: "50%", background: "rgba(25,35,15,.3)", filter: "blur(10px)" }} />
                  <div style={{ position: "absolute", bottom: 0, width: 150, height: 184, borderRadius: "14px 14px 50px 50px", overflow: "hidden", background: s.cup, boxShadow: "inset 0 0 34px rgba(40,50,25,.4)" }}>
                    <div style={{ position: "absolute", left: -12, top: 36, width: 92, height: 92, borderRadius: "50%", background: s.blob, filter: "blur(7px)", opacity: .9 }} />
                    <div style={{ position: "absolute", left: 12, top: 0, bottom: 0, width: 24, background: "linear-gradient(90deg,rgba(255,255,255,.32),transparent)" }} />
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 42, textAlign: "center", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 24, color: "rgba(255,255,255,.92)" }}>still</div>
                  </div>
                  <div style={{ position: "absolute", top: 0, width: 150, height: 24, borderRadius: "50%", background: "rgba(255,255,255,.38)" }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 7 }}>
            {HERO.map((_, i) => <div key={i} style={{ width: i === hero ? 22 : 8, height: 8, borderRadius: "50%", background: i === hero ? "#FFFFFF" : "rgba(255,255,255,.45)", transition: "width .3s" }} />)}
          </div>
        </div>

        {/* category strip — reveals on scroll */}
        <div style={{ position: "sticky", top: 0, zIndex: 6, background: "var(--bg)", boxShadow: scrolled ? "0 12px 16px -14px rgba(56,53,43,.5)" : "none", overflow: "hidden", maxHeight: scrolled ? 160 : 0, opacity: scrolled ? 1 : 0, paddingTop: scrolled ? 14 : 0, paddingBottom: scrolled ? 14 : 0, transition: "max-height .35s ease, opacity .3s ease, padding .35s ease" }}>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", scrollSnapType: "x mandatory", padding: "0 28px", scrollbarWidth: "none" }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              {(section.items || []).map((it, i) => (
                <div key={i} onClick={() => onItem(it)} style={{ background: "var(--bg3)", borderRadius: 20, overflow: "hidden", boxShadow: "0 6px 18px -6px rgba(56,53,43,.14),inset 0 0 0 1px var(--line)", display: "flex", flexDirection: "column", cursor: "pointer" }}>
                  <div style={{ height: 320, position: "relative", backgroundImage: it.image_url ? `url(${it.image_url})` : (it.bg || "linear-gradient(160deg,#F1E9D8,#E4D7BC)"), backgroundSize: "cover", backgroundPosition: "center" }}>
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
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", color: "#F7F4EC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 500, lineHeight: 1 }}>+</div>
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
      {/* horizontal bottom strip; active expands inline, others shuffle aside */}
      {menus && menus.length > 1 && (
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 18, maxWidth: "calc(100% - 24px)", background: "rgba(255,255,255,.96)", backdropFilter: "blur(10px)", borderRadius: 30, boxShadow: "0 14px 34px rgba(56,53,43,.18)", padding: 6, display: "flex", alignItems: "center", gap: 2, overflowX: "auto", scrollbarWidth: "none", zIndex: 20 }}>
        {menus.map((m, i) => {
          const on = i === activeMenu;
          return (
            <div key={m.id} onClick={() => setActiveMenu(i)} title={m.name} style={{ display: "flex", alignItems: "center", gap: on ? 8 : 0, background: on ? "var(--accent)" : "transparent", borderRadius: 24, padding: on ? "10px 18px 10px 12px" : 0, height: 48, width: on ? "auto" : 48, justifyContent: "center", cursor: "pointer", flex: "none", transition: "all .28s cubic-bezier(.4,0,.2,1)" }}>
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

function Drawer() {
  return (
    <div style={{width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: 'var(--bg)', fontFamily: '\'Hanken Grotesk\',sans-serif', color: 'var(--ink)'}}>
      {/* blurred menu behind (right) */}
      <div style={{position: 'absolute', right: '0', top: '0', width: '330px', height: '100%', filter: 'blur(7px)', opacity: '.55'}}>
        <div style={{margin: '80px 20px 0', height: '160px', borderRadius: '22px', background: 'linear-gradient(120deg,#5d7a52,#9fb585)'}}></div>
        <div style={{display: 'flex', gap: '14px', margin: '80px 20px 0'}}><div style={{flex: '1', height: '200px', borderRadius: '18px', background: '#E6DAC0'}}></div><div style={{flex: '1', height: '200px', borderRadius: '18px', background: '#DBB877'}}></div></div>
      </div>
      <div style={{position: 'absolute', right: '0', top: '0', width: '330px', height: '100%', background: 'rgba(225,232,210,.4)'}}></div>
      {/* drawer */}
      <div style={{position: 'absolute', left: '0', top: '0', width: '470px', height: '100%', background: 'var(--bg2)', boxShadow: '18px 0 50px rgba(50,60,40,.16)', padding: '22px 22px 0', overflow: 'hidden'}}>
        <div style={{width: '54px', height: '54px', borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#36492C', marginBottom: '18px'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg></div>
        <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
          <div style={{borderRadius: '18px', padding: '5px', background: '#E6CFA0', boxShadow: '0 0 0 1px rgba(120,90,40,.25)'}}>
            <div style={{position: 'relative', height: '138px', borderRadius: '14px', overflow: 'hidden', background: 'linear-gradient(160deg,#E8CB97,#DBB877)'}}>
              <div style={{position: 'absolute', left: '50%', top: '54%', transform: 'translate(-50%,-50%)', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(60% 60% at 50% 40%,#EDE4D2,#CDB389 72%)'}}></div>
              <div style={{position: 'absolute', left: '14px', bottom: '12px', background: '#fff', borderRadius: '11px', padding: '8px 16px', fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '16px', color: 'var(--ink)'}}>Seasonal Menu</div>
            </div>
          </div>
          <div style={{position: 'relative', height: '148px', borderRadius: '18px', overflow: 'hidden', background: 'linear-gradient(160deg,#9CB07F,#7E9A66)', boxShadow: 'inset 0 0 0 1px var(--line)'}}>
            <div style={{position: 'absolute', right: '24px', top: '30px', width: '88px', height: '96px', borderRadius: '10px 10px 28px 28px', background: 'linear-gradient(160deg,#a9c08a,#8aa56c)'}}></div>
            <div style={{position: 'absolute', left: '14px', bottom: '12px', background: '#fff', borderRadius: '11px', padding: '8px 16px', fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '16px', color: 'var(--ink)'}}>Signature Matchas</div>
          </div>
          <div style={{position: 'relative', height: '148px', borderRadius: '18px', overflow: 'hidden', background: 'linear-gradient(160deg,#C9A06A,#A9743F)', boxShadow: 'inset 0 0 0 1px var(--line)'}}>
            <div style={{position: 'absolute', right: '30px', top: '24px', width: '78px', height: '100px', borderRadius: '8px 8px 16px 16px', background: 'linear-gradient(160deg,#e8d3ab,#cf9a5c)'}}></div>
            <div style={{position: 'absolute', left: '14px', bottom: '12px', background: '#fff', borderRadius: '11px', padding: '8px 16px', fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '16px', color: 'var(--ink)'}}>Signature Lattes Iced</div>
          </div>
          <div style={{position: 'relative', height: '148px', borderRadius: '18px', overflow: 'hidden', background: 'linear-gradient(160deg,#7a5236,#5a3a24)', boxShadow: 'inset 0 0 0 1px var(--line)'}}>
            <div style={{position: 'absolute', right: '30px', top: '22px', width: '74px', height: '104px', borderRadius: '8px 8px 18px 18px', background: 'linear-gradient(160deg,#6b4a30,#4a2f1c)'}}></div>
            <div style={{position: 'absolute', left: '14px', bottom: '12px', background: '#fff', borderRadius: '11px', padding: '8px 16px', fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '16px', color: 'var(--ink)'}}>Iced Cocoa</div>
          </div>
          <div style={{position: 'relative', height: '148px', borderRadius: '18px', overflow: 'hidden', background: 'linear-gradient(160deg,#b98a5e,#946a44)', boxShadow: 'inset 0 0 0 1px var(--line)'}}>
            <div style={{position: 'absolute', left: '14px', bottom: '12px', background: '#fff', borderRadius: '11px', padding: '8px 16px', fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '16px', color: 'var(--ink)'}}>Hot Cocoa</div>
          </div>
        </div>
      </div>
      {/* scrollbar hint */}
      <div style={{position: 'absolute', left: '484px', top: '96px', width: '4px', height: '120px', borderRadius: '3px', background: 'rgba(80,90,60,.3)'}}></div>
    </div>
  );
}
// ============ ITEM DETAIL (interactive) ============
function ItemDetail({ item, onAdd, onClose }) {
  const it = item || { name: "Vanilla Matcha", desc: "Ceremonial grade · Smooth, sweet, deep umami.", price: 4.95, bg: null, prod: null, tags: [], allergens: ["Milk"] };
  const [qty, setQty] = useState(1);
  const unit = it.price;

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

        {it.allergens && it.allergens.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginBottom: 8 }}>ALLERGENS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {it.allergens.map((a) => (
                <span key={a} style={{ fontSize: 13, fontWeight: 600, color: "#8a5a2c", background: "#F5E9DC", border: "1px solid #E5CDB2", padding: "5px 12px", borderRadius: 16 }}>{a}</span>
              ))}
            </div>
          </div>
        )}


        <div style={{ height: 120 }} />
      </div>

      {/* sticky add */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 32px 28px", background: "linear-gradient(to top,var(--bg3) 72%,transparent)", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, background: "var(--bg)", borderRadius: 40, padding: "12px 20px" }}>
          <span onClick={() => setQty((q) => Math.max(1, q - 1))} style={{ fontSize: 24, color: "var(--muted)", lineHeight: 1, cursor: "pointer", userSelect: "none" }}>−</span>
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 20, minWidth: 16, textAlign: "center" }}>{qty}</span>
          <span onClick={() => setQty((q) => q + 1)} style={{ fontSize: 22, color: "var(--accent)", lineHeight: 1, cursor: "pointer", userSelect: "none" }}>+</span>
        </div>
        <div onClick={() => onAdd({ item: it, size, milk, qty, unit })} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "var(--accent)", color: "#F7F4EC", padding: "19px 0", borderRadius: 40, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 18, boxShadow: "0 16px 32px -12px rgba(94,122,77,.5)", cursor: "pointer" }}>Add to Bag · {money(unit * qty)}</div>
      </div>
    </div>
  );
}

// ============ BAG (data-driven) ============
function Bag({ lines, setLines, pickupName, setPickupName, onBack, onPlace }) {
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
        {lines.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", marginTop: 80, fontSize: 17 }}>Your bag is empty.<br />Add something from the menu.</div>}
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 16, padding: 18, background: "var(--bg3)", borderRadius: 18, boxShadow: "inset 0 0 0 1px var(--line)", marginBottom: 14 }}>
            <div style={{ width: 80, height: 80, borderRadius: 14, flex: "none", background: l.item.image_url ? `center/cover url(${l.item.image_url})` : (l.item.bg || "linear-gradient(160deg,#8fa86d,#7d985f)"), position: "relative", overflow: "hidden" }}>
              {!l.item.image_url && l.item.prod && <div style={{ position: "absolute", left: -6, top: 24, width: 50, height: 50, borderRadius: "50%", background: l.item.prod, filter: "blur(4px)", opacity: .8 }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 19 }}>{l.item.name}</span><span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 18 }}>{(l.unit * l.qty).toFixed(2)}</span></div>
              <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 3 }}>{l.size} · {l.milk} milk</div>
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
          <div onClick={onPlace} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "var(--accent)", color: "#F7F4EC", padding: "20px 0", borderRadius: 40, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 19, boxShadow: "0 16px 32px -12px rgba(94,122,77,.5)", cursor: "pointer" }}>Place Order <span style={{ fontSize: 20 }}>→</span></div>
        </div>
      )}
    </div>
  );
}


function Confirm({ orderNo, pickupName }) {
  return (
    <div style={{width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: 'var(--bg)', fontFamily: '\'Hanken Grotesk\',sans-serif', color: 'var(--ink)'}}>
      <div style={{position: 'absolute', width: '680px', height: '460px', left: '40px', top: '70px', borderRadius: '50%', background: 'radial-gradient(50% 50% at 50% 50%,rgba(94,122,77,.17),transparent 68%)', filter: 'blur(8px)', animation: 'calmGlow 7s ease-in-out infinite'}}></div>
      <div style={{position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '70px 48px 0'}}>
        <div style={{width: '104px', height: '104px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F7F4EC', boxShadow: '0 18px 42px -10px rgba(94,122,77,.5)'}}><svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"></path></svg></div>
        <div style={{fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '42px', lineHeight: '1.08', marginTop: '28px'}}>We're on it{pickupName ? ', ' + pickupName : ''}.</div>
        <div style={{fontSize: '16px', color: 'var(--muted)', marginTop: '14px', lineHeight: '1.6'}}>Your order is being made with care.<br />We'll call your name at the counter.</div>
        <div style={{display: 'flex', gap: '30px', marginTop: '28px'}}>
          <div><div style={{fontSize: '13px', fontWeight: '700', letterSpacing: '.1em', color: 'var(--muted)'}}>PICKUP</div><div style={{fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '28px', color: 'var(--accent)', marginTop: '2px'}}>{pickupName || 'Guest'}</div></div>
          <div style={{width: '1px', background: 'var(--line)'}}></div>
          <div><div style={{fontSize: '13px', fontWeight: '700', letterSpacing: '.1em', color: 'var(--muted)'}}>ORDER</div><div style={{fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '28px', color: 'var(--accent)', marginTop: '2px'}}>{'#' + (orderNo || '—')}</div></div>
          <div style={{width: '1px', background: 'var(--line)'}}></div>
          <div><div style={{fontSize: '13px', fontWeight: '700', letterSpacing: '.1em', color: 'var(--muted)'}}>READY IN</div><div style={{fontFamily: '\'Poppins\',sans-serif', fontWeight: '600', fontSize: '28px', color: 'var(--accent)', marginTop: '2px'}}>~6 min</div></div>
        </div>
      </div>
      <div style={{position: 'relative', margin: '42px 48px 0', padding: '26px 28px', background: 'var(--bg3)', border: '1px solid var(--line)', borderRadius: '22px'}}>
        <div style={{fontFamily: '\'Poppins\',sans-serif', fontSize: '13px', fontWeight: '700', letterSpacing: '.16em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '22px'}}>Order Status</div>
        <div style={{display: 'flex', gap: '18px', alignItems: 'flex-start'}}>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}><div style={{width: '22px', height: '22px', borderRadius: '50%', background: 'var(--accent)'}}></div><div style={{width: '2px', height: '42px', background: 'var(--accent)'}}></div></div>
          <div><div style={{fontSize: '17px', fontWeight: '700'}}>Order received</div><div style={{fontSize: '14px', color: 'var(--muted)', marginTop: '2px'}}>7:52 AM</div></div>
        </div>
        <div style={{display: 'flex', gap: '18px', alignItems: 'flex-start'}}>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}><div style={{width: '22px', height: '22px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 0 5px rgba(94,122,77,.18)'}}></div><div style={{width: '2px', height: '42px', background: 'var(--line)'}}></div></div>
          <div><div style={{fontSize: '17px', fontWeight: '700'}}>Being made <span style={{fontSize: '13px', color: 'var(--accent)'}}>· now</span></div><div style={{fontSize: '14px', color: 'var(--muted)', marginTop: '2px'}}>Whisking your matcha, pulling shots</div></div>
        </div>
        <div style={{display: 'flex', gap: '18px', alignItems: 'flex-start'}}>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}><div style={{width: '22px', height: '22px', borderRadius: '50%', background: 'transparent', border: '2px solid var(--line)'}}></div><div style={{width: '2px', height: '42px', background: 'var(--line)'}}></div></div>
          <div><div style={{fontSize: '17px', fontWeight: '700', color: 'var(--muted)'}}>Almost ready</div></div>
        </div>
        <div style={{display: 'flex', gap: '18px', alignItems: 'flex-start'}}>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}><div style={{width: '22px', height: '22px', borderRadius: '50%', background: 'transparent', border: '2px solid var(--line)'}}></div></div>
          <div><div style={{fontSize: '17px', fontWeight: '700', color: 'var(--muted)'}}>Ready at the counter</div></div>
        </div>
      </div>
      <div style={{position: 'absolute', left: '0', right: '0', bottom: '0', padding: '0 48px 34px', display: 'flex', gap: '14px'}}>
        <div style={{flex: '1', textAlign: 'center', background: 'var(--bg3)', boxShadow: 'inset 0 0 0 1.5px var(--line)', color: 'var(--ink)', padding: '18px 0', borderRadius: '40px', fontFamily: '\'Poppins\',sans-serif', fontSize: '17px', fontWeight: '600'}}>Add an item</div>
        <div style={{flex: '1', textAlign: 'center', background: 'var(--accent)', color: '#F7F4EC', padding: '18px 0', borderRadius: '40px', fontFamily: '\'Poppins\',sans-serif', fontSize: '17px', fontWeight: '600'}}>Track Order</div>
      </div>
    </div>
  );
}


// Relatable inline SVG icon per menu, matched by name keywords.
function menuIcon(name, active) {
  const c = active ? "#F5F1E6" : "currentColor";
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
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

export default function App() {
  const [screen, setScreen] = useState("welcome");
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
  const [placing, setPlacing] = useState(false);
  const [orderErr, setOrderErr] = useState(null);
  const addToBag = (line) => { setLines((p) => [...p, line]); setScreen("browse"); };
  const pickMenu = (m) => {
    const idx = menus ? menus.findIndex((x) => x.id === m.id) : 0;
    setActiveMenu(idx < 0 ? 0 : idx);
    setScreen("browse");
  };

  const placeOrder = async () => {
    if (placing) return;
    setPlacing(true); setOrderErr(null);
    const payload = {
      qr_token: getStoreToken() || null,
      order_type: "takeaway",
      pickup_name: pickupName || null,
      items: lines.map((l) => ({ item_id: l.item.id, qty: l.qty, size: l.size, milk: l.milk })),
    };
    try {
      const res = await fetch(SUPABASE_URL + "/functions/v1/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
      setOrderNo(data.order_no);
      setScreen("confirm");
    } catch (e) {
      // Fallback so the demo flow still completes if the function isn't deployed yet.
      console.warn("place-order failed, using local number:", e.message);
      setOrderErr(e.message);
      setOrderNo(Math.floor(200 + Math.random() * 800));
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

  const themeVars = THEMES[settings.theme] || THEMES.still;
  const themeBg = settings.theme === "chocoberry"
    ? "linear-gradient(160deg,#F3EADA,#F4E9DD)"
    : "linear-gradient(160deg,#EEF2E4,#E1E8D2)";
  return (
    <div style={{ ...themeVars, background: themeBg, fontFamily: "'Hanken Grotesk',sans-serif", height: "100dvh", width: "100vw", overflow: "hidden" }}>
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
            <div className={"screen" + (screen === "welcome" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "welcome" ? "block" : "none" }} onClick={() => setScreen("picker")}><Welcome bg={settings.welcome_bg_url || ""} /></div>
            <div className={"screen" + (screen === "picker" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "picker" ? "block" : "none" }}><MenuPicker menus={menus} bg={settings.picker_bg_url || settings.welcome_bg_url || ""} onPick={pickMenu} onClose={() => setScreen("welcome")} /></div>
            <div className={"screen" + (screen === "browse" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "browse" ? "block" : "none" }}><Browse data={data} menus={menus} activeMenu={activeMenu} setActiveMenu={setActiveMenu} activeCat={activeCat} setActiveCat={setActiveCat} onItem={openItem} onBag={() => setScreen("bag")} onBack={() => setScreen("picker")} onSearch={() => setSearchOpen(true)} onOpenDrawer={() => setScreen("drawer")} bagCount={lines.reduce((s,l)=>s+l.qty,0)} />{searchOpen && <SearchOverlay menus={menus} onItem={openItem} onClose={() => setSearchOpen(false)} />}</div>
            <div className={"screen" + (screen === "drawer" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "drawer" ? "block" : "none" }}><Drawer /></div>
            <div className={"screen" + (screen === "item" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "item" ? "block" : "none" }}><ItemDetail item={selItem} onAdd={addToBag} onClose={() => setScreen("browse")} /></div>
            <div className={"screen" + (screen === "bag" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "bag" ? "block" : "none" }}><Bag lines={lines} setLines={setLines} pickupName={pickupName} setPickupName={setPickupName} onBack={() => setScreen("browse")} onPlace={placeOrder} /></div>
            <div className={"screen" + (screen === "confirm" ? " active" : "")} style={{ position: "absolute", inset: 0, display: screen === "confirm" ? "block" : "none" }} onClick={() => { setLines([]); setPickupName(""); setOrderNo(null); setScreen("welcome"); }}><Confirm orderNo={orderNo} pickupName={pickupName} /></div>
          </div>
        </div>
      </div>

      </div>
  );
}
