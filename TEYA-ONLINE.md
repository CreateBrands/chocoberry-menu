# Teya Online Payments (Hosted Checkout / Pay by Link)

Card payment without a terminal. Used by the kiosk ("Pay here by card"), the
tablet/customer app, and phone orders (Pay by Link). POSLink is unaffected —
the two run side by side.

## What Teya must enable
- The **client-credentials** grant on an OAuth app, with the checkout scopes:
  `checkout/sessions/create`, `checkout/sessions/read`, `payment_links/create`,
  `refunds/create`, `transactions/read`.
  The partner portal only offers "Web application" and "Device code application",
  so Teya have to turn this on for us (our device-code app returns
  `unauthorized_client` for this grant).
- The **store_id** for each site that will take online payments.
- A **webhook** pointed at:
  `https://<project>.supabase.co/functions/v1/teya-checkout?webhook=1`
  with the shared secret sent as the `x-teya-signature` header.

## Setup once they do
1. `db/teya_checkout.sql` in the SQL editor.
2. Secrets:
   - `TEYA_ENV=staging` (then `production`)
   - `TEYA_CHECKOUT_CLIENT_ID`, `TEYA_CHECKOUT_CLIENT_SECRET`
   - `TEYA_CHECKOUT_STORE_ID` (or per-site rows in `teya_checkout_stores`)
   - `TEYA_CHECKOUT_WEBHOOK_SECRET`
3. `supabase functions deploy teya-checkout --no-verify-jwt`
4. Health check:
   `curl -X POST https://<project>.supabase.co/functions/v1/teya-checkout -H "Content-Type: application/json" -d "{\"action\":\"health\"}"`

## Test checklist (staging)
1. Place a kiosk order (it lands on hold, awaiting payment).
2. `action: session` with its `order_id` → open the returned `url`.
3. Pay with a Teya test card. Sandbox rule from the app work: an amount ending
   **.99** is declined — use it to test the failure path.
4. Webhook fires → `order_payments` gets the tender, the order flips to paid,
   and the kitchen ticket prints (held kiosk orders are released on payment).
5. `action: status` with the `session_id` — proves the polling fallback books
   the same payment once and only once.
6. `action: refund` with the transaction id → a negative row in `order_payments`
   and the refund shows on the order and the Z-report.
7. `action: link` → a Pay by Link URL for phone orders.
