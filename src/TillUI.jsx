// TILL UI 2026-10-25 — one look for the till's sheets (Shift, Open drawer,
// Cash): the till's own dark-teal header and Hanken Grotesk type, big touch
// keypads with press feedback, a step strip, drawn icons, banknote and coin
// tiles, and the same buttons, chips, figures and result banners everywhere.
// Presentation only — no money or rules live here.

import { useEffect, useRef } from "react";
import { currencySymbol } from "./money.js";

export const U = {
  ink: "#12151c", sub: "#5b6472", faint: "#8a93a0", line: "#e5e7eb", soft: "#f4f5f7", canvas: "#eceef1",
  dark: "#0f2e29", teal: "#0d9488", tealL: "#14b8a6", mint: "#ccfbf1", mintT: "#5eead4",
  good: "#15803d", goodBg: "#f0fdf4", bad: "#b91c1c", badBg: "#fef2f2", over: "#1d4ed8", overBg: "#eff6ff",
  warn: "#b45309", warnBg: "#fffbeb", amber: "#fde68a",
};
export const FONT = "'Hanken Grotesk',system-ui,-apple-system,sans-serif";
export const NUM = { fontVariantNumeric: "tabular-nums" };
const grad = "linear-gradient(135deg," + U.tealL + "," + U.teal + ")";

// Motion and press states can't be inline styles; one small sheet, added once.
const CSS = `
@keyframes tu-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
@keyframes tu-fade{from{opacity:0}to{opacity:1}}
@keyframes tu-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(4px)}}
@keyframes tu-pop{0%{transform:scale(.4)}70%{transform:scale(1.18)}100%{transform:scale(1)}}
@keyframes tu-caret{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes tu-tick{from{stroke-dashoffset:40}to{stroke-dashoffset:0}}
@keyframes tu-spin{to{transform:rotate(360deg)}}
@keyframes tu-step{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
@keyframes tu-ring{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
.tu-overlay{animation:tu-fade .16s ease-out}
.tu-card{animation:tu-in .2s cubic-bezier(.2,.8,.2,1)}
.tu-key{transition:transform .06s ease,background .1s ease,box-shadow .1s ease}
.tu-key:active{transform:scale(.95);background:#e7f8f5 !important;box-shadow:inset 0 2px 6px rgba(13,148,136,.18) !important}
.tu-btn{transition:transform .06s ease,filter .12s ease}
.tu-btn:active{transform:scale(.98);filter:brightness(1.08)}
.tu-tile{transition:border-color .12s ease,background .12s ease,transform .06s ease}
.tu-tile:active{transform:scale(.98)}
.tu-chip{transition:background .12s ease,color .12s ease,border-color .12s ease}
.tu-shake{animation:tu-shake .38s ease}
.tu-stepin{animation:tu-step .22s cubic-bezier(.2,.8,.2,1)}
.tu-spin{width:16px;height:16px;border-radius:50%;border:2.5px solid currentColor;border-right-color:transparent;animation:tu-spin .7s linear infinite;display:inline-block}
.tu-dot{animation:tu-pop .18s ease-out}
.tu-caret{display:inline-block;width:3px;height:.9em;background:${U.teal};margin-left:4px;vertical-align:-.05em;border-radius:2px;animation:tu-caret 1s steps(1) infinite}
.tu-done-ring{animation:tu-ring .3s cubic-bezier(.2,.8,.2,1)}
.tu-done-tick{stroke-dasharray:40;animation:tu-tick .35s .12s ease-out both}
@media (prefers-reduced-motion: reduce){.tu-stepin,.tu-overlay,.tu-card,.tu-shake,.tu-dot,.tu-done-ring,.tu-done-tick{animation:none}}
`;
function Styles() { return <style>{CSS}</style>; }
// A tiny buzz on tills that have one (Sunmi, Android tablets); silent elsewhere.
export function tap() { try { navigator.vibrate && navigator.vibrate(8); } catch { /* not supported */ } }

