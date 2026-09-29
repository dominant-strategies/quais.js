import { AbiCoder, Interface } from '../abi/index.js';
import { Signature, keccak256 } from '../crypto/index.js';
import {
    TypedDataEncoder,
    solidityPacked,
    solidityPackedKeccak256,
    verifyMessage,
    verifyTypedData,
} from '../hash/index.js';
import { ZeroAddress } from '../constants/index.js';
import { getCreate2Address } from '../address/index.js';
import { concat, getBytes, hexlify, toBeHex } from '../utils/index.js';
import {
    address,
    isCyprus1Quai,
    type SafeAddress as Address,
    type SafeCall as Call,
    type SafeHex as Hex,
    type SafeTypedRequest as TypedRequest,
} from './safe-types.js';
export type { SafeAddress, SafeCall, SafeHex, SafeTypedRequest } from './safe-types.js';
import { SAFE_PROXY_CREATION_CODE, SAFE_RUNTIME_HASHES } from './safe-artifacts.js';
import { QUAI_SAFE_PROFILE, QUAI_SAFE_PROXY_CREATION_CODE, QUAI_SAFE_RUNTIME_HASHES } from './quai-safe-artifacts.js';
export { SAFE_RUNTIME_HASHES, SAFE_VERSION } from './safe-artifacts.js';
export { QUAI_SAFE_PROFILE, QUAI_SAFE_PROXY_CREATION_CODE, QUAI_SAFE_RUNTIME_HASHES } from './quai-safe-artifacts.js';

export const SAFE_ABI = [
    'function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)',
    'function getOwners() view returns(address[])',
    'function getThreshold() view returns(uint256)',
    'function nonce() view returns(uint256)',
    'function getModulesPaginated(address start,uint256 pageSize) view returns(address[] array,address next)',
    'function getStorageAt(uint256 offset,uint256 length) view returns(bytes)',
    'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns(bool success)',
    'function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns(bytes32)',
    'function isValidSignature(bytes32 hash,bytes signature) view returns(bytes4)',
    'event SafeReceived(address indexed sender,uint256 value)',
    'event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)',
    'event ExecutionFailure(bytes32 indexed txHash,uint256 payment)',
] as const;
export const SAFE_FACTORY_ABI = [
    'function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns(address proxy)',
    'function proxyCreationCode() pure returns(bytes)',
    'event ProxyCreation(address indexed proxy,address singleton)',
] as const;
export const safeInterface = new Interface(SAFE_ABI);
export const safeFactoryInterface = new Interface(SAFE_FACTORY_ABI);
const multiSendInterface = new Interface(['function multiSend(bytes transactions) payable']);
export interface SafeDeployment {
    version?: '1.4.1';
    profile?: 'upstream' | typeof QUAI_SAFE_PROFILE;
    singleton: Address;
    fallbackHandler: Address;
    multiSendCallOnly: Address;
}
function safeProxyArtifacts(deployment: SafeDeployment) {
    if (deployment.profile === QUAI_SAFE_PROFILE)
        return {
            creationCode: QUAI_SAFE_PROXY_CREATION_CODE,
            proxyRuntimeHash: QUAI_SAFE_RUNTIME_HASHES.QuaiSafeProxy,
            factoryRuntimeHash: QUAI_SAFE_RUNTIME_HASHES.QuaiSafeProxyFactory,
        } as const;
    if (deployment.profile !== undefined && deployment.profile !== 'upstream')
        throw Error('Unsupported Safe proxy profile');
    return {
        creationCode: SAFE_PROXY_CREATION_CODE,
        proxyRuntimeHash: SAFE_RUNTIME_HASHES.SafeProxy,
        factoryRuntimeHash: SAFE_RUNTIME_HASHES.SafeProxyFactory,
    } as const;
}
export interface SafeTransaction {
    to: Address;
    value: bigint;
    data: Hex;
    operation: number;
    safeTxGas: bigint;
    baseGas: bigint;
    gasPrice: bigint;
    gasToken: string;
    refundReceiver: string;
    nonce: bigint;
}
export const SAFE_TX_TYPES = {
    SafeTx: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce', type: 'uint256' },
    ],
};
export function safeDomain(chainId: bigint, account: Address) {
    if (chainId <= 0n || chainId >= 2n ** 256n) throw Error('Invalid Safe chain ID');
    return { chainId, verifyingContract: address(account) };
}
export function safeInitializer(owner: Address, deployment: SafeDeployment): Hex {
    return safeInterface.encodeFunctionData('setup', [
        [address(owner)],
        1n,
        ZeroAddress,
        '0x',
        address(deployment.fallbackHandler),
        ZeroAddress,
        0n,
        ZeroAddress,
    ]) as Hex;
}
/**
 * Pure discovery: standard upstream initializer and salt, no registry or server-selected owner.
 */
