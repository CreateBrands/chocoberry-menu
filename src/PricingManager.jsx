import React, { useState, useMemo } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   PRICING MANAGER — the unified, best-in-class pricing screen.

   Two views (By location / By band), a transparency table showing base / band /
   store / EFFECTIVE (+ which tier won) for every item, inline editing, a bulk
   bar (set / +£ / +% / clear with rounding), a multi-store push, below-cost
   warnings, a change preview, and a per-location price-protection lock.

   Resolution mirrors store_menu_full:  location override → band price → base.
   All writes go through existing backend actions plus one bulk_set_prices.
   ───────────────────────────────────────────────────────────────────────── */
export default function PricingManager({ state, T, act, onClose }) {
  const items = useMemo(
    () => [...(state.items || [])].filter((i) => i.published !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name)),
    [state.items]
  );
  const cats = state.categories || [];
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || "";
  const stores = useMemo(() => [...(state.locations || [])].sort((a, b) => a.name.localeCompare(b.name)), [state.locations]);
  const bands = useMemo(
    () => [...(state.priceBands || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name)),
    [state.priceBands]
  );

  const [view, setView] = useState("location");           // "location" | "band"
  const [target, setTarget] = useState(stores[0]?.id || ""); // current location or band id
  const [protectedIds, setProtectedIds] = useState({});   // { locationId: true }
  const [sel, setSel] = useState({});                     // { itemId: true }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(null);           // { rows:[{item,from,to}], apply }
  const [search, setSearch] = useState("");

  // when the view flips, reset the target to the first of that kind
  const targets = view === "location" ? stores : bands;
  React.useEffect(() => {
    if (!targets.find((t) => t.id === target)) setTarget(targets[0]?.id || "");
    setSel({});
  }, [view]); // eslint-disable-line

  const bandPriceFor = (bandId, itemId) => {
    const r = (state.bandPrices || []).find((p) => p.band_id === bandId && p.item_id === itemId);
    return r && r.price != null ? Number(r.price) : null;
  };
  const overrideFor = (locId, itemId) => {
    const r = (state.overrides || []).find((o) => o.location_id === locId && o.item_id === itemId);
    return r && r.price != null ? Number(r.price) : null;
  };
  const storeBandId = (locId) => (stores.find((s) => s.id === locId) || {}).price_band_id || null;
  const itemCost = (it) => {
    const c = it.cost ?? it.cost_price ?? it.unit_cost;
    return c != null && isFinite(Number(c)) ? Number(c) : null;
  };

  // resolve the effective price + which tier won, for a LOCATION
  const resolveLocation = (locId, it) => {
    const ov = overrideFor(locId, it.id);
    if (ov != null) return { price: ov, tier: "store" };
    const bp = bandPriceFor(storeBandId(locId), it.id);
    if (bp != null) return { price: bp, tier: "band" };
    return { price: Number(it.price), tier: "base" };
  };
  // for a BAND: band price → base
  const resolveBand = (bandId, it) => {
    const bp = bandPriceFor(bandId, it.id);
    if (bp != null) return { price: bp, tier: "band" };
    return { price: Number(it.price), tier: "base" };
  };
  const resolve = (t, it) => view === "location" ? resolveLocation(t, it) : resolveBand(t, it);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => !q || it.name.toLowerCase().includes(q) || catName(it.category_id).toLowerCase().includes(q));
  }, [items, search]); // eslint-disable-line

  const isProtected = view === "location" && protectedIds[target];
  const gbp = (n) => "£" + Number(n).toFixed(2);

  const run = async (fn) => { setBusy(true); setErr(""); setMsg(""); try { await fn(); } catch (e) { setErr(e.message || "That didn't save."); } setBusy(false); };

  // inline single edit
  const setOne = (it, raw) => {
    if (isProtected) { setErr("This location is price-protected. Unlock it to make changes."); return; }
    const v = raw === "" ? null : parseFloat(raw);
    if (raw !== "" && (!isFinite(v) || v < 0)) return;
    run(async () => {
      if (view === "location") {
        const o = (state.overrides || []).find((x) => x.location_id === target && x.item_id === it.id);
        await act("set_override", { item_id: it.id, location_id: target, price: v, available: o ? o.available : null });
      } else {
        await act("set_band_price", { band_id: target, item_id: it.id, price: v });
      }
      setMsg("Saved.");
    });
  };
  const clearOne = (it) => setOne(it, "");

  // ---- bulk / multi-store ----
  const selIds = Object.keys(sel).filter((k) => sel[k]);
  const [op, setOp] = useState("set");
  const [opVal, setOpVal] = useState("");
  const [round, setRound] = useState("95");
  const [multiStores, setMultiStores] = useState({}); // for multi-store push (location view)

  const buildPreview = () => {
    setErr("");
    if (!selIds.length) { setErr("Tick some items first."); return; }
    const val = op === "clear" ? 0 : parseFloat(opVal);
    if (op !== "clear" && (!isFinite(val))) { setErr("Enter a number for the change."); return; }
    // targets to apply to: current single target, OR the multi-store selection (location view only)
    const applyTargets = (view === "location" && Object.values(multiStores).some(Boolean))
      ? Object.keys(multiStores).filter((k) => multiStores[k])
      : [target];
    // block protected locations
    const blocked = applyTargets.filter((tid) => view === "location" && protectedIds[tid]);
    if (blocked.length) { setErr("Some selected stores are price-protected. Unlock them first."); return; }

    const roundClean = (n) => {
      if (n < 0) n = 0;
      if (round === "95") { const b = Math.round(n); return (b - (b > n + 0.05 ? 1 : 0)) + 0.95; }
      if (round === "99") { const b = Math.round(n); return (b - (b > n + 0.01 ? 1 : 0)) + 0.99; }
      if (round === "05") return Math.round(n * 20) / 20;
      return Math.round(n * 100) / 100;
    };
    const rows = [];
    const current = {};
    for (const tid of applyTargets) {
      for (const iid of selIds) {
        const it = items.find((x) => x.id === iid); if (!it) continue;
        const eff = resolve(tid, it);
        current[`${tid}|${iid}`] = eff.price;
        let to;
        if (op === "clear") to = null;
        else if (op === "set") to = roundClean(val);
        else if (op === "inc") to = roundClean(eff.price + val);
        else to = roundClean(eff.price * (1 + val / 100));
        const cost = itemCost(it);
        rows.push({
          targetName: (targets.find((t) => t.id === tid) || {}).name || "",
          item: it.name, from: eff.price, to,
          belowCost: to != null && cost != null && to < cost,
        });
      }
    }
    setPreview({
      rows,
      apply: async () => {
        await act("bulk_set_prices", {
          scope: view, target_ids: applyTargets, item_ids: selIds,
          op, value: op === "clear" ? 0 : val, round, current,
        });
      },
    });
  };

  const doApply = () => run(async () => {
    await preview.apply();
    setPreview(null); setSel({}); setMultiStores({}); setOpVal("");
    setMsg("Prices updated. Reloading…");
  });

  // styles
  const input = { padding: "7px 9px", borderRadius: 8, border: "1px solid " + T.line, background: "#fff", fontSize: 13, fontFamily: "inherit", color: T.ink };
  const btn = { padding: "7px 13px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: T.accent, color: "#fff" };
  const chip = (active) => ({ padding: "6px 13px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600, background: active ? T.accent : "transparent", color: active ? "#fff" : T.muted });
  const tierColor = { store: "#993556", band: "#854f0b", base: "#0f6e56" };
  const tierBg = { store: "#fbeaf0", band: "#faeeda", base: "#e1f5ee" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 60, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 20, overflow: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.bg, borderRadius: 16, width: "100%", maxWidth: 1000, boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>

        {/* header */}
        <div style={{ padding: "16px 22px", borderBottom: "1px solid " + T.line, background: T.card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 19 }}>Pricing</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>See every tier and what wins · edit one or many at once</div>
          </div>
          <div style={{ display: "inline-flex", background: T.bg, borderRadius: 9, padding: 3, border: "1px solid " + T.line }}>
            <span style={chip(view === "location")} onClick={() => setView("location")}>By location</span>
            <span style={chip(view === "band")} onClick={() => setView("band")}>By band</span>
          </div>
          <select value={target} onChange={(e) => { setTarget(e.target.value); setSel({}); }} style={{ ...input, fontWeight: 600 }}>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {view === "location" && (
            <span onClick={() => setProtectedIds((p) => ({ ...p, [target]: !p[target] }))}
              style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 20, background: isProtected ? "#e1f5ee" : T.bg, color: isProtected ? "#0f6e56" : T.muted, border: "1px solid " + (isProtected ? "#bfe3d7" : T.line) }}>
              {isProtected ? "🔒 price-protected" : "🔓 protect prices"}
            </span>
          )}
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: T.muted, lineHeight: 1 }}>×</button>
        </div>

        {/* bulk bar */}
        {selIds.length > 0 && (
          <div style={{ padding: "10px 22px", background: "#eef7f4", borderBottom: "1px solid " + T.line, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: "#0f6e56" }}>{selIds.length} selected</span>
            <span style={{ color: T.muted }}>Apply:</span>
            {[["set", "Set £"], ["inc", "+ £"], ["pct", "+ %"], ["clear", "Clear"]].map(([k, lbl]) => (
              <span key={k} onClick={() => setOp(k)} style={{ ...chip(op === k), border: "1px solid " + (op === k ? T.accent : T.line), background: op === k ? T.accent : "#fff" }}>{lbl}</span>
            ))}
            {op !== "clear" && <input value={opVal} onChange={(e) => setOpVal(e.target.value)} placeholder={op === "pct" ? "e.g. 5 or -5" : "amount"} style={{ ...input, width: 100 }} />}
            {op !== "clear" && <><span style={{ color: T.muted }}>Round:</span>
              <select value={round} onChange={(e) => setRound(e.target.value)} style={input}>
                <option value="">exact</option><option value="95">.95</option><option value="99">.99</option><option value="05">5p</option>
              </select></>}
            <button onClick={buildPreview} disabled={busy} style={{ ...btn, marginLeft: "auto" }}>Preview →</button>
          </div>
        )}

        {/* multi-store push (location view only) */}
        {view === "location" && selIds.length > 0 && (
          <div style={{ padding: "8px 22px", background: "#fbf7f2", borderBottom: "1px solid " + T.line, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
            <span style={{ color: T.muted, fontWeight: 600 }}>Push to stores:</span>
            {stores.map((s) => {
              const on = multiStores[s.id];
              return (
                <span key={s.id} onClick={() => setMultiStores((m) => ({ ...m, [s.id]: !m[s.id] }))}
                  style={{ cursor: "pointer", padding: "4px 10px", borderRadius: 16, fontSize: 12, fontWeight: 600, background: on ? "#fbeaf0" : "#fff", color: on ? "#993556" : T.muted, border: "1px solid " + (on ? "#ed93b1" : T.line) }}>
                  {on ? "✓ " : ""}{s.name}
                </span>
              );
            })}
            <span style={{ color: T.muted, fontStyle: "italic" }}>{Object.values(multiStores).some(Boolean) ? "will apply to ticked stores" : "or leave blank to apply to the current one"}</span>
          </div>
        )}

        {/* search */}
        <div style={{ padding: "10px 22px 0" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" style={{ ...input, width: "100%", boxSizing: "border-box" }} />
        </div>

        {/* table */}
        <div style={{ maxHeight: "55vh", overflow: "auto", padding: "8px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px 2.4fr 1fr 1fr 1.2fr 1.3fr", gap: 0, fontSize: 10.5, fontWeight: 600, color: T.muted, padding: "7px 22px", textTransform: "uppercase", letterSpacing: ".4px", position: "sticky", top: 0, background: T.bg }}>
            <span onClick={() => { const all = {}; if (selIds.length !== shown.length) shown.forEach((it) => all[it.id] = true); setSel(all); }} style={{ cursor: "pointer" }}>{selIds.length === shown.length && shown.length ? "☑" : "☐"}</span>
            <span>Item</span>
            <span style={{ textAlign: "right" }}>Base</span>
            <span style={{ textAlign: "right", color: "#854f0b" }}>Band</span>
            <span style={{ textAlign: "right", color: "#993556" }}>{view === "location" ? "This store" : "Band price"}</span>
            <span style={{ textAlign: "right" }}>Effective</span>
          </div>
          {shown.map((it) => {
            const eff = resolve(target, it);
            const base = Number(it.price);
            const bandVal = view === "location" ? bandPriceFor(storeBandId(target), it.id) : null;
            const editVal = view === "location" ? overrideFor(target, it.id) : bandPriceFor(target, it.id);
            const cost = itemCost(it);
            const below = cost != null && eff.price < cost;
            const on = !!sel[it.id];
            return (
              <div key={it.id} style={{ display: "grid", gridTemplateColumns: "28px 2.4fr 1fr 1fr 1.2fr 1.3fr", gap: 0, fontSize: 13, padding: "9px 22px", borderBottom: "1px solid " + T.line, alignItems: "center", background: on ? "#eef7f430" : "transparent" }}>
                <span onClick={() => setSel((s) => ({ ...s, [it.id]: !s[it.id] }))} style={{ cursor: "pointer", color: on ? T.accent : T.muted, fontSize: 15 }}>{on ? "☑" : "☐"}</span>
                <span style={{ minWidth: 0 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{it.name}</span>
                  {below && <span style={{ fontSize: 10, color: "#c0392b", background: "#fce4e4", padding: "1px 6px", borderRadius: 10 }}>below cost</span>}</span>
                <span style={{ textAlign: "right", color: T.muted }}>{gbp(base)}</span>
                <span style={{ textAlign: "right", color: bandVal != null ? "#854f0b" : "#c9c4b8", fontWeight: bandVal != null ? 600 : 400 }}>{view === "location" ? (bandVal != null ? gbp(bandVal) : "—") : "—"}</span>
                <span style={{ textAlign: "right" }}>
                  <input defaultValue={editVal != null ? editVal : ""} key={target + it.id + (editVal ?? "")}
                    disabled={isProtected}
                    onBlur={(e) => { if (e.target.value !== (editVal != null ? String(editVal) : "")) setOne(it, e.target.value); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                    placeholder="set"
                    style={{ width: 66, textAlign: "right", padding: "5px 7px", borderRadius: 6, border: "1px solid " + (editVal != null ? tierColor.store : T.line), background: editVal != null ? tierBg.store : "#fff", color: editVal != null ? tierColor.store : T.ink, fontWeight: editVal != null ? 600 : 400, fontSize: 12.5, fontFamily: "inherit", opacity: isProtected ? .5 : 1 }} />
                </span>
                <span style={{ textAlign: "right", fontWeight: 600, color: below ? "#c0392b" : tierColor[eff.tier] }}>
                  {gbp(eff.price)} <span style={{ fontSize: 9.5, color: T.muted, fontWeight: 400 }}>{eff.tier}</span>
                </span>
              </div>
            );
          })}
          {shown.length === 0 && <div style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>No items.</div>}
        </div>

        {(err || msg) && <div style={{ padding: "10px 22px", fontSize: 12.5, color: err ? "#b4462f" : "#0f766e", borderTop: "1px solid " + T.line, background: T.card }}>{err || msg}</div>}

        {/* preview modal */}
        {preview && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 70, display: "flex", justifyContent: "center", alignItems: "center", padding: 20 }} onClick={() => setPreview(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: T.bg, borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid " + T.line, fontWeight: 700, fontSize: 16, fontFamily: "'Poppins',sans-serif" }}>
                Confirm {preview.rows.length} change{preview.rows.length === 1 ? "" : "s"}
              </div>
              <div style={{ padding: "6px 0" }}>
                {preview.rows.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", borderBottom: "1px solid " + T.line, fontSize: 13 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.targetName ? <span style={{ color: T.muted, fontSize: 11 }}>{r.targetName} · </span> : null}{r.item}
                    </span>
                    <span style={{ color: T.muted }}>{gbp(r.from)}</span>
                    <span style={{ color: T.muted }}>→</span>
                    <span style={{ fontWeight: 600, color: r.belowCost ? "#c0392b" : T.ink }}>{r.to == null ? "cleared" : gbp(r.to)}{r.belowCost ? " ⚠" : ""}</span>
                  </div>
                ))}
              </div>
              {preview.rows.some((r) => r.belowCost) && (
                <div style={{ padding: "10px 20px", fontSize: 12, color: "#c0392b", background: "#fce4e4" }}>⚠ Some prices are below cost.</div>
              )}
              <div style={{ padding: "14px 20px", borderTop: "1px solid " + T.line, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setPreview(null)} style={{ ...btn, background: "transparent", color: T.muted }}>Cancel</button>
                <button onClick={doApply} disabled={busy} style={btn}>{busy ? "Applying…" : "Apply changes"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
