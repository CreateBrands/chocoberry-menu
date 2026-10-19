//go:build !windows

package main

func claimSoleAgent() bool { return true }
func releaseSoleAgent()    {}
