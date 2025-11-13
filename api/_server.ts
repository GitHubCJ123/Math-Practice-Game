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
        app.use(express.urlencoded({ extended: true })); // For Pusher auth form data

        console.log('[API Server] Loading routes...');
        const apiFiles = globSync('**/*.ts', { cwd: __dirname });
        console.log('[API Server] Found files:', apiFiles);

        for (const file of apiFiles) {
            if (file.includes('server.ts')) continue;
            if (file.includes('db-pool.ts') || file.includes('time-utils.ts') || file.includes('pusher-utils.ts') || file.includes('question-generator.ts') || file.includes('daily-id-reset.ts')) continue;
            if (file.includes('[gameId]')) continue; // Skip dynamic route directories
            
            // Exclude old endpoint files that have been consolidated
            if (file === 'submit-score.ts' || file === 'check-score.ts' || file === 'get-leaderboard.ts' || file === 'get-hall-of-fame.ts' || file === 'get-hall-of-fame-dates.ts') continue;
            if (file.includes('games/') && (
                file === 'games/create.ts' || file === 'games/join.ts' || file === 'games/random.ts' || 
                file === 'games/status.ts' || file === 'games/get-game-info.ts' || file === 'games/players.ts' || 
                file === 'games/start.ts' || file === 'games/submit.ts' || file === 'games/play-again.ts' || 
                file === 'games/play-again-status.ts' || file === 'games/cancel-matchmaking.ts' || 
                file === 'games/check-matchmaking-status.ts' || file === 'games/rematch-request.ts' || 
                file === 'games/rematch-accept.ts' || file === 'games/rematch-decline.ts' || 
                file === 'games/rematch-status.ts' || file === 'games/cleanup.ts' || 
                file === 'games/cleanup-abandoned.ts'
            )) continue;

            // Handle nested routes: preserve directory structure
            // Convert Windows backslashes to forward slashes for URLs
            const routeName = file.replace(/\.ts$/, '').replace(/\\/g, '/');
            const fullPath = path.join(__dirname, file);

            try {
                // Convert the Windows file path to a valid file:// URL for ESM import
                const moduleUrl = pathToFileURL(fullPath).href;
                const { default: routeHandler } = await import(moduleUrl);

                if (typeof routeHandler === 'function') {
                    // For nested routes like 'games/create', create '/api/games/create'
                    // For top-level routes like 'submit-score', create '/api/submit-score'
                    const routePath = `/api/${routeName}`;
                    app.all(routePath, routeHandler);
                    console.log(`[API Server] Loaded route: ${routePath}`);
                } else {
                    console.warn(`[API Server] Could not load route ${routeName}: default export is not a function.`);
                }
            } catch (error) {
                console.error(`[API Server] Failed to load route ${file}:`, error);
            }
        }

        // Add a catch-all for debugging unmatched routes
        app.use('/api', (req, res) => {
            console.log(`[API Server] Unmatched route: ${req.method} ${req.path}`);
            res.status(404).json({ message: 'Route not found', path: req.path });
        });

        const port = 3001;
        app.listen(port, () => {
            console.log(`[API Server] Listening at http://localhost:${port}`);
        });

    } catch (e) {
        console.error('[API Server] A critical error occurred during server setup:', e);
        process.exit(1);
    }
})();
