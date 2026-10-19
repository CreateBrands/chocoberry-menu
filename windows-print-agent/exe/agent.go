// Chocoberry print agent for Windows tills - a single executable.
//
// Same job and same server contract as the PowerShell agent beside it: ask
// admin-api for queued jobs addressed to a printer serial, hand the ESC/POS
// bytes to whatever drives that printer, mark each job sent or failed.
//
// Why this exists as well as the script. A browser cannot hold a USB printer
// on Windows - usbprint.sys claims the device on plug-in, so WebUSB gets
// Access denied and the slips queue for a screen that can never collect them.
// The PowerShell agent solves that, but needs PowerShell, which is not always
// reachable on a till: locked down by policy, missing from a kiosk build, or
// simply not something a manager can be talked through over the phone. This
// has no dependencies at all. One file, double-click, nothing to install - no
// PowerShell, no .NET, no runtime, no browser.
//
//	chocoberry-print-agent.exe -setup   ask what store and which printer, once
//	chocoberry-print-agent.exe -check   report every link in the chain
//	chocoberry-print-agent.exe -list    show the Windows print queues
//	chocoberry-print-agent.exe          print, until closed
package main

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	baseURL = "https://qtjsdbasoouslcpinqhu.supabase.co"
	webURL  = "https://chocoberry-menu.vercel.app"
	version = "win-exe-1.0"
)

// ---------------------------------------------------------------- config

type printerCfg struct {
	Label string `json:"label"`
	// Pinned once, rather than derived from the position in the list every
	// time. Deriving it meant that removing one printer silently re-pointed
	// every printer after it at a different row in Admin, taking its station,
	// settings and history with it.
	SN      string `json:"sn,omitempty"`
	Station string `json:"station"`
	Target  string `json:"target"` // "win:<queue>" or "tcp:<ip>:<port>"
	Paper   int    `json:"paper"`
}

type config struct {
	Store    string       `json:"store"`
	Printers []printerCfg `json:"printers"`
	// Only needed the first time, to register. Cleared once that has happened,
	// so a till is never left with a manager PIN sitting in a file beside it.
	ManagerPin string   `json:"manager_pin,omitempty"`
	Registered []string `json:"registered,omitempty"`
}

func configPath() string {
	exe, err := os.Executable()
	if err != nil {
		return "chocoberry-agent.json"
	}
	return filepath.Join(filepath.Dir(exe), "chocoberry-agent.json")
}

func loadConfig() (*config, error) {
	b, err := os.ReadFile(configPath())
	if err != nil {
		return nil, err
	}
	var c config
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, fmt.Errorf("%s is not valid JSON: %w", configPath(), err)
	}
	return &c, nil
}

func (c *config) save() error {
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), append(b, '\n'), 0o600)
}

