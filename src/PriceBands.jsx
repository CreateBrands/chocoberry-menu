import React, { useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   PRICE BANDS — create bands and decide which store is on which.

   The prices themselves are edited in Overview (pick a band in the scope
   selector); this screen is only about the bands and their membership, which
   is a different job and a much smaller one. Keeping them apart means this
   stays a page you can read in a glance.

   A band is a COMPLETE price list, so new bands are always created by copying
   an existing one — a band is nearly always "the standard list with a few
   things dearer", and cloning means it is never half-populated.
   ───────────────────────────────────────────────────────────────────────── */
export default function PriceBands({ state, T, act, onClose }) {
  const [newName, setNewName] = useState("");
  const [copyFrom, setCopyFrom] = useState("Master");
  const [renaming, setRenaming] = useState(null);   // band id
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const bands = [...(state.priceBands || [])].sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name)
  );
  const stores = [...(state.locations || [])].sort((a, b) => a.name.localeCompare(b.name));

  const storesOn = (bandId) => stores.filter((s) => s.price_band_id === bandId);
  const itemCount = (bandId) => (state.bandPrices || []).filter((p) => p.band_id === bandId).length;
  const isMaster = (b) => b.name === "Master";

  const run = async (fn) => {
    setBusy(true); setErr("");
    try { await fn(); } catch (e) { setErr(e.message || "That didn't save."); }
    setBusy(false);
  };

  const create = () => {
    const name = newName.trim();
    if (!name) { setErr("Give the band a name."); return; }
    if (bands.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      setErr("There's already a band called that."); return;
    }
    run(async () => {
      await act("create_band", { name, copy_from: copyFrom });
      setNewName("");
    });
  };

  const rename = (b) => {
    const name = draftName.trim();
    if (!name || name === b.name) { setRenaming(null); return; }
    run(async () => {
      await act("update_band", { id: b.id, fields: { name } });
      setRenaming(null);
    });
  };

  const remove = (b) => {
    const on = storesOn(b.id);
    const warning = on.length
      ? `\n\n${on.length} store${on.length === 1 ? "" : "s"} (${on.map((s) => s.name).join(", ")}) will fall back to the item master prices until you put them on another band.`
      : "";
    if (!window.confirm(`Delete the "${b.name}" band?${warning}`)) return;
    run(() => act("delete_band", { id: b.id }));
  };

  const assign = (storeId, bandId) => run(() => act("set_store_band", { location_id: storeId, band_id: bandId || null }));

  const input = {
    padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.line,
    background: "#fff", fontSize: 13.5, fontFamily: "inherit", color: T.ink,
  };
  const btn = {
    padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
    fontSize: 13.5, fontWeight: 600, fontFamily: "inherit",
    background: T.accent, color: "#fff",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 60, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 24, overflow: "auto" }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: T.bg, borderRadius: 16, width: "100%", maxWidth: 760, boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>

        <div style={{ padding: "18px 22px", borderBottom: "1px solid " + T.line, background: T.card, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 19 }}>Price bands</div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>
              A band is a full price list. Stores share one; edit the band and they all move together.
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: T.muted, lineHeight: 1 }}>×</button>
        </div>

        {/* ── the bands ─────────────────────────────────────────────────── */}
        <div style={{ padding: "8px 0" }}>
          {bands.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13.5 }}>No bands yet.</div>
          )}
          {bands.map((b) => {
            const on = storesOn(b.id);
            return (
              <div key={b.id} style={{ padding: "12px 22px", borderTop: "1px solid " + T.line, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renaming === b.id ? (
                    <input autoFocus value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => rename(b)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setRenaming(null); }}
                      style={{ ...input, width: 200 }} />
                  ) : (
                    <div style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                      {b.name}
                      {isMaster(b) && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.muted, border: "1px solid " + T.line, borderRadius: 5, padding: "1px 5px" }}>DEFAULT</span>}
                    </div>
                  )}
                  <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>
                    {itemCount(b.id)} items ·{" "}
                    {on.length ? on.map((s) => s.name).join(", ") : <span style={{ opacity: .7 }}>no stores on this band</span>}
                  </div>
                </div>

                <button disabled={busy}
                  onClick={() => { setRenaming(b.id); setDraftName(b.name); }}
                  style={{ ...btn, background: "transparent", color: T.muted, padding: "6px 10px" }}>Rename</button>

                {/* Master is the fallback everything else copies from, so it
                    stays. The edge function refuses this too — the button is
                    hidden so nobody has to discover that by being told no. */}
                {!isMaster(b) && (
                  <button disabled={busy} onClick={() => remove(b)}
                    style={{ ...btn, background: "transparent", color: "#b4462f", padding: "6px 10px" }}>Delete</button>
                )}
              </div>
            );
          })}
        </div>

        {/* ── new band ──────────────────────────────────────────────────── */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid " + T.line, background: T.card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            placeholder="New band name" style={{ ...input, flex: 1, minWidth: 150 }} />
          <span style={{ fontSize: 12.5, color: T.muted }}>copying</span>
          <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} style={input}>
            {bands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
          <button onClick={create} disabled={busy} style={btn}>{busy ? "Working…" : "Create"}</button>
        </div>

        {/* ── which store is on which band ──────────────────────────────── */}
        <div style={{ borderTop: "1px solid " + T.line }}>
          <div style={{ padding: "14px 22px 6px", fontSize: 13, fontWeight: 600 }}>Store assignment</div>
          {stores.map((s) => (
            <div key={s.id} style={{ padding: "9px 22px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ flex: 1, fontSize: 14 }}>{s.name}</span>
              <select value={s.price_band_id || ""} disabled={busy}
                onChange={(e) => assign(s.id, e.target.value)} style={input}>
                {/* No band = master prices. Worth being able to say that
                    explicitly rather than only reaching it by deleting a band. */}
                <option value="">— master prices —</option>
                {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          ))}
          <div style={{ padding: "4px 22px 16px", fontSize: 12, color: T.muted }}>
            A store can still have its own exceptions on top of its band — set those in Overview.
          </div>
        </div>

        {err && <div style={{ padding: "10px 22px", fontSize: 12.5, color: "#b4462f", borderTop: "1px solid " + T.line }}>{err}</div>}
      </div>
    </div>
  );
}
