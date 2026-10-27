// TILL HELP 2026-10-27 — help inside the till, where staff need it.
//
//   HelpButton  "? Help" in a sheet's header (shift handover, close till) or
//               beside the payment buttons. Opens the steps for THAT screen:
//               a real picture of the screen with the button to press marked,
//               the steps, what to watch out for and why it matters.
//   TillGuide   the whole day (opening → shift → handover → close) plus a
//               "Practice" quiz, from More › Till guide.
//
// Pictures are screenshots of the till's own sheets with example figures
// (public/till-help/*.webp). Words only — no money or rules live here.

import { useState } from "react";
import { createPortal } from "react-dom";
import { U, FONT, NUM, Icon, Sheet, Btn, Label } from "./TillUI.jsx";

const grad = "linear-gradient(135deg," + U.tealL + "," + U.teal + ")";

// Where the button to press sits on each picture, in % of the picture.
const SHOT = {"float":{"w":1020,"h":554,"hl":[{"x":2.2,"y":41.7,"w":28.7,"h":12.6},{"x":31.8,"y":41.7,"w":28.7,"h":12.6}]},"float-no":{"w":1020,"h":656,"hl":[{"x":2.2,"y":51.4,"w":17.7,"h":6.6}]},"pay-card":{"w":432,"h":502,"hl":[{"x":51.2,"y":29.3,"w":44.9,"h":21.3}]},"pay-cash":{"w":432,"h":502,"hl":[{"x":3.9,"y":78.1,"w":92.1,"h":10}]},"shift-running":{"w":1020,"h":633,"hl":[{"x":50.5,"y":88.9,"w":47.5,"h":8.8}]},"end-count":{"w":1020,"h":742,"hl":[{"x":50.5,"y":90.6,"w":47.5,"h":7.5}]},"takings":{"w":1020,"h":618,"hl":[{"x":2.2,"y":71.7,"w":28.7,"h":11.3},{"x":31.8,"y":71.7,"w":28.7,"h":11.3}]},"in-till":{"w":1020,"h":618,"hl":[{"x":50.5,"y":88.7,"w":47.5,"h":9.1}]},"next-person":{"w":780,"h":432,"hl":[{"x":50.6,"y":83.8,"w":46.8,"h":13}]},"next-start":{"w":1020,"h":554,"hl":[{"x":2.2,"y":41.7,"w":28.7,"h":12.6}]},"count-close":{"w":1060,"h":808,"hl":[{"x":2.1,"y":81.2,"w":62.6,"h":8.9}]},"out":{"w":1060,"h":808,"hl":[{"x":2.1,"y":32.1,"w":62.5,"h":9.9}]},"note":{"w":1060,"h":808,"hl":[{"x":14.9,"y":43.1,"w":16,"h":4.7}]},"signoff":{"w":1060,"h":808,"hl":[{"x":36,"y":91.3,"w":62.1,"h":6.9}]},"bag":{"w":1060,"h":808,"hl":[{"x":2.1,"y":27.4,"w":47.4,"h":13.1},{"x":50.6,"y":27.4,"w":47.4,"h":13.1}]}};

