import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import express from 'express';
import { globSync } from 'glob';
import { pathToFileURL } from 'url';

// A simple middleware to handle API requests
const apiMiddleware = () => {
  const app = express();
  app.use(express.json());

  // Dynamically load API routes
  const apiFiles = globSync('./api/**/*.ts');
  apiFiles.forEach(async (file) => {
    const routePath = '/api/' + path.basename(file, '.ts');
    try {
      const modulePath = pathToFileURL(path.resolve(file)).href;
      const { default: route } = await import(modulePath);
      app.all(routePath, route);
    } catch (error) {
      console.error(`Failed to load route ${file}:`, error);
    }
  });

  return app;
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
          proxy: {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
