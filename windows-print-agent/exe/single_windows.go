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
	"syscall"
	"unsafe"
)

var (
	procCreateMutex  = kernel32.NewProc("CreateMutexW")
	procReleaseMutex = kernel32.NewProc("ReleaseMutex")
)

const errAlreadyExists = 183

var heldMutex uintptr

// claimSoleAgent reports whether this process may print. False means another
// copy already is.
func claimSoleAgent() bool {
	name, err := syscall.UTF16PtrFromString("Global\\ChocoberryPrintAgent")
	if err != nil {
		return true // cannot name it, so do not block printing over it
	}
	h, _, e := procCreateMutex.Call(0, 1, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return true
	}
	if en, ok := e.(syscall.Errno); ok && en == errAlreadyExists {
		procCloseHandle.Call(h)
		return false
	}
	heldMutex = h
	return true
}

func releaseSoleAgent() {
	if heldMutex != 0 {
		procReleaseMutex.Call(heldMutex)
		procCloseHandle.Call(heldMutex)
		heldMutex = 0
	}
}
