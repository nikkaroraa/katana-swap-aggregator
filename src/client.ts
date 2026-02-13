/**
 * Viem client for Katana
 */

import { createPublicClient, http } from "viem";
import { katana, KATANA_RPC } from "./config.js";

let cachedClient: ReturnType<typeof createPublicClient> | null = null;

export async function getClient() {
  if (cachedClient) return cachedClient;

  cachedClient = createPublicClient({
    chain: katana,
    transport: http(KATANA_RPC, { timeout: 15000 }),
  });

  // Test connection
  await cachedClient.getBlockNumber();
  return cachedClient;
}
