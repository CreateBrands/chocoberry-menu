import { useEffect, useRef, useState } from "react";

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

function parseSlides(v) {
  if (!v) return null;
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    const ok = (Array.isArray(arr) ? arr : []).filter((s) => s && s.image_url);
    return ok.length ? ok : null;
  } catch { return null; }
}

export default function CustomerDisplay() {
  const loc = new URLSearchParams(window.location.search).get("loc") || "";
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
