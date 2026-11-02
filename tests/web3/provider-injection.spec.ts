/**
 * Pruebas del provider EIP-1193 mockeado (contrato del framework, no de la
 * DApp): conexión, límites de firma/transacción, errores de red y bloqueos.
 * Target: mini-Dapp sintética; sin red ni servicios externos (0% de flake).
 *
 * Nota: `test.use()` solo puede cambiar fixtures a nivel de describe, así
 * que cada escenario del wallet vive en su propio bloque.
 */

import {
  approvingConnectWallet,
  insufficientFundsWallet,
  lockedWallet,
  rejectingTransaction,
  unresponsiveWallet,
  wrongNetwork,
} from '../../src/fixtures/walletScenarios';
import { expect, test } from '../../src/fixtures/web3Fixture';
import { getNetwork } from '../../src/config/networks';
import {
  MOCK_ADDRESS,
  MOCK_ERRORS,
  MOCK_NATIVE_BALANCE_HEX,
  MOCK_SIGNATURE,
  MOCK_TX_HASH,
  RPC_METHODS,
  ZERO_ADDRESS,
} from '../../src/utils/mockData';

const SEND_TRANSACTION_PARAMS: readonly unknown[] = [
  { from: MOCK_ADDRESS, to: ZERO_ADDRESS, value: '0xde0b6b3a7640000' },
];

test.describe('@web3 @smoke — Provider EIP-1193 con cuenta conectada', () => {
  test('expone el contrato completo de window.ethereum con la cuenta conectada', async ({
    web3Page,
    mockAddress,
  }) => {
    await web3Page.openMockDApp();

    const contract = await web3Page.page.evaluate(() => {
      const provider = window.ethereum;
      if (!provider) {
        return null;
      }
      return {
        isMetaMask: provider.isMetaMask,
        isDexfloMock: provider.isDexfloMock,
        chainId: provider.chainId,
        networkVersion: provider.networkVersion,
        selectedAddress: provider.selectedAddress,
      };
    });
    expect(contract).toEqual({
      isMetaMask: true,
      isDexfloMock: true,
      chainId: getNetwork('mainnet').hexChainId,
      networkVersion: '1',
      selectedAddress: mockAddress,
    });

    expect(await web3Page.request(RPC_METHODS.ethAccounts)).toEqual([mockAddress]);
    expect(await web3Page.request(RPC_METHODS.ethChainId)).toBe('0x1');
    expect(await web3Page.request('net_version')).toBe('1');
    expect(await web3Page.request(RPC_METHODS.ethGetBalance, [mockAddress])).toBe(
      MOCK_NATIVE_BALANCE_HEX,
    );
    expect(await web3Page.request(RPC_METHODS.ethGetBalance, [ZERO_ADDRESS])).toBe('0x0');
  });

  test('devuelve la firma determinista para personal_sign', async ({ web3Page }) => {
    await web3Page.openMockDApp();
    const signature = await web3Page.request(RPC_METHODS.personalSign, [
      '0x446578666c6f207061793a20646973636f70756a6f207665726966696361626c65',
      MOCK_ADDRESS,
    ]);
    expect(signature).toBe(MOCK_SIGNATURE);
  });

  test('emite el hash determinista y resuelve el receipt en el estado final', async ({
    web3Page,
  }) => {
    await web3Page.openMockDApp();
    const transactionHash = await web3Page.request(
      RPC_METHODS.ethSendTransaction,
      SEND_TRANSACTION_PARAMS,
    );
    expect(transactionHash).toBe(MOCK_TX_HASH);

    const receipt = await web3Page.request('eth_getTransactionReceipt', [MOCK_TX_HASH]);
    expect(receipt).toMatchObject({ transactionHash: MOCK_TX_HASH, status: '0x1' });
  });

  test('método RPC no soportado responde con 4200', async ({ web3Page }) => {
    await web3Page.openMockDApp();
    const error = await web3Page.requestCapturingError('wallet_watchAsset');
    expect(error).toEqual({
      code: MOCK_ERRORS.methodNotSupported.code,
      message: MOCK_ERRORS.methodNotSupported.message,
    });
  });
});

