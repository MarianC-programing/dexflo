/**
 * Pruebas unitarias de la configuración y sus guardas de seguridad
 * (docs/SECURITY.md). No usan navegador ni red: validan `loadConfig` con
 * entornos sintéticos y el guard de mainnet del cliente RPC.
 */

import { expect, test } from '@playwright/test';

import { assertNetworkAllowed, createDexfloPublicClient } from '../../src/blockchain/rpc.client';
import { loadConfig } from '../../src/config/env';

/** Clave sintética de prueba (no corresponde a ninguna cuenta real). */
const FAKE_PRIVATE_KEY = `0x${'ab'.repeat(32)}`;
const SECRET_PATH = 'SUPER-SECRET-API-KEY';

test.describe('@unit loadConfig — red y mainnet', () => {
  test('usa sepolia por defecto y mainnet queda bloqueada', () => {
    const config = loadConfig({});
    expect(config.networkName).toBe('sepolia');
    expect(config.allowMainnet).toBe(false);
  });

  test('rechaza NETWORK=mainnet sin ALLOW_MAINNET', () => {
    expect(() => loadConfig({ NETWORK: 'mainnet' })).toThrow(/ALLOW_MAINNET=true/);
  });

  test('acepta mainnet solo con opt-in explícito', () => {
    const config = loadConfig({ NETWORK: 'mainnet', ALLOW_MAINNET: 'true' });
    expect(config.networkName).toBe('mainnet');
    expect(config.chainId).toBe(1);
  });

  test('rechaza redes desconocidas', () => {
    expect(() => loadConfig({ NETWORK: 'goerli' })).toThrow(/desconocida/);
  });
});

test.describe('@unit loadConfig — URLs sin fugas', () => {
  test('RPC_URL con credenciales se rechaza sin repetir el valor', () => {
    const rpc = `https://user:${SECRET_PATH}@rpc.example.com`;
    let message = '';
    try {
      loadConfig({ RPC_URL: rpc });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/RPC_URL/);
    expect(message).not.toContain(SECRET_PATH);
  });

  test('RPC_URL inválida o con protocolo no HTTP no filtra el valor', () => {
    for (const value of [`not a url ${SECRET_PATH}`, `ftp://rpc.example.com/${SECRET_PATH}`]) {
      let message = '';
      try {
        loadConfig({ RPC_URL: value });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toMatch(/RPC_URL/);
      expect(message).not.toContain(SECRET_PATH);
    }
  });

  test('BASE_URL con credenciales se rechaza', () => {
    expect(() => loadConfig({ BASE_URL: 'https://u:p@app.example.com' })).toThrow(/BASE_URL/);
  });
});

test.describe('@unit loadConfig — PRIVATE_KEY', () => {
  test('se rechaza sin RPC_URL', () => {
    expect(() => loadConfig({ PRIVATE_KEY: FAKE_PRIVATE_KEY })).toThrow(/RPC_URL local/);
  });

  test('se rechaza con un RPC remoto', () => {
    expect(() =>
      loadConfig({ PRIVATE_KEY: FAKE_PRIVATE_KEY, RPC_URL: 'https://rpc.example.com' }),
    ).toThrow(/RPC_URL local/);
  });

  test('formato inválido se rechaza sin repetir el valor', () => {
    let message = '';
    try {
      loadConfig({ PRIVATE_KEY: 'clave-invalida', RPC_URL: 'http://127.0.0.1:8545' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/formato válido/);
    expect(message).not.toContain('clave-invalida');
  });

  test('con RPC local se acepta y no es enumerable (no sale en JSON ni spreads)', () => {
    const config = loadConfig({ PRIVATE_KEY: FAKE_PRIVATE_KEY, RPC_URL: 'http://127.0.0.1:8545' });
    expect(config.privateKey).toBe(FAKE_PRIVATE_KEY);
    expect(Object.keys(config)).not.toContain('privateKey');
    expect(JSON.stringify(config)).not.toContain(FAKE_PRIVATE_KEY);
    expect(JSON.stringify({ ...config })).not.toContain(FAKE_PRIVATE_KEY);
  });

  test('sin PRIVATE_KEY el valor es null', () => {
    expect(loadConfig({}).privateKey).toBeNull();
  });
});

test.describe('@unit rpc.client — guard de mainnet', () => {
  test('assertNetworkAllowed bloquea mainnet sin ALLOW_MAINNET', () => {
    expect(() => {
      assertNetworkAllowed('mainnet');
    }).toThrow(/Mainnet bloqueada/);
    expect(() => {
      assertNetworkAllowed('sepolia');
    }).not.toThrow();
  });

  test('createDexfloPublicClient no crea cliente para mainnet bloqueada', () => {
    expect(() => createDexfloPublicClient({ networkName: 'mainnet' })).toThrow(/Mainnet bloqueada/);
  });

  test('sin RPC explícito usa el RPC público del catálogo de redes', () => {
    const client = createDexfloPublicClient({ networkName: 'sepolia' });
    expect(client.transport.url).toBe('https://ethereum-sepolia-rpc.publicnode.com');
  });
});

test.describe('@unit loadConfig — DAPP_TARGET', () => {
  test('usa la sandbox por defecto', () => {
    expect(loadConfig({}).dappTarget).toBe('sandbox');
  });

  test('acepta uniswap como target de referencia', () => {
    expect(loadConfig({ DAPP_TARGET: 'uniswap' }).dappTarget).toBe('uniswap');
  });

  test('rechaza targets desconocidos', () => {
    expect(() => loadConfig({ DAPP_TARGET: 'sushiswap' })).toThrow(/DAPP_TARGET/);
  });
});
