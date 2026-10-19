//go:build windows

package main

// Writing straight to a USB printer, with no print queue and no driver.
//
// Windows binds usbprint.sys to any USB printer-class device the moment it is
// plugged in. That is what blocks WebUSB - the browser cannot have the device
// because Windows already has it - and it is also the way through, because
// usbprint.sys publishes a device interface that anything can open with
// CreateFile and write bytes to. The bytes go to the printer untouched.
//
// Everything the spooler route needs - a queue, a driver, administrator - is
// avoided here. That matters because the spooler route ran out of road on
// Windows 11: the legacy "Generic / Text Only" driver is no longer shipped,
// and the class drivers that replaced it are v4 and refuse a RAW queue with
// "cannot complete this function".
//
// No admin. No install. Nothing in Settings.

import (
	"errors"
	"fmt"
	"strings"
	"syscall"
	"unsafe"
)

var (
	setupapi = syscall.NewLazyDLL("setupapi.dll")

	procGetClassDevs     = setupapi.NewProc("SetupDiGetClassDevsW")
	procEnumDevInterface = setupapi.NewProc("SetupDiEnumDeviceInterfaces")
	procDevInterfaceDet  = setupapi.NewProc("SetupDiGetDeviceInterfaceDetailW")
	procDestroyDevInfo   = setupapi.NewProc("SetupDiDestroyDeviceInfoList")
	procGetDevRegProp    = setupapi.NewProc("SetupDiGetDeviceRegistryPropertyW")
)

type guid struct {
	Data1 uint32
	Data2 uint16
	Data3 uint16
	Data4 [8]byte
}

// GUID_DEVINTERFACE_USBPRINT
var guidUSBPrint = guid{0x28d78fad, 0x5a12, 0x11d1, [8]byte{0xae, 0x5b, 0x00, 0x00, 0xf8, 0x03, 0xa8, 0xc2}}

type spDeviceInterfaceData struct {
	cbSize             uint32
	interfaceClassGUID guid
	flags              uint32
	reserved           uintptr
}

type spDevinfoData struct {
	cbSize    uint32
	classGUID guid
	devInst   uint32
	reserved  uintptr
}

const (
	digcfPresent         = 0x00000002
	digcfDeviceInterface = 0x00000010
	spdrpDeviceDesc      = 0x00000000
	spdrpFriendlyName    = 0x0000000C
	invalidHandle        = ^uintptr(0)
)

// USBPrinter is one printer Windows has bound usbprint.sys to.
type USBPrinter struct {
	Name string // what Windows calls it, e.g. "USB Printing Support" or the model
	Path string // the device interface path to open
}

func propString(devs uintptr, info *spDevinfoData, prop uint32) string {
	var needed uint32
	procGetDevRegProp.Call(devs, uintptr(unsafe.Pointer(info)), uintptr(prop), 0, 0, 0,
		uintptr(unsafe.Pointer(&needed)))
	if needed == 0 {
		return ""
	}
	buf := make([]byte, needed)
	r, _, _ := procGetDevRegProp.Call(devs, uintptr(unsafe.Pointer(info)), uintptr(prop), 0,
		uintptr(unsafe.Pointer(&buf[0])), uintptr(needed), 0)
	if r == 0 {
		return ""
	}
	return utf16PtrToString((*uint16)(unsafe.Pointer(&buf[0])))
}

// ListUSBPrinters returns every USB printer currently attached, whether or not
// Windows ever gave it a print queue.
func ListUSBPrinters() ([]USBPrinter, error) {
	devs, _, e := procGetClassDevs.Call(uintptr(unsafe.Pointer(&guidUSBPrint)), 0, 0,
		digcfPresent|digcfDeviceInterface)
	if devs == invalidHandle {
		return nil, fmt.Errorf("could not ask Windows for USB printers (%v)", e)
	}
	defer procDestroyDevInfo.Call(devs)

	var out []USBPrinter
	for i := uint32(0); ; i++ {
		var ifd spDeviceInterfaceData
		ifd.cbSize = uint32(unsafe.Sizeof(ifd))
		r, _, _ := procEnumDevInterface.Call(devs, 0, uintptr(unsafe.Pointer(&guidUSBPrint)),
			uintptr(i), uintptr(unsafe.Pointer(&ifd)))
		if r == 0 {
			break
		}

		var needed uint32
		procDevInterfaceDet.Call(devs, uintptr(unsafe.Pointer(&ifd)), 0, 0,
			uintptr(unsafe.Pointer(&needed)), 0)
		if needed == 0 {
			continue
		}
		buf := make([]byte, needed)
		// cbSize is the size of the fixed part of the struct, not the buffer:
		// 6 on 32-bit, 8 on 64-bit. Getting this wrong fails the call outright.
		*(*uint32)(unsafe.Pointer(&buf[0])) = 8
		var info spDevinfoData
		info.cbSize = uint32(unsafe.Sizeof(info))
		r, _, _ = procDevInterfaceDet.Call(devs, uintptr(unsafe.Pointer(&ifd)),
			uintptr(unsafe.Pointer(&buf[0])), uintptr(needed),
			uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&info)))
		if r == 0 {
			continue
		}
		path := utf16PtrToString((*uint16)(unsafe.Pointer(&buf[4])))
		name := propString(devs, &info, spdrpFriendlyName)
		if name == "" {
			name = propString(devs, &info, spdrpDeviceDesc)
		}
		if name == "" {
			name = "USB printer"
		}
		out = append(out, USBPrinter{Name: name, Path: path})
	}
	return out, nil
}

// findUSBPrinter resolves what the config stored - a name fragment, or an
// index - against what is attached right now. Device paths change when a
// printer moves to another socket, so the config holds something stable and
// this does the lookup each time.
func findUSBPrinter(match string) (USBPrinter, error) {
	list, err := ListUSBPrinters()
	if err != nil {
		return USBPrinter{}, err
	}
	if len(list) == 0 {
		return USBPrinter{}, errors.New(
			"no USB printer is attached. Check it is powered on with paper and the lid shut, " +
				"and that the cable carries data rather than only charge")
	}
	if match == "" {
		return list[0], nil
	}
	for _, p := range list {
		if strings.EqualFold(p.Name, match) {
			return p, nil
		}
	}
	for _, p := range list {
		if strings.Contains(strings.ToLower(p.Name), strings.ToLower(match)) {
			return p, nil
		}
	}
	var names []string
	for _, p := range list {
		names = append(names, "'"+p.Name+"'")
	}
	return USBPrinter{}, fmt.Errorf("no attached USB printer matching %q. Attached: %s",
		match, strings.Join(names, ", "))
}

// sendUSB writes the bytes straight at the printer.
func sendUSB(match string, data []byte) error {
	p, err := findUSBPrinter(match)
	if err != nil {
		return err
	}
	path, err := syscall.UTF16PtrFromString(p.Path)
	if err != nil {
		return err
	}
	h, err := syscall.CreateFile(path, syscall.GENERIC_WRITE,
		syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE, nil,
		syscall.OPEN_EXISTING, 0, 0)
	if err != nil {
		return fmt.Errorf("cannot open %s: %w", p.Name, err)
	}
	defer syscall.CloseHandle(h)

	for off := 0; off < len(data); {
		var wrote uint32
		if err := syscall.WriteFile(h, data[off:], &wrote, nil); err != nil {
			return fmt.Errorf("writing to %s failed: %w", p.Name, err)
		}
		if wrote == 0 {
			return fmt.Errorf("%s stopped accepting data after %d of %d bytes", p.Name, off, len(data))
		}
		off += int(wrote)
	}
	return nil
}