test.describe('@web3 Provider EIP-1193 — transacción rechazada (4010)', () => {
  test.use({ walletState: rejectingTransaction() });

  test('rechaza la transacción con el código definido por el spec', async ({ web3Page }) => {
    await web3Page.openMockDApp();
    const error = await web3Page.requestCapturingError(
      RPC_METHODS.ethSendTransaction,
      SEND_TRANSACTION_PARAMS,
    );
    expect(error).toEqual({
      code: MOCK_ERRORS.userRejectedTransaction.code,
      message: MOCK_ERRORS.userRejectedTransaction.message,
    });
  });
});

test.describe('@web3 Provider EIP-1193 — cuenta bloqueada', () => {
  test.use({ walletState: lockedWallet() });

  test('expone lista vacía y permisos sin autorizar (4100)', async ({ web3Page }) => {
    await web3Page.openMockDApp();

    expect(await web3Page.request(RPC_METHODS.ethAccounts)).toEqual([]);
    expect((await web3Page.state()).address).toBeNull();

    const permissionsError = await web3Page.requestCapturingError('wallet_getPermissions');
    expect(permissionsError?.code).toBe(MOCK_ERRORS.unauthorized.code);
  });
});

test.describe('@web3 Provider EIP-1193 — conexión con aprobación automática', () => {
  test.use({ walletState: approvingConnectWallet() });

  test('fija la cuenta y emite el evento accountsChanged', async ({ web3Page }) => {
    await web3Page.openMockDApp();

    await web3Page.page.evaluate(() => {
      window.__dexfloEvents = [];
      window.ethereum?.on('accountsChanged', (payload: unknown) => {
        window.__dexfloEvents?.push(payload);
      });
    });

    expect(await web3Page.request(RPC_METHODS.ethRequestAccounts)).toEqual([MOCK_ADDRESS]);

    const emittedEvents = await web3Page.page.evaluate(() => window.__dexfloEvents);
    expect(emittedEvents).toEqual([[MOCK_ADDRESS]]);
    expect((await web3Page.state()).address).toBe(MOCK_ADDRESS);
  });
});

test.describe('@web3 Provider EIP-1193 — red incorrecta', () => {
  test.use({ walletState: wrongNetwork('base') });

  test('arranca en otra cadena y rechaza la conmutación manual', async ({ web3Page }) => {
    await web3Page.openMockDApp();
    const baseChainId = getNetwork('base').hexChainId;
    expect(await web3Page.request(RPC_METHODS.ethChainId)).toBe(baseChainId);

    const switchError = await web3Page.requestCapturingError('wallet_switchEthereumChain', [
      { chainId: '0x1' },
    ]);
    expect(switchError).toEqual({
      code: MOCK_ERRORS.userRejectedRequest.code,
      message: MOCK_ERRORS.userRejectedRequest.message,
    });
    expect(await web3Page.request(RPC_METHODS.ethChainId)).toBe(baseChainId);
  });
});

test.describe('@web3 Provider EIP-1193 — saldo insuficiente', () => {
  test.use({ walletState: insufficientFundsWallet() });

  test('falla con -32000 y el mensaje clásico de geth', async ({ web3Page }) => {
    await web3Page.openMockDApp();
    const error = await web3Page.requestCapturingError(
      RPC_METHODS.ethSendTransaction,
      SEND_TRANSACTION_PARAMS,
    );
    expect(error).toEqual({
      code: MOCK_ERRORS.insufficientFunds.code,
      message: MOCK_ERRORS.insufficientFunds.message,
    });
  });
});

test.describe('@web3 Provider EIP-1193 — timeout de red simulado', () => {
  test.use({ walletState: unresponsiveWallet([RPC_METHODS.ethSendTransaction]) });

  test('el método RPC colgado queda pendiente dentro del plazo establecido', async ({
    web3Page,
  }) => {
    await web3Page.openMockDApp();

    const stayedPending = await web3Page.page.evaluate(
      (method: string): Promise<boolean> =>
        new Promise<boolean>((resolve) => {
          const provider = window.ethereum;
          if (!provider) {
            throw new Error('window.ethereum no está disponible');
          }
          provider.request({ method, params: [] }).then(
            () => {
              resolve(false);
            },
            () => {
              resolve(false);
            },
          );
          setTimeout(() => {
            resolve(true);
          }, 150);
        }),
      RPC_METHODS.ethSendTransaction,
    );
    expect(stayedPending).toBe(true);
  });
});
