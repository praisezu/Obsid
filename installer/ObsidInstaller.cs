// Obsid Installer — a small native Windows GUI that injects Obsid into Discord.
// Built with the C# compiler that ships with Windows (.NET Framework 4.x, C# 5). See build.ps1.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Obsid Installer")]
[assembly: System.Reflection.AssemblyProduct("Obsid")]
[assembly: System.Reflection.AssemblyVersion("0.1.0.0")]

namespace Obsid.Installer
{
    static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main()
        {
            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    static class Theme
    {
        public static readonly Color Bg = Color.FromArgb(12, 10, 16);
        public static readonly Color Panel = Color.FromArgb(20, 17, 26);
        public static readonly Color Card = Color.FromArgb(27, 23, 34);
        public static readonly Color CardHover = Color.FromArgb(34, 29, 43);
        public static readonly Color Line = Color.FromArgb(43, 37, 52);
        public static readonly Color Text = Color.FromArgb(236, 233, 242);
        public static readonly Color Muted = Color.FromArgb(155, 147, 169);
        public static readonly Color Accent = Color.FromArgb(139, 92, 246);
        public static readonly Color AccentHover = Color.FromArgb(155, 114, 248);
        public static readonly Color Ok = Color.FromArgb(74, 222, 128);
        public static readonly Color Warn = Color.FromArgb(251, 191, 36);
        public static readonly Color Bad = Color.FromArgb(248, 113, 113);

        // Faceted obsidian gem, in a 32x32 design space (same as the in-client logo).
        static readonly float[][] Facets = {
            new float[] { 16,2, 28,11, 23,30, 9,30, 4,11 },
            new float[] { 16,2, 28,11, 16,15 },
            new float[] { 16,2, 16,15, 4,11 },
            new float[] { 4,11, 16,15, 9,30 },
            new float[] { 28,11, 23,30, 16,15 },
            new float[] { 16,15, 23,30, 9,30 },
        };
        static readonly Color[] FacetColors = {
            Color.FromArgb(42, 31, 61), Color.FromArgb(167, 139, 250), Color.FromArgb(124, 58, 237),
            Color.FromArgb(76, 29, 149), Color.FromArgb(91, 33, 182), Color.FromArgb(59, 26, 110),
        };

        public static void DrawLogo(Graphics g, RectangleF r)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            float s = Math.Min(r.Width, r.Height) / 32f;
            for (int i = 0; i < Facets.Length; i++)
            {
                var f = Facets[i];
                var pts = new PointF[f.Length / 2];
                for (int j = 0; j < pts.Length; j++) pts[j] = new PointF(r.X + f[j * 2] * s, r.Y + f[j * 2 + 1] * s);
                using (var b = new SolidBrush(FacetColors[i])) g.FillPolygon(b, pts);
            }
        }
    }

    /* ================================================================ model */

    enum InjectState { NotInstalled, Installed, InstalledElsewhere, OtherMod }

    class Branch
    {
        public string Key, Display, Folder, ExeName;
        public string BaseDir, AppVersion, IndexPath;
        public InjectState State;
        public string InjectedPath;
    }

    static class Injector
    {
        public const string Marker = "// Obsid injection";
        const string DefaultIndex = "module.exports = require('./core.asar');\n";

        static readonly string[][] Branches = {
            new[] { "stable", "Discord", "Discord", "Discord" },
            new[] { "ptb", "Discord PTB", "DiscordPTB", "DiscordPTB" },
            new[] { "canary", "Discord Canary", "DiscordCanary", "DiscordCanary" },
            new[] { "development", "Discord Development", "DiscordDevelopment", "DiscordDevelopment" },
        };

        static string VersionKey(string s)
        {
            return string.Join(".", Regex.Matches(s, @"\d+").Cast<Match>().Select(m => m.Value.PadLeft(8, '0')));
        }

