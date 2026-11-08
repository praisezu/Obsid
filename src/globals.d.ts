/** Injected at build time by scripts/build.mjs */
declare const __VANTA_VERSION__: string;
declare const __VANTA_REPO__: string;
/** Discord server invite (package.json vanta.discord); empty = no button */
declare const __VANTA_DISCORD__: string;
/** Website (package.json vanta.website); empty = no button */
declare const __VANTA_WEBSITE__: string;

declare module "~plugins" {
    import type { PluginDef } from "./renderer/core/plugins";
    /** Each plugin file exports one plugin, or an array of small related ones. */
    const plugins: (PluginDef | PluginDef[])[];
    export default plugins;
}
