import { useEffect, useState } from "react";
import { money } from "./money.js";
import ManagerPin from "./ManagerPin.jsx";

// CASH MOVEMENTS 2026-10-25 — the till's Cash button.
//
//   Pay out      petty cash / a supplier paid in cash, out of the drawer.
//                Reason + PIN; a manager PIN at or above the store's limit.
//   Pay in       cash into the drawer (float top-up from the safe, change).
//   Drop         drawer → safe in the middle of a shift.
//   Safe         two-person blind safe count; area-manager collection.
//
// Every entry prints a slip with signature lines, comes off (or on) what the
// drawer should hold at the next handover and at Close till, and the safe side
// feeds the safe log. Rules and money are server-side (admin-api).

const C = { ink: "#22271f", muted: "#6b7a60", line: "#e6e8e1", soft: "#f6f7f3", brand: "#5E7A4D", good: "#166534", bad: "#b91c1c", over: "#1d4ed8", warn: "#9a3412" };
const F = "'Poppins',sans-serif";
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

const REASONS = {
  payout: ["Petty cash", "Supplier paid in cash", "Cleaning / supplies", "Milk / bread run", "Staff expenses", "Other"],
  payin: ["Float top-up from safe", "Cash from a manager", "Other"],
};
const KIND_LABEL = { payout: "Pay out", payin: "Pay in", drop: "Drop to safe", collection: "Collection" };

function Keys({ value, onChange, decimal = true, max = 9 }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "C", "0", "⌫"];
  const press = (k) => {
    if (k === "⌫") return onChange(value.slice(0, -1));
    if (k === "C") return onChange("");
    if (k === ".") return onChange(value.includes(".") ? value : (value || "0") + ".");
    if (value.includes(".") && value.split(".")[1].length >= 2) return;
    if (value.length >= max) return;
    onChange(value === "0" ? k : value + k);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
      {keys.map((k) => (
        <div key={k} onClick={() => press(k)} style={{ padding: "13px 0", textAlign: "center", borderRadius: 11, background: k === "⌫" || k === "C" ? "#fff" : C.soft, border: "1px solid " + C.line, fontWeight: 800, fontSize: 20, fontFamily: F, cursor: "pointer", userSelect: "none", color: k === "C" ? C.bad : C.ink }}>{k}</div>
      ))}
    </div>
  );
}

function Btn({ children, onClick, primary, disabled }) {
  return <div onClick={() => !disabled && onClick && onClick()} style={{ flex: 1, textAlign: "center", padding: "14px 0", borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: disabled ? "default" : "pointer", background: primary ? (disabled ? "#b9bfb3" : C.ink) : C.soft, color: primary ? "#fff" : C.ink, userSelect: "none" }}>{children}</div>;
}

