const start = Date.now();

import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';

import submitScore from './api/submit-score.js';
import submitFeedback from './api/submit-feedback.js';
import broadcast from './api/broadcast.js';
import poll from './api/poll.js';
import pusherAuth from './api/pusher-auth.js';
import multiplayer from './api/multiplayer.js';
import tournament from './api/tournament.js';
import getLeaderboard from './api/get-leaderboard.js';
import getHallOfFame from './api/get-hall-of-fame.js';
import getExplanation from './api/get-explanation.js';
import checkScore from './api/check-score.js';
import archiveScores from './api/archive-scores.js';

// Keep the dev API process alive even if a handler throws or a promise rejects.
process.on('unhandledRejection', (reason) => {
    console.error('[API Server] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[API Server] Uncaught exception:', err);
});

// Lifecycle logging — helps diagnose mysterious exits/crashes.
process.on('exit', (code) => console.log('[API Server] process exit, code:', code));
process.on('beforeExit', (code) => console.log('[API Server] beforeExit, code:', code));
process.on('SIGINT', () => { console.log('[API Server] SIGINT received'); process.exit(0); });
process.on('SIGTERM', () => { console.log('[API Server] SIGTERM received'); process.exit(0); });

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;

const asyncRoute = (handler: Handler) =>
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(handler(req, res)).catch(next);
    };

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
});

const routes: Array<[string, Handler]> = [
    ['submit-score', submitScore as unknown as Handler],
    ['submit-feedback', submitFeedback as unknown as Handler],
    ['broadcast', broadcast as unknown as Handler],
    ['poll', poll as unknown as Handler],
    ['pusher-auth', pusherAuth as unknown as Handler],
    ['multiplayer', multiplayer as unknown as Handler],
    ['tournament', tournament as unknown as Handler],
    ['get-leaderboard', getLeaderboard as unknown as Handler],
    ['get-hall-of-fame', getHallOfFame as unknown as Handler],
    ['get-explanation', getExplanation as unknown as Handler],
    ['check-score', checkScore as unknown as Handler],
    ['archive-scores', archiveScores as unknown as Handler],
];

for (const [name, handler] of routes) {
    app.all(`/api/${name}`, asyncRoute(handler));
}

// Global error middleware — keeps the process alive on any thrown error.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[API Server] Error in ${req.method} ${req.path}:`, err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
});

const port = 3001;
app.listen(port, () => {
    console.log(`[API Server] Boot complete in ${Date.now() - start}ms — Listening at http://localhost:${port}`);
});