export function predictSafe(factory: Address, owner: Address, deployment: SafeDeployment, saltNonce: bigint): Address {
    if (saltNonce < 0n || saltNonce >= 2n ** 256n) throw Error('Invalid Safe salt nonce');
    const initializer = safeInitializer(owner, deployment);
    const salt = solidityPackedKeccak256(['bytes32', 'uint256'], [keccak256(initializer), saltNonce]);
    const initCode = concat([
        safeProxyArtifacts(deployment).creationCode,
        AbiCoder.defaultAbiCoder().encode(['address'], [address(deployment.singleton)]),
    ]);
    return address(getCreate2Address(address(factory), salt, keccak256(initCode)));
}
export function findSafe(
    factory: Address,
    owner: Address,
    deployment: SafeDeployment,
    start = 0n,
    maxAttempts = 20000,
) {
    if (start < 0n || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 1000000)
        throw Error('Invalid Safe search bounds');
    for (let i = 0; i < maxAttempts; i++) {
        const saltNonce = start + BigInt(i);
        const account = predictSafe(factory, owner, deployment, saltNonce);
        if (isCyprus1Quai(account))
            return {
                account,
                saltNonce,
                initializer: safeInitializer(owner, deployment),
            };
    }
    throw Error('No Cyprus-1 Safe address within search bounds');
}
export function encodeSafeCreate(owner: Address, factory: Address, deployment: SafeDeployment): Hex {
    const predicted = findSafe(factory, owner, deployment);
    return safeFactoryInterface.encodeFunctionData('createProxyWithNonce', [
        deployment.singleton,
        predicted.initializer,
        predicted.saltNonce,
    ]) as Hex;
}
function validCall(call: Call) {
    address(call.target);
    if (call.value < 0n || call.value >= 2n ** 256n || !/^0x(?:[a-fA-F0-9]{2})*$/.test(call.data))
        throw Error('Invalid Safe call');
}
/**
 * Calls only; the sole delegatecall is to the pinned upstream MultiSendCallOnly.
 */
