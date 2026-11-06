/**
 * Cliente JSON-RPC 2.0 sobre HTTP, independiente de viem (Fase 5).
 *
 * Cubre las pruebas @api deterministas vía `fetchFn` inyectada. La capa viem
 * de @web3 sigue en `src/blockchain/rpc.client.ts`: este cliente NO la
 * sustituye; comparte el guard de red (`assertNetworkAllowed`) y la resolución
 * de catálogo (`resolveRpcEndpoint`) para que cliente y catálogo no diverjan
 * (lección 5a de docs/SECURITY.md).
 *
 * Reglas de docs/SECURITY.md: los endpoints RPC pueden llevar la llave en la
 * ruta, así que los mensajes de error jamás repiten la URL ni el cuerpo del
 * nodo; los mensajes de error de red se generan localmente con texto fijo.
 */

import { assertHexAddress, assertNetworkAllowed } from '../blockchain/rpc.client';
import { env } from '../config/env';
import { NETWORKS, type NetworkName } from '../config/networks';
import { defaultFetch, performJsonRequest, TransportError, type FetchLike } from './http-fetch';

/** Timeout por defecto: mismo criterio que src/blockchain/rpc.client.ts. */
export const DEFAULT_RPC_API_TIMEOUT_MS = 20_000;

/** Nombre de método razonable (eth_*, net_*, wallet_*): sin espacios ni extras. */
const RPC_METHOD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/**
 * Valida el endpoint RPC con mensajes propios `[rpc.api]` (el wording de
 * `env.parseHttpUrl` está pensado para variables de entorno; aquí las flags
 * de seguridad son las mismas sin eco del valor).
 */
function assertEndpoint(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('[rpc.api] El endpoint RPC no es una URL válida.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('[rpc.api] El endpoint RPC debe usar HTTP/HTTPS.');
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error(
      '[rpc.api] El endpoint RPC no debe incluir credenciales embebidas; usa secretos de entorno.',
    );
  }
  return parsed;
}

/** Resolución de endpoint: override si hay valor; si no, el RPC del catálogo. */
export function resolveRpcEndpoint(
  networkName: NetworkName,
  rpcUrlOverride?: string | null,
): string {
  const override = rpcUrlOverride?.trim() ?? '';
  if (override.length > 0) {
    return override;
  }
  return NETWORKS[networkName].rpcUrl;
}

export interface RpcApiOptions {
  /** Red objetivo; por defecto la de env.ts. El guard de mainnet aplica igual. */
  readonly networkName?: NetworkName;
  /** RPC con prioridad sobre env.rpcUrl y el catálogo de redes. */
  readonly rpcUrl?: string;
  /** Timeout por petición en ms; por defecto {@link DEFAULT_RPC_API_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
  /** Primer id JSON-RPC (tests deterministas anclan el primer id). */
  readonly idStart?: number;
  /** `fetch` inyectada; por defecto la del runtime Node. */
  readonly fetchFn?: FetchLike;
}

export interface RpcApiClient {
  /** Llamada RPC tipada: devuelve el `result` o lanza con código y mensaje. */
  request<T = unknown>(method: string, params?: readonly unknown[]): Promise<T>;
  /** `eth_chainId` como número. */
  getChainId(): Promise<number>;
  /** `eth_blockNumber` como número. */
  getBlockNumber(): Promise<number>;
  /** `eth_getBalance` en wei (bigint) a `latest`. */
  getBalanceWei(address: string): Promise<bigint>;
}

/** Valida y convierte cantidades hex del resultado (`0x…`), con el método en el error. */
function assertHexQuantity(value: unknown, source: string): bigint {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`[rpc.api] "${source}" no devolvió una cantidad hex (0x…) válida.`);
  }
  return BigInt(value);
}

interface RpcErrorShape {
  readonly code: number;
  readonly message: string;
}

/** Lee {code, message} del error RPC; null si la forma no es la canónica. */
function readRpcErrorShape(value: unknown): RpcErrorShape | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const code: unknown = record['code'];
  const message: unknown = record['message'];
  if (typeof code !== 'number' || !Number.isFinite(code) || typeof message !== 'string') {
    return null;
  }
  return { code, message };
}

