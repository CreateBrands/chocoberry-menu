//go:build windows

package main

// Only one agent per machine may be printing.
//
// Once it runs in the background, someone double-clicking the exe to "check
// it is working" starts a second one. Both poll for the same printer, both
// collect the same job, and the customer gets two copies of their ticket -
// with nothing anywhere saying why. A named mutex is the cheap way to make
// the second one say so and stop.
//
// Setup, -check and -install are unaffected: those do not print, and locking
// them out would stop anyone looking at a till that is already running.

import (
	"strings"
	"syscall"
	"unsafe"
)

var (
	procCreateMutex  = kernel32.NewProc("CreateMutexW")
	procReleaseMutex = kernel32.NewProc("ReleaseMutex")
)

// errAccessDenied is declared with the other spooler error numbers in
// queue_windows.go.
const (
	errAlreadyExists    = 183
	errPrivilegeNotHeld = 1314
)

var heldMutex uintptr

// claimSoleAgent reports whether this process may print. False means another
// copy already is.
func claimSoleAgent() bool {
	name, err := syscall.UTF16PtrFromString("Global\\ChocoberryPrintAgent")
	if err != nil {
		return true // cannot name it, so do not block printing over it
	}
	h, _, e := procCreateMutex.Call(0, 1, uintptr(unsafe.Pointer(name)))
	if h != 0 {
		if en, ok := e.(syscall.Errno); ok && en == errAlreadyExists {
			procCloseHandle.Call(h)
			return false
		}
		heldMutex = h
		return true
	}

	// CreateMutexW failed, and the reason matters.
	//
	// This guard was written for exactly one situation: the background task
	// running as SYSTEM while a member of staff double-clicks the exe to
	// check it works. In that situation it used to fail OPEN. Creating an
	// object in the Global namespace needs SeCreateGlobalPrivilege, which an
	// ordinary user's token does not carry, and opening the existing one
	// fails the DACL check because SYSTEM's default DACL grants only SYSTEM
	// and Administrators. Either way the call fails - and returning "nobody
	// else is running" meant both copies polled the same printer and every
	// ticket came out twice. The one case it defended against was the one
	// case it could not see.
	//
	// A refusal here is evidence of another instance, not of its absence.
	if en, ok := e.(syscall.Errno); ok && (en == errAccessDenied || en == errPrivilegeNotHeld) {
		return false
	}

	// Anything else - the name could not be formed, the object manager is
	// unhappy - is genuinely unknown. Ask Windows whether the background task
	// is running rather than guessing, and only print if it is not.
	return !taskRunning()
}

// taskRunning reports whether the background task is currently executing, as
// a second opinion for when the mutex cannot answer.
func taskRunning() bool {
	out, err := runSchtasks("/Query", "/TN", taskName, "/FO", "LIST")
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(out), "running")
}

func releaseSoleAgent() {
	if heldMutex != 0 {
		procReleaseMutex.Call(heldMutex)
		procCloseHandle.Call(heldMutex)
		heldMutex = 0
	}
}
