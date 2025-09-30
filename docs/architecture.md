# Architecture Overview

## Purpose
- Automate generation and delivery of structured lecture summaries and 4-choice quiz sets from PDF slides and optional audio/video recordings.
- Enforce Gemini structured output contracts so downstream persistence requires no post-processing.

## Macro Topology
- **Client (Next.js 15 App Router on Vercel)**: upload UI, job status dashboard, summary/quiz presentation, quiz player.
- **Blob Storage (Vercel Blob)**: direct browser uploads for PDFs/video/audio; stores signed URLs recorded in DB to keep Vercel functions within 4.5MB body limit.
- **Orchestrator API (Next.js route handlers)**: issues upload URLs, creates lecture metadata, enqueues background jobs.
- **Background Processing (Render Worker or Inngest/QStash)**:
  - STT worker (feature-flagged) invoking ElevenLabs Scribe v1 with webhook callbacks.
  - Gemini summarizer worker consuming PDF/transcript artifacts and persisting `LectureSummary` JSON.
  - Gemini quiz generator worker creating `QuizSet` JSON from summaries.
- **Database (PostgreSQL via Prisma)**: lectures, uploads, transcripts, summaries, quizzes, job runs, quiz attempts.

## Request Flows
1. **Upload**
   - Browser requests `POST /api/lectures` → orchestrator creates lecture row, returns blob upload URLs.
   - Client uploads files directly to Vercel Blob; responses include handles stored via `PATCH /api/lectures/:id/uploads`.
2. **Summarization**
   - User triggers summarize → orchestrator enqueues job with lecture ID, blob handles, feature flags.
   - Worker downloads artifacts, validates size (20MB+ must use File API), uploads to Gemini File API, runs `gemini-flash-latest` after Models API check, stores structured JSON.
3. **Quiz Generation**
   - Trigger requires existing summary; orchestrator enqueues quiz job.
   - Worker loads summary payload, calls Gemini with `QuizSet` schema, validates invariants (20 items, unique options, single answer) before persisting.
4. **Quiz Delivery**
   - Frontend fetches summaries/quizzes for display; quiz runner enforces single-answer, scoring, rationale display.

## Async Job Design
- Jobs persisted in DB with statuses (`pending`, `processing`, `succeeded`, `failed`, `needs_attention`).
- Workers implement retry with exponential backoff and dead-letter notifications.
- STT flow uses webhook ingestion route to update transcripts and trigger downstream summarization when audio-only modality is enabled.

## Input Modalities & Feature Flags
- Modalities: `pdf_only`, `pdf_plus_media`, `media_only`.
- Audio/video transcription path guarded by `ENABLE_AUDIO_PIPELINE` flag; orchestrator stores flag per lecture to prevent unintended STT usage.
- When media absent, summary sources mark missing components as `null` per schema requirements.

## Structured Output Guarantees
- Gemini requests configured with `responseMimeType: application/json` and explicit `responseSchema` (`LectureSummary`, `QuizSet`).
- Post-processing includes schema validation (AJV/Zod) and option uniqueness enforcement before DB upsert.
- Raw Gemini responses stored in audit table for observability and reruns.

## External Integrations
- **Gemini API**: content generation, File API for large artifacts, Models API verification for `gemini-flash-latest` availability.
- **ElevenLabs Scribe v1**: speech-to-text with diarization, word timestamps, optional webhook-triggered transcript ingestion.
- **FFmpeg**: media preprocessing (Render worker) ensuring mono 16kHz WAV before STT submission.

## Client Experience
- Upload dashboard shows blob upload progress, job queue states, and failure recovery actions.
- Summary view renders highlights, memorization, and concepts with source references (pages/timestamps).
- Quiz view enforces 20-question flow, difficulty labeling, rationale reveal, and review of source references.

