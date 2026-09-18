// =====================================================================
// customer-payments — Supabase Edge Function for the Chocoberry customer app
// Deploy: chocoberry-menu/supabase/functions/customer-payments/index.ts (paste-over deploy)
//
// One endpoint, several actions, one payment-provider adapter.
//   POST { action: 'checkout', ... }   place an order: price server-side, pay, create order, ledgers
//   POST { action: 'topup', ... }      add funds to the wallet
//   POST { action: 'join', ... }       join a membership tier
//   POST { action: 'gift', ... }       send wallet credit to someone
//
// PROVIDER: settings.features.provider = 'sandbox' | 'teya'.
//   sandbox → instant success, fake reference, no money.  (today)
//   teya    → implement `teyaProvider` below; nothing else changes.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (message: string, status = 400) => json({ error: message }, status);

// ---------------------------------------------------------------------
// Payment provider adapter
// ---------------------------------------------------------------------
type Charge = { amount: number; currency: string; method: string; description: string; customerId: string; savedCardToken?: string | null; intentId?: string | null; stripeCustomerId?: string | null };
type ChargeResult = { ok: true; ref: string; cardBrand?: string; last4?: string; token?: string } | { ok: false; error: string };
interface Provider { name: string; charge(c: Charge): Promise<ChargeResult> }

const sandboxProvider: Provider = {
  name: "sandbox",
  async charge(c) {
    // Deterministic, visibly fake references. Amounts ending .99 fail, to test the failure path.
    if (Math.round(c.amount * 100) % 100 === 99) return { ok: false, error: "Sandbox: card declined (amount ends in .99)" };
    return { ok: true, ref: `SBX-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e4)}`, cardBrand: "visa", last4: "4242", token: "sbx_tok_4242" };
  },
};

const teyaProvider: Provider = {
  name: "teya",
  async charge(_c) {
    // TODO when Teya credentials arrive: create the payment with their online API using
    // Deno.env.get("TEYA_API_KEY") / TEYA_MERCHANT_ID, return { ok: true, ref } or { ok: false, error }.
    return { ok: false, error: "Teya provider not configured yet" };
  },
};

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
async function stripe(path: string, params: Record<string, string> = {}, method = "POST") {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body: method === "POST" ? new URLSearchParams(params) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || "Stripe error"); return j;
}
const stripeProvider: Provider = {
  name: "stripe",
  async charge(c) {
    // (a) the client confirmed a PaymentIntent with the Payment Element → verify it; (b) saved card → charge off-session.
    if (c.intentId) {
      const pi = await stripe(`payment_intents/${c.intentId}`, {}, "GET");
      if (pi.status !== "succeeded") return { ok: false, error: `Payment ${pi.status}` };
      if (Math.round(c.amount * 100) !== pi.amount_received) return { ok: false, error: "Payment amount mismatch" };
      if (pi.metadata?.customer_id && pi.metadata.customer_id !== c.customerId) return { ok: false, error: "Payment belongs to another customer" };
      const pm = pi.payment_method ? await stripe(`payment_methods/${pi.payment_method}`, {}, "GET").catch(() => null) : null;
      return { ok: true, ref: pi.id, cardBrand: pm?.card?.brand, last4: pm?.card?.last4, token: pi.setup_future_usage ? pi.payment_method : undefined };
    }
    if (c.savedCardToken && c.stripeCustomerId) {
      const pi = await stripe("payment_intents", { amount: String(Math.round(c.amount * 100)), currency: c.currency.toLowerCase(), customer: c.stripeCustomerId, payment_method: c.savedCardToken, off_session: "true", confirm: "true", description: c.description, "metadata[customer_id]": c.customerId });
      if (pi.status !== "succeeded") return { ok: false, error: `Payment ${pi.status}` };
      return { ok: true, ref: pi.id };
    }
    return { ok: false, error: "No payment provided" };
  },
};
const providerFor = (name: string): Provider => (name === "stripe" ? stripeProvider : name === "teya" ? teyaProvider : sandboxProvider);

// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);

  // who is calling
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return fail("Sign in required", 401);
  const jwt = auth.slice(7);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: { user } } = await asUser.auth.getUser(jwt);
  if (!user?.id) return fail("Sign in required", 401);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: any;
  try { body = await req.json(); } catch { return fail("Bad JSON"); }

  // settings
  const { data: srows } = await admin.from("customer_app_settings").select("key,value");
  const S: Record<string, any> = {};
  for (const r of srows || []) S[r.key] = r.value;
  const features = S.features || {};
  const loyalty = S.loyalty || {};
  const membershipCfg = S.membership || {};
  const provider = providerFor(features.provider || "sandbox");
  const currency = "GBP";

  const { data: customer } = await admin.from("customers").select("id,name,email,saved_card,auto_topup,stripe_customer_id").eq("id", user.id).maybeSingle();
  if (!customer) return fail("No customer profile", 403);

  const recordPayment = async (p: { purpose: string; amount: number; method: string; status: string; ref?: string | null; order_id?: string | null; meta?: any }) => {
    const { data } = await admin.from("payments").insert({ customer_id: user.id, purpose: p.purpose, order_id: p.order_id || null, amount: p.amount, currency, method: p.method, provider: provider.name, provider_ref: p.ref || null, status: p.status, meta: p.meta || null }).select("id").single();
    return data?.id as string;
  };
  const walletBalance = async () => { const { data } = await admin.from("wallet_balance").select("balance").eq("customer_id", user.id).maybeSingle(); return Number(data?.balance || 0); };
  const saveCard = async (r: ChargeResult) => { if (r.ok && r.token && body.save_card) await admin.from("customers").update({ saved_card: { brand: r.cardBrand, last4: r.last4, provider_token: r.token, provider: provider.name } }).eq("id", user.id); };

  /** Charge via card/applepay, or debit the wallet. Returns {ok, ref, paymentId} */
  const pay = async (purpose: string, amount: number, method: string, description: string, meta?: any) => {
    if (amount <= 0) { const id = await recordPayment({ purpose, amount: 0, method: "none", status: "succeeded", ref: "FREE", meta }); return { ok: true, ref: "FREE", paymentId: id }; }
    if (method === "wallet") {
      const bal = await walletBalance();
      if (bal < amount) return { ok: false, error: `Wallet balance £${bal.toFixed(2)} is less than £${amount.toFixed(2)}` };
      const id = await recordPayment({ purpose, amount, method, status: "succeeded", ref: `WALLET`, meta });
      const { error } = await admin.rpc("wallet_debit", { p_customer: user.id, p_amount: amount, p_reason: "payment", p_reference: id });
      if (error) { await admin.from("payments").update({ status: "failed" }).eq("id", id); return { ok: false, error: error.message }; }
      return { ok: true, ref: id, paymentId: id };
    }
    const r = await provider.charge({ amount, currency, method, description, customerId: user.id, savedCardToken: method === "saved_card" ? customer.saved_card?.provider_token : null, intentId: body.payment_intent || null, stripeCustomerId: customer.stripe_customer_id || null });
    const id = await recordPayment({ purpose, amount, method, status: r.ok ? "succeeded" : "failed", ref: r.ok ? r.ref : null, meta: { ...(meta || {}), ...(r.ok ? {} : { error: r.error }) } });
    if (!r.ok) return { ok: false, error: r.error };
    await saveCard(r);
    return { ok: true, ref: r.ref, paymentId: id };
  };

  try {
    // ===================================================================
    if (body.action === "intent") {
      // Create a PaymentIntent for the client to confirm with Stripe's Payment Element. The final amount is
      // re-verified against the intent when the follow-up action (checkout/topup/join/gift) runs.
      if (provider.name !== "stripe") return json({ ok: true, sandbox: true });
      const amount = Number(body.amount || 0); if (amount <= 0) return fail("amount required");
      let cus = customer.stripe_customer_id;
      if (!cus) { const c = await stripe("customers", { email: customer.email || "", name: customer.name || "", "metadata[customer_id]": user.id }); cus = c.id; await admin.from("customers").update({ stripe_customer_id: cus }).eq("id", user.id); }
      const params: Record<string, string> = { amount: String(Math.round(amount * 100)), currency: currency.toLowerCase(), customer: cus, "automatic_payment_methods[enabled]": "true", description: body.description || `Chocoberry ${body.purpose || "payment"}`, "metadata[customer_id]": user.id, "metadata[purpose]": body.purpose || "order" };
      if (body.save_card) params["setup_future_usage"] = "off_session";
      const pi = await stripe("payment_intents", params);
      return json({ ok: true, client_secret: pi.client_secret, id: pi.id });
    }

    // ===================================================================
    if (body.action === "checkout") {
      const { location_id, order_type, table_id, pickup_name, lines, method, redeem } = body;
      if (!location_id || !Array.isArray(lines) || !lines.length) return fail("location_id and lines required");

      // price every line from the live menu — never trust the client's prices
      const { data: menuRows, error: mErr } = await admin.rpc("store_menu_full", { loc: location_id, at_time: new Date().toISOString() });
      if (mErr) return fail("Menu unavailable: " + mErr.message, 500);
      const items = new Map<string, any>();
      for (const r of menuRows || []) { const id = r.item_id ?? r.id; if (id && !items.has(id)) items.set(id, r); }
      const optionDelta = (row: any, optId: string) => {
        const groups = row.modifiers || row.modifier_groups || [];
        for (const g of groups) for (const o of g.options || []) if (o.id === optId) return Number(o.price_delta || o.delta || 0);
        return 0;
      };
      const drinkRe = /matcha|coffee|latte|espresso|tea|chai|shake|smoothie|juice|frapp|iced|mocktail|drink|soda|water|cold|boba|mojito|falooda|cooler|swirl/i;

      const priced = lines.map((l: any) => {
        const row = items.get(l.item_id);
        if (!row) throw new Error(`Item not on this café's menu: ${l.item_id}`);
        const base = Number(row.item_price ?? row.price ?? 0);
        const mods = (l.modifiers || []).map((m: any) => ({ ...m, price: optionDelta(row, m.option_id) }));
        const unit = base + mods.reduce((s: number, m: any) => s + m.price, 0);
        const name = row.item_name ?? row.name;
        const cat = row.category_name ?? row.category ?? "";
        return { ...l, name, unit, qty: Math.max(1, Number(l.qty || 1)), kind: drinkRe.test(name) || drinkRe.test(cat) ? "drink" : "food", mods };
      });

      // membership discount (server-side)
      const { data: mem } = await admin.from("memberships").select("*").eq("customer_id", user.id).eq("status", "active").maybeSingle();
      const tier = mem ? (membershipCfg.tiers || []).find((t: any) => t.id === mem.tier) : null;
      let usedToday = 0;
      if (tier) { const { data } = await admin.rpc("member_drinks_today", { p_customer: user.id }); usedToday = Number(data || 0); }
      let left = tier ? Math.max(0, (tier.drinks_per_day || 0) - usedToday) : 0;
      let memberDrinks = 0;
      for (const l of priced) {
        l.full = l.unit * l.qty; l.discount = 0;
        if (tier && l.kind === "drink" && left > 0 && tier.discount > 0) { const n = Math.min(left, l.qty); left -= n; memberDrinks += n; l.discount = n * l.unit * tier.discount; }
        else if (tier && l.kind === "food" && (tier.food_discount || 0) > 0) l.discount = l.full * tier.food_discount;
      }

      // reward redemption: the free drink covers the priciest drink line's unit price
      let rewardDiscount = 0, rewardLedgerId: number | null = null, rewardName: string | null = null, rewardCost = 0;
      if (redeem) {
        const rung = (loyalty.ladder || []).find((r: any) => r.at === Number(redeem));
        if (!rung) return fail("Unknown reward");
        const drinks = priced.filter((l: any) => l.kind === "drink").sort((a: any, b: any) => b.unit - a.unit);
        const target = /drink|upgrade/i.test(rung.name) ? drinks[0] : priced.sort((a: any, b: any) => b.unit - a.unit)[0];
        if (!target) return fail(`Add a ${/drink/i.test(rung.name) ? "drink" : "item"} to use this reward`);
        rewardDiscount = /upgrade/i.test(rung.name) ? Math.min(target.unit, 1.0) : target.unit;
        rewardName = rung.name; rewardCost = rung.at;
      }

      const itemsTotal = priced.reduce((s: number, l: any) => s + l.full, 0);
      const memberDiscount = priced.reduce((s: number, l: any) => s + l.discount, 0);
      const total = Math.max(0, +(itemsTotal - memberDiscount - rewardDiscount).toFixed(2));
      const berries = order_type === "delivery" ? 0 : Math.floor(total) * (loyalty.berries_per_pound || 1);

      // Stripe: the client needs an intent for the exact server total before we can charge
      const m0 = method || "card";
      if (provider.name === "stripe" && !body.payment_intent && m0 !== "wallet" && m0 !== "saved_card" && total > 0) {
        return json({ ok: false, needs_payment: true, total, items_total: itemsTotal, member_discount: memberDiscount, reward_discount: rewardDiscount });
      }

      // redeem berries first (rolled back if payment fails)
      if (rewardName) {
        const { data, error } = await admin.rpc("reward_redeem", { p_customer: user.id, p_cost: rewardCost, p_name: rewardName });
        if (error) return fail(error.message);
        rewardLedgerId = data;
      }

      // pay
      const p = await pay("order", total, method || "card", `Chocoberry order`, { member_drinks: memberDrinks, items: itemsTotal, member_discount: memberDiscount, reward_discount: rewardDiscount });
      if (!p.ok) { if (rewardLedgerId) await admin.from("loyalty_ledger").delete().eq("id", rewardLedgerId); return fail(p.error || "Payment failed", 402); }

      // create the order through the existing place-order (prints in the kitchen), as the customer
      const placeRes = await fetch(`${SUPABASE_URL}/functions/v1/place-order`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ location_id, table_id: table_id || null, order_type: order_type || "collection", pickup_name: pickup_name || customer.name || "App customer",
          items: priced.map((l: any) => ({ item_id: l.item_id, qty: l.qty, modifiers: l.mods.map((m: any) => ({ group_id: m.group_id, option_id: m.option_id })) })) }),
      });
      const placed = await placeRes.json().catch(() => ({}));
      if (!placeRes.ok) {
        // refund the sandbox/wallet payment and give berries back
        if ((method || "card") === "wallet") await admin.rpc("wallet_credit", { p_customer: user.id, p_amount: total, p_reason: "refund", p_reference: p.paymentId });
        await admin.from("payments").update({ status: "refunded" }).eq("id", p.paymentId);
        if (rewardLedgerId) await admin.from("loyalty_ledger").delete().eq("id", rewardLedgerId);
        return fail(placed?.error || "Order could not be placed", 500);
      }
      const orderId = placed.order_id || placed.id || null;
      if (orderId) {
        await admin.from("payments").update({ order_id: orderId }).eq("id", p.paymentId);
        await admin.from("menu_orders").update({ payment_id: p.paymentId, app_discount: +(memberDiscount + rewardDiscount).toFixed(2) }).eq("id", orderId);
        if (rewardLedgerId) await admin.from("loyalty_ledger").update({ order_id: orderId }).eq("id", rewardLedgerId);
      }
      // auto top-up after a wallet payment
      if ((method || "card") === "wallet" && customer.auto_topup?.enabled) {
        const bal = await walletBalance();
        if (bal < Number(customer.auto_topup.below || 0)) {
          const t = await pay("topup", Number(customer.auto_topup.amount || 0), customer.saved_card ? "saved_card" : "card", "Auto top-up");
          if (t.ok) await admin.rpc("wallet_credit", { p_customer: user.id, p_amount: Number(customer.auto_topup.amount || 0), p_reason: "topup", p_reference: t.ref });
        }
      }
      return json({ ok: true, order_id: orderId, order_no: placed.order_no ?? null, total, items_total: itemsTotal, member_discount: memberDiscount, reward_discount: rewardDiscount, berries, sandbox: provider.name === "sandbox" });
    }

    // ===================================================================
    if (body.action === "topup") {
      const amount = Number(body.amount || 0);
      const min = Number((S.wallet || {}).min_topup || 10);
      if (amount < min) return fail(`Minimum top-up is £${min}`);
      const p = await pay("topup", amount, body.method || "card", "Wallet top-up");
      if (!p.ok) return fail(p.error || "Payment failed", 402);
      const { data: bal } = await admin.rpc("wallet_credit", { p_customer: user.id, p_amount: amount, p_reason: "topup", p_reference: p.ref });
      const bonus = Math.floor(amount) * Number(loyalty.topup_bonus_per_pound || 0);
      if (bonus > 0) await admin.from("loyalty_ledger").insert({ customer_id: user.id, delta: bonus, reason: "topup", note: "Wallet top-up", expires_at: new Date(Date.now() + 365 * 864e5).toISOString() });
      if (body.auto_topup !== undefined) await admin.from("customers").update({ auto_topup: body.auto_topup }).eq("id", user.id);
      return json({ ok: true, balance: Number(bal), berries: bonus, sandbox: provider.name === "sandbox" });
    }

    // ===================================================================
    if (body.action === "join") {
      const tier = (membershipCfg.tiers || []).find((t: any) => t.id === body.tier);
      if (!tier) return fail("Unknown membership");
      if (!membershipCfg.available) return fail("Membership isn't open yet");
      const p = await pay("membership", Number(tier.price || 0), body.method || "card", `${tier.name} membership`);
      if (!p.ok) return fail(p.error || "Payment failed", 402);
      const { data: m, error } = await admin.rpc("membership_join", { p_customer: user.id, p_tier: tier.id, p_ref: p.ref });
      if (error) return fail(error.message, 500);
      return json({ ok: true, membership: m, sandbox: provider.name === "sandbox" });
    }

    // ===================================================================
    if (body.action === "gift") {
      const amount = Number(body.amount || 0);
      if (amount < 5) return fail("Minimum gift is £5");
      if (!body.to) return fail("Who is it for?");
      const p = await pay("gift", amount, body.method || "card", `Gift to ${body.to}`);
      if (!p.ok) return fail(p.error || "Payment failed", 402);
      const code = "GIFT-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      const { data: g, error } = await admin.from("gifts").insert({ code, sender_id: user.id, recipient_contact: String(body.to).trim(), amount, message: body.message || null, payment_id: p.paymentId }).select().single();
      if (error) return fail(error.message, 500);
      // TODO: send the code by SMS/WhatsApp/email once Twilio is live
      return json({ ok: true, gift: g, sandbox: provider.name === "sandbox" });
    }

    return fail("Unknown action");
  } catch (e) {
    return fail((e as Error).message || "Something went wrong", 500);
  }
});
