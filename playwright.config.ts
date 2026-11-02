/**
 * Configuración de Playwright Test para web3-dex-automation-suite.
 *
 * Principios:
 * - Ejecución headless por defecto (el flag CLI `--headed` lo anula en local).
 * - Retries SOLO en CI: en el entorno local un fallo es un fallo real.
 * - Artefactos de diagnóstico: trace, screenshot y vídeo retain-on-failure.
 * - Reportes: list en consola + HTML; JUnit solo en CI (útil para el pipeline).
 */
import { defineConfig, devices, type ReporterDescription } from '@playwright/test';

import { env } from './src/config/env';

const ciReporters: ReporterDescription[] = [
  ['list'],
  ['html', { open: 'never' }],
  ['junit', { outputFile: 'results/junit.xml' }],
];

const localReporters: ReporterDescription[] = [['list'], ['html', { open: 'never' }]];

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results',
  fullyParallel: true,

  // Saneamiento de CI: prohibir .only(), reintentos solo en flujo continuo.
  forbidOnly: env.isCi,
  retries: env.isCi ? 2 : 0,
  workers: env.isCi ? 2 : undefined,

  timeout: env.timeouts.testMs,
  expect: {
    timeout: env.timeouts.expectMs,
  },

  reporter: env.isCi ? ciReporters : localReporters,

  use: {
    // Determinismo: idioma y zona horaria fijos, no depende de la máquina.
    headless: env.headless,
    baseURL: env.baseUrl,
    locale: 'en-US',
    timezoneId: 'UTC',

    navigationTimeout: env.timeouts.navigationMs,
    actionTimeout: env.timeouts.actionMs,

    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Chromium es el proyecto principal. Firefox/WebKit se añadirán cuando la
    // suite (fixtures EIP-1193 y adapters) esté estabilizada en fases 4-6.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
