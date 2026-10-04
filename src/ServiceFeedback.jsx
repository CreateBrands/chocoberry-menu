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

  const [stage, setStage] = useState("mood"); // mood → (allgood | flag) → pin
  const Chip = ({ on, children, onClick, tone, small }) => (
    <span onClick={onClick} style={{ cursor: "pointer", padding: small ? "8px 13px" : "10px 15px", borderRadius: 11, fontSize: small ? 13.5 : 14.5, fontWeight: 700, background: on ? (tone || C.ink) : "#fff", color: on ? "#fff" : C.ink, border: "1.5px solid " + (on ? (tone || C.ink) : C.line), userSelect: "none", whiteSpace: "nowrap", lineHeight: 1.2 }}>{children}</span>
  );
  const Sec = ({ title, right, children, style }) => (
    <div style={{ marginBottom: 14, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}><span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: ".08em", color: C.muted }}>{title}</span>{right && <span style={{ fontSize: 12, color: C.muted }}>{right}</span>}</div>
      {children}
    </div>
  );
  const GROUP_ICON = { speed: "⏱", accuracy: "🎯", food: "🍳", drink: "🥤", service: "🙋", cleanliness: "🧽", ambience: "🎵", billing: "🧾", positive: "⭐", other: "•" };
  const groups = Object.entries(TAGS.reduce((m, t) => { (m[t.c] ||= []).push(t); return m; }, {}));
  const lbl = o.menu_tables?.label || (o.order_type === "takeaway" ? "Takeaway" : o.order_type === "dine_in" ? "Dine in" : o.order_type || "");
  const overTarget = ticketSecs != null && ticketSecs > 15 * 60;
  const PinPad = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 64px)", gap: 6 }}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "C"].map((k) => (
        <span key={k} onClick={() => onPin(k === "⌫" ? pin.slice(0, -1) : k === "C" ? "" : pin + k)} style={{ height: 48, borderRadius: 11, background: /\d/.test(k) ? "#fff" : C.soft, border: "1.5px solid " + C.line, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, cursor: "pointer", userSelect: "none" }}>{k}</span>
      ))}
    </div>
  );
  const flagged = stage === "flag";
  const primaryLabel = done ? "✓ Logged" : busy ? "Saving…" : stage === "mood" ? (rating ? "Next" : "Pick a mood") : stage === "flag" ? (tags.size ? "Next" : "Pick what happened") : pin.length < 4 ? "Enter your PIN" : staff && staff.unknown ? "PIN not recognised" : "Log feedback";
  const primaryOk = done ? false : stage === "mood" ? !!rating : stage === "flag" ? tags.size > 0 : (pin.length >= 4 && !(staff && staff.unknown));
  const onPrimary = () => { if (busy || !primaryOk) return; if (stage === "mood") setStage("choose"); else if (stage === "flag") setStage("pin"); else save(); };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(15,23,42,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: 820, maxWidth: "100%", maxHeight: "94vh", borderRadius: 22, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 80px rgba(15,23,42,.4)", color: C.ink, fontFamily: "'Inter',system-ui,sans-serif" }}>
        {/* header: what order this is */}
        <div style={{ padding: "16px 22px 12px", borderBottom: "1px solid " + C.line, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Poppins',sans-serif" }}>How did it go?</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <b style={{ color: C.ink }}>#{o.order_no}</b>{lbl && <span>{lbl}</span>}
              <span>· {items.slice(0, 4).join(", ")}{items.length > 4 ? " +" + (items.length - 4) : ""}</span>
              {ticketSecs != null && <span style={{ fontWeight: 800, padding: "1px 8px", borderRadius: 6, background: overTarget ? "#fee2e2" : "#dcfce7", color: overTarget ? C.bad : C.good }}>kitchen {Math.floor(ticketSecs / 60)}:{String(ticketSecs % 60).padStart(2, "0")}{overTarget ? " · over target" : ""}</span>}
            </div>
          </div>
          <span onClick={onClose} style={{ cursor: "pointer", width: 36, height: 36, borderRadius: 10, background: C.soft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0 }}>✕</span>
        </div>
        {/* progress */}
        <div style={{ display: "flex", gap: 6, padding: "10px 22px 0" }}>
          {[["mood", "Mood"], ["flag", "What happened"], ["pin", "Your PIN"]].map(([k, l], i) => { const on = stage === k || (stage === "choose" && k === "mood") || (k === "mood" && rating) || (k === "flag" && (tags.size || stage === "pin")) || (k === "pin" && pin.length >= 4); return <span key={k} style={{ flex: 1, textAlign: "center", fontSize: 11.5, fontWeight: 800, color: on ? C.ink : "#94a3b8", borderBottom: "3px solid " + (on ? C.ink : C.line), paddingBottom: 6 }}>{i + 1} · {l}</span>; })}
        </div>

        <div style={{ overflowY: "auto", padding: "16px 22px 8px" }}>
          {(stage === "mood" || stage === "choose") && (
            <>
              <Sec title="HOW DID THE GUEST LEAVE?" right="your honest read">
                <div style={{ display: "flex", gap: 8 }}>
                  {MOODS.map(([v, face, l]) => (
                    <div key={v} onClick={() => { setRating(v); setStage("choose"); }} style={{ flex: 1, textAlign: "center", padding: "14px 0 10px", borderRadius: 16, cursor: "pointer", background: rating === v ? (v <= 2 ? "#fee2e2" : v === 3 ? "#fef3c7" : "#dcfce7") : C.soft, border: "2px solid " + (rating === v ? (v <= 2 ? C.bad : v === 3 ? C.warn : C.good) : "transparent"), transform: rating === v ? "scale(1.04)" : "none", transition: "transform .1s" }}>
                      <div style={{ fontSize: 36, lineHeight: 1 }}>{face}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 6, color: rating === v ? C.ink : C.muted }}>{l}</div>
                    </div>
                  ))}
                </div>
              </Sec>
              {stage === "choose" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
                  <div onClick={() => { setTags(new Set()); setStage("pin"); }} style={{ cursor: "pointer", padding: "18px 16px", borderRadius: 16, background: "#f0fdf4", border: "2px solid #86efac" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: C.good }}>✓ All good</div>
                    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>Nothing to flag — just record the mood.</div>
                  </div>
                  <div onClick={() => setStage("flag")} style={{ cursor: "pointer", padding: "18px 16px", borderRadius: 16, background: "#fff7ed", border: "2px solid #fdba74" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: C.warn }}>⚑ Something to note</div>
                    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>An issue, a compliment, a special occasion, a regular.</div>
                  </div>
                </div>
              )}
            </>
          )}

          {flagged && (
            <>
              <Sec title="WHAT HAPPENED" right={tags.size ? tags.size + " selected" : "tap all that apply"}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 10 }}>
                  {groups.map(([c, list]) => (
                    <div key={c} style={{ background: c === "positive" ? "#f0fdf4" : C.soft, borderRadius: 14, padding: "10px 12px" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: ".06em", color: C.muted, marginBottom: 8 }}>{GROUP_ICON[c]} {CATEGORY_LABEL[c].toUpperCase()}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {list.map((t) => <Chip key={t.k} small on={tags.has(t.k)} tone={c === "positive" ? C.good : undefined} onClick={() => setTags((s) => { const n = new Set(s); n.has(t.k) ? n.delete(t.k) : n.add(t.k); return n; })}>{t.l}</Chip>)}
                      </div>
                    </div>
                  ))}
                </div>
              </Sec>
              {items.length > 0 && tags.size > 0 && (
                <Sec title="WHICH ITEMS" right="optional — links it to the dish">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {[...new Set(items)].map((n) => <Chip key={n} small on={itemSel.has(n)} onClick={() => setItemSel((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; })}>{n}</Chip>)}
                  </div>
                </Sec>
              )}
              {hasIssue && (
                <Sec title="WHAT WAS DONE">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {ACTIONS.map(([k, l]) => <Chip key={k} small on={action === k} onClick={() => setAction(k)}>{l}</Chip>)}
                    {(action === "discount" || action === "comp" || action === "voucher") && <input value={actionValue} onChange={(e) => setActionValue(e.target.value.replace(/[^\d.]/g, ""))} placeholder="£ value" inputMode="decimal" style={{ width: 90, padding: "7px 10px", borderRadius: 10, border: "1.5px solid " + C.line, fontSize: 14, fontWeight: 700 }} />}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, color: C.muted, marginRight: 4 }}>Left happy?</span>
                    <Chip small on={resolved === true} tone={C.good} onClick={() => setResolved(true)}>Yes</Chip>
                    <Chip small on={resolved === false} tone={C.bad} onClick={() => setResolved(false)}>No</Chip>
                    <span style={{ width: 1, height: 18, background: C.line, margin: "0 8px" }} />
                    <span style={{ fontSize: 12.5, color: C.muted, marginRight: 4 }}>How serious</span>
                    {[["low", "Minor"], ["medium", "Notable"], ["high", "Serious"]].map(([k, l]) => <Chip key={k} small on={severity === k} tone={k === "high" ? C.bad : k === "medium" ? C.warn : undefined} onClick={() => setSeverity(k)}>{l}</Chip>)}
                  </div>
                </Sec>
              )}
              <Sec title="NOTE" right="one line is plenty">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={hasIssue ? "What the guest said, what you saw…" : "Anything worth remembering about this table"} style={{ width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 12, border: "1.5px solid " + C.line, fontSize: 14.5 }} />
              </Sec>
            </>
          )}

          {stage === "pin" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "start" }}>
              <div>
                <Sec title="YOU'RE LOGGING">
                  <div style={{ background: C.soft, borderRadius: 14, padding: "12px 14px", fontSize: 14, lineHeight: 1.6 }}>
                    <div>Mood: <b>{rating ? MOODS.find((m) => m[0] === rating)[1] + " " + MOODS.find((m) => m[0] === rating)[2] : "—"}</b></div>
                    <div>{tags.size ? <>Flags: <b>{[...tags].map((k) => TAGS.find((t) => t.k === k)?.l).join(", ")}</b></> : <b style={{ color: C.good }}>All good</b>}</div>
                    {itemSel.size > 0 && <div>Items: <b>{[...itemSel].join(", ")}</b></div>}
                    {hasIssue && <div>Action: <b>{ACTIONS.find((a) => a[0] === action)?.[1]}{actionValue ? " £" + actionValue : ""}</b>{resolved != null ? " · left " + (resolved ? "happy" : "unhappy") : ""} · {severity}</div>}
                    {note.trim() && <div style={{ color: C.muted }}>“{note.trim()}”</div>}
                  </div>
                  <div onClick={() => setStage(tags.size ? "flag" : "choose")} style={{ marginTop: 8, fontSize: 12.5, fontWeight: 800, color: C.muted, cursor: "pointer" }}>‹ Change something</div>
                </Sec>
              </div>
              <Sec title="YOUR PIN" right={staff ? (staff.unknown ? <span style={{ color: C.bad }}>not recognised</span> : <span style={{ color: C.good, fontWeight: 800 }}>{staff.name}</span>) : "as in the staff app"}>
                <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: ".4em", textAlign: "center", padding: "6px 0 10px", minHeight: 42, color: staff && staff.unknown ? C.bad : C.ink }}>{pin ? "•".repeat(pin.length) : <span style={{ color: "#cbd5e1" }}>••••</span>}</div>
                <PinPad />
              </Sec>
            </div>
          )}
          {err && <div style={{ color: C.bad, fontWeight: 700, marginBottom: 8 }}>{err}</div>}
        </div>

        <div style={{ padding: "12px 22px 18px", borderTop: "1px solid " + C.line, display: "flex", gap: 10 }}>
          <span onClick={() => stage === "mood" || stage === "choose" ? onClose() : setStage(stage === "pin" ? (tags.size ? "flag" : "choose") : "choose")} style={{ flex: 1, textAlign: "center", padding: "15px 0", borderRadius: 13, background: C.soft, fontWeight: 800, cursor: "pointer" }}>{stage === "mood" || stage === "choose" ? "Cancel" : "‹ Back"}</span>
          {stage !== "choose" && <span onClick={onPrimary} style={{ flex: 2, textAlign: "center", padding: "15px 0", borderRadius: 13, background: done ? C.good : primaryOk && !busy ? C.ink : "#cbd5e1", color: "#fff", fontWeight: 900, fontSize: 15, cursor: primaryOk ? "pointer" : "default" }}>{primaryLabel}</span>}
        </div>
      </div>
    </div>
  );
}
