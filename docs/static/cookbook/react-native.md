# React Native

When using React Native, many of the built-in cryptographic primitives can be replaced by native, substantially faster implementations.

This should be available in its own package in the future, but for now this is highly recommended, and requires installing the [Quick Crypto](https://www.npmjs.com/package/react-native-quick-crypto) package.

```js
import { quais } from 'quais';

import crypto from 'react-native-quick-crypto';

quais.randomBytes.register((length) => {
    return new Uint8Array(crypto.randomBytes(length));
});

quais.computeHmac.register((algo, key, data) => {
    return crypto.createHmac(algo, key).update(data).digest();
});

quais.pbkdf2.register((passwd, salt, iter, keylen, algo) => {
    return crypto.pbkdf2Sync(passwd, salt, iter, keylen, algo);
});

quais.sha256.register((data) => {
    return crypto.createHash('sha256').update(data).digest();
});

quais.sha512.register((data) => {
    return crypto.createHash('sha512').update(data).digest();
});
```