// ---------------- icons (drawn, crisp at any size) ----------------
const S = (d, sz = 22, sw = 2) => (props) => (
  <svg width={props.size || sz} height={props.size || sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.sw || sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const Icon = {
  clock: S(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  drawer: S(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 11h18" /><path d="M10 15h4" /></>),
  cash: S(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v.01M18 14.5v.01" /></>),
  safe: S(<><rect x="3" y="3.5" width="18" height="17" rx="2" /><circle cx="12" cy="12" r="3.2" /><path d="M12 8.8V7.6M12 16.4v-1.2M15.2 12h1.2M7.6 12h1.2" /><path d="M6 20.5v1.2M18 20.5v1.2" /></>),
  bag: S(<><path d="M7 8h10l1.6 11.2a1.6 1.6 0 0 1-1.6 1.8H7a1.6 1.6 0 0 1-1.6-1.8L7 8z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>),
  up: S(<><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>),
  down: S(<><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>),
  intoSafe: S(<><path d="M12 3v9" /><path d="M8 8.5l4 4 4-4" /><rect x="4" y="14" width="16" height="7" rx="1.6" /></>),
  check: S(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  x: S(<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>),
  back: S(<path d="M15 5l-7 7 7 7" />),
  chev: S(<path d="M9 5l7 7-7 7" />),
  user: S(<><circle cx="12" cy="8" r="3.6" /><path d="M5 20c1.2-3.6 4-5.2 7-5.2s5.8 1.6 7 5.2" /></>),
  lock: S(<><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>),
  del: S(<><path d="M9 6h11v12H9l-6-6 6-6z" /><path d="M12.5 9.5l5 5M17.5 9.5l-5 5" /></>),
  printer: S(<><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="8" rx="2" /><path d="M7 14h10v6.5H7z" /></>),
};

// Money with the pence a step smaller: £150.00 reads at a glance.
export function Money({ value, size = 38, sign = "", dim }) {
  const n = Math.abs(Number(value) || 0);
  const sym = currencySymbol().trim();
  const [w, p] = n.toFixed(2).split(".");
  const whole = Number(w).toLocaleString("en-GB");
  return (
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.05, opacity: dim ? .35 : 1, ...NUM }}>
      {sign}{sym}{whole}<span style={{ fontSize: Math.round(size * .6), opacity: .7 }}>.{p}</span>
    </span>
  );
}

// Small caps label above a field or block.
export const Label = ({ children, tone, style }) => (
  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: tone || U.faint, marginBottom: 6, ...style }}>{children}</div>
);

// The frame every till sheet sits in.
// bodyKey: change it (the step name) and the body slides in, so a step change reads as one.
// onStep(i): makes the steps already done tappable, to go back to one.
export function Sheet({ icon, title, sub, onClose, busy, width = 980, height, tabs, tab, onTab, steps, step, onStep, aside, asideTitle, footer, children, zIndex = 92, bodyKey, overlay }) {
  const idx = steps ? steps.indexOf(step) : -1;
  return (
    <div className="tu-overlay" onClick={() => !busy && onClose && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(8,15,20,.64)", backdropFilter: "blur(2px)", zIndex, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <Styles />
      <div className="tu-card" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 22, width, maxWidth: "100%", maxHeight: "94vh", height, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 40px 90px rgba(8,15,20,.5), 0 0 0 1px rgba(255,255,255,.04)", color: U.ink }}>
        <div style={{ background: "radial-gradient(120% 140% at 0% 0%, #164139 0%, " + U.dark + " 55%)", color: "#fff", padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: tabs ? "wrap" : "nowrap" }}>
          {icon && <span style={{ width: 46, height: 46, borderRadius: 13, background: "rgba(94,234,212,.12)", boxShadow: "inset 0 0 0 1px rgba(94,234,212,.18)", color: U.mintT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>}
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.01em", lineHeight: 1.15 }}>{title}</div>
            {sub && <div style={{ fontSize: 13.5, color: U.mint, opacity: .82, marginTop: 3 }}>{sub}</div>}
          </div>
          {tabs && (
            <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,.18)", boxShadow: "inset 0 0 0 1px rgba(94,234,212,.12)", borderRadius: 13, padding: 4 }}>
              {tabs.map(([k, l, ic]) => (
                <div key={k} className="tu-btn" onClick={() => !busy && onTab && onTab(k)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", background: tab === k ? grad : "transparent", color: tab === k ? "#fff" : U.mintT, boxShadow: tab === k ? "0 4px 12px rgba(13,148,136,.35)" : "none" }}>
                  {ic}{l}
                </div>
              ))}
            </div>
          )}
          {onClose && <span className="tu-btn" onClick={() => !busy && onClose()} aria-label="Close" style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(94,234,212,.1)", color: U.mintT, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Icon.x size={18} /></span>}
        </div>
        {steps && (
          <div style={{ position: "relative", display: "flex", gap: 6, padding: "11px 20px", background: "#fafbfc", borderBottom: "1px solid " + U.line, flexWrap: "wrap" }}>
            {steps.map((s, i) => {
              const on = i === idx, past = i < idx;
              return (
                <div key={s} onClick={() => past && onStep && !busy && onStep(i)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 800, color: on ? U.ink : past ? U.teal : U.faint, cursor: past && onStep ? "pointer" : "default" }}>
                  <span style={{ width: 24, height: 24, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, background: on ? U.ink : past ? U.teal : "#fff", color: on || past ? "#fff" : U.faint, border: "1.5px solid " + (on ? U.ink : past ? U.teal : U.line), boxShadow: on ? "0 0 0 4px rgba(18,21,28,.08)" : "none" }}>{past ? <Icon.check size={13} sw={3} /> : i + 1}</span>
                  {s}{i < steps.length - 1 && <span style={{ width: 26, height: 2, borderRadius: 1, background: past ? U.teal : U.line, margin: "0 4px" }} />}
                </div>
              );
            })}
            <span style={{ position: "absolute", left: 0, bottom: -1, height: 2, width: ((idx + 1) / steps.length * 100) + "%", background: grad, transition: "width .3s ease" }} />
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          <div key={bodyKey} className={bodyKey != null ? "tu-stepin" : ""} style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "20px 22px" }}>{children}</div>
          {aside && (
            <div style={{ width: 344, flexShrink: 0, background: "linear-gradient(180deg,#f7f8fa,#f1f3f5)", borderLeft: "1px solid " + U.line, overflowY: "auto", padding: "18px 18px" }}>
              {asideTitle && <Label>{asideTitle}</Label>}
              {aside}
            </div>
          )}
        </div>
        {footer && <div style={{ display: "flex", gap: 10, padding: "14px 20px", borderTop: "1px solid " + U.line, background: "#fff" }}>{footer}</div>}
        {overlay}
      </div>
    </div>
  );
}

// Big touch keypad. decimal adds "." (money); otherwise "C" clears.
export function Keypad({ value, onChange, decimal = false, max = 8, money = false }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "C", "0", "⌫"];
  const press = (k) => {
    tap();
    if (k === "⌫") return onChange(value.slice(0, -1));
    if (k === "C") return onChange("");
    if (k === ".") return onChange(value.includes(".") ? value : (value || "0") + ".");
    if (decimal && value.includes(".") && value.split(".")[1].length >= 2) return;
    if (value.length >= max) return;
    onChange(money && value === "0" ? k : value + k);
  };
  // A till with a keyboard (or a USB number pad) types straight in.
  const ref = useRef(press); ref.current = press;
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      const k = e.key === "Backspace" ? "⌫" : e.key === "Delete" ? "C" : e.key === "." && decimal ? "." : /^[0-9]$/.test(e.key) ? e.key : null;
      if (k) { e.preventDefault(); ref.current(k); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decimal]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9 }}>
      {keys.map((k) => (
        <div key={k} className="tu-key" onClick={() => press(k)} aria-label={k === "⌫" ? "Delete" : k === "C" ? "Clear" : k}
          style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16, background: k === "⌫" || k === "C" ? "#eef0f3" : "#fff", border: "1px solid " + U.line, boxShadow: "0 1px 0 rgba(18,21,28,.06), 0 2px 6px rgba(18,21,28,.04)", fontWeight: 700, fontSize: 26, color: k === "C" ? U.bad : U.ink, cursor: "pointer", userSelect: "none", ...NUM }}>
          {k === "⌫" ? <Icon.del size={26} /> : k}
        </div>
      ))}
    </div>
  );
}

