/**
 * Contrato EIP-1193 simulado + inyector programático del provider.
 *
 * Restricción estructural: `injectEip1193Provider` se serializa con
 * `page.addInitScript`, por lo que NO puede referenciar helpers ni
 * constantes de módulos externos (su closure no viaja al navegador).
 * Todo el comportamiento y los datos llegan por el argumento
 * serializable `Eip1193MockBootstrap`.
 *
 * Escenarios cubiertos (docs/plan.md · Fase 3):
 * - Conexión correcta (eth_accounts, eth_requestAccounts, permissions).
 * - Cuenta bloqueada / desconectada (lista vacía + permission 4100).
 * - Rechazo de firma (4001) y de transacción (4010, código del spec).
 * - Saldo insuficiente (-32000) y red incorrecta (switch rechazado 4001).
 * - Timeout de red: método colgado sin resolver (latencia controlable).
 */

import type { Eip1193Error } from '../utils/mockData';

// ============================================================================
// Estado del wallet mockeado (serializable + mutable en página)
// ============================================================================

export interface WalletMockState {
  /** Dirección expuesta por eth_accounts (null = wallet bloqueada). */
  address: string | null;
  /** Dirección disponible al aprobar conexión cuando la wallet estaba cerrada. */
  grantableAddress: string | null;
  /** Hex chainId vigente (p. ej. '0x1'). */
  chainIdHex: string;
  /** networkVersion derivada (p. ej. '1'). */
  networkVersion: string;
  /** Si una wallet bloqueada aprueba eth_requestAccounts automáticamente. */
  autoApproveConnect: boolean;
  /** eth_sendTransaction rechaza con 4010 (spec del proyecto). */
  rejectTransaction: boolean;
  /** personal_sign/eth_sign(req) rechazan con 4001 (estándar EIP-1193). */
  rejectSignature: boolean;
  /** eth_sendTransaction falla con -32000 (mensaje geth). */
  insufficientFunds: boolean;
  /** Métodos que quedan colgados ⇒ simulación de timeout de red. */
  unresponsiveMethods: string[];
  /** Latencia artificial aplicada a TODO request (0 = inmediato). */
  latencyMs: number;
}

export interface WalletMockRpcPayloads {
  /** Dirección asociada al saldo nativo determinista. */
  readonly primaryAddressHex: string;
  readonly nativeBalanceHex: string;
  readonly zeroBalanceHex: string;
  readonly signatureHex: string;
  readonly transactionHashHex: string;
  readonly gasPriceHex: string;
  readonly blockNumberHex: string;
  readonly estimateGasHex: string;
}

/** Errores disponibles dentro del script (claves = etiquetas del preset). */
export interface WalletMockErrors {
  readonly userRejected: Eip1193Error;
  readonly userRejectedTransaction: Eip1193Error;
  readonly unauthorized: Eip1193Error;
  readonly insufficientFunds: Eip1193Error;
  readonly methodNotSupported: Eip1193Error;
}

export interface Eip1193MockBootstrap {
  readonly wallet: WalletMockState;
  readonly rpc: WalletMockRpcPayloads;
  readonly errors: WalletMockErrors;
}

// ============================================================================
// Contrato público del provider (lo que las DApps consumen)
// ============================================================================

export interface Eip1193RequestArguments {
  readonly method: string;
  readonly params?: unknown;
}

export interface Eip1193Provider {
  readonly isMetaMask: boolean;
  /** Marca de control interno: permite diferenciar el mock de un provider real. */
  readonly isDexfloMock: boolean;
  networkVersion: string;
  selectedAddress: string | null;
  chainId: string;
  request(args: Eip1193RequestArguments): Promise<unknown>;
  on(event: string, listener: (payload: unknown) => void): void;
  once(event: string, listener: (payload: unknown) => void): void;
  removeListener(event: string, listener: (payload: unknown) => void): void;
}