export function createRpcApiClient(options: RpcApiOptions = {}): RpcApiClient {
  const networkName = options.networkName ?? env.networkName;
  // Guard compartido con la capa @web3: mainnet exige ALLOW_MAINNET=true.
  assertNetworkAllowed(networkName);
  const endpoint = resolveRpcEndpoint(networkName, options.rpcUrl ?? env.rpcUrl);
  assertEndpoint(endpoint);
  const timeoutMs = options.timeoutMs ?? DEFAULT_RPC_API_TIMEOUT_MS;
  const fetchFn = options.fetchFn ?? defaultFetch;
  const startId = options.idStart ?? 1;
  if (!Number.isSafeInteger(startId) || startId < 1) {
    throw new Error('[rpc.api] "idStart" debe ser un entero positivo.');
  }
  let nextId = startId;

  const request = async <T>(method: string, params: readonly unknown[] = []): Promise<T> => {
    if (!RPC_METHOD_PATTERN.test(method)) {
      throw new Error('[rpc.api] Nombre de método RPC inválido.');
    }
    const id = nextId;
    nextId += 1;

    try {
      const outcome = await performJsonRequest(fetchFn, {
        url: endpoint,
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        timeoutMs,
      });

      if (outcome.status !== 200) {
        const rpcError = readRpcErrorShape('json' in outcome ? outcome.json : undefined);
        if (rpcError !== null) {
          throw new Error(`[rpc.api] Error RPC (código ${rpcError.code}): ${rpcError.message}`);
        }
        throw new Error(`[rpc.api] El nodo respondió HTTP ${outcome.status} sin cuerpo JSON.`);
      }

      const payload = 'json' in outcome ? outcome.json : null;
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new Error('[rpc.api] Respuesta RPC con formato inesperado (no es un objeto).');
      }
      const holder = payload as Record<string, unknown>;
      if (holder['jsonrpc'] !== '2.0') {
        throw new Error('[rpc.api] Respuesta RPC sin la versión "jsonrpc": 2.0.');
      }
      if (holder['id'] !== id) {
        throw new Error('[rpc.api] La respuesta RPC corresponde a otra petición (id desajustado).');
      }
      const errorPayload: unknown = holder['error'];
      if (errorPayload !== undefined) {
        const rpcError = readRpcErrorShape(errorPayload);
        if (rpcError === null) {
          throw new Error('[rpc.api] Respuesta RPC con "error" de forma inesperada.');
        }
        throw new Error(`[rpc.api] Error RPC (código ${rpcError.code}): ${rpcError.message}`);
      }
      if (!('result' in holder)) {
        throw new Error('[rpc.api] Respuesta RPC sin "result" ni "error".');
      }
      return holder['result'] as T;
    } catch (error: unknown) {
      // Solo se traducen los fallos de transporte; los errores de protocolo ya
      // llevan su texto propio (véase arriba) y se propagan tal cual.
      if (error instanceof TransportError) {
        throw new Error(
          error.kind === 'timeout'
            ? `[rpc.api] La petición RPC superó el timeout de ${timeoutMs} ms.`
            : '[rpc.api] La petición RPC no se completó (fallo de red).',
        );
      }
      throw error;
    }
  };

  const client: RpcApiClient = {
    request,

    getChainId: async (): Promise<number> => {
      const quantity = await request<string>('eth_chainId');
      return Number(assertHexQuantity(quantity, 'eth_chainId'));
    },

    getBlockNumber: async (): Promise<number> => {
      const quantity = await request<string>('eth_blockNumber');
      return Number(assertHexQuantity(quantity, 'eth_blockNumber'));
    },

    getBalanceWei: async (address: string): Promise<bigint> => {
      const quantity = await request<string>('eth_getBalance', [
        assertHexAddress(address),
        'latest',
      ]);
      return assertHexQuantity(quantity, 'eth_getBalance');
    },
  };
  return client;
}
