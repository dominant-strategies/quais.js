import { getAddress, isAddress } from '../address/index.js';
import type { TypedDataDomain, TypedDataField } from '../hash/index.js';
export type SafeAddress = `0x${string}`;
export type SafeHex = `0x${string}`;
export interface SafeCall {
    target: SafeAddress;
    value: bigint;
    data: SafeHex;
}
export interface SafeTypedRequest {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    value: Record<string, unknown>;
}
export function address(value: string): SafeAddress {
    if (!isAddress(value) || BigInt(value) === 0n) throw Error('Expected a nonzero, valid address');
    return getAddress(value) as SafeAddress;
}
export function isCyprus1Quai(value: string): boolean {
    return isAddress(value) && BigInt(value) !== 0n && BigInt(value) >> 151n === 0n;
}
