/**
 * Contrato del cliente JSON-RPC 2.0 (src/api/rpc.api.ts) sin red: body exacto,
 * ids incrementales, shape de error, status HTTP, timeout y resolución de
 * catálogo. Corre con `npm run test:api` (cobertura del cliente de la Fase 5;
 * el plan nombra token-prices.spec.ts y este spec cubre su pareja rpc.api).
 *
 * El guard de mainnet/ALLOW_MAINNET ya está anclado en tests/unit/env.spec.ts
 * (docs/SECURITY.md); aquí se ejercita el transporte, no el guard.
 */

import { expect, test } from '@playwright/test';
import { createRecordingFetch, createSlowFetch } from './fetch-recorder';
import { createRpcApiClient, resolveRpcEndpoint } from '../../src/api/rpc.api';
import { NETWORKS } from '../../src/config/networks';
import { MOCK_ADDRESS } from '../../src/utils/mockData';

/** Parseo de lo grabado por el stub de fetch (objeto o falla explícita). */
function parseBody(raw: string | undefined): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw ?? 'null');
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('El cuerpo HTTP grabado no es un objeto.');
  }
  return parsed as Record<string, unknown>;
}

test.describe('@api — Cliente JSON-RPC (contrato y errores)', () => {
  test('body exacto JSON-RPC 2.0, POST con JSON y ids incrementales', async () => {
    const { fetchFn, calls } = createRecordingFetch(
      { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }) },
      { status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 2, result: '0x150000' }) },
    );
    const client = createRpcApiClient({
      networkName: 'sepolia',
      rpcUrl: 'http://127.0.0.1:8545/',
      fetchFn,
    });
    await expect(client.getChainId()).resolves.toBe(1);
    await expect(client.getBlockNumber()).resolves.toBe(0x150000);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.method).toBe('POST');
    expect(new Headers(calls[0]?.headers).get('content-type')).toBe('application/json');
    expect(parseBody(calls[0]?.body)).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_chainId',
      params: [],
    });
    expect(parseBody(calls[1]?.body)).toEqual({
      jsonrpc: '2.0',
      id: 2,
      method: 'eth_blockNumber',
      params: [],
    });
  });

  test('getBalanceWei pide [address, latest] y devuelve wei (bigint)', async () => {
    const { fetchFn, calls } = createRecordingFetch({
      status: 200,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0xde0b6b3a7640000' }),
    });
    const client = createRpcApiClient({
      networkName: 'sepolia',
      rpcUrl: 'http://127.0.0.1:8545/',
      fetchFn,
    });
    await expect(client.getBalanceWei(MOCK_ADDRESS)).resolves.toBe(1_000_000_000_000_000_000n);
    expect(parseBody(calls[0]?.body)).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [MOCK_ADDRESS, 'latest'],
    });
  });

  test('error RPC del nodo conserva código y mensaje del servidor', async () => {
    const { fetchFn } = createRecordingFetch({
      status: 200,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32000, message: 'insufficient funds for gas * price + value' },
      }),
    });
    const client = createRpcApiClient({
      networkName: 'sepolia',
      rpcUrl: 'http://127.0.0.1:8545/',
      fetchFn,
    });
    await expect(client.request('eth_sendTransaction', [])).rejects.toThrow(
      /Error RPC \(código -32000\): insufficient funds/,
    );
  });

  test('error RPC malformado produce mensaje propio, no eco del nodo', async () => {
    const { fetchFn } = createRecordingFetch({
      status: 200,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, error: 'boom' }),
    });
    const client = createRpcApiClient({
      networkName: 'sepolia',
      rpcUrl: 'http://127.0.0.1:8545/',
      fetchFn,
    });
    await expect(client.request('eth_chainId')).rejects.toThrow(
      'Respuesta RPC con "error" de forma inesperada.',
    );
  });

  test('HTTP 500 sin JSON se reporta por status', async () => {
    const { fetchFn } = createRecordingFetch({
      status: 500,
      body: '<html>gateway down</html>',
      contentType: 'text/html',
    });
    const client = createRpcApiClient({
      networkName: 'sepolia',
      rpcUrl: 'http://127.0.0.1:8545/',
      fetchFn,
    });
    await expect(client.request('eth_chainId')).rejects.toThrow(
      'El nodo respondió HTTP 500 sin cuerpo JSON.',
    );
  });

  test('HTTP 200 sin cuerpo JSON produce "formato inesperado" explícito', async () => {
    const { fetchFn } = createRecordingFetch({
      status: 200,
      body: 'esto no es json',
      contentType: 'text/plain',
    });
    const client = createRpcApiClient({
      networkName: 'sepolia',
      rpcUrl: 'http://127.0.0.1:8545/',
      fetchFn,
    });
    await expect(client.request('eth_chainId')).rejects.toThrow(
      'Respuesta RPC con formato inesperado (no es un objeto).',
    );
  });

  test('la respuesta de otra petición (id desajustado) se rechaza', async () => {
    const { fetchFn } = createRecordingFetch({
      status: 200,
      body: JSON.stringify({ jsonrpc: '2.0', id: 42, result: '0x1' }),
    });
    const client = createRpcApiClient({
      networkName: 'sepolia',
      rpcUrl: 'http://127.0.0.1:8545/',
      fetchFn,
    });
    await expect(client.request('eth_chainId')).rejects.toThrow(
      'La respuesta RPC corresponde a otra petición (id desajustado).',
    );
  });

  test('método con caracteres fuera de rango no toca la red', async () => {
    const { fetchFn, calls } = createRecordingFetch();
    const client = createRpcApiClient({
      networkName: 'sepolia',
      rpcUrl: 'http://127.0.0.1:8545/',
      fetchFn,
    });
    await expect(client.request('eth:chainId')).rejects.toThrow('Nombre de método RPC inválido.');
    expect(calls).toHaveLength(0);
  });

  test('timeout con llave en la URL: el mensaje no la repite', async () => {
    const client = createRpcApiClient({
      networkName: 'sepolia',
      rpcUrl: 'https://rpc.delivery.local/v3/KEY_9_SECRET_BAD',
      timeoutMs: 30,
      fetchFn: createSlowFetch(250, { status: 200, body: '' }),
    });
    const error = await client.request('eth_chainId').then(
      () => null,
      (caught: unknown) => caught as Error,
    );
    expect(error?.message).toBe('[rpc.api] La petición RPC superó el timeout de 30 ms.');
    expect(error?.message).not.toContain('KEY_9_SECRET_BAD');
  });

  test('idStart inválido se valida al crear el cliente', () => {
    expect(() => createRpcApiClient({ networkName: 'sepolia', idStart: 0 })).toThrow(
      /"idStart" debe ser un entero positivo/,
    );
  });

  test('resolveRpcEndpoint: el override gana; si no, el catálogo de redes', () => {
    expect(resolveRpcEndpoint('sepolia')).toBe(NETWORKS.sepolia.rpcUrl);
    expect(resolveRpcEndpoint('polygon', 'http://127.0.0.1:8545/x')).toBe(
      'http://127.0.0.1:8545/x',
    );
  });
});
