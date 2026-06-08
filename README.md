<div align="center">

# 🧮 Math Practice Game

### *A fast, friendly, and ferociously fun way for kids to master mental math.*

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Pusher](https://img.shields.io/badge/Realtime-Pusher-300D4F?logo=pusher&logoColor=white)](https://pusher.com)

*Solo drills • Live multiplayer • AI opponents • Global leaderboards*

</div>

---

## ✨ What is it?

**Math Practice Game** is an interactive study tool built for kids (and the kid in all of us) to drill the fundamentals — multiplication tables, division, squares, square roots, and fraction ↔ decimal ↔ percent conversions — in short, gamified sprints. Pick your topic, choose your timer, and race the clock. Then bring a friend (or four), spin up an instant room, and battle live.

> Built with React 19, deployed on Vercel, powered by Supabase and Pusher.

---

## 🎮 Features

### 🧠 Nine Practice Modes
Pick what you want to drill — the engine handles the rest.

| Category | Modes |
|---|---|
| **Arithmetic** | Multiplication · Division · Squares · Square Roots · Negative Numbers |
| **Conversions** | Fraction → Decimal · Decimal → Fraction · Fraction → Percent · Percent → Fraction |

### ⚡ Solo Quiz
- Custom question counts (5–50)
- Optional time limit per quiz
- Per-table number selection (e.g. just the 7s and 8s)
- Instant feedback with **AI-generated explanations** for wrong answers
- Local stats tracking — frequency, accuracy, total time

### 🌐 Multiplayer (1v1 → 4-player)
- **Quick Match** — instant matchmaking
- **Private rooms** with shareable 8-character codes
- **Free-for-all** or **team mode** (2v2)
- **AI opponents** with four difficulty tiers — `easy` · `medium` · `hard` · `expert`
- Live opponent progress, finish times, and rematches
- Synchronized question sets so everyone races the same quiz

### 🏆 Leaderboards & Hall of Fame
- Daily, monthly, and all-time leaderboards (Supabase-backed)
- Monthly archive cron snapshots top performers into the **Hall of Fame**
- Per-operation rankings

### 🎨 Polish
- Light / dark theme with system + URL override
- Tailwind animations (pop-in, word-pulse, fade-in)
- Vercel Analytics + Speed Insights baked in
- Beta feedback button on every screen

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  React 19 SPA  (Vite + Tailwind via CDN + React Router 7)    │
│  ├─ Selection → Quiz → Results                               │
│  └─ Multiplayer Lobby → Quiz → Results                       │
└────────────────┬────────────────────────────┬────────────────┘
                 │ REST                       │ WebSocket
                 ▼                            ▼
       ┌──────────────────┐         ┌──────────────────┐
       │  Vercel Functions │         │      Pusher      │
       │  (api/*.ts)       │         │  Channels (auth) │
       └────────┬──────────┘         └────────┬─────────┘
                │                             │
                ▼                             ▼
       ┌──────────────────┐         ┌──────────────────┐
       │  Supabase / PG   │         │  In-memory Rooms │
       │  scores · feedback│        │  (room-store.ts) │
       │  hall_of_fame    │         │  AI player loop  │
       └──────────────────┘         └──────────────────┘
                │
                ▼
       ┌──────────────────┐
       │  Azure OpenAI    │  ← per-question explanations
       │  + Google GenAI  │
       └──────────────────┘
```

### 🗂️ Project Layout

```
.
├─ index.html              # Tailwind CDN, fonts, animations, importmap
├─ src/
│  ├─ App.tsx              # Router + global state (solo & multiplayer)
│  ├─ components/
│  │  ├─ screens/          # SelectionScreen, QuizScreen, ResultsScreen
│  │  │                     # MultiplayerLobby/Quiz/ResultsScreen
│  │  └─ ui/               # Leaderboard, FeedbackButton, icons…
│  ├─ lib/
│  │  ├─ conversions.ts    # Fraction/decimal/percent dictionary
│  │  ├─ multiplayer.ts    # Pusher client + room helpers
│  │  ├─ feedbackMessages.ts
│  │  └─ ga.ts             # Google Analytics page tracking
│  └─ __tests__/           # Vitest — timer fairness
├─ api/                    # Vercel serverless functions
│  ├─ submit-score.ts, check-score.ts, get-leaderboard.ts
│  ├─ get-hall-of-fame.ts, get-hall-of-fame-dates.ts
│  ├─ archive-scores.ts    # monthly cron → Hall of Fame
│  ├─ get-explanation.ts   # Azure / Gemini explanations
│  ├─ submit-feedback.ts
│  ├─ multiplayer.ts       # room create/join/start/answer/finish
│  └─ pusher-auth.ts       # private channel auth
├─ lib/api/                # Shared server modules
│  ├─ db-pool.ts           # Supabase client
│  ├─ pusher.ts            # Pusher server SDK
│  ├─ room-store.ts        # In-memory room state machine
│  ├─ ai-player.ts         # AI opponent simulation
│  └─ time-utils.ts        # Luxon helpers (PT timezone)
├─ migrations/             # Supabase SQL (schema, indexes, archives)
├─ types.ts                # Shared TS types (single source of truth)
├─ server-dev.ts           # tsx-watched Express dev server
├─ server.cjs              # Node prod server (mirrors Vercel routes)
└─ vercel.json             # Functions config + monthly cron
```

### 📐 Key Types

All game shapes live in [types.ts](types.ts) — `Operation`, `Question`, `Room`, `Player`, `Team`, `MultiplayerResult`, `RoomEvent`, etc. The client and the API import from the same file, so the contract never drifts.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier is fine)
- A [Pusher Channels](https://pusher.com/channels) app (free tier is fine)
- *(Optional)* Azure OpenAI **or** Google Gemini API key for AI explanations

### 1. Install

```powershell
git clone https://github.com/<you>/Math-Practice-Game.git
cd Math-Practice-Game
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
# Supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# Pusher (backend)
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=us2

# Pusher (frontend — Vite)
VITE_PUSHER_KEY=...
VITE_PUSHER_CLUSTER=us2

# Azure OpenAI (for explanations)
VITE_AZURE_API_KEY=...
VITE_AZURE_ENDPOINT=https://<resource>.openai.azure.com
VITE_AZURE_DEPLOYMENT_NAME=...

# Local API base
BASE_URL=http://localhost:3001
```

### 3. Set up the database

Run the SQL in [migrations/supabase-schema.sql](migrations/supabase-schema.sql) against your Supabase project, then apply [migrations/add-indexes.sql](migrations/add-indexes.sql).

### 4. Run it

```powershell
# Vite dev server + Express API together
npm start

# …or individually
npm run dev         # client only — http://localhost:5173
npm run dev:api     # API only   — http://localhost:3001
```

### 5. Build for production

```powershell
npm run build       # tsc + vite build → dist/
npm run preview     # serve the built bundle
```

---

## 🧪 Scripts

| Script | What it does |
|---|---|
| `npm start` | Dev client + dev API in parallel |
| `npm run dev` | Vite dev server only |
| `npm run dev:api` | Watched Express API (`server-dev.ts`) |
| `npm run dev:test` | Vite in test mode (`VITE_NODE_ENV=test`) |
| `npm run build` | Type-check + production bundle |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint, zero-warning mode |
| `npm run server` | Run the CJS production server |

---

## ☁️ Deployment

The app is wired for **Vercel** out of the box. [vercel.json](vercel.json) declares:

- **Serverless functions** under `api/**/*.ts` (1 GB memory) with shared `lib/api/**` + `types.ts`.
- **SPA rewrite** — every non-`/api`, non-`/assets` path falls through to `index.html`.
- **Monthly cron** — `0 5 1 * *` hits `/api/archive-scores` to snapshot the Hall of Fame.

Push to GitHub, import into Vercel, set the env vars above, and you're live.

---

## 🤝 Contributing

PRs welcome! Keep these in mind:
- TypeScript strict mode is enabled — share cross-runtime types via [shared/types.ts](shared/types.ts).
- Lint must pass (`npm run lint`); existing warnings are being reduced incrementally.
- Tailwind utility classes only — no separate CSS files.
- Don't touch [vercel.json](vercel.json) cron without bumping the archive SQL.

---

## 📜 License

Private / educational project. Add a license file if you plan to open-source it.

---

<div align="center">

**Made with ❤️ for kids who'd rather race a robot than do a worksheet.**

</div>
