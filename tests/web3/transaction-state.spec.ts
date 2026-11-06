/**
 * Estados de transacción para la capa @web3 (Fase 6, docs/plan.md): hash,
 * receipt, balances y eventos.
 *
 * Bloque principal: provider EIP-1193 mockeado (determinista, sin red).
 * El único caso contra RPC real es CONTRACTUAL y se salta sin `RPC_URL`
 * (opt-in por entorno, docs/plan.md: "@web3 solo con RPC configurado")
 * y NO envía transacciones reales: solo lecturas acotadas.
 */

import { expect, test } from '../../src/fixtures/web3Fixture';
import {
  createDexfloPublicClient,
  getBlockNumber,
  getWalletBalanceWei,
} from '../../src/blockchain/rpc.client';
import { isTransactionHashFormat } from '../../src/blockchain/transaction';
import { env } from '../../src/config/env';
import { getNetwork } from '../../src/config/networks';
import {
  MOCK_ADDRESS,
  MOCK_BLOCK_NUMBER_HEX,
  MOCK_NATIVE_BALANCE_HEX,
  MOCK_TX_HASH,
  RPC_METHODS,
} from '../../src/utils/mockData';

const SEND_TRANSACTION_PARAMS: readonly unknown[] = [
  { from: MOCK_ADDRESS, to: '0x0000000000000000000000000000000000000000', value: '0x0' },
];

test.describe('@web3 Estados de transacción — provider mockeado', () => {
  test('emite el hash del spec y resuelve un receipt exitoso (0x1) completo', async ({
    web3Page,
  }) => {
    await web3Page.openMockDApp();

    const hash = (await web3Page.request(
      RPC_METHODS.ethSendTransaction,
      SEND_TRANSACTION_PARAMS,
    )) as string;
    expect(hash).toBe(MOCK_TX_HASH);
    expect(isTransactionHashFormat(hash)).toBe(true);

    const receipt = (await web3Page.request('eth_getTransactionReceipt', [MOCK_TX_HASH])) as Record<
      string,
      unknown
    >;
    expect(receipt).toMatchObject({
      transactionHash: MOCK_TX_HASH,
      from: MOCK_ADDRESS,
      status: '0x1',
      blockNumber: MOCK_BLOCK_NUMBER_HEX, // 21_500_000
      gasUsed: '0x5208', // 21000: transferencia estándar
      logs: [],
    });
  });

  test('saldo nativo determinista en wei (12.5 ETH) y cuenta nula a 0x0', async ({ web3Page }) => {
    await web3Page.openMockDApp();

    const balanceHex = (await web3Page.request(RPC_METHODS.ethGetBalance, [
      MOCK_ADDRESS,
      'latest',
    ])) as string;
    expect(balanceHex).toBe(MOCK_NATIVE_BALANCE_HEX);
    expect(BigInt(balanceHex)).toBe(12_500_000_000_000_000_000n);

    const zeroAddress = '0x0000000000000000000000000000000000000000';
    expect(await web3Page.request(RPC_METHODS.ethGetBalance, [zeroAddress, 'latest'])).toBe('0x0');
  });

  test('chainChanged (emitido por el mock) llega a los oyentes de la DApp', async ({
    web3Page,
  }) => {
    await web3Page.openMockDApp();

    await web3Page.page.evaluate(() => {
      window.__dexfloEvents = [];
      window.ethereum?.on('chainChanged', (payload: unknown) => {
        window.__dexfloEvents?.push(payload);
      });
    });

    const base = getNetwork('base');
    await web3Page.configureWallet({
      chainIdHex: base.hexChainId,
      networkVersion: String(base.chainId),
    });

    const emitted = (await web3Page.page.evaluate(() => window.__dexfloEvents)) as unknown[];
    expect(emitted).toEqual([base.hexChainId]);
    expect((await web3Page.state()).chainIdHex).toBe(base.hexChainId);
  });
});

test.describe('@web3 @integration Estados de transacción — contractual (RPC real)', () => {
  test('lecturas acotadas en cadena (bloque actual y balance del wallet)', async () => {
    test.skip(
      env.rpcUrl === null,
      'RPC_URL no está configurada: el caso contractual @web3 es opt-in por entorno (docs/plan.md).',
    );
    // Nunca envía transacciones reales; solo lecturas de red (bloque, saldo).
    const client = createDexfloPublicClient();
    expect(await getBlockNumber(client)).toBeGreaterThan(0);
    const wei = await getWalletBalanceWei(client, MOCK_ADDRESS);
    expect(typeof wei).toBe('bigint');
    expect(wei >= 0n).toBe(true);
  });
});
