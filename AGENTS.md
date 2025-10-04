# Deployment Troubleshooting Log (2025-10-04)

**Operator Note:** The current maintainer describes themselves as a beginner. Future instructions must stay explicit, minimize assumptions, and spell out each command to run and why.

## Current Status

- Vercel projects (`apps/web`, `apps/orchestrator`) already set up with Blob storage connected.
- Render services:
  - PostgreSQL instance created and reachable.
  - Background worker service (`apps/worker`) deploys but runtime startup fails.
- Latest deploy log ends with `ERR_MODULE_NOT_FOUND` because the runtime cannot resolve `@quizdude/db/dist/index.js` inside the worker container.

## Work Completed This Session

1. **TypeScript build fixes for the worker**
   - Removed `rootDir` restriction so `tsc` can emit imports from `packages/*`.
   - Updated JSON writes to Prisma using `Prisma.InputJsonValue` and `Prisma.JsonNull` to satisfy the v5.22 client types.
   - Replaced the deprecated `getBlob` helper with `head()` + `fetch`, adding token-aware URL resolution.
2. **Script adjustments**
   - Worker `start`/`cleanup` scripts now execute the correct emitted bundle paths (`dist/apps/worker/src/...`).
3. **Dependency updates**
   - Added `prisma` CLI to `@quizdude/db` runtime dependencies so Render has access to the binary during `pnpm --filter @quizdude/db generate`.
4. **Render build experiments**
   - Build command currently used: `cd .. && corepack enable && pnpm install --frozen-lockfile && pnpm --filter @quizdude/shared build && pnpm --filter @quizdude/db build && pnpm --filter worker build`.
   - Build succeeds; Prisma client is generated and worker bundle emitted to `apps/worker/dist/apps/worker/src/index.js`.
   - 👉 새 빌드 스크립트는 아래 "Required Follow-Up" 섹션의 다중 라인 예시를 그대로 사용하세요.
5. **Runtime verification locally**
   - `pnpm --filter worker start` fails locally without `DATABASE_URL`, which is expected (no env provided). No other runtime errors observed locally after providing a dummy database.

## Observed Problems

- Render start command (`pnpm run start`) executes inside `apps/worker` where `node dist/apps/worker/src/index.js` runs.
- At runtime, Node resolves workspace imports relative to `/opt/render/project/src/apps/worker/node_modules`. Because the build step does **not** copy the compiled outputs for `@quizdude/db` and `@quizdude/shared` into that directory, the worker cannot load those packages and exits immediately.
- Latest Render run boots the worker bundle, but Prisma now stops with `P2021` because table `public.JobRun` is missing in the Render Postgres database (migrations were never applied).

## Required Follow-Up (Step-by-Step)

> Keep the beginner audience in mind. Every command should be copy-paste ready.

1. **프로젝트의 pnpm 버전 고정**
   - 로컬 터미널에서 저장소 루트로 이동한 뒤 아래 세 줄을 순서대로 실행하세요.
     ```bash
     cd /home/ksw6895/Projects/quizdude
     npm pkg set packageManager=pnpm@9.15.5
     git status
     ```
   - 이유: Render와 Vercel 모두 같은 pnpm(9.15.5)을 확실히 사용하도록 고정해 `--frozen-lockfile` 옵션 인식 오류를 막습니다.
2. **Render 빌드 명령 재구성**
   - Render → Background Worker → Settings → *Build Command*에서 기존 내용을 아래 스크립트로 교체하세요.
     ```bash
     set -eux
     node -v
     corepack enable
     corepack prepare pnpm@9.15.5 --activate
     which pnpm
     pnpm --version
     pnpm install --frozen-lockfile
     pnpm --filter @quizdude/shared build
     pnpm --filter @quizdude/db build
     pnpm --filter worker build
     ```
   - 이유: Corepack이 정확한 pnpm 버전을 활성화했는지 즉시 확인하고, 빌드 순서를 명확히 분리합니다.
3. **변경 사항 커밋 및 푸시**
   - 로컬에서 아래 명령으로 변경 내역을 커밋하고 원격 저장소로 푸시하세요.
     ```bash
     git add package.json
     git commit -m "chore: pin pnpm 9.15.5 for Render"
     git push origin main
     ```
   - 이유: Render가 새 설정을 받으려면 커밋과 푸시가 필요합니다.
