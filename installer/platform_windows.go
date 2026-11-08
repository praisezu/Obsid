//go:build windows

package main

import (
	"os"
	"os/exec"
	"syscall"
)

var (
	kernel32          = syscall.NewLazyDLL("kernel32.dll")
	procAttachConsole = kernel32.NewProc("AttachConsole")
)

// attachConsole lets the GUI build print to the terminal it was started from (CLI flags).
func attachConsole() {
	// Output already redirected (pipe/file)? Windows passes those handles to GUI apps too.
	if _, err := os.Stdout.Stat(); err == nil {
		return
	}
	const attachParentProcess = ^uintptr(0) // (DWORD)-1
	if r, _, _ := procAttachConsole.Call(attachParentProcess); r == 0 {
		return
	}
	if f, err := os.OpenFile("CONOUT$", os.O_WRONLY, 0); err == nil {
		os.Stdout, os.Stderr = f, f
	}
	if f, err := os.OpenFile("CONIN$", os.O_RDONLY, 0); err == nil {
		os.Stdin = f
	}
}

// hiddenCmd runs a console program without flashing a window.
func hiddenCmd(name string, args ...string) *exec.Cmd {
	c := exec.Command(name, args...)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	return c
}

func openFolder(path string) { _ = exec.Command("explorer.exe", path).Start() }
