/**
 * Intercepción determinista de red en el navegador (layer "red determinista",
 * Fase 5). Complementa al adapter de la sandbox: mientras este sirve la DApp
 * completa, `routes.ts` publica respuestas puntuales del API para los 4 casos
 * del plan —precios, cotizaciones, catálogo de tokens y errores—.
 *
 * Filosofía "evitar intercepciones demasiado amplias" (docs/plan.md):
 * cada registro apunta a una URL EXACTA `${origin}${path}` — nunca a comodines
 * tipo `**`, ni domina un dominio entero. El origen por defecto es la sandbox
 * (target de CI); cualquier otro (staging) debe pasarse explícitamente.
 *
 * Orde de handlers en Playwright: gana el ÚLTIMO registrado (LIFO). El
 * adapter (`dappFixture`) instala sus rutas primero, así que estos overlays
 * pueden tomar el mando de una sola URL sin tocar el resto del adapter.
 */

import type { Page } from '@playwright/test';

import { SANDBOX_ORIGIN, SANDBOX_PRICES_PATH } from '../domain/sandbox/sandbox-dapp';
import { buildPriceFeedJson, buildQuoteResponse, buildTokenListJson } from '../utils/mockData';

/** Origen por defecto de las rutas de red: la DApp sandbox. */
export const DEFAULT_API_ORIGIN = SANDBOX_ORIGIN;

/** URLs exactas por categoría. Cada path es una URL literal, sin globbing. */
export const API_PATHS = Object.freeze({
  prices: SANDBOX_PRICES_PATH,
  quote: '/api/quote',
  tokenList: '/api/tokens',
} as const satisfies Readonly<Record<string, string>>);

export type ApiPathCategory = keyof typeof API_PATHS;

export interface RouteOverlay {
  /** Código HTTP a servir; por defecto 200. */
  readonly status?: number;
  /** Cuerpo a servir; por defecto el payload determinista de la categoría. */
  readonly body?: string;
  /** Content-Type; por defecto application/json. */
  readonly contentType?: string;
  /** Retardo de la respuesta para escenarios de latencia/timeout. */
  readonly delayMs?: number;
  /** Aborta la conexión en vez de responder (timeout de red real). */
  readonly abort?: boolean;
  /** Código de aborto de Playwright (por defecto connectionreset). */
  readonly abortCode?: string;
}

const JSON_CONTENT_TYPE = 'application/json';

/**
 * El `setTimeout` aquí SOLO simula latencia de red para producir el escenario
 * de timeout que el test de a continuación verificará. No es la espera de la
 * UI (prohibida `waitForTimeout`): quien espera lo hace por estado.
 */
const delayFor = (delayMs: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

async function applyJsonRoute(
  page: Page,
  url: string,
  defaultBody: string,
  overlay: RouteOverlay,
): Promise<void> {
  await page.route(url, async (route) => {
    if (overlay.abort === true) {
      await route.abort(overlay.abortCode ?? 'connectionreset');
      return;
    }
    const delayMs = overlay.delayMs ?? 0;
    if (delayMs > 0) {
      await delayFor(delayMs);
    }
    await route.fulfill({
      status: overlay.status ?? 200,
      contentType: overlay.contentType ?? JSON_CONTENT_TYPE,
      body: overlay.body ?? defaultBody,
    });
  });
}

/** Reserva la URL exacta a intercepar en función de categoría y origen. */
function routeUrlFor(category: ApiPathCategory, origin: string): string {
  if (origin.length === 0) {
    throw new Error('[routes] El origen de la ruta no puede estar vacío: pasa DEFAULT_API_ORIGIN.');
  }
  if (origin.includes('*')) {
    throw new Error(
      '[routes] Los comodines se prohiben: las rutas son URLs exactas para mantener la intercepción acotada.',
    );
  }
  return `${origin}${API_PATHS[category]}`;
}

/** Intercepta el feed de precios (`/api/prices`) con payload de mockData. */
export async function interceptPrices(
  page: Page,
  overlay: RouteOverlay = {},
  origin: string = DEFAULT_API_ORIGIN,
): Promise<void> {
  await applyJsonRoute(page, routeUrlFor('prices', origin), buildPriceFeedJson(), overlay);
}

/**
 * Intercepta la cotización (`/api/quote`) con la cotización por defecto del
 * feed: 1 ETH → USDC a 4 decimales; el test puede sobreescribirla con
 * `overlay.body` (ver `buildQuoteResponse` de mockData para el contrato).
 */
export async function interceptQuote(
  page: Page,
  overlay: RouteOverlay = {},
  origin: string = DEFAULT_API_ORIGIN,
): Promise<void> {
  const defaultBody = JSON.stringify(buildQuoteResponse('ETH', 'USDC', '1'));
  await applyJsonRoute(page, routeUrlFor('quote', origin), defaultBody, overlay);
}

/** Intercepta el catálogo de tokens (`/api/tokens`) con TOKEN_LIST. */
export async function interceptTokenList(
  page: Page,
  overlay: RouteOverlay = {},
  origin: string = DEFAULT_API_ORIGIN,
): Promise<void> {
  await applyJsonRoute(page, routeUrlFor('tokenList', origin), buildTokenListJson(), overlay);
}
