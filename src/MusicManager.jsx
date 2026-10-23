import { useEffect, useMemo, useRef, useState } from "react";
import { MUSIC_BUCKET, musicTopic, parseJSON, broadcast, listen, fmtTime, DAY_LETTERS, uid } from "./music.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Admin → Music. Library (upload royalty-free tracks), playlists, the
// schedule (all stores, or a store's own), and live control of each store's
// player. Settings shapes are documented in src/music.js.
async function uploadAudio(file) {
  const ext = (file.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3";
  const path = "tracks/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
  const res = await fetch(SUPABASE_URL + "/storage/v1/object/" + MUSIC_BUCKET + "/" + path, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": file.type || "audio/mpeg" },   // unique names, so no upsert (which would need an update policy)
    body: file,
  });
  if (!res.ok) { const t = await res.text(); throw new Error(/bucket not found/i.test(t) ? "Run db/music.sql in Supabase first (the music bucket is missing)" : "upload failed: " + t.slice(0, 120)); }
  return SUPABASE_URL + "/storage/v1/object/public/" + MUSIC_BUCKET + "/" + path;
}
function durationOf(file) {
  return new Promise((res) => {
    const u = URL.createObjectURL(file); const a = new Audio(); a.preload = "metadata";
    a.onloadedmetadata = () => { res(isFinite(a.duration) ? a.duration : 0); URL.revokeObjectURL(u); };
    a.onerror = () => { res(0); URL.revokeObjectURL(u); };
    a.src = u;
  });
}
function namesFrom(filename) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  const parts = base.split(/\s+-\s+/);
  return parts.length >= 2 ? { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() } : { artist: "", title: base };
}

