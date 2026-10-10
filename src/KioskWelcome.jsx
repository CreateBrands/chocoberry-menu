import React, { useEffect, useRef, useState } from "react";

// ============================================================
// KIOSK WELCOME — the attract loop and the first tap
// ------------------------------------------------------------
// Built from the Tove kiosk design (1080x1920 portrait). Everything is laid
// out at those design pixels and multiplied by one scale factor `k` taken from
// the real screen width, so the proportions hold on any portrait kiosk: the
// photo area absorbs whatever height is left over, the cream panel keeps its
// designed height. Landscape is not a kiosk shape — App.jsx falls back to the
// plain welcome screen there.
//
// Content comes from settings, so Tove and Chocoberry can differ per store:
//   hero_slides          the carousel: image_url, tag, title, sub, parts, tone
//   welcome_logo_url     wordmark inside the dark badge (text logo if unset)
//   kiosk_headline       "Hej! What can we<br>make you today?"
//   kiosk_marquee        the tilted ticker across the top of the panel
//   kiosk_greetings      "God morgon|Good afternoon|God kvall"
//   kiosk_address        the footer line; hidden when blank
//   kiosk_rewards        "off" hides the rewards strip
//   kiosk_slide_seconds  how long each slide holds
// ============================================================

// Per-slide palettes from the design. The whole screen takes the slide's
// background, so a photo can be sat on cream, deep green or tan.
const TONES = {
  cream: { bg: "#F2E4D7", ink: "#1B241F", sub: "#5E6B63", chip: "rgba(52,77,66,.30)", chipFill: "rgba(255,251,242,.55)", tagBg: "#344D42", tagInk: "#FFFBF2", top: null },
  green: { bg: "#3E6F47", ink: "#FFFBF2", sub: "#DCE8D9", chip: "rgba(255,251,242,.45)", chipFill: "rgba(255,251,242,.10)", tagBg: "#B3D2AE", tagInk: "#344D42", top: "#E4E1DA" },
  tan: { bg: "#D5B582", ink: "#1B241F", sub: "#3E3526", chip: "rgba(27,36,31,.25)", chipFill: "rgba(255,251,242,.45)", tagBg: "#344D42", tagInk: "#FFFBF2", top: "#809DA5" },
};

