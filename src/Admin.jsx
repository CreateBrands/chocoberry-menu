import { useState, useEffect, useMemo, useRef } from "react";

// ============================================================
// Menu Admin — MyMenu-style. Menu > Section > Item drill-down,
// card layout, drag-reorder at each level, full item editor.
// All writes go through the PIN-gated admin-api edge function.
// ============================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const T = {
  bg: "#F3F0E7", card: "#FFFFFF", ink: "#2F3326", muted: "#7E8470",
  accent: "#5E7A4D", line: "rgba(60,70,45,.14)", danger: "#B23B3B", faint: "#9AA189",
};
const money = (n) => "£" + Number(n || 0).toFixed(2);

async function callAdmin(pin, action, data) {
  const res = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    body: JSON.stringify({ pin, action, data }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || ("HTTP " + res.status));
  return j;
}

function PinGate({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!pin) return;
    setBusy(true); setErr("");
    try { const res = await callAdmin(pin, "load", {}); onUnlock(pin, res); }
    catch (e) { setErr(e.message === "unauthorized" ? "Wrong PIN." : e.message); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Hanken Grotesk',system-ui,sans-serif" }}>
      <div style={{ background: T.card, borderRadius: 18, padding: "40px 36px", width: 340, boxShadow: "0 20px 50px -20px rgba(60,70,45,.3)", textAlign: "center" }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 24, color: T.ink }}>Menu Admin</div>
        <div style={{ fontSize: 14, color: T.muted, marginTop: 6, marginBottom: 24 }}>Enter your PIN to continue</div>
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="PIN" autoFocus
          style={{ width: "100%", boxSizing: "border-box", textAlign: "center", letterSpacing: 6, fontSize: 20, padding: "14px 0", borderRadius: 12, border: "1px solid " + T.line, background: T.bg, color: T.ink, outline: "none" }} />
        {err && <div style={{ color: T.danger, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <button onClick={submit} disabled={busy} style={{ width: "100%", marginTop: 18, padding: "14px 0", borderRadius: 12, border: "none", background: T.accent, color: "#F7F4EC", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "Checking…" : "Unlock"}</button>
      </div>
    </div>
  );
}

// Drag-reorder handlers for a list of ids.
function useDragList(ids, onReorder) {
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  return (id) => ({
    draggable: true,
    onDragStart: (e) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; },
    onDragOver: (e) => { e.preventDefault(); if (id !== overId) setOverId(id); },
    onDrop: (e) => {
      e.preventDefault();
      if (dragId == null || dragId === id) { setDragId(null); setOverId(null); return; }
      const arr = [...ids];
      const from = arr.indexOf(dragId), to = arr.indexOf(id);
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      onReorder(arr);
      setDragId(null); setOverId(null);
    },
    onDragEnd: () => { setDragId(null); setOverId(null); },
    style: { opacity: dragId === id ? 0.4 : 1, outline: overId === id && dragId !== id ? "2px dashed " + T.accent : "none" },
  });
}

function Card({ img, title, subtitle, active, onToggle, onClick, onDelete, drag }) {
  return (
    <div {...drag} style={{ ...drag.style, border: "1px solid " + T.line, borderRadius: 14, overflow: "hidden", background: T.card, cursor: "pointer", position: "relative" }}>
      <div onClick={onClick} style={{ height: 74, background: img || "linear-gradient(160deg,#EAD9C4,#C99E74)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: 8 }}>
        <span style={{ cursor: "grab", width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.muted }} title="Drag to reorder">⋮⋮</span>
        {onToggle && (
          <span onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ width: 38, height: 22, borderRadius: 12, background: active ? T.accent : "#cfcabd", position: "relative" }}>
            <span style={{ position: "absolute", top: 2, left: active ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
          </span>
        )}
      </div>
      <div onClick={onClick} style={{ padding: "10px 12px 12px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {onDelete && <span onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ position: "absolute", bottom: 8, right: 10, color: T.danger, fontSize: 18, cursor: "pointer" }} title="Delete">×</span>}
    </div>
  );
}

function AddCard({ label, onClick }) {
  return <div onClick={onClick} style={{ border: "1px dashed rgba(60,70,45,.28)", borderRadius: 14, minHeight: 128, display: "flex", alignItems: "center", justifyContent: "center", color: T.faint, fontSize: 14, cursor: "pointer" }}>+ {label}</div>;
}

function ItemEditor({ pin, item, onClose, onSaved }) {
  const [f, setF] = useState({
    name: item.name || "", description: item.description || "", price: item.price ?? 0,
    allergens: (item.allergens || []).join(", "), image_url: item.image_url || "", published: item.published !== false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true); setErr("");
    try {
      await callAdmin(pin, "update_item", { id: item.id, fields: {
        name: f.name, description: f.description, price: Number(f.price),
        allergens: f.allergens.split(",").map((s) => s.trim()).filter(Boolean),
        image_url: f.image_url || null, published: f.published,
      }});
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const inp = { width: "100%", boxSizing: "border-box", fontSize: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid " + T.line, outline: "none", fontFamily: "inherit" };
  const lab = { fontSize: 13, fontWeight: 600, color: T.ink, margin: "16px 0 6px" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(30,36,20,.5)", display: "flex", justifyContent: "flex-end", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw", height: "100%", background: T.bg, overflowY: "auto", padding: "24px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20, color: T.ink }}>Edit item</div>
          <span onClick={onClose} style={{ fontSize: 22, color: T.muted, cursor: "pointer" }}>×</span>
        </div>
        <div style={lab}>Name</div>
        <input style={inp} value={f.name} onChange={(e) => set("name", e.target.value)} />
        <div style={lab}>Description</div>
        <textarea style={{ ...inp, minHeight: 90, resize: "vertical" }} value={f.description} onChange={(e) => set("description", e.target.value)} />
        <div style={lab}>Price (£)</div>
        <input style={inp} type="number" step="0.01" value={f.price} onChange={(e) => set("price", e.target.value)} />
        <div style={lab}>Allergens <span style={{ fontWeight: 400, color: T.muted }}>(comma-separated)</span></div>
        <input style={inp} value={f.allergens} onChange={(e) => set("allergens", e.target.value)} placeholder="Milk, Soya, Nuts" />
        <div style={lab}>Image URL</div>
        <input style={inp} value={f.image_url} onChange={(e) => set("image_url", e.target.value)} placeholder="https://…" />
        {f.image_url && <img src={f.image_url} alt="" style={{ marginTop: 10, maxHeight: 120, borderRadius: 10, border: "1px solid " + T.line }} onError={(e) => { e.target.style.display = "none"; }} />}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>Published</span>
          <span onClick={() => set("published", !f.published)} style={{ width: 44, height: 24, borderRadius: 13, background: f.published ? T.accent : "#cfcabd", position: "relative", cursor: "pointer" }}>
            <span style={{ position: "absolute", top: 2, left: f.published ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff" }} />
          </span>
        </div>
        {err && <div style={{ color: T.danger, fontSize: 13, marginTop: 12 }}>{err}</div>}
        <button onClick={save} disabled={busy} style={{ width: "100%", marginTop: 22, padding: "13px 0", borderRadius: 12, border: "none", background: T.accent, color: "#fff", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 15, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

export default function Admin() {
  const [pin, setPin] = useState(null);
  const [state, setState] = useState(null);
  const [level, setLevel] = useState("menus");
  const [menuId, setMenuId] = useState(null);
  const [catId, setCatId] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [msg, setMsg] = useState("");

  const apply = (res) => setState({ menus: res.menus || [], categories: res.categories || [], items: res.items || [] });
  const reload = async () => { const res = await callAdmin(pin, "load", {}); apply(res); };
  const act = async (action, data) => { setMsg(""); try { await callAdmin(pin, action, data); await reload(); } catch (e) { setMsg(e.message); } };

  const menus = state ? [...state.menus].sort((a, b) => a.sort_order - b.sort_order) : [];
  const menu = menus.find((m) => m.id === menuId);
  const sections = state ? state.categories.filter((c) => c.menu_id === menuId).sort((a, b) => a.sort_order - b.sort_order) : [];
  const section = sections.find((c) => c.id === catId);
  const items = state ? state.items.filter((i) => i.category_id === catId).sort((a, b) => a.sort_order - b.sort_order) : [];
  const itemCount = (mId) => state.items.filter((it) => state.categories.some((c) => c.menu_id === mId && c.id === it.category_id)).length;
  const secItemCount = (cId) => state.items.filter((it) => it.category_id === cId).length;

  const menuDrag = useDragList(menus.map((m) => m.id), (ids) => act("reorder", { table: "menu_menus", ids }));
  const secDrag = useDragList(sections.map((c) => c.id), (ids) => act("reorder", { table: "menu_categories", ids }));
  const itemDrag = useDragList(items.map((i) => i.id), (ids) => act("reorder", { table: "menu_items", ids }));

  if (!pin || !state) return <PinGate onUnlock={(p, res) => { setPin(p); apply(res); }} />;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Hanken Grotesk',system-ui,sans-serif", color: T.ink }}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "26px 24px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 26 }}>Menu Admin</div>
          <button onClick={() => { setPin(null); setState(null); }} style={{ fontSize: 13, fontWeight: 600, border: "1px solid " + T.line, background: T.card, color: T.muted, borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Lock</button>
        </div>

        <div style={{ fontSize: 13, color: T.faint, marginBottom: 18 }}>
          <span style={{ cursor: "pointer", color: level === "menus" ? T.accent : T.faint }} onClick={() => { setLevel("menus"); setMenuId(null); setCatId(null); }}>Menus</span>
          {menu && <> {" › "} <span style={{ cursor: "pointer", color: level === "sections" ? T.accent : T.faint }} onClick={() => { setLevel("sections"); setCatId(null); }}>{menu.name}</span></>}
          {section && level === "items" && <> {" › "} <span style={{ color: T.accent }}>{section.name}</span></>}
        </div>
        {msg && <div style={{ color: T.danger, marginBottom: 12 }}>{msg}</div>}

        {level === "menus" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
            {menus.map((m) => (
              <Card key={m.id} drag={menuDrag(m.id)} img={m.img} title={m.name} subtitle={itemCount(m.id) + " items" + (m.available_to ? " · until " + String(m.available_to).slice(0, 5) : "")}
                active={m.active} onToggle={() => act("update_menu", { id: m.id, fields: { active: !m.active } })}
                onClick={() => { setMenuId(m.id); setLevel("sections"); }}
                onDelete={() => { if (window.confirm("Delete menu '" + m.name + "'? Its sections must be empty.")) act("delete_menu", { id: m.id }); }} />
            ))}
            <AddCard label="Add menu" onClick={() => { const n = window.prompt("Menu name?"); if (n) act("create_menu", { name: n }); }} />
          </div>
        )}

        {level === "sections" && menu && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
            {sections.map((c) => (
              <Card key={c.id} drag={secDrag(c.id)} img={c.img} title={c.name} subtitle={secItemCount(c.id) + " items"}
                active={c.active} onToggle={() => act("update_category", { id: c.id, fields: { active: !c.active } })}
                onClick={() => { setCatId(c.id); setLevel("items"); }}
                onDelete={() => { if (window.confirm("Delete section '" + c.name + "'? It must have no items.")) act("delete_category", { id: c.id }); }} />
            ))}
            <AddCard label="Add section" onClick={() => { const n = window.prompt("Section name?"); if (n) act("create_category", { menu_id: menuId, name: n }); }} />
          </div>
        )}

        {level === "items" && section && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button onClick={() => { const n = window.prompt("Item name?"); if (n) act("create_item", { category_id: catId, name: n, price: 0 }); }} style={{ fontSize: 13, fontWeight: 600, border: "1px solid " + T.line, background: T.card, color: T.accent, borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>+ Add item</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((it) => {
                const d = itemDrag(it.id);
                return (
                  <div key={it.id} {...d} style={{ ...d.style, display: "flex", alignItems: "center", gap: 12, padding: 10, border: "1px solid " + T.line, borderRadius: 12, background: T.card }}>
                    <span style={{ cursor: "grab", color: T.faint, fontSize: 13 }} title="Drag to reorder">⋮⋮</span>
                    <div style={{ width: 46, height: 46, borderRadius: 8, background: it.image_url ? `center/cover url(${it.image_url})` : (it.gradient_bg || "linear-gradient(160deg,#EAD9C4,#C99E74)") }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{it.name}</div>
                      <div style={{ fontSize: 12, color: T.faint }}>{money(it.price)}{it.allergens && it.allergens.length ? " · " + it.allergens.join(", ") : ""}</div>
                    </div>
                    <span onClick={() => act("update_item", { id: it.id, fields: { available: !it.available } })} style={{ width: 38, height: 22, borderRadius: 12, background: it.available ? T.accent : "#cfcabd", position: "relative", cursor: "pointer" }}>
                      <span style={{ position: "absolute", top: 2, left: it.available ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
                    </span>
                    <span onClick={() => setEditItem(it)} style={{ color: T.accent, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>edit</span>
                    <span onClick={() => { if (window.confirm("Delete '" + it.name + "'?")) act("delete_item", { id: it.id }); }} style={{ color: T.danger, fontSize: 18, cursor: "pointer" }}>×</span>
                  </div>
                );
              })}
              {items.length === 0 && <div style={{ padding: 16, color: T.muted, fontSize: 14 }}>No items yet.</div>}
            </div>
          </div>
        )}
      </div>

      {editItem && <ItemEditor pin={pin} item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); reload(); }} />}
    </div>
  );
}
