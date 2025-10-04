# Architecture Review — 2025-10-04

## Monorepo Layout

- **apps/orchestrator**: Next.js App Router service that exposes lecture/job APIs and orchestrates Prisma writes.
- **apps/worker**: Node worker polling `JobRun` rows and invoking Gemini + Blob APIs.
- **apps/web**: User-facing Next.js front-end for uploads, monitoring, and quiz review.
- **packages/db**: Prisma schema + client wrapper.
- **packages/shared**: Shared config, Gemini helpers, zod schemas, blob utilities.

## Current Pain Points

- **API logic lives inside route handlers**: duplication across summarize/quiz/transcribe endpoints, minimal validation & no error normalization.
- **Environment handling is ad-hoc**: orchestrator and worker read `process.env` without central validation, making deploy drift risky.
- **Worker loop is monolithic**: single file mixes polling, job execution, Gemini orchestration, and error handling; no structured logging or concurrency guardrails.
- **No automated tests**: key flows (`createUploadTarget`, lecture serialization, job claiming) rely on manual verification only.
- **Front-end UX debt**: inline styles everywhere, repeated layout patterns, limited feedback states, and no component system for buttons/cards/tables.
- **Docs drift**: AGENTS.md carries deployment notes, but there is no canonical architecture snapshot for future agents.

## Refactor Targets (이번 세션 실행)

1. Extract orchestrator business logic into reusable service modules with consistent error handling and env validation.
2. Restructure worker into modular job processors with improved logging/concurrency controls.
3. Add focused unit tests for shared helpers and orchestrator services to protect core flows.
4. Rebuild the web front-end around reusable UI components (Tailwind or tokens-based) for a cohesive UX.
5. Update docs (including AGENTS.md) with the new architecture + operational guidance.
