//go:build !windows

package main

import "os/exec"

func attachConsole() {}

func hiddenCmd(name string, args ...string) *exec.Cmd { return exec.Command(name, args...) }

// No GUI outside Windows yet: show the interactive terminal menu.
func runGUI() int { return runInteractive() }

func openFolder(path string) { _ = exec.Command("xdg-open", path).Start() }
