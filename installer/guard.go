package main

// Vanta Guard: keeps Vanta installed after Discord updates.
//
// Discord installs updates into a fresh folder with a stock index.js, sometimes right at startup,
// before Vanta can run and repair itself. The guard is this same executable running with -guard
// in the background (started at login). Every 20s it checks the Discord installs you installed
// Vanta into; if one is back to stock, it re-applies Vanta and restarts Discord once so it loads.
// It only touches files that are exactly Discord's stock file, so it never fights other mods.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type GuardEntry struct {
	Branch    string `json:"branch"`
	MainEntry string `json:"mainEntry"`
}

type GuardConfig struct {
	Entries []GuardEntry `json:"entries"`
}

func guardFile() string { return filepath.Join(DataDir(), "guard.json") }

func loadGuard() GuardConfig {
	var c GuardConfig
	if data, err := os.ReadFile(guardFile()); err == nil {
		_ = json.Unmarshal(data, &c)
	}
	return c
}

func saveGuard(c GuardConfig) error {
	if err := os.MkdirAll(DataDir(), 0o755); err != nil {
		return err
	}
	data, _ := json.MarshalIndent(c, "", "  ")
	return os.WriteFile(guardFile(), data, 0o644)
}

func guardLog(format string, a ...any) {
	path := filepath.Join(DataDir(), "guard.log")
	if st, err := os.Stat(path); err == nil && st.Size() > 256*1024 {
		_ = os.Remove(path) // keep it small
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s  %s\n", time.Now().Format("2006-01-02 15:04:05"), fmt.Sprintf(format, a...))
}

// EnableGuard remembers this install and makes sure the guard runs now and at every login.
func EnableGuard(branch, mainEntry string) error {
	c := loadGuard()
	found := false
	for i, e := range c.Entries {
		if e.Branch == branch {
			c.Entries[i].MainEntry = mainEntry
			found = true
		}
	}
	if !found {
		c.Entries = append(c.Entries, GuardEntry{Branch: branch, MainEntry: mainEntry})
	}
	if err := saveGuard(c); err != nil {
		return err
	}
	exe, err := installGuardExe()
	if err != nil {
		return err
	}
	if err := registerAutostart(exe); err != nil {
		return err
	}
	return startGuardProcess(exe)
}

// DisableGuard forgets an install; the guard stops itself when nothing is left to watch.
func DisableGuard(branch string) {
	c := loadGuard()
	kept := c.Entries[:0]
	for _, e := range c.Entries {
		if e.Branch != branch {
			kept = append(kept, e)
		}
	}
	c.Entries = kept
	_ = saveGuard(c)
	if len(kept) == 0 {
		unregisterAutostart()
	}
}

func GuardEnabled(branch string) bool {
	for _, e := range loadGuard().Entries {
		if e.Branch == branch {
			return true
		}
	}
	return false
}

// installGuardExe copies this program to <DataDir>/VantaInstaller.exe so the guard has a stable path.
func installGuardExe() (string, error) {
	self, err := os.Executable()
	if err != nil {
		return "", err
	}
	name := "VantaInstaller"
	if strings.HasSuffix(strings.ToLower(self), ".exe") {
		name += ".exe"
	}
	dest := filepath.Join(DataDir(), name)
	if samePath(self, dest) {
		return dest, nil
	}
	data, err := os.ReadFile(self)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(dest, data, 0o755); err != nil {
		// The guard may be running from it (locked on Windows); the existing copy is fine.
		if _, statErr := os.Stat(dest); statErr == nil {
			return dest, nil
		}
		return "", err
	}
	return dest, nil
}

// RunGuard is the guard loop. once = a single check (used by -guard-once).
func RunGuard(once bool) {
	if !once && !acquireSingleInstance() {
		return // already running
	}
	lastRestart := map[string]time.Time{}
	guardLog("guard started (once=%v)", once)
	for {
		c := loadGuard()
		if len(c.Entries) == 0 && !once {
			guardLog("nothing to watch, exiting")
			return
		}
		for _, e := range c.Entries {
			if _, err := os.Stat(e.MainEntry); err != nil {
				continue // Vanta's files are gone; nothing to point Discord at
			}
			for _, b := range FindDiscords(e.MainEntry) {
				if b.Key != e.Branch || b.State != NotInstalled {
					continue
				}
				running := IsRunning(b)
				if err := Inject(b, e.MainEntry); err != nil {
					guardLog("couldn't re-apply Vanta to %s: %v", b.Name, err)
					continue
				}
				guardLog("re-applied Vanta to %s %s after a Discord update", b.Name, b.AppVersion)
				if running && time.Since(lastRestart[b.Key]) > 10*time.Minute {
					lastRestart[b.Key] = time.Now()
					time.Sleep(3 * time.Second) // let Discord finish starting before restarting it
					Kill(b)
					if err := Launch(b); err == nil {
						guardLog("restarted %s so Vanta loads", b.Name)
					}
				}
			}
		}
		if once {
			return
		}
		time.Sleep(20 * time.Second)
	}
}

// StartSafeMode makes Discord's next launch start Vanta in safe mode (no plugins, themes or
// Quick CSS), then restarts Discord. For when a plugin breaks Discord so badly you can't reach
// Vanta's settings.
func StartSafeMode(b *Branch) error {
	if err := os.MkdirAll(DataDir(), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(DataDir(), "boot.json"), []byte(`{"pending":0,"safe":true,"reason":"manual"}`), 0o644); err != nil {
		return err
	}
	if IsRunning(b) {
		Kill(b)
	}
	return Launch(b)
}
