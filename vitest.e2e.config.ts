import path from 'path'
import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'vitest/config'

// Vitest does not load Next's .env.test.local automatically. Load it before
// test files are evaluated so real-Supabase e2e tests receive only their
// dedicated TEST_* credentials.
loadEnvConfig(process.cwd())

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'tests/e2e/**/*.{test,spec}.?(c|m)[jt]s?(x)',
      'src/tests/e2e/**/*.{test,spec}.?(c|m)[jt]s?(x)',
    ],
    passWithNoTests: false,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
