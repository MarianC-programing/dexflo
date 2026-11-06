/**
 * Pantalla de swap: tokens, importes, cotización, estado del botón,
 * ejecución y errores. Independiente de la DApp (usa un `DexAdapter`).
 */

import { expect } from '@playwright/test';

import type { Page } from '@playwright/test';

import { env } from '../config/env';
import type { NetworkName } from '../config/networks';
import type { DexAdapter, SwapButtonState, TxStatus } from '../domain/adapters/dex-adapter';
import { BasePage, type OpenUrlOptions } from './base.page';
import { WalletModal } from './wallet-modal.component';

export class SwapPage extends BasePage {
  readonly wallet: WalletModal;

  constructor(page: Page, adapter: DexAdapter) {
    super(page, adapter);
    this.wallet = new WalletModal(page, adapter);
  }

  async open(network: NetworkName = env.networkName, options: OpenUrlOptions = {}): Promise<void> {
    await this.openUrl(
      this.adapter.swapUrl(network),
      this.locator(this.adapter.selectors.swapButton),
      options,
    );
  }

  async selectTokens(from: string, to: string): Promise<void> {
    await this.adapter.selectToken(this.page, 'in', from);
    await this.adapter.selectToken(this.page, 'out', to);
  }

  async enterAmount(value: string): Promise<void> {
    await this.locator(this.adapter.selectors.amountIn).fill(value);
  }

  async expectQuote(amountOut: string | RegExp): Promise<void> {
    await expect(this.locator(this.adapter.selectors.amountOut)).toHaveText(amountOut);
  }

  async expectRate(rate: string | RegExp): Promise<void> {
    await expect(this.locator(this.adapter.selectors.quoteRate)).toHaveText(rate);
  }

  async buttonState(): Promise<SwapButtonState> {
    return await this.adapter.swapButtonState(this.page);
  }

  async expectButtonState(expected: SwapButtonState): Promise<void> {
    await expect
      .poll(async () => await this.buttonState(), { message: 'estado del botón de swap' })
      .toBe(expected);
  }

  /** Pulsa el botón principal; exige estado `ready` para no clicar a ciegas. */
  async submit(): Promise<void> {
    await this.expectButtonState('ready');
    await this.locator(this.adapter.selectors.swapButton).click();
  }

  async expectTxStatus(expected: TxStatus): Promise<void> {
    await expect
      .poll(async () => await this.adapter.txStatus(this.page), {
        message: 'estado de la transacción',
      })
      .toBe(expected);
  }

  async expectTxHash(hash: string): Promise<void> {
    await expect(this.locator(this.adapter.selectors.txHash)).toHaveText(hash);
  }

  async expectError(message: string | RegExp): Promise<void> {
    await expect(this.locator(this.adapter.selectors.swapError)).toHaveText(message);
  }
}
