/**
 * Transporte JSON compartido por los clientes de API de la Fase 5.
 *
 * Todo cliente acepta una función `fetch` inyectable (`FetchLike`): el pipeline
 * determinista prueba contra stubs (ver `tests/api/`) y el consumo real queda
 * en pruebas contractuales opt-in (docs/plan.md). Aquí vive la semántica común:
 * timeout por `AbortController` y parseo tolerante del cuerpo.
 *
 * Reglas heredadas de docs/SECURITY.md: los errores de transporte se generan
 * localmente y NUNCA incluyen la URL ni el cuerpo recibido (las URLs con
 * llaves no se filtran ni siquiera por error).
 */

/** Firma mínima de `fetch` que los clientes aceptan (inyección para tests). */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** `fetch` real del runtime Node (se pasa como defecto a los clientes). */
export const defaultFetch: FetchLike = (url, init) => fetch(url, init);

/** Tipos de fallo de transporte clasificados aquí, sin contenido prosa del entorno. */
export type TransportKind = 'timeout' | 'network';

/**
 * Error de transporte con tipo fijo. Se genera exclusivamente en este módulo:
 * los clientes lo traducen a su propio mensaje `[prefijo] …` sin eco de URL.
 */
export class TransportError extends Error {
  readonly kind: TransportKind;

  constructor(kind: TransportKind) {
    super(kind === 'timeout' ? '[http] La petición superó el timeout.' : '[http] Fallo de red.');
    this.name = 'TransportError';
    this.kind = kind;
  }
}

/** Resultado de una petición JSON ya con status; `json` solo si el cuerpo era JSON válido. */
export interface JsonOutcome {
  readonly status: number;
  /** Payload parseado (el `null` JSON también entra aquí). Ausente si no hubo JSON válido. */
  readonly json?: unknown;
}

/** Rango de timeouts coherente con src/config/env.ts (leer timeouts del entorno va allí). */
const MIN_TIMEOUT_MS = 1;
const MAX_TIMEOUT_MS = 600_000;

/** Clasifica la causa de una promesa de fetch rechazada (timeout propio vs fallo de red). */
function isAbortComplaint(error: unknown, signaled: boolean): boolean {
  if (signaled) {
    return true;
  }
  // Node rechaza el fetch abortado con DOMException('AbortError'); los stubs
  // honestos que respetan la señal también llegan aquí por `signaled`.
  return error instanceof Error && error.name === 'AbortError';
}

const TRANSPORT_TIMEOUT_RANGE_ERROR =
  '[http] "timeoutMs" debe ser un entero entre 1 y 600000 (ms).';

export interface JsonRequestInit {
  readonly url: string;
  readonly method?: string;
  readonly headers?: HeadersInit;
  readonly body?: string;
  readonly timeoutMs: number;
}

/**
 * Realiza una petición HTTP y devuelve el status y su JSON cuando exista.
 * Nunca lanza por status: los clientes deciden qué mensaje usan para cada code.
 * Solo lanza `TransportError` por timeout/red; la ausencia de JSON se devuelve
 * como outcome sin `json` para que cada cliente formule su propio mensaje.
 */
export async function performJsonRequest(
  fetchFn: FetchLike,
  init: JsonRequestInit,
): Promise<JsonOutcome> {
  const timeoutMs = init.timeoutMs;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < MIN_TIMEOUT_MS ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new Error(TRANSPORT_TIMEOUT_RANGE_ERROR);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchFn(init.url, {
        method: init.method ?? 'GET',
        headers: init.headers,
        body: init.body,
        signal: controller.signal,
      });
    } catch (error: unknown) {
      throw isAbortComplaint(error, controller.signal.aborted)
        ? new TransportError('timeout')
        : new TransportError('network');
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error: unknown) {
      // El aborto puede aterrizar aquí (cuerpo a medio leer). La ausencia de
      // JSON puro no es un error: el cliente la traduce a SU mensaje propio.
      if (isAbortComplaint(error, controller.signal.aborted)) {
        throw new TransportError('timeout');
      }
      return { status: response.status };
    }
    return { status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
}
