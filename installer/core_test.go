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

	// Same version in both layouts, but only the new one has the file (the old folder is just leftovers)
	tie := t.TempDir()
	os.MkdirAll(filepath.Join(tie, "0.0.421", "modules"), 0o755)
	want = mk(tie, "app-0.0.421", "modules", "discord_desktop_core-1", "discord_desktop_core", "index.js")
	if _, got := findUnixCore(tie); got != want {
		t.Fatalf("tie: got %q, want %q", got, want)
	}

	if _, got := findUnixCore(t.TempDir()); got != "" {
		t.Fatalf("empty folder: got %q", got)
	}
}

func TestSearchDiscords(t *testing.T) {
	home := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", "")
	// An unusual spot: a Flatpak install of Discord PTB
	want := filepath.Join(home, ".var", "app", "com.discordapp.DiscordPTB", "config", "discordptb", "app-0.0.99", "modules", "discord_desktop_core-1", "discord_desktop_core", "index.js")
	os.MkdirAll(filepath.Dir(want), 0o755)
	os.WriteFile(want, []byte("x"), 0o644)
	got := searchDiscords(home)
	if len(got) != 1 || got[0].IndexPath != want || got[0].Key != "ptb" || got[0].AppVersion != "app-0.0.99" {
		t.Fatalf("got %+v", got)
	}
}