// PIN: label, dots and keypad. error turns the dots red and shakes them.
export function PinPanel({ label = "Your PIN", hint, value, onChange, tone, error }) {
  const n = Math.max(4, value.length);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ color: tone || U.faint, display: "flex" }}><Icon.lock size={15} /></span>
        <Label tone={tone} style={{ marginBottom: 0 }}>{label}</Label>
      </div>
      {hint && <div style={{ fontSize: 13.5, color: U.sub, marginBottom: 6, lineHeight: 1.4 }}>{hint}</div>}
      <div key={error || "ok"} className={error ? "tu-shake" : ""} style={{ display: "flex", gap: 14, justifyContent: "center", margin: "12px 0 18px", height: 18 }}>
        {Array.from({ length: n }).map((_, i) => {
          const on = i < value.length;
          const c = error && !value.length ? U.bad : U.ink;
          return <span key={i + (on ? "f" : "e")} className={on ? "tu-dot" : ""} style={{ width: 18, height: 18, borderRadius: 9, background: on ? c : "transparent", border: "2px solid " + (on ? c : error ? "#fca5a5" : "#cfd4da") }} />;
        })}
      </div>
      <Keypad value={value} onChange={onChange} max={8} />
    </div>
  );
}

export function Btn({ children, onClick, kind = "primary", disabled, grow = true, icon }) {
  const working = typeof children === "string" && children.endsWith("…");
  const bg = disabled ? "#e2e6ea" : kind === "primary" ? U.ink : kind === "teal" ? grad : kind === "danger" ? U.bad : "#fff";
  const fg = disabled ? "#9aa3ad" : kind === "secondary" ? U.ink : "#fff";
  return (
    <div className={disabled ? "" : "tu-btn"} onClick={() => { if (!disabled && onClick) { tap(); onClick(); } }} style={{ flex: typeof grow === "number" ? grow : grow ? 1 : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px 22px", borderRadius: 15, fontWeight: 800, fontSize: 16.5, cursor: disabled ? "default" : "pointer", background: bg, color: fg, border: kind === "secondary" ? "1px solid " + U.line : "1px solid transparent", boxShadow: !disabled && kind !== "secondary" ? "0 6px 16px rgba(18,21,28,.16)" : "none", userSelect: "none", whiteSpace: "nowrap" }}>{working ? <span className="tu-spin" /> : icon}{children}</div>
  );
}

// Tap-to-pick options. multi = several, joined with ", ".
export function Chips({ options, value, onChange, multi = false }) {
  const has = (o) => multi ? (value || "").toLowerCase().split(", ").includes(o.toLowerCase()) : value === o;
  const pick = (o) => {
    if (!multi) return onChange(o);
    const list = (value || "").split(", ").filter(Boolean);
    onChange(has(o) ? list.filter((x) => x.toLowerCase() !== o.toLowerCase()).join(", ") : [...list, o].join(", "));
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => (
        <span key={o} className="tu-chip tu-btn" onClick={() => pick(o)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "11px 15px", borderRadius: 999, fontSize: 14.5, fontWeight: 700, cursor: "pointer", userSelect: "none", background: has(o) ? U.ink : "#fff", color: has(o) ? "#fff" : U.ink, border: "1px solid " + (has(o) ? U.ink : U.line), boxShadow: has(o) ? "0 4px 10px rgba(18,21,28,.18)" : "0 1px 0 rgba(18,21,28,.04)" }}>
          {has(o) && <Icon.check size={15} sw={3} />}{o}
        </span>
      ))}
    </div>
  );
}

