/**
 * Public, opt-in reference for the confirmed Quai mainnet Safe deployment. Addresses remain inputs to Safe helpers;
 * importing this module does not select a deployment or open a network connection.
 */
export const QUAI_SAFE_MAINNET_V5 = {
    version: 5,
    mode: 'quai-mainnet',
    chainId: '9',
    deploymentStatus: 'confirmed',
    factory: '0x000Bc4389f61f2D14640998598016B4eb61aAE55',
    factoryCodeHash: '0x1fa056fbb78fa885561f63ad90ddefa7f3347a7482ce223e1b58a6f3e28f67b6',
    safe: {
        version: '1.4.1',
        profile: 'quai-receive-v1',
        singleton: '0x000D12E41552467e77C6396489293C296052f61C',
        fallbackHandler: '0x00271147Cf2C690987531aBe1eE0687869168772',
        multiSendCallOnly: '0x003e3E3d021b11eBB1c77D9314DfaEF0B68D2198',
    },
} as const;
