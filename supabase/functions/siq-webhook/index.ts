// ============================================================
// siq-webhook — receives StringIQ Terminal API webhooks. STRINGIQ 2026-11-05.
// Deploy with --no-verify-jwt: the HMAC signature is the authentication.
//
// Rules from StringIQ's guide, all followed here:
//   • verify x-signature = HMAC-SHA256("<x-timestamp>.<raw body>", whsec_…)
//     against the RAW body, before parsing; constant-time compare
//   • reject timestamps more than 300 s from our clock
//   • de-duplicate on event_id; store the event BEFORE answering 2xx
//   • answer within 5 s; 2xx means "delivered", not "booked"
//   • the payload is a snapshot with a version — the GET by id we do in
//     teya-pay "status" stays the source of truth, so old/out-of-order
//     events can't undo anything
// Events: payment_request.updated / .resolution_required → book through
// teya-pay "status" (same code the till and the sweep use, so a payment is
// booked once whichever arrives first); refund.updated → refresh our refund
// row (admin-api books it); end_of_day.updated → siq_end_of_days;
// terminal.status_changed → stored only.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { siqVerify } from "../_shared/stringiq.ts";

const ok = (body: unknown = { ok: true }, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ error: "POST only" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const raw = await req.text();
  const ts = req.headers.get("x-timestamp") || "";
  const sig = req.headers.get("x-signature") || "";
  const eventIdHdr = req.headers.get("x-event-id") || "";

  // 1) Timestamp window
  const skew = Math.abs(Date.now() / 1000 - Number(ts));
  if (!ts || !Number.isFinite(skew) || skew > 300) return ok({ error: "stale_or_missing_timestamp" }, 401);

  // 2) Signature: try every stored key's secret (one webhook endpoint per key).
  const { data: keys } = await admin.from("siq_keys").select("id, signing_secret").not("signing_secret", "is", null);
  let keyId: string | null = null;
  for (const k of (keys || []) as any[]) {
    if (await siqVerify(String(k.signing_secret), ts, raw, sig)) { keyId = k.id; break; }
  }
  if (!keyId) return ok({ error: "bad_signature" }, 401);

  // 3) Parse and store (de-duplicated) before answering
  let ev: any;
  try { ev = JSON.parse(raw); } catch { return ok({ error: "bad_json" }, 400); }
  const eventId = String(ev.event_id || eventIdHdr || "");
  const type = String(ev.event_type || req.headers.get("x-event-type") || "");
  const d = ev.data || {};
  const objectId = String(d.payment_request_id || d.refund_id || d.end_of_day_id || d.terminal_id || "") || null;
  if (!eventId) return ok({ error: "no_event_id" }, 400);
  const { error: insErr } = await admin.from("siq_webhook_events").insert({ event_id: eventId, event_type: type, key_id: keyId, object_id: objectId, payload: ev });
  if (insErr) {
    if (/duplicate|unique/i.test(insErr.message || "")) return ok({ ok: true, duplicate: true });
    console.error("siq-webhook: could not store event", eventId, insErr.message);
    return ok({ error: "store_failed" }, 500);   // StringIQ retries
  }

  // 4) Act on it. Anything that fails here is picked up by the till's
  // background check (teya-pay sweep) — the event is already stored.
  let error: string | null = null;
  try {
    if (type.startsWith("payment_request.") && d.payment_request_id) {
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3500);
      try {
        const r = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/teya-pay", {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json", apikey: key, Authorization: "Bearer " + key },
          body: JSON.stringify({ action: "status", data: { payment_request_id: d.payment_request_id } }),
        });
        if (!r.ok && r.status !== 409) error = "status " + r.status;
      } finally { clearTimeout(t); }
    } else if (type === "refund.updated" && d.refund_id) {
      const st = String(d.status || "").toUpperCase();
      const mapped = st === "SUCCESS" ? "SUCCESS" : (st === "FAILURE" || st === "FAILED") ? "FAILURE" : "PENDING";
      await admin.from("teya_refunds").update({ status: mapped, status_reason: d.status_reason || null, response: d, updated_at: new Date().toISOString() })
        .eq("teya_transaction_id", String(d.refund_id)).in("status", ["PENDING", "SENDING"]);
    } else if (type === "end_of_day.updated" && d.end_of_day_id) {
      await admin.from("siq_end_of_days").upsert({
        end_of_day_id: String(d.end_of_day_id), terminal_id: d.terminal_id || null, status: d.status || null,
        period_start: d.period_start || null, period_end: d.period_end || null, totals: d.totals || null, raw: d, updated_at: new Date().toISOString(),
      }, { onConflict: "end_of_day_id" });
    }
  } catch (e) { error = String((e as Error).message || e).slice(0, 300); }
  await admin.from("siq_webhook_events").update({ processed_at: new Date().toISOString(), error }).eq("event_id", eventId);
  return ok({ ok: true });
});