// [[Button]] = a till button, **words** = bold.
export const STAGES = ["Opening", "During the shift", "Handover", "Close"];
export const TOPICS = {
  "shift-start": { stage: 0, title: "Start your shift", sum: "No payment is taken until a shift is running. The first person in starts the first shift.",
    steps: ["Tap [[Start shift]] on the till's bottom strip.", "Count everything in the drawer.", "It matches what the screen shows? Tap [[That's right]].", "It doesn't? Tap [[Different amount]], type what's there and pick the reason.", "Enter your PIN and tap [[Start shift]]."],
    warn: "The float is always £100. If it's short, tell your manager so it's topped up from the safe.",
    why: "Sales are recorded against whoever's shift is running. A float that's a little short every day hides where the money went.",
    shots: [["float", "Start your shift", ["Pick", "Pick"]], ["float-no", "Different amount", ["Pick"]]] },
  "pay-card": { stage: 1, title: "Card payments", sum: "The card machine and the till must show the same payment, for the same amount.",
    steps: ["Type the amount on the card machine, exactly as the till shows it.", "Wait for the machine to say **APPROVED**.", "Only then tap [[Card]] on the till.", "Split bill: put each part through the machine and the till separately, same amounts on both."],
    warn: "Declined, or the customer walked off? Don't tap Card. Take another payment or tell your manager.",
    why: "At close the till's card total is checked against the card machine's. A Card tap with no approved payment shows up as a gap.",
    shots: [["pay-card", "Take payment", ["Tap"]]] },
  "pay-cash": { stage: 1, title: "Cash payments", sum: "Every pound that goes in or out of the drawer is recorded on the till.",
    steps: ["Ring up every sale before taking the money.", "Tap [[Cash]], then the note the customer hands you (or type it).", "Count the change shown back to the customer, then tap [[Confirm cash]].", "Pay-outs, pay-ins and drops to the safe go through the till's [[Cash]] button, never straight out of the drawer."],
    warn: "Keep tips out of the till drawer.",
    why: "Cash with no sale behind it makes the drawer over, and nobody can tell why.",
    shots: [["pay-cash", "Cash", ["Tap"]]] },
  "shift-end": { stage: 2, title: "End your shift", sum: "The outgoing person ends the shift, then counts. Customers can keep paying the whole time.",
    steps: ["Tap the shift button on the strip.", "Enter your PIN and tap [[End my shift]].", "Your sales stop here; the next person's sales start straight away."],
    shots: [["shift-running", "Shift", ["Tap"]]] },
  "shift-count": { stage: 2, title: "Count the drawer", sum: "Count everything in the drawer, float included. The till doesn't show what it expects until you've counted.",
    steps: ["Tap a note or coin, then type how many (or use − / +). Or switch to [[One total]].", "Count the whole drawer, float included.", "Tap [[Done counting]]."],
    warn: "Ended your shift by mistake? Tap \"Not yet, keep my shift\".",
    why: "A blind count is an honest count.",
    shots: [["end-count", "Count the drawer", ["Tap"]]] },
  "shift-check": { stage: 2, title: "Check the count", sum: "The till shows balanced, over or short. Then pick where the takings go: the one you're really doing.",
    steps: ["Out by more than a few pounds? Pick what really happened.", "Bagging it now: tap [[Into the safe now]]. Bag the amount shown, leave £100.", "Leaving it for the close: tap [[Leave it in the till]]. Everything stays in the drawer.", "Enter your PIN and tap [[Confirm & print]]. Sign the slip."],
    warn: "Pick what you're actually doing. The safe log must only show bags that are really in the safe.",
    why: "Picking the safe when the cash stays in the till logs a bag that doesn't exist.",
    shots: [["takings", "Check the count", ["Pick", "Pick"]], ["in-till", "Leave it in the till", ["Tap"]]] },
  "shift-done": { stage: 2, title: "Next person starts", sum: "The incoming person takes the drawer.",
    steps: ["Tap [[Next person: start shift]].", "Count the drawer. If the takings were left in, the screen says **Cash in the drawer**: count all of it.", "Confirm, enter your PIN and start the shift."],
    shots: [["next-person", "Shift handed over", ["Tap"]], ["next-start", "Next person starts", ["Pick"]]] },
  "close-review": { stage: 3, title: "Before you close", sum: "The till closes once, after the last order. One close covers everything since the last one: one count, one bag.",
    steps: ["Take payment for any unpaid orders, or tell your manager.", "Make sure no handover is still being counted.", "**Run the card machine's end-of-day report now** and keep the printout.", "Check the Ready to close chips, then tap [[Next: count cash]]."],
    why: "Run at different times, the card machine and the till cover different sales and never match." },
  "close-cash": { stage: 3, title: "Count and card total", sum: "Count the drawer and type the card machine's total.",
    steps: ["Count everything in the drawer, float included.", "Only tap [[Different?]] on the float if the starting float really wasn't what it shows (manager PIN).", "Tap the [[Card machine end-of-day total]] tile and type the TOTAL from the printout.", "Tap [[Check count]]."],
    warn: "Machine won't give a total? Tap \"Can't get it\" and explain in the note.",
    shots: [["count-close", "Close till · cash", ["Type"]]] },
  "close-signoff": { stage: 3, title: "Sign off", sum: "If the drawer or the card machine is out, the till asks for a note. Then close, once.",
    steps: ["Asked for a note? Tap a reason or type what actually happened, e.g. \"wrong change given\".", "Enter your PIN (and a manager PIN if asked).", "Tap [[Close till & print Z-report]]."],
    warn: "\".\" is not a note. And never close the till a second time: orders still showing? Call your manager.",
    shots: [["out", "Sign off", ["Needed"]], ["note", "Note", ["Pick"]], ["signoff", "Sign off", ["Tap"]]] },
  "close-done": { stage: 3, title: "Bag it and lock up", sum: "The last job of the day.",
    steps: ["Bag the **Bank / safe** amount with the signed Z report and put it in the safe.", "Leave the **Float for tomorrow** (£100) in the drawer.", "Tick off Before you go, then lock the drawer and the safe."],
    shots: [["bag", "Till closed", ["Do", "Do"]]] },
};
const ORDER = Object.keys(TOPICS);

