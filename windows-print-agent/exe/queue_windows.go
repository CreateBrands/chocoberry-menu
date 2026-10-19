//go:build windows

package main

// Creating the Windows print queue, so nobody has to walk the Add Printer
// wizard on a shop floor. Windows will not give a thermal printer a queue by
// itself - it appears as a USB device with no driver and simply sits there -
// and without a queue there is nothing for the spooler to accept bytes for.
// That is the whole of why Al Zahia has never printed.
//
// Installing a printer needs administrator. Rather than telling someone to
// right-click the right thing, this asks Windows for elevation, runs a second
// copy of itself that does only this one job, waits for it, and carries on.

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var (
	shell32         = syscall.NewLazyDLL("shell32.dll")
	kernel32        = syscall.NewLazyDLL("kernel32.dll")
	procShellExecEx = shell32.NewProc("ShellExecuteExW")
	procWaitObject  = kernel32.NewProc("WaitForSingleObject")
	procCloseHandle = kernel32.NewProc("CloseHandle")
	procExitCode    = kernel32.NewProc("GetExitCodeProcess")

	procAddPrinter = winspool.NewProc("AddPrinterW")
	procEnumPorts  = winspool.NewProc("EnumPortsW")
	procDeletePrn  = winspool.NewProc("DeletePrinter")
)

const (
	genericDriver = "Generic / Text Only"

	errAccessDenied         = 5
	errUnknownPrinterDriver = 1797
	errPrinterAlreadyExists = 1802
)

type portInfo1 struct{ Name *uint16 }

type printerInfo2 struct {
	ServerName         *uint16
	PrinterName        *uint16
	ShareName          *uint16
	PortName           *uint16
	DriverName         *uint16
	Comment            *uint16
	Location           *uint16
	DevMode            uintptr
	SepFile            *uint16
	PrintProcessor     *uint16
	Datatype           *uint16
	Parameters         *uint16
	SecurityDescriptor uintptr
	Attributes         uint32
	Priority           uint32
	DefaultPriority    uint32
	StartTime          uint32
	UntilTime          uint32
	Status             uint32
	CJobs              uint32
	AveragePPM         uint32
}

// listPorts returns the printer ports Windows knows about. A USB printer that
// Windows has bound usbprint.sys to shows up as USB001 and upwards; those are
// the only ones worth offering, since a thermal printer on a cable is what
// this is for.
func listPorts() ([]string, error) {
	var needed, returned uint32
	procEnumPorts.Call(0, 1, 0, 0, uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if needed == 0 {
		return nil, nil
	}
	buf := make([]byte, needed)
	r, _, e := procEnumPorts.Call(0, 1, uintptr(unsafe.Pointer(&buf[0])), uintptr(needed),
		uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if r == 0 {
		return nil, fmt.Errorf("could not list the printer ports (%v)", e)
	}
	info := unsafe.Slice((*portInfo1)(unsafe.Pointer(&buf[0])), int(returned))
	out := make([]string, 0, returned)
	for i := range info {
		out = append(out, utf16PtrToString(info[i].Name))
	}
	return out, nil
}

func usbPorts() []string {
	all, _ := listPorts()
	var out []string
	for _, p := range all {
		if strings.HasPrefix(strings.ToUpper(p), "USB") {
			out = append(out, p)
		}
	}
	return out
}

// stageGenericDriver asks Windows to add "Generic / Text Only" from its own
// inbox INF. printui.dll is a Windows component, present everywhere and not
// PowerShell, which is the point: this agent exists because PowerShell cannot
// be relied on. Only reached when AddPrinter says the driver is missing,
// which on a normal Windows install it is not.
func stageGenericDriver() error {
	inf := filepath.Join(os.Getenv("WINDIR"), "inf", "ntprint.inf")
	cmd := exec.Command("rundll32.exe", "printui.dll,PrintUIEntry",
		"/ia", "/q", "/m", genericDriver, "/f", inf)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("could not install the %s driver: %v %s", genericDriver, err, strings.TrimSpace(string(out)))
	}
	return nil
}

func addQueue(name, port string) error {
	pName, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return err
	}
	pPort, _ := syscall.UTF16PtrFromString(port)
	pDriver, _ := syscall.UTF16PtrFromString(genericDriver)
	// WinPrint with the RAW datatype: the spooler hands the bytes over
	// untouched, which is the only thing ESC/POS can survive.
	pProc, _ := syscall.UTF16PtrFromString("WinPrint")
	pData, _ := syscall.UTF16PtrFromString("RAW")
	pComment, _ := syscall.UTF16PtrFromString("Chocoberry receipt printer")

	try := func() (uintptr, syscall.Errno) {
		pi := printerInfo2{
			PrinterName: pName, PortName: pPort, DriverName: pDriver,
			PrintProcessor: pProc, Datatype: pData, Comment: pComment,
		}
		h, _, e := procAddPrinter.Call(0, 2, uintptr(unsafe.Pointer(&pi)))
		// Call always hands back a syscall.Errno, but asserting it blind would
		// turn any surprise into a panic in front of a customer.
		if en, ok := e.(syscall.Errno); ok {
			return h, en
		}
		return h, syscall.Errno(0)
	}

	h, errno := try()
	if h == 0 && errno == errUnknownPrinterDriver {
		if derr := stageGenericDriver(); derr != nil {
			return derr
		}
		h, errno = try()
	}
	if h == 0 {
		switch errno {
		case errPrinterAlreadyExists:
			return nil // someone got there first; that is a success
		case errAccessDenied:
			return errAdminNeeded
		default:
			return fmt.Errorf("could not create the queue %q on %s (%v)", name, port, errno)
		}
	}
	procClosePrinter.Call(h)
	return nil
}

