import { useState } from "react";

// ============================================================
// KIOSK MENU
// ------------------------------------------------------------
// Built to the measurements in the Tove kiosk reference rather than
// adapted from the tablet menu — the first attempt reused the tablet's
// cards and did not read like the design at any size.
//
// The reference is drawn at 1080x1920 and so is this: the positions below are
// its numbers. A kiosk is that size; anything narrower scales the whole board
// down by one factor so the proportions survive.
//
// Layout, in design pixels:
//   0..208    cream header band, 1.5px rule along the bottom
//   34        bar: 156x148 brand tile, then the category tablist
//   208..     232-wide cream panel down the left, rounded into the board
//   272       rail of 188x204 subcategory tiles
//   236       section title and the filter/reach/info buttons
//   336       featured card, 350 tall
//   712       the grid, two columns
//   bottom    Back and Search stacked at the left, the bag bar beside them
// ============================================================

const INK = "#1B241F";
const PANEL = "#F2ECDD";       // the cream the rail and tabs sit on
const PANEL_RING = "#EAE1CF";
const RULE = "#ECE4D3";
const CARD = "#C7D9BF";        // item card foot — a shade deeper than --chip
const PHOTO_BG = "#F0E5D9";
const OUTLINE = "#86948B";
const NAME_INK = "#233A2E";

