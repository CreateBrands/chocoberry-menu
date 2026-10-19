//go:build windows

package main

// Reading a printer's MAC address, which is what makes a discovered printer
// keep its identity across a DHCP lease change. SendARP asks Windows for the
// hardware address behind a local IP; the entry is already in the ARP cache
// because the sweep just connected to it.

import (
	"fmt"
	"net"
	"syscall"
	"unsafe"
)

var (
	iphlpapi    = syscall.NewLazyDLL("iphlpapi.dll")
	procSendARP = iphlpapi.NewProc("SendARP")
)

func macOf(ip string) string {
	v4 := net.ParseIP(ip).To4()
	if v4 == nil {
		return ""
	}
	// IPAddr is the address as a 32-bit value in network byte order, which on
	// a little-endian machine puts the first octet in the low byte.
	dest := uint32(v4[0]) | uint32(v4[1])<<8 | uint32(v4[2])<<16 | uint32(v4[3])<<24
	var mac [8]byte
	length := uint32(len(mac))
	r, _, _ := procSendARP.Call(uintptr(dest), 0,
		uintptr(unsafe.Pointer(&mac[0])), uintptr(unsafe.Pointer(&length)))
	if r != 0 || length < 6 {
		return ""
	}
	return fmt.Sprintf("%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5])
}
