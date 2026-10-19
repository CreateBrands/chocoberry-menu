//go:build !windows

package main

import "errors"

// USBPrinter is one printer Windows has bound usbprint.sys to. Stubbed off
// Windows so the portable logic still vets and tests.
type USBPrinter struct{ Name, Path string }

func ListUSBPrinters() ([]USBPrinter, error) { return nil, nil }
func sendUSB(match string, data []byte) error {
	return errors.New("writing to a USB printer needs Windows")
}
