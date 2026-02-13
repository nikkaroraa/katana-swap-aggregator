#!/usr/bin/env npx tsx
/**
 * Katana Swap Aggregator CLI
 * Routes swaps across Sushi V2/V3 for best execution on Katana L2
 */

import { parseUnits, formatUnits, type Address, zeroAddress } from "viem";
import { getClient } from "./client.js";
import { TOKENS, CONTRACTS, type TokenInfo } from "./config.js";
import { findAllPools, getV2PairsCount } from "./pools.js";
import { getBestQuote, formatQuote } from "./quotes.js";
import { findBestRoute, findSplitRoute, findMultiHopRoute, formatRoute } from "./router.js";

// Colors
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const BLUE = "\x1b[0;34m";
const CYAN = "\x1b[0;36m";
const RED = "\x1b[0;31m";
const NC = "\x1b[0m";
const BOLD = "\x1b[1m";

// ===========================================
// HELPERS
// ===========================================

function getToken(symbol: string): TokenInfo | null {
  const upper = symbol.toUpperCase();
  return TOKENS[upper] || null;
}

function parseAmount(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

function printHelp() {
  console.log(`
${BOLD}Katana Swap Aggregator${NC}
Routes swaps across Sushi V2/V3 for best execution

${BOLD}Usage:${NC}
  npx tsx src/index.ts <command> [options]

${BOLD}Commands:${NC}
  quote <tokenIn> <tokenOut> <amount>   Get best swap quote
  route <tokenIn> <tokenOut> <amount>   Find optimal route
  split <tokenIn> <tokenOut> <amount>   Try split routing for large trades
  pools <tokenA> <tokenB>               List all pools for a pair
  info                                  Show network and contract info

${BOLD}Examples:${NC}
  npx tsx src/index.ts quote ETH USDC 1
  npx tsx src/index.ts route WETH USDC 10
  npx tsx src/index.ts split WETH USDC 100
  npx tsx src/index.ts pools WETH USDC

${BOLD}Supported Tokens:${NC}
  ${Object.keys(TOKENS).join(", ")}
`);
}

// ===========================================
// COMMANDS
// ===========================================

async function cmdInfo() {
  console.log(`\n${BOLD}${CYAN}⚔️ Katana Swap Aggregator${NC}\n`);

  try {
    const client = await getClient();
    const blockNumber = await client.getBlockNumber();
    const pairsCount = await getV2PairsCount();

    console.log(`${BOLD}Network:${NC}`);
    console.log(`  Chain ID: 747474`);
    console.log(`  RPC: https://rpc.katana.network`);
    console.log(`  Block: ${blockNumber}`);

    console.log(`\n${BOLD}Sushi Contracts:${NC}`);
    console.log(`  V2 Factory: ${CONTRACTS.SUSHI_V2_FACTORY}`);
    console.log(`  V2 Router:  ${CONTRACTS.SUSHI_V2_ROUTER}`);
    console.log(`  V3 Factory: ${CONTRACTS.SUSHI_V3_FACTORY}`);
    console.log(`  V3 Router:  ${CONTRACTS.SUSHI_V3_ROUTER}`);

    console.log(`\n${BOLD}Stats:${NC}`);
    console.log(`  V2 Pairs: ${pairsCount}`);

    console.log(`\n${BOLD}Supported Tokens:${NC}`);
    for (const [symbol, token] of Object.entries(TOKENS)) {
      console.log(`  ${symbol.padEnd(8)} ${token.address}`);
    }
  } catch (e: any) {
    console.error(`${RED}Error:${NC}`, e.message);
  }
}

async function cmdPools(tokenASymbol: string, tokenBSymbol: string) {
  const tokenA = getToken(tokenASymbol);
  const tokenB = getToken(tokenBSymbol);

  if (!tokenA || !tokenB) {
    console.error(`${RED}Unknown token. Supported: ${Object.keys(TOKENS).join(", ")}${NC}`);
    return;
  }

  console.log(`\n${BOLD}Finding pools for ${tokenA.symbol}/${tokenB.symbol}...${NC}\n`);

  try {
    const pools = await findAllPools(tokenA.address, tokenB.address);

    if (pools.length === 0) {
      console.log(`${YELLOW}No pools found for this pair${NC}`);
      return;
    }

    console.log(`${GREEN}Found ${pools.length} pool(s):${NC}\n`);

    for (const pool of pools) {
      if (pool.type === "v2") {
        console.log(`${CYAN}V2 Pool${NC}`);
        console.log(`  Address:  ${pool.address}`);
        console.log(`  Reserve0: ${formatUnits(pool.reserve0, 18)}`);
        console.log(`  Reserve1: ${formatUnits(pool.reserve1, 18)}`);
      } else {
        console.log(`${CYAN}V3 Pool (${pool.fee / 10000}% fee)${NC}`);
        console.log(`  Address:   ${pool.address}`);
        console.log(`  Liquidity: ${pool.liquidity}`);
        console.log(`  Tick:      ${pool.tick}`);
      }
      console.log();
    }
  } catch (e: any) {
    console.error(`${RED}Error:${NC}`, e.message);
  }
}

async function cmdQuote(tokenInSymbol: string, tokenOutSymbol: string, amount: string) {
  const tokenIn = getToken(tokenInSymbol);
  const tokenOut = getToken(tokenOutSymbol);

  if (!tokenIn || !tokenOut) {
    console.error(`${RED}Unknown token. Supported: ${Object.keys(TOKENS).join(", ")}${NC}`);
    return;
  }

  const amountIn = parseAmount(amount, tokenIn.decimals);

  console.log(`\n${BOLD}Getting quotes for ${amount} ${tokenIn.symbol} → ${tokenOut.symbol}...${NC}\n`);

  try {
    const pools = await findAllPools(tokenIn.address, tokenOut.address);
    const { best, allQuotes } = await getBestQuote(tokenIn.address, tokenOut.address, amountIn, pools);

    if (!best) {
      console.log(`${YELLOW}No quotes available for this pair${NC}`);
      return;
    }

    console.log(`${GREEN}${BOLD}Best Quote:${NC}`);
    console.log(`  ${formatQuote(best, tokenIn, tokenOut)}`);

    if (allQuotes.length > 1) {
      console.log(`\n${CYAN}All Quotes:${NC}`);
      for (const quote of allQuotes) {
        console.log(`  ${formatQuote(quote, tokenIn, tokenOut)}`);
      }
    }
  } catch (e: any) {
    console.error(`${RED}Error:${NC}`, e.message);
  }
}

async function cmdRoute(tokenInSymbol: string, tokenOutSymbol: string, amount: string) {
  const tokenIn = getToken(tokenInSymbol);
  const tokenOut = getToken(tokenOutSymbol);

  if (!tokenIn || !tokenOut) {
    console.error(`${RED}Unknown token. Supported: ${Object.keys(TOKENS).join(", ")}${NC}`);
    return;
  }

  const amountIn = parseAmount(amount, tokenIn.decimals);

  console.log(`\n${BOLD}Finding best route for ${amount} ${tokenIn.symbol} → ${tokenOut.symbol}...${NC}\n`);

  try {
    // Try multi-hop routing (includes direct)
    const route = await findMultiHopRoute(tokenIn.address, tokenOut.address, amountIn);

    if (!route) {
      console.log(`${YELLOW}No route found for this pair${NC}`);
      return;
    }

    console.log(`${GREEN}${BOLD}Optimal Route:${NC}`);
    console.log(formatRoute(route, tokenIn, tokenOut));
  } catch (e: any) {
    console.error(`${RED}Error:${NC}`, e.message);
  }
}

async function cmdSplit(tokenInSymbol: string, tokenOutSymbol: string, amount: string) {
  const tokenIn = getToken(tokenInSymbol);
  const tokenOut = getToken(tokenOutSymbol);

  if (!tokenIn || !tokenOut) {
    console.error(`${RED}Unknown token. Supported: ${Object.keys(TOKENS).join(", ")}${NC}`);
    return;
  }

  const amountIn = parseAmount(amount, tokenIn.decimals);

  console.log(`\n${BOLD}Finding split route for ${amount} ${tokenIn.symbol} → ${tokenOut.symbol}...${NC}\n`);

  try {
    const splitRoute = await findSplitRoute(tokenIn.address, tokenOut.address, amountIn);

    if (!splitRoute) {
      console.log(`${YELLOW}No route found${NC}`);
      return;
    }

    const amountOutFormatted = formatUnits(splitRoute.totalAmountOut, tokenOut.decimals);

    console.log(`${GREEN}${BOLD}Split Route Result:${NC}`);
    console.log(`  Total Output: ${amountOutFormatted} ${tokenOut.symbol}`);
    console.log(`  Routes Used:  ${splitRoute.routes.length}`);

    if (splitRoute.improvement > 0) {
      console.log(`  ${GREEN}Improvement:  +${splitRoute.improvement.toFixed(2)}% vs single route${NC}`);
    }

    console.log(`\n${CYAN}Route Breakdown:${NC}`);
    for (const route of splitRoute.routes) {
      console.log(formatRoute(route, tokenIn, tokenOut));
      console.log();
    }
  } catch (e: any) {
    console.error(`${RED}Error:${NC}`, e.message);
  }
}

// ===========================================
// MAIN
// ===========================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    printHelp();
    return;
  }

  const command = args[0];

  switch (command) {
    case "info":
      await cmdInfo();
      break;

    case "pools":
      if (args.length < 3) {
        console.error("Usage: pools <tokenA> <tokenB>");
        return;
      }
      await cmdPools(args[1], args[2]);
      break;

    case "quote":
      if (args.length < 4) {
        console.error("Usage: quote <tokenIn> <tokenOut> <amount>");
        return;
      }
      await cmdQuote(args[1], args[2], args[3]);
      break;

    case "route":
      if (args.length < 4) {
        console.error("Usage: route <tokenIn> <tokenOut> <amount>");
        return;
      }
      await cmdRoute(args[1], args[2], args[3]);
      break;

    case "split":
      if (args.length < 4) {
        console.error("Usage: split <tokenIn> <tokenOut> <amount>");
        return;
      }
      await cmdSplit(args[1], args[2], args[3]);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
  }
}

main().catch(console.error);
