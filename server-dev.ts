import express from 'express';
import { globSync } from 'glob';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';

// Self-invoking async function to allow top-level await for imports
(async () => {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

        const app = express();
        app.use(cors());
        app.use(express.json());

        console.log('[API Server] Loading routes...');
        const apiFiles = globSync('**/*.ts', { cwd: __dirname });
        console.log('[API Server] Found files:', apiFiles);

        for (const file of apiFiles) {
            if (file.includes('server.ts')) continue;
            if (file.includes('db-pool.ts') || file.includes('time-utils.ts')) continue;
            if (file.includes('pusher.ts') || file.includes('room-store.ts')) continue;

            const routeName = path.basename(file, '.ts');
            const fullPath = path.join(__dirname, file);
            console.log(`[API Server] Loading route: ${routeName}`);

            try {
                // Convert the Windows file path to a valid file:// URL for ESM import
                const moduleUrl = pathToFileURL(fullPath).href;
                const { default: routeHandler } = await import(moduleUrl);

                if (typeof routeHandler === 'function') {
                    app.all(`/api/${routeName}`, routeHandler);
                    console.log(`[API Server] ✓ Loaded: /api/${routeName}`);
                } else {
                    console.warn(`[API Server] Could not load route ${routeName}: default export is not a function.`);
                }
            } catch (error) {
                console.error(`[API Server] Failed to load route ${file}:`, error);
            }
        }

        const port = 3001;
        app.listen(port, () => {
            console.log(`[API Server] Listening at http://localhost:${port}`);
        });

    } catch (e) {
        console.error('[API Server] A critical error occurred during server setup:', e);
        process.exit(1);
    }
})();
