// ============================================================
// STRINGIQ 2026-11-05 — client for the StringIQ Terminal API (v0).
// Shared by teya-pay (payments), admin-api (refunds, connect screen) and
// siq-webhook. Their API mirrors Teya POSLink v3; the differences that matter:
//   • one static bearer key per merchant account (siq_keys), no OAuth
//   • results come by signed webhook; GET by id is the re-check
//   • a booked SUCCESSFUL sale / SUCCESS refund must be acknowledged
//   • approved_amount (not requested_amount) is what was taken — it includes
//     any tip added on the terminal
//   • 409 with a `code` for busy/offline/not-ready terminals and order guards
//   • a 5xx / timeout means "outcome unknown", never "failed": retry with the
//     same Idempotency-Key and body
// Docs: https://terminals-test.stringiq.tech/docs/guide (+ /docs/teya-delta).
// ============================================================

// LIVE 2026-11-07: sandbox keys (siqt_test_…) and live keys work side by side —
// each call goes to the address its key belongs to, so a pilot store can be
// live while others still test. Override with STRINGIQ_TEST_URL / _LIVE_URL.
const TEST_URL = (Deno.env.get("STRINGIQ_TEST_URL") || "https://terminals-test.stringiq.tech").replace(/\/+$/, "");
const LIVE_URL = (Deno.env.get("STRINGIQ_LIVE_URL") || "https://terminals.stringiq.tech").replace(/\/+$/, "");
export const siqBase = (apiKey: string) => (/^siqt_test_/i.test(String(apiKey || "")) ? TEST_URL : LIVE_URL);
export const SIQ_BASE = TEST_URL + " (test keys) / " + LIVE_URL + " (live keys)";

export type SiqKey = { id: string | null; label: string; api_key: string; signing_secret?: string | null };
export type SiqResult = { http: number; body: any; headers: Headers; unknown: boolean; code: string | null };

/** The key for a StringIQ store: siq_stores → siq_keys, else the STRINGIQ_API_KEY secret. */
export async function siqKeyForStore(admin: any, storeId: string | null): Promise<SiqKey> {
  if (storeId) {
    const { data } = await admin.from("siq_stores").select("key_id, siq_keys(id, label, api_key, signing_secret)").eq("store_id", storeId).maybeSingle();
    const k = (data as any)?.siq_keys;
    if (k?.api_key) return k as SiqKey;
  }
  const env = Deno.env.get("STRINGIQ_API_KEY");
  if (env) return { id: null, label: "STRINGIQ_API_KEY", api_key: env };
  throw new Error("No StringIQ key for this store. Connect it in Admin › Card machine.");
}

/**
 * One call to StringIQ. Never throws on an HTTP answer — callers branch on
 * http / code, as StringIQ asks. `unknown` = 5xx, timeout or dropped
 * connection: the request may or may not have happened. Retries such answers
 * itself (same key and body), up to `tries` times.
 */
export async function siq(key: SiqKey | string, method: string, path: string, body?: unknown, idem?: string, tries = 3): Promise<SiqResult> {
  const apiKey = typeof key === "string" ? key : key.api_key;
  const h: Record<string, string> = { Authorization: "Bearer " + apiKey, Accept: "application/json" };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (idem) h["Idempotency-Key"] = idem;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  let last: SiqResult = { http: 0, body: null, headers: new Headers(), unknown: true, code: "NO_ANSWER" };
  for (let i = 0; i < Math.max(1, tries); i++) {
    if (i) await new Promise((r) => setTimeout(r, 400 * i));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const r = await fetch(siqBase(apiKey) + path, { method, headers: h, body: payload, signal: ctrl.signal });
      const text = await r.text();
      let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
      const code = data && typeof data === "object" ? (data.code || data.error?.code || null) : null;
      last = { http: r.status, body: data, headers: r.headers, unknown: r.status >= 500, code };
      if (r.status === 429) {
        const wait = Math.min(5, Number(r.headers.get("Retry-After") || 1)) * 1000;
        await new Promise((res) => setTimeout(res, wait));
        continue;
      }
      if (r.status < 500) return last;
    } catch (e) {
      last = { http: 0, body: { message: String((e as Error).message || e) }, headers: new Headers(), unknown: true, code: "NO_ANSWER" };
    } finally { clearTimeout(t); }
  }
  return last;
}

