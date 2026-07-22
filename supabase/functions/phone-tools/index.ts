// ---------------------------------------------------------------------------
// phone-tools — Supabase Edge Function
// Custom-function endpoint for the Retell AI phone ordering agent.
//
// Tools exposed (dispatched on body.name, per Retell's custom function POST
// { call, name, args }; also accepts ?tool=<name> with a bare args body for
// manual curl testing):
//
//   get_menu      -> categories + items (id, name, price, allergens) +
//                    modifiers per item, for the store's brand
//   create_order  -> writes menu_orders + menu_order_items (status 'placed',
//                    takeaway). Totals are computed SERVER-SIDE from DB
//                    prices — the voice model's arithmetic is never trusted.
//                    The insert fires the existing webhook -> kitchen printer.
//
// Store selection: configure the Retell function URL per store with
// ?location=<menu_locations.id>. (args.location_id overrides if present.)
//
// Auth: header  x-phone-secret: <PHONE_SECRET>   (set as a function secret;
// add the same header in Retell's custom function config.)
// ---------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2";

const TOOLS_VERSION = 7;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// ---------------------------------------------------------------------------

interface OrderItemArg {
  item_id: string;
  qty: number;
  modifier_ids?: string[];
  // Must be true for items that have option groups: asserts find_items was
  // called and the caller was asked. Enforced server-side in createOrder.
  options_reviewed?: boolean;
}

async function getLocation(locationId: string) {
  const { data, error } = await supabase
    .from("menu_locations")
    .select("id, brand_id, name, active")
    .eq("id", locationId)
    .maybeSingle();
  if (error || !data) throw new Error("unknown location: " + locationId);
  return data;
}

async function getMenu(locationId: string) {
  // v6: compact plain-text menu with NO ids — roughly 6KB, far under any
  // response truncation limit. Items marked * have option groups. The ids
  // needed for create_order come from find_items, which must be called for
  // every item before ordering anyway.
  const loc = await getLocation(locationId);

  const { data: cats, error: catErr } = await supabase
    .from("menu_categories")
    .select("id, name, sort_order")
    .eq("brand_id", loc.brand_id)
    .eq("active", true)
    .order("sort_order");
  if (catErr) throw new Error("categories: " + catErr.message);

  const catIds = (cats ?? []).map((c) => c.id);
  const { data: items, error: itemErr } = await supabase
    .from("menu_items")
    .select("id, category_id, name, price")
    .in("category_id", catIds.length ? catIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("available", true)
    .eq("published", true)
    .order("sort_order");
  if (itemErr) throw new Error("items: " + itemErr.message);

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: links } = itemIds.length
    ? await supabase.from("menu_item_modifiers").select("item_id").in("item_id", itemIds)
    : { data: [] as { item_id: string }[] };
  const hasOpts = new Set((links ?? []).map((l) => l.item_id));

  const lines: string[] = [];
  for (const c of cats ?? []) {
    const catItems = (items ?? []).filter((i) => i.category_id === c.id);
    if (!catItems.length) continue;
    const parts = catItems.map((i) =>
      `${i.name}${hasOpts.has(i.id) ? "*" : ""} £${Number(i.price).toFixed(2)}`,
    );
    lines.push(`${c.name}: ${parts.join(" | ")}`);
  }

  return {
    version: TOOLS_VERSION,
    store: loc.name,
    note:
      "Complete live menu. Items marked * have option groups that the caller must choose from. " +
      "For EVERY item being ordered, call find_items with its name first — it returns the item id, " +
      "exact option choices and their ids, all required by create_order. Offer only the exact " +
      "choices find_items returns; never invent options or flavours.",
    menu: lines.join("\n"),
  };
}

// Fuzzy item search: used when the caller names something the agent can't
// see (the full menu is large and may be truncated in the agent's context).
// Returns up to 8 matches WITH descriptions, allergens and options.
// Phonetic aliases observed in real call recordings (Jul 2026 batch):
// callers and speech recognition mangle these menu words consistently.
const ALIASES: Record<string, string> = {
  kunafa: "kanafeh", kunafah: "kanafeh", kanafa: "kanafeh", canafe: "kanafeh",
  conofa: "kanafeh", konofa: "kanafeh", knafeh: "kanafeh", kunafeh: "kanafeh",
  faluda: "falooda", falloda: "falooda", faloda: "falooda", phaloda: "falooda",
  falouda: "falooda", paloza: "falooda", faluza: "falooda",
  bytes: "bites", byte: "bites",
  boston: "sebastian",
  biscof: "biscoff", biscoof: "biscoff",
  connafe: "kanafeh",
};

function aliasQuery(q: string): { phrases: string[]; words: string[] } {
  const norm = q.toLowerCase().trim();
  const rawWords = norm.split(/\s+/);
  const aliasedWords = rawWords.map((w) => ALIASES[w] ?? w);
  const phrases = [...new Set([norm, aliasedWords.join(" ")])];
  const words = [...new Set([...rawWords, ...aliasedWords])].filter((w) => w.length > 2);
  return { phrases, words };
}

