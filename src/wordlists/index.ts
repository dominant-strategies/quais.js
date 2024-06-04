/**
 * A Wordlist is a set of 2048 words used to encode private keys (or other binary data) that is easier for humans to
 * write down, transcribe and dictate.
 *
 * The [BIP-39](https://en.bitcoin.it/wiki/BIP_0039) standard includes several checksum bits, depending on the size of
 * the mnemonic phrase.
 *
 * A mnemonic phrase may be 12, 15, 18, 21 or 24 words long. For most purposes 12 word mnemonics should be used, as
 * including additional words increases the difficulty and potential for mistakes and does not offer any effective
 * improvement on security.
 *
 * There are a variety of [BIP-39 Wordlists](https://github.com/bitcoin/bips/blob/master/bip-0039/bip-0039-wordlists.md)
 * for different languages, but for maximal compatibility, the [English Wordlist](LangEn) is recommended.
 */
export { Wordlist } from './wordlist.js';
export { LangEn } from './lang-en.js';
export { LangEs } from './lang-es.js';

export { WordlistOwl } from './wordlist-owl.js';
export { WordlistOwlA } from './wordlist-owla.js';

export { wordlists } from './wordlists.js';
