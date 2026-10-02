// flipdish-sale-events — FLIPDISH-KDS 2026-10-03a
//
// Flipdish org-wide sale webhooks (sale.created.v1, sale.status.updated.v1,
// sale.accepted.v1) → menu_orders / menu_order_items, so every Flipdish and
// aggregator order shows on the Chocoberry KDS and prints on the kitchen
// printer exactly like a tablet order. Display only: accepting stays in Flipdish.
//
// Not the June 'flipdish-webhook': raw bodies are stored only with DEBUG_CAPTURE=1,
// and then at most 50 of them.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   FLIPDISH_WEBHOOK_SECRET    signing secret (HMAC-SHA256 hex over the raw body) — once Flipdish confirm it
//   FLIPDISH_SIGNATURE_HEADER  header carrying the signature (default x-flipdish-signature)
//   FLIPDISH_SHARED_TOKEN      fallback: put ?token=<this> on the callback URL
//   DEBUG_CAPTURE              "1" while testing
//
// Deploy (from the chocoberry-menu repo root, file at supabase/functions/flipdish-sale-events/index.ts):
//   supabase functions deploy flipdish-sale-events --no-verify-jwt
// Callback: https://qtjsdbasoouslcpinqhu.supabase.co/functions/v1/flipdish-sale-events?token=<FLIPDISH_SHARED_TOKEN>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("FLIPDISH_WEBHOOK_SECRET") || "";
const SIG_HEADER = (Deno.env.get("FLIPDISH_SIGNATURE_HEADER") || "x-flipdish-signature").toLowerCase();
const SHARED_TOKEN = Deno.env.get("FLIPDISH_SHARED_TOKEN") || "";
const DEBUG = Deno.env.get("DEBUG_CAPTURE") === "1";
const DEBUG_CAP = 50;
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, "0")).join("");
}
function safeEq(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

// First matching path wins — extend as the real payload shows up.
function pick(obj: any, paths: string[]): any {
  for (const p of paths) {
    let cur = obj, ok = true;
    for (const seg of p.split(".")) { if (cur && typeof cur === "object" && seg in cur) cur = cur[seg]; else { ok = false; break; } }
    if (ok && cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}
const str = (v: any) => v === undefined || v === null ? null : String(v);
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function channelOf(sale: any): string {
  const raw = String(pick(sale, ["channel", "channel.name", "source", "orderSource", "app.name", "platform", "salesChannel"]) || "").toLowerCase();
  if (raw.includes("deliveroo")) return "Deliveroo";
  if (raw.includes("uber")) return "UberEats";
  if (raw.includes("just")) return "JustEat";
  if (raw.includes("kiosk")) return "Kiosk";
  if (raw.includes("pos") || raw.includes("epos")) return "POS";
  return "Flipdish";
}
function orderTypeOf(sale: any): string {
  const raw = String(pick(sale, ["orderType", "type", "fulfilment.type", "fulfillmentType", "deliveryType"]) || "").toLowerCase();
  if (raw.includes("deliver")) return "delivery";
  if (raw.includes("dine") || raw.includes("table")) return "dine_in";
  return "collection";
}
function linesOf(sale: any) {
  const lines = pick(sale, ["items", "orderItems", "lines", "lineItems", "basket.items", "cart.items"]);
  if (!Array.isArray(lines)) return [];
  return lines.map((l: any) => {
    const qty = num(pick(l, ["quantity", "qty", "count"])) ?? 1;
    const unit = num(pick(l, ["price", "unitPrice", "amount", "unit_price"])) ?? 0;
    const mods = pick(l, ["modifiers", "options", "orderItemOptions", "subItems"]);
    return {
      item_id: null,
      name_snapshot: str(pick(l, ["name", "productName", "title", "description"])) || "Item",
      price_snapshot: unit,
      qty,
      modifiers_snapshot: (Array.isArray(mods) ? mods : []).map((m: any) => str(pick(m, ["name", "title", "description"]))).filter(Boolean),
      line_total: num(pick(l, ["total", "lineTotal", "totalPrice"])) ?? unit * qty,
      note: str(pick(l, ["notes", "specialInstructions", "comment"])),
      added_batch: 0,
    };
  });
}
// Flipdish status → what happens to the KDS ticket
function applyStatus(status: string | null): Record<string, unknown> | null {
  const s = (status || "").toLowerCase();
  if (!s) return null;
  const now = new Date().toISOString();
  if (s.includes("cancel") || s.includes("reject") || s.includes("refund")) return { status: "cancelled", closed_at: now, external_status: status };
  if (s.includes("complet") || s.includes("collected") || s.includes("delivered") || s.includes("dispatched")) return { status: "served", kds_bumped_at: now, closed_at: now, external_status: status };
  if (s.includes("ready")) return { status: "ready", external_status: status };
  return { external_status: status };   // accepted / preparing etc — the kitchen drives the rest
}

async function logEvent(row: Record<string, unknown>) {
  if (DEBUG && row.raw_debug) {
    const { count } = await sb.from("flipdish_sale_events").select("event_id", { count: "exact", head: true }).not("raw_debug", "is", null);
    if ((count || 0) >= DEBUG_CAP) delete row.raw_debug;
  } else delete row.raw_debug;
  await sb.from("flipdish_sale_events").upsert(row, { onConflict: "event_id" });
}

Deno.serve(async (req) => {
  if (req.method === "GET") return json(200, { ok: true, fn: "flipdish-sale-events", build: "FLIPDISH-KDS 2026-10-03a" });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const raw = await req.text();

  let authed = false;
  const sig = req.headers.get(SIG_HEADER);
  if (SECRET && sig) authed = safeEq(await hmacHex(SECRET, raw), sig.replace(/^sha256=/i, "").trim().toLowerCase());
  // Flipdish's portal sends the "Verify token" as X-Verify-Token; the ?token= query param and
  // x-webhook-token are kept for manual tests.
  if (!authed && SHARED_TOKEN) authed = new URL(req.url).searchParams.get("token") === SHARED_TOKEN
    || req.headers.get("x-webhook-token") === SHARED_TOKEN
    || req.headers.get("x-verify-token") === SHARED_TOKEN;
  if (!authed) {
    try { await sb.from("flipdish_sale_events").insert({ event_id: `unauth:${Date.now()}`, event_type: "unauthenticated", outcome: "rejected",
      note: `headers: ${[...req.headers.keys()].filter(k => k.startsWith("x-")).join(",")} · query token: ${new URL(req.url).searchParams.has("token") ? "present" : "absent"}` }); } catch {}
    return json(401, { error: "unauthenticated" });
  }

  let body: any; try { body = JSON.parse(raw); } catch { return json(400, { error: "invalid json" }); }
  const events: any[] = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : [body];
  const results: any[] = [];

  for (const ev of events) {
    const eventType = str(pick(ev, ["type", "eventType", "event", "name"])) || "unknown";
    const sale = pick(ev, ["data.sale", "data", "sale", "payload.sale", "payload"]) || ev;
    const saleId = str(pick(sale, ["id", "saleId", "sale_id", "orderId"]));
    const eventId = str(pick(ev, ["id", "eventId", "event_id", "messageId"])) || `${eventType}:${saleId || crypto.randomUUID()}:${pick(ev, ["createdAt", "timestamp", "occurredAt"]) || Date.now()}`;
    const fdStoreId = str(pick(sale, ["storeId", "store.id", "store_id", "restaurantId", "physicalRestaurantId", "locationId"]));
    const status = str(pick(ev, ["data.status", "data.newStatus", "data.sale.status", "status", "sale.status", "data.state"]));

    const { data: seen } = await sb.from("flipdish_sale_events").select("event_id").eq("event_id", eventId).maybeSingle();
    if (seen) { results.push({ eventId, outcome: "duplicate" }); continue; }

    // Flipdish id -> dashboard store (flipdish_stores, many ids per store) -> KDS location (menu_locations.store_id)
    let locationId: string | null = null; let storeId: string | null = null;
    if (fdStoreId) {
      const { data: fs } = await sb.from("flipdish_stores").select("store_id").eq("id", fdStoreId).maybeSingle();
      storeId = fs?.store_id || null;
      if (storeId) { const { data: loc } = await sb.from("menu_locations").select("id").eq("store_id", storeId).eq("active", true).maybeSingle(); locationId = loc?.id || null; }
    }
    const base = { event_id: eventId, event_type: eventType, sale_id: saleId, flipdish_store_id: fdStoreId, location_id: locationId, status, raw_debug: ev };
    if (!saleId) { await logEvent({ ...base, outcome: "ignored", note: "no sale id" }); results.push({ eventId, outcome: "ignored" }); continue; }
    if (!locationId) { await logEvent({ ...base, outcome: "unmapped_store", note: storeId ? `no KDS location with store_id = '${storeId}'` : `flipdish store ${fdStoreId} not in flipdish_stores` }); results.push({ eventId, outcome: "unmapped_store", fdStoreId, storeId }); continue; }

    try {
      const { data: existing } = await sb.from("menu_orders").select("id, status").eq("external_ref", saleId).maybeSingle();
      const t = eventType.toLowerCase();

      if (t.includes("created") && !existing) {
        const lines = linesOf(sale);
        const total = num(pick(sale, ["total", "amount", "amountTotal", "totals.total", "grandTotal", "price.total"])) ?? lines.reduce((a, l) => a + (l.line_total || 0), 0);
        const displayRef = str(pick(sale, ["displayId", "displayNumber", "orderNumber", "reference", "shortCode", "number"])) || saleId.slice(-4);
        const orderNo = Number(String(displayRef).replace(/\D/g, "").slice(-4)) || null;
        const { data: order, error } = await sb.from("menu_orders").insert({
          location_id: locationId, table_id: null,
          order_type: orderTypeOf(sale),
          pickup_name: str(pick(sale, ["customer.name", "customer.firstName", "customerName", "customer.displayName"])),
          customer_note: [str(pick(sale, ["notes", "customerNotes", "instructions", "specialInstructions"])), str(pick(sale, ["deliveryInstructions", "delivery.instructions"]))].filter(Boolean).join(" · ") || null,
          tablet_no: null, order_channel: "flipdish",
          external_channel: channelOf(sale), external_ref: saleId, external_status: status || "created",
          requested_for: str(pick(sale, ["requestedFor", "requestedForTime", "dueAt", "fulfilment.requestedAt", "scheduledFor"])),
          subtotal: total, total,
          paid_method: "flipdish", paid_amount: total,     // prepaid online — no Pay prompt on the KDS
          status: "placed", order_no: orderNo,
        }).select("id").single();
        if (error) throw error;
        if (lines.length) { const { error: le } = await sb.from("menu_order_items").insert(lines.map(l => ({ ...l, order_id: order.id }))); if (le) throw le; }
        await logEvent({ ...base, outcome: "inserted", note: `menu_orders ${order.id}` });
        results.push({ eventId, outcome: "inserted", saleId, orderId: order.id });
      } else if (existing) {
        const patch = applyStatus(status);
        if (patch) { const { error } = await sb.from("menu_orders").update(patch).eq("id", existing.id); if (error) throw error; }
        await logEvent({ ...base, outcome: "updated", note: patch ? JSON.stringify(patch) : "no change" });
        results.push({ eventId, outcome: "updated", saleId, patch });
      } else {
        await logEvent({ ...base, outcome: "ignored", note: "status for a sale never created here" });
        results.push({ eventId, outcome: "ignored" });
      }
    } catch (e) {
      await logEvent({ ...base, outcome: "error", note: String((e as Error)?.message || e).slice(0, 300) });
      results.push({ eventId, outcome: "error", error: String((e as Error)?.message || e) });
    }
  }
  return json(200, { ok: true, results });
});
