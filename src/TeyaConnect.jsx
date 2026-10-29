import { useState, useEffect, useRef } from "react";

// ============================================================
// TEYA CONNECT 2026-10-29 — Admin › store › "Card machine".
// Teya certification steps 1-3: connect the Teya account, choose the
// store, choose the terminal(s). Plus Disconnect. Head office only.
// Talks to admin-api (teya_status / teya_connect_* / teya_disconnect).
// The Teya sign-in is Teya's own device-code page: we only show the
// code, never ask for the Teya password.
// ============================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function api(pin, action, data) {
  const res = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    body: JSON.stringify({ pin, action, data }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.message || j.error || "HTTP " + res.status); e.code = j.error; throw e; }
  return j;
}

const when = (ts) => { try { return new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

export default function TeyaConnect({ pin, loc, T }) {
  const call = (a, d) => api(pin, a, d);
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);        // 0 status · 1 sign in · 2 store · 3 terminals · 4 done
  const [sess, setSess] = useState(null);     // { session_id, user_code, verification_uri(_complete), interval, expires_in }
  const [stores, setStores] = useState([]);
  const [store, setStore] = useState(null);
  const [picks, setPicks] = useState({});     // terminal_id -> { on, tablet_no, label }
  const [done, setDone] = useState(null);
  const pollRef = useRef(null);

  const load = async () => {
    setErr("");
    try { setStatus(await call("teya_status", { location_id: loc.id })); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); return () => clearTimeout(pollRef.current); /* eslint-disable-next-line */ }, [loc.id]);

  const stopPoll = () => { clearTimeout(pollRef.current); pollRef.current = null; };
  const cancel = () => { stopPoll(); setSess(null); setStores([]); setStore(null); setPicks({}); setStep(0); setErr(""); };

  // Step 1 — start Teya's device sign-in and wait for approval.
  const start = async () => {
    setBusy(true); setErr(""); setDone(null);
    try {
      const s = await call("teya_connect_start", {});
      setSess(s); setStep(1);
      const deadline = Date.now() + (s.expires_in || 600) * 1000;
      const tick = async () => {
        if (Date.now() > deadline) { setErr("The code expired before it was approved. Start again."); setStep(0); return; }
        try {
          const r = await call("teya_connect_poll", { session_id: s.session_id });
          if (r.signed_in) { pollRef.current = null; await loadStores(s.session_id); return; }
        } catch (e) { setErr(e.message); if (e.code === "expired") { setStep(0); return; } }
        pollRef.current = setTimeout(tick, (s.interval || 5) * 1000);
      };
      pollRef.current = setTimeout(tick, (s.interval || 5) * 1000);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // Step 2 — the Teya stores this account can see.
  const loadStores = async (sid) => {
    setBusy(true); setErr("");
    try {
      const r = await call("teya_connect_stores", { session_id: sid });
      setStores(r.stores || []); setStep(2);
      if ((r.stores || []).length === 1) chooseStore(r.stores[0]);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // Step 3 — pick terminals. Pre-tick the ones this café already uses.
  const chooseStore = (s) => {
    setStore(s);
    const current = new Map((status?.terminals || []).map((t) => [String(t.terminal_id), t]));
    const next = {};
    (s.terminals || []).forEach((t, i) => {
      const was = current.get(String(t.terminal_id));
      next[t.terminal_id] = { on: was ? true : (s.terminals.length === 1), tablet_no: was?.tablet_no ?? "", label: was?.label || (t.serial ? "Teya " + t.serial : "Teya terminal " + (i + 1)) };
    });
    setPicks(next); setStep(3);
  };

  const save = async () => {
    const terminals = Object.entries(picks).filter(([, p]) => p.on).map(([terminal_id, p]) => ({ terminal_id, tablet_no: p.tablet_no === "" ? null : Number(p.tablet_no), label: p.label }));
    if (!terminals.length) { setErr("Choose at least one terminal."); return; }
    const tills = terminals.map((t) => t.tablet_no == null ? "all" : String(t.tablet_no));
    if (new Set(tills).size !== tills.length) { setErr("Two terminals are set to the same till. Give each one its own till, or leave one on All tills."); return; }
    setBusy(true); setErr("");
    try {
      const r = await call("teya_connect_save", { session_id: sess.session_id, location_id: loc.id, store_id: store.store_id, store_name: store.name, terminals });
      setDone(r); setStep(4); setSess(null); await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect the Teya card machine from " + loc.name + "?\n\nThe till goes back to keying card payments in by hand until you connect again. Payments already taken are not affected.")) return;
    setBusy(true); setErr("");
    try { await call("teya_disconnect", { location_id: loc.id }); setStep(0); setDone(null); await load(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // ---------- look ----------
  const card = { background: T.card, border: "1px solid " + T.line, borderRadius: 14, padding: 18, marginBottom: 12 };
  const h = { fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: "-.01em" };
  const sub = { fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginTop: 4 };
  const btn = (kind = "primary") => ({
    fontSize: 13, fontWeight: 700, borderRadius: 10, padding: "10px 16px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
    ...(kind === "primary" ? { color: "#fff", background: T.accent, border: "none" }
      : kind === "danger" ? { color: "#b4462f", background: "#fbeeeb", border: "1px solid #f2ddd6" }
      : { color: T.muted, background: T.bg, border: "1px solid " + T.line }),
  });
  const env = status?.env || sess?.env;
  const envBadge = env && (
    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", borderRadius: 6, padding: "3px 8px", background: env === "staging" ? "#fff3d6" : "#e7f2e0", color: env === "staging" ? "#8a6400" : "#3c5a2e" }}>{env === "staging" ? "Teya test (staging)" : "Teya live"}</span>
  );
  const Steps = () => (
    <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
      {["Sign in to Teya", "Choose store", "Choose terminal"].map((l, i) => {
        const n = i + 1, on = step === n, past = step > n;
        return <span key={l} style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 20, background: on ? T.accent : past ? "#e7f2e0" : "#ecebe3", color: on ? "#fff" : past ? "#3c5a2e" : T.faint }}>{past ? "✓ " : n + ". "}{l}</span>;
      })}
    </div>
  );

  if (!status && !err) return <div style={{ fontSize: 12.5, color: T.faint }}>Loading card machine…</div>;

  const connected = (status?.terminals || []).length > 0;
  const storeName = (status?.stores || [])[0]?.store_name;

  return (
    <div style={{ maxWidth: 640 }}>
      {err && <div style={{ ...card, background: "#fbeeeb", borderColor: "#f2ddd6", color: "#8f3422", fontSize: 13, fontWeight: 600 }}>{err}</div>}

      {/* ── Status ── */}
      {step === 0 || step === 4 ? (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: connected ? "#5E7A4D" : "#c3bcab" }} />
            <span style={h}>{connected ? "Teya card machine connected" : "No card machine connected"}</span>
            <span style={{ marginLeft: "auto" }}>{envBadge}</span>
          </div>
          {step === 4 && done && (
            <div style={{ ...sub, color: "#3c5a2e", fontWeight: 600 }}>
              Saved. {done.terminals} terminal{done.terminals === 1 ? "" : "s"} linked{done.registered ? " and the till is registered with Teya" : ""}{done.token_ok === false ? " — but Teya didn't issue a payment token yet. Ask Teya to check the store's POSLink access." : "."}
            </div>
          )}
          {connected ? (
            <>
              <div style={sub}>Teya store: <b style={{ color: T.ink }}>{storeName || "—"}</b>{(status.missing_credentials || []).length ? <span style={{ color: "#b4462f" }}> · keys missing — connect again</span> : null}</div>
              <div style={{ marginTop: 12 }}>
                {status.terminals.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid " + T.line, borderRadius: 10, marginBottom: 6, background: T.bg }}>
                    <span style={{ fontSize: 16 }}>💳</span>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{t.label || "Teya terminal"}</div>
                      <div style={{ fontSize: 11, color: T.faint }}>{t.tablet_no == null ? "All tills" : "Till " + t.tablet_no}{t.connected_at ? " · connected " + when(t.connected_at) : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button disabled={busy} onClick={start} style={btn("ghost")}>Change store or terminal</button>
                <button disabled={busy} onClick={disconnect} style={btn("danger")}>Disconnect Teya</button>
              </div>
            </>
          ) : (
            <>
              <div style={sub}>Connect {loc.name}'s Teya account so the till sends card payments straight to the terminal — no keying amounts in, no mistyped totals. You'll need the Teya account owner's email and password to approve it on Teya's own page.</div>
              {status && !status.app_ready && <div style={{ ...sub, color: "#b4462f" }}>The Teya app keys aren't set on the server yet (TEYA_APP_CLIENT_ID / TEYA_APP_CLIENT_SECRET).</div>}
              <button disabled={busy || (status && !status.app_ready)} onClick={start} style={{ ...btn(), marginTop: 14 }}>Connect Teya</button>
            </>
          )}
        </div>
      ) : null}

      {/* ── Step 1: sign in ── */}
      {step === 1 && sess && (
        <div style={card}>
          <Steps />
          <div style={h}>Approve this till on Teya</div>
          <div style={sub}>Open Teya's sign-in page, log in with the Teya account for {loc.name}, and confirm this code. This page moves on by itself once it's approved.</div>
          <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase" }}>Your code</div>
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 30, fontWeight: 800, letterSpacing: "4px", color: T.ink, margin: "4px 0 12px" }}>{sess.user_code}</div>
              <a href={sess.verification_uri_complete || sess.verification_uri} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none", display: "inline-block" }}>Open Teya sign-in ↗</a>
              <div style={{ fontSize: 11.5, color: T.faint, marginTop: 8 }}>or go to <b>{sess.verification_uri}</b> and type the code</div>
            </div>
            <img alt="Scan to sign in on a phone" width={132} height={132} style={{ borderRadius: 10, border: "1px solid " + T.line, background: "#fff" }}
              src={"https://api.qrserver.com/v1/create-qr-code/?size=264x264&margin=6&data=" + encodeURIComponent(sess.verification_uri_complete || sess.verification_uri)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 12.5, color: T.muted }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d9a400", animation: "teyapulse 1.2s infinite" }} />Waiting for approval…
            <style>{"@keyframes teyapulse{0%,100%{opacity:1}50%{opacity:.25}}"}</style>
            <button onClick={cancel} style={{ ...btn("ghost"), marginLeft: "auto", padding: "7px 12px" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Step 2: store ── */}
      {step === 2 && (
        <div style={card}>
          <Steps />
          <div style={h}>Which Teya store is {loc.name}?</div>
          <div style={sub}>These are the stores on the Teya account you signed in with.</div>
          <div style={{ marginTop: 12 }}>
            {stores.map((s) => (
              <div key={s.store_id} onClick={() => chooseStore(s)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "1px solid " + T.line, borderRadius: 10, marginBottom: 6, background: T.bg, cursor: "pointer" }}>
                <span style={{ fontSize: 16 }}>🏪</span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: T.faint }}>{(s.terminals || []).length} terminal{(s.terminals || []).length === 1 ? "" : "s"}{s.registered ? " · this till is already registered" : ""}{s.terminals_error ? " · couldn't list terminals" : ""}</div>
                </div>
                <span style={{ marginLeft: "auto", color: T.accent, fontWeight: 800 }}>›</span>
              </div>
            ))}
            {!stores.length && !busy && <div style={sub}>This Teya account has no stores. Check you signed in with the right account.</div>}
            {busy && <div style={sub}>Loading stores…</div>}
          </div>
          <button onClick={cancel} style={{ ...btn("ghost"), marginTop: 8 }}>Cancel</button>
        </div>
      )}

      {/* ── Step 3: terminals ── */}
      {step === 3 && store && (
        <div style={card}>
          <Steps />
          <div style={h}>Choose the terminal{(store.terminals || []).length === 1 ? "" : "s"}</div>
          <div style={sub}>Tick the card machines at {loc.name}. If there's more than one, set which till each one sits beside; "All tills" is used by any till without its own.</div>
          <div style={{ marginTop: 12 }}>
            {(store.terminals || []).map((t) => {
              const p = picks[t.terminal_id] || { on: false, tablet_no: "", label: "" };
              const set = (k, v) => setPicks((x) => ({ ...x, [t.terminal_id]: { ...p, [k]: v } }));
              return (
                <div key={t.terminal_id} style={{ padding: "12px 14px", border: "1px solid " + (p.on ? T.accent : T.line), borderRadius: 10, marginBottom: 6, background: p.on ? "#f4f8f1" : T.bg }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={p.on} onChange={(e) => set("on", e.target.checked)} style={{ width: 18, height: 18, accentColor: T.accent }} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{t.model || "Teya terminal"}{t.serial ? " · " + t.serial : ""}</div>
                      <div style={{ fontSize: 11, color: T.faint, fontFamily: "ui-monospace, Menlo, monospace" }}>{t.terminal_id}{t.status ? " · " + t.status : ""}</div>
                    </div>
                  </label>
                  {p.on && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", paddingLeft: 28 }}>
                      <select value={p.tablet_no} onChange={(e) => set("tablet_no", e.target.value)} style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.line, background: "#fff" }}>
                        <option value="">All tills</option>
                        {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>Till {n}</option>)}
                      </select>
                      <input value={p.label} onChange={(e) => set("label", e.target.value)} placeholder="Name, e.g. Front counter" style={{ flex: 1, minWidth: 160, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.line }} />
                    </div>
                  )}
                </div>
              );
            })}
            {!(store.terminals || []).length && <div style={sub}>{store.terminals_error ? "Teya didn't return the terminals: " + store.terminals_error : "No terminals on this store yet. Ask Teya to add the card machine to the store, then connect again."}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button disabled={busy || !Object.values(picks).some((p) => p.on)} onClick={save} style={btn()}>{busy ? "Saving…" : "Save and connect"}</button>
            {stores.length > 1 && <button disabled={busy} onClick={() => { setStore(null); setStep(2); }} style={btn("ghost")}>Back</button>}
            <button disabled={busy} onClick={cancel} style={btn("ghost")}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.5, marginTop: 4 }}>
        The Teya password is only ever typed on Teya's page. Once saved, the till holds its own Teya payment key for this store; the sign-in itself is discarded.
      </div>
    </div>
  );
}