4. **Redeploy manually**
   - Click the three-dot menu → _Manual Deploy_ → _Deploy latest commit_.
   - Watch logs; confirm the build and deploy succeed and that start command no longer reports missing modules.
5. **If the module error persists**
   - SSH into the Render shell or open the _Logs → Shell_ (if enabled).
   - Run `ls apps/worker/node_modules/@quizdude/db/dist` to ensure files exist. If missing, Render may be cleaning dev artifacts. In that case, add a prepare step to copy build outputs:
     ```bash
     pnpm --filter @quizdude/db build && pnpm --filter @quizdude/shared build && pnpm --filter worker build && pnpm --filter worker exec node ../../scripts/link-package-dists.mjs
     ```
     (A helper script would need to be authored; currently not implemented.)
6. **Provide environment variables**
   - Confirm `DATABASE_URL`, `GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, and related flags are set in Render → Environment tab for both the worker and cron job.
   - For local smoke tests, copy the production values into a `.env.worker.local` file and run `DATABASE_URL="..." pnpm --filter worker start`.
7. **Render DB에 Prisma 마이그레이션 적용**
   - Render Background Worker 페이지에서 _Shell_ 또는 SSH를 열고 기본 경로(`/opt/render/project/src`)를 확인합니다(`pwd`).
   - 아래 명령으로 현재 상태를 확인한 뒤 마이그레이션을 반영하세요.
     ```bash
     pnpm --filter @quizdude/db exec prisma migrate status
     pnpm --filter @quizdude/db exec prisma migrate deploy
     pnpm --filter @quizdude/db exec prisma migrate status
     ```
   - 기대 결과: `Database schema is up to date!` 메시지와 함께 `20251001000000_init` 등 마이그레이션이 적용되었다고 표시됩니다.
   - Shell이 `DATABASE_URL`을 읽지 못하면, Render 상단의 _Environment_ 버튼에서 동일한 값을 주입한 뒤 다시 실행하세요.
   - 성공 후 Worker 로그에 더 이상 `public.JobRun` 관련 오류가 나타나지 않는지 확인합니다.

## Additional Guidance for Beginners

- Always run `pnpm install` at the repo root before any build commands.
- Render 빌드와 동일한 버전을 쓰는지 확인하려면 아래 두 줄로 즉시 검증하세요.
  ```bash
  which pnpm
  pnpm --version
  ```
- To mimic Render locally:
  ```bash
  cd apps/worker
  set -eux
  cd ..
  corepack enable
  corepack prepare pnpm@9.15.5 --activate
  pnpm install --frozen-lockfile
  pnpm --filter @quizdude/shared build
  pnpm --filter @quizdude/db build
  pnpm --filter worker build
  cd apps/worker
  DATABASE_URL="postgres://user:pass@host:5432/db" pnpm run start
  ```
- If you see `MODULE_NOT_FOUND`, inspect the `dist` folders inside `node_modules/@quizdude/*`. Missing files mean the package’s `build` script did not run in that environment.
- Prisma `P2021` 혹은 테이블 누락 에러가 보이면, 먼저 `pnpm --filter @quizdude/db exec prisma migrate status`로 Render DB 적용 여부를 확인하세요.
- Keep commits small and descriptive; current recent commits are:
  - `d0bfd9c` – update worker scripts to use emitted bundle paths.
  - `25c6b16` – add Prisma CLI to production dependencies.
  - `2e77590` – adjust worker build for Render (tsconfig, Prisma JSON handling, Blob download fix).
- Render Shell에서 테이블을 직접 보고 싶다면 아래처럼 Prisma Studio를 CLI 모드로 띄워 URL만 확인할 수 있습니다.
  ```bash
  pnpm --filter @quizdude/db exec prisma studio --browser none
  ```

## Open Questions

- Does Render’s install step prune workspace build output after the build command? Investigate by enabling a Render shell and inspecting `node_modules/@quizdude/*/dist` after deploy.
- Should we publish `@quizdude/db` and `@quizdude/shared` as prebuilt packages or add postinstall hooks that compile automatically? This could simplify future deployments.

## Next Update Checklist

- [ ] Confirm new build command resolves the runtime import error.
- [ ] Document any additional Render configuration changes once verified.
- [ ] If cron job or additional services are added later, repeat the same build process.
- [ ] Render Postgres에 `pnpm --filter @quizdude/db exec prisma migrate deploy`가 적용되었고 `prisma migrate status`가 up-to-date라고 보고하는지 확인.
