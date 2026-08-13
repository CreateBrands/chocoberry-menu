// ============================================================
// admin-api — PIN-gated menu admin write API (menus layer aware).
// Browser sends PIN + action; function verifies and writes with
// the service role. Covers menus, items, overrides, settings.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const PIN = Deno.env.get("ADMIN_PIN");
  if (!PIN) return json({ error: "admin pin not configured" }, 500);

  let p: any;
  try { p = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { pin, action, data } = p || {};
  if (!pin || pin !== PIN) return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    switch (action) {
      // ---------- LOAD everything the admin UI needs ----------
      case "load": {
        const [menus, cats, items, locs, overrides, settings] = await Promise.all([
          db.from("menu_menus").select("*").order("sort_order"),
          db.from("menu_categories").select("*").order("sort_order"),
          db.from("menu_items").select("*").order("sort_order"),
          db.from("menu_locations").select("id,name,slug,active,brand_id").order("name"),
          db.from("menu_item_overrides").select("*"),
          db.from("menu_app_settings").select("*"),
        ]);
        for (const r of [menus, cats, items, locs, overrides, settings])
          if (r.error) throw r.error;
        // Modifier tables loaded separately + defensively so a failure here can't break the whole admin.
        let modifierGroups = [], modifierOptions = [], itemModifiers = [];
        try {
          const [mg, mo, im] = await Promise.all([
            db.from("menu_modifier_groups").select("*"),
            db.from("menu_modifiers").select("*"),
            db.from("menu_item_modifiers").select("*"),
          ]);
          if (!mg.error && mg.data) modifierGroups = mg.data;
          if (!mo.error && mo.data) modifierOptions = mo.data;
          if (!im.error && im.data) itemModifiers = im.data;
        } catch (_e) { /* leave modifiers empty if the tables error */ }
        return json({
          ok: true, menus: menus.data, categories: cats.data, items: items.data,
          locations: locs.data, overrides: overrides.data, settings: settings.data,
          modifierGroups, modifierOptions, itemModifiers,
        });
      }

      // ---------- MENUS ----------
      case "update_menu": {
        const { id, fields } = data;
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["name", "sort_order", "active", "available_from", "available_to", "days_of_week"];
        const patch: any = {};
        for (const k of allowed) if (k in fields) patch[k] = fields[k] === "" ? null : fields[k];
        const { error } = await db.from("menu_menus").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---------- ITEMS ----------
      case "update_item": {
        const { id, fields } = data;
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["name", "description", "price", "allergens", "tags", "available", "published", "sort_order", "category_id", "image_url"];
        const patch: any = {};
        for (const k of allowed) if (k in fields) patch[k] = fields[k];
        const { error } = await db.from("menu_items").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "create_item": {
        const { category_id, name, price } = data;
        if (!category_id || !name) return json({ error: "category_id and name required" }, 400);
        const { data: row, error } = await db.from("menu_items")
          .insert({ category_id, name, price: price ?? 0, available: true, published: true })
          .select("id").single();
        if (error) throw error;
        return json({ ok: true, id: row.id });
      }
      case "delete_item": {
        const { id } = data;
        if (!id) return json({ error: "no id" }, 400);
        // soft-retire if the item has orders (FK), else hard delete
        const { count } = await db.from("menu_order_items").select("id", { count: "exact", head: true }).eq("item_id", id);
        if (count && count > 0) {
          const { error } = await db.from("menu_items").update({ published: false, available: false }).eq("id", id);
          if (error) throw error;
          return json({ ok: true, retired: true });
        }
        const { error } = await db.from("menu_items").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true, deleted: true });
      }

      // ---------- OVERRIDES (per-store) ----------
      case "set_override": {
        const { item_id, location_id, price, available } = data;
        if (!item_id || !location_id) return json({ error: "item_id and location_id required" }, 400);
        if ((price === null || price === undefined) && (available === null || available === undefined)) {
          const { error } = await db.from("menu_item_overrides").delete()
            .eq("item_id", item_id).eq("location_id", location_id);
          if (error) throw error;
          return json({ ok: true, cleared: true });
        }
        const { error } = await db.from("menu_item_overrides").upsert(
          { item_id, location_id, price: price ?? null, available: available ?? null, updated_at: new Date().toISOString() },
          { onConflict: "item_id,location_id" });
        if (error) throw error;
        return json({ ok: true });
      }

      // ---------- SETTINGS (appearance) ----------
      case "create_mod_group": {
        const { name, required, min_select, max_select } = data;
        const { data: row, error } = await db.from("menu_modifier_groups")
          .insert({ name, required: !!required, min_select: min_select ?? 0, max_select: max_select ?? 1 })
          .select().single();
        if (error) throw error;
        return json({ ok: true, group: row });
      }
      case "update_mod_group": {
        const { id, name, required, min_select, max_select } = data;
        const { error } = await db.from("menu_modifier_groups")
          .update({ name, required: !!required, min_select, max_select }).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "delete_mod_group": {
        const { id } = data;
        await db.from("menu_item_modifiers").delete().eq("group_id", id);
        await db.from("menu_modifiers").delete().eq("group_id", id);
        const { error } = await db.from("menu_modifier_groups").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "create_mod_option": {
        const { group_id, name, price_delta, sort_order } = data;
        const { data: row, error } = await db.from("menu_modifiers")
          .insert({ group_id, name, price_delta: price_delta ?? 0, sort_order: sort_order ?? 0 })
          .select().single();
        if (error) throw error;
        return json({ ok: true, option: row });
      }
      case "update_mod_option": {
        const { id, name, price_delta, sort_order } = data;
        const { error } = await db.from("menu_modifiers")
          .update({ name, price_delta, sort_order }).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "delete_mod_option": {
        const { id } = data;
        const { error } = await db.from("menu_modifiers").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "set_item_mod_groups": {
        // replace an item's group links with the provided list
        const { item_id, group_ids } = data;
        await db.from("menu_item_modifiers").delete().eq("item_id", item_id);
        if (group_ids && group_ids.length) {
          const rows = group_ids.map((g) => ({ item_id, group_id: g }));
          const { error } = await db.from("menu_item_modifiers").insert(rows);
          if (error) throw error;
        }
        return json({ ok: true });
      }
      case "set_setting": {
        const { key, value } = data;
        if (!key) return json({ error: "key required" }, 400);
        const { error } = await db.from("menu_app_settings").upsert(
          { key, value: value ?? "", updated_at: new Date().toISOString() },
          { onConflict: "key" });
        if (error) throw error;
        return json({ ok: true });
      }

      // ---------- MENUS: create / delete ----------
      case "create_menu": {
        const { name } = data;
        if (!name) return json({ error: "name required" }, 400);
        const { data: bid } = await db.from("menu_brands").select("id").order("created_at").limit(1).single();
        const { data: mx } = await db.from("menu_menus").select("sort_order").order("sort_order", { ascending: false }).limit(1);
        const nextSort = (mx && mx[0]?.sort_order != null ? mx[0].sort_order + 1 : 0);
        const { data: row, error } = await db.from("menu_menus")
          .insert({ brand_id: bid?.id ?? null, name, sort_order: nextSort, active: true }).select("id").single();
        if (error) throw error;
        return json({ ok: true, id: row.id });
      }
      case "delete_menu": {
        const { id } = data;
        if (!id) return json({ error: "no id" }, 400);
        const { error } = await db.from("menu_menus").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---------- CATEGORIES (sections): create / update / delete ----------
      case "create_category": {
        const { menu_id, name } = data;
        if (!menu_id || !name) return json({ error: "menu_id and name required" }, 400);
        const { data: bid } = await db.from("menu_brands").select("id").order("created_at").limit(1).single();
        const { data: cx } = await db.from("menu_categories").select("sort_order").eq("menu_id", menu_id).order("sort_order", { ascending: false }).limit(1);
        const nextSort = (cx && cx[0]?.sort_order != null ? cx[0].sort_order + 1 : 0);
        const { data: row, error } = await db.from("menu_categories")
          .insert({ brand_id: bid?.id ?? null, menu_id, name, sort_order: nextSort, active: true }).select("id").single();
        if (error) throw error;
        return json({ ok: true, id: row.id });
      }
      case "update_category": {
        const { id, fields } = data;
        if (!id) return json({ error: "no id" }, 400);
        const allowed = ["name", "sort_order", "active", "img", "menu_id"];
        const patch: any = {};
        for (const k of allowed) if (k in fields) patch[k] = fields[k];
        const { error } = await db.from("menu_categories").update(patch).eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "delete_category": {
        const { id } = data;
        if (!id) return json({ error: "no id" }, 400);
        // block delete if it has items; caller should move/delete items first
        const { count } = await db.from("menu_items").select("id", { count: "exact", head: true }).eq("category_id", id);
        if (count && count > 0) return json({ error: "section has items — remove them first" }, 400);
        const { error } = await db.from("menu_categories").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ---------- REORDER (generic) ----------
      case "reorder": {
        const { table, ids } = data; // table: 'menu_menus'|'menu_categories'|'menu_items', ids: ordered array
        const allowedTables = ["menu_menus", "menu_categories", "menu_items"];
        if (!allowedTables.includes(table) || !Array.isArray(ids)) return json({ error: "bad reorder" }, 400);
        for (let i = 0; i < ids.length; i++) {
          const { error } = await db.from(table).update({ sort_order: i }).eq("id", ids[i]);
          if (error) throw error;
        }
        return json({ ok: true });
      }

      default:
        return json({ error: "unknown action: " + action }, 400);
    }
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
