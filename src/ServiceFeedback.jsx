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
  const [existing, setExisting] = useState([]);
  const remembered = (() => { try { const j = JSON.parse(sessionStorage.getItem("svc_pin") || "null"); return j && Date.now() - j.t < 15 * 60000 ? j : null; } catch { return null; } })();
  useEffect(() => {
    if (remembered && !pin) { setPin(remembered.pin); setStaff({ name: remembered.name }); }
    if (o.id) fetch(supabaseUrl + "/rest/v1/service_log?select=id,rating,tags,logged_by,created_at&order_id=eq." + o.id + "&order=created_at.desc", { headers }).then((r) => r.ok ? r.json() : []).then((rows) => setExisting(rows || [])).catch(() => {});
  }, []); // eslint-disable-line
  const suggested = (() => { const out = []; const b = o.kds_bumped_at || o.served_at; const secs = b ? (new Date(b) - new Date(o.created_at)) / 1000 : null; if (secs != null && secs > 15 * 60) out.push("slow_food"); return out; })();

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
      try { sessionStorage.setItem("svc_pin", JSON.stringify({ pin, name: j.logged_by || (staff && staff.name) || "", t: Date.now() })); } catch {}
      if (onSaved) onSaved(j);
      setTimeout(onClose, 1300);
    } catch (e) { setErr(e.message || "Could not save"); } finally { setBusy(false); }
  }

  const [stage, setStage] = useState(prefill && prefill.rating ? "choose" : "mood"); // mood → choose → (flag) → pin
  const GROUP_ICON = { speed: "⏱", accuracy: "🎯", food: "🍳", drink: "🥤", service: "🙋", cleanliness: "🧽", ambience: "🎵", billing: "🧾", positive: "⭐", other: "•" };
  const groups = Object.entries(TAGS.reduce((m, t) => { (m[t.c] ||= []).push(t); return m; }, {}));
  const lbl = o.menu_tables?.label || (o.order_type === "takeaway" ? "Takeaway" : o.order_type === "dine_in" ? "Dine in" : o.order_type || "");
  const overTarget = ticketSecs != null && ticketSecs > 15 * 60;
  const moodMeta = (v) => MOODS.find((m) => m[0] === v);
  const primaryLabel = done ? "✓ Logged" : busy ? "Saving…" : stage === "mood" ? (rating ? "Next" : "Pick a mood") : stage === "flag" ? (tags.size ? "Next" : "Pick what happened") : pin.length < 4 ? "Enter your PIN" : staff && staff.unknown ? "PIN not recognised" : "Log feedback";
  const primaryOk = done ? false : stage === "mood" ? !!rating : stage === "flag" ? tags.size > 0 : (pin.length >= 4 && !(staff && staff.unknown));
  const onPrimary = () => { if (busy || !primaryOk) return; if (stage === "mood") setStage("choose"); else if (stage === "flag") setStage("pin"); else save(); };
  const goBack = () => { if (stage === "mood" || stage === "choose") onClose(); else if (stage === "flag") setStage("choose"); else setStage(tags.size ? "flag" : "choose"); };

  // sizes scale with the screen: a 10" POS tablet and a 32" wall screen both work
  const fs = (min, vw, max) => "clamp(" + min + "px, " + vw + "vw, " + max + "px)";
  const T = { h1: fs(22, 1.6, 34), h2: fs(14, .9, 18), body: fs(15, 1.05, 22), chip: fs(16, 1.15, 24), face: "min(11vw, 30vh)", key: fs(22, 1.6, 34), btn: fs(16, 1.2, 24) };
  useEffect(() => { const h = (e) => { if (stage !== "mood" && stage !== "choose") return; const n = Number(e.key); if (n >= 1 && n <= 5) { setRating(n); setStage("choose"); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [stage]);
  // mood → sensible defaults for severity, so an upset guest isn't logged as "minor" by accident
  useEffect(() => { if (rating === 1) setSeverity("high"); else if (rating === 2) setSeverity("medium"); else if (rating >= 3) setSeverity("low"); }, [rating]);
  const pad = fs(14, 1.4, 32);

  const Tag = ({ on, children, onClick, tone }) => (
    <span onClick={onClick} className={"svc-tap" + (on ? " svc-on" : "")} style={{ cursor: "pointer", padding: fs(10, .8, 18) + " " + fs(14, 1.1, 26), borderRadius: fs(10, .8, 16), fontSize: T.chip, fontWeight: 700, background: on ? (tone || C.ink) : "#fff", color: on ? "#fff" : C.ink, border: "2px solid " + (on ? (tone || C.ink) : C.line), userSelect: "none", whiteSpace: "nowrap", lineHeight: 1.15, boxShadow: on ? "0 6px 16px rgba(15,23,42,.18)" : "0 1px 2px rgba(15,23,42,.05)" }}>{on ? "✓ " : ""}{children}</span>
  );
  const Row = ({ k, v }) => <div style={{ display: "flex", gap: 8, fontSize: T.body, lineHeight: 1.5 }}><span style={{ color: "#94a3b8", width: "5.5em", flexShrink: 0 }}>{k}</span><span style={{ fontWeight: 700, minWidth: 0 }}>{v}</span></div>;
  const steps = [["mood", "Mood"], ["flag", "What happened"], ["pin", "Your PIN"]];
  const stepIdx = stage === "mood" || stage === "choose" ? 0 : stage === "flag" ? 1 : 2;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "#eef2f7", color: C.ink, fontFamily: "'Inter',system-ui,sans-serif", display: "grid", gridTemplateColumns: "minmax(280px, 26%) 1fr", height: "100vh", overflow: "hidden" }}>
      <style>{`
        @keyframes svcPop { 0% { transform: scale(.92); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }
        @keyframes svcIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes svcTick { 0% { transform: scale(0) rotate(-20deg); opacity: 0; } 60% { transform: scale(1.2) rotate(4deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }
        .svc-stage > * { animation: svcIn .22s ease-out both; }
        .svc-tap { transition: transform .12s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease; }
        .svc-tap:active { transform: scale(.96) !important; }
        .svc-on { animation: svcPop .22s ease-out; }
      `}</style>
      {/* ───── LEFT: context + running summary ───── */}
      <div style={{ background: "#0f172a", color: "#fff", padding: pad, display: "flex", flexDirection: "column", gap: fs(14, 1.2, 28), minWidth: 0, minHeight: 0, overflowY: "auto" }}>
        <div>
          <div style={{ fontSize: T.h2, fontWeight: 800, letterSpacing: ".1em", color: "#94a3b8" }}>SERVICE FEEDBACK</div>
          <div style={{ fontSize: T.h1, fontWeight: 900, fontFamily: "'Poppins',sans-serif", marginTop: 4 }}>#{o.order_no}{lbl ? " · " + lbl : ""}</div>
          {ticketSecs != null && <div style={{ display: "inline-block", marginTop: 8, padding: "4px 12px", borderRadius: 8, fontSize: T.h2, fontWeight: 800, background: overTarget ? "#7f1d1d" : "#14532d", color: overTarget ? "#fecaca" : "#bbf7d0" }}>kitchen {Math.floor(ticketSecs / 60)}:{String(ticketSecs % 60).padStart(2, "0")}{overTarget ? " · over target" : ""}</div>}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: T.h2, fontWeight: 800, letterSpacing: ".1em", color: "#94a3b8", marginBottom: 6 }}>ON THE TICKET</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: "26vh", overflowY: "auto" }}>
            {(o.menu_order_items || []).map((it, i) => <div key={i} style={{ fontSize: T.body, color: "#e2e8f0", lineHeight: 1.35 }}>{it.qty > 1 ? it.qty + "× " : ""}{it.name_snapshot}</div>)}
          </div>
        </div>
        {existing.length > 0 && (
          <div style={{ padding: "10px 12px", borderRadius: 12, background: "#1e3a8a", fontSize: T.h2, lineHeight: 1.4 }}>
            Already logged {existing.length === 1 ? "once" : existing.length + "×"} — last by <b>{existing[0].logged_by || "staff"}</b> at {new Date(existing[0].created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}{existing[0].rating ? " " + ["", "😠", "🙁", "😐", "🙂", "😄"][existing[0].rating] : ""}
          </div>
        )}
        <div style={{ marginTop: "auto" }}>
          <div style={{ fontSize: T.h2, fontWeight: 800, letterSpacing: ".1em", color: "#94a3b8", marginBottom: 8 }}>YOU'RE LOGGING</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, color: "#fff" }}>
            <Row k="Mood" v={rating ? <span><span style={{ fontSize: "1.3em" }}>{moodMeta(rating)[1]}</span> {moodMeta(rating)[2]}</span> : <span style={{ color: "#64748b", fontWeight: 500 }}>—</span>} />
            <Row k="Flags" v={tags.size ? [...tags].map((k) => TAGS.find((t) => t.k === k)?.l).join(", ") : (stage === "pin" || stage === "flag") ? <span style={{ color: "#86efac" }}>{stage === "pin" && !tags.size ? "All good" : "—"}</span> : <span style={{ color: "#64748b", fontWeight: 500 }}>—</span>} />
            {itemSel.size > 0 && <Row k="Items" v={[...itemSel].join(", ")} />}
            {hasIssue && <Row k="Action" v={(ACTIONS.find((a) => a[0] === action)?.[1] || "") + (actionValue ? " £" + actionValue : "") + (resolved != null ? " · left " + (resolved ? "happy" : "unhappy") : "") + " · " + severity} />}
            {note.trim() && <Row k="Note" v={<span style={{ fontWeight: 500, color: "#cbd5e1" }}>“{note.trim()}”</span>} />}
            {staff && !staff.unknown && <Row k="By" v={staff.name} />}
          </div>
        </div>
      </div>

      {done && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 28, padding: fs(28, 3, 60), display: "flex", flexDirection: "column", alignItems: "center", gap: 10, animation: "svcIn .2s ease-out both" }}>
            <span style={{ width: fs(90, 9, 160), height: fs(90, 9, 160), borderRadius: "50%", background: C.good, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs(50, 5, 90), fontWeight: 900, animation: "svcTick .45s ease-out both" }}>✓</span>
            <div style={{ fontSize: T.h1, fontWeight: 900, fontFamily: "'Poppins',sans-serif" }}>Logged{staff && !staff.unknown ? " · " + staff.name : ""}</div>
            <div style={{ fontSize: T.body, color: C.muted }}>#{o.order_no}{lbl ? " · " + lbl : ""} · {rating ? moodMeta(rating)[1] + " " + moodMeta(rating)[2] : ""}{tags.size ? " · " + tags.size + " flag" + (tags.size === 1 ? "" : "s") : ""}</div>
          </div>
        </div>
      )}
      {/* ───── RIGHT: the stage ───── */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: "100vh" }}>
        {/* step bar */}
        <div style={{ display: "flex", alignItems: "center", gap: fs(10, 1, 20), padding: pad, paddingBottom: 0 }}>
          {steps.map(([k, l], i) => (
            <div key={k} onClick={() => { if (i < stepIdx) setStage(k === "mood" ? "choose" : "flag"); }} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, cursor: i < stepIdx ? "pointer" : "default" }}>
              <span style={{ width: fs(30, 2.2, 44), height: fs(30, 2.2, 44), borderRadius: "50%", background: i < stepIdx ? C.good : i === stepIdx ? C.ink : "#cbd5e1", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: T.h2, flexShrink: 0 }}>{i < stepIdx ? "✓" : i + 1}</span>
              <span style={{ fontSize: T.body, fontWeight: 800, color: i === stepIdx ? C.ink : "#94a3b8", whiteSpace: "nowrap" }}>{l}</span>
              {i < steps.length - 1 && <span style={{ flex: 1, height: 3, background: i < stepIdx ? C.good : "#cbd5e1", borderRadius: 2, marginLeft: 8 }} />}
            </div>
          ))}
          <span onClick={onClose} style={{ cursor: "pointer", width: fs(40, 3, 56), height: fs(40, 3, 56), borderRadius: 12, background: "#fff", border: "1px solid " + C.line, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: T.body, flexShrink: 0 }}>✕</span>
        </div>

        {/* content */}
        <div className="svc-stage" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: pad, display: "flex", flexDirection: "column", WebkitOverflowScrolling: "touch" }}>
          {(stage === "mood" || stage === "choose") && (
            <>
              <div style={{ fontSize: T.h1, fontWeight: 900, fontFamily: "'Poppins',sans-serif", marginBottom: fs(12, 1, 24) }}>How did the guest leave?</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: fs(10, 1, 22), flex: stage === "mood" ? 1 : "0 0 auto", minHeight: stage === "mood" ? 0 : undefined, maxHeight: stage === "mood" ? "62vh" : undefined }}>
                {MOODS.map(([v, face, l]) => {
                  const on = rating === v; const col = v <= 2 ? C.bad : v === 3 ? C.warn : C.good; const bg = v <= 2 ? "#fee2e2" : v === 3 ? "#fef3c7" : "#dcfce7";
                  return (
                    <div key={v} onClick={() => { setRating(v); setStage("choose"); }} className={"svc-tap" + (on ? " svc-on" : "")} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: fs(8, .8, 18), padding: stage === "mood" ? fs(18, 2, 40) + " 0" : fs(14, 1.2, 24) + " 0", borderRadius: fs(16, 1.4, 28), cursor: "pointer", background: on ? bg : "#fff", border: "3px solid " + (on ? col : "transparent"), boxShadow: on ? "0 14px 36px rgba(15,23,42,.14)" : "0 1px 3px rgba(15,23,42,.06)", transform: on ? "scale(1.03)" : "none", position: "relative" }}>
                      <div style={{ fontSize: stage === "mood" ? T.face : fs(36, 3, 64), lineHeight: 1, filter: rating && !on ? "grayscale(.6) opacity(.55)" : "none", transition: "filter .15s" }}>{face}</div>
                      <div style={{ fontSize: T.body, fontWeight: 800, color: on ? C.ink : C.muted }}>{l}</div>
                      {stage === "mood" && <span style={{ position: "absolute", top: 10, left: 12, fontSize: T.h2, fontWeight: 800, color: "#cbd5e1" }}>{v}</span>}
                    </div>
                  );
                })}
              </div>
              {stage === "choose" && (
                <>
                  <div style={{ fontSize: T.h1, fontWeight: 900, fontFamily: "'Poppins',sans-serif", margin: fs(18, 1.6, 36) + " 0 " + fs(12, 1, 24) }}>Anything to note?</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: fs(10, 1, 22), flex: 1, minHeight: 0 }}>
                    <div onClick={() => { setTags(new Set()); setStage("pin"); }} style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: fs(24, 2.5, 50), borderRadius: fs(16, 1.4, 28), background: "#f0fdf4", border: "3px solid #86efac" }}>
                      <div style={{ fontSize: fs(44, 4, 84), lineHeight: 1 }}>✓</div>
                      <div style={{ fontSize: T.h1, fontWeight: 900, color: C.good }}>All good</div>
                      <div style={{ fontSize: T.body, color: C.muted }}>Nothing to flag</div>
                    </div>
                    <div onClick={() => setStage("flag")} style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: fs(24, 2.5, 50), borderRadius: fs(16, 1.4, 28), background: "#fff7ed", border: "3px solid #fdba74" }}>
                      <div style={{ fontSize: fs(44, 4, 84), lineHeight: 1 }}>⚑</div>
                      <div style={{ fontSize: T.h1, fontWeight: 900, color: C.warn }}>Something to note</div>
                      <div style={{ fontSize: T.body, color: C.muted }}>Issue · compliment · occasion · regular</div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {stage === "flag" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: fs(10, .9, 20), gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: T.h1, fontWeight: 900, fontFamily: "'Poppins',sans-serif" }}>What happened?</div>
                <div style={{ fontSize: T.body, color: C.muted }}>{tags.size ? tags.size + " selected" : "tap everything that applies"}</div>
              </div>
              {suggested.length > 0 && !suggested.every((k) => tags.has(k)) && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: fs(10, .9, 20), padding: fs(10, .8, 18), borderRadius: 14, background: "#fff7ed", border: "1px solid #fed7aa" }}>
                  <span style={{ fontSize: T.body, fontWeight: 800, color: C.warn }}>The kitchen clock says:</span>
                  {suggested.filter((k) => !tags.has(k)).map((k) => <Tag key={k} tone={C.warn} onClick={() => setTags((s) => new Set(s).add(k))}>+ {TAGS.find((t) => t.k === k)?.l}</Tag>)}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(" + fs(300, 24, 460) + ", 1fr))", gap: fs(10, .9, 20) }}>
                {groups.map(([c, list]) => (
                  <div key={c} style={{ background: c === "positive" ? "#f0fdf4" : "#fff", border: "2px solid " + (list.some((t) => tags.has(t.k)) ? (c === "positive" ? C.good : C.ink) : (c === "positive" ? "#bbf7d0" : C.line)), borderRadius: fs(14, 1.2, 24), padding: fs(12, 1, 22), transition: "border-color .15s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: fs(8, .7, 14) }}>
                      <span style={{ fontSize: T.h2, fontWeight: 900, letterSpacing: ".08em", color: C.muted }}>{GROUP_ICON[c]} {CATEGORY_LABEL[c].toUpperCase()}</span>
                      {list.filter((t) => tags.has(t.k)).length > 0 && <span style={{ fontSize: T.h2, fontWeight: 900, background: c === "positive" ? C.good : C.ink, color: "#fff", borderRadius: 999, padding: "2px 10px" }}>{list.filter((t) => tags.has(t.k)).length}</span>}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: fs(6, .6, 12) }}>
                      {list.map((t) => <Tag key={t.k} on={tags.has(t.k)} tone={c === "positive" ? C.good : undefined} onClick={() => setTags((s) => { const n = new Set(s); n.has(t.k) ? n.delete(t.k) : n.add(t.k); return n; })}>{t.l}</Tag>)}
                    </div>
                  </div>
                ))}
              </div>
              {tags.size > 0 && (
                <div style={{ marginTop: fs(14, 1.2, 28), display: "grid", gridTemplateColumns: hasIssue ? "1fr 1fr" : "1fr", gap: fs(10, .9, 20) }}>
                  {items.length > 0 && (
                    <div style={{ background: "#fff", border: "1px solid " + C.line, borderRadius: fs(14, 1.2, 24), padding: fs(12, 1, 22) }}>
                      <div style={{ fontSize: T.h2, fontWeight: 900, letterSpacing: ".08em", color: C.muted, marginBottom: fs(8, .7, 14) }}>WHICH ITEMS <span style={{ fontWeight: 600, letterSpacing: 0 }}>· optional</span></div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: fs(6, .6, 12) }}>{[...new Set(items)].map((n) => <Tag key={n} on={itemSel.has(n)} onClick={() => setItemSel((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; })}>{n}</Tag>)}</div>
                    </div>
                  )}
                  {hasIssue && (
                    <div style={{ background: "#fff", border: "1px solid " + C.line, borderRadius: fs(14, 1.2, 24), padding: fs(12, 1, 22) }}>
                      <div style={{ fontSize: T.h2, fontWeight: 900, letterSpacing: ".08em", color: C.muted, marginBottom: fs(8, .7, 14) }}>WHAT WAS DONE</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: fs(6, .6, 12), marginBottom: fs(10, .8, 16), alignItems: "center" }}>
                        {ACTIONS.map(([k, l]) => <Tag key={k} on={action === k} onClick={() => setAction(k)}>{l}</Tag>)}
                        {(action === "discount" || action === "comp" || action === "voucher") && <input value={actionValue} onChange={(e) => setActionValue(e.target.value.replace(/[^\d.]/g, ""))} placeholder="£ value" inputMode="decimal" style={{ width: "6em", padding: fs(8, .7, 14), borderRadius: 12, border: "2px solid " + C.line, fontSize: T.chip, fontWeight: 700 }} />}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: fs(6, .6, 12), alignItems: "center" }}>
                        <span style={{ fontSize: T.body, color: C.muted }}>Left happy?</span>
                        <Tag on={resolved === true} tone={C.good} onClick={() => setResolved(true)}>Yes</Tag>
                        <Tag on={resolved === false} tone={C.bad} onClick={() => setResolved(false)}>No</Tag>
                        <span style={{ width: 1, height: 24, background: C.line, margin: "0 10px" }} />
                        <span style={{ fontSize: T.body, color: C.muted }}>How serious?</span>
                        {[["low", "Minor"], ["medium", "Notable"], ["high", "Serious"]].map(([k, l]) => <Tag key={k} on={severity === k} tone={k === "high" ? C.bad : k === "medium" ? C.warn : undefined} onClick={() => setSeverity(k)}>{l}</Tag>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={hasIssue ? "Note — what the guest said, what you saw…" : "Note — anything worth remembering about this table"} style={{ marginTop: fs(14, 1.2, 28), width: "100%", boxSizing: "border-box", padding: fs(14, 1.2, 24), borderRadius: fs(12, 1, 20), border: "2px solid " + C.line, fontSize: T.chip, background: "#fff" }} />
            </>
          )}

          {stage === "pin" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: fs(12, 1.2, 28) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {staff && !staff.unknown && <span className="svc-on" style={{ width: fs(44, 3.4, 68), height: fs(44, 3.4, 68), borderRadius: "50%", background: C.good, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: T.h1 }}>{String(staff.name).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>}
                <div style={{ fontSize: T.h1, fontWeight: 900, fontFamily: "'Poppins',sans-serif" }}>{staff && !staff.unknown ? "Logging as " + staff.name : "Your PIN"}</div>
              </div>
              <div style={{ fontSize: T.body, color: staff && staff.unknown ? C.bad : C.muted }}>{staff && staff.unknown ? "PIN not recognised for this store" : staff ? (remembered && pin === remembered.pin ? <span>Remembered from earlier · <span onClick={() => { setPin(""); setStaff(null); }} style={{ textDecoration: "underline", cursor: "pointer" }}>not you?</span></span> : "Tap Log feedback to save") : "Same PIN as the staff app"}</div>
              <div style={{ display: "flex", gap: fs(10, 1, 20), margin: fs(6, .6, 14) + " 0" }}>
                {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: fs(18, 1.4, 28), height: fs(18, 1.4, 28), borderRadius: "50%", background: i < pin.length ? (staff && staff.unknown ? C.bad : C.ink) : "#cbd5e1" }} />)}
                {pin.length > 4 && <span style={{ fontSize: T.body, color: C.muted }}>+{pin.length - 4}</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, " + fs(80, 7, 140) + ")", gap: fs(8, .9, 18) }}>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "C"].map((k) => (
                  <span key={k} onClick={() => onPin(k === "⌫" ? pin.slice(0, -1) : k === "C" ? "" : pin + k)} className="svc-tap" style={{ height: fs(60, 5.2, 104), borderRadius: fs(14, 1.2, 24), background: /\d/.test(k) ? "#fff" : "#e2e8f0", border: "1px solid " + C.line, display: "flex", alignItems: "center", justifyContent: "center", fontSize: T.key, fontWeight: 800, cursor: "pointer", userSelect: "none", boxShadow: "0 1px 3px rgba(15,23,42,.06)" }}>{k}</span>
                ))}
              </div>
            </div>
          )}
          {err && <div style={{ color: C.bad, fontWeight: 700, marginTop: 10, fontSize: T.body }}>{err}</div>}
        </div>

        {/* footer */}
        <div style={{ padding: pad, paddingTop: 0, display: "flex", gap: fs(10, 1, 20) }}>
          <span onClick={goBack} style={{ flex: "0 0 " + fs(120, 14, 280), textAlign: "center", padding: fs(14, 1.3, 26) + " 0", borderRadius: fs(12, 1.1, 20), background: "#fff", border: "1px solid " + C.line, fontWeight: 800, fontSize: T.btn, cursor: "pointer" }}>{stage === "mood" || stage === "choose" ? "Cancel" : "‹ Back"}</span>
          {stage !== "choose" && <span onClick={onPrimary} style={{ flex: 1, textAlign: "center", padding: fs(14, 1.3, 26) + " 0", borderRadius: fs(12, 1.1, 20), background: done ? C.good : primaryOk && !busy ? C.ink : "#cbd5e1", color: "#fff", fontWeight: 900, fontSize: T.btn, cursor: primaryOk ? "pointer" : "default", boxShadow: primaryOk ? "0 10px 30px rgba(15,23,42,.18)" : "none" }}>{primaryLabel}</span>}
        </div>
      </div>
    </div>
  );
}
