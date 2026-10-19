//go:build !windows

package main

import "errors"

// Stubs: the background task is a Windows Task Scheduler entry.

const taskName = "Chocoberry Print Agent"

func taskInstalled() bool     { return false }
func installService() error   { return errors.New("the background task needs Windows") }
func uninstallService() error { return errors.New("the background task needs Windows") }