const QUIZ = [
  { q: "You start your shift and count £98.50 in the drawer. What do you do?", o: ["Tap Different amount, type £98.50, pick a reason and tell your manager", "Tap That's right, it's close enough", "Take £1.50 from the tips jar"], a: 0, why: "Every difference is recorded with a reason, so the float can be put right.", go: "shift-start" },
  { q: "The card machine says DECLINED but you've already tapped Card on the till. What now?", o: ["Leave it, it'll balance out", "Tap Cash instead", "Tell your manager straight away so the payment is corrected"], a: 2, why: "A Card tap without an approved payment shows up as a gap against the machine at close.", go: "pay-card" },
  { q: "A customer pays cash for a drink you haven't rung up yet.", o: ["Put the cash in the drawer and ring it up later", "Ring it up first, then take the cash", "Keep the cash aside until close"], a: 1, why: "Cash with no sale on the till makes the drawer over, and nobody can tell why.", go: "pay-cash" },
  { q: "At handover you're leaving the takings in the till for the close. Which option do you pick?", o: ["Either, it doesn't matter", "Into the safe now", "Leave it in the till"], a: 2, why: "Picking the safe when the cash stays in the till logs a bag that doesn't exist.", go: "shift-check" },
  { q: "When do you run the card machine's end-of-day report?", o: ["At the same time as the till close", "First thing in the morning", "Whenever it's quiet"], a: 0, why: "Run together, both totals cover the same sales and should match.", go: "close-review" },
  { q: "The till still shows orders after you've closed. What do you do?", o: ["Close the till again", "Call your manager", "Delete the orders"], a: 1, why: "A second close doubles the count and the takings bag in the records.", go: "close-signoff" },
  { q: "The drawer is out and the till asks for a note. Which note is right?", o: [".", "na", "Wrong change given on a £20 note"], a: 2, why: "Head office reads every note. It has to say what actually happened.", go: "close-signoff" },
  { q: "The card machine won't print its end-of-day total. What do you do at close?", o: ["Type 0", "Skip the close tonight", "Tap Can't get it and explain in the note"], a: 2, why: "Can't get it lets the close go through, with the reason recorded.", go: "close-cash" },
];

// ---------------- pieces ----------------
function Rich({ text }) {
  const parts = String(text).split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) => p.startsWith("[[")
    ? <span key={i} style={{ display: "inline-block", background: U.ink, color: "#fff", fontWeight: 800, fontSize: ".9em", borderRadius: 7, padding: "1px 8px", margin: "1px 0", whiteSpace: "nowrap" }}>{p.slice(2, -2)}</span>
    : p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>);
}

