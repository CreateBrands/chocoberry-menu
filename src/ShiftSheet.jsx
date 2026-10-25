import { useEffect, useState } from "react";
import { money, denominations, denomLabel } from "./money.js";

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

const C = { ink: "#22271f", muted: "#6b7a60", line: "#e6e8e1", soft: "#f6f7f3", brand: "#5E7A4D", good: "#166534", bad: "#b91c1c", over: "#1d4ed8" };
const F = "'Poppins',sans-serif";
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
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

function Pad({ value, onChange, max = 8, decimal = false }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "C", "0", "⌫"];
  const press = (k) => {
    if (k === "⌫") return onChange(value.slice(0, -1));
    if (k === "C") return onChange("");
    if (k === "." && value.includes(".")) return;
    if (decimal && value.includes(".") && value.split(".")[1].length >= 2) return;
    if (value.length >= max) return;
    onChange(value + k);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {keys.map((k) => (
        <div key={k} onClick={() => press(k)} style={{ padding: "15px 0", textAlign: "center", borderRadius: 12, background: C.soft, fontWeight: 800, fontSize: 20, cursor: "pointer", userSelect: "none", fontFamily: F }}>{k}</div>
      ))}
    </div>
  );
}

function Btn({ children, onClick, primary, disabled, danger }) {
  return (
    <div onClick={() => !disabled && onClick && onClick()} style={{ flex: 1, textAlign: "center", padding: "15px 0", borderRadius: 13, fontWeight: 800, fontSize: 15.5, cursor: disabled ? "default" : "pointer", background: primary ? (disabled ? "#b9bfb3" : danger ? C.bad : C.ink) : C.soft, color: primary ? "#fff" : C.ink, userSelect: "none" }}>{children}</div>
  );
}

