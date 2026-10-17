#requires -Version 5.1
<#
  Chocoberry Print Agent for Windows
  ----------------------------------
  The Windows counterpart of the Android Print Agent. It does the same job and
  speaks the same server contract: ask admin-api for queued jobs addressed to a
  printer serial, print the ESC/POS bytes it is given, then mark each job sent
  or failed.

  Why this exists. A browser cannot print to a printer Windows owns. WebUSB can
  only drive a device bound to WinUSB, and a USB receipt printer on Windows is
  bound to the printing subsystem instead - which is why the till reports
  "Access denied" when Chrome tries to open it. The fix is not to fight Windows
  for the cable but to hand Windows the bytes, exactly as the other POS on that
  machine does.

  It drives two kinds of printer:
    win:<queue name>      a printer installed in Windows. Bytes go to the
                          spooler as RAW, so install it with the "Generic /
                          Text Only" driver, which passes them through
                          untouched. Both tills can share it: the spooler
                          queues rather than fighting.
    tcp:<ip>:<port>       a network printer, spoken to directly on port 9100.
                          No Windows queue needed, and several systems can
                          print to it at once.

  Install
    1. Edit the four settings below.
    2. Run it once from PowerShell to register the printers and check a slip
       comes out:  powershell -ExecutionPolicy Bypass -File ChocoberryPrintAgent.ps1
    3. To start it with the machine, put a shortcut to that same command in
       shell:startup. Clear the manager PIN from the file afterwards - once a
       printer is registered it is never needed again.

  It needs no admin rights, no installer and no open browser.
#>

[CmdletBinding()]
param(
  # Do a single pass and stop, instead of running continuously. For testing.
  [switch]$Once,
  # Seconds between polls when there is nothing to print.
  [int]$IdleSeconds = 3
)

# --- SETTINGS ----------------------------------------------------------------

$StoreName  = "Al Zahia Mall"

# Only needed the first time, to register the printers below. Blank it after.
$ManagerPin = ""

# One entry per printer this machine should drive.
#   Target "win:NAME"           - a printer on a cable. The queue is created
#                                 for you if Windows does not have one yet;
#                                 NAME is just what you want it called.
#   Target "tcp:10.0.0.50:9100" - a network printer. Nothing to install.
#   Port                        - optional, only to pick a specific USB port
#                                 when the machine has several.
$Printers = @(
  @{ Label = "Till printer"; Station = "kitchen"; Target = "win:XP-Q80A"; Paper = 80 }
  # @{ Label = "Kitchen";    Station = "kitchen"; Target = "tcp:192.168.1.50:9100"; Paper = 80 }
)

# -----------------------------------------------------------------------

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 still negotiates TLS 1.0 by default on some builds,
# which Supabase refuses. Without this the agent fails with a bare "could not
# create SSL/TLS secure channel" that looks like a network fault.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$Base      = "https://qtjsdbasoouslcpinqhu.supabase.co"
$Web       = "https://chocoberry-menu.vercel.app"
$Version   = "win-1.0"
$StateFile = Join-Path $env:LOCALAPPDATA "chocoberry-print-agent.json"
$script:AnonKey = $null

function Write-Status([string]$text, [string]$colour = "Gray") {
  Write-Host ("[{0}] {1}" -f (Get-Date).ToString("HH:mm:ss"), $text) -ForegroundColor $colour
}

# The anon key is public by design and lives in the web bundle. Reading it from
# there rather than pasting it into this file means the agent keeps working if
# the project is ever re-keyed, and there is no secret sitting on the till.
function Get-AnonKey {
  if ($script:AnonKey) { return $script:AnonKey }
  $html = (Invoke-WebRequest -Uri "$Web/index.html" -UseBasicParsing -TimeoutSec 30).Content
  $m = [regex]::Match($html, 'src="(/assets/index-[^"]+\.js)"')
  if (-not $m.Success) { throw "Could not find the web app bundle" }
  $js = (Invoke-WebRequest -Uri ($Web + $m.Groups[1].Value) -UseBasicParsing -TimeoutSec 60).Content
  foreach ($tok in [regex]::Matches($js, 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}')) {
    $parts = $tok.Value.Split('.')
    if ($parts.Count -lt 2) { continue }
    $p = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($p.Length % 4) { 2 { $p = $p + '==' } 3 { $p = $p + '=' } }
    try { $payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) } catch { continue }
    if ($payload -match '"anon"') { $script:AnonKey = $tok.Value; return $script:AnonKey }
  }
  throw "Anon key not found in the web app"
}

