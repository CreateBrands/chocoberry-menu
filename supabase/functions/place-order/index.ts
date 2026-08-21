// ============================================================
// place-order — Supabase Edge Function
// Server-side order creation with price validation.
// The browser sends only item ids + qty + options; this function
// looks up the real prices, recomputes the total, and inserts the
// order. The client never gets to assert a price.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { qr_token, table_id: bodyTableId = null, location_id: bodyLocationId = null, order_type: bodyOrderType = null, pickup_name = null, customer_note = null, tablet_no = null, items = [], append_to_order_id = null } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "no items" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Service-role client: trusted server context, can write orders.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve the dining table two ways:
    //  - tablet picker sends table_id directly
    //  - phone QR sends qr_token, which resolves to a table
    let table_id: string | null = null;
    let location_id: string | null = bodyLocationId;
    if (bodyTableId) {
      const { data: tbl } = await admin
        .from("menu_tables").select("id, location_id").eq("id", bodyTableId).eq("active", true).single();
      if (tbl) { table_id = tbl.id; location_id = location_id ?? tbl.location_id; }
    } else if (qr_token) {
      const { data: tbl } = await admin
        .from("menu_tables").select("id, location_id").eq("qr_token", qr_token).eq("active", true).single();
      if (tbl) { table_id = tbl.id; location_id = tbl.location_id; }
    }
    // Fallback location: first active location.
    if (!location_id) {
      const { data: loc } = await admin.from("menu_locations").select("id").eq("active", true).limit(1).single();
      location_id = loc?.id ?? null;
    }
    // Safety net: refuse orders when this store has paused ordering (a cached
    // tablet could otherwise bypass the client-side block).
    if (location_id) {
      const { data: setg } = await admin.from("menu_app_settings")
        .select("value").eq("key", "accepting_orders:" + location_id).maybeSingle();
      if (setg && setg.value === "off") {
        return new Response(JSON.stringify({ error: "not_accepting", message: "This store isn't taking orders right now." }), { status: 409, headers: { ...cors, "Content-Type": "application/json" } });
      }
    }
    // A resolved table means dine-in; otherwise honour the requested type (default takeaway).
    const order_type = table_id ? "dine_in" : (bodyOrderType || "takeaway");

    // Safety net: a dine-in tablet (requires_table) must have a table. This can't
    // be bypassed by a cached/tampered tablet — no table, no order. (Appending to an
    // existing order is exempt: that order already has its table.)
    if (body.requires_table === true && !table_id && !append_to_order_id) {
      return new Response(JSON.stringify({ error: "table_required", message: "Please ask a staff member to set your table before ordering." }), { status: 409, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Look up REAL prices for every item id; recompute totals server-side.
    const ids = [...new Set(items.map((l: any) => l.item_id))];
    const { data: dbItems, error: itemErr } = await admin
      .from("menu_items").select("id, name, price, available").in("id", ids);
    if (itemErr) throw itemErr;
    const byId = new Map((dbItems ?? []).map((i: any) => [i.id, i]));

    // Resolve the store's price band + per-location overrides so the charged
    // price matches EXACTLY what the tablet menu shows. store_menu_full resolves
    // an item's price as coalesce(override.price, band.price, item.price) — we do
    // the same here, or customers get charged the wrong (base) price.
    let bandId: string | null = null;
    if (location_id) {
      const { data: loc } = await admin
        .from("menu_locations").select("price_band_id").eq("id", location_id).single();
      bandId = loc?.price_band_id ?? null;
    }
    // Per-location item overrides (price + availability).
    const overrideById = new Map<string, { price: number | null; available: boolean | null }>();
    if (location_id && ids.length) {
      const { data: ovs } = await admin
        .from("menu_item_overrides").select("item_id, price, available").eq("location_id", location_id).in("item_id", ids);
      for (const o of ovs ?? []) overrideById.set(o.item_id, { price: o.price, available: o.available });
    }
    // Band prices for this store's band.
    const bandPriceById = new Map<string, number>();
    if (bandId && ids.length) {
      const { data: bps } = await admin
        .from("menu_band_prices").select("item_id, price").eq("band_id", bandId).in("item_id", ids);
      for (const b of bps ?? []) if (b.price != null) bandPriceById.set(b.item_id, Number(b.price));
    }
    // Resolve an item's effective price: override -> band -> base (mirrors the RPC).
    const priceFor = (itemId: string, base: number): number => {
      const ov = overrideById.get(itemId);
      if (ov && ov.price != null) return Number(ov.price);
      if (bandPriceById.has(itemId)) return bandPriceById.get(itemId)!;
      return base;
    };

    // Resolve every chosen modifier option id -> {name, price_delta, group}.
    // The client sends items[].modifiers = [option_id, ...].
    const allModIds = [...new Set(
      items.flatMap((l: any) => Array.isArray(l.modifiers) ? l.modifiers : []).filter(Boolean),
    )] as string[];
    const modById = new Map<string, { name: string; delta: number; group_id: string }>();
    const groupName = new Map<string, string>();
    if (allModIds.length) {
      const { data: mods } = await admin
        .from("menu_modifiers").select("id, group_id, name, price_delta").in("id", allModIds);
      // Per-location option overrides and band option prices, mirroring the RPC's
      // coalesce(override_delta, band_delta, base_delta).
      const ovDelta = new Map<string, number>();
      if (location_id) {
        const { data: mv } = await admin
          .from("menu_modifier_overrides").select("option_id, price_delta").eq("location_id", location_id).in("option_id", allModIds);
        for (const v of mv ?? []) if (v.price_delta != null) ovDelta.set(v.option_id, Number(v.price_delta));
      }
      const bandDelta = new Map<string, number>();
      if (bandId) {
        const { data: bop } = await admin
          .from("menu_band_option_prices").select("option_id, price_delta").eq("band_id", bandId).in("option_id", allModIds);
        for (const b of bop ?? []) if (b.price_delta != null) bandDelta.set(b.option_id, Number(b.price_delta));
      }
      for (const m of mods ?? []) {
        const delta = ovDelta.has(m.id) ? ovDelta.get(m.id)!
          : bandDelta.has(m.id) ? bandDelta.get(m.id)!
          : (Number(m.price_delta) || 0);
        modById.set(m.id, { name: m.name, delta, group_id: m.group_id });
      }
      const gids = [...new Set((mods ?? []).map((m: any) => m.group_id).filter(Boolean))] as string[];
      if (gids.length) {
        const { data: groups } = await admin
          .from("menu_modifier_groups").select("id, name").in("id", gids);
        for (const g of groups ?? []) groupName.set(g.id, g.name);
      }
    }

    let subtotal = 0;
    const orderItems = [];
    for (const l of items) {
      const dbi = byId.get(l.item_id);
      const ov = overrideById.get(l.item_id);
      // Availability: override wins, else the item's own flag (mirrors the RPC).
      const isAvailable = ov && ov.available != null ? ov.available : (dbi?.available !== false);
      if (!dbi || !isAvailable) {
        return new Response(JSON.stringify({ error: `item unavailable: ${l.item_id}` }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const qty = Math.max(1, parseInt(l.qty) || 1);

      // Only the modifiers the customer actually chose for THIS line. Items
      // with no modifiers get an empty snapshot — no phantom Milk/Size.
      const chosen = (Array.isArray(l.modifiers) ? l.modifiers : [])
        .map((id: string) => modById.get(id))
        .filter(Boolean) as Array<{ name: string; delta: number; group_id: string }>;

      // Effective price: override -> band -> base, same as the tablet menu shows.
      let unit = priceFor(l.item_id, Number(dbi.price));
      const snapshot: Record<string, string> = {};
      for (const m of chosen) {
        unit += m.delta;
        const key = groupName.get(m.group_id) || "Option";
        // Multi-select groups (max_select > 1) can have several chosen options.
        // Accumulate them under the same group key instead of overwriting, so
        // e.g. "Choose Topping: Strawberry, Banana" — not just the last one.
        snapshot[key] = snapshot[key] ? `${snapshot[key]}, ${m.name}` : m.name;
      }

      const line_total = unit * qty;
      subtotal += line_total;
      orderItems.push({
        item_id: dbi.id,
        name_snapshot: dbi.name,
        price_snapshot: unit,
        qty,
        modifiers_snapshot: snapshot,
        line_total,
      });
    }

    // ---- APPEND MODE: add items to an existing order (customer/staff tapped
    // "Add more to this order"). Same order number, one bill. New items get a
    // higher added_batch so the kitchen slip can separate original vs added.
    if (append_to_order_id) {
      const { data: existing, error: exErr } = await admin
        .from("menu_orders").select("id, order_no, subtotal, total").eq("id", append_to_order_id).single();
      if (exErr || !existing) {
        return new Response(JSON.stringify({ error: "order not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
      }
      // Next batch number = current max added_batch + 1.
      const { data: batchRows } = await admin
        .from("menu_order_items").select("added_batch").eq("order_id", append_to_order_id);
      const maxBatch = (batchRows || []).reduce((m, r) => Math.max(m, r.added_batch || 0), 0);
      const nextBatch = maxBatch + 1;
      const addLines = orderItems.map((oi) => ({ ...oi, order_id: append_to_order_id, added_batch: nextBatch }));
      const { error: addErr } = await admin.from("menu_order_items").insert(addLines);
      if (addErr) throw addErr;
      const newTotal = Number(existing.total || existing.subtotal || 0) + subtotal;
      await admin.from("menu_orders")
        .update({ subtotal: newTotal, total: newTotal, print_failed: false }).eq("id", append_to_order_id);
      // Re-trigger the kitchen print for the full (now larger) order.
      try {
        await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/sunmi-print", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-print-secret": Deno.env.get("PRINT_WEBHOOK_SECRET") ?? "" },
          body: JSON.stringify({ action: "print-order", order_id: append_to_order_id, force: true }),
        });
      } catch { /* print is best-effort; sweep will catch failures */ }
      return new Response(JSON.stringify({ ok: true, order_id: append_to_order_id, order_no: existing.order_no, tablet_no, total: newTotal, appended: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Compute the human order number BEFORE inserting, so it's on the row the
    // instant the print webhook fires. (Counting before insert => this order is
    // the +1.) Doing it after via UPDATE raced the webhook and printed a UUID.
    const { data: seqRow } = await admin
      .from("menu_orders").select("id", { count: "exact", head: false })
      .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
    const order_no = 200 + ((seqRow?.length ?? 0) + 1);

    // Insert order header (order_no included up front).
    const { data: order, error: ordErr } = await admin
      .from("menu_orders")
      .insert({ location_id, table_id, order_type, pickup_name, customer_note, tablet_no, order_no, subtotal, total: subtotal, status: "placed" })
      .select("id, created_at")
      .single();
    if (ordErr) throw ordErr;

    // Insert order lines.
    const lines = orderItems.map((oi) => ({ ...oi, order_id: order.id }));
    const { error: liErr } = await admin.from("menu_order_items").insert(lines);
    if (liErr) throw liErr;

    return new Response(JSON.stringify({ ok: true, order_id: order.id, order_no, tablet_no, total: subtotal }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
