# Technology Decisions

## Overview
We adopt a polyrepo-like monorepo using pnpm workspaces with three runnable apps (`apps/web`, `apps/orchestrator`, `apps/worker`) plus shared packages. Choices prioritize alignment with guideline.md compliance items (structured output, async jobs, Vercel + Render split) and operational simplicity for future agents.

## Frontend & Light API Surface
- **Framework**: Next.js 15 App Router, deployed on Vercel.
  - Tight integration with Vercel’s Edge/Serverless platform and Blob storage.
  - React 19 support, App Router data fetching primitives, built-in caching.
  - Pages served globally with minimal config; supports server actions for orchestrator endpoints if needed.
- **Styling/UI**: Tailwind CSS 4 + shadcn/ui (pending implementation) for rapid component development.
- **State/Data**: SWR/React Query for polling job statuses; server actions for secure mutation.

## Storage & Persistence
- **Database**: PostgreSQL (Render/Neon/Supabase) accessed via Prisma ORM.
  - JSONB fields align with `LectureSummary` and `QuizSet` schemas.
  - Prisma migrations provide reproducibility, type-safe client for both orchestrator and worker.
- **Blob Storage**: Vercel Blob.
  - Direct-to-blob uploads avoid Vercel 4.5MB request limit, support large PDFs/media, provide signed handles for workers.
  - Alternative (S3) retained as fallback but not default to reduce initial setup complexity.

## Background Processing
- **Primary Option**: Render Background Worker.
  - Always-on worker accommodates long-running STT, Gemini file downloads, FFmpeg processing.
  - Native cron for cleanup and retry friendly environment.
- **Queue Mechanism**: Start with durable job table + worker polling; evaluate Inngest or QStash for managed queue semantics once baseline is stable.
- **Deployment Model**: Worker image built from monorepo, same TypeScript codebase compiled to Node runtime.

## AI & STT Integrations
- **Gemini API**
  - Default model string `gemini-flash-latest`; every invocation precedes with Models API existence check.
  - Use File API for PDFs/transcripts >20MB, structured output enforced via `responseSchema`.
  - Store raw responses for auditing and reruns.
- **ElevenLabs Scribe v1**
  - Provides diarization, word timestamps, webhook callbacks.
  - Enabled via feature flag (`ENABLE_AUDIO_PIPELINE`); pipeline only runs when explicitly configured per lecture.
  - Requires FFmpeg preprocessing on worker.

## Tooling & Quality
- **Package Manager**: pnpm (workspace-efficient, lockfile support, deterministic builds).
- **TypeScript Config**: shared base tsconfig for strict typing across apps.
- **Lint/Format**: ESLint + Prettier + lint-staged to enforce style in CI/local.
- **Testing**: Vitest for unit/integration, Playwright for E2E covering upload→summary→quiz flow.

## Observability & Ops
- **Logging**: Structured logs to stdout (JSON) aggregated by Vercel/Render dashboards.
- **Job Monitoring**: Admin page (Next.js) to inspect job runs, raw payloads; dead-letter alerts via email/webhook (implementation pending).
- **Secrets Management**: Vercel environment variables for web/orchestrator, Render dashboard secrets for worker.

## Rejected Alternatives
- **Single Render deployment**: simplifies infra but loses Vercel’s CDN and first-class Next.js tooling.
- **Serverless-only background jobs**: Vercel alone cannot handle long-running STT/FFmpeg tasks due to execution limits.
- **Alternative STT providers (Whisper, Deepgram)**: ElevenLabs chosen per guideline emphasis on diarization and event tagging.

