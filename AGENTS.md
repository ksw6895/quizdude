# Deployment Troubleshooting Log (2025-10-04)

## High-Level State (2025-10-04)

- Render Background Worker (`apps/worker`) now builds and boots with `pnpm@9.15.5`; latest deploy logs show the process reaching `node dist/apps/worker/src/index.js` without module resolution errors.
- Database error `PrismaClientKnownRequestError P2021 (table public.JobRun does not exist)` occurred because Render Postgres had no migrations applied. Manual `prisma migrate deploy` resolved it.
- Vercel apps (`apps/web`, `apps/orchestrator`) remain healthy with Blob storage wired; no work performed this session.
- Cron job service has not been created yet. Future work must mirror the worker’s build/runtime pipeline and ensure database migrations run before scheduled tasks execute.

## Completed Remediation

1. **Build Toolchain Stabilization**
   - `package.json` now pins `packageManager` to `pnpm@9.15.5` so Corepack activates the correct binary in CI (Render/Vercel). Old pnpm builds were rejecting `--frozen-lockfile`.
   - Render Build Command rewritten as a single-line `&&` chain to avoid UI newline stripping, while still printing `pnpm --version` for verification.

2. **Worker Runtime Fixes**
   - TypeScript, Prisma, and Blob handling adjustments already merged earlier this session (see commits `d0bfd9c`, `25c6b16`, `2e77590`).
   - Start command temporarily changed to run migrations before the worker boot to recover from the missing table; reverted to `pnpm run start` after the schema synced.

3. **Database Initialization**
   - Applied migrations `20251001000000_init` and `20251002000000_phase4_gemini_payloads` on the Render Postgres instance via `pnpm --filter @quizdude/db exec prisma migrate deploy`.
   - Verified schema with `pnpm --filter @quizdude/db exec prisma migrate status`; worker restarted cleanly afterwards.

## Outstanding Concerns & Next Steps

