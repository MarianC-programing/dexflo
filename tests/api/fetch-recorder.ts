/**
 * Grabador de `fetch` para las pruebas @api sin red: registra cada llamada
 * (URL, método, cabeceras, cuerpo) y sirve respuestas fijas en cola. Con eso
 * los tests anclan el contrato exacto de los clientes de src/api/.
 */

import type { FetchLike } from '../../src/api/http-fetch';

export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers?: HeadersInit;
  readonly body?: string;
}

export interface FixedResponse {
  readonly status: number;
  readonly body: string;
  readonly contentType?: string;
}

/**
 * Devuelve una `FetchLike` que apunta cada llamada en `calls` y consume la
 * cola de respuestas (sin respuestas restantes sirve HTTP 599 para hechos
 * sobrar en el test: mejor explícito que silencioso).
 */
export function createRecordingFetch(...responses: readonly FixedResponse[]): {
  fetchFn: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const queue: FixedResponse[] = [...responses];
  const fetchFn: FetchLike = (url, init) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers,
      body: typeof init.body === 'string' ? init.body : undefined,
    });
    const next: FixedResponse | undefined = queue.shift();
    const body: string = next?.body ?? '';
    const headers: HeadersInit = { 'content-type': next?.contentType ?? 'application/json' };
    return Promise.resolve(new Response(body, { status: next?.status ?? 599, headers }));
  };
  return { fetchFn, calls };
}

/** `fetch` con retardo honesto: respeta el AbortSignal (firma de timeout real). */
export function createSlowFetch(delayMs: number, response: FixedResponse): FetchLike {
  const base = createRecordingFetch(response).fetchFn;
  return async (url, init) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delayMs);
      init.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        },
        { once: true },
      );
    });
    return base(url, init);
  };
}

/** `fetch` que rechaza siempre (fallo de red) sin detalles adicionales. */
export function createFailingFetch(complaint: Error): FetchLike {
  return () => Promise.reject<Response>(complaint);
}
