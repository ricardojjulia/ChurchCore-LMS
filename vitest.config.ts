import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],

    // Exits cleanly when no unit tests exist yet — CI safe from day one.
    passWithNoTests: true,

    // Unit tests only — e2e specs require real Supabase + app infra.
    // Run e2e specs separately with: npm run test:e2e
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/e2e/**',
      'src/tests/e2e/**',
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/lib/**',
        'src/hooks/**',
        'src/utils/**',
        // Measure all action files; per-file thresholds enforced only on tested ones below
        'src/app/actions/**',
      ],
      exclude: [
        '**/node_modules/**',
        'src/tests/**',
        // Supabase client wrappers — integration tested against real project
        'src/utils/supabase/**',
        // Editor extension — not unit-testable in isolation
        'src/utils/tiptap.ts',
        // shadcn/ui utilities and hooks — not custom business logic
        'src/lib/utils.ts',
        'src/hooks/use-toast.ts',
        // Pre-existing hooks not in R2 scope (separate tickets)
        'src/hooks/useBeforeUnload.ts',
        'src/hooks/useContentAutoSave.ts',
        // Dashboard context — complex stateful context; R3+ scope
        'src/lib/dashboard/context.ts',
        '**/__mocks__/**',
        '**/*.config.*',
        '**/types/**',
      ],
      thresholds: {
        // Per-directory minimums enforced in CI.
        // Set after first measurement at (measured - 5); initial values from R2 baseline.
        'src/lib/**':                          { lines: 80 },
        'src/hooks/**':                        { lines: 70 },
        'src/utils/**':                        { lines: 80 },
        // Thresholds applied only to the three tested action files (COUNCIL-2025-009 G1).
        // Raise and broaden as coverage expands.
        'src/app/actions/cohorts.ts':          { lines: 40 },
        'src/app/actions/messages.ts':         { lines: 35 },
        'src/app/actions/learning.ts':         { lines: 28 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
