package main

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The serial must match the PowerShell agent byte for byte, or a till that
// switches from one to the other registers a second printer in Admin beside
// the first instead of keeping its settings, station and history.
func TestSerialMatchesPowerShell(t *testing.T) {
	cases := map[string]string{
		"POS-2":            "agent:win-pos2-0",
		"pos2":             "agent:win-pos2-0",
		"DESKTOP-A1B2C3D4": "agent:win-desktopa1b2c-0", // 15 chars, cut to 12
		"Till_1":           "agent:win-till1-0",
	}
	for host, want := range cases {
		if got := serialFor(host, 0); got != want {
			t.Errorf("serialFor(%q) = %q, want %q", host, got, want)
		}
	}
	if got := serialFor("POS-2", 3); got != "agent:win-pos2-3" {
		t.Errorf("index not honoured: %q", got)
	}
}

func jwt(role string) string {
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"iss":"supabase","role":"` + role + `"}`))
	return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + payload + ".c2lnbmF0dXJlX2hlcmVfcGFkZGluZw"
}

func TestAnonKeyPicksAnonNotServiceRole(t *testing.T) {
	// A bundle holding both must never yield the service_role key.
	bundle := "var a=" + jwt("service_role") + ";var b=" + jwt("anon") + ";"
	got, err := anonKeyFrom(bundle)
	if err != nil {
		t.Fatal(err)
	}
	if got != jwt("anon") {
		t.Fatalf("picked the wrong key")
	}
	if _, err := anonKeyFrom("no tokens here"); err == nil {
		t.Fatal("expected an error when the bundle has no key")
	}
}

func TestConfigRoundTripAndPinIsDropped(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "c.json")
	c := &config{Store: "Al Zahia Mall", ManagerPin: "12345678",
		Printers: []printerCfg{{Label: "Till printer", Target: "win:XP-Q80A", Station: "kitchen", Paper: 80}}}
	b, _ := json.MarshalIndent(c, "", "  ")
	if err := os.WriteFile(path, b, 0o600); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	var back config
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatal(err)
	}
	if back.Store != c.Store || back.Printers[0].Target != "win:XP-Q80A" {
		t.Fatal("config did not survive the round trip")
	}
	// Once registered the PIN is cleared, and omitempty must then keep it out
	// of the file entirely rather than writing an empty credential field.
	back.ManagerPin = ""
	out, _ := json.Marshal(&back)
	if strings.Contains(string(out), "manager_pin") {
		t.Fatalf("a cleared PIN still appears in the file: %s", out)
	}
}

func TestRegisteredLookup(t *testing.T) {
	c := &config{Registered: []string{"agent:win-pos2-0"}}
	if !c.isRegistered("agent:win-pos2-0") {
		t.Error("should be registered")
	}
	if c.isRegistered("agent:win-pos2-1") {
		t.Error("should not be registered")
	}
}

// The server sends the slip as a hex string; a stray space in it must not
// turn into a failed job and a three-strike printer pause.
func TestHexDecode(t *testing.T) {
	data, err := hex.DecodeString(strings.ReplaceAll("1b 40 48 69", " ", ""))
	if err != nil {
		t.Fatal(err)
	}
	if string(data[2:]) != "Hi" || data[0] != 0x1b || data[1] != 0x40 {
		t.Fatalf("decoded wrong: %v", data)
	}
}

func TestSendToRejectsUnknownTarget(t *testing.T) {
	if err := sendTo("usb:main", []byte("x")); err == nil {
		t.Fatal("usb: is not something this agent can drive, and must say so")
	}
}

// A store runs one agent for every printer in it, so the serial must stay
// pinned to the printer rather than to its position in the list. Deriving it
// from the index meant removing the till printer silently re-pointed every
// kitchen printer at the row above it in Admin.
func TestSerialStaysWithThePrinter(t *testing.T) {
	cfg := &config{Printers: []printerCfg{
		{Label: "Till", SN: "agent:win-pos2-0"},
		{Label: "Kitchen", SN: "agent:win-pos2-1"},
		{Label: "Bar", SN: "agent:win-pos2-2"},
	}}
	// Drop the first; the other two must keep their own serials.
	cfg.Printers = cfg.Printers[1:]
	if got := serialOf(cfg, "pos2", 0); got != "agent:win-pos2-1" {
		t.Errorf("Kitchen became %s", got)
	}
	if got := serialOf(cfg, "pos2", 1); got != "agent:win-pos2-2" {
		t.Errorf("Bar became %s", got)
	}
	// An older config with no pinned serial still falls back to the index.
	old := &config{Printers: []printerCfg{{Label: "Till"}}}
	if got := serialOf(old, "pos2", 0); got != "agent:win-pos2-0" {
		t.Errorf("fallback broke: %s", got)
	}
}