async function findItems(locationId: string, query: string) {
  const loc = await getLocation(locationId);
  const q = (query ?? "").trim();
  if (!q) return { matches: [] };

  const { data: cats } = await supabase
    .from("menu_categories").select("id").eq("brand_id", loc.brand_id).eq("active", true);
  const catIds = (cats ?? []).map((c) => c.id);
  if (!catIds.length) return { matches: [] };

  // Match on whole phrase(s) and individual words, alias-corrected
  const { phrases, words } = aliasQuery(q);
  const patterns = [...phrases, ...words].map((w) => `name.ilike.%${w}%`).join(",");
  const { data: items, error } = await supabase
    .from("menu_items")
    .select("id, category_id, name, description, price, allergens")
    .in("category_id", catIds)
    .eq("available", true)
    .eq("published", true)
    .or(patterns)
    .limit(8);
  if (error) throw new Error("find: " + error.message);
  if (!items?.length) return { matches: [] };

  const itemIds = items.map((i) => i.id);
  const { data: links } = await supabase
    .from("menu_item_modifiers").select("item_id, group_id").in("item_id", itemIds);
  const groupIds = [...new Set((links ?? []).map((l) => l.group_id))];
  const { data: mods } = groupIds.length
    ? await supabase.from("menu_modifiers").select("id, group_id, name, price_delta").in("group_id", groupIds).order("sort_order")
    : { data: [] as { id: string; group_id: string; name: string; price_delta: number }[] };
  const groupNames = new Map<string, string>();
  if (groupIds.length) {
    const { data: groups, error: gErr } = await supabase
      .from("menu_modifier_groups").select("id, name").in("id", groupIds);
    if (!gErr) for (const g of groups ?? []) groupNames.set(g.id, g.name);
  }
  const modsByGroup = new Map<string, unknown[]>();
  for (const m of mods ?? []) {
    if (!modsByGroup.has(m.group_id)) modsByGroup.set(m.group_id, []);
    modsByGroup.get(m.group_id)!.push({ id: m.id, name: m.name, extra_cost: Number(m.price_delta) || 0 });
  }
  const groupsByItem = new Map<string, unknown[]>();
  for (const l of links ?? []) {
    if (!groupsByItem.has(l.item_id)) groupsByItem.set(l.item_id, []);
    groupsByItem.get(l.item_id)!.push({
      group: groupNames.get(l.group_id) ?? "option",
      choices: modsByGroup.get(l.group_id) ?? [],
    });
  }

  return {
    matches: items.map((i) => ({
      id: i.id,
      name: i.name,
      price: Number(i.price),
      description: (i.description ?? "").slice(0, 200) || undefined,
      allergens: i.allergens?.length ? i.allergens : undefined,
      options: groupsByItem.get(i.id),
    })),
  };
}

