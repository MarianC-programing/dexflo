/**
 * Contrato entre los Page Objects y una DApp concreta.
 *
 * Los Page Objects (`src/page-objects/`) nunca conocen selectores ni URLs: los
 * obtienen de un `DexAdapter`. Cambiar de Uniswap a staging o a la sandbox
 * local es cambiar de adapter, no reescribir tests (docs/plan.md, Fase 4).
 */

import type { Page } from '@playwright/test';

import type { NetworkName } from '../../config/networks';

/** Estado normalizado del botón principal de swap, independiente de la DApp. */
export type SwapButtonState =
  | 'connect'
  | 'wrong-network'
  | 'enter-amount'
  | 'fetching-quote'
  | 'insufficient-balance'
  | 'pending'
  | 'ready'
  | 'unknown';

/** Estado normalizado de la última transacción enviada. */
export type TxStatus = 'none' | 'pending' | 'confirmed' | 'failed' | 'timeout';

export type TokenSide = 'in' | 'out';

/** Selectores CSS/Playwright de los elementos que usan los Page Objects. */
export interface DexSelectors {
  readonly connectButton: string;
  readonly accountAddress: string;
  readonly networkLabel: string;
  readonly walletModal: string;
  readonly walletOptionInjected: string;
  readonly walletModalClose: string;
  readonly walletModalError: string;
  readonly amountIn: string;
  readonly amountOut: string;
  readonly quoteRate: string;
  readonly swapButton: string;
  readonly swapError: string;
  readonly txHash: string;
}

export interface DexAdapter {
  /** Nombre estable para reportes y diagnóstico. */
  readonly name: string;
  readonly selectors: DexSelectors;
  /** URL absoluta de la pantalla de swap para la red indicada. */
  swapUrl(network: NetworkName): string;
  /** Preparación previa a navegar (p. ej. servir la sandbox por `page.route`). */
  prepare(page: Page): Promise<void>;
  /** Dirección tal como la muestra la DApp (abreviada, con elipsis, etc.). */
  formatAddress(address: string): string;
  selectToken(page: Page, side: TokenSide, symbol: string): Promise<void>;
  swapButtonState(page: Page): Promise<SwapButtonState>;
  txStatus(page: Page): Promise<TxStatus>;
}
