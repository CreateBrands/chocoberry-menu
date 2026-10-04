import { useEffect, useRef, useState } from "react";

// ============================================================================
// FOH SERVICE FEEDBACK — a 20-second sheet a server fills against an order:
// how the guest felt, what (if anything) went wrong, what was done about it.
// Shared by the POS order panel and the KDS Done tab. Writes to service_log
// through admin-api (service_log_add), which resolves the staff PIN to a name.
// ============================================================================

export const TAGS = [
  // speed
  { k: "slow_food", l: "Slow food", c: "speed" },
  { k: "slow_drinks", l: "Slow drinks", c: "speed" },
  { k: "slow_bill", l: "Slow bill", c: "speed" },
  { k: "long_wait_seat", l: "Wait to be seated", c: "speed" },
  // accuracy
  { k: "wrong_item", l: "Wrong item", c: "accuracy" },
  { k: "missing_item", l: "Missing item", c: "accuracy" },
  { k: "wrong_mod", l: "Wrong modifier", c: "accuracy" },
  { k: "allergen", l: "Allergen issue", c: "accuracy" },
  // food
  { k: "cold_food", l: "Cold food", c: "food" },
  { k: "undercooked", l: "Under/overcooked", c: "food" },
  { k: "portion", l: "Portion", c: "food" },
  { k: "presentation", l: "Presentation", c: "food" },
  { k: "taste", l: "Taste / quality", c: "food" },
  // drink
  { k: "drink_quality", l: "Drink quality", c: "drink" },
  { k: "drink_temp", l: "Drink temperature", c: "drink" },
  // service
  { k: "attentiveness", l: "Not attentive", c: "service" },
  { k: "rude", l: "Unfriendly", c: "service" },
  { k: "no_check_in", l: "No check-in", c: "service" },
  // environment
  { k: "cleanliness", l: "Cleanliness", c: "cleanliness" },
  { k: "noise", l: "Noise / seating", c: "ambience" },
  { k: "temperature", l: "Too hot / cold", c: "ambience" },
  // billing
  { k: "billing", l: "Billing error", c: "billing" },
  { k: "payment", l: "Payment trouble", c: "billing" },
  // positives / context
  { k: "compliment", l: "Compliment", c: "positive" },
  { k: "special_occasion", l: "Special occasion", c: "positive" },
  { k: "regular", l: "Regular / VIP", c: "positive" },
  { k: "unavailable", l: "Item unavailable", c: "other" },
];
export const CATEGORY_LABEL = { speed: "Speed", accuracy: "Accuracy", food: "Food", drink: "Drink", service: "Service", cleanliness: "Cleanliness", ambience: "Ambience", billing: "Billing", positive: "Positive", other: "Other" };
export const ACTIONS = [["none", "Nothing needed"], ["apology", "Apology"], ["remake", "Remade"], ["discount", "Discount"], ["comp", "Comped"], ["manager", "Manager spoke"], ["voucher", "Voucher"]];
const MOODS = [[1, "😠", "Upset"], [2, "🙁", "Unhappy"], [3, "😐", "OK"], [4, "🙂", "Happy"], [5, "😄", "Delighted"]];

