/**
 * Catálogo centralizado de redes EVM: chain IDs numéricos/hex y RPC públicos.
 *
 * Todo chainId aquí es el dato maestro: env.ts valida NETWORK contra este
 * registro y los mocks (src/utils/mockData.ts) usan sus helpers para los
 * payloads `eth_chainId`. Los RPC públicos sin llaves existen para validaciones
 * contractuales ligeras (@web3): no garantizan SLA y nunca reciben secretos.
 */

export interface NativeCurrency {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface NetworkConfig {
  readonly name: NetworkName;
  readonly chainId: number;
  readonly hexChainId: string;
  /** RPC público sin llaves; sólo para validaciones contractuales ligeras. */
  readonly rpcUrl: string;
  readonly explorerUrl: string;
  readonly nativeCurrency: NativeCurrency;
}

/** Orden canónico de redes: la primera es la red por defecto de la suite. */
export const NETWORK_NAMES = [
  'mainnet',
  'polygon',
  'arbitrum',
  'optimism',
  'base',
  'sepolia',
] as const;

export type NetworkName = (typeof NETWORK_NAMES)[number];

/** Convierte un chainId numérico a su representación hex EIP-1193 (`0x…`). */
export function toHexChainId(chainId: number): string {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error(`[networks] Chain ID inválido: ${chainId}`);
  }
  return `0x${chainId.toString(16)}`;
}

function buildNetwork(
  name: NetworkName,
  chainId: number,
  rpcUrl: string,
  explorerUrl: string,
  nativeCurrency: NativeCurrency,
): NetworkConfig {
  return {
    name,
    chainId,
    hexChainId: toHexChainId(chainId),
    rpcUrl,
    explorerUrl,
    nativeCurrency,
  };
}

const ETHER: NativeCurrency = { name: 'Ethereum', symbol: 'ETH', decimals: 18 };

const NETWORKS_RECORD: Record<NetworkName, NetworkConfig> = {
  mainnet: buildNetwork(
    'mainnet',
    1,
    'https://ethereum-rpc.publicnode.com',
    'https://etherscan.io',
    ETHER,
  ),
  polygon: buildNetwork(
    'polygon',
    137,
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygonscan.com',
    {
      name: 'Polygon Ecosystem Token',
      symbol: 'POL',
      decimals: 18,
    },
  ),
  arbitrum: buildNetwork(
    'arbitrum',
    42161,
    'https://arbitrum-one-rpc.publicnode.com',
    'https://arbiscan.io',
    ETHER,
  ),
  optimism: buildNetwork(
    'optimism',
    10,
    'https://optimism-rpc.publicnode.com',
    'https://optimistic.etherscan.io',
    ETHER,
  ),
  base: buildNetwork(
    'base',
    8453,
    'https://base-rpc.publicnode.com',
    'https://basescan.org',
    ETHER,
  ),
  sepolia: buildNetwork(
    'sepolia',
    11155111,
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.etherscan.io',
    {
      name: 'Sepolia Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  ),
};

export const NETWORKS: Readonly<Record<NetworkName, NetworkConfig>> =
  Object.freeze(NETWORKS_RECORD);

/** Devuelve una copia defensiva de la red (evita mutaciones entre tests). */
export function getNetwork(name: NetworkName): NetworkConfig {
  const network = NETWORKS[name];
  return { ...network, nativeCurrency: { ...network.nativeCurrency } };
}

/** Busca una red por chainId numérico (p. ej. 11155111 para Sepolia). */
export function getNetworkByChainId(chainId: number): NetworkConfig | null {
  for (const name of NETWORK_NAMES) {
    if (NETWORKS[name].chainId === chainId) {
      return getNetwork(name);
    }
  }
  return null;
}

/** Guarda de tipo para validar cadenas de entorno (`.env`, CLI) de forma segura. */
export function isNetworkName(value: string): value is NetworkName {
  return (NETWORK_NAMES as readonly string[]).includes(value);
}
