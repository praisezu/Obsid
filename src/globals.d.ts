/** Injected at build time by scripts/build.mjs */
declare const __OBSID_VERSION__: string;
declare const __OBSID_REPO__: string;

declare module "~plugins" {
    import type { PluginDef } from "./renderer/core/plugins";
    /** Each plugin file exports one plugin, or an array of small related ones. */
    const plugins: (PluginDef | PluginDef[])[];
    export default plugins;
}
