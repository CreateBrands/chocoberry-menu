// Teya Online Payments — Hosted Checkout and Pay by Link.
//
// This is the card-not-present path: no terminal, no POSLink store. The
// customer pays on Teya's own page (kiosk, tablet, customer app) or on a link
// we text them (phone orders). Teya tells us the result by webhook, and we
// book the tender into order_payments exactly like the till does.
//
// Secrets:
//   TEYA_ENV                   staging | production   (default production)
//   TEYA_CHECKOUT_CLIENT_ID    OAuth client with the checkout scopes
//   TEYA_CHECKOUT_CLIENT_SECRET
//   TEYA_CHECKOUT_STORE_ID     optional default store (per-store override lives in teya_checkout_stores)
//   TEYA_CHECKOUT_WEBHOOK_SECRET  shared secret Teya sends back on the webhook
//   TEYA_PUBLIC_URL            where the customer lands after paying (defaults to the menu app)
//
// Actions (POST { action, data }):
//   session   — create a Hosted Checkout session for an order → { url, session_id }
//   status    — read a session and, if paid, book the payment
//   link      — create a Pay by Link for an order → { url, payment_link_id }
//   refund    — refund an online transaction
//   health    — token + config check
// Webhook: POST ?webhook=1 with Teya's payload (payment.succeeded.v1 etc.)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-teya-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ENV = (Deno.env.get("TEYA_ENV") || "production").toLowerCase();
const API = ENV === "staging" ? "https://api.teya.xyz" : "https://api.teya.com";
const TOKEN_URL = ENV === "staging" ? "https://id.teya.xyz/oauth/v2/oauth-token" : "https://id.teya.com/oauth/v2/oauth-token";
// Scopes as Teya actually issues them to a registered ePOS (hyphens, not
// underscores — the spec's prose uses a different style to the token server).
// Hosted Checkout (checkout/sessions/*) is NOT granted on our ePOS credentials,
// so Pay by Link is the working card-not-present path; asking for a scope we
// were not granted makes the whole token request fail, hence it is left out.
const SCOPES = Deno.env.get("TEYA_CHECKOUT_SCOPES") ||
  "payment-links/create payment-links/id/get payment-links/id/update refunds";
const UA = "Chocoberry-Menu/1.0";
const PUBLIC_URL = (Deno.env.get("TEYA_PUBLIC_URL") || "https://chocoberry-menu.vercel.app").replace(/\/+$/, "");

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// ---- OAuth (client credentials), cached per isolate ----
let tok: { value: string; exp: number } | null = null;
async function token(): Promise<string> {
  if (tok && Date.now() < tok.exp - 30_000) return tok.value;
  const id = Deno.env.get("TEYA_CHECKOUT_CLIENT_ID"), secret = Deno.env.get("TEYA_CHECKOUT_CLIENT_SECRET");
  if (!id || !secret) throw new Error("TEYA_CHECKOUT_CLIENT_ID / _SECRET not set");
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret, scope: SCOPES }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.access_token) throw new Error("teya token: " + (b.error_description || b.error || r.status));
  tok = { value: b.access_token, exp: Date.now() + Math.max(60, Number(b.expires_in || 900)) * 1000 };
  return tok.value;
}
async function teya(method: string, path: string, body?: unknown, idem?: string) {
  const h: Record<string, string> = { Authorization: "Bearer " + await token(), Accept: "application/json", "User-Agent": UA };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (idem) h["Idempotency-Key"] = idem;
  const r = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error("teya " + method + " " + path + " -> " + r.status + " " + String(data?.description || data?.message || data?.error || text).slice(0, 200));
  return data;
}

// ---- store mapping: which Teya store a location pays into ----
async function storeIdFor(location_id: string | null): Promise<string | undefined> {
  if (location_id) {
    const { data } = await admin.from("teya_checkout_stores").select("store_id").eq("location_id", location_id).maybeSingle();
    if (data?.store_id) return String(data.store_id);
  }
  return Deno.env.get("TEYA_CHECKOUT_STORE_ID") || undefined;
}