async function createOrder(locationId: string, args: {
  customer_name: string;
  items: OrderItemArg[];
  note?: string;
}) {
  const loc = await getLocation(locationId);
  if (!args.customer_name || !args.items?.length) {
    throw new Error("customer_name and at least one item are required");
  }

  // Re-price everything from the database
  const itemIds = args.items.map((i) => i.item_id);
  const { data: dbItems, error: itemErr } = await supabase
    .from("menu_items")
    .select("id, name, price, available, published")
    .in("id", itemIds);
  if (itemErr) throw new Error(itemErr.message);
  type DbItem = { id: string; name: string; price: number; available: boolean; published: boolean };
  const itemMap = new Map<string, DbItem>(((dbItems ?? []) as DbItem[]).map((i) => [i.id, i]));

  const allModIds = args.items.flatMap((i) => i.modifier_ids ?? []);
  const { data: dbMods } = allModIds.length
    ? await supabase.from("menu_modifiers").select("id, group_id, name, price_delta").in("id", allModIds)
    : { data: [] as { id: string; group_id: string; name: string; price_delta: number }[] };
  type DbMod = { id: string; group_id: string; name: string; price_delta: number };
  const modMap = new Map<string, DbMod>(((dbMods ?? []) as DbMod[]).map((m) => [m.id, m]));

  const groupIds = [...new Set((dbMods ?? []).map((m) => m.group_id))];
  const groupNames = new Map<string, string>();
  if (groupIds.length) {
    const { data: groups, error } = await supabase
      .from("menu_modifier_groups").select("id, name").in("id", groupIds);
    if (!error) for (const g of groups ?? []) groupNames.set(g.id, g.name);
  }

  // ENFORCEMENT: an item that has option groups cannot be ordered unless
  // its options were reviewed (find_items called + caller asked). This stops
  // the agent silently assuming "no options" from the lean menu.
  const { data: allLinks } = await supabase
    .from("menu_item_modifiers")
    .select("item_id, group_id")
    .in("item_id", itemIds);
  const itemGroupIds = new Map<string, string[]>();
  for (const l of allLinks ?? []) {
    if (!itemGroupIds.has(l.item_id)) itemGroupIds.set(l.item_id, []);
    itemGroupIds.get(l.item_id)!.push(l.group_id);
  }
  const enforceGroupIds = [...new Set([...itemGroupIds.values()].flat())];
  const enforceGroupNames = new Map<string, string>();
  if (enforceGroupIds.length) {
    const { data: groups, error: gErr } = await supabase
      .from("menu_modifier_groups").select("id, name").in("id", enforceGroupIds);
    if (!gErr) for (const g of groups ?? []) enforceGroupNames.set(g.id, g.name);
  }
  for (const req of args.items) {
    const gids = itemGroupIds.get(req.item_id) ?? [];
    const reviewed = req.options_reviewed === true ||
      (req.modifier_ids && req.modifier_ids.length > 0);
    if (gids.length > 0 && !reviewed) {
      const item = itemMap.get(req.item_id);
      const names = gids.map((g) => enforceGroupNames.get(g) ?? "options").join(", ");
      throw new Error(
        `Cannot place "${item?.name ?? req.item_id}" yet: it has option groups (${names}). ` +
        `Call find_items for this item, ask the caller to choose, then resubmit with the ` +
        `chosen modifier_ids (or options_reviewed=true if they want it plain).`,
      );
    }
  }

  const lines: {
    item_id: string; name_snapshot: string; price_snapshot: number;
    qty: number; modifiers_snapshot: Record<string, string> | null; line_total: number;
  }[] = [];
  let subtotal = 0;

  for (const req of args.items) {
    const item = itemMap.get(req.item_id);
    if (!item) throw new Error(`unknown item ${req.item_id}`);
    if (item.available === false || item.published === false) {
      throw new Error(`item not available: ${item.name}`);
    }
    const qty = Math.max(1, Math.min(20, Math.round(req.qty || 1)));

    let unit = Number(item.price);
    const snapshot: Record<string, string> = {};
    for (const mid of req.modifier_ids ?? []) {
      const m = modMap.get(mid);
      if (!m) throw new Error(`unknown modifier ${mid}`);
      unit += Number(m.price_delta) || 0;
      const key = (groupNames.get(m.group_id) ?? "option").toLowerCase();
      snapshot[key] = m.name;
    }
    const lineTotal = Math.round(unit * qty * 100) / 100;
    subtotal = Math.round((subtotal + lineTotal) * 100) / 100;
    lines.push({
      item_id: req.item_id,
      name_snapshot: item.name,
      price_snapshot: Number(item.price),
      qty,
      modifiers_snapshot: Object.keys(snapshot).length ? snapshot : null,
      line_total: lineTotal,
    });
  }

  const note = ["Phone order", args.note?.trim()].filter(Boolean).join(" - ");
  const { data: order, error: orderErr } = await supabase
    .from("menu_orders")
    .insert({
      location_id: loc.id,
      order_type: "takeaway",
      status: "placed",
      pickup_name: args.customer_name.slice(0, 60),
      customer_note: note,
      subtotal,
      total: subtotal,
    })
    .select("id")
    .single();
  if (orderErr || !order) throw new Error("order insert failed: " + orderErr?.message);

  const { error: linesErr } = await supabase
    .from("menu_order_items")
    .insert(lines.map((l) => ({ ...l, order_id: order.id })));
  if (linesErr) {
    // Roll back the header so a half-order never reaches the kitchen twice
    await supabase.from("menu_orders").delete().eq("id", order.id);
    throw new Error("order items insert failed: " + linesErr.message);
  }

  return {
    ok: true,
    order_ref: String(order.id).replace(/-/g, "").slice(0, 6).toUpperCase(),
    total: subtotal,
    currency: "GBP",
    pickup_minutes: 20,
    message: `Order placed. Total £${subtotal.toFixed(2)}, ready for collection in about 20 minutes.`,
  };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const secret = Deno.env.get("PHONE_SECRET");
  if (!secret || req.headers.get("x-phone-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* empty body is fine for get_menu via ?tool= */ }

  const url = new URL(req.url);
  const tool = (body.name as string) ?? url.searchParams.get("tool") ?? "";
  const args = (body.args as Record<string, unknown>) ?? body;
  const locationId =
    (args.location_id as string) ?? url.searchParams.get("location") ?? "";

  try {
    if (!locationId) return json({ error: "location not specified" }, 400);

    switch (tool) {
      case "version":
        return json({ version: TOOLS_VERSION });
      case "get_menu":
        return json(await getMenu(locationId));
      case "find_items":
        return json({ version: TOOLS_VERSION, ...(await findItems(locationId, String(args.query ?? ""))) });
      case "create_order":
        return json(await createOrder(locationId, args as never));
      default:
        return json({ error: `unknown tool "${tool}"` }, 400);
    }
  } catch (e) {
    console.error(e);
    // Return errors as JSON 200s so the voice agent can recover conversationally
    return json({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});
