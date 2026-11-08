package main

// Command-line mode (all platforms):
//   VantaInstaller -install   [-branch stable|ptb|canary|development|all] [-local <vanta folder>] [-no-restart]
//   VantaInstaller -uninstall [-branch …] [-no-restart]
//   VantaInstaller -status

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"strings"
)

type cliOptions struct {
	install, uninstall, status, noRestart bool
	branch, local                         string
}

func parseFlags() (cliOptions, bool) {
	var o cliOptions
	fs := flag.NewFlagSet("VantaInstaller", flag.ContinueOnError)
	fs.BoolVar(&o.install, "install", false, "install (or repair) Vanta")
	fs.BoolVar(&o.uninstall, "uninstall", false, "remove Vanta")
	fs.BoolVar(&o.status, "status", false, "show which Discord installs have Vanta")
	fs.BoolVar(&o.noRestart, "no-restart", false, "don't close and reopen Discord")
	fs.StringVar(&o.branch, "branch", "stable", "stable, ptb, canary, development or all")
	fs.StringVar(&o.local, "local", "", "install from a local Vanta folder (dev build) instead of GitHub")
	cli := false
	if err := fs.Parse(os.Args[1:]); err != nil {
		os.Exit(2)
	}
	cli = o.install || o.uninstall || o.status
	return o, cli
}

func runCLI(o cliOptions) int {
	fmt.Printf("Vanta Installer %s\n\n", Version)
	src := Source{Local: o.local}
	entry := MainEntryFor(AppDir())
	if src.Local != "" {
		entry = MainEntryFor(src.Local)
	}
	branches := FindDiscords(entry)
	if len(branches) == 0 {
		fmt.Println("No Discord installation found.")
		return 1
	}
	if o.status {
		for _, b := range branches {
			fmt.Printf("  %-20s %-14s %s\n", b.Name, b.AppVersion, b.State)
			if b.InjectedPath != "" {
				fmt.Printf("  %-20s → %s\n", "", b.InjectedPath)
			}
		}
		return 0
	}

	var targets []*Branch
	for _, b := range branches {
		if o.branch == "all" || strings.EqualFold(b.Key, o.branch) {
			targets = append(targets, b)
		}
	}
	if len(targets) == 0 {
		fmt.Printf("Discord %s isn't installed.\n", o.branch)
		return 1
	}
	status := func(s string) { fmt.Println("  " + s) }

	if o.install {
		var err error
		if entry, err = src.Prepare(status); err != nil {
			fmt.Println("Error:", err)
			return 1
		}
	}
	code := 0
	for _, b := range targets {
		var err error
		if o.install {
			err = InstallInto(b, entry, !o.noRestart, status)
		} else {
			err = UninstallFrom(b, !o.noRestart, status)
		}
		if err != nil {
			fmt.Printf("Error with %s: %v\n", b.Name, err)
			code = 1
		} else if o.install {
			fmt.Printf("Vanta installed into %s.\n", b.Name)
		} else {
			fmt.Printf("Vanta removed from %s.\n", b.Name)
		}
	}
	return code
}

// runInteractive is the menu shown on platforms without the GUI.
func runInteractive() int {
	in := bufio.NewReader(os.Stdin)
	fmt.Println("Vanta Installer " + Version)
	fmt.Println("  1) Install / repair")
	fmt.Println("  2) Uninstall")
	fmt.Println("  3) Status")
	fmt.Print("Choose: ")
	line, _ := in.ReadString('\n')
	o := cliOptions{branch: "all"}
	switch strings.TrimSpace(line) {
	case "1":
		o.install = true
		if local := FindLocalBuild(); local != "" {
			fmt.Printf("Use the local build in %s instead of GitHub? [y/N] ", local)
			if a, _ := in.ReadString('\n'); strings.HasPrefix(strings.ToLower(strings.TrimSpace(a)), "y") {
				o.local = local
			}
		}
	case "2":
		o.uninstall = true
	default:
		o.status = true
	}
	return runCLI(o)
}
