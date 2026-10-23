import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import MenuOverview from "./MenuOverview";
import { openTableStickerSheet } from "./tableStickers";
import PricingManager from "./PricingManager";
// Currency follows the store being served — see src/money.js.
import { money } from "./money.js";

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
  // Customer-display posters can fill a 1920px-wide screen; everything else stays at 1600.
  const blob = await compressImage(file, String(prefix).startsWith("display") ? 1920 : 1600);
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

// "17:00:00" -> "17:00". Blank for a menu served all day.
const hhmm = (v) => (v ? String(v).slice(0, 5) : "");

function Card({ img, title, subtitle, active, onToggle, onClick, onDelete, onSetImage, onRename, onTillName, tillName, onHours, hours, drag }) {
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
          {onTillName && (
            <span onClick={(e) => { e.stopPropagation(); onTillName(); }}
              title={tillName ? "Till button shows: " + tillName : "Set a short name for the POS button"}
              style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", cursor: "pointer",
                color: tillName ? T.accent : T.faint,
                background: tillName ? "#EEF3EA" : "transparent",
                border: "1px solid " + (tillName ? "#D9E6D2" : T.line),
                borderRadius: 5, padding: "1px 5px" }}>
              {tillName ? "TILL: " + tillName : "TILL"}
            </span>
          )}
          {onHours && (
            <span onClick={(e) => { e.stopPropagation(); onHours(); }}
              title={hours ? "Served " + hours : "Served all day. Click to set hours."}
              style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", cursor: "pointer",
                color: hours ? T.accent : T.faint,
                background: hours ? "#EEF3EA" : "transparent",
                border: "1px solid " + (hours ? "#D9E6D2" : T.line),
                borderRadius: 5, padding: "1px 5px" }}>
              {hours || "ALL DAY"}
            </span>
          )}
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


// The 14 declarable allergens, with the specific cereals and nuts named —
// UK labelling expects "wheat" and "hazelnut", not "gluten" and "nuts".
const ALLERGENS = [
  ["WHEAT","Wheat"], ["RYE","Rye"], ["BARLEY","Barley"], ["OATS","Oats"],
  ["GLUTEN","Gluten (unspecified)"],
  ["MILK","Milk"], ["EGGS","Eggs"], ["SOYA","Soya"], ["FISH","Fish"],
  ["CRUSTACEANS","Crustaceans"], ["MOLLUSCS","Molluscs"],
  ["PEANUTS","Peanuts"], ["ALMOND","Almond"], ["HAZELNUT","Hazelnut"],
  ["WALNUT","Walnut"], ["PISTACHIO","Pistachio"], ["CASHEW","Cashew"],
  ["PECAN","Pecan"], ["BRAZIL","Brazil nut"], ["MACADAMIA","Macadamia"],
  ["OTHER_NUTS","Other nuts"],
  ["CELERY","Celery"], ["MUSTARD","Mustard"], ["SESAME","Sesame"],
  ["SULPHITES","Sulphur dioxide / sulphites"], ["LUPIN","Lupin"],
];

