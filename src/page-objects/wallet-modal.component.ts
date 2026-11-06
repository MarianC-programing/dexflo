/** Modal de conexión de wallet: apertura, conexión, dirección y red. */

import { expect, type Locator, type Page } from '@playwright/test';

import type { DexAdapter } from '../domain/adapters/dex-adapter';

export class WalletModal {
  constructor(
    private readonly page: Page,
    private readonly adapter: DexAdapter,
  ) {}

  private get dialog(): Locator {
    return this.page.locator(this.adapter.selectors.walletModal);
  }

  private get account(): Locator {
    return this.page.locator(this.adapter.selectors.accountAddress);
  }

  async open(): Promise<void> {
    await this.page.locator(this.adapter.selectors.connectButton).click();
    await expect(this.dialog).toBeVisible();
  }

  async connectWithInjectedWallet(): Promise<void> {
    await this.page.locator(this.adapter.selectors.walletOptionInjected).click();
  }

  async close(): Promise<void> {
    await this.page.locator(this.adapter.selectors.walletModalClose).click();
    await expect(this.dialog).toBeHidden();
  }

  async expectOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
  }

  async expectClosed(): Promise<void> {
    await expect(this.dialog).toBeHidden();
  }

  async expectConnected(address: string): Promise<void> {
    await expect(this.account).toHaveText(this.adapter.formatAddress(address));
    await expect(this.dialog).toBeHidden();
  }

  async expectDisconnected(): Promise<void> {
    await expect(this.account).toBeHidden();
  }

  async expectError(message: string | RegExp): Promise<void> {
    await expect(this.page.locator(this.adapter.selectors.walletModalError)).toHaveText(message);
  }

  async expectChainLabel(label: string | RegExp): Promise<void> {
    await expect(this.page.locator(this.adapter.selectors.networkLabel)).toHaveText(label);
  }
}
