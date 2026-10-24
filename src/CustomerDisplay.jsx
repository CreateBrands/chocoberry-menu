import { useEffect, useRef, useState } from "react";
import { CUSTOMER_SCREEN_EVENT, customerScreenTopic } from "./customerScreen.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY };

// /display?loc=<location id> — the customer-facing second screen on a till.
// The Customer Display app (android-customer-display) opens this on the
// Sunmi's rear screen; without it the rear screen just mirrors the till.
//
// Posters come from store settings, first match wins:
//   display_slides:<loc>  →  display_slides  →  kiosk_slides:<loc>  →  hero_slides:<loc>  →  hero_slides
// so a store shows the menu's own banner slides until someone uploads
// posters for it (Admin → store → Branding → Customer display).
// Seconds per poster: display_slide_seconds[:<loc>], default 8.
const CACHE = "cd_cache:";
const REFRESH_MS = 5 * 60 * 1000;
// The till repeats its state every 4s while taking payment; this long without
// a word means it has gone (closed, crashed, offline) and the posters return.
const STALE_MS = 13000;

function parseSlides(v) {
  if (!v) return null;
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    const ok = (Array.isArray(arr) ? arr : []).filter((s) => s && s.image_url);
    return ok.length ? ok : null;
  } catch { return null; }
}

