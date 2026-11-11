//go:build windows

package main

// The installer window: ui.html shown in WebView2 (the Edge engine built into Windows 10 and 11), driven by the
// same install code as the CLI. If WebView2 isn't on this PC, the classic window in gui_windows.go opens instead.

import (
	_ "embed"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/webviewloader"
)

//go:embed ui.html
var uiHTML string

// The website's fonts (Pixelify Sans and JetBrains Mono, both SIL Open Font License), built in so the installer
// looks right offline.
//
//go:embed fonts/pixelify.woff2
var fontPixel []byte

//go:embed fonts/jbmono.woff2
var fontMono []byte

func fontFace(family string, data []byte) string {
	return "@font-face{font-family:\"" + family + "\";font-weight:400 700;src:url(data:font/woff2;base64," + base64.StdEncoding.EncodeToString(data) + ") format(\"woff2\")}"
}

type uiBranch struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	State     int    `json:"state"`
	StateText string `json:"stateText"`
}

func runGUI() int {
	if v, err := webviewloader.GetInstalledVersion(); err != nil || v == "" {
		return runClassicGUI()
	}

	user32 := syscall.NewLazyDLL("user32.dll")
	dpi := uint(96)
	if p := user32.NewProc("GetDpiForSystem"); p.Find() == nil {
		if d, _, _ := p.Call(); d > 0 {
			dpi = uint(d)
		}
	}
	scale := func(n uint) uint { return n * dpi / 96 }

	cache, _ := os.UserCacheDir()
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		DataPath:      filepath.Join(cache, "VantaInstaller"),
		AutoFocus:     true,
		WindowOptions: webview2.WindowOptions{Title: "Vanta Installer", Width: scale(660), Height: scale(690), Center: true},
	})
	if w == nil {
		return runClassicGUI()
	}
	defer w.Destroy()
	w.SetSize(int(scale(560)), int(scale(640)), webview2.HintMin)

	hwnd := uintptr(w.Window())
	// Dark title bar, and Vanta's logo as the window icon
	if p := syscall.NewLazyDLL("dwmapi.dll").NewProc("DwmSetWindowAttribute"); p.Find() == nil {
		on := int32(1)
		p.Call(hwnd, 20, uintptr(unsafe.Pointer(&on)), 4)
	}
	if ic, _, _ := user32.NewProc("CreateIconFromResourceEx").Call(uintptr(unsafe.Pointer(&logoPNG[0])), uintptr(len(logoPNG)), 1, 0x30000, 0, 0, 0); ic != 0 {
		send := user32.NewProc("SendMessageW")
		send.Call(hwnd, 0x0080, 0, ic) // WM_SETICON small
		send.Call(hwnd, 0x0080, 1, ic) // WM_SETICON big
	}

	var (
		mu    sync.Mutex
		items []*Branch
		busy  bool
	)
	localBuild := FindLocalBuild()
	source := func(dev bool) Source {
		if dev && localBuild != "" {
			return Source{Local: localBuild}
		}
		return Source{}
	}
	find := func(dev bool) []uiBranch {
		entry := MainEntryFor(AppDir())
		if s := source(dev); s.Local != "" {
			entry = MainEntryFor(s.Local)
		}
		found := FindDiscords(entry)
		mu.Lock()
		items = found
		mu.Unlock()
		out := make([]uiBranch, 0, len(found))
		for _, b := range found {
			out = append(out, uiBranch{b.Name, b.AppVersion, int(b.State), b.State.String()})
		}
		return out
	}
	pick := func(i int) *Branch {
		mu.Lock()
		defer mu.Unlock()
		if i < 0 || i >= len(items) {
			return nil
		}
		return items[i]
	}
	// Runs JS on the window's thread (install work happens on a background goroutine)
	call := func(js string) { w.Dispatch(func() { w.Eval(js) }) }
	setStatus := func(s string) { call("onStatus(" + jsString(s) + ")") }
	finish := func(err error, install bool, name string, restarted bool) {
		mu.Lock()
		busy = false
		mu.Unlock()
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		call("onFinished(" + jsBool(err == nil) + "," + jsBool(install) + "," + jsString(msg) + "," + jsString(name) + "," + jsBool(restarted) + ")")
	}
	start := func() bool {
		mu.Lock()
		defer mu.Unlock()
		if busy {
			return false
		}
		busy = true
		return true
	}

	w.Bind("vState", func() map[string]any {
		return map[string]any{
			"version":    Version,
			"localBuild": localBuild,
			"logo":       "data:image/png;base64," + base64.StdEncoding.EncodeToString(logoPNG),
			"items":      find(false),
		}
	})
	w.Bind("vReload", func(dev bool) []uiBranch { return find(dev) })
	w.Bind("vInstall", func(i int, restart, keep, dev bool) {
		b := pick(i)
		if b == nil || !start() {
			return
		}
		src := source(dev)
		go func() {
			e, err := src.Prepare(setStatus)
			if err == nil {
				err = InstallInto(b, e, restart, setStatus)
			}
			if err == nil {
				if keep {
					if gErr := EnableGuard(b.Key, e); gErr != nil {
						guardLog("couldn't enable guard: %v", gErr)
					}
				} else {
					DisableGuard(b.Key)
				}
			}
			finish(err, true, b.Name, restart)
		}()
	})
	w.Bind("vUninstall", func(i int, restart bool) {
		b := pick(i)
		if b == nil || !start() {
			return
		}
		go func() {
			err := UninstallFrom(b, restart, setStatus)
			DisableGuard(b.Key)
			finish(err, false, b.Name, restart)
		}()
	})
	w.Bind("vSafeMode", func(i int) string {
		b := pick(i)
		if b == nil {
			return "Pick a Discord first."
		}
		if err := StartSafeMode(b); err != nil {
			return err.Error()
		}
		return ""
	})
	w.Bind("vOpenFolder", func() { openFolder(DataDir()) })
	w.Bind("vOpenSite", func() { openURL("https://tryvanta.dev") })

	w.SetHtml(strings.Replace(uiHTML, "/*FONTS*/", fontFace("Pixelify Sans", fontPixel)+fontFace("JetBrains Mono", fontMono), 1))
	w.Run()
	return 0
}

func jsBool(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func jsString(s string) string {
	r := []rune{'"'}
	for _, c := range s {
		switch c {
		case '"', '\\':
			r = append(r, '\\', c)
		case '\n':
			r = append(r, '\\', 'n')
		case '\r':
		case ' ', ' ', '<':
			r = append(r, []rune(`\u`+hex4(c))...)
		default:
			r = append(r, c)
		}
	}
	return string(append(r, '"'))
}

func hex4(c rune) string {
	const h = "0123456789abcdef"
	return string([]byte{h[c>>12&15], h[c>>8&15], h[c>>4&15], h[c&15]})
}
