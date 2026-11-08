//go:build windows

package main

// Native Windows GUI built with lxn/walk (pure Go, no C compiler needed).

import (
	"fmt"
	"image"
	"image/color"

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
		mw                          *walk.MainWindow
		table                       *walk.TableView
		rbGitHub, rbLocal           *walk.RadioButton
		restartCB                   *walk.CheckBox
		installBtn, uninstallBtn    *walk.PushButton
		statusLbl                   *walk.Label
		progress                    *walk.ProgressBar
		logoView                    *walk.ImageView
		model                       = &installModel{}
		busy                        bool
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
			if walk.MsgBox(mw, "Obsid Installer",
				b.Name+" was already modified by another mod (for example BetterDiscord).\n\nInstalling Obsid replaces that change. The current file is backed up, and uninstalling Obsid restores it.\n\nContinue?",
				walk.MsgBoxYesNo|walk.MsgBoxIconWarning) != walk.DlgCmdYes {
				return
			}
		}
		busy = true
		updateButtons()
		progress.SetVisible(true)
		src, restart := source(), restartCB.Checked()
		go func() {
			var err error
			if install {
				var e string
				if e, err = src.Prepare(setStatus); err == nil {
					err = InstallInto(b, e, restart, setStatus)
				}
			} else {
				err = UninstallFrom(b, restart, setStatus)
			}
			mw.Synchronize(func() {
				busy = false
				progress.SetVisible(false)
				reload()
				switch {
				case err != nil:
					statusLbl.SetText("Failed: " + err.Error())
					walk.MsgBox(mw, "Obsid Installer", err.Error(), walk.MsgBoxIconError)
				case install && restart:
					statusLbl.SetText("Obsid installed into " + b.Name + ". Press Ctrl+Shift+O in Discord.")
				case install:
					statusLbl.SetText("Obsid installed into " + b.Name + ". Fully quit and reopen Discord to load it.")
				default:
					statusLbl.SetText("Obsid removed from " + b.Name + ".")
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
		Title:    "Obsid Installer",
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
							Label{Text: "Obsid", Font: Font{Family: "Segoe UI Semibold", PointSize: 20}},
							Label{Text: fmt.Sprintf("Installer %s  ·  github.com/%s", Version, Repo), TextColor: walk.RGB(110, 105, 125)},
						},
					},
					HSpacer{},
				},
			},
			GroupBox{
				Title:  "Install Obsid from",
				Layout: VBox{Spacing: 4, Alignment: AlignHNearVNear},
				Children: []Widget{
					RadioButtonGroup{
						Buttons: []RadioButton{
							{AssignTo: &rbGitHub, Text: "Latest release on GitHub (recommended)", Value: "github", OnClicked: func() { reload() }},
							{AssignTo: &rbLocal, Text: localText, Value: "local", Enabled: localBuild != "", OnClicked: func() { reload() }},
						},
					},
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
					{Title: "Obsid"},
				},
			},
			CheckBox{AssignTo: &restartCB, Text: "Close and reopen Discord after changes", Checked: true},
			Composite{
				Layout: HBox{MarginsZero: true, Spacing: 8},
				Children: []Widget{
					PushButton{AssignTo: &installBtn, Text: "Install", MinSize: Size{Width: 110}, OnClicked: func() { run(true) }},
					PushButton{AssignTo: &uninstallBtn, Text: "Uninstall", MinSize: Size{Width: 110}, OnClicked: func() { run(false) }},
					HSpacer{},
					PushButton{Text: "Open Obsid folder", OnClicked: func() { openFolder(DataDir()) }},
				},
			},
			ProgressBar{AssignTo: &progress, MarqueeMode: true, Visible: false, MaxSize: Size{Height: 6}},
			Label{AssignTo: &statusLbl, Text: "Ready.", TextColor: walk.RGB(90, 85, 105)},
		},
	}.Create()
	if err != nil {
		walk.MsgBox(nil, "Obsid Installer", "Couldn't open the installer window: "+err.Error(), walk.MsgBoxIconError)
		return 1
	}

	if bmp, err := walk.NewBitmapFromImageForDPI(gemImage(104), 96); err == nil {
		logoView.SetImage(bmp)
	}
	if ic, err := walk.NewIconFromImageForDPI(gemImage(64), 96); err == nil {
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

/* ------------------------------------------------------------- the gem logo */

var gemFacets = []struct {
	pts []float64
	c   color.RGBA
}{
	{[]float64{16, 2, 28, 11, 23, 30, 9, 30, 4, 11}, color.RGBA{0x2a, 0x1f, 0x3d, 255}},
	{[]float64{16, 2, 28, 11, 16, 15}, color.RGBA{0xa7, 0x8b, 0xfa, 255}},
	{[]float64{16, 2, 16, 15, 4, 11}, color.RGBA{0x7c, 0x3a, 0xed, 255}},
	{[]float64{4, 11, 16, 15, 9, 30}, color.RGBA{0x4c, 0x1d, 0x95, 255}},
	{[]float64{28, 11, 23, 30, 16, 15}, color.RGBA{0x5b, 0x21, 0xb6, 255}},
	{[]float64{16, 15, 23, 30, 9, 30}, color.RGBA{0x3b, 0x1a, 0x6e, 255}},
}

func inPolygon(x, y float64, p []float64) bool {
	in := false
	n := len(p) / 2
	for i, j := 0, n-1; i < n; j, i = i, i+1 {
		xi, yi, xj, yj := p[i*2], p[i*2+1], p[j*2], p[j*2+1]
		if (yi > y) != (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi {
			in = !in
		}
	}
	return in
}

// gemImage draws the Obsid gem with 4x4 supersampling.
func gemImage(size int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	scale := 32.0 / float64(size)
	for py := 0; py < size; py++ {
		for px := 0; px < size; px++ {
			var r, g, b, a float64
			for sy := 0; sy < 4; sy++ {
				for sx := 0; sx < 4; sx++ {
					x := (float64(px) + (float64(sx)+0.5)/4) * scale
					y := (float64(py) + (float64(sy)+0.5)/4) * scale
					for i := len(gemFacets) - 1; i >= 0; i-- {
						if inPolygon(x, y, gemFacets[i].pts) {
							c := gemFacets[i].c
							r, g, b, a = r+float64(c.R), g+float64(c.G), b+float64(c.B), a+255
							break
						}
					}
				}
			}
			if a > 0 {
				// premultiplied average
				img.SetRGBA(px, py, color.RGBA{uint8(r / 16), uint8(g / 16), uint8(b / 16), uint8(a / 16)})
			}
		}
	}
	return img
}
