// Stand-ins for Vanta's core modules, so pure logic can be tested in Node without Discord.
export const native: any = {
    aiKeys: async () => ({ claude: false, nvidia: false }),
    aiChat: async () => "",
    fetchText: async () => "",
    voiceSpeak: async () => ({ audio: new Float32Array(0), rate: 24000 }),
    info: { version: "0.0.0", safeMode: false },
};
export const cleanError = (e: unknown) => String((e as Error)?.message ?? e);
export const settings: any = { plugins: {}, vanta: {}, themes: { enabled: [], online: [] }, pluginSources: {} };
export const saveSettings = () => { };
export const saveSettingsNow = async () => { };
export const find = (_f?: any): any => null;
export const findAll = (_f?: any): any[] => [];
export const findByProps = (..._p: string[]): any => null;
export const findByCode = (..._c: string[]): any => null;
export const findStore = (_n: string): any => null;
export const waitFor = async () => null;
export const ready = Promise.resolve();
export const filters = {};
export const webpack = { find, findAll, findByProps, findByCode, findStore, waitFor, ready, filters };
/** Tests fill this in with fake Discord stores */
export const common: any = {};