export function safeTransaction(calls: readonly Call[], nonce: bigint, multiSendCallOnly?: Address): SafeTransaction {
    if (!calls.length || calls.length > 16 || nonce < 0n || nonce >= 2n ** 256n)
        throw Error('Invalid Safe calls or nonce');
    calls.forEach(validCall);
    let to = calls[0]!.target,
        value = calls[0]!.value,
        data = calls[0]!.data,
        operation = 0;
    if (calls.length > 1) {
        if (!multiSendCallOnly) throw Error('Verified MultiSendCallOnly deployment required');
        to = address(multiSendCallOnly);
        value = 0n;
        operation = 1;
        const transactions = concat(
            calls.map((c) =>
                solidityPacked(
                    ['uint8', 'address', 'uint256', 'uint256', 'bytes'],
                    [0, c.target, c.value, getBytes(c.data).length, c.data],
                ),
            ),
        );
        data = multiSendInterface.encodeFunctionData('multiSend', [transactions]) as Hex;
    }
    return {
        to,
        value,
        data,
        operation,
        safeTxGas: 0n,
        baseGas: 0n,
        gasPrice: 0n,
        gasToken: ZeroAddress,
        refundReceiver: ZeroAddress,
        nonce,
    };
}
export function safeRequest(
    chainId: bigint,
    account: Address,
    calls: readonly Call[],
    nonce: bigint,
    multiSendCallOnly?: Address,
): TypedRequest {
    return {
        domain: safeDomain(chainId, account),
        types: SAFE_TX_TYPES,
        value: { ...safeTransaction(calls, nonce, multiSendCallOnly) },
    };
}
export function encodeSafeExecute(request: TypedRequest, signatures: string): Hex {
    if (TypedDataEncoder.from(request.types).primaryType !== 'SafeTx')
        throw Error('Expected upstream SafeTx authorization');
    const v = request.value;
    return safeInterface.encodeFunctionData('execTransaction', [
        v.to,
        v.value,
        v.data,
        v.operation,
        v.safeTxGas,
        v.baseGas,
        v.gasPrice,
        v.gasToken,
        v.refundReceiver,
        signatures,
    ]) as Hex;
}
/**
 * Safe's documented eth_sign/personal_sign mode; signed bytes are the chain/account-bound hash.
 */
export function safePersonalSignature(signature: string): Hex {
    const s = Signature.from(signature);
    return concat([s.r, s.s, toBeHex(s.v + 4, 1)]) as Hex;
}
export function safeSigner(request: TypedRequest, signature: string): Address {
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw Error('Expected one Safe owner signature');
    const v = Number.parseInt(signature.slice(-2), 16);
    if (v === 31 || v === 32) {
        const normalized = signature.slice(0, -2) + (v - 4).toString(16);
        return address(
            verifyMessage(getBytes(TypedDataEncoder.hash(request.domain, request.types, request.value)), normalized),
        );
    }
    if (v !== 27 && v !== 28) throw Error('Unsupported Safe signature mode');
    return address(verifyTypedData(request.domain, request.types, request.value, signature));
}
/**
 * Decode and bound exactly the sponsored subset, never arbitrary delegatecalls or refunds.
 */
export function decodeSponsoredSafe(data: Hex, nonce: bigint, multiSendCallOnly: Address) {
    const decoded = safeInterface.parseTransaction({ data });
    if (
        !decoded ||
        decoded.name !== 'execTransaction' ||
        safeInterface.encodeFunctionData(decoded.fragment, decoded.args).toLowerCase() !== data.toLowerCase()
    )
        throw Error('NON_CANONICAL_CALL');
    const a = decoded.args;
    if ([4, 5, 6].some((i) => a[i] !== 0n) || a[7] !== ZeroAddress || a[8] !== ZeroAddress)
        throw Error('UNAPPROVED_SAFE_REIMBURSEMENT');
    const transaction: SafeTransaction = {
        to: address(a[0]),
        value: a[1],
        data: a[2],
        operation: Number(a[3]),
        safeTxGas: a[4],
        baseGas: a[5],
        gasPrice: a[6],
        gasToken: a[7],
        refundReceiver: a[8],
        nonce,
    };
    let calls: Call[];
    if (transaction.operation === 0)
        calls = [
            {
                target: transaction.to,
                value: transaction.value,
                data: transaction.data,
            },
        ];
    else {
        if (transaction.operation !== 1 || transaction.to !== address(multiSendCallOnly) || transaction.value !== 0n)
            throw Error('UNSUPPORTED_SAFE_DELEGATECALL');
        const inner = multiSendInterface.parseTransaction({
            data: transaction.data,
        });
        if (
            !inner ||
            multiSendInterface.encodeFunctionData(inner.fragment, inner.args).toLowerCase() !==
                transaction.data.toLowerCase()
        )
            throw Error('NON_CANONICAL_BATCH');
        const bytes = getBytes(inner.args[0]);
        calls = [];
        for (let offset = 0; offset < bytes.length; ) {
            if (calls.length >= 16 || bytes.length - offset < 85 || bytes[offset] !== 0)
                throw Error('INVALID_SAFE_BATCH');
            const target = address(hexlify(bytes.slice(offset + 1, offset + 21)));
            const value = BigInt(hexlify(bytes.slice(offset + 21, offset + 53)));
            const length = BigInt(hexlify(bytes.slice(offset + 53, offset + 85)));
            offset += 85;
            if (length > BigInt(bytes.length - offset)) throw Error('INVALID_SAFE_BATCH');
            calls.push({
                target,
                value,
                data: hexlify(bytes.slice(offset, offset + Number(length))) as Hex,
            });
            offset += Number(length);
        }
        if (calls.length < 2) throw Error('NON_CANONICAL_BATCH');
    }
    return { transaction, calls, signature: String(a[9]) };
}

