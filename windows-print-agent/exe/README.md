# Print agent (.exe)

The same agent as the PowerShell script next door, as a single Windows
executable. Nothing to install: no PowerShell, no .NET, no runtime, no
browser. One file.

## Why this as well as the script

A browser cannot hold a USB printer on Windows. `usbprint.sys` claims the
device the moment it is plugged in, so WebUSB gets `Access denied` and the
slips queue for a screen that can never collect them. The PowerShell agent
solves that by handing the bytes to the spooler instead - but it needs
PowerShell, and on a till that is not a given. It can be locked down by
policy, absent from a kiosk build, or simply not something a manager can be
talked through over the phone.

This has no dependencies at all, so none of that applies.

## Using it

Put `chocoberry-print-agent.exe` anywhere on the till - the desktop is fine -
and double-click it. The first run asks which store it is in, which printer to
drive, and the store manager PIN, then registers and starts printing. The
answers are saved in `chocoberry-agent.json` beside the exe. The PIN is
**deleted from that file** as soon as registration succeeds, so a credential
is not left sitting on a shop floor.

| | |
| --- | --- |
| `chocoberry-print-agent.exe` | print, until the window is closed |
| `-check` | report every link in the chain and stop, changing nothing |
| `-setup` | ask the questions again |
| `-list` | show the Windows print queues on this machine |

To start with the machine, put a shortcut to the exe in `shell:startup`.

**Windows will warn you the first time.** The exe is not code-signed, so
SmartScreen says "Windows protected your PC" - choose **More info**, then
**Run anyway**. Defender may also want a moment to scan it.

## What it drives

| Target | Printer |
| --- | --- |
| `win:<queue name>` | A printer installed in Windows. Use the **Generic / Text Only** driver - it passes bytes through untouched, which is what ESC/POS needs. A vendor driver tries to render pages and prints gibberish. |
| `tcp:<ip>:9100` | A network printer, spoken to directly. Nothing installed, and several systems can print to it at once. |

Windows does **not** give a thermal printer a queue by itself. It appears as a
USB device with no driver and sits there, and without a queue the spooler has
nothing to accept bytes for - which is the whole reason a till can look
perfectly healthy and never print.

So setup offers `new`: it lists the USB printer ports Windows can see, creates
the queue on the one you pick with the Generic / Text Only driver, and asks
for administrator once on the way (a second copy of itself does only that, and
the first waits for it). Nothing to do in Settings.

If Windows has no USB printer port at all, it has not recognised the device as
a printer - check power, paper, the lid being properly shut, and that the
cable carries data rather than only charge. That last one looks identical to a
good cable.

## When nothing prints

```
chocoberry-print-agent.exe -check
```

It changes nothing and reports every step: web app reachable and key readable,
the store name matching a store in Admin (listing the real names if not), what
the **server** believes is registered for this store against what this machine
thinks it registered, whether the Windows queue exists, and whether a network
printer answers on its port.

The two disagreeing is the case most worth catching. A serial this machine
recorded that Admin has never heard of means registration silently did not
take, and no amount of work on the cable will fix it.

## Notes

- The serial is `agent:win-<machine>-<n>`, derived the same way as the
  PowerShell agent, so a till that switches between the two keeps the same
  printer in Admin with its station, settings and history. A test covers that.
- The anon key is read from the published web bundle rather than baked in, so
  there is no credential in the binary and the agent survives a re-key.
- A failed job is reported back with its reason, which appears on the order
  and in `print_jobs.error`. Three failures in a row pause that printer for
  ten minutes, as with every other transport.
- If the network drops it backs off up to a minute and keeps retrying rather
  than giving up.

## Building

`./build.sh` from anywhere Go runs - it cross-compiles, so no Windows needed.
Everything is the standard library; there are no modules to fetch. The Win32
calls live in `spooler_windows.go`; `spooler_other.go` stubs them so the rest
can be vetted and unit-tested on Linux.
