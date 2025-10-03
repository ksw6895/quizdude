# Quizdude 배포 및 로컬 운영 종합 가이드 (Vercel + Render)

> 이 문서는 Quizdude 모노레포를 Vercel(웹 + 오케스트레이터)과 Render(백그라운드 워커, Cron Job)에 배포하고, 로컬 환경에서 안정적으로 테스트하는 전 과정을 상세히 설명합니다. GitHub 저장소에 코드를 올린 상태에서 시작한다고 가정합니다.

## 목차

- [A. 사전 준비 체크리스트](#a-사전-준비-체크리스트)
- [B. 코드베이스와 환경 변수 관리](#b-코드베이스와-환경-변수-관리)
- [C. Vercel Blob 스토리지 생성](#c-vercel-blob-스토리지-생성)
- [D. PostgreSQL 데이터베이스 준비](#d-postgresql-데이터베이스-준비)
- [E. Vercel 프로젝트 구성 (apps/web)](#e-vercel-프로젝트-구성-appsweb)
- [F. Vercel 프로젝트 구성 (apps/orchestrator)](#f-vercel-프로젝트-구성-appsorchestrator)
- [G. Render 백그라운드 워커 배포 (apps/worker)](#g-render-백그라운드-워커-배포-appsworker)
- [H. Render Cron Job 설정 (큐 정리)](#h-render-cron-job-설정-큐-정리)
- [I. 처음 배포 후 필수 점검 절차](#i-처음-배포-후-필수-점검-절차)
- [J. 운영 중 필수 모니터링 항목](#j-운영-중-필수-모니터링-항목)
- [K. 로컬 개발/테스트 워크플로](#k-로컬-개발테스트-워크플로)
- [L. 로컬에서 기능 점검 시나리오](#l-로컬에서-기능-점검-시나리오)
- [M. 토큰/비밀 키 회전 절차](#m-토큰비밀-키-회전-절차)
- [N. 자주 사용하는 명령어 치트시트](#n-자주-사용하는-명령어-치트시트)
- [O. 문제 해결 가이드](#o-문제-해결-가이드)

---

## A. 사전 준비 체크리스트

1. **계정 및 권한**
   - GitHub 저장소 `quizdude`에 대한 협업 권한.
   - Vercel 조직/프로젝트 생성 권한 및 유료 플랜(Blob 스토리지 사용량에 대비하여 검토).
   - Render 계정(Background Worker, Cron Job 기능 사용 가능).
   - Google Cloud Console에서 Gemini API 사용 설정 및 결제 계정.
   - (선택) ElevenLabs 계정 및 Scribe v1 사용 가능 플랜.

2. **로컬 개발 환경**
   - Node.js 20 LTS 이상 설치 (`node -v`로 확인).
   - `corepack enable`로 pnpm 8.x 사용 준비.
   - Docker Desktop 또는 다른 PostgreSQL 실행 수단 (로컬 DB 필요 시).

3. **보안 관리**
   - 비밀 값 관리용 1Password, Bitwarden, Vault 등 준비.
   - GitHub 보호: 브랜치 보호 규칙과 Secret Scanning을 활성화.

4. **문서화**
   - `.env.example` 최신화 여부 확인.
   - `docs/runbook.md`, `docs/architecture.md` 훑어보고 전체 시스템 흐름 파악.

---

## B. 코드베이스와 환경 변수 관리

1. **저장소 클론 (필요 시)**

   ```bash
   git clone git@github.com:<ORG>/quizdude.git
   cd quizdude
   ```

2. **pnpm 설치 및 의존성 인스톨**

   ```bash
   corepack enable
   pnpm install
   ```

3. **환경 변수 파일 구조**
   - 루트 `.env`: 로컬 개발 기본 설정.
   - `.env.example`: 필수/선택 항목 커버리지를 항상 일치시킵니다.
   - 배포 환경에서는 Vercel/Render 대시보드에 직접 입력하고, 필요 시 `vercel env pull`로 읽어옵니다.

4. **필수 환경 변수 요약**

   | 변수                                              | 설명                          | 비고                                                |
   | ------------------------------------------------- | ----------------------------- | --------------------------------------------------- |
   | `DATABASE_URL`                                    | Prisma/PostgreSQL 연결 문자열 | Render, orchestrator, worker 모두 동일하게 사용     |
   | `GEMINI_API_KEY`                                  | Gemini API 키                 | Google Cloud Console → Vertex AI → API key          |
   | `GEMINI_MODEL_ID`                                 | 기본 `gemini-flash-latest`    | 모델 버전 변경 시 orchestrator/worker 동시 업데이트 |
   | `ENABLE_AUDIO_PIPELINE`                           | `true`/`false`                | 오디오 파이프라인 전역 플래그                       |
   | `VERCEL_BLOB_WRITE_TOKEN`                         | Blob 업로드 토큰              | 웹, 오케스트레이터, 워커에 동일하게 주입            |
   | `VERCEL_BLOB_READ_WRITE_URL`                      | Blob RW URL                   | Blob 파일 접근/정리에 필요                          |
   | `NEXT_PUBLIC_APP_URL`                             | 프런트엔드 절대 URL           | Vercel Production/Preview 각각 세팅                 |
   | `NEXT_PUBLIC_ORCHESTRATOR_URL`                    | API 기본 URL                  | 웹이 API 호출 시 사용                               |
   | `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET` | (선택) 오디오 전사용          | 파이프라인 활성화 시 필수                           |

5. **환경 변수 동기화 전략**
   - Vercel: 환경 변수 그룹(Projects → Settings → Environment Variables → Create Group)으로 Blob/DB 값을 공유.
   - Render: Render Secrets는 서비스별로 수동 관리하므로, 변경 시 워커와 Cron Job 두 곳 모두 갱신.
   - 로컬: `.env` 파일에 운영 비밀을 장기간 보관하지 말고, 필요 시 임시로 입력 후 삭제.

---

## C. Vercel Blob 스토리지 생성

1. Vercel 대시보드 로그인 → **Storage → Blob** 메뉴.
2. **Create Blob Store** 클릭 → 이름 예: `quizdude-artifacts`.
3. 리전은 웹 사용자와 가장 가까운 리전을 선택 (예: 미국 사용자는 `Washington, D.C.`).
4. 스토어 생성 후 **Tokens** 탭 이동.
5. **Generate Token → Read/Write** 선택 → `BLOB_READ_WRITE_URL`과 `BLOB_TOKEN`이 발급됩니다.
   - `VERCEL_BLOB_READ_WRITE_URL` = UI에서 복사 가능한 전체 URL (예: `https://....vercel-storage.com....`).
   - `VERCEL_BLOB_WRITE_TOKEN` = 오케스트레이터가 업로드 주소를 만들 때 사용하는 토큰.
6. (선택) 프런트엔드 직접 업로드만 허용하려면 Read/Write URL만 공유하고 Write Token은 서버 측에만 유지.
7. 토큰은 노출 시 즉시 폐기 후 재발급하고, 모든 서비스에 다시 반영해야 합니다.

---

## D. PostgreSQL 데이터베이스 준비

1. **Render를 사용하는 경우**
   - Render 대시보드 → **New + → PostgreSQL**.
   - 플랜 선택 (무료 플랜은 슬립 현상이 있어 운영에는 추천하지 않음).
   - 데이터베이스 이름: `quizdude` (예시).
   - 생성 후 **Connections** 탭에서 `External Database URL`을 복사 → `DATABASE_URL`로 사용.
   - 백업 보존 기간을 7일 이상으로 설정.

2. **대안 서비스**
   - Neon/Supabase/Railway 등 사용 가능. SSL 옵션이 필요한 경우 `?sslmode=require`를 URL에 포함.

3. **DB 스키마 적용**
   - 최초 배포 전에 로컬에서 아래 명령으로 Prisma 마이그레이션을 적용합니다.
     ```bash
     pnpm --filter @quizdude/db generate
     pnpm --filter @quizdude/db migrate
     ```
   - 운영 DB에 적용할 때는 위 명령을 실행하기 전에 `.env`의 `DATABASE_URL`을 운영용으로 임시 교체하고, 완료 후 복원합니다.

---

## E. Vercel 프로젝트 구성 (apps/web)

1. Vercel 대시보드 → **Add New → Project** → GitHub에서 `quizdude` 저장소 선택.
2. **Framework Preset**은 자동으로 Next.js로 감지됩니다.
3. **Root Directory**에서 `apps/web` 선택.
4. **Build & Output Settings**
   - Install Command: `pnpm install --frozen-lockfile`
   - Build Command: `pnpm run build`
   - Output Directory: `.vercel/output`
5. **Environment Variables** (Production/Preview 모두 동일 입력 권장)

   | Key                            | 예시 값                                    | 설명                                  |
   | ------------------------------ | ------------------------------------------ | ------------------------------------- |
   | `NEXT_PUBLIC_APP_URL`          | `https://quizdude-web.vercel.app`          | Vercel 기본 도메인 또는 커스텀 도메인 |
   | `NEXT_PUBLIC_ORCHESTRATOR_URL` | `https://quizdude-orchestrator.vercel.app` | API 호출 대상                         |
   | `VERCEL_BLOB_WRITE_TOKEN`      | Blob Write Token                           | 토큰 노출 주의                        |
   | `VERCEL_BLOB_READ_WRITE_URL`   | Blob RW URL                                | 업로드/다운로드 공통 사용             |

   #### .env 템플릿 (Vercel CLI로 일괄 업로드)

   ```bash
   # apps/web - Production
   NEXT_PUBLIC_APP_URL=https://quizdude-web.vercel.app
   NEXT_PUBLIC_ORCHESTRATOR_URL=https://quizdude-orchestrator.vercel.app
   VERCEL_BLOB_WRITE_TOKEN=WRITE_TOKEN_HERE
   VERCEL_BLOB_READ_WRITE_URL=https://quizdude-artifacts-vercel-blobs-url
   ```

   - 위 내용을 `vercel.web.prod.env` 등 임시 파일로 저장한 뒤 Vercel 대시보드(Environment Variables → Bulk Edit)에 그대로 붙여 넣으면 한 번에 등록할 수 있습니다.
   - CLI를 사용할 경우 `npx vercel env pull vercel.web.prod.env`로 현재 값을 백업하고, `printf "<value>" | npx vercel env add <KEY> production` 형태로 각 항목을 재적용하세요. 작은 쉘 스크립트로 반복문을 작성하면 여러 항목도 빠르게 입력할 수 있습니다.
   - Preview/Development 환경도 동일한 포맷으로 파일을 분리해 관리하면 환경별 값을 명확히 구분할 수 있습니다.

6. **Environment Variable Group**을 사용하면 동일 그룹을 orchestrator 프로젝트에도 재사용 가능.
7. **Git Branch**: 기본 `main`. Preview 배포를 위해 PR 브랜치 빌드 허용 유지.
8. **Deploy** 버튼 클릭 → 빌드 성공 확인.
9. 배포 후 **Settings → Functions**에서 `Region`을 DB와 가까운 지역으로 맞추면 지연 시간이 줄어듭니다.
10. **Settings → Domains**에서 커스텀 도메인을 연결하려면 DNS 레코드(CNAME/ALIAS)를 세팅.
11. **Settings → Observability**에서 Vercel Analytics/Turbo Observability 활성화 및 Slack Webhook 연결.
12. (선택) **Source Code Protection** → Production Branch 보호 설정으로 실수 방지.

---

## F. Vercel 프로젝트 구성 (apps/orchestrator)

1. Vercel → **Add New → Project** 반복 → 동일 저장소.
2. **Root Directory**를 `apps/orchestrator`로 지정.
3. Install/Build/Output 설정은 웹과 동일.
4. **Environment Variables**

   | Key                            | 설명                         |
   | ------------------------------ | ---------------------------- |
   | `DATABASE_URL`                 | 운영 PostgreSQL 연결 문자열  |
   | `GEMINI_API_KEY`               | Gemini API 키                |
   | `GEMINI_MODEL_ID`              | 기본값 `gemini-flash-latest` |
   | `VERCEL_BLOB_WRITE_TOKEN`      | Blob Write Token             |
   | `VERCEL_BLOB_READ_WRITE_URL`   | Blob RW URL                  |
   | `ENABLE_AUDIO_PIPELINE`        | `true` 또는 `false`          |
   | `NEXT_PUBLIC_APP_URL`          | 직접 링크 생성용             |
   | `NEXT_PUBLIC_ORCHESTRATOR_URL` | 자기 자신 도메인             |
   | `ELEVENLABS_API_KEY`           | (선택) 오디오 파이프라인     |
   | `ELEVENLABS_WEBHOOK_SECRET`    | (선택) 오디오 파이프라인     |

   #### .env 템플릿 (Vercel CLI/대시보드 공용)

   ```bash
   # apps/orchestrator - Production
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/quizdude
   GEMINI_API_KEY=YOUR_GEMINI_KEY
   GEMINI_MODEL_ID=gemini-flash-latest
   VERCEL_BLOB_WRITE_TOKEN=WRITE_TOKEN_HERE
   VERCEL_BLOB_READ_WRITE_URL=https://quizdude-artifacts-vercel-blobs-url
   ENABLE_AUDIO_PIPELINE=false
   NEXT_PUBLIC_APP_URL=https://quizdude-web.vercel.app
   NEXT_PUBLIC_ORCHESTRATOR_URL=https://quizdude-orchestrator.vercel.app
   ELEVENLABS_API_KEY=
   ELEVENLABS_WEBHOOK_SECRET=
   ```

   - 파일을 `vercel.orchestrator.prod.env` 등으로 저장해 Bulk Edit에 붙여 넣거나, CLI에서 `printf` 파이프 + `npx vercel env add <KEY> production` 조합으로 순차 적용하세요.
   - Preview/Development 값은 별도 파일로 관리하고, 실수 방지를 위해 Production과 다른 디렉터리에 보관하는 것이 좋습니다.

5. 배포가 끝난 뒤 **Settings → Logs**에서 `Serverless Function` 로그 확인.
6. **Settings → Webhooks** (선택): GitHub Actions가 성공했을 때만 재배포하도록 Webhook 조건을 구성 가능.
7. **Settings → Access Control**에서 Production 브랜치 보호 및 팀 멤버 권한을 적절하게 설정.
8. 오케스트레이터의 API 라우트를 보호하기 위해 임시로 Basic Auth 등을 도입하려면 Vercel Edge Middleware 사용을 검토.

---

## G. Render 백그라운드 워커 배포 (apps/worker)

1. Render 대시보드 → **New + → Background Worker**.
2. Git Provider에서 `quizdude` 저장소 연결.
3. **Environment**: Runtime은 `Node`로 자동 인식.
4. **Root Directory** 필드에 `apps/worker` 입력.
5. **Build Command**
   ```bash
   pnpm install --frozen-lockfile
   pnpm run build
   ```
6. **Start Command**
   ```bash
   pnpm run start
   ```
7. **Instance Type**: 기본 `Starter`로 시작, 처리량이 늘면 Scaling 탭에서 상향 조정.
8. **Environment Variables** (모두 Required unless noted)
   - `DATABASE_URL`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL_ID`
   - `VERCEL_BLOB_WRITE_TOKEN`
   - `VERCEL_BLOB_READ_WRITE_URL`
   - `ENABLE_AUDIO_PIPELINE`
   - `ELEVENLABS_API_KEY` (선택)
   - `ELEVENLABS_WEBHOOK_SECRET` (선택)
   - `JOB_POLL_INTERVAL_MS` (선택, 기본 5000)
   - `JOB_MAX_ATTEMPTS` (선택, 기본 3)

   #### .env 템플릿 (Render Background Worker)

   ```bash
   # apps/worker - Render Background Worker
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/quizdude
   GEMINI_API_KEY=YOUR_GEMINI_KEY
   GEMINI_MODEL_ID=gemini-flash-latest
   VERCEL_BLOB_WRITE_TOKEN=WRITE_TOKEN_HERE
   VERCEL_BLOB_READ_WRITE_URL=https://quizdude-artifacts-vercel-blobs-url
   ENABLE_AUDIO_PIPELINE=false
   ELEVENLABS_API_KEY=
   ELEVENLABS_WEBHOOK_SECRET=
   JOB_POLL_INTERVAL_MS=5000
   JOB_MAX_ATTEMPTS=3
   ```

   - Render 대시보드의 **Environment → Add from .env file** 버튼을 클릭하고 위 텍스트를 붙여 넣으면 한 번에 등록됩니다.
   - IaC(Terraform)나 Render API를 활용할 경우에도 동일한 `.env` 파일을 입력 소스로 사용하면 환경 변수 관리가 일관됩니다.

9. **Auto Deploy**: Branch = `main`, PR Deploy는 필요 시 끔.
10. 최초 배포 후 Logs에서 `No pending jobs found, sleeping...` 등의 주기적 로그가 출력되는지 확인.
11. **Metrics** 탭에서 CPU/메모리 사용량을 관찰하고 임계값 초과 시 알림 설정.
12. (선택) **Health Checks**: `/healthz`와 같은 엔드포인트가 없다면 비활성화 유지.

---

## H. Render Cron Job 설정 (큐 정리)

1. Render → **New + → Cron Job**.
2. Git 저장소 동일, **Root Directory** = `apps/worker`.
3. **Build Command** 동일:
   ```bash
   pnpm install --frozen-lockfile
   pnpm run build
   ```
4. **Command**
   ```bash
   pnpm run cleanup
   ```
5. **Schedule** 예시: `*/10 * * * *` (10분마다) → 부하에 따라 조절.
6. 환경 변수는 워커와 동일 세트 복사 + 아래 선택 옵션을 추가로 사용할 수 있음.
   - `JOB_PROCESSING_TIMEOUT_MINUTES` (기본 15)
   - `JOB_CLEANUP_MAX_ATTEMPTS` (기본 5)
   - `JOB_RESCHEDULE_DELAY_SECONDS` (기본 60)

   #### .env 템플릿 (Render Cron Job)

   ```bash
   # apps/worker - Render Cron Job
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/quizdude
   GEMINI_API_KEY=YOUR_GEMINI_KEY
   GEMINI_MODEL_ID=gemini-flash-latest
   VERCEL_BLOB_WRITE_TOKEN=WRITE_TOKEN_HERE
   VERCEL_BLOB_READ_WRITE_URL=https://quizdude-artifacts-vercel-blobs-url
   ENABLE_AUDIO_PIPELINE=false
   ELEVENLABS_API_KEY=
   ELEVENLABS_WEBHOOK_SECRET=
   JOB_PROCESSING_TIMEOUT_MINUTES=15
   JOB_CLEANUP_MAX_ATTEMPTS=5
   JOB_RESCHEDULE_DELAY_SECONDS=60
   ```

   - Cron Job 편집 화면에서도 **Add from .env file**를 이용해 위 값을 복사/붙여 넣을 수 있습니다.
   - 스케줄별로 다른 값을 쓰고 싶다면 파일명을 `render.cron.prod.env`, `render.cron.staging.env`처럼 구분해 보관하세요.

7. Cron Job 생성 직후 **Run Now** 버튼으로 1회 실행 → Logs에서 성공 메시지 확인.
8. Cron Job이 실패하면 워커 큐가 쌓일 수 있으므로 Render Alerts로 실패 알림을 설정.

---

## I. 처음 배포 후 필수 점검 절차

1. **웹 앱 접속**: `https://<web-project>.vercel.app` → 기본 페이지 로드 확인.
2. **오케스트레이터 API 헬스 체크**: `https://<orchestrator-project>.vercel.app/api/health` 라우트를 구성했다면 호출; 없으면 `/api/jobs` 등 안전한 GET 엔드포인트 호출로 200 응답 확인.
3. **Blob 업로드 경로 확인**: 웹에서 파일 업로드 시 Blob로 프록시되는지 Network 탭 확인.
4. **Render 워커 로그**: 새로운 Job이 없을 때도 주기적 heartbeat 로그가 있는지 확인.
5. **데이터베이스 연결 확인**: Render 포털에서 `psql` 접속 또는 `SELECT 1` 테스트.
6. **관측/알림 설정 테스트**: Vercel/Render에서 테스트 알림을 발생시켜 Slack/메일이 수신되는지 검증.

---

## J. 운영 중 필수 모니터링 항목

- **Vercel Projects**: Build Failures, Server Error Rate(5xx), Function Duration 경고를 Slack으로 수신.
- **Render Worker**: 재시작 횟수, 메모리 급증, Start Command 실패 감시.
- **Gemini API 쿼터**: Google Cloud Billing → Budgets & alerts 설정.
- **PostgreSQL**: 연결 수, 디스크 사용량, 백업 성공 여부.
- **Blob 저장소**: 월간 트래픽/스토리지 사용량 검토, 필요 시 Lifecycle 정책 구성.
- **ElevenLabs Webhook (선택)**: 응답 200 여부, 재시도 횟수.

---

## K. 로컬 개발/테스트 워크플로

1. **의존성 설치/업데이트**

   ```bash
   corepack enable
   pnpm install
   ```

2. **로컬 PostgreSQL 실행 (Docker 예시)**

   ```bash
   docker run --name quizdude-db -e POSTGRES_PASSWORD=secret -e POSTGRES_USER=quizdude -e POSTGRES_DB=quizdude -p 5432:5432 -d postgres:16
   ```

   - `.env`의 `DATABASE_URL`을 `postgresql://quizdude:secret@localhost:5432/quizdude`로 설정.

3. **Prisma 마이그레이션**

   ```bash
   pnpm --filter @quizdude/db generate
   pnpm --filter @quizdude/db migrate
   ```

4. **서비스별 실행**
   - 오케스트레이터: `PORT=3001 pnpm --filter orchestrator dev`
   - 워커: `pnpm --filter worker dev`
   - 웹: `pnpm --filter web dev`

5. **환경 변수 주의점**
   - 로컬에서도 Vercel Blob 토큰이 필요하므로 운영용 토큰을 사용하거나 테스트용 별도 스토어를 만들어 활용.
   - `ENABLE_AUDIO_PIPELINE=true` 설정 시 ElevenLabs Webhook을 수신할 외부 URL이 필요 (예: ngrok).

6. **테스트 & 린트**

   ```bash
   pnpm lint
   pnpm test
   pnpm --filter @quizdude/shared test
   pnpm --filter @quizdude/db typecheck
   ```

7. **빌드 검증**

   ```bash
   pnpm build
   ```

   위 명령은 모든 패키지의 `build` 스크립트를 실행하여 배포 전 빌드 실패를 조기에 발견.

8. **도구 활용**
   - Prisma Studio: `pnpm --filter @quizdude/db exec prisma studio`
   - Blob 파일 확인: `curl -H "Authorization: Bearer <TOKEN>" <VERCEL_BLOB_READ_WRITE_URL>`
   - ngrok: `ngrok http 3001` → ElevenLabs Webhook URL로 등록.

---

## L. 로컬에서 기능 점검 시나리오

1. **PDF 업로드 → 요약/퀴즈 생성**
   - 웹 앱 접속(`http://localhost:3000`) → 샘플 PDF 업로드.
   - 오케스트레이터 로그에서 업로드 URL 발급, DB 저장 로그 확인.
   - 워커 로그에서 Gemini File API 업로드 → Structured Output 저장 확인.
   - 웹 대시보드에서 요약/퀴즈 결과가 렌더링되는지 검증.

2. **오디오 파이프라인 (선택)**
   - `ENABLE_AUDIO_PIPELINE=true`, ElevenLabs 키/시크릿 입력.
   - ngrok 등으로 오케스트레이터 `/api/webhooks/elevenlabs` 경로를 외부에 노출.
   - ElevenLabs 대시보드에서 Webhook URL을 `https://<ngrok>.ngrok.io/api/webhooks/elevenlabs`로 설정.
   - 오디오 포함 강의 업로드 → 워커 로그와 ElevenLabs 대시보드에서 상태 확인.

3. **에러 핸들링**
   - Prisma DB를 중지하거나 Blob 토큰을 잘못 입력해 오류 발생 시, 워커가 `NEEDS_ATTENTION`으로 마킹되는지 확인.
   - 로컬에서 `pnpm --filter worker dev` 실행 중 예외 발생 시 스택트레이스를 캡처하여 Sentry 등으로 전송하는 로직이 있는지 검토.

4. **Cleanup 스크립트 검증**
   - `pnpm --filter worker run cleanup`을 수동 실행.
   - 만료된 잡 상태 업데이트, Blob 핸들 정리 로그 확인.

---

## M. 토큰/비밀 키 회전 절차

1. **Vercel Blob 토큰 재발급**
   - Vercel Blob → Tokens → Revoke & Regenerate.
   - 재발급 즉시 Vercel(web/orchestrator)과 Render(worker/cron) 환경 변수 업데이트.
   - 웹/오케스트레이터를 새로 배포하여 환경 변수가 반영되었는지 확인.

2. **Gemini API 키 회전**
   - Google Cloud Console → API & Services → Credentials → 키 재발급.
   - Render/Vercel에 새 키 입력 후 각각 재배포.
   - 워커에서 모델 목록 검증이 성공하는지 로그로 확인.

3. **데이터베이스 비밀번호 변경**
   - 데이터베이스 관리자에서 비밀번호 변경 → `DATABASE_URL` 업데이트 → 모든 서비스 재시작.
   - Prisma 마이그레이션/쿼리도 새 비밀번호로 수행되는지 점검.

4. **ElevenLabs Webhook Secret 회전**
   - ElevenLabs → Webhooks → Secret 재생성 → 오케스트레이터/워커 모두에 반영.

---

## N. 자주 사용하는 명령어 치트시트

```bash
# 린트 전체 실행
pnpm lint

# 단일 앱 개발 서버
pnpm --filter web dev
pnpm --filter orchestrator dev
pnpm --filter worker dev

# 전체 빌드
pnpm build

# 워커 큐 정리
pnpm --filter worker run cleanup

# Prisma 관련
pnpm --filter @quizdude/db generate
pnpm --filter @quizdude/db migrate
pnpm --filter @quizdude/db exec prisma studio
```

---

## O. 문제 해결 가이드

| 증상                      | 점검 포인트                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| 업로드가 즉시 실패        | Blob 토큰/URL 오타 여부, Vercel 환경 변수 반영 여부, 브라우저 콘솔 오류    |
| 워커가 잡을 처리하지 않음 | Render 워커 로그 확인, `DATABASE_URL` 권한, `JOB_POLL_INTERVAL_MS` 값 확인 |
| Gemini 모델 미검증 오류   | `GEMINI_MODEL_ID` 철자, Google Cloud 콘솔에서 모델 접근 권한 여부          |
| 오케스트레이터 500 오류   | Vercel Function Logs 확인, Prisma 마이그레이션 누락 여부                   |
| Cron Job 실패             | Render Cron Logs → 필요 시 수동 `Run Now`로 재시도                         |
| ElevenLabs Webhook 403    | `ELEVENLABS_WEBHOOK_SECRET` 불일치, ngrok URL 변경 여부                    |

---

### 마무리 체크 (A → Z)

A. 계정/권한 확보 → B. 코드/Pnpm 준비 → C. Blob 스토리지 생성 → D. PostgreSQL 마련 → E. Vercel 웹 프로젝트 생성 → F. Vercel 오케스트레이터 프로젝트 생성 → G. Render 워커 배포 → H. Render Cron Job 설정 → I. 초기 배포 후 헬스체크 → J. 모니터링 경보 설정 → K. 로컬 환경에서 종단 간 테스트 → L. 운영 중 정기 점검 → M. 토큰/비밀 회전 계획 수립.

위 순서를 따라 진행하면 Quizdude 서비스를 안정적으로 배포하고 유지할 수 있습니다. 추가로 필요한 항목은 `docs/runbook.md`와 `docs/architecture.md`를 참조해 계속 업데이트하세요.
