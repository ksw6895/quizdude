# Feature Flag Strategy

## Goals
- Allow optional audio/video transcription pipeline to be enabled or disabled without code changes.
- Ensure per-lecture control so media-only uploads can be processed even if global flag is off.
- Provide safe defaults that avoid unexpected ElevenLabs usage or billing.

## Flags
- **Global**: `ENABLE_AUDIO_PIPELINE` (environment boolean, default `false`).
  - Evaluated by orchestrator API and background worker bootstrap.
  - When `false`, endpoints return `409` if clients request transcription, and workers skip STT job scheduling.
- **Per Lecture**: `lectures.audioPipelineEnabled` (DB boolean column).
  - Captured when lecture is created; UI exposes toggle at upload time.
  - Enables fine-grained control for pilots or A/B tests even when global flag is `true`.
- **Worker Runtime**: `AUDIO_PIPELINE_MODE` (`disabled` | `stt_only` | `stt_plus_summary`).
  - Derived from combination of global flag and lecture flag.
  - Governs whether STT completion triggers automatic summarization for media-only flows.

## Enforcement Points
1. **API Validation**: Orchestrator checks global+lecture flags before enqueuing STT jobs.
2. **Queue Consumer**: Worker double-checks flags at job start to prevent stale jobs running after flag change.
3. **UI State**: Upload form hides audio toggle when global flag is disabled; status dashboard tags STT-disabled lectures.
4. **Telemetry**: Flag state recorded in job logs to assist debugging, and included in alerts.

## Change Management
- Flags loaded via typed config module shared across apps (`packages/config`).
- Environment changes require redeploy on Vercel/Render; per-lecture toggles editable via admin UI.
- Documented in `docs/decisions.md` and `process.md` for continuity.

