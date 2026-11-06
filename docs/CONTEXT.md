# Dexflo — contexto del proyecto y estado de la sesión

> Última actualización: 2026-11-05 · Leer antes de continuar (regla 1 del `CLAUDE.md` general).

## Qué es

`web3-dex-automation-suite` (Dexflo): framework TypeScript + Playwright para
validar DApps DEX de forma determinista. Plan de fases: `docs/plan.md`.
Seguridad: `docs/SECURITY.md`.

## Estado por fase

| Fase | Alcance                                             | Estado                                   |
| ---- | --------------------------------------------------- | ---------------------------------------- |
| 1-2  | Base, tooling, `env`, `networks`, `mockData`        | Hecho                                    |
| 3    | Provider EIP-1193 simulado + capa blockchain (viem) | Hecho                                    |
| —    | Revisión de seguridad de fases 1-3 (`SECURITY.md`)  | Hecho (rama `fix/security-review-fase3`) |
| 4    | Page Objects, adapters y sandbox DEX local          | Hecho (`c05d8e2`)                        |
| 5    | API y red determinista                              | Hecho                                    |
| 6    | Suites funcionales                                  | Pendiente                                |
| 7    | CI/CD y documentación completa                      | Pendiente                                |

## Decisiones de seguridad vigentes

- Red por defecto `sepolia`; `mainnet` solo con `ALLOW_MAINNET=true`.
- `PRIVATE_KEY` solo con RPC local; no enumerable; sin uso actual.
- Errores de configuración nunca repiten valores de URLs.

## Comandos

```bash
npm run typecheck && npm run lint && npm run format:check
npm run test:unit     # 23 casos @unit (config, guards y adapters)
npm run test:web3     # 10 casos del provider mockeado
npm run test:api      # 30 casos @api + 1 contractual opt-in (CONTRACTUAL_API=1)
npm run test:e2e      # 10 casos @e2e contra la sandbox local
```

Última verificación: typecheck, lint, format y toda la suite (74 tests):
73 en verde, 1 contractual en skip.

## Siguiente paso

Fase 6: suites funcionales — `connect-wallet.spec.ts` y `swap-tokens.spec.ts`
(@e2e/@smoke, rechazo 4010, saldo insuficiente, timeout), `transaction-state.spec.ts`
(@web3 solo con RPC) y reorganización de tags/execution independiente (ver
`docs/plan.md`). Antes de la fase 7, resolver lo pendiente de
`docs/SECURITY.md` (artefactos de CI y gitleaks).
