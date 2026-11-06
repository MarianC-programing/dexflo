/**
 * Adapter de la sandbox local (`src/domain/sandbox/sandbox-dapp.ts`).
 * Sirve la DApp con `page.route` y el feed de precios determinista; no usa
 * red ni servidores. Es el target por defecto de la suite.
 */

import type { Page } from '@playwright/test';

import { getNetwork } from '../../config/networks';
import { buildPriceFeedJson } from '../../utils/mockData';
import {
  SANDBOX_DEFAULT_TIMEOUT_MS,
  SANDBOX_HTML,
  SANDBOX_ORIGIN,
  SANDBOX_PRICES_PATH,
  SANDBOX_SELECTORS,
  SANDBOX_TOKEN_IN_SELECTOR,
  SANDBOX_TOKEN_OUT_SELECTOR,
  SANDBOX_TX_STATUS_SELECTOR,
} from '../sandbox/sandbox-dapp';
import type { DexAdapter, SwapButtonState, TokenSide, TxStatus } from './dex-adapter';

export interface SandboxAdapterOptions {
  /** Timeout (ms) de peticiones a la wallet dentro de la DApp. */
  readonly requestTimeoutMs?: number;
  /** Cadena que la DApp considera correcta (hex). Por defecto, mainnet. */
  readonly expectedChainIdHex?: string;
}

const BUTTON_STATES: readonly SwapButtonState[] = [
  'connect',
  'wrong-network',
  'enter-amount',
  'fetching-quote',
  'insufficient-balance',
  'pending',
  'ready',
];

const TX_STATUSES: readonly TxStatus[] = ['pending', 'confirmed', 'failed', 'timeout'];

function isButtonState(value: string | null): value is SwapButtonState {
  return value !== null && (BUTTON_STATES as readonly string[]).includes(value);
}

function isTxStatus(value: string | null): value is TxStatus {
  return value !== null && (TX_STATUSES as readonly string[]).includes(value);
}

export function createSandboxAdapter(options: SandboxAdapterOptions = {}): DexAdapter {
  const timeoutMs = options.requestTimeoutMs ?? SANDBOX_DEFAULT_TIMEOUT_MS;
  const expectedChain = options.expectedChainIdHex ?? getNetwork('mainnet').hexChainId;

  return {
    name: 'sandbox',
    selectors: SANDBOX_SELECTORS,

    swapUrl: (): string =>
      `${SANDBOX_ORIGIN}/?chain=${expectedChain}&timeoutMs=${String(timeoutMs)}`,

    prepare: async (page: Page): Promise<void> => {
      await page.route(`${SANDBOX_ORIGIN}/**`, async (route) => {
        const { pathname } = new URL(route.request().url());
        if (pathname === SANDBOX_PRICES_PATH) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: buildPriceFeedJson(),
          });
          return;
        }
        if (pathname === '/') {
          await route.fulfill({ status: 200, contentType: 'text/html', body: SANDBOX_HTML });
          return;
        }
        await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
      });
    },

    formatAddress: (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`,

    selectToken: async (page: Page, side: TokenSide, symbol: string): Promise<void> => {
      const selector = side === 'in' ? SANDBOX_TOKEN_IN_SELECTOR : SANDBOX_TOKEN_OUT_SELECTOR;
      await page.locator(selector).selectOption(symbol);
    },

    swapButtonState: async (page: Page): Promise<SwapButtonState> => {
      const value = await page.locator(SANDBOX_SELECTORS.swapButton).getAttribute('data-state');
      return isButtonState(value) ? value : 'unknown';
    },

    txStatus: async (page: Page): Promise<TxStatus> => {
      const value = await page.locator(SANDBOX_TX_STATUS_SELECTOR).getAttribute('data-state');
      return isTxStatus(value) ? value : 'none';
    },
  };
}
