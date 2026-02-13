/**
 * Quote Fetching - Get swap quotes from V2 and V3 pools
 */

import { type Address, formatUnits, zeroAddress } from "viem";
import { getClient } from "./client.js";
import {
  CONTRACTS,
  SUSHI_V2_ROUTER_ABI,
  WRAPPED_NATIVE,
  TOKENS,
  type TokenInfo,
} from "./config.js";
import { type Pool, type V2Pool, type V3Pool } from "./pools.js";

// ===========================================
// TYPES
// ===========================================

export interface Quote {
  pool: Pool;
  amountIn: bigint;
  amountOut: bigint;
  priceImpact: number;
  path: Address[];
}

// ===========================================
// V2 QUOTE (using getAmountsOut)
// ===========================================

export async function getV2Quote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<Quote | null> {
  const client = await getClient();

  // Normalize ETH to WETH
  const tIn = tokenIn === zeroAddress ? WRAPPED_NATIVE : tokenIn;
  const tOut = tokenOut === zeroAddress ? WRAPPED_NATIVE : tokenOut;

  try {
    const path = [tIn, tOut];
    const amounts = await client.readContract({
      address: CONTRACTS.SUSHI_V2_ROUTER,
      abi: SUSHI_V2_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountIn, path],
    });

    const amountOut = amounts[amounts.length - 1];

    // Calculate approximate price impact
    // For V2: impact = (1 - (amountOut / expectedOut)) * 100
    // This is simplified - real calculation would use reserves
    const priceImpact = 0.3; // Assume 0.3% fee as minimum

    return {
      pool: {
        type: "v2",
        address: CONTRACTS.SUSHI_V2_ROUTER, // Placeholder - actual pair found by router
        token0: tIn,
        token1: tOut,
        reserve0: 0n,
        reserve1: 0n,
      },
      amountIn,
      amountOut,
      priceImpact,
      path,
    };
  } catch (e) {
    // No liquidity or pair doesn't exist
    return null;
  }
}

// ===========================================
// V2 QUOTE WITH INTERMEDIATE HOP
// ===========================================

export async function getV2QuoteWithHop(
  tokenIn: Address,
  tokenOut: Address,
  intermediate: Address,
  amountIn: bigint
): Promise<Quote | null> {
  const client = await getClient();

  // Normalize ETH to WETH
  const tIn = tokenIn === zeroAddress ? WRAPPED_NATIVE : tokenIn;
  const tOut = tokenOut === zeroAddress ? WRAPPED_NATIVE : tokenOut;
  const tMid = intermediate === zeroAddress ? WRAPPED_NATIVE : intermediate;

  if (tIn === tMid || tOut === tMid) {
    return null;
  }

  try {
    const path = [tIn, tMid, tOut];
    const amounts = await client.readContract({
      address: CONTRACTS.SUSHI_V2_ROUTER,
      abi: SUSHI_V2_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountIn, path],
    });

    const amountOut = amounts[amounts.length - 1];

    return {
      pool: {
        type: "v2",
        address: CONTRACTS.SUSHI_V2_ROUTER,
        token0: tIn,
        token1: tOut,
        reserve0: 0n,
        reserve1: 0n,
      },
      amountIn,
      amountOut,
      priceImpact: 0.6, // ~2x fee for 2 hops
      path,
    };
  } catch (e) {
    return null;
  }
}

// ===========================================
// V3 QUOTE (simulate swap math)
// ===========================================

/**
 * Calculate V3 output amount using sqrtPriceX96
 * This is a simplified calculation - real quoter does tick math
 */
export function calculateV3Quote(
  pool: V3Pool,
  tokenIn: Address,
  amountIn: bigint
): Quote | null {
  if (pool.liquidity === 0n) {
    return null;
  }

  const isToken0 = tokenIn.toLowerCase() === pool.token0.toLowerCase();
  const sqrtPrice = pool.sqrtPriceX96;

  // price = (sqrtPriceX96 / 2^96)^2
  // For token0 -> token1: amountOut = amountIn * price
  // For token1 -> token0: amountOut = amountIn / price

  let amountOut: bigint;

  if (isToken0) {
    // Selling token0 for token1
    // price = sqrtPriceX96^2 / 2^192
    // amountOut = amountIn * price
    amountOut = (amountIn * sqrtPrice * sqrtPrice) / (1n << 192n);
  } else {
    // Selling token1 for token0
    // amountOut = amountIn / price
    amountOut = (amountIn * (1n << 192n)) / (sqrtPrice * sqrtPrice);
  }

  // Apply fee
  const feeMultiplier = 1000000n - BigInt(pool.fee);
  amountOut = (amountOut * feeMultiplier) / 1000000n;

  // Estimate price impact based on liquidity
  // This is very rough - real calculation needs tick math
  const priceImpact = Number(pool.fee) / 10000;

  return {
    pool,
    amountIn,
    amountOut,
    priceImpact,
    path: [
      isToken0 ? pool.token0 : pool.token1,
      isToken0 ? pool.token1 : pool.token0,
    ],
  };
}

// ===========================================
// GET BEST QUOTE ACROSS ALL POOLS
// ===========================================

export interface BestQuoteResult {
  best: Quote | null;
  allQuotes: Quote[];
}

export async function getBestQuote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  pools: Pool[]
): Promise<BestQuoteResult> {
  const quotes: Quote[] = [];

  // Get V2 direct quote
  const v2Direct = await getV2Quote(tokenIn, tokenOut, amountIn);
  if (v2Direct) {
    quotes.push(v2Direct);
  }

  // Try V2 with WETH hop if not already using WETH
  const tIn = tokenIn === zeroAddress ? WRAPPED_NATIVE : tokenIn;
  const tOut = tokenOut === zeroAddress ? WRAPPED_NATIVE : tokenOut;

  if (
    tIn.toLowerCase() !== WRAPPED_NATIVE.toLowerCase() &&
    tOut.toLowerCase() !== WRAPPED_NATIVE.toLowerCase()
  ) {
    const v2Hop = await getV2QuoteWithHop(tokenIn, tokenOut, WRAPPED_NATIVE, amountIn);
    if (v2Hop) {
      quotes.push(v2Hop);
    }
  }

  // Get V3 quotes from discovered pools
  for (const pool of pools) {
    if (pool.type === "v3") {
      const v3Quote = calculateV3Quote(pool, tokenIn, amountIn);
      if (v3Quote && v3Quote.amountOut > 0n) {
        quotes.push(v3Quote);
      }
    }
  }

  // Sort by output amount (descending)
  quotes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));

  return {
    best: quotes[0] || null,
    allQuotes: quotes,
  };
}

// ===========================================
// FORMAT QUOTE FOR DISPLAY
// ===========================================

export function formatQuote(
  quote: Quote,
  tokenInInfo: TokenInfo,
  tokenOutInfo: TokenInfo
): string {
  const amountInFormatted = formatUnits(quote.amountIn, tokenInInfo.decimals);
  const amountOutFormatted = formatUnits(quote.amountOut, tokenOutInfo.decimals);
  const rate = Number(amountOutFormatted) / Number(amountInFormatted);

  const poolType = quote.pool.type.toUpperCase();
  const fee = quote.pool.type === "v3" ? ` (${(quote.pool as V3Pool).fee / 10000}%)` : "";

  return `${poolType}${fee}: ${amountInFormatted} ${tokenInInfo.symbol} → ${amountOutFormatted} ${tokenOutInfo.symbol} (rate: ${rate.toFixed(6)})`;
}
