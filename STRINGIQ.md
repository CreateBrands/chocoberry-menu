# StringIQ card machines

StringIQ's Terminal API mirrors Teya POSLink, so StringIQ runs as a second
provider behind the same till flow. Each card machine row (`teya_terminals`)
says `provider = 'teya' | 'stringiq'`; `teya-pay` routes every call by it.

Docs: https://terminals-test.stringiq.tech/docs/guide and /docs/teya-delta.

## Setup (once per StringIQ key)

1. `db/stringiq.sql` in the SQL editor.
2. Secrets: `supabase secrets set STRINGIQ_API_KEY=<key>` (optional
   `STRINGIQ_BASE_URL`, defaults to the sandbox).
3. Deploy: `teya-pay`, `siq-webhook`, `admin-api`, all with `--no-verify-jwt`.
4. Run `siq_setup` (needs `DIAG_TOKEN` or the master PIN). It checks the key,
   registers our webhook and stores the signing secret (shown once), and lists
   the stores and terminals the key can see.
5. Link a café to a terminal (Admin screen comes in the next patch):
   `insert into teya_terminals (location_id, store_id, terminal_id, label, provider, active) values (...)`.

## How it works

- Pay: `POST /v1/payment-requests` with `order_reference` = order id (same on
  every attempt) and a new ≤30-char `merchant_reference` per attempt.
- Result: signed webhook (`siq-webhook`) → `teya-pay status` → GET by id →
  book `approved_amount` (sale to `order_payments`, tip to
  `menu_orders.tip_amount`) → acknowledge. The till's poll and the sweep use
  the same path; a claim on `recorded_at` stops double booking.
- Cancel: `PATCH {status: CANCELLING}`; act on the returned status.
- Refund (admin-api): `POST /v1/refunds` (202 PENDING), re-checked by GET;
  only SUCCESS is booked, then acknowledged.
- Card details for our receipt: `teya_payment_requests.card`.

## Sandbox test amounts (last two digits)

Approved: most · `11` chip & PIN · `61` +£1 tip · `05`/`51` declined ·
`12` cancelled · `13` timeout · `20` waits 60 s (test cancel) · `40` never
picked up · `50` transaction in progress · `77` unknown progress value.
Terminals: VT-READY-1/2 normal, VT-OFFLINE, VT-BUSY. Refunds ending `05` fail.
