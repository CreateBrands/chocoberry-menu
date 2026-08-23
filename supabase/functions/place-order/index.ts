// ============================================================
// place-order — Supabase Edge Function
// Server-side order creation with price validation.
// The browser sends item ids + qty + a list of modifier OPTION IDs.
// This function looks up the real item prices AND resolves every
// modifier option (name + price delta) from menu_modifiers, recomputes
// the total, stores a printable modifiers_snapshot (array of display
// strings), and inserts the order. Supports append_to_order_id.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const gbp = (n) => "£" + Number(n).toFixed(2);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json();
    const {
      qr_token = null,
      table_id: table_id_in = null,
      location_id: location_id_in = null,
      order_type = "takeaway",
      requires_table = false,
      pickup_name = null,
      customer_note = null,
      tablet_no = null,
      items = [],
      append_to_order_id = null,
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "no items" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );

    // Resolve table (dine-in) from qr_token, or from an explicit table_id.
    let table_id = table_id_in;
    // An explicit location_id (e.g. from the POS) takes priority so orders
    // route to the correct store's printer even for takeaway (no table/token).
    let location_id = location_id_in;
    if (!location_id && qr_token) {
      const { data: tbl } = await admin
        .from("menu_tables").select("id, location_id").eq("qr_token", qr_token).eq("active", true).single();
      if (tbl) { table_id = table_id ?? tbl.id; location_id = tbl.location_id; }
    } else if (qr_token) {
      // location already known, but still resolve the table from the token
      const { data: tbl } = await admin
        .from("menu_tables").select("id").eq("qr_token", qr_token).eq("active", true).single();
      if (tbl) table_id = table_id ?? tbl.id;
    }
    if (!location_id && table_id) {
      const { data: tbl } = await admin.from("menu_tables").select("location_id").eq("id", table_id).single();
      location_id = tbl?.location_id ?? null;
    }
    if (!location_id) {
      const { data: loc } = await admin.from("menu_locations").select("id").eq("active", true).limit(1).single();
      location_id = loc?.id ?? null;
    }

    // Look up REAL prices for every item id.
    const ids = [...new Set(items.map((l) => l.item_id))];
    // ── Resolve the price TIER for this location + all item/modifier data.
    // These lookups are independent of each other, so run them in PARALLEL
    // instead of sequentially — cuts the order-send latency noticeably. ──
    const allOptIds = [...new Set(items.flatMap((l) => Array.isArray(l.modifiers) ? l.modifiers : []))]
      .filter((x) => typeof x === "string" && !x.startsWith("remove:"));

    const [itemsRes, locRes, ovsRes, optsRes] = await Promise.all([
      admin.from("menu_items").select("id, name, price, available").in("id", ids),
      location_id
        ? admin.from("menu_locations").select("price_band_id").eq("id", location_id).single()
        : Promise.resolve({ data: null }),
      location_id
        ? admin.from("menu_item_overrides").select("item_id, price").eq("location_id", location_id).in("item_id", ids)
        : Promise.resolve({ data: [] }),
      allOptIds.length
        ? admin.from("menu_modifiers").select("id, name, price_delta, group_id, menu_modifier_groups(name)").in("id", allOptIds)
        : Promise.resolve({ data: [] }),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    const dbItems = itemsRes.data;
    const byId = new Map((dbItems ?? []).map((i) => [i.id, i]));

    const locBandId = locRes.data?.price_band_id ?? null;
    const ovById = new Map();
    for (const o of ovsRes.data ?? []) if (o.price != null) ovById.set(o.item_id, Number(o.price));

    // band prices depend on the resolved band id (one more short query).
    const bandById = new Map();
    if (locBandId) {
      const { data: bps } = await admin
        .from("menu_band_prices").select("item_id, price").eq("band_id", locBandId).in("item_id", ids);
      for (const b of bps ?? []) if (b.price != null) bandById.set(b.item_id, Number(b.price));
    }
    // effective base = override → band → item.price
    const effectiveBase = (item) => {
      if (ovById.has(item.id)) return ovById.get(item.id);
      if (bandById.has(item.id)) return bandById.get(item.id);
      return Number(item.price);
    };

    // Modifier option prices/names, resolved from the parallel query above.
    let optById = new Map();
    {
      const opts = optsRes.data;
      const optErr = optsRes.error;
      if (optErr) throw optErr;
      optById = new Map((opts ?? []).map((o) => [o.id, {
        name: o.name,
        price_delta: Number(o.price_delta || 0),
        group: o.menu_modifier_groups?.name ?? "",
      }]));
    }

    let subtotal = 0;
    const orderItems = [];
    for (const l of items) {
      const dbi = byId.get(l.item_id);
      if (!dbi || dbi.available === false) {
        return new Response(JSON.stringify({ error: `item unavailable: ${l.item_id}` }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const qty = Math.max(1, parseInt(l.qty) || 1);

      const modIds = Array.isArray(l.modifiers) ? l.modifiers : [];
      let modDelta = 0;
      const snapshot = [];
      for (const mid of modIds) {
        if (typeof mid === "string" && mid.startsWith("remove:")) {
          snapshot.push("NO " + mid.slice(7));
          continue;
        }
        const o = optById.get(mid);
        if (!o) continue;
        modDelta += o.price_delta;
        if (o.group === "Remove" || o.name.toUpperCase().startsWith("NO ")) {
          snapshot.push(o.name);
        } else if (o.price_delta) {
          snapshot.push(`${o.name} (+${gbp(o.price_delta)})`);
        } else {
          snapshot.push(o.group ? `${o.group}: ${o.name}` : o.name);
        }
      }

      const unit = effectiveBase(dbi) + modDelta;
      const line_total = unit * qty;
      subtotal += line_total;
      orderItems.push({
        item_id: dbi.id,
        name_snapshot: dbi.name,
        price_snapshot: unit,
        qty,
        modifiers_snapshot: snapshot,
        line_total,
        note: (l.note && String(l.note).trim()) ? String(l.note).trim().slice(0, 200) : null,
      });
    }

    // ---- APPEND to an existing order, or create a new one ----
    if (append_to_order_id) {
      const { data: existing, error: exErr } = await admin
        .from("menu_orders").select("id, created_at, order_no, subtotal, total").eq("id", append_to_order_id).single();
      if (exErr || !existing) throw new Error("order to append not found");
      const orderId = existing.id;

      const { data: batches } = await admin
        .from("menu_order_items").select("added_batch").eq("order_id", orderId).order("added_batch", { ascending: false }).limit(1);
      const nextBatch = ((batches?.[0]?.added_batch ?? 0)) + 1;

      const lines = orderItems.map((oi) => ({ ...oi, order_id: orderId, added_batch: nextBatch }));
      const { error: liErr } = await admin.from("menu_order_items").insert(lines);
      if (liErr) throw liErr;

      await admin.from("menu_orders").update({
        subtotal: Number(existing.subtotal || 0) + subtotal,
        total: Number(existing.total || 0) + subtotal,
      }).eq("id", orderId);

      // The auto-print webhook only fires on menu_orders INSERT. An append adds
      // menu_order_items to an existing order (no new order row), so we must
      // trigger the reprint explicitly. force:true bypasses the already-printed
      // guard; sunmi-print renders the ORIGINAL / ADDED / DISCARD PREVIOUS slip.
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sunmi-print`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
            "x-print-secret": Deno.env.get("PRINT_WEBHOOK_SECRET") ?? "",
          },
          body: JSON.stringify({ action: "print-order", order_id: orderId, force: true }),
        });
      } catch (e) {
        console.error("append print trigger failed:", e);
      }

      return new Response(JSON.stringify({ ok: true, order_id: orderId, order_no: existing.order_no, total: subtotal, added_batch: nextBatch }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Order number = friendly DAILY number for this location (resets to 1 each
    // day). The order's real identity is its UUID (id), so a small resettable
    // display number is safe and never collides. next_order_no() increments a
    // per-day/per-location counter atomically (row lock) — two simultaneous
    // orders can never get the same number.
    let orderNo: number;
    {
      const { data: seqNo, error: seqErr } = await admin.rpc("next_order_no", { p_location: location_id ?? null });
      if (seqErr || seqNo == null) {
        // Fallback: max(order_no today at this location)+1. Still far safer than
        // a plain count, and self-heals once the RPC is available.
        const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
        let q = admin.from("menu_orders").select("order_no").gte("created_at", startOfDay)
          .order("order_no", { ascending: false }).limit(1);
        if (location_id) q = q.eq("location_id", location_id);
        const { data: maxRow } = await q.maybeSingle();
        orderNo = Number(maxRow?.order_no ?? 0) + 1;
      } else {
        orderNo = Number(seqNo);
      }
    }

    const { data: order, error: ordErr } = await admin
      .from("menu_orders")
      .insert({
        location_id, table_id, order_type,
        pickup_name, customer_note,
        tablet_no,
        subtotal, total: subtotal,
        status: "placed",
        order_no: orderNo,
      })
      .select("id, created_at")
      .single();
    if (ordErr) throw ordErr;
    const orderId = order.id;

    const lines = orderItems.map((oi) => ({ ...oi, order_id: orderId, added_batch: 0 }));
    const { error: liErr } = await admin.from("menu_order_items").insert(lines);
    if (liErr) throw liErr;

    // NOTE: printing for NEW orders is handled by the `sunmi-print-orders`
    // database trigger (AFTER INSERT ON menu_orders). We deliberately do NOT
    // trigger a print here as well — doing so caused duplicate receipts. Only
    // the APPEND path above triggers print explicitly, because an append adds
    // items to an existing order and fires no INSERT trigger.

    return new Response(JSON.stringify({ ok: true, order_id: orderId, order_no: orderNo, total: subtotal }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e)?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
