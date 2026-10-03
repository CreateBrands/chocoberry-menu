#!/usr/bin/env node
// One-time POSLink registration (run on your PC, Node 18+):
//   1. device-code sign-in as the Chocoberry Teya account holder
//   2. list Teya stores + terminals
//   3. register an ePOS per store → machine client_id/secret
//   4. write teya-credentials.sql (INSERTs for teya_credentials + teya_terminals)
//
// Usage (cmd.exe):
//   set TEYA_CLIENT_ID=739f78e4-0b44-4cab-bb00-4ea14ae9b2c6
//   set TEYA_CLIENT_SECRET=...        (the device-code app's secret)
//   node scripts\teya-register.mjs --env production
// Options: --env production|staging   --device-url <url>   (if Teya's doc shows a
//          different device-authorisation endpoint)   --store <teya store uuid> (just one)
import { writeFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]); return a; }, []));
const ENV = (args.env || "production").toLowerCase();
const ID = ENV === "staging" ? "https://id.teya.xyz" : "https://id.teya.com";
const API = ENV === "staging" ? "https://api.teya.xyz" : "https://api.teya.com";
const TOKEN_URL = ID + "/oauth/v2/oauth-token";
const DEVICE_URL = args["device-url"] || ID + "/oauth/v2/device-authorization";
const CLIENT_ID = process.env.TEYA_CLIENT_ID, CLIENT_SECRET = process.env.TEYA_CLIENT_SECRET;
if (!CLIENT_ID) { console.error("set TEYA_CLIENT_ID first"); process.exit(1); }

const form = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null)).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = args["device-url"] ? [args["device-url"]] : [
  ID + "/oauth/v2/device",
  ID + "/oauth/v2/device-authorization", ID + "/oauth/v2/oauth-device-authorization", ID + "/oauth/v2/device_authorization",
  ID + "/oauth/v2/oauth-device", ID + "/oauth/v2/device", ID + "/oauth/v2/devicecode", ID + "/oauth/v2/device/code",
  ID + "/oauth/v2/device-code", ID + "/oauth/device-authorization", ID + "/oauth/v2/oauth-device-code",
];
async function deviceLogin() {
  let r = null, j = {}, used = null;
  const basic = "Basic " + Buffer.from(CLIENT_ID + ":" + (CLIENT_SECRET || "")).toString("base64");
  const scope = args.scope || undefined;
  // Different identity servers want the client authenticated differently; try each.
  const attempts = [
    { name: "basic auth", headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" }, body: form({ scope }) },
    { name: "basic auth + client_id", headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" }, body: form({ client_id: CLIENT_ID, scope }) },
    { name: "form id+secret", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope }) },
    { name: "form id only", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ client_id: CLIENT_ID, scope }) },
    { name: "json id+secret", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...(scope ? { scope } : {}) }) },
  ];
  outer: for (const url of CANDIDATES) {
    for (const a of attempts) {
      r = await fetch(url, { method: "POST", headers: { Accept: "application/json", ...a.headers }, body: a.body });
      if (r.status === 404 || r.status === 405) continue outer;
      j = await r.json().catch(() => ({}));
      if (j.device_code) { used = url; console.log("Client auth:", a.name); break outer; }
      console.error("  " + url + " [" + a.name + "] → " + r.status + " " + JSON.stringify(j).slice(0, 160));
    }
  }
  if (!used) { console.error("\nNo device-authorisation endpoint answered. Tried:\n  " + CANDIDATES.join("\n  ") + "\nOpen the app page's 'Read more about OAuth device code grant' link and pass its URL: --device-url <url>"); process.exit(1); }
  console.log("Device endpoint:", used);
  console.log("\n==> Open this page and sign in with the Chocoberry Teya account:\n   ", j.verification_uri_complete || j.verification_uri, "\n    Code:", j.user_code, "\n");
  const interval = Math.max(2, Number(j.interval || 5)) * 1000;
  const until = Date.now() + Number(j.expires_in || 600) * 1000;
  while (Date.now() < until) {
    await sleep(interval);
    const t = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: j.device_code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }) });
    const tj = await t.json().catch(() => ({}));
    if (t.ok && tj.access_token) { console.log("Signed in."); return tj.access_token; }
    if (tj.error === "authorization_pending" || tj.error === "slow_down") { process.stdout.write("."); continue; }
    console.error("\nToken error:", t.status, tj); process.exit(1);
  }
  console.error("Timed out waiting for sign-in."); process.exit(1);
}

async function api(token, method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (!r.ok) throw new Error(method + " " + path + " → " + r.status + " " + text.slice(0, 300));
  return j;
}
const arr = (x, k) => Array.isArray(x) ? x : (x?.[k] || x?.items || []);
const slug = (s) => String(s || "store").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const token = await deviceLogin();
const rawStores = await api(token, "GET", "/poslink/v1/stores");
const stores = arr(rawStores, "stores");
if (!stores.length) {
  console.error("No POSLink stores on this account. Raw reply from GET /poslink/v1/stores:\n" + JSON.stringify(rawStores, null, 2).slice(0, 2000));
  try { const me = await api(token, "GET", "/poslink/v1/stores?limit=100"); console.error("With ?limit=100:\n" + JSON.stringify(me, null, 2).slice(0, 1000)); } catch (e) { console.error(String(e.message)); }
  console.error("\nIf this is [] or {stores: []}: the signed-in user has no POSLink stores — sign in with the SANDBOX MERCHANT (business) login Teya gave you, not the partner-portal login, and ask Teya to confirm a POSLink store + terminal exist on it.");
  process.exit(1);
}
const sql = ["-- Generated by scripts/teya-register.mjs on " + new Date().toISOString(), "-- Run in Supabase SQL editor, then DELETE THIS FILE (it contains secrets).", ""];
for (const s of stores) {
  const sid = s.id || s.store_id, name = s.name || s.store_name || sid;
  if (args.store && args.store !== sid) continue;
  console.log("\nStore:", name, sid);
  const terms = arr(await api(token, "GET", "/poslink/v1/stores/" + sid + "/terminals").catch(() => []), "terminals");
  terms.forEach((t) => console.log("   terminal", t.id || t.terminal_id, t.serial_number || t.serial || "", t.status || ""));
  const reg = await api(token, "POST", "/poslink/v1/epos/register", { store_id: sid, epos_external_id: "chocoberry-pos-" + slug(name) });
  console.log("   registered → client_id", reg.client_id, "scopes:", Array.isArray(reg.scopes) ? reg.scopes.join(" ") : reg.scopes);
  sql.push(`insert into teya_credentials (store_id, store_name, client_id, client_secret, scopes) values (${q(sid)}, ${q(name)}, ${q(reg.client_id)}, ${q(reg.client_secret)}, ${q(Array.isArray(reg.scopes) ? reg.scopes.join(" ") : (reg.scopes || ""))})`);
  sql.push(`  on conflict (store_id) do update set client_id = excluded.client_id, client_secret = excluded.client_secret, scopes = excluded.scopes, store_name = excluded.store_name;`);
  terms.forEach((t, i) => sql.push(`-- insert into teya_terminals (location_id, store_id, terminal_id, label) select id, ${q(sid)}, ${q(t.id || t.terminal_id)}, ${q(t.serial_number || t.serial || ("Terminal " + (i + 1)))} from menu_locations where name ilike '%${name.replace(/'/g, "")}%';`));
  sql.push("");
}
writeFileSync("teya-credentials.sql", sql.join("\n"));
console.log("\nWrote teya-credentials.sql — run it in Supabase, then uncomment/adjust the teya_terminals lines so each Teya store maps to the right café, then delete the file.");
