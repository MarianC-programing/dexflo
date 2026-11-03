/**
 * Cliente RPC con viem para la capa `@web3` (validaciones on-chain).
 *
 * SOLO se usa en pruebas contractuales/`@web3` contra servicios reales:
 * la suite principal E2E es determinista (mock EIP-1193) y NO debe
 * depender de este cliente. Las claves y RPC con llaves llegan por
 * entorno (env.ts) y jamás se versionan.
 */

import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';
import { arbitrum, base, mainnet, optimism, polygon, sepolia } from 'viem/chains';

import { env } from '../config/env';
import { NETWORKS, type NetworkName } from '../config/networks';

/** Adaptador de red: nombre interno → definición de cadena de viem. */
export const VIEM_CHAIN_BY_NETWORK: Readonly<Record<NetworkName, Chain>> = Object.freeze({
  mainnet,
  polygon,
  arbitrum,
  optimism,
  base,
  sepolia,
});

const DEFAULT_RPC_TIMEOUT_MS = 20_000;

/** Bloquea mainnet salvo opt-in explícito (ALLOW_MAINNET=true). */
export function assertNetworkAllowed(networkName: NetworkName): void {
  if (networkName === 'mainnet' && !env.allowMainnet) {
    throw new Error(
      '[rpc] Mainnet bloqueada: define ALLOW_MAINNET=true para usarla de forma explícita.',
    );
  }
}

export interface PublicClientOptions {
  /** Red objetivo; por defecto la de env.ts. */
  readonly networkName?: NetworkName;
  /** RPC con prioridad sobre env.rpcUrl y el RPC público del catálogo de redes. */
  readonly rpcUrl?: string;
  /** Timeout por request; por defecto {@link DEFAULT_RPC_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

export function createDexfloPublicClient(options: PublicClientOptions = {}): PublicClient {
  const networkName = options.networkName ?? env.networkName;
  assertNetworkAllowed(networkName);
  const chain = VIEM_CHAIN_BY_NETWORK[networkName];

  const rpcUrl = options.rpcUrl ?? env.rpcUrl;
  // Sin RPC explícito se usa el RPC público del catálogo (src/config/networks.ts),
  // no el default de viem: así catálogo y cliente no divergen.
  const effectiveRpcUrl =
    rpcUrl !== null && rpcUrl.length > 0 ? rpcUrl : NETWORKS[networkName].rpcUrl;
  const timeoutMs = options.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;

  const transport = http(effectiveRpcUrl, { timeout: timeoutMs });

  return createPublicClient({ chain, transport });
}

const HEX_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** Valida y "castea" a la marca de tipos de viem: la regex ya garantiza el formato. */
export function assertHexAddress(value: string): `0x${string}` {
  if (!HEX_ADDRESS_PATTERN.test(value)) {
    throw new Error(`[rpc] Dirección EVM inválida: ${value}`);
  }
  return value as `0x${string}`;
}

export function assertTransactionHash(value: string): `0x${string}` {
  if (!TX_HASH_PATTERN.test(value)) {
    throw new Error(`[rpc] Hash de transacción inválido (0x + 64 hex): ${value}`);
  }
  return value as `0x${string}`;
}

export async function getBlockNumber(client: PublicClient): Promise<number> {
  return Number(await client.getBlockNumber());
}

/** Saldo nativo (wei) de una dirección contra el RPC vigente. */
export async function getWalletBalanceWei(client: PublicClient, address: string): Promise<bigint> {
  return await client.getBalance({ address: assertHexAddress(address) });
}

export interface WaitForReceiptOptions {
  readonly confirmations?: number;
  readonly timeoutMs?: number;
}

/** Espera el receipt de una transacción con confirmaciones y timeout acotados. */
export async function waitForReceipt(
  client: PublicClient,
  transactionHash: string,
  options: WaitForReceiptOptions = {},
): Promise<TransactionReceipt> {
  return await waitForTransactionReceipt(client, {
    hash: assertTransactionHash(transactionHash),
    confirmations: options.confirmations ?? 1,
    timeout: options.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
  });
}
