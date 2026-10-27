import { useEffect, useState } from "react";
import { money, denominations, denomLabel } from "./money.js";
import { HelpButton } from "./TillHelp.jsx";
import { U, NUM, Icon, Money, Sheet, Keypad, PinPanel, Btn, Chips, Stat, Row, Verdict, Field, Label, Note, Err, DenomTile, DoneMark, Instruction } from "./TillUI.jsx";

// SHIFTS 2026-10-24 — shift handover at the till.
//
//   Start shift   incoming person confirms the float they are handed + PIN
//   End my shift  outgoing person, PIN. The next shift's sales start that
//                 second; nothing stops selling while they count.
//   Blind count   notes and coins (or a total). The expected figure is never
//                 shown until the count is in.
//   Result        over / short, what to drop in the safe, what float to leave;
//                 a note when the drawer is out by more than a few pounds.
//                 Prints the handover slip.
//
// All money and rules are server-side (admin-api shift_* actions); this sheet
// only collects the PINs and the count.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const since = (iso) => { const m = iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0; return m < 60 ? m + "m" : Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m"; };
const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

// The shift line on the till's side panel.
export function ShiftButton({ status, onOpen }) {
  if (!status || status.enabled === false) return null;
  const sh = status.shift;
  const label = !sh ? "Start shift" : sh.status === "counting" ? "Shift · counting" : "Shift · " + String(sh.opened_by || "").split(" ")[0] + " since " + hhmm(sh.opened_at);
  return (
    <div onClick={onOpen} style={{ textAlign: "center", padding: "clamp(9px,.7vw,13px) 0", borderRadius: 10, background: sh ? "rgba(253,224,71,.10)" : "rgba(253,224,71,.18)", color: "#fde68a", fontWeight: 800, fontSize: "clamp(12px,.9vw,16px)", letterSpacing: ".02em", cursor: "pointer", border: "1px solid rgba(253,224,71,.3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "clamp(9px,.7vw,13px) 6px" }}>
      {label}
    </div>
  );
}

export default function ShiftSheet({ loc, status, act, onClose, onChanged }) {
  const sh = status && status.shift;
  const startStep = !sh ? "start" : sh.status === "counting" ? "count" : "running";
  const [step, setStep] = useState(startStep);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // start
  const handed = status && status.last && status.last.float_left != null ? Number(status.last.float_left) : null;
  const [floatMode, setFloatMode] = useState("same");   // same | other
  const [floatVal, setFloatVal] = useState("");
  const [floatNote, setFloatNote] = useState("");
  const [padTarget, setPadTarget] = useState("float");   // different float: which the keypad types
  // count
  const DENOMS = denominations();
  const [countMode, setCountMode] = useState("denoms");
  const [denoms, setDenoms] = useState({});
  const [padFor, setPadFor] = useState(null);           // denomination being typed
  const [total, setTotal] = useState("");
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(null);
  // HANDOVER 2026-10-27: where the takings go — "safe" (bag it now) or "till"
  // (leave it in the drawer; it's bagged at the day close). Asked every time
  // there's something to drop, so the safe log only shows bags that exist.
  const [cashTo, setCashTo] = useState(null);

  // Follow the server's state (another till or a refresh), but never yank the
  // result or the "put £X in the safe" screen away while someone reads it.
  useEffect(() => { setStep((cur) => (cur === "result" || cur === "done" || cur === "resume" ? cur : startStep)); }, [startStep]);

  const denomTotal = r2(DENOMS.reduce((t, d) => t + d * (Number(denoms[d]) || 0), 0));
  const denomsTouched = Object.values(denoms).some((v) => v !== "" && v != null);
  const counted = countMode === "denoms" ? (denomsTouched ? denomTotal : null) : (total === "" ? null : r2(total));

  async function run(action, data) {
    setBusy(true); setErr("");
    const res = await act(action, { location_id: loc, ...data });
    setBusy(false);
    if (!res || !res.ok) { setErr((res && (res.message || res.error)) || "That didn't go through — try again."); return null; }
    return res;
  }

  const startShift = async () => {
    const amount = floatMode === "same" && (handed != null || status.float_target != null) ? (handed ?? status.float_target) : r2(floatVal);
    const res = await run("shift_start", { pin, float_counted: amount, float_note: floatMode === "other" ? floatNote : null });
    if (res) { onChanged(); onClose(); }
  };
  const endShift = async () => {
    const res = await run("shift_end", { pin });
    if (res) { setPin(""); setStep("count"); onChanged(); }
  };
  // CASH CONTROLS 2026-10-24: taking the shift back and confirming the count
  // both need the PIN of the person who ended it (or a manager's).
  const resume = async () => { const res = await run("shift_resume", { pin }); if (res) { setPin(""); onChanged(); onClose(); } };
  const doPreview = async () => {
    const res = await run("shift_count", { counted_raw: counted, denoms: countMode === "denoms" ? denoms : null, confirm: false });
    if (res) { setPreview(res.preview); setPin(""); setCashTo(null); setStep("result"); }
  };
  const confirm = async () => {
    const res = await run("shift_count", { counted_raw: counted, denoms: countMode === "denoms" ? denoms : null, note, pin, confirm: true, keep_in_drawer: cashTo === "till" });
    if (res) { setDone(res); setStep("done"); onChanged(); }
  };

  // ---------------- layout (TillUI) ----------------
  const FLOW = ["End shift", "Count", "Check", "Done"];
  const flowStep = { running: "End shift", count: "Count", result: "Check", done: "Done" }[step];
  const setDen = (d, v) => setDenoms((x) => ({ ...x, [d]: v }));
  let title = "", sub = "", body = null, aside = null, asideTitle = null, footer = null;

  if (step === "start") {
    const shown = handed ?? status.float_target;
    // The last shift left its takings in the till: the whole drawer is the float.
    const withTakings = handed != null && status.float_target != null && handed > Number(status.float_target) + 0.01;
    title = "Start your shift";
    sub = status.last ? "Handed over by " + (status.last.ended_by || "the last shift") + " at " + hhmm(status.last.ended_at) : "First shift on this till";
    const opt = (k, l, d, I) => (
      <div key={k} className="tu-tile" onClick={() => { setFloatMode(k); setPadTarget(k === "other" ? "float" : "pin"); }} style={{ flex: 1, display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", borderRadius: 16, cursor: "pointer", userSelect: "none", background: floatMode === k ? "#f0fdfa" : "#fff", border: "2px solid " + (floatMode === k ? U.teal : U.line), boxShadow: floatMode === k ? "0 0 0 4px rgba(20,184,166,.12)" : "none" }}>
        <span style={{ width: 38, height: 38, borderRadius: 19, display: "flex", alignItems: "center", justifyContent: "center", background: floatMode === k ? U.teal : U.soft, color: floatMode === k ? "#fff" : U.sub, flexShrink: 0 }}><I size={20} sw={2.6} /></span>
        <div><div style={{ fontWeight: 800, fontSize: 16 }}>{l}</div><div style={{ fontSize: 13, color: U.sub }}>{d}</div></div>
      </div>
    );
    body = (
      <>
        <Stat big tone="dark" icon={<Icon.drawer size={15} />} label={floatMode === "other" ? "Cash you counted" : withTakings ? "Cash in the drawer" : "Float in the drawer"} money={floatMode === "other" ? Number(floatVal) || 0 : shown}
          note={floatMode === "same" ? (withTakings ? "Float + the last shift's takings, left in for the close — count it all" : "Count it, then confirm it's right") : shown != null ? "Handed over as " + money(shown) : "Type what's actually there"} />
        <div style={{ display: "flex", gap: 10, margin: "14px 0" }}>
          {opt("same", "That's right", "The float matches", Icon.check)}
          {opt("other", "Different amount", "Type what's there", Icon.cash)}
        </div>
        {floatMode === "other" && (
          <>
            <Label tone={floatNote ? null : U.bad}>What's different? (required)</Label>
            <Chips multi value={floatNote} onChange={setFloatNote} options={["Short in the drawer", "Extra in the drawer", "Topped up from safe", "Coins missing", "Notes missing"]} />
          </>
        )}
        {floatMode === "same" && <Note>Sales from now on are recorded against your shift. At the end you count the drawer and the till tells you what goes in the safe.</Note>}
      </>
    );
    // One keypad: with a different float it types the amount first, then the PIN.
    const typing = floatMode === "other" ? padTarget : "pin";
    aside = (
      <>
        {floatMode === "other" && (
          <div style={{ display: "flex", gap: 4, background: "#fff", border: "1px solid " + U.line, borderRadius: 13, padding: 4, marginBottom: 14 }}>
            {[["float", "Float amount", Icon.cash], ["pin", "Your PIN", Icon.lock]].map(([k, l, I]) => (
              <div key={k} className="tu-btn" onClick={() => setPadTarget(k)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 0", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: "pointer", userSelect: "none", background: typing === k ? U.ink : "transparent", color: typing === k ? "#fff" : U.sub }}>
                <I size={15} />{l}{k === "float" && floatVal && typing !== "float" && <Icon.check size={14} sw={3} />}
              </div>
            ))}
          </div>
        )}
        {typing === "float"
          ? <><Field label="Float actually in the drawer" money={Number(floatVal) || 0} active /><div style={{ marginTop: 12 }}><Keypad value={floatVal} onChange={setFloatVal} decimal money /></div></>
          : <PinPanel label="Your PIN to start" value={pin} onChange={(v) => { setPin(v); setErr(""); }} error={err} />}
      </>
    );
    footer = <><Btn kind="secondary" onClick={onClose}>Cancel</Btn>{typing === "float" && <Btn kind="secondary" disabled={!floatVal} onClick={() => setPadTarget("pin")} icon={<Icon.chev size={18} />}>Next: PIN</Btn>}<Btn kind="teal" icon={<Icon.check size={19} sw={2.6} />} disabled={busy || pin.length < 4 || (floatMode === "other" && (!floatVal || !floatNote.trim()))} onClick={startShift}>{busy ? "Starting…" : "Start shift"}</Btn></>;
  } else if (step === "running") {
    const lv = status.live || {};
    title = "Shift · " + (sh.opened_by || "");
    sub = "Since " + hhmm(sh.opened_at) + " · started with " + money(sh.opening_float);
    body = (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 10 }}>
          <Stat big tone="dark" icon={<Icon.cash size={15} />} label="Taken so far" money={lv.taken} note={(lv.orders || 0) + " orders paid"} />
          <Stat label="On card" money={lv.card} />
          <Stat label="On shift" icon={<Icon.clock size={14} />} value={since(sh.opened_at)} note={"from " + hhmm(sh.opened_at)} />
        </div>
        <Label style={{ marginTop: 22 }}>Ending your shift — three steps</Label>
        <div style={{ display: "grid", gap: 8 }}>
          {[[Icon.lock, "Enter your PIN", "Your sales stop here — the next shift's start straight away."], [Icon.cash, "Count the drawer", "Notes and coins, or one total. Customers can keep paying."], [Icon.printer, "Check and print", "The till shows over or short, what goes in the safe and what to leave."]].map(([I, t, d], i) => (
            <div key={t} style={{ display: "flex", gap: 14, alignItems: "center", background: i === 0 ? "#f0fdfa" : U.soft, boxShadow: i === 0 ? "inset 0 0 0 1.5px #99f6e4" : "none", borderRadius: 16, padding: "13px 15px" }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: i === 0 ? U.teal : "#fff", color: i === 0 ? "#fff" : U.teal, border: i === 0 ? "none" : "1px solid " + U.line, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><I size={20} /></span>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 15.5 }}>{i + 1}. {t}</div><div style={{ fontSize: 13.5, color: U.sub }}>{d}</div></div>
              {i === 0 && <span style={{ fontSize: 12, fontWeight: 800, color: U.teal, letterSpacing: ".06em", textTransform: "uppercase" }}>Now</span>}
            </div>
          ))}
        </div>
      </>
    );
    aside = <PinPanel label="Your PIN to end the shift" value={pin} onChange={(v) => { setPin(v); setErr(""); }} error={err} />;
    footer = <><Btn kind="secondary" onClick={onClose}>Back</Btn><Btn disabled={busy || pin.length < 4} onClick={endShift} icon={<Icon.chev size={18} />}>{busy ? "Ending…" : "End my shift"}</Btn></>;
  } else if (step === "count") {
    title = "Count the drawer";
    sub = "Everything in the drawer, float included — the till works out the rest";
    const notes = DENOMS.filter((d) => d >= 5), coins = DENOMS.filter((d) => d < 5);
    const part = (list) => r2(list.reduce((t, d) => t + d * (Number(denoms[d]) || 0), 0));
    const group = (name, list) => (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <Label style={{ marginBottom: 0 }}>{name}</Label>
          <span style={{ fontSize: 14, fontWeight: 800, color: part(list) ? U.ink : U.faint, ...NUM }}>{money(part(list))}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))", gap: 8 }}>
          {list.map((d) => (
            <DenomTile key={d} d={d} label={denomLabel(d)} count={denoms[d]} subtotal={(Number(denoms[d]) || 0) * d} fmt={money} active={padFor === d}
              onSelect={() => setPadFor(d)} onStep={(k) => { setPadFor(d); setDen(d, String(Math.max(0, (Number(denoms[d]) || 0) + k))); }} />
          ))}
        </div>
      </div>
    );
    body = (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 4, background: U.soft, borderRadius: 13, padding: 4 }}>
            {[["denoms", "Notes & coins"], ["total", "One total"]].map(([m, l]) => <div key={m} className="tu-btn" onClick={() => setCountMode(m)} style={{ padding: "10px 16px", borderRadius: 10, fontSize: 14.5, fontWeight: 800, cursor: "pointer", userSelect: "none", background: countMode === m ? "#fff" : "transparent", boxShadow: countMode === m ? "0 1px 3px rgba(18,21,28,.12)" : "none" }}>{l}</div>)}
          </div>
          <span style={{ flex: 1 }} />
          {countMode === "denoms" && denomsTouched && <span className="tu-btn" onClick={() => { setDenoms({}); setPadFor(null); }} style={{ fontSize: 14, fontWeight: 800, color: U.bad, cursor: "pointer", padding: "8px 10px" }}>Clear all</span>}
        </div>
        {countMode === "denoms" ? <>{group("Notes", notes)}{group("Coins", coins)}</> : <Field label="Total in the drawer" money={Number(total) || 0} active />}
        <Note>The till doesn't show what it expects until your count is in — just count what's there.</Note>
      </>
    );
    asideTitle = countMode === "denoms" ? (padFor != null ? "How many " + denomLabel(padFor) + "?" : "Tap a note or coin") : "Type the total";
    aside = (
      <>
        <Stat tone="dark" label="Counted so far" money={countMode === "denoms" ? denomTotal : Number(total) || 0}
          note={countMode === "denoms" ? (Object.values(denoms).filter((v) => Number(v) > 0).length + " of " + DENOMS.length + " counted") : null} />
        <div style={{ marginTop: 14 }}>
          {countMode === "denoms"
            ? (padFor != null ? <Keypad value={String(denoms[padFor] || "")} onChange={(v) => setDen(padFor, v)} max={4} /> : <Note>Pick a note or coin on the left, then type how many — or use − / + on the tile.</Note>)
            : <Keypad value={total} onChange={setTotal} decimal money />}
        </div>
        {countMode === "denoms" && padFor != null && (() => { const i = DENOMS.indexOf(padFor); return i < DENOMS.length - 1 ? <div style={{ marginTop: 10 }}><Btn kind="secondary" onClick={() => setPadFor(DENOMS[i + 1])} icon={<Icon.chev size={17} />}>Next: {denomLabel(DENOMS[i + 1])}</Btn></div> : null; })()}
      </>
    );
    footer = <><Btn kind="secondary" onClick={() => { setPin(""); setStep("resume"); }}>Not yet — keep my shift</Btn><Btn disabled={busy || counted == null} onClick={doPreview} icon={<Icon.chev size={18} />}>{busy ? "Checking…" : "Done counting"}</Btn></>;
  } else if (step === "resume") {
    title = "Keep your shift?";
    sub = "Selling carries on as your shift, as if you hadn't ended it";
    body = (
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", background: U.warnBg, boxShadow: "inset 0 0 0 1.5px " + U.amber, borderRadius: 16, padding: "16px 18px" }}>
        <span style={{ color: U.warn, display: "flex" }}><Icon.back size={24} /></span>
        <div style={{ fontSize: 15, lineHeight: 1.5 }}>Use this if you ended your shift by mistake or need to stop counting. Your PIN (or a manager's) takes the shift back — nothing you counted is saved.</div>
      </div>
    );
    aside = <PinPanel label="Your PIN" value={pin} onChange={(v) => { setPin(v); setErr(""); }} error={err} />;
    footer = <><Btn kind="secondary" onClick={() => { setPin(""); setStep("count"); }}>Back to counting</Btn><Btn disabled={busy || pin.length < 4} onClick={resume}>{busy ? "…" : "Keep my shift"}</Btn></>;
  } else if (step === "result" && preview) {
    title = "Check the count";
    sub = "Confirm to save the handover and print the slip";
    body = (
      <>
        <Verdict variance={preview.variance} fmt={money} counted={preview.counted} expected={preview.expected} />
        <div style={{ marginTop: 8 }}>
          {Number(preview.paid_out) > 0 && <Row label="Paid out this shift" value={money(preview.paid_out)} />}
          {Number(preview.paid_in) > 0 && <Row label="Paid in this shift" value={money(preview.paid_in)} />}
          {Number(preview.dropped_mid_shift) > 0 && <Row label="Dropped to safe mid-shift" value={money(preview.dropped_mid_shift)} />}
          <Row label="Expected for your shift" value={money(preview.expected)} />
          <Row label="Counted in the drawer" value={money(preview.counted_raw)} />
          {Number(preview.cash_since_end) !== 0 && <Row label={Number(preview.cash_since_end) > 0 ? "− Next shift's cash, taken while you counted" : "+ Next shift's pay-outs while you counted"} value={money(Math.abs(Number(preview.cash_since_end)))} />}
          <Row strong label="Counted for your shift" value={money(preview.counted)} />
        </div>
        {Number(preview.drop) > 0 ? (
          <>
            <Label style={{ marginTop: 18 }} tone={cashTo ? null : U.bad}>The takings ({money(preview.drop)}) — where are they going?</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["safe", Icon.safe, "Into the safe now", "Bag " + money(preview.drop) + " · leave " + money(preview.float_left) + " float"],
                ["till", Icon.drawer, "Leave it in the till", "All " + money(preview.counted) + " stays · bagged at close"]].map(([k, I, t, d]) => (
                <div key={k} className="tu-tile" onClick={() => setCashTo(k)} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", borderRadius: 16, cursor: "pointer", userSelect: "none", background: cashTo === k ? "#f0fdfa" : "#fff", border: "2px solid " + (cashTo === k ? U.teal : U.line), boxShadow: cashTo === k ? "0 0 0 4px rgba(20,184,166,.12)" : "none" }}>
                  <span style={{ width: 38, height: 38, borderRadius: 19, display: "flex", alignItems: "center", justifyContent: "center", background: cashTo === k ? U.teal : U.soft, color: cashTo === k ? "#fff" : U.sub, flexShrink: 0 }}><I size={20} /></span>
                  <div><div style={{ fontWeight: 800, fontSize: 16 }}>{t}</div><div style={{ fontSize: 13, color: U.sub, ...NUM }}>{d}</div></div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ marginTop: 16 }}><Stat icon={<Icon.drawer size={15} />} label="Leave in the drawer" money={preview.float_left} note="Nothing to put in the safe" /></div>
        )}
        {preview.attempt > 1 && <Note tone={U.bad}>Count {preview.attempt} — the first count is printed on the slip too.</Note>}
        {preview.note_needed && (
          <div style={{ marginTop: 16 }}>
            <Label tone={note ? null : U.bad}>What happened? (required)</Label>
            <Chips multi value={note} onChange={setNote} options={["Wrong change given", "Cash refund", "Petty cash taken", "Float was short", "Miscount", "Don't know"]} />
          </div>
        )}
      </>
    );
    aside = <PinPanel label="Your PIN to confirm" value={pin} onChange={(v) => { setPin(v); setErr(""); }} error={err} />;
    footer = <><Btn kind="secondary" onClick={() => { setPreview(null); setStep("count"); }}>Recount</Btn><Btn disabled={busy || pin.length < 4 || (preview.note_needed && !note.trim()) || (Number(preview.drop) > 0 && !cashTo)} onClick={confirm} icon={<Icon.printer size={18} />}>{busy ? "Saving…" : "Confirm & print"}</Btn></>;
  } else if (step === "done" && done) {
    const d = done.shift || {};
    title = "Shift handed over";
    sub = done.printed === false ? "The slip didn't print — the figures are saved" : "The handover slip is printing";
    body = (
      <>
        <DoneMark title="All done — thank you" sub={done.printed === false ? "Write the figures on paper and sign it." : "Sign the slip when it prints."} />
        {Number(d.kept_in_drawer) > 0 ? (
          <Instruction dark n="1" icon={<Icon.drawer size={26} />} title="Leave it all in the drawer" money={d.float_left} note="Nothing goes in the safe now — it's bagged at the close" />
        ) : Number(d.drop) > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Instruction dark n="1" icon={<Icon.bag size={26} />} title="Put in the safe" money={d.drop} note="Bag it, sign the slip, into the safe" />
            <Instruction n="2" icon={<Icon.drawer size={26} />} title="Leave in the drawer" money={d.float_left} note="The float for the next shift" />
          </div>
        ) : (
          <Instruction n="1" icon={<Icon.drawer size={26} />} title="Leave in the drawer" money={d.float_left} note="The float for the next shift" />
        )}
      </>
    );
    footer = <><Btn kind="secondary" onClick={onClose}>Close</Btn><Btn kind="teal" icon={<Icon.user size={18} />} onClick={() => { setPin(""); setFloatMode("same"); setStep("start"); onChanged(); }}>Next person: start shift</Btn></>;
  }

  return (
    <Sheet icon={<Icon.clock size={24} />} title={title} sub={sub} onClose={onClose} busy={busy} width={aside ? 1020 : 780}
      help={<HelpButton key={step} topic={{ start: "shift-start", running: "shift-end", resume: "shift-end", count: "shift-count", result: "shift-check", done: "shift-done" }[step] || "shift-start"} />}
      steps={flowStep ? FLOW : null} step={flowStep} bodyKey={step} aside={aside} asideTitle={asideTitle} footer={footer}>
      {body}
      <Err>{err}</Err>
    </Sheet>
  );
}
