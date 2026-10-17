# Print Agent (Windows tills)

The Windows counterpart of `android-print-agent`. Same job, same server
contract: ask `admin-api` for queued jobs addressed to a printer serial, print
the ESC/POS bytes, mark each job sent or failed.

## Why it exists

A browser cannot print to a printer Windows owns. WebUSB only drives devices
bound to WinUSB, and a USB receipt printer on Windows is bound to the printing
subsystem instead - so Chrome fails with `Access denied` on open, or claims the
interface and then loses it to the spooler mid-service. Fighting Windows for
the cable does not work and is not worth trying.

This hands Windows the bytes instead, which is what every other POS on the
machine already does. A printer can then be shared: the spooler queues jobs
from both systems rather than one locking the other out.

## What it drives

| Target in the config | Printer |
| --- | --- |
| `win:<queue name>` | A printer installed in Windows. Install it with the **Generic / Text Only** driver - it passes bytes through untouched, which is what ESC/POS needs. A vendor driver would try to render pages. |
| `tcp:<ip>:<port>` | A network printer, spoken to directly on port 9100. No Windows queue needed, and several systems can print to it at once. |

One agent on one machine can drive any number of both, so a store with a till
printer and three kitchen printers needs one copy of this, not four.

## Install

1. Open `ChocoberryPrintAgent.ps1` and edit the settings block: the store name
   exactly as it appears in Admin, the store manager PIN, and one entry per
   printer. For a printer on a cable, `Target` is just what you want the queue
   called - you do not have to create it first.
2. Run it once, **as administrator** if any printer is on a cable:

   ```
   powershell -ExecutionPolicy Bypass -File ChocoberryPrintAgent.ps1 -Once
   ```

   That first run creates any missing Windows queue, installs the Generic /
   Text Only driver if it is not already there, registers each printer with the
   server and prints whatever is waiting.
3. Blank the PIN in the file. It is never needed again.
4. To start with the machine, put a shortcut to the same command (without
   `-Once`, and no longer needing admin) in `shell:startup`.

Only step 2 needs administrator, and only when a Windows queue has to be
created - that is a Windows rule about installing printers, not a choice this
script makes. Network printers need no admin at all, because nothing is
installed for them. There is no installer, nothing to package, and no browser
involved.

## Notes

- The serial is derived from the machine name and stays the same across
  restarts, so a printer keeps its history, station and settings. It is stored
  in `%LOCALAPPDATA%\chocoberry-print-agent.json`.
- The anon key is read from the published web bundle rather than pasted into
  the file, so there is no credential sitting on the till and the agent keeps
  working if the project is re-keyed.
- A failed job is reported back with its reason, which appears on the order and
  in `print_jobs.error`. Three failures in a row pause that printer for ten
  minutes, exactly as for the other transports.
- If the window shows `offline`, the agent backs off up to a minute and keeps
  retrying. It does not give up.
