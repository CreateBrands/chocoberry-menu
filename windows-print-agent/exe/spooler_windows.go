//go:build windows

package main

// Raw bytes to a Windows print queue. The spooler takes them verbatim with the
// RAW datatype, which is what ESC/POS needs - anything else would try to
// render a page and the printer would spit out gibberish.
//
// Called through winspool.drv with syscall alone, so the whole agent builds
// with nothing but the standard library: no modules to fetch, no SDK, and one
// file to hand someone.

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	winspool = syscall.NewLazyDLL("winspool.drv")

	procOpenPrinter     = winspool.NewProc("OpenPrinterW")
	procClosePrinter    = winspool.NewProc("ClosePrinter")
	procStartDocPrinter = winspool.NewProc("StartDocPrinterW")
	procEndDocPrinter   = winspool.NewProc("EndDocPrinter")
	procStartPagePrint  = winspool.NewProc("StartPagePrinter")
	procEndPagePrinter  = winspool.NewProc("EndPagePrinter")
	procWritePrinter    = winspool.NewProc("WritePrinter")
	procEnumPrinters    = winspool.NewProc("EnumPrintersW")
)

type docInfo1 struct {
	DocName    *uint16
	OutputFile *uint16
	Datatype   *uint16
}

// PRINTER_INFO_4W: name, server, attributes. Level 4 is the cheap local
// enumeration - level 2 carries the whole driver and port description and has
// to be parsed out of a much larger variable-length block.
type printerInfo4 struct {
	PrinterName *uint16
	ServerName  *uint16
	Attributes  uint32
}

const (
	printerEnumLocal       = 0x00000002
	printerEnumConnections = 0x00000004
)

// syscall has UTF16ToString for a slice but no pointer form - that one lives
// in golang.org/x/sys/windows, and pulling in a module to walk to a NUL would
// cost this agent its only real virtue, which is having no dependencies.
func utf16PtrToString(p *uint16) string {
	if p == nil {
		return ""
	}
	n := 0
	for q := unsafe.Pointer(p); *(*uint16)(q) != 0; n++ {
		q = unsafe.Add(q, unsafe.Sizeof(uint16(0)))
	}
	return syscall.UTF16ToString(unsafe.Slice(p, n))
}

// The deferred calls below used to discard their results. EndDocPrinter is
// what commits a job to the queue, so a spooler restart or a full spool disk
// could fail it while sendRaw still returned nil - the agent would log
// "printed", mark the job sent, and the server discards the content. The slip
// is then gone and unrecoverable. A named return lets the deferred calls
// report it.
func sendRaw(queue string, data []byte) (err error) {
	name, err := syscall.UTF16PtrFromString(queue)
	if err != nil {
		return err
	}
	var h syscall.Handle
	r, _, e := procOpenPrinter.Call(uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(&h)), 0)
	if r == 0 {
		return fmt.Errorf("cannot open printer queue %q (%v)", queue, e)
	}
	defer procClosePrinter.Call(uintptr(h))

	docName, _ := syscall.UTF16PtrFromString("Chocoberry order")
	raw, _ := syscall.UTF16PtrFromString("RAW")
	di := docInfo1{DocName: docName, Datatype: raw}

	r, _, e = procStartDocPrinter.Call(uintptr(h), 1, uintptr(unsafe.Pointer(&di)))
	if r == 0 {
		return fmt.Errorf("the spooler refused the job for %q (%v)", queue, e)
	}
	defer func() {
		if r, _, e := procEndDocPrinter.Call(uintptr(h)); r == 0 && err == nil {
			err = fmt.Errorf("the spooler did not commit the job to %q (%v)", queue, e)
		}
	}()

	r, _, e = procStartPagePrint.Call(uintptr(h))
	if r == 0 {
		return fmt.Errorf("StartPagePrinter failed for %q (%v)", queue, e)
	}
	defer func() {
		if r, _, e := procEndPagePrinter.Call(uintptr(h)); r == 0 && err == nil {
			err = fmt.Errorf("the spooler did not finish the page for %q (%v)", queue, e)
		}
	}()

	if len(data) == 0 {
		return nil
	}
	var written uint32
	r, _, e = procWritePrinter.Call(uintptr(h), uintptr(unsafe.Pointer(&data[0])),
		uintptr(len(data)), uintptr(unsafe.Pointer(&written)))
	if r == 0 {
		return fmt.Errorf("writing to %q failed (%v)", queue, e)
	}
	if int(written) != len(data) {
		return fmt.Errorf("only %d of %d bytes reached %q", written, len(data), queue)
	}
	return nil
}

func listQueues() ([]string, error) {
	flags := uintptr(printerEnumLocal | printerEnumConnections)
	var needed, returned uint32

	// First call sizes the buffer; it is expected to fail.
	procEnumPrinters.Call(flags, 0, 4, 0, 0,
		uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if needed == 0 {
		return nil, nil
	}

	buf := make([]byte, needed)
	r, _, e := procEnumPrinters.Call(flags, 0, 4,
		uintptr(unsafe.Pointer(&buf[0])), uintptr(needed),
		uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if r == 0 {
		return nil, fmt.Errorf("could not list the print queues (%v)", e)
	}

	out := make([]string, 0, returned)
	// The structs sit at the head of the buffer; their strings live further in,
	// pointed at from the struct, so the slice has to be read as structs rather
	// than walked as bytes.
	info := unsafe.Slice((*printerInfo4)(unsafe.Pointer(&buf[0])), int(returned))
	for i := range info {
		if info[i].PrinterName != nil {
			out = append(out, utf16PtrToString(info[i].PrinterName))
		}
	}
	return out, nil
}
