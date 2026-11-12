package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindUnixCore(t *testing.T) {
	mk := func(base string, parts ...string) string {
		p := filepath.Join(append([]string{base}, parts...)...)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("module.exports = require('./core.asar');"), 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}

	// Newer Discord on a Mac (seen on a user's MacBook): app-0.0.421/modules/discord_desktop_core-1/discord_desktop_core
	newer := t.TempDir()
	want := mk(newer, "app-0.0.421", "modules", "discord_desktop_core-1", "discord_desktop_core", "index.js")
	if v, got := findUnixCore(newer); got != want || v != "app-0.0.421" {
		t.Fatalf("new layout: got %q %q, want %q", v, got, want)
	}

	// Older Discord: 0.0.300/modules/discord_desktop_core
	older := t.TempDir()
	want = mk(older, "0.0.300", "modules", "discord_desktop_core", "index.js")
	if v, got := findUnixCore(older); got != want || v != "0.0.300" {
		t.Fatalf("old layout: got %q %q, want %q", v, got, want)
	}

	// Both (Discord moved to the new layout and left the old folder behind): the newer one wins
	both := t.TempDir()
	mk(both, "0.0.300", "modules", "discord_desktop_core", "index.js")
	want = mk(both, "app-0.0.421", "modules", "discord_desktop_core-2", "discord_desktop_core", "index.js")
	if _, got := findUnixCore(both); got != want {
		t.Fatalf("both: got %q, want %q", got, want)
	}

	if _, got := findUnixCore(t.TempDir()); got != "" {
		t.Fatalf("empty folder: got %q", got)
	}
}
