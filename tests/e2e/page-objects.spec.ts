/**
 * Contrato de los Page Objects de la Fase 4 contra la sandbox local.
 * Valida `SwapPage` + `WalletModal` + `DexAdapter`; las suites funcionales de
 * negocio (connect-wallet, swap-tokens) llegan en la Fase 6 sobre esta base.
 */

import { createSandboxAdapter } from '../../src/domain/adapters';
import { test } from '../../src/fixtures/dappFixture';
import {
  approvingConnectWallet,
  connectedWallet,
  insufficientFundsWallet,
  lockedWallet,
  rejectingTransaction,
  unresponsiveWallet,
  wrongNetwork,
} from '../../src/fixtures/walletScenarios';
import { MOCK_ADDRESS, MOCK_TX_HASH, RPC_METHODS } from '../../src/utils/mockData';

test.describe('@e2e @smoke Page Objects — conexión de wallet', () => {
  test.use({ walletState: approvingConnectWallet() });

  test('abre el modal, conecta la wallet inyectada y muestra la dirección', async ({
    swapPage,
  }) => {
    await swapPage.open();
    await swapPage.expectButtonState('connect');
    await swapPage.wallet.expectDisconnected();

    await swapPage.wallet.open();
    await swapPage.wallet.connectWithInjectedWallet();

    await swapPage.wallet.expectConnected(MOCK_ADDRESS);
    await swapPage.wallet.expectChainLabel('0x1');
    await swapPage.expectButtonState('enter-amount');
    swapPage.expectNoPageErrors();
  });

  test('el modal se puede cerrar sin conectar', async ({ swapPage }) => {
    await swapPage.open();
    await swapPage.wallet.open();
    await swapPage.wallet.close();
    await swapPage.wallet.expectDisconnected();
  });
});

test.describe('@e2e Page Objects — wallet bloqueada', () => {
  test.use({ walletState: lockedWallet() });

  test('sin autorización muestra el error en el modal y sigue desconectada', async ({
    swapPage,
  }) => {
    await swapPage.open();
    await swapPage.wallet.open();
    await swapPage.wallet.connectWithInjectedWallet();

    await swapPage.wallet.expectError('No accounts authorized');
    await swapPage.wallet.expectOpen();
    await swapPage.wallet.expectDisconnected();
  });
});

test.describe('@e2e @smoke Page Objects — swap con wallet conectada', () => {
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
    await swapPage.expectButtonState('enter-amount');
  });
});

test.describe('@e2e Page Objects — red incorrecta', () => {
  test.use({ walletState: wrongNetwork('base') });

  test('el botón indica red incorrecta y muestra la cadena de la wallet', async ({ swapPage }) => {
    await swapPage.open();
    await swapPage.expectButtonState('wrong-network');
    await swapPage.wallet.expectChainLabel('0x2105');
  });
});

test.describe('@e2e Page Objects — transacción rechazada (4010)', () => {
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

test.describe('@e2e Page Objects — saldo insuficiente para gas (-32000)', () => {
  test.use({ walletState: insufficientFundsWallet() });

  test('muestra el error -32000 de la wallet', async ({ swapPage }) => {
    await swapPage.open();
    await swapPage.enterAmount('1');
    await swapPage.submit();

    await swapPage.expectError('Insufficient funds for gas (-32000)');
    await swapPage.expectTxStatus('failed');
  });
});

test.describe('@e2e Page Objects — timeout de red', () => {
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