const rgba = (hex, a) => {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(0,0,0,${a})`;
  const v = parseInt(h, 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
};
const fadeTo = (hex) => `linear-gradient(180deg, ${rgba(hex, 0)} 0%, ${rgba(hex, .85)} 60%, ${rgba(hex, 1)} 100%)`;
const topFade = (hex) => (hex ? `linear-gradient(180deg, ${rgba(hex, .55)} 0%, ${rgba(hex, 0)} 100%)` : "none");

// The two line-art icons on the tiles. Drawn rather than loaded so they stay
// crisp at 44px and need no icon font.
export const CupIcon = ({ size, stroke }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18h24v10a10 10 0 0 1-10 10h-4A10 10 0 0 1 9 28z" /><path d="M33 21h3a5 5 0 0 1 0 10h-3" /><path d="M6 43h32" /><path d="M17 6c-2 3 2 5 0 8" /><path d="M24 6c-2 3 2 5 0 8" />
  </svg>
);
export const BagIcon = ({ size, stroke }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 14h24l-3 30H15z" /><path d="M10 9h28v5H10z" /><path d="M14 24h20" /><path d="M26 9l2-5h6" />
  </svg>
);
const ArrowIcon = ({ size, stroke, delay }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ animation: `kwNudge 2.4s ease-in-out ${delay || "0s"} infinite` }}>
    <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
  </svg>
);

export default function KioskWelcome({ slides, w = {}, onStart, accent = "#344D42", chip = "#B3D2AE", panelBg = "#FFFBF2" }) {
  const wrapRef = useRef(null);
  const [k, setK] = useState(() => {
    try { return Math.max(.3, Math.min(1.6, window.innerWidth / 1080)); } catch { return 1; }
  });
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState(() => new Date());

  // One scale factor off the real width. ResizeObserver rather than a resize
  // listener so rotating or an on-screen keyboard both land correctly.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth || 1080;
      setK(Math.max(.3, Math.min(1.6, width / 1080)));
    };
    measure();
    let ro = null;
    try { ro = new ResizeObserver(measure); ro.observe(el); } catch { window.addEventListener("resize", measure); }
    return () => { if (ro) ro.disconnect(); else window.removeEventListener("resize", measure); };
  }, []);

  const dur = Math.max(3, Number(w.kiosk_slide_seconds ?? 7) || 7);
  const n = Math.max(1, slides.length);
  useEffect(() => {
    const t = setInterval(() => { setTick((x) => x + 1); setClock(new Date()); }, 1000);
    return () => clearInterval(t);
  }, []);
  const slide = n > 1 ? Math.floor(tick / dur) % n : 0;
  const cur = slides[slide] || slides[0] || {};
  const tone = TONES[cur.tone] || TONES.cream;

  const s = (v) => Math.round(v * k);
  const panelH = s(708);
  const band = s(202);          // palette showing between photo and panel
  const px = (v) => s(v) + "px";

  const h = clock.getHours();
  const greetings = String(w.kiosk_greetings || "God morgon|Good afternoon|God kväll").split("|");
  const greeting = (h < 12 ? greetings[0] : h < 17 ? greetings[1] : greetings[2]) || greetings[0] || "";
  const hhmm = String(h).padStart(2, "0") + ":" + String(clock.getMinutes()).padStart(2, "0");
  const marquee = w.kiosk_marquee || "MATCHA ✦ COFFEE ✦ CALM ENERGY ✦ SCANDINAVIAN-INSPIRED ✦ BORN IN BRITAIN ✦ KYOTO UJI CEREMONIAL MATCHA ✦ FOCACCIA BAKED DAILY ✦";
  const headline = w.kiosk_headline || "Hej! What can we<br>make you today?";
  const address = String(w.kiosk_address || "").trim();
  const showRewards = String(w.kiosk_rewards || "") !== "off";

  const head = "var(--font-head, 'Poppins', sans-serif)";
  const body = "var(--font-body, 'Hanken Grotesk', sans-serif)";

  // A tile: dark for eat in, celadon for take away, matching the design.
  const tile = (dark, Icon, title, sub, dine, nudgeDelay) => {
    const ink = dark ? panelBg : "#1B241F";
    const subInk = dark ? "#DCE8D9" : accent;
    return (
      <button type="button" onClick={() => onStart(dine)}
        style={{
          position: "relative", height: px(224), boxSizing: "border-box", padding: `${px(30)} ${px(34)}`, border: "none",
          borderRadius: px(40), background: dark ? accent : chip, color: ink, fontFamily: body, textAlign: "left",
          display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: "pointer", overflow: "hidden",
          boxShadow: `0 ${px(22)} ${px(40)} -${px(22)} ${rgba(accent, dark ? .8 : .55)}`,
        }}>
        <svg aria-hidden="true" width={px(260)} height={px(260)} viewBox="0 0 100 100" style={{ position: "absolute", right: "-" + px(50), top: "-" + px(60), animation: `kwSpin 60s linear infinite${dark ? "" : " reverse"}` }}>
          <circle cx="50" cy="50" r="46" fill="none" stroke={dark ? rgba(chip, .18) : rgba(accent, .14)} strokeWidth="2" />
          <circle cx="50" cy="50" r="34" fill="none" stroke={dark ? rgba(chip, .18) : rgba(accent, .14)} strokeWidth="2" strokeDasharray="4 6" />
        </svg>
        <div style={{ width: px(76), height: px(76), borderRadius: px(38), background: dark ? rgba(chip, .18) : rgba(accent, .12), display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={px(42)} stroke={dark ? chip : accent} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: px(12) }}>
          <div style={{ display: "flex", flexDirection: "column", gap: px(6), minWidth: 0 }}>
            <span style={{ fontFamily: head, fontSize: px(46), fontWeight: 500, lineHeight: 1, letterSpacing: "-.02em" }}>{title}</span>
            <span style={{ fontSize: px(22), fontWeight: dark ? 300 : 400, color: subInk }}>{sub}</span>
          </div>
          <div style={{ flex: "none", width: px(64), height: px(64), borderRadius: px(32), background: dark ? chip : accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ArrowIcon size={px(28)} stroke={dark ? accent : panelBg} delay={nudgeDelay} />
          </div>
        </div>
      </button>
    );
  };

  const ringLen = 276.5;

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: tone.bg, transition: "background 1100ms ease", fontFamily: body, color: tone.ink }}>
      <style>{`
        @keyframes kwMarq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes kwRing{from{stroke-dashoffset:${ringLen}}to{stroke-dashoffset:0}}
        @keyframes kwPulse{0%{box-shadow:0 0 0 0 ${rgba(accent, .5)}}100%{box-shadow:0 0 0 ${px(22)} ${rgba(accent, 0)}}}
        @keyframes kwSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes kwNudge{0%,100%{transform:translateX(0)}50%{transform:translateX(${px(6)})}}
        @media (prefers-reduced-motion: reduce){.kw *{animation:none !important;transition:none !important}}
      `}</style>

      <div className="kw" style={{ position: "absolute", inset: 0 }}>
        {/* ---- the photographs ---- */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: `calc(100% - ${panelH + band}px)`, overflow: "hidden" }}>
          {slides.map((d, i) => {
            const on = i === slide;
            const t = TONES[d.tone] || TONES.cream;
            return (
              <div key={i} style={{ position: "absolute", inset: 0, overflow: "hidden", transition: "opacity 1100ms ease", opacity: on ? 1 : 0 }}>
                {d.image_url
                  ? <img src={d.image_url} alt={d.title || ""} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: d.pos || "50% 40%", transformOrigin: d.origin || "60% 42%", transform: on ? "scale(1.14)" : "scale(1)", transition: on ? `transform ${dur + 1.2}s cubic-bezier(.25,.1,.25,1)` : "transform 0s linear 1.2s" }} />
                  : <div style={{ position: "absolute", inset: 0, background: d.bg || `linear-gradient(160deg, ${t.bg}, ${rgba(accent, .5)})` }} />}
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: px(300), background: fadeTo(t.bg) }} />
                <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: px(220), background: topFade(t.top) }} />
              </div>
            );
          })}
        </div>

        {/* ---- logo badge, greeting and clock ---- */}
        <div style={{ position: "absolute", left: 0, right: 0, top: px(36), height: px(104), padding: `0 ${px(56)}`, boxSizing: "border-box", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ height: px(92), boxSizing: "border-box", padding: `${px(18)} ${px(30)}`, borderRadius: px(28), background: accent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 ${px(12)} ${px(30)} -${px(12)} rgba(27,36,31,.45)` }}>
            {w.welcome_logo_url
              ? <img src={w.welcome_logo_url} alt="" style={{ height: px(56), width: "auto", display: "block" }} />
              : <span style={{ fontFamily: head, fontSize: px(42), fontWeight: 500, letterSpacing: "-.02em", color: panelBg }} dangerouslySetInnerHTML={{ __html: w.welcome_logo_text || "tove" }} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: px(14), height: px(60), padding: `0 ${px(8)} 0 ${px(24)}`, borderRadius: px(30), background: rgba(panelBg, .72), boxShadow: `0 ${px(10)} ${px(30)} -${px(14)} rgba(27,36,31,.35)` }}>
            <div style={{ fontSize: px(24), fontWeight: 400, color: accent }}>{greeting}</div>
            <div style={{ height: px(46), padding: `0 ${px(18)}`, borderRadius: px(23), background: accent, color: panelBg, display: "flex", alignItems: "center", fontFamily: head, fontSize: px(22), fontWeight: 500, letterSpacing: ".04em" }}>{hhmm}</div>
          </div>
        </div>

        {/* ---- the slide rail: thumbnails with a countdown ring ---- */}
        {slides.length > 1 && (
          <div style={{ position: "absolute", right: px(44), top: px(250), display: "flex", flexDirection: "column", gap: px(18) }}>
            {slides.map((d, i) => {
              const on = i === slide;
              const t = TONES[d.tone] || TONES.cream;
              return (
                <button key={i} type="button" aria-label={"Show " + (d.title || "slide " + (i + 1))} onClick={() => setTick(i * dur)}
                  style={{ position: "relative", width: px(96), height: px(96), padding: 0, border: "none", background: "transparent", cursor: "pointer", transition: "transform 600ms ease, opacity 600ms ease", transform: on ? "scale(1.12)" : "scale(.92)", opacity: on ? 1 : .82 }}>
                  <div style={{ position: "absolute", left: px(8), top: px(8), width: px(80), height: px(80), borderRadius: px(40), overflow: "hidden", background: t.bg, boxShadow: `0 0 0 ${px(3)} ${panelBg}, 0 ${px(12)} ${px(26)} -${px(10)} rgba(27,36,31,.55)` }}>
                    {d.image_url
                      ? <img src={d.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: d.pos || "50% 40%" }} />
                      : <div style={{ position: "absolute", inset: 0, background: d.bg || t.bg }} />}
                  </div>
                  {on && (
                    <svg aria-hidden="true" width={px(96)} height={px(96)} viewBox="0 0 96 96" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
                      <circle cx="48" cy="48" r="44" fill="none" stroke={rgba(panelBg, .5)} strokeWidth="4" />
                      <circle cx="48" cy="48" r="44" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeDasharray={ringLen} strokeDashoffset={ringLen} style={{ animation: `kwRing ${dur}s linear forwards` }} />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ---- the caption for the slide on screen ---- */}
        <div style={{ position: "absolute", left: px(60), right: px(60), bottom: panelH + s(144), display: "flex", flexDirection: "column", gap: px(18), color: tone.ink, pointerEvents: "none" }}>
          {(cur.tag || slides.length > 1) && (
            <div style={{ display: "flex", alignItems: "center", gap: px(16) }}>
              {cur.tag && <div style={{ height: px(42), padding: `0 ${px(20)}`, borderRadius: px(21), background: tone.tagBg, color: tone.tagInk, display: "flex", alignItems: "center", fontSize: px(18), fontWeight: 600, letterSpacing: ".24em" }}>{cur.tag}</div>}
              {slides.length > 1 && <div style={{ fontFamily: head, fontSize: px(20), fontWeight: 400, letterSpacing: ".1em", color: tone.sub }}>{String(slide + 1).padStart(2, "0")} — {String(n).padStart(2, "0")}</div>}
            </div>
          )}
          {cur.title && <div style={{ fontFamily: head, fontSize: px(72), fontWeight: 500, lineHeight: 1.02, letterSpacing: "-.03em" }}>{cur.title}</div>}
          {(() => {
            // "parts" is the chip row: either an array or a comma-separated line.
            // Falls back to the slide's subtitle so older slides still look right.
            const raw = cur.parts != null ? cur.parts : "";
            const parts = (Array.isArray(raw) ? raw : String(raw).split(/[,·]/)).map((x) => String(x).trim()).filter(Boolean);
            if (parts.length) return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: px(10) }}>
                {parts.map((p, j) => (
                  <div key={j} style={{ height: px(44), padding: `0 ${px(20)}`, borderRadius: px(22), border: `${Math.max(1, s(1.5))}px solid ${tone.chip}`, background: tone.chipFill, display: "flex", alignItems: "center", fontSize: px(21), fontWeight: 400 }}>{p}</div>
                ))}
              </div>
            );
            if (cur.sub) return <div style={{ fontSize: px(24), fontWeight: 400, color: tone.sub }}>{cur.sub}</div>;
            return null;
          })()}
        </div>

        {/* ---- the cream panel: where the customer actually taps ---- */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: panelH, background: panelBg, borderRadius: `${px(60)} ${px(60)} 0 0`, boxShadow: `0 -${px(24)} ${px(60)} -${px(20)} rgba(27,36,31,.28)` }}>
          <div style={{ position: "absolute", left: "-" + px(60), right: "-" + px(60), top: "-" + px(40), height: px(76), background: chip, transform: "rotate(-2deg)", overflow: "hidden", display: "flex", alignItems: "center", boxShadow: `0 ${px(10)} ${px(30)} rgba(27,36,31,.14)` }}>
            <div style={{ flex: "none", display: "flex", whiteSpace: "nowrap", animation: "kwMarq 36s linear infinite", fontFamily: head, fontSize: px(25), fontWeight: 500, letterSpacing: ".14em", color: accent }}>
              <span style={{ paddingRight: px(48) }}>{marquee}</span>
              <span style={{ paddingRight: px(48) }}>{marquee}</span>
            </div>
          </div>

          <div style={{ position: "absolute", left: px(56), right: px(56), top: px(74), bottom: px(30), display: "flex", flexDirection: "column", gap: px(20) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: px(24) }}>
              <h1 style={{ margin: 0, fontFamily: head, fontSize: px(58), fontWeight: 400, lineHeight: 1.06, letterSpacing: "-.03em", color: "#1B241F" }} dangerouslySetInnerHTML={{ __html: headline }} />
              <div style={{ display: "flex", alignItems: "center", gap: px(14), paddingBottom: px(10), flex: "none" }}>
                <div style={{ width: px(14), height: px(14), borderRadius: px(7), background: accent, animation: "kwPulse 1.8s ease-out infinite" }} />
                <div style={{ fontSize: px(22), fontWeight: 600, letterSpacing: ".2em", color: accent }}>{w.kiosk_footer || "TAP TO START"}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: px(22) }}>
              {tile(true, CupIcon, w.kiosk_eatin_label || "Eat in", w.kiosk_eatin_sub || "Stay a while, slow down", true, "0s")}
              {tile(false, BagIcon, w.kiosk_takeaway_label || "Take away", w.kiosk_takeaway_sub || "Freshly made, ready to go", false, "1.2s")}
            </div>

            {showRewards && (
              <div style={{ height: px(104), boxSizing: "border-box", padding: `0 ${px(32)}`, borderRadius: px(32), background: "#F2ECDD", display: "flex", alignItems: "center", justifyContent: "space-between", gap: px(24) }}>
                <div style={{ display: "flex", flexDirection: "column", gap: px(4) }}>
                  <div style={{ fontSize: px(17), fontWeight: 600, letterSpacing: ".28em", color: accent }}>{w.kiosk_rewards_label || "TOVE REWARDS"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: px(14) }}>
                    <div style={{ fontFamily: head, fontSize: px(30), fontWeight: 500, letterSpacing: "-.02em", color: "#1B241F" }}>{w.kiosk_rewards_title || "Coming soon"}</div>
                    <div style={{ height: px(34), padding: `0 ${px(14)}`, borderRadius: px(17), background: chip, color: accent, display: "flex", alignItems: "center", fontSize: px(15), fontWeight: 600, letterSpacing: ".2em" }}>{w.kiosk_rewards_pill || "STAY TUNED"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: px(10), opacity: .35 }} aria-hidden="true">
                  {[0, 1, 2].map((i) => <div key={i} style={{ width: px(32), height: px(32), borderRadius: px(16), background: accent }} />)}
                  {[3, 4].map((i) => <div key={i} style={{ width: px(32), height: px(32), borderRadius: px(16), border: `${Math.max(1, s(2))}px solid ${accent}`, boxSizing: "border-box" }} />)}
                  <div style={{ width: px(46), height: px(46), borderRadius: px(23), background: chip, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width={px(24)} height={px(24)} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-1.5 12h-9z" /><path d="M5 5h14v3H5z" /></svg>
                  </div>
                </div>
              </div>
            )}

            {address && (
              <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                <div style={{ fontSize: px(21), fontWeight: 400, letterSpacing: ".04em", color: "#5E6B63" }}>{address}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