const CSS = `@keyframes th-ring{0%,100%{box-shadow:0 0 0 3px #f59e0b,0 0 0 7px rgba(245,158,11,.28)}50%{box-shadow:0 0 0 3px rgba(245,158,11,.55),0 0 0 12px rgba(245,158,11,0)}}
@keyframes th-in{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
.th-ring{animation:th-ring 1.6s ease-in-out infinite}.th-in{animation:th-in .22s cubic-bezier(.2,.8,.2,1)}
@media (prefers-reduced-motion: reduce){.th-ring,.th-in{animation:none}}`;

function Shot({ name, cap, labels, onOpen, big }) {
  const b = SHOT[name]; if (!b) return null;
  return (
    <div onClick={onOpen} style={{ background: "#0b1412", borderRadius: 14, padding: 6, cursor: onOpen ? "zoom-in" : "zoom-out" }}>
      <div style={{ position: "relative", borderRadius: 9, overflow: "hidden", lineHeight: 0 }}>
        <img src={"/till-help/" + name + ".webp"} width={b.w} height={b.h} alt={cap} style={{ width: "100%", height: "auto", display: "block" }} loading="lazy" />
        {b.hl.map((h, i) => (
          <span key={i} className="th-ring" style={{ position: "absolute", left: h.x + "%", top: h.y + "%", width: h.w + "%", height: h.h + "%", borderRadius: 10, pointerEvents: "none" }}>
            <span style={{ position: "absolute", top: -9, right: -6, background: "#f59e0b", color: "#241500", fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", borderRadius: 4, padding: "1px 5px", lineHeight: 1.4 }}>{labels[i] || labels[0]}</span>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#8fa6a2", padding: "7px 4px 1px", lineHeight: 1.3 }}>
        <span><span style={{ color: U.mintT }}>{cap}</span></span><span>{big ? "Example figures · tap to close" : "Tap to enlarge"}</span>
      </div>
    </div>
  );
}

function TopicView({ id, onGo, compact }) {
  const t = TOPICS[id];
  const [ticks, setTicks] = useState({});
  const [zoom, setZoom] = useState(null);
  if (!t) return null;
  const i = ORDER.indexOf(id);
  return (
    <div>
      <style>{CSS}</style>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: U.teal }}>{STAGES[t.stage]}</div>
      <div style={{ fontSize: compact ? 24 : 28, fontWeight: 800, letterSpacing: "-.01em", lineHeight: 1.15, margin: "4px 0 6px" }}>{t.title}</div>
      <div style={{ fontSize: 15, color: U.sub, lineHeight: 1.5, marginBottom: 14 }}>{t.sum}</div>
      {t.shots && (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: !compact && t.shots.length > 1 ? "repeat(auto-fit, minmax(260px, 1fr))" : "1fr", marginBottom: 16 }}>
          {t.shots.map(([n, cap, labels]) => <Shot key={n} name={n} cap={cap} labels={labels} onOpen={() => setZoom([n, cap, labels])} />)}
        </div>
      )}
      <div style={{ display: "grid", gap: 4 }}>
        {t.steps.map((s, k) => {
          const on = !!ticks[k];
          return (
            <div key={k} onClick={() => setTicks((x) => ({ ...x, [k]: !on }))} style={{ display: "grid", gridTemplateColumns: "30px 1fr", gap: 10, alignItems: "start", padding: "8px 8px", borderRadius: 12, cursor: "pointer", background: on ? U.soft : "transparent" }}>
              <span style={{ width: 28, height: 28, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, background: on ? U.teal : "#e7f8f5", color: on ? "#fff" : U.teal, ...NUM }}>{on ? <Icon.check size={14} sw={3} /> : k + 1}</span>
              <span style={{ fontSize: 15.5, lineHeight: 1.5, paddingTop: 2, color: on ? U.sub : U.ink }}><Rich text={s} /></span>
            </div>
          );
        })}
      </div>
      {t.warn && (
        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "flex-start", background: U.badBg, borderRadius: 14, padding: "12px 14px", fontSize: 14.5, lineHeight: 1.5 }}>
          <span style={{ width: 22, height: 22, borderRadius: 11, background: U.bad, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, flexShrink: 0 }}>!</span><span>{t.warn}</span>
        </div>
      )}
      {t.why && (
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "flex-start", background: U.soft, borderRadius: 14, padding: "12px 14px", fontSize: 14.5, lineHeight: 1.5 }}>
          <span style={{ width: 22, height: 22, borderRadius: 11, background: U.warn, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, flexShrink: 0 }}>?</span>
          <span><b style={{ display: "block", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>Why</b>{t.why}</span>
        </div>
      )}
      {onGo && (
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Btn kind="secondary" disabled={i <= 0} onClick={() => onGo(ORDER[i - 1])} icon={<Icon.back size={17} />}>{i > 0 ? TOPICS[ORDER[i - 1]].title : "Back"}</Btn>
          <Btn kind="teal" disabled={i >= ORDER.length - 1} onClick={() => onGo(ORDER[i + 1])} icon={<Icon.chev size={17} />}>{i < ORDER.length - 1 ? TOPICS[ORDER[i + 1]].title : "Done"}</Btn>
        </div>
      )}
      {zoom && createPortal(
        <div onClick={() => setZoom(null)} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(6,12,11,.86)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: "min(1180px, 100%)" }}><Shot name={zoom[0]} cap={zoom[1]} labels={zoom[2]} big /></div>
        </div>, document.body
      )}
    </div>
  );
}

