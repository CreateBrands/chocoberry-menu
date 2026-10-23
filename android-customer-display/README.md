# Customer Display (Android, Sunmi tills with a rear screen)

Shows the store's posters on the customer-facing screen of a dual-screen till
(Sunmi D3 Pro, T2…). Without it Android mirrors the till onto the rear screen.

How it works: a foreground service puts a WebView on the secondary display
showing `https://chocoberry-menu.vercel.app/display?loc=<store>`. Route 1 is an
overlay window added straight to that display (on Android 11+ via a window
context of the overlay type; an Android `Presentation` does NOT work here —
the D3 Pro (rear screen "Sunmi USBDisplay") throws IllegalArgumentException
because a Presentation insists on its own window type). Route 2, if the
device refuses that, launches DisplayActivity onto the rear screen. The page rotates the posters set in Admin → store → Branding →
Customer display (`display_slides:<location_id>`; falls back to the store's
kiosk slides, then the menu's hero slides). The page caches the last good set,
so a dropped connection never blanks the screen. Starts on boot, survives the
rear screen being unplugged, reloads a few times a day to pick up web changes.

The service draws over other apps, so Android asks once for
"Display over other apps" — the app has a button for it.

Install: download from /apps/ on the till, open, pick the store, allow the
permission, allow background running. Updates install over the top and keep
settings; keep `debug.keystore` — updates must be signed with the same key.

Build: `sh build.sh` (stock Debian/Ubuntu Android tools, no Android Studio),
then copy `CustomerDisplay.apk` to `public/apps/`.
