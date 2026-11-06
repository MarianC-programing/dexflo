# Seguridad — revisión de las fases 1-3 y controles vigentes

> Revisión: 2026-11-03 · Rama `fix/security-review-fase3`.
> Alcance: configuración, wallet simulada EIP-1193, capa blockchain (viem),
> tooling (Husky, `.gitignore`) y dependencias.
> Fase 7 (2026-11-05): hallazgos 4 y 5e implementados en
> `.github/workflows/playwright.yml` (ver «Fase 7 — CI/CD» abajo).

## Resumen de la revisión

| #   | Hallazgo                                                                       | Severidad | Estado                        |
| --- | ------------------------------------------------------------------------------ | --------- | ----------------------------- |
| 1   | `@web3` podía consultar mainnet real por defecto (`NETWORK=mainnet`, RPC viem) | Alto      | Corregido                     |
| 2   | `PRIVATE_KEY` se cargaba en claro y sin uso                                    | Medio     | Corregido (restringida)       |
| 3   | `RPC_URL` sin validar; errores repetían el valor de la URL                     | Medio     | Corregido                     |
| 4   | Trazas/vídeos de Playwright pueden contener la URL del RPC con su llave        | Medio     | Implementado (Fase 7)         |
| 5a  | Catálogo de RPC (`networks.ts`) y cliente divergían                            | Bajo      | Corregido                     |
| 5b  | `sameAddress` comparaba chain IDs (nombre engañoso)                            | Bajo      | Corregido (`sameHex`)         |
| 5c  | `.gitignore` sin `*.pem`, `*.key`, `*.keystore`, `.npmrc`                      | Bajo      | Corregido                     |
| 5d  | ESLint 8 obsoleto: 16 vulnerabilidades _moderate_ solo en devDependencies      | Bajo      | Pendiente (migrar a ESLint 9) |
| 5e  | Sin escaneo de secretos automatizado (gitleaks)                                | Bajo      | Implementado (Fase 7)         |

Verificado sin hallazgos: historial de Git (2 commits, sin `.env`, claves ni
mnemónicos), `npm audit --omit=dev` (0 vulnerabilidades), hooks de Husky (no
hacen push ni ejecutan nada inesperado) y el provider mockeado (no firma ni
envía transacciones reales: devuelve firma/hash constantes).

## Controles implementados

### Red segura por defecto (`src/config/env.ts`)

- `NETWORK` vale `sepolia` si no se define.
- `NETWORK=mainnet` lanza error salvo que se defina `ALLOW_MAINNET=true`.
- `src/blockchain/rpc.client.ts` aplica el mismo guard (`assertNetworkAllowed`),
  incluso si el test pasa `networkName` por opciones.
- Sin `RPC_URL`, el cliente usa el RPC público del catálogo
  (`src/config/networks.ts`), no el default implícito de viem.

### Secretos

- `PRIVATE_KEY` solo se acepta con `RPC_URL` local (`localhost`, `127.0.0.1`,
  `[::1]`) y formato de 32 bytes hex: pensada para fork/Anvil efímero.
- `env.privateKey` es una propiedad **no enumerable**: no aparece en
  `JSON.stringify(env)`, spreads ni `console.log(env)`.
- Hoy ninguna suite usa `PRIVATE_KEY`; déjala vacía salvo necesidad real.
- `BASE_URL` y `RPC_URL` rechazan credenciales embebidas (`user:pass@`) y los
  mensajes de error **no repiten** el valor recibido (la API key suele ir en la
  ruta de la URL).
- `.gitignore` excluye `.env*` (salvo `.env.example`), `*.pem`, `*.key`,
  `*.keystore`, `.npmrc` y todos los artefactos de Playwright.

### Pruebas

`tests/unit/env.spec.ts` (`npm run test:unit`, tag `@unit`, 18 casos) cubre:
red por defecto, bloqueo/opt-in de mainnet, URLs sin fugas, reglas de
`PRIVATE_KEY` y guard del cliente RPC.

## Fase 7 — CI/CD (implementado)

`.github/workflows/playwright.yml` (push/PR hacia `main`): jobs `quality`
(typecheck/lint/format), `tests` (toda la suite con chromium) y `gitleaks`
(escaneo del historial completo). Acciones fijadas por _SHA_ del commit del
tag y `npm ci`.

- Artefactos (`playwright-report`, `test-results`, `results/junit.xml`)
  publicados con `if: always()` incluso si fallan los tests; retención corta
  de 7 días.
- Sin secretos ni red real en CI: no se definen `ALLOW_MAINNET`, `RPC_URL` ni
  `PRIVATE_KEY` — los contractuales quedan en skip y los artefactos no pueden
  contener llaves. La red es `sepolia` por defecto.
- Regla si el flujo evoluciona: si un job `@web3` usara un RPC con llave (en
  _secrets_), _ese_ job no debe subir trazas ni vídeo (contendrían la URL
  completa). La llave jamás en el repositorio.
- gitleaks (hallazgo 5e): sin comentarios en PR ni artefacto SARIF; un
  hallazgo rompe el job con el output del CLI. El hook `pre-commit` de
  gitleaks sigue pendiente como opcional.

## Pendiente y recomendaciones

### Mantenimiento

- Migrar a ESLint 9 (flat config) para retirar la cadena `rimraf`/`flat-cache`
  marcada por `npm audit`. Es solo de desarrollo; no afecta a la ejecución.
- Revisar `npm audit` en cada PR.

### Mantenimiento

- Migrar a ESLint 9 (flat config) para retirar la cadena `rimraf`/`flat-cache`
  marcada por `npm audit`. Es solo de desarrollo; no afecta a la ejecución.
- Revisar `npm audit` en cada PR.

## Cómo reportar un problema

Abre un _issue_ privado (Security → Report a vulnerability) en el repositorio.
