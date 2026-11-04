/**
 * Base de los Page Objects: navegación, esperas basadas en estado y
 * diagnóstico. Prohibido `page.waitForTimeout`: toda espera es un estado del
 * DOM (`expect`/`expect.poll`) o una respuesta de red (docs/plan.md, Fase 4).
 */

import { expect, type Locator, type Page } from '@playwright/test';

import type { DexAdapter } from '../domain/adapters/dex-adapter';

export interface PageDiagnostics {
  readonly url: string;
  readonly adapter: string;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
}

export class BasePage {
  private readonly consoleErrors: string[] = [];
  private readonly pageErrors: string[] = [];

  constructor(
    readonly page: Page,
    protected readonly adapter: DexAdapter,
  ) {
    page.on('console', (message) => {
      if (message.type() === 'error') {
        this.consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      this.pageErrors.push(error.message);
    });
  }

  protected locator(selector: string): Locator {
    return this.page.locator(selector);
  }

  /** Prepara el adapter, navega y espera a que el elemento clave sea visible. */
  protected async openUrl(url: string, readyLocator: Locator): Promise<void> {
    await this.adapter.prepare(this.page);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(readyLocator).toBeVisible();
  }

  /** Instantánea para adjuntar a un fallo (URL, adapter y errores del navegador). */
  diagnostics(): PageDiagnostics {
    return {
      url: this.page.url(),
      adapter: this.adapter.name,
      consoleErrors: [...this.consoleErrors],
      pageErrors: [...this.pageErrors],
    };
  }

  /** Falla si la DApp lanzó excepciones no controladas. */
  expectNoPageErrors(): void {
    expect(this.pageErrors, 'excepciones no controladas en la página').toEqual([]);
  }
}
