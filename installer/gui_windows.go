//go:build windows

package main

// Native Windows GUI built with lxn/walk (pure Go, no C compiler needed).

import (
	"bytes"
	_ "embed"
	"fmt"
	"image"
	"image/png"

	"github.com/lxn/walk"
	. "github.com/lxn/walk/declarative"
)

type installModel struct {
	walk.TableModelBase
	items []*Branch
}

func (m *installModel) RowCount() int { return len(m.items) }
func (m *installModel) Value(row, col int) interface{} {
	b := m.items[row]
	switch col {
	case 0:
		return b.Name
	case 1:
		return b.AppVersion
	default:
		return b.State.String()
	}
}

func runGUI() int {
	var (
		mw                       *walk.MainWindow
		table                    *walk.TableView
		rbGitHub, rbLocal        *walk.RadioButton
		restartCB                *walk.CheckBox
		guardCB                  *walk.CheckBox
		installBtn, uninstallBtn *walk.PushButton
		statusLbl                *walk.Label
		progress                 *walk.ProgressBar
		logoView                 *walk.ImageView
		model                    = &installModel{}
		busy                     bool
	)
	localBuild := FindLocalBuild()

	source := func() Source {
		if localBuild != "" && rbLocal != nil && rbLocal.Checked() {
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
		i := table.CurrentIndex()
		if i < 0 || i >= len(model.items) {
			return nil
		}
		return model.items[i]
	}
	updateButtons := func() {
		b := selected()
		installBtn.SetEnabled(!busy && b != nil)
		uninstallBtn.SetEnabled(!busy && b != nil && (b.State == Installed || b.State == InstalledElsewhere))
		if b != nil && b.State == Installed {
			installBtn.SetText("Repair")
		} else {
			installBtn.SetText("Install")
		}
	}
	reload := func() {
		prev := table.CurrentIndex()
		model.items = FindDiscords(entry())
		model.PublishRowsReset()
		if len(model.items) > 0 {
			if prev < 0 || prev >= len(model.items) {
				prev = 0
			}
			table.SetCurrentIndex(prev)
		}
		updateButtons()
		if len(model.items) == 0 {
			statusLbl.SetText("No Discord installation found. Install Discord, open it once, then reopen this installer.")
		}
	}
	setStatus := func(s string) { mw.Synchronize(func() { statusLbl.SetText(s) }) }

	run := func(install bool) {
		b := selected()
		if b == nil || busy {
			return
		}
		if install && b.State == OtherMod {
			if walk.MsgBox(mw, "Vanta Installer",
				b.Name+" was already modified by another mod (for example BetterDiscord).\n\nInstalling Vanta replaces that change. The current file is backed up, and uninstalling Vanta restores it.\n\nContinue?",
				walk.MsgBoxYesNo|walk.MsgBoxIconWarning) != walk.DlgCmdYes {
				return
			}
		}
		busy = true
		updateButtons()
		progress.SetVisible(true)
		src, restart, keep := source(), restartCB.Checked(), guardCB.Checked()
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
					statusLbl.SetText("Failed: " + err.Error())
					walk.MsgBox(mw, "Vanta Installer", err.Error(), walk.MsgBoxIconError)
				case install && restart:
					statusLbl.SetText("Vanta installed into " + b.Name + ". Press Ctrl+Shift+O in Discord.")
				case install:
					statusLbl.SetText("Vanta installed into " + b.Name + ". Fully quit and reopen Discord to load it.")
				default:
					statusLbl.SetText("Vanta removed from " + b.Name + ".")
				}
			})
		}()
	}

	localText := "This computer's dev build"
	if localBuild != "" {
		localText = "Local build: " + localBuild
	}

	err := MainWindow{
		AssignTo: &mw,
		Title:    "Vanta Installer",
		Size:     Size{Width: 600, Height: 520},
		MinSize:  Size{Width: 520, Height: 460},
		Layout:   VBox{Margins: Margins{Left: 18, Top: 16, Right: 18, Bottom: 14}, Spacing: 10},
		Children: []Widget{
			Composite{
				Layout: HBox{MarginsZero: true, Spacing: 12},
				Children: []Widget{
					ImageView{AssignTo: &logoView, MinSize: Size{Width: 52, Height: 52}, MaxSize: Size{Width: 52, Height: 52}, Mode: ImageViewModeShrink},
					Composite{
						Layout: VBox{MarginsZero: true, Spacing: 0},
						Children: []Widget{
							Label{Text: "Vanta", Font: Font{Family: "Segoe UI Semibold", PointSize: 20}},
							Label{Text: fmt.Sprintf("Installer %s  ·  github.com/%s", Version, Repo), TextColor: walk.RGB(110, 105, 125)},
						},
					},
					HSpacer{},
				},
			},
			GroupBox{
				Title: "Install Vanta from",
				// HBox + spacer keeps the radio buttons left-aligned at full width.
				Layout: HBox{Spacing: 0},
				Children: []Widget{
					Composite{
						Layout: VBox{MarginsZero: true, Spacing: 4, Alignment: AlignHNearVNear},
						Children: []Widget{
							RadioButtonGroup{
								Buttons: []RadioButton{
									{AssignTo: &rbGitHub, Text: "Latest release on GitHub (recommended)", Value: "github", OnClicked: func() { reload() }},
									{AssignTo: &rbLocal, Text: localText, Value: "local", Enabled: localBuild != "", OnClicked: func() { reload() }},
								},
							},
						},
					},
					HSpacer{},
				},
			},
			Label{Text: "Discord installs", Font: Font{Family: "Segoe UI Semibold", PointSize: 10}},
			TableView{
				AssignTo:              &table,
				Model:                 model,
				AlternatingRowBG:      true,
				LastColumnStretched:   true,
				OnCurrentIndexChanged: func() { updateButtons() },
				Columns: []TableViewColumn{
					{Title: "Discord", Width: 170},
					{Title: "Version", Width: 130},
					{Title: "Vanta"},
				},
			},
			CheckBox{AssignTo: &restartCB, Text: "Close and reopen Discord after changes", Checked: true},
			CheckBox{AssignTo: &guardCB, Text: "Keep Vanta installed after Discord updates (runs Vanta Guard in the background)", Checked: true},
			Composite{
				Layout: HBox{MarginsZero: true, Spacing: 8},
				Children: []Widget{
					PushButton{AssignTo: &installBtn, Text: "Install", MinSize: Size{Width: 110}, OnClicked: func() { run(true) }},
					PushButton{AssignTo: &uninstallBtn, Text: "Uninstall", MinSize: Size{Width: 110}, OnClicked: func() { run(false) }},
					HSpacer{},
					PushButton{Text: "Start in safe mode", OnClicked: func() {
						b := selected()
						if b == nil {
							return
						}
						if err := StartSafeMode(b); err != nil {
							walk.MsgBox(mw, "Vanta Installer", err.Error(), walk.MsgBoxIconError)
						} else {
							statusLbl.SetText(b.Name + " restarted with Vanta in safe mode.")
						}
					}},
					PushButton{Text: "Open Vanta folder", OnClicked: func() { openFolder(DataDir()) }},
				},
			},
			ProgressBar{AssignTo: &progress, MarqueeMode: true, Visible: false, MaxSize: Size{Height: 6}},
			Label{AssignTo: &statusLbl, Text: "Ready.", TextColor: walk.RGB(90, 85, 105)},
		},
	}.Create()
	if err != nil {
		walk.MsgBox(nil, "Vanta Installer", "Couldn't open the installer window: "+err.Error(), walk.MsgBoxIconError)
		return 1
	}

	if bmp, err := walk.NewBitmapFromImageForDPI(logoImage(), 96); err == nil {
		logoView.SetImage(bmp)
	}
	if ic, err := walk.NewIconFromImageForDPI(logoImage(), 96); err == nil {
		mw.SetIcon(ic)
	}
	if localBuild != "" {
		rbLocal.SetChecked(true)
	} else {
		rbGitHub.SetChecked(true)
	}
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
