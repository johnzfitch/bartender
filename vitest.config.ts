import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['services/**/*.ts', 'widgets/**/*.tsx'],
      exclude: [
        'tests/**',
        '**/*.test.ts',
        '**/node_modules/**',
      ],
    },
  },
})
