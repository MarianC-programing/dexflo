/**
 * Escenarios preconfigurados del wallet EIP-1193 (presets deterministas).
 *
 * Cada preset devuelve un `WalletMockState` que el fixture `web3Page`
 * inyecta vía `page.addInitScript`. Los tests personalizan el arranque con
 * `test.use({ walletState: <preset>() })` — ver Fase 6.
 */

import type { NetworkName } from '../config/networks';
import { getNetwork } from '../config/networks';
import {
  MOCK_ADDRESS,
  MOCK_BLOCK_NUMBER_HEX,
  MOCK_ERRORS,
  MOCK_ESTIMATE_GAS_HEX,
  MOCK_GAS_PRICE_HEX,
  MOCK_NATIVE_BALANCE_HEX,
  MOCK_SIGNATURE,
  MOCK_TX_HASH,
  type RpcMethod,
} from '../utils/mockData';
import type {
  Eip1193MockBootstrap,
  WalletMockErrors,
  WalletMockRpcPayloads,
  WalletMockState,
} from './eip1193';

export function connectedWallet(overrides: Partial<WalletMockState> = {}): WalletMockState {
  const mainnet = getNetwork('mainnet');
  return {
    address: MOCK_ADDRESS,
    grantableAddress: null,
    chainIdHex: mainnet.hexChainId,
    networkVersion: String(mainnet.chainId),
    autoApproveConnect: false,
    rejectTransaction: false,
    rejectSignature: false,
    insufficientFunds: false,
    unresponsiveMethods: [],
    latencyMs: 0,
    ...overrides,
  };
}

/** Wallet cerrada: listas vacías y permisos 4100 hasta que se apruebe. */
export function lockedWallet(overrides: Partial<WalletMockState> = {}): WalletMockState {
  return {
    ...connectedWallet(),
    address: null,
    grantableAddress: MOCK_ADDRESS,
    ...overrides,
  };
}

/** Wallet cerrada que aprueba la conexión al primer `eth_requestAccounts`. */
export function approvingConnectWallet(overrides: Partial<WalletMockState> = {}): WalletMockState {
  return {
    ...lockedWallet(),
    autoApproveConnect: true,
    ...overrides,
  };
}

/** Transacción rechazada por el usuario con el código 4010 del spec. */
export function rejectingTransaction(overrides: Partial<WalletMockState> = {}): WalletMockState {
  return {
    ...connectedWallet(),
    rejectTransaction: true,
    ...overrides,
  };
}

/** Firma rechazada con 4001 (estándar EIP-1193). */
export function rejectingSignature(overrides: Partial<WalletMockState> = {}): WalletMockState {
  return {
    ...connectedWallet(),
    rejectSignature: true,
    ...overrides,
  };
}

/** Fondo insuficiente: mensaje clásico de geth (-32000). */
export function insufficientFundsWallet(overrides: Partial<WalletMockState> = {}): WalletMockState {
  return {
    ...connectedWallet(),
    insufficientFunds: true,
    ...overrides,
  };
}

/** La DApp arranca en una cadena distinta a mainnet (p. ej. 0x2105 para Base). */
export function wrongNetwork(
  networkName: NetworkName,
  overrides: Partial<WalletMockState> = {},
): WalletMockState {
  const target = getNetwork(networkName);
  return {
    ...connectedWallet(),
    chainIdHex: target.hexChainId,
    networkVersion: String(target.chainId),
    ...overrides,
  };
}

/** Red de RPC bajo latencia constante ⇒ timeouts controlados por los tests. */
export function highLatencyWallet(
  latencyMs: number,
  overrides: Partial<WalletMockState> = {},
): WalletMockState {
  return {
    ...connectedWallet(),
    latencyMs,
    ...overrides,
  };
}

/** Métodos RPC colgados sin responder (timeout de red sin ruido aleatorio). */
export function unresponsiveWallet(
  methods: readonly RpcMethod[],
  overrides: Partial<WalletMockState> = {},
): WalletMockState {
  return {
    ...connectedWallet(),
    unresponsiveMethods: [...methods],
    ...overrides,
  };
}

export interface BootstrapOverrides {
  readonly rpc?: Partial<WalletMockRpcPayloads>;
  readonly errors?: Partial<WalletMockErrors>;
}

/** Puntos de datos RPC → payload serializable para `addInitScript`. */
export function createBootstrap(
  wallet: WalletMockState,
  overrides: BootstrapOverrides = {},
): Eip1193MockBootstrap {
  const rpc: WalletMockRpcPayloads = {
    primaryAddressHex: MOCK_ADDRESS,
    nativeBalanceHex: MOCK_NATIVE_BALANCE_HEX,
    zeroBalanceHex: '0x0',
    signatureHex: MOCK_SIGNATURE,
    transactionHashHex: MOCK_TX_HASH,
    gasPriceHex: MOCK_GAS_PRICE_HEX,
    blockNumberHex: MOCK_BLOCK_NUMBER_HEX,
    estimateGasHex: MOCK_ESTIMATE_GAS_HEX,
    ...(overrides.rpc ?? {}),
  };
  const errors: WalletMockErrors = {
    userRejected: MOCK_ERRORS.userRejectedRequest,
    userRejectedTransaction: MOCK_ERRORS.userRejectedTransaction,
    unauthorized: MOCK_ERRORS.unauthorized,
    insufficientFunds: MOCK_ERRORS.insufficientFunds,
    methodNotSupported: MOCK_ERRORS.methodNotSupported,
    ...(overrides.errors ?? {}),
  };
  return { wallet, rpc, errors } satisfies Eip1193MockBootstrap;
}
