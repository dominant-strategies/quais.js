import { WordlistOwl } from './wordlist-owl.js';
import { decodeOwlA } from './decode-owla.js';

/**
 * An OWL-A format Wordlist extends the OWL format to add an overlay onto an OWL format Wordlist to support diacritic
 * marks.
 *
 * This class is generally not useful to most developers as it is used mainly internally to keep Wordlists for languages
 * based on latin-1 small.
 *
 * If necessary, there are tools within the `generation/` folder to create the necessary data.
 *
 * @category Wordlists
 */
export class WordlistOwlA extends WordlistOwl {
    #accent: string;

    /**
     * Creates a new Wordlist for `locale` using the OWLA `data` and `accent` data and validated against the `checksum`.
     */
    constructor(locale: string, data: string, accent: string, checksum: string) {
        super(locale, data, checksum);
        this.#accent = accent;
    }

    /**
     * The OWLA-encoded accent data.
     *
     * @ignore
     */
    get _accent(): string {
        return this.#accent;
    }

    /**
     * Decode all the words for the wordlist.
     *
     * @ignore
     */
    _decodeWords(): Array<string> {
        return decodeOwlA(this._data, this._accent);
    }
}
