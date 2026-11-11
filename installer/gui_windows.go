//go:build windows

package main

// Classic window built with lxn/walk, used when the WebView2 runtime is missing (see webui_windows.go).

import (
	"bytes"
	_ "embed"
	"image"
	"image/png"
	"syscall"
	"unsafe"

	"github.com/lxn/walk"
	. "github.com/lxn/walk/declarative"
)

// The installer is fully dark, in Vanta's colours: no grey Windows table or checkboxes, but our own cards and
// switches (drawn with plain coloured panels and text), plus a dark title bar.
var (
	colBg      = walk.RGB(12, 10, 18)
	colHeadA   = walk.RGB(20, 12, 40)
	colHeadB   = walk.RGB(70, 36, 150)
	colCard    = walk.RGB(26, 21, 38)
	colCardSel = walk.RGB(48, 34, 86)
	colChip    = walk.RGB(52, 30, 104)
	colText    = walk.RGB(244, 241, 250)
	colMuted   = walk.RGB(156, 148, 178)
	colAccent  = walk.RGB(139, 92, 255)
	colAccentH = walk.RGB(206, 190, 255)
	colOff     = walk.RGB(62, 56, 80)
	colGood    = walk.RGB(110, 231, 168)
	colWarn    = walk.RGB(250, 204, 21)
	colDanger  = walk.RGB(248, 113, 113)
)

// A small rounded-looking tag in the header
func chip(text string) Widget {
	return Composite{
		Background: SolidColorBrush{Color: walk.RGB(128, 92, 232)},
		Layout:     HBox{Margins: Margins{Left: 1, Top: 1, Right: 1, Bottom: 1}},
		Children: []Widget{
			Composite{
				Background: SolidColorBrush{Color: colChip},
				Layout:     HBox{Margins: Margins{Left: 8, Top: 2, Right: 8, Bottom: 2}},
				Children:   []Widget{Label{Text: text, Font: Font{Family: "Segoe UI Semibold", PointSize: 8}, TextColor: walk.RGB(235, 228, 255)}},
			},
		},
	}
}

func solid(c walk.Color) walk.Brush { b, _ := walk.NewSolidColorBrush(c); return b }
func font(size int, bold bool) *walk.Font {
	style := walk.FontStyle(0)
	if bold {
		style = walk.FontBold
	}
	f, _ := walk.NewFont("Segoe UI", size, style)
	return f
}
func onClick(w walk.Widget, fn func()) {
	w.MouseDown().Attach(func(x, y int, b walk.MouseButton) {
		if b == walk.LeftButton {
			fn()
		}
	})
	w.SetCursor(walk.CursorHand())
}

// darkTitleBar asks Windows 10/11 to draw the title bar dark (DWMWA_USE_IMMERSIVE_DARK_MODE)
func darkTitleBar(mw *walk.MainWindow) {
	proc := syscall.NewLazyDLL("dwmapi.dll").NewProc("DwmSetWindowAttribute")
	if proc.Find() != nil {
		return
	}
	on := int32(1)
	proc.Call(uintptr(mw.Handle()), 20, uintptr(unsafe.Pointer(&on)), 4)
}

// A switch: a small coloured block with a white knob that sits right when on and left when off, plus its
// label and a hint. Drawn with a Label (fixed text width), so it keeps its size in every layout.
type toggle struct {
	on    bool
	track *walk.Label
}

func newToggle(parent walk.Container, title, hint string, on bool, changed func(bool)) *toggle {
	t := &toggle{on: on}
	row, _ := walk.NewComposite(parent)
	rl := walk.NewHBoxLayout()
	rl.SetMargins(walk.Margins{})
	rl.SetSpacing(14)
	rl.SetAlignment(walk.AlignHNearVCenter)
	row.SetLayout(rl)
	t.track, _ = walk.NewLabel(row)
	t.track.SetFont(font(11, false))
	t.track.SetTextColor(walk.RGB(255, 255, 255))
	text, _ := walk.NewComposite(row)
	vl := walk.NewVBoxLayout()
	vl.SetMargins(walk.Margins{})
	vl.SetSpacing(0)
	text.SetLayout(vl)
	tl1, _ := walk.NewLabel(text)
	tl1.SetText(title)
	tl1.SetFont(font(10, false))
	tl1.SetTextColor(colText)
	clickable := []walk.Widget{t.track, tl1, text}
	if hint != "" {
		tl2, _ := walk.NewLabel(text)
		tl2.SetText(hint)
		tl2.SetFont(font(8, false))
		tl2.SetTextColor(colMuted)
		clickable = append(clickable, tl2)
	}
	walk.NewHSpacer(row)
	t.paint()
	flip := func() {
		t.on = !t.on
		t.paint()
		if changed != nil {
			changed(t.on)
		}
	}
	for _, w := range clickable {
		onClick(w, flip)
	}
	return t
}