export interface SafeReader {
    code(target: Address): Promise<string>;
    call(target: Address, data: string): Promise<string>;
}
export async function verifySafeDeployment(reader: SafeReader, factory: Address, deployment: SafeDeployment) {
    for (const [target, hash] of [
        [factory, safeProxyArtifacts(deployment).factoryRuntimeHash],
        [deployment.singleton, SAFE_RUNTIME_HASHES.Safe],
        [deployment.fallbackHandler, SAFE_RUNTIME_HASHES.CompatibilityFallbackHandler],
        [deployment.multiSendCallOnly, SAFE_RUNTIME_HASHES.MultiSendCallOnly],
    ] as const)
        if (keccak256(await reader.code(target)) !== hash) throw Error('Safe deployment runtime mismatch');
}
const FALLBACK_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';
const GUARD_SLOT = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8';
/**
 * Fail closed on unsupported owner/module/guard changes; never infer control from deployment history.
 */
export async function verifySafeAccount(
    reader: SafeReader,
    account: Address,
    deployment: SafeDeployment,
    expectedOwner?: Address,
): Promise<Address> {
    if (keccak256(await reader.code(account)) !== safeProxyArtifacts(deployment).proxyRuntimeHash)
        throw Error('Unrecognized Safe proxy');
    const read = async (name: string, args: unknown[] = []) =>
        safeInterface.decodeFunctionResult(
            name,
            await reader.call(account, safeInterface.encodeFunctionData(name, args)),
        );
    const slot = async (offset: string | bigint) => String((await read('getStorageAt', [offset, 1]))[0]).toLowerCase();
    // Read slot zero directly through the proxy's masterCopy selector before delegating getters.
    const masterCopy = await reader.call(account, '0xa619486e');
    if (masterCopy.toLowerCase() !== toBeHex(BigInt(deployment.singleton), 32).toLowerCase())
        throw Error('Safe singleton mismatch');
    const [ownersResult, threshold, handler, guard, modules] = await Promise.all([
        read('getOwners'),
        read('getThreshold'),
        slot(FALLBACK_SLOT),
        slot(GUARD_SLOT),
        read('getModulesPaginated', ['0x0000000000000000000000000000000000000001', 1]),
    ]);
    const owners = ownersResult[0] as string[];
    if (
        owners.length !== 1 ||
        threshold[0] !== 1n ||
        handler !== toBeHex(BigInt(deployment.fallbackHandler), 32).toLowerCase() ||
        BigInt(guard) !== 0n ||
        modules[0].length !== 0 ||
        BigInt(modules[1]) !== 1n
    )
        throw Error('Unsupported Safe configuration');
    const owner = address(owners[0]!);
    if (expectedOwner && owner !== address(expectedOwner)) throw Error('Safe ownership mismatch');
    return owner;
}
/**
 * CompatibilityFallbackHandler wraps the application's digest in SafeMessage(bytes).
 */
export function safeMessageRequest(chainId: bigint, account: Address, hash: Hex): TypedRequest {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw Error('Expected application message hash');
    return {
        domain: safeDomain(chainId, account),
        types: { SafeMessage: [{ name: 'message', type: 'bytes' }] },
        value: { message: hash },
    };
}
