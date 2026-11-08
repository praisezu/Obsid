// Vanta Installer — installs Vanta into the Discord desktop app.
// Windows: a native window (or command-line flags). macOS/Linux: command line.
package main

// Release builds regenerate this with version info from versioninfo.json (see .github/workflows/release.yml).
//go:generate go run github.com/josephspurrier/goversioninfo/cmd/goversioninfo@v1.4.1 -64 -o rsrc_windows_amd64.syso versioninfo.json

import "os"

func main() {
	opts, cli := parseFlags()
	if cli {
		attachConsole()
		os.Exit(runCLI(opts))
	}
	os.Exit(runGUI())
}