// Two separate sections rather than one cycling chip: an allergen that IS in
// the product and one that MIGHT be are different claims, and you need to see
// both lists at once to check them. Cycling also made a mis-click awkward to
// undo. Selecting in one list removes from the other, because nothing can
// sensibly be both.
function AllergenPicker({ contains, may, onChange, T }) {
  const Section = ({ title, hint, picked, other, onPick, tone }) => (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", color: tone.text, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 7 }}>{hint}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ALLERGENS.map(([code, label]) => {
          const on = picked.includes(code);
          // An allergen already claimed by the other section is shown faintly
          // so it's obvious why clicking it moves it rather than duplicating.
          const claimed = !on && other.includes(code);
          return (
            <span key={code}
              onClick={() => onPick(on ? picked.filter((x) => x !== code) : [...picked, code])}
              title={claimed ? "Currently in the other list — clicking moves it here" : undefined}
              style={{
                fontSize: 12.5, padding: "5px 10px", borderRadius: 16, cursor: "pointer", userSelect: "none",
                background: on ? tone.bg : "#fff",
                border: (on ? "1px " + tone.borderStyle + " " + tone.border : "1px solid " + T.line),
                color: on ? tone.text : (claimed ? "#c9c3b4" : T.muted),
                fontWeight: on ? 600 : 500,
              }}>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      <Section
        title="CONTAINS"
        hint="An ingredient of this item."
        picked={contains} other={may}
        onPick={(next) => onChange(next, may.filter((x) => !next.includes(x)))}
        tone={{ bg: "#F7E3DE", border: "#C98A78", borderStyle: "solid", text: "#8a3c2c" }}
      />
      <Section
        title="MAY CONTAIN"
        hint="Cross-contamination risk — shared equipment, fryer or preparation area."
        picked={may} other={contains}
        onPick={(next) => onChange(contains.filter((x) => !next.includes(x)), next)}
        tone={{ bg: "#F5E9DC", border: "#C9A87C", borderStyle: "dashed", text: "#8a5a2c" }}
      />
      <div style={{ fontSize: 11.5, color: T.muted, marginTop: 10, lineHeight: 1.5 }}>
        Leaving both blank means "not filled in" — it does not tell a customer the item is free of allergens.
      </div>
    </div>
  );
}

function ItemEditor({ pin, item, groups = [], itemGroupIds = [], onClose, onSaved }) {
  const [modIds, setModIds] = useState(itemGroupIds);
  const [f, setF] = useState({
    name: item.name || "", description: item.description || "", price: item.price ?? 0,
    allergensContains: item.allergens_contains || [], allergensMay: item.allergens_may || [],
    image_url: item.image_url || "", published: item.published !== false,
    pos_name: item.pos_name || "",
  });
  // Which description components are removable (ticked). Defaults to all on first edit.
  const parseComponents = (desc) => String(desc || "").split(/[|,]/).map((s) => s.trim()).filter(Boolean);
  const [removables, setRemovables] = useState(() => {
    const comps = parseComponents(item.description);
    // if the item already has a saved removables list, use it; else default to all components
    return Array.isArray(item.removables) && item.removables.length ? item.removables : comps;
  });
  const descComponents = parseComponents(f.description);
  const toggleRemovable = (c) => setRemovables((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true); setErr("");
    try {
      await callAdmin(pin, "update_item", { id: item.id, fields: {
        name: f.name, description: f.description, price: Number(f.price),
        allergens_contains: f.allergensContains, allergens_may: f.allergensMay,
        image_url: f.image_url || null, published: f.published,
        // Blank means "use the full name" — never store an empty string, or
        // the till would show nothing for that item.
        pos_name: f.pos_name.trim() || null,
        removables: removables,
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
        <div style={lab}>Till name <span style={{ fontWeight: 400, color: T.faint }}>— optional, for the POS button only</span></div>
        <input style={inp} value={f.pos_name} placeholder={f.name} onChange={(e) => set("pos_name", e.target.value)} />
        <div style={{ fontSize: 11.5, color: f.name.length > 22 && !f.pos_name.trim() ? "#8a5a2b" : T.faint, marginTop: 4 }}>
          {f.name.length > 22 && !f.pos_name.trim()
            ? "This name is " + f.name.length + " characters — it will wrap or clip on a POS button. A shorter till name helps."
            : "Leave blank to use the full name. Receipts, the customer menu and kitchen tickets always show the full name."}
        </div>
        <div style={lab}>Description</div>
        <textarea style={{ ...inp, minHeight: 90, resize: "vertical" }} value={f.description} onChange={(e) => set("description", e.target.value)} />
        {descComponents.length > 0 && (
          <div style={{ marginTop: 12, background: "#fff", border: "1px solid " + T.line, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, marginBottom: 3 }}>Removable ingredients</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>Tick the components a customer can leave off. Untick non-ingredients (e.g. "Hearty breakfast").</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {descComponents.map((c) => {
                const on = removables.includes(c);
                return (
                  <div key={c} onClick={() => toggleRemovable(c)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", cursor: "pointer" }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: "2px solid " + (on ? T.accent : T.line), background: on ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg> : null}</span>
                    <span style={{ fontSize: 14, color: on ? T.ink : T.muted }}>{c}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div style={lab}>Price (£)</div>
        <input style={inp} type="number" step="0.01" value={f.price} onChange={(e) => set("price", e.target.value)} />
        <div style={lab}>Allergens</div>
        <AllergenPicker T={T} contains={f.allergensContains} may={f.allergensMay}
          onChange={(c, m) => setF((p) => ({ ...p, allergensContains: c, allergensMay: m }))} />
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

// ============================================================
// PRINTERS SCREEN — paste this whole block into Admin.jsx,
// just ABOVE  `export default function Admin() {`
// It reuses: callAdmin, T (theme), and the locations from state.
// ============================================================

// QR scanner using the browser's BarcodeDetector when available,
// with a manual-entry fallback. Reads the SN off a Sunmi label QR.
function QrScanField({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let stream, raf, detector, cancelled = false;
    (async () => {
      try {
        if (!("BarcodeDetector" in window)) { setErr("no-detector"); return; }
        detector = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "code_39"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes[0] && codes[0].rawValue) {
              // Sunmi QR may be a URL or plain SN; pull an N-serial if present.
              const raw = codes[0].rawValue.trim();
              const m = raw.match(/N[0-9A-Z]{8,}/);
              onDetect(m ? m[0] : raw);
              return;
            }
          } catch { /* keep scanning */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) { setErr(e.message || "camera-failed"); }
    })();
    return () => { cancelled = true; if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [onDetect]);

  if (err) {
    return (
      <div style={{ fontSize: 13, color: T.muted, padding: "12px 0" }}>
        {err === "no-detector"
          ? "This device can't scan QR in-browser. Type the serial number instead."
          : "Camera unavailable — type the serial number instead."}
        <div style={{ marginTop: 8 }}>
          <button onClick={onClose} style={{ fontSize: 13, color: T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Close scanner</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <video ref={videoRef} style={{ width: "100%", borderRadius: 10, background: "#000", maxHeight: 240, objectFit: "cover" }} muted playsInline />
      <div style={{ fontSize: 12, color: T.muted, marginTop: 6, textAlign: "center" }}>Point at the QR code on the printer's label</div>
      <button onClick={onClose} style={{ fontSize: 13, color: T.muted, background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>Cancel scan</button>
    </div>
  );
}

// DEVICES. Every KDS screen, till, handheld and kiosk is a licensed device:
// created here with a one-time code, activated once on the hardware, revocable
// at any time.
//
// This was one flat column of identical cards, each carrying an 88px tile, a
// five-part status line and four equally-weighted buttons — two of which were
// destructive. Eight devices of four different kinds read as eight of the same
// thing, and the one that mattered (a kiosk offline for ten days) looked
// exactly like the seven that were fine.
function DevicesPanel({ loc, state, act, pin, setMsg }) {
  const [open, setOpen] = useState({});
  const [draftName, setDraftName] = useState({});

  const devices = (state.kdsScreens || [])
    .filter((k) => k.location_id === loc.id)
    .sort((a, b) => String(a.label || a.screen_key).localeCompare(String(b.label || b.screen_key), undefined, { numeric: true, sensitivity: "base" }));

  const ago = (iso) => { if (!iso) return "never"; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 2 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  const dur = (iso) => ago(iso).replace(/ ago$/, "");
  const online = (k) => !!(k.last_seen_at && Date.now() - new Date(k.last_seen_at) < 3 * 60000);
  const statusOf = (k) => k.status || (k.device_secret_hash ? "active" : "unassigned");
  const nameOf = (k) => k.label || "Screen " + k.screen_key;

  // The order devices are listed in is the order they matter: what takes money
  // first, then what the kitchen reads, then the machines that run themselves.
  const KINDS = [
    { key: "pos", label: "Tills" },
    { key: "kds+pos", label: "Kitchen + till" },
    { key: "kds", label: "Kitchen screens" },
    { key: "kiosk", label: "Self-service kiosks" },
  ];
  const KIND_OPTIONS = [["kds", "Kitchen screen"], ["pos", "Till"], ["kds+pos", "Kitchen + till"], ["kiosk", "Self-service kiosk"]];

  // A device still holding an unused code is a job waiting to be done, not a
  // device. It gets its own section at the top with the QR and the code large,
  // because that is the only thing anyone opens this page to do with it.
  const pending = devices.filter((k) => statusOf(k) === "unassigned");
  const placed = devices.filter((k) => statusOf(k) !== "unassigned");
  const groups = KINDS
    .map((g) => ({ ...g, rows: placed.filter((k) => (k.kind || "kds") === g.key) }))
    .filter((g) => g.rows.length);
  const stray = placed.filter((k) => !KINDS.some((g) => g.key === (k.kind || "kds")));
  if (stray.length) groups.push({ key: "other", label: "Other devices", rows: stray });

  const offline = placed.filter((k) => statusOf(k) === "active" && !online(k)).length;
  const revoked = placed.filter((k) => statusOf(k) === "revoked").length;

  const commitName = async (k) => {
    const v = draftName[k.screen_key];
    setDraftName((d) => { const n = { ...d }; delete n[k.screen_key]; return n; });
    if (v === undefined || String(v).trim() === String(k.label || "")) return;
    await act("device_set_kind", { location_id: loc.id, screen_key: k.screen_key, label: String(v).trim() });
  };

  const lab = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", color: T.faint, marginBottom: 5, textTransform: "uppercase" };
  const sel = { width: "100%", fontSize: 13, padding: "8px 9px", borderRadius: 9, border: "1px solid " + T.line, background: T.bg, color: T.ink };
  const btn = { fontSize: 12.5, fontWeight: 600, color: T.muted, background: "none", border: "1px solid " + T.line, borderRadius: 9, padding: "7px 11px", cursor: "pointer" };
  const chip = (text, tip) => <span key={text} title={tip} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", padding: "3px 9px", borderRadius: 20, background: "#F1EFE8", color: "#5F5E5A", whiteSpace: "nowrap" }}>{text}</span>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap", marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase" }}>Devices</span>
        <span style={{ fontSize: 12, color: T.faint }}>
          {placed.length} activated{offline ? " · " + offline + " offline" : ""}{revoked ? " · " + revoked + " revoked" : ""}{pending.length ? " · " + pending.length + " waiting" : ""}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 12, lineHeight: 1.5 }}>
        Create a device, then on that screen open <b>{window.location.origin}/activate</b> and enter its code, or scan its QR. A code works once. <b>Revoke</b> locks a device out and keeps its settings; <b>Replace</b> moves the licence to new hardware.
      </div>

      {/* WAITING TO BE ACTIVATED */}
      {!!pending.length && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, padding: "0 2px 7px" }}>
            <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 14.5, color: "#A3651F" }}>Waiting to be activated</span>
            <span style={{ fontSize: 12, color: T.faint }}>{pending.length} device{pending.length === 1 ? "" : "s"}</span>
          </div>
          {pending.map((k) => {
            const actUrl = window.location.origin + "/activate?code=" + encodeURIComponent(k.licence_code || "");
            const qr = "https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=8&data=" + encodeURIComponent(actUrl);
            return (
              <div key={k.screen_key} style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, border: "1px solid #EBD9B8", background: "#FBF2E2", borderRadius: 12, marginBottom: 8, flexWrap: "wrap" }}>
                {k.licence_code && <img src={qr} alt="Activation QR" width={92} height={92} style={{ borderRadius: 8, background: "#fff", flexShrink: 0 }} />}
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: T.ink, fontSize: 14.5 }}>{nameOf(k)}</div>
                  <div style={{ fontSize: 11.5, color: "#8a5a2c", margin: "2px 0 7px" }}>
                    {(KIND_OPTIONS.find(([v]) => v === (k.kind || "kds")) || [, "Device"])[1]} · not activated yet
                  </div>
                  <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 800, color: T.ink, letterSpacing: ".1em", fontSize: 19, userSelect: "all" }}>{k.licence_code || "—"}</div>
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {k.licence_code && <button onClick={() => navigator.clipboard?.writeText(k.licence_code)} style={{ ...btn, color: T.accent }}>Copy code</button>}
                  {k.licence_code && <button onClick={() => navigator.clipboard?.writeText(actUrl)} style={{ ...btn, color: T.accent }}>Copy link</button>}
                  <button onClick={() => { if (window.confirm("Remove " + nameOf(k) + " entirely? Its code stops working.")) act("kds_screen_remove", { location_id: loc.id, screen_key: k.screen_key }); }} style={{ ...btn, color: T.danger }}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ACTIVATED, BY TYPE */}
      {groups.map((g) => {
        const off = g.rows.filter((k) => statusOf(k) === "active" && !online(k)).length;
        return (
          <div key={g.key} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, padding: "0 2px 7px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 14.5, color: T.ink }}>{g.label}</span>
              <span style={{ fontSize: 12, color: T.faint }}>{g.rows.length}</span>
              {off > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8a6a1c" }}>{off} offline</span>}
            </div>
            <div style={{ background: T.card, borderRadius: 14, border: "1px solid " + T.line, overflow: "hidden" }}>
              {g.rows.map((k, idx) => {
                const st = statusOf(k);
                const up = online(k);
                const dot = st === "revoked" ? T.danger : st === "active" ? (up ? "#2e8b4e" : "#d79b2c") : "#9a9381";
                const limited = !!(k.routing && (k.routing.menus?.length || k.routing.categories?.length || k.routing.items?.length));
                const printerRow = k.printer_sn ? (state.printers || []).find((p) => p.sn === k.printer_sn) : null;
                const printerHere = !!printerRow && printerRow.location_id === loc.id && printerRow.active;
                return (
                  <div key={k.screen_key} style={{ borderTop: idx ? "1px solid " + T.line : "none", background: open[k.screen_key] ? "rgba(94,122,77,.035)" : "transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", flexWrap: "wrap", opacity: st === "revoked" ? .62 : 1 }}>
                      <span style={{ flex: "0 0 auto", width: 9, height: 9, borderRadius: 5, background: dot }} />
                      <div onClick={() => setOpen((o) => ({ ...o, [k.screen_key]: !o[k.screen_key] }))} title={"Device key " + k.screen_key}
                        style={{ minWidth: 140, flex: "1 1 180px", cursor: "pointer" }}>
                        <div style={{ fontWeight: 700, color: T.ink, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(k)}</div>
                        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {st === "revoked"
                            ? <span style={{ color: T.danger }}>Revoked {k.revoked_at ? ago(k.revoked_at) : ""} — locked out</span>
                            : <>
                                <span style={{ color: up ? "#2e8b4e" : "#8a6a1c", fontWeight: 700 }}>{up ? "Online" : "Offline"}</span>
                                {" · "}{up ? "seen " + ago(k.last_seen_at) : "not seen for " + dur(k.last_seen_at)}
                              </>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {/* "pass", "coffee", "kitchen" appeared as bare words in
                            a run of dots with nothing to say they were station
                            names, and "filtered" said a menu was restricted
                            without saying so. */}
                        {k.station && chip(String(k.station).toUpperCase(), "This device's station")}
                        {limited && chip("LIMITED MENU", "This device is set to show only some menus, categories or items")}
                      </div>
                      <div style={{ display: "flex", gap: 7, marginLeft: "auto", flex: "0 0 auto" }}>
                        {st === "active" && <button onClick={() => act("device_reload", { location_id: loc.id, screen_key: k.screen_key })} title="The screen reloads on its next heartbeat, under a minute" style={{ ...btn, color: T.accent, fontSize: 13 }}>Reload</button>}
                        <button onClick={() => setOpen((o) => ({ ...o, [k.screen_key]: !o[k.screen_key] }))}
                          style={{ ...btn, background: open[k.screen_key] ? T.bg : "none" }}>{open[k.screen_key] ? "Done" : "Settings"}</button>
                      </div>
                    </div>

                    {open[k.screen_key] && (
                      <div style={{ display: "grid", gap: 12, background: T.bg, border: "1px solid " + T.line, borderRadius: 12, margin: "0 16px 14px", padding: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                          <div>
                            <div style={lab}>Name</div>
                            <input value={draftName[k.screen_key] ?? (k.label || "")} placeholder={"Screen " + k.screen_key}
                              onChange={(e) => setDraftName((d) => ({ ...d, [k.screen_key]: e.target.value }))}
                              onBlur={() => commitName(k)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                                if (e.key === "Escape") setDraftName((d) => { const n = { ...d }; delete n[k.screen_key]; return n; });
                              }}
                              style={{ ...sel, fontWeight: 600 }} />
                          </div>
                          <div>
                            <div style={lab}>Type</div>
                            <select value={k.kind || "kds"} onChange={(e) => act("device_set_kind", { location_id: loc.id, screen_key: k.screen_key, kind: e.target.value })} style={sel}>
                              {KIND_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={lab}>Prints to</div>
                            {/* A select whose value matches none of its options
                                renders the FIRST option, so a device tied to a
                                printer that has been removed, switched off or
                                moved read as "All printers" while still routing
                                at something that is not there. Till 1 is tied to
                                usb:pos-1, which no longer exists, and the
                                control was reporting it as fine. */}
                            <select value={k.printer_sn || ""} onChange={(e) => act("set_kds_printer", { location_id: loc.id, screen_key: k.screen_key, label: k.label || null, printer_sn: e.target.value || null })} style={sel}>
                              <option value="">All printers</option>
                              {k.printer_sn && !printerHere && (
                                <option value={k.printer_sn}>
                                  Only {printerRow ? (printerRow.label || k.printer_sn) + (printerRow.active ? " — at another store" : " — switched off") : k.printer_sn + " — not registered"}
                                </option>
                              )}
                              {(state.printers || []).filter((p) => p.location_id === loc.id && p.active).map((p) => <option key={p.sn} value={p.sn}>Only {p.label || p.sn}</option>)}
                            </select>
                            {k.printer_sn && !printerHere && (
                              <div style={{ fontSize: 11.5, color: "#8a5a2c", marginTop: 5, lineHeight: 1.4 }}>
                                {printerRow ? (printerRow.active ? "That printer belongs to another store, so nothing from here reaches it." : "That printer is switched off, so nothing prints until it is turned back on.")
                                  : "No printer with that serial is registered any more — anything this device sends has nowhere to go. Pick one, or set it back to all printers."}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Provenance. Useful when something is wrong and noise
                            every other minute of the year, so it reads as one
                            quiet line rather than four facts in the status. */}
                        <div style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
                          Device key <span style={{ fontFamily: "monospace", color: T.muted, userSelect: "all" }}>{k.screen_key}</span>
                          {k.activated_at ? " · activated " + new Date(k.activated_at).toLocaleDateString("en-GB") : ""}
                          {k.activated_by === "legacy" ? " (migrated)" : ""}
                          {k.app_version ? " · app v" + k.app_version : ""}
                          {k.fingerprint ? " · " + String(k.fingerprint).split(" | ")[0] : ""}
                        </div>

                        {/* Revoke and Remove were sitting in the same row as
                            Reload screen, at the same weight. They are kept
                            apart now, below a rule, inside a drawer you have
                            to open on purpose. */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: "1px solid " + T.line, paddingTop: 11 }}>
                          <button onClick={() => { if (window.confirm("Issue a new code for " + nameOf(k) + "? The current hardware is logged out; settings and history are kept.")) act("device_replace", { location_id: loc.id, screen_key: k.screen_key }); }} style={btn}>Replace / new code</button>
                          {st === "active" && <button onClick={() => { if (window.confirm("Revoke " + nameOf(k) + "? It will lock within a minute. Its settings are kept.")) act("device_revoke", { location_id: loc.id, screen_key: k.screen_key }); }} style={{ ...btn, color: T.danger, border: "1px solid rgba(178,59,59,.3)" }}>Revoke</button>}
                          <span style={{ flex: 1 }} />
                          <button onClick={() => { if (window.confirm("Remove " + nameOf(k) + " entirely? Use Revoke if you may want it back.")) act("kds_screen_remove", { location_id: loc.id, screen_key: k.screen_key }); }} style={{ ...btn, color: T.danger, border: "1px solid rgba(178,59,59,.3)" }}>Remove</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!devices.length && <div style={{ fontSize: 12.5, color: T.muted, background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 18, marginBottom: 12 }}>No devices yet. Add one below, then activate it on the screen itself.</div>}

      {/* Adding a device and wiping the print queue are not the same kind of
          act, and they used to sit in one row with the destructive one in the
          middle because it carried marginLeft:auto. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 11.5, color: T.faint, fontWeight: 600, marginRight: 2 }}>Add</span>
        {KIND_OPTIONS.map(([v, t]) => (
          <button key={v} onClick={() => act("device_create", { location_id: loc.id, kind: v })}
            style={{ fontSize: 12.5, color: T.accent, background: "none", border: "1px solid " + T.line, borderRadius: 9, cursor: "pointer", fontWeight: 700, padding: "8px 12px" }}>+ {t}</button>
        ))}
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid " + T.line, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: T.faint, flex: 1, minWidth: 220, lineHeight: 1.45 }}>
          Drops every pending job on this store's printers and marks open orders printed. For when a queue has backed up behind a dead printer.
        </span>
        <button onClick={async () => { if (!window.confirm("Clear " + loc.name + "'s print queue? Pending jobs on its printers are dropped and open orders stop being re-pushed.")) return; const r = await callAdmin(pin, "clear_print_queue", { location_id: loc.id }); setMsg(r && r.ok ? "Print queue cleared · " + (r.orders_marked || 0) + " orders marked printed" : "Could not clear the queue"); }}
          style={{ fontSize: 12.5, color: T.danger, background: "none", border: "1px solid rgba(178,59,59,.3)", borderRadius: 9, cursor: "pointer", fontWeight: 700, padding: "8px 12px" }}>Clear print queue</button>
      </div>
    </div>
  );
}

function PrintersModal({ pin, locations, onClose }) {
  const [printers, setPrinters] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [scan, setScan] = useState(false);
  const [form, setForm] = useState({ sn: "", label: "", location_id: "", station: "kitchen" });

  const [screens, setScreens] = useState([]);
  // Which store to show, and which printers are expanded. Everything starts
  // collapsed: the list is for finding a printer, not for reading five sets of
  // settings at once.
  const [storeFilter, setStoreFilter] = useState("");
  const [open, setOpen] = useState({});
  // Renaming is held locally while it is being typed. Every other control
  // writes straight through and reloads the list, which would yank the field
  // out from under the keyboard on each keystroke.
  const [draftName, setDraftName] = useState({});
  const load = async () => {
    setMsg("");
    try { const res = await callAdmin(pin, "printer_list", {}); setPrinters(res.printers || []); }
    catch (e) { setMsg(e.message); }
    try { const r = await fetch(SUPABASE_URL + "/rest/v1/kds_screens?select=screen_key,label,location_id,kind", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } }); if (r.ok) setScreens(await r.json()); } catch {}
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  // Clicking the backdrop was the only way out. Esc is what anyone tries first
  // on a dialog, and on the till there is no backdrop worth aiming at.
  useEffect(() => {
    // Escape inside the name field means "undo what I just typed", not "throw
    // the whole dialog away". This listener is on the window, so a React
    // stopPropagation in the field would not have held it back.
    const k = (e) => {
      if (e.key !== "Escape") return;
      if (document.activeElement && document.activeElement.tagName === "INPUT") return;
      onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const locName = (id) => (locations.find((l) => l.id === id) || {}).name || "—";
  // store_id is a text column; derive a slug from the chosen location.
  const slugFor = (loc) => (loc?.slug || (loc?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")) || loc?.id;

  const addPrinter = async () => {
    if (!form.sn.trim()) { setMsg("Enter or scan a serial number."); return; }
    if (!form.location_id) { setMsg("Choose which store this printer is for."); return; }
    const loc = locations.find((l) => l.id === form.location_id);
    setBusy(true); setMsg("");
    try {
      await callAdmin(pin, "printer_add", {
        sn: form.sn.trim(),
        label: form.label.trim() || null,
        store_id: slugFor(loc),
        location_id: form.location_id,
        shop_id: 1,
        station: form.station || "kitchen",
      });
      setForm({ sn: "", label: "", location_id: "", station: "kitchen" });
      setAdding(false); setScan(false);
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const testPrint = async (p) => {
    setBusy(true); setMsg("");
    // A cloud printer is pushed to there and then; a local one has its slip
    // put in the queue and waits for its agent to come and collect it. Calling
    // both "sent" hides the failure that matters most — an agent that is not
    // running at all, where the slip sits queued and nothing ever comes out.
    try {
      const r = await callAdmin(pin, "printer_test", { sn: p.sn });
      setMsg(r && r.local
        ? "Test queued for " + (p.label || p.sn) + " — it prints within a few seconds if the agent on that till is running."
        : "Test sent to " + (p.label || p.sn) + " — check the paper.");
    }
    catch (e) { setMsg("Test failed: " + e.message); }
    finally { setBusy(false); }
  };
  // One writer for every printer switch. PrintersModal talks to the API with
  // callAdmin and refreshes with load(); there is no `act` in this component.
  const updatePrinter = async (p, fields) => {
    setBusy(true); setMsg("");
    try { await callAdmin(pin, "printer_update", { id: p.id, fields }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };

  const toggleActive = async (p) => {
    setBusy(true);
    try { await callAdmin(pin, "printer_update", { id: p.id, fields: { active: !p.active } }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const changeStore = async (p, location_id) => {
    const loc = locations.find((l) => l.id === location_id);
    setBusy(true);
    try { await callAdmin(pin, "printer_update", { id: p.id, fields: { location_id, store_id: slugFor(loc) } }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  // Printers were named once, when they were added, and never again — so a
  // store with three of them ends up with three rows called "Till printer".
  const commitName = async (p) => {
    const v = draftName[p.id];
    setDraftName((d) => { const n = { ...d }; delete n[p.id]; return n; });
    const next = String(v ?? "").trim();
    if (v === undefined || next === String(p.label || "")) return;
    await updatePrinter(p, { label: next || null });
  };
  const changeStation = async (p, station) => {
    setBusy(true);
    try { await callAdmin(pin, "printer_update", { id: p.id, fields: { station } }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  // A printer does one of two jobs. A STATION printer gets only the lines for
  // its own station (a kitchen ticket). A RECEIPT printer gets the whole order
  // every time — that is the counter. Getting this wrong is why the counter
  // stopped printing when its station changed.
  const changeRole = async (p, print_role) => {
    setBusy(true); setMsg("");
    try { await callAdmin(pin, "printer_update", { id: p.id, fields: { print_role } }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const toggleAuto = async (p) => {
    setBusy(true); setMsg("");
    try { await callAdmin(pin, "printer_update", { id: p.id, fields: { auto_print: p.auto_print === false } }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const changeCopies = async (p, copies) => {
    setBusy(true);
    try { await callAdmin(pin, "printer_update", { id: p.id, fields: { copies: parseInt(copies, 10) || 1 } }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const removePrinter = async (p) => {
    if (!window.confirm("Remove " + (p.label || p.sn) + " from the list? (The printer stays bound in Sunmi; this only unregisters it here.)")) return;
    setBusy(true);
    try { await callAdmin(pin, "printer_remove", { id: p.id }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };

  const Dot = ({ online }) => (
    <span style={{ flex: "0 0 auto", display: "inline-block", width: 9, height: 9, borderRadius: 5,
      background: online === true ? "#3EA662" : online === false ? T.danger : "#C9C4B4" }} />
  );

  const agoText = (iso) => {
    if (!iso) return "never";
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    return m < 2 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago";
  };
  // How the bytes actually reach this printer. It is the first thing worth
  // knowing when one stops working, and until now the only clue was the prefix
  // on a serial in 11px monospace.
  // The source list arrived in whatever order the screens table returned, so
  // Till 2 sat above Till 1 with a kiosk and two kitchen displays in between,
  // and every entry ended in a bare "(3)" that reads as a count rather than
  // the device key it is.
  //
  // It also offered the kitchen displays. A printer is tied to a source by
  // matching the order's device_key, and a kitchen display never places an
  // order — so choosing one means that printer prints nothing at all, with
  // nothing on screen to say so. They stay listed, because a screen's kind
  // can be mis-set and hiding one would be worse than warning about it, but
  // they sit in their own group that says what they are.
  const SOURCE_GROUPS = [
    { key: "pos", label: "Tills and handhelds", match: (k) => /pos/.test(String(k.kind || "")) },
    { key: "kiosk", label: "Kiosks", match: (k) => String(k.kind || "") === "kiosk" },
    { key: "kds", label: "Kitchen screens — these never place orders", match: (k) => String(k.kind || "") === "kds" },
    { key: "other", label: "Other screens", match: () => true },
  ];
  const sourceOptions = (locationId) => {
    const mine = (screens || []).filter((k) => k.location_id === locationId);
    const used = new Set();
    return SOURCE_GROUPS.map((g) => {
      const rows = mine.filter((k) => !used.has(k.screen_key) && g.match(k));
      rows.forEach((k) => used.add(k.screen_key));
      rows.sort((a, b) => String(a.label || a.screen_key).localeCompare(String(b.label || b.screen_key), undefined, { numeric: true, sensitivity: "base" }));
      return { ...g, rows };
    }).filter((g) => g.rows.length);
  };

  const transport = (sn) => {
    const s = String(sn || "");
    if (s.startsWith("usb:")) return "Browser USB";
    if (s.startsWith("agent:win-")) return "Print agent · Windows";
    if (s.startsWith("agent:")) return "Print agent";
    return "Sunmi cloud";
  };
  const isBrowserUsb = (sn) => String(sn || "").startsWith("usb:");
  // A local printer is judged on the heartbeat its agent stamps every poll; a
  // cloud printer on what Sunmi says. Those are different questions and used
  // to collapse into the same silent grey dot.
  //
  // The freshness is worked out here rather than trusted from the server, so
  // this reads correctly against the old admin-api too: last_online_at comes
  // back on the row either way, and a till whose agent died is the thing most
  // worth seeing immediately.
  const LOCAL_STALE_MS = 3 * 60 * 1000;
  const isLocal = (sn) => /^(usb|agent):/.test(String(sn || ""));
  const liveState = (p) => {
    if (!isLocal(p.sn)) return { local: false, online: p.online ?? null };
    const t = p.last_online_at ? Date.parse(p.last_online_at) : 0;
    return { local: true, online: t > 0 && Date.now() - t < LOCAL_STALE_MS };
  };
  // What the heartbeat on a local printer actually proves depends on who is
  // doing the polling. For an agent serial it is the agent process on that
  // machine, so "seen just now" means the agent is alive. For a usb: serial it
  // is the KDS tab in the browser — it says a screen is open and nothing
  // whatsoever about a printer being on the end of the cable. Reporting both
  // as "seen just now" reads as a healthy printer in the one case where it is
  // most likely to be nothing of the kind.
  // "for 4 d" rather than "since 4 d ago" — the transport label in front of
  // this already names the agent, and the repetition was long enough to push
  // the whole line into an ellipsis on any row carrying two pills.
  const durText = (iso) => agoText(iso).replace(/ ago$/, "");
  const statusText = (p) => {
    const { local, online } = liveState(p);
    if (local && isBrowserUsb(p.sn)) {
      return online ? "screen polling"
        : p.last_online_at ? "screen quiet for " + durText(p.last_online_at) : "screen never polled";
    }
    if (local) return online ? "seen " + agoText(p.last_online_at)
      : p.last_online_at ? "not seen for " + durText(p.last_online_at) : "never checked in";
    return online === true ? "online" : online === false ? "offline" : "status unknown";
  };

  // Printers grouped by the store they serve, in the order the stores are
  // listed, with the unassigned ones last. A flat list mixed every café
  // together and the only clue which was which was a dropdown halfway down
  // each card.
  const groups = (() => {
    const byLoc = new Map();
    for (const p of printers || []) {
      const key = p.location_id || "";
      if (!byLoc.has(key)) byLoc.set(key, []);
      byLoc.get(key).push(p);
    }
    const out = [];
    const taken = new Set();
    for (const l of locations) if (byLoc.has(l.id)) { out.push({ id: l.id, name: l.name, printers: byLoc.get(l.id) }); taken.add(l.id); }
    // printer_list returns every printer in the estate, but `locations` is
    // whatever this admin session is scoped to. Keying the groups off
    // `locations` alone silently dropped any printer belonging to a store not
    // in that list — the header counted seven and three appeared. Nothing is
    // discarded now: a store we cannot name still gets a row, labelled with
    // whatever the printer itself carries.
    for (const [key, list] of byLoc) {
      if (key === "" || taken.has(key)) continue;
      const slug = String(list[0]?.store_id || "").replace(/-/g, " ").trim();
      out.push({ id: key, unknown: true, printers: list,
        name: slug ? slug.replace(/\b\w/g, (c) => c.toUpperCase()) : "Another store" });
    }
    if (byLoc.has("")) out.push({ id: "", name: "Not assigned to a store", printers: byLoc.get("") });
    return out;
  })();
  // Reassigning the last printer out of a store empties that group, and a
  // filter still pointing at it would show nothing at all with no way back.
  const picked = storeFilter === "" ? groups
    : groups.filter((g) => (storeFilter === "__none" ? g.id === "" : g.id === storeFilter));
  const shown = picked.length ? picked : groups;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,34,24,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 50, padding: "40px 16px", overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.bg, borderRadius: 18, width: "100%", maxWidth: 720, boxShadow: "0 30px 70px -25px rgba(30,34,24,.5)", padding: "26px 26px 30px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 22, color: T.ink }}>Printers</div>
          <button onClick={onClose} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: T.muted }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 18, maxWidth: 720 }}>
          Each printer decides for itself. <b>Kitchen ticket</b> is what to make, with no prices. <b>Full receipt</b> is every line with prices. Turn on both and that printer produces two slips. Printers are independent — two of them can print the same items.
        </div>

        {msg && <div style={{ fontSize: 13, color: /^Test (sent|queued)/.test(msg) ? T.accent : T.danger, marginBottom: 12 }}>{msg}</div>}

        {/* WHICH STORE */}
        {printers && printers.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", color: T.faint, textTransform: "uppercase" }}>Show</span>
            <select value={storeFilter} onChange={(e) => { setStoreFilter(e.target.value); setOpen({}); }}
              style={{ fontSize: 13, padding: "8px 10px", borderRadius: 9, border: "1px solid " + T.line, background: T.card, color: T.ink, fontWeight: 600 }}>
              <option value="">All stores ({printers.length})</option>
              {groups.map((g) => <option key={g.id || "__none"} value={g.id || "__none"}>{g.name} ({g.printers.length})</option>)}
            </select>
            <span style={{ flex: 1 }} />
            {Object.values(open).some(Boolean) && (
              <button onClick={() => setOpen({})} style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, background: "none", border: "1px solid " + T.line, borderRadius: 9, padding: "7px 12px", cursor: "pointer" }}>Collapse all</button>
            )}
          </div>
        )}

        {/* LIST, grouped by store */}
        {printers === null && <div style={{ background: T.card, borderRadius: 14, border: "1px solid " + T.line, padding: 18, color: T.muted, fontSize: 14, marginBottom: 18 }}>Loading…</div>}
        {printers && printers.length === 0 && <div style={{ background: T.card, borderRadius: 14, border: "1px solid " + T.line, padding: 18, color: T.muted, fontSize: 14, marginBottom: 18 }}>No printers yet. Add one below.</div>}

        {groups.some((g) => g.unknown) && (
          <div style={{ fontSize: 12, color: "#8a5a2c", background: "#FBF2E2", border: "1px solid #EBD9B8", borderRadius: 10, padding: "9px 12px", marginBottom: 12, lineHeight: 1.45 }}>
            Stores marked <b>outside your access</b> are not in this login's scope, so their names come from the printers' own store tags. Their settings are shown, but changing the store on one would move it out of a store you cannot see back into.
          </div>
        )}

        {shown.map((g) => {
          const live = g.printers.filter((x) => x.active).length;
          // An ACTIVE printer reporting offline is the one worth surfacing: it
          // is expected to take orders and is not answering.
          const quiet = g.printers.filter((x) => x.active && liveState(x).online === false).length;
          // Only the unassigned warning is per-group; it describes that one
          // group. The out-of-scope explanation is the same sentence for every
          // such store, so it is said once above the list instead of stacked
          // identically under each heading.
          const note = !g.id
            ? "A printer with no store never receives an order — the lookup matches on store first. Give it one below, or switch it off."
            : "";
          return (
          <div key={g.id || "__none"} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, padding: "0 2px 7px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 14.5, color: note || g.unknown ? "#A3651F" : T.ink }}>{g.name}</span>
              {g.unknown && <span title="This store is outside what this login can see, so the name comes from the printer's own store tag." style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: "#A3651F", border: "1px solid #EBD9B8", background: "#FBF2E2", borderRadius: 20, padding: "2px 8px" }}>OUTSIDE YOUR ACCESS</span>}
              <span style={{ fontSize: 12, color: T.faint }}>
                {g.printers.length} printer{g.printers.length === 1 ? "" : "s"}{live < g.printers.length ? " · " + (g.printers.length - live) + " off" : ""}
              </span>
              {quiet > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: T.danger }}>{quiet} not answering</span>}
            </div>
            {note && (
              <div style={{ fontSize: 12, color: "#8a5a2c", background: "#FBF2E2", border: "1px solid #EBD9B8", borderRadius: 10, padding: "9px 12px", marginBottom: 8, lineHeight: 1.45 }}>
                {note}
              </div>
            )}
            <div style={{ background: T.card, borderRadius: 14, border: "1px solid " + T.line, overflow: "hidden" }}>
          {/* Two printers at one store can carry the same label — Tove has two
              "Till printer" rows, one live and one a leftover registration.
              With the serial moved into the drawer the rows became identical,
              so the only pair you would ever need to tell apart was the one
              pair you could not. Where a name repeats, its serial tail comes
              back onto the row. */}
          {g.printers.map((p, idx, arr) => {
            const dupLabel = arr.filter((x) => (x.label || "Printer").toLowerCase() === (p.label || "Printer").toLowerCase()).length > 1;
            const snTail = String(p.sn || "").split(":").pop();
            // One CARD per printer rather than one wide row. Eight controls in a
            // grid overflowed the dialog and clipped the last column; stacking
            // them into labelled fields fits, and each control can say what it
            // is instead of relying on a header far away.
            // Independent switches: a printer can print a ticket, a receipt,
            // both (two slips) or neither. Falls back to the older print_role
            // for any printer not yet migrated.
            const legacy = (p.print_role || "station") === "receipt";
            const ticket = p.print_ticket ?? !legacy;
            const receipt = p.print_receipt ?? legacy;
            const isReceipt = receipt && !ticket;
            const auto = p.auto_print !== false;
            const autoTicket = p.auto_ticket ?? auto;
            const autoReceipt = p.auto_receipt ?? auto;
            const fieldLab = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", color: T.faint, marginBottom: 5, textTransform: "uppercase" };
            const sel = { width: "100%", fontSize: 13, padding: "8px 9px", borderRadius: 9, border: "1px solid " + T.line, background: T.bg, color: T.ink };
            const pill = (text, bg, fg, tip) => <span key={text} title={tip} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", padding: "3px 9px", borderRadius: 20, background: bg, color: fg, whiteSpace: "nowrap" }}>{text}</span>;
            return (
            <div key={p.id} style={{ borderTop: idx ? "1px solid " + T.line : "none", background: open[p.id] ? "rgba(94,122,77,.035)" : "transparent" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", flexWrap: "wrap", opacity: p.active ? 1 : .62 }}>
                <Dot online={p.active ? liveState(p).online : null} />
                {/* The name and status win the width fight. A long pill such as
                    "RECEIPT · WHEN ASKED" used to squeeze this block until the
                    status ellipsed to "agent not seen …" — cutting off the one
                    line that was added to say what is wrong. Pills wrap first. */}
                <div onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))} title={p.sn}
                  style={{ minWidth: 155, flex: "1 1 200px", cursor: "pointer" }}>
                  <div style={{ fontWeight: 700, color: T.ink, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label || "Printer"}</div>
                  {/* How it is wired, and whether it is actually there. The
                      serial used to be the whole of this line and said neither;
                      it sits in the drawer now, where it has room to be read in
                      full instead of ellipsed to "agent:3046…". */}
                  <div style={{ fontSize: 11.5, color: T.faint, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {transport(p.sn)}
                    {dupLabel && <span style={{ fontFamily: "monospace", color: T.muted }}> · {snTail}</span>}
                    {" · "}<span style={{ color: p.active && liveState(p).online === false ? T.danger : T.faint }}>{statusText(p)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {/* "SOME MANUAL" sat on its own and never said which slip it
                      meant. Hung on the slip it belongs to, it needs no decoding. */}
                  {/* The modifier is kept to one short word. Spelled out as
                      "WHEN ASKED" the pill was wide enough to push the buttons
                      onto a second line, and rows of two different heights are
                      harder to scan than the word was worth. The drawer says it
                      in full, and so does the tooltip. */}
                  {ticket && pill(autoTicket ? "TICKET" : "TICKET · ASK", "#FAEEDA", "#854F0B", autoTicket ? "Kitchen ticket on every order" : "Kitchen ticket only when a member of staff asks for it")}
                  {receipt && pill(autoReceipt ? "RECEIPT" : "RECEIPT · ASK", "#E1F5EE", "#0F6E56", autoReceipt ? "Full receipt on every order" : "Full receipt only when a member of staff asks for it")}
                  {!ticket && !receipt && pill("PRINTS NOTHING", "#FCEBEB", "#A32D2D", "Neither slip is switched on for this printer")}
                </div>
                <div style={{ display: "flex", gap: 7, marginLeft: "auto", flex: "0 0 auto" }}>
                  <button disabled={busy} onClick={() => testPrint(p)} style={{ fontSize: 13, fontWeight: 600, color: T.accent, background: "none", border: "1px solid " + T.line, borderRadius: 9, padding: "7px 13px", cursor: "pointer" }}>Test print</button>
                  <button onClick={() => toggleActive(p)} title={p.active ? "Switch this printer off" : "Switch this printer back on"} style={{ fontSize: 12.5, fontWeight: 700, border: "none", borderRadius: 9, padding: "8px 13px", cursor: "pointer", background: p.active ? "rgba(94,122,77,.14)" : "rgba(178,59,59,.12)", color: p.active ? T.accent : T.danger }}>{p.active ? "Active" : "Off"}</button>
                  <button onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}
                    title={open[p.id] ? "Hide settings" : "Settings"}
                    style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, background: open[p.id] ? T.bg : "none", border: "1px solid " + T.line, borderRadius: 9, padding: "7px 11px", cursor: "pointer" }}>
                    {open[p.id] ? "Done" : "Settings"}
                  </button>
                </div>
              </div>

              {/* A printer that is switched on and set to print neither slip
                  is a dead configuration: it holds a station, looks healthy and
                  can never produce paper. The pill alone did not carry that —
                  Tove's kiosk printer sat like this, online, printing nothing. */}
              {p.active && !ticket && !receipt && (
                <div style={{ fontSize: 12, color: "#8a5a2c", background: "#FBF2E2", borderTop: "1px solid #EBD9B8", padding: "8px 16px", lineHeight: 1.45 }}>
                  On, but set to print neither slip — nothing will ever come out of it. Turn on a kitchen ticket or a full receipt in Settings, or switch the printer off.
                </div>
              )}

              {/* Settings sit in a tinted drawer, inset from the row. Flat on
                  the card they ran straight into the next printer and it was
                  not obvious which one you were editing.
                  One auto-fit grid for all of it does not work, because the
                  fields disagree about how much room they need: three short
                  selects fit happily at 150px, while the two slip switches are
                  a toggle plus a 118px button and are cramped under 230. A
                  single minmax has to pick one number, and whichever it picks
                  the other half is wrong — at 200 it silently dropped to two
                  columns and orphaned a field on every other row. So the
                  drawer is three stacked zones, each sized for what is in it,
                  and each still collapsing to one column on a narrow screen. */}
              {open[p.id] && (
              <div style={{ display: "grid", gap: 12,
                background: T.bg, border: "1px solid " + T.line, borderRadius: 12, margin: "0 16px 14px", padding: 14 }}>
                {/* Hard-won, and nowhere in the product until now: a browser
                    cannot hold a USB printer on Windows. usbprint.sys claims
                    the device the moment it is plugged in, so WebUSB gets
                    Access denied and the slip sits in the queue for a till
                    screen that can never collect it. Android has no such
                    owner, which is why the same setup works at Tove. */}
                {isBrowserUsb(p.sn) && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "#8a5a2c", background: "#FBF2E2", border: "1px solid #EBD9B8", borderRadius: 10, padding: "9px 12px", lineHeight: 1.45 }}>
                    This printer is driven by the till's browser, which only works on an <b>Android</b> till. On a Windows till the printing subsystem owns the cable the moment the printer is plugged in, so the browser can never open it and the slips queue up unprinted. Use the print agent on that till instead.
                  </div>
                )}
                {/* What it is: three short fields, three across. */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                <div>
                  <div style={fieldLab}>Name</div>
                  <input value={draftName[p.id] ?? (p.label || "")} disabled={busy}
                    placeholder="Printer"
                    onChange={(e) => setDraftName((d) => ({ ...d, [p.id]: e.target.value }))}
                    onBlur={() => commitName(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                      if (e.key === "Escape") { setDraftName((d) => { const n = { ...d }; delete n[p.id]; return n; }); e.stopPropagation(); }
                    }}
                    style={{ ...sel, fontWeight: 600 }} />
                </div>
                <div>
                  <div style={fieldLab}>Store</div>
                  <select value={p.location_id || ""} onChange={(e) => changeStore(p, e.target.value)} style={sel}>
                    <option value="">— unassigned —</option>
                    {/* A printer can belong to a store this session cannot see.
                        Without its own value in the list the select renders
                        blank, which reads as unassigned — and the next change
                        would move the printer somewhere it never belonged. */}
                    {p.location_id && !locations.some((l) => l.id === p.location_id) &&
                      <option value={p.location_id}>{locName(p.location_id) !== "—" ? locName(p.location_id) : "Its current store (outside your access)"}</option>}
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  {/* Station was set once when the printer was added and could
                      never be changed again; changeStation has been sitting
                      here unused the whole time. It decides which printer a
                      targeted print lands on. */}
                  <div style={fieldLab}>Station</div>
                  <select value={p.station || "kitchen"} onChange={(e) => changeStation(p, e.target.value)} disabled={busy} style={sel}>
                    <option value="kitchen">Kitchen (food)</option>
                    <option value="counter">Counter / bar (drinks)</option>
                  </select>
                </div>
                </div>

                {/* WHICH OUTPUT. The agent on a till can see what Admin
                    cannot - the USB printers attached to it, the Windows
                    queues on it - and reports them when it registers. Picking
                    one here takes effect on its next poll, a few seconds
                    later, so swapping a till printer for the kitchen one is a
                    dropdown rather than a trip to the store. */}
                {isLocal(p.sn) && Array.isArray(p.agent_outputs) && p.agent_outputs.length > 0 && (() => {
                  const outs = p.agent_outputs;
                  const cur = p.agent_target || "";
                  const known = outs.some((o) => o && o.target === cur);
                  return (
                    <div>
                      <div style={fieldLab}>Prints via</div>
                      <select value={cur} onChange={(e) => updatePrinter(p, { agent_target: e.target.value || null })} disabled={busy} style={sel}>
                        <option value="">Whatever the agent is set to on that till</option>
                        {/* A printer that has since been unplugged would
                            otherwise render as the blank first option, which
                            reads as "not set" while it is still pointed at
                            something that is gone. */}
                        {cur && !known && <option value={cur}>{cur} — not attached right now</option>}
                        {outs.map((o) => <option key={o.target} value={o.target}>{o.name}{o.kind === "queue" ? " (Windows queue)" : ""}</option>)}
                      </select>
                      <div style={{ fontSize: 11.5, color: cur && !known ? "#8a5a2c" : T.faint, marginTop: 5, lineHeight: 1.4 }}>
                        {cur && !known
                          ? "That output is not attached to the till at the moment, so nothing will print until it is back or another is chosen."
                          : "What the agent on that till last reported it can drive. A change here reaches it within a few seconds."}
                      </div>
                    </div>
                  );
                })()}

                {/* Where the orders come from, and how many copies. The source
                    select holds the longest text in the drawer and was
                    truncating to "Any source (tablets, tills, onli". */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "start" }}>
                <div>
                  <div style={fieldLab}>Prints orders from</div>
                  <select value={p.source_screen_key || ""} onChange={(e) => updatePrinter(p, { source_screen_key: e.target.value || null })} disabled={busy} style={sel}>
                    <option value="">Any source</option>
                    {/* A screen that has since been removed or renamed would
                        otherwise leave this blank, reading as "any source"
                        while the printer is still tied to something gone. */}
                    {p.source_screen_key && !(screens || []).some((k) => k.screen_key === p.source_screen_key && k.location_id === p.location_id) &&
                      <option value={p.source_screen_key}>Only {p.source_screen_key} — screen no longer listed</option>}
                    {sourceOptions(p.location_id).map((g) => (
                      <optgroup key={g.key} label={g.label}>
                        {g.rows.map((k) => <option key={k.screen_key} value={k.screen_key}>Only {k.label || ("Screen " + k.screen_key)} · {k.screen_key}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {/* This explanation lived in a title attribute, which does
                      not exist on a touchscreen — on the till it was simply
                      gone. It is visible again now that the drawer opens one
                      printer at a time instead of all five at once, which is
                      why it had to be hidden in the first place.
                      Tying a printer to a screen that cannot place an order is
                      the same dead end as leaving both slips off, and just as
                      quiet, so that case replaces the hint rather than
                      stacking a second line under it. */}
                  {p.source_screen_key && (screens || []).some((k) => k.screen_key === p.source_screen_key && k.location_id === p.location_id && String(k.kind || "") === "kds") ? (
                    <div style={{ fontSize: 11.5, color: "#8a5a2c", marginTop: 5, lineHeight: 1.4 }}>
                      That is a kitchen screen — it never places orders, so this printer will not print any.
                    </div>
                  ) : (
                    <div style={{ fontSize: 11.5, color: T.faint, marginTop: 5, lineHeight: 1.4 }}>
                      Tie a printer to one till or handheld and it prints only the orders placed there. Reprints still reach it.
                    </div>
                  )}
                </div>
                <div>
                  <div style={fieldLab}>Copies</div>
                  <select value={p.copies || 1} onChange={(e) => changeCopies(p, e.target.value)} style={sel}>
                    <option value={1}>1 copy</option>
                    <option value={2}>2 copies</option>
                    <option value={3}>3 copies</option>
                    <option value={4}>4 copies</option>
                  </select>
                </div>
                </div>

                {/* What comes out. These two are the pair you reason about
                    together, so they stay side by side, and each needs room
                    for a toggle plus the when-it-prints button. */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
                <div>
                  <div style={fieldLab}>Kitchen ticket</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => updatePrinter(p, { print_ticket: !ticket })} disabled={busy}
                      style={{ ...sel, flex: 1, textAlign: "left", fontWeight: 700, cursor: "pointer",
                        background: ticket ? "rgba(186,117,23,.12)" : T.bg, color: ticket ? "#854F0B" : T.muted }}>
                      {ticket ? "On" : "Off"}
                    </button>
                    {ticket && (
                      <button onClick={() => updatePrinter(p, { auto_ticket: !autoTicket })} disabled={busy}
                        title="When this slip prints. Tap to change."
                        style={{ ...sel, width: 118, textAlign: "center", fontWeight: 700, cursor: "pointer",
                          background: T.bg, color: autoTicket ? T.accent : T.muted }}>
                        {autoTicket ? "Every order" : "When asked"}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div style={fieldLab}>Full receipt</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => updatePrinter(p, { print_receipt: !receipt })} disabled={busy}
                      style={{ ...sel, flex: 1, textAlign: "left", fontWeight: 700, cursor: "pointer",
                        background: receipt ? "rgba(15,110,86,.12)" : T.bg, color: receipt ? "#0F6E56" : T.muted }}>
                      {receipt ? "On" : "Off"}
                    </button>
                    {/* "On | Auto" sat as two equal buttons and read as one
                        two-way choice between being on and being automatic,
                        which is not what either does. Saying when the slip
                        prints cannot be misread as an alternative to On. */}
                    {receipt && (
                      <button onClick={() => updatePrinter(p, { auto_receipt: !autoReceipt })} disabled={busy}
                        title="When this slip prints. Tap to change."
                        style={{ ...sel, width: 118, textAlign: "center", fontWeight: 700, cursor: "pointer",
                          background: T.bg, color: autoReceipt ? T.accent : T.muted }}>
                        {autoReceipt ? "Every order" : "When asked"}
                      </button>
                    )}
                  </div>
                </div>
                </div>

                {/* Remove used to be a bare × sitting against Settings on the
                    row, one mis-tap from unregistering a working printer. It
                    lives in here now, which you have to open on purpose. */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid " + T.line, paddingTop: 11, marginTop: 2 }}>
                  {/* The serial in full. It is what the agent config on the
                      till has to match, so it needs to be readable and
                      selectable, not ellipsed into a row. */}
                  <span style={{ fontSize: 11.5, color: T.faint }}>
                    Serial <span style={{ fontFamily: "monospace", color: T.muted, userSelect: "all" }}>{p.sn}</span>
                    {p.last_online_at && <span> · last heard from {agoText(p.last_online_at)}</span>}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button disabled={busy} onClick={() => removePrinter(p)}
                    style={{ fontSize: 12.5, fontWeight: 600, color: T.danger, background: "none", border: "1px solid rgba(178,59,59,.3)", borderRadius: 9, padding: "7px 12px", cursor: "pointer" }}>
                    Remove this printer
                  </button>
                </div>
              </div>
              )}
            </div>
            );
          })}
            </div>
          </div>
          );
        })}

        {/* ADD */}
        {!adding && (
          <button onClick={() => { setAdding(true); setMsg(""); }} style={{ fontSize: 14, fontWeight: 600, color: "#fff", background: T.accent, border: "none", borderRadius: 10, padding: "11px 18px", cursor: "pointer" }}>+ Add a printer</button>
        )}
        {adding && (
          <div style={{ background: T.card, borderRadius: 14, border: "1px solid " + T.line, padding: 18 }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16, color: T.ink, marginBottom: 14 }}>New printer</div>

            <label style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: ".05em" }}>Serial number</label>
            <div style={{ display: "flex", gap: 8, marginTop: 6, marginBottom: 4 }}>
              <input value={form.sn} onChange={(e) => setForm({ ...form, sn: e.target.value })} placeholder="e.g. N450263A10230"
                style={{ flex: 1, fontSize: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid " + T.line, background: T.bg, color: T.ink, fontFamily: "monospace" }} />
              <button onClick={() => setScan((s) => !s)} style={{ fontSize: 13, fontWeight: 600, color: T.accent, background: T.bg, border: "1px solid " + T.line, borderRadius: 10, padding: "0 14px", cursor: "pointer", whiteSpace: "nowrap" }}>{scan ? "Stop" : "Scan QR"}</button>
            </div>
            {scan && <QrScanField onDetect={(sn) => { setForm((f) => ({ ...f, sn })); setScan(false); }} onClose={() => setScan(false)} />}

            <label style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginTop: 14 }}>Name (optional)</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. London Road Kitchen"
              style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid " + T.line, background: T.bg, color: T.ink, marginTop: 6 }} />

            <label style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginTop: 14 }}>Store</label>
            <select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid " + T.line, background: T.bg, color: T.ink, marginTop: 6 }}>
              <option value="">— choose a store —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>

            <label style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginTop: 14 }}>Station</label>
            <select value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid " + T.line, background: T.bg, color: T.ink, marginTop: 6 }}>
              <option value="kitchen">Kitchen (food)</option>
              <option value="counter">Counter / bar (drinks)</option>
            </select>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button disabled={busy} onClick={addPrinter} style={{ fontSize: 14, fontWeight: 600, color: "#fff", background: T.accent, border: "none", borderRadius: 10, padding: "11px 20px", cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "Binding…" : "Add printer"}</button>
              <button disabled={busy} onClick={() => { setAdding(false); setScan(false); setForm({ sn: "", label: "", location_id: "", station: "kitchen" }); setMsg(""); }} style={{ fontSize: 14, fontWeight: 600, color: T.muted, background: "none", border: "1px solid " + T.line, borderRadius: 10, padding: "11px 20px", cursor: "pointer" }}>Cancel</button>
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 12 }}>Adding binds the printer to your Sunmi account. If it's a brand-new unit, accept the transfer in the Sunmi portal first.</div>
          </div>
        )}
      </div>
    </div>
  );
}


// ── COVERAGE ────────────────────────────────────────────
// Items down, stores across. At four stores you can open each store dialog in
// turn; at 26 you cannot, and nobody can answer "which stores sell Turkish
// Eggs?" without four screens. Read-only on purpose: it shows WHY an item is
// not on sale, and you change it in Stores or Pricing.
function CoverageView({ state, T, money, act }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("all");
  const [selItems, setSelItems] = useState(() => new Set());
  const [selLocs, setSelLocs] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const locs = (state.locations || []).filter((l) => l.active);
  const ovs = state.overrides || [];
  const items = state.items || [];
  const catById = new Map((state.categories || []).map((c) => [c.id, c]));
  const now = new Date();

  const ovFor = (locId, itemId) => ovs.find((o) => o.location_id === locId && o.item_id === itemId);

  const cellFor = (loc, it) => {
    if (it.published === false) return { k: "unpub", label: "—", title: "Unpublished centrally — change in Menus" };
    const o = ovFor(loc.id, it.id);
    if (o && o.unavailable_until && new Date(o.unavailable_until) > now) {
      return { k: "off", label: "86", title: "Off today, back " + new Date(o.unavailable_until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    }
    if (o && o.available === false) return { k: "no", label: "×", title: "Not carried here — click to carry" };
    if (o && o.price != null) return { k: "price", label: money(o.price), title: "Own price · master " + money(it.price) + " — click to stop carrying" };
    return { k: "yes", label: "✓", title: "Carried — click to stop carrying" };
  };

  const style = {
    yes:   { c: T.faint,   b: "transparent" },
    price: { c: "#2f6b3f", b: "#eef3ea" },
    off:   { c: "#8a5a2b", b: "#fdf1e7" },
    no:    { c: "#8a3b3b", b: "#f6eaea" },
    unpub: { c: T.faint,   b: "transparent" },
  };

  const needle = q.trim().toLowerCase();
  const rows = items
    .filter((it) => !needle || it.name.toLowerCase().includes(needle))
    .filter((it) => only === "all" || locs.some((l) => cellFor(l, it).k === only))
    .sort((a, b) => {
      const ca = (catById.get(a.category_id) || {}).name || "";
      const cb = (catById.get(b.category_id) || {}).name || "";
      return ca.localeCompare(cb) || a.name.localeCompare(b.name);
    });

  const tally = (k) => locs.reduce((n, l) => n + items.filter((it) => cellFor(l, it).k === k).length, 0);

  const apply = async (mode, itemIds, locIds) => {
    if (!itemIds.length || !locIds.length || busy) return;
    setBusy(true);
    try {
      // act() reloads state on success, so the grid repaints itself.
      await act("bulk_set_availability", { item_ids: itemIds, location_ids: locIds, mode });
    } finally { setBusy(false); }
  };

  // One cell click flips that single item at that single store.
  const toggleCell = (loc, it) => {
    const c = cellFor(loc, it);
    if (c.k === "unpub") return;
    apply(c.k === "no" ? "carry" : "dont_carry", [it.id], [loc.id]);
  };

  const toggleItem = (id) => setSelItems((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleLoc  = (id) => setSelLocs((p)  => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSel = () => { setSelItems(new Set()); setSelLocs(new Set()); };

  const selectCategory = (catName) => {
    const ids = rows.filter((it) => ((catById.get(it.category_id) || {}).name || "Uncategorised") === catName).map((it) => it.id);
    setSelItems((p) => {
      const n = new Set(p);
      const allIn = ids.every((i) => n.has(i));
      ids.forEach((i) => allIn ? n.delete(i) : n.add(i));
      return n;
    });
  };

  const chip = (key, label, n) => (
    <span onClick={() => setOnly(only === key ? "all" : key)}
      style={{ fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "6px 13px", borderRadius: 20,
        color: only === key ? "#fff" : style[key].c,
        background: only === key ? style[key].c : style[key].b,
        border: "1px solid " + (only === key ? "transparent" : T.line) }}>{n} {label}</span>
  );

  const btn = (label, colour, onClick) => (
    <span onClick={onClick} style={{ fontSize: 12.5, fontWeight: 700, cursor: busy ? "wait" : "pointer", padding: "8px 14px", borderRadius: 9, color: "#fff", background: colour, opacity: busy ? .5 : 1 }}>{label}</span>
  );

  const grid = "26px minmax(0,1fr) repeat(" + locs.length + ", 96px)";
  const itemIds = [...selItems];
  const locIds = selLocs.size ? [...selLocs] : locs.map((l) => l.id);
  const allLocs = selLocs.size === 0;
  let lastCat = null;

  return (
    <div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 26, marginBottom: 4 }}>Network menu</div>
      <div style={{ fontSize: 13.5, color: T.muted, marginBottom: 18 }}>Every item, every store, on one screen. Click a cell to turn one item on or off at one store — or tick items and stores and change them all at once.</div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…"
          style={{ border: "1px solid " + T.line, borderRadius: 9, padding: "9px 13px", fontSize: 13.5, background: T.card, color: T.ink, minWidth: 200 }} />
        {chip("price", "own price", tally("price"))}
        {chip("off", "off today", tally("off"))}
        {chip("no", "not carried", tally("no"))}
        {only !== "all" && <span onClick={() => setOnly("all")} style={{ fontSize: 12.5, color: T.accent, cursor: "pointer", fontWeight: 600 }}>Clear filter</span>}
      </div>

      {selItems.size > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#2f3326", color: "#fff", borderRadius: 12, padding: "13px 16px", marginBottom: 14 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>
            {selItems.size} item{selItems.size === 1 ? "" : "s"} · {allLocs ? "all " + locs.length + " stores" : selLocs.size + " store" + (selLocs.size === 1 ? "" : "s")}
          </span>
          <span style={{ flex: 1 }} />
          {btn("Carry", "#4f7a3a", () => apply("carry", itemIds, locIds))}
          {btn("Off today", "#b57628", () => apply("off_today", itemIds, locIds))}
          {btn("Stop carrying", "#a34a4a", () => apply("dont_carry", itemIds, locIds))}
          <span onClick={clearSel} style={{ fontSize: 12.5, color: "#c9cbbf", cursor: "pointer", fontWeight: 600 }}>Clear</span>
        </div>
      )}

      <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: grid, padding: "10px 14px", background: T.bg, borderBottom: "1px solid " + T.line, alignItems: "center" }}>
          <span />
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".8px", color: T.faint }}>ITEM</span>
          {locs.map((l) => (
            <span key={l.id} onClick={() => toggleLoc(l.id)} title={"Click to select " + l.name}
              style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".8px", textAlign: "center", cursor: "pointer",
                color: selLocs.has(l.id) ? "#fff" : T.faint, background: selLocs.has(l.id) ? T.accent : "transparent",
                borderRadius: 6, padding: "4px 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {l.name.replace(/^Chocoberry\s*—?\s*/i, "").toUpperCase()}
            </span>
          ))}
        </div>

        {rows.map((it) => {
          const cat = (catById.get(it.category_id) || {}).name || "Uncategorised";
          const header = cat !== lastCat ? cat : null;
          lastCat = cat;
          const picked = selItems.has(it.id);
          return (
            <Fragment key={it.id}>
              {header && (
                <div onClick={() => selectCategory(cat)} title="Click to select every item in this category"
                  style={{ padding: "8px 14px", background: T.bg, fontSize: 12.5, fontWeight: 700, color: T.ink, borderTop: "1px solid " + T.line, cursor: "pointer" }}>
                  {header}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: grid, padding: "9px 14px", borderTop: "1px solid " + T.line, alignItems: "center", background: picked ? "#f4f7f0" : "transparent" }}>
                <input type="checkbox" checked={picked} onChange={() => toggleItem(it.id)} style={{ cursor: "pointer" }} />
                <span style={{ fontSize: 13.5, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>
                  {it.name}<span style={{ fontSize: 11.5, color: T.faint, marginLeft: 8 }}>{money(it.price)}</span>
                </span>
                {locs.map((l) => {
                  const c = cellFor(l, it);
                  return (
                    <span key={l.id} title={c.title} onClick={() => toggleCell(l, it)}
                      style={{ textAlign: "center", fontSize: c.k === "price" ? 12 : 13, fontWeight: c.k === "yes" ? 400 : 700,
                        color: style[c.k].c, background: style[c.k].b, borderRadius: 6, padding: "4px 0",
                        cursor: c.k === "unpub" ? "default" : "pointer" }}>{c.label}</span>
                  );
                })}
              </div>
            </Fragment>
          );
        })}
        {rows.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 13.5, color: T.muted }}>Nothing matches.</div>}
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 12, color: T.muted, flexWrap: "wrap" }}>
        <span>✓ carried</span>
        <span style={{ color: "#2f6b3f" }}>£ own price</span>
        <span style={{ color: "#8a5a2b" }}>86 off today</span>
        <span style={{ color: "#8a3b3b" }}>× not carried</span>
        <span>— unpublished centrally</span>
        <span style={{ marginLeft: "auto" }}>Tip: click a category name to select everything in it.</span>
      </div>
    </div>
  );
}


// ── MENU BANDS ───────────────────────────────────
// A band is a format shared by several stores: "Dessert only", "Dessert +
// cafe", "Breakfast". Set what the band carries once and every store on it
// follows, so most stores need no store-level rows at all.
//
// Silence matters. A band row that merely repeats the base menu blocks that
// item from ever inheriting a change — the same trap as typing the master
// price into a store price box. "Follows base" is the correct resting state.
function MenuBands({ state, T, act, money }) {
  // NOTE: the load endpoint returns bands as `priceBands`, not `bands`.
  // Reading the wrong key left this screen with an empty dropdown, a null
  // band id, and every button silently doing nothing.
  const allBands = state.priceBands || [];
  // Only menu-kind bands. Price bands (Master, TOP Tier) belong to Pricing —
  // mixing them here lets a menu change land on a price list by accident.
  const bands = allBands.filter((b) => b.band_kind === "menu" || b.band_kind === "both");
  const locs = (state.locations || []).filter((l) => l.active);
  const items = state.items || [];
  const menus = state.menus || [];
  const catById = new Map((state.categories || []).map((c) => [c.id, c]));
  const bandItems = state.bandItems || [];
  const bandMenus = state.bandMenus || [];

  const [bandId, setBandId] = useState(null);
  const [tab, setTab] = useState("items");
  const [q, setQ] = useState("");
  const [diffOnly, setDiffOnly] = useState(false);
  const [cat, setCat] = useState("all");
  // Which row has its per-store panel open. A band sets the default for every
  // store on it; this is the escape hatch for the one store that differs,
  // without leaving the screen you are already on.
  const [perStore, setPerStore] = useState(null);
  const overrides = state.overrides || [];
  const ovFor = (itemId, locId) => overrides.find((o) => o.item_id === itemId && o.location_id === locId);

  useEffect(() => {
    if (bandId && bands.some((b) => b.id === bandId)) return;
    if (bands[0]) setBandId(bands[0].id);
  }, [bands.length]); // eslint-disable-line

  const band = bands.find((b) => b.id === (bandId || (bands[0] ? bands[0].id : null)));
  const effBandId = bandId || (bands[0] ? bands[0].id : null);
  const onBand = effBandId ? locs.filter((l) => l.menu_band_id === effBandId) : [];
  const biFor = (itemId) => bandItems.find((r) => r.band_id === effBandId && r.item_id === itemId);
  const bmOn = (menuId) => bandMenus.some((r) => r.band_id === effBandId && r.menu_id === menuId);
  const anyMenuRows = bandMenus.some((r) => r.band_id === effBandId);

  // Errors surface ON THIS SCREEN. act() swallows failures into a global
  // message that is easy to miss, which is how this screen looked "dead"
  // while it was actually being rejected.
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (action, payload) => {
    const id = bandId || (bands[0] ? bands[0].id : null);
    if (!id) { setErr("No menu band exists yet — create one above."); return; }
    setErr(""); setBusy(true);
    // act() catches its own errors and never rethrows, so there is nothing to
    // catch here — it reports failures through the admin's own message line.
    await act(action, { ...payload, band_id: id });
    setBusy(false);
  };

  const setItem = (itemId, available) => send("set_band_item", { band_id: bandId, item_id: itemId, available });
  const setMenu = (menuId, on) => send("set_band_menu", { band_id: bandId, menu_id: menuId, on });

  const cats = [...new Set(items.map((it) => (catById.get(it.category_id) || {}).name || "Uncategorised"))].sort();
  const needle = q.trim().toLowerCase();
  const rows = items
    .filter((it) => !needle || it.name.toLowerCase().includes(needle))
    .filter((it) => cat === "all" || ((catById.get(it.category_id) || {}).name || "Uncategorised") === cat)
    .filter((it) => !diffOnly || biFor(it.id))
    .sort((a, b) => {
      const ca = (catById.get(a.category_id) || {}).name || "";
      const cb = (catById.get(b.category_id) || {}).name || "";
      return ca.localeCompare(cb) || a.name.localeCompare(b.name);
    });

  const nOff = bandItems.filter((r) => r.band_id === effBandId && r.available === false).length;

  // Turn a whole category off in one go — the common case is "this format
  // does not do breakfast", not twenty individual decisions.
  const setCategory = async (catName, available) => {
    const bid = bandId || (bands[0] ? bands[0].id : null);
    if (!bid) { setErr("No menu band exists yet."); return; }
    const ids = items.filter((it) => ((catById.get(it.category_id) || {}).name || "Uncategorised") === catName).map((it) => it.id);
    setErr(""); setBusy(true);
    try { for (const id of ids) await act("set_band_item", { band_id: bid, item_id: id, available }); }
    catch (e) { setErr(e && e.message ? e.message : "That didn't save."); }
    setBusy(false);
  };

  const seg = (on) => ({
    fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "7px 15px", borderRadius: 8,
    background: on ? T.accent : "transparent", color: on ? "#fff" : T.muted,
  });

  if (!bands.length) {
    return (
      <div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 26, marginBottom: 6 }}>Band menus</div>
        <div style={{ fontSize: 14, color: T.muted, marginBottom: 16, maxWidth: 620 }}>
          No menu bands yet. A menu band is a format several stores share — "Dessert only", "Dessert + cafe".
          It is separate from a price band: a store can share this format and still charge its own prices.
        </div>
        <span onClick={async () => { const n = window.prompt("Name the new format band, e.g. Dessert + cafe:"); if (n && n.trim()) await act("band_create", { name: n.trim(), band_kind: "menu", brand_id: activeBrandId }); }}
          style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", background: T.accent, cursor: "pointer", borderRadius: 9, padding: "11px 18px" }}>+ Create a menu band</span>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 26, marginBottom: 4 }}>Band menus</div>
      <div style={{ fontSize: 13.5, color: T.muted, marginBottom: 18, maxWidth: 760 }}>
        A band is a menu format several stores share — "Dessert only", "Dessert + cafe". Set what it carries once here, and every store on the band follows. Most stores then need no settings of their own.
      </div>

      {/* STEP 1 — pick a band */}
      <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".7px", marginBottom: 9 }}>1 · WHICH BAND</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={bandId || (bands[0] ? bands[0].id : "")} onChange={(e) => setBandId(e.target.value || null)}
            style={{ border: "1px solid " + T.line, borderRadius: 9, padding: "10px 13px", fontSize: 14, fontWeight: 600, background: T.bg, color: T.ink, minWidth: 220 }}>
            {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span onClick={async () => { const n = window.prompt("Name the new format band, e.g. Dessert + cafe:"); if (n && n.trim()) await act("band_create", { name: n.trim(), band_kind: "menu", brand_id: activeBrandId }); }}
            style={{ fontSize: 13, fontWeight: 700, color: T.accent, cursor: "pointer", border: "1px dashed " + T.line, borderRadius: 9, padding: "9px 14px" }}>+ New band</span>
        </div>

        {band && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, background: "#f6eaea", color: "#8a3b3b", padding: "5px 11px", borderRadius: 20, fontWeight: 600 }}>{nOff} not carried</span>
            <span style={{ fontSize: 12, background: T.bg, color: T.muted, padding: "5px 11px", borderRadius: 20 }}>{items.length - nOff} follow base</span>
            <span style={{ fontSize: 12, background: onBand.length ? "#eef3ea" : T.bg, color: onBand.length ? T.accent : T.faint, padding: "5px 11px", borderRadius: 20, fontWeight: onBand.length ? 600 : 400 }}>
              {onBand.length ? onBand.map((l) => l.name).join(", ") : "no stores on this band"}
            </span>
            {!onBand.length && <span onClick={() => setTab("stores")} style={{ fontSize: 12.5, color: T.accent, cursor: "pointer", fontWeight: 600 }}>Add stores →</span>}
          </div>
        )}
        {!band && (
          <div style={{ fontSize: 12.5, color: "#b4462f", marginTop: 10, fontWeight: 600 }}>
            No band selected — {bands.length} band{bands.length === 1 ? "" : "s"} loaded. Pick one from the list above.
          </div>
        )}
        {err && (
          <div style={{ fontSize: 13, color: "#8a3b3b", background: "#f6eaea", border: "1px solid #e8cfcf", borderRadius: 9, padding: "10px 13px", marginTop: 10, fontWeight: 600 }}>
            {err}
          </div>
        )}
        {busy && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>Saving…</div>}
      </div>

      {/* STEP 2 — what to change */}
      <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".7px", marginBottom: 9 }}>2 · WHAT TO SET</div>
        <div style={{ display: "flex", background: T.bg, borderRadius: 10, padding: 3, gap: 2, width: "fit-content" }}>
          <span onClick={() => setTab("items")} style={seg(tab === "items")}>Items</span>
          <span onClick={() => setTab("sections")} style={seg(tab === "sections")}>Whole sections</span>
          <span onClick={() => setTab("stores")} style={seg(tab === "stores")}>Stores using it</span>
        </div>
      </div>

      {onBand.length > 1 && tab !== "stores" && (
        <div style={{ fontSize: 12.5, color: "#8a5a2b", background: "#fdf1e7", border: "1px solid #f0d9c2", borderRadius: 9, padding: "10px 14px", marginBottom: 12 }}>
          Heads up — this changes {onBand.length} stores at once: {onBand.map((l) => l.name).join(", ")}
        </div>
      )}

      {tab === "stores" && (
        <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Tick the stores that use this format. Untick to put a store back on the full base menu.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {locs.map((l) => {
              const here = l.menu_band_id === effBandId;
              return (
                <span key={l.id} onClick={() => act("set_menu_band", { location_id: l.id, band_id: here ? null : effBandId })}
                  style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 15px", borderRadius: 10, fontSize: 14,
                    fontWeight: here ? 700 : 400, background: here ? "#eef3ea" : T.bg, color: here ? T.accent : T.muted,
                    border: "1px solid " + (here ? "#d9e6d2" : T.line) }}>
                  <span style={{ fontSize: 16 }}>{here ? "☑" : "☐"}</span>{l.name}
                </span>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: T.faint, marginTop: 16, borderTop: "1px solid " + T.line, paddingTop: 13 }}>
            A store's own settings still win over the band. Prices are separate — set those under Pricing.
          </div>
        </div>
      )}

      {tab === "sections" && (
        <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "13px 16px", fontSize: 13, color: T.muted, borderBottom: "1px solid " + T.line }}>
            {anyMenuRows
              ? "Only the ticked sections appear at these stores."
              : "Nothing ticked, so this band carries every section. Tick the ones it should carry to make it a set list."}
          </div>
          {menus.map((m) => (
            <div key={m.id} onClick={() => setMenu(m.id, !bmOn(m.id))}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: "1px solid " + T.line, cursor: "pointer" }}>
              <span style={{ fontSize: 17, color: bmOn(m.id) ? T.accent : T.faint }}>{bmOn(m.id) ? "☑" : "☐"}</span>
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: bmOn(m.id) ? 600 : 400, color: T.ink }}>{m.name}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: anyMenuRows && !bmOn(m.id) ? "#8a3b3b" : "#2f6b3f" }}>
                {anyMenuRows ? (bmOn(m.id) ? "Carried" : "Not carried") : "Carried"}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "items" && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…"
              style={{ border: "1px solid " + T.line, borderRadius: 9, padding: "10px 13px", fontSize: 14, background: T.card, color: T.ink, minWidth: 190 }} />
            <select value={cat} onChange={(e) => setCat(e.target.value)}
              style={{ border: "1px solid " + T.line, borderRadius: 9, padding: "10px 12px", fontSize: 13.5, background: T.card, color: T.ink }}>
              <option value="all">All categories</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span onClick={() => setDiffOnly((v) => !v)}
              style={{ fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "9px 14px", borderRadius: 20,
                color: diffOnly ? "#fff" : T.accent, background: diffOnly ? T.accent : "transparent",
                border: "1px solid " + (diffOnly ? T.accent : T.line) }}>
              {diffOnly ? "Showing changes only" : "Show changes only"}
            </span>
            <span style={{ fontSize: 12.5, color: T.faint }}>{rows.length} of {items.length}</span>
            {cat !== "all" && (
              <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: T.muted }}>All of {cat}:</span>
                <span onClick={() => setCategory(cat, null)} style={{ fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: T.accent, border: "1px solid " + T.line, borderRadius: 8, padding: "7px 12px" }}>Carry</span>
                <span onClick={() => { if (window.confirm("Stop carrying every item in " + cat + " on this band?")) setCategory(cat, false); }}
                  style={{ fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: "#a34a4a", border: "1px solid " + T.line, borderRadius: 8, padding: "7px 12px" }}>Don't carry</span>
              </span>
            )}
          </div>

          <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 190px 130px", padding: "11px 16px", background: T.bg, borderBottom: "1px solid " + T.line }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".8px", color: T.faint }}>ITEM</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".8px", color: T.faint, textAlign: "center" }}>DOES THIS BAND CARRY IT?</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".8px", color: T.faint, textAlign: "right" }}>AT THESE STORES</span>
            </div>

            {rows.map((it) => {
              const bi = biFor(it.id);
              const says = bi ? bi.available : null;
              const baseOn = it.available !== false && it.published !== false;
              const result = says === null ? baseOn : says;
              return (
                <Fragment key={it.id}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 190px 130px", padding: "10px 16px", borderTop: "1px solid " + T.line, alignItems: "center", background: says === false ? "#fdf6f6" : "transparent" }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 14, color: result ? T.ink : T.muted, textDecoration: result ? "none" : "line-through" }}>{it.name}</span>
                    <span style={{ fontSize: 11.5, color: T.faint, marginLeft: 8 }}>
                      {(catById.get(it.category_id) || {}).name}{!baseOn ? " · off everywhere" : ""}
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                    <span onClick={() => setItem(it.id, says === null ? false : null)}
                      style={{ fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "7px 13px", borderRadius: 8,
                        color: says === false ? "#fff" : T.muted,
                        background: says === false ? "#a34a4a" : "transparent",
                        border: "1px solid " + (says === false ? "#a34a4a" : T.line) }}>
                      {says === false ? "Not carried" : "Stop carrying"}
                    </span>
                  </span>
                  <span onClick={() => setPerStore(perStore === it.id ? null : it.id)}
                    title="Set this item store by store"
                    style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right", color: result ? "#2f6b3f" : "#8a3b3b", cursor: "pointer", userSelect: "none" }}>
                    {result ? "On sale" : "Hidden"} <span style={{ color: T.faint, fontWeight: 700 }}>{perStore === it.id ? "▴" : "▾"}</span>
                  </span>
                </div>
                {perStore === it.id && (
                  <div style={{ padding: "4px 16px 14px", background: T.bg, borderTop: "1px dashed " + T.line }}>
                    {it.published === false ? (
                      // published is a hard gate: store_menu_full joins on it,
                      // so an unpublished item cannot be brought back by any
                      // store or band setting. Say so rather than offering
                      // buttons that would look like they worked.
                      <div style={{ fontSize: 12.5, color: "#8a3b3b", padding: "10px 0", fontWeight: 600 }}>
                        This item is unpublished, so it is off everywhere and no store setting can bring it back. Publish it in Overview first — the per-store settings below are kept and take effect the moment you do.
                      </div>
                    ) : null}
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: T.faint, padding: "8px 0 6px" }}>THIS ITEM, STORE BY STORE</div>
                    {onBand.length === 0 && <div style={{ fontSize: 12.5, color: T.muted, paddingBottom: 8 }}>No stores are on this band yet.</div>}
                    {onBand.map((l) => {
                      const ov = ovFor(it.id, l.id);
                      const has = ov && ov.available != null;
                      const now = has ? ov.available : (says === null ? (it.available !== false) : says);
                      const set = (v) => act("set_override", { item_id: it.id, location_id: l.id, price: ov ? ov.price : null, available: v });
                      const pill = (label, on, onClick, colour) => (
                        <span onClick={onClick} style={{ fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "6px 12px", borderRadius: 8,
                          color: on ? "#fff" : T.muted, background: on ? colour : "transparent",
                          border: "1px solid " + (on ? colour : T.line) }}>{label}</span>
                      );
                      return (
                        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: now ? T.ink : T.muted }}>{l.name}</span>
                          {!has && <span style={{ fontSize: 11.5, color: T.faint, marginRight: 2 }}>follows the band</span>}
                          {pill("Follow band", !has, () => set(null), "#5a6b4a")}
                          {pill("On sale", has && now === true, () => set(true), "#4f7a3a")}
                          {pill("Hidden", has && now === false, () => set(false), "#a34a4a")}
                        </div>
                      );
                    })}
                  </div>
                )}
                </Fragment>
              );
            })}
            {rows.length === 0 && <div style={{ padding: 26, textAlign: "center", fontSize: 13.5, color: T.muted }}>Nothing matches.</div>}
          </div>

          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 12 }}>
            Everything is carried unless you say otherwise. Click <b>Stop carrying</b> to hide an item at every store on this band; click again to put it back. To change one store only, click its result under <b>At these stores</b> and set that store on its own — a store setting always beats the band.
          </div>
        </>
      )}
    </div>
  );
}


