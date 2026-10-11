// Who is standing at the till?
//
// A staff PIN is checked against ops_team, then narrowed to the store the
// till belongs to — a PIN for another shop is not authority here. Archived
// and left team members never match.
//
// admin-api carries its own copy of this, closing over its Supabase client.
// This module exists for the functions that need the same check without that
// closure (place-order, for open items). If you change the rules, change both
// — or better, move admin-api onto this one.

export type StaffCheck =
  | { ok: true; id: string; name: string; role: string | null }
  | { ok: false; reason: "pin_required" | "not_found" | "not_this_store" };

const GONE = ["left", "archived", "inactive", "terminated"];

// deno-lint-ignore no-explicit-any
export async function staffForPin(admin: any, pinIn: unknown, locationId: string | null): Promise<StaffCheck> {
  const pin = String(pinIn || "").trim();
  if (pin.length < 4 || !locationId) return { ok: false, reason: "pin_required" };

  const { data: locRow } = await admin
    .from("menu_locations").select("store_id").eq("id", locationId).maybeSingle();
  const storeId = locRow?.store_id || null;

  const { data: rows } = await admin.from("ops_team").select("*").eq("pin", pin).limit(5);
  // deno-lint-ignore no-explicit-any
  const active = (rows || []).filter((m: any) =>
    !m.archived_at && !GONE.includes(String(m.status || "").toLowerCase()));
  if (!active.length) return { ok: false, reason: "not_found" };

  // deno-lint-ignore no-explicit-any
  const inStore = storeId
    ? active.filter((m: any) => Array.isArray(m.store_ids)
      ? m.store_ids.includes(storeId)
      : String(m.store_ids || "").includes(storeId))
    : [];
  const m = inStore[0];
  if (!m) return { ok: false, reason: "not_this_store" };

  const name = m.name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.full_name || m.email || "Team member";
  return { ok: true, id: m.id, name: String(name).trim(), role: m.role || null };
}