export default function MusicManager({ state, T, act, getSetting, onClose }) {
  const [tab, setTab] = useState("library");
  const stores = (state.locations || []).filter((l) => l.active !== false);
  const library = useMemo(() => parseJSON(getSetting("music_library"), []), [getSetting("music_library")]); // eslint-disable-line
  const playlists = useMemo(() => parseJSON(getSetting("music_playlists"), []), [getSetting("music_playlists")]); // eslint-disable-line
  const libMap = useMemo(() => new Map(library.map((t) => [t.id, t])), [library]);
  const [busy, setBusy] = useState("");

  const refreshStores = () => stores.forEach((s) => broadcast(musicTopic(s.id), "cmd", { cmd: "refresh" }));
  const save = async (key, value) => { await act("set_setting", { key, value: typeof value === "string" ? value : JSON.stringify(value) }); refreshStores(); };

  const card = { background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 14 };
  const input = { padding: "8px 10px", fontSize: 13, border: "1px solid " + T.line, borderRadius: 8, background: T.card, color: T.ink, boxSizing: "border-box" };
  const pill = (on) => ({ cursor: "pointer", padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: on ? T.ink : T.bg, color: on ? T.card : T.ink, border: "1px solid " + T.line, whiteSpace: "nowrap" });
  const btn = (primary) => ({ cursor: "pointer", padding: "8px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, border: primary ? "none" : "1px solid " + T.line, background: primary ? (T.accent || "#5E7A4D") : T.card, color: primary ? "#fff" : T.ink });
  const label = { fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 6 };

  // ---------- LIBRARY ----------
  const fileRef = useRef(null);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState(null);
  const audioRef = useRef(null);
  async function addFiles(files) {
    const list = Array.from(files || []).filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|ogg|wav)$/i.test(f.name));
    if (!list.length) return;
    const added = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setBusy("Uploading " + (i + 1) + " of " + list.length + ": " + f.name);
      try {
        const [url, dur] = await Promise.all([uploadAudio(f), durationOf(f)]);
        added.push({ id: uid(), ...namesFrom(f.name), url, dur: Math.round(dur) });
      } catch (e) { setBusy(e.message); await new Promise((r) => setTimeout(r, 2500)); if (/music\.sql/.test(e.message)) break; }
    }
    if (added.length) { setBusy("Saving…"); await save("music_library", [...library, ...added]); }
    setBusy(added.length ? "Added " + added.length + " track" + (added.length === 1 ? "" : "s") : "");
    setTimeout(() => setBusy(""), 3000);
  }
  const editTrack = (id, f) => save("music_library", library.map((t) => (t.id === id ? { ...t, ...f } : t)));
  async function removeTrack(id) {
    const t = libMap.get(id);
    const used = playlists.filter((p) => (p.tracks || []).includes(id)).map((p) => p.name);
    if (!window.confirm("Remove “" + (t ? t.title : "track") + "” from the library?" + (used.length ? "\n\nIt is also taken out of: " + used.join(", ") : ""))) return;
    if (used.length) await act("set_setting", { key: "music_playlists", value: JSON.stringify(playlists.map((p) => ({ ...p, tracks: (p.tracks || []).filter((x) => x !== id) }))) });
    await save("music_library", library.filter((x) => x.id !== id));
  }
  const totalMins = Math.round(library.reduce((s, t) => s + (t.dur || 0), 0) / 60);

  // ---------- PLAYLISTS ----------
  const [plId, setPlId] = useState(null);
  const pl = playlists.find((p) => p.id === plId) || null;
  const [pick, setPick] = useState("");
  const savePl = (next) => save("music_playlists", next);
  const updPl = (id, f) => savePl(playlists.map((p) => (p.id === id ? { ...p, ...f } : p)));

  // ---------- SCHEDULE ----------
  const [scope, setScope] = useState("");   // "" = all stores, else location id
  const schedKey = scope ? "music_schedule:" + scope : "music_schedule";
  const globalSched = parseJSON(getSetting("music_schedule"), { fallback: "", slots: [] });
  const ownRaw = scope ? parseJSON(getSetting(schedKey), null) : null;
  const hasOwn = !!(ownRaw && ((ownRaw.slots && ownRaw.slots.length) || ownRaw.fallback));
  const [draft, setDraft] = useState(null);
  useEffect(() => { setDraft(scope ? (hasOwn ? ownRaw : null) : globalSched); }, [scope, getSetting(schedKey)]); // eslint-disable-line
  const setSlot = (i, f) => setDraft((d) => ({ ...d, slots: d.slots.map((s, j) => (j === i ? { ...s, ...f } : s)) }));

  // ---------- LIVE ----------
  const [heard, setHeard] = useState({});   // loc -> dev -> payload
  const [, tick] = useState(0);
  useEffect(() => {
    if (tab !== "live") return;
    const off = listen(stores.map((s) => musicTopic(s.id)), ["np"], (topic, _e, p) => {
      if (!p || !p.dev) return;
      const loc = topic.slice("music:".length);
      setHeard((h) => ({ ...h, [loc]: { ...(h[loc] || {}), [p.dev]: { ...p, seen: Date.now() } } }));
    });
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => { off(); clearInterval(t); };
  }, [tab, stores.length]); // eslint-disable-line
  const cmd = (loc, c, value) => broadcast(musicTopic(loc), "cmd", { cmd: c, value });

  const plName = (id) => (playlists.find((p) => p.id === id) || {}).name || "—";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(30,36,20,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 980, maxWidth: "96vw", height: "90vh", background: T.bg, borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 12px", borderBottom: "1px solid " + T.line }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 19 }}>Music</div>
            <span onClick={onClose} style={{ fontSize: 22, color: T.muted, cursor: "pointer" }}>×</span>
          </div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>Royalty-free music you hold a licence for, played in every store from approved playlists. Each store plays it on a device opened at <b>{window.location.origin}/music</b>.</div>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {[["library", "Library · " + library.length], ["playlists", "Playlists · " + playlists.length], ["schedule", "Schedule"], ["live", "Stores · live"]].map(([k, l]) => <span key={k} onClick={() => setTab(k)} style={pill(tab === k)}>{l}</span>)}
            {busy && <span style={{ marginLeft: "auto", fontSize: 12.5, color: T.muted, alignSelf: "center" }}>{busy}</span>}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>

          {tab === "library" && (
            <div>
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={label}>Licence record</div>
                <textarea defaultValue={getSetting("music_licence_note")} onBlur={(e) => { if (e.target.value !== getSetting("music_licence_note")) act("set_setting", { key: "music_licence_note", value: e.target.value }); }}
                  placeholder="Where this music is licensed from, the licence or account number, and that it covers playing in business premises, at multiple sites, from your own system." rows={2} style={{ ...input, width: "100%", resize: "vertical", fontFamily: "inherit" }} />
              </div>
              <div onClick={() => fileRef.current && fileRef.current.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                style={{ border: "1.5px dashed " + T.line, borderRadius: 12, padding: 22, textAlign: "center", cursor: "pointer", color: T.muted, fontSize: 13.5, marginBottom: 14, background: T.card }}>
                <b style={{ color: T.ink }}>Upload tracks</b> — click or drop MP3 / M4A files (several at once). “Artist - Title.mp3” fills both names.
                <input ref={fileRef} type="file" accept="audio/*" multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tracks…" style={{ ...input, width: 260 }} />
                <span style={{ fontSize: 12.5, color: T.muted }}>{library.length} tracks · {totalMins} min</span>
              </div>
              <audio ref={audioRef} onEnded={() => setPreview(null)} />
              {library.filter((t) => !q || (t.title + " " + t.artist).toLowerCase().includes(q.toLowerCase())).map((t) => (
                <div key={t.id} style={{ display: "grid", gridTemplateColumns: "34px 1fr 1fr 60px 70px", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: "1px solid " + T.line }}>
                  <span onClick={() => { const a = audioRef.current; if (preview === t.id) { a.pause(); setPreview(null); } else { a.src = t.url; a.play().catch(() => {}); setPreview(t.id); } }} style={{ cursor: "pointer", width: 30, height: 30, borderRadius: 15, background: preview === t.id ? T.ink : T.bg, color: preview === t.id ? T.card : T.ink, border: "1px solid " + T.line, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>{preview === t.id ? "❚❚" : "▶"}</span>
                  <input defaultValue={t.title} onBlur={(e) => { if (e.target.value !== t.title) editTrack(t.id, { title: e.target.value }); }} style={input} />
                  <input defaultValue={t.artist} placeholder="Artist" onBlur={(e) => { if (e.target.value !== t.artist) editTrack(t.id, { artist: e.target.value }); }} style={input} />
                  <span style={{ fontSize: 12.5, color: T.muted }}>{fmtTime(t.dur)}</span>
                  <span onClick={() => removeTrack(t.id)} style={{ fontSize: 12.5, color: "#b4462f", fontWeight: 700, cursor: "pointer" }}>Remove</span>
                </div>
              ))}
              {!library.length && <div style={{ color: T.muted, fontSize: 13 }}>No tracks yet.</div>}
            </div>
          )}

          {tab === "playlists" && (
            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18 }}>
              <div>
                {playlists.map((p) => (
                  <div key={p.id} onClick={() => setPlId(p.id)} style={{ ...card, padding: "10px 12px", marginBottom: 8, cursor: "pointer", borderColor: plId === p.id ? T.ink : T.line }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: T.muted }}>{(p.tracks || []).length} tracks · {Math.round((p.tracks || []).reduce((s, id) => s + ((libMap.get(id) || {}).dur || 0), 0) / 60)} min</div>
                  </div>
                ))}
                <button style={{ ...btn(true), width: "100%" }} onClick={async () => { const name = window.prompt("Playlist name", "Morning"); if (!name) return; const id = uid(); await savePl([...playlists, { id, name, tracks: [] }]); setPlId(id); }}>+ New playlist</button>
              </div>
              <div>
                {!pl ? <div style={{ color: T.muted, fontSize: 13 }}>Pick a playlist, or make one. A playlist is a set of approved tracks; the schedule decides when each one plays.</div> : (
                  <div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                      <input key={pl.id} defaultValue={pl.name} onBlur={(e) => { if (e.target.value && e.target.value !== pl.name) updPl(pl.id, { name: e.target.value }); }} style={{ ...input, fontSize: 15, fontWeight: 700, width: 280 }} />
                      <span onClick={async () => { if (!window.confirm("Delete the playlist “" + pl.name + "”? Schedules using it will skip it.")) return; await savePl(playlists.filter((p) => p.id !== pl.id)); setPlId(null); }} style={{ fontSize: 12.5, color: "#b4462f", fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>Delete playlist</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                      <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ ...input, flex: 1 }}>
                        <option value="">Add a track…</option>
                        {library.filter((t) => !(pl.tracks || []).includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.title}{t.artist ? " — " + t.artist : ""}</option>)}
                      </select>
                      <button style={btn(true)} disabled={!pick} onClick={() => { if (pick) { updPl(pl.id, { tracks: [...(pl.tracks || []), pick] }); setPick(""); } }}>Add</button>
                      <button style={btn(false)} onClick={() => updPl(pl.id, { tracks: Array.from(new Set([...(pl.tracks || []), ...library.map((t) => t.id)])) })}>Add all</button>
                    </div>
                    <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>Plays in random order, never the same track twice in a row.</div>
                    {(pl.tracks || []).map((id, i) => { const t = libMap.get(id); if (!t) return null; return (
                      <div key={id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: "1px solid " + T.line, fontSize: 13.5 }}>
                        <span style={{ color: T.faint, width: 22 }}>{i + 1}</span>
                        <span style={{ flex: 1 }}><b>{t.title}</b>{t.artist ? <span style={{ color: T.muted }}> — {t.artist}</span> : null}</span>
                        <span style={{ color: T.muted, fontSize: 12.5 }}>{fmtTime(t.dur)}</span>
                        <span onClick={() => updPl(pl.id, { tracks: pl.tracks.filter((x) => x !== id) })} style={{ color: "#b4462f", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>Remove</span>
                      </div>
                    ); })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "schedule" && (
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                <span style={label}>Schedule for</span>
                <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...input, width: 280 }}>
                  <option value="">All stores</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{parseJSON(getSetting("music_schedule:" + s.id), null) && (parseJSON(getSetting("music_schedule:" + s.id), {}).slots || []).length ? " · own schedule" : ""}</option>)}
                </select>
              </div>
              {scope && !draft ? (
                <div style={card}>
                  <div style={{ fontSize: 13.5 }}>This store follows the <b>all-stores schedule</b>.</div>
                  <button style={{ ...btn(true), marginTop: 12 }} onClick={() => setDraft(JSON.parse(JSON.stringify(globalSched.slots ? globalSched : { fallback: "", slots: [] })))}>Give this store its own schedule</button>
                </div>
              ) : draft && (
                <div>
                  <div style={{ ...card, marginBottom: 12 }}>
                    <div style={label}>Times of day</div>
                    <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>The first row that matches the time plays. A slot can run past midnight (e.g. 21:00 → 01:00).</div>
                    {(draft.slots || []).map((s, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: 3 }}>
                          {[1, 2, 3, 4, 5, 6, 0].map((d) => { const days = s.days && s.days.length ? s.days : [0, 1, 2, 3, 4, 5, 6]; const on = days.includes(d); return (
                            <span key={d} onClick={() => { const next = on ? days.filter((x) => x !== d) : [...days, d]; setSlot(i, { days: next.length ? next : days }); }} style={{ ...pill(on), padding: "6px 8px", minWidth: 14, textAlign: "center" }}>{DAY_LETTERS[d]}</span>
                          ); })}
                        </div>
                        <input type="time" value={s.from || ""} onChange={(e) => setSlot(i, { from: e.target.value })} style={input} />
                        <span style={{ color: T.muted }}>→</span>
                        <input type="time" value={s.to || ""} onChange={(e) => setSlot(i, { to: e.target.value })} style={input} />
                        <select value={s.playlist || ""} onChange={(e) => setSlot(i, { playlist: e.target.value })} style={{ ...input, minWidth: 180 }}>
                          <option value="">Pick a playlist…</option>
                          {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <span onClick={() => setDraft((d) => ({ ...d, slots: d.slots.filter((_, j) => j !== i) }))} style={{ color: "#b4462f", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>Remove</span>
                      </div>
                    ))}
                    <button style={btn(false)} onClick={() => setDraft((d) => ({ ...d, slots: [...(d.slots || []), { days: [0, 1, 2, 3, 4, 5, 6], from: "08:00", to: "11:00", playlist: "" }] }))}>+ Add a time</button>
                  </div>
                  <div style={{ ...card, marginBottom: 14, display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={label}>Any other time</span>
                    <select value={draft.fallback || ""} onChange={(e) => setDraft((d) => ({ ...d, fallback: e.target.value }))} style={{ ...input, minWidth: 200 }}>
                      <option value="">Silence</option>
                      {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={btn(true)} onClick={async () => { setBusy("Saving…"); await save(schedKey, { fallback: draft.fallback || "", slots: (draft.slots || []).filter((s) => s.playlist && s.from && s.to) }); setBusy("Saved — players switch within seconds"); setTimeout(() => setBusy(""), 3000); }}>Save schedule</button>
                    {scope && <button style={btn(false)} onClick={async () => { await save(schedKey, ""); setDraft(null); }}>Use the all-stores schedule instead</button>}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "live" && (
            <div>
              <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>Players report in every 20 seconds. Volume and on/off are saved for the store; skip and pause act on its players now.</div>
              {stores.map((s) => {
                const devs = Object.values(heard[s.id] || {}).sort((a, b) => b.seen - a.seen);
                const vol = getSetting("music_volume:" + s.id) !== "" ? Number(getSetting("music_volume:" + s.id)) : 70;
                const on = getSetting("music_on:" + s.id) !== "off";
                const sched = parseJSON(getSetting("music_schedule:" + s.id), null);
                return (
                  <div key={s.id} style={{ ...card, marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5, minWidth: 180 }}>{s.name}<div style={{ fontSize: 11.5, color: T.muted, fontWeight: 500 }}>{sched && (sched.slots || []).length ? "Own schedule" : "All-stores schedule"}</div></div>
                      <span onClick={async () => { await act("set_setting", { key: "music_on:" + s.id, value: on ? "off" : "" }); cmd(s.id, "refresh"); }} style={pill(on)}>{on ? "Music on" : "Music off"}</span>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.muted }}>Volume
                        <input type="range" min={0} max={100} step={5} defaultValue={vol} key={s.id + vol} onMouseUp={(e) => { const v = Number(e.target.value); cmd(s.id, "volume", v); act("set_setting", { key: "music_volume:" + s.id, value: String(v) }); }} onTouchEnd={(e) => { const v = Number(e.target.value); cmd(s.id, "volume", v); act("set_setting", { key: "music_volume:" + s.id, value: String(v) }); }} />
                        <b style={{ color: T.ink, width: 34 }}>{vol}%</b>
                      </label>
                      <span style={btn(false)} onClick={() => cmd(s.id, "skip")}>Skip ⏭</span>
                      <span style={btn(false)} onClick={() => cmd(s.id, "pause")}>Pause</span>
                      <span style={btn(false)} onClick={() => cmd(s.id, "play")}>Play</span>
                      <a href={"/music?loc=" + s.id} target="_blank" rel="noreferrer" style={{ ...btn(false), textDecoration: "none", marginLeft: "auto" }}>Open player ↗</a>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      {devs.length ? devs.map((d) => { const live = Date.now() - d.seen < 60000; return (
                        <div key={d.dev} style={{ fontSize: 12.5, color: T.muted, display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 4, background: live ? "#2f8f5b" : "#c9ccc0" }} />
                          <b style={{ color: T.ink }}>{d.name || "Player"}</b>
                          <span>{d.off ? "Music off" : d.paused ? "Paused" : d.title ? "♪ " + d.title + (d.artist ? " — " + d.artist : "") + (d.playlist ? " · " + d.playlist : "") : "Nothing scheduled"}</span>
                          {!live && <span>· last heard {Math.round((Date.now() - d.seen) / 60000)} min ago</span>}
                        </div>
                      ); }) : <div style={{ fontSize: 12.5, color: T.faint }}>No player heard yet. Open {window.location.origin}/music on the store's music device.</div>}
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 12, color: T.faint, marginTop: 6 }}>Playlist names in use: {playlists.map((p) => p.name).join(", ") || "none yet"}. Current all-stores fallback: {plName(globalSched.fallback)}.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