// A figure in a tile. tone: dark | teal | soft | white | good | bad.
export function Stat({ label, value, money, note, tone = "soft", big, icon }) {
  const t = { dark: [U.ink, "#fff", "rgba(255,255,255,.66)"], teal: [grad, "#fff", "rgba(255,255,255,.8)"], soft: [U.soft, U.ink, U.faint], good: [U.goodBg, U.good, U.good], bad: [U.badBg, U.bad, U.bad], white: ["#fff", U.ink, U.faint] }[tone];
  return (
    <div style={{ position: "relative", overflow: "hidden", background: tone === "dark" ? "radial-gradient(130% 160% at 100% 0%, #1f2937 0%, " + U.ink + " 60%)" : t[0], color: t[1], borderRadius: 18, padding: big ? "17px 19px" : "14px 16px", border: tone === "white" ? "1px solid " + U.line : "none", boxShadow: tone === "dark" ? "0 10px 24px rgba(18,21,28,.18)" : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: t[2] }}>{icon}{label}</div>
      <div style={{ marginTop: 4 }}>{money != null ? <Money value={money} size={big ? 42 : 30} /> : <span style={{ fontSize: big ? 42 : 30, fontWeight: 800, letterSpacing: "-.02em", ...NUM }}>{value}</span>}</div>
      {note && <div style={{ fontSize: 13.5, color: t[2], marginTop: 3 }}>{note}</div>}
    </div>
  );
}

