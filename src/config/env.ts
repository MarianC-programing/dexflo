/**
 * Carga y validación tipada de la configuración del framework.
 *
 * Se evalúa una única vez al importarlo (carga `.env` vía dotenv) y expone el
 * objeto `env` congelado en tipos. Falla rápido y con mensajes accionables:
 * mejor un error claro en el arranque que un fallo ambiguo a mitad de suite.
 */
import 'dotenv/config';

import { getNetwork, isNetworkName, NETWORK_NAMES, type NetworkName } from './networks';

export interface TimeoutsConfig {
  /** Tiempo máximo por test. */
  readonly testMs: number;
  /** `page.goto` y navegación completas. */
  readonly navigationMs: number;
  /** Acciones de Playwright (click, fill…). */
  readonly actionMs: number;
  /** Esperas de `expect` basadas en estado del DOM/red. */
  readonly expectMs: number;
}

export interface AppConfig {
  /** URL de la DApp objetivo (DEX). */
  readonly baseUrl: string;
  /** Nombre de red normalizado (ver src/config/networks.ts). */
  readonly networkName: NetworkName;
  /** chainId derivado de la red objetivo. */
  readonly chainId: number;
  /** Opt-in explícito para operar contra mainnet (ALLOW_MAINNET); false por defecto. */
  readonly allowMainnet: boolean;
  /** RPC opcional para pruebas @web3 (Fase 3+); null si no se configura. */
  readonly rpcUrl: string | null;
  /**
   * Clave privada de wallet EFÍMERA; null si no se configura. Solo se acepta con
   * un RPC local (fork/Anvil). Propiedad NO enumerable: no sale en
   * `JSON.stringify(env)`, spreads ni `console.log(env)`. Nunca se loguea.
   */
  readonly privateKey: string | null;
  /** Headless por defecto; sobrescribible por CLI (`--headed`). */
  readonly headless: boolean;
  /** Detección de CI (determina retries y reporters). */
  readonly isCi: boolean;
  readonly timeouts: TimeoutsConfig;
}

const TRUTHY_VALUES = new Set<string>(['1', 'true', 'yes', 'on']);
const FALSY_VALUES = new Set<string>(['0', 'false', 'no', 'off']);

function readEnvString(
  source: Readonly<NodeJS.ProcessEnv>,
  name: string,
  defaultValue?: string,
): string {
  const raw = source[name];
  const trimmed = raw?.trim();
  const value = trimmed !== undefined && trimmed.length > 0 ? trimmed : defaultValue;
  if (value === undefined) {
    throw new Error(`[env] Falta la variable de entorno obligatoria "${name}".`);
  }
  return value;
}

function readEnvOptional(source: Readonly<NodeJS.ProcessEnv>, name: string): string | null {
  const trimmed = source[name]?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function readEnvPositiveInt(
  source: Readonly<NodeJS.ProcessEnv>,
  name: string,
  defaultValue: number,
): number {
  const raw = readEnvString(source, name, String(defaultValue));
  if (!/^\d+$/.test(raw)) {
    throw new Error(`[env] "${name}" debe ser un entero positivo en ms; recibido: "${raw}".`);
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 600_000) {
    throw new Error(`[env] "${name}" debe estar entre 1 y 600000 ms; recibido: ${value}.`);
  }
  return value;
}

function readEnvBoolean(
  source: Readonly<NodeJS.ProcessEnv>,
  name: string,
  defaultValue: boolean,
): boolean {
  const raw = source[name];
  if (raw === undefined || raw.trim().length === 0) {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (TRUTHY_VALUES.has(normalized)) {
    return true;
  }
  if (FALSY_VALUES.has(normalized)) {
    return false;
  }
  throw new Error(
    `[env] "${name}" debe ser booleano (true|false|1|0|yes|no|on|off); recibido: "${raw}".`,
  );
}

const LOCAL_HOSTNAMES = new Set<string>(['localhost', '127.0.0.1', '[::1]']);
const PRIVATE_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;

/**
 * Valida una URL HTTP(S) sin credenciales embebidas. Los mensajes de error NO
 * repiten el valor recibido: una URL de RPC puede llevar la API key en la ruta.
 */
function parseHttpUrl(value: string, variableName: string): URL {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`[env] "${variableName}" no es una URL válida.`);
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error(
      `[env] "${variableName}" debe usar HTTP/HTTPS; protocolo inválido: "${parsedUrl.protocol}".`,
    );
  }
  if (parsedUrl.username.length > 0 || parsedUrl.password.length > 0) {
    throw new Error(
      `[env] "${variableName}" no debe incluir usuario ni contraseña en la URL; usa secretos de entorno.`,
    );
  }
  return parsedUrl;
}

