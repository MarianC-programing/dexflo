# Dexflo — contexto del proyecto y estado de la sesión

> Última actualización: 2026-11-06 · Leer antes de continuar (regla 1 del `CLAUDE.md` general).

## Qué es

`web3-dex-automation-suite` (Dexflo): framework TypeScript + Playwright para
validar DApps DEX de forma determinista. Plan de fases: `docs/plan.md`.
Seguridad: `docs/SECURITY.md`.

## Estado por fase

| Fase | Alcance                                                | Estado                                   |
| ---- | ------------------------------------------------------ | ---------------------------------------- |
| 1-2  | Base, tooling, `env`, `networks`, `mockData`           | Hecho                                    |
| 3    | Provider EIP-1193 simulado + capa blockchain (viem)    | Hecho                                    |
| —    | Revisión de seguridad de fases 1-3 (`SECURITY.md`)     | Hecho (rama `fix/security-review-fase3`) |
| 4    | Page Objects, adapters y sandbox DEX y componentes     | Hecho (`c05d8e2`)                        |
| 5    | API y red determinista                                 | Hecho                                    |
| 6    | Suites funcionales                                     | Hecho                                    |
| 7    | CI/CD y documentación completa                         | Hecho (PR #4)                            |
| 8    | Endurecimiento (auditoría, `main` protegida, ESLint 9) | Siguiente                                |
| 9    | Verificación real (Uniswap, contractuales programados) | Pendiente                                |
| 10   | Módulo Haskell `dexflo-report`                         | Pendiente                                |
| 11   | Dashboard estático (GitHub Pages)                      | Pendiente                                |

Roadmap de las fases 8-11: `docs/ROADMAP.md`.

## Decisiones de seguridad vigentes

- Red por defecto `sepolia`; `mainnet` solo con `ALLOW_MAINNET=true`.
- `PRIVATE_KEY` solo con RPC local; no enumerable; sin uso actual.
- Errores de configuración nunca repiten valores de URLs.

## Comandos

```bash
npm run typecheck && npm run lint && npm run format:check
npm run test:unit     # 23 casos @unit (config, guards y adapters)
npm run test:web3     # 13 casos del provider + 1 contractual opt-in (RPC_URL)
npm run test:api      # 30 casos @api + 1 contractual opt-in (CONTRACTUAL_API=1)
npm run test:e2e      # 6 conexión + 8 swap contra la sandbox local
npm test              # suite completa (playwright test)
```

Última verificación: typecheck, lint, format y toda la suite (82 tests):
80 en verde, 2 contractuales en skip.

## CI (Fase 7)

`.github/workflows/playwright.yml` (push/PR → `main`): job `quality`
(typecheck/lint/format), job `tests` (`npm ci` → chromium → `npm test`) y
job `gitleaks` (historial completo). Acciones pinned por SHA del tag;
artefactos `playwright-report`, `test-results` y `junit-report` con
`if: always()` y retención de 7 días. Sin secretos: sin `ALLOW_MAINNET`,
`RPC_URL` ni `PRIVATE_KEY` → contractuales en skip.

## Siguiente paso

Fase 8 (ver `docs/ROADMAP.md`), y su primer punto es cerrar la auditoría de
seguridad run-1 (`~/security-audit-skill/dexflo/run-1`). Estado real del run:
ledger re-mapeado al ref vivo (`5c38156`) con la evidencia previa archivada en
los intentos de cada unidad — 34 unidades y validador de la skill en verde —
y crítico post-ola 4 aplicado (1 unidad nueva de docs, 1 pista resuelta por
fuente, exclusiones refrescadas por el nuevo carril CI/PR). Pendiente del
run: ola 5 de hunters sobre las 30 unidades `planned`, crítico post-ola 5 y
crítico final-clean, y las fases 3-6 de la skill (validación de candidatos,
`findings.json`, verificación independiente y reportes). Después: proteger
`main` (requiere autorización explícita), migrar a ESLint 9 y limpiar ramas
locales.
