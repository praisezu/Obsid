/** Injected at build time by scripts/build.mjs */
declare const __OBSID_VERSION__: string;
declare const __OBSID_REPO__: string;

declare module "~plugins" {
    import type { PluginDef } from "./renderer/core/plugins";
    const plugins: PluginDef[];
    export default plugins;
}