        static string Newest(string dir, string pattern)
        {
            if (!Directory.Exists(dir)) return null;
            return Directory.GetDirectories(dir)
                .Select(Path.GetFileName)
                .Where(n => Regex.IsMatch(n, pattern))
                .OrderByDescending(VersionKey, StringComparer.Ordinal)
                .FirstOrDefault();
        }

        public static List<Branch> DetectAll(string mainEntry)
        {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var list = new List<Branch>();
            foreach (var def in Branches)
            {
                var b = new Branch { Key = def[0], Display = def[1], Folder = def[2], ExeName = def[3] };
                b.BaseDir = Path.Combine(local, b.Folder);
                b.AppVersion = Newest(b.BaseDir, @"^app-\d");
                if (b.AppVersion == null) continue;
                var modules = Path.Combine(b.BaseDir, b.AppVersion, "modules");
                var core = Newest(modules, @"^discord_desktop_core(-\d+)?$");
                if (core == null) continue;
                b.IndexPath = Path.Combine(modules, core, "discord_desktop_core", "index.js");
                if (!File.Exists(b.IndexPath)) continue;
                Refresh(b, mainEntry);
                list.Add(b);
            }
            return list;
        }

        public static void Refresh(Branch b, string mainEntry)
        {
            var content = File.ReadAllText(b.IndexPath);
            b.InjectedPath = null;
            if (content.Contains(Marker))
            {
                var m = Regex.Match(content, "require\\(\"((?:[^\"\\\\]|\\\\.)*)\"\\)");
                b.InjectedPath = m.Success ? Regex.Unescape(m.Groups[1].Value) : "";
                b.State = SamePath(b.InjectedPath, mainEntry) ? InjectState.Installed : InjectState.InstalledElsewhere;
            }
            else
            {
                var norm = Regex.Replace(content, @"\s+", "").Replace('"', '\'');
                b.State = norm == "module.exports=require('./core.asar');" ? InjectState.NotInstalled : InjectState.OtherMod;
            }
        }

        static bool SamePath(string a, string b)
        {
            try { return string.Equals(Path.GetFullPath(a), Path.GetFullPath(b), StringComparison.OrdinalIgnoreCase); }
            catch { return false; }
        }

        static string JsString(string s)
        {
            return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
        }

        static void WriteUtf8(string path, string text)
        {
            File.WriteAllText(path, text, new UTF8Encoding(false));
        }

        public static void Install(Branch b, string mainEntry)
        {
            var current = File.ReadAllText(b.IndexPath);
            if (!current.Contains(Marker)) WriteUtf8(b.IndexPath + ".obsid-backup", current);
            WriteUtf8(b.IndexPath, string.Join("\n", new[] {
                Marker,
                "try {",
                "    require(" + JsString(mainEntry) + ");",
                "} catch (e) {",
                "    console.error(\"[Obsid] failed to load, starting Discord without it:\", e);",
                "}",
                "module.exports = require('./core.asar');",
                "",
            }));
        }

        public static void Uninstall(Branch b)
        {
            var backup = b.IndexPath + ".obsid-backup";
            if (File.Exists(backup))
            {
                WriteUtf8(b.IndexPath, File.ReadAllText(backup));
                File.Delete(backup);
            }
            else WriteUtf8(b.IndexPath, DefaultIndex);
        }

        public static bool IsRunning(Branch b)
        {
            return Process.GetProcessesByName(b.ExeName).Length > 0;
        }

        public static void Kill(Branch b)
        {
            foreach (var p in Process.GetProcessesByName(b.ExeName)) { try { p.Kill(); } catch { } }
            var until = DateTime.Now.AddSeconds(10);
            while (IsRunning(b) && DateTime.Now < until) Thread.Sleep(200);
            Thread.Sleep(500); // let file handles close
        }

        public static void Launch(Branch b)
        {
            var update = Path.Combine(b.BaseDir, "Update.exe");
            if (File.Exists(update))
                Process.Start(new ProcessStartInfo(update, "--processStart " + b.ExeName + ".exe") { UseShellExecute = false });
            else
                Process.Start(Path.Combine(b.BaseDir, b.AppVersion, b.ExeName + ".exe"));
        }
    }

