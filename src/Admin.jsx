import { useState, useEffect, useMemo } from "react";

// ============================================================
// Menu Admin — master editor + per-store overrides.
// All writes go through the PIN-gated admin-api edge function;
// the service-role key never touches the browser.
// ============================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const T = {
  bg: "#F3F0E7", card: "#FFFFFF", ink: "#2F3326", muted: "#7E8470",
  accent: "#5E7A4D", line: "rgba(60,70,45,.14)", chip: "#EDE4D2", danger: "#B23B3B",
};
const money = (n) => "£" + Number(n || 0).toFixed(2);

async function callAdmin(pin, action, data) {
  const res = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    body: JSON.stringify({ pin, action, data }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || ("HTTP " + res.status));
  return json;
}

// ---------- PIN gate ----------
function PinGate({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!pin) return;
    setBusy(true); setErr("");
    try {
      // "load" doubles as the PIN check — it fails with 401 on a bad PIN.
      const res = await callAdmin(pin, "load", {});
      onUnlock(pin, res);
    } catch (e) {
      setErr(e.message === "unauthorized" ? "Wrong PIN." : e.message);
    } finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Hanken Grotesk',system-ui,sans-serif" }}>
      <div style={{ background: T.card, borderRadius: 18, padding: "40px 36px", width: 340, boxShadow: "0 20px 50px -20px rgba(60,70,45,.3)", textAlign: "center" }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 24, color: T.ink }}>Menu Admin</div>
        <div style={{ fontSize: 14, color: T.muted, marginTop: 6, marginBottom: 24 }}>Enter your PIN to continue</div>
        <input
          type="password" value={pin} onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="PIN" autoFocus
          style={{ width: "100%", boxSizing: "border-box", textAlign: "center", letterSpacing: 6, fontSize: 20, padding: "14px 0", borderRadius: 12, border: "1px solid " + T.line, background: T.bg, color: T.ink, outline: "none" }}
        />
        {err && <div style={{ color: T.danger, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <button onClick={submit} disabled={busy} style={{ width: "100%", marginTop: 18, padding: "14px 0", borderRadius: 12, border: "none", background: T.accent, color: "#F7F4EC", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "Checking…" : "Unlock"}</button>
      </div>
    </div>
  );
}

// ---------- editable field ----------
function Field({ value, onSave, type = "text", width = 90, prefix }) {
  const [v, setV] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  useEffect(() => { setV(value ?? ""); }, [value]);
  if (!editing) {
    return (
      <span onClick={() => setEditing(true)} style={{ cursor: "pointer", borderBottom: "1px dashed " + T.line, paddingBottom: 1 }}>
        {prefix}{value === "" || value === null || value === undefined ? <span style={{ color: T.muted }}>—</span> : (type === "number" ? Number(value).toFixed(2) : value)}
      </span>
    );
  }
  const commit = () => { setEditing(false); if (String(v) !== String(value)) onSave(type === "number" ? Number(v) : v); };
  return (
    <input
      autoFocus type={type === "number" ? "number" : "text"} value={v}
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setV(value); setEditing(false); } }}
      step={type === "number" ? "0.01" : undefined}
      style={{ width, fontSize: 14, padding: "3px 6px", borderRadius: 6, border: "1px solid " + T.accent, outline: "none", fontFamily: "inherit" }}
    />
  );
}

