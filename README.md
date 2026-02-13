# Katana Swap Aggregator

Swap aggregator for Katana L2 that routes across Sushi V2/V3 pools for best execution.

## Features

- **Pool Discovery**: Finds all V2 and V3 pools for any token pair
- **Quote Comparison**: Gets quotes from all available pools
- **Route Optimization**: Finds optimal route (direct or multi-hop)
- **Split Routing**: Splits large trades across multiple pools to reduce slippage

## Installation

```bash
pnpm install
```

## Usage

```bash
# Show network info and contracts
npx tsx src/index.ts info

# Find pools for a token pair
npx tsx src/index.ts pools WETH USDC

# Get best quote
npx tsx src/index.ts quote WETH USDC 1

# Find optimal route
npx tsx src/index.ts route WETH USDC 10

# Try split routing for large trades
npx tsx src/index.ts split WETH USDC 100
```

## Supported Tokens

| Token | Address |
|-------|---------|
| ETH | Native |
| WETH | 0xee7d8bcfb72bc1880d0cf19822eb0a2e6577ab62 |
| USDC | 0x203a662b0bd271a6ed5a60edfbd04bfce608fd36 |
| USDT | 0x2dca96907fde857dd3d816880a0df407eeb2d2f2 |
| WBTC | 0x0913da6da4b42f538b445599b46bb4622342cf52 |
| wstETH | 0x7fb4d0f51544f24f385a421db6e7d4fc71ad8e5c |
| KAT | 0x7f1f4b4b29f5058fa32cc7a97141b8d7e5abdc2d |

## Architecture

```
src/
├── config.ts    # Chain, contracts, tokens, ABIs
├── client.ts    # Viem client setup
├── pools.ts     # V2/V3 pool discovery
├── quotes.ts    # Quote fetching and calculation
├── router.ts    # Route optimization algorithms
└── index.ts     # CLI entry point
```

## How Routing Works

1. **Pool Discovery**: Queries V2 factory for pair address and V3 factory for all fee tiers (0.01%, 0.05%, 0.3%, 1%)

2. **Quote Fetching**:
   - V2: Uses `getAmountsOut` on router
   - V3: Calculates output using `sqrtPriceX96` from pool state

3. **Route Selection**:
   - Compares all direct quotes
   - Tries intermediate hops (e.g., A → WETH → B)
   - For split routing, tests different ratios (50/50, 60/40, etc.)

4. **Returns best route** with output amount and price impact

## Contracts

| Contract | Address |
|----------|---------|
| Sushi V2 Factory | 0x72d111b4d6f31b38919ae39779f570b747d6acd9 |
| Sushi V2 Router | 0x69cc349932ae18ed406eeb917d79b9b3033fb68e |
| Sushi V3 Factory | 0x203e8740894c8955cb8950759876d7e7e45e04c1 |
| Sushi V3 Router | 0x4e1d81a3e627b9294532e990109e4c21d217376c |

## Limitations

- V3 quote calculation is simplified (no tick crossing math)
- No execution yet (quote only)
- Limited to Sushi pools (no other DEXs)

## Future Work

- [ ] Add Katana V3 Quoter contract for accurate V3 quotes
- [ ] Build execution router contract
- [ ] Add more tokens
- [ ] Integrate with Katana intent layer
- [ ] Support for multi-hop V3 routing

## License

MIT