// ── PRINT ROUTING ───────────────────────────────────────────────────────────
// Which printer makes which item. sunmi-print resolves every line as:
//     item.station  ->  its category.station  ->  kitchen
// Both columns already existed; nothing could set them. Setting a whole
// category is the normal case ("all drinks go to the bar"); the per-item
// override is for the odd exception.
function PrintRouting({ state, T, act }) {
  // Routing is now PRINTER -> CATEGORIES, not item -> station. Each printer
  // that prints tickets says which parts of the menu it makes. Printers do not
  // compete: two of them can both cover Shakes and both will print them.
  const printers = (state.printers || []).filter((p) => p.active);
  const cats = (state.categories || []).filter((c) => c.active !== false);
  const menus = state.menus || [];
  const menuById = new Map(menus.map((m) => [m.id, m]));
  const pcRows = state.printerCategories || [];

  const ticketPrinters = printers.filter((p) => {
    const legacy = (p.print_role || "station") === "receipt";
    return p.print_ticket ?? !legacy;
  });

  const [sel, setSel] = useState(() => (ticketPrinters[0] || {}).sn || null);
  const [openCat, setOpenCat] = useState(null);
  const allItems = state.items || [];
  const piRows = state.printerItems || [];
  const itemsIn = (cid) => allItems.filter((it) => it.category_id === cid && it.published !== false);
  const excFor = (iid) => piRows.find((r) => r.printer_sn === sel && String(r.item_id) === String(iid));
  useEffect(() => {
    if (sel && ticketPrinters.some((p) => p.sn === sel)) return;
    if (ticketPrinters[0]) setSel(ticketPrinters[0].sn);
  }, [ticketPrinters.length]); // eslint-disable-line

  const printer = ticketPrinters.find((p) => p.sn === sel);
  const covered = new Set(pcRows.filter((r) => r.printer_sn === sel).map((r) => String(r.category_id)));
  const coversAll = covered.size === 0;

  const grouped = [...menus]
    .map((m) => ({ menu: m, rows: cats.filter((c) => c.menu_id === m.id) }))
    .filter((g) => g.rows.length);

  const save = (ids) => act("set_printer_categories", { printer_sn: sel, category_ids: ids });
  const toggle = (cid) => {
    // "Covers everything" is stored as NO rows. The first tick therefore has to
    // start from every category and remove one, or the printer would silently
    // drop the rest of the menu.
    const base = coversAll ? cats.map((c) => String(c.id)) : [...covered];
    const next = base.includes(String(cid)) ? base.filter((x) => x !== String(cid)) : [...base, String(cid)];
    save(next.length === cats.length ? [] : next);
  };
  const setMenuAll = (g, on) => {
    const base = coversAll ? cats.map((c) => String(c.id)) : [...covered];
    const ids = g.rows.map((c) => String(c.id));
    const next = on ? [...new Set([...base, ...ids])] : base.filter((x) => !ids.includes(x));
    save(next.length === cats.length ? [] : next);
  };

  if (!ticketPrinters.length) {
    return (
      <div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 26, marginBottom: 6 }}>Printing</div>
        <div style={{ fontSize: 14, color: T.muted, maxWidth: 620 }}>
          No printer is set to print kitchen tickets. Turn on <b>Kitchen ticket</b> for a printer under Printers, then come back here to choose what it makes.
        </div>
      </div>
    );
  }

  const tab = (p) => {
    const on = p.sn === sel;
    const n = new Set(pcRows.filter((r) => r.printer_sn === p.sn).map((r) => r.category_id)).size;
    return (
      <span key={p.sn} onClick={() => setSel(p.sn)}
        style={{ cursor: "pointer", padding: "10px 15px", borderRadius: 11, fontSize: 13.5, fontWeight: on ? 700 : 500,
          background: on ? T.accent : T.card, color: on ? "#fff" : T.ink, border: "1px solid " + (on ? T.accent : T.line) }}>
        {p.label || p.sn}
        <span style={{ fontSize: 11.5, opacity: .8, marginLeft: 7 }}>{n === 0 ? "everything" : n + " categories"}</span>
      </span>
    );
  };

  return (
    <div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 26, marginBottom: 4 }}>Printing</div>
      <div style={{ fontSize: 13.5, color: T.muted, marginBottom: 16, maxWidth: 780 }}>
        Which parts of the menu each printer makes. Printers are independent — tick the same category on two printers and both will print it.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>{ticketPrinters.map(tab)}</div>

      {printer && (
        <>
          <div style={{ background: coversAll ? "#EAF3DE" : T.card, border: "1px solid " + (coversAll ? "#C0DD97" : T.line), borderRadius: 12, padding: "13px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 13.5, color: coversAll ? "#3B6D11" : T.ink, fontWeight: 600 }}>
              {coversAll
                ? printer.label + " prints every category"
                : printer.label + " prints " + covered.size + " of " + cats.length + " categories"}
            </div>
            {!coversAll && (
              <span onClick={() => save([])} style={{ fontSize: 12.5, color: T.accent, cursor: "pointer", fontWeight: 600 }}>Reset to everything</span>
            )}
          </div>

          <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, overflow: "hidden" }}>
            {grouped.map((g, gi) => {
              const ids = g.rows.map((c) => String(c.id));
              const allOn = coversAll || ids.every((i) => covered.has(i));
              return (
                <Fragment key={g.menu.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 15px", background: T.bg, borderTop: gi ? "1px solid " + T.line : "none" }}>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: T.ink }}>{g.menu.name}</span>
                    <span onClick={() => setMenuAll(g, !allOn)} style={{ fontSize: 12, fontWeight: 600, color: T.accent, cursor: "pointer" }}>
                      {allOn ? "Clear all" : "Select all"}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 15px" }}>
                    {g.rows.map((c) => {
                      const on = coversAll || covered.has(String(c.id));
                      return (
                        <span key={c.id}
                          style={{ display: "inline-flex", alignItems: "center", borderRadius: 10, fontSize: 13.5,
                            fontWeight: on ? 600 : 400,
                            background: on ? "#EEF3EA" : T.bg,
                            color: on ? T.accent : T.muted,
                            border: "1px solid " + (openCat === c.id ? T.accent : (on ? "#D9E6D2" : T.line)) }}>
                          <span onClick={() => toggle(c.id)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 4px 8px 13px" }}>
                            <span style={{ fontSize: 15 }}>{on ? "☑" : "☐"}</span>{c.name}
                          </span>
                          <span onClick={() => setOpenCat(openCat === c.id ? null : c.id)} title="Per-item exceptions"
                            style={{ cursor: "pointer", padding: "8px 11px 8px 7px", fontSize: 11.5, opacity: .85 }}>
                            {itemsIn(c.id).filter((it) => excFor(it.id)).length || "⋯"}
                          </span>
                        </span>
                      );
                    })}
                  </div>

                  {g.rows.some((c) => c.id === openCat) && (() => {
                    const c = g.rows.find((x) => x.id === openCat);
                    const catOn = coversAll || covered.has(String(c.id));
                    return (
                      <div style={{ margin: "0 15px 14px", background: T.bg, border: "1px solid " + T.line, borderRadius: 11, padding: "12px 14px" }}>
                        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 10 }}>
                          Exceptions in <b>{c.name}</b> — this category is {catOn ? "printed" : "not printed"} here, so anything you tick below goes against it.
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                          {itemsIn(c.id).map((it) => {
                            const e = excFor(it.id);
                            const effective = e ? e.include : catOn;
                            return (
                              <span key={it.id}
                                onClick={() => act("set_printer_item", { printer_sn: sel, item_id: it.id, state: e ? null : (catOn ? "off" : "on") })}
                                style={{ cursor: "pointer", padding: "7px 12px", borderRadius: 9, fontSize: 12.5,
                                  fontWeight: e ? 700 : 400,
                                  background: e ? (effective ? "#EAF3DE" : "#FCEBEB") : T.card,
                                  color: e ? (effective ? "#3B6D11" : "#A32D2D") : T.muted,
                                  border: "1px solid " + (e ? (effective ? "#C0DD97" : "#F7C1C1") : T.line) }}>
                                {it.name}
                                {e && <span style={{ marginLeft: 6, fontSize: 11 }}>{effective ? "prints" : "skipped"}</span>}
                              </span>
                            );
                          })}
                          {itemsIn(c.id).length === 0 && <span style={{ fontSize: 12.5, color: T.faint }}>No items in this category.</span>}
                        </div>
                      </div>
                    );
                  })()}
                </Fragment>
              );
            })}
          </div>

          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 12 }}>
            Click the number on a category for per-item exceptions. Untick everything you do not want. A printer covering all categories stores no settings at all, so new categories are included automatically.
          </div>
        </>
      )}
    </div>
  );
}