// ---------------- in-screen help ----------------
// tone "dark" sits in a sheet's dark header; "light" on a white panel.
export function HelpButton({ topic, tone = "dark", label = "Help" }) {
  const [open, setOpen] = useState(null);   // null | topic id | "guide"
  const dark = tone === "dark";
  return (
    <>
      <span className="tu-btn" role="button" aria-label="Help for this screen" onClick={(e) => { e.stopPropagation(); setOpen(topic); }}
        style={{ height: dark ? 42 : 32, padding: dark ? "0 14px" : "0 11px", borderRadius: dark ? 12 : 999, display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", flexShrink: 0, fontWeight: 800, fontSize: dark ? 14.5 : 13, userSelect: "none",
          background: dark ? "rgba(94,234,212,.1)" : "#f0fdfa", color: dark ? U.mintT : U.teal, border: dark ? "none" : "1px solid #ccfbf1", fontFamily: FONT }}>
        <span style={{ width: dark ? 20 : 18, height: dark ? 20 : 18, borderRadius: "50%", border: "2px solid currentColor", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: dark ? 12 : 11, fontWeight: 900, lineHeight: 1 }}>?</span>{label}
      </span>
      {open && open !== "guide" && createPortal(<HelpDrawer topic={open} onClose={() => setOpen(null)} onGuide={() => setOpen("guide")} />, document.body)}
      {open === "guide" && createPortal(<TillGuide start={topic} onClose={() => setOpen(null)} />, document.body)}
    </>
  );
}

function HelpDrawer({ topic, onClose, onGuide }) {
  const [id, setId] = useState(topic);
  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(8,15,20,.45)", display: "flex", justifyContent: "flex-end", fontFamily: FONT, color: U.ink }}>
      <style>{CSS}</style>
      <div className="th-in" onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 100%)", height: "100%", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-20px 0 60px rgba(8,15,20,.35)" }}>
        <div style={{ background: "radial-gradient(120% 140% at 0% 0%, #164139 0%, " + U.dark + " 55%)", color: "#fff", padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(94,234,212,.12)", color: U.mintT, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 20 }}>?</span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 19, fontWeight: 800 }}>Help for this screen</div><div style={{ fontSize: 13, color: U.mint, opacity: .82 }}>Real till screens · example figures</div></div>
          <span className="tu-btn" onClick={onClose} aria-label="Close help" style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(94,234,212,.1)", color: U.mintT, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon.x size={18} /></span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 24px" }}>
          <TopicView key={id} id={id} compact onGo={setId} />
        </div>
        <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderTop: "1px solid " + U.line }}>
          <Btn kind="secondary" onClick={onGuide}>Whole day & practice</Btn>
          <Btn onClick={onClose}>Got it</Btn>
        </div>
      </div>
    </div>
  );
}

