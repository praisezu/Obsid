/** Types shared by the main process, the preload and the renderer. */

export interface VantaInfo {
    version: string;
    repo: string;
    root: string;
    dataDir: string;
    pluginsDir: string;
    themesDir: string;
    electron: string;
    chrome: string;
    discord: string;
    /** Started without plugins/themes (after crashes, or turned on by the user) */
    safeMode: boolean;
    safeModeReason: "crash" | "manual" | null;
}

export interface ThemeFile {
    file: string;
    css: string;
    meta: Record<string, string>;
}

/** A theme listed on betterdiscord.app */
export interface BdTheme {
    id: number;
    name: string;
    description: string;
    author: string;
    downloads: number;
    likes: number;
    tags: string[];
    thumbnail: string | null;
    released: string;
    page: string;
}

/** An entry in Vanta's plugin store (store/plugins.json in the Vanta repo). */
export interface StorePlugin {
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    /** Path inside the repo, e.g. "store/community/Foo.js". Official = under store/official/. */
    path: string;
    /** sha256 (hex) of the file; checked before installing */
    sha256: string;
    tags?: string[];
    updated?: string;
}

export interface RendererScript {
    name: string;
    code: string;
}

export interface Commit {
    hash: string;
    author: string;
    when: string;
    message: string;
}

/** "git" = a git checkout (dev). "release" = installed from a GitHub release by the installer. */
export type UpdateMode = "git" | "release";

export interface UpdaterInfo {
    mode: UpdateMode;
    version: string;
    root: string;
    repo: string;
    // git mode
    gitInstalled?: boolean;
    remote?: string | null;
    branch?: string | null;
    commit?: string | null;
    upstream?: string | null;
    dirty?: boolean;
}

export interface UpdateCheck extends UpdaterInfo {
    /** git mode: new commits upstream */
    updates: Commit[];
    /** release mode: the newer release, if any */
    release?: { tag: string; name: string; notes: string; url: string } | null;
    error?: string;
}

export interface BackupData {
    vantaBackup: 1;
    version: string;
    created: string;
    settings?: Record<string, any>;
    quickCss?: string;
    themes?: Record<string, string>;
}

export interface BackupParts {
    settings: boolean;
    quickCss: boolean;
    themes: boolean;
}

export interface FetchedPlugin {
    fileName: string;
    code: string;
    url?: string;
}

/** window.VantaNative — the bridge the preload exposes to the page. */
export interface NativeAPI {
    info: VantaInfo;
    getSettings(): Record<string, any>;
    setSettings(s: Record<string, any>): Promise<void>;
    resetSettings(): Promise<void>;
    getQuickCss(): string;
    setQuickCss(css: string): Promise<void>;
    onQuickCssChange(cb: (css: string) => void): void;

    getThemes(): ThemeFile[];
    onThemesChange(cb: () => void): void;
    writeTheme(file: string, css: string): Promise<void>;
    trashTheme(file: string): Promise<void>;
    fetchTheme(url: string): Promise<string>;

    /** GET an https URL from the main process (not subject to Discord's CSP). */
    fetchText(url: string): Promise<string>;

    /** Claude chat for plugins. The key is stored encrypted in the main process and can't be read back. */
    aiHasKey(): Promise<boolean>;
    /** Which brain keys are saved */
    aiKeys(): Promise<{ claude: boolean; nvidia: boolean }>;
    aiSetKey(key: string | null): Promise<boolean>;
    /** mode "online" lets it use the free online brain when there's no key; otherwise it stays on this PC */
    aiChat(system: string, messages: { role: "user" | "assistant"; content: string }[], maxTokens?: number, mode?: "online" | "offline"): Promise<string>;

    /** Capri's own voice: speaks text with Kokoro and her voice from the Capri Desktop pack. 24 kHz mono samples. */
    voiceSpeak(text: string, speed?: number): Promise<{ audio: Float32Array; rate: number }>;
    voiceStatus(): Promise<string>;
    /** Loads her voice model ahead of time */
    voiceWarm(): Promise<string>;

    /** Saves Discord-hosted files with their real names (asks where). Returns how many were saved. */
    saveFiles(files: { url: string; name: string }[]): Promise<number>;
    /** Always-on-top mute indicator: "muted" | "deafened" | "hidden" */
    muteOverlay(state: string, corner: string): Promise<void>;

    /** Opens spotify:/steam: links in their desktop apps */
    openAppUrl(url: string): Promise<void>;

    bdThemes(force?: boolean): Promise<BdTheme[]>;
    bdInstallTheme(id: number): Promise<string>;

    /** Vanta plugin store */
    storeIndex(force?: boolean): Promise<{ plugins: StorePlugin[]; repo: string; branch: string }>;
    /** Downloads a store plugin and checks its sha256. Returns { fileName, code, url }. */
    storeDownload(path: string, sha256: string): Promise<FetchedPlugin>;

    pluginPickFile(): Promise<FetchedPlugin | null>;
    pluginFetch(url: string): Promise<FetchedPlugin>;
    pluginInstall(fileName: string, code: string): Promise<string>;
    pluginExists(fileName: string): Promise<boolean>;
    pluginRun(file: string): Promise<void>;
    pluginTrash(file: string): Promise<void>;
    pluginRead(file: string): Promise<string>;

    updaterInfo(): Promise<UpdaterInfo>;
    updaterCheck(): Promise<UpdateCheck>;
    /** restart: true when Discord must restart (not just refresh) to finish */
    updaterApply(): Promise<{ ok: boolean; output: string; version?: string; restart?: boolean }>;

    backupExport(data: BackupData): Promise<string | null>;
    backupImport(): Promise<BackupData | null>;
    backupApply(data: BackupData, parts: BackupParts): Promise<void>;

    openPath(which: "data" | "plugins" | "themes" | "root" | "quickcss"): Promise<string>;
    openUrl(url: string): Promise<void>;
    openDataDir(): Promise<string>;
    openPluginsDir(): Promise<string>;
    toggleDevTools(): Promise<void>;
    relaunch(): Promise<void>;

    /** Tells Vanta this launch loaded fine (resets crash detection). */
    bootOk(): Promise<void>;
    /** Safe mode for the next launch (true) or back to normal (false). */
    setSafeMode(on: boolean): Promise<void>;
    /** Cloud sync (GitHub Gist) */
    cloudStatus(): Promise<{ signedIn: boolean; user: string | null; gistId: string | null; lastSync: string | null }>;
    cloudSignIn(token: string): Promise<{ user: string }>;
    cloudSignOut(): Promise<void>;
    cloudPush(data: unknown): Promise<{ updated: string }>;
    cloudPull(): Promise<{ data: any; updated: string } | null>;
    cloudRemoteUpdated(): Promise<string | null>;
    /** Per-plugin JSON storage */
    dataGet<T = any>(key: string): Promise<T | null>;
    dataSet(key: string, value: unknown): Promise<void>;
}
