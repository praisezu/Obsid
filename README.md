# Obsid

A Discord client mod in the spirit of Vencord, written in TypeScript. It has built-in plugins,
themes, a settings section inside Discord, and a way to import plugins from a file or a link.

## Install

Download **`ObsidInstaller.exe`** from the [latest release](https://github.com/praisezu/Obsid/releases/latest)
and run it. It finds every Discord install (Stable, PTB, Canary, Development) and has
**Install / Repair** and **Uninstall** buttons. It downloads Obsid into `%APPDATA%\Obsid\app`,
closes and reopens Discord for you, and in-app updates come from the same releases.

Command line (Windows, macOS, Linux):

```bash
ObsidInstaller -install [-branch stable|ptb|canary|development|all]
ObsidInstaller -uninstall
ObsidInstaller -status
```

Discord installs each update into a new `app-x.x.x` folder, which drops the injection.
Run the installer again after a Discord update.

> Client mods are against Discord's Terms of Service. Mods like this one are widely used, but use it
> at your own risk, and avoid plugins that automate your account (self-botting).

## Building from source

Needs Node.js 20+ and, for the installer, Go 1.22+.

```bash
npm install
npm run build        # → dist/main.js, dist/preload.js, dist/renderer.js
npm run inject       # point Discord Stable at this checkout's dist/ (or use the installer's "Local build")
npm run watch        # rebuild on save; press Ctrl+R in Discord to reload renderer changes
npm run typecheck
npm run build:installer   # → dist/ObsidInstaller.exe
```

Main-process and preload changes need a full Discord restart; renderer changes only need Ctrl+R.

### Releasing

Bump the version, tag it, push. GitHub Actions builds everything and publishes the release
(`obsid.tar.gz` plus the installers for Windows, Linux and macOS):

```bash
npm version 0.2.0 --no-git-tag-version
git commit -am "Release 0.2.0"
git tag v0.2.0
git push --follow-tags
```

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
  └─ modules/discord_desktop_core/index.js   ← installer adds: require("…/dist/main.js")
       ├─ dist/main.js      swaps electron.BrowserWindow for a subclass that points the main
       │                    window's preload at Obsid and keeps Discord's preload as an arg
       └─ core.asar         Discord creates its window → gets Obsid's preload
            └─ dist/preload.js   exposes window.ObsidNative, runs dist/renderer.js in the page,
                                 then your imported plugins, then require()s Discord's preload
```

Source layout:

| Path | What |
| --- | --- |
| `src/main/` | Electron main process: window patching, IPC, files, updater |
| `src/preload/` | The bridge between the page and the main process |
| `src/renderer/core/` | Webpack finder, patcher, request hooks, settings, plugin manager |
| `src/renderer/ui/`, `pages/` | Components and the five settings pages |
| `src/renderer/settingsSidebar.ts` | Adds "Obsid Settings" to Discord's User Settings |
| `src/plugins/` | Built-in plugins, one file each, picked up automatically by the build |
| `installer/` | Go installer (GUI on Windows, CLI everywhere) |

The settings section is built by **cloning Discord's own sidebar items** at runtime and relabelling
them, so it matches Discord's look without hardcoding its hashed class names.

## Writing a plugin

### Built-in (TypeScript)

Add a file to `src/plugins/` and run `npm run build`:

```ts
import { definePlugin, net } from "@api";

export default definePlugin({
    name: "HelloWorld",
    description: "Logs every message you send.",
    category: "Chat",
    options: {
        prefix: { type: "string", default: "[sent]", label: "Log prefix" },
        // types: boolean, string, number, text (multi-line), select ({ options: [{ value, label }] })
    },
    start() {
        this.unhook = net.transform(({ method, url, body }) => {
            if (method === "POST" && /\/channels\/\d+\/messages$/.test(url))
                this.logger.log(this.settings.prefix, JSON.parse(body).content);
        });
    },
    stop() {
        this.unhook?.();
    },
});
```

### Imported (plain JavaScript)

Same shape, but call the global: `Obsid.definePlugin({ ... })`, and use `Obsid.net`, `Obsid.ui`,
etc. Share the `.js` file or a link to it; people add it with **Plugins → Import plugin**.
See [`examples/HelloObsid.js`](examples/HelloObsid.js).

### API (`@api` / `window.Obsid`)

- `common.FluxDispatcher`, `UserStore`, `ChannelStore`, `GuildStore`, `MessageStore`,
  `SelectedChannelStore`, `SelectedGuildStore`, `RelationshipStore`: Discord modules, found for you
- `webpack.findByProps(...props)`, `findByCode(...strings)`, `find(filter)`, `findAll(filter)`,
  `waitFor(filter, timeoutMs)`, `ready` (a promise)
- `patcher.before(obj, method, fn(args))`, `instead(obj, method, fn(args, original))`,
  `after(obj, method, fn(args, result))`. Each returns `unpatch()`, and patches stack safely.
- `net.block(fn)`, `net.transform(fn, { anyBody })` hook XHR, fetch and sendBeacon
- `ui.toast`, `ui.modal`, `ui.confirm`, `ui.h(tag, props, ...children)`, `ui.icon(name)`
- `managedStyle(id)`, `onDomReady(fn)`, `sleep(ms)`
- In a plugin: `this.settings`, `this.logger`, `onSettingChange(key, value)`, `settingsPanel()`

Prefer `net` hooks, CSS or DOM work when they can do the job. Webpack lookups depend on Discord's
internals, which change with updates.

## Development tools

- `scripts/dev-restart.ps1` restarts Discord with a debug port. Then
  `node scripts/cdp.js eval "<js>"`, `evalfile <file>`, `shot <png>` and `reload` drive it from a
  terminal. Restart Discord normally afterwards to close the port.
- DevTools: Settings → Obsid → DevTools. Obsid logs are tagged `[Obsid]`.

If Obsid breaks badly, Discord still starts, because the injection is wrapped in try/catch. The
installer's **Uninstall** (or `npm run uninject`) removes it completely.
