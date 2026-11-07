# Plan Modular de Dexflo

> Plan original (fases 1-7, completadas). Las fases siguientes están en [`ROADMAP.md`](ROADMAP.md).

## Objetivo

Construir `web3-dex-automation-suite`, un framework TypeScript + Playwright para validar una DApp DEX de forma automatizada, determinista y preparada para CI/CD.

La primera integración usará la interfaz pública de Uniswap mediante un adapter configurable. La wallet tendrá dos capas: un provider EIP-1193 simulado para pruebas UI y una capa RPC/on-chain opcional para pruebas de integración.

## Fases de implementación

### 1. Base del proyecto

- Crear `package.json` con Node.js 20+, TypeScript, Playwright Test, ESLint, Prettier, Husky y `viem`.
- Añadir scripts para tests completos, smoke, UI, API, lint, formato y validación de tipos.
- Crear `tsconfig.json` con modo estricto.
- Crear `.gitignore`, `.env.example`, `.eslintrc.json` y `.prettierrc`.
- Configurar hooks pre-commit y pre-push.
- Crear `playwright.config.ts` con ejecución headless, retries solo en CI, trazas, screenshots, vídeo y reporters HTML/JUnit.

### 2. Configuración y datos deterministas

- Crear `src/config/env.ts` para validar variables de entorno, URL base, red, RPC y timeouts.
- Crear `src/config/networks.ts` para centralizar redes y chain IDs.
- Crear `src/utils/mockData.ts` con:
  - Dirección `0x71C7656EC7ab88b098defB751B7401B5f6d8976F`.
  - Chain ID y balances.
  - Tokens y precios.
  - Respuestas RPC deterministas.
  - Errores de rechazo `4010`, saldo insuficiente y timeout.
- Crear fixtures reutilizables para respuestas API y RPC.

### 3. Wallet y blockchain

- Implementar `src/fixtures/web3Fixture.ts` con un provider EIP-1193 tipado mediante `page.addInitScript`.
- Soportar `eth_accounts`, `eth_requestAccounts`, `eth_chainId`, `personal_sign` y `eth_sendTransaction`.
- Implementar listeners de eventos y estados configurables por test.
- Añadir escenarios de wallet para conexión correcta, rechazo `4010`, cuenta desconectada, red incorrecta y timeout.
- Crear `src/blockchain/rpc.client.ts` usando `viem`.
- Crear `src/blockchain/contracts.ts` y `src/blockchain/transaction.ts` para balances, receipts, hashes y eventos.
- Crear adapters por red y DApp en `src/blockchain/adapters/` o `src/domain/`.

### 4. Page Objects y componentes

- Crear `src/page-objects/base.page.ts` con navegación, esperas basadas en estado y diagnóstico.
- Crear `src/page-objects/wallet-modal.component.ts` para el modal de conexión, dirección y red.
- Crear `src/page-objects/swap.page.ts` para selección de tokens, importes, cotización, estado del botón, ejecución y errores.
- Crear un adapter de navegación para Uniswap que concentre URL, selectores y rutas de red.
- Evitar `page.waitForTimeout`; usar estados del DOM y respuestas de red.

### 5. API y red determinista

- Crear `src/api/coingecko.api.ts` como cliente tipado para precios.
- Crear un cliente RPC tipado en `src/api/rpc.api.ts` o equivalente.
- Crear `src/network/routes.ts` para interceptar precios, cotizaciones, tokens y errores.
- Mantener fixtures de red versionados y evitar interceptaciones demasiado amplias.
- Crear `tests/api/token-prices.spec.ts` para respuestas válidas, esquemas incompletos, errores HTTP y timeouts.
- Separar las pruebas contra servicios reales como pruebas contractuales opcionales.

### 6. Suite funcional

