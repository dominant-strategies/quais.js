import { LangEn } from './lang-en.js';
import { LangEs } from './lang-es.js';

import type { Wordlist } from './wordlist.js';

export const wordlists: Record<string, Wordlist> = {
    en: LangEn.wordlist(),
    es: LangEs.wordlist(),
};
