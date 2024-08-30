# Introduction

Welcome to the `quais.js` examples repository! This collection of Node.js files is designed to help developers explore and understand the various capabilities of the `quais.js` library, which provides essential tools and utilities for working with the Quai blockchain. Whether you are deploying smart contracts, managing HD wallets, or sending and verifying transactions, these examples will guide you through practical implementations and best practices.

Our repository is a work in progress, and we are continually adding more examples to cover a wider range of use cases. Below is the current table of contents, which outlines the topics and corresponding example files. Each file includes detailed code snippets and explanations to facilitate your learning process.

We encourage you to explore the examples, experiment with the code, and reach out to us with any questions or feedback.

Happy coding!

# Table of Contents

## Providers

1. [Get Address Data](providers/get-address-data.js)

    - Create a provider
    - Get balance of a Quai or Qi address
    - Get nonce of address
    - Get code stored at a Quai address
    - Get value of a storage slot at a Quai address
    - Get outpoints of Qi address

2. [Get Chain Data](providers/get-chain-data.js)

    - Create a provider
    - Get Block data
    - Get Quai and Qi conversion rates
    - Get current protocol expansion number

3. [Query Smart Contract Events](providers/query-event.js)

    - Instantiate a contract with a simplified ABI
    - Define a filter to query events
    - Query historical events in the last 100 blocks

4. [Query Transaction Logs](providers/query-logs.js)

    - Define an arbitrary filter
    - Query logs matching the filter

5. [Subscribe to WS block events](providers/ws-subscribe-block.js)

    - Create a websocket provider
    - Subscribe to new block events
    - Handle new block events

## Signing

1. [Sign and verify transactions on the Quai Ledger](sigining/sign-verify-quai.js)

    - Build and sign a Quai transaction
    - Verify the signature of the Quai transaction

2. [Sign and verify single input transactions on the Qi Ledger (Schnorr)](signing/sign-verify-qi-schnorr.js)

    - Build and sign a Qi transaction with a single input
    - Verify the signature of the Qi transaction using Schnorr signatures

3. [Sign and verify multi input transactions on the Qi Ledger (Musig)](signing/sign-verify-qi-musig.js)

    - Build and sign a Qi transaction with multiple inputs
    - Verify the signature of the Qi transaction using MuSig

## Transactions

1. [Build and send transactions on the Quai Ledger](transactions/send-quai-tx.js)

    - Build a Quai transaction and sign it using ECDSA signatures
    - Broadcast the transaction

2. [Build and send transactions on the Qi Ledger](transactions/send-qi-tx.js)

    - Build a Qi transaction and sign it using Schnorr signatures
    - Broadcast the transaction

3. [Get transaction type](transactions/get-transaction-type.js)

    - Get the type of a transaction based on the source and destination addresses

## Utils

1. [Get Address Data](utils/get-address-data.js)

    - Get the zone of an address
    - Get the zone and ledger of an address

2. [Use Base64 encoding](utils/base64-encoding.js)

    - Base64 encode and decode data

3. [Manipulate Bytes](utils/bytes.js)

    - Convert arbitrary data to and from bytes
    - Verify byte data structures

## Wallets

1. [Managing a Quai HD Wallet](manage-quai-hdwallet.js)

    - Creating a wallet
    - Address derivation
    - HD wallet serialization and deserialization

2. [Managing a Qi HD Wallet](manage-qi-hdwallet.js)

    - Creating a wallet
    - Address derivation
    - HD wallet serialization and deserialization
    - Handling gap and change addresses
