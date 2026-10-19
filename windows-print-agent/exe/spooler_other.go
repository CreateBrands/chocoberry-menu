//go:build !windows

package main

import "errors"

// Stubs so the pure logic - config, serials, key extraction, the server calls
// - can be compiled and unit-tested off Windows. The real implementations are
// in spooler_windows.go; nothing here is ever shipped.

func sendRaw(queue string, data []byte) error {
	return errors.New("printing to a Windows queue needs Windows")
}

func listQueues() ([]string, error) { return nil, nil }
