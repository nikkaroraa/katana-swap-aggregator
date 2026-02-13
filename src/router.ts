/**
 * Route Optimizer - Find optimal routing across V2/V3 pools
 * 
 * Algorithm based on @ProgrammerSmart's approach:
 * 1. Find all available pools for the pair
 * 2. For each pool, calculate quote
 * 3. Consider split trades for large amounts
 * 4. Return optimal route(s)
 */

import { type Address, formatUnits, parseUnits, zeroAddress } from "viem";
import { findAllPools, type Pool } from "./pools.js";
import {
  getBestQuote,
  getV2Quote,
  calculateV3Quote,
  type Quote,
} from "./quotes.js";
import { TOKENS, WRAPPED_NATIVE, type TokenInfo } from "./config.js";

// ===========================================
// TYPES
// ===========================================

export interface Route {
  steps: RouteStep[];
  totalAmountIn: bigint;
  totalAmountOut: bigint;
  priceImpact: number;
}

export interface RouteStep {
  pool: Pool;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  percentage: number; // % of total trade routed through this step
}

export interface SplitRoute {
  routes: Route[];
  totalAmountIn: bigint;
  totalAmountOut: bigint;
  improvement: number; // % improvement over single best route
}

// ===========================================
// SIMPLE ROUTING (Single Best Pool)
// ===========================================

