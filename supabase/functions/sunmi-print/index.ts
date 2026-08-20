// ---------------------------------------------------------------------------
// sunmi-print — Supabase Edge Function (final, mapped to menu_orders schema)
//
//   { "action": "bind",   "sn": "...", "shop_id": 1 }        one-time per printer
//   { "action": "status", "sn": "..." }                      is it online?
//   { "action": "test",   "sn": "..." }                      print a test slip
//   { "action": "print-order", "order_id": "<uuid>" }        (re)print an order
//
// ...plus Supabase Database Webhook payloads on menu_orders INSERT
// ({ "type": "INSERT", "table": "menu_orders", "record": {...} }).
//
// Deploy with --no-verify-jwt; every request must carry
//   x-print-secret: <PRINT_WEBHOOK_SECRET>
// Secrets: SUNMI_APP_ID, SUNMI_APP_KEY, PRINT_WEBHOOK_SECRET
// ---------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";
import { SunmiClient, ok } from "../_shared/sunmi.ts";
import {
  buildOrderReceipt,
  buildTestReceipt,
  type ReceiptOrder,
  type ReceiptItem,
} from "../_shared/escpos.ts";
import { buildOrderRasterHex } from "../_shared/raster.ts";

// "raster" = Uber-style image tickets (real typography); anything else = text
const RECEIPT_MODE = Deno.env.get("RECEIPT_MODE") ?? "text";