// A label / figure line in a breakdown.
export function Row({ label, value, strong, tone, minus }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 2px", borderBottom: "1px solid " + U.line, fontSize: strong ? 17 : 15, fontWeight: strong ? 800 : 500 }}>
      <span style={{ color: tone || (strong ? U.ink : U.sub) }}>{label}</span>
      <span style={{ color: tone || (minus ? U.sub : U.ink), fontWeight: strong ? 800 : 700, ...NUM }}>{value}</span>
    </div>
  );
}

// Balanced / over / short, with what it was measured against.
export function Verdict({ variance, fmt, counted, expected, compact }) {
  const v = Number(variance) || 0;
  const [bg, fg, word, I] = v === 0 ? [U.goodBg, U.good, "Balanced", Icon.check] : v > 0 ? [U.overBg, U.over, "Over", Icon.up] : [U.badBg, U.bad, "Short", Icon.down];
  return (
    <div style={{ background: bg, boxShadow: "inset 0 0 0 2px " + fg, color: fg, borderRadius: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ width: 46, height: 46, borderRadius: 23, background: fg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><I size={24} sw={3} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: ".01em", lineHeight: 1.1 }}>{word}</div>
        {counted != null && expected != null && (compact
          ? <div style={{ fontSize: 13, fontWeight: 600, opacity: .85, lineHeight: 1.35, ...NUM }}>Counted {fmt(counted)}<br />Expected {fmt(expected)}</div>
          : <div style={{ fontSize: 13.5, fontWeight: 600, opacity: .85, ...NUM }}>Counted {fmt(counted)} · expected {fmt(expected)}</div>)}
      </div>
      <Money value={v} size={compact ? 30 : 36} sign={v > 0 ? "+" : v < 0 ? "−" : ""} />
    </div>
  );
}

// A tappable field showing a value — the keypad types into the selected one.
export function Field({ label, value, money, placeholder = "—", active, onClick, big = true }) {
  const empty = money != null ? !(Number(money) > 0) : !value;
  return (
    <div className="tu-tile" onClick={onClick} style={{ border: "2px solid " + (active ? U.teal : U.line), background: active ? "#f0fdfa" : "#fff", boxShadow: active ? "0 0 0 4px rgba(20,184,166,.12)" : "none", borderRadius: 18, padding: "12px 16px", cursor: onClick ? "pointer" : "default" }}>
      <Label style={{ marginBottom: 2 }}>{label}</Label>
      <div style={{ display: "flex", alignItems: "baseline", color: empty ? "#c3c8cf" : U.ink }}>
        {money != null ? <Money value={money} size={big ? 44 : 30} /> : <span style={{ fontSize: big ? 44 : 30, fontWeight: 800, letterSpacing: "-.02em", ...NUM }}>{value || placeholder}</span>}
        {active && <span className="tu-caret" style={{ height: big ? 34 : 24 }} />}
      </div>
    </div>
  );
}

