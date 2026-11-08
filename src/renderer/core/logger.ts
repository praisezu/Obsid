export interface Logger {
    log(...a: unknown[]): void;
    warn(...a: unknown[]): void;
    error(...a: unknown[]): void;
}

export function makeLogger(tag?: string): Logger {
    const style = "color:#a78bfa;font-weight:bold";
    const prefix = tag ? `[Vanta:${tag}]` : "[Vanta]";
    return {
        log: (...a) => console.log(`%c${prefix}`, style, ...a),
        warn: (...a) => console.warn(`%c${prefix}`, style, ...a),
        error: (...a) => console.error(`%c${prefix}`, style, ...a),
    };
}

export const logger = makeLogger();
