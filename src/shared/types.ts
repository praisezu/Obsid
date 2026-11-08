/** Types shared by the main process, the preload and the renderer. */

export interface ObsidInfo {
    version: string;
    repo: string;
    root: string;
    dataDir: string;
    pluginsDir: string;
    themesDir: string;
    electron: string;
    chrome: string;
    discord: string;
}

export interface ThemeFile {
    file: string;
    css: string;
    meta: Record<string, string>;
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
    obsidBackup: 1;
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

/** window.ObsidNative — the bridge the preload exposes to the page. */
export interface NativeAPI {
    info: ObsidInfo;
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

    pluginPickFile(): Promise<FetchedPlugin | null>;
    pluginFetch(url: string): Promise<FetchedPlugin>;
    pluginInstall(fileName: string, code: string): Promise<string>;
    pluginExists(fileName: string): Promise<boolean>;
    pluginRun(file: string): Promise<void>;
    pluginTrash(file: string): Promise<void>;
    pluginRead(file: string): Promise<string>;

    updaterInfo(): Promise<UpdaterInfo>;
    updaterCheck(): Promise<UpdateCheck>;
    updaterApply(): Promise<{ ok: boolean; output: string; version?: string }>;

    backupExport(data: BackupData): Promise<string | null>;
    backupImport(): Promise<BackupData | null>;
    backupApply(data: BackupData, parts: BackupParts): Promise<void>;

    openPath(which: "data" | "plugins" | "themes" | "root" | "quickcss"): Promise<string>;
    openUrl(url: string): Promise<void>;
    openDataDir(): Promise<string>;
    openPluginsDir(): Promise<string>;
    toggleDevTools(): Promise<void>;
    relaunch(): Promise<void>;
}