export async function findBestRoute(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<Route | null> {
  // Discover all pools
  const pools = await findAllPools(tokenIn, tokenOut);

  if (pools.length === 0) {
    console.log("No pools found for this pair");
    return null;
  }

  // Get best quote
  const { best, allQuotes } = await getBestQuote(tokenIn, tokenOut, amountIn, pools);

  if (!best) {
    return null;
  }

  return {
    steps: [
      {
        pool: best.pool,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut: best.amountOut,
        percentage: 100,
      },
    ],
    totalAmountIn: amountIn,
    totalAmountOut: best.amountOut,
    priceImpact: best.priceImpact,
  };
}

// ===========================================
// SPLIT ROUTING (Multiple Pools)
// ===========================================

/**
 * Try splitting trade across multiple pools for better execution
 * 
 * For large trades, splitting can reduce price impact:
 * - 50/50 split between V2 and V3
 * - 70/30 based on liquidity ratios
 * - etc.
 */
export async function findSplitRoute(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  maxSplits: number = 2
): Promise<SplitRoute | null> {
  const pools = await findAllPools(tokenIn, tokenOut);

  if (pools.length < 2) {
    // Not enough pools to split
    const singleRoute = await findBestRoute(tokenIn, tokenOut, amountIn);
    if (!singleRoute) return null;

    return {
      routes: [singleRoute],
      totalAmountIn: amountIn,
      totalAmountOut: singleRoute.totalAmountOut,
      improvement: 0,
    };
  }

  // Get single best route for comparison
  const { best: singleBest } = await getBestQuote(tokenIn, tokenOut, amountIn, pools);
  const singleOutput = singleBest?.amountOut || 0n;

  // Try different split ratios
  const splitRatios = [
    [50, 50],
    [60, 40],
    [70, 30],
    [80, 20],
  ];

  let bestSplit: { ratio: number[]; outputs: bigint[]; total: bigint } | null = null;

  for (const ratio of splitRatios) {
    const amounts = ratio.map((r) => (amountIn * BigInt(r)) / 100n);

    // Get quotes for each split
    const quotes: (Quote | null)[] = [];

    // Try V2 for first split
    const v2Quote = await getV2Quote(tokenIn, tokenOut, amounts[0]);
    quotes.push(v2Quote);

    // Try best V3 for second split
    const v3Pools = pools.filter((p) => p.type === "v3");
    let bestV3: Quote | null = null;
    for (const pool of v3Pools) {
      if (pool.type === "v3") {
        const q = calculateV3Quote(pool, tokenIn, amounts[1]);
        if (q && (!bestV3 || q.amountOut > bestV3.amountOut)) {
          bestV3 = q;
        }
      }
    }
    quotes.push(bestV3);

    // Calculate total output
    if (quotes[0] && quotes[1]) {
      const total = quotes[0].amountOut + quotes[1].amountOut;
      if (!bestSplit || total > bestSplit.total) {
        bestSplit = {
          ratio,
          outputs: [quotes[0].amountOut, quotes[1].amountOut],
          total,
        };
      }
    }
  }

  // If split is better than single route, return it
  if (bestSplit && bestSplit.total > singleOutput) {
    const improvement =
      Number((bestSplit.total - singleOutput) * 10000n / singleOutput) / 100;

    // Build route steps
    const routes: Route[] = [];
    const amounts = bestSplit.ratio.map((r) => (amountIn * BigInt(r)) / 100n);

    // V2 route
    const v2Quote = await getV2Quote(tokenIn, tokenOut, amounts[0]);
    if (v2Quote) {
      routes.push({
        steps: [
          {
            pool: v2Quote.pool,
            tokenIn,
            tokenOut,
            amountIn: amounts[0],
            amountOut: v2Quote.amountOut,
            percentage: bestSplit.ratio[0],
          },
        ],
        totalAmountIn: amounts[0],
        totalAmountOut: v2Quote.amountOut,
        priceImpact: v2Quote.priceImpact,
      });
    }

    // V3 route
    const v3Pools = pools.filter((p) => p.type === "v3");
    for (const pool of v3Pools) {
      if (pool.type === "v3") {
        const q = calculateV3Quote(pool, tokenIn, amounts[1]);
        if (q && q.amountOut === bestSplit.outputs[1]) {
          routes.push({
            steps: [
              {
                pool: q.pool,
                tokenIn,
                tokenOut,
                amountIn: amounts[1],
                amountOut: q.amountOut,
                percentage: bestSplit.ratio[1],
              },
            ],
            totalAmountIn: amounts[1],
            totalAmountOut: q.amountOut,
            priceImpact: q.priceImpact,
          });
          break;
        }
      }
    }

    return {
      routes,
      totalAmountIn: amountIn,
      totalAmountOut: bestSplit.total,
      improvement,
    };
  }

  // Single route is better
  const singleRoute = await findBestRoute(tokenIn, tokenOut, amountIn);
  if (!singleRoute) return null;

  return {
    routes: [singleRoute],
    totalAmountIn: amountIn,
    totalAmountOut: singleRoute.totalAmountOut,
    improvement: 0,
  };
}

// ===========================================
// MULTI-HOP ROUTING
// ===========================================

/**
 * Find route through intermediate tokens (e.g., A -> WETH -> B)
 */
export async function findMultiHopRoute(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  intermediates: Address[] = [WRAPPED_NATIVE]
): Promise<Route | null> {
  // Try direct route first
  const directRoute = await findBestRoute(tokenIn, tokenOut, amountIn);

  // Try routes through intermediates
  let bestHopRoute: Route | null = null;

  for (const intermediate of intermediates) {
    // Skip if intermediate is same as input or output
    if (
      intermediate.toLowerCase() === tokenIn.toLowerCase() ||
      intermediate.toLowerCase() === tokenOut.toLowerCase()
    ) {
      continue;
    }

    // Leg 1: tokenIn -> intermediate
    const leg1 = await findBestRoute(tokenIn, intermediate, amountIn);
    if (!leg1) continue;

    // Leg 2: intermediate -> tokenOut
    const leg2 = await findBestRoute(intermediate, tokenOut, leg1.totalAmountOut);
    if (!leg2) continue;

    const hopRoute: Route = {
      steps: [...leg1.steps, ...leg2.steps],
      totalAmountIn: amountIn,
      totalAmountOut: leg2.totalAmountOut,
      priceImpact: leg1.priceImpact + leg2.priceImpact,
    };

    if (!bestHopRoute || hopRoute.totalAmountOut > bestHopRoute.totalAmountOut) {
      bestHopRoute = hopRoute;
    }
  }

  // Return best of direct or multi-hop
  if (!directRoute && !bestHopRoute) return null;
  if (!directRoute) return bestHopRoute;
  if (!bestHopRoute) return directRoute;

  return directRoute.totalAmountOut >= bestHopRoute.totalAmountOut
    ? directRoute
    : bestHopRoute;
}

// ===========================================
// FORMAT ROUTE FOR DISPLAY
// ===========================================

export function formatRoute(route: Route, tokenIn: TokenInfo, tokenOut: TokenInfo): string {
  const lines: string[] = [];

  const amountInFormatted = formatUnits(route.totalAmountIn, tokenIn.decimals);
  const amountOutFormatted = formatUnits(route.totalAmountOut, tokenOut.decimals);
  const rate = Number(amountOutFormatted) / Number(amountInFormatted);

  lines.push(`Route: ${amountInFormatted} ${tokenIn.symbol} → ${amountOutFormatted} ${tokenOut.symbol}`);
  lines.push(`Rate: 1 ${tokenIn.symbol} = ${rate.toFixed(6)} ${tokenOut.symbol}`);
  lines.push(`Price Impact: ~${route.priceImpact.toFixed(2)}%`);
  lines.push(`Steps: ${route.steps.length}`);

  for (const step of route.steps) {
    const poolType = step.pool.type.toUpperCase();
    const fee = step.pool.type === "v3" ? ` (${step.pool.fee / 10000}% fee)` : "";
    lines.push(`  • ${poolType}${fee}: ${step.percentage}% of trade`);
  }

  return lines.join("\n");
}
