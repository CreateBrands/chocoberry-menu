import { useState } from "react";

// CASH CONTROLS 2026-10-24 — a small sheet that asks for a manager's PIN (and,
// when `reasons` is given, one of a few reasons) before a sensitive till action:
// undoing a payment, printing an X read. The till has no keyboard, so both the
// PIN and the reason are taps. onSubmit returns an error message, or null when
// it went through (the sheet then closes itself).
const C = { ink: "#22271f", muted: "#6b7a60", line: "#e6e8e1", soft: "#f6f7f3", bad: "#b91c1c" };
const F = "'Poppins',sans-serif";

export default function ManagerPin({ title, sub, reasons = null, confirmLabel = "Confirm", pinLabel = "MANAGER PIN", onSubmit, onClose }) {
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const press = (k) => {
    setErr("");
    if (k === "⌫") return setPin((p) => p.slice(0, -1));
    if (k === "C") return setPin("");
    setPin((p) => (p + k).slice(0, 8));
  };
  const ready = pin.length >= 4 && (!reasons || reason) && !busy;
  async function go() {
    if (!ready) return;
    setBusy(true); setErr("");
    const e = await onSubmit(pin, reason);
    setBusy(false);
    if (e) { setErr(e); setPin(""); } else onClose();
  }
  return (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(18,21,28,.58)", zIndex: 95, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 22, width: 420, maxWidth: "100%", padding: "20px 22px", boxShadow: "0 30px 80px rgba(18,21,28,.35)" }}>
        <div style={{ fontSize: 21, fontWeight: 800, fontFamily: F, letterSpacing: "-.02em" }}>{title}</div>
        {sub && <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
        {reasons && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {reasons.map((r) => (
              <span key={r} onClick={() => setReason(r)} style={{ padding: "8px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", userSelect: "none", background: reason === r ? C.ink : C.soft, color: reason === r ? "#fff" : C.ink, border: "1px solid " + (reason === r ? C.ink : C.line) }}>{r}</span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", color: C.muted, marginTop: 16 }}>{pinLabel}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, margin: "8px 0 12px" }}>
          {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 7, background: i < pin.length ? C.ink : C.line }} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) => (
            <div key={k} onClick={() => press(k)} style={{ padding: "14px 0", textAlign: "center", borderRadius: 12, background: C.soft, fontWeight: 800, fontSize: 20, fontFamily: F, cursor: "pointer", userSelect: "none", color: k === "C" ? C.bad : C.ink }}>{k}</div>
          ))}
        </div>
        {err && <div style={{ marginTop: 10, color: C.bad, fontWeight: 700, fontSize: 13.5, textAlign: "center" }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <div onClick={() => !busy && onClose()} style={{ flex: 1, textAlign: "center", padding: "14px 0", borderRadius: 12, background: C.soft, fontWeight: 800, cursor: "pointer" }}>Cancel</div>
          <div onClick={go} style={{ flex: 1.4, textAlign: "center", padding: "14px 0", borderRadius: 12, background: ready ? C.ink : "#b9bfb3", color: "#fff", fontWeight: 800, cursor: ready ? "pointer" : "default" }}>{busy ? "Checking…" : confirmLabel}</div>
        </div>
      </div>
    </div>
  );
}