func (c *config) isRegistered(sn string) bool {
	for _, s := range c.Registered {
		if s == sn {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------- serials

var notAlnum = regexp.MustCompile(`[^a-z0-9]`)

// Matches the PowerShell agent exactly, so a till that switches from one to
// the other keeps the same printer in Admin - with its station, its settings
// and its history - instead of registering a second one beside it.
func serialFor(host string, index int) string {
	h := notAlnum.ReplaceAllString(strings.ToLower(host), "")
	if len(h) > 12 {
		h = h[:12]
	}
	return fmt.Sprintf("agent:win-%s-%d", h, index)
}

// ---------------------------------------------------------------- server

var httpc = &http.Client{Timeout: 40 * time.Second}

type api struct{ key string }

// The anon key is public by design and lives in the web bundle. Reading it
// from there rather than baking it in means the agent keeps working if the
// project is ever re-keyed, and there is no credential sitting on the till.
var jwtRe = regexp.MustCompile(`eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}`)
var bundleRe = regexp.MustCompile(`src="(/assets/index-[^"]+\.js)"`)

func anonKeyFrom(js string) (string, error) {
	for _, tok := range jwtRe.FindAllString(js, -1) {
		parts := strings.Split(tok, ".")
		if len(parts) < 2 {
			continue
		}
		payload, err := base64.RawURLEncoding.DecodeString(parts[1])
		if err != nil {
			continue
		}
		if bytes.Contains(payload, []byte(`"anon"`)) {
			return tok, nil
		}
	}
	return "", errors.New("no anon key in the web app bundle")
}

func fetch(url string) (string, error) {
	res, err := httpc.Get(url)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return "", fmt.Errorf("%s returned HTTP %d", url, res.StatusCode)
	}
	b, err := io.ReadAll(res.Body)
	return string(b), err
}

func newAPI() (*api, error) {
	html, err := fetch(webURL + "/index.html")
	if err != nil {
		return nil, fmt.Errorf("cannot reach the web app: %w", err)
	}
	m := bundleRe.FindStringSubmatch(html)
	if m == nil {
		return nil, errors.New("could not find the web app bundle")
	}
	js, err := fetch(webURL + m[1])
	if err != nil {
		return nil, fmt.Errorf("cannot read the web app bundle: %w", err)
	}
	key, err := anonKeyFrom(js)
	if err != nil {
		return nil, err
	}
	return &api{key: key}, nil
}

func (a *api) do(method, url string, body []byte) ([]byte, error) {
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", a.key)
	req.Header.Set("Authorization", "Bearer "+a.key)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return b, fmt.Errorf("HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	return b, nil
}

func (a *api) call(action string, data map[string]any, out any) error {
	body, _ := json.Marshal(map[string]any{"pos": true, "action": action, "data": data})
	b, err := a.do("POST", baseURL+"/functions/v1/admin-api", body)
	if err != nil {
		return err
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(b, out)
}

type store struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (a *api) stores() ([]store, error) {
	b, err := a.do("GET", baseURL+"/rest/v1/menu_locations?select=id,name&active=eq.true", nil)
	if err != nil {
		return nil, err
	}
	var rows []store
	return rows, json.Unmarshal(b, &rows)
}

// Saying only "check the spelling" leaves someone guessing at the spelling of
// something they cannot see, so the names come back with the error.
func (a *api) storeID(name string) (string, error) {
	rows, err := a.stores()
	if err != nil {
		return "", err
	}
	for _, r := range rows {
		if strings.EqualFold(strings.TrimSpace(r.Name), strings.TrimSpace(name)) {
			return r.ID, nil
		}
	}
	var names []string
	var near string
	for _, r := range rows {
		names = append(names, "'"+r.Name+"'")
		if near == "" && (strings.Contains(strings.ToLower(r.Name), strings.ToLower(name)) ||
			strings.Contains(strings.ToLower(name), strings.ToLower(r.Name))) {
			near = r.Name
		}
	}
	msg := fmt.Sprintf("no active store called '%s'.", name)
	if near != "" {
		msg += fmt.Sprintf(" Did you mean '%s'?", near)
	}
	return "", fmt.Errorf("%s Active stores: %s", msg, strings.Join(names, ", "))
}

type regPrinter struct {
	SN     string `json:"sn"`
	Label  string `json:"label"`
	Active bool   `json:"active"`
}

func (a *api) printersAt(storeID string) ([]regPrinter, error) {
	b, err := a.do("GET", baseURL+"/rest/v1/printers?select=sn,label,active&location_id=eq."+storeID, nil)
	if err != nil {
		return nil, err
	}
	var rows []regPrinter
	return rows, json.Unmarshal(b, &rows)
}

type job struct {
	ID         string `json:"id"`
	Slip       string `json:"slip"`
	ContentHex string `json:"content_hex"`
}

// ---------------------------------------------------------------- printing

func sendTCP(target string, data []byte) error {
	addr := strings.TrimPrefix(target, "tcp:")
	if !strings.Contains(addr, ":") {
		addr += ":9100"
	}
	conn, err := net.DialTimeout("tcp", addr, 6*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()
	_ = conn.SetWriteDeadline(time.Now().Add(20 * time.Second))
	_, err = conn.Write(data)
	return err
}

func sendTo(target string, data []byte) error {
	switch {
	case strings.HasPrefix(target, "tcp:"), strings.HasPrefix(target, "mac:"):
		// A mac: target is resolved against the last sweep. Not finding it is
		// an error, never a guess at the nearest printer - sending a kitchen
		// ticket to the bar silently is worse than not printing it.
		addr, err := addressFor(target)
		if err != nil {
			return err
		}
		return sendTCP("tcp:"+addr, data)
	case strings.HasPrefix(target, "win:"):
		return sendRaw(strings.TrimPrefix(target, "win:"), data)
	case strings.HasPrefix(target, "usbdev:"):
		// Straight at the printer, no queue in the way.
		return sendUSB(strings.TrimPrefix(target, "usbdev:"), data)
	default:
		return errors.New("target must start with usbdev:, win: or tcp:")
	}
}

// ---------------------------------------------------------------- console

var in = bufio.NewReader(os.Stdin)

func ask(prompt, def string) string {
	if def != "" {
		fmt.Printf("%s [%s]: ", prompt, def)
	} else {
		fmt.Printf("%s: ", prompt)
	}
	line, _ := in.ReadString('\n')
	line = strings.TrimSpace(line)
	if line == "" {
		return def
	}
	return line
}

func pause() {
	fmt.Print("\nPress Enter to close. ")
	_, _ = in.ReadString('\n')
}

func okLine(label string, ok bool, detail string) {
	mark := "  ok  "
	if !ok {
		mark = " FAIL "
	}
	if detail != "" {
		fmt.Printf("[%s] %s - %s\n", mark, label, detail)
	} else {
		fmt.Printf("[%s] %s\n", mark, label)
	}
}

// ---------------------------------------------------------------- modes

func runSetup() error {
	cfg, _ := loadConfig()
	if cfg == nil {
		cfg = &config{}
	}
	fmt.Println("Chocoberry print agent - setup")
	fmt.Println()

	a, err := newAPI()
	if err != nil {
		return err
	}
	rows, err := a.stores()
	if err != nil {
		return err
	}
	fmt.Println("Stores:")
	for i, r := range rows {
		fmt.Printf("  %2d. %s\n", i+1, r.Name)
	}
	fmt.Println()
	pick := ask("Which store is this till in (number or name)", cfg.Store)
	chosen := pick
	for i, r := range rows {
		if fmt.Sprint(i+1) == pick {
			chosen = r.Name
		}
	}
	if _, err := a.storeID(chosen); err != nil {
		return err
	}
	cfg.Store = chosen

	// One agent drives every printer in the store - a till printer on the
	// cable, kitchen printers over the network - which is the whole point of
	// it running on the till rather than in a browser tab. Setup used to
	// configure exactly one and overwrite whatever was there.
	for {
		fmt.Println()
		if len(cfg.Printers) > 0 {
			fmt.Println("Printers set up so far:")
			for i, p := range cfg.Printers {
				fmt.Printf("  %2d. %-22s %s\n", i+1, p.Label, p.Target)
			}
			fmt.Println()
			if strings.ToLower(ask("Add another printer? (y/n)", "n")) != "y" {
				break
			}
		}
		pc, perr := askPrinter(cfg, len(cfg.Printers))
		if perr != nil {
			return perr
		}
		cfg.Printers = append(cfg.Printers, pc)
	}

	fmt.Println()
	fmt.Println("The store manager PIN is needed once, to register these printers.")
	cfg.ManagerPin = ask("Manager PIN", "")

	if err := cfg.save(); err != nil {
		return err
	}
	fmt.Println()
	fmt.Printf("Saved to %s\n", configPath())
	fmt.Println("Now run the agent with no options to register and start printing.")
	return nil
}

func runCheck() int {
	fail := 0
	host, _ := os.Hostname()
	fmt.Println()
	fmt.Println("Chocoberry print agent - setup check")

	cfg, err := loadConfig()
	if err != nil {
		fail++
		okLine("config file", false, fmt.Sprintf("%s - run with -setup", err))
		return fail
	}
	fmt.Printf("Machine: %s   Store in the config: '%s'\n\n", host, cfg.Store)
	okLine("config file", true, configPath())

	a, err := newAPI()
	if err != nil {
		fail++
		okLine("web app reachable, key read", false, err.Error())
		return fail
	}
	okLine("web app reachable, key read", true, "")

	storeID, err := a.storeID(cfg.Store)
	if err != nil {
		fail++
		okLine("store found in Admin", false, err.Error())
		return fail
	}
	okLine("store found in Admin", true, storeID)

	// What the server believes, rather than what this machine remembers. The
	// two disagreeing is the case worth catching: a serial in the local config
	// that Admin has never heard of means registration silently did not take,
	// and no amount of work on the cable will fix that.
	known, err := a.printersAt(storeID)
	if err != nil {
		fail++
		okLine("printers registered at this store", false, err.Error())
	} else {
		var sns []string
		for _, k := range known {
			sns = append(sns, k.SN)
		}
		okLine("printers registered at this store", true,
			fmt.Sprintf("%d - %s", len(known), strings.Join(sns, ", ")))
	}

	fmt.Println()
	fmt.Println("Sweeping the network for printers...")
	discovered.set(DiscoverNetPrinters(400 * time.Millisecond))
	found := discovered.all()
	if len(found) == 0 {
		okLine("network printers found", true, "none - normal if every printer is on a cable")
	} else {
		var names []string
		for _, n := range found {
			names = append(names, n.Name())
		}
		okLine("network printers found", true, strings.Join(names, "; "))
	}

	queues, _ := listQueues()
	for i, p := range cfg.Printers {
		sn := serialOf(cfg, host, i)
		fmt.Printf("\n  %s  ->  %s  (%s)\n", p.Label, sn, p.Target)

		var found *regPrinter
		for j := range known {
			if known[j].SN == sn {
				found = &known[j]
			}
		}
		if found == nil {
			fail++
			hint := "never registered"
			if cfg.isRegistered(sn) {
				hint = "this machine thinks it registered it, but the server has no such printer"
			}
			okLine("known to the server", false, hint)
		} else if !found.Active {
			okLine("known to the server", true, "SWITCHED OFF in Admin - it will never be sent a job")
		} else {
			okLine("known to the server", true, "active")
		}

		switch {
		case strings.HasPrefix(p.Target, "usbdev:"):
			want := strings.TrimPrefix(p.Target, "usbdev:")
			attached, _ := ListUSBPrinters()
			var names []string
			hit := false
			for _, u := range attached {
				names = append(names, u.Name)
				if strings.Contains(strings.ToLower(u.Name), strings.ToLower(want)) {
					hit = true
				}
			}
			if hit {
				okLine("USB printer attached", true, want)
			} else {
				fail++
				detail := "not attached. Attached now: " + strings.Join(names, ", ")
				if len(attached) == 0 {
					detail = "nothing is attached - check power, paper, the lid, and that the cable carries data"
				}
				okLine("USB printer attached", false, detail)
			}
		case strings.HasPrefix(p.Target, "win:"):
			q := strings.TrimPrefix(p.Target, "win:")
			has := false
			for _, have := range queues {
				if strings.EqualFold(have, q) {
					has = true
				}
			}
			if has {
				okLine("Windows queue '"+q+"' exists", true, "")
			} else {
				fail++
				detail := "not installed - run -setup and choose 'new' to create it"
				if ports := usbPorts(); len(ports) == 0 {
					detail = "not installed, and Windows has no USB printer port either - it has not recognised the printer as a printer. Check power, paper, the lid, and that the cable carries data"
				}
				okLine("Windows queue '"+q+"' exists", false, detail)
			}
		case strings.HasPrefix(p.Target, "mac:"):
			addr, rerr := addressFor(p.Target)
			if rerr != nil {
				fail++
				okLine("printer found on the network", false, rerr.Error())
				break
			}
			okLine("printer found on the network", true, "at "+addr)
		case strings.HasPrefix(p.Target, "tcp:"):
			addr := strings.TrimPrefix(p.Target, "tcp:")
			if !strings.Contains(addr, ":") {
				addr += ":9100"
			}
			c, derr := net.DialTimeout("tcp", addr, 3*time.Second)
			if derr != nil {
				fail++
				okLine("reaches "+addr, false,
					"no answer - wrong address, or the wifi blocks device to device traffic")
			} else {
				c.Close()
				okLine("reaches "+addr, true, "")
			}
		default:
			fail++
			okLine("target understood", false, "must start with win: or tcp:")
		}
	}

	fmt.Println()
	if fail == 0 {
		fmt.Println("Everything checks out. Run with no options to start printing.")
	} else {
		fmt.Printf("%d problem(s) above. Fix the first FAIL and run the check again.\n", fail)
	}
	fmt.Println()
	return fail
}

func runAgent() error {
	cfg, err := loadConfig()
	if err != nil {
		return fmt.Errorf("%w\n\nRun this with -setup first", err)
	}
	if len(cfg.Printers) == 0 {
		return errors.New("no printers in the config - run with -setup")
	}
	host, _ := os.Hostname()

	a, err := newAPI()
	if err != nil {
		return err
	}
	storeID, err := a.storeID(cfg.Store)
	if err != nil {
		return err
	}
	logf("Store: %s", cfg.Store)

	// Find the network printers before registering, so the first thing Admin
	// hears about this till already includes them.
	logf("Looking for printers on the network...")
	discovered.set(DiscoverNetPrinters(400 * time.Millisecond))
	for _, n := range discovered.all() {
		logf("  found %s", n.Name())
	}

	// Held for the whole pass. Clearing it from the config after the first
	// registration - which is where it was being cleared - would have left
	// printers two onwards with no PIN to register with, so a store with a
	// till printer and three kitchen printers would set up exactly one.
	pin := strings.TrimSpace(cfg.ManagerPin)
	registeredAny := false

	// What Admin currently has each printer pointed at, so a change is logged
	// once rather than on every poll.
	assigned := make([]string, len(cfg.Printers))
	serials := make([]string, len(cfg.Printers))
	for i, p := range cfg.Printers {
		sn := serialOf(cfg, host, i)
		serials[i] = sn
		if cfg.isRegistered(sn) {
			logf("%s -> %s (%s)", p.Label, sn, p.Target)
			continue
		}
		if pin == "" {
			return fmt.Errorf("%s is not registered yet, and there is no manager PIN in the config. Run with -setup", sn)
		}
		paper := p.Paper
		if paper == 0 {
			paper = 80
		}
		var res struct {
			OK      bool   `json:"ok"`
			Error   string `json:"error"`
			Message string `json:"message"`
			Target  string `json:"target"`
		}
		err := a.call("device_printer_register", map[string]any{
			"location_id": storeID, "sn": sn, "label": p.Label,
			"station": p.Station, "manager_pin": pin,
			"model": p.Target, "paper_mm": paper,
			"outputs": outputsHere(),
		}, &res)
		if err != nil {
			return fmt.Errorf("could not register %s. Usually the manager PIN is wrong for this store. (%w)", p.Label, err)
		}
		if !res.OK {
			return fmt.Errorf("could not register %s: %s %s", p.Label, res.Message, res.Error)
		}
		logf("Registered %s as %s", p.Label, sn)
		if res.Target != "" && res.Target != p.Target {
			logf("Admin has this one pointed at %s", res.Target)
		}
		cfg.Registered = append(cfg.Registered, sn)
		cfg.Printers[i].SN = sn
		registeredAny = true
		if err := cfg.save(); err != nil {
			logf("warning: could not save the config: %v", err)
		}
	}

	// Now that every printer is registered the PIN has done its one job, so
	// drop it rather than leave a credential in a file on a shop floor.
	if registeredAny && cfg.ManagerPin != "" {
		cfg.ManagerPin = ""
		if err := cfg.save(); err != nil {
			logf("warning: could not clear the PIN from the config: %v", err)
		} else {
			logf("Manager PIN removed from the config file - it is not needed again.")
		}
	}

	logf("Watching for jobs. Leave this window open.")
	backoff := 3 * time.Second
	// Re-sweep now and then: printers get new leases, get unplugged, get
	// added. This is what keeps a mac: target resolvable and what keeps the
	// list in Admin honest.
	nextSweep := time.Now().Add(2 * time.Minute)
	lastOutputs := outputsKey(outputsHere())
	for {
		if time.Now().After(nextSweep) {
			discovered.set(DiscoverNetPrinters(400 * time.Millisecond))
			nextSweep = time.Now().Add(2 * time.Minute)
		}
		did := 0
		var loopErr error
		// Only when the set has changed - every poll would be wasteful, and
		// never would leave Admin offering printers that have gone.
		outs := outputsHere()
		report := []map[string]string(nil)
		if k := outputsKey(outs); k != lastOutputs {
			report = outs
			lastOutputs = k
			logf("What this machine can print to has changed; telling Admin.")
		}
		for i, p := range cfg.Printers {
			paper := p.Paper
			if paper == 0 {
				paper = 80
			}
			var res struct {
				Jobs   []job  `json:"jobs"`
				Target string `json:"target"`
			}
			poll := map[string]any{"sn": serials[i], "agent_version": version, "paper_mm": paper}
			if report != nil && i == 0 {
				poll["outputs"] = report
			}
			if err := a.call("local_print_jobs", poll, &res); err != nil {
				loopErr = err
				break
			}
			// Admin decides where this printer sends its bytes. The choice
			// rides along on the poll the agent already makes, so a change
			// reaches the till within a few seconds without anyone restarting
			// anything or going to the store. An empty target means Admin has
			// expressed no preference, and the config file stands.
			out := p.Target
			if res.Target != "" {
				out = res.Target
				if out != assigned[i] {
					logf("%s: Admin pointed this at %s", p.Label, out)
					assigned[i] = out
				}
			} else if assigned[i] != "" {
				logf("%s: Admin cleared its choice, back to %s", p.Label, p.Target)
				assigned[i] = ""
			}
			for _, j := range res.Jobs {
				var failure string
				data, derr := hex.DecodeString(strings.ReplaceAll(j.ContentHex, " ", ""))
				if derr != nil {
					failure = "bad job data: " + derr.Error()
				} else if serr := sendTo(out, data); serr != nil {
					failure = serr.Error()
				}
				done := map[string]any{"id": j.ID, "sn": serials[i], "ok": failure == "", "error": nil}
				if failure != "" {
					logf("%s: %s FAILED - %s", p.Label, j.Slip, failure)
					done["error"] = failure
				} else {
					logf("%s: printed %s", p.Label, j.Slip)
					did++
				}
				_ = a.call("local_print_done", done, nil)
			}
		}
		if loopErr != nil {
			// Network or server trouble. Back off rather than hammering, and
			// keep going - a till that stops printing because the wifi blinked
			// is no use to anyone.
			logf("offline: %v", loopErr)
			backoff *= 2
			if backoff > 60*time.Second {
				backoff = 60 * time.Second
			}
			time.Sleep(backoff)
			continue
		}
		backoff = 3 * time.Second
		if did == 0 {
			time.Sleep(3 * time.Second)
		} else {
			time.Sleep(400 * time.Millisecond)
		}
	}
}

// outputsHere is what this machine can actually print to, reported to the
// server on every registration so that Admin - which cannot see a till's
// cables - has something real to offer in a dropdown.
func outputsHere() []map[string]string {
	var out []map[string]string
	usbs, _ := ListUSBPrinters()
	for _, u := range usbs {
		out = append(out, map[string]string{"kind": "usb", "name": u.Name, "target": "usbdev:" + u.Name})
	}
	queues, _ := listQueues()
	for _, q := range queues {
		out = append(out, map[string]string{"kind": "queue", "name": q, "target": "win:" + q})
	}
	for _, n := range discovered.all() {
		o := map[string]string{"kind": "net", "name": n.Name(), "target": n.Target(), "ip": n.IP}
		if n.MAC != "" {
			o["mac"] = n.MAC
		}
		out = append(out, o)
	}
	return out
}

// outputsKey is a cheap fingerprint of what this machine can drive, so the
// list is only sent up when it actually changes rather than on every poll.
func outputsKey(outs []map[string]string) string {
	var b strings.Builder
	for _, o := range outs {
		b.WriteString(o["target"])
		b.WriteByte('|')
	}
	return b.String()
}

func logf(format string, args ...any) {
	fmt.Printf("[%s] %s\n", time.Now().Format("15:04:05"), fmt.Sprintf(format, args...))
}

func main() {
	setup := flag.Bool("setup", false, "ask what store and which printer, and save it")
	check := flag.Bool("check", false, "report every link in the chain and stop")
	list := flag.Bool("list", false, "show the Windows print queues on this machine")
	// Used by the elevated copy of itself, which does this one job and exits.
	// Not worth documenting for anyone else to type.
	addQ := flag.String("addqueue", "", "")
	addPort := flag.String("port", "", "")
	flag.Parse()

	var err error
	switch {
	case *addQ != "":
		if err = ensureQueue(*addQ, *addPort); err != nil {
			reportElevatedError(err)
			fmt.Println("Could not create the queue:", err)
			os.Exit(1)
		}
		os.Exit(0)
	case *list:
		var queues []string
		queues, err = listQueues()
		if err == nil {
			if len(queues) == 0 {
				fmt.Println("No print queues installed on this machine.")
			}
			for _, q := range queues {
				fmt.Println(q)
			}
		}
	case *setup:
		err = runSetup()
	case !*check && !fileExists(configPath()):
		// Double-clicking an exe cannot pass -setup, and telling someone to
		// open a command prompt to type a flag gives back the problem this
		// was built to avoid. With no config there is nothing else it could
		// usefully be doing, so the first run sets itself up.
		fmt.Println("First run - nothing is set up yet.")
		fmt.Println()
		if err = runSetup(); err == nil {
			fmt.Println()
			err = runAgent()
		}
	case *check:
		code := runCheck()
		pause()
		os.Exit(code)
	default:
		err = runAgent()
	}

	if err != nil {
		fmt.Println()
		fmt.Println("Stopped:", err)
		fmt.Println()
		fmt.Println("Run it again with -check to see which part of the setup is at fault.")
		pause()
		os.Exit(1)
	}
	pause()
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

// createQueueInteractive installs a Windows print queue for a receipt printer
// on a cable, elevating once if it has to, and returns the queue name.
func createQueueInteractive() (string, error) {
	ports := usbPorts()
	fmt.Println()
	if len(ports) == 0 {
		return "", errors.New(
			"Windows has no USB printer port, which means it has not recognised the printer as a printer at all.\n" +
				"  Check it is powered on with paper and the lid shut, and that the cable is a data cable\n" +
				"  rather than charge-only. Unplug it, plug it back in, and run this again.")
	}
	fmt.Println("USB printer ports Windows can see:")
	for i, p := range ports {
		fmt.Printf("  %2d. %s\n", i+1, p)
	}
	fmt.Println()
	port := ask("Which port is the receipt printer on", ports[0])
	for i, p := range ports {
		if fmt.Sprint(i+1) == port {
			port = p
		}
	}
	name := ask("Name for this queue in Windows", "Chocoberry Receipt")
	if err := ensureQueue(name, port); err != nil {
		return "", err
	}
	fmt.Printf("Created the Windows queue %q on %s, Generic / Text Only.\n", name, port)
	return name, nil
}

// askPrinter collects one printer. The USB route is offered first because it
// needs nothing installed at all - no queue, no driver, no administrator -
// and on Windows 11 the spooler route often cannot be set up at all, the
// Generic / Text Only driver having been dropped and the v4 class drivers
// that replaced it refusing a RAW queue.
func askPrinter(cfg *config, index int) (printerCfg, error) {
	usbs, _ := ListUSBPrinters()
	fmt.Println()
	if len(usbs) > 0 {
		fmt.Println("USB printers attached to this machine:")
		for i, u := range usbs {
			fmt.Printf("  %2d. %s\n", i+1, u.Name)
		}
		fmt.Println("       (these need no queue, no driver and no administrator)")
		fmt.Println()
	}
	queues, _ := listQueues()
	if len(queues) == 0 {
		fmt.Println("Windows print queues on this machine: none")
	} else {
		fmt.Println("Windows print queues on this machine:")
		for i, q := range queues {
			fmt.Printf("  %2d. %s\n", i+1, q)
		}
	}
	fmt.Println()
	fmt.Println("  new.  create a Windows queue for a printer on a USB cable")
	fmt.Println("  Or type a network printer as tcp:<ip>:9100 - kitchen printers on")
	fmt.Println("  ethernet need nothing installed either.")
	fmt.Println()

	def := ""
	if index == 0 && len(usbs) > 0 {
		def = "u1"
	}
	prompt := "Which printer"
	if len(usbs) > 0 {
		prompt += " (u1, u2... for a USB printer above)"
	}
	target := ask(prompt+" (number for a queue, 'new', or tcp:<ip>:9100)", def)
	if strings.HasPrefix(strings.ToLower(target), "u") {
		var n int
		if _, perr := fmt.Sscanf(strings.ToLower(target), "u%d", &n); perr == nil && n >= 1 && n <= len(usbs) {
			target = "usbdev:" + usbs[n-1].Name
		}
	}
	for i, q := range queues {
		if fmt.Sprint(i+1) == target {
			target = q
		}
	}
	if strings.EqualFold(target, "new") {
		made, nerr := createQueueInteractive()
		if nerr != nil {
			return printerCfg{}, nerr
		}
		target = made
	}
	if !strings.HasPrefix(target, "tcp:") && !strings.HasPrefix(target, "win:") && !strings.HasPrefix(target, "usbdev:") {
		target = "win:" + target
	}

	// A network printer that cannot be reached is worth saying so about now,
	// not when a customer is waiting for a ticket. Wifi that isolates clients
	// from each other is the usual reason, and it looks exactly like a wrong
	// address.
	if strings.HasPrefix(target, "tcp:") {
		if err := probeTCP(target); err != nil {
			fmt.Println()
			fmt.Println("  Warning:", err)
			fmt.Println("  Saving it anyway - but it will not print until that is sorted.")
		} else {
			fmt.Println("  Reached it.")
		}
	}

	defLabel := "Till printer"
	if index > 0 {
		defLabel = fmt.Sprintf("Kitchen printer %d", index)
	}
	label := ask("What should it be called in Admin", defLabel)
	station := ask("Station (kitchen or counter)", "kitchen")

	host, _ := os.Hostname()
	return printerCfg{Label: label, Station: station, Target: target, Paper: 80,
		SN: serialFor(host, index)}, nil
}

func probeTCP(target string) error {
	addr := strings.TrimPrefix(target, "tcp:")
	if !strings.Contains(addr, ":") {
		addr += ":9100"
	}
	c, err := net.DialTimeout("tcp", addr, 4*time.Second)
	if err != nil {
		return fmt.Errorf("could not reach %s - wrong address, or the wifi blocks device to device traffic", addr)
	}
	c.Close()
	return nil
}

// serialOf prefers the serial pinned in the config over one derived from the
// printer's position, so the list can be reordered or trimmed without a
// printer quietly becoming a different printer in Admin.
func serialOf(cfg *config, host string, i int) string {
	if cfg.Printers[i].SN != "" {
		return cfg.Printers[i].SN
	}
	return serialFor(host, i)
}
