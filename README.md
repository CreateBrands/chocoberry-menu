# still. / Chocoberry — Digital Menu

Customer-facing kiosk/QR ordering app. Vite + React, backed by Supabase
(project `qtjsdbasoouslcpinqhu`). Multi-location: each tablet loads its own
store's menu and prices via a QR token.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
```

Environment variables live in `.env` (already filled for local dev):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## How a tablet knows its store

Open the app with `?store=TOKEN`. The token is saved to the device, so
subsequent loads don't need it. The token is a `menu_tables.qr_token` value
that resolves (via the `resolve_store` DB function) to a location + brand.

- No token → falls back to the global master menu.
- Valid token → loads that store's effective menu (per-store price /
  availability overrides applied by the `store_menu` DB function).

## Deploy the app (Vercel)

```bash
npm install -g vercel      # if needed
vercel                     # first run links/creates the project
vercel --prod              # production deploy
```

In the Vercel dashboard, add the two env vars (Settings → Environment
Variables):
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Then redeploy.

`vercel.json` rewrites all routes to `/` so `?store=` links and refreshes work.

## Deploy the order function (Supabase)

The `place-order` edge function validates prices server-side and writes the
order. It must be deployed for real orders (otherwise the app uses a local
fallback order number).

```bash
supabase link --project-ref qtjsdbasoouslcpinqhu   # once
supabase functions deploy place-order
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically for
deployed functions — no secrets to set by hand.

## Database

Schema lives in the Supabase project (already applied):
- Phase 1 — menu tables + items
- Phase 4 — orders + RLS
- Phase 5 — multi-location overrides, `store_menu` / `resolve_store`,
  POS ids, allergens

## Project structure

```
index.html              Vite entry
src/main.jsx            React mount
src/App.jsx             the whole app (6 screens + data layer)
supabase/functions/place-order/index.ts   order edge function
vercel.json             SPA rewrites
.env                    local Supabase creds (gitignored)
```
