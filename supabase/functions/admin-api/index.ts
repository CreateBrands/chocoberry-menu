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
    "mark_paid", "take_payment", "mark_unpaid", "order_payments_list",
    "remove_order_item", "set_order_item_qty", "void_fired_item",
    "set_order_type",
    "day_summary",
    "merges_list", "merge_save", "merge_delete",
  ]);
  const isPosCall = pos === true && POS_ACTIONS.has(action);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Resolve the PIN to a SCOPE ──────────────────────────────────────────
  //   master  → the env ADMIN_PIN; can see and change everything.
  //   store   → a row in store_pins; can ONLY touch its own location_id.
  // Isolation is enforced here on the server so a store manager can never
  // reach another store's data, regardless of what the browser sends.
  let scope: "master" | "store" | null = null;
  let scopeLocationId: string | null = null;
  if (pin && pin === ADMIN_PIN) {
    scope = "master";
  } else if (pin) {
    const { data: sp } = await admin.from("store_pins")
      .select("location_id, active").eq("pin", pin).eq("active", true).maybeSingle();
    if (sp?.location_id) { scope = "store"; scopeLocationId = sp.location_id as string; }
  }
  if (!isPosCall && !scope) return json({ error: "unauthorized" }, 401);

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
    switch (action) {
      // ---- READ: everything the admin UI needs in one call ----
      case "load": {
        const [cats, items, locs, overrides, settings, menus, modGroups, modOptions, itemMods, tables, locMenus, modOverrides, bands, bandPrices, bandOptPrices, kdsScreens, printers, bandItems, bandMenus] = await Promise.all([
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
          admin.from("printers").select("sn,label,station,active,location_id"),
          // Appended AFTER printers, with their names appended in the same
          // order above — never inserted mid-array. See the note above.
          admin.from("menu_band_items").select("*"),
          admin.from("menu_band_menus").select("*"),
        ]);
        for (const r of [cats, items, locs, overrides]) if (r.error) throw r.error;
        // When a store manager is logged in, filter every location-specific
        // dataset down to their store, and expose only their own location.
        // The master menu (items/categories/menus/modifiers) is still returned
        // so they can see items and set their own overrides — but those tables
        // are read-only for them (enforced by STORE_ALLOWED above).
        const only = (arr: any[] | null | undefined) =>
          scope === "store" ? (arr ?? []).filter((x: any) => x.location_id === scopeLocationId) : (arr ?? []);
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
          printers: only(printers.data),
          modifierOverrides: only(modOverrides.data),
          priceBands: bands.data ?? [],
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
        const { brand_id, name, sort_order } = data;
        if (!name) return json({ error: "name required" }, 400);
        const { data: row, error } = await admin.from("menu_categories")
          .insert({ brand_id: brand_id ?? null, name, sort_order: sort_order ?? 0, active: true })
          .select("id").single();
        if (error) throw error;
        return json({ ok: true, id: row.id });
      }

      // ---- OVERRIDE: set (upsert) per-store price/availability ----
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
        const { data: printers, error } = await admin
          .from("printers").select("*").order("created_at", { ascending: true });
        if (error) throw error;
        // Query Sunmi status for each printer in parallel (best-effort).
        const withStatus = await Promise.all((printers ?? []).map(async (p: any) => {
          let online: boolean | null = null;
          try {
            const r = await callSunmi({ action: "status", sn: p.sn });
            const d = r.body?.data ?? r.body;
            const v = d?.is_online ?? d?.online ?? d?.status;
            online = v === 1 || v === true || v === "online" ? true
                   : v === 0 || v === false || v === "offline" ? false : null;
          } catch { online = null; }
          return { ...p, online };
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
        const allowed = ["label", "store_id", "location_id", "active", "station", "copies", "print_role", "auto_print"];
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
        const r = await callSunmi({ action: "test", sn });
        if (!r.ok || (r.body?.code !== undefined && r.body.code !== 1 && r.body.code !== 0)) {
          return json({ error: r.body?.msg || ("test failed (HTTP " + r.status + ")") }, 400);
        }
        return json({ ok: true });
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
        const allowed = ["name", "station", "sort_order", "active", "image_url"];
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
        const { name, band_kind } = data || {};
        if (!name) return json({ error: "name required" }, 400);
        const { error } = await admin.from("menu_price_bands")
          .insert({ name: String(name).trim(), band_kind: band_kind === "menu" ? "menu" : "price" });
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
          .from("menu_orders").select("id, total, amount_paid, status").eq("id", order_id).single();
        if (oErr || !ord) return json({ error: "order not found" }, 404);
        if (ord.status === "cancelled") return json({ error: "cancelled", message: "This order was cancelled." }, 409);
        const total = Math.round(Number(ord.total || 0) * 100) / 100;
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
        const { data: pays } = await admin.from("order_payments").select("amount, method").eq("order_id", order_id);
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
        return json({ ok: true, paid: paidNow, remaining: Math.max(0, remaining), fully_paid: fullyPaid, is_split: isSplit, methods: [...distinctMethods] });
      }

      // ---- TILL: list the tenders recorded against an order ----
      case "order_payments_list": {
        const { order_id } = data || {};
        if (!order_id) return json({ error: "order_id required" }, 400);
        const { data: pays, error } = await admin.from("order_payments")
          .select("id, method, amount, tendered, note, created_at").eq("order_id", order_id).order("created_at", { ascending: true });
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
          .from("menu_orders").select("id, paid_method, order_no, table_id, tablet_no").eq("id", order_id).single();
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
            location_id: (data && data.location_id) || null,
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
      case "set_order_type": {
        const { order_id, order_type } = data || {};
        if (!order_id || !order_type) return json({ error: "order_id and order_type required" }, 400);
        const ot = String(order_type).toLowerCase();
        const norm = ot.includes("dine") ? "dine-in" : "takeaway";
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
        const { location_id } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        // Summary covers OPEN orders (not yet closed off). Closing the day zeroes this.
        const { data: rows, error } = await admin
          .from("menu_orders")
          .select("total, paid_method, paid_amount")
          .eq("location_id", location_id)
          .is("closed_at", null);
        if (error) throw error;
        let cash = 0, card = 0, paidCount = 0, unpaidTotal = 0, unpaidCount = 0, discountTotal = 0;
        for (const r of rows || []) {
          if (r.paid_method === "cash" || r.paid_method === "card") {
            const amt = Number(r.paid_amount ?? r.total) || 0;
            if (r.paid_method === "cash") cash += amt; else card += amt;
            paidCount++;
            const orig = Number(r.total) || 0;
            if (amt < orig) discountTotal += (orig - amt);
          } else {
            unpaidTotal += Number(r.total) || 0;
            unpaidCount++;
          }
        }
        const round = (n) => Math.round(n * 100) / 100;
        return json({
          ok: true,
          summary: {
            total: round(cash + card),
            cash: round(cash), card: round(card),
            paid_count: paidCount,
            unpaid_total: round(unpaidTotal), unpaid_count: unpaidCount,
            discount_total: round(discountTotal),
          },
        });
      }

      // ---- PRINT SAFETY NET: staff-triggered re-push of any unprinted orders ----
      case "sweep_unprinted": {
        const r = await callSunmi({ action: "sweep-unprinted", since_minutes: (data && data.since_minutes) || 180 });
        return json({ ok: r.ok, result: r.body });
      }

      // ---- TILL: close the day — snapshot totals, then archive open orders ----
      case "close_day": {
        const { location_id } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        // Compute totals over the currently-open orders (same basis as day_summary).
        const { data: rows, error: rErr } = await admin
          .from("menu_orders")
          .select("id, total, paid_method, paid_amount")
          .eq("location_id", location_id)
          .is("closed_at", null);
        if (rErr) throw rErr;
        let cash = 0, card = 0, paidCount = 0, unpaidTotal = 0, unpaidCount = 0, discountTotal = 0;
        const ids = [];
        for (const r of rows || []) {
          ids.push(r.id);
          if (r.paid_method === "cash" || r.paid_method === "card") {
            const amt = Number(r.paid_amount ?? r.total) || 0;
            if (r.paid_method === "cash") cash += amt; else card += amt;
            paidCount++;
            const orig = Number(r.total) || 0;
            if (amt < orig) discountTotal += (orig - amt);
          } else {
            unpaidTotal += Number(r.total) || 0;
            unpaidCount++;
          }
        }
        const round = (n) => Math.round(n * 100) / 100;
        const now = new Date().toISOString();
        // Save a permanent closure record for the dashboard/history.
        const { data: closure, error: cErr } = await admin.from("till_closures").insert({
          location_id,
          closed_at: now,
          total_taken: round(cash + card),
          cash_total: round(cash),
          card_total: round(card),
          paid_count: paidCount,
          unpaid_total: round(unpaidTotal),
          unpaid_count: unpaidCount,
          discount_total: round(discountTotal),
          order_count: ids.length,
        }).select("id").single();
        if (cErr) throw cErr;
        // Archive the orders: stamp closed_at so they leave the active list but stay in the DB.
        if (ids.length) {
          const { error: uErr } = await admin.from("menu_orders")
            .update({ closed_at: now }).in("id", ids);
          if (uErr) throw uErr;
        }
        // Print the Z-report (best-effort — don't fail the close if printing fails).
        let printed = null;
        try {
          const { data: loc } = await admin.from("menu_locations").select("name").eq("id", location_id).single();
          const pr = await callSunmi({
            action: "print-summary",
            store_name: loc?.name || "",
            summary: {
              total: round(cash + card), cash: round(cash), card: round(card),
              paid_count: paidCount, unpaid_total: round(unpaidTotal), unpaid_count: unpaidCount,
              discount_total: round(discountTotal), order_count: ids.length,
            },
          });
          printed = pr.ok;
        } catch { printed = false; }
        return json({ ok: true, closure_id: closure?.id, closed_orders: ids.length, printed,
          summary: { total: round(cash + card), cash: round(cash), card: round(card), paid_count: paidCount, unpaid_total: round(unpaidTotal), unpaid_count: unpaidCount } });
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
        const allowed = ["name", "sort_order", "active", "available_from", "available_to", "days_of_week", "pos_menu_id"];
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
        const { data: row, error } = await admin.from("menu_locations")
          .insert({ name, slug: slug ?? null, brand_id: brand_id ?? null, active: true })
          .select("id").single();
        if (error) throw error;
        return json({ ok: true, id: row.id });
      }
      case "update_store": {
        const { id, fields } = data || {};
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["name", "slug", "active", "brand_id"];
        const patch: any = {};
        for (const k of allowed) if (k in (fields || {})) patch[k] = fields[k];
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
        return json({ ok: true, pins: rows ?? [] });
      }
      case "store_pin_set": {
        const { location_id, pin: newPin, label } = data || {};
        if (!location_id || !newPin) return json({ error: "location_id and pin required" }, 400);
        if (String(newPin) === String(ADMIN_PIN)) return json({ error: "cannot reuse the master PIN" }, 400);
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
        return json({ merges: rows || [] });
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
