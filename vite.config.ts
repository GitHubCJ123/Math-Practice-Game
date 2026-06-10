import path from 'path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    loadEnv(mode, process.cwd(), 'VITE_');
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        }
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@shared': path.resolve(__dirname, './shared'),
        }
      },
      test: {
        // Node by default (pure logic tests). Hook/component tests opt into jsdom
        // per-file via a `// @vitest-environment jsdom` docblock.
        environment: 'node',
        globals: false,
        setupFiles: ['./src/__tests__/setup.ts'],
        include: [
          'src/**/*.test.{ts,tsx}',
          'shared/**/*.test.ts',
          'lib/**/*.test.ts',
        ],
        coverage: {
          provider: 'v8',
          reporter: ['text', 'html'],
          include: ['shared/**', 'lib/api/**', 'src/lib/**', 'src/hooks/**'],
          exclude: ['**/*.test.{ts,tsx}', 'src/__tests__/**'],
          // Regression floor (a few points below the current baseline), NOT a
          // quality target. It stops coverage from sliding backwards without
          // blocking on the intentionally-untested files (HTTP handlers that
          // need Supabase/Pusher/Azure mocks, audio/analytics, etc.).
          thresholds: {
            statements: 50,
            branches: 45,
            functions: 40,
            lines: 50,
          },
        },
      },
    };
});
