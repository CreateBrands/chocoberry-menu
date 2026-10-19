//go:build !windows

package main

import "errors"

// Stubs for the queue-creation half, so the portable logic still vets and
// unit-tests off Windows. The real implementations are in queue_windows.go.

var errAdminNeeded = errors.New("administrator needed")

func usbPorts() []string                  { return nil }
func ensureQueue(name, port string) error { return errors.New("creating a queue needs Windows") }
func removeQueue(name string) error       { return errors.New("removing a queue needs Windows") }

func reportElevatedError(err error) {}
