import type { DappTarget } from '../../config/env';
import type { DexAdapter } from './dex-adapter';
import { createSandboxAdapter } from './sandbox.adapter';
import { createUniswapAdapter } from './uniswap.adapter';

export type { DexAdapter, DexSelectors, SwapButtonState, TokenSide, TxStatus } from './dex-adapter';
export { createSandboxAdapter } from './sandbox.adapter';
export { createUniswapAdapter } from './uniswap.adapter';

/** Resuelve el adapter a partir de `DAPP_TARGET` (src/config/env.ts). */
export function resolveAdapter(target: DappTarget, baseUrl: string): DexAdapter {
  switch (target) {
    case 'sandbox':
      return createSandboxAdapter();
    case 'uniswap':
      return createUniswapAdapter(baseUrl);
  }
}