// Tap-to-add reasons: the till has no keyboard.
function NoteChips({ value, onChange, options }) {
  const has = (o) => (value || "").toLowerCase().includes(o.toLowerCase());
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => (
        <span key={o} onClick={() => onChange(has(o) ? value.split(", ").filter((x) => x.toLowerCase() !== o.toLowerCase()).join(", ") : (value ? value + ", " : "") + o)}
          style={{ padding: "7px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", userSelect: "none", background: has(o) ? C.ink : C.soft, color: has(o) ? "#fff" : C.ink, border: "1px solid " + (has(o) ? C.ink : C.line) }}>{o}</span>
      ))}
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
  // count
  const DENOMS = denominations();
  const [countMode, setCountMode] = useState("denoms");
  const [denoms, setDenoms] = useState({});
  const [padFor, setPadFor] = useState(null);           // denomination being typed
  const [total, setTotal] = useState("");
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(null);

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
    if (res) { setPreview(res.preview); setPin(""); setStep("result"); }
  };
  const confirm = async () => {
    const res = await run("shift_count", { counted_raw: counted, denoms: countMode === "denoms" ? denoms : null, note, pin, confirm: true });
    if (res) { setDone(res); setStep("done"); onChanged(); }
  };

  const Title = ({ t, sub }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em", fontFamily: F }}>{t}</div>
      {sub && <div style={{ fontSize: 13.5, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const Line = ({ l, v, strong, color }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid " + C.line, fontSize: strong ? 16.5 : 15, fontWeight: strong ? 800 : 500, color: color || C.ink }}>
      <span style={{ color: color || (strong ? C.ink : C.muted) }}>{l}</span><span style={{ fontFamily: F, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
  const PinBlock = ({ label }) => (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: C.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", margin: "6px 0 12px" }}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 7, background: i < pin.length ? C.ink : C.line }} />)}
      </div>
      <Pad value={pin} onChange={setPin} max={8} />
    </div>
  );

  let content = null;
  if (step === "start") {
    const shown = handed ?? status.float_target;
    content = (
      <>
        <Title t="Start your shift" sub={status.last ? "Handed over by " + (status.last.ended_by || "the last shift") + " at " + hhmm(status.last.ended_at) : "First shift in this store"} />
        <div style={{ background: C.soft, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: C.muted }}>FLOAT IN THE DRAWER</div>
          <div style={{ fontSize: 34, fontWeight: 800, fontFamily: F }}>{money(shown)}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {[["same", "That's right"], ["other", "Different amount"]].map(([k, l]) => (
              <span key={k} onClick={() => setFloatMode(k)} style={{ padding: "8px 14px", borderRadius: 9, fontWeight: 700, fontSize: 13.5, cursor: "pointer", background: floatMode === k ? C.ink : "#fff", color: floatMode === k ? "#fff" : C.ink, border: "1px solid " + C.line }}>{l}</span>
            ))}
          </div>
          {floatMode === "other" && (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: F, borderBottom: "2px solid " + C.ink, minHeight: 40 }}>{floatVal ? money(Number(floatVal)) : "—"}</div>
                <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: floatNote ? C.muted : C.bad, margin: "10px 0 6px" }}>WHAT'S DIFFERENT? (REQUIRED)</div>
                <NoteChips value={floatNote} onChange={setFloatNote} options={["Short in the drawer", "Extra in the drawer", "Topped up from safe", "Coins missing", "Notes missing"]} />
              </div>
              <Pad value={floatVal} onChange={setFloatVal} decimal />
            </div>
          )}
        </div>
        <PinBlock label="YOUR PIN" />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary disabled={busy || pin.length < 4 || (floatMode === "other" && (!floatVal || !floatNote.trim()))} onClick={startShift}>{busy ? "Starting…" : "Start shift"}</Btn>
        </div>
      </>
    );
  } else if (step === "running") {
    const lv = status.live || {};
    content = (
      <>
        <Title t={"Shift · " + (sh.opened_by || "")} sub={"Since " + hhmm(sh.opened_at) + " · float " + money(sh.opening_float)} />
        <Line l="Taken so far" v={money(lv.taken)} strong />
        <Line l="Orders paid" v={String(lv.orders || 0)} />
        <Line l="Card" v={money(lv.card)} />
        <div style={{ fontSize: 13, color: C.muted, margin: "12px 0 16px", lineHeight: 1.5 }}>Ending your shift takes a minute: you count the drawer, the till tells you what to put in the safe, and the next person starts. Customers can keep paying the whole time.</div>
        <PinBlock label="YOUR PIN TO END THE SHIFT" />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Btn onClick={onClose}>Back</Btn>
          <Btn primary disabled={busy || pin.length < 4} onClick={endShift}>{busy ? "Ending…" : "End my shift"}</Btn>
        </div>
      </>
    );
  } else if (step === "count") {
    content = (
      <>
        <Title t="Count the drawer" sub="Count everything in the drawer now, float included. The till works out the rest." />
        <div style={{ display: "flex", gap: 4, background: C.soft, borderRadius: 10, padding: 3, width: "fit-content", marginBottom: 12 }}>
          {[["denoms", "Notes & coins"], ["total", "Enter total"]].map(([m, l]) => <div key={m} onClick={() => setCountMode(m)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", background: countMode === m ? "#fff" : "transparent" }}>{l}</div>)}
        </div>
        {countMode === "denoms" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, alignContent: "start" }}>
              {DENOMS.map((d) => {
                const on = padFor === d, n = Number(denoms[d]) || 0;
                return (
                  <div key={d} onClick={() => setPadFor(d)} style={{ border: "1.5px solid " + (on ? C.brand : C.line), borderRadius: 12, padding: "8px 10px", cursor: "pointer", background: on ? "#f1f5ee" : "#fff" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: C.muted }}>{denomLabel(d)}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, fontFamily: F }}>{denoms[d] || "0"}</div>
                    <div style={{ fontSize: 11.5, color: C.muted }}>{n ? money(n * d) : " "}</div>
                  </div>
                );
              })}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: C.muted }}>{padFor != null ? "HOW MANY " + denomLabel(padFor) + "?" : "TAP A NOTE OR COIN"}</div>
              <div style={{ fontSize: 30, fontWeight: 800, fontFamily: F, margin: "4px 0 10px" }}>{money(denomTotal)}</div>
              {padFor != null && <Pad value={String(denoms[padFor] || "")} onChange={(v) => setDenoms((x) => ({ ...x, [padFor]: v }))} max={4} />}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16 }}>
            <div style={{ fontSize: 38, fontWeight: 800, fontFamily: F, borderBottom: "2px solid " + C.ink, alignSelf: "start", paddingBottom: 4 }}>{total ? money(Number(total)) : "—"}</div>
            <Pad value={total} onChange={setTotal} decimal />
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Btn onClick={() => { setPin(""); setStep("resume"); }}>Not yet — keep my shift</Btn>
          <Btn primary disabled={busy || counted == null} onClick={doPreview}>{busy ? "Checking…" : "Done counting"}</Btn>
        </div>
      </>
    );
  } else if (step === "resume") {
    content = (
      <>
        <Title t="Keep your shift?" sub="Selling carries on as your shift, as if you hadn't ended it." />
        <PinBlock label="YOUR PIN" />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Btn onClick={() => { setPin(""); setStep("count"); }}>Back to counting</Btn>
          <Btn primary disabled={busy || pin.length < 4} onClick={resume}>{busy ? "…" : "Keep my shift"}</Btn>
        </div>
      </>
    );
  } else if (step === "result" && preview) {
    const v = Number(preview.variance) || 0;
    const tone = v === 0 ? C.good : v > 0 ? C.over : C.bad;
    content = (
      <>
        <Title t={v === 0 ? "Balanced" : v > 0 ? "Over" : "Short"} sub="Check it, then confirm to print the handover slip." />
        <div style={{ border: "3px solid " + tone, borderRadius: 16, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", color: tone, marginBottom: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 800 }}>{v === 0 ? "BALANCED" : v > 0 ? "OVER" : "SHORT"}</span>
          <span style={{ fontSize: 30, fontWeight: 800, fontFamily: F }}>{(v > 0 ? "+" : "") + money(v)}</span>
        </div>
        {Number(preview.paid_out) > 0 && <Line l="Paid out this shift" v={money(preview.paid_out)} />}
        {Number(preview.paid_in) > 0 && <Line l="Paid in this shift" v={money(preview.paid_in)} />}
        {Number(preview.dropped_mid_shift) > 0 && <Line l="Dropped to safe mid-shift" v={money(preview.dropped_mid_shift)} />}
        <Line l="Expected for your shift" v={money(preview.expected)} />
        <Line l="Counted in the drawer" v={money(preview.counted_raw)} />
        {Number(preview.cash_since_end) !== 0 && <Line l={Number(preview.cash_since_end) > 0 ? "− Next shift's cash, taken while you counted" : "+ Next shift's pay-outs while you counted"} v={money(Math.abs(Number(preview.cash_since_end)))} />}
        <Line l="Counted for your shift" v={money(preview.counted)} strong />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "14px 0" }}>
          <div style={{ background: C.ink, color: "#fff", borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", opacity: .8 }}>PUT IN THE SAFE</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: F }}>{money(preview.drop)}</div>
          </div>
          <div style={{ background: C.soft, borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: C.muted }}>LEAVE IN THE DRAWER</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: F }}>{money(preview.float_left)}</div>
          </div>
        </div>
        {preview.attempt > 1 && <div style={{ fontSize: 12.5, color: C.bad, fontWeight: 700, marginBottom: 8 }}>Count {preview.attempt} — the first count is printed on the slip too.</div>}
        {preview.note_needed && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: note ? C.muted : C.bad, marginBottom: 6 }}>WHAT HAPPENED? (REQUIRED)</div>
            <NoteChips value={note} onChange={setNote} options={["Wrong change given", "Cash refund", "Petty cash taken", "Float was short", "Miscount", "Don't know"]} />
          </div>
        )}
        <PinBlock label="YOUR PIN TO CONFIRM" />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Btn onClick={() => { setPreview(null); setStep("count"); }}>Recount</Btn>
          <Btn primary disabled={busy || pin.length < 4 || (preview.note_needed && !note.trim())} onClick={confirm}>{busy ? "Saving…" : "Confirm & print"}</Btn>
        </div>
      </>
    );
  } else if (step === "done" && done) {
    const d = done.shift || {};
    content = (
      <>
        <Title t="Shift handed over" sub={done.printed === false ? "The slip didn't print — the figures are saved." : "The handover slip is printing."} />
        <div style={{ background: C.ink, color: "#fff", borderRadius: 16, padding: "16px 18px", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".08em", opacity: .8 }}>1 · PUT IN THE SAFE</div>
          <div style={{ fontSize: 36, fontWeight: 800, fontFamily: F }}>{money(d.drop)}</div>
        </div>
        <div style={{ background: C.soft, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".08em", color: C.muted }}>2 · LEAVE IN THE DRAWER FOR THE NEXT SHIFT</div>
          <div style={{ fontSize: 36, fontWeight: 800, fontFamily: F }}>{money(d.float_left)}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn onClick={onClose}>Close</Btn>
          <Btn primary onClick={() => { setPin(""); setFloatMode("same"); setStep("start"); onChanged(); }}>Next person: start shift</Btn>
        </div>
      </>
    );
  }

  return (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(18,21,28,.58)", zIndex: 92, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: 720, maxWidth: "100%", maxHeight: "94vh", overflowY: "auto", padding: "22px 24px", boxShadow: "0 30px 80px rgba(18,21,28,.35)" }}>
        {content}
        {err && <div style={{ marginTop: 12, color: C.bad, fontWeight: 700, fontSize: 14 }}>{err}</div>}
      </div>
    </div>
  );
}
