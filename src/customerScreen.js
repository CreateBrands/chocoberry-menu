// The till tells its customer-facing screen what to show while taking payment.
//
// The rear screen runs /display inside the Customer Display app, a separate
// app from the browser running the till, so the two can't share memory or
// storage. They meet on a Supabase Realtime broadcast channel per store,
// "cd:<location id>": nothing is written to the database, and a message
// reaches the screen in well under a second.
//
// What is sent is the whole state, not events: { view: "idle" | "order" |
// "card" | "paid", … }. The till repeats it every few seconds while it is not
// idle, and the screen drops back to posters if it hears nothing for a while,
// so a missed message, a till that crashed or a screen that just rebooted all
// sort themselves out without anyone touching them.
import { deviceToken } from "./device.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const CUSTOMER_SCREEN_EVENT = "state";
export const customerScreenTopic = (loc) => "cd:" + loc;

export function sendCustomerScreen(loc, state) {
  if (!loc || !SUPABASE_URL) return;
  const dev = deviceToken();
  const payload = { ...state, till: dev && dev.key ? String(dev.key) : null, at: Date.now() };
  try {
    fetch(SUPABASE_URL + "/realtime/v1/api/broadcast", {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: customerScreenTopic(loc), event: CUSTOMER_SCREEN_EVENT, payload }] }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* the customer screen is a nicety; never let it disturb a payment */ }
}

function modText(m) {
  if (!m) return "";
  if (Array.isArray(m)) return m.map((x) => (x && typeof x === "object" ? x.name || "" : String(x))).filter(Boolean).join(" · ");
  if (typeof m === "object") return Object.values(m).join(" · ");
  return String(m);
}

// The order as the customer should see it: names, quantities, line prices and
// the money, already formatted in the store's currency by the till.
export function orderForScreen(o, money) {
  if (!o) return null;
  const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
  const gross = r2(o.total), discount = r2(o.discount_amount), itemsDiscount = r2(o.items_discount_total);
  const total = r2(gross - discount), paid = r2(o.amount_paid), due = Math.max(0, r2(total - paid));
  const dine = /dine/i.test(String(o.order_type || ""));
  return {
    no: o.order_no != null ? String(o.order_no) : "",
    type: dine ? "Dine in" : "Takeaway",
    table: o.menu_tables && o.menu_tables.label ? String(o.menu_tables.label) : "",
    items: (o.menu_order_items || []).slice(0, 60).map((it) => ({
      n: String(it.name_snapshot || ""), q: Number(it.qty || 1),
      m: modText(it.modifiers_snapshot), t: money(Number(it.line_total || 0)),
    })),
    subtotal: money(gross),
    discount: discount > 0 ? money(discount) : "",
    discountLabel: o.discount_type === "percent" && o.discount_value ? "Discount (" + Number(o.discount_value) + "%)" : "Discount",
    itemsDiscount: itemsDiscount > 0 ? money(itemsDiscount) : "",
    paid: paid > 0 ? money(paid) : "",
    due: money(due), dueValue: due,
  };
}