export default function KioskMenu({
  data, menus, activeMenu, setActiveMenu, activeCat, setActiveCat,
  onItem, onAdd, onBag, onBack, onSearch, onReach, bagCount, brandLogo, bagThumbs = [],
  accent = "#344D42", chip = "#B3D2AE", bg = "#FFFBF2",
}) {
  const [toast, setToast] = useState("");
  const section = data[activeCat] || data[0] || { name: "", items: [] };
  const items = section.items || [];
  const featured = items[0] || null;
  const rest = items.slice(1);

  const head = "var(--font-head)";
  // A category's "img" is sometimes a CSS gradient rather than a picture, so
  // test for that rather than for an http URL — a relative path is a real
  // image too, and requiring http silently dropped every tile to its icon.
  const real = (u) => !!u && typeof u === "string" && !u.startsWith("linear-gradient") && !u.startsWith("radial-gradient");
  const imgOf = (c) => (real(c.img) ? c.img : null) || (c.items || []).map((x) => x.image_url).find(real) || null;

  const add = (it) => {
    if (it.soldOut) return;
    if (it.modifiers && it.modifiers.length) { onItem(it); return; }
    onAdd({ item: it, qty: 1, unit: it.price, mods: [] });
    setToast(it.name + " added");
    setTimeout(() => setToast(""), 2200);
  };

  // "Add" with the pill-and-disc shape the reference uses throughout.
  const addBtn = (it, onDark) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); add(it); }} aria-label={"Add " + it.name}
      style={{ height: 76, padding: "0 12px 0 30px", borderRadius: 38, border: "none", cursor: it.soldOut ? "default" : "pointer", display: "flex", alignItems: "center", gap: 14, fontFamily: head, fontSize: onDark ? 24 : 22, fontWeight: onDark ? 600 : 500, background: onDark ? chip : accent, color: onDark ? accent : bg, boxShadow: onDark ? "none" : "0 14px 24px -14px rgba(52,77,66,.8)" }}>
      Add
      <span style={{ width: onDark ? 52 : 56, height: onDark ? 52 : 56, borderRadius: 28, background: onDark ? accent : chip, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={onDark ? bg : accent} strokeWidth="2.8" strokeLinecap="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
      </span>
    </button>
  );

  const soldOutVeil = (
    <div style={{ position: "absolute", inset: 0, background: "rgba(255,251,242,.72)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ height: 52, padding: "0 22px", borderRadius: 26, background: INK, color: bg, display: "flex", alignItems: "center", fontSize: 19, fontWeight: 600, letterSpacing: ".12em" }}>SOLD OUT TODAY</span>
    </div>
  );

  const roundBtn = (label, onClick, icon) => (
    <button type="button" onClick={onClick} aria-label={label}
      style={{ height: 64, width: 64, padding: 0, borderRadius: 32, border: `1.5px solid ${OUTLINE}`, background: bg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{icon}</button>
  );

  return (
    <div style={{ width: 1080, height: 1920, position: "relative", overflow: "hidden", background: bg, color: INK, fontFamily: "var(--font-body)" }}>
      {/* header band */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 208, background: bg, borderBottom: `1.5px solid ${RULE}`, zIndex: 1 }} />

      <div style={{ position: "absolute", left: 40, right: 40, top: 34, height: 148, display: "flex", alignItems: "center", gap: 16, zIndex: 3 }}>
        <div onClick={onBack} style={{ width: 156, height: 148, flex: "none", borderRadius: 40, background: accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 14px 28px -18px rgba(52,77,66,.8)" }}>
          {brandLogo
            ? <img src={brandLogo} alt="" style={{ width: 118, height: "auto", display: "block" }} />
            : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={chip} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>}
        </div>
        <div role="tablist" style={{ flex: 1, minWidth: 0, height: 148, boxSizing: "border-box", padding: 8, borderRadius: 40, background: PANEL, boxShadow: `inset 0 0 0 1.5px ${PANEL_RING}`, display: "flex", alignItems: "stretch", gap: 4 }}>
          {(menus || []).map((m, i) => {
            const on = i === activeMenu;
            const tile = (m.categories || []).map((c) => imgOf(c)).find(Boolean) || null;
            return (
              <button key={m.id} type="button" role="tab" aria-selected={on} onClick={() => { setActiveMenu(i); setActiveCat(0); }}
                style={{ flex: 1, minWidth: 0, padding: "10px 4px 8px", borderRadius: 32, border: "none", background: on ? accent : "transparent", color: on ? bg : accent, fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", transition: "background 250ms ease, color 250ms ease" }}>
                <span style={{ position: "relative", width: 92, height: 92, flex: "none", borderRadius: 26, overflow: "hidden", background: on ? "rgba(255,255,255,.14)" : "#E8E0CE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {tile
                    ? <img src={tile} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={on ? chip : accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="7" /><path d="M12 6V3" /><path d="M8.5 13h7" /></svg>}
                </span>
                <span style={{ fontSize: 18, fontWeight: on ? 700 : 500, letterSpacing: ".01em", whiteSpace: "nowrap" }}>{m.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* the cream the rail sits on, rounded where it meets the board */}
      <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 208, bottom: 0, width: 232, background: PANEL, borderRadius: "0 44px 0 0" }} />

      <div role="tablist" aria-orientation="vertical" style={{ position: "absolute", left: 22, top: 272, width: 188, bottom: 260, display: "flex", flexDirection: "column", gap: 14, zIndex: 2, overflowY: "auto", scrollbarWidth: "none" }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", whiteSpace: "nowrap", color: "#5E6B63", textAlign: "center", margin: "-36px 0 6px" }}>
          {(menus && menus[activeMenu] && menus[activeMenu].name) || ""}
        </div>
        {data.map((c, i) => {
          const on = i === activeCat;
          const img = imgOf(c);
          return (
            <button key={c.name} type="button" role="tab" aria-selected={on} onClick={() => setActiveCat(i)}
              style={{ position: "relative", width: 188, height: 204, flex: "none", padding: 0, border: "none", borderRadius: 28, overflow: "hidden", background: on ? chip : "#E8E0CE", boxShadow: on ? `0 0 0 3px ${accent}` : "none", fontFamily: "inherit", cursor: "pointer", transition: "box-shadow 250ms ease" }}>
              {img
                ? <img src={img} alt="" style={{ position: "absolute", left: 0, right: 0, top: 0, width: "100%", height: 158, borderRadius: "0 0 22px 22px", objectFit: "cover", objectPosition: "50% 50%" }} />
                : <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 46, display: "flex", justifyContent: "center" }}>
                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="7" /><path d="M12 6V3" /><path d="M8.5 13h7" /></svg>
                  </span>}
              <span style={{ position: "absolute", left: 10, right: 10, bottom: 16, fontSize: 19, fontWeight: 600, lineHeight: 1.15, textAlign: "center", color: NAME_INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
              {on && (
                <span aria-hidden="true" style={{ position: "absolute", top: 12, right: 12, width: 34, height: 34, borderRadius: 17, background: accent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 3px ${bg}` }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={chip} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* title and the buttons that sit with it */}
      <div style={{ position: "absolute", left: 260, right: 36, top: 236, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, zIndex: 2 }}>
        <h2 style={{ margin: 0, fontFamily: head, fontSize: 44, fontWeight: 500, letterSpacing: "-.035em", lineHeight: 1 }}>{section.name}</h2>
        <div style={{ display: "flex", gap: 10 }}>
          {onReach && roundBtn("Reach mode", onReach, <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="4.5" r="2" /><path d="M5 8.5l7 1.5 7-1.5" /><path d="M12 10v5l-3 6" /><path d="M12 15l3 6" /></svg>)}
        </div>
      </div>

      {/* the one that leads */}
      {featured && (
        <div onClick={() => { if (!featured.soldOut) onItem(featured); }}
          style={{ position: "absolute", left: 260, right: 36, top: 336, height: 350, borderRadius: 40, overflow: "hidden", background: accent, display: "flex", cursor: featured.soldOut ? "default" : "pointer", boxShadow: "0 30px 50px -30px rgba(52,77,66,.75)", zIndex: 2 }}>
          <div style={{ position: "relative", width: 270, flex: "none", overflow: "hidden", background: "#3E6F47" }}>
            {featured.image_url && <img src={featured.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 60%" }} />}
            {featured.soldOut && soldOutVeil}
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 120, background: `linear-gradient(90deg, rgba(52,77,66,0) 0%, ${accent} 100%)` }} />
          </div>
          <div style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "40px 40px 36px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between", color: bg }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {featured.tags && featured.tags.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: "none", whiteSpace: "nowrap", height: 36, padding: "0 14px", borderRadius: 18, background: chip, color: accent, display: "flex", alignItems: "center", fontSize: 14, fontWeight: 700, letterSpacing: ".16em" }}>{featured.tags[0]}</div>
                </div>
              )}
              <div style={{ fontFamily: head, fontSize: 42, fontWeight: 500, lineHeight: 1.04, letterSpacing: "-.035em" }}>{featured.name}</div>
              {featured.desc && <div style={{ fontSize: 23, fontWeight: 300, color: "#DCE8D9", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{featured.desc}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <span style={{ fontFamily: head, fontSize: 40, fontWeight: 500, letterSpacing: "-.02em" }}>£{Number(featured.price).toFixed(2)}</span>
              {featured.soldOut
                ? <span style={{ fontSize: 20, fontWeight: 600, color: "#DCE8D9" }}>Unavailable</span>
                : addBtn(featured, true)}
            </div>
          </div>
        </div>
      )}

      {/* the rest of the category */}
      <div style={{ position: "absolute", left: 260, right: 36, top: featured ? 712 : 336, bottom: 196, overflowY: "auto", scrollbarWidth: "none", zIndex: 2 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20, paddingBottom: 24 }}>
          {rest.map((it, i) => (
            <div key={i} onClick={() => { if (!it.soldOut) onItem(it); }}
              style={{ position: "relative", height: 510, borderRadius: 36, overflow: "hidden", background: CARD, display: "flex", flexDirection: "column", cursor: it.soldOut ? "default" : "pointer", opacity: it.soldOut ? .72 : 1, boxShadow: "0 22px 44px -30px rgba(27,36,31,.4)" }}>
              <div style={{ position: "relative", height: 320, flex: "none", overflow: "hidden", background: PHOTO_BG, borderRadius: "0 0 26px 26px" }}>
                {it.image_url && <img src={it.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 50%", transform: "scale(1.08)", transformOrigin: "50% 45%" }} />}
                {it.soldOut && soldOutVeil}
              </div>
              <div style={{ flex: 1, boxSizing: "border-box", padding: "24px 26px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
                <span style={{ fontFamily: head, fontSize: 29, fontWeight: 600, letterSpacing: "-.025em", lineHeight: 1.12, minHeight: 66, color: NAME_INK }}>{it.name}</span>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontFamily: head, fontSize: 27, fontWeight: 600, letterSpacing: "-.01em", color: accent }}>£{Number(it.price).toFixed(2)}</span>
                  {it.soldOut
                    ? <span style={{ fontSize: 18, fontWeight: 600, color: "#5E6B63" }}>Unavailable</span>
                    : addBtn(it, false)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* the grid runs under this, so the bag bar always has something behind it */}
      <div aria-hidden="true" style={{ position: "absolute", left: 232, right: 0, bottom: 0, height: 210, background: `linear-gradient(180deg, rgba(255,251,242,0) 0%, rgba(255,251,242,.9) 55%, ${bg} 80%)`, pointerEvents: "none", zIndex: 3 }} />

      {toast && (
        <div role="status" style={{ position: "absolute", left: 232, right: 0, bottom: 196, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 5 }}>
          <div style={{ height: 76, padding: "0 30px 0 14px", borderRadius: 38, background: bg, color: INK, display: "flex", alignItems: "center", gap: 16, fontSize: 23, fontWeight: 500, boxShadow: "0 24px 48px -18px rgba(27,36,31,.45), 0 0 0 1.5px #E3DACA" }}>
            <span style={{ width: 50, height: 50, borderRadius: 25, background: chip, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
            </span>
            {toast}
          </div>
        </div>
      )}

      <button type="button" onClick={onBack} aria-label="Back"
        style={{ position: "absolute", left: 40, bottom: 150, width: 190, height: 92, boxSizing: "border-box", padding: "0 24px 0 16px", borderRadius: 46, border: `2px solid ${OUTLINE}`, background: bg, color: accent, boxShadow: "0 18px 34px -22px rgba(52,77,66,.45)", display: "flex", alignItems: "center", gap: 12, fontFamily: "inherit", cursor: "pointer", zIndex: 4 }}>
        <span style={{ width: 60, height: 60, flex: "none", borderRadius: 30, background: "#E4EDE0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></svg>
        </span>
        <span style={{ fontFamily: head, fontSize: 25, fontWeight: 500, letterSpacing: "-.02em" }}>Back</span>
      </button>

      <button type="button" onClick={onSearch} aria-label="Search the menu"
        style={{ position: "absolute", left: 40, bottom: 44, width: 190, height: 92, boxSizing: "border-box", padding: "0 24px 0 16px", borderRadius: 46, border: "none", background: accent, color: bg, boxShadow: "0 18px 34px -18px rgba(52,77,66,.75)", display: "flex", alignItems: "center", gap: 12, fontFamily: "inherit", cursor: "pointer", zIndex: 4 }}>
        <span style={{ width: 60, height: 60, flex: "none", borderRadius: 30, background: "rgba(179,210,174,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={chip} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        </span>
        <span style={{ fontFamily: head, fontSize: 25, fontWeight: 500, letterSpacing: "-.02em" }}>Search</span>
      </button>

      <button type="button" onClick={bagCount > 0 ? onBag : undefined} aria-label="View your bag"
        style={{ position: "absolute", left: 246, right: 40, bottom: 44, height: 124, boxSizing: "border-box", padding: "0 16px 0 36px", borderRadius: 62, border: "none", background: accent, color: bg, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: bagCount > 0 ? "pointer" : "default", boxShadow: "0 24px 44px -20px rgba(52,77,66,.7)", zIndex: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {bagThumbs.length > 0 ? (
            <div style={{ position: "relative", display: "flex", alignItems: "center", paddingLeft: 18 }}>
              {bagThumbs.slice(0, 3).map((src, i) => (
                <div key={i} style={{ width: 68, height: 68, marginLeft: -18, borderRadius: 34, overflow: "hidden", position: "relative", background: PHOTO_BG, boxShadow: `0 0 0 4px ${accent}` }}>
                  {src && <img src={src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 32, background: "rgba(179,210,174,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={chip} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
            </div>
          )}
          <div style={{ textAlign: "left" }}>
            <div style={{ fontFamily: head, fontSize: 27, fontWeight: 500 }}>Your bag</div>
            <div style={{ fontSize: 19, opacity: .75, marginTop: 2 }}>{bagCount > 0 ? bagCount + (bagCount === 1 ? " item" : " items") : "Pick a drink to get started"}</div>
          </div>
        </div>
        {bagCount > 0 && (
          <span style={{ height: 88, padding: "0 30px", borderRadius: 44, background: chip, color: accent, display: "flex", alignItems: "center", gap: 14, fontFamily: head, fontSize: 25, fontWeight: 600 }}>
            View bag
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
          </span>
        )}
      </button>
    </div>
  );
}
