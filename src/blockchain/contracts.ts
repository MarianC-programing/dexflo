/**
 * Helpers de contratos (ERC-20) para la capa `@web3` con viem.
 * El ABI tipado (`erc20Abi`) permite validar balances, metadata y
 * eventos Transfer con inferencia de tipos, sin `any`.
 */

import { erc20Abi, type PublicClient } from 'viem';
import { getContractEvents, readContract } from 'viem/actions';

import { assertHexAddress } from './rpc.client';

export interface Erc20Metadata {
  readonly decimals: number;
  readonly symbol: string;
}

/** `balanceOf(holder)` en wei. */
export async function readErc20BalanceWei(
  client: PublicClient,
  tokenAddress: string,
  holderAddress: string,
): Promise<bigint> {
  return await readContract(client, {
    address: assertHexAddress(tokenAddress),
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [assertHexAddress(holderAddress)],
  });
}

/** Metadata mínima (decimales + símbolo) para aserciones de tokens. */
export async function readErc20Metadata(
  client: PublicClient,
  tokenAddress: string,
): Promise<Erc20Metadata> {
  const address = assertHexAddress(tokenAddress);
  const [decimals, symbol] = await Promise.all([
    readContract(client, { address, abi: erc20Abi, functionName: 'decimals' }),
    readContract(client, { address, abi: erc20Abi, functionName: 'symbol' }),
  ]);
  return { decimals, symbol };
}

export interface Erc20TransferSummary {
  readonly transactionHash: string;
  readonly logIndex: number;
  readonly from: string | null;
  readonly to: string | null;
  /** value en wei como texto (sin pérdidas de BigInt); null si no está indexado. */
  readonly valueWei: string | null;
}

export interface TransferLogQuery {
  readonly fromBlock: bigint;
  readonly toBlock?: bigint | 'latest';
}

const MAX_TRANSFER_SUMMARIES = 100;

/** Resumen de eventos Transfer en un rango de bloques. */
export async function listErc20TransferSummaries(
  client: PublicClient,
  tokenAddress: string,
  query: TransferLogQuery,
): Promise<readonly Erc20TransferSummary[]> {
  const logs = await getContractEvents(client, {
    address: assertHexAddress(tokenAddress),
    abi: erc20Abi,
    eventName: 'Transfer',
    args: {},
    fromBlock: query.fromBlock,
    toBlock: query.toBlock ?? 'latest',
  });
  const summaries = logs.map((log): Erc20TransferSummary => {
    const args = log.args;
    return {
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      from: args.from ?? null,
      to: args.to ?? null,
      valueWei: args.value === undefined ? null : args.value.toString(),
    };
  });
  return summaries.slice(0, MAX_TRANSFER_SUMMARIES);
}
