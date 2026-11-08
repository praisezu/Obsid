import type { NativeAPI } from "@shared/types";

/** The bridge exposed by the preload (file access, dialogs, updater…). */
export const native: NativeAPI = (window as any).VantaNative;

/** Strips Electron's "Error invoking remote method 'x': Error:" prefix from IPC errors. */
export const cleanError = (e: unknown) =>
    String((e as any)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