- **Render Cron Job (Not Provisioned Yet)**
  1. Create a new Render service (Cron or Background Worker) pointing to this repo, root directory left blank (defaults to repo root).
  2. Use the exact same Build Command as the worker to ensure `@quizdude/shared` and `@quizdude/db` dist files exist:
     ```bash
     set -eux && node -v && corepack enable && corepack prepare pnpm@9.15.5 --activate && which pnpm && pnpm --version && pnpm install --frozen-lockfile && pnpm --filter @quizdude/shared build && pnpm --filter @quizdude/db build && pnpm --filter worker build
     ```
  3. Start Command depends on the cron entry point (not yet implemented). When adding a cron script, place its emitted bundle under `apps/worker/dist/...` or a new package and invoke with `node <path>`.
  4. Ensure the cron service has the same environment variables as the worker (`DATABASE_URL`, `GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, etc.).
  5. Before first run, execute `pnpm --filter @quizdude/db exec prisma migrate deploy` (via Start Command hack or Render Shell) to guarantee DB schema parity.
  6. Document the cron schedule, command, and migration status in this file after provisioning.

- **Operational Runbook Enhancements**
  - Consider scripting a reusable deployment helper (e.g., `scripts/render-deploy-worker.sh`) that wraps the Build Command and migration deployment.
  - Evaluate adding a CI job that runs `pnpm --filter @quizdude/db exec prisma migrate diff` against Render to catch drift early.
  - Investigate publishing `@quizdude/db` / `@quizdude/shared` as prebuilt packages or adding postinstall hooks so CI auto-builds dependencies.

## Render Background Worker Procedures

### Build Command (Render UI → Settings → Build Command)

```bash
set -eux && node -v && corepack enable && corepack prepare pnpm@9.15.5 --activate && which pnpm && pnpm --version && pnpm install --frozen-lockfile && pnpm --filter @quizdude/shared build && pnpm --filter @quizdude/db build && pnpm --filter worker build
```

- Keep the `set -eux` prefix to stop on failure and echo each step. The `corepack prepare` line forces pnpm 9.15.5 activation even if Render’s base image ships a different version.

### Start Command

- Default: `pnpm run start` (executes `node dist/apps/worker/src/index.js`).
- Emergency schema sync: temporarily change Start Command to `pnpm --filter @quizdude/db exec prisma migrate deploy && pnpm run start` to unblock when Shell access is unavailable. Revert afterward.

### Database Migration Checklist

1. Confirm `DATABASE_URL` is present in Render → Environment.
2. Run:
   ```bash
   pnpm --filter @quizdude/db exec prisma migrate status
   pnpm --filter @quizdude/db exec prisma migrate deploy
   pnpm --filter @quizdude/db exec prisma migrate status
   ```
3. Expect `Database schema is up to date!` and migrations `20251001000000_init`, `20251002000000_phase4_gemini_payloads` to show as applied.
4. Optional: inspect tables via
   ```bash
   pnpm --filter @quizdude/db exec prisma studio --browser none
   ```

### Troubleshooting Matrix

- **`Unknown option: 'frozen-lockfile'` during build** → pnpm version mismatch. Ensure `packageManager` pin is committed and Build Command includes `corepack prepare`.
- **`ERR_MODULE_NOT_FOUND` for `@quizdude/*`** → build dist not present. Re-run build command; verify `apps/worker/node_modules/@quizdude/*/dist` exists in pod (using Shell).
- **`P2021` missing table** → run migrations as above. Worker cannot operate without schema.
- **Shell stuck reconnecting** → service crash loop. Temporarily prepend Start Command with `pnpm --filter @quizdude/db exec prisma migrate deploy &&` to stabilize, then revert.

## Environment Variables (Worker & Future Cron)

- `DATABASE_URL` – required for Prisma migrations and runtime.
- `GEMINI_API_KEY` – quiz/summarization pipeline.
- `BLOB_READ_WRITE_TOKEN`, `BLOB_ACCOUNT_ID` (if applicable) – Blob storage access.
- Any feature flags mirrored from Vercel apps (check Render console to stay in sync).

## Response Protocol for Operator `ksw6895`

- **Language**: 항상 한국어로 답변한다. 영어 기술 용어는 그대로 두되, 설명은 한국어로 풀어쓴다.
- **Style**: 초보자를 가정하고, 모든 명령은 복사/붙여넣기 가능한 형태로 제공한다. 왜 실행하는지도 한 줄로 설명한다.
- **Verification**: 가능하다면 로그/출력 예시를 요약해 전달하고, 사용자가 직접 확인할 포인트를 지정한다.
- **Escalation**: Shell 접속이 필요하거나 Start Command를 바꿔야 하는 경우 사유를 먼저 설명한 뒤 단계별로 안내한다.
- **Status Updates**: Render 배포 로그, Prisma 마이그레이션 결과, 환경 변수 변경 등이 있으면 AGENTS.md에 즉시 기록하여 다음 에이전트가 이어받기 쉽게 만든다.

## Recent Commits

- `67f8e22` (2025-10-04) – docs: add Render migration steps.
- `f8feebd` (2025-10-04) – chore: pin pnpm 9.15.5 for Render.
- Earlier remediation: `d0bfd9c`, `25c6b16`, `2e77590` (TypeScript/Prisma/Blob fixes).

## Open Questions

- Does Render wipe `node_modules` after build? Need shell verification (`ls apps/worker/node_modules/@quizdude/db/dist`).
- Should we automate migrations on startup, or keep manual control to avoid schema drift?
- For future cron service, which entry point will it execute? (TODO: design cron runner, likely in `apps/worker/src/cron/*`.)

## Next Update Checklist

- [ ] Confirm Render worker stays healthy post-migration (no recurring `P2021`).
- [ ] Document the eventual cron job setup (build/start commands, schedule, env vars) once created.
- [ ] Evaluate automation for `prisma migrate deploy` during CI or deployment without blocking restarts.
- [ ] Capture any Render environment changes (new tokens, feature flags) in this file immediately.
