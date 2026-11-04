/**
 * Adapter de REFERENCIA para la interfaz pública de Uniswap.
 *
 * ESTADO: sin verificar contra la UI real. Uniswap cambia su DOM sin aviso y
 * esta suite no depende de servicios externos en CI (docs/plan.md), por lo que
 * el target ejecutado por defecto es la sandbox. Antes de activar
 * `DAPP_TARGET=uniswap` hay que:
 *   1. validar los selectores y la URL contra la UI vigente;
 *   2. implementar `selectToken` y `txStatus` (hoy lanzan un error explícito
 *      para no fingir un comportamiento no comprobado).
 * Toda adaptación vive en este archivo; los Page Objects y los tests no cambian.
 */

import type { Page } from '@playwright/test';

import { getNetwork, type NetworkName } from '../../config/networks';
import type { DexAdapter, SwapButtonState, TxStatus } from './dex-adapter';

const UNISWAP_BASE_URL = 'https://app.uniswap.org';

/** Slugs de red del parámetro `chain` de la UI (por verificar). */
const UNISWAP_CHAIN_SLUGS: Readonly<Record<NetworkName, string>> = {
  mainnet: 'ethereum',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  sepolia: 'ethereum_sepolia',
};

const NOT_IMPLEMENTED = (operation: string): Error =>
  new Error(
    `[uniswap.adapter] "${operation}" no está implementado: valida primero la UI vigente (ver cabecera del archivo) o usa DAPP_TARGET=sandbox.`,
  );

/** Texto del botón principal → estado normalizado (inglés; por verificar). */
function mapButtonText(text: string): SwapButtonState {
  const normalized = text.trim().toLowerCase();
  if (normalized.startsWith('connect')) return 'connect';
  if (normalized.includes('wrong network') || normalized.startsWith('switch'))
    return 'wrong-network';
  if (normalized.startsWith('enter an amount')) return 'enter-amount';
  if (normalized.startsWith('insufficient')) return 'insufficient-balance';
  if (normalized === 'swap') return 'ready';
  return 'unknown';
}

export function createUniswapAdapter(baseUrl: string = UNISWAP_BASE_URL): DexAdapter {
  return {
    name: 'uniswap',
    selectors: {
      connectButton: 'button:has-text("Connect")',
      accountAddress: '[data-testid="account-display"]',
      networkLabel: '[data-testid="chain-selector"]',
      walletModal: '[role="dialog"]',
      walletOptionInjected: '[role="dialog"] button:has-text("Injected")',
      walletModalClose: '[role="dialog"] [aria-label="Close"]',
      walletModalError: '[role="dialog"] [role="alert"]',
      amountIn: 'input[inputmode="decimal"] >> nth=0',
      amountOut: 'input[inputmode="decimal"] >> nth=1',
      quoteRate: '[data-testid="trade-summary"]',
      swapButton: '[data-testid="swap-button"]',
      swapError: '[role="alert"]',
      txHash: 'a[href*="/tx/"]',
    },

    swapUrl: (network: NetworkName): string => {
      const slug = UNISWAP_CHAIN_SLUGS[network];
      return `${baseUrl}/swap?chain=${slug}&chainId=${String(getNetwork(network).chainId)}`;
    },

    prepare: async (): Promise<void> => {
      // La UI real se carga desde Internet; no hay nada que servir localmente.
    },

    formatAddress: (address: string): string => `${address.slice(0, 5)}...${address.slice(-3)}`,

    selectToken: (): Promise<void> => Promise.reject(NOT_IMPLEMENTED('selectToken')),

    swapButtonState: async (page: Page): Promise<SwapButtonState> => {
      const text = await page.locator('[data-testid="swap-button"]').innerText();
      return mapButtonText(text);
    },

    txStatus: (): Promise<TxStatus> => Promise.reject(NOT_IMPLEMENTED('txStatus')),
  };
}
