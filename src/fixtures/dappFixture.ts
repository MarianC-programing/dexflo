/**
 * Fixture de DApp: añade al provider mockeado (`web3Page`) un `DexAdapter` y
 * el Page Object `swapPage`. El adapter se elige con `DAPP_TARGET` y puede
 * sustituirse por test: `test.use({ adapter: createSandboxAdapter({...}) })`.
 */

import { env } from '../config/env';
import { resolveAdapter, type DexAdapter } from '../domain/adapters';
import { SwapPage } from '../page-objects/swap.page';
import { test as web3Test } from './web3Fixture';

export interface DappFixtures {
  adapter: DexAdapter;
  swapPage: SwapPage;
}

export const test = web3Test.extend<DappFixtures>({
  // Playwright exige desestructurar el primer argumento; este fixture no depende de otros.
  // eslint-disable-next-line no-empty-pattern
  adapter: async ({}, use) => {
    await use(resolveAdapter(env.dappTarget, env.baseUrl));
  },

  swapPage: async ({ web3Page, adapter }, use) => {
    // `web3Page` garantiza que el provider se inyecta antes de navegar.
    await use(new SwapPage(web3Page.page, adapter));
  },
});

export { expect } from './web3Fixture';