/** Plain-English message for a StringIQ error code, for staff on the till. */
export function siqMessage(code: string | null, fallback?: string): string {
  switch (String(code || "").toUpperCase()) {
    case "TERMINAL_OFFLINE": return "The card machine is offline. Check it is switched on and connected, then try again.";
    case "TERMINAL_BUSY": return "The card machine is busy with another payment. Wait for it to finish, then try again.";
    case "TERMINAL_NOT_READY": return "The card machine isn't ready yet. Check its screen, then try again.";
    case "ORDER_ALREADY_PAID": return "This order has already been paid on the card machine.";
    case "ORDER_REFERENCE_CONFLICT": return "The card machine has a different payment on record for this order. Check the order before taking payment.";
    case "PRIOR_ATTEMPT_UNRESOLVED": return "An earlier card payment for this order is still in progress on the machine.";
    case "AMOUNT_OUT_OF_RANGE": return "That amount can't be taken on the card machine.";
    case "UNSUPPORTED_CURRENCY": return "The card machine can't take this currency.";
    case "REFUND_EXCEEDS_REMAINING": return "That's more than is left to refund on this card payment.";
    case "TOO_MANY_REQUESTS": return "The card system is busy. Try again in a moment.";
    case "UNAUTHORIZED": case "UNAUTHORISED": case "FORBIDDEN": return "The card system refused our key. Ask head office to check the StringIQ connection.";
    case "NO_ANSWER": return "The card system didn't answer. Check the card machine before trying again.";
    default: return fallback || "The card system refused the request" + (code ? " (" + code + ")" : "") + ".";
  }
}

/** The card details we print on our own slip (the terminal prints nothing). */
export function siqCard(snap: any): Record<string, unknown> | null {
  const d = snap?.metadata?.payment_method_details;
  if (!d) return null;
  return {
    brand: d.card?.brand ?? null, type: d.card?.type ?? null, last4: d.card?.last4 ?? null,
    entry_mode: d.entry_mode ?? null, verification: d.verification_method ?? null,
    app_name: d.application_name ?? null, aid: d.application_id ?? null,
    mid: d.mid ?? null, tid: d.tid ?? null, rrn: d.rrn ?? null,
    auth_code: d.authorisation_code ?? d.authorization_code ?? null, response_code: d.response_code ?? null,
    at: snap?.transaction_timestamp ?? null, terminal_reference: snap?.metadata?.terminal_reference ?? null,
  };
}

/** Acknowledge a booked payment (or a flagged one). Re-reads the version once if it moved. */
export async function siqAcknowledge(key: SiqKey, paymentRequestId: string, version: number | null, outcome = "BOOKED"): Promise<boolean> {
  let v = version;
  for (let i = 0; i < 2; i++) {
    if (v == null) {
      const g = await siq(key, "GET", "/v1/payment-requests/" + encodeURIComponent(paymentRequestId));
      v = g.body?.version ?? null;
    }
    const r = await siq(key, "POST", "/v1/payment-requests/" + encodeURIComponent(paymentRequestId) + "/acknowledge", { version: v, outcome });
    if (r.http >= 200 && r.http < 300) return true;
    if (r.http === 409 || r.http === 412) { v = null; continue; }   // version moved on: read it again
    return false;
  }
  return false;
}

/** Acknowledge a booked refund through the batch endpoint. */
export async function siqAcknowledgeRefund(key: SiqKey, refundId: string, version: number | null, outcome = "BOOKED"): Promise<boolean> {
  let v = version;
  if (v == null) { const g = await siq(key, "GET", "/v1/refunds/" + encodeURIComponent(refundId)); v = g.body?.version ?? null; }
  const r = await siq(key, "POST", "/v1/acknowledgements", { items: [{ refund_id: refundId, version: v, outcome }] });
  const item = Array.isArray(r.body?.items) ? r.body.items[0] : (Array.isArray(r.body?.results) ? r.body.results[0] : null);
  return r.http >= 200 && r.http < 300 && (item ? item.ok !== false : true);
}

/** Verify a webhook: HMAC-SHA256 over "<x-timestamp>.<raw body>" keyed with the full whsec_ secret. */
export async function siqVerify(secret: string, timestamp: string, rawBody: string, signatureHeader: string): Promise<boolean> {
  if (!secret || !timestamp || !signatureHeader) return false;
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(timestamp + "." + rawBody)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = btoa(String.fromCharCode(...mac));
  // Accept "hex", "sha256=hex", "v1=hex" and comma-separated lists of them.
  const sent = signatureHeader.split(/[,\s]+/).map((s) => s.replace(/^(sha256|v1|t)=/i, "").trim()).filter(Boolean);
  const same = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  };
  return sent.some((s) => same(s.toLowerCase(), hex) || same(s, b64));
}
