// ============================================================
// place-order — Supabase Edge Function
// Server-side order creation with price validation.
// The browser sends only item ids + qty + options; this function
// looks up the real prices, recomputes the total, and inserts the
// order. The client never gets to assert a price.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Option price deltas — keep in sync with the menu's option model.
const SIZE_DELTA: Record<string, number> = { Regular: 0, Large: 0.6 };
const MILK_DELTA: Record<string, number> = { Whole: 0, Oat: 0, Almond: 0.6 };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json();
    const { qr_token, order_type = "takeaway", pickup_name = null, customer_note = null, items = [] } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "no items" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Service-role client: trusted server context, can write orders.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve table (dine-in) from qr_token if provided.
    let table_id: string | null = null;
    let location_id: string | null = null;
    if (qr_token) {
      const { data: tbl } = await admin
        .from("menu_tables").select("id, location_id").eq("qr_token", qr_token).eq("active", true).single();
      if (tbl) { table_id = tbl.id; location_id = tbl.location_id; }
    }
    // Fallback location: first active location.
    if (!location_id) {
      const { data: loc } = await admin.from("menu_locations").select("id").eq("active", true).limit(1).single();
      location_id = loc?.id ?? null;
    }

    // Look up REAL prices for every item id; recompute totals server-side.
    const ids = [...new Set(items.map((l: any) => l.item_id))];
    const { data: dbItems, error: itemErr } = await admin
      .from("menu_items").select("id, name, price, available").in("id", ids);
    if (itemErr) throw itemErr;
    const byId = new Map((dbItems ?? []).map((i: any) => [i.id, i]));

    let subtotal = 0;
    const orderItems = [];
    for (const l of items) {
      const dbi = byId.get(l.item_id);
      if (!dbi || dbi.available === false) {
        return new Response(JSON.stringify({ error: `item unavailable: ${l.item_id}` }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const qty = Math.max(1, parseInt(l.qty) || 1);
      const size = SIZE_DELTA[l.size] !== undefined ? l.size : "Regular";
      const milk = MILK_DELTA[l.milk] !== undefined ? l.milk : "Oat";
      const unit = Number(dbi.price) + SIZE_DELTA[size] + MILK_DELTA[milk];
      const line_total = unit * qty;
      subtotal += line_total;
      orderItems.push({
        item_id: dbi.id,
        name_snapshot: dbi.name,
        price_snapshot: unit,
        qty,
        modifiers_snapshot: { size, milk },
        line_total,
      });
    }

    // Insert order header.
    const { data: order, error: ordErr } = await admin
      .from("menu_orders")
      .insert({ location_id, table_id, order_type, pickup_name, customer_note, subtotal, total: subtotal, status: "placed" })
      .select("id, created_at")
      .single();
    if (ordErr) throw ordErr;

    // Insert order lines.
    const lines = orderItems.map((oi) => ({ ...oi, order_id: order.id }));
    const { error: liErr } = await admin.from("menu_order_items").insert(lines);
    if (liErr) throw liErr;

    // Short human order number from the row's created order.
    const { data: seqRow } = await admin
      .from("menu_orders").select("id", { count: "exact", head: false })
      .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
    const order_no = 200 + ((seqRow?.length ?? 1));

    return new Response(JSON.stringify({ ok: true, order_id: order.id, order_no, total: subtotal }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
