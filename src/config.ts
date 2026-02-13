/**
 * Katana Swap Aggregator - Configuration
 * Chain, contracts, and token definitions
 */

import { type Address, type Chain } from "viem";

// ===========================================
// KATANA CHAIN
// ===========================================

export const katana: Chain = {
  id: 747474,
  name: "Katana",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: { http: ["https://rpc.katana.network"] },
  },
  blockExplorers: {
    default: { name: "KatanaScan", url: "https://katanascan.com" },
  },
};

export const KATANA_RPC = process.env.KATANA_RPC_URL || "https://rpc.katana.network";

// ===========================================
// SUSHI CONTRACTS
// ===========================================

export const CONTRACTS = {
  // Sushi V2 (UniswapV2 fork)
  SUSHI_V2_FACTORY: "0x72d111b4d6f31b38919ae39779f570b747d6acd9" as Address,
  SUSHI_V2_ROUTER: "0x69cc349932ae18ed406eeb917d79b9b3033fb68e" as Address,

  // Sushi V3 (UniswapV3 fork)
  SUSHI_V3_FACTORY: "0x203e8740894c8955cb8950759876d7e7e45e04c1" as Address,
  SUSHI_V3_ROUTER: "0x4e1d81a3e627b9294532e990109e4c21d217376c" as Address,
  SUSHI_V3_QUOTER: "0x" as Address, // TODO: Find quoter address

  // Sushi Route Processor (aggregated routing)
  SUSHI_ROUTE_PROCESSOR: "0x3ced11c610556e5292fbc2e75d68c3899098c14c" as Address,
} as const;

// ===========================================
// TOKENS
// ===========================================

export interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
  name: string;
}

export const TOKENS: Record<string, TokenInfo> = {
  ETH: {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "ETH",
    decimals: 18,
    name: "Ether",
  },
  WETH: {
    address: "0xee7d8bcfb72bc1880d0cf19822eb0a2e6577ab62",
    symbol: "WETH",
    decimals: 18,
    name: "Wrapped ETH",
  },
  USDC: {
    address: "0x203a662b0bd271a6ed5a60edfbd04bfce608fd36",
    symbol: "USDC",
    decimals: 6,
    name: "USD Coin",
  },
  USDT: {
    address: "0x2dca96907fde857dd3d816880a0df407eeb2d2f2",
    symbol: "USDT",
    decimals: 6,
    name: "Tether",
  },
  WBTC: {
    address: "0x0913da6da4b42f538b445599b46bb4622342cf52",
    symbol: "WBTC",
    decimals: 8,
    name: "Wrapped BTC",
  },
  wstETH: {
    address: "0x7fb4d0f51544f24f385a421db6e7d4fc71ad8e5c",
    symbol: "wstETH",
    decimals: 18,
    name: "Wrapped stETH",
  },
  KAT: {
    address: "0x7f1f4b4b29f5058fa32cc7a97141b8d7e5abdc2d",
    symbol: "KAT",
    decimals: 18,
    name: "Katana",
  },
};

// Wrapped native for routing
export const WRAPPED_NATIVE = TOKENS.WETH.address;

// ===========================================
// ABIs
// ===========================================

export const SUSHI_V2_FACTORY_ABI = [
  {
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
    ],
    name: "getPair",
    outputs: [{ name: "pair", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "allPairsLength",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "allPairs",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const SUSHI_V2_PAIR_ABI = [
  {
    inputs: [],
    name: "getReserves",
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const SUSHI_V2_ROUTER_ABI = [
  {
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    name: "getAmountsOut",
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const SUSHI_V3_FACTORY_ABI = [
  {
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    name: "getPool",
    outputs: [{ name: "pool", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const SUSHI_V3_POOL_ABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "liquidity",
    outputs: [{ name: "", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "fee",
    outputs: [{ name: "", type: "uint24" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// V3 fee tiers (in basis points / 100)
export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const; // 0.01%, 0.05%, 0.3%, 1%