function Invoke-Api([string]$action, $data) {
  $key = Get-AnonKey
  $body = @{ pos = $true; action = $action; data = $data } | ConvertTo-Json -Depth 8 -Compress
  $headers = @{ apikey = $key; Authorization = "Bearer $key" }
  return Invoke-RestMethod -Method Post -Uri "$Base/functions/v1/admin-api" `
    -Headers $headers -Body $body -ContentType "application/json" -TimeoutSec 40
}

function Get-StoreId([string]$name) {
  $key = Get-AnonKey
  $headers = @{ apikey = $key; Authorization = "Bearer $key" }
  $rows = Invoke-RestMethod -Uri "$Base/rest/v1/menu_locations?select=id,name&active=eq.true" `
    -Headers $headers -TimeoutSec 30
  $hit = @($rows | Where-Object { $_.name -eq $name })
  if ($hit.Count -eq 0) { throw "No active store called '$name'. Check the spelling against Admin." }
  return $hit[0].id
}

# Raw bytes to a Windows print queue. The spooler takes them verbatim with the
# RAW datatype, which is what ESC/POS needs - anything else would try to render
# a page and print gibberish.
if (-not ("ChocoRawPrint" -as [type])) {
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class ChocoRawPrint {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 public class DI { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
                   [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
                   [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
 [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string s, out IntPtr h, IntPtr p);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
 [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool StartDocPrinter(IntPtr h, int l, [In, MarshalAs(UnmanagedType.LPStruct)] DI di);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, IntPtr b, int c, out int w);
 public static string Send(string printer, byte[] bytes) {
   IntPtr h; int w;
   if (!OpenPrinter(printer, out h, IntPtr.Zero))
     return "cannot open printer queue \"" + printer + "\" (win32 " + Marshal.GetLastWin32Error() + ")";
   DI di = new DI(); di.pDocName = "Chocoberry order"; di.pDataType = "RAW";
   string err = null;
   if (!StartDocPrinter(h, 1, di)) { err = "StartDocPrinter failed (win32 " + Marshal.GetLastWin32Error() + ")"; }
   else {
     if (!StartPagePrinter(h)) { err = "StartPagePrinter failed (win32 " + Marshal.GetLastWin32Error() + ")"; }
     else {
       IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
       Marshal.Copy(bytes, 0, p, bytes.Length);
       if (!WritePrinter(h, p, bytes.Length, out w)) err = "WritePrinter failed (win32 " + Marshal.GetLastWin32Error() + ")";
       else if (w != bytes.Length) err = "only " + w + " of " + bytes.Length + " bytes reached the printer";
       Marshal.FreeCoTaskMem(p);
       EndPagePrinter(h);
     }
     EndDocPrinter(h);
   }
   ClosePrinter(h);
   return err;
 }
}
'@
}

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Create the Windows print queue if it is missing, rather than making someone
# click through Printers & scanners on every till. Installing a printer is an
# administrator action on Windows, so this is the one step that needs the
# script run as administrator -- once, after which it never asks again.
#
# Generic / Text Only is deliberate: it is an in-box driver that passes bytes
# through untouched, which is what ESC/POS needs. A vendor driver would try to
# render a page and print nonsense.
function Initialize-WindowsQueue([string]$name, [string]$portHint) {
  if (Get-Printer -Name $name -ErrorAction SilentlyContinue) { return $false }

  if (-not (Test-IsAdmin)) {
    throw "The printer queue '$name' does not exist yet and creating one needs administrator rights. Right-click PowerShell, choose Run as administrator, and run this script once more. After that it never needs admin again."
  }

  $driver = "Generic / Text Only"
  if (-not (Get-PrinterDriver -Name $driver -ErrorAction SilentlyContinue)) {
    Write-Status "Installing the $driver driver" "Yellow"
    Add-PrinterDriver -Name $driver
  }

  $port = $portHint
  if ([string]::IsNullOrWhiteSpace($port)) {
    $usb = @(Get-PrinterPort -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'USB*' })
    if ($usb.Count -eq 0) {
      $all = (Get-PrinterPort -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join ', '
      throw "No USB printer port found, so Windows cannot see the printer on a cable. Check it is plugged in and switched on. Ports Windows has: $all"
    }
    $port = $usb[0].Name
    if ($usb.Count -gt 1) {
      Write-Status ("Several USB ports: {0}. Using {1} - set Port in the settings block to choose another." -f (($usb | Select-Object -ExpandProperty Name) -join ', '), $port) "Yellow"
    }
  }

  Write-Status "Creating queue '$name' on $port" "Yellow"
  Add-Printer -Name $name -DriverName $driver -PortName $port
  return $true
}

function Send-ToTcp([string]$target, [byte[]]$bytes) {
  $bits = $target.Split(':')
  if ($bits.Count -lt 3) { throw "Target should look like tcp:10.0.0.50:9100" }
  $ip = $bits[1]; $port = [int]$bits[2]
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    if (-not $client.ConnectAsync($ip, $port).Wait(5000)) { throw "no answer from ${ip}:${port}" }
    $stream = $client.GetStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
    Start-Sleep -Milliseconds 300
  } finally {
    $client.Dispose()
  }
}

function ConvertFrom-HexString([string]$hex) {
  $h = $hex -replace '\s', ''
  if ($h.Length % 2 -ne 0) { throw "odd number of hex characters" }
  $bytes = New-Object byte[] ($h.Length / 2)
  for ($i = 0; $i -lt $bytes.Length; $i++) {
    $bytes[$i] = [Convert]::ToByte($h.Substring($i * 2, 2), 16)
  }
  return ,$bytes
}

function Read-State {
  if (Test-Path $StateFile) {
    try { return Get-Content -Path $StateFile -Raw | ConvertFrom-Json } catch { }
  }
  return $null
}

function Write-State($obj) {
  $obj | ConvertTo-Json -Depth 8 | Set-Content -Path $StateFile -Encoding UTF8
}

# A serial that stays the same across restarts, so a printer is registered once
# and keeps its history, station and settings.
function Get-Serial([int]$index) {
  $host_ = ($env:COMPUTERNAME).ToLower() -replace '[^a-z0-9]', ''
  if ($host_.Length -gt 12) { $host_ = $host_.Substring(0, 12) }
  return "agent:win-$host_-$index"
}

# --- start up ----------------------------------------------------------------

Write-Status "Chocoberry Print Agent $Version" "Cyan"

if ($Printers.Count -eq 0) { throw "No printers configured. Edit the settings block." }

# Creating a print queue needs administrator. Rather than telling someone to
# right-click the shortcut -- which is easy to forget and easy to get wrong --
# ask Windows for elevation here and carry on in the new window. Only done
# when a queue is actually missing, so the everyday run never prompts.
$needsQueue = $false
foreach ($cfg in $Printers) {
  if ($cfg.Target -like "win:*") {
    $q = $cfg.Target.Substring(4)
    if (-not (Get-Printer -Name $q -ErrorAction SilentlyContinue)) { $needsQueue = $true }
  }
}
if ($needsQueue -and -not (Test-IsAdmin)) {
  Write-Status "A printer queue needs creating, which needs administrator." "Yellow"
  Write-Status "Asking Windows for permission - approve the prompt and watch the new window." "Yellow"
  $relaunch = @("-ExecutionPolicy", "Bypass", "-NoExit", "-File", ('"' + $PSCommandPath + '"'))
  if ($Once) { $relaunch += "-Once" }
  try {
    Start-Process -FilePath "powershell.exe" -ArgumentList $relaunch -Verb RunAs | Out-Null
  } catch {
    throw "Elevation was refused, so the queue cannot be created. Either approve the prompt, or add the printer yourself in Printers and scanners with the Generic / Text Only driver and run this again."
  }
  Write-Status "Handed over to the elevated window. This one is done." "Cyan"
  exit 0
}

$storeId = Get-StoreId $StoreName
Write-Status "Store: $StoreName" "Cyan"

$state = Read-State
if ($null -eq $state) { $state = [pscustomobject]@{ registered = @() } }
$registered = @()
if ($state.registered) { $registered = @($state.registered) }

$serials = @()
for ($i = 0; $i -lt $Printers.Count; $i++) {
  $p    = $Printers[$i]
  $sn   = Get-Serial $i
  $sn_  = $sn

  # Make sure Windows has a queue for it before we promise the server we can
  # print. A missing queue is the commonest reason a till prints nothing.
  if ($p.Target -like "win:*") {
    $queue = $p.Target.Substring(4)
    if (Initialize-WindowsQueue $queue $p.Port) {
      Write-Status "Windows queue '$queue' created" "Green"
    }
  }

  $need = -not ($registered -contains $sn_)

  if ($need) {
    if ([string]::IsNullOrWhiteSpace($ManagerPin)) {
      throw "$sn is not registered yet. Put the store manager PIN in the settings block and run once."
    }
    $paper = 80
    if ($p.Paper) { $paper = [int]$p.Paper }
    # A rejected PIN comes back as an HTTP error, which Invoke-RestMethod turns
    # into an exception - catch it so the message says what to fix.
    try {
      $res = Invoke-Api "device_printer_register" @{
        location_id = $storeId; sn = $sn; label = $p.Label
        station     = $p.Station; manager_pin = $ManagerPin
        model       = $p.Target; paper_mm = $paper
      }
    } catch {
      throw "Could not register $($p.Label). Usually the manager PIN is wrong for this store, or the store name does not match Admin. ($($_.Exception.Message))"
    }
    if (-not $res.ok) { throw "Could not register $($p.Label): $($res.message) $($res.error)" }
    Write-Status "Registered $($p.Label) as $sn" "Green"
    $registered += $sn_
    Write-State ([pscustomobject]@{ registered = $registered })
  } else {
    Write-Status "$($p.Label) -> $sn ($($p.Target))"
  }
  $serials += $sn
}

Write-Status "Watching for jobs. Leave this window open." "Cyan"

# --- the loop ----------------------------------------------------------------

$backoff = $IdleSeconds
while ($true) {
  $did = 0
  try {
    for ($i = 0; $i -lt $Printers.Count; $i++) {
      $p     = $Printers[$i]
      $sn    = $serials[$i]
      $paper = 80
      if ($p.Paper) { $paper = [int]$p.Paper }

      $res  = Invoke-Api "local_print_jobs" @{ sn = $sn; agent_version = $Version; paper_mm = $paper }
      $jobs = @()
      if ($res.jobs) { $jobs = @($res.jobs) }
      if ($jobs.Count -eq 0) { continue }

      foreach ($job in $jobs) {
        $slip = "$($job.slip)"
        $failure = $null
        try {
          $bytes = ConvertFrom-HexString $job.content_hex
          if ($p.Target -like "tcp:*") {
            Send-ToTcp $p.Target $bytes
          } elseif ($p.Target -like "win:*") {
            $queue = $p.Target.Substring(4)
            $failure = [ChocoRawPrint]::Send($queue, $bytes)
          } else {
            $failure = "target must start with win: or tcp:"
          }
        } catch {
          $failure = $_.Exception.Message
        }

        if ($failure) {
          Write-Status "$($p.Label): $slip FAILED - $failure" "Red"
          Invoke-Api "local_print_done" @{ id = $job.id; sn = $sn; ok = $false; error = "$failure" } | Out-Null
        } else {
          Write-Status "$($p.Label): printed $slip" "Green"
          Invoke-Api "local_print_done" @{ id = $job.id; sn = $sn; ok = $true; error = $null } | Out-Null
          $did++
        }
      }
    }
    $backoff = $IdleSeconds
  } catch {
    # Network or server trouble. Back off rather than hammering, and keep going
    # - a till that stops printing because the wifi blinked is no use.
    Write-Status "offline: $($_.Exception.Message)" "Yellow"
    $backoff = [Math]::Min($backoff * 2, 60)
  }

  if ($Once) { break }
  if ($did -eq 0) { Start-Sleep -Seconds $backoff } else { Start-Sleep -Milliseconds 400 }
}
