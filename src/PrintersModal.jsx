import { useState, useEffect, useMemo, useRef, Fragment } from "react";

// PRINTER SETUP — shared by Admin (Printers) and the till (More → Printers).
// Moved out of Admin.jsx 2026-10-25 so the till can open the same screen.

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
  if (!res.ok) throw new Error(j.message || j.error || ("HTTP " + res.status));
  return j;
}

export function QrScanField({ onDetect, onClose }) {
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

export default function PrintersModal({ pin, call, locations, onClose, zIndex = 50 }) {
  // Admin passes its PIN; the till passes its own call (licensed device +
  // manager PIN), which only ever sees and changes that store's printers.
  const api = call || ((action, data) => api(action, data));
  const [printers, setPrinters] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [scan, setScan] = useState(false);
  const oneLoc = locations.length === 1 ? locations[0].id : "";
  const [form, setForm] = useState({ sn: "", label: "", location_id: oneLoc, station: "kitchen" });

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
    try { const res = await api("printer_list", {}); setPrinters(res.printers || []); }
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
      await api("printer_add", {
        sn: form.sn.trim(),
        label: form.label.trim() || null,
        store_id: slugFor(loc),
        location_id: form.location_id,
        shop_id: 1,
        station: form.station || "kitchen",
      });
      setForm({ sn: "", label: "", location_id: oneLoc, station: "kitchen" });
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
      const r = await api("printer_test", { sn: p.sn });
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
    try { await api("printer_update", { id: p.id, fields }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };

  const toggleActive = async (p) => {
    setBusy(true);
    try { await api("printer_update", { id: p.id, fields: { active: !p.active } }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const changeStore = async (p, location_id) => {
    const loc = locations.find((l) => l.id === location_id);
    setBusy(true);
    try { await api("printer_update", { id: p.id, fields: { location_id, store_id: slugFor(loc) } }); await load(); }
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
    try { await api("printer_update", { id: p.id, fields: { station } }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  // A printer does one of two jobs. A STATION printer gets only the lines for
  // its own station (a kitchen ticket). A RECEIPT printer gets the whole order
  // every time — that is the counter. Getting this wrong is why the counter
  // stopped printing when its station changed.
  const changeRole = async (p, print_role) => {
    setBusy(true); setMsg("");
    try { await api("printer_update", { id: p.id, fields: { print_role } }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const toggleAuto = async (p) => {
    setBusy(true); setMsg("");
    try { await api("printer_update", { id: p.id, fields: { auto_print: p.auto_print === false } }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const changeCopies = async (p, copies) => {
    setBusy(true);
    try { await api("printer_update", { id: p.id, fields: { copies: parseInt(copies, 10) || 1 } }); await load(); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const removePrinter = async (p) => {
    if (!window.confirm("Remove " + (p.label || p.sn) + " from the list? (The printer stays bound in Sunmi; this only unregisters it here.)")) return;
    setBusy(true);
    try { await api("printer_remove", { id: p.id }); await load(); }
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,34,24,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex, padding: "40px 16px", overflowY: "auto" }} onClick={onClose}>
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
            {locations.length > 1 && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", color: T.faint, textTransform: "uppercase" }}>Show</span>}
            {locations.length > 1 && <select value={storeFilter} onChange={(e) => { setStoreFilter(e.target.value); setOpen({}); }}
              style={{ fontSize: 13, padding: "8px 10px", borderRadius: 9, border: "1px solid " + T.line, background: T.card, color: T.ink, fontWeight: 600 }}>
              <option value="">All stores ({printers.length})</option>
              {groups.map((g) => <option key={g.id || "__none"} value={g.id || "__none"}>{g.name} ({g.printers.length})</option>)}
            </select>}
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
              <button disabled={busy} onClick={() => { setAdding(false); setScan(false); setForm({ sn: "", label: "", location_id: oneLoc, station: "kitchen" }); setMsg(""); }} style={{ fontSize: 14, fontWeight: 600, color: T.muted, background: "none", border: "1px solid " + T.line, borderRadius: 10, padding: "11px 20px", cursor: "pointer" }}>Cancel</button>
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 12 }}>Adding binds the printer to your Sunmi account. If it's a brand-new unit, accept the transfer in the Sunmi portal first.</div>
          </div>
        )}
      </div>
    </div>
  );
}
