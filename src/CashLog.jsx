import { useEffect, useState } from "react";
import { money } from "./money.js";

// CASH MOVEMENTS 2026-10-25 — Admin → Store → Cash.
// What the safe should hold now, the store's pay-outs / pay-ins / drops,
// safe counts, and area-manager collections with what the bank credited.
// Head office enters the banked amount; any difference shows straight away.

const KIND = { payout: "Pay out", payin: "Pay in", drop: "Drop to safe", collection: "Collection" };
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function CashLog({ call, loc, T, canBank }) {
  const [days, setDays] = useState(14);
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [bankEdit, setBankEdit] = useState({});
  const load = async () => {
    setErr("");
    try { setD(await call("cash_log", { location_id: loc.id, days })); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [loc.id, days]); // eslint-disable-line

  if (err && !d) return <div style={{ color: "#b4462f", fontSize: 13 }}>{err} <span onClick={load} style={{ color: T.accent, fontWeight: 700, cursor: "pointer" }}>Try again</span></div>;
  if (!d) return <div style={{ color: T.muted, fontSize: 13 }}>Loading…</div>;
  if (d.enabled === false) return <div style={{ color: T.muted, fontSize: 13, lineHeight: 1.5 }}>Cash movements aren't set up yet — run <code>db/cash_movements.sql</code> in Supabase.</div>;

  const moves = d.moves || [], counts = d.counts || [];
  const collections = moves.filter((m) => m.kind === "collection");
  const live = moves.filter((m) => !m.reversed_at);
  const sum = (k, src) => live.filter((m) => m.kind === k && (!src || m.source === src)).reduce((a, m) => a + Number(m.amount || 0), 0);
  const byReason = {};
  for (const m of live.filter((x) => x.kind === "payout")) byReason[m.reason || "Other"] = (byReason[m.reason || "Other"] || 0) + Number(m.amount || 0);
  const card = { background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: "12px 14px" };
  const h = { fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase", margin: "16px 0 8px" };
  const unbanked = collections.filter((c) => c.banked_amount == null && !c.reversed_at);

  return (
    <div>
      {err && <div style={{ color: "#b4462f", fontSize: 13, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: T.muted }}>Last</span>
        {[7, 14, 30, 90].map((n) => <span key={n} onClick={() => setDays(n)} style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: days === n ? T.ink : T.bg, color: days === n ? T.card : T.ink, border: "1px solid " + T.line }}>{n} days</span>)}
        <span onClick={load} style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: T.accent, cursor: "pointer" }}>Refresh</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10 }}>
        <div style={card}><div style={{ fontSize: 11.5, color: T.muted }}>Safe should hold now</div><div style={{ fontSize: 22, fontWeight: 800 }}>{d.safe ? money(d.safe.expected) : "—"}</div>
          <div style={{ fontSize: 11.5, color: T.muted }}>{d.safe && d.safe.last_count ? "last counted " + fmt(d.safe.last_count.created_at) : "never counted"}</div></div>
        <div style={card}><div style={{ fontSize: 11.5, color: T.muted }}>Paid out</div><div style={{ fontSize: 22, fontWeight: 800 }}>{money(sum("payout"))}</div><div style={{ fontSize: 11.5, color: T.muted }}>limit for a manager PIN {money(d.payout_limit)}</div></div>
        <div style={card}><div style={{ fontSize: 11.5, color: T.muted }}>Into the safe</div><div style={{ fontSize: 22, fontWeight: 800 }}>{money(sum("drop"))}</div><div style={{ fontSize: 11.5, color: T.muted }}>handover, mid-shift, close</div></div>
        <div style={card}><div style={{ fontSize: 11.5, color: T.muted }}>Collected</div><div style={{ fontSize: 22, fontWeight: 800 }}>{money(sum("collection"))}</div><div style={{ fontSize: 11.5, color: unbanked.length ? "#9a3412" : T.muted }}>{unbanked.length ? unbanked.length + " not yet banked" : "all banked"}</div></div>
      </div>

      <div style={h}>Collections · bank confirmation</div>
      {!collections.length && <div style={{ fontSize: 13, color: T.muted }}>No collections in this period.</div>}
      {collections.map((c) => {
        const diff = c.banked_amount == null ? null : Math.round((Number(c.banked_amount) - Number(c.amount)) * 100) / 100;
        const e = bankEdit[c.id];
        return (
          <div key={c.id} style={{ ...card, display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1.3fr", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>Bag {c.bag_no || "—"}</div><div style={{ fontSize: 12, color: T.muted }}>{fmt(c.created_at)} · {c.by_name}{c.witness_name ? " ← " + c.witness_name : ""}</div></div>
            <div><div style={{ fontSize: 11.5, color: T.muted }}>Bagged</div><div style={{ fontWeight: 800 }}>{money(c.amount)}</div></div>
            <div><div style={{ fontSize: 11.5, color: T.muted }}>Banked</div><div style={{ fontWeight: 800 }}>{c.banked_amount == null ? "—" : money(c.banked_amount)}</div>
              {diff != null && <div style={{ fontSize: 12, fontWeight: 700, color: diff === 0 ? "#2e7d52" : "#b4462f" }}>{diff === 0 ? "matches" : (diff > 0 ? "+" : "") + money(diff)}</div>}</div>
            <div>
              {canBank ? (
                e != null ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={e} onChange={(ev) => setBankEdit((x) => ({ ...x, [c.id]: ev.target.value }))} placeholder="Amount banked" inputMode="decimal" style={{ width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid " + T.line, fontSize: 13 }} />
                    <span onClick={async () => { try { await call("collection_bank", { id: c.id, banked_amount: e === "" ? null : Number(e) }); setBankEdit((x) => { const y = { ...x }; delete y[c.id]; return y; }); load(); } catch (er) { setErr(er.message); } }} style={{ padding: "7px 10px", borderRadius: 8, background: T.ink, color: T.card, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Save</span>
                  </div>
                ) : <span onClick={() => setBankEdit((x) => ({ ...x, [c.id]: c.banked_amount == null ? "" : String(c.banked_amount) }))} style={{ fontSize: 12.5, fontWeight: 700, color: T.accent, cursor: "pointer" }}>{c.banked_amount == null ? "Enter amount banked" : "Change"}</span>
              ) : <span style={{ fontSize: 12, color: T.muted }}>Head office confirms</span>}
            </div>
          </div>
        );
      })}

      <div style={h}>Safe counts</div>
      {!counts.length && <div style={{ fontSize: 13, color: T.muted }}>No safe counts in this period.</div>}
      {counts.map((s) => (
        <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 10, padding: "7px 2px", borderBottom: "1px solid " + T.line, fontSize: 13 }}>
          <span>{fmt(s.created_at)} · {s.counted_by} / {s.witness}{s.note ? " · " + s.note : ""}</span>
          <span>expected {money(s.expected)}</span><span>counted {money(s.counted)}</span>
          <b style={{ color: Number(s.variance) === 0 ? "#2e7d52" : "#b4462f" }}>{Number(s.variance) === 0 ? "balanced" : (Number(s.variance) > 0 ? "+" : "") + money(s.variance)}</b>
        </div>
      ))}

      {Object.keys(byReason).length > 0 && (<>
        <div style={h}>Pay-outs by reason</div>
        {Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([r, a]) => <div key={r} style={{ display: "flex", justifyContent: "space-between", padding: "5px 2px", borderBottom: "1px solid " + T.line, fontSize: 13 }}><span>{r}</span><b>{money(a)}</b></div>)}
      </>)}

      <div style={h}>All entries</div>
      {!moves.length && <div style={{ fontSize: 13, color: T.muted }}>Nothing in this period.</div>}
      {moves.map((m) => (
        <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.6fr .9fr", gap: 10, padding: "6px 2px", borderBottom: "1px solid " + T.line, fontSize: 13, opacity: m.reversed_at ? 0.5 : 1 }}>
          <span>{fmt(m.created_at)}</span>
          <span style={{ fontWeight: 700 }}>{m.source === "handover" ? "Handover drop" : m.source === "close" ? "Close takings" : KIND[m.kind]}{m.reversed_at ? " (cancelled)" : ""}</span>
          <span style={{ color: T.muted }}>{[m.reason, m.bag_no ? "bag " + m.bag_no : null, m.by_name, m.approved_by ? "ok " + m.approved_by : null, m.reversed_by ? "cancelled by " + m.reversed_by : null].filter(Boolean).join(" · ")}</span>
          <b style={{ textAlign: "right" }}>{(m.kind === "payin" ? "+" : "−") + money(m.amount)}</b>
        </div>
      ))}
    </div>
  );
}
