# web3-dex-automation-suite (Dexflo)

[![CI](https://github.com/MarianC-programing/dexflo/actions/workflows/playwright.yml/badge.svg)](https://github.com/MarianC-programing/dexflo/actions/workflows/playwright.yml)
![gitleaks](https://img.shields.io/badge/protected%20by-gitleaks-blue)

Framework de pruebas E2E y de API para DApps Web3/DEX: **TypeScript + Playwright Test**, con Page Object Model, mockeo determinista del provider EIP-1193 (`window.ethereum`) y capa RPC opcional con [viem](https://viem.sh).

El plan completo de fases y decisiones está en [`docs/plan.md`](docs/plan.md).

## Stack

- Node.js 20+ · TypeScript 5 (modo estricto)
- Playwright Test Runner (headless, retries solo en CI)
- ESLint + Prettier + Husky (hooks pre-commit / pre-push)
- viem para validaciones on-chain (Fase 3+)
- CI/CD: GitHub Actions con acciones pinned por SHA, reportes como artefactos y gitleaks (Fase 7)

## Estado del framework

| Fase | Alcance                                                                 | Estado    |
| ---- | ----------------------------------------------------------------------- | --------- |
| 1    | Base del proyecto, tooling de calidad, config de Playwright             | ✅        |
| 2    | Config de entorno y datos deterministas (`env`, `networks`, `mockData`) | ✅        |
| 3    | Wallet EIP-1193 simulada + capa blockchain (viem)                       | ✅        |
| 4    | Page Objects, adapters y sandbox DEX local                              | ✅        |
| 5    | API y red determinista (`routes.ts`, cliente CoinGecko)                 | ✅        |
| 6    | Suites funcionales (`@smoke`, `@e2e`, `@api`, `@web3`)                  | ✅        |
| 7    | CI/CD (GitHub Actions) y documentación completa                         | pendiente |

## Puesta en marcha

```bash
npm install          # instala dependencias y configura los hooks de husky
npx playwright install chromium
npm run typecheck    # valida tipos estrictos
npm run lint         # eslint (reglas type-checked + playwright)
npm run format:check # prettier
npm run test:unit    # config y guards de seguridad
npm run test:web3    # provider EIP-1193 mockeado
npm run test:api     # clientes de API contra stubs deterministas
npm run test:e2e     # Page Objects contra la sandbox local
npm test             # toda la suite
```

## Configuración

Copiar `.env.example` a `.env` (no se versiona). La configuración se valida de forma tipada en `src/config/env.ts` y las redes en `src/config/networks.ts`:

| Variable                | Por defecto               | Uso                                                                    |
| ----------------------- | ------------------------- | ---------------------------------------------------------------------- |
| `BASE_URL`              | `https://app.uniswap.org` | URL de la DApp objetivo.                                               |
| `NETWORK`               | `sepolia`                 | Red del catálogo (`mainnet`…`sepolia`).                                |
| `ALLOW_MAINNET`         | `false`                   | Opt-in explícito para `NETWORK=mainnet`.                               |
| `DAPP_TARGET`           | `sandbox`                 | Adapter E2E: `sandbox` (determinista) · `uniswap` (referencia).        |
| `RPC_URL`               | —                         | RPC on-chain; sin ella los contractuales `@web3` quedan en skip.       |
| `PRIVATE_KEY`           | —                         | Wallet efímera; solo con `RPC_URL` local (fork/Anvil); sin logs.       |
| `CONTRACTUAL_API`       | desactivada               | `1`/`true` activa los contractuales `@api` contra `api.coingecko.com`. |
| `HEADLESS`              | `true`                    | Headless por defecto (`--headed` lo anula en local).                   |
| `CI`                    | `false`                   | Actions la activa: retries, workers y reporter JUnit.                  |
| `TEST_TIMEOUT_MS`       | `45000`                   | Tiempo máximo por test.                                                |
| `NAVIGATION_TIMEOUT_MS` | `30000`                   | Navegaciones (`goto`).                                                 |
| `ACTION_TIMEOUT_MS`     | `15000`                   | Acciones (click, fill, combo).                                         |
| `EXPECT_TIMEOUT_MS`     | `10000`                   | Esperas de `expect` (DOM y red).                                       |

Valores seguros por defecto: `NETWORK=sepolia`; `mainnet` exige `ALLOW_MAINNET=true`. `PRIVATE_KEY` solo se acepta con un `RPC_URL` local (fork/Anvil) y las URLs no admiten credenciales embebidas. En CI no se define ninguna de estas variables (ver [CI](#ci-github-actions)). Detalles en [`docs/SECURITY.md`](docs/SECURITY.md); estado de sesión en [`docs/CONTEXT.md`](docs/CONTEXT.md).

## CI (GitHub Actions)

Workflow único en `.github/workflows/playwright.yml`; se dispara en _push_ y
_pull request_ hacia `main` (y a mano con `workflow_dispatch`) sobre
`ubuntu-latest` con Node 20:

| Job        | Contenido                                                                    |
| ---------- | ---------------------------------------------------------------------------- |
| `quality`  | `typecheck` · `lint` · `format:check` — falla rápido, sin navegadores        |
| `tests`    | `npm ci` → chromium → `npm test` (toda la suite; retries y JUnit solo en CI) |
| `gitleaks` | escaneo de secretos sobre el historial completo (`fetch-depth: 0`)           |

Política aplicada (detalle en [`docs/SECURITY.md`](docs/SECURITY.md)):

- **Sin secretos ni red real**: el flujo no define `ALLOW_MAINNET`, `RPC_URL`
  ni `PRIVATE_KEY` — los casos contractuales quedan en skip (opt-in por
  entorno) y ningún artefacto publicado puede contener una llave.
- **Reportes siempre**: `playwright-report/`, `test-results/` (trazas,
  screenshots y vídeo de fallo) y `results/junit.xml` se suben con
  `if: always()` aunque falle la suite; retención de 7 días.
- **Suministro determinista**: `npm ci` y acciones fijadas por el SHA del
  commit del tag — el tag va comentado en cada `uses` (`checkout v7.0.1`,
  `setup-node v7.1.0`, `upload-artifact v7.0.2`, `gitleaks-action v3.0.0`).

Para diagnosticar un fallo de CI: descarga los artefactos `test-results`
(traza/screenshot/vídeo) o `playwright-report` del run y ábrelos con
`npx playwright show-trace <traza>` / `npx playwright show-report <carpeta>`.

## Diagnóstico

- **Local**: `npx playwright show-report` abre el HTML de la última corrida;
  los artefactos de fallo quedan en `test-results/` (`retain-on-failure`:
  traza, screenshot y vídeo) junto a `error-context.md`.
- **JUnit**: `results/junit.xml` se genera solo cuando `CI=true` (GitHub
  Actions lo define automáticamente; ver [CI](#ci-github-actions)).
- **Errores silenciosos**: cada `BasePage` acumula errores de consola y
  `pageerror` — los specs terminan con `expectNoPageErrors()` para que un
  error de la DApp rompa el test y no pase callado.
- **Timeouts y saneamiento** (`forbidOnly`, retries) se controlan desde
  `src/config/env.ts` y `playwright.config.ts`.

## Fixture de wallet (Fase 3)

`web3Page` inyecta un provider `window.ethereum` compatible EIP-1193 con `addInitScript`
antes de que la DApp cargue. Cada test elige su escenario con presets deterministas:

```ts
import { expect, test } from '../../src/fixtures/web3Fixture';
import { rejectingTransaction } from '../../src/fixtures/walletScenarios';

test.describe('flujo de pago', () => {
  test.use({ walletState: rejectingTransaction() }); // 4010 del spec

  test('la DApp muestra el error de rechazo', async ({ web3Page }) => {
    await web3Page.openMockDApp(); // sandbox sin target real
    const error = await web3Page.requestCapturingError('eth_sendTransaction');
    expect(error?.code).toBe(4010);
  });
});
```

Presets disponibles: `connectedWallet`, `lockedWallet`, `approvingConnectWallet`,
`rejectingTransaction` (4010), `rejectingSignature` (4001), `insufficientFundsWallet`
(-32000), `wrongNetwork(red)`, `highLatencyWallet(ms)` y `unresponsiveWallet(métodos)`
(timeout de red). Control en caliente: `configureWallet`, `emitWalletEvent`, `state`.

## Page Objects y adapters (Fase 4)

Los tests hablan con `SwapPage` y `WalletModal`; estos no conocen selectores ni URLs, los toman de un `DexAdapter` (`src/domain/adapters/`). El adapter se elige con `DAPP_TARGET`:

- `sandbox` (por defecto): mini-DEX local servida con `page.route`, sin red ni servidores; es el target de CI.
- `uniswap`: adapter de referencia **sin verificar** contra la UI real; `selectToken` y `txStatus` lanzan un error explícito hasta validarlos (ver cabecera de `uniswap.adapter.ts`).

```ts
import { test } from '../../src/fixtures/dappFixture';
import { approvingConnectWallet } from '../../src/fixtures/walletScenarios';

test.use({ walletState: approvingConnectWallet() });

test('conecta y cotiza', async ({ swapPage }) => {
  await swapPage.open();
  await swapPage.wallet.open();
  await swapPage.wallet.connectWithInjectedWallet();
  await swapPage.enterAmount('1');
  await swapPage.expectQuote('3000.0000');
});
```

Para apuntar a otra DApp (staging o local) se implementa un nuevo `DexAdapter` y se añade a `resolveAdapter`; los tests no cambian. No se usa `waitForTimeout`: toda espera es estado del DOM o respuesta de red.

## API y red determinista (Fase 5)

Capa `src/api/` con clientes sin fricción y sin red real: la función `fetch` viene inyectada (`FetchLike`), así que `tests/api/` prueba el contrato con stubs deterministas y los casos contra servicios reales son contractuales opt-in (`CONTRACTUAL_API=1`, ver `.env.example`).

- `coingecko.api.ts`: feed de precios `/simple/price`. La llave viaja por la cabecera `x-cg-demo-api-key` (jamás en la query); valida el esquema estricto (ids pedidos presentes, `usd` y variación 24 h numéricos) y acepta las dos grafías del cambio (`usd_24h_change` de la API real y `usd24hChange` del feed de `mockData`, para validar la sandbox y el servicio real con el mismo código).
- `rpc.api.ts`: cliente JSON-RPC 2.0 tipado, independiente de viem. Comparte el guard de mainnet y la resolución de catálogo con `src/blockchain/rpc.client.ts` (reutiliza `assertNetworkAllowed` y `resolveRpcEndpoint`).
- `network/routes.ts`: interceptores precisos en el navegador con `page.route` — cada registro apunta a una URL EXACTA (`${origin}${path}`, nada de comodines tipo `**`) sobre el origen de la sandbox. Los overlays (`status`, `body`, `delayMs`, `abort`) se registran DESPUÉS del adapter (Playwright da prioridad al último handler) para producir errores HTTP/latencias/timeout sin tocar el resto de la DApp.
- Regla heredada de `docs/SECURITY.md`: los mensajes de error no repiten la URL ni el cuerpo del servidor (las llaves suelen ir en la ruta). Transporte común en `src/api/http-fetch.ts` (timeout por `AbortController`, clasificación timeout/red).

La documentación de uso por contrato son los propios specs: `tests/api/token-prices.spec.ts` y `tests/api/rpc-jsonrpc.spec.ts` (31 casos: respuestas válidas, esquemas incompletos, errores HTTP, timeouts y ausencia de eco de llaves en errores). El único caso que toca `api.coingecko.com` es contractual y requiere `CONTRACTUAL_API=1`.

## Estructura

```text
src/config/env.ts            # variables de entorno validadas + timeouts
src/config/networks.ts       # catálogo de cadenas (chain IDs, RPC, explorers)
src/fixtures/eip1193.ts      # contrato EIP-1193 tipado + script de inyección
src/fixtures/walletScenarios.ts  # presets deterministas de wallet
src/fixtures/web3Fixture.ts  # fixture `web3Page` (inyección + canal de control)
src/blockchain/rpc.client.ts # cliente viem (acciones en viem/actions)
src/blockchain/contracts.ts  # ERC-20: balanceOf, metadata, Transfer
src/blockchain/transaction.ts # validez de hashes + receipts resumidos
src/utils/mockData.ts        # address/tx/saldos/tokens/precios/errores deterministas
src/api/http-fetch.ts        # transporte JSON compartido (timeout + clasificación)
src/api/coingecko.api.ts     # cliente tipado del feed de precios (/simple/price)
src/api/rpc.api.ts           # cliente JSON-RPC 2.0 tipado (sin viem)
src/network/routes.ts        # interceptores exactos de red con page.route
src/domain/adapters/         # contrato DexAdapter + adapters sandbox y uniswap
src/domain/sandbox/          # mini-DEX local (HTML + selectores)
src/page-objects/            # base.page, wallet-modal.component, swap.page
src/fixtures/dappFixture.ts  # fixtures `adapter` y `swapPage`
tests/e2e/connect-wallet.spec.ts  # conexión de wallet: modal/dirección/chain ID (6 casos)
tests/e2e/swap-tokens.spec.ts     # swap: cotización/hash/4010/-32000/timeout (8 casos)
tests/web3/provider-injection.spec.ts # contrato del provider mockeado (10 casos)
tests/web3/transaction-state.spec.ts  # hash/receipt/balance/eventos (3 + 1 contractual)
tests/unit/env.spec.ts       # config y guards de seguridad (18 casos)
tests/unit/adapters.spec.ts  # contrato de adapters (5 casos)
tests/api/token-prices.spec.ts # contrato del cliente de precios (19 casos + 1 contractual)
tests/api/rpc-jsonrpc.spec.ts  # contrato del cliente JSON-RPC (11 casos)
```

## Determinismo

La suite principal **no toca dinero real ni redes volátiles**: se mockean precios (`page.route`), cotizaciones y respuestas RPC, y la wallet se inyecta programáticamente como provider EIP-1193. Las pruebas contra servicios reales serán contractuales u opcionales (`@web3` requiere `RPC_URL`).
