import React, { useState, useMemo } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   PRICING — full-page, industry-leader pricing manager.

   Two views (By location / By band). A transparency table shows base / band /
   store / EFFECTIVE (+ which tier won) for every item, grouped by category.
   Inline editing, a sticky bulk bar (set / +£ / +% / clear with rounding), a
   multi-store push, below-cost warnings, a change preview, and a per-location
   price-protection lock.

   Resolution mirrors store_menu_full:  location override → band price → base.
   Renders inline in the admin content area (not a modal) for a full-page feel.
   ───────────────────────────────────────────────────────────────────────── */
export default function PricingManager({ state, T, act, onClose }) {
  const PALETTE = {
    store: "#9A5B6E", storeBg: "#F7ECF0", storeLine: "#E3B9C6",
    band: "#9C7A3C", bandBg: "#F6EEDD", bandLine: "#DFC79A",
    base: T.accent, baseBg: "#EAF0E2",
    danger: "#B23B3B", dangerBg: "#FBECEC",
  };

  const cats = useMemo(
    () => [...(state.categories || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [state.categories]
  );
  const items = useMemo(
    () => [...(state.items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name)),
    [state.items]
  );
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || "Uncategorised";
  const stores = useMemo(() => [...(state.locations || [])].sort((a, b) => a.name.localeCompare(b.name)), [state.locations]);
  // PRICE bands only. menu_price_bands holds both kinds: price bands decide
  // what a store CHARGES, menu bands decide what it CARRIES (managed under
  // Band menus). Listing menu bands here let a price change land on a format
  // band by accident, and cluttered both screens with the other's entries.
  const bands = useMemo(
    () => [...(state.priceBands || [])]
      .filter((b) => b.band_kind !== "menu")
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name)),
    [state.priceBands]
  );

  const [view, setView] = useState("location");
  const [target, setTarget] = useState(stores[0]?.id || "");
  const [protectedIds, setProtectedIds] = useState({});
  const [sel, setSel] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(null);
  const [search, setSearch] = useState("");
  const [op, setOp] = useState("set");
  const [opVal, setOpVal] = useState("");
  const [round, setRound] = useState("95");
  const [multiStores, setMultiStores] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const [page, setPage] = useState("prices");   // "prices" | "bands"
  // band-management drafts
  const [newBandName, setNewBandName] = useState("");
  const [copyFrom, setCopyFrom] = useState("Master");
  const [renaming, setRenaming] = useState(null);
  const [draftName, setDraftName] = useState("");

  const targets = view === "location" ? stores : bands;
  React.useEffect(() => {
    if (!targets.find((t) => t.id === target)) setTarget(targets[0]?.id || "");
    setSel({}); setMultiStores({});
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
  const bandName = (id) => (bands.find((b) => b.id === id) || {}).name || null;
  const itemCost = (it) => {
    const c = it.cost ?? it.cost_price ?? it.unit_cost;
    return c != null && isFinite(Number(c)) ? Number(c) : null;
  };

  const resolveLocation = (locId, it) => {
    const ov = overrideFor(locId, it.id);
    if (ov != null) return { price: ov, tier: "store" };
    const bp = bandPriceFor(storeBandId(locId), it.id);
    if (bp != null) return { price: bp, tier: "band" };
    return { price: Number(it.price), tier: "base" };
  };
  const resolveBand = (bandId, it) => {
    const bp = bandPriceFor(bandId, it.id);
    if (bp != null) return { price: bp, tier: "band" };
    return { price: Number(it.price), tier: "base" };
  };
  const resolve = (t, it) => view === "location" ? resolveLocation(t, it) : resolveBand(t, it);

  const shownItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => !q || it.name.toLowerCase().includes(q) || catName(it.category_id).toLowerCase().includes(q));
  }, [items, search]); // eslint-disable-line

  const grouped = useMemo(() => {
    const map = new Map();
    for (const it of shownItems) {
      const k = it.category_id || "_none";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return [...map.entries()].sort((a, b) => {
      const ca = cats.findIndex((c) => c.id === a[0]); const cb = cats.findIndex((c) => c.id === b[0]);
      return (ca === -1 ? 999 : ca) - (cb === -1 ? 999 : cb);
    });
  }, [shownItems, cats]); // eslint-disable-line

  const selIds = Object.keys(sel).filter((k) => sel[k]);
  const isProtected = view === "location" && protectedIds[target];
  const gbp = (n) => "£" + Number(n).toFixed(2);

  const stats = useMemo(() => {
    let store = 0, band = 0, base = 0, below = 0;
    for (const it of items) {
      const e = resolve(target, it);
      if (e.tier === "store") store++; else if (e.tier === "band") band++; else base++;
      const c = itemCost(it); if (c != null && e.price < c) below++;
    }
    return { store, band, base, below, total: items.length };
  }, [target, view, state.overrides, state.bandPrices, items]); // eslint-disable-line

  const run = async (fn) => { setBusy(true); setErr(""); setMsg(""); try { await fn(); } catch (e) { setErr(e.message || "That didn't save."); } setBusy(false); };

  // ── band management ──
  const storesOn = (bandId) => stores.filter((s) => s.price_band_id === bandId);
  const bandItemCount = (bandId) => (state.bandPrices || []).filter((p) => p.band_id === bandId && p.price != null).length;
  const isMaster = (b) => b.name === "Master";
  const createBand = () => {
    const name = newBandName.trim();
    if (!name) { setErr("Give the band a name."); return; }
    if (bands.some((b) => b.name.toLowerCase() === name.toLowerCase())) { setErr("There's already a band called that."); return; }
    run(async () => { await act("create_band", { name, copy_from: copyFrom, band_kind: "price" }); setNewBandName(""); setMsg("Band created."); });
  };
  const renameBand = (b) => {
    const name = draftName.trim();
    if (!name || name === b.name) { setRenaming(null); return; }
    run(async () => { await act("update_band", { id: b.id, fields: { name } }); setRenaming(null); setMsg("Renamed."); });
  };
  const removeBand = (b) => {
    const on = storesOn(b.id);
    const warn = on.length ? `\n\n${on.length} store${on.length === 1 ? "" : "s"} (${on.map((s) => s.name).join(", ")}) will fall back to master prices.` : "";
    if (!window.confirm(`Delete the "${b.name}" band?${warn}`)) return;
    run(async () => { await act("delete_band", { id: b.id }); setMsg("Band deleted."); });
  };
  const assignStore = (storeId, bandId) => run(async () => { await act("set_store_band", { location_id: storeId, band_id: bandId || null }); setMsg("Store reassigned."); });


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

  const roundClean = (n) => {
    if (n < 0) n = 0;
    if (round === "95") { const b = Math.round(n); return (b - (b > n + 0.05 ? 1 : 0)) + 0.95; }
    if (round === "99") { const b = Math.round(n); return (b - (b > n + 0.01 ? 1 : 0)) + 0.99; }
    if (round === "05") return Math.round(n * 20) / 20;
    return Math.round(n * 100) / 100;
  };

  const buildPreview = () => {
    setErr("");
    if (!selIds.length) { setErr("Tick some items first."); return; }
    const val = op === "clear" ? 0 : parseFloat(opVal);
    if (op !== "clear" && !isFinite(val)) { setErr("Enter a number for the change."); return; }
    const applyTargets = (view === "location" && Object.values(multiStores).some(Boolean))
      ? Object.keys(multiStores).filter((k) => multiStores[k]) : [target];
    const blocked = applyTargets.filter((tid) => view === "location" && protectedIds[tid]);
    if (blocked.length) { setErr("Some selected stores are price-protected. Unlock them first."); return; }

    const rows = []; const current = {};
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
        rows.push({ targetName: (targets.find((t) => t.id === tid) || {}).name || "", item: it.name, from: eff.price, to, belowCost: to != null && cost != null && to < cost });
      }
    }
    setPreview({ rows, apply: async () => { await act("bulk_set_prices", { scope: view, target_ids: applyTargets, item_ids: selIds, op, value: op === "clear" ? 0 : val, round, current }); } });
  };

  const doApply = () => run(async () => {
    await preview.apply();
    setPreview(null); setSel({}); setMultiStores({}); setOpVal("");
    setMsg("Prices updated.");
  });

  const input = { padding: "9px 12px", borderRadius: 10, border: "1px solid " + T.line, background: T.card, fontSize: 14, fontFamily: "inherit", color: T.ink, outline: "none" };
  const btn = { padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit", background: T.accent, color: "#fff" };
  const seg = (active) => ({ padding: "8px 18px", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 600, background: active ? T.accent : "transparent", color: active ? "#fff" : T.muted, transition: "all .12s" });
  const pill = (active, c) => ({ padding: "7px 14px", borderRadius: 9, cursor: "pointer", fontSize: 13.5, fontWeight: 600, border: "1px solid " + (active ? (c || T.accent) : T.line), background: active ? (c || T.accent) : T.card, color: active ? "#fff" : T.muted });
  const tierColor = { store: PALETTE.store, band: PALETTE.band, base: PALETTE.base };
  const cols = "34px 2.6fr 90px 96px 128px 132px";

  const StatChip = ({ label, n, color, bg }) => (
    <div style={{ background: bg, borderRadius: 12, padding: "10px 14px", minWidth: 92 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1, fontFamily: "'Poppins',sans-serif" }}>{n}</div>
      <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1180 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "-.4px" }}>Pricing</div>
          <div style={{ fontSize: 14, color: T.muted, marginTop: 3 }}>
            {page === "prices" ? "Every tier, and exactly what each store charges — edit one item or hundreds at once." : "Bands are shared price lists. Put stores on a band and they move together."}
          </div>
        </div>
        {page === "prices" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatChip label="On base" n={stats.base} color={PALETTE.base} bg={PALETTE.baseBg} />
          <StatChip label="On band" n={stats.band} color={PALETTE.band} bg={PALETTE.bandBg} />
          <StatChip label="Store price" n={stats.store} color={PALETTE.store} bg={PALETTE.storeBg} />
          {stats.below > 0 && <StatChip label="Below cost" n={stats.below} color={PALETTE.danger} bg={PALETTE.dangerBg} />}
        </div>
        )}
      </div>

      {/* top-level sub-nav: Prices | Bands */}
      <div style={{ display: "inline-flex", background: T.card, borderRadius: 12, padding: 4, border: "1px solid " + T.line, marginBottom: 16 }}>
        <span style={{ ...seg(page === "prices"), padding: "9px 22px", fontSize: 14.5 }} onClick={() => setPage("prices")}>Prices</span>
        <span style={{ ...seg(page === "bands"), padding: "9px 22px", fontSize: 14.5 }} onClick={() => setPage("bands")}>Bands &amp; stores</span>
      </div>

      {page === "prices" && (<>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14, padding: "12px 14px", background: T.card, borderRadius: 14, border: "1px solid " + T.line }}>
        <div style={{ display: "inline-flex", background: T.bg, borderRadius: 11, padding: 4 }}>
          <span style={seg(view === "location")} onClick={() => setView("location")}>By location</span>
          <span style={seg(view === "band")} onClick={() => setView("band")}>By band</span>
        </div>
        <select value={target} onChange={(e) => { setTarget(e.target.value); setSel({}); }} style={{ ...input, fontWeight: 600, fontSize: 15, minWidth: 200 }}>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {view === "location" && storeBandId(target) && (
          <span style={{ fontSize: 13, color: PALETTE.band, background: PALETTE.bandBg, padding: "6px 12px", borderRadius: 20, fontWeight: 600 }}>band: {bandName(storeBandId(target))}</span>
        )}
        {view === "location" && !storeBandId(target) && (
          <span style={{ fontSize: 13, color: T.muted, background: T.bg, padding: "6px 12px", borderRadius: 20, fontWeight: 600 }}>no band · master prices</span>
        )}
        {view === "location" && (
          <span onClick={() => setProtectedIds((p) => ({ ...p, [target]: !p[target] }))}
            style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "6px 13px", borderRadius: 20, background: isProtected ? PALETTE.baseBg : T.bg, color: isProtected ? T.accent : T.muted, border: "1px solid " + (isProtected ? T.accent : T.line) }}>
            {isProtected ? "🔒 price-protected" : "🔓 protect prices"}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" style={{ ...input, width: 220 }} />
        <span onClick={onClose} style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: T.muted, padding: "9px 12px" }}>Close</span>
      </div>

      {selIds.length > 0 && (
        <div style={{ position: "sticky", top: 0, zIndex: 20, marginBottom: 12 }}>
          <div style={{ padding: "12px 16px", background: PALETTE.baseBg, borderRadius: 14, border: "1px solid " + T.accent, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 14 }}>
            <span style={{ fontWeight: 700, color: T.accent }}>{selIds.length} selected</span>
            <span style={{ color: T.muted }}>Apply:</span>
            {[["set", "Set £"], ["inc", "+ £"], ["pct", "+ %"], ["clear", "Clear"]].map(([k, lbl]) => (
              <span key={k} onClick={() => setOp(k)} style={pill(op === k)}>{lbl}</span>
            ))}
            {op !== "clear" && <input value={opVal} onChange={(e) => setOpVal(e.target.value)} placeholder={op === "pct" ? "e.g. 5 or -5" : "amount"} style={{ ...input, width: 120 }} />}
            {op !== "clear" && <><span style={{ color: T.muted }}>Round</span>
              <select value={round} onChange={(e) => setRound(e.target.value)} style={input}>
                <option value="">exact</option><option value="95">.95</option><option value="99">.99</option><option value="05">5p</option>
              </select></>}
            <div style={{ flex: 1 }} />
            <span onClick={() => setSel({})} style={{ cursor: "pointer", color: T.muted, fontSize: 13.5, fontWeight: 600 }}>Clear selection</span>
            <button onClick={buildPreview} disabled={busy} style={btn}>Preview →</button>
          </div>
          {view === "location" && (
            <div style={{ marginTop: 8, padding: "10px 16px", background: PALETTE.storeBg, borderRadius: 14, border: "1px solid " + PALETTE.storeLine, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13.5 }}>
              <span style={{ color: PALETTE.store, fontWeight: 700 }}>Push to stores:</span>
              {stores.map((s) => {
                const on = multiStores[s.id];
                return (
                  <span key={s.id} onClick={() => setMultiStores((m) => ({ ...m, [s.id]: !m[s.id] }))}
                    style={{ cursor: "pointer", padding: "5px 12px", borderRadius: 18, fontSize: 13, fontWeight: 600, background: on ? PALETTE.store : T.card, color: on ? "#fff" : T.muted, border: "1px solid " + (on ? PALETTE.store : T.line) }}>
                    {on ? "✓ " : ""}{s.name}
                  </span>
                );
              })}
              <span style={{ color: T.muted, fontStyle: "italic" }}>{Object.values(multiStores).some(Boolean) ? "applies to ticked stores" : "or leave blank for the current one"}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ background: T.card, borderRadius: 14, border: "1px solid " + T.line, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 0, fontSize: 11, fontWeight: 700, color: T.muted, padding: "12px 18px", textTransform: "uppercase", letterSpacing: ".5px", borderBottom: "1px solid " + T.line, background: T.bg }}>
          <span onClick={() => { const all = {}; if (selIds.length !== shownItems.length) shownItems.forEach((it) => all[it.id] = true); setSel(all); }} style={{ cursor: "pointer", fontSize: 15 }}>{selIds.length === shownItems.length && shownItems.length ? "☑" : "☐"}</span>
          <span>Item</span>
          <span style={{ textAlign: "right" }}>Base</span>
          <span style={{ textAlign: "right", color: PALETTE.band }}>Band</span>
          <span style={{ textAlign: "right", color: PALETTE.store }}>{view === "location" ? "This store" : "Band price"}</span>
          <span style={{ textAlign: "right" }}>Effective</span>
        </div>

        {grouped.map(([catId, its]) => {
          const isCollapsed = collapsed[catId];
          const catSel = its.every((it) => sel[it.id]);
          return (
            <div key={catId}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", background: "#faf8f2", borderBottom: "1px solid " + T.line, cursor: "pointer" }} onClick={() => setCollapsed((c) => ({ ...c, [catId]: !c[catId] }))}>
                <span onClick={(e) => { e.stopPropagation(); setSel((s) => { const n = { ...s }; its.forEach((it) => n[it.id] = !catSel); return n; }); }} style={{ cursor: "pointer", fontSize: 15, color: catSel ? T.accent : T.faint }}>{catSel ? "☑" : "☐"}</span>
                <span style={{ fontSize: 11, color: T.faint }}>{isCollapsed ? "▸" : "▾"}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{catName(catId)}</span>
                <span style={{ fontSize: 12, color: T.faint }}>{its.length} item{its.length === 1 ? "" : "s"}</span>
              </div>

              {!isCollapsed && its.map((it) => {
                const eff = resolve(target, it);
                const base = Number(it.price);
                const bandVal = view === "location" ? bandPriceFor(storeBandId(target), it.id) : null;
                const editVal = view === "location" ? overrideFor(target, it.id) : bandPriceFor(target, it.id);
                const cost = itemCost(it);
                const below = cost != null && eff.price < cost;
                const on = !!sel[it.id];
                return (
                  <div key={it.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 0, fontSize: 14, padding: "11px 18px", borderBottom: "1px solid " + T.line, alignItems: "center", background: on ? PALETTE.baseBg + "80" : "transparent" }}>
                    <span onClick={() => setSel((s) => ({ ...s, [it.id]: !s[it.id] }))} style={{ cursor: "pointer", color: on ? T.accent : T.faint, fontSize: 16 }}>{on ? "☑" : "☐"}</span>
                    <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                      {below && <span style={{ fontSize: 10.5, color: PALETTE.danger, background: PALETTE.dangerBg, padding: "2px 7px", borderRadius: 10, fontWeight: 700, flexShrink: 0 }}>below cost</span>}
                    </span>
                    <span style={{ textAlign: "right", color: T.faint }}>{gbp(base)}</span>
                    <span style={{ textAlign: "right", color: bandVal != null ? PALETTE.band : "#cfcabd", fontWeight: bandVal != null ? 600 : 400 }}>{view === "location" ? (bandVal != null ? gbp(bandVal) : "—") : "—"}</span>
                    <span style={{ textAlign: "right" }}>
                      <input defaultValue={editVal != null ? editVal : ""} key={target + it.id + (editVal ?? "")}
                        disabled={isProtected}
                        onBlur={(e) => { if (e.target.value !== (editVal != null ? String(editVal) : "")) setOne(it, e.target.value); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                        placeholder="set £"
                        style={{ width: 84, textAlign: "right", padding: "7px 10px", borderRadius: 8, border: "1px solid " + (editVal != null ? PALETTE.storeLine : T.line), background: editVal != null ? PALETTE.storeBg : T.card, color: editVal != null ? PALETTE.store : T.ink, fontWeight: editVal != null ? 700 : 400, fontSize: 13.5, fontFamily: "inherit", opacity: isProtected ? .5 : 1, outline: "none" }} />
                    </span>
                    <span style={{ textAlign: "right", fontWeight: 700, color: below ? PALETTE.danger : tierColor[eff.tier], fontSize: 14.5 }}>
                      {gbp(eff.price)} <span style={{ fontSize: 10, color: "#fff", fontWeight: 700, background: tierColor[eff.tier], padding: "2px 6px", borderRadius: 6, marginLeft: 2, textTransform: "uppercase", letterSpacing: ".3px" }}>{eff.tier}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
        {shownItems.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 14 }}>No items match the search.</div>}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: 12.5, color: T.muted }}>
        <span><b style={{ color: PALETTE.base }}>base</b> = default price</span>
        <span><b style={{ color: PALETTE.band }}>band</b> = shared by a store group</span>
        <span><b style={{ color: PALETTE.store }}>store</b> = this store only</span>
        <span style={{ color: T.faint }}>· the effective badge shows which tier won</span>
      </div>
      </>)}

      {/* ── BANDS & STORES PAGE ─────────────────────────────────────── */}
      {page === "bands" && (
        <div style={{ maxWidth: 900 }}>
          <div style={{ fontSize: 13.5, color: T.muted, marginBottom: 14, lineHeight: 1.6 }}>
            Each store sits on exactly one band. Tick a store under a band to move it there — it leaves its old band automatically.
          </div>

          {/* one card per band, with its member stores as tick-chips */}
          {bands.map((b) => {
            const on = storesOn(b.id);
            return (
              <div key={b.id} style={{ background: T.card, borderRadius: 14, border: "1px solid " + T.line, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ padding: "14px 18px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    {renaming === b.id ? (
                      <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)} onBlur={() => renameBand(b)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setRenaming(null); }}
                        style={{ ...input, width: 220 }} />
                    ) : (
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{b.name}</span>
                    )}
                    {isMaster(b) && <span style={{ fontSize: 10, fontWeight: 700, color: T.accent, background: PALETTE.baseBg, borderRadius: 6, padding: "2px 7px", textTransform: "uppercase", letterSpacing: ".3px" }}>default</span>}
                    <div style={{ flex: 1 }} />
                    <span onClick={() => { setPage("prices"); setView("band"); setTarget(b.id); }} style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: T.accent, padding: "4px 8px" }}>Edit prices →</span>
                    {!isMaster(b) && <span onClick={() => { setRenaming(b.id); setDraftName(b.name); }} style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: T.muted, padding: "4px 8px" }}>Rename</span>}
                    {!isMaster(b) && <span onClick={() => removeBand(b)} style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: PALETTE.danger, padding: "4px 8px" }}>Delete</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>
                    <span style={{ color: PALETTE.band, fontWeight: 600 }}>{bandItemCount(b.id)} custom prices</span>
                    {isMaster(b) && <span> · the fallback every store starts from</span>}
                    {!on.length && !isMaster(b) && <span> · no stores yet — tick one below</span>}
                  </div>
                  {/* member tick-chips */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {stores.map((s) => {
                      const here = s.price_band_id === b.id || (isMaster(b) && !s.price_band_id);
                      return (
                        <span key={s.id} onClick={() => { if (busy) return; if (here && isMaster(b)) return; assignStore(s.id, isMaster(b) ? null : b.id); }}
                          style={{ cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 10, fontSize: 13.5, fontWeight: here ? 600 : 400,
                            background: here ? (isMaster(b) ? PALETTE.baseBg : PALETTE.storeBg) : T.card,
                            color: here ? (isMaster(b) ? T.accent : PALETTE.store) : T.muted,
                            border: "1px solid " + (here ? (isMaster(b) ? "#bfe3d7" : PALETTE.storeLine) : T.line) }}>
                          <span style={{ fontSize: 15 }}>{here ? "☑" : "☐"}</span>{s.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* create new band */}
          <div style={{ background: T.card, borderRadius: 14, border: "1px dashed " + T.line, padding: "16px 18px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, color: T.accent, fontWeight: 700 }}>+</span>
            <input value={newBandName} onChange={(e) => setNewBandName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createBand(); }}
              placeholder="New band name (e.g. Dubai, Retail Park)" style={{ ...input, flex: 1, minWidth: 200 }} />
            <span style={{ fontSize: 13, color: T.muted }}>copy prices from</span>
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} style={input}>
              {bands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <button onClick={createBand} disabled={busy} style={btn}>{busy ? "Working…" : "Create band"}</button>
          </div>

          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 14, lineHeight: 1.6 }}>
            A new band copies all prices from the one you pick, so it's complete from the start — then change only the items that differ on the <b onClick={() => setPage("prices")} style={{ color: T.accent, cursor: "pointer" }}>Prices</b> tab. A store can still have its own per-item exceptions on top of its band.
          </div>
        </div>
      )}

      {(err || msg) && <div style={{ marginTop: 14, padding: "12px 16px", fontSize: 14, color: err ? PALETTE.danger : T.accent, background: err ? PALETTE.dangerBg : PALETTE.baseBg, borderRadius: 12, fontWeight: 600 }}>{err || msg}</div>}

      {preview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 80, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }} onClick={() => setPreview(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.bg, borderRadius: 16, width: "100%", maxWidth: 620, maxHeight: "82vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(0,0,0,.35)" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid " + T.line, background: T.card }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>Review {preview.rows.length} change{preview.rows.length === 1 ? "" : "s"}</div>
              <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Nothing is saved until you apply.</div>
            </div>
            <div style={{ overflow: "auto", flex: 1 }}>
              {preview.rows.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 22px", borderBottom: "1px solid " + T.line, fontSize: 14, background: T.card }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.targetName ? <span style={{ color: T.muted, fontSize: 12 }}>{r.targetName} · </span> : null}{r.item}
                  </span>
                  <span style={{ color: T.muted }}>{gbp(r.from)}</span>
                  <span style={{ color: T.faint }}>→</span>
                  <span style={{ fontWeight: 700, color: r.belowCost ? PALETTE.danger : T.ink, minWidth: 64, textAlign: "right" }}>{r.to == null ? "cleared" : gbp(r.to)}{r.belowCost ? " ⚠" : ""}</span>
                </div>
              ))}
            </div>
            {preview.rows.some((r) => r.belowCost) && (
              <div style={{ padding: "11px 22px", fontSize: 13, color: PALETTE.danger, background: PALETTE.dangerBg, fontWeight: 600 }}>⚠ Some of these prices are below item cost.</div>
            )}
            <div style={{ padding: "16px 22px", borderTop: "1px solid " + T.line, background: T.card, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setPreview(null)} style={{ ...btn, background: "transparent", color: T.muted, border: "1px solid " + T.line }}>Cancel</button>
              <button onClick={doApply} disabled={busy} style={btn}>{busy ? "Applying…" : "Apply changes"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