// ---- booking the tender, shared by status and webhook ----
async function bookPayment(order_id: string, amountMinor: number, ref: string, method = "card") {
  const amount = Math.round(Number(amountMinor)) / 100;
  // Idempotent: one row per Teya reference.
  const { data: seen } = await admin.from("order_payments").select("id").eq("order_id", order_id).ilike("note", "%" + ref + "%").maybeSingle();
  if (seen) return { ok: true, already: true };
  const { error } = await admin.from("order_payments").insert({ order_id, method, amount, kind: "payment", note: ("Teya online · " + ref).slice(0, 120) });
  if (error) throw error;
  const { data: pays } = await admin.from("order_payments").select("amount, kind").eq("order_id", order_id);
  const paid = Math.round((pays || []).filter((p: any) => p.kind !== "refund").reduce((s: number, p: any) => s + Number(p.amount || 0), 0) * 100) / 100;
  const { data: ord } = await admin.from("menu_orders").select("total, discount_amount, status").eq("id", order_id).maybeSingle();
  const due = Math.round(((Number(ord?.total || 0)) - Number((ord as any)?.discount_amount || 0)) * 100) / 100;
  const patch: Record<string, unknown> = { amount_paid: paid };
  if (paid + 0.001 >= due) { patch.paid_method = method; patch.paid_amount = paid; patch.paid_at = new Date().toISOString(); if (ord?.status === "hold") patch.status = "placed"; }
  await admin.from("menu_orders").update(patch).eq("id", order_id);
  // Releasing a held (kiosk) order sends it to the kitchen, same as the till does.
  if (patch.status === "placed") {
    try {
      const { data: full } = await admin.from("menu_orders").select("*").eq("id", order_id).maybeSingle();
      if (full) await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/sunmi-print", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-print-secret": Deno.env.get("PRINT_WEBHOOK_SECRET") ?? "" },
        body: JSON.stringify({ type: "INSERT", record: full }),
      });
    } catch (e) { console.error("release print failed", e); }
  }
  return { ok: true, paid, due, settled: paid + 0.001 >= due };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = new URL(req.url);

  // ---------- Teya webhook ----------
  if (url.searchParams.get("webhook")) {
    const secret = Deno.env.get("TEYA_CHECKOUT_WEBHOOK_SECRET");
    if (secret) {
      const got = req.headers.get("x-teya-signature") || url.searchParams.get("secret") || "";
      if (got !== secret) return json({ error: "bad signature" }, 401);
    }
    const body = await req.json().catch(() => ({}));
    try {
      const type = String(body.type || body.event || "");
      const d = body.data || body.payload || body;
      const ref = String(d.transaction_id || d.id || d.session_id || d.payment_link_id || "");
      const minor = Number(d.amount?.value ?? d.amount ?? 0);
      // metadata.order_id is our uuid; merchant_reference is the order NUMBER,
      // so resolve that to an id rather than passing it straight to the insert.
      const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
      let orderId = String(d.metadata?.order_id || "");
      if (!isUuid(orderId)) {
        const no = Number(d.merchant_reference ?? d.metadata?.order_no ?? NaN);
        orderId = "";
        if (Number.isFinite(no)) {
          const { data: byNo } = await admin.from("menu_orders").select("id")
            .eq("order_no", no).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (byNo?.id) orderId = String(byNo.id);
        }
      }
      await admin.from("teya_checkout_events").insert({ event_type: type || "unknown", reference: ref || null, order_id: orderId || null, payload: body }).then(() => {}, () => {});
      if (/succeed|captur|paid/i.test(type) && orderId && minor > 0) {
        const r = await bookPayment(orderId, minor, ref || "webhook");
        return json({ ...r, ok: true });
      }
      return json({ ok: true, ignored: type });
    } catch (e) { console.error("webhook", e); return json({ ok: false, error: String((e as Error).message || e) }, 200); }
  }

  let payload: any = null;
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { action, data } = payload || {};

  try {
    switch (action) {
      // ---------- Hosted Checkout session for an order ----------
      case "session": {
        const { order_id, location_id, success_url, cancel_url, customer } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const { data: o } = await admin.from("menu_orders").select("id, order_no, total, discount_amount, location_id, paid_method").eq("id", order_id).maybeSingle();
        if (!o) return json({ error: "order not found" }, 404);
        if (o.paid_method) return json({ error: "already_paid", message: "This order is already paid." }, 409);
        const due = Math.round(((Number(o.total || 0)) - Number((o as any).discount_amount || 0)) * 100);
        if (due <= 0) return json({ error: "nothing_to_pay" }, 409);
        const { data: items } = await admin.from("menu_order_items").select("name_snapshot, qty, price_snapshot").eq("order_id", order_id);
        const store_id = await storeIdFor(location_id || o.location_id);
        const body: Record<string, unknown> = {
          type: "SALE",
          amount: { currency: "GBP", value: due },
          merchant_reference: String(o.order_no),
          metadata: { order_id: String(o.id), order_no: String(o.order_no) },
          line_items: (items || []).slice(0, 50).map((it: any) => ({ description: String(it.name_snapshot || "Item").slice(0, 60), quantity: Number(it.qty || 1), unit_price: Math.round(Number(it.price_snapshot || 0) * 100) })),
          success_url: success_url || (PUBLIC_URL + "/?paid=" + o.order_no),
          cancel_url: cancel_url || (PUBLIC_URL + "/"),
          failure_url: PUBLIC_URL + "/?payfail=" + o.order_no,
          post_success_payment: "REDIRECT",
          language: "en-GB",
          ...(store_id ? { store_id } : {}),
          ...(customer ? { customer } : {}),
        };
        const res = await teya("POST", "/v2/checkout/sessions", body, "sess-" + o.id);
        await admin.from("teya_checkout_sessions").insert({ order_id: o.id, session_id: res.session_id, amount_minor: due, status: "ACTIVE", location_id: o.location_id }).then(() => {}, () => {});
        return json({ ok: true, session_id: res.session_id, url: res.session_url, amount: due / 100 });
      }

      // ---------- poll a session (fallback when the webhook is slow) ----------
      case "status": {
        const { session_id } = data || {};
        if (!session_id) return json({ error: "session_id required" }, 400);
        const res = await teya("GET", "/v2/checkout/sessions/" + session_id);
        const paid = String(res.payment_status || "").toUpperCase() === "SUCCESS";
        const orderId = String(res.metadata?.order_id || "");
        await admin.from("teya_checkout_sessions").update({ status: res.session_status || null, payment_status: res.payment_status || null }).eq("session_id", session_id).then(() => {}, () => {});
        if (paid && orderId) {
          const minor = Number(res.amount?.value || 0);
          const booked = await bookPayment(orderId, minor, String(res.transaction_id || session_id));
          return json({ ...booked, ok: true, paid: true });
        }
        return json({ ok: true, paid: false, payment_status: res.payment_status, session_status: res.session_status });
      }

      // ---------- Pay by Link — phone orders, and the QR the kiosk shows ----------
      // The returned URL is what we render as a QR code: the customer scans it
      // and pays on Teya's page by card or Apple Pay. No Hosted Checkout needed.
      case "link": {
        const { order_id, location_id, expires_in_hours, customer } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const { data: o } = await admin.from("menu_orders").select("id, order_no, total, discount_amount, location_id, paid_method, table_id").eq("id", order_id).maybeSingle();
        if (!o) return json({ error: "order not found" }, 404);
        if (o.paid_method) return json({ error: "already_paid" }, 409);
        const due = Math.round(((Number(o.total || 0)) - Number((o as any).discount_amount || 0)) * 100);
        if (due <= 0) return json({ error: "nothing_to_pay" }, 409);
        const { data: items } = await admin.from("menu_order_items").select("name_snapshot, qty, price_snapshot").eq("order_id", order_id);
        const store_id = await storeIdFor(location_id || o.location_id);
        const hours = Number(expires_in_hours) > 0 ? Number(expires_in_hours) : 6;
        // Table label is on menu_tables, not the order — read it separately
        // rather than through a PostgREST join.
        let tableLabel: string | null = null;
        if (o.table_id) {
          const { data: t } = await admin.from("menu_tables").select("label").eq("id", o.table_id).maybeSingle();
          tableLabel = t?.label ? String(t.label) : null;
        }
        const res = await teya("POST", "/v2/payment-links", {
          type: "SINGLE_USE",
          transaction_type: "SALE",
          amount: { currency: "GBP", value: due },
          merchant_reference: String(o.order_no).slice(0, 60),
          metadata: {
            order_id: String(o.id),
            order_no: String(o.order_no),
            ...(tableLabel ? { table_number: tableLabel } : {}),
          },
          line_items: (items || []).slice(0, 50).map((it: any) => ({
            description: String(it.name_snapshot || "Item").slice(0, 60),
            quantity: Number(it.qty || 1),
            unit_price: Math.round(Number(it.price_snapshot || 0) * 100),
          })),
          // The customer is on their own phone — keep them on Teya's success
          // page rather than bouncing them into our menu app.
          post_success_payment: "SHOW_SUCCESS_PAGE",
          expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
          language: "en-GB",
          ...(store_id ? { store_id } : {}),
          ...(customer ? { customer } : {}),
        }, "link-" + o.id);
        // Teya returns the URL as `payment_link`; keep the older names as a fallback.
        const url = res.payment_link || res.url || res.payment_link_url || null;
        const linkId = res.payment_link_id || res.id || null;
        await admin.from("teya_checkout_sessions").insert({
          order_id: o.id, session_id: linkId, amount_minor: due, status: "VALID", location_id: o.location_id,
        }).then(() => {}, () => {});
        return json({ ok: true, payment_link_id: linkId, url, amount: due / 100 });
      }

      // ---------- poll a payment link (the kiosk waits on this while the QR is up) ----------
      case "link_status": {
        const { payment_link_id } = data || {};
        if (!payment_link_id) return json({ error: "payment_link_id required" }, 400);
        const res = await teya("GET", "/v1/payment-links/" + encodeURIComponent(payment_link_id));
        const status = String(res.status || "").toUpperCase();
        await admin.from("teya_checkout_sessions").update({ status: status || null })
          .eq("session_id", payment_link_id).then(() => {}, () => {});
        if (status !== "COMPLETED") return json({ ok: true, paid: false, status });
        const orderId = String(res.metadata?.order_id || "");
        const minor = Number(res.amount?.value || 0);
        if (!orderId || minor <= 0) return json({ ok: true, paid: true, status, booked: false });
        const booked = await bookPayment(orderId, minor, String(payment_link_id));
        return json({ ...booked, ok: true, paid: true, status });
      }

      // ---------- refund an online payment ----------
      case "refund": {
        const { transaction_id, amount, order_id, reason } = data || {};
        if (!transaction_id || !(Number(amount) > 0)) return json({ error: "transaction_id and amount required" }, 400);
        const minor = Math.round(Number(amount) * 100);
        const res = await teya("POST", "/v3/refunds", { transaction_id, amount: { currency: "GBP", value: minor }, ...(reason ? { reason: String(reason).slice(0, 100) } : {}) }, "rfd-" + transaction_id + "-" + minor);
        if (order_id) {
          await admin.from("order_payments").insert({ order_id, method: "card", amount: -(minor / 100), kind: "refund", note: ("Teya online refund · " + (res.refund_id || transaction_id)).slice(0, 120) }).then(() => {}, () => {});
        }
        return json({ ok: true, refund: res });
      }

      case "health": {
        const t = await token();
        return json({ ok: true, env: ENV, api: API, token: t.slice(0, 12) + "…", store_id: await storeIdFor(data?.location_id || null), scopes: SCOPES });
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    console.error(action, e);
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
