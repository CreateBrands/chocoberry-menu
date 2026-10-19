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

	procAddPrinter  = winspool.NewProc("AddPrinterW")
	procEnumPorts   = winspool.NewProc("EnumPortsW")
	procDeletePrn   = winspool.NewProc("DeletePrinter")
	procEnumDrivers = winspool.NewProc("EnumPrinterDriversW")

	advapi32         = syscall.NewLazyDLL("advapi32.dll")
	procGetTokenInfo = advapi32.NewProc("GetTokenInformation")
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

// isElevated reports whether this process is running as administrator. Needed
// so the elevated copy of itself does not try to elevate again on the same
// failure and spin.
func isElevated() bool {
	var token syscall.Token
	p, err := syscall.GetCurrentProcess()
	if err != nil {
		return false
	}
	if err := syscall.OpenProcessToken(p, syscall.TOKEN_QUERY, &token); err != nil {
		return false
	}
	defer token.Close()
	const tokenElevation = 20
	var elevated uint32
	var size uint32
	r, _, _ := procGetTokenInfo.Call(uintptr(token), tokenElevation,
		uintptr(unsafe.Pointer(&elevated)), unsafe.Sizeof(elevated), uintptr(unsafe.Pointer(&size)))
	return r != 0 && elevated != 0
}

type driverInfo1 struct{ Name *uint16 }

// listDrivers names the printer drivers already on the machine. Used to check
// a staging step really worked, and to say what IS available when the one we
// want is not - the same reason the store lookup lists the store names rather
// than telling someone to check their spelling.
func listDrivers() []string {
	var needed, returned uint32
	procEnumDrivers.Call(0, 0, 1, 0, 0, uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if needed == 0 {
		return nil
	}
	buf := make([]byte, needed)
	r, _, _ := procEnumDrivers.Call(0, 0, 1, uintptr(unsafe.Pointer(&buf[0])), uintptr(needed),
		uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if r == 0 {
		return nil
	}
	info := unsafe.Slice((*driverInfo1)(unsafe.Pointer(&buf[0])), int(returned))
	out := make([]string, 0, returned)
	for i := range info {
		out = append(out, utf16PtrToString(info[i].Name))
	}
	return out
}

func driverInstalled(name string) bool {
	for _, d := range listDrivers() {
		if strings.EqualFold(d, name) {
			return true
		}
	}
	return false
}

// stageGenericDriver asks Windows to add "Generic / Text Only" from its own
// inbox INF. printui.dll is a Windows component, present everywhere and not
// PowerShell, which is the point: being unable to rely on PowerShell is why
// this agent exists.
//
// rundll32 exits 0 whatever happens, so its exit code says nothing. The only
// honest test is to look for the driver afterwards.
func stageGenericDriver() error {
	inf := filepath.Join(os.Getenv("WINDIR"), "inf", "ntprint.inf")
	cmd := exec.Command("rundll32.exe", "printui.dll,PrintUIEntry",
		"/ia", "/q", "/m", genericDriver, "/f", inf)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Run()
	if driverInstalled(genericDriver) {
		return nil
	}
	have := listDrivers()
	if len(have) > 8 {
		have = have[:8]
	}
	return fmt.Errorf("Windows would not install the %q driver from %s.\n"+
		"  Drivers already on this machine include: %s",
		genericDriver, inf, strings.Join(have, ", "))
}

// Windows 11 has dropped most legacy inbox print drivers, so "Generic / Text
// Only" is simply not there on a modern machine and ntprint.inf will not
// produce it. That matters far less than it looks: jobs go out with the RAW
// datatype, which hands the bytes to the port untouched and never asks the
// driver to render anything. The driver only has to exist so the queue can.
//
// So: use Generic / Text Only when it is there, stage it when that is
// possible, and otherwise take the best class driver already installed and
// say which. Refusing to continue over a driver whose rendering we never use
// would be precious.
var driverPreference = []string{
	genericDriver,
	"Generic / Text Only (v4)",
	"Universal Print Class Driver",
	"Microsoft IPP Class Driver",
	"Microsoft Virtual Print Class Driver",
}

func pickDriver(preferred string) (string, error) {
	if preferred != "" {
		if driverInstalled(preferred) {
			return preferred, nil
		}
		return "", fmt.Errorf("no printer driver called %q on this machine. Installed: %s",
			preferred, strings.Join(listDrivers(), ", "))
	}
	if driverInstalled(genericDriver) {
		return genericDriver, nil
	}
	if isElevated() {
		if err := stageGenericDriver(); err == nil {
			return genericDriver, nil
		}
	}
	for _, cand := range driverPreference {
		if driverInstalled(cand) {
			return cand, nil
		}
	}
	all := listDrivers()
	if len(all) == 0 {
		return "", errors.New("this machine has no printer drivers at all")
	}
	return all[0], nil
}

func addQueue(name, port string) error {
	return addQueueWith(name, port, "")
}

func addQueueWith(name, port, preferred string) error {
	pName, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return err
	}
	pPort, _ := syscall.UTF16PtrFromString(port)
	if !isElevated() {
		// Both adding a printer and staging a driver need administrator, and
		// the driver error arrives first, so decide up front rather than
		// reacting to whichever refusal happens to come back.
		return errAdminNeeded
	}
	driver, derr := pickDriver(preferred)
	if derr != nil {
		return derr
	}
	if driver != genericDriver {
		fmt.Printf("  %s is not on this machine; using %q instead.\n", genericDriver, driver)
		fmt.Println("  Jobs go out as RAW, so the driver never renders anything.")
	}
	pDriver, _ := syscall.UTF16PtrFromString(driver)
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
		return fmt.Errorf("Windows rejected the driver %q even though it is installed", driver)
	}
	if h == 0 {
		switch errno {
		case errPrinterAlreadyExists:
			return nil // someone got there first; that is a success
		case errAccessDenied:
			if !isElevated() {
				return errAdminNeeded
			}
			return fmt.Errorf("even as administrator Windows refused to create %q on %s", name, port)
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

// The elevated copy runs hidden, so without this its reason for failing would
// be lost to an exit code - which is exactly the kind of silent failure that
// cost us the first attempt at this.
func elevatedErrPath() string {
	return filepath.Join(os.TempDir(), "chocoberry-addqueue.err")
}

func reportElevatedError(err error) {
	_ = os.WriteFile(elevatedErrPath(), []byte(err.Error()), 0o600)
}

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

	_ = os.Remove(elevatedErrPath())
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
		if b, rerr := os.ReadFile(elevatedErrPath()); rerr == nil && len(b) > 0 {
			return errors.New(strings.TrimSpace(string(b)))
		}
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
