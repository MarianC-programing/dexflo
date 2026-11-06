/**
 * Contrato del cliente de precios (CoinGecko /simple/price): respuestas
 * válidas, esquemas incompletos, errores HTTP y timeouts (Fase 5, docs/plan.md).
 *
 * Todo el bloque principal corre con `fetch` stub inyectada (fetch-recorder):
 * cero red real. El único caso que toca `api.coingecko.com` es CONTRACTUAL y
 * está desactivado por defecto (opt-in `CONTRACTUAL_API=1`; docs/plan.md:
 * "Las pruebas contra servicios reales serán contractuales u opcionales").
 *
 * El cliente corre en Node: la inyección de `fetchFn` es el mecanismo de
 * mockeo; el equivalente en navegador (`page.route`) vive en
 * `src/network/routes.ts` y se ejercita con la DApp sandbox en la Fase 6.
 */

import { expect, test } from '@playwright/test';
import type { FetchLike } from '../../src/api/http-fetch';
import {
  DEMO_KEY_HEADER,
  PRICE_ENDPOINT,
  buildPriceUrl,
  fetchTokenPrices,
} from '../../src/api/coingecko.api';
import { createFailingFetch, createRecordingFetch, createSlowFetch } from './fetch-recorder';
import { MOCK_PRICES, buildPriceFeedJson } from '../../src/utils/mockData';

/** Opt-in de las pruebas contractuales contra el servicio real (docs/plan.md). */
const CONTRACTUAL_API_ENABLED = /^(?:1|true|yes|on)$/i.test(
  (process.env['CONTRACTUAL_API'] ?? '').trim(),
);

