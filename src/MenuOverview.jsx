/* ─────────────────────────────────────────────────────────────────────────────
   MENU OVERVIEW — the whole menu on one page, laid out the way Uber Eats does:
   collapsible category sections with an item count, and each row showing its
   thumbnail, name, the modifier groups attached to it, and the price.

   Why this exists: the admin drills down menu → section → items, which is fine
   for editing one thing but means you can never see the menu as a customer
   meets it. Checking whether prices are right, whether an item has its
   modifiers, or whether something is unpublished meant clicking through every
   section in turn.

   Prices are editable in place — click the box, type, blur. With a store
   selected it edits THAT STORE'S override (blank = inherits the master), which
   matches the existing "<Store> — Prices" modal exactly, because tills charge
   different prices at different sites and a single master price is a fiction.

   Drop this above `export default function Admin()` in Admin.jsx.
   ───────────────────────────────────────────────────────────────────────── */
function MenuOverview({ state, T, act, onEditItem, onClose }) {
  const [collapsed, setCollapsed] = React.useState({});
  const [storeId, setStoreId] = React.useState("");     // "" = master prices
  const [q, setQ] = React.useState("");
  const [draft, setDraft] = React.useState({});          // id -> in-progress text
  const [saving, setSaving] = React.useState({});

  const menus = [...(state.menus || [])].sort((a, b) => a.sort_order - b.sort_order);
  const [menuId, setMenuId] = React.useState(menus[0]?.id || null);

  const sections = (state.categories || [])
    .filter((c) => c.menu_id === menuId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const groupsFor = (itemId) => {
    const ids = (state.itemModifiers || []).filter((im) => im.item_id === itemId).map((im) => im.group_id);
    return (state.modifierGroups || []).filter((g) => ids.includes(g.id));
  };

  // A store override is {location_id, item_id, price, available} — the exact
  // shape the existing "<Store> — Prices" modal writes, so both screens agree.
  // available === false means hidden at that store; null price = inherit master.
  const overrideFor = (itemId) =>
    storeId ? (state.overrides || []).find((o) => o.item_id === itemId && o.location_id === storeId) : null;

  const money = (n) => (n == null || n === "" ? "—" : "£" + Number(n).toFixed(2));

  const savePrice = async (item) => {
    const key = item.id;
    const raw = (draft[key] ?? "").trim();
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      if (storeId) {
        // Blank clears the override so the item falls back to the master price.
        // `available` is carried through untouched so editing a price can't
        // accidentally un-hide an item that was deliberately hidden here.
        const ov = overrideFor(item.id);
        await act("set_override", {
          item_id: item.id, location_id: storeId,
          price: raw === "" ? null : parseFloat(raw),
          available: ov ? ov.available : null,
        });
      } else {
        if (raw !== "") await act("update_item", { id: item.id, price: parseFloat(raw) });
      }
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
      setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
    }
  };

  const matches = (it) => {
    if (!q.trim()) return true;
    const hay = `${it.name || ""} ${it.description || ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  };

  const rowsFor = (sectionId) =>
    (state.items || [])
      .filter((i) => i.category_id === sectionId)
      .filter(matches)
      .sort((a, b) => a.sort_order - b.sort_order);

  const totalShown = sections.reduce((n, s) => n + rowsFor(s.id).length, 0);

  const inputStyle = {
    width: 82, padding: "7px 9px", borderRadius: 8, border: "1px solid " + T.line,
    background: "#fff", fontSize: 14, textAlign: "right", fontFamily: "inherit", color: T.ink,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 60, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 24, overflow: "auto" }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: T.bg, borderRadius: 16, width: "100%", maxWidth: 1080, boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>

        {/* ── header ─────────────────────────────────────────────────────── */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid " + T.line, background: T.card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 19 }}>Menu overview</div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>
              {totalShown} item{totalShown === 1 ? "" : "s"} across {sections.length} section{sections.length === 1 ? "" : "s"}
              {storeId ? " · showing this store's prices" : " · showing master prices"}
            </div>
          </div>

          {menus.length > 1 && (
            <select value={menuId || ""} onChange={(e) => setMenuId(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.line, background: "#fff", fontSize: 13.5, fontFamily: "inherit" }}>
              {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}

          <select value={storeId} onChange={(e) => setStoreId(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.line, background: "#fff", fontSize: 13.5, fontFamily: "inherit" }}>
            <option value="">Master prices</option>
            {(state.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>

          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…"
            style={{ padding: "8px 11px", borderRadius: 8, border: "1px solid " + T.line, background: "#fff", fontSize: 13.5, width: 170, fontFamily: "inherit" }} />

          <button onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: T.muted, lineHeight: 1 }}>×</button>
        </div>

        {/* ── sections ───────────────────────────────────────────────────── */}
        <div style={{ maxHeight: "72vh", overflow: "auto" }}>
          {sections.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 14 }}>This menu has no sections yet.</div>
          )}

          {sections.map((sec) => {
            const rows = rowsFor(sec.id);
            if (q.trim() && rows.length === 0) return null;      // hide empty sections while searching
            const isOpen = !collapsed[sec.id];
            return (
              <div key={sec.id} style={{ borderBottom: "1px solid " + T.line }}>
                <div onClick={() => setCollapsed((c) => ({ ...c, [sec.id]: !c[sec.id] }))}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 22px", cursor: "pointer", background: T.card }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 15.5 }}>{sec.name}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>{rows.length} item{rows.length === 1 ? "" : "s"}</div>
                  </div>
                  <span style={{ color: T.muted, fontSize: 13, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
                </div>

                {isOpen && rows.map((it) => {
                  const ov = overrideFor(it.id);
                  const shownPrice = storeId ? (ov && ov.price != null ? ov.price : null) : it.price;
                  const hidden = storeId ? (!!ov && ov.available === false) : it.published === false;
                  const gs = groupsFor(it.id);
                  const key = it.id;
                  return (
                    <div key={it.id}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 22px", borderTop: "1px solid " + T.line, opacity: hidden ? 0.5 : 1 }}>

                      {/* thumbnail */}
                      {it.image_url
                        ? <img src={it.image_url} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                        : <div style={{ width: 52, height: 52, borderRadius: 8, background: T.line, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: T.muted }}>🍽</div>}

                      {/* name + modifier groups, exactly the Uber layout */}
                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onEditItem(it)}>
                        <div style={{ fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                          {hidden && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.muted, border: "1px solid " + T.line, borderRadius: 5, padding: "1px 5px" }}>HIDDEN</span>}
                        </div>
                        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {gs.length ? gs.map((g) => g.name).join(", ") : <span style={{ opacity: .6 }}>No modifiers</span>}
                        </div>
                      </div>

                      {/* master reference, when a store is selected */}
                      {storeId && (
                        <div style={{ fontSize: 12, color: T.muted, textAlign: "right", minWidth: 78 }}>
                          master {money(it.price)}
                        </div>
                      )}

                      {/* editable price */}
                      <input
                        value={draft[key] ?? (shownPrice == null ? "" : String(shownPrice))}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                        onBlur={() => { if (draft[key] !== undefined) savePrice(it); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setDraft((d) => { const n = { ...d }; delete n[key]; return n; }); }}
                        placeholder={storeId ? "master" : "0.00"}
                        disabled={!!saving[key]}
                        style={{ ...inputStyle, borderColor: draft[key] !== undefined ? T.accent : T.line }}
                      />

                      {/* Shown / Hidden — per store when one is selected,
                          otherwise the item's own published flag. */}
                      <span
                        onClick={() => storeId
                          ? act("set_override", { item_id: it.id, location_id: storeId, price: ov ? ov.price : null, available: hidden ? true : false })
                          : act("update_item", { id: it.id, published: hidden })}
                        style={{ fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", padding: "6px 10px", borderRadius: 8, border: "1px solid " + T.line, color: hidden ? "#b4462f" : T.accent }}>
                        {hidden ? "Hidden" : "Shown"}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 22px", borderTop: "1px solid " + T.line, background: T.card, fontSize: 12.5, color: T.muted }}>
          Click a price to edit it{storeId ? " for this store — clear the box to fall back to the master price" : ""}. Click an item name to open the full editor.
        </div>
      </div>
    </div>
  );
}
