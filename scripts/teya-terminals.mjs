#!/usr/bin/env node
// Machine-token check + terminal listing for one Teya store, using the
// per-store ePOS credentials that scripts/teya-register.mjs created
// (they live in teya_credentials).
//
// Usage (cmd.exe) — get the three lines from Supabase:
//   select 'set TEYA_EPOS_ID=' || client_id || char(10) ||
//          'set TEYA_EPOS_SECRET=' || client_secret || char(10) ||
//          'set TEYA_STORE_ID=' || store_id
//     from teya_credentials where store_name ilike '%poslink%';
// then:
//   node scripts\teya-terminals.mjs --env staging
const a = process.argv;
const ENV = (a.includes("--env") ? a[a.indexOf("--env") + 1] : "staging").toLowerCase();
const ID = ENV === "staging" ? "https://id.teya.xyz" : "https://id.teya.com";
const API = ENV === "staging" ? "https://api.teya.xyz" : "https://api.teya.com";
const { TEYA_EPOS_ID: id, TEYA_EPOS_SECRET: secret, TEYA_STORE_ID: store } = process.env;

const bad = (v) => !v || /^<|>$/.test(v);
if (bad(id) || bad(secret) || bad(store)) {
  console.error("Set these first, with the REAL values (no < > brackets):");
  console.error("  set TEYA_EPOS_ID=...\n  set TEYA_EPOS_SECRET=...\n  set TEYA_STORE_ID=...");
  console.error("\nGot: TEYA_EPOS_ID=" + (id || "(unset)") + "  TEYA_EPOS_SECRET=" + (secret ? "(" + secret.length + " chars)" : "(unset)") + "  TEYA_STORE_ID=" + (store || "(unset)"));
  process.exit(1);
}

console.log("env:", ENV, "\nstore:", store, "\n");

const t = await fetch(ID + "/oauth/v2/oauth-token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"),
  },
  body: "grant_type=client_credentials",
});
const tj = await t.json().catch(() => ({}));
if (!tj.access_token) {
  console.error("token request failed: " + t.status + " " + JSON.stringify(tj));
  console.error("\n401/invalid_client → wrong secret. invalid_scope → a scope on the credential is not grantable.");
  process.exit(1);
}
console.log("machine token OK");
console.log("scopes granted:", tj.scope || "(not reported)");

for (const p of ["/poslink/v1/stores", "/poslink/v1/stores/" + store + "/terminals"]) {
  const r = await fetch(API + p, {
    headers: { Authorization: "Bearer " + tj.access_token, Accept: "application/json", "User-Agent": "Chocoberry-Integration/1.0" },
  });
  const body = await r.text();
  console.log("\nGET " + p + " -> " + r.status);
  try { console.log(JSON.stringify(JSON.parse(body), null, 2).slice(0, 2000)); }
  catch { console.log(body.slice(0, 1000)); }
}
