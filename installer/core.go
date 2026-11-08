package main

// Platform-neutral installer logic: finding Discord, injecting Vanta, getting Vanta's files.

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"
)

const (
	Repo      = "praisezu/Vanta"
	AssetName = "vanta.tar.gz"
	Marker    = "// Vanta injection"
	// Vanta used to be called Obsid; installs made by Obsid use this marker.
	LegacyMarker = "// Obsid injection"
	// Discord's stock discord_desktop_core/index.js
	DefaultIndex = "module.exports = require('./core.asar');\n"
)

// Version is set at build time: -ldflags "-X main.Version=0.2.0"
var Version = "dev"

type State int

const (
	NotInstalled State = iota
	Installed
	InstalledElsewhere
	OtherMod
)

func (s State) String() string {
	switch s {
	case Installed:
		return "Installed"
	case InstalledElsewhere:
		return "Installed (other copy)"
	case OtherMod:
		return "Modified by another mod"
	default:
		return "Not installed"
	}
}

type Branch struct {
	Key, Name, Folder, Exe string
	BaseDir, AppVersion    string
	IndexPath              string
	State                  State
	InjectedPath           string
}

var branchDefs = [][4]string{
	// key, display name, Windows folder / exe name, Linux+macOS folder
	{"stable", "Discord", "Discord", "discord"},
	{"ptb", "Discord PTB", "DiscordPTB", "discordptb"},
	{"canary", "Discord Canary", "DiscordCanary", "discordcanary"},
	{"development", "Discord Development", "DiscordDevelopment", "discorddevelopment"},
}

var digits = regexp.MustCompile(`\d+`)

func versionKey(s string) string {
	parts := digits.FindAllString(s, -1)
	for i, p := range parts {
		parts[i] = fmt.Sprintf("%08s", p)
	}
	return strings.Join(parts, ".")
}

// newest returns the highest-versioned entry in dir whose name matches re.
func newest(dir string, re *regexp.Regexp) string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() && re.MatchString(e.Name()) {
			names = append(names, e.Name())
		}
	}
	sort.Slice(names, func(i, j int) bool { return versionKey(names[i]) > versionKey(names[j]) })
	if len(names) == 0 {
		return ""
	}
	return names[0]
}

var (
	reWinApp  = regexp.MustCompile(`^app-\d`)
	reWinCore = regexp.MustCompile(`^discord_desktop_core(-\d+)?$`)
	reUnixVer = regexp.MustCompile(`^\d+\.\d+\.\d+$`)
)

// FindDiscords returns every Discord install found on this computer.
func FindDiscords(mainEntry string) []*Branch {
	var out []*Branch
	home, _ := os.UserHomeDir()
	for _, d := range branchDefs {
		b := &Branch{Key: d[0], Name: d[1], Exe: d[2]}
		switch runtime.GOOS {
		case "windows":
			b.Folder = d[2]
			b.BaseDir = filepath.Join(os.Getenv("LOCALAPPDATA"), b.Folder)
			b.AppVersion = newest(b.BaseDir, reWinApp)
			if b.AppVersion == "" {
				continue
			}
			modules := filepath.Join(b.BaseDir, b.AppVersion, "modules")
			core := newest(modules, reWinCore)
			if core == "" {
				continue
			}
			b.IndexPath = filepath.Join(modules, core, "discord_desktop_core", "index.js")
		default:
			b.Folder = d[3]
			if runtime.GOOS == "darwin" {
				b.BaseDir = filepath.Join(home, "Library", "Application Support", b.Folder)
			} else {
				cfg := os.Getenv("XDG_CONFIG_HOME")
				if cfg == "" {
					cfg = filepath.Join(home, ".config")
				}
				b.BaseDir = filepath.Join(cfg, b.Folder)
			}
			b.AppVersion = newest(b.BaseDir, reUnixVer)
			if b.AppVersion == "" {
				continue
			}
			b.IndexPath = filepath.Join(b.BaseDir, b.AppVersion, "modules", "discord_desktop_core", "index.js")
		}
		if _, err := os.Stat(b.IndexPath); err != nil {
			continue
		}
		b.Refresh(mainEntry)
		out = append(out, b)
	}
	return out
}

var reRequire = regexp.MustCompile(`require\("((?:[^"\\]|\\.)*)"\)`)

// Refresh re-reads index.js and works out whether Vanta is injected.
func (b *Branch) Refresh(mainEntry string) {
	data, err := os.ReadFile(b.IndexPath)
	if err != nil {
		b.State = NotInstalled
		return
	}
	content := string(data)
	b.InjectedPath = ""
	if isInjected(content) {
		if m := reRequire.FindStringSubmatch(content); m != nil {
			var p string
			if json.Unmarshal([]byte(`"`+m[1]+`"`), &p) == nil {
				b.InjectedPath = p
			}
		}
		if mainEntry != "" && samePath(b.InjectedPath, mainEntry) {
			b.State = Installed
		} else {
			b.State = InstalledElsewhere
		}
		return
	}
	norm := strings.ReplaceAll(strings.Join(strings.Fields(content), ""), `"`, "'")
	if norm == "module.exports=require('./core.asar');" {
		b.State = NotInstalled
	} else {
		b.State = OtherMod
	}
}