// ---------------- the whole guide (More › Till guide) ----------------
export function TillGuide({ onClose, start = "shift-start" }) {
  const [tab, setTab] = useState("guide");
  const [id, setId] = useState(TOPICS[start] ? start : "shift-start");
  const [ans, setAns] = useState({});
  const right = QUIZ.filter((x, i) => ans[i] === x.a).length;
  const done = Object.keys(ans).length;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Sheet icon={<span style={{ fontWeight: 900, fontSize: 22 }}>?</span>} title="Till guide" sub="Opening to close, step by step · real till screens with example figures" onClose={onClose}
        width={1120} height="min(94vh, 880px)" zIndex={310} tabs={[["guide", "Guide", null], ["practice", "Practice", null]]} tab={tab} onTab={setTab}
        footer={tab === "practice"
          ? <><div style={{ flex: 1, display: "flex", alignItems: "center", fontSize: 16, fontWeight: 800, ...NUM }}>Score {right} / {QUIZ.length}{done === QUIZ.length ? (right === QUIZ.length ? " · all correct" : "") : ""}</div>{done > 0 && <Btn kind="secondary" grow={false} onClick={() => setAns({})}>Try again</Btn>}<Btn grow={false} onClick={onClose}>Close</Btn></>
          : <Btn onClick={onClose}>Close</Btn>}>
        {tab === "guide" ? (
          <div style={{ display: "grid", gridTemplateColumns: "250px minmax(0,1fr)", gap: 24 }}>
            <div style={{ borderRight: "1px solid " + U.line, paddingRight: 16 }}>
              {STAGES.map((st, si) => (
                <div key={st} style={{ marginBottom: 14 }}>
                  <Label>{si + 1} · {st}</Label>
                  <div style={{ display: "grid", gap: 4 }}>
                    {ORDER.filter((k) => TOPICS[k].stage === si).map((k) => (
                      <div key={k} className="tu-btn" onClick={() => setId(k)} style={{ padding: "10px 12px", borderRadius: 11, cursor: "pointer", fontWeight: 700, fontSize: 14.5, background: id === k ? grad : "transparent", color: id === k ? "#fff" : U.ink }}>{TOPICS[k].title}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <TopicView key={id} id={id} onGo={setId} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {QUIZ.map((x, i) => {
              const got = ans[i];
              return (
                <div key={i} style={{ border: "1px solid " + U.line, borderRadius: 16, padding: 16, background: U.soft, display: "grid", gap: 8, alignContent: "start" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".1em", color: U.faint }}>QUESTION {i + 1}</div>
                  <div style={{ fontWeight: 700, fontSize: 15.5, lineHeight: 1.4 }}>{x.q}</div>
                  {x.o.map((o, k) => {
                    const isRight = got != null && k === x.a, isWrong = got === k && k !== x.a;
                    return <div key={k} className={got == null ? "tu-btn" : ""} onClick={() => got == null && setAns((a) => ({ ...a, [i]: k }))}
                      style={{ padding: "10px 12px", borderRadius: 11, fontSize: 14.5, cursor: got == null ? "pointer" : "default", background: isRight ? "#e7f8f5" : isWrong ? U.badBg : "#fff", border: "1.5px solid " + (isRight ? U.teal : isWrong ? U.bad : U.line), fontWeight: isRight ? 800 : 600, textDecoration: isWrong ? "line-through" : "none" }}>{o}</div>;
                  })}
                  {got != null && (
                    <div style={{ fontSize: 14, color: U.sub, borderLeft: "3px solid " + (got === x.a ? U.teal : U.bad), paddingLeft: 10, lineHeight: 1.45 }}>
                      {got === x.a ? "Right. " : "Not quite. "}{x.why} <span onClick={() => { setId(x.go); setTab("guide"); }} style={{ color: U.teal, fontWeight: 800, cursor: "pointer" }}>See the step</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Sheet>
    </div>
  );
}
