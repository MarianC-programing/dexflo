/**
 * Suite funcional @e2e de conexión de wallet (Fase 6, docs/plan.md): modal,
 * conexión, dirección, chain ID y estados desconectados, contra la sandbox
 * local con la wallet EIP-1193 mockeada.
 *
 * Reemplaza al spec provisional de la Fase 4 (`page-objects.spec.ts`,
 * retirado): los flujos de wallet viven aquí y los de swap en
 * `swap-tokens.spec.ts`. Los eventos en vuelo usan el canal del mock
 * (`configureWallet`), que emite accountsChanged/chainChanged reales.
 */

import { test } from '../../src/fixtures/dappFixture';
import {
  approvingConnectWallet,
  connectedWallet,
  lockedWallet,
  wrongNetwork,
} from '../../src/fixtures/walletScenarios';
import { MOCK_ADDRESS, MOCK_TOKENS } from '../../src/utils/mockData';
import { getNetwork } from '../../src/config/networks';

test.describe('@e2e @smoke Conexión de wallet — modal y conexión', () => {
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

test.describe('@e2e Conexión de wallet — wallet bloqueada', () => {
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

test.describe('@e2e Conexión de wallet — arrancada en otra cadena', () => {
  test.use({ walletState: wrongNetwork('base') });

  test('el botón indica red incorrecta y muestra la cadena de la wallet', async ({ swapPage }) => {
    await swapPage.open();
    await swapPage.expectButtonState('wrong-network');
    await swapPage.wallet.expectChainLabel('0x2105');
  });
});

test.describe('@e2e Conexión de wallet — eventos en vuelo', () => {
  test.use({ walletState: connectedWallet() });

  test('accountsChanged revalida la sesión y pinta la nueva dirección', async ({
    swapPage,
    web3Page,
  }) => {
    await swapPage.open();
    await swapPage.wallet.expectConnected(MOCK_ADDRESS);

    // Dirección determinista del catálogo (valor de ejemplo, no significa DAI).
    const secondAddress = MOCK_TOKENS.dai.address;
    await web3Page.configureWallet({ address: secondAddress });

    await swapPage.wallet.expectConnected(secondAddress);
    swapPage.expectNoPageErrors();
  });

  test('chainChanged actualiza la cadena mostrada en la UI', async ({ swapPage, web3Page }) => {
    await swapPage.open();
    await swapPage.wallet.expectChainLabel('0x1');

    const base = getNetwork('base');
    await web3Page.configureWallet({
      chainIdHex: base.hexChainId,
      networkVersion: String(base.chainId),
    });

    await swapPage.wallet.expectChainLabel(base.hexChainId);
  });
});
