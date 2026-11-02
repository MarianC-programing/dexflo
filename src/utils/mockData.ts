/**
 * Datos deterministas para todo el framework: provider EIP-1193 simulado,
 * respuestas RPC mockeadas, feeds de precios y errores de red estándar.
 *
 * Reglas de oro (docs/plan.md · decisión "suite determinista"):
 * - Nada de valores aleatorios ni `Date.now()`: el pipeline CI/CD no puede
 *   fallar por fluctuación de datos.
 * - Los importes se escriben como cadenas decimales y se convierten a wei hex
 *   con helpers exactos (BigInt), nunca con aritmética de punto flotante.
 * - El código de rechazo EIP-1193 del proyecto es 4010 (repetir el criterio
 *   definido en el spec); 4001 (estándar) queda registrado para firmas.
 */

import { toHexChainId } from '../config/networks';

// ============================================================================
// Utilidades numéricas exactas
// ============================================================================

const WEI_DECIMALS = 18;

/** Convierte un entero no negativo a su forma hex RPC (`0x…`). */
export function toHexNumber(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`[mockData] Sólo enteros no negativos seguros; recibido: ${value}`);
  }
  return `0x${value.toString(16)}`;
}

/**
 * Convierte un importe decimal ("12.5") a wei hex con `decimals` de precisión.
 * Evita binomios flotantes: la conversión es textual (entero + fracción).
 */
export function toWeiHex(amount: string, decimals: number = WEI_DECIMALS): string {
  const trimmed = amount.trim();
  if (!/^(?:\d+)(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`[mockData] Importe decimal inválido: "${amount}"`);
  }
  const [integerPart, fractionalPart = ''] = trimmed.split('.');
  const paddedFraction = fractionalPart.slice(0, decimals).padEnd(decimals, '0');
  const wei = BigInt(`${integerPart}${paddedFraction}`);
  return `0x${wei.toString(16)}`;
}

// ============================================================================
// Identidades deterministas de wallet
// ============================================================================

/** Dirección base de prueba definida por el spec del proyecto. */
export const MOCK_ADDRESS = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';

/** Dirección nula: útil para tests de "wallet desconectada" (Fase 3). */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const TX_HASH_BODY = '3f2a9c5b7d1e8f4a6c0b2d9e1f7a3c5b8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a';
export const MOCK_TX_HASH = `0x${TX_HASH_BODY}`;

const SIGNATURE_R = '48b3b4a5c1d2e3f405162738495a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6';
const SIGNATURE_S = '6a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544332211';
const SIGNATURE_V = '1b';
export const MOCK_SIGNATURE = `0x${SIGNATURE_R}${SIGNATURE_S}${SIGNATURE_V}`;

// ============================================================================
// Constantes de red para los payloads RPC
// ============================================================================

/** Red de los mocks (mainnet). Usar src/config/networks.ts como catálogo. */
export const MOCK_CHAIN_ID = 1;
export const MOCK_CHAIN_ID_HEX = toHexChainId(MOCK_CHAIN_ID);

export const MOCK_BLOCK_NUMBER = 21_500_000;
export const MOCK_BLOCK_NUMBER_HEX = toHexNumber(MOCK_BLOCK_NUMBER);

/** Precio del gas estable para el pipeline (30 gwei). */
export const MOCK_GAS_PRICE_HEX = toHexNumber(30_000_000_000);
/** Gas de una transferencia estándar (21000). */
export const MOCK_GAS_USED_TRANSFER_HEX = toHexNumber(21_000);
/** Estimación típica de un swap Uniswap V3 (~150k). */
export const MOCK_ESTIMATE_GAS_HEX = toHexNumber(150_000);

// ============================================================================
// Tokens (direcciones L1 verificables en etherscan)
// ============================================================================

export interface MockToken {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  /** id de CoinGecko para enlazar con los feeds de precios de abajo. */
  readonly coingeckoId: string;
}

export const NATIVE_ASSET: MockToken = {
  address: ZERO_ADDRESS,
  symbol: 'ETH',
  name: 'Ether',
  decimals: 18,
  coingeckoId: 'ethereum',
};

export const MOCK_TOKENS = {
  weth: {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    coingeckoId: 'weth',
  },
  usdc: {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    coingeckoId: 'usd-coin',
  },
  usdt: {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    coingeckoId: 'tether',
  },
  dai: {
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    coingeckoId: 'dai',
  },
} as const satisfies Readonly<Record<string, MockToken>>;

export type MockTokenKey = keyof typeof MOCK_TOKENS;

export const TOKEN_LIST: readonly MockToken[] = [NATIVE_ASSET, ...Object.values(MOCK_TOKENS)];

// ============================================================================
// Balances del wallet mockeado
// ============================================================================

export interface MockBalance {
  readonly token: MockToken;
  readonly weiHex: string;
}

export const MOCK_WALLET = {
  address: MOCK_ADDRESS,
  chainId: MOCK_CHAIN_ID,
  nativeBalance: {
    token: NATIVE_ASSET,
    weiHex: toWeiHex('12.5'),
  },
  erc20Balances: [
    { token: MOCK_TOKENS.usdc, weiHex: toWeiHex('2500.00', 6) },
    { token: MOCK_TOKENS.usdt, weiHex: toWeiHex('1250.00', 6) },
    { token: MOCK_TOKENS.dai, weiHex: toWeiHex('400.00', 18) },
    { token: MOCK_TOKENS.weth, weiHex: toWeiHex('2.50', 18) },
  ],
} as const;