    /* ============================================================ controls */

    class FlatBtn : Button
    {
        readonly bool primary;
        bool hover;

        public FlatBtn(string text, bool primary)
        {
            this.primary = primary;
            Text = text;
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
            Cursor = Cursors.Hand;
            Font = new Font("Segoe UI Semibold", 9.5f);
            FlatStyle = FlatStyle.Flat;
        }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnEnabledChanged(EventArgs e) { Cursor = Enabled ? Cursors.Hand : Cursors.Default; Invalidate(); base.OnEnabledChanged(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Parent != null ? Parent.BackColor : Theme.Card);
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            Color fill, border, fg;
            if (!Enabled) { fill = Theme.Card; border = Theme.Line; fg = Color.FromArgb(90, 84, 102); }
            else if (primary) { fill = hover ? Theme.AccentHover : Theme.Accent; border = fill; fg = Color.White; }
            else { fill = hover ? Theme.CardHover : Theme.Card; border = hover ? Theme.Accent : Theme.Line; fg = Theme.Text; }
            using (var path = Rounded(r, Height * 0.22f))
            using (var b = new SolidBrush(fill))
            using (var p = new Pen(border))
            {
                g.FillPath(b, path);
                g.DrawPath(p, path);
            }
            TextRenderer.DrawText(g, Text, Font, ClientRectangle, fg,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
            if (Focused && ShowFocusCues)
                using (var p = new Pen(Theme.Accent, 2f)) g.DrawRectangle(p, 1, 1, Width - 3, Height - 3);
        }

        public static GraphicsPath Rounded(RectangleF r, float rad)
        {
            var p = new GraphicsPath();
            float d = rad * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }
    }

    class Card : Panel
    {
        public Card() { DoubleBuffered = true; BackColor = Theme.Card; }
        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            using (var p = new Pen(Theme.Line)) e.Graphics.DrawRectangle(p, 0, 0, Width - 1, Height - 1);
        }
    }