function isLocalUrl(url: URL): boolean {
  return LOCAL_HOSTNAMES.has(url.hostname);
}

/**
 * Construye la configuración desde un origen de variables.
 *
 * El parámetro `source` permite validar entornos sintéticos en pruebas
 * unitarias sin tocar el entorno real del proceso.
 */
export function loadConfig(source: Readonly<NodeJS.ProcessEnv> = process.env): AppConfig {
  const baseUrl = readEnvString(source, 'BASE_URL', 'https://app.uniswap.org');
  parseHttpUrl(baseUrl, 'BASE_URL');

  // Red por defecto: testnet. Mainnet exige opt-in explícito (ALLOW_MAINNET).
  const networkRawName = readEnvString(source, 'NETWORK', 'sepolia');
  if (!isNetworkName(networkRawName)) {
    throw new Error(
      `[env] "NETWORK" desconocida: "${networkRawName}". Redes soportadas: ${NETWORK_NAMES.join(', ')}.`,
    );
  }
  const network = getNetwork(networkRawName);

  const allowMainnet = readEnvBoolean(source, 'ALLOW_MAINNET', false);
  if (network.name === 'mainnet' && !allowMainnet) {
    throw new Error(
      '[env] NETWORK=mainnet requiere ALLOW_MAINNET=true. La suite es determinista y no debe tocar mainnet por accidente.',
    );
  }

  const rpcUrl = readEnvOptional(source, 'RPC_URL');
  const rpcParsed = rpcUrl === null ? null : parseHttpUrl(rpcUrl, 'RPC_URL');

  const privateKey = readEnvOptional(source, 'PRIVATE_KEY');
  if (privateKey !== null) {
    if (!PRIVATE_KEY_PATTERN.test(privateKey)) {
      throw new Error('[env] "PRIVATE_KEY" no tiene formato válido (32 bytes hex).');
    }
    if (rpcParsed === null || !isLocalUrl(rpcParsed)) {
      throw new Error(
        '[env] "PRIVATE_KEY" solo se acepta con RPC_URL local (localhost/127.0.0.1): usa un fork/Anvil efímero.',
      );
    }
  }

  const config: Omit<AppConfig, 'privateKey'> = {
    baseUrl,
    networkName: network.name,
    chainId: network.chainId,
    allowMainnet,
    rpcUrl,
    headless: readEnvBoolean(source, 'HEADLESS', true),
    isCi: readEnvBoolean(source, 'CI', false),
    timeouts: {
      testMs: readEnvPositiveInt(source, 'TEST_TIMEOUT_MS', 45_000),
      navigationMs: readEnvPositiveInt(source, 'NAVIGATION_TIMEOUT_MS', 30_000),
      actionMs: readEnvPositiveInt(source, 'ACTION_TIMEOUT_MS', 15_000),
      expectMs: readEnvPositiveInt(source, 'EXPECT_TIMEOUT_MS', 10_000),
    },
  };
  // No enumerable: queda fuera de JSON.stringify, spreads y console.log.
  Object.defineProperty(config, 'privateKey', {
    value: privateKey,
    enumerable: false,
    writable: false,
  });
  return config as AppConfig;
}

/** Configuración validada de la sesión en curso (memoizada por importación). */
export const env: AppConfig = loadConfig();
