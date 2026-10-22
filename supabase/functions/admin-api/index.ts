// ============================================================
// admin-api — PIN-gated menu admin write API.
// The browser never holds the service-role key. It sends a PIN
// + an action; this function verifies the PIN and performs the
// write with the service role. One function, several actions.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// What a regional login (region_pins) may reach, as id sets.
type Fence = {
  brands: Set<string>; primaryBrand: string; timezone: string | null;
  locs: Set<string>; menus: Set<string>; cats: Set<string>; items: Set<string>;
  groups: Set<string>; options: Set<string>; bands: Set<string>; bandByName: Map<string, string>;
  printerIds: Set<string>; printerSns: Set<string>;
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const ADMIN_PIN = Deno.env.get("ADMIN_PIN");
  if (!ADMIN_PIN) return json({ error: "admin pin not configured" }, 500);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const { pin, action, data, pos } = payload || {};
  // Till/POS operations don't require the admin PIN — the POS is an operational
  // surface used by front-line staff, and gating every payment behind a PIN was
  // too much friction. Admin-panel actions still require the PIN below.
  const POS_ACTIONS = new Set([
    "mark_paid", "take_payment", "mark_unpaid", "order_payments_list", "apply_discount", "remove_discount", "apply_item_discount", "remove_item_discount", "refund_payment", "print_refund_receipt", "set_order_table", "staff_set_stock",
    "remove_order_item", "set_order_item_qty", "void_fired_item",
    "set_order_type",
    "day_summary",
    "merges_list", "merge_save", "merge_delete",
    "sweep_unprinted", "retry_print", "clear_print_flag", "clear_print_flags", "clear_print_queue",
    "local_print_jobs", "local_print_done", "print_events", "usb_printer_register", "usb_printer_release", "usb_printer_test", "device_printer_register", "kiosk_slip",
    "set_kds_target", "print_kitchen_summary",
    "kds_screen_self", "menu_catalog", "printers_list",
    "service_log_add", "service_log_delete", "mark_served",
    "device_activate", "device_heartbeat", "device_claim_legacy", "manager_pin_check",
    "open_drawer", "void_order", "abandon_hold",
  ]);
  const isPosCall = pos === true && POS_ACTIONS.has(action);
  // Device enforcement: when the caller sends a device token it must be active,
  // and a kitchen-only licence cannot do till actions. (Calls without a token
  // still work during rollout; the admin shows which devices never activated.)
  const deviceTok = (payload && (payload as any).device) || null;
  let callerDevice: any = null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Staff PIN (ops_team) ─────────────────────────────────────────────────
  // The employee app signs people in with a personal PIN on their ops_team
  // record. The POS uses the same PIN so any team member can close the till
  // and the closure is recorded against them. Scoped to their own store.
  async function staffForPin(pinIn: unknown, location_id: string | null) {
    const pinStr = String(pinIn || "").trim();
    if (pinStr.length < 4 || !location_id) return null;
    const { data: locRow } = await admin.from("menu_locations").select("store_id, name").eq("id", location_id).maybeSingle();
    const storeId = locRow?.store_id || null;
    const { data: rows } = await admin.from("ops_team").select("*").eq("pin", pinStr).limit(5);
    const active = (rows || []).filter((m: any) => !m.archived_at && !["left", "archived", "inactive", "terminated"].includes(String(m.status || "").toLowerCase()));
    if (!active.length) return null;
    const inStore = storeId ? active.filter((m: any) => Array.isArray(m.store_ids) ? m.store_ids.includes(storeId) : String(m.store_ids || "").includes(storeId)) : [];
    const m = inStore[0] || null;
    if (!m) return { ok: false, reason: "not_this_store" };
    const name = m.name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.full_name || m.email || "Team member";
    return { ok: true, id: m.id, name: String(name).trim(), role: m.role || null };
  }
  // Manager authority for sensitive till actions (refunds, big discounts): the master PIN,
  // the store's manager PIN (store_pins), or a team member whose role says manager/supervisor.
  async function managerForPin(pinIn: unknown, location_id: string | null): Promise<{ ok: boolean; name?: string; reason?: string }> {
    const pinStr = String(pinIn || "").trim();
    if (pinStr.length < 4) return { ok: false, reason: "pin_required" };
    if (pinStr === String(ADMIN_PIN)) return { ok: true, name: "Master" };
    if (location_id) {
      const { data: sp } = await admin.from("store_pins").select("location_id").eq("pin", pinStr).eq("active", true).maybeSingle();
      if (sp && sp.location_id === location_id) return { ok: true, name: "Store manager" };
    }
    if (location_id && await regionCoversLocation(pinStr, location_id)) return { ok: true, name: "Regional manager" };
    const r = await staffForPin(pinStr, location_id);
    if (r && r.ok && /manager|supervisor|owner|director|head/i.test(String(r.role || ""))) return { ok: true, name: r.name };
    return { ok: false, reason: r && r.ok ? "not_manager" : "unknown" };
  }

  // ── Regional PIN (region_pins) ──────────────────────────────────────────
  // A regional login is a master login fenced to a set of brands. For the UAE
  // that is the Chocoberry UAE brand, which owns both UAE stores, their menus,
  // modifier groups and bands. Nothing on a UK brand is reachable from it.
  async function regionForPin(pinIn: unknown): Promise<{ brand_ids: string[]; label: string | null } | null> {
    const pinStr = String(pinIn || "").trim();
    if (pinStr.length < 4) return null;
    const { data: rp, error } = await admin.from("region_pins")
      .select("brand_ids, label").eq("pin", pinStr).eq("active", true).maybeSingle();
    if (error || !rp) return null; // table missing or no match → not a regional PIN
    const ids = (Array.isArray(rp.brand_ids) ? rp.brand_ids : []).map(String).filter(Boolean);
    return ids.length ? { brand_ids: ids, label: rp.label || null } : null;
  }
  async function regionCoversLocation(pinStr: string, location_id: string) {
    const rp = await regionForPin(pinStr);
    if (!rp) return false;
    const { data: l } = await admin.from("menu_locations").select("brand_id").eq("id", location_id).maybeSingle();
    return !!(l?.brand_id && rp.brand_ids.includes(String(l.brand_id)));
  }

  // Everything a regional login may touch, as id sets. Built strictly from
  // brand_id — a row with no brand belongs to the default (UK) brand, so it is
  // outside every fence.
  async function allRows(table: string, cols: string) {
    const out: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: rows, error } = await admin.from(table).select(cols).range(from, from + 999);
      if (error) throw error;
      out.push(...(rows || []));
      if (!rows || rows.length < 1000) break;
    }
    return out;
  }
  async function loadFence(brandIds: string[]): Promise<Fence> {
    const [locs, menus, groups, bands, cats, items, options, printers] = await Promise.all([
      admin.from("menu_locations").select("id, timezone").in("brand_id", brandIds),
      admin.from("menu_menus").select("id").in("brand_id", brandIds),
      admin.from("menu_modifier_groups").select("id").in("brand_id", brandIds),
      admin.from("menu_price_bands").select("id, name").in("brand_id", brandIds),
      allRows("menu_categories", "id, menu_id, brand_id"),
      allRows("menu_items", "id, category_id"),
      allRows("menu_modifiers", "id, group_id"),
      allRows("printers", "id, sn, location_id"),
    ]);
    const s = (rows: any[] | null | undefined) => new Set((rows || []).map((r: any) => String(r.id)));
    const F: Fence = {
      brands: new Set(brandIds),
      primaryBrand: brandIds[0],
      timezone: ((locs.data || []).find((l: any) => l.timezone) as any)?.timezone || null,
      locs: s(locs.data), menus: s(menus.data), groups: s(groups.data), bands: s(bands.data),
      bandByName: new Map((bands.data || []).map((b: any) => [String(b.name).toLowerCase(), String(b.id)])),
      cats: new Set(), items: new Set(), options: new Set(), printerIds: new Set(), printerSns: new Set(),
    };
    for (const c of cats) if ((c.menu_id && F.menus.has(String(c.menu_id))) || (!c.menu_id && c.brand_id && F.brands.has(String(c.brand_id)))) F.cats.add(String(c.id));
    for (const i of items) if (F.cats.has(String(i.category_id))) F.items.add(String(i.id));
    for (const o of options) if (F.groups.has(String(o.group_id))) F.options.add(String(o.id));
    for (const p of printers) if (p.location_id && F.locs.has(String(p.location_id))) { F.printerIds.add(String(p.id)); F.printerSns.add(String(p.sn)); }
    return F;
  }

  // Returns a refusal message, or null when the call stays inside the fence.
  // Anything not listed here is refused: a new admin action is closed to the
  // regional login until someone decides it belongs there.
  async function regionGuard(act: string, d: any, F: Fence, isPosAction: boolean): Promise<string | null> {
    d = d || {};
    const OUT = "forbidden: outside your region";
    const has = (set: Set<string>, id: unknown) => id !== null && id !== undefined && id !== "" && set.has(String(id));
    const opt = (set: Set<string>, id: unknown) => id === null || id === undefined || id === "" || set.has(String(id));
    const all = (set: Set<string>, ids: unknown) => Array.isArray(ids) && ids.every((x) => has(set, x));
    const allOrEmpty = (set: Set<string>, ids: unknown) => ids == null || (Array.isArray(ids) && ids.every((x) => has(set, x)));
    const forceBrand = () => { if (!has(F.brands, d.brand_id)) d.brand_id = F.primaryBrand; };
    const tableLoc = async (id: unknown) => {
      const { data: row } = await admin.from("menu_tables").select("location_id").eq("id", String(id || "")).maybeSingle();
      return has(F.locs, row?.location_id);
    };
    const ok = (cond: boolean) => (cond ? null : OUT);
    switch (act) {
      // Reads — filtered to the fence inside each handler.
      case "load": case "printer_list": case "store_pin_list": case "merges_list":
        return null;

      // Master menu (the brand's own items, sections, menus)
      case "update_item": return ok(has(F.items, d.id) && (!d.fields || !("category_id" in d.fields) || has(F.cats, d.fields.category_id)));
      case "create_item": return ok(has(F.cats, d.category_id));
      case "delete_item": return ok(has(F.items, d.id));
      case "create_category":
        if (d.menu_id) return ok(has(F.menus, d.menu_id));
        forceBrand(); return null;
      case "update_category": case "delete_category": return ok(has(F.cats, d.id));
      case "create_menu": forceBrand(); return null;
      case "update_menu": case "delete_menu": return ok(has(F.menus, d.id));
      case "reorder": {
        const set = d.table === "menu_menus" ? F.menus : d.table === "menu_categories" ? F.cats : d.table === "menu_items" ? F.items : null;
        return ok(!!set && all(set, d.ids));
      }

      // Modifiers
      case "create_mod_group": forceBrand(); return null;
      case "update_mod_group": case "delete_mod_group": return ok(has(F.groups, d.id));
      case "create_mod_option": return ok(has(F.groups, d.group_id));
      case "update_mod_option": case "delete_mod_option": return ok(has(F.options, d.id));
      case "set_item_mod_groups": return ok(has(F.items, d.item_id) && allOrEmpty(F.groups, d.group_ids));

      // Per-store prices and availability
      case "set_override": case "set_item_86": return ok(has(F.locs, d.location_id) && has(F.items, d.item_id));
      case "set_mod_override": return ok(has(F.locs, d.location_id) && has(F.options, d.option_id));
      case "bulk_set_availability": return ok(all(F.locs, d.location_ids) && all(F.items, d.item_ids));
      case "bulk_set_prices": return ok(all(d.scope === "band" ? F.bands : F.locs, d.target_ids) && all(F.items, d.item_ids));

      // Bands
      case "create_band": {
        const src = String(d.copy_from || "").toLowerCase();
        return ok(!!src && F.bandByName.has(src));
      }
      case "band_create": forceBrand(); return null;
      case "update_band": case "delete_band": return ok(has(F.bands, d.id));
      case "set_band_price": case "set_band_item": return ok(has(F.bands, d.band_id) && has(F.items, d.item_id));
      case "set_band_option_price": return ok(has(F.bands, d.band_id) && has(F.options, d.option_id));
      case "set_band_menu": return ok(has(F.bands, d.band_id) && has(F.menus, d.menu_id));
      case "set_store_band": case "set_menu_band": return ok(has(F.locs, d.location_id) && opt(F.bands, d.band_id));

      // Stores
      case "create_store": forceBrand(); return null;
      case "update_store": {
        const src = (d.fields && typeof d.fields === "object") ? d.fields : d;
        return ok(has(F.locs, d.id) && (!("brand_id" in src) || has(F.brands, src.brand_id)));
      }
      case "delete_store": return ok(has(F.locs, d.id));
      case "store_pin_set": case "store_pin_delete": case "set_store_menus":
        if (act === "set_store_menus" && !allOrEmpty(F.menus, d.menu_ids)) return OUT;
        return ok(has(F.locs, d.location_id));
      case "set_setting": {
        // Only per-store keys ("<name>:<location id>") for their own stores.
        // Plain keys (theme, hero_slides, ordering_enabled…) are chain-wide.
        const m = /:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(String(d.key || ""));
        return m && F.locs.has(m[1]) ? null : "forbidden: regional logins can only change their own stores' settings";
      }

      // Printers
      case "printer_add": return ok(has(F.locs, d.location_id));
      case "printer_update": return ok(has(F.printerIds, d.id) && (!d.fields || !("location_id" in d.fields) || has(F.locs, d.fields.location_id)));
      case "printer_remove": return ok(has(F.printerIds, d.id));
      case "printer_test": case "printer_status": return ok(has(F.printerSns, d.sn));
      case "set_printer_categories": return ok(has(F.printerSns, d.printer_sn) && allOrEmpty(F.cats, d.category_ids));
      case "set_printer_item": return ok(has(F.printerSns, d.printer_sn) && has(F.items, d.item_id));

      // Screens, devices, tables, till
      case "set_kds_printer": case "kds_screen_add": case "kds_screen_remove": case "set_accepting_orders":
      case "device_create": case "device_revoke": case "device_replace": case "device_set_kind": case "device_reload": case "device_events":
      case "create_token": case "create_table": case "close_day":
        return ok(has(F.locs, d.location_id));
      case "release_token": case "delete_token": case "update_table": case "delete_table":
        return ok(await tableLoc(d.id));
      case "reprint_closure": return null; // checked in the handler against the closure's store

      // POS category merges
      case "merge_save": {
        if (!opt(F.menus, d.menu_id) || !all(F.cats, d.category_ids)) return OUT;
        if (d.id) {
          const { data: row } = await admin.from("pos_category_merges").select("category_ids").eq("id", d.id).maybeSingle();
          if (!row || !all(F.cats, row.category_ids)) return OUT;
        }
        return null;
      }
      case "merge_delete": {
        const { data: row } = await admin.from("pos_category_merges").select("category_ids").eq("id", d.id).maybeSingle();
        return ok(!!row && all(F.cats, row.category_ids));
      }
    }
    // Till/KDS actions sent without the pos flag: allowed only at their stores.
    if (isPosAction) return ok(!("location_id" in d) || has(F.locs, d.location_id));
    return "forbidden for a regional login";
  }
  if (action === "staff_lookup") {
    const r = await staffForPin(data?.pin, data?.location_id);
    if (!r) return json({ ok: false, reason: "unknown" });
    return json(r.ok ? { ok: true, name: r.name } : { ok: false, reason: r.reason });
  }
  let staffCloser: { id: string; name: string } | null = null;
  if (action === "close_day" && data?.staff_pin && !(pin && pin === ADMIN_PIN)) {
    const r = await staffForPin(data.staff_pin, data.location_id);
    if (r && r.ok) staffCloser = { id: r.id, name: r.name };
  }

  // ── Resolve the PIN to a SCOPE ──────────────────────────────────────────
  //   master  → the env ADMIN_PIN; can see and change everything.
  //   store   → a row in store_pins; can ONLY touch its own location_id.
  // Isolation is enforced here on the server so a store manager can never
  // reach another store's data, regardless of what the browser sends.
  //   region  → a row in region_pins; full admin, but ONLY over the brands it
  //             names (e.g. Chocoberry UAE) — their stores, menus, modifiers,
  //             bands, printers, devices and per-store settings. Never the UK.
  let scope: "master" | "store" | "region" | null = null;
  let scopeLocationId: string | null = null;
  let scopeLabel: string | null = null;
  let fence: Fence | null = null;
  if (pin && pin === ADMIN_PIN) {
    scope = "master";
  } else if (pin) {
    const { data: sp } = await admin.from("store_pins")
      .select("location_id, active").eq("pin", pin).eq("active", true).maybeSingle();
    if (sp?.location_id) { scope = "store"; scopeLocationId = sp.location_id as string; }
    if (!scope) {
      const rp = await regionForPin(pin);
      if (rp) {
        try { fence = await loadFence(rp.brand_ids); }
        catch (e) { return json({ error: "could not load region: " + String((e as any)?.message ?? e) }, 500); }
        scope = "region"; scopeLabel = rp.label;
      }
    }
  }
  if (staffCloser) { scope = "store"; scopeLocationId = data.location_id; fence = null; }
  if (!isPosCall && !scope) return json({ error: "unauthorized" }, 401);

  // For a region scope: every id the call touches must sit inside the fence.
  if (scope === "region" && fence && !isPosCall) {
    const refusal = await regionGuard(action, data, fence, POS_ACTIONS.has(action));
    if (refusal) return json({ error: refusal }, 403);
  }

  // Actions a store-scoped manager is allowed to use (their own store only).
  // Anything not in this set is master-only (e.g. editing the shared master
  // menu, creating/deleting stores, price bands).
  const STORE_ALLOWED = new Set([
    "load",
    "set_override",        // per-store price/availability override
    "set_mod_override",    // per-store modifier override
    "set_accepting_orders",// pause/resume ordering at their own store
    "set_kds_printer",     // point one of their KDS screens at a printer
    "set_item_86",         // mark one of their items off for today
    "bulk_set_availability",// bulk carry / stop / 86 — forced to their store
    "create_token", "delete_token", "release_token",
    "create_table", "update_table", "delete_table",
    "set_store_menus",
    "close_day",           // close their own till (location is forced to their store)
    "reprint_closure",
  ]);

  // For a store scope: block master-only actions, and force every location_id
  // in the payload to the manager's own store.
  if (scope === "store") {
    if (!STORE_ALLOWED.has(action)) return json({ error: "forbidden for this store login" }, 403);
    // Any location_id supplied by a store manager MUST equal their store.
    const suppliedLoc = data?.location_id;
    if (suppliedLoc && suppliedLoc !== scopeLocationId) {
      return json({ error: "forbidden: cannot act on another store" }, 403);
    }
    // For actions that reference a token/table by id, verify it belongs to
    // this store before allowing the write.
    const idToCheck = data?.id;
    if (idToCheck && ["delete_token", "release_token", "update_table", "delete_table"].includes(action)) {
      const { data: row } = await admin.from("menu_tables").select("location_id").eq("id", idToCheck).maybeSingle();
      if (!row || row.location_id !== scopeLocationId) {
        return json({ error: "forbidden: item belongs to another store" }, 403);
      }
    }
  }

  // Call the sunmi-print function server-side, so the print secret
  // (PRINT_WEBHOOK_SECRET) never reaches the browser.
  const callSunmi = async (payload: Record<string, unknown>) => {
    const res = await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/sunmi-print", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-print-secret": Deno.env.get("PRINT_WEBHOOK_SECRET") ?? "",
      },
      body: JSON.stringify(payload),
    });
    let body: any = null;
    try { body = await res.json(); } catch { /* non-json */ }
    return { ok: res.ok, status: res.status, body };
  };

  try {

  // ---- TILL totals over the currently-open (not yet closed) orders ----
  // Tenders come from order_payments so split bills, part-payments and the
  // Teya card machine all count correctly; an order is "unpaid" by its balance.
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  // Re-add the line discounts after one of them changes and push the order's
  // total back in step. subtotal stays at full menu price throughout — it is
  // what the day summary reports as gross — so the discount lives in
  // items_discount_total and comes off total, alongside any app discount.
  // The order-level till discount is NOT folded in here: it is taken off
  // total later, at payment, exactly as before.
  async function recalcItemDiscounts(order_id: string, ord: { subtotal?: unknown; total?: unknown; app_discount?: unknown }) {
    const { data: lines } = await admin.from("menu_order_items").select("line_total, discount_amount").eq("order_id", order_id);
    const rows: any[] = (lines as any[]) || [];
    const itemsDisc = round2(rows.reduce((s: number, r: any) => s + Number(r.discount_amount || 0), 0));
    // Trust the lines over a stored subtotal: an older order may predate the
    // column, and a voided line rewrites both together.
    const gross = round2(rows.reduce((s: number, r: any) => s + Number(r.line_total || 0), 0));
    const app = round2(Number((ord as any)?.app_discount || 0));
    const total = Math.max(0, round2(gross - app - itemsDisc));
    await admin.from("menu_orders").update({ subtotal: gross, items_discount_total: itemsDisc, total }).eq("id", order_id);
    return { itemsDisc, total, gross };
  }
  // Trading day ends at 04:00 Europe/London. Returns the most recent 04:00 as
  // an ISO instant (today's if it's past 4am, otherwise yesterday's).
  const TRADING_DAY_END_HOUR = 4;
  function tzOffsetMinutes(ms: number, tz: string) {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const p: Record<string, number> = {};
    for (const x of f.formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms) / 60000;
  }
  // 04:00 in the STORE's own zone. Hard-wiring London rolls a Dubai store's
  // trading day at 08:00 local — in the middle of its opening hours — so the
  // morning's orders would land either side of the boundary and the closing
  // report would be wrong in a way nobody could see. A null or empty zone
  // means London, so every UK store behaves exactly as before.
  function tradingDayCutoff(tz?: string | null): string {
    const zone = String(tz || "").trim() || "Europe/London";
    const now = Date.now();
    const off = tzOffsetMinutes(now, zone);
    const local = new Date(now + off * 60000); // store wall clock, expressed in UTC fields
    let y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
    if (local.getUTCHours() < TRADING_DAY_END_HOUR) { const prev = new Date(Date.UTC(y, m, d - 1)); y = prev.getUTCFullYear(); m = prev.getUTCMonth(); d = prev.getUTCDate(); }
    const wall = Date.UTC(y, m, d, TRADING_DAY_END_HOUR);
    return new Date(wall - tzOffsetMinutes(wall, zone) * 60000).toISOString();
  }
  // ---- Device licences ----
  async function sha256(s: string) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join(""); }
  const randCode = (n: number) => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const r = crypto.getRandomValues(new Uint8Array(n)); return Array.from(r).map((x) => A[x % A.length]).join(""); };
  const randSecret = () => { const r = crypto.getRandomValues(new Uint8Array(24)); return Array.from(r).map((x) => x.toString(16).padStart(2, "0")).join(""); };
  async function storeCode(location_id: string) { const { data: l } = await admin.from("menu_locations").select("name").eq("id", location_id).maybeSingle(); const n = String(l?.name || "ST").replace(/[^A-Za-z]/g, "").toUpperCase(); return (n.slice(0, 2) || "ST"); }
  // Verify a device token {key, secret} against the row; returns the row or null.
  async function verifyDevice(location_id: string, key: string, secret: string) {
    if (!location_id || !key || !secret) return null;
    const { data: d } = await admin.from("kds_screens").select("screen_key, kind, status, device_secret_hash, label").eq("location_id", location_id).eq("screen_key", String(key)).maybeSingle();
    if (!d || d.status !== "active" || !d.device_secret_hash) return null;
    if ((await sha256(secret)) !== d.device_secret_hash) return null;
    return d;
  }
  // Till-only actions. Screen setup (kds_screen_self), targets and kitchen prints are KDS actions and stay allowed for kitchen licences.
  const POS_ONLY = new Set(["abandon_hold", "mark_paid", "mark_unpaid", "close_day", "day_summary", "retry_print", "clear_print_flag", "clear_print_flags", "service_log_delete", "clear_print_queue"]);
  // Kitchen speed for the closing report, same definition as the KDS Performance tab:
  // completion = latest bump within 30 min of the first bump (later bumps are housekeeping).
  async function kitchenStats(location_id: string, from: string, to: string, targetMin: number) {
    try {
      const { data } = await admin.rpc("kds_ticket_times", { p_location: location_id, p_from: from, p_to: to });
      const rows: any[] = Array.isArray(data) ? data : [];
      const times: number[] = [];
      for (const o of rows) {
        // Segment: original ticket + one per addition (items_added_log), each timed from its own start.
        const starts: number[] = [new Date(o.created_at).getTime(), ...((o.items_added_log || []).map((x: string) => new Date(x).getTime()).filter((t: number) => isFinite(t)).sort((a: number, b: number) => a - b))];
        const all = (o.bumps || []).map((b: any) => new Date(b.bumped_at).getTime()).filter((t: number) => isFinite(t)).sort((a: number, b: number) => a - b);
        starts.forEach((st, i) => {
          const end = i + 1 < starts.length ? starts[i + 1] : Infinity;
          const bs = all.filter((t) => t >= st && t < end);
          let doneAt: number | null = null;
          if (bs.length) { const first = bs[0]; doneAt = first; for (const t of bs) if (t - first <= 30 * 60000) doneAt = t; }
          else if (starts.length === 1 && o.completed_at) doneAt = new Date(o.completed_at).getTime();
          if (doneAt != null) times.push((doneAt - st) / 1000);
        });
      }
      if (!times.length) return null;
      const sorted = [...times].sort((a, b) => a - b);
      const q = (x: number) => sorted[Math.min(sorted.length - 1, Math.floor(x * (sorted.length - 1)))];
      const T = targetMin * 60;
      return { tickets: times.length, avg_secs: Math.round(times.reduce((a, b) => a + b, 0) / times.length), median_secs: Math.round(q(0.5)), p90_secs: Math.round(q(0.9)), on_time_pct: Math.round(times.filter((x) => x <= T).length / times.length * 100), target_min: targetMin, over_hour: times.filter((x) => x > 3600).length };
    } catch { return null; }
  }
  // mode "trading_day": only orders created before the last 04:00; "all": every open order.
  async function dayTotals(location_id: string, mode: "trading_day" | "all" = "all") {
    const { data: locRow } = await admin.from("menu_locations").select("timezone").eq("id", location_id).maybeSingle();
    const cutoff = tradingDayCutoff((locRow as any)?.timezone);
    const { data: allRows, error } = await admin
      .from("menu_orders")
      .select("id, order_no, order_type, tablet_no, external_channel, total, subtotal, items_discount_total, amount_paid, paid_amount, app_discount, discount_amount, discount_type, status, created_at, kds_bumped_at, customer_note")
      .eq("location_id", location_id)
      .is("closed_at", null);
    if (error) throw error;
    const laterRows = (allRows || []).filter((o: any) => o.created_at >= cutoff);
    const orders = mode === "trading_day" ? (allRows || []).filter((o: any) => o.created_at < cutoff) : (allRows || []);
    const live = orders.filter((o: any) => o.status !== "cancelled");
    const ids = live.map((o: any) => o.id);

    // ---- tenders from order_payments ----
    // refundTotal/refundCount are tallied in the loop below but used to be
    // declared after it, so the first refund of the day threw "Cannot access
    // 'refundTotal' before initialization" and the whole closing report
    // failed — on exactly the days a manager most wants to see it.
    let refundTotal = 0, refundCount = 0;
    const byMethod: Record<string, { amount: number; count: number }> = { cash: { amount: 0, count: 0 }, card: { amount: 0, count: 0 }, other: { amount: 0, count: 0 } };
    const paidByOrder: Record<string, number> = {};
    // 500 ids at ~37 chars each is an 18KB `in` list in a GET URL, which the
    // server rejects — and only `data` was destructured, so the error was
    // dropped and the report simply said £0.00 taken. It worked on a 174-order
    // trading day and failed on a 388-order one, which is the worst possible
    // way for a closing report to be wrong. Chunk small, and never swallow it.
    for (let i = 0; i < ids.length; i += 100) {
      const { data: pays, error: payErr } = await admin.from("order_payments").select("order_id, method, amount, kind").in("order_id", ids.slice(i, i + 100));
      if (payErr) throw payErr;
      for (const p of pays || []) {
        const m = p.method === "cash" || p.method === "card" ? p.method : "other";
        if ((p as any).kind === "refund" || Number(p.amount || 0) < 0) { const a = Math.abs(Number(p.amount || 0)); refundTotal += a; refundCount++; byMethod[m].amount -= a; continue; }
        byMethod[m].amount += Number(p.amount || 0); byMethod[m].count++;
        paidByOrder[p.order_id] = (paidByOrder[p.order_id] || 0) + Number(p.amount || 0);
      }
    }
    // ---- items: top sellers + category mix ----
    const itemAgg: Record<string, { name: string; qty: number; sales: number }> = {};
    let itemsSold = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const { data: lines, error: lineErr } = await admin.from("menu_order_items").select("order_id, name_snapshot, qty, line_total, item_status").in("order_id", ids.slice(i, i + 100));
      if (lineErr) throw lineErr;
      for (const l of lines || []) {
        if (l.item_status === "voided") continue;
        const k = String(l.name_snapshot || "").trim(); if (!k) continue;
        const a = itemAgg[k] || (itemAgg[k] = { name: k, qty: 0, sales: 0 });
        a.qty += Number(l.qty || 0); a.sales += Number(l.line_total || 0); itemsSold += Number(l.qty || 0);
      }
    }
    const topItems = Object.values(itemAgg).sort((a, b) => b.qty - a.qty || b.sales - a.sales).slice(0, 8).map((x) => ({ ...x, sales: round2(x.sales) }));

    // ---- order-level rollups ----
    let paidCount = 0, unpaidTotal = 0, unpaidCount = 0, gross = 0, discountTotal = 0, cancelledTotal = 0;
    const unpaid: any[] = [];
    const byType: Record<string, { count: number; amount: number }> = {};
    const bySource: Record<string, { count: number; amount: number }> = {};
    const byHour: Record<string, { count: number; amount: number }> = {};
    let first: string | null = null, last: string | null = null;
    // The same zone the trading-day cutoff above already uses. Hard-wiring
    // London put a Dubai store's busiest hour three hours out, and the hourly
    // bars on the closing report with it. Null or empty means London, so every
    // UK store reports exactly as before.
    const sumZone = String((locRow as any)?.timezone || "").trim() || "Europe/London";
    const hourOf = (iso: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: sumZone, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));
    for (const o of orders) if (o.status === "cancelled") cancelledTotal += Number(o.total || 0);
    for (const o of live) {
      const total = Number(o.total || 0);
      const paid = Math.max(Number(o.amount_paid || 0), paidByOrder[o.id] || 0, o.paid_amount != null ? Number(o.paid_amount) : 0);
      // Gross is the full menu price. total already has the app discount and
      // any line discounts taken off it, so counting total as gross while
      // also adding those to discountTotal subtracted them from net twice.
      gross += Number((o as any).subtotal ?? total);
      // Discounts: app membership/reward discounts, per-line discounts, and
      // till discounts (paid less than total but marked paid).
      if (o.app_discount) discountTotal += Number(o.app_discount);
      if ((o as any).items_discount_total) discountTotal += Number((o as any).items_discount_total);
      if ((o as any).discount_amount) discountTotal += Number((o as any).discount_amount);
      if (o.discount_type && o.paid_amount != null && Number(o.paid_amount) < total) discountTotal += total - Number(o.paid_amount);
      const settled = o.discount_type && !(o as any).discount_amount ? true : paid + 0.001 >= total - Number((o as any).discount_amount || 0);
      if (total > 0 && settled) paidCount++;
      else if (total > 0) { unpaidCount++; unpaidTotal += total - paid; unpaid.push({ id: o.id, order_no: o.order_no, order_type: o.order_type, due: round2(total - paid), created_at: o.created_at }); }
      const t = o.order_type || "other"; (byType[t] ||= { count: 0, amount: 0 }); byType[t].count++; byType[t].amount += total;
      const src = o.external_channel ? String(o.external_channel) : (o.tablet_no === "POS" ? "Till" : o.tablet_no === "phone" ? "Phone" : o.tablet_no === "web" ? "Web" : o.tablet_no == null ? "App" : "Tablet");
      (bySource[src] ||= { count: 0, amount: 0 }); bySource[src].count++; bySource[src].amount += total;
      const h = String(hourOf(o.created_at)).padStart(2, "0"); (byHour[h] ||= { count: 0, amount: 0 }); byHour[h].count++; byHour[h].amount += total;
      if (!first || o.created_at < first) first = o.created_at; if (!last || o.created_at > last) last = o.created_at;
    }
    const taken = byMethod.cash.amount + byMethod.card.amount + byMethod.other.amount;
    const r2 = (o: Record<string, { count: number; amount: number }>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { count: v.count, amount: round2(v.amount) }]));
    const peak = Object.entries(byHour).sort((a, b) => b[1].amount - a[1].amount)[0];

    // ---- previous closure + same weekday last week, for comparison ----
    const { data: prev } = await admin.from("till_closures").select("closed_at, total_taken, order_count, cash_variance, float_amount").eq("location_id", location_id).order("closed_at", { ascending: false }).limit(1).maybeSingle();
    const anchor = new Date((first || new Date().toISOString()));
    const lw0 = new Date(anchor.getTime() - 8 * 86400000).toISOString(), lw1 = new Date(anchor.getTime() - 6 * 86400000).toISOString();
    const { data: lwRows } = await admin.from("till_closures").select("closed_at, total_taken, order_count").eq("location_id", location_id).gte("closed_at", lw0).lte("closed_at", lw1).order("closed_at", { ascending: false }).limit(3);
    const target = anchor.getTime() - 7 * 86400000;
    const lastWeek = (lwRows || []).sort((a: any, b: any) => Math.abs(new Date(a.closed_at).getTime() - target) - Math.abs(new Date(b.closed_at).getTime() - target))[0] || null;

    return {
      ids: orders.map((o: any) => o.id),
      summary: {
        total: round2(taken), cash: round2(byMethod.cash.amount), card: round2(byMethod.card.amount), other: round2(byMethod.other.amount),
        tenders: { cash: byMethod.cash.count, card: byMethod.card.count, other: byMethod.other.count },
        gross: round2(gross), net: round2(gross - discountTotal - refundTotal), discount_total: round2(discountTotal), refund_total: round2(refundTotal), refund_count: refundCount,
        paid_count: paidCount, tender_count: byMethod.cash.count + byMethod.card.count + byMethod.other.count,
        unpaid_total: round2(unpaidTotal), unpaid_count: unpaidCount, unpaid,
        order_count: live.length, cancelled_count: orders.length - live.length, cancelled_total: round2(cancelledTotal),
        avg_ticket: live.length ? round2(gross / live.length) : 0, items_sold: itemsSold,
        by_type: r2(byType), by_source: r2(bySource), by_hour: r2(byHour),
        peak_hour: peak ? { hour: peak[0], amount: round2(peak[1].amount), count: peak[1].count } : null,
        top_items: topItems,
        first_order: first, last_order: last,
        mode, cutoff,
        later_count: laterRows.filter((o: any) => o.status !== "cancelled").length,
        before_cutoff_count: (allRows || []).filter((o: any) => o.created_at < cutoff && o.status !== "cancelled").length,
        previous: prev ? { closed_at: prev.closed_at, total: Number(prev.total_taken || 0), orders: prev.order_count, variance: prev.cash_variance, float_amount: prev.float_amount } : null,
        last_week: lastWeek ? { closed_at: lastWeek.closed_at, total: Number(lastWeek.total_taken || 0), orders: lastWeek.order_count } : null,
      },
    };
  }

    if (isPosCall && deviceTok && deviceTok.key && deviceTok.secret && deviceTok.location_id && !["device_activate", "device_claim_legacy", "device_heartbeat"].includes(action)) {
      callerDevice = await verifyDevice(deviceTok.location_id, deviceTok.key, deviceTok.secret);
      if (!callerDevice) return json({ error: "device_not_active", message: "This device's licence is not active. Ask a manager." }, 403);
      if (callerDevice.kind === "kds" && POS_ONLY.has(action)) {
        await admin.from("device_events").insert({ location_id: deviceTok.location_id, screen_key: String(deviceTok.key), event: "refused", detail: { action } });
        return json({ error: "not_allowed_for_device", message: "A kitchen-screen licence can't do till actions." }, 403);
      }
    }
    switch (action) {
      // ---- READ: everything the admin UI needs in one call ----
      case "load": {
        const [cats, items, locs, overrides, settings, menus, modGroups, modOptions, itemMods, tables, locMenus, modOverrides, bands, bandPrices, bandOptPrices, kdsScreens, printers, bandItems, bandMenus, printerCats, printerItems] = await Promise.all([
          admin.from("menu_categories").select("*").order("sort_order"),
          admin.from("menu_items").select("*").order("sort_order"),
          admin.from("menu_locations").select("id,name,slug,active,brand_id,price_band_id,menu_band_id").order("name"),
          admin.from("menu_item_overrides").select("*"),
          admin.from("menu_app_settings").select("key,value"),
          admin.from("menu_menus").select("*").order("sort_order"),
          admin.from("menu_modifier_groups").select("*"),
          admin.from("menu_modifiers").select("*").order("sort_order"),
          admin.from("menu_item_modifiers").select("*"),
          admin.from("menu_tables").select("*"),
          admin.from("menu_location_menus").select("*"),
          admin.from("menu_modifier_overrides").select("*"),
          admin.from("menu_price_bands").select("*").order("sort_order"),
          admin.from("menu_band_prices").select("*"),
          admin.from("menu_band_option_prices").select("*"),
          // NOTE: these two MUST stay last — they match the final two names in
          // the destructuring above. Inserting a query mid-array without moving
          // its name shifts every result after it (kdsScreens once received
          // band prices, priceBands received printers).
          admin.from("kds_screens").select("*"),
          admin.from("printers").select("sn,label,station,active,location_id,print_role,auto_print,copies,print_ticket,print_receipt,auto_ticket,auto_receipt"),
          // Appended AFTER printers, with their names appended in the same
          // order above — never inserted mid-array. See the note above.
          admin.from("menu_band_items").select("*"),
          admin.from("menu_band_menus").select("*"),
          admin.from("printer_categories").select("*"),
          admin.from("printer_items").select("*"),
        ]);
        for (const r of [cats, items, locs, overrides]) if (r.error) throw r.error;
        // When a store manager is logged in, filter every location-specific
        // dataset down to their store, and expose only their own location.
        // The master menu (items/categories/menus/modifiers) is still returned
        // so they can see items and set their own overrides — but those tables
        // are read-only for them (enforced by STORE_ALLOWED above).
        const only = (arr: any[] | null | undefined) =>
          scope === "store" ? (arr ?? []).filter((x: any) => x.location_id === scopeLocationId) : (arr ?? []);
        const brandsAll = (await admin.from("menu_brands").select("*").order("name")).data ?? [];
        // Regional login: hand back only what sits inside its fence, so the UK
        // menu, stores and devices never reach the browser at all.
        if (scope === "region" && fence) {
          const F = fence;
          const by = (arr: any[] | null | undefined, set: Set<string>, key: string) => (arr ?? []).filter((x: any) => set.has(String(x[key])));
          const uuidTail = /:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
          return json({
            ok: true, scope, scopeLocationId: null, scopeLabel,
            brands: brandsAll.filter((b: any) => F.brands.has(String(b.id))),
            menus: by(menus.data, F.menus, "id"),
            categories: by(cats.data, F.cats, "id"),
            items: by(items.data, F.items, "id"),
            locations: by(locs.data, F.locs, "id"),
            overrides: by(overrides.data, F.locs, "location_id"),
            // Chain-wide keys stay visible (they are the inherited defaults);
            // another store's per-store keys do not.
            settings: (settings.data ?? []).filter((s: any) => { const m = uuidTail.exec(String(s.key)); return !m || F.locs.has(m[1]); }),
            modifierGroups: by(modGroups.data, F.groups, "id"),
            modifierOptions: by(modOptions.data, F.options, "id"),
            itemModifiers: by(itemMods.data, F.items, "item_id"),
            tables: by(tables.data, F.locs, "location_id"),
            locationMenus: by(locMenus.data, F.locs, "location_id"),
            kdsScreens: by(kdsScreens.data, F.locs, "location_id"),
            bandItems: by(bandItems.data, F.bands, "band_id"),
            bandMenus: by(bandMenus.data, F.bands, "band_id"),
            printerCategories: by(printerCats.data, F.printerSns, "printer_sn"),
            printerItems: by(printerItems.data, F.printerSns, "printer_sn"),
            printers: by(printers.data, F.locs, "location_id"),
            modifierOverrides: by(modOverrides.data, F.locs, "location_id"),
            priceBands: by(bands.data, F.bands, "id"),
            bandPrices: by(bandPrices.data, F.bands, "band_id"),
            bandOptionPrices: by(bandOptPrices.data, F.bands, "band_id"),
          });
        }
        return json({
          ok: true,
          scope,
          scopeLocationId,
          categories: cats.data,
          items: items.data,
          locations: scope === "store"
            ? (locs.data ?? []).filter((l: any) => l.id === scopeLocationId)
            : locs.data,
          overrides: only(overrides.data),
          settings: settings.data ?? [],
          menus: menus.data ?? [],
          modifierGroups: modGroups.data ?? [],
          modifierOptions: modOptions.data ?? [],
          itemModifiers: itemMods.data ?? [],
          tables: only(tables.data),
          locationMenus: only(locMenus.data),
          kdsScreens: only(kdsScreens.data),
          bandItems: bandItems.data || [],
          bandMenus: bandMenus.data || [],
          printerCategories: printerCats.data || [],
          printerItems: printerItems.data || [],
          printers: only(printers.data),
          modifierOverrides: only(modOverrides.data),
          priceBands: bands.data ?? [],
          brands: brandsAll,
          bandPrices: bandPrices.data ?? [],
          bandOptionPrices: bandOptPrices.data ?? [],
        });
      }

      // ---- MASTER ITEM: update fields ----
      case "update_item": {
        const { id, fields } = data;
        if (!id) return json({ error: "no id" }, 400);
        // pos_name: optional SHORT label for POS buttons only. Receipts, the
        // customer menu and kitchen tickets always use `name`.
        const allowed = ["name", "pos_name", "description", "price", "allergens", "allergens_contains", "allergens_may", "tags", "available", "published", "sort_order", "category_id", "image_url", "station", "removables"];
        const patch: any = {};
        for (const k of allowed) if (k in fields) patch[k] = fields[k];
        const { error } = await admin.from("menu_items").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- MASTER ITEM: create ----
      case "create_item": {
        const { category_id, name, price } = data;
        if (!category_id || !name) return json({ error: "category_id and name required" }, 400);
        const { data: row, error } = await admin.from("menu_items")
          .insert({ category_id, name, price: price ?? 0, available: true, published: true })
          .select("id").single();
        if (error) throw error;
        return json({ ok: true, id: row.id });
      }

      // ---- MASTER ITEM: delete ----
      case "delete_item": {
        const { id } = data;
        if (!id) return json({ error: "no id" }, 400);
        const { error } = await admin.from("menu_items").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- CATEGORY: create ----
      case "create_category": {
        // menu_id was accepted from the UI but never written, so every new
        // section was created detached from its menu and never appeared.
        const { brand_id, menu_id, name, sort_order } = data;
        if (!name) return json({ error: "name required" }, 400);
        const { data: row, error } = await admin.from("menu_categories")
          .insert({ brand_id: brand_id ?? null, menu_id: menu_id ?? null, name, sort_order: sort_order ?? 0, active: true })
          .select("id").single();
        if (error) throw error;
        return json({ ok: true, id: row.id });
      }

      // ---- OVERRIDE: set (upsert) per-store price/availability ----
      // ---- STAFF: mark an item sold out / back on at this store (punch-in PIN) ----
      case "staff_set_stock": {
        const { item_id, location_id, available, staff_pin } = data || {};
        if (!item_id || !location_id) return json({ error: "item_id and location_id required" }, 400);
        const st = await staffForPin(staff_pin, location_id);
        if (!st || !st.ok) { const mgr = await managerForPin(staff_pin, location_id); if (!mgr.ok) return json({ ok: false, error: "bad_pin", message: "PIN not recognised for this store" }, 403); }
        const { data: cur } = await admin.from("menu_item_overrides").select("price").eq("item_id", item_id).eq("location_id", location_id).maybeSingle();
        const { error } = await admin.from("menu_item_overrides")
          .upsert({ item_id, location_id, price: cur?.price ?? null, available: available === false ? false : null, unavailable_until: null, updated_at: new Date().toISOString() }, { onConflict: "item_id,location_id" });
        if (error) throw error;
        return json({ ok: true });
      }
      case "set_override": {
        const { item_id, location_id, price, available } = data;
        if (!item_id || !location_id) return json({ error: "item_id and location_id required" }, 400);
        // null clears that dimension (inherit master). If both null, remove the row.
        if ((price === null || price === undefined) && (available === null || available === undefined)) {
          const { error } = await admin.from("menu_item_overrides")
            .delete().eq("item_id", item_id).eq("location_id", location_id);
          if (error) throw error;
          return json({ ok: true, cleared: true });
        }
        const { error } = await admin.from("menu_item_overrides")
          .upsert({ item_id, location_id, price: price ?? null, available: available ?? null, updated_at: new Date().toISOString() },
                  { onConflict: "item_id,location_id" });
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- PER-STORE MODIFIER OPTION PRICE ----
      // Mirrors set_override exactly: a null price_delta means "inherit the
      // master", and clearing both dimensions removes the row so the option
      // falls back to menu_modifiers.price_delta. store_menu_full reads this
      // table, so whatever is set here is what the customer is charged.
      case "set_mod_override": {
        const { option_id, location_id, price_delta, available } = data || {};
        if (!option_id || !location_id) return json({ error: "option_id and location_id required" }, 400);
        if ((price_delta === null || price_delta === undefined) && (available === null || available === undefined)) {
          const { error } = await admin.from("menu_modifier_overrides")
            .delete().eq("option_id", option_id).eq("location_id", location_id);
          if (error) throw error;
          return json({ ok: true, cleared: true });
        }
        const { error } = await admin.from("menu_modifier_overrides")
          .upsert({
            option_id, location_id,
            price_delta: price_delta ?? null,
            available: available ?? null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "option_id,location_id" });
        if (error) throw error;
        return json({ ok: true });
      }

      // ═══ PRICE BANDS ═══════════════════════════════════════════════════
      // A band is a named, COMPLETE price list. Stores point at one; several
      // can share it. Resolution at the customer end is
      //     per-store override → the store's band → the item's master price
      // (see store_menu_full). Per-store overrides remain the exception layer.

      // Create by cloning, so a new band is complete from the first moment —
      // it's nearly always "the standard list with a few things dearer".
      case "create_band": {
        const { name, copy_from } = data || {};
        if (!name) return json({ error: "name required" }, 400);
        const { data: row, error } = await admin.rpc("clone_price_band", {
          new_name: name, copy_from: copy_from ?? "Master",
        });
        if (error) throw error;
        // clone_price_band leaves brand_id empty; a regional band must carry
        // the region's brand or it would fall outside the fence that made it.
        if (scope === "region" && fence && row) {
          await admin.from("menu_price_bands").update({ brand_id: fence.primaryBrand }).eq("id", row);
        }
        return json({ ok: true, id: row });
      }

      case "update_band": {
        const { id, fields } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["name", "description", "sort_order"];
        const patch: any = {};
        const src: any = (fields && typeof fields === "object") ? fields : (data || {});
        for (const k of allowed) if (k in src) patch[k] = src[k];
        const { error } = await admin.from("menu_price_bands").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // Stores on this band fall back to master prices rather than losing their
      // menu — menu_locations.price_band_id is ON DELETE SET NULL.
      case "delete_band": {
        const { id } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const { data: b } = await admin.from("menu_price_bands").select("name").eq("id", id).maybeSingle();
        if (b?.name === "Master") return json({ error: "the Master band can't be deleted" }, 400);
        const { error } = await admin.from("menu_price_bands").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "set_band_price": {
        const { band_id, item_id, price } = data || {};
        if (!band_id || !item_id) return json({ error: "band_id and item_id required" }, 400);
        const { error } = await admin.from("menu_band_prices")
          .upsert({ band_id, item_id, price: price ?? null }, { onConflict: "band_id,item_id" });
        if (error) throw error;
        return json({ ok: true });
      }

      // ═══ BULK / MULTI-STORE PRICE APPLY ════════════════════════════════
      // One call applies a price operation to many items at once, at either
      // the location tier (writes menu_item_overrides for one or MANY stores)
      // or the band tier (writes menu_band_prices). This powers the bulk bar
      // and the multi-store push. Operations:
      //   set   → price = value
      //   inc   → price = current effective + value   (value may be negative)
      //   pct   → price = current effective × (1 + value/100)
      //   clear → remove the override / band price (fall back to next tier)
      // round: null | "95" | "99" | "05" (nearest .95 / .99 / 5p)
      // Body: { scope: "location"|"band", target_ids: [uuid...], item_ids:[uuid...],
      //         op, value, round, current: { "<target>|<item>": effectiveNow } }
      case "bulk_set_prices": {
        const d = data || {};
        const scope = d.scope;
        const targetIds: string[] = Array.isArray(d.target_ids) ? d.target_ids : [];
        const itemIds: string[] = Array.isArray(d.item_ids) ? d.item_ids : [];
        const op = d.op; const value = Number(d.value);
        const round = d.round ?? null;
        const current = d.current || {};
        if (!["location", "band"].includes(scope)) return json({ error: "scope must be location or band" }, 400);
        if (!targetIds.length || !itemIds.length) return json({ error: "target_ids and item_ids required" }, 400);
        if (!["set", "inc", "pct", "clear"].includes(op)) return json({ error: "bad op" }, 400);

        const applyRound = (n: number): number => {
          if (n < 0) n = 0;
          if (round === "95") { const base = Math.round(n); return (base - (base > n + 0.05 ? 1 : 0)) + 0.95; }
          if (round === "99") { const base = Math.round(n); return (base - (base > n + 0.01 ? 1 : 0)) + 0.99; }
          if (round === "05") return Math.round(n * 20) / 20;
          return Math.round(n * 100) / 100;
        };
        const roundClean = applyRound;

        const rows: any[] = [];
        const clears: Array<{ t: string; i: string }> = [];
        for (const t of targetIds) {
          for (const i of itemIds) {
            if (op === "clear") { clears.push({ t, i }); continue; }
            let price: number;
            if (op === "set") price = value;
            else {
              const cur = Number(current[`${t}|${i}`]);
              if (!isFinite(cur)) continue; // no basis to inc/pct from
              price = op === "inc" ? cur + value : cur * (1 + value / 100);
            }
            price = roundClean(price);
            rows.push(scope === "location"
              ? { item_id: i, location_id: t, price, available: null, updated_at: new Date().toISOString() }
              : { band_id: t, item_id: i, price });
          }
        }

        let changed = 0;
        if (rows.length) {
          if (scope === "location") {
            const { error } = await admin.from("menu_item_overrides").upsert(rows, { onConflict: "item_id,location_id" });
            if (error) throw error;
          } else {
            const { error } = await admin.from("menu_band_prices").upsert(rows, { onConflict: "band_id,item_id" });
            if (error) throw error;
          }
          changed += rows.length;
        }
        for (const c of clears) {
          if (scope === "location") {
            await admin.from("menu_item_overrides").delete().eq("item_id", c.i).eq("location_id", c.t);
          } else {
            await admin.from("menu_band_prices").delete().eq("band_id", c.t).eq("item_id", c.i);
          }
          changed++;
        }
        return json({ ok: true, changed });
      }

      case "set_band_option_price": {
        const { band_id, option_id, price_delta } = data || {};
        if (!band_id || !option_id) return json({ error: "band_id and option_id required" }, 400);
        const { error } = await admin.from("menu_band_option_prices")
          .upsert({ band_id, option_id, price_delta: price_delta ?? null }, { onConflict: "band_id,option_id" });
        if (error) throw error;
        return json({ ok: true });
      }

      case "set_store_band": {
        const { location_id, band_id } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const { error } = await admin.from("menu_locations")
          .update({ price_band_id: band_id ?? null }).eq("id", location_id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- PRINTERS: list, with live online/offline from Sunmi ----
      case "printer_list": {
        const { data: printersAll, error } = await admin
          .from("printers").select("*").order("created_at", { ascending: true });
        if (error) throw error;
        const F = fence;
        const printers = scope === "region" && F
          ? (printersAll ?? []).filter((p: any) => p.location_id && F.locs.has(String(p.location_id)))
          : printersAll;
        // Sunmi answers { code, data: { list: [ { sn, is_online } ] } }. This
        // read looked for is_online one level too high, so the lookup returned
        // undefined every time and every printer in Admin showed the grey
        // "Unknown" dot — cloud ones included. printer-health has parsed the
        // real shape correctly all along; this now matches it.
        //
        // A local agent is not in Sunmi at all, so asking is a wasted call that
        // can only answer null. The agent stamps last_online_at on itself every
        // poll, which is the same signal the KDS trusts to raise its silent-
        // printer banner.
        const LOCAL_STALE_MS = 3 * 60 * 1000;
        const fresh = (ts: unknown) => {
          const t = ts ? Date.parse(String(ts)) : 0;
          return t > 0 && Date.now() - t < LOCAL_STALE_MS;
        };
        const withStatus = await Promise.all((printers ?? []).map(async (p: any) => {
          if (/^(usb|agent):/.test(String(p.sn || ""))) {
            return { ...p, online: fresh(p.last_online_at), local: true };
          }
          let online: boolean | null = null;
          try {
            const r = await callSunmi({ action: "status", sn: p.sn });
            const list: any[] = r.body?.data?.list ?? [];
            const row = list.find((x: any) => String(x?.sn ?? x?.msn ?? "") === String(p.sn)) ?? list[0];
            const s = String(row?.is_online);
            online = (s === "1" || s === "true") ? true
                   : (s === "0" || s === "false") ? false : null;
          } catch { online = null; }
          return { ...p, online, local: false };
        }));
        return json({ ok: true, printers: withStatus });
      }

      // ---- PRINTERS: bind a new one and register it ----
      case "printer_add": {
        const { sn, label, store_id, location_id, shop_id, station } = data || {};
        if (!sn || !store_id) return json({ error: "sn and store_id required" }, 400);
        const bind = await callSunmi({ action: "bind", sn, shop_id: shop_id ?? 1 });
        const code = bind.body?.code;
        const msgText = String(bind.body?.msg ?? "").toLowerCase();
        const alreadyBound = msgText.includes("already") && msgText.includes("bound");
        if (!(bind.ok && (code === 1 || code === 0 || code === undefined)) && !alreadyBound) {
          // Surface the Sunmi error in plain terms for the UI.
          const msg = bind.body?.msg || ("bind failed (HTTP " + bind.status + ")");
          const hint = String(bind.body?.code) === "10071704"
            ? " — this serial isn't in your Sunmi account/channel yet. Accept the transfer in the Sunmi portal, wait a minute, then try again."
            : "";
          return json({ error: msg + hint }, 400);
        }
        // If it's already bound to us, that's fine — just register the row.
        const { data: row, error } = await admin.from("printers")
          .insert({
            sn,
            label: label ?? null,
            store_id,
            location_id: location_id ?? null,
            shop_id: String(shop_id ?? 1),
            station: station ?? "kitchen",
            active: true,
            bound_at: new Date().toISOString(),
          })
          .select("*").single();
        if (error) throw error;
        return json({ ok: true, printer: row });
      }

      // ---- PRINTERS: update label / store / active ----
      case "printer_update": {
        const { id, fields } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["label", "store_id", "location_id", "active", "station", "copies", "print_role", "auto_print", "print_ticket", "print_receipt", "auto_ticket", "auto_receipt", "source_screen_key", "paper_mm", "agent_target"];
        const patch: any = {};
        for (const k of allowed) if (k in (fields || {})) patch[k] = fields[k];
        const { error } = await admin.from("printers").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- PRINTERS: remove from registry ----
      case "printer_remove": {
        const { id } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const { error } = await admin.from("printers").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- PRINTERS: test print ----
      case "printer_test": {
        const { sn } = data || {};
        if (!sn) return json({ error: "no sn" }, 400);
        // Name the store on the slip. Five printers on a bench all print the
        // same anonymous test page otherwise, and working out which one came
        // out of which is the whole point of pressing the button.
        const { data: pr } = await admin.from("printers").select("location_id").eq("sn", String(sn)).maybeSingle();
        const locId = (pr as { location_id?: unknown } | null)?.location_id;
        let store_name = "", brand_name = "Chocoberry";
        if (locId) {
          const [{ data: l }, { data: bn }] = await Promise.all([
            admin.from("menu_locations").select("name").eq("id", String(locId)).maybeSingle(),
            admin.from("menu_app_settings").select("value").eq("key", "brand_name:" + String(locId)).maybeSingle(),
          ]);
          store_name = String((l as { name?: unknown } | null)?.name ?? "");
          brand_name = String((bn as { value?: unknown } | null)?.value ?? "Chocoberry");
        }
        const r = await callSunmi({ action: "test", sn, store_name, brand_name });
        if (!r.ok || (r.body?.code !== undefined && r.body.code !== 1 && r.body.code !== 0)) {
          return json({ error: r.body?.msg || ("test failed (HTTP " + r.status + ")") }, 400);
        }
        // A local printer does not get the slip pushed to it; the job waits in
        // the queue until its agent next polls. Saying "sent" there is a lie
        // when the agent is not running, which is the exact case being chased.
        return json({ ok: true, local: !!r.body?.local });
      }

      // ---- PRINTERS: live status for one ----
      case "printer_status": {
        const { sn } = data || {};
        if (!sn) return json({ error: "no sn" }, 400);
        const r = await callSunmi({ action: "status", sn });
        return json({ ok: true, status: r.body });
      }

      // ---- CATEGORY: set station (kitchen/counter default for its items) ----
      case "update_category": {
        const { id, fields } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["name", "pos_name", "station", "sort_order", "active", "image_url"];
        const patch: any = {};
        for (const k of allowed) if (k in (fields || {})) patch[k] = fields[k];
        const { error } = await admin.from("menu_categories").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- Assign a store's MENU band (what it carries) ----
      // Separate from price_band_id on purpose: a store can share a format
      // with others while pricing differently. Master-only — a franchisee
      // does not get to move their own store onto a different format.
      case "set_menu_band": {
        const { location_id, band_id } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const { error } = await admin.from("menu_locations")
          .update({ menu_band_id: band_id || null }).eq("id", location_id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- Set what a BAND carries: one item, on or off ----
      // null = the band says nothing and the item follows the base menu.
      // Leaving it silent matters: a band row that merely repeats the base
      // blocks that item from ever inheriting a change.
      case "set_band_item": {
        const { band_id, item_id, available } = data || {};
        if (!band_id || !item_id) return json({ error: "band_id and item_id required" }, 400);
        if (available === null || available === undefined) {
          const { error } = await admin.from("menu_band_items")
            .delete().eq("band_id", band_id).eq("item_id", item_id);
          if (error) throw error;
          return json({ ok: true, cleared: true });
        }
        const { error } = await admin.from("menu_band_items")
          .upsert({ band_id, item_id, available: !!available }, { onConflict: "band_id,item_id" });
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- Set which menu SECTIONS a band carries ----
      // No rows at all = the band carries every active menu. Once there is at
      // least one row it becomes an explicit list, so removing the last row
      // returns the band to "carries everything" rather than "carries nothing".
      case "set_band_menu": {
        const { band_id, menu_id, on } = data || {};
        if (!band_id || !menu_id) return json({ error: "band_id and menu_id required" }, 400);
        if (on) {
          const { error } = await admin.from("menu_band_menus")
            .upsert({ band_id, menu_id }, { onConflict: "band_id,menu_id" });
          if (error) throw error;
        } else {
          const { error } = await admin.from("menu_band_menus")
            .delete().eq("band_id", band_id).eq("menu_id", menu_id);
          if (error) throw error;
        }
        return json({ ok: true });
      }

      // ---- Create a band ----
      case "band_create": {
        const { name, band_kind, brand_id } = data || {};
        if (!name) return json({ error: "name required" }, 400);
        const { error } = await admin.from("menu_price_bands")
          .insert({ name: String(name).trim(), band_kind: band_kind === "menu" ? "menu" : "price", brand_id: brand_id ?? null });
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- Which categories a printer's TICKET covers ----
      // Sent as the complete list, so the UI never has to diff. An empty list
      // means "all categories" — that is the default and the safe state.
      case "set_printer_categories": {
        const { printer_sn, category_ids } = data || {};
        if (!printer_sn) return json({ error: "printer_sn required" }, 400);
        const ids: string[] = Array.isArray(category_ids) ? category_ids : [];
        const { error: delErr } = await admin.from("printer_categories")
          .delete().eq("printer_sn", printer_sn);
        if (delErr) throw delErr;
        if (ids.length) {
          const { error } = await admin.from("printer_categories")
            .insert(ids.map((c) => ({ printer_sn, category_id: c })));
          if (error) throw error;
        }
        return json({ ok: true, count: ids.length });
      }

      // ---- Per-item exception for one printer ----
      // state "on"  = print it even if its category is not covered
      // state "off" = do not print it even if its category is
      // state null  = follow the category (row removed)
      case "set_printer_item": {
        const { printer_sn, item_id, state: st } = data || {};
        if (!printer_sn || !item_id) return json({ error: "printer_sn and item_id required" }, 400);
        if (st === null || st === undefined) {
          const { error } = await admin.from("printer_items")
            .delete().eq("printer_sn", printer_sn).eq("item_id", item_id);
          if (error) throw error;
          return json({ ok: true, cleared: true });
        }
        const { error } = await admin.from("printer_items")
          .upsert({ printer_sn, item_id, include: st === "on" }, { onConflict: "printer_sn,item_id" });
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- BULK: set availability for MANY items across MANY stores ----
      // The whole point of the network screen. Launching an item at 1 of 26
      // stores previously meant opening 25 store dialogs and hiding it in
      // each. This does it in one call: pass the item ids, the location ids,
      // and what they should become.
      //   mode "carry"       -> on sale (clears any hide and any 86)
      //   mode "dont_carry"  -> permanently not carried at those stores
      //   mode "off_today"   -> 86 until the next 06:00 London
      case "bulk_set_availability": {
        const { item_ids, location_ids, mode } = data || {};
        if (!Array.isArray(item_ids) || !item_ids.length) return json({ error: "item_ids required" }, 400);
        if (!Array.isArray(location_ids) || !location_ids.length) return json({ error: "location_ids required" }, 400);
        if (!["carry", "dont_carry", "off_today"].includes(mode)) return json({ error: "bad mode" }, 400);

        // A store login may only ever touch its own location.
        const locs = scope === "store"
          ? location_ids.filter((l: string) => l === scopeLocationId)
          : location_ids;
        if (!locs.length) return json({ error: "forbidden for this store login" }, 403);

        if (mode === "off_today") {
          for (const l of locs) {
            for (const it of item_ids) {
              const { error } = await admin.rpc("menu_item_86", { p_location_id: l, p_item_id: it });
              if (error) throw error;
            }
          }
          return json({ ok: true, changed: locs.length * item_ids.length });
        }

        const rows: Array<Record<string, unknown>> = [];
        for (const l of locs) {
          for (const it of item_ids) {
            rows.push({
              location_id: l,
              item_id: it,
              available: mode === "carry" ? null : false,
              unavailable_until: null,
            });
          }
        }
        // onConflict leaves any existing price alone — this action is about
        // availability only, never pricing.
        const { error } = await admin.from("menu_item_overrides")
          .upsert(rows, { onConflict: "location_id,item_id", ignoreDuplicates: false });
        if (error) throw error;

        // "carry" with no price left behind is a dead row that would block the
        // item inheriting future band and master changes. Clear those out.
        if (mode === "carry") {
          await admin.from("menu_item_overrides")
            .delete().in("location_id", locs).in("item_id", item_ids)
            .is("price", null).is("available", null).is("unavailable_until", null);
        }
        return json({ ok: true, changed: rows.length });
      }

      // ---- 86 an item at ONE store, or put it back on sale ----
      // Temporary and self-clearing: menu_item_86 sets unavailable_until to
      // the next 06:00 Europe/London, so an item 86d at 23:00 stays off for
      // the rest of the night's trade and returns for the next opening rather
      // than reappearing at midnight. Distinct from available=false, which is
      // the permanent "we do not carry this here".
      case "set_item_86": {
        const { location_id, item_id, on } = data || {};
        if (!location_id || !item_id) {
          return json({ error: "location_id and item_id required" }, 400);
        }
        if (on === false) {
          const { error } = await admin.rpc("menu_item_restore",
            { p_location_id: location_id, p_item_id: item_id });
          if (error) throw error;
          return json({ ok: true, until: null });
        }
        const { data: until, error } = await admin.rpc("menu_item_86",
          { p_location_id: location_id, p_item_id: item_id });
        if (error) throw error;
        return json({ ok: true, until });
      }

      // ---- KDS: set which printer a screen's MANUAL prints go to ----
      // Upserts by (location_id, screen_key) so a screen can be registered and
      // pointed at a printer in one action. printer_sn null = every printer.
      case "set_kds_printer": {
        const { location_id, screen_key, printer_sn, label } = data || {};
        if (!location_id || !screen_key) {
          return json({ error: "location_id and screen_key required" }, 400);
        }
        // A screen may only be pointed at a printer AT ITS OWN LOCATION.
        if (printer_sn) {
          const { data: p } = await admin.from("printers")
            .select("location_id").eq("sn", String(printer_sn)).maybeSingle();
          if (!p || p.location_id !== location_id) {
            return json({ error: "printer is not at this location" }, 400);
          }
        }
        const row: Record<string, unknown> = {
          location_id, screen_key: String(screen_key),
          printer_sn: printer_sn ? String(printer_sn) : null,
        };
        if (label) row.label = String(label);
        const { error } = await admin.from("kds_screens")
          .upsert(row, { onConflict: "location_id,screen_key" });
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- Add a KDS screen ----
      // Screens had to be inserted by hand, so people copied an existing link
      // instead — which gave two screens the same identity and therefore the
      // same printer and the same bumps. This allocates the next free
      // screen_key for the location so each one is genuinely independent.
      case "kds_screen_add": {
        const { location_id, label } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const { data: existing, error: exErr } = await admin
          .from("kds_screens").select("screen_key").eq("location_id", location_id);
        if (exErr) throw exErr;
        const used = new Set((existing ?? []).map((r: any) => String(r.screen_key)));
        let next = 1;
        while (used.has(String(next))) next++;
        const { error } = await admin.from("kds_screens").insert({
          location_id,
          screen_key: String(next),
          label: label ? String(label) : "Screen " + next,
          printer_sn: null,
        });
        if (error) throw error;
        return json({ ok: true, screen_key: String(next) });
      }

      // ---- Remove a KDS screen ----
      case "kds_screen_remove": {
        const { location_id, screen_key } = data || {};
        if (!location_id || !screen_key) return json({ error: "location_id and screen_key required" }, 400);
        const { error } = await admin.from("kds_screens")
          .delete().eq("location_id", location_id).eq("screen_key", String(screen_key));
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- Pause/resume customer ordering for ONE location ----
      // The key is built server-side from location_id, so a store login cannot
      // reach any other key in menu_app_settings (the generic set_setting
      // action stays master-only for that reason). The customer app polls
      // this every 10s and treats ONLY the exact string "off" as paused.
      case "set_accepting_orders": {
        const { location_id, accepting } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const key = "accepting_orders:" + String(location_id);
        const value = accepting === false ? "off" : "on";
        const { error } = await admin.from("menu_app_settings")
          .upsert({ key, value, updated_at: new Date().toISOString() },
                  { onConflict: "key" });
        if (error) throw error;
        return json({ ok: true, key, value });
      }

      // ---- SETTINGS: upsert a key/value into menu_app_settings ----
      case "set_setting": {
        const { key, value } = data || {};
        if (!key) return json({ error: "key required" }, 400);
        const { error } = await admin.from("menu_app_settings")
          .upsert({ key, value: value ?? null, updated_at: new Date().toISOString() },
                  { onConflict: "key" });
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- TILL: mark an order paid (cash/card) with optional discount ----
      case "mark_paid": {
        const { order_id, method, discount_type = null, discount_value = null } = data || {};
        if (!order_id || (method !== "cash" && method !== "card")) {
          return json({ error: "order_id and method (cash|card) required" }, 400);
        }
        // Fetch the order total so we compute the paid amount server-side.
        const { data: ord, error: oErr } = await admin
          .from("menu_orders").select("id, total, status").eq("id", order_id).single();
        if (oErr || !ord) return json({ error: "order not found" }, 404);
        const total = Number(ord.total) || 0;
        let paid = total;
        // Apply discount if provided. percent = % off; amount = £ off.
        const dv = discount_value == null ? null : Number(discount_value);
        if (discount_type === "percent" && dv != null) {
          paid = Math.max(0, total * (1 - dv / 100));
        } else if (discount_type === "amount" && dv != null) {
          paid = Math.max(0, total - dv);
        }
        paid = Math.round(paid * 100) / 100; // 2dp
        const patch: Record<string, unknown> = {
          paid_method: method,
          paid_amount: paid,
          // Keep amount_paid in sync with the ledger-based flow so every "is this
          // paid?" check (list uses paid_method; detail uses total - amount_paid)
          // agrees. Without this, mark_paid left amount_paid at 0 and the order
          // flipped back to "unpaid" wherever the balance was checked.
          amount_paid: paid,
          discount_type: (discount_type === "percent" || discount_type === "amount") ? discount_type : null,
          discount_value: dv,
          paid_at: new Date().toISOString(),
        };
        // PAY-FIRST: if this order was on hold, release it to the kitchen now
        // that it's paid — flip to "placed" so it shows on the KDS, then print.
        const wasHold = ord.status === "hold";
        if (wasHold) patch.status = "placed";
        const { error } = await admin.from("menu_orders").update(patch).eq("id", order_id);
        if (error) throw error;
        // Record the tender. The closing report builds "cash taken" purely from
        // order_payments, and this path wrote only the order's own paid_method,
        // so every order paid as it was rung up at the counter was money in the
        // drawer that the report never saw — the till read over by exactly that
        // much, and the day's takings were understated.
        // Only the part not already in the ledger, so calling this twice, or
        // after a part-payment, cannot double-count.
        if (paid > 0) {
          const { data: existing } = await admin.from("order_payments").select("amount, kind").eq("order_id", order_id);
          const already = Math.round((existing || []).filter((p: any) => p.kind !== "refund").reduce((s: number, p: any) => s + Number(p.amount || 0), 0) * 100) / 100;
          const delta = Math.round((paid - already) * 100) / 100;
          if (delta > 0.001) {
            const { error: pErr } = await admin.from("order_payments").insert({ order_id, method, amount: delta, kind: "payment", note: "Till" });
            if (pErr) console.error("mark_paid tender", pErr);
          }
        }
        if (wasHold) {
          // Re-fetch the full row and fire the print (the INSERT webhook skipped
          // it while on hold). KDS picks it up automatically via the poll.
          const { data: full } = await admin.from("menu_orders").select("*").eq("id", order_id).single();
          if (full) { try { await callSunmi({ type: "INSERT", record: full }); } catch (e) { console.error("release print failed", e); } }
        }
        return json({ ok: true, paid_amount: paid, released: wasHold });
      }

      // ---- TILL: mark an order UNPAID again (undo) ----
      case "mark_unpaid": {
        const { order_id } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        // Clear payment state AND any recorded tenders (so a re-payment starts clean).
        await admin.from("order_payments").delete().eq("order_id", order_id);
        const { error } = await admin.from("menu_orders").update({
          paid_method: null, paid_amount: null, amount_paid: 0, is_split: false,
          discount_type: null, discount_value: null, paid_at: null,
        }).eq("id", order_id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- TILL: take a payment (supports partial / split tenders) ----
      // data: { order_id, method: 'cash'|'card'|'other', amount, tendered?, note? }
      // Records one row in order_payments. When cumulative paid >= total, the
      // order is marked fully paid. Returns running paid + remaining balance.
      case "take_payment": {
        const { order_id, method, amount, tendered = null, note = null } = data || {};
        if (!order_id || (method !== "cash" && method !== "card" && method !== "other")) {
          return json({ error: "order_id and method (cash|card|other) required" }, 400);
        }
        const amt = Math.round(Number(amount) * 100) / 100;
        if (!(amt > 0)) return json({ error: "amount must be > 0" }, 400);
        const { data: ord, error: oErr } = await admin
          .from("menu_orders").select("id, total, amount_paid, status, discount_amount").eq("id", order_id).single();
        if (oErr || !ord) return json({ error: "order not found" }, 404);
        if (ord.status === "cancelled") return json({ error: "cancelled", message: "This order was cancelled." }, 409);
        const total = Math.round((Number(ord.total || 0) - Number((ord as any).discount_amount || 0)) * 100) / 100; // amount due after discount
        const already = Math.round(Number(ord.amount_paid || 0) * 100) / 100;
        const remainingBefore = Math.round((total - already) * 100) / 100;
        if (remainingBefore <= 0) return json({ error: "already_paid", message: "This order is already fully paid." }, 409);
        // Don't allow overpaying the balance on card/other; cash can exceed (change).
        const applied = (method === "cash") ? Math.min(amt, remainingBefore) : Math.min(amt, remainingBefore);
        // Record the tender.
        const { error: pErr } = await admin.from("order_payments").insert({
          order_id, method, amount: applied,
          tendered: method === "cash" && tendered != null ? Math.round(Number(tendered) * 100) / 100 : null,
          note: note ? String(note).slice(0, 120) : null,
        });
        if (pErr) throw pErr;
        // Recompute running paid from the ledger (authoritative).
        const { data: paysAll } = await admin.from("order_payments").select("amount, method, kind").eq("order_id", order_id);
        const pays = (paysAll ?? []).filter((r: any) => r.kind !== "refund");
        const paidNow = Math.round((pays ?? []).reduce((s, r) => s + Number(r.amount || 0), 0) * 100) / 100;
        const remaining = Math.round((total - paidNow) * 100) / 100;
        const fullyPaid = remaining <= 0.001;
        const distinctMethods = new Set((pays ?? []).map((r) => r.method));
        const isSplit = (pays ?? []).length > 1;
        // Primary method = the tender that paid the most (for the single paid_method column).
        let primary = method;
        if (fullyPaid && (pays ?? []).length) {
          const byMethod: Record<string, number> = {};
          for (const r of pays!) byMethod[r.method] = (byMethod[r.method] || 0) + Number(r.amount || 0);
          primary = Object.entries(byMethod).sort((a, b) => b[1] - a[1])[0][0];
        }
        const patch: Record<string, unknown> = { amount_paid: paidNow, is_split: isSplit };
        if (fullyPaid) {
          patch.paid_method = isSplit ? "split" : primary;
          patch.paid_amount = paidNow;
          patch.paid_at = new Date().toISOString();
          // PAY-FIRST: release a held order to the kitchen now it's fully paid.
          if (ord.status === "hold") patch.status = "placed";
        }
        const { error: uErr } = await admin.from("menu_orders").update(patch).eq("id", order_id);
        if (uErr) throw uErr;
        if (fullyPaid && ord.status === "hold") {
          const { data: full } = await admin.from("menu_orders").select("*").eq("id", order_id).single();
          if (full) { try { await callSunmi({ type: "INSERT", record: full }); } catch (e) { console.error("release print failed", e); } }
        }
        // Cash means the drawer has to open. Best effort: a drawer that fails
        // to kick must never fail the payment that was already recorded.
        let drawer = false;
        if (method === "cash") {
          try {
            const { data: locRow } = await admin.from("menu_orders").select("location_id").eq("id", order_id).maybeSingle();
            const r = await callSunmi({ action: "open-drawer", location_id: locRow?.location_id ?? null, device_key: deviceTok && deviceTok.key ? String(deviceTok.key) : null });
            drawer = !!(r.body as any)?.ok;
          } catch (e) { console.error("drawer kick failed", e); }
        }
        return json({ ok: true, paid: paidNow, remaining: Math.max(0, remaining), fully_paid: fullyPaid, is_split: isSplit, methods: [...distinctMethods], drawer });
      }

      // ---- TILL: abandon a pay-first order that was never paid ----
      // "Pay" creates the order on hold before any money is taken. When the
      // cashier closes the pay screen instead (to add a discount, change an
      // item), the till puts the items back in the basket and calls this to
      // cancel the empty shell. Without it the hold sat on the KDS as
      // "waiting for payment" for the rest of the day, invisible on the till,
      // and looked like a duplicate once the order was rung again (London
      // Road #82/#83, 22 Oct).
      //
      // No PIN, because nothing has happened yet: it never reached the
      // kitchen and no money was taken. Everything else is refused, so this
      // can't be used as a PIN-free void: a placed order, a kiosk order, any
      // tender recorded, or a card request open or completed on the terminal.
      case "abandon_hold": {
        const { order_id } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const { data: ord } = await admin.from("menu_orders")
          .select("id, order_no, location_id, status, tablet_no, amount_paid, paid_method").eq("id", order_id).maybeSingle();
        if (!ord) return json({ error: "order not found" }, 404);
        if (ord.status === "cancelled") return json({ ok: true, already: true });
        if (ord.status !== "hold") return json({ error: "not_hold", message: "This order has already gone to the kitchen — void it instead." }, 409);
        if (!["POS", "phone", "web"].includes(String(ord.tablet_no || ""))) {
          return json({ error: "not_till_order", message: "Only orders started on this till can be cancelled here." }, 409);
        }
        if (callerDevice && deviceTok && deviceTok.location_id && ord.location_id && deviceTok.location_id !== ord.location_id) {
          return json({ error: "wrong_store" }, 403);
        }
        if (Number(ord.amount_paid || 0) > 0 || ord.paid_method) {
          return json({ error: "already_paid", message: "Money has been taken on this order — finish or refund it." }, 409);
        }
        const { data: tenders } = await admin.from("order_payments").select("id").eq("order_id", order_id).limit(1);
        if (tenders && tenders.length) {
          return json({ error: "already_paid", message: "A payment is recorded on this order — finish or refund it." }, 409);
        }
        const { data: cards } = await admin.from("teya_payment_requests").select("status")
          .eq("order_id", order_id).in("status", ["NEW", "IN_PROGRESS", "CANCELLING", "SUCCESSFUL"]).limit(1);
        if (cards && cards.length) {
          return json({ error: "card_in_progress", message: "A card payment is still on the machine for #" + (ord.order_no ?? "") + ". Finish or cancel it there first." }, 409);
        }
        // Conditional on still being an unpaid hold, so a payment landing in
        // the same instant wins over the cancel.
        const { data: upd, error } = await admin.from("menu_orders").update({
          status: "cancelled", cancelled_at: new Date().toISOString(),
          cancel_reason: "Pay screen closed before payment — items returned to basket",
        }).eq("id", order_id).eq("status", "hold").is("paid_method", null).select("id");
        if (error) throw error;
        if (!upd || !upd.length) return json({ error: "changed", message: "The order changed while cancelling — check it on the till." }, 409);
        return json({ ok: true, order_no: ord.order_no });
      }

      // ---- TILL: void a whole order ----
      // Manager authority, not staff: voiding the lot is how a sale
      // disappears. A paid order is refunded, never voided — otherwise the
      // money taken and the sales figures stop agreeing.
      case "void_order": {
        const { order_id, reason, manager_pin } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        if (!reason || String(reason).trim().length < 2) return json({ error: "reason required", message: "Give a reason for the void." }, 400);
        const { data: ord } = await admin.from("menu_orders")
          .select("id, order_no, location_id, status, total, discount_amount, amount_paid, paid_method").eq("id", order_id).maybeSingle();
        if (!ord) return json({ error: "order not found" }, 404);
        if (ord.status === "cancelled") return json({ ok: true, already: true });
        const paid = Math.round(Number(ord.amount_paid || 0) * 100) / 100;
        if (paid > 0 || ord.paid_method) {
          return json({ error: "already_paid", message: "Money has been taken on this order — refund it instead of voiding." }, 409);
        }
        const mgr = await managerForPin(manager_pin, ord.location_id);
        if (!mgr.ok) return json({ error: "bad_pin", message: "A manager PIN is needed to void an order." }, 403);

        const { data: its } = await admin.from("menu_order_items").select("id, name_snapshot, qty").eq("order_id", order_id);
        const worth = Math.round((Number(ord.total || 0) - Number((ord as any).discount_amount || 0)) * 100) / 100;
        await admin.from("order_voids").insert({
          order_id, location_id: ord.location_id, order_no: ord.order_no,
          items_total: worth, item_count: (its || []).length,
          reason: String(reason).slice(0, 200), voided_by: mgr.name || null,
          screen_key: deviceTok && deviceTok.key ? String(deviceTok.key) : null,
        }).then(() => {}, () => {});
        const { error } = await admin.from("menu_orders").update({
          status: "cancelled", cancelled_at: new Date().toISOString(),
          cancelled_by: mgr.name || null, cancel_reason: String(reason).slice(0, 200),
        }).eq("id", order_id);
        if (error) throw error;

        // Tell the kitchen, in case any of it is already being made.
        try {
          await callSunmi({
            action: "print-message", location_id: ord.location_id,
            title: "*** ORDER VOID ***",
            lines: [
              "Order #" + (ord.order_no ?? ""),
              (its || []).length + " item(s) · " + "GBP " + worth.toFixed(2),
              "Reason: " + String(reason).slice(0, 60),
              "DO NOT MAKE / STOP",
              mgr.name ? "By: " + mgr.name : "",
            ].filter(Boolean),
          });
        } catch (e) { console.error("void chit failed", e); }
        return json({ ok: true, by: mgr.name || null, order_no: ord.order_no });
      }

      // ---- TILL: no sale — open the drawer for change or the float ----
      // PIN-gated and logged, because an unlogged "open the drawer" button is
      // how cash goes missing without a trace.
      case "open_drawer": {
        const { location_id, reason = null, staff_pin } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        // staffForPin/managerForPin return {ok:false,...} rather than null, so
        // test .ok — an || chain would wave through any four digits.
        const staff = await staffForPin(staff_pin, location_id);
        const who = staff && staff.ok ? staff : await managerForPin(staff_pin, location_id);
        if (!who || !who.ok) return json({ error: "bad_pin", message: "PIN not recognised for this store." }, 403);
        const r = await callSunmi({
          action: "open-drawer", location_id,
          device_key: deviceTok && deviceTok.key ? String(deviceTok.key) : null,
        });
        await admin.from("device_events").insert({
          location_id,
          screen_key: deviceTok && deviceTok.key ? String(deviceTok.key) : "till",
          event: "drawer_opened",
          detail: { by: who.name || "staff", reason: reason ? String(reason).slice(0, 80) : "no sale" },
        }).then(() => {}, () => {});
        return json({ ok: !!(r.body as any)?.ok, by: who.name || null, ...(r.body as any || {}) });
      }

      // ---- TILL: list the tenders recorded against an order ----
      // ---- TILL: discount on an order (staff PIN; >25% needs a manager) ----
      case "apply_discount": {
        const { order_id, discount_type, discount_value, reason, staff_pin } = data || {};
        if (!order_id || !["percent", "amount"].includes(String(discount_type))) return json({ error: "order_id and discount_type (percent|amount) required" }, 400);
        const dv = Math.round(Number(discount_value) * 100) / 100;
        if (!(dv > 0)) return json({ error: "discount_value must be > 0" }, 400);
        const { data: ord } = await admin.from("menu_orders").select("id, total, amount_paid, status, location_id, paid_method").eq("id", order_id).maybeSingle();
        if (!ord) return json({ error: "order not found" }, 404);
        if (ord.status === "cancelled") return json({ error: "cancelled", message: "This order was cancelled." }, 409);
        if (ord.paid_method) return json({ error: "already_paid", message: "This order is already paid — refund instead." }, 409);
        const total = Math.round(Number(ord.total || 0) * 100) / 100;
        const amount = Math.min(total, Math.round((discount_type === "percent" ? total * dv / 100 : dv) * 100) / 100);
        // Judge the percentage asked for, not the rounded money. 25% of £10.50
        // is £2.625, which rounds to £2.63 and reads back as 25.05% — so the
        // 25% preset was intermittently demanding a manager PIN.
        const pct = discount_type === "percent" ? dv : (total > 0 ? amount / total * 100 : 0);
        // Who's authorising?
        let by = "";
        const mgr = await managerForPin(staff_pin, ord.location_id);
        if (mgr.ok) by = mgr.name || "Manager";
        else {
          const st = await staffForPin(staff_pin, ord.location_id);
          if (!st || !st.ok) return json({ ok: false, error: "bad_pin", message: st && (st as any).reason === "not_this_store" ? "That PIN is for another store" : "PIN not recognised" }, 403);
          if (pct > 25) return json({ ok: false, error: "manager_required", message: "Discounts over 25% need a manager PIN" }, 403);
          by = st.name;
        }
        const already = Math.round(Number(ord.amount_paid || 0) * 100) / 100;
        const due = Math.round((total - amount) * 100) / 100;
        const patch: Record<string, unknown> = { discount_type, discount_value: dv, discount_amount: amount, discount_reason: reason ? String(reason).slice(0, 80) : null, discount_by: by };
        // Nothing left to pay — either because enough was paid already, or
        // because the discount took the bill to zero. Close it here: a £0
        // tender is refused by take_payment (rightly, no money moves), so a
        // 100% discount otherwise leaves the order sitting in unpaid for ever
        // and the till cannot be closed on it.
        if (due <= 0.001 || (already > 0 && already + 0.001 >= due)) {
          // "comp" when no money changed hands, so the day's report can tell a
          // free order from a cash one. The ledger stays empty: nothing was
          // taken, so nothing belongs in order_payments.
          patch.paid_method = already > 0 ? "cash" : "comp";
          patch.paid_amount = already;
          patch.paid_at = new Date().toISOString();
          if (ord.status === "hold") patch.status = "placed";
        }
        const { error } = await admin.from("menu_orders").update(patch).eq("id", order_id);
        if (error) throw error;
        // Pay-first order released by the discount: it still has to reach the
        // kitchen, the same way take_payment releases one.
        if (ord.status === "hold" && patch.status === "placed") {
          const { data: full } = await admin.from("menu_orders").select("*").eq("id", order_id).single();
          if (full) { try { await callSunmi({ type: "INSERT", record: full }); } catch (e) { console.error("release print failed", e); } }
        }
        return json({ ok: true, discount_amount: amount, due, closed: !!patch.paid_method, by });
      }
      // Discount one line rather than the whole order. Same PIN rule as
      // apply_discount, measured against the line rather than the bill: a
      // staff PIN can take 25% off a line, a manager anything.
      // The line's own line_total is left at full menu price. What changes is
      // the order's items_discount_total and total, so the day summary can
      // still report the full price as gross and the giveaway as a discount.
      case "apply_item_discount": {
        const { order_id, order_item_id, discount_type, discount_value, scope, reason, staff_pin } = data || {};
        if (!order_id || !order_item_id) return json({ error: "order_id and order_item_id required" }, 400);
        if (!["percent", "amount"].includes(String(discount_type))) return json({ error: "discount_type must be percent or amount" }, 400);
        const sc = scope === "unit" ? "unit" : "line";
        const dv = Math.round(Number(discount_value) * 100) / 100;
        if (!(dv > 0)) return json({ error: "discount_value must be > 0" }, 400);
        const { data: ord } = await admin.from("menu_orders").select("id, subtotal, total, app_discount, amount_paid, status, location_id, paid_method").eq("id", order_id).maybeSingle();
        if (!ord) return json({ error: "order not found" }, 404);
        if (ord.status === "cancelled") return json({ error: "cancelled", message: "This order was cancelled." }, 409);
        if (ord.paid_method) return json({ error: "already_paid", message: "This order is already paid — refund instead." }, 409);
        const { data: line } = await admin.from("menu_order_items").select("id, name_snapshot, qty, line_total").eq("id", order_item_id).eq("order_id", order_id).maybeSingle();
        if (!line) return json({ error: "line not found" }, 404);
        const lineTotal = Math.round(Number(line.line_total || 0) * 100) / 100;
        const qty = Math.max(1, Number(line.qty || 1));
        // "unit" means the figure is per item and multiplies by the quantity;
        // a percentage is the same either way, so only an amount scales.
        const raw = discount_type === "percent" ? lineTotal * dv / 100 : (sc === "unit" ? dv * qty : dv);
        const amount = Math.min(lineTotal, Math.round(raw * 100) / 100);
        // Same rounding trap as the order-level discount above.
        const pct = discount_type === "percent" ? dv : (lineTotal > 0 ? amount / lineTotal * 100 : 0);
        let by = "";
        const mgr = await managerForPin(staff_pin, ord.location_id);
        if (mgr.ok) by = mgr.name || "Manager";
        else {
          const st = await staffForPin(staff_pin, ord.location_id);
          if (!st || !st.ok) return json({ ok: false, error: "bad_pin", message: st && (st as any).reason === "not_this_store" ? "That PIN is for another store" : "PIN not recognised" }, 403);
          if (pct > 25) return json({ ok: false, error: "manager_required", message: "Discounts over 25% need a manager PIN" }, 403);
          by = st.name || "Staff";
        }
        const { error: lErr } = await admin.from("menu_order_items").update({
          discount_amount: amount, discount_type, discount_value: dv, discount_scope: sc,
          discount_reason: reason ? String(reason).slice(0, 80) : null, discount_by: by,
        }).eq("id", order_item_id).eq("order_id", order_id);
        if (lErr) throw lErr;
        const r = await recalcItemDiscounts(order_id, ord);
        return json({ ok: true, line_discount: amount, items_discount_total: r.itemsDisc, total: r.total, by });
      }

      case "remove_item_discount": {
        const { order_id, order_item_id, staff_pin } = data || {};
        if (!order_id || !order_item_id) return json({ error: "order_id and order_item_id required" }, 400);
        const { data: ord } = await admin.from("menu_orders").select("id, subtotal, total, app_discount, status, location_id, paid_method").eq("id", order_id).maybeSingle();
        if (!ord) return json({ error: "order not found" }, 404);
        if (ord.paid_method) return json({ error: "already_paid", message: "This order is already paid — refund instead." }, 409);
        // Taking a discount off puts money back on the bill, so any valid PIN
        // for this store is enough.
        const mgr = await managerForPin(staff_pin, ord.location_id);
        if (!mgr.ok) {
          const st = await staffForPin(staff_pin, ord.location_id);
          if (!st || !st.ok) return json({ ok: false, error: "bad_pin", message: "PIN not recognised" }, 403);
        }
        await admin.from("menu_order_items").update({
          discount_amount: null, discount_type: null, discount_value: null,
          discount_scope: null, discount_reason: null, discount_by: null,
        }).eq("id", order_item_id).eq("order_id", order_id);
        const r = await recalcItemDiscounts(order_id, ord);
        return json({ ok: true, items_discount_total: r.itemsDisc, total: r.total });
      }

      case "remove_discount": {
        const { order_id, staff_pin } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const { data: ord } = await admin.from("menu_orders").select("id, location_id, paid_method, paid_amount").eq("id", order_id).maybeSingle();
        if (!ord) return json({ error: "order not found" }, 404);
        // A comp closed the order without taking anything, so it is reversible:
        // undoing the discount puts it back in unpaid. A real tender is not.
        const wasComp = ord.paid_method === "comp" && !(Number(ord.paid_amount || 0) > 0);
        if (ord.paid_method && !wasComp) return json({ error: "already_paid", message: "Paid orders can't have the discount removed." }, 409);
        const st = await staffForPin(staff_pin, ord.location_id); const mgr = st && st.ok ? null : await managerForPin(staff_pin, ord.location_id);
        if (!(st && st.ok) && !(mgr && mgr.ok)) return json({ ok: false, error: "bad_pin", message: "PIN not recognised" }, 403);
        const undo: Record<string, unknown> = { discount_type: null, discount_value: null, discount_amount: null, discount_reason: null, discount_by: null };
        if (wasComp) { undo.paid_method = null; undo.paid_amount = null; undo.paid_at = null; }
        const { error } = await admin.from("menu_orders").update(undo).eq("id", order_id);
        if (error) throw error;
        return json({ ok: true });
      }
      // ---- TILL: refund (manager PIN). Cash is handed back; card is recorded and done on the terminal. ----
      case "refund_payment": {
        const { order_id, amount, method, reason, manager_pin } = data || {};
        if (!order_id || !["cash", "card", "other"].includes(String(method))) return json({ error: "order_id and method required" }, 400);
        const amt = Math.round(Number(amount) * 100) / 100;
        if (!(amt > 0)) return json({ error: "amount must be > 0" }, 400);
        const { data: ord } = await admin.from("menu_orders").select("id, order_no, total, amount_paid, status, location_id, discount_amount, refund_total").eq("id", order_id).maybeSingle();
        if (!ord) return json({ error: "order not found" }, 404);
        const mgr = await managerForPin(manager_pin, ord.location_id);
        if (!mgr.ok) return json({ ok: false, error: mgr.reason === "not_manager" ? "manager_required" : "bad_pin", message: mgr.reason === "not_manager" ? "Refunds need a manager PIN" : "PIN not recognised" }, 403);
        const paid = Math.round(Number(ord.amount_paid || 0) * 100) / 100;
        const refundedSoFar = Math.round(Number((ord as any).refund_total || 0) * 100) / 100;
        const refundable = Math.round((paid - refundedSoFar) * 100) / 100;
        if (amt > refundable + 0.001) return json({ ok: false, error: "too_much", message: "Only £" + refundable.toFixed(2) + " can be refunded on this order" }, 409);
        // Refunds are negative ledger entries: the overpayment guard on order_payments lets them through and every sum stays honest.
        const { error: pErr } = await admin.from("order_payments").insert({ order_id, method, amount: -amt, kind: "refund", note: ("REFUND" + (reason ? ": " + String(reason).slice(0, 100) : "") + " · by " + (mgr.name || "manager")).slice(0, 120) });
        if (pErr) throw pErr;
        const newRefunded = Math.round((refundedSoFar + amt) * 100) / 100;
        const full = newRefunded + 0.001 >= paid;
        const { error } = await admin.from("menu_orders").update({ refund_total: newRefunded, refund_reason: reason ? String(reason).slice(0, 80) : null, refunded_at: new Date().toISOString(), refunded_by: mgr.name || "manager", ...(full ? { status: "refunded" } : {}) }).eq("id", order_id);
        if (error) throw error;
        // Customer refund receipt (best effort), on the refunding till's printer.
        try { await callSunmi({ action: "print-refund", order_id, amount: amt, method, reason: reason || null, by: mgr.name || "manager", location_id: ord.location_id, device_key: deviceTok && deviceTok.key ? String(deviceTok.key) : null }); } catch {}
        return json({ ok: true, refunded: amt, refund_total: newRefunded, full, by: mgr.name });
      }
      case "print_refund_receipt": {
        const { order_id } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const { data: ord } = await admin.from("menu_orders").select("id, location_id, refund_total, refund_reason, refunded_by").eq("id", order_id).maybeSingle();
        if (!ord || !(Number(ord.refund_total || 0) > 0)) return json({ ok: false, message: "No refund on this order" }, 404);
        const { data: last } = await admin.from("order_payments").select("amount, method").eq("order_id", order_id).eq("kind", "refund").order("created_at", { ascending: false }).limit(1).maybeSingle();
        const r = await callSunmi({ action: "print-refund", order_id, amount: Math.abs(Number(last?.amount ?? ord.refund_total)), method: last?.method || "cash", reason: ord.refund_reason || null, by: ord.refunded_by || "manager", location_id: ord.location_id, device_key: deviceTok && deviceTok.key ? String(deviceTok.key) : null });
        return json(r.body || { ok: false });
      }
      case "order_payments_list": {
        const { order_id } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const { data: pays, error } = await admin.from("order_payments")
          .select("id, method, amount, tendered, note, kind, created_at").eq("order_id", order_id).order("created_at", { ascending: true });
        if (error) throw error;
        return json({ ok: true, payments: pays ?? [] });
      }

      // ---- TILL: void a SINGLE item that was already sent to the kitchen ----
      // Logs the reason to order_item_voids, deletes the line, recomputes total,
      // and prints a best-effort VOID chit so the kitchen stops making it.
      case "void_fired_item": {
        const { order_id, order_item_id, reason } = data || {};
        if (!order_id || !order_item_id) return json({ error: "order_id and order_item_id required" }, 400);
        if (!reason) return json({ error: "reason required" }, 400);
        const { data: ord, error: oErr } = await admin
          .from("menu_orders").select("id, paid_method, order_no, table_id, tablet_no, location_id").eq("id", order_id).single();
        if (oErr || !ord) return json({ error: "order not found" }, 404);
        if (ord.paid_method) return json({ error: "already_paid", message: "Paid orders can't be edited. Mark unpaid first." }, 409);
        // Grab the line for the audit snapshot before deleting.
        const { data: li } = await admin.from("menu_order_items")
          .select("name_snapshot, qty, line_total").eq("id", order_item_id).eq("order_id", order_id).single();
        // Audit the void.
        await admin.from("order_item_voids").insert({
          order_id, name_snapshot: li?.name_snapshot ?? null, qty: li?.qty ?? null,
          line_total: li?.line_total ?? null, reason: String(reason).slice(0, 200),
        });
        // Delete the line + recompute.
        await admin.from("menu_order_items").delete().eq("id", order_item_id).eq("order_id", order_id);
        const { data: rest } = await admin.from("menu_order_items").select("line_total").eq("order_id", order_id);
        const newTotal = Math.round((rest ?? []).reduce((s, r) => s + Number(r.line_total || 0), 0) * 100) / 100;
        await admin.from("menu_orders").update({ subtotal: newTotal, total: newTotal }).eq("id", order_id);
        // Best-effort VOID chit to the kitchen (never blocks the void).
        let printed = false;
        try {
          const pr = await callSunmi({
            action: "print-message",
            // The order's own store, not just whatever the caller sent: a void
            // with no location used to fan out to every kitchen printer we own.
            location_id: (data && data.location_id) || ord.location_id || null,
            title: "*** VOID ***",
            lines: [
              "Order #" + (ord.order_no ?? ""),
              (li?.qty ? li.qty + "x " : "") + (li?.name_snapshot ?? "item"),
              "Reason: " + String(reason).slice(0, 60),
              "DO NOT MAKE / STOP",
            ],
          });
          printed = !!pr.ok;
        } catch { /* printing is best-effort */ }
        return json({ ok: true, total: newTotal, void_chit_printed: printed });
      }


      // ---- TILL: remove a single line item from an UNPAID order ----
      case "remove_order_item": {
        const { order_item_id, order_id } = data || {};
        if (!order_item_id || !order_id) return json({ error: "order_item_id and order_id required" }, 400);
        // Guard: only edit unpaid orders.
        const { data: ord, error: oErr } = await admin
          .from("menu_orders").select("id, paid_method").eq("id", order_id).single();
        if (oErr || !ord) return json({ error: "order not found" }, 404);
        if (ord.paid_method) return json({ error: "already_paid", message: "Paid orders can't be edited. Mark unpaid first." }, 409);
        // Delete the line, then recompute the order total from the remaining lines.
        const { error: dErr } = await admin.from("menu_order_items").delete().eq("id", order_item_id).eq("order_id", order_id);
        if (dErr) throw dErr;
        const { data: rest } = await admin.from("menu_order_items").select("line_total").eq("order_id", order_id);
        const newTotal = Math.round((rest ?? []).reduce((s, r) => s + Number(r.line_total || 0), 0) * 100) / 100;
        const { error: uErr } = await admin.from("menu_orders").update({ subtotal: newTotal, total: newTotal }).eq("id", order_id);
        if (uErr) throw uErr;
        return json({ ok: true, total: newTotal });
      }

      // ---- TILL: set the quantity on a single line of an UNPAID order ----
      // ---- TILL/KDS: move an order to another table (customer moved) ----
      case "set_order_table": {
        const { order_id, table_id, notify_kitchen = true } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const { data: ord, error: oErr } = await admin.from("menu_orders").select("id, order_no, location_id, table_id, status").eq("id", order_id).maybeSingle();
        if (oErr) return json({ error: oErr.message }, 500);
        if (!ord) return json({ error: "order not found" }, 404);
        let oldLabel: string | null = null;
        if (ord.table_id) { const { data: ot } = await admin.from("menu_tables").select("label").eq("id", ord.table_id).maybeSingle(); oldLabel = ot?.label || null; }
        let newLabel: string | null = null;
        if (table_id) {
          const { data: t } = await admin.from("menu_tables").select("id, label, location_id").eq("id", table_id).maybeSingle();
          if (!t) return json({ error: "table not found" }, 400);
          if (ord.location_id && t.location_id !== ord.location_id) return json({ error: "That table belongs to another store" }, 400);
          newLabel = t.label;
        }
        const patch: Record<string, unknown> = { table_id: table_id || null };
        if (table_id) patch.order_type = "dine_in"; else patch.order_type = "takeaway";
        const { error } = await admin.from("menu_orders").update(patch).eq("id", order_id);
        if (error) throw error;
        // Tell the kitchen/pass so the plates go to the right table.
        if (notify_kitchen && (ord.status === "placed" || ord.status === "in_progress" || ord.status === "ready")) {
          try { await callSunmi({ action: "print-message", location_id: ord.location_id, title: "TABLE CHANGE", lines: ["Order #" + ord.order_no, (oldLabel ? "From: " + oldLabel : "Was: no table") + "  ->  " + (newLabel ? "To: " + newLabel : "Takeaway"), "Deliver to the new table"] }); } catch {}
        }
        return json({ ok: true, table_label: newLabel });
      }
      case "set_order_type": {
        const { order_id, order_type } = data || {};
        if (!order_id || !order_type) return json({ error: "order_id and order_type required" }, 400);
        const ot = String(order_type).toLowerCase();
        const norm = ot.includes("dine") ? "dine_in" : "takeaway";
        const { error: upErr } = await admin.from("menu_orders")
          .update({ order_type: norm }).eq("id", order_id);
        if (upErr) throw upErr;
        return json({ ok: true, order_type: norm });
      }

      case "set_order_item_qty": {
        const { order_item_id, order_id, qty } = data || {};
        const q = parseInt(qty);
        if (!order_item_id || !order_id || isNaN(q)) return json({ error: "order_item_id, order_id and qty required" }, 400);
        const { data: ord, error: oErr } = await admin
          .from("menu_orders").select("id, paid_method").eq("id", order_id).single();
        if (oErr || !ord) return json({ error: "order not found" }, 404);
        if (ord.paid_method) return json({ error: "already_paid", message: "Paid orders can't be edited. Mark unpaid first." }, 409);
        // Fetch the line to get its unit price (price_snapshot).
        const { data: li, error: lErr } = await admin
          .from("menu_order_items").select("id, price_snapshot").eq("id", order_item_id).eq("order_id", order_id).single();
        if (lErr || !li) return json({ error: "line not found" }, 404);
        if (q <= 0) {
          // qty 0 = remove the line
          await admin.from("menu_order_items").delete().eq("id", order_item_id).eq("order_id", order_id);
        } else {
          const newLineTotal = Math.round(Number(li.price_snapshot) * q * 100) / 100;
          const { error: upErr } = await admin.from("menu_order_items")
            .update({ qty: q, line_total: newLineTotal }).eq("id", order_item_id).eq("order_id", order_id);
          if (upErr) throw upErr;
        }
        const { data: rest } = await admin.from("menu_order_items").select("line_total").eq("order_id", order_id);
        const newTotal = Math.round((rest ?? []).reduce((s, r) => s + Number(r.line_total || 0), 0) * 100) / 100;
        await admin.from("menu_orders").update({ subtotal: newTotal, total: newTotal }).eq("id", order_id);
        return json({ ok: true, total: newTotal });
      }

      case "void_order": {
        const { order_id, reason } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        if (!reason) return json({ error: "reason required" }, 400);
        // Only UNPAID orders can be voided. Check first.
        const { data: ord, error: gErr } = await admin.from("menu_orders")
          .select("id, paid_method, status").eq("id", order_id).single();
        if (gErr || !ord) return json({ error: "order not found" }, 404);
        if (ord.paid_method) return json({ error: "already_paid", message: "Paid orders can't be voided. Mark unpaid first if needed." }, 409);
        const { error } = await admin.from("menu_orders").update({
          status: "cancelled", void_reason: String(reason).slice(0, 300), voided_at: new Date().toISOString(),
        }).eq("id", order_id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- TILL: today's sales summary for a location ----
      case "day_summary": {
        const { location_id, mode } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const { summary } = await dayTotals(location_id, mode === "trading_day" ? "trading_day" : "all");
        const { data: tgtRow } = await admin.from("menu_app_settings").select("value").eq("key", "kds_target_minutes:" + location_id).maybeSingle();
        const targetMin = Number(tgtRow?.value) > 0 ? Number(tgtRow!.value) : 12;
        if (summary.oldest) (summary as any).kitchen = await kitchenStats(location_id, summary.oldest, mode === "trading_day" ? summary.cutoff : new Date().toISOString(), targetMin);
        return json({ ok: true, summary });
      }

      // ---- KDS: a screen names itself, picks its station and what it shows ----
      case "kds_screen_self": {
        const { location_id, screen_key, label, station, routing, printer_sn, manager_pin } = data || {};
        if (!location_id || !screen_key) return json({ error: "location_id and screen_key required" }, 400);
        // Screen setup is manager-only: the store's manager PIN (store_pins) or the master PIN.
        if (!manager_pin) return json({ ok: false, error: "pin_required", message: "Manager PIN required" }, 401);
        if (String(manager_pin) !== String(ADMIN_PIN)) {
          const { data: sp } = await admin.from("store_pins").select("location_id").eq("pin", String(manager_pin)).eq("active", true).maybeSingle();
          if (!sp || sp.location_id !== location_id) return json({ ok: false, error: "bad_pin", message: "That PIN isn't a manager PIN for this store" }, 403);
        }
        const clean = (arr: unknown) => Array.isArray(arr) ? arr.map((x) => String(x)).filter(Boolean).slice(0, 500) : [];
        const r = routing && typeof routing === "object" ? { menus: clean((routing as any).menus), categories: clean((routing as any).categories), items: clean((routing as any).items) } : null;
        const row: Record<string, unknown> = { location_id, screen_key: String(screen_key), updated_at: new Date().toISOString() };
        if (label !== undefined) row.label = label ? String(label).slice(0, 40) : null;
        if (station !== undefined) row.station = station ? String(station).trim().toLowerCase().slice(0, 30) : null;
        if (routing !== undefined) row.routing = r && (r.menus.length || r.categories.length || r.items.length) ? r : null;
        if (printer_sn !== undefined) row.printer_sn = printer_sn ? String(printer_sn) : null;
        const { error } = await admin.from("kds_screens").upsert(row, { onConflict: "location_id,screen_key" });
        if (error) throw error;
        return json({ ok: true });
      }
      // ---- FOH: log service feedback against an order ----
      case "service_log_add": {
        const d = data || {};
        if (!d.location_id || !d.order_id) return json({ error: "location_id and order_id required" }, 400);
        let who: { id: string; name: string } | null = null;
        if (d.staff_pin) { const r = await staffForPin(String(d.staff_pin), d.location_id); if (r && r.ok) who = { id: r.id, name: r.name }; else return json({ ok: false, error: "Unknown PIN for this store" }, 400); }
        const { data: o } = await admin.from("menu_orders").select("order_no, created_at, kds_bumped_at, menu_tables(label)").eq("id", d.order_id).maybeSingle();
        const clean = (a: unknown) => Array.isArray(a) ? a.map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 20) : [];
        const row = {
          location_id: d.location_id, order_id: d.order_id, order_no: o?.order_no ?? null,
          table_label: (o as any)?.menu_tables?.label ?? d.table_label ?? null,
          rating: d.rating ? Math.max(1, Math.min(5, Number(d.rating))) : null,
          tags: clean(d.tags), category: d.category ? String(d.category).slice(0, 30) : null,
          severity: ["low", "medium", "high"].includes(d.severity) ? d.severity : null,
          note: d.note ? String(d.note).slice(0, 600) : null,
          action: d.action ? String(d.action).slice(0, 30) : null,
          action_value: d.action_value != null && d.action_value !== "" ? Number(d.action_value) : null,
          resolved: typeof d.resolved === "boolean" ? d.resolved : null,
          item_names: clean(d.item_names),
          logged_by: who ? who.name : (d.logged_by ? String(d.logged_by).slice(0, 60) : null),
          logged_by_member_id: who ? who.id : null,
          device_key: deviceTok?.key ? String(deviceTok.key) : null,
          source: ["pos", "kds", "app"].includes(d.source) ? d.source : "pos",
          ticket_secs: d.ticket_secs != null ? Math.round(Number(d.ticket_secs)) : null,
        };
        const { data: ins, error } = await admin.from("service_log").insert(row).select("id").single();
        if (error) throw error;
        return json({ ok: true, id: ins.id, logged_by: row.logged_by });
      }
      case "service_log_delete": {
        const { id, location_id } = data || {};
        if (!id || !location_id) return json({ error: "id and location_id required" }, 400);
        const { error } = await admin.from("service_log").delete().eq("id", id).eq("location_id", location_id);
        if (error) throw error;
        return json({ ok: true });
      }
      // ---- Pass screen: food is on the table ----
      case "mark_served": {
        const { order_id } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const { error } = await admin.from("menu_orders").update({ served_at: new Date().toISOString() }).eq("id", order_id).is("served_at", null);
        if (error) throw error;
        return json({ ok: true });
      }
      // ---- KDS: printers at this store (for the screen setup) ----
      case "printers_list": {
        const { location_id } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const { data: rows } = await admin.from("printers").select("*").eq("location_id", location_id).eq("active", true);
        return json({ ok: true, printers: (rows || []).map((p: any) => ({ sn: p.sn, name: p.name || p.label || null, station: p.station || null, online: p.online ?? null })) });
      }
      // ---- KDS: menu structure for the routing picker ----
      case "menu_catalog": {
        // Scope the catalog to the store's brand: a Tove screen never sees Chocoberry menus.
        const catalogLoc = (data && data.location_id) ? String(data.location_id) : null;
        const { data: locB } = catalogLoc ? await admin.from("menu_locations").select("brand_id").eq("id", catalogLoc).maybeSingle() : { data: null };
        const { data: brandRows } = await admin.from("menu_brands").select("id, name").order("name");
        const defaultBrand = (brandRows || []).find((b: any) => /chocoberry/i.test(String(b.name)))?.id || null;
        const storeBrand = catalogLoc ? (locB?.brand_id || defaultBrand) : null;
        const [{ data: menusAll }, { data: cats }, { data: items }] = await Promise.all([
          admin.from("menu_menus").select("id, name, sort_order, brand_id").order("sort_order", { ascending: true }),
          admin.from("menu_categories").select("id, name, menu_id, sort_order").order("sort_order", { ascending: true }),
          admin.from("menu_items").select("*").order("name", { ascending: true }),
        ]);
        const menus = (menusAll || []).filter((m: any) => !storeBrand || (m.brand_id || defaultBrand) === storeBrand);
        const menuIds = new Set(menus.map((m: any) => m.id));
        return json({ ok: true, menus: menus || [], categories: (cats || []).filter((c: any) => menuIds.has(c.menu_id)), items: (items || []).filter((i: any) => i.active !== false && i.is_active !== false).map((i: any) => ({ id: i.id, name: i.name, category_id: i.category_id })) });
      }

      // ---- Devices: activate with a one-time licence code ----
      case "device_activate": {
        const { code, fingerprint, app_version } = data || {};
        if (!code) return json({ ok: false, error: "Enter the licence code" }, 400);
        const { data: d } = await admin.from("kds_screens").select("*").eq("licence_code", String(code).trim().toUpperCase()).maybeSingle();
        if (!d) return json({ ok: false, error: "Code not recognised" }, 404);
        if (d.status === "active") return json({ ok: false, error: "Already active on \"" + (d.label || "Screen " + d.screen_key) + "\" since " + new Date(d.activated_at).toLocaleString("en-GB") + ". Revoke or replace it in the admin first." }, 409);
        if (d.status === "revoked") return json({ ok: false, error: "This licence was revoked. Ask a manager for a new code." }, 409);
        const secret = randSecret();
        const { error } = await admin.from("kds_screens").update({ status: "active", device_secret_hash: await sha256(secret), activated_at: new Date().toISOString(), fingerprint: fingerprint ? String(fingerprint).slice(0, 300) : null, app_version: app_version ? String(app_version).slice(0, 40) : null, last_seen_at: new Date().toISOString() }).eq("location_id", d.location_id).eq("screen_key", d.screen_key);
        if (error) throw error;
        await admin.from("device_events").insert({ location_id: d.location_id, screen_key: d.screen_key, event: "activated", detail: { fingerprint, app_version } });
        return json({ ok: true, device: { location_id: d.location_id, key: d.screen_key, kind: d.kind || "kds", label: d.label, secret } });
      }
      // ---- Devices: a screen that was set up before licences claims its row once ----
      case "device_claim_legacy": {
        const { location_id, screen_key, fingerprint, app_version } = data || {};
        if (!location_id || !screen_key) return json({ ok: false, error: "location_id and screen_key required" }, 400);
        const { data: d } = await admin.from("kds_screens").select("*").eq("location_id", location_id).eq("screen_key", String(screen_key)).maybeSingle();
        // Only screens registered before licensing may claim themselves; an
        // unknown browser with the URL must activate with a code.
        if (!d) return json({ ok: false, error: "not_registered" }, 404);
        if (d.device_secret_hash) return json({ ok: false, error: "already_claimed" }, 409);
        if (d.status === "revoked") return json({ ok: false, error: "revoked" }, 409);
        if (d.status === "unassigned" && d.licence_code) return json({ ok: false, error: "needs_code" }, 409);
        const secret = randSecret();
        const row = { location_id, screen_key: String(screen_key), kind: d.kind || "kds+pos", status: "active", device_secret_hash: await sha256(secret), activated_at: new Date().toISOString(), activated_by: "legacy", fingerprint: fingerprint ? String(fingerprint).slice(0, 300) : null, app_version: app_version ? String(app_version).slice(0, 40) : null, last_seen_at: new Date().toISOString(), label: d.label || ("Screen " + screen_key) };
        const { error } = await admin.from("kds_screens").upsert(row, { onConflict: "location_id,screen_key" });
        if (error) throw error;
        await admin.from("device_events").insert({ location_id, screen_key: String(screen_key), event: "activated", detail: { legacy: true } });
        return json({ ok: true, device: { location_id, key: String(screen_key), kind: row.kind, label: row.label, secret } });
      }
      // ---- Devices: heartbeat; also tells a revoked device to stop ----
      case "device_heartbeat": {
        const { location_id, key, secret, app_version } = data || {};
        const d = await verifyDevice(location_id, key, secret);
        if (!d) { const { data: row } = await admin.from("kds_screens").select("status").eq("location_id", location_id || "").eq("screen_key", String(key || "")).maybeSingle(); return json({ ok: false, status: row?.status || "unknown" }, 401); }
        const { data: full } = await admin.from("kds_screens").select("reload_requested_at, last_seen_at").eq("location_id", location_id).eq("screen_key", String(key)).maybeSingle();
        const reload = !!(full?.reload_requested_at && (!full.last_seen_at || new Date(full.reload_requested_at) > new Date(full.last_seen_at)));
        await admin.from("kds_screens").update({ last_seen_at: new Date().toISOString(), ...(app_version ? { app_version: String(app_version).slice(0, 40) } : {}), ...(reload ? { reload_requested_at: null } : {}) }).eq("location_id", location_id).eq("screen_key", String(key));
        return json({ ok: true, kind: d.kind, label: d.label, reload });
      }
      // ---- Admin: devices ----
      case "manager_pin_check": {
        const { location_id, manager_pin } = data || {};
        if (!location_id || !manager_pin) return json({ ok: false }, 400);
        if (String(manager_pin) === String(ADMIN_PIN)) return json({ ok: true, scope: "master" });
        if (await regionCoversLocation(String(manager_pin), String(location_id))) return json({ ok: true, scope: "region" });
        const { data: sp } = await admin.from("store_pins").select("location_id").eq("pin", String(manager_pin)).eq("active", true).maybeSingle();
        return json({ ok: !!(sp && sp.location_id === location_id), scope: "store" });
      }
      case "device_create": {
        const { location_id, kind, label } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const k = ["kds", "pos", "kds+pos", "kiosk"].includes(kind) ? kind : "kds";
        const { data: existing } = await admin.from("kds_screens").select("screen_key").eq("location_id", location_id);
        const used = new Set((existing ?? []).map((r: any) => String(r.screen_key)));
        let n = 1; const prefix = k === "pos" ? "pos-" : k === "kiosk" ? "kiosk-" : "";
        while (used.has(prefix + n)) n++;
        const sc = await storeCode(location_id);
        const code = sc + "-" + (k === "pos" ? "POS" : k === "kiosk" ? "KSK" : "KDS") + "-" + randCode(4);
        const { error } = await admin.from("kds_screens").insert({ location_id, screen_key: prefix + n, kind: k, label: label ? String(label) : (k === "kiosk" ? "Kiosk " + n : k === "pos" ? "Till " + n : "Screen " + n), status: "unassigned", licence_code: code });
        if (error) throw error;
        return json({ ok: true, screen_key: prefix + n, licence_code: code });
      }
      case "device_revoke": {
        const { location_id, screen_key } = data || {};
        if (!location_id || !screen_key) return json({ error: "location_id and screen_key required" }, 400);
        const { error } = await admin.from("kds_screens").update({ status: "revoked", revoked_at: new Date().toISOString(), device_secret_hash: null }).eq("location_id", location_id).eq("screen_key", String(screen_key));
        if (error) throw error;
        await admin.from("device_events").insert({ location_id, screen_key: String(screen_key), event: "revoked" });
        return json({ ok: true });
      }
      case "device_replace": {
        // New code, same row: settings/history kept, old hardware logged out.
        const { location_id, screen_key } = data || {};
        if (!location_id || !screen_key) return json({ error: "location_id and screen_key required" }, 400);
        const { data: d } = await admin.from("kds_screens").select("kind").eq("location_id", location_id).eq("screen_key", String(screen_key)).maybeSingle();
        const sc = await storeCode(location_id);
        const code = sc + "-" + (d?.kind === "pos" ? "POS" : "KDS") + "-" + randCode(4);
        const { error } = await admin.from("kds_screens").update({ status: "unassigned", licence_code: code, device_secret_hash: null, activated_at: null, fingerprint: null, revoked_at: null }).eq("location_id", location_id).eq("screen_key", String(screen_key));
        if (error) throw error;
        await admin.from("device_events").insert({ location_id, screen_key: String(screen_key), event: "replaced" });
        return json({ ok: true, licence_code: code });
      }
      case "device_set_kind": {
        const { location_id, screen_key, kind, label } = data || {};
        if (!location_id || !screen_key) return json({ error: "location_id and screen_key required" }, 400);
        const row: Record<string, unknown> = {};
        if (["kds", "pos", "kds+pos", "kiosk"].includes(kind)) row.kind = kind;
        if (label !== undefined) row.label = label ? String(label).slice(0, 40) : null;
        const { error } = await admin.from("kds_screens").update(row).eq("location_id", location_id).eq("screen_key", String(screen_key));
        if (error) throw error;
        return json({ ok: true });
      }
      case "device_reload": {
        const { location_id, screen_key } = data || {};
        if (!location_id || !screen_key) return json({ error: "location_id and screen_key required" }, 400);
        const { error } = await admin.from("kds_screens").update({ reload_requested_at: new Date().toISOString() }).eq("location_id", location_id).eq("screen_key", String(screen_key));
        if (error) throw error;
        return json({ ok: true });
      }
      case "device_events": {
        const { location_id, screen_key } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        let q = admin.from("device_events").select("*").eq("location_id", location_id).order("created_at", { ascending: false }).limit(100);
        if (screen_key) q = q.eq("screen_key", String(screen_key));
        const { data: rows } = await q;
        return json({ ok: true, events: rows || [] });
      }

      // ---- KDS: print the performance summary on the kitchen printer ----
      case "print_kitchen_summary": {
        const { location_id, title, lines } = data || {};
        if (!location_id || !Array.isArray(lines)) return json({ error: "location_id and lines required" }, 400);
        const r = await callSunmi({ action: "print-message", location_id, title: String(title || "KITCHEN SUMMARY").slice(0, 40), lines: lines.slice(0, 60) });
        return json({ ok: r.ok });
      }

      // ---- KDS: per-store target ticket time (minutes) ----
      case "set_kds_target": {
        const { location_id, minutes } = data || {};
        const m = Math.round(Number(minutes));
        if (!location_id || !(m >= 3 && m <= 60)) return json({ error: "location_id and minutes (3-60) required" }, 400);
        const { error } = await admin.from("menu_app_settings").upsert({ key: "kds_target_minutes:" + location_id, value: String(m) }, { onConflict: "key" });
        if (error) throw error;
        return json({ ok: true, minutes: m });
      }

      // ---- PRINT: retry one order / dismiss its alarm ----
      case "retry_print": {
        const { order_id } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const r = await callSunmi({ action: "print-order", order_id, force: true });
        return json({ ok: r.ok, result: r.body });
      }
      case "clear_print_flag": {
        const { order_id } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const { error } = await admin.from("menu_orders").update({ print_failed: false, print_error: null }).eq("id", order_id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- DEVICE (USB) PRINTERS ----
      // ---- What actually happened at the printers, for the KDS banner ----
      // The banner could say three orders did not print and nothing about
      // which printer or why, so the only way to find out was to ask someone
      // who could read a database. Every job already records its outcome and
      // its error; none of it was ever shown.
      case "print_events": {
        const { location_id, limit } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const { data: prs } = await admin.from("printers")
          .select("sn, label, station, active, online, last_online_at")
          .eq("location_id", location_id);
        const printers = (prs ?? []) as Array<Record<string, unknown>>;
        const sns = printers.map((p) => String(p.sn));
        if (!sns.length) return json({ ok: true, printers: [], events: [] });

        const { data: jobs } = await admin.from("print_jobs")
          .select("id, order_id, printer_sn, slip, status, error, created_at")
          .in("printer_sn", sns)
          .order("created_at", { ascending: false })
          .limit(Math.min(Number(limit) || 60, 200));
        const rows = (jobs ?? []) as Array<Record<string, unknown>>;

        // Order numbers, so an event reads as "#112" rather than a uuid.
        const ids = [...new Set(rows.map((r) => String(r.order_id ?? "")).filter(Boolean))];
        const numbers: Record<string, unknown> = {};
        if (ids.length) {
          const { data: ords } = await admin.from("menu_orders")
            .select("id, order_no, created_at, print_failed, print_error")
            .in("id", ids);
          for (const o of (ords ?? []) as Array<Record<string, unknown>>) numbers[String(o.id)] = o;
        }

        // The pause is derived from the last three outcomes rather than
        // stored, so it is computed the same way here as where it is applied -
        // one definition, not two that can drift.
        const paused: Record<string, boolean> = {};
        for (const sn of sns) {
          const last = rows.filter((r) => String(r.printer_sn) === sn && ["sent", "failed"].includes(String(r.status))).slice(0, 3);
          paused[sn] = last.length === 3 && last.every((r) => String(r.status) === "failed")
            && (Date.now() - Date.parse(String(last[0].created_at))) < 10 * 60 * 1000;
        }

        return json({
          ok: true,
          printers: printers.map((p) => ({ ...p, paused: paused[String(p.sn)] === true })),
          events: rows.map((r) => {
            const o = numbers[String(r.order_id ?? "")] as Record<string, unknown> | undefined;
            return {
              id: r.id, printer_sn: r.printer_sn, slip: r.slip, status: r.status,
              error: r.error, created_at: r.created_at,
              order_no: o?.order_no ?? null,
              order_at: o?.created_at ?? null,
            };
          }),
        });
      }

      case "local_print_jobs": {
        const { sn } = data || {};
        const r = await callSunmi({ action: "local-jobs", sn });
        return json(r.body || { ok: false });
      }
      case "local_print_done": {
        const { id, sn, ok: printed, error } = data || {};
        const r = await callSunmi({ action: "local-job-done", id, sn, ok: !!printed, error });
        return json(r.body || { ok: false });
      }
      case "usb_printer_release": {
        // Give a shared USB printer back. A USB interface has one owner, so
        // while this till holds it, anything else on the cable (another POS
        // during a side-by-side trial) cannot print. Releasing deactivates the
        // printer row so no further jobs are routed to it, and cancels any
        // already queued, so reclaiming it later does not flush a backlog of
        // stale tickets at whoever is standing there.
        const { location_id, screen_key, manager_pin } = data || {};
        if (!location_id || !screen_key) return json({ error: "location_id and screen_key required" }, 400);
        if (!manager_pin) return json({ ok: false, error: "pin_required", message: "Manager PIN required" }, 401);
        if (String(manager_pin) !== String(ADMIN_PIN)) {
          const { data: sp } = await admin.from("store_pins").select("location_id").eq("pin", String(manager_pin)).eq("active", true).maybeSingle();
          if (!sp || sp.location_id !== location_id) return json({ ok: false, error: "bad_pin", message: "That PIN isn't a manager PIN for this store" }, 403);
        }
        const rsn = "usb:" + String(screen_key);
        const { error: upErr } = await admin.from("printers")
          .update({ active: false, online: false }).eq("sn", rsn).eq("location_id", location_id);
        if (upErr) throw upErr;
        const { data: dropped } = await admin.from("print_jobs")
          .update({ status: "cancelled", error: "printer released" })
          .eq("printer_sn", rsn).eq("status", "queued").select("id");
        await admin.from("kds_screens").update({ printer_sn: null })
          .eq("location_id", location_id).eq("screen_key", String(screen_key));
        return json({ ok: true, sn: rsn, cancelled: (dropped ?? []).length });
      }
      case "usb_printer_register": {
        // A till/KDS registers the printer plugged into it. Needs the manager PIN like screen setup.
        const { location_id, screen_key, label, station, manager_pin, vendor_id, product_id, product_name } = data || {};
        if (!location_id || !screen_key) return json({ error: "location_id and screen_key required" }, 400);
        if (!manager_pin) return json({ ok: false, error: "pin_required", message: "Manager PIN required" }, 401);
        if (String(manager_pin) !== String(ADMIN_PIN)) {
          const { data: sp } = await admin.from("store_pins").select("location_id").eq("pin", String(manager_pin)).eq("active", true).maybeSingle();
          if (!sp || sp.location_id !== location_id) return json({ ok: false, error: "bad_pin", message: "That PIN isn't a manager PIN for this store" }, 403);
        }
        const sn = "usb:" + String(screen_key);
        // store_id is a NOT NULL text column (a slug of the store name, as the admin derives it).
        const { data: locRow } = await admin.from("menu_locations").select("name, slug").eq("id", location_id).maybeSingle();
        const storeId = (locRow?.slug as string) || String(locRow?.name || "store").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const row: Record<string, unknown> = { sn, store_id: storeId, shop_id: "1", location_id, label: label ? String(label).slice(0, 40) : "USB printer", station: station ? String(station).toLowerCase() : "kitchen", active: true, online: true, last_online_at: new Date().toISOString(), bound_at: new Date().toISOString(), notes: ["USB", product_name, vendor_id != null ? "vid " + vendor_id : null, product_id != null ? "pid " + product_id : null].filter(Boolean).join(" · ") };
        const { error } = await admin.from("printers").upsert(row, { onConflict: "sn" });
        if (error) throw error;
        await admin.from("kds_screens").update({ printer_sn: sn }).eq("location_id", location_id).eq("screen_key", String(screen_key));
        return json({ ok: true, sn });
      }
      case "device_printer_register": {
        // The Android print agent registers itself as a store printer (sn "agent:<id>").
        const { location_id, sn, label, station, manager_pin, model, paper_mm, outputs } = data || {};
        if (!location_id || !sn || !/^agent:/.test(String(sn))) return json({ error: "location_id and agent sn required" }, 400);
        if (!manager_pin) return json({ ok: false, error: "pin_required", message: "Manager PIN required" }, 401);
        if (String(manager_pin) !== String(ADMIN_PIN)) {
          const { data: sp } = await admin.from("store_pins").select("location_id").eq("pin", String(manager_pin)).eq("active", true).maybeSingle();
          if (!sp || sp.location_id !== location_id) return json({ ok: false, error: "bad_pin", message: "That PIN isn't a manager PIN for this store" }, 403);
        }
        const { data: locRow } = await admin.from("menu_locations").select("name, slug").eq("id", location_id).maybeSingle();
        const storeId = (locRow?.slug as string) || String(locRow?.name || "store").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        // What the agent can see and Admin cannot: the USB printers attached
        // to that till and the Windows queues on it. Refreshed on every
        // registration so the list in Admin reflects what is plugged in now.
        const outs = Array.isArray(outputs)
          ? (outputs as unknown[]).slice(0, 40).map((o) => {
              const r = o as Record<string, unknown>;
              return {
                kind: String(r.kind ?? "").slice(0, 16),
                name: String(r.name ?? "").slice(0, 120),
                target: String(r.target ?? "").slice(0, 200),
              };
            }).filter((o) => o.target)
          : null;
        const row: Record<string, unknown> = {
          sn: String(sn), store_id: storeId, shop_id: "1", location_id,
          label: label ? String(label).slice(0, 40) : "Print agent",
          station: station ? String(station).toLowerCase() : "kitchen",
          active: true, online: true,
          last_online_at: new Date().toISOString(), bound_at: new Date().toISOString(),
          notes: "agent · " + String(model || ""), paper_mm: Number(paper_mm) || 80,
        };
        if (outs) row.agent_outputs = outs;
        const { error } = await admin.from("printers").upsert(row, { onConflict: "sn" });
        if (error) throw error;
        // Hand back whatever Admin has already chosen, so an agent that is
        // being re-registered adopts it straight away rather than printing to
        // the wrong thing until its next poll.
        const { data: cur } = await admin.from("printers").select("agent_target").eq("sn", String(sn)).maybeSingle();
        return json({ ok: true, sn, store: locRow?.name || "", target: (cur as { agent_target?: unknown } | null)?.agent_target ?? null });
      }
      // ---- KIOSK: numbered slip on the kiosk's own printer(s) ----
      case "kiosk_slip": {
        const { order_id, location_id, pay_mode, table_no, test } = data || {};
        const key = deviceTok && deviceTok.key ? String(deviceTok.key) : null;
        if (!location_id || !key) return json({ error: "kiosk device required" }, 400);
        // A printer tied to this kiosk wins. Without one the slip used to be
        // dropped silently, so a store with a perfectly good counter printer
        // sent customers to the till with nothing in their hand — fall back to
        // the store's receipt printer, then to any printer it has.
        const { data: all } = await admin.from("printers")
          .select("sn, print_receipt, print_role, station, source_screen_key")
          .eq("location_id", location_id).eq("active", true);
        const mine = (all || []).filter((p: any) => String(p.source_screen_key || "") === key);
        const receipts = (all || []).filter((p: any) => p.print_receipt === true || String(p.print_role || "").toLowerCase() === "receipt");
        const counter = (all || []).filter((p: any) => String(p.station || "") === "counter");
        const prs = mine.length ? mine : receipts.length ? receipts : counter.length ? counter : (all || []);
        if (!prs.length) return json({ ok: false, error: "no_printer", message: "This store has no active printer, so the kiosk slip could not print." });
        const { data: bn } = await admin.from("menu_app_settings").select("value").eq("key", "brand_name:" + location_id).maybeSingle();
        // Timestamp in the store zone, so a slip printed in Sharjah does not
        // carry London time. No zone set means London, as every UK store has.
        const { data: kz } = await admin.from("menu_locations").select("timezone").eq("id", location_id).maybeSingle();
        const kZone = String((kz as any)?.timezone || "").trim() || "Europe/London";
        let lines: string[] = [];
        let title = "YOUR ORDER";
        if (test) { lines = ["Kiosk printer test", new Date().toLocaleString("en-GB", { timeZone: kZone })]; title = "KIOSK TEST"; }
        else {
          const { data: o } = await admin.from("menu_orders").select("order_no, total, order_type, discount_amount").eq("id", order_id).maybeSingle();
          const { data: lr } = await admin.from("menu_locations").select("name").eq("id", location_id).maybeSingle();
          const locRowName = lr?.name || "";
          const { data: its } = await admin.from("menu_order_items").select("name_snapshot, qty, modifiers_snapshot, note").eq("order_id", order_id);
          if (!o) return json({ error: "order not found" }, 404);
          title = "ORDER " + o.order_no;
          const due = Number(o.total || 0) - Number((o as any).discount_amount || 0);
          lines = [
            ...(pay_mode === "counter" ? [
              "********************************",
              "*  NOT PAID YET  *",
              "*  PAY AT THE COUNTER  *",
              "********************************",
              "",
              "AMOUNT TO PAY:  £" + due.toFixed(2),
              "Show this slip at the till.",
              "We start making it once it's paid.",
            ] : ["PAID - THANK YOU", "Total: £" + due.toFixed(2)]),
            "",
            o.order_type === "dine_in" ? ("Eat in" + (table_no ? "  -  TABLE " + table_no : "")) : ("Take away" + (data?.name ? "  -  " + String(data.name).toUpperCase() : "")),
            "--------------------------------",
            ...(its || []).map((it: any) => `${it.qty} x ${it.name_snapshot}` + (Array.isArray(it.modifiers_snapshot) && it.modifiers_snapshot.length ? " (" + it.modifiers_snapshot.join(", ") + ")" : "") + (it.note ? " - " + it.note : "")),
            "--------------------------------",
            String(bn?.value || "Chocoberry") + (locRowName ? " · " + locRowName : "") + " · " + new Date().toLocaleString("en-GB", { timeZone: kZone }),
          ];
        }
        const r = await callSunmi({ action: "print-message", location_id, title, lines, sns: prs.map((p: any) => p.sn) });
        return json({ ok: r.ok, printers: prs.length });
      }
      case "usb_printer_test": {
        const { sn, location_id } = data || {};
        const { data: bn } = await admin.from("menu_app_settings").select("value").eq("key", "brand_name:" + location_id).maybeSingle();
        const { data: l } = await admin.from("menu_locations").select("name").eq("id", location_id).maybeSingle();
        const common = { store_name: l?.name || "", brand_name: bn?.value || "Chocoberry" };
        if (sn) {
          const r = await callSunmi({ action: "test", sn, ...common });
          return json(r.body || { ok: false });
        }
        // No sn given: test every printer at this store. The recovery button
        // on the POS failure banner has no printer picked, and staff should
        // not have to work out which unit stopped. A test also never checks
        // the failure pause, so a slip coming out is what releases a printer
        // that backed off.
        const { data: ps } = await admin.from("printers")
          .select("sn, label").eq("active", true).eq("location_id", location_id);
        const results: any[] = [];
        for (const pr of ps || []) {
          try {
            const r = await callSunmi({ action: "test", sn: String((pr as any).sn), ...common });
            results.push({ sn: (pr as any).sn, label: (pr as any).label, ok: !!(r.body as any)?.ok });
          } catch (e) {
            results.push({ sn: (pr as any).sn, label: (pr as any).label, ok: false, error: String(e) });
          }
        }
        return json({ ok: results.some((r) => r.ok), printers: results });
      }

      // ---- Clear every print-failure flag at a store, in one call ----
      // The banner Dismiss looped one order at a time and stopped at 20, so a
      // long outage left the alarm up with orders it had never touched.
      case "clear_print_flags": {
        const { location_id } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const { error } = await admin.from("menu_orders")
          .update({ print_failed: false, print_error: null })
          .eq("location_id", location_id).eq("print_failed", true);
        if (error) throw error;
        return json({ ok: true });
      }
      // ---- PRINT QUEUE: wipe pending cloud jobs + mark open orders as printed ----
      case "clear_print_queue": {
        const { location_id } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const r = await callSunmi({ action: "clear-queue", location_id });
        return json({ ok: r.ok, ...(r.body || {}) });
      }
      // ---- PRINT SAFETY NET: staff-triggered re-push of any unprinted orders ----
      case "sweep_unprinted": {
        const r = await callSunmi({ action: "sweep-unprinted", since_minutes: (data && data.since_minutes) || 180 });
        return json({ ok: r.ok, result: r.body });
      }

      // ---- TILL: close the day — snapshot totals, then archive open orders ----
      case "close_day": {
        const { location_id, cash_counted = null, float_amount = null, note = null, mode } = data || {};
        const closed_by = staffCloser ? staffCloser.name : (data?.closed_by || (scope === "master" ? "Admin" : scope === "region" ? (scopeLabel || "Regional manager") : "Manager"));
        if (!location_id) return json({ error: "location_id required" }, 400);
        const { ids, summary } = await dayTotals(location_id, mode === "trading_day" ? "trading_day" : "all");
        if (!ids.length) return json({ error: "nothing_to_close", message: "No orders to close for that period." }, 409);
        // Kitchen speed for the period being closed.
        const { data: tgtRow } = await admin.from("menu_app_settings").select("value").eq("key", "kds_target_minutes:" + location_id).maybeSingle();
        const targetMin = Number(tgtRow?.value) > 0 ? Number(tgtRow!.value) : 12;
        const kFrom = summary.oldest || new Date(Date.now() - 24 * 3600000).toISOString();
        const kTo = mode === "trading_day" ? summary.cutoff : new Date().toISOString();
        const kitchen = await kitchenStats(location_id, kFrom, kTo, targetMin);
        (summary as any).kitchen = kitchen;
        const now = new Date().toISOString();
        const counted = cash_counted == null ? null : round2(cash_counted);
        const flt = float_amount == null ? null : round2(float_amount);
        // Expected drawer = float left in at the start + cash taken today.
        const expected = counted == null ? null : round2((flt || 0) + summary.cash);
        const variance = counted == null ? null : round2(counted - (expected as number));
        const { data: closure, error: cErr } = await admin.from("till_closures").insert({
          device_key: deviceTok?.key ? String(deviceTok.key) : null,
          location_id, closed_at: now,
          total_taken: summary.total, cash_total: summary.cash, card_total: summary.card,
          paid_count: summary.paid_count, unpaid_total: summary.unpaid_total, unpaid_count: summary.unpaid_count,
          discount_total: summary.discount_total, refund_total: summary.refund_total, refund_count: summary.refund_count, order_count: summary.order_count,
          cash_counted: counted, float_amount: flt, cash_expected: expected, cash_variance: variance,
          closed_by: closed_by ? String(closed_by).slice(0, 80) : null, note: note ? String(note).slice(0, 300) : null,
          other_total: summary.other, cancelled_count: summary.cancelled_count,
          period_end: mode === "trading_day" ? summary.cutoff : now,
          report: { ...summary, cash_counted: counted, float_amount: flt, cash_expected: expected, cash_variance: variance, closed_by, note },
          closed_by_member_id: staffCloser ? staffCloser.id : null,
        }).select("id").single();
        if (cErr) throw cErr;
        if (ids.length) {
          for (let i = 0; i < ids.length; i += 100) {
            const { error: uErr } = await admin.from("menu_orders").update({ closed_at: now }).in("id", ids.slice(i, i + 100));
            if (uErr) throw uErr;
          }
        }
        let printed: boolean | null = null;
        try {
          const { data: loc } = await admin.from("menu_locations").select("name").eq("id", location_id).single();
          const pr = await callSunmi({
            action: "print-summary", store_name: loc?.name || "", location_id,
            summary: { ...summary, cash_counted: counted, float_amount: flt, cash_expected: expected, cash_variance: variance, closed_by, note },
          });
          printed = pr.ok;
        } catch { printed = false; }
        return json({ ok: true, closure_id: closure?.id, closed_orders: ids.length, printed,
          summary: { ...summary, cash_counted: counted, float_amount: flt, cash_expected: expected, cash_variance: variance } });
      }

      // ---- TILL: reprint a Z-report from a saved closure ----
      case "reprint_closure": {
        const { closure_id } = data || {};
        if (!closure_id) return json({ error: "closure_id required" }, 400);
        const { data: c } = await admin.from("till_closures").select("id, location_id, closed_at, report").eq("id", closure_id).maybeSingle();
        if (!c) return json({ error: "closure not found" }, 404);
        if (scope === "store" && c.location_id !== scopeLocationId) return json({ error: "forbidden" }, 403);
        if (scope === "region" && fence && !fence.locs.has(String(c.location_id))) return json({ error: "forbidden: outside your region" }, 403);
        const { data: loc } = await admin.from("menu_locations").select("name").eq("id", c.location_id).single();
        const pr = await callSunmi({ action: "print-summary", store_name: loc?.name || "", location_id: c.location_id, summary: { ...(c.report || {}), reprint: true, closed_at: c.closed_at } });
        return json({ ok: pr.ok });
      }

      // ---- MENUS ----
      case "create_menu": {
        const { brand_id, name, sort_order } = data || {};
        if (!name) return json({ error: "name required" }, 400);
        const { data: row, error } = await admin.from("menu_menus")
          .insert({ brand_id: brand_id ?? null, name, sort_order: sort_order ?? 0, active: true })
          .select("id").single();
        if (error) throw error;
        return json({ ok: true, id: row.id });
      }
      case "update_menu": {
        const { id, fields } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["name", "pos_name", "sort_order", "active", "available_from", "available_to", "days_of_week", "pos_menu_id"];
        const patch: any = {};
        for (const k of allowed) if (k in (fields || {})) patch[k] = fields[k];
        const { error } = await admin.from("menu_menus").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "delete_menu": {
        const { id } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const { error } = await admin.from("menu_menus").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- CATEGORY delete ----
      case "delete_category": {
        const { id } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const { error } = await admin.from("menu_categories").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- MODIFIER GROUPS ----
      case "create_mod_group": {
        const { brand_id, name, min_select, max_select, required } = data || {};
        if (!name) return json({ error: "name required" }, 400);
        const { data: row, error } = await admin.from("menu_modifier_groups")
          .insert({ brand_id: brand_id ?? null, name, min_select: min_select ?? 0, max_select: max_select ?? 1, required: required ?? false })
          .select("id").single();
        if (error) throw error;
        return json({ ok: true, id: row.id });
      }
      case "update_mod_group": {
        const { id, fields } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["name", "name_ar", "min_select", "max_select", "required", "pos_group_id"];
        const patch: any = {};
        // Accept both shapes: the Modifiers screen calls this flat
        // ({id, name, ...}) while newer callers send {id, fields}. Without the
        // fallback a flat call produces an empty patch and silently saves
        // nothing.
        const src: any = (fields && typeof fields === "object") ? fields : (data || {});
        for (const k of allowed) if (k in src) patch[k] = src[k];
        const { error } = await admin.from("menu_modifier_groups").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "delete_mod_group": {
        const { id } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const { error } = await admin.from("menu_modifier_groups").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- MODIFIER OPTIONS ----
      case "create_mod_option": {
        const { group_id, name, price_delta, sort_order } = data || {};
        if (!group_id || !name) return json({ error: "group_id and name required" }, 400);
        const { data: row, error } = await admin.from("menu_modifiers")
          .insert({ group_id, name, price_delta: price_delta ?? 0, sort_order: sort_order ?? 0 })
          .select("id").single();
        if (error) throw error;
        return json({ ok: true, id: row.id });
      }
      case "update_mod_option": {
        const { id, fields } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["name", "name_ar", "price_delta", "sort_order", "pos_id"];
        const patch: any = {};
        // Same dual shape as update_mod_group — the existing Modifiers screen
        // sends these fields flat, so reading only `fields` meant option edits
        // there saved nothing at all.
        const src: any = (fields && typeof fields === "object") ? fields : (data || {});
        for (const k of allowed) if (k in src) patch[k] = src[k];
        const { error } = await admin.from("menu_modifiers").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "delete_mod_option": {
        const { id } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const { error } = await admin.from("menu_modifiers").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- ITEM <-> MODIFIER GROUP links ----
      case "set_item_mod_groups": {
        const { item_id, group_ids } = data || {};
        if (!item_id) return json({ error: "item_id required" }, 400);
        const ids: string[] = Array.isArray(group_ids) ? group_ids : [];
        // Replace the set: delete existing links, insert the new ones.
        const del = await admin.from("menu_item_modifiers").delete().eq("item_id", item_id);
        if (del.error) throw del.error;
        if (ids.length) {
          const rows = ids.map((g) => ({ item_id, group_id: g }));
          const { error } = await admin.from("menu_item_modifiers").insert(rows);
          if (error) throw error;
        }
        return json({ ok: true });
      }

      // ---- STORES (menu_locations) ----
      case "create_store": {
        const { name, slug, brand_id } = data || {};
        if (!name) return json({ error: "name required" }, 400);
        const storeRow: Record<string, unknown> = { name, slug: slug ?? null, brand_id: brand_id ?? null, active: true };
        if (scope === "region" && fence?.timezone) storeRow.timezone = fence.timezone;
        const { data: row, error } = await admin.from("menu_locations")
          .insert(storeRow)
          .select("id").single();
        if (error) throw error;
        return json({ ok: true, id: row.id });
      }
      case "update_store": {
        const { id, fields } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["name", "slug", "active", "brand_id"];
        const patch: any = {};
        // The Stores screen renames with a flat { id, name }; reading only
        // `fields` made that rename save nothing.
        const src: any = (fields && typeof fields === "object") ? fields : (data || {});
        for (const k of allowed) if (k in src) patch[k] = src[k];
        if (!Object.keys(patch).length) return json({ error: "nothing to update" }, 400);
        const { error } = await admin.from("menu_locations").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "delete_store": {
        const { id } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const { error } = await admin.from("menu_locations").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- STORE PINS (master-only): manage per-store manager logins ----
      case "store_pin_list": {
        const { data: rows, error } = await admin.from("store_pins")
          .select("id, location_id, pin, label, active, created_at").order("created_at");
        if (error) throw error;
        const F = fence;
        return json({ ok: true, pins: scope === "region" && F ? (rows ?? []).filter((r: any) => F.locs.has(String(r.location_id))) : (rows ?? []) });
      }
      case "store_pin_set": {
        const { location_id, pin: newPin, label } = data || {};
        if (!location_id || !newPin) return json({ error: "location_id and pin required" }, 400);
        if (String(newPin) === String(ADMIN_PIN)) return json({ error: "cannot reuse the master PIN" }, 400);
        if (await regionForPin(newPin)) return json({ error: "that PIN is already a regional login — pick another" }, 400);
        // One PIN per store: replace any existing pin for this location.
        await admin.from("store_pins").delete().eq("location_id", location_id);
        const { error } = await admin.from("store_pins")
          .insert({ location_id, pin: String(newPin), label: label ?? null, active: true });
        if (error) throw error;
        return json({ ok: true });
      }
      case "store_pin_delete": {
        const { location_id } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const { error } = await admin.from("store_pins").delete().eq("location_id", location_id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- STORE <-> MENU assignment ----
      case "set_store_menus": {
        const { location_id, menu_ids } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const ids: string[] = Array.isArray(menu_ids) ? menu_ids : [];
        const del = await admin.from("menu_location_menus").delete().eq("location_id", location_id);
        if (del.error) throw del.error;
        if (ids.length) {
          const rows = ids.map((m) => ({ location_id, menu_id: m }));
          const { error } = await admin.from("menu_location_menus").insert(rows);
          if (error) throw error;
        }
        return json({ ok: true });
      }

      // ---- TABLES / QR tokens ----
      case "release_token": {
        const { id } = data || {};
        if (!id) return json({ error: "id required" }, 400);
        const { error } = await admin.from("menu_tables")
          .update({ claimed_by: null, claimed_at: null }).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "create_token": {
        const { location_id, label } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        // is_table:false marks this as a TABLET link (not a dining table). The admin
        // splits the two lists on this flag; without it the row defaults to null and
        // wrongly shows up under Dining Tables.
        const { data: row, error } = await admin.from("menu_tables")
          .insert({ location_id, label: label ?? "Tablet", qr_token: token, active: true, is_table: false })
          .select("id, qr_token").single();
        if (error) throw error;
        return json({ ok: true, id: row.id, qr_token: row.qr_token });
      }
      case "delete_token": {
        const { id } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const { error } = await admin.from("menu_tables").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- REORDER (generic sort_order updater) ----
      case "reorder": {
        const { table, ids } = data || {};
        const okTables = ["menu_menus", "menu_categories", "menu_items"];
        if (!okTables.includes(table) || !Array.isArray(ids)) return json({ error: "bad reorder" }, 400);
        for (let i = 0; i < ids.length; i++) {
          const { error } = await admin.from(table).update({ sort_order: i }).eq("id", ids[i]);
          if (error) throw error;
        }
        return json({ ok: true });
      }

      // ---- DINING TABLES (real tables, is_table=true) ----
      case "create_table": {
        const { location_id, label } = data || {};
        if (!location_id || !label) return json({ error: "location_id and label required" }, 400);
        const token = "t_" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
        const { data: row, error } = await admin.from("menu_tables")
          .insert({ location_id, label, qr_token: token, active: true, is_table: true })
          .select("id, qr_token").single();
        if (error) throw error;
        return json({ ok: true, id: row.id, qr_token: row.qr_token });
      }
      case "update_table": {
        const { id, fields } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["label", "active"];
        const patch: any = {};
        for (const k of allowed) if (k in (fields || {})) patch[k] = fields[k];
        const { error } = await admin.from("menu_tables").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "delete_table": {
        const { id } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const { error } = await admin.from("menu_tables").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---- POS CATEGORY MERGES: display-only grouping of subcategories ----
      case "merges_list": {
        const { data: rows, error } = await admin.from("pos_category_merges")
          .select("id, menu_id, new_name, category_ids, sort_order")
          .order("sort_order", { ascending: true });
        if (error) throw error;
        const F = fence;
        const list = scope === "region" && F
          ? (rows || []).filter((r: any) => Array.isArray(r.category_ids) && r.category_ids.every((c: any) => F.cats.has(String(c))))
          : (rows || []);
        return json({ merges: list });
      }
      case "merge_save": {
        const { id, menu_id, new_name, category_ids, sort_order } = data || {};
        if (!new_name || !Array.isArray(category_ids) || category_ids.length < 2)
          return json({ error: "need a name and at least 2 categories" }, 400);
        const row: any = { menu_id: menu_id ?? null, new_name, category_ids, sort_order: sort_order ?? 0 };
        if (id) {
          const { error } = await admin.from("pos_category_merges").update(row).eq("id", id);
          if (error) throw error;
        } else {
          const { error } = await admin.from("pos_category_merges").insert(row);
          if (error) throw error;
        }
        return json({ ok: true });
      }
      case "merge_delete": {
        const { id } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const { error } = await admin.from("pos_category_merges").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: "unknown action: " + action }, 400);
    }
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
