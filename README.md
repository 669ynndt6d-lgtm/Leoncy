# Leoncy 3D Bot

This repository contains a Telegram bot and Express API server for generating 3D models with Meshy AI.

## Railway deployment

1. In Railway, connect this repository.
2. Set environment variables:
   - `DATABASE_URL`
   - `TELEGRAM_BOT_TOKEN`
   - `MESHY_API_KEY` (Meshy AI key for 3D generation)
   - `PORT` (optional, defaults to `3000`)
3. Railway should run the default `web: pnpm start` command from `Procfile`.

### Notes on image generation
- The bot uses a free Pollinations preview image service for text-to-3D prompts.
- Pollinations does not require an API key for preview images.
- For full 3D creation, set `MESHY_API_KEY` after signing up at https://meshy.ai.

## GitHub automatic deploy

A GitHub Actions workflow is included at `.github/workflows/railway-deploy.yml`.
It runs on push to `main` and deploys the app to Railway using the Railway CLI.

Add these repository secrets in GitHub Settings:
- `RAILWAY_API_KEY`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_ENVIRONMENT` (optional, e.g. `production`)

If `RAILWAY_ENVIRONMENT` is not set, the workflow deploys to `production` by default.

Then push to `main` to trigger automatic deployment.

## Manual Railway restart

A manual restart workflow is available at `.github/workflows/railway-restart.yml`.
Use Workflow Dispatch in GitHub Actions and the same secrets as deployment:
- `RAILWAY_API_KEY`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_ENVIRONMENT` (optional, defaults to `production`)

## Local development

Install dependencies:
```bash
pnpm install
```

Run development server:
```bash
pnpm run dev
```

Run production build and start:
```bash
pnpm install
pnpm start
```

## Notes

- The root `package.json` now includes `postinstall` to build `@workspace/api-server` after dependencies install.
- The `Procfile` and `railway.toml` are configured to start the app via `pnpm start`.
- Use `.env.example` as a template for local environment variables.
- Never store real `TELEGRAM_BOT_TOKEN` or `DATABASE_URL` values in source control.