export default function CustomerDisplay() {
  const qs = new URLSearchParams(window.location.search);
  const loc = qs.get("loc") || "";
  // The till this screen belongs to (its licence key), set in the Customer
  // Display app. Without it the screen follows any till at the store.
  const till = qs.get("till") || "";
  const [live, setLive] = useState(null);      // last state from the till, + receivedAt
  const [, setTick] = useState(0);
  // Live-link health. "SUBSCRIBED" means the till's messages will arrive.
  // If the link is down for 30s the client is thrown away and rebuilt (gen),
  // instead of trusting it to reconnect on its own.
  const rt = useRef({ status: "connecting", since: Date.now() });
  const [gen, setGen] = useState(0);

  // Listen to the till. Realtime client loaded only on this page, so the menu
  // and the till don't carry it.
  useEffect(() => {
    if (!loc || !SUPABASE_URL) return;
    let client, ch, dead = false;
    rt.current = { status: "connecting", since: Date.now() };
    import("@supabase/supabase-js").then(({ createClient }) => {
      if (dead) return;
      client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      ch = client.channel(customerScreenTopic(loc))
        .on("broadcast", { event: CUSTOMER_SCREEN_EVENT }, (msg) => {
          const st = msg && msg.payload;
          if (!st || (till && st.till && st.till !== till)) return;
          setLive({ ...st, receivedAt: Date.now() });
        })
        .subscribe((status) => { if (!dead && status !== rt.current.status) rt.current = { status, since: Date.now() }; });
    }).catch(() => { rt.current = { status: "load failed", since: rt.current.since }; });
    const t = setInterval(() => {
      setTick((n) => n + 1);
      if (rt.current.status !== "SUBSCRIBED" && Date.now() - rt.current.since > 30000) setGen((g) => g + 1);
    }, 1000);
    return () => { dead = true; clearInterval(t); try { if (client) client.removeAllChannels(); } catch { /* closing */ } };
  }, [loc, till, gen]);
  // Heartbeat to the Customer Display app (when running inside it): proves
  // this page is alive and says whether the live link is up. The app restarts
  // the page if the heartbeats stop.
  useEffect(() => {
    const beat = () => { try { if (window.CD && window.CD.alive) window.CD.alive(rt.current.status === "SUBSCRIBED" ? "live" : String(rt.current.status || "connecting")); } catch { /* not in the app */ } };
    beat(); const t = setInterval(beat, 5000); return () => clearInterval(t);
  }, []);
  const [cfg, setCfg] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE + loc) || "null"); } catch { return null; }
  });
  const [idx, setIdx] = useState(0);
  const [fits, setFits] = useState({}); // image_url -> "cover" | "contain"

  // Load settings now and every few minutes. On failure keep showing the last
  // good set (also cached across reboots), so a dropped connection never
  // blanks the screen in front of a customer.
  useEffect(() => {
    let alive = true;
    const keys = ["display_slides", "kiosk_slides", "hero_slides", "display_slide_seconds", "brand_name", "brand_logo_url", "brand_primary", "brand_tagline"];
    const wanted = keys.flatMap((k) => (loc ? [k, k + ":" + loc] : [k]));
    async function load() {
      try {
        const r = await fetch(SUPABASE_URL + "/rest/v1/menu_app_settings?select=key,value&key=in.(" + wanted.map((k) => '"' + k + '"').join(",") + ")", { headers: H, cache: "no-store" });
        if (!r.ok) throw new Error("http " + r.status);
        const rows = await r.json();
        const m = {}; for (const row of rows) m[row.key] = row.value;
        const store = (k) => (loc && m[k + ":" + loc] != null && m[k + ":" + loc] !== "" ? m[k + ":" + loc] : null);
        const pick = (k) => store(k) ?? m[k] ?? null;
        const slides = parseSlides(store("display_slides")) || parseSlides(m.display_slides)
          || parseSlides(store("kiosk_slides")) || parseSlides(store("hero_slides")) || parseSlides(m.hero_slides) || [];
        const secs = Number(pick("display_slide_seconds"));
        const next = {
          slides, seconds: secs >= 3 && secs <= 120 ? secs : 8,
          brand: pick("brand_name") || "Chocoberry", logo: pick("brand_logo_url") || "",
          primary: pick("brand_primary") || "#ec4899", tagline: pick("brand_tagline") || "",
        };
        if (!alive) return;
        setCfg(next);
        try { localStorage.setItem(CACHE + loc, JSON.stringify(next)); } catch { /* storage off */ }
      } catch { /* keep the last good set */ }
    }
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [loc]);

  const slides = (cfg && cfg.slides) || [];
  const n = slides.length;

  // Decide per image: a photo close to the screen's shape fills the screen;
  // a designed poster of another shape is shown whole, over a blurred copy of
  // itself, so its text is never cropped.
  useEffect(() => {
    for (const s of slides) {
      if (fits[s.image_url]) continue;
      const im = new Image();
      im.onload = () => {
        const screen = window.innerWidth / Math.max(1, window.innerHeight);
        const pic = im.naturalWidth / Math.max(1, im.naturalHeight);
        const close = Math.abs(pic - screen) / screen < 0.18;
        setFits((f) => ({ ...f, [s.image_url]: close ? "cover" : "contain" }));
      };
      im.src = s.image_url;
    }
  }, [slides]); // eslint-disable-line

  useEffect(() => {
    if (n < 2) { setIdx(0); return; }
    const t = setInterval(() => setIdx((i) => (i + 1) % n), (cfg.seconds || 8) * 1000);
    return () => clearInterval(t);
  }, [n, cfg && cfg.seconds]); // eslint-disable-line

  const base = { position: "fixed", inset: 0, overflow: "hidden", background: "#0b0b0d", cursor: "none", userSelect: "none", WebkitUserSelect: "none" };

  // ?demo=order|cash|card|paid shows a payment screen with sample data, for
  // Admin's preview links and for checking the layout without taking money.
  const demo = qs.get("demo");
  if (demo) return <LiveView st={demoState(demo)} cfg={cfg || {}} />;
  const showLive = live && live.view && live.view !== "idle" && Date.now() - live.receivedAt < STALE_MS;
  if (showLive) return <LiveView st={live} cfg={cfg || {}} />;

  if (!n) {
    const c = cfg || { brand: "Chocoberry", primary: "#ec4899", logo: "", tagline: "" };
    return (
      <div style={{ ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 40%, " + c.primary + "33, #0b0b0d 70%)", color: "#fff", fontFamily: "'Poppins',system-ui,sans-serif" }}>
        {c.logo ? <img src={c.logo} alt="" style={{ maxWidth: "40vw", maxHeight: "30vh", objectFit: "contain" }} />
          : <div style={{ fontSize: "9vh", fontWeight: 900, letterSpacing: "-.02em" }}>{c.brand}</div>}
        {c.tagline && <div style={{ marginTop: "3vh", fontSize: "3.2vh", opacity: .75 }}>{c.tagline}</div>}
      </div>
    );
  }

  return (
    <div style={base}>
      <style>{`@keyframes cdZoom{from{transform:scale(1)}to{transform:scale(1.05)}}`}</style>
      {slides.map((s, i) => {
        const on = i === idx % n;
        const fit = fits[s.image_url] || "contain";
        const caption = s.title || s.sub || s.tag;
        return (
          <div key={i + s.image_url} style={{ position: "absolute", inset: 0, opacity: on ? 1 : 0, transition: "opacity 1.1s ease" }}>
            {fit === "contain" && (
              <div style={{ position: "absolute", inset: "-6%", backgroundImage: "url(" + JSON.stringify(s.image_url) + ")", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(38px) brightness(.55) saturate(1.2)" }} />
            )}
            <img src={s.image_url} alt="" draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, animation: on && fit === "cover" ? "cdZoom " + ((cfg.seconds || 8) + 1.5) + "s ease-out forwards" : "none" }} />
            {caption && (
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14vh 6vw 7vh", background: "linear-gradient(transparent, rgba(0,0,0,.72))", color: "#fff", fontFamily: "'Poppins',system-ui,sans-serif" }}>
                {s.tag && <div style={{ display: "inline-block", fontSize: "2.2vh", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", padding: ".6vh 1.4vh", borderRadius: 999, background: (cfg && cfg.primary) || "#ec4899", marginBottom: "1.6vh" }}>{s.tag}</div>}
                {s.title && <div style={{ fontSize: "6.4vh", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-.01em" }}>{s.title}</div>}
                {s.sub && <div style={{ fontSize: "3vh", marginTop: "1.2vh", opacity: .88 }}>{s.sub}</div>}
              </div>
            )}
          </div>
        );
      })}
      {n > 1 && (
        <div style={{ position: "absolute", bottom: "2.6vh", right: "3vw", display: "flex", gap: 8 }}>
          {slides.map((_, i) => <span key={i} style={{ width: i === idx % n ? 22 : 8, height: 8, borderRadius: 4, background: "#fff", opacity: i === idx % n ? .9 : .4, transition: "all .4s" }} />)}
        </div>
      )}
    </div>
  );
}

// ---- What the customer sees while paying ----
const FONT = "'Poppins',system-ui,sans-serif";

function LiveView({ st, cfg }) {
  const accent = cfg.primary || "#ec4899";
  const shell = { position: "fixed", inset: 0, overflow: "hidden", background: "#faf7f2", color: "#1b1b1f", fontFamily: FONT, cursor: "none", userSelect: "none", WebkitUserSelect: "none" };
  const Brand = ({ size = 5 }) => cfg.logo
    ? <img src={cfg.logo} alt="" style={{ height: size + "vh", maxWidth: "30vw", objectFit: "contain" }} />
    : <div style={{ fontWeight: 900, fontSize: size * 0.8 + "vh", letterSpacing: "-.02em" }}>{cfg.brand || "Chocoberry"}</div>;

  if (st.view === "paid") {
    return (
      <div style={{ ...shell, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", background: "radial-gradient(circle at 50% 35%, " + accent + "26, #faf7f2 65%)" }}>
        <style>{`@keyframes cdPop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}`}</style>
        <div style={{ width: "16vh", height: "16vh", borderRadius: "50%", background: "#2f8f5b", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9vh", fontWeight: 900, animation: "cdPop .6s ease-out" }}>✓</div>
        <div style={{ fontSize: "9vh", fontWeight: 900, marginTop: "4vh", letterSpacing: "-.02em" }}>Thank you!</div>
        <div style={{ fontSize: "3.6vh", color: "#5b5b66", marginTop: "1.4vh" }}>Paid {st.total} by {st.method === "cash" ? "cash" : "card"}</div>
        {st.change && (
          <div style={{ marginTop: "4vh", padding: "2.4vh 5vh", borderRadius: "2.4vh", background: "#fff", boxShadow: "0 1vh 4vh rgba(0,0,0,.08)" }}>
            <div style={{ fontSize: "2.4vh", fontWeight: 800, letterSpacing: ".12em", color: "#5b5b66" }}>YOUR CHANGE</div>
            <div style={{ fontSize: "8vh", fontWeight: 900, color: "#2f8f5b", lineHeight: 1.1 }}>{st.change}</div>
          </div>
        )}
        <div style={{ position: "absolute", bottom: "5vh" }}><Brand size={4.5} /></div>
      </div>
    );
  }

  const o = st.order;
  const card = st.view === "card";
  const processing = card && (st.status === "IN_PROGRESS" || st.status === "CANCELLING");
  const due = card ? st.amount : (o ? o.due : "");
  const items = (o && o.items) || [];
  const maxRows = 9;
  const shown = items.length > maxRows ? items.slice(0, maxRows - 1) : items;
  const hidden = items.length - shown.length;

  return (
    <div style={{ ...shell, display: "flex" }}>
      <style>{`@keyframes cdPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.85}}@keyframes cdSpin{to{transform:rotate(360deg)}}`}</style>
      {/* The order */}
      <div style={{ flex: "1 1 56%", padding: "6vh 4vw 5vh 5vw", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3vh" }}>
          <Brand />
          {o && <div style={{ fontSize: "2.6vh", color: "#5b5b66", fontWeight: 600 }}>{o.type}{o.table ? " · " + o.table : ""}{o.no ? " · #" + o.no : ""}</div>}
        </div>
        <div style={{ fontSize: "2.3vh", fontWeight: 800, letterSpacing: ".14em", color: "#8a8a94", marginBottom: "1.6vh" }}>YOUR ORDER</div>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {shown.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "1.6vw", padding: "1.35vh 0", borderBottom: "1px solid #ebe6dd" }}>
              <div style={{ fontSize: "2.9vh", fontWeight: 800, color: accent, minWidth: "3.2vw" }}>{it.q}×</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "2.9vh", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.n}</div>
                {it.m && <div style={{ fontSize: "2.1vh", color: "#7a7a85", marginTop: ".3vh", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.m}</div>}
              </div>
              <div style={{ fontSize: "2.9vh", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{it.t}</div>
            </div>
          ))}
          {hidden > 0 && <div style={{ fontSize: "2.4vh", color: "#7a7a85", padding: "1.4vh 0" }}>+ {hidden} more item{hidden === 1 ? "" : "s"}</div>}
        </div>
      </div>

      {/* The money */}
      <div style={{ flex: "0 0 40%", background: "#1b1b1f", color: "#fff", padding: "6vh 4vw", display: "flex", flexDirection: "column" }}>
        {o && (
          <div style={{ fontSize: "2.6vh", color: "#c9c9d1" }}>
            <Row l="Subtotal" r={o.subtotal} />
            {o.itemsDiscount && <Row l="Item discounts" r={"−" + o.itemsDiscount} c="#8fe0b0" />}
            {o.discount && <Row l={o.discountLabel} r={"−" + o.discount} c="#8fe0b0" />}
            {o.paid && <Row l="Already paid" r={"−" + o.paid} c="#f5c47a" />}
          </div>
        )}
        <div style={{ marginTop: "auto" }}>
          {card ? (
            <div style={{ textAlign: "center", marginBottom: "4vh" }}>
              {processing
                ? <div style={{ width: "10vh", height: "10vh", margin: "0 auto", borderRadius: "50%", border: ".9vh solid rgba(255,255,255,.2)", borderTopColor: accent, animation: "cdSpin 1s linear infinite" }} />
                : <div style={{ fontSize: "11vh", lineHeight: 1, animation: "cdPulse 1.6s ease-in-out infinite" }}>💳</div>}
              <div style={{ fontSize: "3.6vh", fontWeight: 800, marginTop: "2.4vh", lineHeight: 1.25 }}>{processing ? "Processing — please wait" : "Tap, insert or swipe your card"}</div>
              {!processing && <div style={{ fontSize: "2.3vh", color: "#c9c9d1", marginTop: "1vh" }}>on the card machine</div>}
            </div>
          ) : st.tendered ? (
            <div style={{ marginBottom: "3vh", fontSize: "2.8vh" }}>
              <Row l="Cash given" r={st.tendered} />
              {st.change && <Row l="Change" r={st.change} c="#8fe0b0" big />}
            </div>
          ) : null}
          <div style={{ borderTop: "1px solid rgba(255,255,255,.18)", paddingTop: "3vh" }}>
            <div style={{ fontSize: "2.4vh", fontWeight: 800, letterSpacing: ".14em", color: "#c9c9d1" }}>{card ? "AMOUNT" : "TO PAY"}</div>
            <div style={{ fontSize: "10.5vh", fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{due}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ l, r, c, big }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: ".9vh 0", color: c || "inherit", fontWeight: big ? 900 : 600, fontSize: big ? "4.2vh" : undefined }}>
      <span>{l}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{r}</span>
    </div>
  );
}

function demoState(kind) {
  const order = {
    no: "84", type: "Dine in", table: "BB3",
    items: [
      { n: "Caviar Tiramisu", q: 1, m: "", t: "£8.95" },
      { n: "Chocorocher Waffle", q: 1, m: "Belgian Milk Chocolate · Oreo Dust · Whipped Cream", t: "£9.95" },
      { n: "Passion Fruit Mocktail", q: 2, m: "", t: "£9.90" },
      { n: "Kanafeh Strawberry Cup", q: 1, m: "No pistachio dust", t: "£6.95" },
    ],
    subtotal: "£35.75", discount: "£3.58", discountLabel: "Discount (10%)", itemsDiscount: "", paid: "", due: "£32.17", dueValue: 32.17,
  };
  if (kind === "paid") return { view: "paid", total: "£32.17", method: "cash", change: "£7.83" };
  if (kind === "card") return { view: "card", amount: "£32.17", status: "NEW", order };
  if (kind === "cash") return { view: "order", stage: "cash", order, tendered: "£40.00", change: "£7.83" };
  return { view: "order", stage: "method", order, tendered: "", change: "" };
}
