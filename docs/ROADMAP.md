# Dexflo — roadmap (fases 8 a 11)

> Replanteo acordado el 2026-11-06, tras cerrar las fases 1-7 (`docs/plan.md`).
> Orden confirmado por la persona responsable. Un PR por fase, con el flujo
> habitual: plan → implementación local → pruebas → documentación → push + PR
> → autorización explícita antes del merge.

## Punto de partida (verificado el 2026-11-06)

- Fases 1-7 mergeadas (PR #1 a #4); CI de `main` en verde.
- `typecheck` y `lint` limpios; 80 tests en verde y 2 contractuales en skip
  (requieren `RPC_URL` y `CONTRACTUAL_API=1`).
- Sin empezar: módulo Haskell y dashboard front-end.

## Deuda detectada

1. Auditoría de seguridad run-1 (`~/security-audit-skill/dexflo/run-1`) a medias.
2. `main` sin protección de rama: los checks de CI no son obligatorios.
3. Adapter de Uniswap sin verificar contra la UI real.
4. ESLint 8 obsoleto (avisos `moderate` de `npm audit`, solo devDependencies).
5. `docs/SECURITY.md` con la sección "Mantenimiento" duplicada y ramas ya
   mergeadas sin borrar en remoto.

## Fases

### Fase 8 — Endurecimiento

Objetivo: base segura y estable antes de añadir módulos.

- Retomar la auditoría run-1: re-mapear el coverage ledger contra el código
  vivo (`env.ts`, `rpc.client.ts`, `eip1193.ts`, sandbox, page objects,
  `src/api/`, `src/network/`, suites de la Fase 6) y completar sus fases 3-6.
  Sin sandbox aislado, los hallazgos quedan como `needs_validation`.
- Proteger `main`: PR obligatoria y checks `quality`, `tests` y `gitleaks`
  requeridos (acción remota: requiere autorización explícita).
- Migrar a ESLint 9 (flat config) y dejar `npm audit` sin avisos.
- Limpiar `docs/SECURITY.md` y borrar ramas remotas mergeadas.

Hecho cuando: auditoría cerrada con hallazgos priorizados, `main` protegida,
`npm audit` limpio, CI en verde.

### Fase 9 — Verificación real

Objetivo: ser explícitos sobre qué está probado y qué no.

- Verificar el adapter de Uniswap contra la UI vigente (selectores, URL,
  `selectToken`, `txStatus`) o decidir que permanece solo como referencia y
  documentarlo así.
- Job programado (cron) en CI para los contractuales opcionales, sin secretos
  expuestos y sin bloquear los PR.

Hecho cuando: el estado del adapter de Uniswap está comprobado o declarado, y
los contractuales corren de forma periódica y aislada.

### Fase 10 — Módulo Haskell (`dexflo-report`)

Objetivo: reportes útiles a partir de los resultados de la suite.

- CLI independiente en `tools/haskell/` (cabal) que lee el JUnit
  (`junit-report`) y genera un JSON con: totales, resultados por tag
  (`@smoke`, `@e2e`, `@api`, `@web3`), tests lentos y comparación con la
  ejecución anterior.
- Tests propios y job de CI propio; la suite TypeScript lo invoca como paso
  opcional y no depende de él para pasar.
- Requisito previo: instalar la toolchain (`ghcup`: GHC + cabal); hoy no está
  en esta máquina.

Hecho cuando: el CLI compila, tiene tests, su job de CI está en verde y emite
un JSON con esquema documentado.

### Fase 11 — Dashboard

Objetivo: visualizar los resultados.

- Sitio estático en `web/` que muestra el JSON de `dexflo-report`, publicado
  en GitHub Pages (único despliegue real del proyecto).
- Diseño a partir de `docs/FrontEnd.md`, adaptado a un dashboard de
  resultados. Antes de diseñar se confirman marca, logo y audiencia.

Hecho cuando: el dashboard se despliega desde CI y refleja la última ejecución.

## Decisiones que se mantienen

- El núcleo permanece en TypeScript + Playwright + viem; Haskell es un módulo
  aislado que consume artefactos, no reescribe la suite.
- La suite principal sigue determinista: sin transacciones reales, sin
  `ALLOW_MAINNET`, sin secretos en CI.
- Ninguna acción remota (push sin PR, merge, protección de rama, cambios de
  despliegue) se ejecuta sin autorización explícita.
