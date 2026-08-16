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

  const { pin, action, data } = payload || {};
  if (!pin || pin !== ADMIN_PIN) return json({ error: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

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
        const [cats, items, locs, overrides, settings, menus, modGroups, modOptions, itemMods, tables, locMenus, modOverrides, bands, bandPrices, bandOptPrices] = await Promise.all([
          admin.from("menu_categories").select("*").order("sort_order"),
          admin.from("menu_items").select("*").order("sort_order"),
          admin.from("menu_locations").select("id,name,slug,active,brand_id").order("name"),
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
        ]);
        for (const r of [cats, items, locs, overrides]) if (r.error) throw r.error;
        return json({
          ok: true,
          categories: cats.data,
          items: items.data,
          locations: locs.data,
          overrides: overrides.data,
          settings: settings.data ?? [],
          menus: menus.data ?? [],
          modifierGroups: modGroups.data ?? [],
          modifierOptions: modOptions.data ?? [],
          itemModifiers: itemMods.data ?? [],
          tables: tables.data ?? [],
          locationMenus: locMenus.data ?? [],
          modifierOverrides: modOverrides.data ?? [],
          priceBands: bands.data ?? [],
          bandPrices: bandPrices.data ?? [],
          bandOptionPrices: bandOptPrices.data ?? [],
        });
      }

      // ---- MASTER ITEM: update fields ----
      case "update_item": {
        const { id, fields } = data;
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["name", "description", "price", "allergens", "tags", "available", "published", "sort_order", "category_id", "image_url", "station"];
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
        const allowed = ["label", "store_id", "location_id", "active", "station"];
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
      case "create_token": {
        const { location_id, label } = data || {};
        if (!location_id) return json({ error: "location_id required" }, 400);
        const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const { data: row, error } = await admin.from("menu_tables")
          .insert({ location_id, label: label ?? "Tablet", qr_token: token, active: true })
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

      default:
        return json({ error: "unknown action: " + action }, 400);
    }
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
