# Process Log

## Conventions
- [ ] TODO
- [x] Done
- [~] In progress

## Immediate Next Actions
- [ ] (Phase 4) Implement Gemini File API client (upload PDFs/video transcripts, enforce limits)
- [ ] (Phase 4) Build Summarizer job calling Gemini with structured output enforcement
- [ ] (Phase 4) Build Quiz Generator job converting summary into quiz (JSON schema)


## Phase 0 – Orientation & Planning
- [x] Review guideline.md and extract mandatory constraints (2025-03-xx, Codex)
- [x] Pull App Router references via Context7 (`/vercel/next.js`, topic: App Router background tasks)
- [x] Draft architecture overview aligning with sections 1–5 of guideline.md (deliverable: `docs/architecture.md`) (2025-10-01, Codex)
- [x] Confirm tech stack choices and record in `docs/decisions.md` (include rationale for Next.js 15 + Render Worker + Postgres) (2025-10-01, Codex)
- [x] Define feature-flag strategy for optional audio pipeline per guideline §0.1 (docs/feature-flags.md, 2025-10-01, Codex)

## Phase 1 – Repository & Tooling Setup
- [x] Initialize monorepo structure (`apps/web`, `apps/orchestrator`, `apps/worker`, `packages/shared`) (2025-10-01, Codex)
- [x] Configure package manager (pnpm preferred) and root scripts for lint/test/build (2025-10-01, Codex)
- [x] Set up base ESLint + Prettier + TypeScript config shared across workspaces (2025-10-01, Codex)
- [x] Add Husky or lint-staged hooks for formatting and type checks (2025-10-01, Codex)

## Phase 2 – Storage & Data Contracts
- [x] Model DB schema for lectures, uploads, summaries, quizzes, job runs using Prisma (§4, §6) (2025-10-01, Codex)
- [x] Create initial Prisma migration targeting Postgres + `.env.example` (2025-10-01, Codex)
- [x] Implement validation to enforce `Quiz` schema constraints (single correct answer, 20 questions) (packages/shared/src/validation/quiz.ts, 2025-10-01, Codex)
- [x] Design storage abstraction for Vercel Blob with upload URL issuance and metadata persistence (packages/shared/src/storage/blob.ts, 2025-10-01, Codex)

## Phase 3 – Ingestion & Processing Pipeline
- [x] Implement file upload endpoint (Next.js Route Handler) issuing Vercel Blob upload URLs (§1.A) (apps/orchestrator/app/api/lectures/route.ts, 2025-10-01, Codex)
- [x] Persist upload metadata and associate with lecture records (apps/orchestrator/app/api/lectures/[lectureId]/uploads/route.ts, 2025-10-01, Codex)
- [x] Add background job enqueue endpoint for Summarizer & Quiz Generator (apps/orchestrator/app/api/lectures/[lectureId]/summarize/route.ts & .../quiz/route.ts, 2025-10-01, Codex)
- [x] Implement Render Worker (or Inngest alternative) job consumer skeleton with retry/backoff policy (§3) (apps/worker/src/index.ts, 2025-10-01, Codex)
- [x] Integrate ElevenLabs STT via feature flag (audio/video optional path, §3.2) (apps/orchestrator/app/api/lectures/[lectureId]/transcribe/route.ts, 2025-10-01, Codex)
- [x] Store STT transcripts + diarization metadata in DB (apps/worker/src/index.ts, 2025-10-01, Codex)

## Phase 4 – Gemini Integrations
- [x] Implement Gemini File API client (upload PDFs/video transcripts, enforce 20MB/50MB limits, §2) (2025-10-02, Codex)
- [x] Build Summarizer job calling Gemini with `responseSchema` = `LectureSummary` (2025-10-02, Codex)
- [x] Build Quiz Generator job converting summary into quiz (`QuizSet` schema) with structured output enforcement (2025-10-02, Codex)
- [x] Add Models API check for `gemini-flash-latest`; abort workflow + log alert if model missing (§2 "모델 확인 절차") (2025-10-02, Codex)
- [x] Persist raw API responses and structured outputs for observability (2025-10-02, Codex)

## Phase 5 – Frontend (Next.js 15 App Router)
- [x] Create upload dashboard with drag-and-drop for PDF/video, reflecting Vercel Blob status (2025-10-02, Codex)
- [x] Display job status via polling/SWR; include re-run controls for failed jobs (2025-10-02, Codex)
- [x] Render structured lecture summary (meta, highlights, memorization, concepts) (2025-10-02, Codex)
- [x] Implement quiz runner UI with single-answer enforcement and scoring UX (§5) (2025-10-02, Codex)
- [x] Provide admin diagnostics page showing job logs & raw payloads (2025-10-02, Codex)

## Phase 6 – Deployment & Operations
- [ ] Configure Vercel project for `apps/web` with environment secrets & Blob storage binding
- [ ] Provision Render Background Worker deployment + cron for cleanup tasks
- [ ] Set up monitoring/logging (Vercel Observability, Render logs, error alerts)
- [ ] Document deployment runbooks in `docs/runbook.md`

## Phase 7 – QA & Compliance
- [ ] Implement end-to-end tests covering upload → summary → quiz pipeline (Playwright)
- [ ] Add unit/integration tests for Gemini schema validation & quiz scoring
- [ ] Document security considerations (PII handling, HIPAA note for ElevenLabs) in `docs/security.md`
- [ ] Prepare launch checklist verifying guideline §15 items

## Hand-off Notes
- Maintain this checklist; log owner + date on completion lines
- Update `docs/` deliverables as they are created to keep knowledge statefully recorded
- Pending decision: choose between Render Worker vs Inngest + Next.js for job execution (research before Phase 3)
- Next agent should start with Phase 0 remaining items (architecture + tech decisions) before writing code
