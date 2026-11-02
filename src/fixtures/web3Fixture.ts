/**
 * Fixture `web3Page`: inyecta el provider EIP-1193 mockeado antes de que la
 * DApp cargue y expone utilidades tipadas para dirigirlo desde los tests.
 *
 * Personalización por test:
 *   test.use({ walletState: rejectingTransaction() })  // presets de Fase 6
 *
 * El fixture no conoce selectores de la DApp (eso es Page Object, Fase 4):
 * opera al nivel del contrato EIP-1193, por lo que sirve con Uniswap,
 * staging o una DApp local sin cambios.
 *
 * Regla de serialización: todo lo que cruza de Node a página (y viceversa)
 * debe ser data pura. Las funciones del controlador se ejecutan SIEMPRE
 * dentro de `page.evaluate` — devolverlas desde el navegador las borra.
 */

import { test as base, type Page } from '@playwright/test';

import { MOCK_ADDRESS } from '../utils/mockData';
import { injectEip1193Provider, type Eip1193MockBootstrap, type WalletMockState } from './eip1193';
import { connectedWallet, createBootstrap } from './walletScenarios';

/** Página + canal de control del provider mockeado. */
export interface Web3TestPage {
  readonly page: Page;
  /** Dirección inicial del provider (puede mutarse con configureWallet). */
  readonly initialAddress: string | null;
  /** Chain hex inicial del provider. */
  readonly initialChainIdHex: string;
  /** Página mínima sobre la que se valida la inyección (sin target real). */
  openMockDApp(): Promise<void>;
  /** request() de EIP-1193 con la serialización de Playwright. */
  request(method: string, params?: readonly unknown[]): Promise<unknown>;
  /** Igual que request(), pero captura el error EIP-1193 ({code,message}). */
  requestCapturingError(
    method: string,
    params?: readonly unknown[],
  ): Promise<{ code: number; message: string } | null>;
  /** Parchea el estado del provider en caliente y emite eventos si aplica. */
  configureWallet(patch: Partial<WalletMockState>): Promise<void>;
  /** Emite un evento EIP-1193 hacia los listeners que la DApp registró. */
  emitWalletEvent(event: string, payload: unknown): Promise<void>;
  /** Copia del estado vigente del mock (data serializable, sin funciones). */
  state(): Promise<WalletMockState>;
}

const MOCK_DAPP_URL = 'data:text/html,<title>Dexflo Provider Sandbox</title>';

const requestArgs = (
  method: string,
  params?: readonly unknown[],
): { method: string; params: readonly unknown[] } => ({
  method,
  params: params ?? [],
});

export function buildWeb3TestPage(page: Page, bootstrap: Eip1193MockBootstrap): Web3TestPage {
  return {
    page,
    initialAddress: bootstrap.wallet.address,
    initialChainIdHex: bootstrap.wallet.chainIdHex,

    openMockDApp: async (): Promise<void> => {
      await page.goto(MOCK_DAPP_URL);
    },

    request: async (method, params): Promise<unknown> =>
      await page.evaluate(
        (args) => {
          const provider = window.ethereum;
          if (!provider) {
            throw new Error('window.ethereum no está disponible');
          }
          return provider.request({ method: args.method, params: args.params });
        },
        requestArgs(method, params),
      ),

    requestCapturingError: async (method, params) =>
      await page.evaluate(
        async (args) => {
          const provider = window.ethereum;
          if (!provider) {
            throw new Error('window.ethereum no está disponible');
          }
          try {
            await provider.request({ method: args.method, params: args.params });
            return null;
          } catch (caught) {
            const caughtError = caught as { code?: number; message?: string };
            return {
              code: caughtError.code ?? -1,
              message: caughtError.message ?? String(caught),
            };
          }
        },
        requestArgs(method, params),
      ),

    configureWallet: async (patch): Promise<void> => {
      await page.evaluate((patchPayload) => {
        const controller = window.__dexfloWallet;
        if (!controller) {
          throw new Error('El provider EIP-1193 mockeado no está disponible.');
        }
        controller.configure(patchPayload);
      }, patch);
    },

    emitWalletEvent: async (event, payload): Promise<void> => {
      await page.evaluate(
        (eventPayload) => {
          const controller = window.__dexfloWallet;
          if (!controller) {
            throw new Error('El provider EIP-1193 mockeado no está disponible.');
          }
          controller.emit(eventPayload.event, eventPayload.payload);
        },
        { event, payload },
      );
    },

    state: async (): Promise<WalletMockState> =>
      await page.evaluate(() => {
        const controller = window.__dexfloWallet;
        if (!controller) {
          throw new Error('El provider EIP-1193 mockeado no está disponible.');
        }
        return controller.state();
      }),
  };
}

// ============================================================================
// Fixture pública
// ============================================================================

export interface Web3Fixtures {
  /** Dirección que eth_accounts/eth_requestAccounts exponen por defecto. */
  mockAddress: string;
  /** Estado inicial del wallet mockeado (controlable con test.use). */
  walletState: WalletMockState;
  /** Página con el provider EIP-1193 inyectado + utilidades de control. */
  web3Page: Web3TestPage;
}

export const test = base.extend<Web3Fixtures>({
  mockAddress: MOCK_ADDRESS,

  walletState: async ({ mockAddress }, use) => {
    await use(connectedWallet({ address: mockAddress }));
  },

  web3Page: async ({ page, walletState }, use) => {
    const bootstrap = createBootstrap(walletState);
    /**
     * Nota: `addInitScript` serializa la función: sólo puede referenciar su
     * argumento (`bootstrap`), nunca variables de módulo — así vive
     * `injectEip1193Provider`, escrita a propósito autocontenida.
     */
    await page.addInitScript(injectEip1193Provider, bootstrap);
    await use(buildWeb3TestPage(page, bootstrap));
  },
});

export { expect } from '@playwright/test';
