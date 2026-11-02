# web3-dex-automation-suite (Dexflo)

Framework de pruebas E2E y de API para DApps Web3/DEX: **TypeScript + Playwright Test**, con Page Object Model, mockeo determinista del provider EIP-1193 (`window.ethereum`) y capa RPC opcional con [viem](https://viem.sh).

El plan completo de fases y decisiones está en [`docs/plan.md`](docs/plan.md).

## Stack

- Node.js 20+ · TypeScript 5 (modo estricto)
- Playwright Test Runner (headless, retries solo en CI)
- ESLint + Prettier + Husky (hooks pre-commit / pre-push)
- viem para validaciones on-chain (Fase 3+)
- CI/CD: GitHub Actions (Fase 7)

## Estado del framework

| Fase | Alcance                                                                 | Estado    |
| ---- | ----------------------------------------------------------------------- | --------- |
| 1    | Base del proyecto, tooling de calidad, config de Playwright             | ✅        |
| 2    | Config de entorno y datos deterministas (`env`, `networks`, `mockData`) | ✅        |
| 3    | Wallet EIP-1193 simulada + capa blockchain (viem)                       | pendiente |
| 4    | Page Objects y componentes                                              | pendiente |
| 5    | API y red determinista (`routes.ts`, cliente CoinGecko)                 | pendiente |
| 6    | Suites funcionales (`@smoke`, `@e2e`, `@api`, `@web3`)                  | pendiente |
| 7    | CI/CD (GitHub Actions) y documentación completa                         | pendiente |

## Puesta en marcha

```bash
npm install          # instala dependencias y configura los hooks de husky
npx playwright install chromium
npm run typecheck    # valida tipos estrictos
npm run lint         # eslint (reglas type-checked + playwright)
npm run format:check # prettier
npm test             # requiere specs (Fases 5-6)
```

## Configuración

Copiar `.env.example` a `.env` (no se versiona; ver variables documentadas ahí).
La configuración se valida de forma tipada en `src/config/env.ts` y las redes en `src/config/networks.ts`.

## Estructura (Fases 1-2 en curso)

```text
src/config/env.ts        # variables de entorno validadas + timeouts
src/config/networks.ts   # catálogo de cadenas (chain IDs, RPC, explorers)
src/utils/mockData.ts    # address/tx/saldos/tokens/precios/errores deterministas
tests/{e2e,api,web3}/    # suites (se llenan en Fases 5-6)
```

## Determinismo

La suite principal **no toca dinero real ni redes volátiles**: se mockean precios (`page.route`), cotizaciones y respuestas RPC, y la wallet se inyecta programáticamente como provider EIP-1193. Las pruebas contra servicios reales serán contractuales u opcionales (`@web3` requiere `RPC_URL`).
