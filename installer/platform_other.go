//go:build !windows

package main

import "os/exec"

func attachConsole() {}

func hiddenCmd(name string, args ...string) *exec.Cmd { return exec.Command(name, args...) }

// No GUI outside Windows yet: show the interactive terminal menu.
func runGUI() int { return runInteractive() }

func openFolder(path string) { _ = exec.Command("xdg-open", path).Start() }

// openURL opens a web page in the default browser.
func openURL(url string) { _ = exec.Command("xdg-open", url).Start() }

// Vanta Guard autostart is Windows-only for now; on macOS/Linux run `VantaInstaller -guard` yourself
// (for example from your desktop's autostart settings).
func registerAutostart(string) error     { return nil }
func unregisterAutostart()               {}
func autostartRegistered() bool          { return false }
func acquireSingleInstance() bool        { return true }
func startGuardProcess(exe string) error { return exec.Command(exe, "-guard").Start() }