export default function ServiceFeedback({ order, locationId, supabaseUrl, headers, source = "pos", prefill = null, onClose, onSaved }) {
  const o = order || {};
  const items = (o.menu_order_items || []).map((it) => it.name_snapshot).filter(Boolean);
  const [rating, setRating] = useState(prefill?.rating || null);
  const [tags, setTags] = useState(new Set(prefill?.tags || []));
  const [itemSel, setItemSel] = useState(new Set());
  const [note, setNote] = useState("");
  const [action, setAction] = useState("none");
  const [actionValue, setActionValue] = useState("");
  const [resolved, setResolved] = useState(null);
  const [severity, setSeverity] = useState("low");
  const [pin, setPin] = useState("");
  const [staff, setStaff] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const lookupTimer = useRef(null);

  const C = { ink: "#0f172a", muted: "#64748b", line: "#e2e8f0", soft: "#f1f5f9", good: "#16a34a", warn: "#b45309", bad: "#b91c1c", brand: "#ec4899" };
  const hasIssue = [...tags].some((k) => { const t = TAGS.find((x) => x.k === k); return t && t.c !== "positive"; });
  const autoCategory = (() => { const cs = [...tags].map((k) => TAGS.find((x) => x.k === k)?.c).filter(Boolean); const nonPos = cs.filter((c) => c !== "positive"); return (nonPos[0] || cs[0]) || (rating && rating <= 2 ? "service" : rating ? "positive" : null); })();
  const ticketSecs = (() => { const b = o.kds_bumped_at || o.served_at; return b ? Math.round((new Date(b) - new Date(o.created_at)) / 1000) : null; })();
  const canSave = (rating || tags.size) && pin.length >= 4;

  useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []); // eslint-disable-line

  function onPin(v) {
    const p = v.replace(/\D/g, "").slice(0, 8);
    setPin(p); setStaff(null);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (p.length < 4) return;
    lookupTimer.current = setTimeout(async () => {
      try { const r = await fetch(supabaseUrl + "/functions/v1/admin-api", { method: "POST", headers, body: JSON.stringify({ pos: true, action: "staff_lookup", data: { pin: p, location_id: locationId } }) }); const j = await r.json(); setStaff(j.ok ? { name: j.name } : { unknown: true }); } catch { setStaff({ unknown: true }); }
    }, 300);
  }
  async function save() {
    if (!canSave || busy) return;
    setBusy(true); setErr("");
    try {
      const body = { pos: true, action: "service_log_add", data: { location_id: locationId, order_id: o.id, staff_pin: pin, rating, tags: [...tags], category: autoCategory, severity: hasIssue ? severity : null, note: note.trim() || null, action: hasIssue ? action : null, action_value: hasIssue && (action === "discount" || action === "comp" || action === "voucher") && actionValue ? Number(actionValue) : null, resolved: hasIssue ? resolved : null, item_names: [...itemSel], source, ticket_secs: ticketSecs } };
      const r = await fetch(supabaseUrl + "/functions/v1/admin-api", { method: "POST", headers, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Could not save");
      setDone(true);
      if (onSaved) onSaved(j);
      setTimeout(onClose, 900);
    } catch (e) { setErr(e.message || "Could not save"); } finally { setBusy(false); }
  }

  const Chip = ({ on, children, onClick, tone, small }) => (
    <span onClick={onClick} style={{ cursor: "pointer", padding: small ? "6px 11px" : "9px 14px", borderRadius: 10, fontSize: small ? 13 : 14, fontWeight: 700, background: on ? (tone || C.ink) : "#fff", color: on ? "#fff" : C.ink, border: "1.5px solid " + (on ? (tone || C.ink) : C.line), userSelect: "none", whiteSpace: "nowrap" }}>{children}</span>
  );
  const Sec = ({ title, right, children }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}><span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: ".08em", color: C.muted }}>{title}</span>{right && <span style={{ fontSize: 12, color: C.muted }}>{right}</span>}</div>
      {children}
    </div>
  );
  const groups = Object.entries(TAGS.reduce((m, t) => { (m[t.c] ||= []).push(t); return m; }, {}));
  const lbl = o.menu_tables?.label || (o.order_type === "takeaway" ? "Takeaway" : o.order_type === "dine_in" ? "Dine in" : o.order_type || "");

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: 760, maxWidth: "100%", maxHeight: "94vh", borderRadius: "22px 22px 0 0", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 -20px 60px rgba(15,23,42,.35)", color: C.ink, fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ padding: "16px 22px 10px", borderBottom: "1px solid " + C.line, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, fontFamily: "'Poppins',sans-serif" }}>How did it go?</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>#{o.order_no}{lbl ? " · " + lbl : ""} · {items.length} item{items.length === 1 ? "" : "s"}{ticketSecs != null ? " · kitchen " + Math.floor(ticketSecs / 60) + ":" + String(ticketSecs % 60).padStart(2, "0") : ""}</div>
          </div>
          <span onClick={onClose} style={{ cursor: "pointer", width: 34, height: 34, borderRadius: 9, background: C.soft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>✕</span>
        </div>

        <div style={{ overflowY: "auto", padding: "16px 22px 8px" }}>
          <Sec title="GUEST MOOD" right="your read of how they left">
            <div style={{ display: "flex", gap: 8 }}>
              {MOODS.map(([v, face, l]) => (
                <div key={v} onClick={() => setRating(rating === v ? null : v)} style={{ flex: 1, textAlign: "center", padding: "10px 0 8px", borderRadius: 14, cursor: "pointer", background: rating === v ? (v <= 2 ? "#fee2e2" : v === 3 ? "#fef3c7" : "#dcfce7") : C.soft, border: "2px solid " + (rating === v ? (v <= 2 ? C.bad : v === 3 ? C.warn : C.good) : "transparent") }}>
                  <div style={{ fontSize: 28, lineHeight: 1 }}>{face}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 4, color: C.muted }}>{l}</div>
                </div>
              ))}
            </div>
          </Sec>

          <Sec title="WHAT HAPPENED" right={tags.size ? tags.size + " selected" : "tap all that apply · leave empty if nothing"}>
            {groups.map(([c, list]) => (
              <div key={c} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, width: 78, flexShrink: 0 }}>{CATEGORY_LABEL[c]}</span>
                {list.map((t) => <Chip key={t.k} small on={tags.has(t.k)} tone={c === "positive" ? C.good : undefined} onClick={() => setTags((s) => { const n = new Set(s); n.has(t.k) ? n.delete(t.k) : n.add(t.k); return n; })}>{t.l}</Chip>)}
              </div>
            ))}
          </Sec>

          {items.length > 0 && tags.size > 0 && (
            <Sec title="WHICH ITEMS" right="optional — links the issue to the dish">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[...new Set(items)].map((n) => <Chip key={n} small on={itemSel.has(n)} onClick={() => setItemSel((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; })}>{n}</Chip>)}
              </div>
            </Sec>
          )}

          {hasIssue && (
            <Sec title="WHAT WAS DONE">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {ACTIONS.map(([k, l]) => <Chip key={k} small on={action === k} onClick={() => setAction(k)}>{l}</Chip>)}
                {(action === "discount" || action === "comp" || action === "voucher") && <input value={actionValue} onChange={(e) => setActionValue(e.target.value.replace(/[^\d.]/g, ""))} placeholder="£" inputMode="decimal" style={{ width: 80, padding: "6px 10px", borderRadius: 9, border: "1.5px solid " + C.line, fontSize: 14, fontWeight: 700 }} />}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: C.muted, marginRight: 4 }}>Left happy?</span>
                <Chip small on={resolved === true} tone={C.good} onClick={() => setResolved(true)}>Yes</Chip>
                <Chip small on={resolved === false} tone={C.bad} onClick={() => setResolved(false)}>No</Chip>
                <span style={{ width: 1, height: 18, background: C.line, margin: "0 6px" }} />
                <span style={{ fontSize: 12, color: C.muted, marginRight: 4 }}>Severity</span>
                {[["low", "Low"], ["medium", "Medium"], ["high", "High"]].map(([k, l]) => <Chip key={k} small on={severity === k} tone={k === "high" ? C.bad : k === "medium" ? C.warn : undefined} onClick={() => setSeverity(k)}>{l}</Chip>)}
              </div>
            </Sec>
          )}

          <Sec title="NOTE" right="one line is plenty">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={hasIssue ? "What the guest said, what you saw…" : "Anything worth remembering about this table"} style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 11, border: "1.5px solid " + C.line, fontSize: 14 }} />
          </Sec>

          <Sec title="YOUR PIN" right={staff ? (staff.unknown ? <span style={{ color: C.bad }}>PIN not recognised for this store</span> : <span style={{ color: C.good, fontWeight: 800 }}>{staff.name}</span>) : "same PIN as the staff app"}>
            <input value={pin} onChange={(e) => onPin(e.target.value)} inputMode="numeric" placeholder="••••" style={{ width: 160, padding: "11px 12px", borderRadius: 11, border: "1.5px solid " + (staff && staff.unknown ? C.bad : C.line), fontSize: 18, fontWeight: 800, letterSpacing: ".3em" }} />
          </Sec>
          {err && <div style={{ color: C.bad, fontWeight: 700, marginBottom: 8 }}>{err}</div>}
        </div>

        <div style={{ padding: "12px 22px 18px", borderTop: "1px solid " + C.line, display: "flex", gap: 10 }}>
          <span onClick={onClose} style={{ flex: 1, textAlign: "center", padding: "14px 0", borderRadius: 13, background: C.soft, fontWeight: 800, cursor: "pointer" }}>Cancel</span>
          <span onClick={save} style={{ flex: 2, textAlign: "center", padding: "14px 0", borderRadius: 13, background: done ? C.good : canSave && !busy ? C.ink : "#cbd5e1", color: "#fff", fontWeight: 900, cursor: canSave ? "pointer" : "default" }}>{done ? "✓ Logged" : busy ? "Saving…" : !rating && !tags.size ? "Pick a mood or a tag" : pin.length < 4 ? "Enter your PIN to log" : "Log feedback"}</span>
        </div>
      </div>
    </div>
  );
}
