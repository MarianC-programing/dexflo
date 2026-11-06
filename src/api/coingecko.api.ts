/**
 * Cliente tipado del feed de precios público de CoinGecko (`/simple/price`).
 *
 * El contrato es el REAL que mockea `src/utils/mockData.ts`; de hecho el
 * cliente acepta las dos grafías del cambio 24 h (`usd_24h_change` de la API y
 * `usd24hChange` del feed del framework) para que la misma función valide
 * tanto la sandbox como el servicio real.
 *
 * Reglas de docs/SECURITY.md:
 * - la llave viaja por la cabecera `x-cg-demo-api-key`, nunca en la query;
 * - los errores no repiten la URL ni inspeccionan el cuerpo del servidor
 *   (los 401/429 llegan a menudo como HTML medio, sin contenido fiable);
 * - la moneda del feed es USD: la fija el contrato del framework y de paso
 *   evita claves de respuesta dinámicas (`eur`, `eur_24h_change`, …).
 *
 * `fetchFn` es inyectable: los tests @api prueban contra stubs deterministas
 * y el único caso que toca `api.coingecko.com` es contractual y opt-in.
 */

import { parseHttpUrl } from '../config/env';
import { defaultFetch, performJsonRequest, TransportError, type FetchLike } from './http-fetch';
import type { PriceEntry, PriceFeedResponse } from '../utils/mockData';

/** Endpoint por defecto del feed de precios (API pública v3). */
export const PRICE_ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price';

/** Cabecera de llave demo de CoinGecko. La PRO usa otro host y no entra aquí. */
export const DEMO_KEY_HEADER = 'x-cg-demo-api-key';

/** Timeout por defecto coherente con los planes @api del proyecto. */
export const DEFAULT_PRICE_TIMEOUT_MS = 10_000;

/** Ids de CoinGecko usados por el framework (comentario en mockData). */
const PRICE_ID_PATTERN = /^[a-z0-9-]{1,40}$/;

/**
 * Construye la URL exacta del feed para los ids pedidos: pins `vs_currencies`
 * a USD e incluye el cambio de 24 h. La llave jamás entra en la query.
 */
export function buildPriceUrl(ids: readonly string[], endpoint: string = PRICE_ENDPOINT): string {
  if (ids.length === 0) {
    throw new Error('[coingecko] La lista de ids está vacía: pide al menos un id.');
  }
  for (const id of ids) {
    if (!PRICE_ID_PATTERN.test(id)) {
      // Los ids son públicos; repetirlos ayuda a corregir el test rápido.
      throw new Error(
        `[coingecko] El id "${id}" no es válido para CoinGecko (minúsculas, números y guiones).`,
      );
    }
  }
  // Reusa la validación del proyecto: sin credenciales embebidas en la URL.
  const parsed = parseHttpUrl(endpoint, 'endpoint');
  parsed.searchParams.set('ids', ids.join(','));
  parsed.searchParams.set('vs_currencies', 'usd');
  parsed.searchParams.set('include_24hr_change', 'true');
  return parsed.toString();
}

export interface FetchTokenPricesOptions {
  /** Ids de CoinGecko a pedir (p. ej. los `coingeckoId` de `MOCK_TOKENS`). */
  readonly ids: readonly string[];
  /** Llave demo opcional: SIEMPRE por cabecera, jamás en la URL. */
  readonly apiKey?: string;
  /** Endpoint alternativo (p. ej. el origen de la sandbox para @api). */
  readonly endpoint?: string;
  /** Timeout de la petición en ms; por defecto {@link DEFAULT_PRICE_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
  /** `fetch` inyectada; por defecto la del runtime Node. */
  readonly fetchFn?: FetchLike;
}

/** Mensaje de error por código HTTP, SIN leer el cuerpo del servidor. */
function httpStatusMessage(status: number): string {
  if (status === 401) {
    return '[coingecko] La API rechazó la petición (HTTP 401): revisa la cabecera de la llave.';
  }
  if (status === 429) {
    return '[coingecko] La API rechazó la petición (HTTP 429): se alcanzó el límite de peticiones.';
  }
  if (status >= 400 && status < 500) {
    return `[coingecko] La API rechazó la petición (HTTP ${status}).`;
  }
  return `[coingecko] El servicio respondió con un error (HTTP ${status}).`;
}

/**
 * Valida el esquema de la respuesta contra los ids pedidos.
 *
 * Reglas de esquema (todas fallan rápido, con el id implicado en el mensaje):
 * - toda entrada pedida debe existir (la respuesta parcial se rechaza);
 * - `usd` y la variación de 24 h son números finitos no negativos;
 * - los campos extra de cada entrada se toleran (la API añade metadatos).
 */
function parsePriceFeed(payload: unknown, requestedIds: readonly string[]): PriceFeedResponse {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error(
      '[coingecko] Formato de respuesta inesperado: se esperaba un objeto { [id]: precios }.',
    );
  }
  const feed = payload as Record<string, unknown>;
  const result: Record<string, PriceEntry> = {};
  for (const id of requestedIds) {
    if (!(id in feed)) {
      throw new Error(`[coingecko] La respuesta no incluye el id solicitado "${id}".`);
    }
    const entry: unknown = feed[id];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`[coingecko] Esquema inválido: la entrada "${id}" no es un objeto.`);
    }
    const entryRecord = entry as Record<string, unknown>;
    const usd: unknown = entryRecord['usd'];
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0) {
      throw new Error(
        `[coingecko] Esquema inválido: la entrada "${id}" no incluye "usd" numérico.`,
      );
    }
    // Doble grafía aceptada: la API real usa snake_case y la sandbox del
    // framework usa camelCase (mismo contrato semántico).
    const usd24hChange: unknown = entryRecord['usd24hChange'] ?? entryRecord['usd_24h_change'];
    if (typeof usd24hChange !== 'number' || !Number.isFinite(usd24hChange)) {
      throw new Error(
        `[coingecko] Esquema incompleto: la entrada "${id}" no incluye la variación de 24 h ("usd_24h_change") como número.`,
      );
    }
    result[id] = { usd, usd24hChange };
  }
  return result;
}

export async function fetchTokenPrices(
  options: FetchTokenPricesOptions,
): Promise<PriceFeedResponse> {
  const fetchFn = options.fetchFn ?? defaultFetch;
  // La validación de la URL y de los ids ocurre ANTES de tocar la red: una
  // lista de ids inválida no abre conexiones.
  const url = buildPriceUrl(options.ids, options.endpoint ?? PRICE_ENDPOINT);
  const timeoutMs = options.timeoutMs ?? DEFAULT_PRICE_TIMEOUT_MS;

  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.apiKey !== undefined && options.apiKey.length > 0) {
    headers[DEMO_KEY_HEADER] = options.apiKey;
  }

  try {
    const outcome = await performJsonRequest(fetchFn, { url, headers, timeoutMs });
    if (outcome.status !== 200) {
      throw new Error(httpStatusMessage(outcome.status));
    }
    if (!('json' in outcome)) {
      throw new Error('[coingecko] La respuesta no es JSON válido.');
    }
    return parsePriceFeed(outcome.json, options.ids);
  } catch (error: unknown) {
    // Solo se traducen los fallos de transporte (timeout/red); los errores de
    // esquema/HTTP ya llevan su mensaje propio y se propagan tal cual.
    if (error instanceof TransportError) {
      const kind =
        error.kind === 'timeout'
          ? `La petición superó el timeout de ${timeoutMs} ms.`
          : 'La petición no se completó (fallo de red).';
      throw new Error(`[coingecko] ${kind}`);
    }
    throw error;
  }
}
