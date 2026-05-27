# Leoncy 3D Bot

Telegram bot for generating professional 3D models from text descriptions or photos, powered by the Meshy AI API. Users get GLB/OBJ files they can download directly in Telegram.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Telegram bot (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `MESHY_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Bot: grammY (Telegram Bot API)
- DB: PostgreSQL + Drizzle ORM
- 3D Generation: Meshy AI API (text-to-3D, image-to-3D)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/api-server/src/bot/` — all Telegram bot code
  - `index.ts` — bot setup, session, handler registration
  - `meshy.ts` — Meshy AI API client (text-to-3D, image-to-3D, polling)
  - `processor.ts` — async generation pipeline with real-time progress updates
  - `handlers/start.ts` — /start command, user upsert
  - `handlers/menu.ts` — inline menu navigation, quality settings, history, profile
  - `handlers/generation.ts` — text/photo input, quality selection, cancel, download
  - `keyboards.ts` — all InlineKeyboard definitions
  - `messages.ts` — message templates, progress bars, quality labels
  - `storage.ts` — local file download/management
  - `db.ts` — lazy DB connection for bot
- `lib/db/src/schema/users.ts` — users table
- `lib/db/src/schema/generations.ts` — generations table

## Architecture decisions

- Bot runs as long-polling inside the same Express process — simple single-process deployment, no webhook needed
- Meshy text-to-3D uses two-stage pipeline: preview task → refine task (required by Meshy API)
- grammY session middleware keeps per-user state in memory (step, quality, pending prompt)
- File downloads stored locally in `uploads/` directory for re-download without re-generating
- `grammy` externalized from esbuild bundle due to platform.node native module loading

## Product

- `/start` — welcome message + main menu
- **✨ Создать 3D-модель** — text prompt → quality selection → async generation → download GLB/OBJ
- **🖼 Создать из фото** — upload photo → async generation → download GLB/OBJ
- **📂 История моделей** — last 10 generations with status + re-download
- **⚙ Настройки качества** — set default quality (fast/standard/high/ultra)
- **👤 Профиль** — usage stats and generation limits

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/db run push` after schema changes
- `grammy` must stay in the `external` list in `build.mjs` — it loads native modules dynamically
- Meshy text-to-3D is a 2-stage process: preview task ID must be passed to refine task
- DB connection is lazy (initialized on first request) to avoid startup failures if DB is slow

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
