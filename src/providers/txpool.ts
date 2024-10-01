/*
    "pending": {
      "0x1dbbB54b402E725aD96fEc342AF5150a1560D4c7": {
        "855": {
          "blockHash": null,
          "blockNumber": null,
          "from": "0x0004754b0bda885565558ad25b5015bbbb1b16fa",
          "gas": "0xa410",
          "gasPrice": "0x77359404",
          "minerTip": "0x3b9aca00",
          "hash": "0x60185d6a221b9192c673a6ba72c1f25578a007e9252528484f772375d7e7feb6",
          "input": "0x",
          "nonce": "0x357",
          "to": "0x144876b258060cc918d5424f8ca5e496b6f64e3e",
          "transactionIndex": null,
          "value": "0x2c",
          "type": "0x0",
          "accessList": [],
          "chainId": "0x2328",
          "v": "0x1",
          "r": "0xa2e91b62889191bb5bc0760cb166225372ac05b6ec0db9d11bc8cf621fc47183",
          "s": "0x96bf297045e6e9439947bc8f1b30abe4bc5db1e11a044acb4e6660926ae11b7"
        }
      }
    },
    "queued": {
      "0x1dbe6AB96F7fe24634E382FD0e2F17Ddcb0C7A7f": {
        "12": {
          "blockHash": null,
          "blockNumber": null,
          "from": "0x1ad5848c5ae71b41b3fad701e681533daf6c4bb8",
          "gas": "0xa410",
          "gasPrice": "0x77359404",
          "minerTip": "0x3b9aca00",
          "hash": "0x00ada01e75ff2f7dee4902190e244c187860c7f4c2f245f825b662c0ab37c322",
          "input": "0x",
          "nonce": "0x355",
          "to": "0x14c74e8f1ed32f591f5c99d7a8477c6ca15e5563",
          "transactionIndex": null,
          "value": "0x4e",
          "type": "0x0",
          "accessList": [],
          "chainId": "0x2328",
          "v": "0x1",
          "r": "0x5525b0d23626b63093a0fcdb060d1caccae856141e412bee39c5baae366d7e2",
          "s": "0x6353efaf28c4cc86de452e9e2269ace1da411bf9ced003373f69223be0153fe4"
        }
      }
    }
*/

export type txpoolContentResponse = {
    pending: {
        [address: string]: {
            [nonce: string]: {
                blockHash: string | null;
                blockNumber: string | null;
                from: string;
                gas: string;
                gasPrice: string;
                minerTip: string;
                hash: string;
                input: string;
                nonce: string;
                to: string;
                transactionIndex: string | null;
                value: string;
                type: string;
                accessList: Array<any>;
                chainId: string;
                v: string;
                r: string;
                s: string;
            };
        };
    };
    queued: {
        [address: string]: {
            [nonce: string]: {
                blockHash: string | null;
                blockNumber: string | null;
                from: string;
                gas: string;
                gasPrice: string;
                minerTip: string;
                hash: string;
                input: string;
                nonce: string;
                to: string;
                transactionIndex: string | null;
                value: string;
                type: string;
                accessList: Array<any>;
                chainId: string;
                v: string;
                r: string;
                s: string;
            };
        };
    };
};

/*
        "pending": {
            "0x002a8cf994379232561556Da89C148eeec9539cd": {
                "2": "contract creation: 0 wei + 4200000 gas × 300000000000 wei",
                "3": "0x005E209B9214aC529191BFDfF8deA862f2DFE1ea: 200000000000000000 wei + 4200000 gas × 300000000000 wei"
            },
            "0x0033D6534AcA0B8a344aA5597133c15DFe787F97": {
                "3": "contract creation: 0 wei + 4200000 gas × 3000000000000 wei"
            }
        },
        "queued": {}
*/

export type txpoolInspectResponse = {
    pending: {
        [address: string]: {
            [nonce: string]: string;
        };
    };
    queued: {
        [address: string]: {
            [nonce: string]: string;
        };
    };
};
