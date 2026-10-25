import { useEffect, useState } from "react";
import { money, cashNotes } from "./money.js";
import ManagerPin from "./ManagerPin.jsx";
import { U, NUM, Icon, Money, Sheet, Keypad, PinPanel, Btn, Chips, Stat, Row, Verdict, Field, Label, Note, Err, DoneMark } from "./TillUI.jsx";

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

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

const REASONS = {
  payout: ["Petty cash", "Supplier paid in cash", "Cleaning / supplies", "Milk / bread run", "Staff expenses", "Other"],
  payin: ["Float top-up from safe", "Cash from a manager", "Other"],
};
const KIND_LABEL = { payout: "Pay out", payin: "Pay in", drop: "Drop to safe", collection: "Collection" };
// How each kind of entry looks in the list: icon, colour, tint.
const KIND_LOOK = {
  payout: [Icon.up, "#b45309", "#fffbeb"], payin: [Icon.down, "#15803d", "#f0fdf4"],
  drop: [Icon.intoSafe, "#0d9488", "#f0fdfa"], collection: [Icon.bag, "#1d4ed8", "#eff6ff"],
};

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

  const isSafe = tab === "safe";
  const TABS = [["payout", "Pay out", <Icon.up size={16} sw={2.6} />], ["payin", "Pay in", <Icon.down size={16} sw={2.6} />], ["drop", "Drop to safe", <Icon.intoSafe size={16} />], ["safe", "Safe", <Icon.safe size={16} />]];
  const what = isSafe ? (safeMode === "count" ? "Safe count" : safeMode === "collect" ? "Collection" : "Safe") : KIND_LABEL[tab];
  const summary = (
    <div style={{ background: U.soft, borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
      <Label style={{ marginBottom: 2 }}>{what}</Label>
      <Money value={amt} size={36} />
      <div style={{ fontSize: 14, color: U.sub, marginTop: 2 }}>{[reason, bag ? "Bag " + bag : null].filter(Boolean).join(" · ") || " "}</div>
    </div>
  );

  // -------- main pane + footer --------
  let pane = null, footer = null, steps = null, stepNow = null;
  if (today && today.failed) {
    pane = <Err>{today.failed}</Err>;
    footer = <><Btn kind="secondary" onClick={onClose}>Close</Btn><Btn onClick={load}>Try again</Btn></>;
  } else if (today && today.enabled === false) {
    pane = <Note>Cash movements aren't switched on for this store yet. Ask head office to run the cash set-up.</Note>;
  } else if (step === "done" && done) {
    const v = done.variance != null ? Number(done.variance) : null;
    pane = (
      <div style={{ maxWidth: 560 }}>
        <DoneMark title={done.title} sub={done.by ? "Recorded against " + String(done.by).split(" ")[0] : null} />
        <Stat big tone="dark" label={what} money={done.amount} note={[done.bag ? "Bag " + done.bag : null, done.approved ? "Approved by " + done.approved : null].filter(Boolean).join(" · ") || null} />
        {v != null && <div style={{ marginTop: 12 }}><Verdict variance={v} fmt={money} /></div>}
        <Note tone={done.printed === false ? U.warn : null}>{done.printed === false ? "The slip didn't print — it's saved. Write it on paper and sign it." : "The slip is printing — sign it" + (tab === "payout" ? " and staple the receipt to it." : ".")}</Note>
      </div>
    );
    footer = <><Btn kind="secondary" onClick={onClose}>Close</Btn><Btn kind="teal" icon={<Icon.chev size={18} />} onClick={() => reset(tab, safeMode)}>Record another</Btn></>;
  } else if (isSafe && !safeMode) {
    const card = (onClick, icon, t, d, extra) => (
      <div className="tu-tile" onClick={onClick} style={{ display: "flex", gap: 16, border: "1px solid " + U.line, borderRadius: 18, padding: "18px 20px", cursor: "pointer", background: "#fff", boxShadow: "0 1px 0 rgba(18,21,28,.04), 0 4px 14px rgba(18,21,28,.04)" }}>
        <span style={{ width: 52, height: 52, borderRadius: 14, background: "#f0fdfa", color: U.teal, boxShadow: "inset 0 0 0 1px #99f6e4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{t}</div>
          <div style={{ fontSize: 14, color: U.sub, marginTop: 2, lineHeight: 1.45 }}>{d}</div>
          {extra && <div style={{ fontSize: 13, color: U.faint, marginTop: 6 }}>{extra}</div>}
        </div>
        <span style={{ alignSelf: "center", color: U.faint, display: "flex" }}><Icon.chev size={22} /></span>
      </div>
    );
    pane = (
      <div style={{ display: "grid", gap: 10, maxWidth: 620 }}>
        {card(() => reset("safe", "count"), <Icon.safe size={26} />, "Count the safe", "A manager counts, someone else witnesses. Daily. What the safe should hold shows only after the count.",
          today && today.last_safe_count ? "Last counted " + new Date(today.last_safe_count.created_at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }) + " by " + String(today.last_safe_count.counted_by || "").split(" ")[0] : null)}
        {card(() => reset("safe", "collect"), <Icon.bag size={26} />, "Area manager collection", "Cash bagged for the bank: bag number and amount, the area manager's PIN and the PIN of the person handing it over.")}
      </div>
    );
  } else if (step === "amount") {
    const isCollect = isSafe && safeMode === "collect";
    const showBag = isCollect && field === "bag";
    const reasons = REASONS[tab];
    const ready = amt > 0 && (!reasons || reason) && (!isCollect || bag);
    steps = isSafe ? ["Amount", safeMode === "count" ? "Manager" : "Area manager", safeMode === "count" ? "Witness" : "Handed over by", ...(safeMode === "count" ? ["Check"] : [])] : ["Amount", "PIN"];
    stepNow = "Amount";
    pane = (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 20 }}>
        <div>
          <Field label={isSafe ? (safeMode === "count" ? "Counted in the safe" : "Amount in the bag") : "Amount"} money={amt} active={!showBag} onClick={() => setField("amount")} />
          {!isSafe && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {cashNotes().map((n) => (
                <span key={n} className="tu-chip tu-btn" onClick={() => { setField("amount"); setAmount(String(n)); }} style={{ padding: "9px 14px", borderRadius: 999, fontSize: 14.5, fontWeight: 800, cursor: "pointer", userSelect: "none", background: amt === n ? U.ink : U.soft, color: amt === n ? "#fff" : U.ink, ...NUM }}>{money(n).replace(/\.00$/, "")}</span>
              ))}
            </div>
          )}
          {tab === "payout" && limit != null && Number(limit) > 0 && (() => {
            const over = amt >= Number(limit), pct = Math.min(100, (amt / Number(limit)) * 100);
            return (
              <div style={{ marginTop: 14, background: over ? U.warnBg : U.soft, boxShadow: over ? "inset 0 0 0 1.5px " + U.amber : "none", borderRadius: 14, padding: "11px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, fontWeight: 800, color: over ? U.warn : U.sub }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Icon.lock size={15} />{over ? "Manager PIN needed" : "Your PIN is enough"}</span>
                  <span style={NUM}>limit {money(limit)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#e5e7eb", marginTop: 8, overflow: "hidden" }}><div style={{ height: "100%", width: pct + "%", background: over ? "#f59e0b" : U.teal, borderRadius: 3, transition: "width .2s ease, background .2s ease" }} /></div>
              </div>
            );
          })()}
          {isCollect && <div style={{ marginTop: 10 }}><Field big={false} label="Bag number" value={bag} active={showBag} onClick={() => setField("bag")} /></div>}
          {reasons && (
            <div style={{ marginTop: 16 }}>
              <Label tone={reason ? null : U.bad}>Reason</Label>
              <Chips options={reasons} value={reason} onChange={setReason} />
            </div>
          )}
          {tab === "payout" && <Note>Keep the receipt — staple it to the slip.</Note>}
          {tab === "payin" && <Note>Cash going into the drawer. It's added to what the drawer should hold.</Note>}
          {tab === "drop" && <Note>Take the cash out, put it in the safe and sign the slip. It comes off what the drawer should hold.</Note>}
          {isSafe && safeMode === "count" && <Note>Count everything in the safe, bags included. The till shows what it expected only after the count is checked.</Note>}
        </div>
        <div>{showBag ? <Keypad value={bag} onChange={setBag} max={12} /> : <Keypad value={amount} onChange={setAmount} decimal money max={9} />}</div>
      </div>
    );
    footer = <>{isSafe ? <Btn kind="secondary" onClick={() => reset("safe", null)}>Back</Btn> : <Btn kind="secondary" onClick={onClose}>Cancel</Btn>}<Btn disabled={!ready} icon={<Icon.chev size={18} />} onClick={() => { setErr(""); setStep("pin"); }}>Next</Btn></>;
  } else if (step === "pin" || step === "pin2") {
    const first = step === "pin";
    steps = isSafe ? ["Amount", safeMode === "count" ? "Manager" : "Area manager", safeMode === "count" ? "Witness" : "Handed over by", ...(safeMode === "count" ? ["Check"] : [])] : ["Amount", "PIN", ...(needMgr ? ["Manager"] : [])];
    stepNow = isSafe ? steps[first ? 1 : 2] : first ? "PIN" : "Manager";
    const lbl = first ? (isSafe ? (safeMode === "count" ? "Manager counting — PIN" : "Area manager — PIN") : "Your PIN")
                      : (isSafe ? (safeMode === "count" ? "Witness (someone else) — PIN" : "Handed over by (store) — PIN") : "Manager PIN");
    const hint = !first && !isSafe ? money(amt) + " is at or above the " + money(limit || 0) + " limit, so a manager approves it." : null;
    pane = (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 20 }}>
        <div>{summary}{isSafe && !first && <Note>A second person has to confirm. It can't be the same person as before.</Note>}</div>
        <PinPanel label={lbl} hint={hint} value={first ? pin : pin2} onChange={(v) => { (first ? setPin : setPin2)(v); setErr(""); }} error={err} tone={!first && !isSafe ? U.warn : null} />
      </div>
    );
    const ok = first ? pin.length >= 4 : pin2.length >= 4;
    const go = first ? () => { if (isSafe) { setPin2(""); setStep("pin2"); } else submitMove(); } : () => isSafe ? (safeMode === "count" ? checkSafe() : submitCollect()) : submitMove();
    footer = <><Btn kind="secondary" onClick={() => setStep(first ? "amount" : "pin")}>Back</Btn><Btn disabled={busy || !ok} onClick={go}>{busy ? "…" : first && isSafe ? "Next" : isSafe && safeMode === "count" ? "Check count" : "Confirm"}</Btn></>;
  } else if (step === "result" && preview) {
    steps = ["Amount", "Manager", "Witness", "Check"]; stepNow = "Check";
    pane = (
      <div style={{ maxWidth: 620 }}>
        <Verdict variance={preview.variance} fmt={money} counted={preview.counted} expected={preview.expected} />
        {preview.opening && <Note>First count of this safe: it sets the opening balance, so there's nothing to compare yet.</Note>}
        <div style={{ marginTop: 8 }}>
          <Row label="Safe should hold" value={money(preview.expected)} />
          <Row strong label="Counted" value={money(preview.counted)} />
        </div>
        {preview.note_needed && (
          <div style={{ marginTop: 16 }}>
            <Label tone={note ? null : U.bad}>What happened? (required)</Label>
            <Chips options={["Bag not logged", "Float top-up not logged", "Pay-out from the safe", "Miscount", "Don't know"]} value={note} onChange={setNote} />
          </div>
        )}
      </div>
    );
    footer = <><Btn kind="secondary" onClick={() => { setPreview(null); setStep("amount"); }}>Recount</Btn><Btn disabled={busy || (preview.note_needed && !note)} onClick={saveSafe} icon={<Icon.printer size={18} />}>{busy ? "Saving…" : "Save & print"}</Btn></>;
  }

  // -------- aside: since the last close --------
  const moves = (today && today.moves) || [];
  const live = moves.filter((m) => !m.reversed_at);
  const sum = (k) => live.filter((m) => m.kind === k).reduce((t, m) => t + Number(m.amount || 0), 0);
  const aside = (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[["Paid out", "payout"], ["Paid in", "payin"], ["Into the safe", "drop"], ["Collected", "collection"]].map(([l, k]) => {
          const [I, c] = KIND_LOOK[k], v = sum(k);
          return (
            <div key={l} style={{ background: "#fff", border: "1px solid " + U.line, borderRadius: 14, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: v ? c : U.faint }}><I size={13} sw={2.6} />{l}</div>
              <div style={{ marginTop: 2, color: v ? U.ink : "#b6bcc4" }}><Money value={v} size={20} /></div>
            </div>
          );
        })}
      </div>
      {!today && <Note>Loading…</Note>}
      {today && !moves.length && <Note>Nothing yet since the last close.</Note>}
      <div style={{ display: "grid", gap: 6 }}>
        {moves.map((m) => {
          const out = m.kind === "payout" || m.kind === "drop" || m.kind === "collection";
          const canUndo = m.source === "manual" && m.kind !== "collection" && !m.reversed_at;
          return (
            <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "center", background: "#fff", border: "1px solid " + U.line, borderRadius: 14, padding: "9px 11px", opacity: m.reversed_at ? 0.55 : 1 }}>
              {(() => { const [I, c, bg] = KIND_LOOK[m.kind] || KIND_LOOK.payout; return <span style={{ width: 34, height: 34, borderRadius: 10, background: bg, color: c, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><I size={17} sw={2.4} /></span>; })()}
              <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                <span style={{ fontWeight: 800, textDecoration: m.reversed_at ? "line-through" : "none" }}>{m.source === "handover" ? "Handover drop" : m.source === "close" ? "Close takings" : KIND_LABEL[m.kind]}</span>
                <span style={{ fontWeight: 800, color: out ? U.ink : U.good, textDecoration: m.reversed_at ? "line-through" : "none", ...NUM }}>{(out ? "−" : "+") + money(m.amount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, color: U.faint, marginTop: 2 }}>
                <span>{[hhmm(m.created_at), m.reason, m.bag_no ? "bag " + m.bag_no : null, String(m.by_name || "").split(" ")[0]].filter(Boolean).join(" · ")}{m.reversed_at ? " · cancelled" : ""}</span>
                {canUndo && <span onClick={() => setUndoFor(m)} style={{ color: U.bad, fontWeight: 800, cursor: "pointer" }}>Cancel</span>}
              </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      <Sheet icon={<Icon.cash size={24} />} title="Cash" sub="Pay-outs, pay-ins and drops come off what the drawer should hold" onClose={onClose} busy={busy} width={1060}
        tabs={TABS} tab={tab} onTab={(k) => reset(k, null)} steps={steps} step={stepNow}
        aside={aside} asideTitle="Since the last close" footer={footer}>
        {pane}
        <Err>{err}</Err>
      </Sheet>
      {undoFor && (
        <ManagerPin title={"Cancel " + KIND_LABEL[undoFor.kind].toLowerCase() + " of " + money(undoFor.amount)}
          sub="Only for an entry typed by mistake, in the shift still running. A cancelled slip prints."
          confirmLabel="Cancel entry" onClose={() => setUndoFor(null)}
          onSubmit={async (manager_pin) => {
            const r = await act("cash_move_undo", { id: undoFor.id, manager_pin });
            if (r && r.ok) { load(); return null; }
            return (r && (r.message || r.error)) || "Couldn't cancel it.";
          }} />
      )}
    </>
  );
}