export default function Admin() {
  const [pin, setPin] = useState(null);
  const [rawState, setState] = useState(null);
  // ---- Brand scope. Everything the admin shows is filtered to one brand; records with no
  // brand_id belong to the default brand (Chocoberry). New menus/groups/stores take the brand.
  const [brandId, setBrandId] = useState(() => { try { return localStorage.getItem("admin_brand") || ""; } catch { return ""; } });
  const brands = (rawState && rawState.brands) || [];
  const defaultBrandId = (brands.find((b) => /chocoberry/i.test(b.name || "")) || brands[0] || {}).id || null;
  // A brand remembered from an earlier (master) session on this machine may not
  // be in this login's list — a regional login would then filter to nothing.
  const activeBrandId = (brandId && brands.some((b) => b.id === brandId)) ? brandId : defaultBrandId;
  useEffect(() => { try { if (brandId) localStorage.setItem("admin_brand", brandId); } catch {} }, [brandId]);
  const state = useMemo(() => {
    if (!rawState || !activeBrandId || (brands.length < 2 && rawState.scope !== "region")) return rawState;
    const bOf = (x) => (x && x.brand_id) || defaultBrandId;
    const menus = (rawState.menus || []).filter((m) => bOf(m) === activeBrandId);
    const menuIds = new Set(menus.map((m) => m.id));
    const categories = (rawState.categories || []).filter((c) => menuIds.has(c.menu_id) || (!c.menu_id && bOf(c) === activeBrandId));
    const catIds = new Set(categories.map((c) => c.id));
    const items = (rawState.items || []).filter((i) => catIds.has(i.category_id));
    const itemIds = new Set(items.map((i) => i.id));
    const modifierGroups = (rawState.modifierGroups || []).filter((g) => bOf(g) === activeBrandId);
    const groupIds = new Set(modifierGroups.map((g) => g.id));
    const locations = (rawState.locations || []).filter((l) => bOf(l) === activeBrandId);
    const locIds = new Set(locations.map((l) => l.id));
    const bandMenus = rawState.bandMenus || [];
    const bandBrand = (b) => b.brand_id || (bandMenus.some((bm) => bm.band_id === b.id) ? (menuIds.has((bandMenus.find((bm) => bm.band_id === b.id) || {}).menu_id) ? activeBrandId : "other") : defaultBrandId);
    const priceBands = (rawState.priceBands || []).filter((b) => bandBrand(b) === activeBrandId);
    return {
      ...rawState, menus, categories, items, modifierGroups, locations, priceBands,
      modifierOptions: (rawState.modifierOptions || []).filter((o) => groupIds.has(o.group_id)),
      itemModifiers: (rawState.itemModifiers || []).filter((im) => itemIds.has(im.item_id)),
      overrides: (rawState.overrides || []).filter((o) => locIds.has(o.location_id)),
      tables: (rawState.tables || []).filter((t) => locIds.has(t.location_id)),
      locationMenus: (rawState.locationMenus || []).filter((lm) => locIds.has(lm.location_id)),
      kdsScreens: (rawState.kdsScreens || []).filter((k) => locIds.has(k.location_id)),
      printers: (rawState.printers || []).filter((p) => locIds.has(p.location_id)),
      modifierOverrides: (rawState.modifierOverrides || []).filter((o) => locIds.has(o.location_id)),
    };
  }, [rawState, activeBrandId, defaultBrandId, brands.length]);
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
  // Which slide list the dialog is editing: the global menu banner, or one
  // store's kiosk carousel ("kiosk_slides:<location id>").
  const [heroKey, setHeroKey] = useState("hero_slides");
  const [showMods, setShowMods] = useState(false);
  const [nav, setNav] = useState("menus");
  // Menus page store filter: "" = every store, "none" = carried nowhere, else a location id.
  const [menuStore, setMenuStore] = useState(() => { try { return localStorage.getItem("admin_menu_store") || ""; } catch { return ""; } });
  useEffect(() => { try { localStorage.setItem("admin_menu_store", menuStore); } catch {} }, [menuStore]);
  const [showStores, setShowStores] = useState(false);
  // Device health is live: refresh kds_screens every 30s while the stores view is open.
  useEffect(() => {
    if (!showStores) return;
    let alive = true;
    const load = () => fetch(SUPABASE_URL + "/rest/v1/kds_screens?select=*", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((rows) => { if (alive && Array.isArray(rows)) setState((st) => ({ ...st, kdsScreens: rows })); }).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [showStores]); // eslint-disable-line
  const [showPrinters, setShowPrinters] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [storeView, setStoreView] = useState(null); // store id for price editor
  const [openStore, setOpenStore] = useState(null);  // which store row is expanded (one at a time)
  const [storeTab, setStoreTab] = useState("tablets");
  const [storeQuery, setStoreQuery] = useState(""); // active tab in the expanded store
  const [storePins, setStorePins] = useState([]);      // master-only: per-store manager PINs
  // Which store's manager PIN is currently uncovered. Resets on every reload,
  // so a PIN revealed once does not stay on screen for the rest of the session.
  const [showPin, setShowPin] = useState({});
  const loadStorePins = async () => { try { const r = await callAdmin(pin, "store_pin_list", {}); setStorePins(r.pins || []); } catch { /* ignore */ } };
  useEffect(() => { if (showStores && state?.scope !== "store") loadStorePins(); /* eslint-disable-next-line */ }, [showStores]);
  const [modOpen, setModOpen] = useState({});
  const [modEdit, setModEdit] = useState(null);
  const [msg, setMsg] = useState("");

  // Every key the admin reads has to be named here — anything left out is
  // simply absent from state. `brands` was missed when brand scoping landed,
  // which left brands.length at 0: no brand switcher, and no filtering, so
  // every brand's menus sat in one list.
  const apply = (res) => setState({ scope: res.scope || "master", scopeLocationId: res.scopeLocationId || null, scopeLabel: res.scopeLabel || null, brands: res.brands || [], menus: res.menus || [], categories: res.categories || [], items: res.items || [], settings: res.settings || [], modifierGroups: res.modifierGroups || [], modifierOptions: res.modifierOptions || [], itemModifiers: res.itemModifiers || [], locations: res.locations || [], overrides: res.overrides || [], modifierOverrides: res.modifierOverrides || [], priceBands: res.priceBands || [], bandPrices: res.bandPrices || [], bandOptionPrices: res.bandOptionPrices || [], tables: res.tables || [], locationMenus: res.locationMenus || [], kdsScreens: res.kdsScreens || [], printers: res.printers || [], bandItems: res.bandItems || [], bandMenus: res.bandMenus || [], printerCategories: res.printerCategories || [], printerItems: res.printerItems || [] });
  const reload = async () => { const res = await callAdmin(pin, "load", {}); apply(res); };
  const act = async (action, body_) => { setMsg(""); try { await callAdmin(pin, action, body_); await reload(); } catch (e) { setMsg(e.message); } };
  // Optimistic availability toggle: flip the switch in the UI instantly, then
  // persist. If the write fails, reload() (in the catch) restores the true state.
  const toggleItemAvailable = async (it) => {
    const next = !it.available;
    setState((s) => ({ ...s, items: s.items.map((x) => x.id === it.id ? { ...x, available: next } : x) }));
    setMsg("");
    try { await callAdmin(pin, "update_item", { id: it.id, fields: { available: next } }); }
    catch (e) { setMsg(e.message); reload(); }
  };
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
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, padding: "0 10px 12px" }}>Menu Admin</div>
        {brands.length > 1 && state.scope !== "store" && (
          <div style={{ margin: "0 6px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: T.faint, letterSpacing: ".08em", textTransform: "uppercase", padding: "0 4px 6px" }}>Brand</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {brands.map((b) => <span key={b.id} onClick={() => setBrandId(b.id)} style={{ cursor: "pointer", padding: "8px 10px", borderRadius: 8, fontSize: 13, fontWeight: 800, background: activeBrandId === b.id ? T.ink : T.bg, color: activeBrandId === b.id ? T.card : T.muted, border: "1px solid " + (activeBrandId === b.id ? T.ink : T.line) }}>{b.name}</span>)}
            </div>
            <div style={{ fontSize: 10.5, color: T.faint, padding: "6px 4px 0", lineHeight: 1.35 }}>Menus, stores, bands and devices shown are this brand's only.</div>
          </div>
        )}
        {(() => {
          const isStore = state.scope === "store";
          const storeName = isStore ? ((state.locations || [])[0] || {}).name : null;
          if (state.scope === "region") return (
            <div style={{ fontSize: 12, color: T.muted, padding: "0 10px 14px", lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700, color: T.accent }}>{state.scopeLabel || "Regional access"}</span><br />
              {(state.locations || []).length} store{(state.locations || []).length === 1 ? "" : "s"}: {(state.locations || []).map((l) => l.name).join(", ")}
            </div>
          );
          return isStore ? (
            <div style={{ fontSize: 12, color: T.muted, padding: "0 10px 14px", lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700, color: T.accent }}>{storeName}</span><br />Store manager access
            </div>
          ) : null;
        })()}
        {[
          ["menus", "Menus", "🍽", true],
          ["overview", "Overview", "📋", true],
          ["pricing", "Pricing", "💷", true],
          ["modifiers", "Modifiers", "⚙", true],
          ["appearance", "Appearance", "🎨", true],
          ["welcome", "Welcome", "🏠", true],
          ["hero", "Hero", "🖼", true],
          ["stores", "Stores", "🏪", false],
          ["coverage", "Coverage", "🗂", true],
          ["bandmenus", "Band menus", "🎚", true],
          ["routing", "Printing", "🖨", true],
          ["printers", "Printers", "🖨", false],
          ["settings", "Settings", "⚙", true],
        ].filter(([key, , , masterOnly]) => {
          if (state.scope === "store") return !masterOnly;
          if (state.scope === "region") return !["appearance", "welcome", "hero", "settings"].includes(key);
          return true;
        }).map(([key, label, icon]) => {
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
              if (key === "hero") { setHeroKey("hero_slides"); try { const v = getSetting("hero_slides"); setHeroDraft(v ? (typeof v === "string" ? JSON.parse(v) : v) : []); } catch { setHeroDraft([]); } setShowHero(true); }
              if (key === "stores") setShowStores(true);
              if (key === "printers") setShowPrinters(true);
              if (key === "overview") setShowOverview(true);
              if (key === "pricing") setShowPricing(true);
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
        {nav === "routing" ? (
          <PrintRouting state={state} T={T} act={act} />
        ) : nav === "bandmenus" ? (
          <MenuBands state={state} T={T} act={act} money={money} />
        ) : nav === "coverage" ? (
          <CoverageView state={state} T={T} money={money} act={act} />
        ) : nav === "pricing" ? (
          <PricingManager state={state} T={T} act={act} onClose={() => { setNav("menus"); setLevel("menus"); }} />
        ) : (
        <>
        <div style={{ fontSize: 13, color: T.faint, marginBottom: 18 }}>
          <span style={{ cursor: "pointer", color: level === "menus" ? T.accent : T.faint }} onClick={() => { setLevel("menus"); setMenuId(null); setCatId(null); }}>Menus</span>
          {menu && <> {" › "} <span style={{ cursor: "pointer", color: level === "sections" ? T.accent : T.faint }} onClick={() => { setLevel("sections"); setCatId(null); }}>{menu.name}</span></>}
          {section && level === "items" && <> {" › "} <span style={{ color: T.accent }}>{section.name}</span></>}
        </div>
        {msg && <div style={{ color: T.danger, marginBottom: 12 }}>{msg}</div>}

        {level === "menus" && (() => {
        // Which stores actually resolve each menu. Two stores on one brand
        // each carry their own DRINKS, because menu_menus has no store column
        // and their items differ -- so the list shows the same name twice and
        // looks like a mistake until it says whose is whose.
        const allLocs = (state.locations || []).filter((l) => l.active);
        const lMenus = state.locationMenus || [];
        const bMenus = state.bandMenus || [];
        const carriers = (menuId) => allLocs.filter((l) => {
          const pinned = lMenus.some((x) => x.location_id === l.id);
          if (pinned) return lMenus.some((x) => x.location_id === l.id && x.menu_id === menuId);
          const band = l.menu_band_id || l.price_band_id;
          return !!band && bMenus.some((x) => x.band_id === band && x.menu_id === menuId);
        }).map((l) => l.name);
        // Store filter. A remembered store that is not in this login (or this
        // brand) is ignored rather than showing an empty page.
        const pick = (menuStore === "none" || allLocs.some((l) => l.id === menuStore)) ? menuStore : "";
        const pickName = (allLocs.find((l) => l.id === pick) || {}).name;
        const shown = menus.filter((m) => {
          if (!pick) return true;
          const who = carriers(m.id);
          return pick === "none" ? who.length === 0 : who.includes(pickName);
        });
        const orphanCount = menus.filter((m) => carriers(m.id).length === 0).length;
        const chip = (val, label, count) => (
          <span key={val || "all"} onClick={() => setMenuStore(val)} style={{ cursor: "pointer", padding: "7px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", background: pick === val ? T.ink : T.card, color: pick === val ? T.card : T.muted, border: "1px solid " + (pick === val ? T.ink : T.line) }}>
            {label} <span style={{ opacity: .6, fontWeight: 600 }}>{count}</span>
          </span>
        );
        return (
          <>
          {allLocs.length > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {chip("", "All stores", menus.length)}
              {allLocs.map((l) => chip(l.id, l.name, menus.filter((m) => carriers(m.id).includes(l.name)).length))}
              {orphanCount > 0 && chip("none", "Not on any store", orphanCount)}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
            {shown.map((m) => {
            const who = carriers(m.id);
            return (
              <Card key={m.id} drag={menuDrag(m.id)} img={m.img} title={m.name}
                subtitle={itemCount(m.id) + " items · " + (who.length ? who.join(", ") : "no store carries this")}
                active={m.active} onToggle={() => act("update_menu", { id: m.id, fields: { active: !m.active } })}
                onClick={() => { setMenuId(m.id); setLevel("sections"); }}
                onRename={() => { const n = window.prompt("Rename menu", m.name); if (n && n !== m.name) act("update_menu", { id: m.id, fields: { name: n } }); }}
                onTillName={() => { const n = window.prompt("Short name for the POS button only.\nLeave blank to use the full name.", m.pos_name || ""); if (n !== null) act("update_menu", { id: m.id, fields: { pos_name: n.trim() || null } }); }}
                tillName={m.pos_name}
                hours={hhmm(m.available_from) && hhmm(m.available_to) ? hhmm(m.available_from) + "–" + hhmm(m.available_to) : ""}
                onHours={() => {
                  const cur = hhmm(m.available_from) && hhmm(m.available_to) ? hhmm(m.available_from) + "-" + hhmm(m.available_to) : "";
                  const n = window.prompt(
                    "When is " + m.name + " served?\n\n" +
                    "Enter a window as 17:00-23:00.\n" +
                    "Leave blank for all day.\n\n" +
                    "Outside its hours the menu is greyed out and says when it is back, on the tablet and the welcome page.", cur);
                  if (n === null) return;
                  const t = n.trim();
                  if (!t) { act("update_menu", { id: m.id, fields: { available_from: null, available_to: null } }); return; }
                  const mm = t.match(/^(\d{1,2}):?(\d{2})?\s*[-–to]+\s*(\d{1,2}):?(\d{2})?$/i);
                  if (!mm) { window.alert("Could not read that. Use 17:00-23:00."); return; }
                  const pad2 = (x) => String(x).padStart(2, "0");
                  act("update_menu", { id: m.id, fields: {
                    available_from: pad2(mm[1]) + ":" + (mm[2] || "00") + ":00",
                    available_to: pad2(mm[3]) + ":" + (mm[4] || "00") + ":00",
                  } });
                }}
                onSetImage={() => setImgTarget({ kind: "menu", id: m.id })}
                onDelete={() => { if (window.confirm("Delete menu '" + m.name + "'? Its sections must be empty.")) act("delete_menu", { id: m.id }); }} />
            );})}
            <AddCard label="Add menu" onClick={() => { const n = window.prompt("Menu name?"); if (n) act("create_menu", { brand_id: activeBrandId, name: n }); }} />
          </div>
          {pick && pick !== "none" && (
            <div style={{ fontSize: 12, color: T.faint, marginTop: 12 }}>A new menu is not on any store until it is added to that store's menus (Stores) or its band (Band menus).</div>
          )}
          </>
        );})()}

        {level === "sections" && menu && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
            {sections.map((c) => (
              <Card key={c.id} drag={secDrag(c.id)} img={c.img} title={c.name} subtitle={secItemCount(c.id) + " items"}
                active={c.active} onToggle={() => act("update_category", { id: c.id, fields: { active: !c.active } })}
                onClick={() => { setCatId(c.id); setLevel("items"); }}
                onRename={() => { const n = window.prompt("Rename section", c.name); if (n && n !== c.name) act("update_category", { id: c.id, fields: { name: n } }); }}
                onTillName={() => { const n = window.prompt("Short name for the POS button only.\nLeave blank to use the full name.", c.pos_name || ""); if (n !== null) act("update_category", { id: c.id, fields: { pos_name: n.trim() || null } }); }}
                tillName={c.pos_name}
                onSetImage={() => setImgTarget({ kind: "section", id: c.id })}
                onDelete={() => { if (window.confirm("Delete section '" + c.name + "'? It must have no items.")) act("delete_category", { id: c.id }); }} />
            ))}
            <AddCard label="Add section" onClick={() => { const n = window.prompt("Section name?"); if (n) act("create_category", { menu_id: menuId, name: n }); }} />
          </div>
        )}

        {level === "items" && section && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>This section prints to:</span>
                <select value={section.station || "kitchen"} onChange={(e) => act("update_category", { id: section.id, fields: { station: e.target.value } })}
                  style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid " + T.line, background: T.card, color: T.ink }}>
                  <option value="kitchen">Kitchen (food)</option>
                  <option value="counter">Counter / bar (drinks)</option>
                </select>
                <span style={{ fontSize: 12, color: T.faint }}>Items follow this unless individually overridden (chip on each item).</span>
              </div>
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
                      <div style={{ fontSize: 12, color: T.faint }}>{money(it.price)}{(it.allergens_contains || []).length ? " · " + it.allergens_contains.join(", ") : ""}{(it.allergens_may || []).length ? " · may: " + it.allergens_may.join(", ") : ""}</div>
                    </div>
                    <span onClick={() => toggleItemAvailable(it)} style={{ width: 38, height: 22, borderRadius: 12, background: it.available ? T.accent : "#cfcabd", position: "relative", cursor: "pointer" }}>
                      <span style={{ position: "absolute", top: 2, left: it.available ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
                    </span>
                    {(() => {
                      const catStation = (section && section.station) || "kitchen";
                      const eff = it.station || catStation;
                      const label = it.station ? (it.station === "counter" ? "Counter" : "Kitchen") : (eff === "counter" ? "Counter*" : "Kitchen*");
                      const next = it.station == null ? "kitchen" : it.station === "kitchen" ? "counter" : null;
                      return (
                        <span onClick={() => act("update_item", { id: it.id, fields: { station: next } })}
                          title={it.station ? "Overriding category station — click to cycle" : "Inheriting from category (*) — click to set"}
                          style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 20, cursor: "pointer",
                            background: eff === "counter" ? "rgba(120,100,160,.14)" : "rgba(94,122,77,.14)",
                            color: eff === "counter" ? "#6C5AA0" : T.accent }}>{label}</span>
                      );
                    })()}
                    <span onClick={() => setEditItem(it)} style={{ color: T.accent, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>edit</span>
                    <span onClick={() => { if (window.confirm("Delete '" + it.name + "'?")) act("delete_item", { id: it.id }); }} style={{ color: T.danger, fontSize: 18, cursor: "pointer" }}>×</span>
                  </div>
                );
              })}
              {items.length === 0 && <div style={{ padding: 16, color: T.muted, fontSize: 14 }}>No items yet.</div>}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* LIVE PREVIEW */}
      {nav !== "pricing" && (
      <div style={{ width: 430, flexShrink: 0, borderLeft: "1px solid " + T.line, background: T.card, padding: "22px 20px", boxSizing: "border-box", height: "100vh", position: "sticky", top: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.muted, marginBottom: 14, alignSelf: "flex-start" }}>Live preview</div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
          <div style={{ position: "relative", width: 390 * 0.95, height: 844 * 0.95, border: "11px solid #1c1c1c", borderRadius: 44, overflow: "hidden", background: "#000", boxShadow: "0 20px 50px -18px rgba(0,0,0,.4)" }}>
            <iframe title="preview" src="/" style={{ width: 390, height: 844, border: "none", background: "#fff", transform: "scale(0.95)", transformOrigin: "top left" }} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: T.faint, marginTop: 10, textAlign: "center" }}>Live customer view. Refresh after edits.</div>
      </div>
      )}

      {editItem && <ItemEditor pin={pin} item={editItem} groups={state.modifierGroups || []} itemGroupIds={(state.itemModifiers || []).filter((im) => im.item_id === editItem.id).map((im) => im.group_id)} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); reload(); }} />}
      {showPrinters && <PrintersModal pin={pin} locations={state.locations} onClose={() => setShowPrinters(false)} />}
      {showOverview && <MenuOverview state={state} T={T} act={act} onEditItem={setEditItem} onClose={() => setShowOverview(false)} />}
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
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>{heroKey.startsWith("display_slides") ? "Customer display posters" : heroKey.startsWith("kiosk_slides") ? "Kiosk Slides" : "Hero Slides"}</div>
              <span onClick={() => setShowHero(false)} style={{ fontSize: 22, color: T.muted, cursor: "pointer" }}>×</span>
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>{heroKey.startsWith("display_slides") ? "Shown one after another on the screen facing the customer at this store's tills. Upload landscape images (16:10 or 16:9) to fill the screen; a poster of any other shape is shown whole. Title and subtitle are optional — leave them empty for a designed poster that already has its text." : heroKey.startsWith("kiosk_slides") ? "The full-height carousel on the kiosk welcome screen, for this store only. Portrait photos work best. The backdrop colour tints the whole screen behind the photo." : "The rotating banner at the top of the menu. Upload a photo for each slide; add or remove slides as needed."}</div>

            {heroDraft.map((sl, idx) => (
              <div key={idx} style={{ border: "1px solid " + T.line, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>Slide {idx + 1}</div>
                  <span onClick={() => setHeroDraft(heroDraft.filter((_, i) => i !== idx))} style={{ fontSize: 13, color: "#b4462f", fontWeight: 600, cursor: "pointer" }}>Delete</span>
                </div>
                <ImageUpload value={sl.image_url || ""} prefix={heroKey.startsWith("display_slides") ? "display" : "hero"} height={120} onChange={(url) => setHeroDraft(heroDraft.map((x, i) => i === idx ? { ...x, image_url: url } : x))} />
                {[["tag", "Tag (small pill)", "NEW THIS WEEK"], ["title", "Title", "Blueberry Marble Matcha"], ["sub", "Subtitle", "Fresh. Layered. Unexpected."], ["parts", "Kiosk chips (comma separated)", "Blueberry cold foam, Ceremonial matcha, Over ice"]].filter(([k]) => !(k === "parts" && heroKey.startsWith("display_slides"))).map(([k, label, ph]) => (
                  <div key={k} style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: T.muted, marginBottom: 4 }}>{label.toUpperCase()}</div>
                    <input value={typeof sl[k] === "string" ? sl[k] : Array.isArray(sl[k]) ? sl[k].join(", ") : ""} placeholder={ph} onChange={(e) => setHeroDraft(heroDraft.map((x, i) => i === idx ? { ...x, [k]: e.target.value } : x))}
                      style={{ width: "100%", boxSizing: "border-box", border: "1px solid " + T.line, borderRadius: 8, padding: "9px 11px", fontSize: 14, color: T.ink, background: T.card }} />
                  </div>
                ))}
                {/* The kiosk takes the whole screen's colour from the slide, so each
                    photo can sit on cream, deep green or tan. */}
                {!heroKey.startsWith("display_slides") && <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: T.muted, marginBottom: 4 }}>KIOSK BACKDROP</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["cream", "Cream", "#F2E4D7"], ["green", "Deep green", "#3E6F47"], ["tan", "Tan", "#D5B582"]].map(([v, l, sw]) => {
                      const on = (sl.tone || "cream") === v;
                      return (
                        <span key={v} onClick={() => setHeroDraft(heroDraft.map((x, i) => i === idx ? { ...x, tone: v } : x))}
                          style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: on ? T.ink : T.bg, color: on ? T.card : T.ink, border: "1px solid " + T.line }}>
                          <span style={{ width: 13, height: 13, borderRadius: 7, background: sw, border: "1px solid rgba(0,0,0,.15)" }} />{l}
                        </span>
                      );
                    })}
                  </div>
                </div>}
              </div>
            ))}

            <button onClick={() => setHeroDraft([...heroDraft, { image_url: "", tag: "", title: "", sub: "" }])} style={{ width: "100%", border: "1px dashed " + T.line, background: "transparent", color: T.muted, borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>{heroKey.startsWith("display_slides") ? "+ Add poster" : "+ Add slide"}</button>

            <button onClick={async () => { await act("set_setting", { key: heroKey, value: JSON.stringify(heroDraft) }); setShowHero(false); }} style={{ width: "100%", border: "none", background: T.accent || "#5E7A4D", color: "#fff", borderRadius: 10, padding: "13px 0", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{heroKey.startsWith("display_slides") ? "Save posters" : "Save slides"}</button>
          </div>
        </div>
      )}
      {showMods && (
        <div onClick={() => setShowMods(false)} style={{ position: "fixed", inset: 0, background: "rgba(30,36,20,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: "94vw", background: T.bg, borderRadius: 16, padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>Modifier groups</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={async () => { await act("create_mod_group", { brand_id: activeBrandId, name: "New group", required: false, min_select: 0, max_select: 1 }); }} style={{ background: T.accent || "#5E7A4D", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add modifier group</button>
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
                {state.scope !== "store" && <button onClick={async () => { const n = window.prompt("Store name?"); if (n) await act("create_store", { brand_id: activeBrandId, name: n }); }} style={{ background: T.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add store</button>}
                <span onClick={() => setShowStores(false)} style={{ fontSize: 22, color: T.muted, cursor: "pointer" }}>×</span>
              </div>
            </div>
            {(() => {
              const locs = state.locations || [];
              const devs = state.kdsScreens || [];
              const isOn = (k) => k.last_seen_at && Date.now() - new Date(k.last_seen_at) < 3 * 60000;
              const paused = locs.filter((l) => (state.settings || []).some((x) => x.key === "accepting_orders:" + l.id && x.value === "off")).length;
              const onlineDevs = devs.filter(isOn).length;
              const activeDevs = devs.filter((k) => (k.status || "active") === "active").length;
              const Stat = ({ n, l, tone }) => <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 16px", borderRadius: 12, background: T.card, border: "1px solid " + T.line, minWidth: 92 }}><span style={{ fontSize: 20, fontWeight: 800, color: tone || T.ink, lineHeight: 1 }}>{n}</span><span style={{ fontSize: 10, color: T.faint, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>{l}</span></div>;
              return (
                <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap", marginBottom: 16 }}>
                  <Stat n={locs.length} l="Stores" />
                  <Stat n={locs.filter((l) => l.active).length} l="Active" tone="#2e7d52" />
                  <Stat n={onlineDevs + " / " + activeDevs} l="Devices online" tone={activeDevs && onlineDevs < activeDevs ? "#8a6a1c" : "#2e7d52"} />
                  <Stat n={paused} l="Ordering paused" tone={paused ? "#b4462f" : T.ink} />
                  <input value={storeQuery} onChange={(e) => setStoreQuery(e.target.value)} placeholder="Find a store…" style={{ flex: 1, minWidth: 180, padding: "10px 14px", fontSize: 13.5, border: "1px solid " + T.line, borderRadius: 12, background: T.card, color: T.ink, outline: "none" }} />
                </div>
              );
            })()}

            {(state.locations || []).filter((l) => !storeQuery.trim() || String(l.name || "").toLowerCase().includes(storeQuery.trim().toLowerCase())).sort((a, b) => String(a.name).localeCompare(String(b.name))).map((loc) => {
              const tokens = (state.tables || []).filter((t) => t.location_id === loc.id && t.is_table === false);
              const diningTables = (state.tables || []).filter((t) => t.location_id === loc.id && t.is_table !== false)
                .sort((a, b) => (parseInt(String(a.label).replace(/\D/g, "")) || 0) - (parseInt(String(b.label).replace(/\D/g, "")) || 0));
              const ovCount = (state.overrides || []).filter((o) => o.location_id === loc.id).length;
              const linkedCount = tokens.filter((tk) => tk.claimed_by).length;
              const isOpen = openStore === loc.id;
              const initials = String(loc.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              const avatarBg = ["linear-gradient(135deg,#5E7A4D,#3f5733)", "linear-gradient(135deg,#b0894a,#8a6a2e)", "linear-gradient(135deg,#5b7db0,#3a5a8a)", "linear-gradient(135deg,#8a5b7d,#5f3a5a)"][(loc.name || "").length % 4];
              const toggleOpen = () => { setOpenStore(isOpen ? null : loc.id); setStoreTab("tablets"); };
              return (
                <div key={loc.id} style={{ border: "1px solid " + (isOpen ? "rgba(60,70,45,.22)" : T.line), borderRadius: 16, marginBottom: 13, background: T.card, overflow: "hidden", boxShadow: isOpen ? "0 8px 30px rgba(40,36,25,.10)" : "0 1px 3px rgba(40,36,25,.04)", transition: "box-shadow .18s" }}>
                  {/* ── Collapsed header row ── */}
                  <div onClick={toggleOpen} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", cursor: "pointer" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: avatarBg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, fontWeight: 800, flexShrink: 0, letterSpacing: "-.02em" }}>{initials}</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, letterSpacing: "-.02em" }}>{loc.name}</div>
                      <span onClick={(e) => { e.stopPropagation(); act("update_store", { id: loc.id, active: !loc.active }); }} style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, letterSpacing: ".03em", display: "inline-flex", alignItems: "center", gap: 5, marginTop: 3, cursor: "pointer", background: loc.active ? "#e7f2e0" : "#efeee9", color: loc.active ? "#3c5a2e" : "#8a8578" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: loc.active ? "#5E7A4D" : "#b3ad9e" }} />{loc.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      {(() => {
                        const devs = (state.kdsScreens || []).filter((k) => k.location_id === loc.id);
                        const isOn = (k) => k.last_seen_at && Date.now() - new Date(k.last_seen_at) < 3 * 60000;
                        if (!devs.length) return null;
                        const on = devs.filter(isOn).length;
                        return (
                          <div onClick={(e) => { e.stopPropagation(); setOpenStore(loc.id); setStoreTab("kitchen"); }} title={devs.map((k) => (k.label || "Screen " + k.screen_key) + ": " + ((k.status || "active") !== "active" ? k.status : isOn(k) ? "online" : "offline")).join("\n")} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 64, padding: "6px 10px", borderRadius: 10, cursor: "pointer" }}>
                            <div style={{ display: "flex", gap: 3 }}>{devs.map((k) => <span key={k.screen_key} style={{ width: 9, height: 9, borderRadius: "50%", background: (k.status || "active") === "revoked" ? "#b4462f" : (k.status || "active") === "unassigned" ? "#c3bcab" : isOn(k) ? "#2e7d52" : "#d79b2c" }} />)}</div>
                            <span style={{ fontSize: 9.5, color: on === devs.length ? "#2e7d52" : T.faint, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase" }}>{on}/{devs.length} online</span>
                          </div>
                        );
                      })()}
                      {[["Tablets", tokens.length], ["Tables", diningTables.length], ["Prices", ovCount]].map(([lbl, n]) => (
                        <div key={lbl} onClick={lbl === "Prices" ? (e) => { e.stopPropagation(); setStoreView(loc.id); } : undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 52, padding: "7px 4px", borderRadius: 10, background: T.bg, cursor: lbl === "Prices" ? "pointer" : "default" }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: T.ink, lineHeight: 1, letterSpacing: "-.02em" }}>{n}</span>
                          <span style={{ fontSize: 9.5, color: T.faint, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase" }}>{lbl}</span>
                        </div>
                      ))}
                      {/* Pause/resume CUSTOMER ordering at this store. Reads the
                          same menu_app_settings key the tablets poll every 10s;
                          ONLY the exact string "off" means paused. The till is
                          exempt (see place-order) — pausing stops tablets, the
                          kiosk and the app, never the counter. */}
                      {(() => {
                        const sRow = (state.settings || []).find((x) => x.key === "accepting_orders:" + loc.id);
                        const paused = sRow && sRow.value === "off";
                        return (
                          <div onClick={(e) => { e.stopPropagation(); act("set_accepting_orders", { location_id: loc.id, accepting: !!paused }); }}
                            title={paused ? "Customer ordering paused — tap to resume. The till still takes orders." : "Customers can order — tap to pause tablets, kiosk and app. The till is never paused."}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 10, cursor: "pointer", background: paused ? "#f7e6e2" : T.bg, border: "1px solid " + (paused ? "#b4462f" : T.line), marginLeft: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 4, background: paused ? "#b4462f" : "#2e7d52" }} />
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color: paused ? "#b4462f" : T.muted }}>{paused ? "Paused" : "Ordering"}</span>
                          </div>
                        );
                      })()}
                      <div style={{ display: "flex", gap: 7, marginLeft: 6 }}>
                        {state.scope !== "store" && <div onClick={(e) => { e.stopPropagation(); const n = window.prompt("Rename store", loc.name); if (n && n !== loc.name) act("update_store", { id: loc.id, name: n }); }} style={{ width: 33, height: 33, borderRadius: 9, background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, cursor: "pointer", color: T.muted, border: "1px solid " + T.line }} title="Rename">✎</div>}
                        {state.scope !== "store" && <div onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete store '" + loc.name + "'? Removes its tablets and price overrides.")) act("delete_store", { id: loc.id }); }} style={{ width: 33, height: 33, borderRadius: 9, background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, cursor: "pointer", color: "#b4462f", border: "1px solid " + T.line }} title="Delete">🗑</div>}
                      </div>
                      <span style={{ fontSize: 13, color: isOpen ? T.accent : "#c3bcab", marginLeft: 4, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .18s" }}>▸</span>
                    </div>
                  </div>

                  {/* ── Expanded body with tabs ── */}
                  {isOpen && (
                    <div style={{ borderTop: "1px solid " + T.line, padding: "18px", background: T.bg }}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 17, background: "#ecebe3", padding: 4, borderRadius: 12, width: "fit-content" }}>
                        {[["tablets", "Tablets", tokens.length], ["tables", "Tables", diningTables.length], ["kitchen", "Devices", (state.kdsScreens || []).filter((k) => k.location_id === loc.id).length], ["menus", "Menus", null], ["branding", "Branding", null]].map(([key, lbl, count]) => (
                          <span key={key} onClick={() => setStoreTab(key)} style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: storeTab === key ? T.ink : T.muted, background: storeTab === key ? "#fff" : "transparent", boxShadow: storeTab === key ? "0 2px 6px rgba(40,36,25,.09)" : "none", letterSpacing: "-.01em", display: "flex", alignItems: "center", gap: 7 }}>
                            {lbl}{count != null && <span style={{ fontSize: 10.5, background: storeTab === key ? "#e7f2e0" : "#e0ded4", color: storeTab === key ? "#3c5a2e" : "#8a8272", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>{count}</span>}
                          </span>
                        ))}
                      </div>

                      {/* TABLETS TAB */}
                      {storeTab === "tablets" && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 11 }}>Tablet links · {linkedCount} linked</div>
                          {tokens.map((tk) => {
                            const tnum = (String(tk.label || "").match(/\d+/) || [])[0];
                            const url = window.location.origin + "/?store=" + tk.qr_token + (tnum ? "&tablet=" + tnum : "");
                            const qr = "https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=8&data=" + encodeURIComponent(url);
                            return (
                              <div key={tk.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid " + T.line, borderRadius: 12, marginBottom: 8, background: T.card }}>
                                <div style={{ width: 32, height: 32, borderRadius: 9, background: "#eef3ea", display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, fontSize: 15, flexShrink: 0 }}>▤</div>
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{tk.label || "Tablet"}</div>
                                  <div style={{ fontSize: 11, color: tk.claimed_by ? "#3c5a2e" : T.faint, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: tk.claimed_by ? "#5E7A4D" : "#c3bcab" }} />{tk.claimed_by ? "Linked" : "Not linked"}
                                  </div>
                                </div>
                                <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                                  <span onClick={() => { navigator.clipboard?.writeText(url); }} style={{ fontSize: 11.5, color: T.accent, fontWeight: 600, cursor: "pointer", padding: "6px 11px", borderRadius: 8, background: "#eef3ea", border: "1px solid #d9e6d2" }}>Copy link</span>
                                  <a href={qr} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, textDecoration: "none", padding: "6px 11px", borderRadius: 8, background: T.bg, border: "1px solid " + T.line }}>QR</a>
                                  {tk.claimed_by ? <span onClick={() => { if (window.confirm("Release this tablet link? The current device will be logged out and the QR can be linked to a new tablet.")) act("release_token", { id: tk.id }); }} style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, cursor: "pointer", padding: "6px 11px", borderRadius: 8, background: T.bg, border: "1px solid " + T.line }}>Release</span> : null}
                                  <span onClick={() => act("delete_token", { id: tk.id })} style={{ fontSize: 11.5, color: "#b4462f", fontWeight: 600, cursor: "pointer", padding: "6px 11px", borderRadius: 8, background: "#fbeeeb", border: "1px solid #f2ddd6" }}>Delete</span>
                                </div>
                              </div>
                            );
                          })}
                          {tokens.length === 0 && <div style={{ fontSize: 12.5, color: T.faint, padding: "4px 0 8px" }}>No tablet links yet.</div>}
                          <button onClick={() => act("create_token", { location_id: loc.id, label: "Tablet " + (tokens.length + 1) })} style={{ fontSize: 12.5, color: T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 700, marginTop: 6, padding: 8 }}>+ New tablet link</button>
                        </div>
                      )}

                      {/* TABLES TAB */}
                      {storeTab === "tables" && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 6 }}>Dining tables · {diningTables.length}</div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 11 }}>
                            <div style={{ fontSize: 11.5, color: T.faint }}>Each has its own QR for the table sticker. Click a name to rename, ▦ to preview one.</div>
                            {diningTables.length > 0 && <button onClick={() => openTableStickerSheet({ storeName: loc.name, tables: diningTables, origin: window.location.origin , brandName: getSetting("brand_name:" + loc.id) || "Chocoberry" })} style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: T.accent, border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap" }}>Print QR stickers</button>}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {diningTables.map((tb) => (
                              <div key={tb.id} style={{ display: "flex", alignItems: "center", gap: 9, background: T.card, border: "1px solid " + T.line, borderRadius: 10, padding: "9px 13px", boxShadow: "0 1px 2px rgba(40,36,25,.03)" }}>
                                <span onClick={() => { const n = window.prompt("Rename table", tb.label); if (n && n !== tb.label) act("update_table", { id: tb.id, fields: { label: n } }); }} style={{ fontSize: 13, fontWeight: 700, color: T.ink, cursor: "pointer" }} title="Click to rename">{tb.label}</span>
                                <a href={"https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=8&data=" + encodeURIComponent(window.location.origin + "/?store=" + tb.qr_token)} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: T.accent, textDecoration: "none" }} title="Preview this table's QR">▦</a>
                                <span onClick={() => { if (window.confirm("Delete '" + tb.label + "'?")) act("delete_table", { id: tb.id }); }} style={{ fontSize: 13, color: "#b4462f", cursor: "pointer" }} title="Delete">×</span>
                              </div>
                            ))}
                            <span onClick={() => { const next = (diningTables.reduce((m, t) => Math.max(m, parseInt(String(t.label).replace(/\D/g, "")) || 0), 0)) + 1; act("create_table", { location_id: loc.id, label: "Table " + next }); }} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px dashed #a9c199", borderRadius: 10, padding: "9px 13px", fontSize: 13, fontWeight: 700, color: T.accent, background: "#f6faf3", cursor: "pointer" }}>+ Add table</span>
                          </div>
                        </div>
                      )}

                      {/* KITCHEN TAB */}
                      {storeTab === "kitchen" && <DevicesPanel loc={loc} state={state} act={act} pin={pin} setMsg={setMsg} />}

                      {storeTab === "branding" && (() => {
                        // Per-store branding. Each field writes "<key>:<location_id>";
                        // empty = inherit the global setting (Chocoberry).
                        const K = (k) => k + ":" + loc.id;
                        const g = (k) => getSetting(K(k));
                        const setK = (k, v) => act("set_setting", { key: K(k), value: v });
                        const Field = ({ k, label, placeholder, hint }) => (
                          <label style={{ display: "block", marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                            {/* Enter saves as well as clicking away. These
                                fields only wrote on blur, so typing a value
                                and pressing Enter looked like it had saved
                                and had not. */}
                            <input defaultValue={g(k)} placeholder={placeholder}
                              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                              onBlur={(e) => { if (e.target.value !== g(k)) setK(k, e.target.value); }}
                              style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", fontSize: 13, border: "1px solid " + T.line, borderRadius: 9, background: T.card, color: T.ink }} />
                            {hint && <div style={{ fontSize: 11, color: T.faint, marginTop: 3 }}>{hint}</div>}
                          </label>
                        );
                        const theme = g("theme") || "";
                        return (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 6 }}>Branding · this store only</div>
                            <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 12 }}>Leave a field empty to inherit the global Chocoberry branding. Changes reach tablets on their next menu refresh and KDS/POS screens within a minute.</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4 }}>Colour theme</div>
                                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                                  {[["", "Inherit"], ["chocoberry", "Chocoberry"], ["tove", "Tove"], ["still", "still."]].map(([v, l]) => <span key={v} onClick={() => setK("theme", v)} style={{ cursor: "pointer", padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: theme === v ? T.ink : T.bg, color: theme === v ? T.card : T.ink, border: "1px solid " + T.line }}>{l}</span>)}
                                </div>
                                {/* Currency is a picker rather than a text field: a typo here
                                    would silently fall back to pounds on the till and the
                                    receipt, which is exactly the mistake worth preventing. */}
                                <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4 }}>Currency</div>
                                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                                  {[["", "£ GBP"], ["AED", "AED"]].map(([v, l]) => {
                                    const on = String(g("currency") || "").trim().toUpperCase() === v;
                                    return <span key={v || "gbp"} onClick={() => setK("currency", v)} style={{ cursor: "pointer", padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: on ? T.ink : T.bg, color: on ? T.card : T.ink, border: "1px solid " + T.line }}>{l}</span>;
                                  })}
                                </div>
                                <div style={{ fontSize: 11, color: T.muted, marginBottom: 12, lineHeight: 1.45 }}>The menu, the till, the cash-up pad and the printed receipt all follow this. It does not convert anything — set this store's prices in its own money first.</div>
                                <Field k="brand_name" label="Brand name" placeholder="Chocoberry" hint="Shown on the KDS/POS header, receipts, QR stickers and the get-the-app strip." />
                                <Field k="brand_tagline" label="Tagline" placeholder="Desserts, beautifully done." />
                                <Field k="welcome_eyebrow" label="Welcome · eyebrow" placeholder="WELCOME TO" />
                                <Field k="welcome_subtitle" label="Welcome · subtitle" placeholder="Tap below to start your order" />
                                <Field k="welcome_button" label="Welcome · button" placeholder="Menu" />
                                <Field k="welcome_footer" label="Welcome · footer" placeholder="" hint="Leave empty to take the line off this store." />
                                <Field k="welcome_masthead" label="Welcome · store line" placeholder="" hint="Shown beside the dish count. Leave empty to use the last line of the subtitle, which is usually right." />
                                <Field k="welcome_hours" label="Welcome · hours" placeholder="" hint="Free text, shown beside the store line. Leave empty for none." />
                                <Field k="welcome_dayparts" label="Welcome · day parts" placeholder="11,17" hint="Two hours on a 24h clock: when morning ends and when evening starts. Sets the greeting and the colour as well as the Now mark." />
                                <Field k="welcome_now" label="Welcome · Now mark" placeholder="ALL DAY BREAKFAST | MAIN | DESSERTS" hint="Three category names for morning, afternoon and evening. Leave a gap between bars for no mark in that part. Type off for none." />
                              </div>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4 }}>Logo</div>
                                <ImageUpload value={g("welcome_logo_url")} prefix={"branding/" + loc.id} onChange={(url) => { setK("welcome_logo_url", url || ""); setK("brand_logo_url", url || ""); }} />
                                <div style={{ height: 10 }} />
                                <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4 }}>Welcome background</div>
                                <ImageUpload value={g("welcome_bg_url")} prefix={"branding/" + loc.id} onChange={(url) => setK("welcome_bg_url", url || "")} />
                                <div style={{ height: 12 }} />
                                <Field k="brand_primary" label="Primary colour" placeholder="#b3d2ae" />
                                <Field k="brand_button_text" label="Accent / button text colour" placeholder="#344d42" />
                                <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4 }}>Hero slides on the menu</div>
                                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                                  {[["", "Inherit global"], ["[]", "None"]].map(([v, l]) => <span key={v} onClick={() => setK("hero_slides", v)} style={{ cursor: "pointer", padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: (g("hero_slides") || "") === v ? T.ink : T.bg, color: (g("hero_slides") || "") === v ? T.card : T.ink, border: "1px solid " + T.line }}>{l}</span>)}
                                </div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4 }}>"Get the app" strip</div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  {[["", "Show (Chocoberry app)"], ["off", "Hide — no app for this brand"]].map(([v, l]) => <span key={v} onClick={() => setK("app_banner", v)} style={{ cursor: "pointer", padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: (g("app_banner") || "") === v ? T.ink : T.bg, color: (g("app_banner") || "") === v ? T.card : T.ink, border: "1px solid " + T.line }}>{l}</span>)}
                                </div>
                              </div>
                            </div>

                            {/* The designed kiosk welcome: photo carousel over the
                                eat-in / take-away tiles. Slides come from the hero
                                slides above. */}
                            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid " + T.line }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 6 }}>Kiosk welcome · this store only</div>
                              <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 12 }}>A full-height photo carousel over the eat-in / take-away tiles. Portrait screens only — a landscape kiosk falls back to the plain welcome. With no kiosk slides set it borrows the menu's hero slides.</div>
                              <button onClick={() => {
                                const k = "kiosk_slides:" + loc.id;
                                setHeroKey(k);
                                try { const v = g("kiosk_slides"); setHeroDraft(v ? (typeof v === "string" ? JSON.parse(v) : v) : []); } catch { setHeroDraft([]); }
                                setShowHero(true);
                              }} style={{ border: "1px solid " + T.line, background: T.card, color: T.ink, borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>Edit kiosk slides…</button>
                              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                                {[["", "Designed welcome"], ["off", "Plain welcome"]].map(([v, l]) => <span key={v} onClick={() => setK("kiosk_design", v)} style={{ cursor: "pointer", padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: (g("kiosk_design") || "") === v ? T.ink : T.bg, color: (g("kiosk_design") || "") === v ? T.card : T.ink, border: "1px solid " + T.line }}>{l}</span>)}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                <div>
                                  <Field k="kiosk_headline" label="Headline" placeholder="Hej! What can we<br>make you today?" hint="Simple HTML allowed, e.g. <br> for a line break." />
                                  <Field k="kiosk_footer" label="Prompt beside the pulsing dot" placeholder="TAP TO START" />
                                  <Field k="kiosk_marquee" label="Ticker across the panel" placeholder="MATCHA ✦ COFFEE ✦ CALM ENERGY ✦" />
                                  <Field k="kiosk_address" label="Footer line" placeholder="183 Evington Road, Leicester · Open daily 8am–11pm" hint="Hidden when empty." />
                                  <Field k="kiosk_greetings" label="Greetings · morning | afternoon | evening" placeholder="God morgon|Good afternoon|God kväll" />
                                </div>
                                <div>
                                  <Field k="kiosk_eatin_label" label="Eat-in tile · title" placeholder="Eat in" />
                                  <Field k="kiosk_eatin_sub" label="Eat-in tile · line below" placeholder="Stay a while, slow down" />
                                  <Field k="kiosk_takeaway_label" label="Take-away tile · title" placeholder="Take away" />
                                  <Field k="kiosk_takeaway_sub" label="Take-away tile · line below" placeholder="Freshly made, ready to go" />
                                  <Field k="kiosk_slide_seconds" label="Seconds per slide" placeholder="7" />
                                  <Field k="kiosk_confirm_seconds" label="Thank-you screen · seconds before it resets" placeholder="20" hint="0 waits for a tap, as it used to." />
                                  <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4 }}>Rewards strip</div>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    {[["", "Show"], ["off", "Hide"]].map(([v, l]) => <span key={v} onClick={() => setK("kiosk_rewards", v)} style={{ cursor: "pointer", padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: (g("kiosk_rewards") || "") === v ? T.ink : T.bg, color: (g("kiosk_rewards") || "") === v ? T.card : T.ink, border: "1px solid " + T.line }}>{l}</span>)}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* The till's rear screen, facing the customer. Shown by
                                the Customer Display app on the till (/display). */}
                            {(() => {
                              let posters = [];
                              try { const v = g("display_slides"); posters = v ? (typeof v === "string" ? JSON.parse(v) : v) : []; } catch { posters = []; }
                              posters = (Array.isArray(posters) ? posters : []).filter((s) => s && s.image_url);
                              return (
                                <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid " + T.line }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 6 }}>Customer display · this store only</div>
                                  <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 12, lineHeight: 1.5 }}>Posters on the screen facing the customer at the till. Needs the <b>Customer Display</b> app on the till (Device apps page). Landscape images fill the screen; posters of any other shape are shown whole. With no posters set it shows the kiosk slides, then the menu's hero slides.</div>
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                                    {posters.slice(0, 8).map((s, i) => <div key={i} style={{ width: 112, height: 70, borderRadius: 8, border: "1px solid " + T.line, background: "#111 center/cover url(" + JSON.stringify(s.image_url) + ")" }} />)}
                                    {!posters.length && <div style={{ fontSize: 12.5, color: T.muted }}>No posters yet.</div>}
                                  </div>
                                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                                    <button onClick={() => { setHeroKey(K("display_slides")); setHeroDraft(posters); setShowHero(true); }} style={{ border: "1px solid " + T.line, background: T.card, color: T.ink, borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Edit posters…</button>
                                    <a href={"/display?loc=" + loc.id} target="_blank" rel="noreferrer" style={{ border: "1px solid " + T.line, background: T.card, color: T.ink, borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>Preview ↗</a>
                                    <div style={{ width: 200 }}><Field k="display_slide_seconds" label="Seconds per poster" placeholder="8" /></div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}

                      {/* MENUS TAB */}
                      {storeTab === "menus" && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 6 }}>Menus shown at this store</div>
                          <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 11 }}>Leave all unticked to show every menu (default). Tick specific menus to limit this store to only those.</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {(state.menus || []).map((mn) => {
                              const assigned = (state.locationMenus || []).filter((x) => x.location_id === loc.id).map((x) => x.menu_id);
                              const on = assigned.includes(mn.id);
                              return (
                                <label key={mn.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: T.ink, cursor: "pointer", border: "1px solid " + (on ? "#a9c199" : T.line), borderRadius: 10, padding: "8px 13px", background: on ? "#eef3ea" : T.card }}>
                                  <input type="checkbox" checked={on} onChange={() => { const next = on ? assigned.filter((x) => x !== mn.id) : [...assigned, mn.id]; act("set_store_menus", { location_id: loc.id, menu_ids: next }); }} />
                                  {mn.name}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {state.scope !== "store" && (
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed " + T.line }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 8 }}>Bands</div>
                          <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 10 }}>Two independent choices: what this store charges, and what it carries. Set both and it inherits from the band instead of needing its own rows.</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: T.muted }}>
                              Charges
                              <select value={loc.price_band_id || ""} onChange={(e) => act("set_store_band", { location_id: loc.id, band_id: e.target.value || null })}
                                style={{ border: "1px solid " + T.line, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, background: T.bg, color: T.ink }}>
                                <option value="">Master prices</option>
                                {(state.bands || []).filter((b) => b.band_kind !== "menu").map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                              </select>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: T.muted }}>
                              Carries
                              <select value={loc.menu_band_id || ""} onChange={(e) => act("set_menu_band", { location_id: loc.id, band_id: e.target.value || null })}
                                style={{ border: "1px solid " + T.line, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, background: T.bg, color: T.ink }}>
                                <option value="">Full base menu</option>
                                {(state.bands || []).filter((b) => b.band_kind !== "price").map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                              </select>
                            </label>
                          </div>
                        </div>
                      )}
                      {state.scope !== "store" && (() => {
                        const existing = storePins.find((sp) => sp.location_id === loc.id);
                        return (
                          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed " + T.line }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 8 }}>Manager access</div>
                            <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 10 }}>Give this store its own PIN so a manager can log in and manage only {loc.name} — their prices, tablets, tables and menus. They can't see or change other stores or the master menu.</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              {existing
                                ? <>
                                    {/* The PIN was printed in the clear, always.
                                        This page gets opened on a shop floor,
                                        shared on a call and photographed for a
                                        support thread, and the credential that
                                        unlocks a whole store's admin went with
                                        it every time. It is covered unless
                                        someone asks to see it. */}
                                    <span onClick={() => setShowPin((s) => ({ ...s, [loc.id]: !s[loc.id] }))}
                                      title={showPin[loc.id] ? "Hide the PIN" : "Show the PIN"}
                                      style={{ fontSize: 13, fontWeight: 700, color: T.ink, background: "#eef3ea", border: "1px solid #d9e6d2", borderRadius: 8, padding: "7px 12px", letterSpacing: "2px", cursor: "pointer", userSelect: showPin[loc.id] ? "all" : "none" }}>
                                      PIN: {showPin[loc.id] ? existing.pin : "•".repeat(String(existing.pin || "").length || 6)}
                                    </span>
                                    <span onClick={() => setShowPin((s) => ({ ...s, [loc.id]: !s[loc.id] }))} style={{ fontSize: 12, color: T.muted, fontWeight: 600, cursor: "pointer" }}>{showPin[loc.id] ? "Hide" : "Show"}</span>
                                    <span onClick={() => navigator.clipboard?.writeText(String(existing.pin || ""))} title="Copy without showing it" style={{ fontSize: 12, color: T.accent, fontWeight: 600, cursor: "pointer" }}>Copy</span>
                                    <span onClick={async () => { const p = window.prompt("New PIN for " + loc.name + " (numbers/letters):"); if (p) { await callAdmin(pin, "store_pin_set", { location_id: loc.id, pin: p.trim(), label: loc.name + " manager" }); loadStorePins(); } }} style={{ fontSize: 12, color: T.accent, fontWeight: 600, cursor: "pointer" }}>Change</span>
                                    <span onClick={async () => { if (window.confirm("Remove manager access for " + loc.name + "? Their PIN will stop working.")) { await callAdmin(pin, "store_pin_delete", { location_id: loc.id }); loadStorePins(); } }} style={{ fontSize: 12, color: "#b4462f", fontWeight: 600, cursor: "pointer" }}>Remove</span>
                                  </>
                                : <span onClick={async () => { const p = window.prompt("Set a PIN for " + loc.name + " (the manager will use this to log in):"); if (p) { await callAdmin(pin, "store_pin_set", { location_id: loc.id, pin: p.trim(), label: loc.name + " manager" }); loadStorePins(); } }} style={{ fontSize: 12.5, color: T.accent, fontWeight: 700, cursor: "pointer", border: "1px dashed #a9c199", borderRadius: 8, padding: "8px 13px", background: "#f6faf3" }}>+ Set manager PIN</span>}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
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
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>Blank price = uses the master price. <strong>Off today</strong> comes back on its own tomorrow morning; <strong>Not carried</strong> is permanent.</div>
              {(() => {
                const rows = (state.items || []);
                const n86 = rows.filter((it) => { const o = findOv(it.id); return o && o.unavailable_until && new Date(o.unavailable_until) > new Date(); }).length;
                const nHid = rows.filter((it) => { const o = findOv(it.id); return o && o.available === false; }).length;
                const nPr = rows.filter((it) => { const o = findOv(it.id); return o && o.price != null; }).length;
                const chip = (n, label, fg, bg, bd) => (
                  <span style={{ fontSize: 12, fontWeight: 600, color: n ? fg : T.faint, background: n ? bg : "transparent", border: "1px solid " + (n ? bd : T.line), borderRadius: 20, padding: "5px 12px" }}>{n} {label}</span>
                );
                return (
                  <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                    {chip(n86, "off today", "#8a5a2b", "#fdf1e7", "#f0d9c2")}
                    {chip(nHid, "not carried", "#8a3b3b", "#f6eaea", "#e8cfcf")}
                    {chip(nPr, "own price", T.accent, "#eef3ea", "#d9e6d2")}
                  </div>
                );
              })()}
              {(state.items || []).map((it) => {
                const o = findOv(it.id);
                const hidden = o && o.available === false;
                const off = o && o.unavailable_until && new Date(o.unavailable_until) > new Date();
                const dim = hidden || off;
                const back = off ? new Date(o.unavailable_until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
                const state3 = (label, activeNow, colour, bgc, onClick) => (
                  <span onClick={onClick} style={{ fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", padding: "6px 10px", borderRadius: 7, color: activeNow ? "#fff" : T.muted, background: activeNow ? colour : "transparent", border: "1px solid " + (activeNow ? colour : T.line) }}>{label}</span>
                );
                return (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid " + T.line }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: dim ? T.muted : T.ink, textDecoration: dim ? "line-through" : "none" }}>
                      {it.name}
                      {off && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 600, color: "#8a5a2b", textDecoration: "none" }}>back {back}</span>}
                    </span>
                    <span style={{ fontSize: 12, color: T.faint, whiteSpace: "nowrap" }}>master {money(it.price)}</span>
                    <input type="number" step="0.05" placeholder={String(it.price)} defaultValue={o && o.price != null ? o.price : ""}
                      onBlur={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); act("set_override", { item_id: it.id, location_id: storeView, price: v, available: o ? o.available : null }); }}
                      style={{ width: 82, border: "1px solid " + T.line, borderRadius: 8, padding: "7px 9px", fontSize: 13, background: T.card, color: T.ink }} />
                    <div style={{ display: "flex", gap: 3 }}>
                      {state3("Carried", !hidden && !off, T.accent, null, () => {
                        if (off) act("set_item_86", { location_id: storeView, item_id: it.id, on: false });
                        if (hidden) act("set_override", { item_id: it.id, location_id: storeView, price: o ? o.price : null, available: true });
                      })}
                      {state3("Off today", !!off, "#c07a2e", null, () => act("set_item_86", { location_id: storeView, item_id: it.id, on: !off }))}
                      {state3("Not carried", !!hidden, "#a34a4a", null, () => act("set_override", { item_id: it.id, location_id: storeView, price: o ? o.price : null, available: hidden ? true : false }))}
                    </div>
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
