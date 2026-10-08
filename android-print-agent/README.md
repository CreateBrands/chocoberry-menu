# Print Agent (Android, Sunmi tills and handhelds)

Background print service. Polls the store's print queue (`print_jobs` rows with status
`queued` for printer serial `agent:<device>`) and prints each job:
- on Sunmi hardware (V3 Mix, V2, T2, D2, D3 Pro…) through the Sunmi printer service
  (AIDL `woyou.aidlservice.jiuiv5`, raw ESC/POS) — reports the paper width so the
  server renders 58 mm or 80 mm tickets;
- otherwise through the Android USB host API to a USB ESC/POS printer.

Foreground service, restarts on boot, wake lock; works with the screen off and the
POS closed. Jobs are marked sent/failed on the server.

Install: copy PrintAgent.apk to the device, open, allow unknown sources, install.
Open Print Agent → store, name, station, manager PIN → Register → Print a test slip →
Keep running in background. Keep `debug.keystore`: updates must be signed with it.