func samePath(a, b string) bool {
	pa, err1 := filepath.Abs(a)
	pb, err2 := filepath.Abs(b)
	if err1 != nil || err2 != nil {
		return false
	}
	if runtime.GOOS == "windows" {
		return strings.EqualFold(pa, pb)
	}
	return pa == pb
}

// Inject points Discord at mainEntry (…/dist/main.js). The original file is backed up once.
func Inject(b *Branch, mainEntry string) error {
	current, err := os.ReadFile(b.IndexPath)
	if err != nil {
		return err
	}
	if !isInjected(string(current)) {
		if err := os.WriteFile(b.IndexPath+".vanta-backup", current, 0o644); err != nil {
			return fmt.Errorf("couldn't back up index.js: %w", err)
		}
	} else if _, err := os.Stat(b.IndexPath + ".vanta-backup"); err != nil {
		// Upgrading an Obsid install: keep its backup of Discord's original file.
		_ = os.Rename(b.IndexPath+".obsid-backup", b.IndexPath+".vanta-backup")
	}
	entry, _ := json.Marshal(mainEntry)
	content := strings.Join([]string{
		Marker,
		"try {",
		"    require(" + string(entry) + ");",
		"} catch (e) {",
		`    console.error("[Vanta] failed to load, starting Discord without it:", e);`,
		"}",
		"module.exports = require('./core.asar');",
		"",
	}, "\n")
	return os.WriteFile(b.IndexPath, []byte(content), 0o644)
}

// Uninject restores Discord's original index.js (from a Vanta or an older Obsid backup).
func Uninject(b *Branch) error {
	for _, suffix := range []string{".vanta-backup", ".obsid-backup"} {
		backup := b.IndexPath + suffix
		if data, err := os.ReadFile(backup); err == nil {
			if err := os.WriteFile(b.IndexPath, data, 0o644); err != nil {
				return err
			}
			_ = os.Remove(b.IndexPath + ".vanta-backup")
			_ = os.Remove(b.IndexPath + ".obsid-backup")
			return nil
		}
	}
	return os.WriteFile(b.IndexPath, []byte(DefaultIndex), 0o644)
}

func isInjected(content string) bool {
	return strings.Contains(content, Marker) || strings.Contains(content, LegacyMarker)
}

/* ----------------------------------------------------------- Discord process */

func IsRunning(b *Branch) bool {
	switch runtime.GOOS {
	case "windows":
		out, err := hiddenCmd("tasklist", "/FI", "IMAGENAME eq "+b.Exe+".exe", "/NH").Output()
		return err == nil && strings.Contains(strings.ToLower(string(out)), strings.ToLower(b.Exe+".exe"))
	default:
		return exec.Command("pgrep", "-ix", b.Folder).Run() == nil || exec.Command("pgrep", "-x", b.Name).Run() == nil
	}
}

func Kill(b *Branch) {
	switch runtime.GOOS {
	case "windows":
		_ = hiddenCmd("taskkill", "/F", "/IM", b.Exe+".exe").Run()
	default:
		_ = exec.Command("pkill", "-ix", b.Folder).Run()
		_ = exec.Command("pkill", "-x", b.Name).Run()
	}
	for i := 0; i < 50 && IsRunning(b); i++ {
		time.Sleep(200 * time.Millisecond)
	}
	time.Sleep(500 * time.Millisecond) // let file handles close
}

func Launch(b *Branch) error {
	switch runtime.GOOS {
	case "windows":
		update := filepath.Join(b.BaseDir, "Update.exe")
		if _, err := os.Stat(update); err == nil {
			return hiddenCmd(update, "--processStart", b.Exe+".exe").Start()
		}
		return exec.Command(filepath.Join(b.BaseDir, b.AppVersion, b.Exe+".exe")).Start()
	case "darwin":
		return exec.Command("open", "-a", b.Name).Start()
	default:
		return exec.Command(b.Folder).Start()
	}
}

/* -------------------------------------------------------------- Vanta files */

// DataDir is where Vanta keeps settings, plugins, themes, and (for release installs) its own files.
func DataDir() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("APPDATA"), "Vanta")
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "Vanta")
	default:
		cfg := os.Getenv("XDG_CONFIG_HOME")
		if cfg == "" {
			home, _ := os.UserHomeDir()
			cfg = filepath.Join(home, ".config")
		}
		return filepath.Join(cfg, "Vanta")
	}
}

