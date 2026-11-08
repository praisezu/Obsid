# Obsid

A Discord client mod in the spirit of Vencord. Plain JavaScript, no build step. It has
23 built-in plugins, themes, and a way to import plugins from a file or a link.

## Install

### Installer app (Windows)

Double-click **`ObsidInstaller.exe`** in this folder. It lists every Discord install it finds
(Stable, PTB, Canary, Development), each with **Install / Repair** and **Uninstall** buttons. With
"Close and reopen Discord after changes" ticked, it restarts Discord for you.

Keep the exe in the Obsid folder (or point it there with **Change…**). It installs Obsid from
that folder, so don't move or delete the folder after installing.

To rebuild the exe after editing `installer/ObsidInstaller.cs` (no SDK needed, it uses the
C# compiler built into Windows):

```bash
npm run build:installer
```

### Command line

Needs Node.js. From this folder:

```bash
npm run inject          # Discord Stable
node scripts/install.js --branch canary   # or ptb / development
npm run status
npm run uninject        # restore stock Discord
```

Then **fully quit Discord** (tray icon → Quit Discord) and reopen it.

Discord installs each update into a new `app-x.x.x` folder, which drops the injection.
Run the installer (or `npm run inject`) again after an update.

> Client mods are against Discord's Terms of Service. Mods like this one are widely used, but use it
> at your own risk, and avoid plugins that automate your account (self-botting).

## Settings

Obsid adds an **Obsid Settings** section to Discord's own **User Settings** sidebar:

| Page | What's there |
| --- | --- |
| Obsid | Version info, quick actions (reload, restart, DevTools), general options, folders |
| Plugins | Every plugin with search, category and on/off filters, per-plugin settings, **Import plugin** |
| Themes | Local `.css` themes (BetterDiscord themes work), online themes from a link, the Quick CSS editor |
| Updater | Updates Obsid with git once the folder is a git repo with a remote |
| Backup & Restore | Export settings, Quick CSS and themes to one file, restore it, or reset |

Press **Ctrl+Shift+O** anywhere to open the same pages in a pop-up without going through Settings.

## Importing plugins

On **Plugins → Import plugin** you can:

- paste a link to a `.js` file. GitHub page links are turned into raw links for you, and plugins
  added from a link get a **Check for update** button.
- pick a `.js` file from your computer
- or drag a `.js` file onto the Plugins page

Before anything is installed, Obsid shows a review screen with the plugin's name, author and full
code. It warns you if the code mentions your login token, sends network requests, or uses `eval`.
Imported plugins start right away, with no reload, and can be deleted from their card. They're saved
in `%APPDATA%\Obsid\plugins\`.

Try it with [`examples/HelloObsid.js`](examples/HelloObsid.js).

## Built-in plugins

| Plugin | Category | What it does |
| --- | --- | --- |
| NoTrack | Privacy | Blocks analytics (`/science`, `/metrics`) and Sentry crash reporting. **On by default** |
| ClearURLs | Privacy | Strips `utm_*`, `fbclid`, `si` and other trackers from links you send. **On by default** |
| SilentTyping | Privacy | Hides your typing indicator |
| AnonymiseFileNames | Privacy | Renames uploads to random names (keeps the extension and `SPOILER_`) |
| BlurMedia | Privacy | Blurs chat images and videos until hovered, good for screen sharing |
| NoReplyMention | Chat | Never pings the person you reply to |
| SilentMessages | Chat | Sends messages as `@silent` (optionally not in DMs) |
| TextReplace | Chat | Your own find → replace rules (regex supported) applied when you send |
| TimestampShortcuts | Chat | `{now}`, `{in 2h}`, `{at 9pm}`, `{tomorrow 18:00}` become Discord timestamps |
| MessageLogger | Chat | Keeps deleted and edited messages; view the log from its Settings |
| KeywordAlerts | Chat | Notifies you when any message contains your keywords |
| CharacterCounter | Chat | Shows `123 / 2000` above the message box |
| ChatBarCleanup | Appearance | Hides chat bar buttons: gift, stickers, apps, GIF, emoji, translate |
| HideUpsells | Appearance | Hides Nitro, Shop and Quests links and the gift button |
| HideProfileFlair | Appearance | Hides avatar decorations, server tags, profile effects |
| CustomFont | Appearance | Any installed font for text and code, plus a chat text size |
| FocusMode | Appearance | Ctrl+Alt+F hides the server, channel and member lists |
| ViewFullImages | Utility | Ctrl+click an avatar, icon, emoji or image to open it at full size |
| ReverseImageSearch | Utility | Alt+Shift+click an image to search Google Lens, Bing, Yandex or TinEye |
| CopyCodeBlocks | Utility | Copy button on code blocks |
| AlwaysTrustLinks | Utility | Skips the "Leaving Discord" prompt (English Discord) |
| NoDevToolsWarning | Developer | Removes the "Hold Up!" console spam. **On by default** |
| ConsoleShortcuts | Developer | `wp`, `findByProps`, `findByCode`, `common` in the DevTools console |

A built-in **Obsidian** theme (violet-black) is copied into your themes folder on first run.

## How it works

```
Discord bootstrap (app.asar)
  └─ modules/discord_desktop_core/index.js   ← installer adds: require("…/src/main/index.js")
       ├─ src/main/index.js   swaps electron.BrowserWindow for a subclass that points the
       │                      main window's preload at Obsid and keeps Discord's preload as an arg
       └─ core.asar           Discord creates its window → gets Obsid's preload
            └─ src/preload.js  exposes window.ObsidNative, runs renderer scripts in the page,
                               then require()s Discord's original preload
                 └─ renderer: core → components → themes → pluginStore → plugins → your plugins
                              → pages/* → settingsSidebar → quickPanel → boot
```

The settings section is built by **cloning Discord's own sidebar items** at runtime and relabelling
them, so it matches Discord's look without hardcoding its hashed class names.

Renderer files are re-read on every page load, so **Ctrl+R in Discord picks up your edits**. Changes
to `src/main` or `src/preload.js` need a full Discord restart.

## Writing a plugin

```js
Obsid.definePlugin({
    name: "HelloWorld",
    description: "Logs every message you send.",
    category: "Chat",
    options: {
        prefix: { type: "string", default: "[sent]", label: "Log prefix" },
        // types: boolean, string, number, text (multi-line), select ({ options: [{ value, label }] })
    },
    start() {
        this.unhook = Obsid.net.transform(({ method, url, body }) => {
            if (method === "POST" && /\/channels\/\d+\/messages$/.test(url))
                this.logger.log(this.settings.prefix, JSON.parse(body).content);
        });
    },
    stop() {
        this.unhook?.();
    },
    // optional: extra UI shown in the plugin's Settings pop-up
    // settingsPanel() { return Obsid.ui.h("div", {}, "Hello"); },
});
```

### API (`window.Obsid`)

- `common.FluxDispatcher`, `UserStore`, `ChannelStore`, `GuildStore`, `MessageStore`,
  `SelectedChannelStore`, `SelectedGuildStore`, `RelationshipStore`: Discord modules, found for you
- `webpack.findByProps(...props)`, `findByCode(...strings)`, `find(filter)`, `findAll(filter)`,
  `waitFor(filter, timeoutMs)`, `ready` (a promise)
- `patcher.before(obj, method, fn(args))`, `instead(obj, method, fn(args, original))`,
  `after(obj, method, fn(args, result))`. Each returns `unpatch()`, and patches stack safely.
- `net.block(fn)`, `net.transform(fn, { anyBody })` hook XHR, fetch and sendBeacon
- `ui.toast(text)`, `ui.modal({...})`, `ui.confirm({...})`, `ui.h(tag, props, ...children)`, `ui.icon(name)`
- `this.settings`, `this.logger`, `onSettingChange(key, value)` inside a plugin

Prefer `net` hooks, CSS or DOM work when they can do the job. Webpack lookups depend on Discord's
internals, which change with updates.

## Development

- `npm run check`: syntax-checks every file
- `scripts/dev-restart.ps1`: restarts Discord with a debug port, then
  `node scripts/cdp.js eval "<js>"`, `evalfile <file>`, `shot <png>` and `reload` drive it
  from a terminal. Restart Discord normally afterwards to close the port.
- DevTools: Settings → Obsid → DevTools. Obsid logs are tagged `[Obsid]`, and scripts show up
  under `obsid://` in the Sources tab.

If Obsid breaks badly, Discord still starts, because the injection is wrapped in try/catch. Run
`npm run uninject` or the installer's **Uninstall** to remove it completely.
