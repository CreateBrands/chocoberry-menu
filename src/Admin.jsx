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

async function callAdmin(pin, action, body_) {
  const res = await fetch(SUPABASE_URL + "/functions/v1/admin-api", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    body: JSON.stringify({ pin, action, data: body_ }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || ("HTTP " + res.status));
  return j;
}

// Compress an image file client-side (max ~1600px, JPEG ~0.82) then return a Blob.
function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const s = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * s); height = Math.round(height * s);
      }
      const c = document.createElement("canvas");
      c.width = width; c.height = height;
      c.getContext("2d").drawImage(img, 0, 0, width, height);
      c.toBlob((b) => b ? resolve(b) : reject(new Error("compress failed")), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

// Upload a file to the public menu-images bucket, return its public URL.
async function uploadImage(file, prefix = "img") {
  const blob = await compressImage(file);
  const name = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/menu-images/${name}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "image/jpeg", "x-upsert": "true" },
    body: blob,
  });
  if (!res.ok) { const t = await res.text(); throw new Error("upload failed: " + t.slice(0, 120)); }
  return `${SUPABASE_URL}/storage/v1/object/public/menu-images/${name}`;
}

// Reusable image upload control: shows preview, upload button, drag-drop.
function ImageUpload({ value, onChange, prefix, height = 120 }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef(null);
  const handle = async (file) => {
    if (!file) return;
    setBusy(true); setErr("");
    try { const url = await uploadImage(file, prefix); onChange(url); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handle(e.dataTransfer.files?.[0]); }}
        style={{ border: "1px dashed rgba(60,70,45,.3)", borderRadius: 12, minHeight: height, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", background: value ? `center/cover url(${value})` : "#fff", position: "relative" }}
      >
        {!value && <span style={{ color: "#9AA189", fontSize: 13 }}>{busy ? "Uploading…" : "Click or drop an image"}</span>}
        {value && busy && <span style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#2F3326" }}>Uploading…</span>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handle(e.target.files?.[0])} />
      <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center" }}>
        {value && <span onClick={() => onChange("")} style={{ fontSize: 12, color: "#B23B3B", cursor: "pointer" }}>Remove</span>}
        {err && <span style={{ fontSize: 12, color: "#B23B3B" }}>{err}</span>}
      </div>
    </div>
  );
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

function Card({ img, title, subtitle, active, onToggle, onClick, onDelete, onSetImage, onRename, drag }) {
  return (
    <div {...drag} style={{ ...drag.style, border: "1px solid " + T.line, borderRadius: 14, overflow: "hidden", background: T.card, cursor: "pointer", position: "relative" }}>
      <div onClick={onClick} style={{ height: 74, background: img || "linear-gradient(160deg,#EAD9C4,#C99E74)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: 8 }}>
        <span style={{ cursor: "grab", width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.muted }} title="Drag to reorder">⋮⋮</span>
        {onSetImage && <span onClick={(e) => { e.stopPropagation(); onSetImage(); }} style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.muted, cursor: "pointer" }} title="Set image">⌾</span>}
        {onToggle && (
          <span onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ width: 38, height: 22, borderRadius: 12, background: active ? T.accent : "#cfcabd", position: "relative" }}>
            <span style={{ position: "absolute", top: 2, left: active ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
          </span>
        )}
      </div>
      <div onClick={onClick} style={{ padding: "10px 12px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{title}</span>
          {onRename && <span onClick={(e) => { e.stopPropagation(); onRename(); }} style={{ fontSize: 12, color: T.muted, cursor: "pointer" }} title="Rename">✎</span>}
        </div>
        {subtitle && <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {onDelete && <span onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ position: "absolute", bottom: 8, right: 10, color: T.danger, fontSize: 18, cursor: "pointer" }} title="Delete">×</span>}
    </div>
  );
}

function AddCard({ label, onClick }) {
  return <div onClick={onClick} style={{ border: "1px dashed rgba(60,70,45,.28)", borderRadius: 14, minHeight: 128, display: "flex", alignItems: "center", justifyContent: "center", color: T.faint, fontSize: 14, cursor: "pointer" }}>+ {label}</div>;
}


// ============ WELCOME PAGE BUILDER (free-drag canvas) ============
const CANVAS_W = 390, CANVAS_H = 844;
const ELEMENT_TYPES = [
  { type: "logo", label: "Logo", defaults: { text: "still<span style='color:#5E7A4D'>.</span>", size: 100, color: "#2F3326", align: "center", w: 300 } },
  { type: "heading", label: "Heading", defaults: { text: "Heading", size: 34, color: "#2F3326", align: "center", w: 300 } },
  { type: "subtitle", label: "Subtitle", defaults: { text: "Your subtitle here", size: 18, color: "#7E8470", align: "center", w: 300 } },
  { type: "button", label: "Button", defaults: { text: "Order Ahead", size: 18, color: "#5E7A4D", textColor: "#F7F4EC", w: 200 } },
  { type: "image", label: "Image", defaults: { url: "", w: 200, h: 200, radius: 12 } },
  { type: "spacer", label: "Spacer", defaults: { w: 100, h: 40 } },
  { type: "divider", label: "Divider", defaults: { w: 80, size: 2, color: "#5E7A4D" } },
];

function WelcomeBuilder({ pin, initial, onClose, onSaved }) {
  const [els, setEls] = useState(initial && initial.length ? initial : []);
  const [selId, setSelId] = useState(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const drag = useRef(null);
  const sel = els.find((e) => e.id === selId) || null;

  const addEl = (t) => {
    const def = ELEMENT_TYPES.find((x) => x.type === t);
    const el = { id: "el_" + Date.now() + "_" + Math.floor(Math.random() * 999), type: t, x: 60, y: 120, visible: true, ...def.defaults };
    setEls((p) => [...p, el]);
    setSelId(el.id);
  };
  const update = (id, patch) => setEls((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id) => { setEls((p) => p.filter((e) => e.id !== id)); setSelId(null); };

  const onDown = (e, el) => {
    e.stopPropagation();
    setSelId(el.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = CANVAS_W / rect.width;
    drag.current = { id: el.id, startX: e.clientX, startY: e.clientY, ox: el.x, oy: el.y, scale };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const d = drag.current;
    const nx = Math.round(d.ox + (e.clientX - d.startX) * d.scale);
    const ny = Math.round(d.oy + (e.clientY - d.startY) * d.scale);
    update(d.id, { x: nx, y: ny });
  };
  const onUp = () => { drag.current = null; };

  const save = async () => {
    setBusy(true);
    try { await callAdmin(pin, "set_setting", { key: "welcome_layout", value: JSON.stringify(els) }); onSaved(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const renderEl = (el) => {
    const on = el.id === selId;
    const base = { position: "absolute", left: el.x, top: el.y, width: el.w || "auto", cursor: "move", outline: on ? "2px solid #5E7A4D" : (el.visible === false ? "1px dashed #ccc" : "none"), outlineOffset: 2, opacity: el.visible === false ? .4 : 1, userSelect: "none" };
    let inner;
    if (el.type === "logo" || el.type === "heading" || el.type === "subtitle")
      inner = <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: el.size, color: el.color, textAlign: el.align, fontWeight: el.type === "subtitle" ? 400 : 600, lineHeight: el.type === "logo" ? .9 : 1.3 }} dangerouslySetInnerHTML={{ __html: el.text }} />;
    else if (el.type === "button") inner = <div style={{ background: el.color, color: el.textColor, padding: "16px 0", borderRadius: 40, textAlign: "center", fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: el.size }}>{el.text}</div>;
    else if (el.type === "image") inner = el.url ? <img src={el.url} alt="" style={{ width: el.w, height: el.h, objectFit: "cover", borderRadius: el.radius, display: "block" }} /> : <div style={{ width: el.w, height: el.h, background: "#eee", borderRadius: el.radius, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#999" }}>Image</div>;
    else if (el.type === "divider") inner = <div style={{ width: el.w, height: el.size, background: el.color }} />;
    else if (el.type === "spacer") inner = <div style={{ width: el.w, height: el.h, border: "1px dashed #ccc" }} />;
    return <div key={el.id} style={base} onMouseDown={(e) => onDown(e, el)}>{inner}</div>;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,14,.55)", zIndex: 60, display: "flex" }} onMouseMove={onMove} onMouseUp={onUp}>
      <div style={{ width: 150, background: "#fff", padding: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Elements</div>
        {ELEMENT_TYPES.map((t) => (
          <div key={t.type} onClick={() => addEl(t.type)} style={{ padding: "10px 12px", border: "1px solid #E8DCC6", borderRadius: 8, marginBottom: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#3A2E26" }}>+ {t.label}</div>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }}>
        <div ref={canvasRef} onMouseDown={() => setSelId(null)} style={{ position: "relative", width: CANVAS_W, height: CANVAS_H, background: "#E1E8D2", border: "10px solid #222", borderRadius: 34, overflow: "hidden", flexShrink: 0 }}>
          {els.map(renderEl)}
        </div>
      </div>

      <div style={{ width: 240, background: "#fff", padding: 16, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Welcome builder</div>
          <span onClick={onClose} style={{ fontSize: 22, color: "#999", cursor: "pointer" }}>×</span>
        </div>
        {!sel && <div style={{ fontSize: 13, color: "#999" }}>Add an element from the left, or click one on the canvas to edit it.</div>}
        {sel && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7E8470", textTransform: "uppercase" }}>{sel.type}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13 }}>Visible</span>
              <span onClick={() => update(sel.id, { visible: !(sel.visible !== false) })} style={{ width: 40, height: 22, borderRadius: 11, background: sel.visible !== false ? "#5E7A4D" : "#ccc", position: "relative", cursor: "pointer" }}><span style={{ position: "absolute", top: 2, left: sel.visible !== false ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} /></span>
            </div>
            {(sel.type === "logo" || sel.type === "heading" || sel.type === "subtitle" || sel.type === "button") && (
              <div><div style={lbl}>Text</div><textarea value={sel.text || ""} onChange={(e) => update(sel.id, { text: e.target.value })} style={{ ...inp2, minHeight: 54 }} /></div>
            )}
            {sel.type === "image" && (<div><div style={lbl}>Image</div><ImageUpload value={sel.url || ""} prefix="branding" height={90} onChange={(url) => update(sel.id, { url })} /></div>)}
            {(sel.type === "logo" || sel.type === "heading" || sel.type === "subtitle" || sel.type === "button" || sel.type === "divider") && (
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}><div style={lbl}>Size</div><input type="number" value={sel.size || 0} onChange={(e) => update(sel.id, { size: parseInt(e.target.value) || 0 })} style={inp2} /></div>
                <div style={{ flex: 1 }}><div style={lbl}>Color</div><input type="color" value={sel.color || "#000000"} onChange={(e) => update(sel.id, { color: e.target.value })} style={{ ...inp2, padding: 2, height: 38 }} /></div>
              </div>
            )}
            {sel.type === "button" && (<div><div style={lbl}>Text color</div><input type="color" value={sel.textColor || "#ffffff"} onChange={(e) => update(sel.id, { textColor: e.target.value })} style={{ ...inp2, padding: 2, height: 38 }} /></div>)}
            {(sel.type === "logo" || sel.type === "heading" || sel.type === "subtitle") && (
              <div><div style={lbl}>Align</div>
                <select value={sel.align || "center"} onChange={(e) => update(sel.id, { align: e.target.value })} style={inp2}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><div style={lbl}>X</div><input type="number" value={sel.x || 0} onChange={(e) => update(sel.id, { x: parseInt(e.target.value) || 0 })} style={inp2} /></div>
              <div style={{ flex: 1 }}><div style={lbl}>Y</div><input type="number" value={sel.y || 0} onChange={(e) => update(sel.id, { y: parseInt(e.target.value) || 0 })} style={inp2} /></div>
              <div style={{ flex: 1 }}><div style={lbl}>W</div><input type="number" value={sel.w || 0} onChange={(e) => update(sel.id, { w: parseInt(e.target.value) || 0 })} style={inp2} /></div>
            </div>
            <div onClick={() => remove(sel.id)} style={{ color: "#B23B3B", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>🗑 Delete element</div>
          </div>
        )}
        <div style={{ marginTop: "auto", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={save} disabled={busy} style={{ background: "#5E7A4D", color: "#fff", border: "none", borderRadius: 10, padding: "13px 0", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "Saving…" : "Save page"}</button>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #E8DCC6", borderRadius: 10, padding: "11px 0", fontSize: 14, cursor: "pointer", color: "#7E8470" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
const lbl = { fontSize: 11, fontWeight: 700, color: "#7E8470", marginBottom: 4, textTransform: "uppercase" };
const inp2 = { width: "100%", boxSizing: "border-box", border: "1px solid #E8DCC6", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" };


function ItemEditor({ pin, item, groups = [], itemGroupIds = [], onClose, onSaved }) {
  const [modIds, setModIds] = useState(itemGroupIds);
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
      await callAdmin(pin, "set_item_mod_groups", { item_id: item.id, group_ids: modIds });
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
        <div style={lab}>Image</div>
        <ImageUpload value={f.image_url} onChange={(v) => set("image_url", v)} prefix="items" />
        {groups.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: T.muted, marginBottom: 8 }}>MODIFIER GROUPS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {modIds.map((id) => {
                const g = groups.find((x) => x.id === id);
                if (!g) return null;
                return (
                  <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.accent, color: "#fff", borderRadius: 16, padding: "5px 10px 5px 12px", fontSize: 13, fontWeight: 600 }}>
                    {g.name}
                    <span onClick={() => setModIds(modIds.filter((x) => x !== id))} style={{ cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</span>
                  </span>
                );
              })}
              {modIds.length === 0 && <span style={{ fontSize: 13, color: T.muted, padding: "5px 0" }}>None assigned</span>}
            </div>
            <select value="" onChange={(e) => { if (e.target.value) setModIds([...modIds, e.target.value]); }}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid " + T.line, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: T.ink, background: T.card, cursor: "pointer" }}>
              <option value="">+ Add a modifier group…</option>
              {groups.filter((g) => !modIds.includes(g.id)).map((g) => (
                <option key={g.id} value={g.id}>{g.name}{g.required ? " (required)" : ""}</option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Tick the groups that apply to this item. Manage groups & options in the Modifiers panel.</div>
          </div>
        )}
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
  const [imgTarget, setImgTarget] = useState(null); // {kind:"menu"|"section", id}
  const [showAppearance, setShowAppearance] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderInit, setBuilderInit] = useState([]);
  const [showHero, setShowHero] = useState(false);
  const [heroDraft, setHeroDraft] = useState([]);
  const [showMods, setShowMods] = useState(false);
  const [nav, setNav] = useState("menus");
  const [showStores, setShowStores] = useState(false);
  const [storeView, setStoreView] = useState(null); // store id for price editor
  const [modOpen, setModOpen] = useState({});
  const [modEdit, setModEdit] = useState(null);
  const [msg, setMsg] = useState("");

  const apply = (res) => setState({ menus: res.menus || [], categories: res.categories || [], items: res.items || [], settings: res.settings || [], modifierGroups: res.modifierGroups || [], modifierOptions: res.modifierOptions || [], itemModifiers: res.itemModifiers || [], locations: res.locations || [], overrides: res.overrides || [], tables: res.tables || [], locationMenus: res.locationMenus || [] });
  const reload = async () => { const res = await callAdmin(pin, "load", {}); apply(res); };
  const act = async (action, body_) => { setMsg(""); try { await callAdmin(pin, action, body_); await reload(); } catch (e) { setMsg(e.message); } };
  const getSetting = (k) => { const row = (state && state.settings || []).find((s) => s.key === k); return row ? row.value : ""; };


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
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Hanken Grotesk',system-ui,sans-serif", color: T.ink, display: "flex" }}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* SIDEBAR */}
      <div style={{ width: 210, flexShrink: 0, background: T.card, borderRight: "1px solid " + T.line, padding: "22px 14px", minHeight: "100vh", boxSizing: "border-box" }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, padding: "0 10px 20px" }}>Menu Admin</div>
        {[
          ["menus", "Menus", "🍽"],
          ["modifiers", "Modifiers", "⚙"],
          ["appearance", "Appearance", "🎨"],
          ["welcome", "Welcome", "🏠"],
          ["hero", "Hero", "🖼"],
          ["stores", "Stores", "🏪"],
          ["settings", "Settings", "⚙"],
        ].map(([key, label, icon]) => {
          const active = nav === key;
          return (
            <div key={key} onClick={() => {
              setNav(key);
              if (key === "menus") { setLevel("menus"); setMenuId(null); setCatId(null); }
              if (key === "modifiers") setShowMods(true);
              if (key === "appearance") setShowAppearance(true);
              if (key === "welcome") {
                let init = [];
                try { const v = getSetting("welcome_layout"); if (v) init = (typeof v === "string" ? JSON.parse(v) : v); } catch { init = []; }
                if (!init || init.length === 0) {
                  // Seed from the current default Welcome content so existing elements are editable/removable.
                  const logoUrl = getSetting("welcome_logo_url");
                  init = [
                    { id: "seed_eyebrow", type: "subtitle", x: 45, y: 240, w: 300, visible: true, text: (getSetting("welcome_eyebrow") || "Matcha · Coffee").toUpperCase(), size: 15, color: "#5E7A4D", align: "center" },
                    logoUrl
                      ? { id: "seed_logo", type: "logo", x: 95, y: 290, w: 200, visible: true, url: logoUrl }
                      : { id: "seed_logo", type: "logo", x: 45, y: 290, w: 300, visible: true, text: (getSetting("welcome_logo_text") || "still<span style='color:#5E7A4D'>.</span>"), size: 100, color: "#2F3326", align: "center" },
                    { id: "seed_sub", type: "subtitle", x: 45, y: 440, w: 300, visible: true, text: (getSetting("welcome_subtitle") || "Your daily ritual, gently elevated.<br />Calm energy in a cup."), size: 18, color: "#7E8470", align: "center" },
                    { id: "seed_btn", type: "button", x: 95, y: 660, w: 200, visible: true, text: (getSetting("welcome_button") || "Order Ahead"), size: 18, color: "#5E7A4D", textColor: "#F7F4EC" },
                    { id: "seed_footer", type: "subtitle", x: 45, y: 740, w: 300, visible: true, text: (getSetting("welcome_footer") || "PICKUP AT COUNTER · TAP TO BEGIN"), size: 13, color: "#7E8470", align: "center" },
                  ];
                }
                setBuilderInit(init);
                setShowBuilder(true);
              }
              if (key === "hero") { try { const v = getSetting("hero_slides"); setHeroDraft(v ? (typeof v === "string" ? JSON.parse(v) : v) : []); } catch { setHeroDraft([]); } setShowHero(true); }
              if (key === "stores") setShowStores(true);
              if (key === "settings") setShowAppearance(true);
            }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, marginBottom: 2, cursor: "pointer", fontSize: 14, fontWeight: active ? 700 : 500, background: active ? T.accentSoft || "#EFEAD9" : "transparent", color: active ? T.accent : T.muted }}>
              <span style={{ fontSize: 15 }}>{icon}</span>{label}
            </div>
          );
        })}
        <div onClick={() => { setPin(null); setState(null); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, marginTop: 12, cursor: "pointer", fontSize: 14, fontWeight: 500, color: T.muted, borderTop: "1px solid " + T.line }}>🔒 Lock</div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, minWidth: 0, padding: "26px 28px 60px", overflowY: "auto", maxHeight: "100vh", boxSizing: "border-box" }}>
        <div style={{ fontSize: 13, color: T.faint, marginBottom: 18 }}>
          <span style={{ cursor: "pointer", color: level === "menus" ? T.accent : T.faint }} onClick={() => { setLevel("menus"); setMenuId(null); setCatId(null); }}>Menus</span>
          {menu && <> {" › "} <span style={{ cursor: "pointer", color: level === "sections" ? T.accent : T.faint }} onClick={() => { setLevel("sections"); setCatId(null); }}>{menu.name}</span></>}
          {section && level === "items" && <> {" › "} <span style={{ color: T.accent }}>{section.name}</span></>}
        </div>
        {msg && <div style={{ color: T.danger, marginBottom: 12 }}>{msg}</div>}

        {level === "menus" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
            {menus.map((m) => (
              <Card key={m.id} drag={menuDrag(m.id)} img={m.img} title={m.name} subtitle={itemCount(m.id) + " items"}
                active={m.active} onToggle={() => act("update_menu", { id: m.id, fields: { active: !m.active } })}
                onClick={() => { setMenuId(m.id); setLevel("sections"); }}
                onRename={() => { const n = window.prompt("Rename menu", m.name); if (n && n !== m.name) act("update_menu", { id: m.id, fields: { name: n } }); }}
                onSetImage={() => setImgTarget({ kind: "menu", id: m.id })}
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
                onRename={() => { const n = window.prompt("Rename section", c.name); if (n && n !== c.name) act("update_category", { id: c.id, fields: { name: n } }); }}
                onSetImage={() => setImgTarget({ kind: "section", id: c.id })}
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

      {/* LIVE PREVIEW */}
      <div style={{ width: 430, flexShrink: 0, borderLeft: "1px solid " + T.line, background: T.card, padding: "22px 20px", boxSizing: "border-box", height: "100vh", position: "sticky", top: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.muted, marginBottom: 14, alignSelf: "flex-start" }}>Live preview</div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
          <div style={{ position: "relative", width: 390 * 0.95, height: 844 * 0.95, border: "11px solid #1c1c1c", borderRadius: 44, overflow: "hidden", background: "#000", boxShadow: "0 20px 50px -18px rgba(0,0,0,.4)" }}>
            <iframe title="preview" src="/" style={{ width: 390, height: 844, border: "none", background: "#fff", transform: "scale(0.95)", transformOrigin: "top left" }} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: T.faint, marginTop: 10, textAlign: "center" }}>Live customer view. Refresh after edits.</div>
      </div>

      {editItem && <ItemEditor pin={pin} item={editItem} groups={state.modifierGroups || []} itemGroupIds={(state.itemModifiers || []).filter((im) => im.item_id === editItem.id).map((im) => im.group_id)} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); reload(); }} />}
      {showAppearance && (
        <div onClick={() => setShowAppearance(false)} style={{ position: "fixed", inset: 0, background: "rgba(30,36,20,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "92vw", background: T.bg, borderRadius: 16, padding: 24, maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>Appearance</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", border: "1px solid " + T.line, borderRadius: 10, marginBottom: 18, background: T.card }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Accept customer orders</div>
                <div style={{ fontSize: 12, color: T.muted }}>{(getSetting("ordering_enabled") === "off") ? "Off — customers are told to order with staff" : "On — customers can place orders"}</div>
              </div>
              <span onClick={() => act("set_setting", { key: "ordering_enabled", value: getSetting("ordering_enabled") === "off" ? "on" : "off" })} style={{ width: 46, height: 26, borderRadius: 13, background: getSetting("ordering_enabled") === "off" ? "#cfcabd" : T.accent, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                <span style={{ position: "absolute", top: 3, left: getSetting("ordering_enabled") === "off" ? 3 : 23, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
              </span>
            </div>
            <div style={{ fontSize: 13, color: T.muted, margin: "8px 0 16px" }}>Choose the customer app theme.</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
              {[["still","still. (green)","#5E7A4D"],["chocoberry","Chocoberry (brown)","#844429"]].map(([key,label,col]) => {
                const active = (getSetting("theme") || "still") === key;
                return (
                  <div key={key} onClick={async () => { await act("set_setting", { key: "theme", value: key }); }}
                    style={{ flex: 1, cursor: "pointer", borderRadius: 12, padding: "14px 12px", textAlign: "center", border: active ? "2px solid " + col : "1px solid " + T.line, background: active ? col + "14" : "#fff" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: col, margin: "0 auto 8px" }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{label}</div>
                    {active && <div style={{ fontSize: 11, color: col, marginTop: 3, fontWeight: 600 }}>Active</div>}
                  </div>
                );
              })}
            </div>
              <span onClick={() => setShowAppearance(false)} style={{ fontSize: 22, color: T.muted, cursor: "pointer" }}>×</span>
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>Background images for the welcome screen and menu picker.</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Welcome background</div>
            <ImageUpload value={getSetting("welcome_bg_url")} prefix="backgrounds" onChange={async (url) => { await act("set_setting", { key: "welcome_bg_url", value: url }); }} height={140} />
            <div style={{ fontSize: 14, fontWeight: 600, margin: "18px 0 6px" }}>Menu picker background</div>
            <ImageUpload value={getSetting("picker_bg_url")} prefix="backgrounds" onChange={async (url) => { await act("set_setting", { key: "picker_bg_url", value: url }); }} height={140} />
          </div>
        </div>
      )}
      {showWelcome && (
        <div onClick={() => setShowWelcome(false)} style={{ position: "fixed", inset: 0, background: "rgba(30,36,20,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "92vw", background: T.bg, borderRadius: 16, padding: 24, maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>Welcome Page</div>
              <span onClick={() => setShowWelcome(false)} style={{ fontSize: 22, color: T.muted, cursor: "pointer" }}>×</span>
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 18 }}>Customise the first screen guests see. Leave a field blank to use the default.</div>

            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: T.muted, marginBottom: 8 }}>LOGO IMAGE</div>
            <ImageUpload value={getSetting("welcome_logo_url")} prefix="branding" onChange={async (url) => { await act("set_setting", { key: "welcome_logo_url", value: url }); }} height={120} />
            <div style={{ fontSize: 12, color: T.muted, margin: "6px 0 18px" }}>Upload a logo, or leave blank to use the text logo below.</div>

            {[
              ["welcome_logo_text", "Text logo (if no image)", "still<span style='color:var(--accent)'>.</span>"],
              ["welcome_eyebrow", "Eyebrow (small text above logo)", "Matcha · Coffee"],
              ["welcome_subtitle", "Subtitle", "Your daily ritual, gently elevated.<br />Calm energy in a cup."],
              ["welcome_button", "Order button text", "Order Ahead"],
              ["welcome_footer", "Footer line", "Pickup at counter · Tap to begin"],
            ].map(([key, label, ph]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: T.muted, marginBottom: 6 }}>{label.toUpperCase()}</div>
                <input defaultValue={getSetting(key)} placeholder={ph}
                  onBlur={async (e) => { await act("set_setting", { key, value: e.target.value }); }}
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid " + T.line, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: T.ink, background: T.card }} />
              </div>
            ))}
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Tip: subtitle and text logo accept simple HTML (e.g. &lt;br /&gt; for a line break). Changes save when you click out of a field.</div>
          </div>
        </div>
      )}
      {showHero && (
        <div onClick={() => setShowHero(false)} style={{ position: "fixed", inset: 0, background: "rgba(30,36,20,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "94vw", background: T.bg, borderRadius: 16, padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>Hero Slides</div>
              <span onClick={() => setShowHero(false)} style={{ fontSize: 22, color: T.muted, cursor: "pointer" }}>×</span>
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>The rotating banner at the top of the menu. Upload a photo for each slide; add or remove slides as needed.</div>

            {heroDraft.map((sl, idx) => (
              <div key={idx} style={{ border: "1px solid " + T.line, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>Slide {idx + 1}</div>
                  <span onClick={() => setHeroDraft(heroDraft.filter((_, i) => i !== idx))} style={{ fontSize: 13, color: "#b4462f", fontWeight: 600, cursor: "pointer" }}>Delete</span>
                </div>
                <ImageUpload value={sl.image_url || ""} prefix="hero" height={120} onChange={(url) => setHeroDraft(heroDraft.map((x, i) => i === idx ? { ...x, image_url: url } : x))} />
                {[["tag", "Tag (small pill)", "NEW THIS WEEK"], ["title", "Title", "Blueberry Marble Matcha"], ["sub", "Subtitle", "Fresh. Layered. Unexpected."]].map(([k, label, ph]) => (
                  <div key={k} style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: T.muted, marginBottom: 4 }}>{label.toUpperCase()}</div>
                    <input value={sl[k] || ""} placeholder={ph} onChange={(e) => setHeroDraft(heroDraft.map((x, i) => i === idx ? { ...x, [k]: e.target.value } : x))}
                      style={{ width: "100%", boxSizing: "border-box", border: "1px solid " + T.line, borderRadius: 8, padding: "9px 11px", fontSize: 14, color: T.ink, background: T.card }} />
                  </div>
                ))}
              </div>
            ))}

            <button onClick={() => setHeroDraft([...heroDraft, { image_url: "", tag: "", title: "", sub: "" }])} style={{ width: "100%", border: "1px dashed " + T.line, background: "transparent", color: T.muted, borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>+ Add slide</button>

            <button onClick={async () => { await act("set_setting", { key: "hero_slides", value: JSON.stringify(heroDraft) }); setShowHero(false); }} style={{ width: "100%", border: "none", background: T.accent || "#5E7A4D", color: "#fff", borderRadius: 10, padding: "13px 0", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Save slides</button>
          </div>
        </div>
      )}
      {showMods && (
        <div onClick={() => setShowMods(false)} style={{ position: "fixed", inset: 0, background: "rgba(30,36,20,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: "94vw", background: T.bg, borderRadius: 16, padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>Modifier groups</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={async () => { await act("create_mod_group", { name: "New group", required: false, min_select: 0, max_select: 1 }); }} style={{ background: T.accent || "#5E7A4D", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add modifier group</button>
                <span onClick={() => setShowMods(false)} style={{ fontSize: 22, color: T.muted, cursor: "pointer" }}>×</span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>Define option groups (e.g. Size, Milk, Extras). Assign them to items from each item's editor.</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(state.modifierGroups || []).map((g) => {
                const opts = (state.modifierOptions || []).filter((o) => o.group_id === g.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                const open = !!modOpen[g.id];
                const hint = g.required ? `Required · pick ${g.min_select || 1}` : `Optional · up to ${g.max_select || 1}`;
                return (
                  <div key={g.id} style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                      <span onClick={() => setModOpen((p) => ({ ...p, [g.id]: !open }))} style={{ cursor: "pointer", fontSize: 15, color: T.muted, transform: open ? "rotate(90deg)" : "none", transition: "transform .2s" }}>▶</span>
                      <div onClick={() => setModOpen((p) => ({ ...p, [g.id]: !open }))} style={{ flex: 1, cursor: "pointer" }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{g.name}</span>
                        <span style={{ fontSize: 13, color: T.muted, marginLeft: 10 }}>{hint} · {opts.length} option{opts.length === 1 ? "" : "s"}</span>
                      </div>
                      <button onClick={() => setModEdit(modEdit === g.id ? null : g.id)} title="Edit settings" style={{ width: 38, height: 38, border: "1px solid " + T.line, borderRadius: 8, background: T.bg, cursor: "pointer", color: T.ink }}>✎</button>
                      <button onClick={async () => { if (confirm("Delete group '" + g.name + "'? Removes it from all items.")) { await act("delete_mod_group", { id: g.id }); } }} title="Delete" style={{ width: 38, height: 38, border: "1px solid " + T.line, borderRadius: 8, background: T.bg, cursor: "pointer", color: "#b4462f" }}>🗑</button>
                    </div>

                    {modEdit === g.id && (
                      <div style={{ padding: "0 16px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid " + T.line, paddingTop: 12 }}>
                        <input defaultValue={g.name} onBlur={async (e) => { if (e.target.value !== g.name) await act("update_mod_group", { id: g.id, name: e.target.value, required: g.required, min_select: g.min_select, max_select: g.max_select }); }} style={{ fontWeight: 600, fontSize: 14, border: "1px solid " + T.line, borderRadius: 6, padding: "7px 9px", background: T.bg, color: T.ink, width: 160 }} />
                        <label style={{ fontSize: 13, color: T.muted, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}><input type="checkbox" checked={!!g.required} onChange={async (e) => { await act("update_mod_group", { id: g.id, name: g.name, required: e.target.checked, min_select: e.target.checked ? 1 : 0, max_select: g.max_select }); }} /> Required</label>
                        <label style={{ fontSize: 13, color: T.muted, display: "flex", alignItems: "center", gap: 5 }}>Max <input type="number" min="1" defaultValue={g.max_select ?? 1} onBlur={async (e) => { const v = parseInt(e.target.value) || 1; if (v !== g.max_select) await act("update_mod_group", { id: g.id, name: g.name, required: g.required, min_select: g.min_select, max_select: v }); }} style={{ width: 50, border: "1px solid " + T.line, borderRadius: 6, padding: "6px", background: T.bg, color: T.ink }} /></label>
                      </div>
                    )}

                    {open && (
                      <div style={{ borderTop: "1px solid " + T.line, padding: "12px 16px 16px", background: T.bg }}>
                        {opts.map((o) => (
                          <div key={o.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                            <input defaultValue={o.name} onBlur={async (e) => { if (e.target.value !== o.name) await act("update_mod_option", { id: o.id, name: e.target.value, price_delta: o.price_delta, sort_order: o.sort_order }); }} style={{ flex: 1, border: "1px solid " + T.line, borderRadius: 8, padding: "8px 10px", fontSize: 14, background: T.card, color: T.ink }} />
                            <input defaultValue={o.price_delta} type="number" step="0.05" onBlur={async (e) => { const v = parseFloat(e.target.value) || 0; if (v !== Number(o.price_delta)) await act("update_mod_option", { id: o.id, name: o.name, price_delta: v, sort_order: o.sort_order }); }} style={{ width: 90, border: "1px solid " + T.line, borderRadius: 8, padding: "8px 10px", fontSize: 14, background: T.card, color: T.ink }} placeholder="+0.00" />
                            <span onClick={async () => { await act("delete_mod_option", { id: o.id }); }} style={{ fontSize: 18, color: T.muted, cursor: "pointer", padding: "0 4px" }}>×</span>
                          </div>
                        ))}
                        <button onClick={async () => { await act("create_mod_option", { group_id: g.id, name: "New option", price_delta: 0, sort_order: opts.length }); }} style={{ fontSize: 13, color: T.accent || "#5E7A4D", background: "none", border: "none", cursor: "pointer", fontWeight: 600, marginTop: 4 }}>+ Add option</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {(state.modifierGroups || []).length === 0 && <div style={{ fontSize: 14, color: T.muted, textAlign: "center", padding: "20px 0" }}>No modifier groups yet. Click "+ Add modifier group" to create one.</div>}
            </div>
          </div>
        </div>
      )}
      {showBuilder && <WelcomeBuilder pin={pin} initial={builderInit} onClose={() => setShowBuilder(false)} onSaved={() => { setShowBuilder(false); reload(); }} />}
      {showStores && !storeView && (
        <div onClick={() => setShowStores(false)} style={{ position: "fixed", inset: 0, background: "rgba(30,36,20,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: "94vw", background: T.bg, borderRadius: 16, padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>Stores</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={async () => { const n = window.prompt("Store name?"); if (n) await act("create_store", { name: n }); }} style={{ background: T.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add store</button>
                <span onClick={() => setShowStores(false)} style={{ fontSize: 22, color: T.muted, cursor: "pointer" }}>×</span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>Each store has its own tablet link and its own prices. Configure a tablet once with its link and it remembers the store.</div>

            {(state.locations || []).map((loc) => {
              const tokens = (state.tables || []).filter((t) => t.location_id === loc.id);
              const ovCount = (state.overrides || []).filter((o) => o.location_id === loc.id).length;
              return (
                <div key={loc.id} style={{ border: "1px solid " + T.line, borderRadius: 12, padding: 14, marginBottom: 12, background: T.card }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{loc.name}</span>
                      <span onClick={() => act("update_store", { id: loc.id, active: !loc.active })} style={{ fontSize: 11, fontWeight: 600, color: loc.active ? T.accent : T.muted, cursor: "pointer", border: "1px solid " + T.line, borderRadius: 10, padding: "2px 8px" }}>{loc.active ? "Active" : "Inactive"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span onClick={() => { setStoreView(loc.id); }} style={{ fontSize: 13, color: T.accent, fontWeight: 600, cursor: "pointer" }}>Prices ({ovCount})</span>
                      <span onClick={() => { const n = window.prompt("Rename store", loc.name); if (n && n !== loc.name) act("update_store", { id: loc.id, name: n }); }} style={{ fontSize: 13, color: T.muted, cursor: "pointer" }}>✎</span>
                      <span onClick={() => { if (window.confirm("Delete store '" + loc.name + "'? Removes its tablets and price overrides.")) act("delete_store", { id: loc.id }); }} style={{ fontSize: 13, color: "#b4462f", cursor: "pointer" }}>🗑</span>
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid " + T.line, paddingTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6 }}>TABLET LINKS</div>
                    {tokens.map((tk) => {
                      const url = window.location.origin + "/?store=" + tk.qr_token;
                      const qr = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=" + encodeURIComponent(url);
                      return (
                        <div key={tk.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, padding: 8, border: "1px solid " + T.line, borderRadius: 10, background: T.bg }}>
                          <img src={qr} alt="QR" width={72} height={72} style={{ borderRadius: 6, background: "#fff", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 4 }}>{tk.label || "Tablet"}</div>
                            <input readOnly value={url} onClick={(e) => e.target.select()} style={{ width: "100%", boxSizing: "border-box", border: "1px solid " + T.line, borderRadius: 6, padding: "6px 8px", fontSize: 11, background: T.card, color: T.ink }} />
                            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                              <span onClick={() => { navigator.clipboard?.writeText(url); }} style={{ fontSize: 12, color: T.accent, fontWeight: 600, cursor: "pointer" }}>Copy link</span>
                              <a href={qr.replace("220x220", "600x600")} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: T.accent, fontWeight: 600, textDecoration: "none" }}>Open QR</a>
                              <span onClick={() => act("delete_token", { id: tk.id })} style={{ fontSize: 12, color: "#b4462f", fontWeight: 600, cursor: "pointer" }}>Delete</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={() => act("create_token", { location_id: loc.id, label: "Tablet " + (tokens.length + 1) })} style={{ fontSize: 13, color: T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600, marginTop: 2 }}>+ New tablet link</button>
                  </div>
                  <div style={{ borderTop: "1px solid " + T.line, paddingTop: 10, marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6 }}>MENUS SHOWN AT THIS STORE</div>
                    <div style={{ fontSize: 11, color: T.faint, marginBottom: 8 }}>Leave all unticked to show every menu (default). Tick specific menus to limit this store to only those.</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(state.menus || []).map((mn) => {
                        const assigned = (state.locationMenus || []).filter((x) => x.location_id === loc.id).map((x) => x.menu_id);
                        const on = assigned.includes(mn.id);
                        return (
                          <label key={mn.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: T.ink, cursor: "pointer", border: "1px solid " + T.line, borderRadius: 8, padding: "5px 10px", background: on ? (T.accentSoft || "#EFEAD9") : T.bg }}>
                            <input type="checkbox" checked={on} onChange={() => {
                              const next = on ? assigned.filter((x) => x !== mn.id) : [...assigned, mn.id];
                              act("set_store_menus", { location_id: loc.id, menu_ids: next });
                            }} />
                            {mn.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {(state.locations || []).length === 0 && <div style={{ fontSize: 14, color: T.muted, textAlign: "center", padding: "20px 0" }}>No stores yet. Click "+ Add store".</div>}
          </div>
        </div>
      )}

      {showStores && storeView && (() => {
        const loc = (state.locations || []).find((l) => l.id === storeView);
        const ov = (state.overrides || []);
        const findOv = (itemId) => ov.find((o) => o.location_id === storeView && o.item_id === itemId);
        return (
          <div onClick={() => setStoreView(null)} style={{ position: "fixed", inset: 0, background: "rgba(30,36,20,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 51 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: "94vw", background: T.bg, borderRadius: 16, padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>{loc ? loc.name : "Store"} — Prices</div>
                <span onClick={() => setStoreView(null)} style={{ fontSize: 22, color: T.muted, cursor: "pointer" }}>×</span>
              </div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>Set a store-specific price, or hide an item at this store. Blank price = uses the master price.</div>
              {(state.items || []).map((it) => {
                const o = findOv(it.id);
                const hidden = o && o.available === false;
                return (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid " + T.line }}>
                    <span style={{ flex: 1, fontSize: 14, color: hidden ? T.muted : T.ink, textDecoration: hidden ? "line-through" : "none" }}>{it.name}</span>
                    <span style={{ fontSize: 12, color: T.faint }}>master {money(it.price)}</span>
                    <input type="number" step="0.05" placeholder={String(it.price)} defaultValue={o && o.price != null ? o.price : ""}
                      onBlur={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); act("set_override", { item_id: it.id, location_id: storeView, price: v, available: o ? o.available : null }); }}
                      style={{ width: 90, border: "1px solid " + T.line, borderRadius: 8, padding: "7px 9px", fontSize: 13, background: T.card, color: T.ink }} />
                    <span onClick={() => act("set_override", { item_id: it.id, location_id: storeView, price: o ? o.price : null, available: hidden ? true : false })} style={{ fontSize: 12, fontWeight: 600, color: hidden ? "#b4462f" : T.accent, cursor: "pointer", border: "1px solid " + T.line, borderRadius: 8, padding: "6px 10px", whiteSpace: "nowrap" }}>{hidden ? "Hidden" : "Shown"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      {imgTarget && (
        <div onClick={() => setImgTarget(null)} style={{ position: "fixed", inset: 0, background: "rgba(30,36,20,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 380, maxWidth: "92vw", background: T.bg, borderRadius: 16, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>Set {imgTarget.kind} image</div>
              <span onClick={() => setImgTarget(null)} style={{ fontSize: 22, color: T.muted, cursor: "pointer" }}>×</span>
            </div>
            <ImageUpload value={""} prefix={imgTarget.kind + "s"} onChange={async (url) => {
              const action = imgTarget.kind === "menu" ? "update_menu" : "update_category";
              await act(action, { id: imgTarget.id, fields: { img: url } });
              setImgTarget(null);
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
