//go:build windows

package main

// Keeping the agent running without a window someone can close.
//
// A till that only prints while a console window happens to be open is not a
// till that prints. Staff close windows; machines reboot; nobody logs back in
// at 7am to start a printer. A startup shortcut only half-answers it - still a
// window, and still nothing until someone signs in.
//
// So the agent registers itself as a scheduled task running at boot as
// SYSTEM: no window at all, no sign-in needed, and Windows restarts it if it
// stops. schtasks is a Windows component and specifically not PowerShell,
// which is the point - this exists because PowerShell cannot be relied on.

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

const taskName = "Chocoberry Print Agent"

// Driven from XML rather than schtasks' flags, because the things that matter
// here - never time out, restart if it dies, keep going on battery - have no
// command-line equivalent.
func taskXML(exePath string) string {
	dir := filepath.Dir(exePath)
	return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Prints Chocoberry tickets and receipts on this till.</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger><Enabled>true</Enabled></BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>5</Priority>
    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>` + xmlEscape(exePath) + `</Command>
      <WorkingDirectory>` + xmlEscape(dir) + `</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`
}

func xmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return r.Replace(s)
}

func runSchtasks(args ...string) (string, error) {
	cmd := exec.Command("schtasks.exe", args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func taskInstalled() bool {
	_, err := runSchtasks("/Query", "/TN", taskName)
	return err == nil
}

func installService() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if !isElevated() {
		fmt.Println("Installing a background task needs administrator. Approve the Windows prompt.")
		if eerr := elevateAndRun("-install"); eerr != nil {
			return eerr
		}
		if !taskInstalled() {
			return fmt.Errorf("the elevated step finished but %q is not there", taskName)
		}
		fmt.Printf("Installed. %q runs at startup from now on.\n", taskName)
		return nil
	}

	// UTF-16 with a BOM: schtasks /XML rejects anything else outright, with an
	// error that says nothing about encoding.
	xmlPath := filepath.Join(os.TempDir(), "chocoberry-print-agent-task.xml")
	if err := os.WriteFile(xmlPath, toUTF16LEBOM(taskXML(exe)), 0o600); err != nil {
		return err
	}
	defer os.Remove(xmlPath)

	out, err := runSchtasks("/Create", "/TN", taskName, "/XML", xmlPath, "/F")
	if err != nil {
		return fmt.Errorf("could not create the background task: %v %s", err, out)
	}
	if _, err := runSchtasks("/Run", "/TN", taskName); err != nil {
		// Not fatal: it will start at the next boot regardless.
		fmt.Println("  Created, but could not start it now - it will start at the next reboot.")
	}
	return nil
}

func uninstallService() error {
	if !isElevated() {
		fmt.Println("Removing the background task needs administrator. Approve the Windows prompt.")
		return elevateAndRun("-uninstall")
	}
	out, err := runSchtasks("/Delete", "/TN", taskName, "/F")
	if err != nil {
		return fmt.Errorf("could not remove the background task: %v %s", err, out)
	}
	return nil
}

func toUTF16LEBOM(s string) []byte {
	u := syscall.StringToUTF16(s)
	u = u[:len(u)-1] // drop the NUL StringToUTF16 appends
	b := make([]byte, 0, len(u)*2+2)
	b = append(b, 0xFF, 0xFE)
	for _, r := range u {
		b = append(b, byte(r), byte(r>>8))
	}
	return b
}