// A note or coin in the count: drawn as the thing it is, with − / + for quick taps.
const NOTE_COLOURS = { 1000: "#334155", 500: "#475569", 200: "#4d7c0f", 100: "#0f766e", 50: "#b91c1c", 20: "#7c3aed", 10: "#c2410c", 5: "#0e7490" };
export function DenomTile({ d, label, count, subtotal, active, onSelect, onStep, fmt }) {
  const note = d >= 5;
  const col = note ? (NOTE_COLOURS[d] || "#334155") : d >= 1 ? "#c99a1b" : d >= 0.1 ? "#9aa4ae" : "#b87333";
  const n = Number(count) || 0;
  return (
    <div className="tu-tile" onClick={onSelect} style={{ position: "relative", border: "2px solid " + (active ? U.teal : n ? "#99f6e4" : U.line), background: active ? "#f0fdfa" : "#fff", boxShadow: active ? "0 0 0 4px rgba(20,184,166,.12)" : "0 1px 0 rgba(18,21,28,.04)", borderRadius: 16, padding: "10px 11px 9px", cursor: "pointer", userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {note
          ? <span style={{ width: 42, height: 24, borderRadius: 5, background: "linear-gradient(135deg," + col + "," + col + "cc)", color: "#fff", fontSize: 11.5, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 2px rgba(255,255,255,.25)" }}>{label}</span>
          : <span style={{ width: 28, height: 28, borderRadius: 14, background: "radial-gradient(circle at 35% 30%, #fff8, transparent 45%), " + col, color: "#fff", fontSize: d >= 1 ? 11 : 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 2px rgba(0,0,0,.12)" }}>{label}</span>}
        <span style={{ marginLeft: "auto", fontSize: 26, fontWeight: 800, ...NUM }}>{n}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 7 }}>
        <span style={{ fontSize: 12.5, color: n ? U.sub : "#c3c8cf", fontWeight: 700, ...NUM }}>{n ? fmt(subtotal) : fmt(0)}</span>
        <span style={{ display: "flex", gap: 5 }}>
          {[["−", -1], ["+", 1]].map(([s, dlt]) => (
            <span key={s} className="tu-key" onClick={(e) => { e.stopPropagation(); onStep(dlt); }} style={{ width: 30, height: 30, borderRadius: 9, background: U.soft, border: "1px solid " + U.line, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: s === "−" && !n ? "#c3c8cf" : U.ink }}>{s}</span>
          ))}
        </span>
      </div>
    </div>
  );
}

// Success mark for a finished sheet.
export function DoneMark({ title, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
      <span className="tu-done-ring" style={{ width: 56, height: 56, borderRadius: 28, background: U.goodBg, boxShadow: "inset 0 0 0 2px " + U.good, display: "flex", alignItems: "center", justifyContent: "center", color: U.good, flexShrink: 0 }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path className="tu-done-tick" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
      <div><div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.01em" }}>{title}</div>{sub && <div style={{ fontSize: 14.5, color: U.sub, marginTop: 2 }}>{sub}</div>}</div>
    </div>
  );
}

// A numbered instruction with an icon, for "what to do now".
export function Instruction({ n, icon, title, money, note, dark }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", borderRadius: 18, padding: "16px 18px", background: dark ? "radial-gradient(130% 160% at 100% 0%, #1f2937 0%, " + U.ink + " 60%)" : U.soft, color: dark ? "#fff" : U.ink, boxShadow: dark ? "0 10px 24px rgba(18,21,28,.18)" : "none" }}>
      <span style={{ width: 52, height: 52, borderRadius: 14, background: dark ? "rgba(255,255,255,.08)" : "#fff", border: dark ? "none" : "1px solid " + U.line, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: dark ? U.mintT : U.teal }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", opacity: .7 }}>{n} · {title}</div>
        <Money value={money} size={36} />
        {note && <div style={{ fontSize: 13.5, opacity: .72, marginTop: 1 }}>{note}</div>}
      </div>
    </div>
  );
}

export const Note = ({ children, tone }) => (
  <div style={{ fontSize: 14, color: tone || U.sub, lineHeight: 1.5, marginTop: 12 }}>{children}</div>
);
export const Err = ({ children }) => children ? (
  <div className="tu-shake" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, background: U.badBg, color: U.bad, fontWeight: 700, fontSize: 14.5, borderRadius: 14, padding: "11px 14px", boxShadow: "inset 0 0 0 1px #fecaca" }}>
    <span style={{ width: 22, height: 22, borderRadius: 11, background: U.bad, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, flexShrink: 0 }}>!</span>{children}
  </div>
) : null;
