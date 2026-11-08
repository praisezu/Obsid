// Vanta Installer — installs Vanta into the Discord desktop app.
// Windows: a native window (or command-line flags). macOS/Linux: command line.
package main

//go:generate go run github.com/akavel/rsrc@v0.10.2 -manifest vanta.manifest -ico vanta.ico -arch amd64 -o rsrc_windows_amd64.syso

import "os"

func main() {
	opts, cli := parseFlags()
	if cli {
		attachConsole()
		os.Exit(runCLI(opts))
	}
	os.Exit(runGUI())
}
