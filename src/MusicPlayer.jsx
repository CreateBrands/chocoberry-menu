import { useEffect, useRef, useState } from "react";
import { activeSlot, broadcast, listen, musicTopic, parseJSON, fmtTime, uid } from "./music.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const H = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY };

// /music — the store's background music player. Open it on whatever drives
// the speakers (tablet, phone, PC, Android box), pick the store once, tap
// Start. It plays the approved playlists on the schedule set in Admin → Music,
// crossfades, keeps the tracks on the device so a dropped connection doesn't
// stop the music, and takes skip / pause / volume from Admin live.
const CACHE = "music-v1";
const FADE_MS = 3500;
const REFRESH_MS = 5 * 60 * 1000;
const ls = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } },
};

async function srcFor(url) {
  if (typeof caches === "undefined") return url;
  try {
    const c = await caches.open(CACHE);
    let r = await c.match(url);
    if (!r) {
      const f = await fetch(url, { mode: "cors" });
      if (!f.ok) throw new Error("http " + f.status);
      try { await c.put(url, f.clone()); } catch { /* storage full: stream instead */ }
      r = f;
    }
    return URL.createObjectURL(await r.blob());
  } catch {
    return navigator.onLine ? url : null;
  }
}

function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

export default function MusicPlayer() {
  const qs = new URLSearchParams(window.location.search);
  const [loc, setLoc] = useState(qs.get("loc") || ls.get("music_loc", ""));
  const [name, setName] = useState(ls.get("music_name", "Music player"));
  const dev = useRef(ls.get("music_dev", "") || (() => { const d = uid(); ls.set("music_dev", d); return d; })());
  const [stores, setStores] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [started, setStarted] = useState(false);
  const [needTap, setNeedTap] = useState(false);
  const [now, setNow] = useState(null);          // { track, playlist, slot }
  const [paused, setPaused] = useState(false);
  const [pos, setPos] = useState({ t: 0, d: 0 });
  const [localVol, setLocalVol] = useState(Number(ls.get("music_local_vol", "100")));
  const [msg, setMsg] = useState("");

  const cfgRef = useRef(null); cfgRef.current = cfg;
  const A = useRef(null), B = useRef(null);      // two players for crossfades
  const cur = useRef(null);                       // the element playing now
  const advancing = useRef(false);
  const queues = useRef({});                      // playlistId -> remaining shuffled ids
  const recent = useRef([]);
  const pausedRef = useRef(false); pausedRef.current = paused;
  const localVolRef = useRef(localVol); localVolRef.current = localVol;
  const nowRef = useRef(null); nowRef.current = now;

  // ---- config ----
  useEffect(() => {
    if (loc) return;
    fetch(SUPABASE_URL + "/rest/v1/menu_locations?select=id,name&active=eq.true&order=name", { headers: H })
      .then((r) => r.ok ? r.json() : []).then(setStores).catch(() => {});
  }, [loc]);

  async function loadCfg() {
    if (!loc) return;
    const keys = ["music_library", "music_playlists", "music_schedule", "music_schedule:" + loc, "music_volume:" + loc, "music_on:" + loc,
      "brand_name", "brand_name:" + loc, "brand_logo_url", "brand_logo_url:" + loc, "brand_primary", "brand_primary:" + loc];
    try {
      const r = await fetch(SUPABASE_URL + "/rest/v1/menu_app_settings?select=key,value&key=in.(" + keys.map((k) => '"' + k + '"').join(",") + ")", { headers: H, cache: "no-store" });
      if (!r.ok) throw new Error("http " + r.status);
      const m = {}; for (const row of await r.json()) m[row.key] = row.value;
      const own = parseJSON(m["music_schedule:" + loc], null);
      const next = {
        library: parseJSON(m.music_library, []),
        playlists: parseJSON(m.music_playlists, []),
        schedule: own && ((own.slots && own.slots.length) || own.fallback) ? own : parseJSON(m.music_schedule, {}),
        volume: m["music_volume:" + loc] !== undefined && m["music_volume:" + loc] !== "" ? Number(m["music_volume:" + loc]) : 70,
        on: m["music_on:" + loc] !== "off",
        brand: m["brand_name:" + loc] || m.brand_name || "Chocoberry",
        logo: m["brand_logo_url:" + loc] || m.brand_logo_url || "",
        primary: m["brand_primary:" + loc] || m.brand_primary || "#ec4899",
      };
      setCfg(next);
      ls.set("music_cfg:" + loc, JSON.stringify(next));
    } catch {
      if (!cfgRef.current) { const c = parseJSON(ls.get("music_cfg:" + loc, ""), null); if (c) setCfg(c); }
    }
  }
  useEffect(() => { loadCfg(); const t = setInterval(loadCfg, REFRESH_MS); return () => clearInterval(t); }, [loc]); // eslint-disable-line

  // ---- the engine ----
  const target = () => { const c = cfgRef.current; return Math.max(0, Math.min(1, ((c ? c.volume : 70) / 100) * (localVolRef.current / 100))); };
  function fade(el, to, ms, then) {
    if (!el) return;
    if (el._fade) clearInterval(el._fade);
    const from = el.volume, steps = Math.max(1, Math.round(ms / 100)); let i = 0;
    el._fade = setInterval(() => {
      i++; el.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if (i >= steps) { clearInterval(el._fade); el._fade = null; if (then) then(); }
    }, 100);
  }

  function pickTrack() {
    const c = cfgRef.current; if (!c) return null;
    const slot = activeSlot(c.schedule);
    if (!slot) return null;
    const pl = (c.playlists || []).find((p) => p.id === slot.playlist);
    if (!pl) return null;
    const lib = new Map((c.library || []).map((t) => [t.id, t]));
    const ids = (pl.tracks || []).filter((id) => lib.has(id));
    if (!ids.length) return null;
    let q = (queues.current[pl.id] || []).filter((id) => lib.has(id));
    if (!q.length) { q = shuffle(ids); if (ids.length > 2 && recent.current.includes(q[0])) q.push(q.shift()); }
    const id = q.shift(); queues.current[pl.id] = q;
    recent.current = [id, ...recent.current].slice(0, 5);
    return { track: lib.get(id), playlist: pl, slot };
  }

  async function playNext() {
    const c = cfgRef.current;
    if (!c || !c.on) { advancing.current = false; return; }
    for (let tries = 0; tries < 8; tries++) {
      const p = pickTrack();
      if (!p) { setMsg("Nothing scheduled to play right now."); advancing.current = false; setTimeout(() => { if (!cur.current || cur.current.paused) playNext(); }, 60000); return; }
      const src = await srcFor(p.track.url);
      if (!src) continue;                         // offline and not on this device yet
      const next = cur.current === A.current ? B.current : A.current;
      const prev = cur.current;
      if (next._blob) { try { URL.revokeObjectURL(next._blob); } catch { /* ok */ } }
      next._blob = src.startsWith("blob:") ? src : null;
      next.src = src; next.volume = 0; next.currentTime = 0;
      try { await next.play(); } catch (e) { if (e && e.name === "NotAllowedError") { setNeedTap(true); advancing.current = false; return; } continue; }
      cur.current = next; setMsg(""); setNeedTap(false);
      fade(next, pausedRef.current ? 0 : target(), FADE_MS);
      if (prev && !prev.paused) fade(prev, 0, FADE_MS, () => prev.pause());
      setNow(p);
      if ("mediaSession" in navigator) { try { navigator.mediaSession.metadata = new window.MediaMetadata({ title: p.track.title, artist: p.track.artist || "", album: p.playlist.name }); } catch { /* ok */ } }
      advancing.current = false;
      return;
    }
    setMsg("Can't reach the music right now — retrying."); advancing.current = false;
    setTimeout(() => { if (!cur.current || cur.current.paused) playNext(); }, 30000);
  }

  useEffect(() => {
    const els = [A.current, B.current];
    const onTime = (e) => {
      const el = e.target; if (el !== cur.current) return;
      if (el === cur.current) setPos({ t: el.currentTime, d: el.duration || 0 });
      if (!advancing.current && el.duration && el.duration - el.currentTime < FADE_MS / 1000 + 0.3) { advancing.current = true; playNext(); }
    };
    const onEnd = (e) => { if (e.target === cur.current && !advancing.current) { advancing.current = true; playNext(); } };
    els.forEach((el) => { el.addEventListener("timeupdate", onTime); el.addEventListener("ended", onEnd); el.addEventListener("error", onEnd); });
    return () => els.forEach((el) => { el.removeEventListener("timeupdate", onTime); el.removeEventListener("ended", onEnd); el.removeEventListener("error", onEnd); });
  }, []); // eslint-disable-line

  function start() {
    // Unlock both players inside the tap, so later tracks can start on their own.
    [A.current, B.current].forEach((el) => { try { el.muted = false; const p = el.play(); if (p) p.catch(() => {}); el.pause(); } catch { /* ok */ } });
    setStarted(true); setNeedTap(false);
    advancing.current = true; playNext();
    try { navigator.wakeLock && navigator.wakeLock.request("screen").catch(() => {}); } catch { /* ok */ }
  }
  // Inside the Customer Display app autoplay is allowed: start straight away.
  useEffect(() => { if (cfg && !started && qs.get("autostart") === "1") start(); }, [cfg]); // eslint-disable-line
  useEffect(() => {
    const v = () => { if (document.visibilityState === "visible" && started) { try { navigator.wakeLock && navigator.wakeLock.request("screen").catch(() => {}); } catch { /* ok */ } } };
    document.addEventListener("visibilitychange", v); return () => document.removeEventListener("visibilitychange", v);
  }, [started]);

  // Settings changed: switched off/on, volume, or the slot has moved on.
  useEffect(() => {
    if (!started || !cfg) return;
    const el = cur.current;
    if (!cfg.on) { if (el && !el.paused) fade(el, 0, 1500, () => el.pause()); return; }
    if (!el || (el.paused && !pausedRef.current)) { if (!advancing.current) { advancing.current = true; playNext(); } return; }
    if (!pausedRef.current) fade(el, target(), 800);
  }, [cfg, started]); // eslint-disable-line
  useEffect(() => {          // a schedule change switches playlist at the next track; check each minute for a gap
    if (!started) return;
    const t = setInterval(() => { const el = cur.current; if (cfgRef.current && cfgRef.current.on && !pausedRef.current && (!el || el.paused) && !advancing.current) { advancing.current = true; playNext(); } }, 60000);
    return () => clearInterval(t);
  }, [started]); // eslint-disable-line

  function setPausedTo(p) {
    const el = cur.current; setPaused(p);
    if (!el) return;
    if (p) fade(el, 0, 800, () => el.pause());
    else { el.play().then(() => fade(el, target(), 1200)).catch(() => setNeedTap(true)); }
  }
  function skip() {
    if (pausedRef.current) { setPaused(false); pausedRef.current = false; }   // skipping while paused means "play something else"
    if (!advancing.current) { advancing.current = true; playNext(); }
  }
  function nudge(d) { const v = Math.max(0, Math.min(100, localVolRef.current + d)); setLocalVol(v); ls.set("music_local_vol", String(v)); localVolRef.current = v; const el = cur.current; if (el && !pausedRef.current) fade(el, target(), 300); }

  // ---- live control + now-playing ----
  useEffect(() => {
    if (!loc) return;
    return listen([musicTopic(loc)], ["cmd"], (_t, _e, p) => {
      if (!p || (p.target && p.target !== dev.current)) return;
      if (p.cmd === "skip") skip();
      else if (p.cmd === "pause") setPausedTo(true);
      else if (p.cmd === "play") setPausedTo(false);
      else if (p.cmd === "refresh") loadCfg();
      else if (p.cmd === "volume" && cfgRef.current) setCfg({ ...cfgRef.current, volume: Number(p.value) });
    });
  }, [loc]); // eslint-disable-line
  useEffect(() => {
    if (!loc || !started) return;
    const send = () => { const n = nowRef.current; broadcast(musicTopic(loc), "np", { dev: dev.current, name, title: n ? n.track.title : "", artist: n ? n.track.artist || "" : "", playlist: n ? n.playlist.name : "", paused: pausedRef.current, off: cfgRef.current ? !cfgRef.current.on : false, vol: cfgRef.current ? cfgRef.current.volume : 70, at: Date.now() }); };
    send(); const t = setInterval(send, 20000); return () => clearInterval(t);
  }, [loc, started, name, now, paused, cfg && cfg.on]); // eslint-disable-line

  // Keep today's music on the device, a track at a time, so a dropped
  // connection doesn't stop it. Tracks no longer in the library are cleared.
  useEffect(() => {
    if (!started || !cfg || typeof caches === "undefined") return;
    let stop = false;
    (async () => {
      try {
        const c = await caches.open(CACHE);
        const lib = new Map((cfg.library || []).map((t) => [t.id, t]));
        const wanted = new Set();
        for (const s of [...(cfg.schedule.slots || []), { playlist: cfg.schedule.fallback }]) {
          const pl = (cfg.playlists || []).find((p) => p.id === s.playlist);
          for (const id of (pl && pl.tracks) || []) if (lib.has(id)) wanted.add(lib.get(id).url);
        }
        for (const req of await c.keys()) if (!wanted.has(req.url)) await c.delete(req);
        for (const url of wanted) {
          if (stop) return;
          if (await c.match(url)) continue;
          try { const r = await fetch(url, { mode: "cors" }); if (r.ok) await c.put(url, r); } catch { /* next time */ }
          await new Promise((res) => setTimeout(res, 1500));
        }
      } catch { /* cache unavailable */ }
    })();
    return () => { stop = true; };
  }, [started, cfg]);

  // ---- screens ----
  const accent = (cfg && cfg.primary) || "#ec4899";
  const shell = { minHeight: "100vh", background: "radial-gradient(circle at 30% 20%, " + accent + "33, #111014 60%)", color: "#fff", fontFamily: "'Poppins',system-ui,sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box", textAlign: "center" };
  const btn = (primary) => ({ border: "none", borderRadius: 16, padding: "16px 28px", fontSize: 17, fontWeight: 800, cursor: "pointer", background: primary ? "#fff" : "rgba(255,255,255,.12)", color: primary ? "#111014" : "#fff", fontFamily: "inherit" });
  const audio = <><audio ref={A} preload="auto" playsInline /><audio ref={B} preload="auto" playsInline /></>;

  if (!loc) {
    return (
      <div style={shell}>{audio}
        <div style={{ fontSize: 30, fontWeight: 900 }}>Store music</div>
        <div style={{ opacity: .7, marginTop: 6, maxWidth: 420 }}>Set this device up once. It plays the approved music for the store you pick.</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Front speakers" style={{ marginTop: 24, width: 320, maxWidth: "100%", padding: "14px 16px", borderRadius: 12, border: "none", fontSize: 16, fontFamily: "inherit" }} />
        <div style={{ marginTop: 16, display: "grid", gap: 10, width: 320, maxWidth: "100%" }}>
          {stores.map((s) => <button key={s.id} style={btn(false)} onClick={() => { ls.set("music_loc", s.id); ls.set("music_name", name || "Music player"); setLoc(s.id); }}>{s.name}</button>)}
          {!stores.length && <div style={{ opacity: .6 }}>Loading stores…</div>}
        </div>
      </div>
    );
  }

  if (!started || needTap) {
    return (
      <div style={shell}>{audio}
        {cfg && cfg.logo ? <img src={cfg.logo} alt="" style={{ maxHeight: 70, maxWidth: 260, objectFit: "contain" }} /> : <div style={{ fontSize: 28, fontWeight: 900 }}>{(cfg && cfg.brand) || "Store music"}</div>}
        <button onClick={start} disabled={!cfg} style={{ ...btn(true), marginTop: 34, padding: "26px 46px", fontSize: 22, borderRadius: 22 }}>▶ Start music</button>
        <div style={{ opacity: .65, marginTop: 14, fontSize: 14 }}>{name} · tap once after switching the device on</div>
        <div onClick={() => { ls.set("music_loc", ""); setLoc(""); }} style={{ marginTop: 30, opacity: .45, fontSize: 13, cursor: "pointer" }}>Change store</div>
      </div>
    );
  }

  const off = cfg && !cfg.on;
  const until = now && now.slot && !now.slot.fallback ? now.slot.to : "";
  return (
    <div style={shell}>{audio}
      <div style={{ position: "absolute", top: 22, left: 26, opacity: .8, fontWeight: 800 }}>{(cfg && cfg.brand) || ""} · {name}</div>
      {off ? (
        <><div style={{ fontSize: 30, fontWeight: 900 }}>Music is off</div><div style={{ opacity: .7, marginTop: 8 }}>Switched off for this store in Admin → Music.</div></>
      ) : now ? (
        <>
          <div style={{ fontSize: 13, letterSpacing: ".16em", fontWeight: 800, opacity: .65 }}>{paused ? "PAUSED" : "NOW PLAYING"} · {now.playlist.name.toUpperCase()}{until ? " · UNTIL " + until : ""}</div>
          <div style={{ fontSize: "clamp(28px, 6vw, 56px)", fontWeight: 900, marginTop: 14, lineHeight: 1.1, maxWidth: "90vw" }}>{now.track.title}</div>
          {now.track.artist && <div style={{ fontSize: 20, opacity: .75, marginTop: 8 }}>{now.track.artist}</div>}
          <div style={{ width: "min(520px, 86vw)", marginTop: 28 }}>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.18)", overflow: "hidden" }}><div style={{ height: "100%", width: (pos.d ? Math.min(100, (pos.t / pos.d) * 100) : 0) + "%", background: accent }} /></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: .6, marginTop: 6 }}><span>{fmtTime(pos.t)}</span><span>{fmtTime(pos.d)}</span></div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 26, flexWrap: "wrap", justifyContent: "center" }}>
            <button style={btn(false)} onClick={() => nudge(-10)}>－ Vol</button>
            <button style={btn(true)} onClick={() => setPausedTo(!paused)}>{paused ? "▶ Play" : "❚❚ Pause"}</button>
            <button style={btn(false)} onClick={skip}>Skip ⏭</button>
            <button style={btn(false)} onClick={() => nudge(10)}>＋ Vol</button>
          </div>
          <div style={{ fontSize: 12, opacity: .5, marginTop: 12 }}>Volume {Math.round(target() * 100)}%</div>
        </>
      ) : (
        <div style={{ opacity: .8 }}>{msg || "Starting…"}</div>
      )}
      {msg && now && <div style={{ position: "absolute", bottom: 20, fontSize: 13, opacity: .6 }}>{msg}</div>}
    </div>
  );
}
