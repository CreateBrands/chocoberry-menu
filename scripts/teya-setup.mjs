#!/usr/bin/env node
// ============================================================
// teya-setup — one command for the whole Teya wiring.
//
//   1. device-code sign-in as the Teya account holder
//   2. list the POSLink stores on that account
//   3. register an ePOS per store (idempotent on epos_external_id)
//   4. list each store's terminals, showing the RAW reply on failure
//   5. write the credentials straight into Supabase (teya_credentials)
//      when a service-role key is available, and always also write
//      teya-credentials.sql as a fallback
//   6. print the mapping SQL with the real store/terminal ids filled in
//
// Usage (cmd.exe), from the repo root:
//   set TEYA_CLIENT_ID=739f78e4-0b44-4cab-bb00-4ea14ae9b2c6
//   set TEYA_CLIENT_SECRET=...
//   set SUPABASE_URL=https://qtjsdbasoouslcpinqhu.supabase.co
//   set SUPABASE_SERVICE_ROLE_KEY=...        (Supabase → Settings → API → service_role)
//   node scripts\teya-setup.mjs --env staging
//
// Without the two SUPABASE_* values it still does everything except the
// database write, and tells you to run teya-credentials.sql yourself.
// ============================================================
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};

const ENV = String(flag("env", "staging")).toLowerCase();
const ID = ENV === "staging" ? "https://id.teya.xyz" : "https://id.teya.com";
const API = ENV === "staging" ? "https://api.teya.xyz" : "https://api.teya.com";
const TOKEN_URL = ID + "/oauth/v2/oauth-token";
const UA = "Chocoberry-Integration/1.0";

const CLIENT_ID = process.env.TEYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TEYA_CLIENT_SECRET;
const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const looksPlaceholder = (v) => !v || /^<|>$/.test(v) || /^(paste|your|\.\.\.)/i.test(v);
if (looksPlaceholder(CLIENT_ID)) {
  console.error("set TEYA_CLIENT_ID first (the device-code app id, no < > brackets)");
  process.exit(1);
}

// Scopes we actually use. The registration hands back a longer list including
// default_access (deprecated) and internal ones; requesting those can fail the
// token exchange, so each store is stored with a narrowed set.
const SCOPES_POSLINK = "payment_requests payment_requests/id stores/id/terminals refunds";
const SCOPES_ECOM = "payment-links/create payment-links/id/get payment-links/id/update refunds";

const form = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null)).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const slug = (s) => String(s || "store").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const arr = (x, k) => (Array.isArray(x) ? x : x?.[k] || x?.items || []);

// ---- 1. device-code sign-in -------------------------------------------
async function deviceLogin() {
  const basic = "Basic " + Buffer.from(CLIENT_ID + ":" + (CLIENT_SECRET || "")).toString("base64");
  const r = await fetch(ID + "/oauth/v2/device", {
    method: "POST",
    headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": UA },
    body: "",
  });
  const j = await r.json().catch(() => ({}));
  if (!j.device_code) {
    console.error("device authorisation failed: " + r.status + " " + JSON.stringify(j));
    process.exit(1);
  }
  console.log("\n==> Open this and sign in as the Teya account holder (use an incognito window");
  console.log("    so it does not reuse another Teya session):\n");
  console.log("    " + (j.verification_uri_complete || j.verification_uri));
  console.log("    Code: " + j.user_code + "\n");
  const interval = Math.max(2, Number(j.interval || 5)) * 1000;
  const until = Date.now() + Number(j.expires_in || 600) * 1000;
  while (Date.now() < until) {
    await sleep(interval);
    const t = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: form({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: j.device_code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
    });
    const tj = await t.json().catch(() => ({}));
    if (t.ok && tj.access_token) { console.log("Signed in.\n"); return tj.access_token; }
    if (tj.error === "authorization_pending" || tj.error === "slow_down") { process.stdout.write("."); continue; }
    console.error("\ntoken error: " + t.status + " " + JSON.stringify(tj));
    process.exit(1);
  }
  console.error("timed out waiting for sign-in");
  process.exit(1);
}

async function api(token, method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + token, Accept: "application/json", "User-Agent": UA, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!r.ok) { const e = new Error(method + " " + path + " -> " + r.status + " " + text.slice(0, 400)); e.status = r.status; e.body = data; throw e; }
  return data;
}

// ---- machine token, to prove the stored credentials work --------------
async function machineToken(clientId, clientSecret, scope) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64") },
    body: form({ grant_type: "client_credentials", scope }),
  });
  const j = await r.json().catch(() => ({}));
  return j.access_token ? { ok: true, scope: j.scope } : { ok: false, status: r.status, body: j };
}

