// Store music: royalty-free tracks the business holds a licence for, played
// in every store from approved playlists on a schedule.
//
// Everything lives in menu_app_settings (read by anon, written through
// admin-api set_setting with the admin PIN), so no new tables or functions:
//   music_library            [{ id, title, artist, url, dur }]
//   music_playlists          [{ id, name, tracks: [trackId] }]
//   music_schedule[:<loc>]   { fallback: playlistId, slots: [{ days:[0-6], from:"08:00", to:"11:00", playlist }] }
//                            (a store's own schedule replaces the all-stores one when set)
//   music_volume:<loc>       0–100, default 70
//   music_on:<loc>           "off" silences that store
//   music_licence_note       free text: where the music is licensed from
// Audio files sit in the public storage bucket "music" (db/music.sql).
//
// Live control goes over Supabase Realtime broadcast, channel music:<loc>:
// players send "np" (now playing) every 20s, Admin sends "cmd"
// ({ cmd: skip|pause|play|volume|refresh, value, target }).

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const MUSIC_BUCKET = "music";
export const musicTopic = (loc) => "music:" + loc;

export function parseJSON(v, fallback) {
  if (v == null || v === "") return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

const mins = (hhmm) => { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// Which playlist should be playing at `when` under `schedule`. Slots may run
// past midnight (21:00–01:00); the part after midnight counts for the day the
// slot started, matching the 04:00 trading day.
export function activeSlot(schedule, when = new Date()) {
  const s = schedule || {};
  const now = when.getHours() * 60 + when.getMinutes();
  const day = when.getDay();
  const yday = (day + 6) % 7;
  for (const slot of s.slots || []) {
    if (!slot || !slot.playlist) continue;
    const a = mins(slot.from), b = mins(slot.to), days = slot.days && slot.days.length ? slot.days : [0, 1, 2, 3, 4, 5, 6];
    if (a < b) { if (days.includes(day) && now >= a && now < b) return slot; }
    else if (a > b) {             // overnight
      if (days.includes(day) && now >= a) return slot;
      if (days.includes(yday) && now < b) return slot;
    }
  }
  return s.fallback ? { playlist: s.fallback, fallback: true } : null;
}

export async function broadcast(topic, event, payload) {
  if (!SUPABASE_URL) return false;
  try {
    const r = await fetch(SUPABASE_URL + "/realtime/v1/api/broadcast", {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic, event, payload }] }),
      keepalive: true,
    });
    return r.ok;
  } catch { return false; }
}

// Subscribe to one or more topics; handler(topic, event, payload). Returns an
// unsubscribe function. The Realtime client is loaded only where it's used.
export function listen(topics, events, handler) {
  let client = null, chans = [], dead = false;
  if (!SUPABASE_URL || !topics.length) return () => {};
  import("@supabase/supabase-js").then(({ createClient }) => {
    if (dead) return;
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    chans = topics.map((t) => {
      let ch = client.channel(t);
      for (const ev of events) ch = ch.on("broadcast", { event: ev }, (m) => handler(t, ev, m && m.payload));
      return ch.subscribe();
    });
  }).catch(() => {});
  return () => { dead = true; try { chans.forEach((c) => client && client.removeChannel(c)); } catch { /* closing */ } };
}

export function fmtTime(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
export const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