// AppDir is where release builds are unpacked: <DataDir>/app
func AppDir() string { return filepath.Join(DataDir(), "app") }

func MainEntryFor(appDir string) string { return filepath.Join(appDir, "dist", "main.js") }

// FindLocalBuild looks for a dev checkout (with dist/main.js) next to the installer or the
// current folder, so developers can install their own build.
func FindLocalBuild() string {
	var starts []string
	if exe, err := os.Executable(); err == nil {
		starts = append(starts, filepath.Dir(exe))
	}
	if wd, err := os.Getwd(); err == nil {
		starts = append(starts, wd)
	}
	for _, s := range starts {
		dir := s
		for i := 0; i < 3; i++ {
			if _, err := os.Stat(MainEntryFor(dir)); err == nil {
				if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
					return dir
				}
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	return ""
}

type Release struct {
	Tag      string
	Name     string
	Download string
}

var httpClient = &http.Client{Timeout: 60 * time.Second}

func LatestRelease() (*Release, error) {
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/"+Repo+"/releases/latest", nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Vanta-Installer")
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("couldn't reach GitHub: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode == 404 {
		return nil, errors.New("there's no Vanta release on GitHub yet")
	}
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub returned HTTP %d", res.StatusCode)
	}
	var body struct {
		TagName string `json:"tag_name"`
		Name    string `json:"name"`
		Assets  []struct {
			Name string `json:"name"`
			URL  string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return nil, err
	}
	for _, a := range body.Assets {
		if a.Name == AssetName {
			return &Release{Tag: body.TagName, Name: body.Name, Download: a.URL}, nil
		}
	}
	return nil, fmt.Errorf("release %s has no %s file", body.TagName, AssetName)
}

// DownloadRelease downloads the latest release and unpacks it into AppDir(). Returns the tag.
func DownloadRelease(status func(string)) (string, error) {
	status("Checking GitHub for the latest release…")
	rel, err := LatestRelease()
	if err != nil {
		return "", err
	}
	status("Downloading Vanta " + rel.Tag + "…")
	res, err := httpClient.Get(rel.Download)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return "", fmt.Errorf("download failed (HTTP %d)", res.StatusCode)
	}
	status("Unpacking…")
	dest := AppDir()
	if err := os.RemoveAll(filepath.Join(dest, "dist")); err != nil {
		return "", err
	}
	if err := extractTarGz(res.Body, dest); err != nil {
		return "", err
	}
	if _, err := os.Stat(MainEntryFor(dest)); err != nil {
		return "", errors.New("the release archive is missing dist/main.js")
	}
	return rel.Tag, nil
}

func extractTarGz(r io.Reader, dest string) error {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		h, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		name := filepath.FromSlash(strings.TrimPrefix(h.Name, "./"))
		if name == "" || filepath.IsAbs(name) || strings.Contains(name, "..") {
			return fmt.Errorf("unsafe path in archive: %s", h.Name)
		}
		target := filepath.Join(dest, name)
		switch h.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			f, err := os.Create(target)
			if err != nil {
				return err
			}
			if _, err := io.Copy(f, tr); err != nil {
				f.Close()
				return err
			}
			f.Close()
		}
	}
}

/* ---------------------------------------------------------------- actions */

// Source says where Vanta's files come from.
type Source struct {
	Local string // non-empty = use this dev checkout
}

// Prepare makes sure Vanta's files are on disk and returns the main.js path to inject.
func (s Source) Prepare(status func(string)) (string, error) {
	if s.Local != "" {
		entry := MainEntryFor(s.Local)
		if _, err := os.Stat(entry); err != nil {
			return "", fmt.Errorf("%s is missing. Run `npm run build` in %s first", entry, s.Local)
		}
		return entry, nil
	}
	if _, err := DownloadRelease(status); err != nil {
		return "", err
	}
	return MainEntryFor(AppDir()), nil
}

// InstallInto runs the full install for one Discord: close it, inject, reopen.
func InstallInto(b *Branch, entry string, restart bool, status func(string)) error {
	wasRunning := IsRunning(b)
	if restart && wasRunning {
		status("Closing " + b.Name + "…")
		Kill(b)
	}
	status("Installing into " + b.Name + "…")
	if err := Inject(b, entry); err != nil {
		return err
	}
	if restart {
		status("Starting " + b.Name + "…")
		return Launch(b)
	}
	return nil
}

func UninstallFrom(b *Branch, restart bool, status func(string)) error {
	wasRunning := IsRunning(b)
	if restart && wasRunning {
		status("Closing " + b.Name + "…")
		Kill(b)
	}
	status("Removing Vanta from " + b.Name + "…")
	if err := Uninject(b); err != nil {
		return err
	}
	if restart && wasRunning {
		status("Starting " + b.Name + "…")
		return Launch(b)
	}
	return nil
}
