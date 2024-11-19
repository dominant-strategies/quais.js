# Quai Network Example Project

This project demonstrates basic wallet and transaction operations using the Quai Network JavaScript SDK.

## Features

- Generates HD wallets from mnemonics
- Creates zone-specific addresses
- Fetches blockchain data
- Constructs, signs, and verifies transactions
- Demonstrates protocol expansion number queries

## Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Access to Quai Network RPC endpoint

## Installation

```bash
npm install
# or
yarn install
```

## Usage

```bash
npm start
# or
yarn start
```

The script will:
1. Generate a new random wallet
2. Create a Cyprus1 zone address
3. Fetch latest block data
4. Create and verify a test transaction

## Code Structure

- `index.ts`: Main script demonstrating Quai Network SDK usage
- Uses TypeScript for type safety
- Implements error handling for network operations

## Important Notes

- This is a demonstration project - do not use generated keys in production
- Transactions are constructed but not broadcast to the network
- Replace hardcoded addresses with your own test addresses

## Resources

- [Quai Network Docs](https://docs.quai.network)
- [quais SDK Reference](https://github.com/dominant-strategies/quais-6.js)