/** Saldo para `eth_getBalance` de la dirección base. */
export const MOCK_NATIVE_BALANCE_HEX = MOCK_WALLET.nativeBalance.weiHex;

// ============================================================================
// Feeds de precios (contrato CoinGecko /simple/price)
// ============================================================================

export interface PriceEntry {
  readonly usd: number;
  /** Variación 24h en % — estable para aserciones de formato y rangos. */
  readonly usd24hChange: number;
}

/** Contrato de la API REAL que se mockea: { [id]: { usd, … } }. */
export type PriceFeedResponse = Readonly<Record<string, PriceEntry>>;

export const MOCK_PRICES: PriceFeedResponse = {
  ethereum: { usd: 3000, usd24hChange: 1.85 },
  weth: { usd: 3000, usd24hChange: 1.85 },
  'usd-coin': { usd: 1, usd24hChange: 0.01 },
  tether: { usd: 1, usd24hChange: 0.01 },
  dai: { usd: 1, usd24hChange: 0.01 },
};

/** Respuesta base reutilizable; `overrides` reemplaza entradas completas. */
export function buildPriceFeedResponse(
  overrides: Readonly<Record<string, PriceEntry>> = {},
): PriceFeedResponse {
  return { ...MOCK_PRICES, ...overrides };
}

/** Serialización lista para `route.fulfill({ body })`. */
export function buildPriceFeedJson(overrides: Readonly<Record<string, PriceEntry>> = {}): string {
  return JSON.stringify(buildPriceFeedResponse(overrides));
}

// ============================================================================
// Recibos de transacción deterministas
// ============================================================================

export interface MockTransactionReceipt {
  readonly transactionHash: string;
  readonly from: string;
  readonly status: '0x1' | '0x0';
  readonly blockNumber: string;
  readonly gasUsed: string;
  readonly logs: readonly unknown[];
}

export function buildTransactionReceipt(
  overrides: Partial<MockTransactionReceipt> = {},
): MockTransactionReceipt {
  return {
    transactionHash: MOCK_TX_HASH,
    from: MOCK_ADDRESS,
    status: '0x1',
    blockNumber: MOCK_BLOCK_NUMBER_HEX,
    gasUsed: MOCK_GAS_USED_TRANSFER_HEX,
    logs: [],
    ...overrides,
  };
}

// ============================================================================
// Métodos y errores RPC (EIP-1193 / EIP-1474)
// ============================================================================

/** Métodos RPC manejados por el provider mockeado (Fase 3). */
export const RPC_METHODS = {
  ethAccounts: 'eth_accounts',
  ethRequestAccounts: 'eth_requestAccounts',
  ethChainId: 'eth_chainId',
  personalSign: 'personal_sign',
  ethSendTransaction: 'eth_sendTransaction',
  ethGetBalance: 'eth_getBalance',
  ethGasPrice: 'eth_gasPrice',
  ethBlockNumber: 'eth_blockNumber',
} as const satisfies Readonly<Record<string, string>>;

export type RpcMethod = (typeof RPC_METHODS)[keyof typeof RPC_METHODS];

/** Forma de un error EIP-1193 devuelto por `window.ethereum.request`. */
export interface Eip1193Error {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/**
 * Códigos estándar:
 * - 4001/4100/4200: EIP-1193 (rechazo, no autorizado, método no soportado).
 * - 4902: chain no reconocido (extensión wallet_addEthereumChain).
 * - -32xxx: EIP-1474 (errores de servidor RPC).
 * - 4010: código elegido por ESTE proyecto para el rechazo de transacción.
 */
export const RPC_ERROR_CODES = {
  userRejected: 4001,
  userRejectedTransaction: 4010,
  unauthorized: 4100,
  unsupportedMethod: 4200,
  chainUnrecognized: 4902,
  insufficientFunds: -32000,
  invalidInput: -32602,
  internalError: -32603,
} as const satisfies Readonly<Record<string, number>>;

/** Escenarios de error reproducibles para mocks (claves tipadas). */
export const MOCK_ERRORS = {
  /** Firma/personal_sign rechazada por el usuario (estándar EIP-1193). */
  userRejectedRequest: {
    code: RPC_ERROR_CODES.userRejected,
    message: 'User rejected the request.',
  },
  /** Transacción rechazada: código 4010 del spec del proyecto. */
  userRejectedTransaction: {
    code: RPC_ERROR_CODES.userRejectedTransaction,
    message: 'User rejected the transaction.',
  },
  unauthorized: {
    code: RPC_ERROR_CODES.unauthorized,
    message: 'The requested account and/or method has not been authorized.',
  },
  /** Mensaje clásico de geth para el caso de saldo insuficiente. */
  insufficientFunds: {
    code: RPC_ERROR_CODES.insufficientFunds,
    message: 'insufficient funds for gas * price + value',
  },
  chainUnrecognized: {
    code: RPC_ERROR_CODES.chainUnrecognized,
    message: 'Unrecognized chain ID.',
  },
  /** Timeout de red RPC tratado como error interno (-32603). */
  networkTimeout: {
    code: RPC_ERROR_CODES.internalError,
    message: 'Request timed out.',
  },
  /** Método fuera del switch del provider mockeado (4200). */
  methodNotSupported: {
    code: RPC_ERROR_CODES.unsupportedMethod,
    message: 'The requested method is not supported by this provider.',
  },
} satisfies Readonly<Record<string, Eip1193Error>>;
