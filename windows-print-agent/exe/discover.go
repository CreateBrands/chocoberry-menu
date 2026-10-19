package main

// Finding the kitchen printers, so nobody has to type an IP address.
//
// Every serious POS avoids making someone type one: Square sweeps the network
// and lists what it finds, Toast prints the address on a label at the factory.
// We cannot put labels on printers we did not sell, so we sweep.
//
// But an address is not an identity, and that is the part a plain sweep gets
// dangerously wrong. Printers take DHCP leases. If the kitchen printer and the
// bar printer come back from a power cut with each other's addresses - routine
// - then a system that knows printers by address sends the kitchen's tickets
// to the bar and says nothing. Nothing errors, nobody is told, and you hear
// about it from a customer. That is worse than not printing at all.
//
// So a discovered printer is identified by its MAC address, which does not
// move, and the IP is only ever a hint refreshed on each sweep. If the MAC is
// not found, that printer reports as missing rather than quietly becoming a
// different one.

import (
	"fmt"
	"net"
	"sort"
	"strings"
	"sync"
	"time"
)

const printerPort = 9100

// NetPrinter is something on the network answering on the ESC/POS port.
type NetPrinter struct {
	IP  string
	MAC string
}

// Target is what the config and Admin store. MAC when we have one, because it
// survives a new lease; the address only when the MAC could not be read, where
// it is still better than nothing.
func (n NetPrinter) Target() string {
	if n.MAC != "" {
		return "mac:" + n.MAC
	}
	return fmt.Sprintf("tcp:%s:%d", n.IP, printerPort)
}

func (n NetPrinter) Name() string {
	if n.MAC != "" {
		return fmt.Sprintf("Network printer %s (at %s)", shortMAC(n.MAC), n.IP)
	}
	return fmt.Sprintf("Network printer at %s", n.IP)
}

// The last three octets are plenty to tell two printers apart in a dropdown,
// and the full MAC in a list of five is noise.
func shortMAC(mac string) string {
	parts := strings.Split(mac, ":")
	if len(parts) >= 3 {
		return strings.Join(parts[len(parts)-3:], ":")
	}
	return mac
}

// localIPv4Nets returns the /24s this machine sits on. Only /24 and only
// private ranges: sweeping anything larger would take long enough to be
// useless, and sweeping a public range would be rude at best.
func localIPv4Nets() []*net.IPNet {
	var out []*net.IPNet
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := ifc.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok || ipnet.IP.To4() == nil || !ipnet.IP.IsPrivate() {
				continue
			}
			ones, bits := ipnet.Mask.Size()
			if bits != 32 || ones < 24 {
				continue
			}
			out = append(out, ipnet)
		}
	}
	return out
}

// DiscoverNetPrinters sweeps every local /24 for anything listening on 9100.
// Concurrent, so a full subnet takes a second or two rather than minutes.
func DiscoverNetPrinters(timeout time.Duration) []NetPrinter {
	nets := localIPv4Nets()
	if len(nets) == 0 {
		return nil
	}
	type hit struct{ ip string }
	var (
		wg   sync.WaitGroup
		mu   sync.Mutex
		hits []hit
	)
	gate := make(chan struct{}, 64) // kind to the network, and to a cheap till

	for _, n := range nets {
		base := n.IP.Mask(n.Mask).To4()
		if base == nil {
			continue
		}
		self := n.IP.To4().String()
		for i := 1; i < 255; i++ {
			ip := net.IPv4(base[0], base[1], base[2], byte(i)).String()
			if ip == self {
				continue
			}
			wg.Add(1)
			go func(ip string) {
				defer wg.Done()
				gate <- struct{}{}
				defer func() { <-gate }()
				c, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", ip, printerPort), timeout)
				if err != nil {
					return
				}
				c.Close()
				mu.Lock()
				hits = append(hits, hit{ip})
				mu.Unlock()
			}(ip)
		}
	}
	wg.Wait()

	out := make([]NetPrinter, 0, len(hits))
	for _, h := range hits {
		// The ARP entry exists because we just connected to it.
		out = append(out, NetPrinter{IP: h.ip, MAC: macOf(h.ip)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].IP < out[j].IP })
	return out
}

// netCache holds the last sweep, so printing can turn a MAC back into the
// address it is at right now.
type netCache struct {
	mu   sync.RWMutex
	seen []NetPrinter
	at   time.Time
}

var discovered netCache

func (c *netCache) set(list []NetPrinter) {
	c.mu.Lock()
	c.seen, c.at = list, time.Now()
	c.mu.Unlock()
}

func (c *netCache) all() []NetPrinter {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return append([]NetPrinter(nil), c.seen...)
}

// addressFor turns a stored target into somewhere to send bytes. A mac: target
// is resolved against the last sweep; not finding it is an error rather than a
// guess, which is the whole point of storing the MAC.
func addressFor(target string) (string, error) {
	if !strings.HasPrefix(target, "mac:") {
		return strings.TrimPrefix(target, "tcp:"), nil
	}
	want := strings.ToUpper(strings.TrimPrefix(target, "mac:"))
	for _, p := range discovered.all() {
		if strings.ToUpper(p.MAC) == want {
			return fmt.Sprintf("%s:%d", p.IP, printerPort), nil
		}
	}
	return "", fmt.Errorf("printer %s is not answering anywhere on this network", shortMAC(want))
}
