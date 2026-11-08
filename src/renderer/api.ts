/*
 * Everything a plugin needs, in one import:
 *   import { definePlugin, net, ui, common, patcher, webpack } from "@api";
 * The same things are on window.Vanta for imported (.js) plugins.
 */
export { watchElements } from "./core/dom";
export { storage } from "./core/storage";
export { onFlux } from "./core/flux";
export { messageFromElement, messageIdsFromElement, messageLink, copyText, SEND_URL, SEND_OR_EDIT_URL } from "./core/messages";
export { definePlugin, cssPlugin, plugins, isPluginEnabled, setPluginEnabled, type PluginDef, type PluginInstance, type PluginOption } from "./core/plugins";
export { webpack, filters } from "./core/webpack";
export { patcher } from "./core/patcher";
export { net, type NetRequest } from "./core/net";
export { common } from "./core/common";
export { native, cleanError } from "./core/native";
export { settings, saveSettings } from "./core/settings";
export { quickCss } from "./core/quickCss";
export { logger, makeLogger, type Logger } from "./core/logger";
export { onDomReady, sleep, managedStyle, escapeRegExp } from "./core/utils";
export { ui, h } from "./ui/components";
export { themes } from "./themes";
