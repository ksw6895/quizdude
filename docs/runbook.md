# Deployment & Operations Runbook

This runbook describes how to deploy Quizdude to production and keep it healthy. It assumes access to the GitHub repository, Vercel, Render, and a managed PostgreSQL instance. Follow the sections in order the first time you launch; afterward, use the checklists whenever you promote a new build.

## 1. Pre-flight Checklist

- GitHub main branch is green (CI lint/type checks pass locally with `pnpm lint` and targeted `pnpm test`).
- `.env` is up to date; new variables were copied into `.env.example` and documented.
- Gemini API quota reviewed for the current billing period.
- Vercel Blob usage reviewed (inspect [Vercel Blob dashboard](https://vercel.com/docs/storage/vercel-blob) for size/quota).
- Postgres backup or snapshot scheduled (Render, Neon, Supabase, etc.).

## 2. Provision Core Infrastructure

1. **PostgreSQL**
   - Create database (e.g., Render PostgreSQL, Neon, Supabase).
   - Record connection URL (`postgresql://USER:PASSWORD@HOST:PORT/quizdude`).
   - Enable automated backups and retention >= 7 days.
2. **Vercel Blob Store**
   - In Vercel dashboard go to _Storage → Blob_ and create a store named `quizdude-artifacts` (any region).
   - Generate a _Read/Write Token_ and copy the `BLOB_READ_WRITE_URL` + token.
   - Generate a _Write Token_ for uploads from the orchestrator.
3. **ElevenLabs (Optional)**
   - Create API key if audio pipeline will be used.
   - Create webhook secret and configure the callback URL later after deploying the orchestrator.

## 3. Configure Vercel Projects

Quizdude uses two Next.js apps in the same monorepo. Create two Vercel projects pointing to the same repository, each with its own root directory.

### 3.1 apps/web

1. Vercel → _Add New Project_ → import the GitHub repo.
2. Set **Root Directory** to `apps/web`.
3. Build settings:
   - Install command: `pnpm install --frozen-lockfile`
   - Build command: `pnpm run build`
   - Output directory: `.vercel/output`
4. Environment variables (Production & Preview):

| Key                            | Value                           | Notes                                                   |
| ------------------------------ | ------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`          | `https://<your-web-domain>`     | Use Vercel domain or custom domain after DNS completes. |
| `NEXT_PUBLIC_ORCHESTRATOR_URL` | `https://<orchestrator-domain>` | Must match deployed orchestrator base URL.              |
| `VERCEL_BLOB_READ_WRITE_URL`   | copied from Blob store          | Shared with orchestrator + worker.                      |
| `VERCEL_BLOB_WRITE_TOKEN`      | write token from Blob store     | Same token as orchestrator.                             |

5. Add _Environment Variable Groups_ in Vercel (optional) so the Blob values stay in sync across projects.
6. Deploy. Confirm build succeeds and UI loads with maintenance banner (no API calls yet).
7. Enable **Vercel Observability**: Under _Settings → Observability_ turn on DataDog exporter (or direct Vercel Observability) and link to preferred target (e.g., Vercel's hosted logs). Configure _alerts_ for `Build Failed` events via Slack/email.

### 3.2 apps/orchestrator

1. Create another Vercel project → same repo → Root Directory `apps/orchestrator`.
2. Build settings identical to above (`pnpm install`, `pnpm run build`).
3. Environment variables:

| Key                            | Value                           | Notes                                     |
| ------------------------------ | ------------------------------- | ----------------------------------------- |
| `DATABASE_URL`                 | Postgres connection URL         | Same URL used by worker.                  |
| `GEMINI_API_KEY`               | Gemini API key                  | Keep secret; use Vercel _Encrypted_ type. |
| `GEMINI_MODEL_ID`              | `gemini-flash-latest` (default) | Update when migrating models.             |
| `VERCEL_BLOB_READ_WRITE_URL`   | Blob RW URL                     | Must match web + worker.                  |
| `VERCEL_BLOB_WRITE_TOKEN`      | Blob write token                | Required to mint upload URLs.             |
| `ENABLE_AUDIO_PIPELINE`        | `true` or `false`               | Toggle before deployment.                 |
| `NEXT_PUBLIC_APP_URL`          | `https://<your-web-domain>`     | Enables absolute links in API responses.  |
| `NEXT_PUBLIC_ORCHESTRATOR_URL` | `https://<orchestrator-domain>` | Self-reference for API docs & SWR.        |
| `ELEVENLABS_API_KEY`           | optional                        | Only if audio pipeline on.                |
| `ELEVENLABS_WEBHOOK_SECRET`    | optional                        | Only if audio pipeline on.                |

4. After first successful deploy, under _Settings → Functions_ ensure the default region matches your database (latency optimization).
5. Enable Observability for orchestrator as in `apps/web` and configure an alert for HTTP 5xx spikes (Vercel’s Analytics → Alerts → “Server Error Rate”).

## 4. Deploy Render Background Worker

1. Render dashboard → _New → Background Worker_.
2. Connect GitHub repo.
3. Set **Root Directory** to `apps/worker`.
4. Build command:
   ```bash
   pnpm install --frozen-lockfile
   pnpm run build
   ```
5. Start command:
   ```bash
   pnpm run start
   ```
6. Environment variables (copy from orchestrator where relevant):

| Key                          | Value                            |
| ---------------------------- | -------------------------------- |
| `DATABASE_URL`               | Same Postgres URL                |
| `GEMINI_API_KEY`             | Same as orchestrator             |
| `GEMINI_MODEL_ID`            | Typically `gemini-flash-latest`  |
| `VERCEL_BLOB_READ_WRITE_URL` | Same Blob URL                    |
| `VERCEL_BLOB_WRITE_TOKEN`    | Same write token                 |
| `ENABLE_AUDIO_PIPELINE`      | `true`/`false`                   |
| `ELEVENLABS_API_KEY`         | optional                         |
| `ELEVENLABS_WEBHOOK_SECRET`  | optional                         |
| `JOB_POLL_INTERVAL_MS`       | optional override (default 5000) |
| `JOB_MAX_ATTEMPTS`           | optional override (default 3)    |

7. Under _Advanced_ enable automatic deploys on the `main` branch.
8. After first deploy, open the logs tab and confirm the worker reports `No job found, sleeping` or similar heartbeat.

### 4.1 Render Cron Job for Queue Cleanup

1. Render dashboard → _New → Cron Job_.
2. Repo: same GitHub, Root Directory `apps/worker`.
3. Build command (runs once per deploy):
   ```bash
   pnpm install --frozen-lockfile
   pnpm run build
   ```
4. Command (executed on schedule):
   ```bash
   pnpm run cleanup
   ```
5. Schedule suggestion: Every 10 minutes (`*/10 * * * *`). Adjust based on workload.
6. Environment variables: provide the same set as the worker service plus optional overrides:
   - `JOB_PROCESSING_TIMEOUT_MINUTES` (default 15)
   - `JOB_CLEANUP_MAX_ATTEMPTS` (default 5)
   - `JOB_RESCHEDULE_DELAY_SECONDS` (default 60)
7. Validate by running the Cron job manually once from Render’s dashboard and confirming logs show cleanup summary output.

## 5. Database Migrations

Run migrations from your local machine or a one-off Render job before first deploy:

```bash
pnpm --filter @quizdude/db generate
pnpm --filter @quizdude/db migrate
```

For future schema changes, prefer `pnpm --filter @quizdude/db migrate deploy` inside a temporary Render job or GitHub Action guarded behind manual approval.

## 6. Post-Deployment Smoke Test

1. Open the web app URL and upload a small PDF (<1 MB).
2. Verify a lecture record is created (`/admin/jobs` should show a new Summarize job).
3. Confirm the worker log shows file upload to Gemini and job completion.
4. Check Prisma database for new `Summary` and `Quiz` entries.
5. Run the cleanup Cron job manually; ensure no errors occur.

## 7. Observability & Alerts

- **Vercel**: Enable Observability for both projects; route alerts to Slack/email. Recommended alerts:
  - Build failures
  - Server error rate > 5%
  - Slow function execution (>5s)
- **Render Worker**: Set alert rules for `Error` log entries and service restarts. Consider integrating Render with PagerDuty or Slack via webhooks.
- **Gemini API**: Monitor quota via Google Cloud console; set budget alerts.
- **Database**: Configure provider alerts for CPU > 70%, storage nearing limits, and replication lag.

## 8. Disaster Recovery

- Daily Postgres backups (verify restore plan monthly).
- Export Vercel Blob contents monthly if regulatory requirements apply.
- Keep a copy of `.env` values in an encrypted password manager (1Password/Bitwarden with shared vault).
- Document manual worker failover: redeploy on Render → _Manual Deploy_ → select previous build if latest release is broken.

## 9. On-call Playbook

| Symptom                      | Action                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| Uploads stuck in PROCESSING  | Check worker logs; if many jobs stuck, run cleanup Cron manually. Inspect Blob status via `/admin/jobs`. |
| Gemini model missing error   | Update `GEMINI_MODEL_ID` in orchestrator & worker to available model; redeploy both.                     |
| Database connection errors   | Verify DATABASE_URL credentials; rotate password; restart worker.                                        |
| Elevated 5xx on orchestrator | Check Vercel function logs; roll back to previous deployment via Vercel UI.                              |
| Blob permission errors       | Regenerate Blob tokens; update env vars across all services; redeploy.                                   |

Keep this document updated whenever infrastructure components change.