// ---------- master editor ----------
function MasterEditor({ pin, state, reload }) {
  const { categories, items } = state;
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState("");

  const save = async (id, fields) => {
    setBusyId(id); setMsg("");
    try { await callAdmin(pin, "update_item", { id, fields }); await reload(); }
    catch (e) { setMsg(e.message); }
    finally { setBusyId(null); }
  };
  const addItem = async (category_id) => {
    setMsg("");
    try { await callAdmin(pin, "create_item", { category_id, name: "New item", price: 0 }); await reload(); }
    catch (e) { setMsg(e.message); }
  };
  const delItem = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try { await callAdmin(pin, "delete_item", { id }); await reload(); }
    catch (e) { setMsg(e.message); }
  };

  const itemsByCat = useMemo(() => {
    const m = {};
    for (const c of categories) m[c.id] = [];
    for (const it of items) (m[it.category_id] = m[it.category_id] || []).push(it);
    return m;
  }, [categories, items]);

  return (
    <div>
      {msg && <div style={{ color: T.danger, marginBottom: 12, fontSize: 14 }}>{msg}</div>}
      {categories.map((c) => (
        <div key={c.id} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 19, color: T.ink }}>{c.name}</div>
            <button onClick={() => addItem(c.id)} style={{ fontSize: 13, fontWeight: 600, border: "1px solid " + T.line, background: T.card, color: T.accent, borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>+ Add item</button>
          </div>
          <div style={{ background: T.card, borderRadius: 14, border: "1px solid " + T.line, overflow: "hidden" }}>
            {(itemsByCat[c.id] || []).map((it, idx) => (
              <div key={it.id} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 90px 90px 70px 40px", gap: 12, alignItems: "center", padding: "12px 16px", borderTop: idx ? "1px solid " + T.line : "none", opacity: busyId === it.id ? .5 : 1 }}>
                <div style={{ fontWeight: 600, color: T.ink }}><Field value={it.name} width={160} onSave={(v) => save(it.id, { name: v })} /></div>
                <div style={{ color: T.muted, fontSize: 14 }}><Field value={it.description} width={180} onSave={(v) => save(it.id, { description: v })} /></div>
                <div style={{ color: T.ink, fontWeight: 600 }}><Field value={it.price} type="number" prefix="£" width={70} onSave={(v) => save(it.id, { price: v })} /></div>
                <div style={{ fontSize: 13, color: T.muted }}>
                  <Field value={(it.allergens || []).join(", ")} width={90} onSave={(v) => save(it.id, { allergens: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
                </div>
                <div>
                  <button onClick={() => save(it.id, { available: !it.available })} style={{ fontSize: 12, fontWeight: 700, border: "none", borderRadius: 20, padding: "5px 10px", cursor: "pointer", background: it.available ? "rgba(94,122,77,.14)" : "rgba(178,59,59,.12)", color: it.available ? T.accent : T.danger }}>{it.available ? "On" : "Off"}</button>
                </div>
                <div style={{ textAlign: "center", color: T.danger, cursor: "pointer", fontSize: 18 }} onClick={() => delItem(it.id)}>×</div>
              </div>
            ))}
            {(itemsByCat[c.id] || []).length === 0 && <div style={{ padding: 16, color: T.muted, fontSize: 14 }}>No items yet.</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- per-store overrides ----------
function OverridesEditor({ pin, state, reload }) {
  const { items, locations, overrides, categories } = state;
  const [locId, setLocId] = useState(locations[0]?.id || "");
  const [msg, setMsg] = useState("");

  const ovByItem = useMemo(() => {
    const m = {};
    for (const o of overrides) if (o.location_id === locId) m[o.item_id] = o;
    return m;
  }, [overrides, locId]);

  const catName = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);

  const setOverride = async (item_id, price, available) => {
    setMsg("");
    try { await callAdmin(pin, "set_override", { item_id, location_id: locId, price, available }); await reload(); }
    catch (e) { setMsg(e.message); }
  };

  if (!locations.length) {
    return <div style={{ color: T.muted, fontSize: 15 }}>No locations yet. Add a location in the database first, then you can set per-store prices here.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.muted }}>Store:</span>
        <select value={locId} onChange={(e) => setLocId(e.target.value)} style={{ fontSize: 15, padding: "8px 12px", borderRadius: 10, border: "1px solid " + T.line, background: T.card, color: T.ink }}>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <span style={{ fontSize: 13, color: T.muted }}>Blank price/availability = uses the master menu.</span>
      </div>
      {msg && <div style={{ color: T.danger, marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      <div style={{ background: T.card, borderRadius: 14, border: "1px solid " + T.line, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 90px 110px 130px", gap: 12, padding: "12px 16px", fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: T.muted, textTransform: "uppercase", borderBottom: "1px solid " + T.line }}>
          <span>Item</span><span>Master</span><span>Store price</span><span>Store availability</span>
        </div>
        {items.map((it, idx) => {
          const ov = ovByItem[it.id];
          const storePrice = ov && ov.price !== null && ov.price !== undefined ? ov.price : null;
          const storeAvail = ov && ov.available !== null && ov.available !== undefined ? ov.available : null;
          return (
            <div key={it.id} style={{ display: "grid", gridTemplateColumns: "2fr 90px 110px 130px", gap: 12, alignItems: "center", padding: "11px 16px", borderTop: idx ? "1px solid " + T.line : "none" }}>
              <div><span style={{ fontWeight: 600, color: T.ink }}>{it.name}</span> <span style={{ fontSize: 12, color: T.muted }}>· {catName[it.category_id]}</span></div>
              <div style={{ color: T.muted, fontSize: 14 }}>{money(it.price)}</div>
              <div>
                <Field value={storePrice === null ? "" : storePrice} type="number" prefix="£" width={70}
                  onSave={(v) => setOverride(it.id, v === "" || isNaN(v) ? null : Number(v), storeAvail)} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setOverride(it.id, storePrice, storeAvail === true ? null : true)} style={{ fontSize: 12, fontWeight: 600, border: "1px solid " + T.line, borderRadius: 8, padding: "4px 8px", cursor: "pointer", background: storeAvail === true ? "rgba(94,122,77,.14)" : T.card, color: storeAvail === true ? T.accent : T.muted }}>On</button>
                <button onClick={() => setOverride(it.id, storePrice, storeAvail === false ? null : false)} style={{ fontSize: 12, fontWeight: 600, border: "1px solid " + T.line, borderRadius: 8, padding: "4px 8px", cursor: "pointer", background: storeAvail === false ? "rgba(178,59,59,.12)" : T.card, color: storeAvail === false ? T.danger : T.muted }}>Off</button>
                {(storePrice !== null || storeAvail !== null) && <button onClick={() => setOverride(it.id, null, null)} title="Clear override" style={{ fontSize: 12, border: "none", background: "none", color: T.muted, cursor: "pointer" }}>clear</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Admin() {
  const [pin, setPin] = useState(null);
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("master");

  const reload = async () => {
    const res = await callAdmin(pin, "load", {});
    setState({ categories: res.categories || [], items: res.items || [], locations: res.locations || [], overrides: res.overrides || [] });
  };

  if (!pin || !state) {
    return <PinGate onUnlock={(p, res) => { setPin(p); setState({ categories: res.categories || [], items: res.items || [], locations: res.locations || [], overrides: res.overrides || [] }); }} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Hanken Grotesk',system-ui,sans-serif", color: T.ink }}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 26 }}>Menu Admin</div>
          <button onClick={() => { setPin(null); setState(null); }} style={{ fontSize: 13, fontWeight: 600, border: "1px solid " + T.line, background: T.card, color: T.muted, borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Lock</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[["master", "Master menu"], ["overrides", "Per-store prices"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none", borderRadius: 10, padding: "9px 18px", background: tab === k ? T.ink : T.card, color: tab === k ? "#fff" : T.muted, boxShadow: tab === k ? "none" : "inset 0 0 0 1px " + T.line }}>{label}</button>
          ))}
        </div>

        {tab === "master" && <MasterEditor pin={pin} state={state} reload={reload} />}
        {tab === "overrides" && <OverridesEditor pin={pin} state={state} reload={reload} />}
      </div>
    </div>
  );
}
