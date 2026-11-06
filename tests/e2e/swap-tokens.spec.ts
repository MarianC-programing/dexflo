/**
 * Suite funcional @e2e de swap de tokens (Fase 6, docs/plan.md): cotización,
 * habilitación del botón, emisión del hash y estado final, además de los
 * escenarios de error pactados (rechazo 4010, -32000 y timeout de red).
 *
 * Reemplaza al spec provisional de la Fase 4 (`page-objects.spec.ts`,
 * retirado). El feed de precios se intercepta con los overlays EXACTOS de
 * `src/network/routes.ts` (Fase 5) para simular alimentación caída sin
 * tocar el resto de las rutas del adapter.
 */

import { test } from '../../src/fixtures/dappFixture';
import { interceptPrices } from '../../src/network/routes';
import {
  connectedWallet,
  insufficientFundsWallet,
  rejectingTransaction,
  unresponsiveWallet,
} from '../../src/fixtures/walletScenarios';
import { MOCK_ADDRESS, MOCK_TX_HASH, RPC_METHODS } from '../../src/utils/mockData';
import { createSandboxAdapter } from '../../src/domain/adapters';

test.describe('@e2e @smoke Swap de tokens — flujo completo', () => {
  test.use({ walletState: connectedWallet() });

  test('reconecta sola, cotiza y emite el hash con estado final confirmado', async ({
    swapPage,
  }) => {
    await swapPage.open();
    await swapPage.wallet.expectConnected(MOCK_ADDRESS);

    await swapPage.selectTokens('ETH', 'USDC');
    await swapPage.enterAmount('1');
    await swapPage.expectQuote('3000.0000');
    await swapPage.expectRate('1 ETH = 3000.0000 USDC');

    await swapPage.submit();
    await swapPage.expectTxHash(MOCK_TX_HASH);
    await swapPage.expectTxStatus('confirmed');
    swapPage.expectNoPageErrors();
  });

  test('saldo insuficiente (importe mayor al balance) bloquea el botón', async ({ swapPage }) => {
    await swapPage.open();
    await swapPage.enterAmount('13');
    await swapPage.expectButtonState('insufficient-balance');
  });

  test('sin importe el botón pide ingresar una cantidad', async ({ swapPage }) => {
    await swapPage.open();
    await swapPage.enterAmount('');
    await swapPage.expectButtonState('enter-amount');
  });

  test('el error del feed de precios (HTTP 500) deja el botón en fetching-quote', async ({
    swapPage,
  }) => {
    await swapPage.open(undefined, {
      overlayNetwork: (page) => interceptPrices(page, { status: 500 }),
    });
    await swapPage.wallet.expectConnected(MOCK_ADDRESS);
    await swapPage.enterAmount('1');

    await swapPage.expectButtonState('fetching-quote');
    await swapPage.expectQuote('');
    await swapPage.expectRate('');
  });

  test('un feed abortado (timeout de red) no rompe la DApp y sigue sin cotizar', async ({
    swapPage,
  }) => {
    await swapPage.open(undefined, {
      overlayNetwork: (page) => interceptPrices(page, { abort: true }),
    });
    await swapPage.wallet.expectConnected(MOCK_ADDRESS);
    await swapPage.enterAmount('1');

    await swapPage.expectButtonState('fetching-quote');
    await swapPage.expectQuote('');
    await swapPage.expectRate('');
  });
});

test.describe('@e2e Swap de tokens — transacción rechazada (4010)', () => {
  test.use({ walletState: rejectingTransaction() });

  test('muestra el error 4010 y deja el estado en fallido', async ({ swapPage }) => {
    await swapPage.open();
    await swapPage.enterAmount('1');
    await swapPage.submit();

    await swapPage.expectError('Transaction rejected (4010)');
    await swapPage.expectTxStatus('failed');
    await swapPage.expectButtonState('ready');
  });
});

test.describe('@e2e Swap de tokens — saldo insuficiente para gas (-32000)', () => {
  test.use({ walletState: insufficientFundsWallet() });

  test('muestra el error -32000 de la wallet', async ({ swapPage }) => {
    await swapPage.open();
    await swapPage.enterAmount('1');
    await swapPage.submit();

    await swapPage.expectError('Insufficient funds for gas (-32000)');
    await swapPage.expectTxStatus('failed');
  });
});

test.describe('@e2e Swap de tokens — timeout de red', () => {
  test.use({
    walletState: unresponsiveWallet([RPC_METHODS.ethSendTransaction]),
    adapter: createSandboxAdapter({ requestTimeoutMs: 300 }),
  });

  test('una wallet que no responde termina en timeout controlado', async ({ swapPage }) => {
    await swapPage.open();
    await swapPage.enterAmount('1');
    await swapPage.submit();

    await swapPage.expectError('Request timed out');
    await swapPage.expectTxStatus('timeout');
  });
});
