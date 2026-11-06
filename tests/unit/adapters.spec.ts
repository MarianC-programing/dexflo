/** Contrato de los adapters que no necesita navegador. */

import { expect, test } from '@playwright/test';

import {
  createSandboxAdapter,
  createUniswapAdapter,
  resolveAdapter,
} from '../../src/domain/adapters';
import { MOCK_ADDRESS } from '../../src/utils/mockData';

test.describe('@unit adapters', () => {
  test('resolveAdapter elige el adapter según DAPP_TARGET', () => {
    expect(resolveAdapter('sandbox', 'https://app.uniswap.org').name).toBe('sandbox');
    expect(resolveAdapter('uniswap', 'https://app.uniswap.org').name).toBe('uniswap');
  });

  test('la sandbox formatea la dirección como la DApp (6 + 4 caracteres)', () => {
    expect(createSandboxAdapter().formatAddress(MOCK_ADDRESS)).toBe('0x71C7...976F');
  });

  test('la sandbox propaga timeout y cadena esperada en su URL', () => {
    const url = createSandboxAdapter({
      requestTimeoutMs: 300,
      expectedChainIdHex: '0x2105',
    }).swapUrl('mainnet');
    expect(url).toContain('timeoutMs=300');
    expect(url).toContain('chain=0x2105');
  });

  test('uniswap construye la URL de swap por red', () => {
    const adapter = createUniswapAdapter('https://app.uniswap.org');
    expect(adapter.swapUrl('mainnet')).toBe(
      'https://app.uniswap.org/swap?chain=ethereum&chainId=1',
    );
  });

  test('uniswap falla de forma explícita en lo que aún no está verificado', async () => {
    const adapter = createUniswapAdapter();
    await expect(adapter.selectToken({} as never, 'in', 'ETH')).rejects.toThrow(
      /no está implementado/,
    );
    await expect(adapter.txStatus({} as never)).rejects.toThrow(/no está implementado/);
  });
});
