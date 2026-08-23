// Shared cart line-item renderer.
// ONE source of truth for how an order line looks — used by both the POS cart
// (interactive: steppers/edit/remove) and the placed-order detail panel
// (read-only). Any visual change happens here, once, and both surfaces update.
//
// Pass a NORMALIZED line via `line`:
//   { name, qty, unitPrice, lineTotal, image_url, category, mods: [names], note }
// Interactivity is opt-in via handlers. When a handler is omitted the control
// is hidden, but the visual format is otherwise identical.

const gbp = (n) => "£" + Number(n || 0).toFixed(2);

// Category icon + gradient fallback (used when a line has no photo).
const CB_CAT_ICONS = [
  { k: ["dessert", "kanafeh", "cake", "sweet", "waffle", "croissant", "toast", "crepe", "cookie"], icon: "🍰", grad: "linear-gradient(140deg,#fce1d0,#eba97b)" },
  { k: ["matcha", "tea"], icon: "🍵", grad: "linear-gradient(140deg,#e4eac7,#acc771)" },
  { k: ["coffee", "latte", "espresso", "flat white", "cappuccino", "mocha", "americano"], icon: "☕", grad: "linear-gradient(140deg,#edd7c3,#cc9e71)" },
  { k: ["shake", "smoothie", "frapp"], icon: "🥤", grad: "linear-gradient(140deg,#f9ebd1,#e1b56f)" },
  { k: ["mocktail", "drink", "juice", "lemon", "soda", "cooler"], icon: "🍹", grad: "linear-gradient(140deg,#fde0ea,#f4a0c0)" },
  { k: ["hot chocolate", "cocoa", "chocolate"], icon: "🍫", grad: "linear-gradient(140deg,#eac6a3,#b97b4e)" },
  { k: ["breakfast", "egg", "brunch", "omelette"], icon: "🍳", grad: "linear-gradient(140deg,#fdeec2,#e8b96a)" },
  { k: ["burger", "chicken", "wings", "fries", "chips", "wrap", "sandwich"], icon: "🍔", grad: "linear-gradient(140deg,#f6ddc0,#d99b63)" },
];
export function cartFallback(name = "", cat = "") {
  const hay = (name + " " + cat).toLowerCase();
  for (const c of CB_CAT_ICONS) if (c.k.some((w) => hay.includes(w))) return c;
  return { icon: "🍽", grad: "linear-gradient(140deg,#f6eedc,#dec89d)" };
}

export default function CartLine({ line, onDec, onInc, onEdit, onRemove, last = false }) {
  const l = line || {};
  const qty = l.qty || 1;
  const unit = Number(l.unitPrice != null ? l.unitPrice : (l.lineTotal || 0) / (qty || 1));
  const lineTotal = Number(l.lineTotal != null ? l.lineTotal : unit * qty);
  const mods = Array.isArray(l.mods) ? l.mods : [];
  const note = l.note || "";
  const isAllergy = /allerg|nut|dairy|gluten/i.test(note);
  const fb = cartFallback(l.name || "", l.category || "");
  const canEdit = typeof onEdit === "function";
  const showStepper = typeof onDec === "function" && typeof onInc === "function";
  const showRemove = typeof onRemove === "function";
  const hasActions = showStepper || canEdit || showRemove;
  const showQtyBadge = qty > 1 || !showStepper; // read-only lines always show qty

  return (
    <div style={{ display: "flex", gap: 12, padding: "13px 0", borderBottom: last ? "none" : "1px solid #f4f5f7", alignItems: "flex-start" }}>
      <div onClick={canEdit ? onEdit : undefined} style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, backgroundImage: l.image_url ? "url(" + l.image_url + ")" : fb.grad, backgroundSize: "cover", backgroundPosition: "center", display: "flex", alignItems: "center", justifyContent: "center", cursor: canEdit ? "pointer" : "default" }}>
        {!l.image_url && <span style={{ fontSize: 26 }}>{fb.icon}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={canEdit ? onEdit : undefined} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", cursor: canEdit ? "pointer" : "default" }}>
          <div style={{ minWidth: 0, display: "flex", gap: 7 }}>
            {showQtyBadge && <span style={{ flexShrink: 0, background: "#eef4e8", color: "#3a5730", fontWeight: 700, fontSize: 15, borderRadius: 7, padding: "1px 7px", height: "fit-content", marginTop: 1 }}>{qty}×</span>}
            <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.2 }}>{l.name}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{gbp(lineTotal)}</div>
            {qty > 1 && <div style={{ fontSize: 13, color: "#9aa1ac", marginTop: 1 }}>{gbp(unit)} ea</div>}
          </div>
        </div>
        {mods.length > 0 && <div style={{ fontSize: 14, color: "#8a5a2c", marginTop: 3, lineHeight: 1.3 }}>{mods.join(" · ")}</div>}
        {note && <div style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.3, fontStyle: "italic", color: isAllergy ? "#c0392b" : "#c2703a", fontWeight: isAllergy ? 700 : 400 }}>{isAllergy ? "⚠ " : "📝 "}{note}</div>}
        {hasActions && (
          <div style={{ display: "flex", alignItems: "center", marginTop: 9, gap: 8 }}>
            {showStepper && (
              <div style={{ display: "inline-flex", alignItems: "center", background: "#f5f6f8", borderRadius: 11, padding: 3 }}>
                <span onClick={onDec} style={{ width: 34, height: 34, borderRadius: 9, background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#5E7A4D", cursor: "pointer", fontSize: 20, fontWeight: 700, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>−</span>
                <span style={{ fontWeight: 700, minWidth: 34, textAlign: "center", fontSize: 16 }}>{qty}</span>
                <span onClick={onInc} style={{ width: 34, height: 34, borderRadius: 9, background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#5E7A4D", cursor: "pointer", fontSize: 20, fontWeight: 700, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>+</span>
              </div>
            )}
            {canEdit && <span onClick={onEdit} style={{ fontSize: 14, color: "#3a5730", fontWeight: 700, cursor: "pointer", background: "#eef4e8", padding: "7px 12px", borderRadius: 9 }}>✎ Edit</span>}
            {showRemove && <span onClick={onRemove} style={{ marginLeft: "auto", color: "#c94a4a", cursor: "pointer", fontSize: 15, fontWeight: 600, padding: "8px 4px" }}>Remove</span>}
          </div>
        )}
      </div>
    </div>
  );
}