- Crear `tests/e2e/connect-wallet.spec.ts` para modal, conexión, dirección, chain ID y estados desconectados.
- Crear `tests/e2e/swap-tokens.spec.ts` para cotización, habilitación del botón, emisión del hash y estado final.
- Añadir pruebas para rechazo `4010`, saldo insuficiente y timeout de red.
- Crear `tests/web3/transaction-state.spec.ts` para hash, receipt, balances y eventos cuando exista RPC.
- Añadir tags como `@smoke`, `@e2e`, `@api`, `@web3` e `@integration`.
- Separar cada suite para permitir ejecuciones independientes.

### 7. CI/CD y documentación

- Crear `.github/workflows/playwright.yml` con Node 20, `npm ci`, navegadores, lint, typecheck, tests y artefactos.
- Publicar reportes HTML, JUnit, trazas y screenshots incluso cuando fallen los tests.
- Mantener fuera del repositorio las claves privadas y credenciales.
- Crear `README.md` con instalación, comandos, variables, arquitectura, mocks y diagnóstico.
- Documentar cómo adaptar otra DApp pública, staging o local.

## Estructura propuesta

```text
web3-dex-automation-suite/
├── .github/
│   └── workflows/
│       └── playwright.yml
├── src/
│   ├── api/
│   │   ├── coingecko.api.ts
│   │   └── rpc.api.ts
│   ├── blockchain/
│   │   ├── adapters/
│   │   ├── contracts.ts
│   │   ├── rpc.client.ts
│   │   └── transaction.ts
│   ├── config/
│   │   ├── env.ts
│   │   └── networks.ts
│   ├── fixtures/
│   │   └── web3Fixture.ts
│   ├── network/
│   │   └── routes.ts
│   ├── page-objects/
│   │   ├── base.page.ts
│   │   ├── swap.page.ts
│   │   └── wallet-modal.component.ts
│   └── utils/
│       └── mockData.ts
├── tests/
│   ├── api/
│   │   └── token-prices.spec.ts
│   ├── e2e/
│   │   ├── connect-wallet.spec.ts
│   │   └── swap-tokens.spec.ts
│   └── web3/
│       └── transaction-state.spec.ts
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── package.json
├── playwright.config.ts
├── README.md
└── tsconfig.json
```

## Verificación

1. Ejecutar `npm ci`.
2. Instalar los navegadores de Playwright.
3. Ejecutar `npm run typecheck`.
4. Ejecutar `npm run lint`.
5. Ejecutar `npm run format:check`.
6. Ejecutar `npx playwright test --grep @smoke`.
7. Ejecutar por separado las suites `@api`, `@e2e` y `@web3`.
8. Ejecutar `@web3` solo con RPC configurado.
9. Confirmar la publicación de reportes y artefactos en GitHub Actions.
10. Verificar que el smoke suite no requiere MetaMask instalada, fondos reales ni servicios externos no mockeados.

## Decisiones técnicas

- La suite principal será determinista y no enviará transacciones reales.
- Uniswap estará aislada detrás de adapters para evitar acoplar los tests a sus selectores.
- El pipeline principal mockeará feeds, cotizaciones y errores.
- Las pruebas contra servicios reales serán contractuales u opcionales.
- Se conservará el código de rechazo EIP-1193 `4010`.
- Se recomienda `viem` para la capa RPC por su tipado y modularidad.
- La validación on-chain debería usar preferiblemente una red fork local.
- No se versionarán claves privadas ni credenciales.
- La interfaz inicial podrá sustituirse por una DApp staging o local sin reescribir los tests de dominio.

## Consideraciones pendientes

- Confirmar si Uniswap pública será únicamente el adapter de referencia o también el target ejecutado en CI. Se recomienda usar un target staging o local controlado para CI.
- Definir si la integración RPC utilizará Anvil/Hardhat o una testnet. Se recomienda un fork local para reproducibilidad.
- Definir si los mensajes esperados estarán en inglés o se validarán mediante claves abstractas para soportar internacionalización.
