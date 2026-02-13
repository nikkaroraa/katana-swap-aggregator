/**
 * Pool Discovery - Find V2 and V3 pools for token pairs
 */

import { type Address, zeroAddress } from "viem";
import { getClient } from "./client.js";
import {
  CONTRACTS,
  SUSHI_V2_FACTORY_ABI,
  SUSHI_V2_PAIR_ABI,
  SUSHI_V3_FACTORY_ABI,
  SUSHI_V3_POOL_ABI,
  V3_FEE_TIERS,
  WRAPPED_NATIVE,
} from "./config.js";

// ===========================================
// TYPES
// ===========================================

export interface V2Pool {
  type: "v2";
  address: Address;
  token0: Address;
  token1: Address;
  reserve0: bigint;
  reserve1: bigint;
}

export interface V3Pool {
  type: "v3";
  address: Address;
  token0: Address;
  token1: Address;
  fee: number;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
}

export type Pool = V2Pool | V3Pool;

// ===========================================
// V2 POOL DISCOVERY
// ===========================================

export async function getV2Pool(
  tokenA: Address,
  tokenB: Address
): Promise<V2Pool | null> {
  const client = await getClient();

  // Normalize ETH to WETH
  const t0 = tokenA === zeroAddress ? WRAPPED_NATIVE : tokenA;
  const t1 = tokenB === zeroAddress ? WRAPPED_NATIVE : tokenB;

  try {
    const pairAddress = await client.readContract({
      address: CONTRACTS.SUSHI_V2_FACTORY,
      abi: SUSHI_V2_FACTORY_ABI,
      functionName: "getPair",
      args: [t0, t1],
    });

    if (pairAddress === zeroAddress) {
      return null;
    }

    // Get reserves
    const [reserves, token0, token1] = await Promise.all([
      client.readContract({
        address: pairAddress,
        abi: SUSHI_V2_PAIR_ABI,
        functionName: "getReserves",
      }),
      client.readContract({
        address: pairAddress,
        abi: SUSHI_V2_PAIR_ABI,
        functionName: "token0",
      }),
      client.readContract({
        address: pairAddress,
        abi: SUSHI_V2_PAIR_ABI,
        functionName: "token1",
      }),
    ]);

    return {
      type: "v2",
      address: pairAddress,
      token0,
      token1,
      reserve0: reserves[0],
      reserve1: reserves[1],
    };
  } catch (e) {
    console.error(`V2 pool lookup failed for ${t0}/${t1}:`, e);
    return null;
  }
}

// ===========================================
// V3 POOL DISCOVERY
// ===========================================

export async function getV3Pool(
  tokenA: Address,
  tokenB: Address,
  fee: number
): Promise<V3Pool | null> {
  const client = await getClient();

  // Normalize ETH to WETH
  const t0 = tokenA === zeroAddress ? WRAPPED_NATIVE : tokenA;
  const t1 = tokenB === zeroAddress ? WRAPPED_NATIVE : tokenB;

  try {
    const poolAddress = await client.readContract({
      address: CONTRACTS.SUSHI_V3_FACTORY,
      abi: SUSHI_V3_FACTORY_ABI,
      functionName: "getPool",
      args: [t0, t1, fee],
    });

    if (poolAddress === zeroAddress) {
      return null;
    }

    // Get pool state
    const [slot0, liquidity, token0, token1] = await Promise.all([
      client.readContract({
        address: poolAddress,
        abi: SUSHI_V3_POOL_ABI,
        functionName: "slot0",
      }),
      client.readContract({
        address: poolAddress,
        abi: SUSHI_V3_POOL_ABI,
        functionName: "liquidity",
      }),
      client.readContract({
        address: poolAddress,
        abi: SUSHI_V3_POOL_ABI,
        functionName: "token0",
      }),
      client.readContract({
        address: poolAddress,
        abi: SUSHI_V3_POOL_ABI,
        functionName: "token1",
      }),
    ]);

    return {
      type: "v3",
      address: poolAddress,
      token0,
      token1,
      fee,
      sqrtPriceX96: slot0[0],
      liquidity,
      tick: slot0[1],
    };
  } catch (e) {
    console.error(`V3 pool lookup failed for ${t0}/${t1} fee=${fee}:`, e);
    return null;
  }
}

// ===========================================
// FIND ALL POOLS FOR A PAIR
// ===========================================

export async function findAllPools(
  tokenA: Address,
  tokenB: Address
): Promise<Pool[]> {
  const pools: Pool[] = [];

  // Check V2
  const v2Pool = await getV2Pool(tokenA, tokenB);
  if (v2Pool) {
    pools.push(v2Pool);
  }

  // Check all V3 fee tiers
  const v3Promises = V3_FEE_TIERS.map((fee) => getV3Pool(tokenA, tokenB, fee));
  const v3Results = await Promise.all(v3Promises);

  for (const pool of v3Results) {
    if (pool) {
      pools.push(pool);
    }
  }

  return pools;
}

// ===========================================
// GET TOTAL V2 PAIRS COUNT
// ===========================================

export async function getV2PairsCount(): Promise<number> {
  const client = await getClient();
  const count = await client.readContract({
    address: CONTRACTS.SUSHI_V2_FACTORY,
    abi: SUSHI_V2_FACTORY_ABI,
    functionName: "allPairsLength",
  });
  return Number(count);
}
