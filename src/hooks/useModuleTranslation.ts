/**
 * useModuleTranslation — MediaTestModule
 *
 * Returns the translations object for the current language.
 * Language comes from props.context.lang (set by the host shell).
 * Defaults to 'en' when not provided.
 *
 * Usage:
 *   const t = useModuleTranslation(context.lang);
 *   return <h1>{t.title}</h1>;
 */

import { translations as en } from '../locales/en.js';
import { translations as pl } from '../locales/pl.js';

type Lang = 'en' | 'pl';

export function useModuleTranslation(lang: Lang = 'en') {
    return lang === 'pl' ? pl : en;
}
