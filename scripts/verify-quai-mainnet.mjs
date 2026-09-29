import { JsonRpcProvider, keccak256 } from '../lib/esm/index.js';
import {
    QUAI_SAFE_MAINNET_V5,
    QUAI_SAFE_PROXY_CREATION_CODE,
    QUAI_SAFE_RUNTIME_HASHES,
    safeFactoryInterface,
    verifySafeDeployment,
} from '../lib/esm/smart-account/index.js';

const manifest = QUAI_SAFE_MAINNET_V5;
if (manifest.factoryCodeHash !== QUAI_SAFE_RUNTIME_HASHES.QuaiSafeProxyFactory) {
    throw new Error('The deployment manifest and pinned factory artifact disagree');
}

const rpc = new JsonRpcProvider(process.env.QUAI_RPC_URL || 'https://rpc.quai.network', undefined, {
    usePathing: true,
});
const timeout = setTimeout(() => {
    rpc.destroy();
    console.error('Quai mainnet verification timed out');
    process.exit(1);
}, 60000);

try {
    if ((await rpc.getNetwork()).chainId !== 9n) throw new Error('Unexpected chain ID');
    const reader = {
        code: (target) => rpc.getCode(target),
        call: (target, data) => rpc.call({
            from: '0x000C890Ba0aaE9B69EBFf8fAd1303391a9954917',
            to: target,
            data,
        }),
    };
    await verifySafeDeployment(reader, manifest.factory, manifest.safe);

    const factoryHash = keccak256(await reader.code(manifest.factory));
    if (factoryHash !== manifest.factoryCodeHash) throw new Error('Factory runtime mismatch');
    const encoded = safeFactoryInterface.encodeFunctionData('proxyCreationCode');
    const result = await reader.call(manifest.factory, encoded);
    const [creationCode] = safeFactoryInterface.decodeFunctionResult('proxyCreationCode', result);
    if (String(creationCode).toLowerCase() !== QUAI_SAFE_PROXY_CREATION_CODE.toLowerCase()) {
        throw new Error('Factory proxy creation code mismatch');
    }

    console.log(JSON.stringify({
        verified: true,
        chainId: manifest.chainId,
        factory: manifest.factory,
        factoryHash,
        proxyCreationCodeHash: keccak256(creationCode),
        proxyRuntimeHash: QUAI_SAFE_RUNTIME_HASHES.QuaiSafeProxy,
    }, null, 2));
} finally {
    clearTimeout(timeout);
    rpc.destroy();
}