// ---- Supabase upsert via PostgREST -----------------------------------
async function sbUpsert(rows) {
  if (!SB_URL || !SB_KEY) return { skipped: true };
  const r = await fetch(SB_URL + "/rest/v1/teya_credentials?on_conflict=store_id", {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: "Bearer " + SB_KEY,
      "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text.slice(0, 400) };
}

// ---- run --------------------------------------------------------------
const token = await deviceLogin();

const rawStores = await api(token, "GET", "/poslink/v1/stores");
const stores = arr(rawStores, "stores");
if (!stores.length) {
  console.error("No POSLink stores on this login. Raw reply:\n" + JSON.stringify(rawStores, null, 2).slice(0, 1200));
  console.error("\nSign in as the test-store merchant login, not the partner-portal one.");
  process.exit(1);
}

const sql = [
  "-- Generated by scripts/teya-setup.mjs on " + new Date().toISOString(),
  "-- Contains live secrets: run it, then DELETE THIS FILE. Do not commit it.",
  "",
];
const rows = [];
const mapping = [];

for (const s of stores) {
  const sid = s.id || s.store_id;
  const name = s.name || s.store_name || sid;
  if (flag("store") && flag("store") !== sid) continue;
  const isEcom = /ecom/i.test(name);
  const scopes = isEcom ? SCOPES_ECOM : SCOPES_POSLINK;

  console.log("=".repeat(60));
  console.log("Store: " + name);
  console.log("  store_id: " + sid + "   (" + (isEcom ? "online payments / kiosk QR" : "POSLink card machine") + ")");

  const reg = await api(token, "POST", "/poslink/v1/epos/register", { store_id: sid, epos_external_id: "chocoberry-pos-" + slug(name) });
  console.log("  ePOS client_id: " + reg.client_id);

  const tok = await machineToken(reg.client_id, reg.client_secret, scopes);
  console.log("  machine token with narrowed scopes: " + (tok.ok ? "OK" : "FAILED " + tok.status + " " + JSON.stringify(tok.body).slice(0, 200)));

  let terminals = [];
  try {
    terminals = arr(await api(token, "GET", "/poslink/v1/stores/" + sid + "/terminals"), "terminals");
    if (!terminals.length) console.log("  terminals: NONE attached to this store");
    for (const t of terminals) console.log("  terminal: " + (t.id || t.terminal_id) + "  " + (t.serial_number || t.serial || "") + "  " + (t.status || ""));
  } catch (e) {
    console.log("  terminals: request failed -> " + e.message);
  }

  rows.push({ store_id: sid, store_name: name, client_id: reg.client_id, client_secret: reg.client_secret, scopes });
  sql.push(
    "insert into teya_credentials (store_id, store_name, client_id, client_secret, scopes) values (" +
      [sid, name, reg.client_id, reg.client_secret, scopes].map(q).join(", ") + ")",
    "  on conflict (store_id) do update set client_id = excluded.client_id, client_secret = excluded.client_secret, scopes = excluded.scopes, store_name = excluded.store_name;",
    "",
  );
  mapping.push({ sid, name, isEcom, terminals });
}

writeFileSync("teya-credentials.sql", sql.join("\n"));

const up = await sbUpsert(rows);
console.log("\n" + "=".repeat(60));
if (up.skipped) {
  console.log("Supabase: not written (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set).");
  console.log("  -> open teya-credentials.sql, paste it into the Supabase SQL editor and run it.");
} else if (up.ok) {
  console.log("Supabase: teya_credentials written directly (" + rows.length + " store(s)). Nothing to paste.");
  console.log("  -> delete teya-credentials.sql, it is only a fallback copy.");
} else {
  console.log("Supabase write failed: " + up.status + " " + up.body);
  console.log("  -> run teya-credentials.sql in the SQL editor instead.");
}

// ---- mapping SQL, with real ids ---------------------------------------
console.log("\n" + "=".repeat(60));
console.log("Mapping SQL — pick the café id first:\n");
console.log("  select id, name from menu_locations order by name;\n");
console.log("then run, with that id in place of LOCATION_ID:\n");
for (const m of mapping) {
  if (m.isEcom) {
    console.log("-- " + m.name + " (kiosk QR / pay by link)");
    console.log("insert into teya_checkout_stores (location_id, store_id) values ('LOCATION_ID', '" + m.sid + "')");
    console.log("  on conflict (location_id) do update set store_id = excluded.store_id, updated_at = now();\n");
  } else if (m.terminals.length) {
    console.log("-- " + m.name + " (card machine)");
    for (const t of m.terminals) {
      console.log("insert into teya_terminals (location_id, store_id, terminal_id, label, tablet_no, active) values ('LOCATION_ID', '" + m.sid + "', '" + (t.id || t.terminal_id) + "', " + q((t.serial_number || t.serial || "Teya terminal") + " (" + ENV + ")") + ", null, true) on conflict do nothing;");
    }
    console.log("");
  } else {
    console.log("-- " + m.name + ": no terminal to map yet. Activate the terminal app against");
    console.log("--   this store, then re-run this script.\n");
  }
}
