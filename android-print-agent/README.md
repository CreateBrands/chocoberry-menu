# Print Agent (Android, for Sunmi tills)

Background print service. Polls the store's print queue (`print_jobs` rows with
status `queued` for printer serial `agent:<device>`) and prints each job over the
Android USB host API — this reaches the Sunmi built-in printer (it appears as a
USB printer, "Printer Gadget") and any external USB ESC/POS printer.

Runs as a foreground service, restarts on boot, keeps a wake lock, and works
with the screen off and the POS closed. Jobs are marked sent/failed on the
server so the KDS banner, admin and Clear queue stay accurate.

Install: copy `PrintAgent.apk` to the device, open it, allow unknown sources,
install. Open Print Agent → pick store, name, station, manager PIN → Register →
allow the printer when Android asks → Print a test slip → Keep running in
background (battery exemption).

Keep `debug.keystore` — updates must be signed with the same key to install over
the existing app. `build.sh` rebuilds the APK with the Debian Android tools.