async function receiptHexFor(order: ReceiptOrder): Promise<string> {
  if (RECEIPT_MODE === "raster") {
    try {
      return await buildOrderRasterHex(order);
    } catch (e) {
      console.error("raster render failed, falling back to text:", e);
    }
  }
  return buildOrderReceipt(order).toHex();
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const sunmi = new SunmiClient(
  Deno.env.get("SUNMI_APP_ID") ?? "",
  Deno.env.get("SUNMI_APP_KEY") ?? "",
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const DEFAULT_STATION = "kitchen";

// For each order-item row, resolve the effective station:
//   item.station  (if set)  ->  its category.station  ->  DEFAULT_STATION
async function resolveLineStations(
  rows: Array<Record<string, unknown>>,
): Promise<string[]> {
  const itemIds = [...new Set(rows.map((r) => r.item_id).filter(Boolean).map(String))];
  const itemStation = new Map<string, string | null>();
  const itemCategory = new Map<string, string | null>();
  if (itemIds.length) {
    const { data: mi } = await supabase
      .from("menu_items")
      .select("id, station, category_id")
      .in("id", itemIds);
    for (const r of mi ?? []) {
      itemStation.set(String(r.id), (r.station as string) ?? null);
      itemCategory.set(String(r.id), (r.category_id as string) ?? null);
    }
  }
  const catIds = [...new Set([...itemCategory.values()].filter(Boolean).map(String))];
  const catStation = new Map<string, string | null>();
  if (catIds.length) {
    const { data: mc } = await supabase
      .from("menu_categories")
      .select("id, station")
      .in("id", catIds);
    for (const r of mc ?? []) catStation.set(String(r.id), (r.station as string) ?? null);
  }
  return rows.map((r) => {
    const id = r.item_id ? String(r.item_id) : "";
    const own = itemStation.get(id);
    if (own) return own;
    const cat = itemCategory.get(id);
    const cs = cat ? catStation.get(cat) : null;
    return cs || DEFAULT_STATION;
  });
}

// ---------------------------------------------------------------------------
// Build the receipt model from a menu_orders row + its menu_order_items
// ---------------------------------------------------------------------------
async function loadReceiptOrder(
  rec: Record<string, unknown>,
): Promise<ReceiptOrder> {
  const orderId = String(rec.id);

  // Items
  const { data: itemRows, error: itemsErr } = await supabase
    .from("menu_order_items")
    .select("item_id, name_snapshot, price_snapshot, qty, modifiers_snapshot, line_total")
    .eq("order_id", orderId);
  if (itemsErr) throw new Error("menu_order_items lookup failed: " + itemsErr.message);

  // Resolve each line's station: item.station ?? its category.station ?? "kitchen".
  const stationByLine = await resolveLineStations(itemRows ?? []);

  const items: ReceiptItem[] = (itemRows ?? []).map((it, i) => {
    const mods = it.modifiers_snapshot as Record<string, unknown> | null;
    return {
      qty: it.qty ?? 1,
      name: it.name_snapshot ?? "Item",
      price: typeof it.line_total === "number"
        ? it.line_total
        : parseFloat(String(it.line_total ?? "")) || undefined,
      station: stationByLine[i],
      modifiers: mods
        ? Object.entries(mods).map(([k, v]) => `${cap(k)}: ${v}`)
        : [],
    };
  });

  // Dine-in table name (best-effort: tolerate unknown column naming)
  let tableLabel: string | undefined;
  if (rec.table_id) {
    const { data: t } = await supabase
      .from("menu_tables")
      .select("*")
      .eq("id", String(rec.table_id))
      .maybeSingle();
    if (t) {
      const tt = t as Record<string, unknown>;
      const raw = tt.name ?? tt.label ?? tt.table_number ?? tt.number ?? tt.code;
      if (raw != null) {
        const s = String(raw);
        tableLabel = /^\d+$/.test(s) ? `Table ${s}` : s;
      }
    }
  }

  // Store name (best-effort)
  let storeName: string | undefined;
  if (rec.location_id) {
    const { data: loc } = await supabase
      .from("menu_locations")
      .select("*")
      .eq("id", String(rec.location_id))
      .maybeSingle();
    if (loc) {
      const ll = loc as Record<string, unknown>;
      const raw = ll.name ?? ll.label ?? ll.title;
      if (raw != null) storeName = String(raw);
    }
  }

  const orderType =
    rec.order_type === "dine_in"
      ? `DINE-IN${tableLabel ? " - " + tableLabel : ""}`
      : "TAKEAWAY";

  const created = rec.created_at ? String(rec.created_at) : undefined;
  const placedAt = new Date(created ?? Date.now()).toLocaleString("en-GB", {
    timeZone: "Europe/London",
  });

  const num = (v: unknown) => {
    const x = typeof v === "string" ? parseFloat(v) : (v as number);
    return typeof x === "number" && !isNaN(x) ? x : undefined;
  };

  return {
    orderNumber: rec.order_no ? String(rec.order_no) : orderId.replace(/-/g, "").slice(0, 6).toUpperCase(),
    placedAt,
    orderType,
    customerName: rec.pickup_name ? String(rec.pickup_name) : undefined,
    items,
    subtotal: num(rec.subtotal),
    total: num(rec.total),
    notes: rec.customer_note ? String(rec.customer_note) : undefined,
    tabletNo: rec.tablet_no ? String(rec.tablet_no) : undefined,
    storeName,
  };
}

// ---------------------------------------------------------------------------
// Printer routing: printers.location_id (uuid of menu_locations) first,
// then fall back to the single active printer (proving phase convenience).
// ---------------------------------------------------------------------------
// All active printers for a location. Falls back to the single active printer
// (proving phase) only when no location is given or none are mapped.
async function findPrinters(locationId?: string): Promise<Array<Record<string, unknown>>> {
  if (locationId) {
    const { data, error } = await supabase
      .from("printers")
      .select("*")
      .eq("active", true)
      .eq("location_id", locationId);
    if (error) throw new Error("printers lookup failed: " + error.message);
    if (data && data.length) return data;
  }
  const { data: all, error } = await supabase
    .from("printers")
    .select("*")
    .eq("active", true);
  if (error) throw new Error("printers lookup failed: " + error.message);
  if (!all || all.length === 0) throw new Error("no active printers configured");
  if (all.length === 1) return [all[0]]; // single-store proving phase
  throw new Error(
    `no printer mapped to location ${locationId ?? "(none)"} and multiple printers active`,
  );
}

async function logJob(fields: Record<string, unknown>) {
  const { error } = await supabase.from("print_jobs").insert(fields);
  if (error) console.error("print_jobs insert failed:", error.message);
}

async function alreadyPrinted(orderId: string, sn: string): Promise<boolean> {
  const { data } = await supabase
    .from("print_jobs")
    .select("id")
    .eq("order_id", orderId)
    .eq("printer_sn", sn)
    .eq("status", "sent")
    .limit(1);
  return !!data && data.length > 0;
}

async function printOrder(rec: Record<string, unknown>, force = false) {
  const orderId = String(rec.id);

  if (rec.status === "cancelled") {
    return { skipped: true, reason: "order is cancelled" };
  }

  const printers = await findPrinters(
    rec.location_id ? String(rec.location_id) : undefined,
  );
  // Build the full order once (items now each carry a station).
  const order = await loadReceiptOrder(rec);
  if (force) (order as any).reprint = true; // reprint => slip shows a DUPLICATE banner
  const allItems = order.items as Array<ReceiptItem & { station?: string }>;

  // Which stations actually have printers here? If a printer's station has no
  // items, it is skipped. If only one printer exists, it prints everything
  // (station filtering is a no-op) so single-printer stores are unaffected.
  const stations = new Set(printers.map((p) => String((p as any).station ?? DEFAULT_STATION)));
  const singlePrinter = printers.length === 1;

  const results: Array<Record<string, unknown>> = [];

  for (const printer of printers) {
    const sn = String((printer as any).sn);
    const station = String((printer as any).station ?? DEFAULT_STATION);

    // Filter this order's items to those for this printer's station.
    // Single-printer store => print everything regardless of station.
    const lines = singlePrinter
      ? allItems
      : allItems.filter((it) => {
          const s = it.station ?? DEFAULT_STATION;
          // If an item's station has no dedicated printer, fall it back to
          // the kitchen printer so nothing is silently dropped.
          if (stations.has(s)) return s === station;
          return station === DEFAULT_STATION;
        });

    if (lines.length === 0) {
      results.push({ printer: sn, station, skipped: true, reason: "no items for this station" });
      continue;
    }

    if (!force && (await alreadyPrinted(orderId, sn))) {
      results.push({ printer: sn, station, skipped: true, reason: "already printed" });
      continue;
    }

    const stationOrder: ReceiptOrder = { ...order, items: lines };
    const contentHex = await receiptHexFor(stationOrder);

    // trade_no <=32 chars, unique per printer (station suffix) and per reprint.
    const base = orderId.replace(/-/g, "").slice(0, 24);
    const tag = (force ? Date.now().toString(36) : "") + sn.slice(-5);
    const tradeNo = (base + tag).slice(0, 32);

    const res = await sunmi.pushContent(sn, tradeNo, contentHex);
    const success = ok(res);
    await logJob({
      order_id: orderId,
      printer_sn: sn,
      status: success ? "sent" : "failed",
      response: res,
      error: success ? null : res.msg ?? "unknown Sunmi error",
    });
    results.push({ printer: sn, station, printed: success, sunmi: res });
    if (!success) {
      console.error(`pushContent failed for ${sn} (${station}):`, JSON.stringify(res));
    }
  }

  const anyPrinted = results.some((r) => r.printed);
  if (!anyPrinted && results.every((r) => r.skipped)) {
    return { skipped: true, reason: "nothing to print", results };
  }
  return { printed: anyPrinted, results };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const secret = Deno.env.get("PRINT_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-print-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  try {
    // Database webhook: fires on menu_orders INSERT
    if (body.type === "INSERT" && body.record) {
      const result = await printOrder(body.record as Record<string, unknown>);
      return json(result);
    }

    switch (body.action) {
      case "bind": {
        const shopId = Number(body.shop_id);
        if (!Number.isInteger(shopId)) {
          return json({ error: "shop_id must be an integer (Sunmi requirement)" }, 400);
        }
        const res = await sunmi.bindShop(String(body.sn), shopId);
        if (ok(res)) {
          await supabase
            .from("printers")
            .update({ bound_at: new Date().toISOString() })
            .eq("sn", String(body.sn));
        }
        return json(res, ok(res) ? 200 : 502);
      }
      case "status": {
        const res = await sunmi.onlineStatus(String(body.sn));
        return json(res, ok(res) ? 200 : 502);
      }
      case "test-raster": {
        // Payload/compat probe: renders a full sample ticket in raster mode
        const sample: ReceiptOrder = {
          orderNumber: "A3F92C",
          placedAt: new Date().toLocaleString("en-GB", { timeZone: "Europe/London" }),
          orderType: "DINE-IN - Table 4",
          customerName: "Sarah",
          items: [
            { qty: 1, name: "Signature Chocoberry Waffle", price: 9.95, modifiers: ["Sauce: Milk Chocolate", "Extra: Strawberries"] },
            { qty: 2, name: "Iced Latte", price: 8.5, modifiers: ["Milk: Oat", "Size: Regular"] },
            { qty: 1, name: "Cookie Dough Sundae Supreme with Belgian Chocolate", price: 8.45 },
          ],
          subtotal: 26.9,
          total: 26.9,
          notes: "Nut allergy on the waffle please",
          storeName: "London Road",
        };
        const hex = await buildOrderRasterHex(sample);
        const res = await sunmi.pushContent(String(body.sn), "raster" + Date.now(), hex);
        return json({ hexLength: hex.length, sunmi: res }, ok(res) ? 200 : 502);
      }
      case "test": {
        const receipt = buildTestReceipt(`SN ${body.sn}`);
        const res = await sunmi.pushContent(
          String(body.sn),
          "test" + Date.now(),
          receipt.toHex(),
        );
        return json(res, ok(res) ? 200 : 502);
      }
      case "print-order": {
        const { data, error } = await supabase
          .from("menu_orders")
          .select("*")
          .eq("id", String(body.order_id))
          .single();
        if (error || !data) return json({ error: "order not found" }, 404);
        const result = await printOrder(data, body.force === true);
        return json(result);
      }
      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