/** Canal de control (NO estándar) para dirigir el mock desde los tests. */
export interface DexfloWalletController {
  /** Copia del estado vigente (a prueba de mutaciones externas). */
  state(): WalletMockState;
  /** Fusiona un parche y emite accountsChanged/chainChanged si aplican. */
  configure(patch: Partial<WalletMockState>): void;
  /** Emite un evento EIP-1193 hacia los listeners registrados en página. */
  emit(event: string, payload: unknown): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    __dexfloWallet?: DexfloWalletController;
    /** Bucket auxiliar para capturar eventos EIP-1193 en tests del provider. */
    __dexfloEvents?: unknown[];
  }
}

// ============================================================================
// Inyector del provider (autocontenido: nada del módulo puede ser referenciado)
// ============================================================================

export function injectEip1193Provider(bootstrap: Eip1193MockBootstrap): void {
  const state: WalletMockState = bootstrap.wallet;
  const rpc = bootstrap.rpc;
  const errors = bootstrap.errors;

  const listenersByEvent = new Map<string, Set<(payload: unknown) => void>>();

  const dispatchEvent = (event: string, payload: unknown): void => {
    const listeners = listenersByEvent.get(event);
    if (listeners === undefined) {
      return;
    }
    for (const listener of listeners) {
      listener(payload);
    }
  };

  const providerError = (source: Eip1193Error): Error => {
    const thrown = new Error(source.message) as Error & { code: number };
    thrown.code = source.code;
    return thrown;
  };

  const buildPermissionsPayload = (invoker: string): unknown[] => [
    {
      id: 'dexflo-mock-permission-0',
      parentCapability: 'eth_accounts',
      invoker: `dapp://${invoker}`,
      caveats: [],
      date: 0,
    },
  ];

  const sameHex = (left: string | null, right: string): boolean => {
    if (left === null) {
      return false;
    }
    return left.toLowerCase() === right.toLowerCase();
  };

  const switchTargetChainId = (rawParam: unknown): string | null => {
    if (typeof rawParam !== 'object' || rawParam === null || !('chainId' in rawParam)) {
      return null;
    }
    const chainId = rawParam.chainId;
    return typeof chainId === 'string' ? chainId : null;
  };

  /** Envuelve los datos deterministas en el payload de un receipt exitoso. */
  const buildReceiptPayload = (): Record<string, unknown> => ({
    transactionHash: rpc.transactionHashHex,
    from: state.address,
    status: '0x1',
    blockNumber: rpc.blockNumberHex,
    gasUsed: '0x5208', // 21000 gas: transferencia estándar
    logs: [],
  });

  const resolveRequest = (method: string, params: readonly unknown[]): unknown => {
    switch (method) {
      case 'eth_accounts':
        return state.address ? [state.address] : [];
      case 'eth_coinbase':
        return state.address ?? null;
      case 'eth_requestAccounts': {
        if (state.address) {
          return [state.address];
        }
        if (state.autoApproveConnect && state.grantableAddress) {
          state.address = state.grantableAddress;
          dispatchEvent('accountsChanged', [state.address]);
          return [state.address];
        }
        return [];
      }
      case 'wallet_requestPermissions': {
        const invoker = state.address ?? (state.autoApproveConnect ? state.grantableAddress : null);
        if (!invoker) {
          throw providerError(errors.unauthorized);
        }
        if (!state.address && state.grantableAddress) {
          state.address = state.grantableAddress;
          dispatchEvent('accountsChanged', [state.address]);
        }
        return buildPermissionsPayload(invoker);
      }
      case 'wallet_getPermissions': {
        const invoker = state.address ?? (state.autoApproveConnect ? state.grantableAddress : null);
        if (!invoker) {
          throw providerError(errors.unauthorized);
        }
        return buildPermissionsPayload(invoker);
      }
      case 'wallet_revokePermissions':
        if (state.address) {
          state.address = null;
          dispatchEvent('accountsChanged', []);
        }
        return null;
      case 'eth_chainId':
        return state.chainIdHex;
      case 'net_version':
        return state.networkVersion;
      case 'wallet_switchEthereumChain': {
        const targetChainIdHex = switchTargetChainId(params[0]);
        // A la misma cadena: aceptar (null). A otra: rechazar como lo hace un
        // usuario real ⇒ la DApp permanece en "red incorrecta" (determinista).
        if (!targetChainIdHex || sameHex(targetChainIdHex, state.chainIdHex)) {
          return null;
        }
        throw providerError(errors.userRejected);
      }
      case 'personal_sign':
      case 'eth_sign':
      case 'eth_signTypedData_v4':
        if (state.rejectSignature) {
          throw providerError(errors.userRejected);
        }
        return rpc.signatureHex;
      case 'eth_sendTransaction':
        if (state.rejectTransaction) {
          throw providerError(errors.userRejectedTransaction);
        }
        if (state.insufficientFunds) {
          throw providerError(errors.insufficientFunds);
        }
        return rpc.transactionHashHex;
      case 'eth_estimateGas':
        return rpc.estimateGasHex;
      case 'eth_gasPrice':
        return rpc.gasPriceHex;
      case 'eth_blockNumber':
        return rpc.blockNumberHex;
      case 'eth_getBalance': {
        const requested = typeof params[0] === 'string' ? params[0] : null;
        const isWallet = sameHex(requested, state.address ?? '_____');
        const isAnchor = sameHex(requested, rpc.primaryAddressHex);
        return isWallet || isAnchor ? rpc.nativeBalanceHex : rpc.zeroBalanceHex;
      }
      case 'eth_getTransactionReceipt':
        return buildReceiptPayload();
      default:
        throw providerError(errors.methodNotSupported);
    }
  };

  window.ethereum = {
    isMetaMask: true,
    isDexfloMock: true,
    get chainId(): string {
      return state.chainIdHex;
    },
    get networkVersion(): string {
      return state.networkVersion;
    },
    get selectedAddress(): string | null {
      return state.address;
    },
    request: async (args: Eip1193RequestArguments): Promise<unknown> => {
      const method = args.method;
      const params = Array.isArray(args.params) ? (args.params as readonly unknown[]) : [];
      if (state.unresponsiveMethods.includes(method)) {
        // Sin resolución: la DApp/tests deben aplicar su propio timeout.
        return new Promise<never>(() => {
          /* pendiente a propósito: simula timeout de red */
        });
      }
      if (state.latencyMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, state.latencyMs);
        });
      }
      return resolveRequest(method, params);
    },
    on: (event: string, listener: (payload: unknown) => void): void => {
      const listeners = listenersByEvent.get(event) ?? new Set<(payload: unknown) => void>();
      listeners.add(listener);
      listenersByEvent.set(event, listeners);
    },
    once: (event: string, listener: (payload: unknown) => void): void => {
      const wrapper = (payload: unknown): void => {
        window.ethereum?.removeListener(event, wrapper);
        listener(payload);
      };
      window.ethereum?.on(event, wrapper);
    },
    removeListener: (event: string, listener: (payload: unknown) => void): void => {
      listenersByEvent.get(event)?.delete(listener);
    },
  };

  // Canal de control para `page.evaluate` desde los tests.
  window.__dexfloWallet = {
    state: (): WalletMockState => ({
      ...state,
      unresponsiveMethods: [...state.unresponsiveMethods],
    }),
    configure: (patch: Partial<WalletMockState>): void => {
      const previousAddress = state.address;
      const previousChainIdHex = state.chainIdHex;
      Object.assign(state, patch);
      if (previousChainIdHex !== state.chainIdHex) {
        dispatchEvent('chainChanged', state.chainIdHex);
      }
      if (previousAddress !== state.address) {
        dispatchEvent('accountsChanged', state.address ? [state.address] : []);
      }
    },
    emit: dispatchEvent,
  } satisfies DexfloWalletController;
}
