//go:build !windows

package main

// Stub: SendARP is a Windows call. Off Windows a discovered printer simply has
// no MAC and falls back to being addressed by IP, which keeps the portable
// logic testable.
func macOf(ip string) string { return "" }
