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
  Receipt,
  type ReceiptOrder,
  type ReceiptItem,
} from "../_shared/escpos.ts";
import { buildOrderRasterHex } from "../_shared/raster.ts";

// "raster" = Uber-style image tickets (real typography); anything else = text
const RECEIPT_MODE = Deno.env.get("RECEIPT_MODE") ?? "text";

async function receiptHexFor(order: ReceiptOrder): Promise<string> {
  // NOTE: with RECEIPT_MODE="raster" (default) the LIVE receipt layout lives in
  // raster.ts (receiptTree). escpos.ts buildOrderReceipt is only the text
  // fallback used if raster throws. Edit raster.ts to change the printed slip.
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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-print-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
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

// Resolve each line's MASTER category name (the top-level menu the item's
// sub-category belongs to), for grouping items on the slip/KDS.
// item -> menu_items.category_id -> menu_categories.menu_id -> menu_menus.name
async function resolveLineCategories(
  rows: Array<Record<string, unknown>>,
): Promise<(string | undefined)[]> {
  const itemIds = [...new Set(rows.map((r) => r.item_id).filter(Boolean).map(String))];
  const itemCat = new Map<string, string | null>();
  if (itemIds.length) {
    const { data: mi } = await supabase
      .from("menu_items")
      .select("id, category_id")
      .in("id", itemIds);
    for (const r of mi ?? []) itemCat.set(String(r.id), (r.category_id as string) ?? null);
  }
  const catIds = [...new Set([...itemCat.values()].filter(Boolean).map(String))];
  const catMenu = new Map<string, string | null>();
  if (catIds.length) {
    const { data: mc } = await supabase
      .from("menu_categories")
      .select("id, menu_id")
      .in("id", catIds);
    for (const r of mc ?? []) catMenu.set(String(r.id), (r.menu_id as string) ?? null);
  }
  const menuIds = [...new Set([...catMenu.values()].filter(Boolean).map(String))];
  const menuName = new Map<string, string>();
  if (menuIds.length) {
    const { data: mm } = await supabase
      .from("menu_menus")
      .select("id, name")
      .in("id", menuIds);
    for (const r of mm ?? []) menuName.set(String(r.id), String(r.name ?? ""));
  }
  return rows.map((r) => {
    const id = r.item_id ? String(r.item_id) : "";
    const cat = itemCat.get(id);
    const menu = cat ? catMenu.get(cat) : null;
    const nm = menu ? menuName.get(menu) : undefined;
    return nm || undefined;
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
    .select("item_id, name_snapshot, price_snapshot, qty, modifiers_snapshot, line_total, added_batch, note, created_at")
    .eq("order_id", orderId)
    .order("added_batch", { ascending: true });
  if (itemsErr) throw new Error("menu_order_items lookup failed: " + itemsErr.message);

  // Resolve each line's station: item.station ?? its category.station ?? "kitchen".
  const stationByLine = await resolveLineStations(itemRows ?? []);
  // Resolve each line's master category name (menu_menus.name) for grouping.
  const categoryByLine = await resolveLineCategories(itemRows ?? []);

  const items: ReceiptItem[] = (itemRows ?? []).map((it, i) => {
    const mods = it.modifiers_snapshot as Record<string, unknown> | unknown[] | null;
    return {
      qty: it.qty ?? 1,
      name: it.name_snapshot ?? "Item",
      price: typeof it.line_total === "number"
        ? it.line_total
        : parseFloat(String(it.line_total ?? "")) || undefined,
      station: stationByLine[i],
      category: categoryByLine[i],
      added: (it.added_batch ?? 0) > 0,
      batch: it.added_batch ?? 0,
      note: it.note ? String(it.note) : undefined,
      modifiers: Array.isArray(mods)
        ? (mods as unknown[]).map((m) => String(m))
        : mods
          ? Object.entries(mods).map(([k, v]) => `${cap(k)}: ${v}`)
          : [],
    };
  });
  const hasAdditions = items.some((it) => (it as any).added);

  // Per-round timestamps: earliest item created_at within each added_batch,
  // formatted as a short local time (e.g. "2:31 PM"). batchTimes[0] = original.
  const batchFirstTs = new Map<number, number>();
  for (const it of (itemRows ?? [])) {
    const b = (it as any).added_batch ?? 0;
    const ts = (it as any).created_at ? Date.parse(String((it as any).created_at)) : NaN;
    if (!Number.isNaN(ts)) {
      const cur = batchFirstTs.get(b);
      if (cur === undefined || ts < cur) batchFirstTs.set(b, ts);
    }
  }
  const maxBatch = Math.max(0, ...[...batchFirstTs.keys()]);
  const batchTimes: string[] = [];
  for (let b = 0; b <= maxBatch; b++) {
    const ts = batchFirstTs.get(b);
    batchTimes[b] = ts !== undefined
      ? new Date(ts).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true })
      : "";
  }

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
    hasAdditions,
    batchTimes,
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

// Highest round (batch) this printer has SUCCESSFULLY printed for this order,
// or -1 if it has never printed it. Drives per-printer independence: a printer
// only prints rounds beyond what it last confirmed, so a retry never reprints
// rounds another printer (or an earlier attempt) already handled.
async function lastPrintedBatch(orderId: string, sn: string): Promise<number> {
  const { data } = await supabase
    .from("print_jobs")
    .select("max_batch")
    .eq("order_id", orderId)
    .eq("printer_sn", sn)
    .eq("status", "sent")
    .order("max_batch", { ascending: false })
    .limit(1);
  const v = data && data.length ? (data[0] as any).max_batch : null;
  return typeof v === "number" ? v : -1;
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
    let lines = singlePrinter
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

    // PER-PRINTER INDEPENDENCE. Each printer tracks the highest round (batch)
    // it has already printed for this order. On a normal (non-forced) call it
    // prints ONLY rounds newer than that — so:
    //   - a retry after a failure re-sends only the round(s) that never
    //     confirmed on THIS printer (a printer that already succeeded is skipped),
    //   - a new round prints just that round, not the whole order again,
    //   - the endless "reprint everything on both printers" loop is gone.
    // A forced/manual reprint (force=true) always prints the full order.
    const printedBefore = await alreadyPrinted(orderId, sn);
    const alreadyBatch = force ? -1 : await lastPrintedBatch(orderId, sn);
    if (!force && alreadyBatch >= 0) {
      lines = lines.filter((it) => (it.batch ?? 0) > alreadyBatch);
    }
    if (lines.length === 0) {
      results.push({ printer: sn, station, skipped: true, reason: "already printed all rounds on this printer" });
      continue;
    }
    // The highest round included in THIS print (logged on success so the next
    // call knows this printer is caught up to here).
    const maxBatchThisRun = lines.reduce((m, it) => Math.max(m, it.batch ?? 0), 0);

    // How many copies this printer should print (default 1).
    const copies = Math.max(1, parseInt(String((printer as any).copies ?? 1), 10) || 1);

    // trade_no <=32 chars, unique per printer (station suffix), per reprint, and per copy.
    const base = orderId.replace(/-/g, "").slice(0, 24);
    for (let copy = 0; copy < copies; copy++) {
      // Stamp REPRINT only on a deliberate forced reprint or an extra copy in
      // this run. Round-based additions are NOT stamped REPRINT — the ROUND
      // headings already make clear what's new, and this printer is only being
      // sent rounds it hasn't printed yet (not a true duplicate).
      const isDuplicate = (force && printedBefore) || copy > 0;
      const stationOrder: ReceiptOrder = { ...order, items: lines, reprint: isDuplicate };
      const contentHex = await receiptHexFor(stationOrder);

      const tag = (force ? Date.now().toString(36) : "") + sn.slice(-5) + (copy > 0 ? "c" + copy : "");
      const tradeNo = (base + tag).slice(0, 32);

      // Push the ticket. Retry the PUSH a couple of times on transient API
      // errors (Sunmi's own cloud queue then durably holds it for the printer).
      let res = await sunmi.pushContent(sn, tradeNo, contentHex);
      let attempts = 1;
      let usedTrade = tradeNo;
      while (!ok(res) && attempts < 3) {
        await new Promise((r) => setTimeout(r, 800 * attempts));
        usedTrade = tradeNo + "r" + attempts;
        res = await sunmi.pushContent(sn, usedTrade, contentHex);
        attempts++;
      }
      const pushed = ok(res);

      // CONFIRM ACTUAL PRINTING. Sunmi tracks whether the printer really printed
      // a ticket (is_print: 0 no, 1 yes, 2 deleted) — so we poll printStatus
      // briefly. This catches physical failures (out of paper, jam, cover open)
      // that a successful push alone can't see. A healthy printer confirms within
      // 1-3s; if it doesn't confirm in our window we treat it as not-yet-printed
      // (flagged), since Sunmi's queue may still deliver later but staff should check.
      let confirmed = false;
      if (pushed) {
        // Poll a little longer/gentler (5 x 1.5s ~= 7.5s) so a printer that's
        // slow during a rush or waking from sleep still confirms in-window.
        for (let poll = 0; poll < 5 && !confirmed; poll++) {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const st = await sunmi.printStatus(usedTrade);
            const isPrint = st?.data?.is_print;
            if (isPrint === 1) { confirmed = true; break; }
            if (isPrint === 2) break; // deleted/cancelled — stop polling
          } catch { /* keep polling */ }
        }
      }
      // Three-way outcome, not two:
      //   - confirmed print  -> "sent"    (done)
      //   - pushed, not yet confirmed -> "pending" (Sunmi's durable queue holds
      //       it and will likely print; the 2-min sweep re-verifies). NOT a hard
      //       failure, so it does NOT raise the print-failure alarm — this stops
      //       false alarms for slow-but-fine printers during a rush.
      //   - push failed -> "failed"  (genuinely didn't reach Sunmi)
      const success = pushed && confirmed;
      const pending = pushed && !confirmed;
      await logJob({
        order_id: orderId,
        printer_sn: sn,
        status: success ? "sent" : (pending ? "pending" : "failed"),
        max_batch: success ? maxBatchThisRun : null,
        response: res,
        error: success ? null
          : pending ? "pushed to Sunmi queue; awaiting printer confirmation"
          : (res.msg ?? "unknown Sunmi error") + " (push failed after " + attempts + " attempts)",
      });
      results.push({ printer: sn, station, copy: copy + 1, printed: success, pending, pushed, confirmed, attempts, sunmi: res });
      if (!success && !pending) {
        console.error(`print push FAILED for ${sn} (${station}) copy ${copy + 1}: pushed=${pushed}`);
      }
    }
  }

  const anyPrinted = results.some((r) => r.printed);
  // Raise the print-failure alarm ONLY for a genuine push failure (didn't reach
  // Sunmi). A "pending" (pushed, not yet confirmed) is NOT an alarm — Sunmi's
  // durable queue holds it and the 2-min sweep re-verifies, so slow-but-fine
  // printers no longer trip a false alert. Clear the flag once every attempt
  // has actually confirmed printed.
  const attempted = results.filter((r) => !r.skipped);
  const anyHardFailed = attempted.some((r) => r.printed === false && r.pending !== true);
  try {
    if (anyHardFailed) {
      await supabase.from("menu_orders").update({ print_failed: true }).eq("id", orderId);
    } else if (attempted.length > 0 && attempted.every((r) => r.printed)) {
      await supabase.from("menu_orders").update({ print_failed: false }).eq("id", orderId);
    }
  } catch (e) { console.error("print_failed flag update error:", e); }

  if (!anyPrinted && results.every((r) => r.skipped)) {
    return { skipped: true, reason: "nothing to print", results };
  }
  return { printed: anyPrinted, failed: anyHardFailed, results };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  // CORS preflight — browsers send OPTIONS first for cross-origin calls (e.g. the
  // tablet's reprint button). Must return the CORS headers or the browser blocks it.
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  // The automatic webhook (menu_orders INSERT) must carry the print secret.
  // The manual reprint (print-order) and the recovery sweep (sweep-unprinted)
  // are low-risk operational actions — they only re-push orders that already
  // exist and were meant to print — so they don't require the master secret.
  // We never ship that secret to the tablet or the cron scheduler.
  const secret = Deno.env.get("PRINT_WEBHOOK_SECRET");
  const noSecretActions = new Set(["print-order", "sweep-unprinted", "printer-health"]);
  const isOpen = noSecretActions.has(String(body.action));
  if (!isOpen) {
    if (!secret || req.headers.get("x-print-secret") !== secret) {
      return json({ error: "unauthorized" }, 401);
    }
  }

  try {
    // Database webhook: fires on menu_orders INSERT
    if (body.type === "INSERT" && body.record) {
      // HOLD orders (created for pay-first flow) must NOT print or hit the
      // kitchen until payment completes and they're released to "placed".
      // The release path re-triggers printing explicitly.
      if ((body.record as Record<string, unknown>).status === "hold") {
        return json({ ok: true, skipped: "order on hold — not printing until paid" });
      }
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

      // HEARTBEAT: ping every active printer's Sunmi online status and record it
      // (online + last_online_at) so the POS/KDS can show a live green/red dot and
      // staff spot a downed printer BEFORE an order fails. Meant to run every
      // minute via cron; open action (no secret) like the sweep.
      case "printer-health": {
        const { data: printers } = await supabase
          .from("printers").select("id, sn, active").eq("active", true);
        const nowIso = new Date().toISOString();
        const out = [];
        for (const p of printers || []) {
          let online: boolean | null = null;
          try {
            const r = await sunmi.onlineStatus(String((p as any).sn));
            const d: any = (r as any)?.data ?? r;
            const v = d?.is_online ?? d?.online ?? d?.status;
            online = (v === 1 || v === true || v === "online") ? true
                   : (v === 0 || v === false || v === "offline") ? false : null;
          } catch { online = null; }
          const patch: Record<string, unknown> = { online };
          if (online === true) patch.last_online_at = nowIso;
          try { await supabase.from("printers").update(patch).eq("id", (p as any).id); } catch { /* best effort */ }
          out.push({ sn: (p as any).sn, online });
        }
        return json({ ok: true, checked: out.length, printers: out });
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

      // SAFETY NET: re-push any recent order that never got confirmed printed.
      // Sunmi's own cloud queue recovers orders that reached it (paper/power/
      // network). This catches the earlier gap — orders whose print webhook never
      // fired or whose push failed — so nothing is silently lost. Meant to run on
      // a schedule (e.g. every 2-3 min via Supabase cron) but can be called ad hoc.
      case "sweep-unprinted": {
        const sinceMin = Number(body.since_minutes) || 180; // default: last 3h
        const sinceIso = new Date(Date.now() - sinceMin * 60000).toISOString();
        // Candidate orders: created recently, not archived, not on hold/cancelled.
        const { data: orders, error } = await supabase
          .from("menu_orders")
          .select("*")
          .gte("created_at", sinceIso)
          .is("closed_at", null)
          .order("created_at", { ascending: true });
        if (error) throw error;
        const candidates = (orders || []).filter((o: any) => o.status !== "hold" && o.status !== "cancelled");
        const ids = candidates.map((o: any) => o.id);

        // For each order, the highest round (batch) it currently has.
        const orderMaxBatch = new Map<string, number>();
        if (ids.length) {
          const { data: its } = await supabase
            .from("menu_order_items").select("order_id, added_batch").in("order_id", ids);
          for (const it of its || []) {
            const b = (it as any).added_batch ?? 0;
            const cur = orderMaxBatch.get((it as any).order_id);
            if (cur === undefined || b > cur) orderMaxBatch.set((it as any).order_id, b);
          }
        }

        // Which active printers should have each order? (all of them, since both
        // print the full order). We need per-(order,printer) confirmation.
        const { data: activePrinters } = await supabase
          .from("printers").select("sn").eq("active", true);
        const printerSns = (activePrinters || []).map((p: any) => String(p.sn));

        // Highest confirmed round per (order, printer).
        const confirmed = new Map<string, number>(); // key: order_id + "|" + sn
        if (ids.length) {
          const { data: jobs } = await supabase
            .from("print_jobs").select("order_id, printer_sn, max_batch")
            .eq("status", "sent").in("order_id", ids);
          for (const j of jobs || []) {
            const key = (j as any).order_id + "|" + (j as any).printer_sn;
            const mb = typeof (j as any).max_batch === "number" ? (j as any).max_batch : 0;
            const cur = confirmed.get(key);
            if (cur === undefined || mb > cur) confirmed.set(key, mb);
          }
        }

        // An order needs a re-push if ANY active printer is missing, or is behind
        // the order's latest round. printOrder() then sends each printer only the
        // rounds it lacks (per-printer independence), so this is safe + targeted.
        const missing = candidates.filter((o: any) => {
          const need = orderMaxBatch.get(o.id) ?? 0;
          return printerSns.some((sn) => (confirmed.get(o.id + "|" + sn) ?? -1) < need);
        });

        const results = [];
        for (const o of missing) {
          try {
            const r = await printOrder(o, false);
            results.push({ order_id: o.id, order_no: o.order_no, repushed: true, printed: (r as any).printed ?? false });
          } catch (e) {
            results.push({ order_id: o.id, order_no: o.order_no, repushed: false, error: String(e) });
          }
        }
        return json({ ok: true, checked: candidates.length, repushed: results.length, results });
      }

      case "print-summary": {
        // store (or all printers if we can't resolve one).
        const s = body.summary || {};
        const storeName = String(body.store_name || "");
        const when = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
        const money = (n: number) => "GBP " + (Number(n) || 0).toFixed(2);
        const W = 48;
        const r = new Receipt();
        r.align(1).size(1, 1).bold(true).line("END OF DAY").bold(false).size(0, 0);
        if (storeName) r.line(storeName);
        r.line("Z-REPORT").feed(1);
        r.align(0).line(when).divider("-").feed(1);
        r.size(0, 1).leftRight("TOTAL TAKEN", money(s.total), W).size(0, 0);
        r.divider("-");
        r.leftRight("Cash", money(s.cash), W);
        r.leftRight("Card", money(s.card), W);
        r.leftRight("Paid orders", String(s.paid_count ?? 0), W);
        if ((s.discount_total ?? 0) > 0) r.leftRight("Discounts given", money(s.discount_total), W);
        r.divider("-");
        if ((s.unpaid_count ?? 0) > 0) {
          r.bold(true).leftRight("UNPAID (" + s.unpaid_count + ")", money(s.unpaid_total), W).bold(false);
          r.divider("-");
        }
        r.leftRight("Orders archived", String(s.order_count ?? s.paid_count ?? 0), W);
        r.feed(1).align(1).line("Day closed").feed(2).cut();
        const hex = r.toHex();
        // Print to all kitchen printers (day-close is a store-level report).
        const { data: printers } = await supabase.from("printers").select("sn, station");
        const targets = (printers || []).filter((p: any) => (p.station || "kitchen") === "kitchen");
        const results = [];
        for (const pr of (targets.length ? targets : (printers || []))) {
          const res = await sunmi.pushContent(String(pr.sn), "zrep" + Date.now() + String(pr.sn).slice(-4), hex);
          results.push({ sn: pr.sn, ok: ok(res) });
        }
        return json({ ok: true, printed: results });
      }
      // Generic message chit — used for VOID notices to the kitchen and any
      // short staff message. body: { title, lines[], location_id? }
      case "print-message": {
        const title = String(body.title || "NOTICE").slice(0, 40);
        const msgLines: string[] = Array.isArray(body.lines) ? body.lines.map((l: unknown) => String(l).slice(0, 46)) : [];
        const when = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
        const r = new Receipt();
        r.align(1).size(1, 1).bold(true).line(title).bold(false).size(0, 0).feed(1);
        r.align(0);
        for (const l of msgLines) r.line(l);
        r.feed(1).align(1).line(when).feed(2).cut();
        const hex = r.toHex();
        // Target kitchen printers (optionally scoped to a location's printers).
        let q = supabase.from("printers").select("sn, station, location_id");
        const { data: printers } = await q;
        let targets = (printers || []).filter((p: any) => (p.station || "kitchen") === "kitchen");
        if (body.location_id) {
          const scoped = targets.filter((p: any) => !p.location_id || p.location_id === body.location_id);
          if (scoped.length) targets = scoped;
        }
        const results = [];
        for (const pr of (targets.length ? targets : (printers || []))) {
          const res = await sunmi.pushContent(String(pr.sn), "msg" + Date.now() + String(pr.sn).slice(-4), hex);
          results.push({ sn: pr.sn, ok: ok(res) });
        }
        return json({ ok: true, printed: results });
      }
      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
