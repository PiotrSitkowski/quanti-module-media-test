/**
 * MediaTestModule — Locales Index
 *
 * Lazy-loaded locale files. The host shell provides the current language
 * via props.context.lang — modules are consumers, never setters.
 */

export type TranslationKeys = typeof import('./en.js').translations;

export const locales = {
    en: () => import('./en.js'),
    pl: () => import('./pl.js'),
};