export default function CashSheet({ loc, act, onClose }) {
  const [tab, setTab] = useState("payout");          // payout | payin | drop | safe
  const [safeMode, setSafeMode] = useState(null);     // null | count | collect
  const [step, setStep] = useState("amount");        // amount | pin | pin2 | result | done
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [bag, setBag] = useState("");
  const [field, setField] = useState("amount");      // amount | bag (collection entry)
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");              // manager / witness PIN
  const [needMgr, setNeedMgr] = useState(false);
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const [today, setToday] = useState(null);
  const [undoFor, setUndoFor] = useState(null);

  const load = async () => {
    const r = await act("cash_today", { location_id: loc });
    if (r && r.ok) setToday(r);
    else if (r && r.enabled === false) setToday({ enabled: false });
    else setToday({ failed: (r && (r.message || r.error)) || "Couldn't load — check the connection and try again." });
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const reset = (t = tab, sm = null) => { setTab(t); setSafeMode(sm); setStep("amount"); setAmount(""); setReason(""); setBag(""); setField("amount"); setPin(""); setPin2(""); setNeedMgr(false); setPreview(null); setNote(""); setErr(""); setDone(null); };
  const amt = amount === "" ? 0 : r2(amount);
  const limit = today && today.payout_limit;

  async function call(action, data) {
    setBusy(true); setErr("");
    const res = await act(action, { location_id: loc, ...data });
    setBusy(false);
    return res || { ok: false };
  }

  // ---- pay out / pay in / drop ----
  async function submitMove() {
    const res = await call("cash_move", { kind: tab, amount: amt, reason: reason || null, pin, manager_pin: needMgr ? pin2 : null });
    if (res.ok) { setDone({ title: KIND_LABEL[tab] + " recorded", amount: amt, by: res.by, approved: res.approved_by, printed: res.printed }); setStep("done"); load(); return; }
    if (res.error === "manager_required") { setNeedMgr(true); setPin2(""); setStep("pin2"); setErr(res.message || ""); return; }
    setErr(res.message || res.error || "That didn't go through.");
    if (res.error === "bad_pin") setPin("");
  }

  // ---- safe count (two people, blind) ----
  async function checkSafe() {
    const res = await call("safe_count", { counted: amt, pin, witness_pin: pin2, confirm: false });
    if (res.ok) { setPreview(res.preview); setStep("result"); return; }
    setErr(res.message || res.error || "That didn't go through.");
    if (res.error === "manager_required" || res.error === "personal_pin") { setPin(""); setStep("pin"); }
    if (res.error === "witness_required" || res.error === "same_person") setPin2("");
  }
  async function saveSafe() {
    const res = await call("safe_count", { counted: amt, pin, witness_pin: pin2, note: note || null, confirm: true });
    if (res.ok) { setDone({ title: "Safe count saved", amount: amt, variance: res.saved && res.saved.variance, printed: res.printed }); setStep("done"); load(); return; }
    setErr(res.message || res.error || "That didn't go through.");
  }

  // ---- area manager collection ----
  async function submitCollect() {
    const res = await call("safe_collect", { amount: amt, bag_no: bag, pin, witness_pin: pin2 });
    if (res.ok) { setDone({ title: "Collection recorded", amount: amt, bag, printed: res.printed }); setStep("done"); load(); return; }
    setErr(res.message || res.error || "That didn't go through.");
    if (res.error === "area_manager_required") { setPin(""); setStep("pin"); }
    if (res.error === "witness_required" || res.error === "same_person") setPin2("");
  }

  const PinPad = ({ label, value, set, hint }) => (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: C.muted }}>{label}</div>
      {hint && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{hint}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", margin: "10px 0 12px" }}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 7, background: i < value.length ? C.ink : C.line }} />)}
      </div>
      <Keys value={value} onChange={set} decimal={false} max={8} />
    </div>
  );

  const isSafe = tab === "safe";
  const tabs = [["payout", "Pay out"], ["payin", "Pay in"], ["drop", "Drop to safe"], ["safe", "Safe"]];

  // -------- left pane --------
  let pane = null;
  if (today && today.failed) {
    pane = <div style={{ fontSize: 14, color: C.bad, lineHeight: 1.5 }}>{today.failed} <span onClick={load} style={{ color: C.brand, fontWeight: 700, cursor: "pointer" }}>Try again</span></div>;
  } else if (today && today.enabled === false) {
    pane = <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>Cash movements aren't switched on for this store yet. Ask head office to run the cash set-up.</div>;
  } else if (step === "done" && done) {
    pane = (
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: F }}>{done.title}</div>
        <div style={{ fontSize: 40, fontWeight: 800, fontFamily: F, margin: "6px 0" }}>{money(done.amount)}</div>
        {done.variance != null && <div style={{ fontSize: 16, fontWeight: 800, color: Number(done.variance) === 0 ? C.good : Number(done.variance) > 0 ? C.over : C.bad }}>{Number(done.variance) === 0 ? "Safe balanced" : (Number(done.variance) > 0 ? "Over " : "Short ") + money(Math.abs(done.variance))}</div>}
        {done.bag && <div style={{ fontSize: 14, color: C.muted }}>Bag {done.bag}</div>}
        {done.approved && <div style={{ fontSize: 14, color: C.muted }}>Approved by {done.approved}</div>}
        <div style={{ fontSize: 13.5, color: done.printed === false ? C.warn : C.muted, marginTop: 8, lineHeight: 1.5 }}>
          {done.printed === false ? "The slip didn't print — it's saved; write it on paper and sign it." : "Slip printing — sign it" + (tab === "payout" ? " and staple the receipt to it." : ".")}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Btn onClick={onClose}>Close</Btn>
          <Btn primary onClick={() => reset(tab, safeMode)}>Another</Btn>
        </div>
      </div>
    );
  } else if (isSafe && !safeMode) {
    pane = (
      <div style={{ display: "grid", gap: 10 }}>
        <div onClick={() => reset("safe", "count")} style={{ border: "1.5px solid " + C.line, borderRadius: 14, padding: "14px 16px", cursor: "pointer" }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Count the safe</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>A manager counts, someone else witnesses. Daily. What the safe should hold shows only after the count.</div>
          {today && today.last_safe_count && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>Last counted {new Date(today.last_safe_count.created_at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })} by {String(today.last_safe_count.counted_by || "").split(" ")[0]}</div>}
        </div>
        <div onClick={() => reset("safe", "collect")} style={{ border: "1.5px solid " + C.line, borderRadius: 14, padding: "14px 16px", cursor: "pointer" }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Area manager collection</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Cash bagged for the bank: bag number and amount, the area manager's PIN and the PIN of the person handing it over.</div>
        </div>
      </div>
    );
  } else if (step === "amount") {
    const isCollect = isSafe && safeMode === "collect";
    const showBag = isCollect && field === "bag";
    const reasons = REASONS[tab];
    const ready = amt > 0 && (!reasons || reason) && (!isCollect || bag);
    pane = (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
        <div>
          <div onClick={() => setField("amount")} style={{ border: "2px solid " + (!showBag ? C.brand : C.line), borderRadius: 12, padding: "10px 14px", cursor: "pointer" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: C.muted }}>{isSafe ? (safeMode === "count" ? "COUNTED IN THE SAFE" : "AMOUNT IN THE BAG") : "AMOUNT"}</div>
            <div style={{ fontSize: 30, fontWeight: 800, fontFamily: F }}>{money(amt)}</div>
          </div>
          {isCollect && (
            <div onClick={() => setField("bag")} style={{ marginTop: 8, border: "2px solid " + (showBag ? C.brand : C.line), borderRadius: 12, padding: "10px 14px", cursor: "pointer" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: C.muted }}>BAG NUMBER</div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: F, color: bag ? C.ink : "#b5bbb0" }}>{bag || "—"}</div>
            </div>
          )}
          {reasons && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: reason ? C.muted : C.bad, marginBottom: 6 }}>REASON</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {reasons.map((r) => <span key={r} onClick={() => setReason(r)} style={{ padding: "8px 11px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", userSelect: "none", background: reason === r ? C.ink : C.soft, color: reason === r ? "#fff" : C.ink, border: "1px solid " + (reason === r ? C.ink : C.line) }}>{r}</span>)}
              </div>
            </div>
          )}
          {tab === "payout" && limit != null && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>{money(limit)} or more needs a manager PIN. Keep the receipt — staple it to the slip.</div>}
          {tab === "drop" && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10, lineHeight: 1.45 }}>Take the cash out, put it in the safe, and sign the slip. It comes off what the drawer should hold.</div>}
          {isSafe && safeMode === "count" && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10, lineHeight: 1.45 }}>Count everything in the safe (bags included). The till shows what it expected only after the count is checked.</div>}
        </div>
        <div>
          {showBag ? <Keys value={bag} onChange={setBag} decimal={false} max={12} /> : <Keys value={amount} onChange={setAmount} />}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            {isSafe && <Btn onClick={() => reset("safe", null)}>Back</Btn>}
            <Btn primary disabled={!ready} onClick={() => { setErr(""); setStep("pin"); }}>Next</Btn>
          </div>
        </div>
      </div>
    );
  } else if (step === "pin") {
    const lbl = isSafe ? (safeMode === "count" ? "MANAGER COUNTING" : "AREA MANAGER") : "YOUR PIN";
    pane = (
      <div style={{ maxWidth: 360 }}>
        <PinPad label={lbl} value={pin} set={setPin} hint={isSafe ? null : KIND_LABEL[tab] + " · " + money(amt) + (reason ? " · " + reason : "")} />
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <Btn onClick={() => setStep("amount")}>Back</Btn>
          <Btn primary disabled={busy || pin.length < 4} onClick={() => { if (isSafe) { setPin2(""); setStep("pin2"); } else submitMove(); }}>{busy ? "…" : isSafe ? "Next" : "Confirm"}</Btn>
        </div>
      </div>
    );
  } else if (step === "pin2") {
    const lbl = isSafe ? (safeMode === "count" ? "WITNESS (SOMEONE ELSE)" : "HANDED OVER BY (STORE)") : "MANAGER PIN";
    pane = (
      <div style={{ maxWidth: 360 }}>
        <PinPad label={lbl} value={pin2} set={setPin2} hint={!isSafe ? money(amt) + " is at or above the " + money(limit || 0) + " limit." : null} />
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <Btn onClick={() => setStep("pin")}>Back</Btn>
          <Btn primary disabled={busy || pin2.length < 4} onClick={() => isSafe ? (safeMode === "count" ? checkSafe() : submitCollect()) : submitMove()}>{busy ? "…" : isSafe && safeMode === "count" ? "Check count" : "Confirm"}</Btn>
        </div>
      </div>
    );
  } else if (step === "result" && preview) {
    const v = Number(preview.variance) || 0;
    const tone = v === 0 ? C.good : v > 0 ? C.over : C.bad;
    pane = (
      <div>
        <div style={{ border: "3px solid " + tone, borderRadius: 14, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", color: tone }}>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{v === 0 ? "BALANCED" : v > 0 ? "OVER" : "SHORT"}</span>
          <span style={{ fontSize: 26, fontWeight: 800, fontFamily: F }}>{(v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v))}</span>
        </div>
        {preview.opening && <div style={{ fontSize: 12.5, color: C.muted, margin: "8px 0 2px", lineHeight: 1.45 }}>First count of this safe: it sets the opening balance, so there's nothing to compare yet.</div>}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid " + C.line }}><span style={{ color: C.muted }}>Safe should hold</span><b style={{ fontFamily: F }}>{money(preview.expected)}</b></div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid " + C.line }}><span style={{ color: C.muted }}>Counted</span><b style={{ fontFamily: F }}>{money(preview.counted)}</b></div>
        {preview.note_needed && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: note ? C.muted : C.bad, marginBottom: 6 }}>WHAT HAPPENED? (REQUIRED)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["Bag not logged", "Float top-up not logged", "Pay-out from the safe", "Miscount", "Don't know"].map((r) => <span key={r} onClick={() => setNote(r)} style={{ padding: "8px 11px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", background: note === r ? C.ink : C.soft, color: note === r ? "#fff" : C.ink, border: "1px solid " + (note === r ? C.ink : C.line) }}>{r}</span>)}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Btn onClick={() => { setPreview(null); setStep("amount"); }}>Recount</Btn>
          <Btn primary disabled={busy || (preview.note_needed && !note)} onClick={saveSafe}>{busy ? "Saving…" : "Save & print"}</Btn>
        </div>
      </div>
    );
  }

  // -------- right pane: today --------
  const moves = (today && today.moves) || [];
  return (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(18,21,28,.58)", zIndex: 91, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 22, width: 900, maxWidth: "100%", maxHeight: "94vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 80px rgba(18,21,28,.35)" }}>
        <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 23, fontWeight: 800, fontFamily: F, letterSpacing: "-.02em" }}>Cash</div>
          <div style={{ display: "flex", gap: 4, background: C.soft, borderRadius: 10, padding: 3 }}>
            {tabs.map(([k, l]) => <div key={k} onClick={() => !busy && reset(k, null)} style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", background: tab === k ? "#fff" : "transparent", boxShadow: tab === k ? "0 1px 2px rgba(0,0,0,.12)" : "none" }}>{l}</div>)}
          </div>
          <span onClick={() => !busy && onClose()} style={{ marginLeft: "auto", width: 34, height: 34, borderRadius: "50%", background: C.soft, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16 }}>✕</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px 18px", display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 18 }}>
          <div>
            {pane}
            {err && <div style={{ marginTop: 10, color: C.bad, fontWeight: 700, fontSize: 13.5 }}>{err}</div>}
          </div>
          <div style={{ borderLeft: "1px solid " + C.line, paddingLeft: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: C.muted, marginBottom: 6 }}>SINCE THE LAST CLOSE</div>
            {!today && <div style={{ fontSize: 13, color: C.muted }}>Loading…</div>}
            {today && !moves.length && <div style={{ fontSize: 13, color: C.muted }}>Nothing yet.</div>}
            {moves.map((m) => {
              const out = m.kind === "payout" || m.kind === "drop" || m.kind === "collection";
              const canUndo = m.source === "manual" && m.kind !== "collection" && !m.reversed_at;
              return (
                <div key={m.id} style={{ padding: "7px 0", borderBottom: "1px solid " + C.line, opacity: m.reversed_at ? 0.5 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13.5 }}>
                    <span style={{ fontWeight: 700, textDecoration: m.reversed_at ? "line-through" : "none" }}>{hhmm(m.created_at)} · {m.source === "handover" ? "Handover drop" : m.source === "close" ? "Close takings" : KIND_LABEL[m.kind]}</span>
                    <span style={{ fontFamily: F, fontWeight: 700, color: out ? C.ink : C.good, textDecoration: m.reversed_at ? "line-through" : "none" }}>{(out ? "−" : "+") + money(m.amount)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted }}>
                    <span>{[m.reason, m.bag_no ? "bag " + m.bag_no : null, String(m.by_name || "").split(" ")[0]].filter(Boolean).join(" · ")}{m.reversed_at ? " · cancelled" : ""}</span>
                    {canUndo && <span onClick={() => setUndoFor(m)} style={{ color: C.bad, fontWeight: 700, cursor: "pointer" }}>Cancel</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {undoFor && (<div onClick={(e) => e.stopPropagation()}>
        <ManagerPin title={"Cancel " + KIND_LABEL[undoFor.kind].toLowerCase() + " of " + money(undoFor.amount)}
          sub="Only for an entry typed by mistake, in the shift still running. A cancelled slip prints."
          confirmLabel="Cancel entry" onClose={() => setUndoFor(null)}
          onSubmit={async (manager_pin) => {
            const r = await act("cash_move_undo", { id: undoFor.id, manager_pin });
            if (r && r.ok) { load(); return null; }
            return (r && (r.message || r.error)) || "Couldn't cancel it.";
          }} />
      </div>)}
    </div>
  );
}
