// ============================================================
// teya-pay — Teya POSLink bridge for the tablet POS.
//
// The POS taps "Card" → start: we push the balance to the store's Teya card
// machine as a POSLink payment request. The POS then polls status until the
// cardholder has paid (SUCCESSFUL), declined (FAILED) or staff cancelled.
// On SUCCESSFUL we record the tender in order_payments ourselves — same
// bookkeeping as admin-api take_payment — so the order is marked paid even
// if the POS tab died mid-payment. Teya refs are kept in teya_payment_requests.
//
// Secrets: TEYA_CLIENT_ID, TEYA_CLIENT_SECRET (OAuth client-credentials from
// partner.teya.com → "Create application"), TEYA_ENV = production|staging,
// TEYA_SCOPES (optional; default below — set to "default_access" if the token
// call returns invalid_scope).
// Tables: teya_terminals (location → store/terminal UUIDs), teya_payment_requests.
// Teya API: POST /poslink/v3/payment-requests, GET (SSE) /poslink/v3/payment-requests/{id},
//           PATCH /poslink/v2/payment-requests/{id} {status:CANCELLED},
//           GET /poslink/v1/stores, GET /poslink/v1/stores/{id}/terminals.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ENV = (Deno.env.get("TEYA_ENV") || "production").toLowerCase();
const API = ENV === "staging" ? "https://api.teya.xyz" : "https://api.teya.com";
const TOKEN_URL = ENV === "staging" ? "https://id.teya.xyz/oauth/v2/oauth-token" : "https://id.teya.com/oauth/v2/oauth-token";
const SCOPES = Deno.env.get("TEYA_SCOPES") || "payment_requests payment_requests/id stores/id/terminals";

// ---- OAuth client-credentials token, cached per isolate (prod tokens last 15 min) ----
let tok: { value: string; exp: number } | null = null;
async function token(): Promise<string> {
  if (tok && Date.now() < tok.exp - 30_000) return tok.value;
  const id = Deno.env.get("TEYA_CLIENT_ID"), secret = Deno.env.get("TEYA_CLIENT_SECRET");
  if (!id || !secret) throw new Error("TEYA_CLIENT_ID / TEYA_CLIENT_SECRET not set");
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret, scope: SCOPES }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.access_token) throw new Error("teya token: " + (body.error_description || body.error || r.status));
  tok = { value: body.access_token, exp: Date.now() + Math.max(60, Number(body.expires_in || 900)) * 1000 };
  return tok.value;
}
async function teya(method: string, path: string, body?: unknown, idem?: string) {
  const h: Record<string, string> = { Authorization: "Bearer " + await token(), Accept: "application/json" };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (idem) h["Idempotency-Key"] = idem;
  const r = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error("teya " + method + " " + path + " → " + r.status + " " + (data?.message || data?.error || text).toString().slice(0, 200));
  return data;
}

// Read the SSE status stream until the first "full" snapshot (the stream always
// opens with one), then close it. Falls back to the last event seen on timeout.
async function snapshot(paymentRequestId: string, timeoutMs = 8000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(API + "/poslink/v3/payment-requests/" + encodeURIComponent(paymentRequestId), {
      headers: { Authorization: "Bearer " + await token(), Accept: "text/event-stream" }, signal: ctrl.signal,
    });
    if (!r.ok || !r.body) throw new Error("teya stream → " + r.status + " " + (await r.text().catch(() => "")).slice(0, 200));
    const reader = r.body.getReader(); const dec = new TextDecoder();
    let buf = "", last: any = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        let ev = "message", data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) ev = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;
        let obj: any = null; try { obj = JSON.parse(data); } catch { continue; }
        last = { ...(last || {}), ...obj };
        if (ev === "full") { ctrl.abort(); return obj; }
      }
    }
    return last;
  } catch (e) {
    if ((e as any)?.name === "AbortError") return null;
    throw e;
  } finally { clearTimeout(t); }
}

