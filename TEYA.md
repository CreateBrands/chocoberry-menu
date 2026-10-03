# Teya card machine on the POS (POSLink)

Tap **Card** on the POS → the balance is pushed to the store's Teya terminal →
POS shows "Ask the customer to tap…" → on approval the tender is booked
automatically (order_payments, method card, note `teya:<payment_request_id>`).
Stores with no terminal mapped keep the manual Card button as before.

## One-time setup
1. **Teya Partner portal** → Developer → Applications → *Chocoberry POS*
   (Device code application). Done — Client ID `739f78e4-0b44-4cab-bb00-4ea14ae9b2c6`.
2. **Register each store** (on your PC, Node 18+; needs the Chocoberry Teya
   *business* login, i.e. the account that owns the card machines):
   ```
   cd C:\dev\chocoberry-menu
   set TEYA_CLIENT_ID=739f78e4-0b44-4cab-bb00-4ea14ae9b2c6
   set TEYA_CLIENT_SECRET=<the app's client secret>
   node scripts\teya-register.mjs --env production
   ```
   It prints a URL + code → sign in as the Teya account holder → it lists your
   Teya stores and terminals, registers an ePOS per store and writes
   `teya-credentials.sql`. If the first call 404s, open the "Read more about
   device code grant" link on the app page and pass the endpoint it names:
   `--device-url https://id.teya.com/....`
3. **SQL**: run `db/teya_pay.sql`, then `teya-credentials.sql` (edit the
   commented `teya_terminals` lines so each Teya store points at the right
   café; one row per store with `tablet_no` null). Then delete `teya-credentials.sql`.
4. **Supabase secret**: `TEYA_ENV=production`.
5. **Deploy**: `supabase functions deploy teya-pay --no-verify-jwt`, `git push`.
6. **Health check**: POST `{"action":"health"}` to the function (pg_net snippet
   in chat) → one `ok:true` per registered store.

## How it behaves
- Split bills work: each Card share is its own terminal request.
- Cancel on the POS overlay cancels on the machine.
- Declined → "Card payment failed — <reason>", order stays unpaid.
- POS tab closed mid-payment → the next `status` poll (or reopening the order)
  still books the tender; `teya_payment_requests` holds every request.
- Refunds are not wired yet (POSLink has `/poslink/v2/refunds`; add when needed).

Test on **staging** first (`TEYA_ENV=staging`, staging credentials, a test
terminal from Teya) before switching the secrets to production.
