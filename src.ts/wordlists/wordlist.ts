import { defineProperties } from "../utils/index.js";

/**
 *  A Wordlist represents a collection of language-specific
 *  words used to encode and devoce [BIP-39](https://en.bitcoin.it/wiki/BIP_0039) encoded data
 *  by mapping words to 11-bit values and vice versa.
 * 
 *  @category Wordlists
 */
export abstract class Wordlist {
    locale!: string;

    /**
     *  Creates a new Wordlist instance.
     *
     *  Sub-classes MUST call this if they provide their own constructor,
     *  passing in the locale string of the language.
     *
     *  Generally there is no need to create instances of a Wordlist,
     *  since each language-specific Wordlist creates an instance and
     *  there is no state kept internally, so they are safe to share.
     */
    constructor(locale: string) {
        defineProperties<Wordlist>(this, { locale });
    }

    /**
     *  Sub-classes may override this to provide a language-specific
     *  method for spliting `phrase` into individual words.
     *
     *  By default, `phrase` is split using any sequences of
     *  white-space as defined by regular expressions (i.e. `/\s+/`).
     * 
     *  @param {string} phrase - The phrase to split.
     *  @returns {Array<string>} The split words in the phrase.
     */
    split(phrase: string): Array<string> {
        return phrase.toLowerCase().split(/\s+/g)
    }

    /**
     *  Sub-classes may override this to provider a language-specific
     *  method for joining `words` into a phrase.
     *
     *  By default, `words` are joined by a single space.
     * 
     *  @param {Array<string>} words - The words to join.
     *  @returns {string} The joined phrase.
     */
    join(words: Array<string>): string {
        return words.join(" ");
    }

    /**
     *  Maps an 11-bit value into its coresponding word in the list.
     *
     *  Sub-classes MUST override this.
     */
    abstract getWord(index: number): string;

    /**
     *  Maps a word to its corresponding 11-bit value.
     *
     *  Sub-classes MUST override this.
     */
    abstract getWordIndex(word: string): number;
}
