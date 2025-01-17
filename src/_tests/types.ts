export type TestCaseAbiVerbose =
    | {
          type: 'address' | 'hexstring' | 'number' | 'string';
          value: string;
      }
    | {
          type: 'boolean';
          value: boolean;
      }
    | {
          type: 'array';
          value: Array<TestCaseAbiVerbose>;
      }
    | {
          type: 'object';
          value: Array<TestCaseAbiVerbose>;
      };

export interface TestCaseAbi {
    name: string;
    type: string;
    value: any;
    verbose: TestCaseAbiVerbose;
    bytecode: string;
    encoded: string;
}

/////////////////////////////
// address

export interface TestCaseAccount {
    name: string;
    privateKey: string;
    address: string;
    icap: string;
}

export type TestCaseCreate = {
    sender: string;
    creates: Array<{
        name: string;
        nonce: number;
        data: string;
        address: string;
    }>;
};

export type TestCaseCreate2 = {
    sender: string;
    creates: Array<{
        name: string;
        salt: string;
        initCode: string;
        initCodeHash: string;
        address: string;
    }>;
};

/////////////////////////////
// crypto

export interface TestCaseHash {
    name: string;
    data: string;
    sha256: string;
    sha512: string;
    ripemd160: string;
    keccak256: string;
}

export interface TestCasePbkdf {
    name: string;
    password: string;
    salt: string;
    dkLen: number;
    pbkdf2: {
        iterations: number;
        algorithm: 'sha256' | 'sha512';
        key: string;
    };
    scrypt: {
        N: number;
        r: number;
        p: number;
        key: string;
    };
}

export interface TestCaseHmac {
    name: string;
    data: string;
    key: string;
    algorithm: 'sha256' | 'sha512';
    hmac: string;
}

/////////////////////////////
// hash

export interface TestCaseHash {
    name: string;
    data: string;
    sha256: string;
    sha512: string;
    ripemd160: string;
    keccak256: string;
}

export interface TestCaseTypedDataDomain {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: string;
}

export interface TestCaseTypedDataType {
    name: string;
    type: string;
}

export interface TestCaseTypedData {
    name: string;

    domain: TestCaseTypedDataDomain;
    primaryType: string;
    types: Record<string, Array<TestCaseTypedDataType>>;
    data: any;

    encoded: string;
    digest: string;

    privateKey?: string;
    signature?: string;
}

export interface TestCaseSolidityHash {
    name: string;
    types: Array<string>;
    keccak256: string;
    ripemd160: string;
    sha256: string;
    values: Array<any>;
}

/////////////////////////////
// rlp

export interface TestCaseUnit {
    name: string;
    wei: string;
    quais: string;
    ether_format: string;

    kwei?: string;
    mwei?: string;
    gwei?: string;
    szabo?: string;
    finney?: string;
    finney_format?: string;
    szabo_format?: string;
    gwei_format?: string;
    mwei_format?: string;
    kwei_format?: string;
}

export type NestedHexString = string | Array<string | NestedHexString>;

export interface TestCaseRlp {
    name: string;
    encoded: string;
    decoded: NestedHexString;
}

/////////////////////////////
// transaction

export interface TestCaseTransactionTx {
    to?: string;
    from: string;
    nonce?: number;
    gasLimit?: string;
    gasPrice?: string;

    data?: string;
    value?: string;

    accessList?: Array<{ address: string; storageKeys: Array<string> }>;

    chainId?: string;
}

export interface TestCaseTransactionSig {
    r: string;
    s: string;
    v: string;
}

export interface TestCaseTransaction {
    name: string;
    transaction: TestCaseTransactionTx;
    privateKey: string;

    unsigned: string;
    signed: string;

    signature: TestCaseTransactionSig;
}

/////////////////////////////
// wallet

export interface TestCaseMnemonicNode {
    path: string;
    chainCode: string;
    depth: number;
    index: number;
    parentFingerprint: string;
    fingerprint: string;
    publicKey: string;
    privateKey: string;
    xpriv: string;
    xpub: string;
}

export interface TestCaseMnemonic {
    name: string;
    phrase: string;
    phraseHash: string;
    password: string;
    locale: string;
    entropy: string;
    seed: string;
    nodes: Array<TestCaseMnemonicNode>;
}

export interface TestCaseWallet {
    name: string;
    filename: string;
    type: string;
    address: string;
    password: string;
    content: string;
}

/////////////////////////////
// wordlists

export interface TestCaseWordlist {
    name: string;
    filename: string;
    locale: string;
    content: string;
}

/////////////////////////////
// zones

export enum Zone {
    Cyprus1 = '0x00',
    Cyprus2 = '0x01',
    Cyprus3 = '0x02',
    Paxos1 = '0x10',
    Paxos2 = '0x11',
    Paxos3 = '0x12',
    Hydra1 = '0x20',
    Hydra2 = '0x21',
    Hydra3 = '0x22',
}

/////////////////////////////
// HDWallets

export interface AddrParams {
    account: number;
    zone: Zone;
}
export interface AddressInfo {
    pubKey: string;
    address: string;
    account: number;
    index: number;
    zone: Zone;
}

export interface TestCaseQuaiTransaction {
    name: string;
    mnemonic: string;
    params: AddrParams;
    transaction: TestCaseTransactionTx;
    privateKey: string;
    signed: string;
}

export interface TestCaseQuaiTypedData {
    name: string;
    mnemonic: string;
    domain: TestCaseTypedDataDomain;
    types: Record<string, Array<TestCaseTypedDataType>>;
    data: any;
    digest: string;
    signature: string;
}

export interface TestCaseQuaiMessageSign {
    name: string;
    mnemonic: string;
    message: string;
    digest: string;
    signature: string;
}

export interface TxInput {
    txhash: string;
    index: number;
    pubkey: string;
}

export interface TxOutput {
    address: string;
    denomination: number;
}
export interface outpointInfo {
    outpoint: {
        txhash: string;
        index: number;
        denomination: number;
    };
    address: string;
    zone: Zone;
}

export interface TestCaseQiTransaction {
    name: string;
    mnemonic: string;
    params: Array<AddrParams>;
    outpoints: Array<outpointInfo>;
    transaction: {
        chainId: number;
        txInputs: Array<TxInput>;
        txOutputs: Array<TxOutput>;
    };
    signed: string;
}
