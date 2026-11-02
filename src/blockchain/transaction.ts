/**
 * Utilidades de transacciones para la capa `@web3`: validez de hashes,
 * receipts tipados y resúmenes legibles sin aritmética flotante.
 */

import { type PublicClient, type TransactionReceipt } from 'viem';
import { getTransaction, waitForTransactionReceipt } from 'viem/actions';

import { assertTransactionHash } from './rpc.client';

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** Validez formal de un hash de transacción (0x + 64 hex). */
export function isTransactionHashFormat(value: string): boolean {
  return TX_HASH_PATTERN.test(value);
}

export interface TransactionSummary {
  readonly transactionHash: string;
  /** status del receipt en lenguaje humano. */
  readonly status: 'success' | 'reverted';
  readonly blockNumber: number;
  readonly gasUsedWei: string;
  /** gasUsed * effectiveGasPrice, en wei como texto. */
  readonly feeWei: string;
}

function summarizeReceipt(receipt: TransactionReceipt): TransactionSummary {
  const feeWei = receipt.gasUsed * receipt.effectiveGasPrice;
  return {
    transactionHash: receipt.transactionHash,
    status: receipt.status === 'success' ? 'success' : 'reverted',
    blockNumber: Number(receipt.blockNumber),
    gasUsedWei: receipt.gasUsed.toString(),
    feeWei: feeWei.toString(),
  } satisfies TransactionSummary;
}

/** Receipt resumido; null si la transacción aún no se confirmó. */
export async function getTransactionSummary(
  client: PublicClient,
  transactionHash: string,
): Promise<TransactionSummary | null> {
  const hash = assertTransactionHash(transactionHash);
  const receipt = await client
    .getTransactionReceipt({ hash })
    .catch((): TransactionReceipt | null => null);
  return receipt === null ? null : summarizeReceipt(receipt);
}

export interface GetTransactionOptions {
  readonly timeoutMs?: number;
}

/** Espera confirmación y devuelve el resumen tipado del receipt. */
export async function waitForConfirmedTransaction(
  client: PublicClient,
  transactionHash: string,
  options: GetTransactionOptions = {},
): Promise<TransactionSummary> {
  const hash = assertTransactionHash(transactionHash);
  const receipt = await waitForTransactionReceipt(client, {
    hash,
    timeout: options.timeoutMs,
  });
  return summarizeReceipt(receipt);
}

/** Verifica que un hash exista en cadena (getTransaction valida su presencia). */
export async function transactionExistsOnChain(
  client: PublicClient,
  transactionHash: string,
): Promise<boolean> {
  const hash = assertTransactionHash(transactionHash);
  const found = await getTransaction(client, { hash }).catch(() => null);
  return found !== null;
}
