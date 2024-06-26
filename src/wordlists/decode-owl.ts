import { assertArgument } from '../utils/index.js';

const subsChrs = " !#$%&'()*+,-./<=>?@[]^_`{|}~";
const Word = /^[a-z]*$/i;

function unfold(words: Array<string>, sep: string): Array<string> {
    let initial = 97;
    return words.reduce(
        (accum, word) => {
            if (word === sep) {
                initial++;
            } else if (word.match(Word)) {
                accum.push(String.fromCharCode(initial) + word);
            } else {
                initial = 97;
                accum.push(word);
            }
            return accum;
        },
        <Array<string>>[],
    );
}

/**
 * @ignore
 */
export function decode(data: string, subs: string): Array<string> {
    // Replace all the substitutions with their expanded form
    for (let i = subsChrs.length - 1; i >= 0; i--) {
        data = data.split(subsChrs[i]).join(subs.substring(2 * i, 2 * i + 2));
    }

    // Get all tle clumps; each suffix, first-increment and second-increment
    const clumps: Array<string> = [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const leftover = data.replace(/(:|([0-9])|([A-Z][a-z]*))/g, (all, item, semi, word) => {
        if (semi) {
            for (let i = parseInt(semi); i >= 0; i--) {
                clumps.push(';');
            }
        } else {
            clumps.push(item.toLowerCase());
        }
        return '';
    });
    /* c8 ignore start */
    if (leftover) {
        throw new Error(`leftovers: ${JSON.stringify(leftover)}`);
    }
    /* c8 ignore stop */

    return unfold(unfold(clumps, ';'), ':');
}

/**
 * @ignore
 */
export function decodeOwl(data: string): Array<string> {
    assertArgument(data[0] === '0', 'unsupported auwl data', 'data', data);

    return decode(data.substring(1 + 2 * subsChrs.length), data.substring(1, 1 + 2 * subsChrs.length));
}