func (t *toggle) paint() {
	const gap = "   " // en spaces: the same width either way
	if t.on {
		t.track.SetText(" " + gap + "● ")
		t.track.SetBackground(solid(colAccent))
	} else {
		t.track.SetText(" ●" + gap + " ")
		t.track.SetBackground(solid(colOff))
	}
}

func runClassicGUI() int {
	var (
		mw                     *walk.MainWindow
		listBox, optsBox       *walk.Composite
		installBtn             *walk.Composite
		installLbl             *walk.Label
		uninstallLbl           *walk.Label
		statusLbl              *walk.Label
		progress               *walk.ProgressBar
		logoView               *walk.ImageView
		items                  []*Branch
		cards                  []*walk.Composite
		bars                   []*walk.Label
		sel                    = -1
		busy                   bool
		canInstall, canUnins   bool
		restartT, guardT, devT *toggle
	)
	localBuild := FindLocalBuild()

	source := func() Source {
		if localBuild != "" && devT != nil && devT.on {
			return Source{Local: localBuild}
		}
		return Source{}
	}
	entry := func() string {
		if s := source(); s.Local != "" {
			return MainEntryFor(s.Local)
		}
		return MainEntryFor(AppDir())
	}
	selected := func() *Branch {
		if sel < 0 || sel >= len(items) {
			return nil
		}
		return items[sel]
	}
	paint := func() {
		for i, c := range cards {
			if i == sel {
				c.SetBackground(solid(colCardSel))
				bars[i].SetBackground(solid(colAccent))
			} else {
				c.SetBackground(solid(colCard))
				bars[i].SetBackground(solid(colCard))
			}
		}
		b := selected()
		canInstall = !busy && b != nil
		canUnins = !busy && b != nil && (b.State == Installed || b.State == InstalledElsewhere)
		switch {
		case busy:
			installLbl.SetText("Working…")
		case b != nil && b.State == Installed:
			installLbl.SetText("Repair Vanta")
		default:
			installLbl.SetText("Install Vanta")
		}
		if canInstall {
			installBtn.SetBackground(solid(colAccent))
		} else {
			installBtn.SetBackground(solid(colOff))
		}
		if canUnins {
			uninstallLbl.SetTextColor(colDanger)
		} else {
			uninstallLbl.SetTextColor(colOff)
		}
	}

	// One card per Discord install: name, version, and whether Vanta is in it
	var reload func()
	buildCards := func() {
		for listBox.Children().Len() > 0 {
			listBox.Children().At(0).Dispose()
		}
		cards, bars = nil, nil
		if len(items) == 0 {
			l, _ := walk.NewLabel(listBox)
			l.SetText("No Discord found. Install Discord, open it once, then reopen this installer.")
			l.SetTextColor(colMuted)
			l.SetFont(font(10, false))
			return
		}
		for i, b := range items {
			i, b := i, b
			card, _ := walk.NewComposite(listBox)
			cl := walk.NewHBoxLayout()
			cl.SetMargins(walk.Margins{HNear: 0, VNear: 0, HFar: 16, VFar: 0})
			cl.SetSpacing(14)
			card.SetLayout(cl)
			// Violet edge that marks the chosen Discord
			bar, _ := walk.NewLabel(card)
			bar.SetText(" ")
			bar.SetFont(font(4, false))
			bar.SetMinMaxSize(walk.Size{Width: 5, Height: 40}, walk.Size{Width: 5, Height: 200})
			bars = append(bars, bar)
			names, _ := walk.NewComposite(card)
			nl := walk.NewVBoxLayout()
			nl.SetMargins(walk.Margins{VNear: 12, VFar: 12})
			nl.SetSpacing(1)
			names.SetLayout(nl)
			n, _ := walk.NewLabel(names)
			n.SetText(b.Name)
			n.SetFont(font(11, true))
			n.SetTextColor(colText)
			v, _ := walk.NewLabel(names)
			v.SetText(b.AppVersion)
			v.SetFont(font(8, false))
			v.SetTextColor(colMuted)
			walk.NewHSpacer(card)
			st, _ := walk.NewLabel(card)
			st.SetText("● " + b.State.String())
			st.SetFont(font(9, true))
			switch b.State {
			case Installed:
				st.SetTextColor(colGood)
			case OtherMod, InstalledElsewhere:
				st.SetTextColor(colWarn)
			default:
				st.SetTextColor(colMuted)
			}
			for _, w := range []walk.Widget{card, names, n, v, st} {
				onClick(w, func() { sel = i; paint() })
			}
			cards = append(cards, card)
		}
	}
	reload = func() {
		items = FindDiscords(entry())
		if sel < 0 || sel >= len(items) {
			sel = 0
		}
		if len(items) == 0 {
			sel = -1
		}
		listBox.SetSuspended(true)
		buildCards()
		listBox.SetSuspended(false)
		paint()
	}
	setStatus := func(s string) { mw.Synchronize(func() { statusLbl.SetText(s) }) }

	run := func(install bool) {
		b := selected()
		if b == nil || busy || (install && !canInstall) || (!install && !canUnins) {
			return
		}
		if install && b.State == OtherMod {
			if walk.MsgBox(mw, "Vanta Installer",
				b.Name+" was already modified by another mod (for example BetterDiscord).\n\nInstalling Vanta replaces that change. The current file is backed up, and uninstalling Vanta restores it.\n\nContinue?",
				walk.MsgBoxYesNo|walk.MsgBoxIconWarning) != walk.DlgCmdYes {
				return
			}
		}
		if !install && walk.MsgBox(mw, "Vanta Installer", "Remove Vanta from "+b.Name+"?\n\nYour settings, plugins and themes stay in the Vanta folder.",
			walk.MsgBoxYesNo|walk.MsgBoxIconQuestion) != walk.DlgCmdYes {
			return
		}
		busy = true
		paint()
		progress.SetVisible(true)
		src, restart, keep := source(), restartT.on, guardT.on
		go func() {
			var err error
			if install {
				var e string
				if e, err = src.Prepare(setStatus); err == nil {
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
			} else {
				err = UninstallFrom(b, restart, setStatus)
				DisableGuard(b.Key)
			}
			mw.Synchronize(func() {
				busy = false
				progress.SetVisible(false)
				reload()
				switch {
				case err != nil:
					statusLbl.SetText("Something went wrong: " + err.Error())
					walk.MsgBox(mw, "Vanta Installer", err.Error(), walk.MsgBoxIconError)
				case install && restart:
					statusLbl.SetText("Done! Vanta is in " + b.Name + ". Open Settings → Vanta, or press Ctrl+Shift+O.")
				case install:
					statusLbl.SetText("Done! Fully quit and reopen " + b.Name + " to load Vanta.")
				default:
					statusLbl.SetText("Vanta was removed from " + b.Name + ".")
				}
			})
		}()
	}

	link := func(text string, fn func()) Label {
		return Label{Text: text, TextColor: colAccentH, Font: Font{Family: "Segoe UI", PointSize: 9}, OnMouseDown: func(x, y int, button walk.MouseButton) {
			if button == walk.LeftButton {
				fn()
			}
		}}
	}
	section := func(text string) Label {
		return Label{Text: text, Font: Font{Family: "Segoe UI Semibold", PointSize: 9}, TextColor: colMuted}
	}

	err := MainWindow{
		AssignTo:   &mw,
		Title:      "Vanta Installer",
		Size:       Size{Width: 640, Height: 640},
		MinSize:    Size{Width: 560, Height: 580},
		Background: SolidColorBrush{Color: colBg},
		Layout:     VBox{MarginsZero: true, Spacing: 0},
		Children: []Widget{
			Composite{
				Background: HorizontalGradientBrush{Stops: []walk.GradientStop{{Offset: 0, Color: colHeadA}, {Offset: 1, Color: colHeadB}}},
				Layout:     HBox{Margins: Margins{Left: 28, Top: 24, Right: 28, Bottom: 24}, Spacing: 18},
				Children: []Widget{
					ImageView{AssignTo: &logoView, MinSize: Size{Width: 64, Height: 64}, MaxSize: Size{Width: 64, Height: 64}, Mode: ImageViewModeShrink},
					Composite{
						Layout: VBox{MarginsZero: true, Spacing: 2},
						Children: []Widget{
							Label{Text: "Vanta", Font: Font{Family: "Segoe UI Semibold", PointSize: 24}, TextColor: walk.RGB(255, 255, 255)},
							Label{Text: "The Discord mod that protects your account", Font: Font{Family: "Segoe UI", PointSize: 10}, TextColor: colAccentH},
							Composite{
								Layout: HBox{Margins: Margins{Top: 6}, Spacing: 6},
								Children: []Widget{
									chip("Token guard"), chip("Scam link checker"), chip("Plugins and themes"), chip("Capri"), HSpacer{},
								},
							},
						},
					},
					HSpacer{},
					Label{Text: "v" + Version, Font: Font{Family: "Segoe UI Semibold", PointSize: 9}, TextColor: colAccentH},
				},
			},
			Composite{
				Layout: VBox{Margins: Margins{Left: 28, Top: 22, Right: 28, Bottom: 4}, Spacing: 10},
				Children: []Widget{
					section("CHOOSE YOUR DISCORD"),
					Composite{AssignTo: &listBox, Layout: VBox{MarginsZero: true, Spacing: 8}},
					VSpacer{Size: 6},
					section("OPTIONS"),
					Composite{AssignTo: &optsBox, Background: SolidColorBrush{Color: colCard}, Layout: VBox{Margins: Margins{Left: 16, Top: 14, Right: 16, Bottom: 14}, Spacing: 12}},
				},
			},
			VSpacer{},
			Composite{
				Layout: HBox{Margins: Margins{Left: 28, Top: 8, Right: 28, Bottom: 6}, Spacing: 14},
				Children: []Widget{
					Composite{
						AssignTo:   &installBtn,
						Background: SolidColorBrush{Color: colAccent},
						MinSize:    Size{Width: 260, Height: 50},
						Layout:     HBox{Margins: Margins{Left: 18, Top: 12, Right: 18, Bottom: 12}},
						Children: []Widget{
							HSpacer{},
							Label{AssignTo: &installLbl, Text: "Install Vanta", Font: Font{Family: "Segoe UI Semibold", PointSize: 12}, TextColor: walk.RGB(255, 255, 255)},
							HSpacer{},
						},
					},
					Label{AssignTo: &uninstallLbl, Text: "Uninstall", Font: Font{Family: "Segoe UI", PointSize: 11}, TextColor: colDanger},
					HSpacer{},
				},
			},
			ProgressBar{AssignTo: &progress, MarqueeMode: true, Visible: false, MaxSize: Size{Height: 4}},
			Composite{
				Layout: HBox{Margins: Margins{Left: 28, Top: 8, Right: 28, Bottom: 18}, Spacing: 18},
				Children: []Widget{
					Label{AssignTo: &statusLbl, Text: "Pick your Discord and press Install.", TextColor: colMuted, Font: Font{Family: "Segoe UI", PointSize: 9}},
					HSpacer{},
					link("Safe mode", func() {
						b := selected()
						if b == nil {
							return
						}
						if err := StartSafeMode(b); err != nil {
							walk.MsgBox(mw, "Vanta Installer", err.Error(), walk.MsgBoxIconError)
						} else {
							statusLbl.SetText(b.Name + " restarted with Vanta in safe mode.")
						}
					}),
					link("Vanta folder", func() { openFolder(DataDir()) }),
					link("tryvanta.dev", func() { openURL("https://tryvanta.dev") }),
				},
			},
		},
	}.Create()
	if err != nil {
		walk.MsgBox(nil, "Vanta Installer", "Couldn't open the installer window: "+err.Error(), walk.MsgBoxIconError)
		return 1
	}
	darkTitleBar(mw)

	if bmp, err := walk.NewBitmapFromImageForDPI(logoImage(), 96); err == nil {
		logoView.SetImage(bmp)
	}
	if ic, err := walk.NewIconFromImageForDPI(logoImage(), 96); err == nil {
		mw.SetIcon(ic)
	}
	guardT = newToggle(optsBox, "Keep Vanta installed when Discord updates", "Recommended. A tiny helper puts Vanta back after Discord updates itself.", true, nil)
	restartT = newToggle(optsBox, "Close and reopen Discord when done", "", true, nil)
	if localBuild != "" {
		devT = newToggle(optsBox, "Use this PC's development build", localBuild, true, func(bool) { reload() })
	}
	onClick(installBtn, func() { run(true) })
	onClick(installLbl, func() { run(true) })
	onClick(uninstallLbl, func() { run(false) })
	reload()
	mw.Run()
	return 0
}

/* ------------------------------------------------------------------ the logo */

// logo.png is generated from assets/logo.json by scripts/make-logo.mjs.
//
//go:embed logo.png
var logoPNG []byte

func logoImage() image.Image {
	img, err := png.Decode(bytes.NewReader(logoPNG))
	if err != nil {
		return image.NewRGBA(image.Rect(0, 0, 1, 1))
	}
	return img
}
