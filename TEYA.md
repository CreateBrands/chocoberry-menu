# Teya card machine on the POS (POSLink)

Tap **Card** on the POS → the balance is pushed to the store's Teya terminal →
POS shows "Ask the customer to tap…" → on approval the tender is booked
automatically (order_payments, method card, note `teya:<payment_request_id>`).
Stores with no terminal mapped keep the manual Card button as before.

## One-time setup
1. **Teya Partner portal** (partner.teya.com; staging is partner.teya.xyz) →
   create an OAuth application (client credentials). Copy Client ID + Secret.
   Ask your Teya rep to enable POSLink on the merchant account and to pair
   each card machine to its store in the portal.
2. **Supabase secrets** (Edge Functions → Secrets):
   `TEYA_CLIENT_ID`, `TEYA_CLIENT_SECRET`, `TEYA_ENV=production` (or `staging`).
   If the health check reports `invalid_scope`, also set `TEYA_SCOPES=default_access`.
3. **SQL**: run `db/teya_pay.sql`.
4. **Deploy**: `supabase functions deploy teya-pay --no-verify-jwt`
   then `git push` (POS change).
5. **Health check** (any REST client / browser console):
   POST `https://qtjsdbasoouslcpinqhu.supabase.co/functions/v1/teya-pay`
   body `{"action":"health"}` with the anon `apikey` header → `{ok:true}`.
6. **Map terminals**: POST `{"action":"terminals","pin":"<admin pin>"}` to list
   Teya stores + terminal UUIDs, then insert into `teya_terminals`
   (example at the bottom of `db/teya_pay.sql`). One row per store with
   `tablet_no` null = default machine; add rows with a `tablet_no` only if a
   store runs several machines.

## How it behaves
- Split bills work: each Card share is its own terminal request.
- Cancel on the POS overlay cancels on the machine.
- Declined → "Card payment failed — <reason>", order stays unpaid.
- POS tab closed mid-payment → the next `status` poll (or reopening the order)
  still books the tender; `teya_payment_requests` holds every request.
- Refunds are not wired yet (POSLink has `/poslink/v2/refunds`; add when needed).

Test on **staging** first (`TEYA_ENV=staging`, staging credentials, a test
terminal from Teya) before switching the secrets to production.