    class Dot : Control
    {
        public Color DotColor = Theme.Muted;
        public Dot() { SetStyle(ControlStyles.SupportsTransparentBackColor | ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint, true); }
        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.Clear(Parent != null ? Parent.BackColor : Theme.Card);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var b = new SolidBrush(DotColor)) e.Graphics.FillEllipse(b, 0, 0, Width - 1, Height - 1);
        }
    }

    /* ================================================================ form */

    class MainForm : Form
    {
        float scale = 1f;
        string root, mainEntry, version = "?";
        readonly Panel header = new Panel();
        readonly Label pathLabel = new Label();
        readonly FlowLayoutPanel cards = new FlowLayoutPanel();
        readonly CheckBox restart = new CheckBox();
        readonly Label status = new Label();
        readonly List<Control> busyControls = new List<Control>();
        readonly List<Control> cardButtons = new List<Control>();

        int S(float v) { return (int)Math.Round(v * scale); }

        public MainForm()
        {
            using (var g = CreateGraphics()) scale = g.DpiX / 96f;
            Text = "Obsid Installer";
            BackColor = Theme.Panel;
            ForeColor = Theme.Text;
            Font = new Font("Segoe UI", 9.5f);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            root = FindObsidRoot(Application.StartupPath);
            BuildUi();
            Shown += delegate
            {
                if (root == null) ChooseRoot(true);
                else LoadBranches();
            };
        }

        static string FindObsidRoot(string start)
        {
            var dir = new DirectoryInfo(start);
            for (int i = 0; i < 3 && dir != null; i++, dir = dir.Parent)
                if (File.Exists(Path.Combine(dir.FullName, "src", "main", "index.js"))) return dir.FullName;
            return null;
        }

        void SetRoot(string r)
        {
            root = r;
            mainEntry = Path.Combine(root, "src", "main", "index.js");
            pathLabel.Text = root;
            try
            {
                var pkg = File.ReadAllText(Path.Combine(root, "package.json"));
                var m = Regex.Match(pkg, "\"version\"\\s*:\\s*\"([^\"]+)\"");
                if (m.Success) version = m.Groups[1].Value;
            }
            catch { }
            header.Invalidate();
        }

        void BuildUi()
        {
            int W = S(600), pad = S(24);
            ClientSize = new Size(W, S(500));

            // Header
            header.SetBounds(0, 0, W, S(96));
            header.BackColor = Theme.Bg;
            header.Paint += (s, e) =>
            {
                var g = e.Graphics;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
                Theme.DrawLogo(g, new RectangleF(pad, S(24), S(48), S(48)));
                using (var f = new Font("Segoe UI Semibold", 20f))
                    TextRenderer.DrawText(g, "Obsid", f, new Point(pad + S(60), S(18)), Theme.Text);
                using (var f = new Font("Segoe UI", 9.5f))
                    TextRenderer.DrawText(g, "Installer  ·  v" + version, f, new Point(pad + S(63), S(56)), Theme.Muted);
                using (var p = new Pen(Theme.Line)) g.DrawLine(p, 0, header.Height - 1, header.Width, header.Height - 1);
            };
            Controls.Add(header);

            int y = header.Bottom + S(18);

            // Obsid files location
            var filesTitle = MakeLabel("OBSID FILES", Theme.Muted, new Font("Segoe UI Semibold", 8f));
            filesTitle.SetBounds(pad, y, S(300), S(18));
            Controls.Add(filesTitle);
            y += S(22);

            pathLabel.SetBounds(pad, y + S(6), W - pad * 2 - S(110), S(22));
            pathLabel.ForeColor = Theme.Text;
            pathLabel.AutoEllipsis = true;
            pathLabel.Font = new Font("Consolas", 9.5f);
            Controls.Add(pathLabel);
            var change = new FlatBtn("Change…", false);
            change.SetBounds(W - pad - S(100), y, S(100), S(32));
            change.Click += delegate { ChooseRoot(false); };
            Controls.Add(change);
            busyControls.Add(change);
            y += S(48);

            var discordTitle = MakeLabel("DISCORD INSTALLS", Theme.Muted, new Font("Segoe UI Semibold", 8f));
            discordTitle.SetBounds(pad, y, S(300), S(18));
            Controls.Add(discordTitle);
            y += S(24);

            cards.SetBounds(pad, y, W - pad * 2, S(10));
            cards.FlowDirection = FlowDirection.TopDown;
            cards.WrapContents = false;
            cards.AutoSize = false;
            cards.Margin = Padding.Empty;
            cards.Padding = Padding.Empty;
            cards.SizeChanged += delegate { LayoutBottom(); };
            Controls.Add(cards);

            restart.Text = "Close and reopen Discord after changes";
            restart.Checked = true;
            restart.ForeColor = Theme.Text;
            restart.FlatStyle = FlatStyle.Flat;
            restart.FlatAppearance.BorderColor = Theme.Line;
            restart.FlatAppearance.CheckedBackColor = Theme.Accent;
            restart.AutoSize = true;
            restart.Cursor = Cursors.Hand;
            Controls.Add(restart);
            busyControls.Add(restart);

            status.ForeColor = Theme.Muted;
            status.AutoEllipsis = true;
            Controls.Add(status);

            var dataLink = MakeLink("Open settings folder", delegate
            {
                var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Obsid");
                Directory.CreateDirectory(dir);
                Process.Start("explorer.exe", "\"" + dir + "\"");
            });
            dataLink.Name = "dataLink";
            Controls.Add(dataLink);

            LayoutBottom();
        }

        Label MakeLabel(string text, Color color, Font font)
        {
            return new Label { Text = text, ForeColor = color, Font = font, BackColor = Color.Transparent };
        }

        LinkLabel MakeLink(string text, EventHandler onClick)
        {
            var l = new LinkLabel
            {
                Text = text, AutoSize = true, LinkColor = Theme.Muted, ActiveLinkColor = Theme.Text,
                VisitedLinkColor = Theme.Muted, LinkBehavior = LinkBehavior.HoverUnderline,
            };
            l.LinkClicked += (s, e) => onClick(s, e);
            return l;
        }

        void LayoutBottom()
        {
            int W = ClientSize.Width, pad = S(24);
            int y = cards.Bottom + S(16);
            restart.Location = new Point(pad, y);
            y = restart.Bottom + S(18);
            var divider = Controls["divider"] as Panel;
            if (divider == null)
            {
                divider = new Panel { Name = "divider", BackColor = Theme.Line };
                Controls.Add(divider);
            }
            divider.SetBounds(0, y, W, 1);
            y += S(12);
            status.SetBounds(pad, y, W - pad * 2 - S(150), S(22));
            var link = Controls["dataLink"];
            if (link != null) link.Location = new Point(W - pad - link.Width, y + S(2));
            ClientSize = new Size(W, y + S(36));
        }

        void SetStatus(string text, Color color)
        {
            status.Text = text;
            status.ForeColor = color;
        }

        void ChooseRoot(bool required)
        {
            using (var dlg = new FolderBrowserDialog())
            {
                dlg.Description = "Select your Obsid folder (the one containing src\\main\\index.js).";
                if (root != null) dlg.SelectedPath = root;
                while (dlg.ShowDialog(this) == DialogResult.OK)
                {
                    var found = FindObsidRoot(dlg.SelectedPath);
                    if (found != null) { SetRoot(found); LoadBranches(); return; }
                    MessageBox.Show(this, "That folder doesn't contain Obsid (src\\main\\index.js is missing).",
                        "Obsid Installer", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
            if (required) { SetStatus("No Obsid folder selected.", Theme.Bad); pathLabel.Text = "(not set)"; }
        }

        void LoadBranches()
        {
            if (mainEntry == null && root != null) SetRoot(root);
            cards.SuspendLayout();
            foreach (var c in cardButtons) busyControls.Remove(c);
            cardButtons.Clear();
            var old = cards.Controls.Cast<Control>().ToList();
            cards.Controls.Clear();
            foreach (var c in old) c.Dispose();
            List<Branch> branches;
            try { branches = Injector.DetectAll(mainEntry); }
            catch (Exception ex) { SetStatus("Couldn't scan for Discord: " + ex.Message, Theme.Bad); branches = new List<Branch>(); }

            if (branches.Count == 0)
            {
                var c = new Card { Width = cards.Width, Height = S(64), Margin = Padding.Empty };
                var l = MakeLabel("No Discord installation found. Install Discord, open it once, then reopen this installer.", Theme.Muted, Font);
                l.SetBounds(S(16), 0, c.Width - S(32), c.Height);
                l.TextAlign = ContentAlignment.MiddleLeft;
                l.BackColor = Theme.Card;
                c.Controls.Add(l);
                cards.Controls.Add(c);
            }
            foreach (var b in branches) cards.Controls.Add(MakeCard(b));
            int h = 0;
            foreach (Control c in cards.Controls) h += c.Height + c.Margin.Vertical;
            cards.Height = Math.Max(h, S(10));
            cards.ResumeLayout();
            LayoutBottom();
            if (status.Text == "") SetStatus("Ready.", Theme.Muted);
        }

        Control MakeCard(Branch b)
        {
            int W = cards.Width, H = S(72);
            var c = new Card { Width = W, Height = H, Margin = new Padding(0, 0, 0, S(10)) };

            Color color; string state;
            switch (b.State)
            {
                case InjectState.Installed: color = Theme.Ok; state = "Obsid installed"; break;
                case InjectState.InstalledElsewhere: color = Theme.Warn; state = "Obsid installed from another folder"; break;
                case InjectState.OtherMod: color = Theme.Warn; state = "Modified by another mod"; break;
                default: color = Theme.Muted; state = "Not installed"; break;
            }

            var dot = new Dot { DotColor = color };
            dot.SetBounds(S(18), S(20), S(9), S(9));
            c.Controls.Add(dot);

            var name = MakeLabel(b.Display, Theme.Text, new Font("Segoe UI Semibold", 11f));
            name.BackColor = Theme.Card;
            name.SetBounds(S(34), S(11), S(260), S(26));
            c.Controls.Add(name);

            var sub = MakeLabel(state + "  ·  " + b.AppVersion, color == Theme.Muted ? Theme.Muted : color, Font);
            sub.BackColor = Theme.Card;
            sub.AutoEllipsis = true;
            sub.SetBounds(S(34), S(38), W - S(34) - S(230), S(22));
            if (b.InjectedPath != null && b.State == InjectState.InstalledElsewhere)
                new ToolTip().SetToolTip(sub, "Points to: " + b.InjectedPath);
            c.Controls.Add(sub);

            bool installed = b.State == InjectState.Installed || b.State == InjectState.InstalledElsewhere;
            var uninstall = new FlatBtn("Uninstall", false) { Enabled = installed };
            uninstall.SetBounds(W - S(16) - S(100), S(18), S(100), S(36));
            uninstall.Click += async delegate { await RunAction(b, false); };
            c.Controls.Add(uninstall);

            var install = new FlatBtn(b.State == InjectState.Installed ? "Repair" : "Install", true);
            install.SetBounds(uninstall.Left - S(10) - S(100), S(18), S(100), S(36));
            install.Click += async delegate { await RunAction(b, true); };
            c.Controls.Add(install);

            busyControls.Add(install);
            busyControls.Add(uninstall);
            cardButtons.Add(install);
            cardButtons.Add(uninstall);
            return c;
        }

        void SetBusy(bool busy)
        {
            foreach (var c in busyControls)
            {
                if (busy) { c.Tag = c.Enabled; c.Enabled = false; }
                else if (c.Tag is bool) c.Enabled = (bool)c.Tag;
            }
            UseWaitCursor = busy;
        }

        async Task RunAction(Branch b, bool install)
        {
            if (install && b.State == InjectState.OtherMod)
            {
                var r = MessageBox.Show(this,
                    b.Display + " was already modified by another mod (for example BetterDiscord).\n\n" +
                    "Installing Obsid replaces that change. The current file is backed up, and uninstalling Obsid restores it.\n\nContinue?",
                    "Obsid Installer", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                if (r != DialogResult.Yes) return;
            }

            bool doRestart = restart.Checked;
            SetBusy(true);
            try
            {
                await Task.Run(() =>
                {
                    if (doRestart && Injector.IsRunning(b))
                    {
                        Invoke(new Action(() => SetStatus("Closing " + b.Display + "…", Theme.Muted)));
                        Injector.Kill(b);
                    }
                    Invoke(new Action(() => SetStatus((install ? "Installing into " : "Removing from ") + b.Display + "…", Theme.Muted)));
                    if (install) Injector.Install(b, mainEntry); else Injector.Uninstall(b);
                    if (doRestart)
                    {
                        Invoke(new Action(() => SetStatus("Starting " + b.Display + "…", Theme.Muted)));
                        Injector.Launch(b);
                    }
                });
                SetBusy(false);
                LoadBranches();
                var tail = doRestart ? "" : " Fully quit and reopen Discord to apply.";
                SetStatus(install
                    ? "Obsid installed into " + b.Display + ". Press Ctrl+Shift+O in Discord." + tail
                    : "Obsid removed from " + b.Display + "." + tail, Theme.Ok);
            }
            catch (Exception ex)
            {
                SetBusy(false);
                LoadBranches();
                SetStatus("Failed: " + ex.Message, Theme.Bad);
                MessageBox.Show(this, ex.Message, "Obsid Installer", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