func removeQueue(name string) error {
	p, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return err
	}
	var h syscall.Handle
	if r, _, e := procOpenPrinter.Call(uintptr(unsafe.Pointer(p)), uintptr(unsafe.Pointer(&h)), 0); r == 0 {
		return fmt.Errorf("cannot open %q (%v)", name, e)
	}
	defer procClosePrinter.Call(uintptr(h))
	if r, _, e := procDeletePrn.Call(uintptr(h)); r == 0 {
		return fmt.Errorf("cannot delete %q (%v)", name, e)
	}
	return nil
}

var errAdminNeeded = errors.New("administrator needed")

type shellExecuteInfo struct {
	cbSize       uint32
	fMask        uint32
	hwnd         uintptr
	lpVerb       *uint16
	lpFile       *uint16
	lpParameters *uint16
	lpDirectory  *uint16
	nShow        int32
	hInstApp     uintptr
	lpIDList     uintptr
	lpClass      *uint16
	hkeyClass    uintptr
	dwHotKey     uint32
	hIconMonitor uintptr
	hProcess     uintptr
}

// elevateAndRun starts a second copy of this exe as administrator to do one
// job, and waits for it rather than leaving two windows and a guess about
// which finished. The child does nothing but create the queue and exit.
func elevateAndRun(args string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	verb, _ := syscall.UTF16PtrFromString("runas")
	file, _ := syscall.UTF16PtrFromString(exe)
	params, _ := syscall.UTF16PtrFromString(args)

	const (
		seeMaskNoCloseProcess = 0x00000040
		seeMaskNoAsync        = 0x00000100
		swHide                = 0
		infinite              = 0xFFFFFFFF
	)
	info := shellExecuteInfo{
		fMask:  seeMaskNoCloseProcess | seeMaskNoAsync,
		lpVerb: verb, lpFile: file, lpParameters: params, nShow: swHide,
	}
	info.cbSize = uint32(unsafe.Sizeof(info))

	r, _, e := procShellExecEx.Call(uintptr(unsafe.Pointer(&info)))
	if r == 0 {
		// 1223 is ERROR_CANCELLED: the UAC prompt was dismissed.
		if en, ok := e.(syscall.Errno); ok && en == 1223 {
			return errors.New("the administrator prompt was refused, so the queue was not created")
		}
		return fmt.Errorf("could not ask for administrator (%v)", e)
	}
	if info.hProcess == 0 {
		return nil
	}
	defer procCloseHandle.Call(info.hProcess)
	procWaitObject.Call(info.hProcess, infinite)
	var code uint32
	procExitCode.Call(info.hProcess, uintptr(unsafe.Pointer(&code)))
	if code != 0 {
		return fmt.Errorf("the elevated step failed (exit %d)", code)
	}
	return nil
}

// ensureQueue creates the queue, asking for administrator once if it has to.
func ensureQueue(name, port string) error {
	err := addQueue(name, port)
	if !errors.Is(err, errAdminNeeded) {
		return err
	}
	fmt.Println()
	fmt.Println("Creating a printer needs administrator. Approve the Windows prompt.")
	if eerr := elevateAndRun(fmt.Sprintf(`-addqueue "%s" -port "%s"`, name, port)); eerr != nil {
		return eerr
	}
	// Trust nothing: confirm the queue is really there before saying so.
	queues, _ := listQueues()
	for _, q := range queues {
		if strings.EqualFold(q, name) {
			return nil
		}
	}
	return fmt.Errorf("the elevated step reported success but %q is still not installed", name)
}
