<p align="center"><img src="assets/logo.png" width="128" alt="Vanta logo"></p>

# Vanta

> Vanta was called **Obsid** until v0.3.0. Existing Obsid installs update to Vanta automatically and keep
> their settings, plugins and themes. Plugins written as `Obsid.definePlugin(...)` still work.

A Discord client mod in the spirit of Vencord, written in TypeScript. It has built-in plugins,
themes, a settings section inside Discord, and a way to import plugins from a file or a link.

## Install

Download **`VantaInstaller.exe`** from the [latest release](https://github.com/praisezu/Vanta/releases/latest)
and run it. It finds every Discord install (Stable, PTB, Canary, Development) and has
**Install / Repair** and **Uninstall** buttons. It downloads Vanta into `%APPDATA%\Vanta\app`,
closes and reopens Discord for you, and in-app updates come from the same releases.

Command line (Windows, macOS, Linux):

```bash
VantaInstaller -install [-branch stable|ptb|canary|development|all]
VantaInstaller -uninstall
VantaInstaller -status
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
npm run build:installer   # → dist/VantaInstaller.exe
```

Main-process and preload changes need a full Discord restart; renderer changes only need Ctrl+R.

### Releasing

Bump the version, commit, then push an annotated tag. Its message becomes the release notes, so keep
it short. GitHub Actions builds everything and publishes `vanta.tar.gz` plus the installers:

```bash
npm version 0.2.1 --no-git-tag-version
git commit -am "Vanta 0.2.1"
git tag -a v0.2.1 -m "Vanta 0.2.1" -m "- Fixed X" -m "- Added Y"
git push --follow-tags
```

## Settings

Vanta adds an **Vanta Settings** section to Discord's own **User Settings** sidebar:

| Page | What's there |
| --- | --- |
| Vanta | Version info, quick actions (reload, restart, DevTools), general options, folders |
| Plugins | Every plugin with search, category and on/off filters, per-plugin settings, **Import plugin** |
| Themes | Local `.css` themes (BetterDiscord themes work), online themes from a link, the Quick CSS editor |
| Updater | Updates Vanta with git once the folder is a git repo with a remote |
| Backup & Restore | Export settings, Quick CSS and themes to one file, restore it, or reset |

Press **Ctrl+Shift+O** anywhere to open the same pages in a pop-up without going through Settings.

## Importing plugins

On **Plugins → Import plugin** you can:

- paste a link to a `.js` file. GitHub page links are turned into raw links for you, and plugins
  added from a link get a **Check for update** button.
- pick a `.js` file from your computer
- or drag a `.js` file onto the Plugins page

Before anything is installed, Vanta shows a review screen with the plugin's name, author and full
code. It warns you if the code mentions your login token, sends network requests, or uses `eval`.
Imported plugins start right away, with no reload, and can be deleted from their card. They're saved
in `%APPDATA%\Vanta\plugins\`.

Try it with [`examples/HelloVanta.js`](examples/HelloVanta.js).

## Built-in plugins (97)

Every plugin is off until you turn it on (except NoTrack, ClearURLs and NoDevToolsWarning), and a
plugin that's off costs nothing. Most appearance plugins are pure CSS, and plugins that react to
new messages share one page watcher, so turning many on doesn't slow Discord down.

| Category | Plugins |
| --- | --- |
| Privacy | NoTrack, ClearURLs, SilentTyping, AnonymiseFileNames, BlurMedia, BlurNames |
| Chat | MessageLogger (keeps deleted messages in chat, shows edit history), Translate, ShowMeYourName, ChannelTypingIndicator, HoverReactKeys, HideBotMessages, HideSystemMessages, KeywordAlerts, IgnoreUsers, HighlightUsers, HideMessagesWith, CollapseLongMessages, DoubleClickActions, CharacterCounter, FixEmbeds, YouTubeShortLinks, SuppressEmbeds, SafeMentions, TextReplace, TextEffects, SmartPunctuation, InlineCalc, TimestampShortcuts, Signature, AutoCapitalize, SpoilerUploads, NoReplyMention, SilentMessages |
| Appearance | TransparentWindow, HighlightMyMessages, HideAudioMenus, HideActiveNow, AccentColor, ChatBackground, CustomFont, MentionHighlight, MediaCorners, ReadableWidth, ThinScrollbars, ReduceMotion, GrayscaleMode, DimWhenUnfocused, FocusMode, NoChatAvatars, NoJumboEmoji, AlwaysShowTimestamps, ChatBarCleanup, ChannelHeaderCleanup, TitleBarCleanup, HoverBarCleanup, ServerListCleanup, HideUpsells, HideProfileFlair, HideStatuses, HideStickers, HideLinkEmbeds, HideReplyPreviews, HideReactions, HideTypingIndicator, HideGifTag, HideRoleIcons, HideBadgeCounts, HideAttachButton |
| Utility | ReadAllNotifications, RelationshipNotifier, VoiceChannelAlerts, MuteNewServers, OnlineFriendsCount, CopyHoveredMessage, ViewFullImages, ReverseImageSearch, CopyImageLink, CopyIds, CopyMessageLink, CopyCodeBlocks, CopyInlineCode, ViewRaw, ConfirmCalls, NotificationVolume, VideoTweaks, PictureInPicture, ServerHotkeys, BetterTitle, AlwaysTrustLinks, F5Reload |
| Developer | ConsoleShortcuts, DevToolsKeybind, ThemeHelper, FluxLogger, NetworkLogger, NoDevToolsWarning |

Each plugin's description and options are in **Settings → Vanta Settings → Plugins**. Plugins tagged
**Restart** ask whether to restart Discord when you switch them.

A built-in theme ships in `themes/` (Vantablack). Only one theme is on at a time; Quick CSS layers
on top. Themes that `@import` their CSS from a website (most BetterDiscord themes) work.

## How it works

```
Discord bootstrap (app.asar)
  └─ modules/discord_desktop_core/index.js   ← installer adds: require("…/dist/main.js")
       ├─ dist/main.js      swaps electron.BrowserWindow for a subclass that points the main
       │                    window's preload at Vanta and keeps Discord's preload as an arg
       └─ core.asar         Discord creates its window → gets Vanta's preload
            └─ dist/preload.js   exposes window.VantaNative, runs dist/renderer.js in the page,
                                 then your imported plugins, then require()s Discord's preload
```

Source layout:

| Path | What |
| --- | --- |
| `src/main/` | Electron main process: window patching, IPC, files, updater |
| `src/preload/` | The bridge between the page and the main process |
| `src/renderer/core/` | Webpack finder, patcher, request hooks, settings, plugin manager |
| `src/renderer/ui/`, `pages/` | Components and the five settings pages |
| `src/renderer/settingsSidebar.ts` | Adds "Vanta Settings" to Discord's User Settings |
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

Same shape, but call the global: `Vanta.definePlugin({ ... })`, and use `Vanta.net`, `Vanta.ui`,
etc. Share the `.js` file or a link to it; people add it with **Plugins → Import plugin**.
See [`examples/HelloVanta.js`](examples/HelloVanta.js).

### API (`@api` / `window.Vanta`)

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
- DevTools: Settings → Vanta → DevTools. Vanta logs are tagged `[Vanta]`.

If Vanta breaks badly, Discord still starts, because the injection is wrapped in try/catch. The
installer's **Uninstall** (or `npm run uninject`) removes it completely.