const money = (n: unknown) => Math.round(Number(n || 0) * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let payload: any; try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { action, data, pin } = payload || {};
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    switch (action) {
      // ---- POS: push the balance to the card machine ----
      case "start": {
        const { order_id, amount, tablet_no = null, note = null } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const { data: ord } = await admin.from("menu_orders").select("id, order_no, total, amount_paid, status, location_id").eq("id", order_id).single();
        if (!ord) return json({ error: "order not found" }, 404);
        if (ord.status === "cancelled") return json({ error: "cancelled", message: "This order was cancelled." }, 409);
        const remaining = money(money(ord.total) - money(ord.amount_paid));
        if (remaining <= 0) return json({ error: "already_paid", message: "This order is already fully paid." }, 409);
        const amt = Math.min(money(amount) > 0 ? money(amount) : remaining, remaining);
        // Terminal for this till: exact tablet match first, then the store default (tablet_no null).
        const { data: terms } = await admin.from("teya_terminals").select("id, store_id, terminal_id, tablet_no, label")
          .eq("location_id", ord.location_id).eq("active", true);
        const term = (terms || []).find((x: any) => tablet_no != null && String(x.tablet_no) === String(tablet_no))
          || (terms || []).find((x: any) => x.tablet_no == null) || (terms || [])[0];
        if (!term) return json({ error: "no_terminal", message: "No Teya card machine is set up for this store." }, 404);
        // Reuse an in-flight request for this order instead of double-charging.
        const { data: open } = await admin.from("teya_payment_requests").select("payment_request_id, status, amount")
          .eq("order_id", order_id).in("status", ["NEW", "IN_PROGRESS"]).order("created_at", { ascending: false }).limit(1);
        if (open && open.length) return json({ ok: true, payment_request_id: open[0].payment_request_id, status: open[0].status, amount: open[0].amount, reused: true });
        const idem = crypto.randomUUID();
        const res = await teya("POST", "/poslink/v3/payment-requests", {
          store_id: term.store_id, terminal_id: term.terminal_id,
          requested_amount: { amount: Math.round(amt * 100), currency: "GBP" },
          transaction_type: "SALE",
          merchant_reference: ("CB-" + ord.order_no + "-" + idem.slice(0, 8)).slice(0, 60),
          epos_instance_id: tablet_no != null ? "tablet-" + tablet_no : undefined,
          basket_transaction_id: String(ord.id),
          payment_method: "CARD",
        }, idem);
        const prId = res?.payment_request_id || res?.id;
        if (!prId) throw new Error("teya: no payment_request_id in response");
        await admin.from("teya_payment_requests").insert({
          payment_request_id: prId, order_id, terminal_id: term.terminal_id, amount: amt,
          status: res.status || "NEW", tablet_no, note, raw: res,
        });
        return json({ ok: true, payment_request_id: prId, status: res.status || "NEW", amount: amt, terminal: term.label || null });
      }

      // ---- POS: poll; records the tender the first time we see SUCCESSFUL ----
      case "status": {
        const { payment_request_id } = data || {};
        if (!payment_request_id) return json({ error: "payment_request_id required" }, 400);
        const { data: row } = await admin.from("teya_payment_requests").select("*").eq("payment_request_id", payment_request_id).single();
        if (!row) return json({ error: "unknown payment request" }, 404);
        if (row.recorded_at) return json({ ok: true, status: "SUCCESSFUL", recorded: true, fully_paid: row.fully_paid, remaining: row.remaining_after });
        const snap = await snapshot(payment_request_id);
        const status = String(snap?.status || row.status || "NEW").toUpperCase();
        const reason = snap?.status_reason || null;
        if (status !== row.status || reason !== row.status_reason) {
          await admin.from("teya_payment_requests").update({ status, status_reason: reason, raw: snap ?? row.raw, updated_at: new Date().toISOString() }).eq("payment_request_id", payment_request_id);
        }
        if (status !== "SUCCESSFUL") return json({ ok: true, status, reason });

        // ---- record the tender (mirror of admin-api take_payment) ----
        const { data: ord } = await admin.from("menu_orders").select("id, total, amount_paid, status").eq("id", row.order_id).single();
        if (!ord) return json({ error: "order not found" }, 404);
        const total = money(ord.total), already = money(ord.amount_paid);
        const applied = Math.min(money(row.amount), money(total - already));
        if (applied > 0) {
          const { error: pErr } = await admin.from("order_payments").insert({
            order_id: row.order_id, method: "card", amount: applied,
            note: ("teya:" + payment_request_id + (row.note ? " " + row.note : "")).slice(0, 120),
          });
          if (pErr && !/duplicate|unique/i.test(pErr.message || "")) throw pErr;
        }
        const { data: pays } = await admin.from("order_payments").select("amount, method").eq("order_id", row.order_id);
        const paidNow = money((pays ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0));
        const remaining = money(total - paidNow);
        const fullyPaid = remaining <= 0.001;
        const isSplit = (pays ?? []).length > 1;
        let primary = "card";
        if (fullyPaid && (pays ?? []).length) {
          const by: Record<string, number> = {};
          for (const r of pays!) by[r.method] = (by[r.method] || 0) + Number(r.amount || 0);
          primary = Object.entries(by).sort((a, b) => b[1] - a[1])[0][0];
        }
        const patch: Record<string, unknown> = { amount_paid: paidNow, is_split: isSplit };
        if (fullyPaid) { patch.paid_method = isSplit ? "split" : primary; patch.paid_amount = paidNow; patch.paid_at = new Date().toISOString(); if (ord.status === "hold") patch.status = "placed"; }
        await admin.from("menu_orders").update(patch).eq("id", row.order_id);
        await admin.from("teya_payment_requests").update({ recorded_at: new Date().toISOString(), fully_paid: fullyPaid, remaining_after: remaining }).eq("payment_request_id", payment_request_id);
        return json({ ok: true, status: "SUCCESSFUL", recorded: true, paid: paidNow, remaining, fully_paid: fullyPaid, is_split: isSplit, card: snap?.card || null });
      }

      // ---- POS: staff cancelled while the terminal was waiting ----
      case "cancel": {
        const { payment_request_id } = data || {};
        if (!payment_request_id) return json({ error: "payment_request_id required" }, 400);
        try { await teya("PATCH", "/poslink/v2/payment-requests/" + encodeURIComponent(payment_request_id), { status: "CANCELLED" }, crypto.randomUUID()); }
        catch (e) { return json({ ok: false, message: String((e as Error).message) }); }
        await admin.from("teya_payment_requests").update({ status: "CANCELLING", updated_at: new Date().toISOString() }).eq("payment_request_id", payment_request_id);
        return json({ ok: true, status: "CANCELLING" });
      }

      // ---- Admin: list Teya stores + terminals so they can be mapped to locations ----
      case "terminals": {
        const ADMIN_PIN = Deno.env.get("ADMIN_PIN");
        if (!ADMIN_PIN || pin !== ADMIN_PIN) return json({ error: "unauthorized" }, 401);
        const stores = await teya("GET", "/poslink/v1/stores");
        const list = Array.isArray(stores) ? stores : (stores?.stores || stores?.items || []);
        const out: any[] = [];
        for (const s of list) {
          const sid = s.id || s.store_id;
          const t = await teya("GET", "/poslink/v1/stores/" + encodeURIComponent(sid) + "/terminals").catch(() => []);
          const tl = Array.isArray(t) ? t : (t?.terminals || t?.items || []);
          out.push({ store_id: sid, store_name: s.name || s.store_name || null, terminals: tl.map((x: any) => ({ terminal_id: x.id || x.terminal_id, serial: x.serial_number || x.serial || null, name: x.name || null, status: x.status || null })) });
        }
        return json({ ok: true, stores: out });
      }

      case "health": {
        try { await token(); return json({ ok: true, env: ENV, scopes: SCOPES }); }
        catch (e) { return json({ ok: false, env: ENV, error: String((e as Error).message) }); }
      }

      default: return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    console.error("teya-pay", action, e);
    return json({ error: "teya", message: String((e as Error).message) }, 502);
  }
});
