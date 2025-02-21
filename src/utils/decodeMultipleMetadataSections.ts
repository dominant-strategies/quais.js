import { splitAuxdata, AuxdataStyle } from '@ethereum-sourcify/bytecode-utils';
import { arrayify } from '@ethersproject/bytes';

export const decodeMultipleMetadataSections = async (bytecode: string): Promise<Array<any>> => {
    const CBOR = await import('cbor-x');
    const { default: bs58 } = await import('bs58');

    if (!bytecode || bytecode.length === 0) {
        throw new Error('Bytecode cannot be empty');
    }

    const metadataSections = [];
    let remainingBytecode = bytecode;

    while (remainingBytecode.length > 0) {
        try {
            const [executionBytecode, auxdata] = splitAuxdata(remainingBytecode, AuxdataStyle.SOLIDITY);

            if (auxdata) {
                const decodedMetadata = CBOR.decode(arrayify(`0x${auxdata}`));
                metadataSections.push(decodedMetadata);
                remainingBytecode = executionBytecode;
            } else {
                break;
            }
        } catch (error: any) {
            console.error('Failed to decode metadata section:', error);
            break;
        }
    }

    return metadataSections.map((metadata) => ({
        ...metadata,
        ipfs: metadata.ipfs ? bs58.encode(metadata.ipfs) : undefined,
    }));
};