test.describe('@api — Cliente de precios de CoinGecko', () => {
  test.describe('buildPriceUrl: contrato de la URL', () => {
    test('endpoint por defecto con ids, vs_currencies=usd e include_24hr_change=true', () => {
      expect(buildPriceUrl(['ethereum'])).toBe(
        `${PRICE_ENDPOINT}?ids=ethereum&vs_currencies=usd&include_24hr_change=true`,
      );
    });

    test('rechaza ids fuera del catálogo nombrando el id implicado', () => {
      expect(() => buildPriceUrl(['ethereum', 'ETHEREUM_UPPER'])).toThrow(/"ETHEREUM_UPPER"/);
    });

    test('valida los ids ANTES de abrir la red: la stub nunca es llamada', async () => {
      const { fetchFn, calls } = createRecordingFetch({ status: 200, body: '{}' });
      await expect(fetchTokenPrices({ ids: [], fetchFn })).rejects.toThrow(/lista de ids/);
      await expect(fetchTokenPrices({ ids: ['ETHEREUM_UPPER'], fetchFn })).rejects.toThrow(
        /no es válido para CoinGecko/,
      );
      expect(calls).toHaveLength(0);
    });
  });

  test.describe('respuestas válidas', () => {
    test('normaliza las dos grafías del cambio de 24 h y tolera campos extra', async () => {
      const body = JSON.stringify({
        ethereum: { usd: 3000, usd_24h_change: 1.85, market_cap: 360_000_000_000 },
        'usd-coin': { usd: 1, usd24hChange: 0.01 },
      });
      const { fetchFn } = createRecordingFetch({ status: 200, body });
      const feed = await fetchTokenPrices({ ids: ['ethereum', 'usd-coin'], fetchFn });
      expect(feed).toEqual({
        ethereum: { usd: 3000, usd24hChange: 1.85 },
        'usd-coin': { usd: 1, usd24hChange: 0.01 },
      });
    });

    test('lee el feed del framework (mockData) tal cual: interoperable con la sandbox', async () => {
      const { fetchFn } = createRecordingFetch({ status: 200, body: buildPriceFeedJson() });
      const feed = await fetchTokenPrices({ ids: ['ethereum', 'dai'], fetchFn });
      expect(feed).toEqual({ ethereum: MOCK_PRICES.ethereum, dai: MOCK_PRICES.dai });
    });

    test('la llave viaja por cabecera y jamás aparece en la URL', async () => {
      const feedBody = JSON.stringify({ ethereum: { usd: 3000, usd24hChange: 1.85 } });
      const { fetchFn, calls } = createRecordingFetch({ status: 200, body: feedBody });
      await fetchTokenPrices({ ids: ['ethereum'], apiKey: 'demo-la-clave-secreta', fetchFn });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).not.toContain('demo-la-clave-secreta');
      expect(new Headers(calls[0]?.headers).get(DEMO_KEY_HEADER)).toBe('demo-la-clave-secreta');
    });
  });

  test.describe('esquemas incompletos', () => {
    test('respuesta parcial: se rechaza nombrando el id que falta', async () => {
      const body = JSON.stringify({ ethereum: { usd: 3000, usd24hChange: 1.85 } });
      const { fetchFn } = createRecordingFetch({ status: 200, body });
      await expect(fetchTokenPrices({ ids: ['ethereum', 'dai'], fetchFn })).rejects.toThrow(
        'no incluye el id solicitado "dai"',
      );
    });

    test('"usd" no numérico (p. ej. "3000") se rechaza', async () => {
      const body = JSON.stringify({ ethereum: { usd: '3000', usd24hChange: 1.85 } });
      const { fetchFn } = createRecordingFetch({ status: 200, body });
      await expect(fetchTokenPrices({ ids: ['ethereum'], fetchFn })).rejects.toThrow(
        'la entrada "ethereum" no incluye "usd" numérico',
      );
    });

    test('falta la variación de 24 h: esquema incompleto explícito', async () => {
      const body = JSON.stringify({ ethereum: { usd: 3000 } });
      const { fetchFn } = createRecordingFetch({ status: 200, body });
      await expect(fetchTokenPrices({ ids: ['ethereum'], fetchFn })).rejects.toThrow(
        /variación de 24 h/,
      );
    });

    test('la variación de 24 h como cadena no entra', async () => {
      const body = JSON.stringify({ ethereum: { usd: 3000, usd_24h_change: '1.85' } });
      const { fetchFn } = createRecordingFetch({ status: 200, body });
      await expect(fetchTokenPrices({ ids: ['ethereum'], fetchFn })).rejects.toThrow(
        /variación de 24 h/,
      );
    });

    test('la entrada completa en lista no es un objeto válido', async () => {
      const body = JSON.stringify({ ethereum: [3000] });
      const { fetchFn } = createRecordingFetch({ status: 200, body });
      await expect(fetchTokenPrices({ ids: ['ethereum'], fetchFn })).rejects.toThrow(
        'la entrada "ethereum" no es un objeto',
      );
    });

    test('el payload raíz en lista es formato inesperado', async () => {
      const { fetchFn } = createRecordingFetch({ status: 200, body: '[]' });
      await expect(fetchTokenPrices({ ids: ['ethereum'], fetchFn })).rejects.toThrow(
        'Formato de respuesta inesperado',
      );
    });

    test('HTTP 200 sin cuerpo JSON se comunica sin ambigüedad', async () => {
      const { fetchFn } = createRecordingFetch({
        status: 200,
        body: '<html>up!</html>',
        contentType: 'text/html',
      });
      await expect(fetchTokenPrices({ ids: ['ethereum'], fetchFn })).rejects.toThrow(
        'La respuesta no es JSON válido.',
      );
    });
  });

  test.describe('errores HTTP', () => {
    test('HTTP 429: mensaje por status, sin leer el cuerpo del servidor', async () => {
      const { fetchFn } = createRecordingFetch({
        status: 429,
        body: '<html>nginx downstream bad conf</html>',
        contentType: 'text/html',
      });
      const error = await fetchTokenPrices({ ids: ['ethereum'], fetchFn }).then(
        () => null,
        (caught: unknown) => caught as Error,
      );
      expect(error?.message).toContain('HTTP 429');
      // El HTML del servidor nunca se filtra en el mensaje.
      expect(error?.message).not.toContain('nginx');
    });

    test('HTTP 401 apunta a la cabecera de la llave', async () => {
      const { fetchFn } = createRecordingFetch({ status: 401, body: '{}' });
      await expect(fetchTokenPrices({ ids: ['ethereum'], fetchFn })).rejects.toThrow(
        'cabecera de la llave',
      );
    });

    test('HTTP 502 del servicio se reporta por status', async () => {
      const { fetchFn } = createRecordingFetch({ status: 502, body: 'oops' });
      await expect(fetchTokenPrices({ ids: ['ethereum'], fetchFn })).rejects.toThrow(
        'El servicio respondió con un error (HTTP 502).',
      );
    });
  });

  test.describe('timeout y fallos de red', () => {
    test('la response tarda más que el timeout del cliente: mensaje con los ms', async () => {
      // Márgenes solidos (50 ms de timeout vs 250 ms de retardo): sin flake.
      await expect(
        fetchTokenPrices({
          ids: ['ethereum'],
          timeoutMs: 50,
          fetchFn: createSlowFetch(250, { status: 200, body: '{}' }),
        }),
      ).rejects.toThrow('La petición superó el timeout de 50 ms.');
    });

    test('fallo de red: mensaje fijo sin eco del error original', async () => {
      const complaint = new TypeError('fetch failed: https://secret.example.com?k=LEAKED_KEY');
      const failingFetch: FetchLike = createFailingFetch(complaint);
      const error = await fetchTokenPrices({ ids: ['ethereum'], fetchFn: failingFetch }).then(
        () => null,
        (caught: unknown) => caught as Error,
      );
      expect(error?.message).toBe('[coingecko] La petición no se completó (fallo de red).');
      expect(error?.message).not.toContain('LEAKED_KEY');
    });

    test('timeoutMs fuera de rango se valida antes de la red', async () => {
      const { fetchFn, calls } = createRecordingFetch({ status: 200, body: '{}' });
      await expect(fetchTokenPrices({ ids: ['ethereum'], timeoutMs: 0, fetchFn })).rejects.toThrow(
        /"timeoutMs" debe ser un entero entre 1 y 600000/,
      );
      expect(calls).toHaveLength(0);
    });
  });

  test.describe('contractual — servicio real (opt-in CONTRACTUAL_API=1)', () => {
    test('/simple/price real responde en USD para ethereum', async () => {
      test.skip(
        !CONTRACTUAL_API_ENABLED,
        'CONTRACTUAL_API no está activada: las pruebas contra servicios reales son contractuales y opt-in (docs/plan.md).',
      );
      const feed = await fetchTokenPrices({ ids: ['ethereum'] });
      expect(feed['ethereum']?.usd).toBeGreaterThan(0);
      expect(feed['ethereum']?.usd24hChange).toBeDefined();
    });
  });
});
