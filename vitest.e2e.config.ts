import path from 'path'
import { defineConfig } from 'vitest/config'

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
