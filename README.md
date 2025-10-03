# Quizdude 파이프라인 가이드

## 프로젝트 개요

Quizdude는 강의 자료(PDF)와 선택적인 오디오·비디오 입력으로부터 구조화된 요약 JSON과 4지선다형 퀴즈 세트를 자동 생성하는 파이프라인입니다. Next.js 15(App Router) 기반 웹/오케스트레이터와 Render Background Worker, Prisma + PostgreSQL, Google Gemini API(Structured Output), Vercel Blob Storage를 조합해 대용량 업로드와 비동기 작업을 안전하게 처리합니다.

## 기술 스택 및 폴더 구조

- **apps/web**: 강의 업로드·모니터링 UI(App Router, SWR).
- **apps/orchestrator**: 업로드 URL 발급, 잡 생성 등 REST API(Next.js Route Handler).
- **apps/worker**: Render용 백그라운드 워커. Gemini File API 업로드·요약·퀴즈 생성 담당.
- **packages/shared**: Zod/JSON Schema, Gemini 클라이언트, Blob 유틸, Feature Flag 등 공용 모듈.
- **packages/db**: Prisma 스키마 및 클라이언트.
- **docs**: 아키텍처, 결정 기록, 피처 플래그 가이드.

Node.js 20 이상 + pnpm 8.x(Corepack 권장)를 기본 런타임으로 사용합니다.

## 사전 준비

1. **Node.js**: v20 LTS 이상 설치. `corepack enable`로 pnpm 사용 권장.
2. **Database**: PostgreSQL 인스턴스. 로컬 개발 시 Docker 등으로 `postgresql://USER:PASSWORD@HOST:PORT/quizdude` 형태의 커넥션 준비.
3. **Google Gemini API**: File API & Models API가 활성화된 API 키.
4. **Vercel Blob**: 스토어 생성 시 자동으로 주입되는 `BLOB_READ_WRITE_TOKEN`(서버용)과, 클라이언트 업로드 콜백을 위한 `VERCEL_BLOB_CALLBACK_URL`(선택).
5. _(선택)_ **ElevenLabs Scribe v1**: 오디오/비디오 전사 기능 사용 시 API Key 및 Webhook Secret.

## 환경 변수 설정

루트에 `.env`를 생성하고 `.env.example`를 참고해 채워 넣습니다. 주요 항목은 아래와 같습니다.

| 변수                                              | 설명                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                    | Prisma가 사용하는 PostgreSQL 연결 문자열                                                       |
| `GEMINI_API_KEY`                                  | Gemini API 키                                                                                  |
| `GEMINI_MODEL_ID`                                 | 기본 모델 문자열. 기본값 `gemini-flash-latest`이며 워커가 Models API로 존재 여부를 검증합니다. |
| `ENABLE_AUDIO_PIPELINE`                           | 오디오/비디오 전사 파이프라인 전역 플래그 (`true`/`false`).                                    |
| `BLOB_READ_WRITE_TOKEN`                           | Vercel Blob 서버용 RW 토큰 (스토어 생성 시 자동 주입)                                          |
| `VERCEL_BLOB_CALLBACK_URL`                        | (선택) Blob 업로드 완료 콜백(ngrok 등) URL                                                     |
| `NEXT_PUBLIC_ORCHESTRATOR_URL`                    | 웹 앱에서 오케스트레이터 API를 호출할 기본 URL (예: `http://localhost:3001`)                   |
| `NEXT_PUBLIC_APP_URL`                             | 웹 애플리케이션 기본 URL                                                                       |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET` | 오디오 파이프라인 사용 시 필요                                                                 |

> **TIP**: 로컬 개발 시 `NEXT_PUBLIC_ORCHESTRATOR_URL`은 웹 앱이 접근 가능한 외부 주소여야 합니다. 동일 머신에서 실행할 경우 `http://localhost:3001`로 설정하고 오케스트레이터를 3001 포트에서 띄우면 됩니다.

## 의존성 설치

```bash
corepack pnpm install
```

## 데이터베이스 마이그레이션

```bash
pnpm --filter @quizdude/db generate
pnpm --filter @quizdude/db migrate
```

`migrate` 명령은 개발용 마이그레이션(`prisma migrate dev`)을 실행합니다.

## 로컬 개발 실행 순서

1. **오케스트레이터 API (포트 3001 권장)**

   ```bash
   PORT=3001 pnpm --filter orchestrator dev
   ```

2. **백그라운드 워커**

   ```bash
   pnpm --filter worker dev
   ```

   워커는 일정 간격으로 JobRun 테이블을 폴링하며 Gemini File API를 통해 PDF/전사 파일을 업로드한 뒤 structured output을 생성합니다. 모델이 존재하지 않을 경우 `GeminiModelUnavailableError`로 잡을 `NEEDS_ATTENTION` 상태로 전환합니다.

3. **웹 애플리케이션 (포트 3000)**
   ```bash
   pnpm --filter web dev
   ```
   `NEXT_PUBLIC_ORCHESTRATOR_URL`이 오케스트레이터 주소로 설정돼 있어야 업로드 및 상태 조회가 정상 작동합니다.

각 프로세스는 별도 터미널에서 병렬 실행합니다. 오디오 파이프라인 사용 시 `ENABLE_AUDIO_PIPELINE=true`로 설정하고 전사 요청 후 ElevenLabs Webhook이 텍스트를 돌려줘야 요약이 이어집니다.

## 주요 기능 흐름

1. **업로드 대시보드** (`/dashboard`)
   - PDF/오디오/비디오/전사 파일 드래그&드롭 업로드.
   - 업로드 성공 시 자동으로 Summary Job이 생성되며, 오디오 파이프라인이 활성화된 경우 Transcription Job도 생성됩니다.
2. **강의 상세 페이지** (`/lectures/:lectureId`)
   - Gemini가 반환한 요약 데이터와 20문항 퀴즈를 실시간으로 확인/재실행.
3. **관리자 페이지** (`/admin/jobs`)
   - 최근 요약/퀴즈 구조화 JSON, 원본 Gemini 응답, 입력 파일 메타데이터, JobRun 이력 확인.

## 프로덕션 배포 가이드 (비전공자용 상세 안내)

> **TIP**: 아래 순서는 *처음 배포할 때 반드시 필요한 최소 단계*입니다. 세부 스크린샷과 추가 체크리스트는 `docs/runbook.md`에서 더 자세히 확인할 수 있습니다.

### 0. 사전 준비물

- GitHub 계정과 이 저장소에 대한 접근 권한.
- Vercel 계정(무료 플랜 가능). 팀 사용 시 팀 권한 확인.
- Render 계정(Background Worker + Cron Job 사용 가능 플랜).
- Google Gemini API 키(https://makersuite.google.com/app/apikey 에서 발급).
- PostgreSQL 인스턴스(예: Render PostgreSQL, Neon, Supabase). 접속 URL을 미리 복사하세요.
- (선택) ElevenLabs API 키 & Webhook Secret — 오디오 파이프라인을 쓸 때만 필요합니다.

### 1. Vercel Blob 저장소 생성

1. https://vercel.com 에 로그인 → 왼쪽 메뉴 **Storage → Blob** 클릭.
2. **Create Store** 버튼 → 이름은 `quizdude-artifacts` 등 직관적인 값으로 입력 → 사용자와 가까운 리전을 선택합니다.
3. 스토어가 생성되면 해당 프로젝트의 **Settings → Environment Variables**에 `BLOB_READ_WRITE_TOKEN` 항목이 자동으로 추가됩니다.
4. 클라이언트 직접 업로드를 지원하고 콜백이 필요하다면 나중에 `VERCEL_BLOB_CALLBACK_URL`을 설정할 수 있도록 ngrok 등 외부 URL을 준비해 둡니다.

### 2. Vercel에 웹 애플리케이션(`apps/web`) 배포하기

1. Vercel 대시보드에서 **Add New... → Project** 선택.
2. GitHub 연동이 처음이라면 `Continue with GitHub`을 눌러 저장소 접근을 허용합니다.
3. 프로젝트 목록에서 `quizdude` 저장소를 선택.
4. **Framework Preset**은 _Next.js_ (자동 선택) 상태를 유지합니다.
5. **Root Directory** 입력창에 `apps/web`을 입력합니다.
6. **Build & Output Settings**에서 다음 값을 지정합니다.
   - Install Command: `pnpm install --frozen-lockfile`
   - Build Command: `pnpm run build`
   - Output Directory: `.vercel/output`
7. **Environment Variables** 섹션에서 아래 표를 참고해 값을 추가합니다 (Production/Preview 모두 동일하게 설정).

| 이름                           | 예시값                                     | 설명                                               |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`          | `https://quizdude-web.vercel.app`          | 웹 도메인. 커스텀 도메인 연결 후 해당 주소로 교체. |
| `NEXT_PUBLIC_ORCHESTRATOR_URL` | `https://quizdude-orchestrator.vercel.app` | 오케스트레이터 URL (다음 단계에서 생성).           |
| `BLOB_READ_WRITE_TOKEN`        | 자동 생성 (Vercel 대시보드 확인)           | Blob 서버 토큰. 프로젝트 생성 시 자동 주입됨.      |
| `VERCEL_BLOB_CALLBACK_URL`     | (선택) `https://<ngrok>.ngrok.io/api/...`  | Blob 업로드 콜백이 필요할 때만 입력.               |

8. **Deploy** 버튼을 누르면 빌드가 시작됩니다. 빌드가 끝나면 `Visit`을 눌러 페이지가 정상적으로 열리는지 확인하세요.
9. 배포 후 **Settings → Observability**로 이동해 Vercel Observability를 켜고, Slack/이메일 알림을 등록해 둡니다.

### 3. Vercel에 오케스트레이터(`apps/orchestrator`) 배포하기

1. 다시 **Add New... → Project** → 동일한 `quizdude` 저장소 선택.
2. 이번에는 **Root Directory**에 `apps/orchestrator`를 입력합니다.
3. Build 설정은 2단계와 동일합니다 (`pnpm install --frozen-lockfile`, `pnpm run build`, `.vercel/output`).
4. Environment Variables를 아래 표대로 입력합니다.

| 이름                           | 예시값                                      | 설명                                                 |
| ------------------------------ | ------------------------------------------- | ---------------------------------------------------- |
| `DATABASE_URL`                 | `postgresql://user:pass@host:5432/quizdude` | 운영용 PostgreSQL 연결 문자열.                       |
| `GEMINI_API_KEY`               | `sk-...`                                    | Google Gemini API 키.                                |
| `GEMINI_MODEL_ID`              | `gemini-flash-latest`                       | 모델 이름. 필요 시 Google 콘솔에서 최신 모델로 교체. |
| `BLOB_READ_WRITE_TOKEN`        | 자동 생성 (Vercel 대시보드 확인)            | Blob 서버 토큰. 웹 프로젝트와 동일 값 사용.          |
| `VERCEL_BLOB_CALLBACK_URL`     | (선택) `https://<ngrok>.ngrok.io/api/...`   | Blob 업로드 콜백 URL. 필요 시에만 설정.              |
| `ENABLE_AUDIO_PIPELINE`        | `false` (또는 `true`)                       | 오디오 기능이 필요하면 `true`.                       |
| `NEXT_PUBLIC_APP_URL`          | `https://quizdude-web.vercel.app`           | 웹 앱 기본 URL.                                      |
| `NEXT_PUBLIC_ORCHESTRATOR_URL` | `https://quizdude-orchestrator.vercel.app`  | 자기 자신 URL.                                       |
| `ELEVENLABS_API_KEY`           | (선택)                                      | 오디오 파이프라인 사용 시 입력.                      |
| `ELEVENLABS_WEBHOOK_SECRET`    | (선택)                                      | 오디오 파이프라인 사용 시 입력.                      |

5. **Deploy**를 눌러 배포합니다.
6. 배포가 완료되면 **Settings → Functions**에서 실행 지역을 DB가 위치한 지역과 가깝게 조정하면 성능이 향상됩니다.
7. **Settings → Observability**에서 웹 앱과 동일하게 로그/에러 알림을 켭니다.

### 4. Render에서 백그라운드 워커(`apps/worker`) 배포하기

1. https://render.com 에 로그인 → 대시보드에서 **New + → Background Worker** 선택.
2. GitHub 연동 후 `quizdude` 저장소를 선택합니다.
3. **Root Directory**를 `apps/worker`로 설정합니다.
4. **Build Command**: 아래 두 줄을 그대로 입력합니다.
   ```bash
   pnpm install --frozen-lockfile
   pnpm run build
   ```
5. **Start Command**: `pnpm run start`
6. Environment Variables는 오케스트레이터와 동일한 값 + 아래 항목을 추가로 넣습니다.
   - `JOB_POLL_INTERVAL_MS` (선택, 기본 5000)
   - `JOB_MAX_ATTEMPTS` (선택, 기본 3)
7. Deploy를 누르고, Logs에서 `No job found, sleeping` 등의 메시지가 보이면 정상입니다.
8. Render 서비스 설정에서 **Auto Deploy**를 `main` 브랜치로 맞춰두면 GitHub에 머지를 push할 때마다 자동 배포됩니다.

### 5. Render Cron Job으로 큐 정리 자동화하기

1. Render 대시보드 → **New + → Cron Job**.
2. 동일한 저장소를 선택하고 **Root Directory**는 `apps/worker`로 설정합니다.
3. Build Command는 워커와 동일하게 설정합니다 (`pnpm install --frozen-lockfile && pnpm run build`).
4. **Command**에는 `pnpm run cleanup`을 입력합니다. 이 명령은 `dist/scripts/cleanup.js`를 실행해 큐를 정리합니다.
5. **Schedule**은 `*/10 * * * *` (10분마다) 추천입니다. 초기에는 `Run Now` 버튼을 눌러 테스트 로그를 확인하세요.
6. Environment Variables는 워커와 동일하게 복사하고, 필요하면 다음 값을 추가해 동작을 조절할 수 있습니다.
   - `JOB_PROCESSING_TIMEOUT_MINUTES` (기본 15)
   - `JOB_CLEANUP_MAX_ATTEMPTS` (기본 5)
   - `JOB_RESCHEDULE_DELAY_SECONDS` (기본 60)

### 6. 데이터베이스 마이그레이션 적용하기

1. 로컬 PC에서 `.env`에 운영용 `DATABASE_URL`을 임시로 넣습니다.
2. 터미널에서 다음 명령을 실행합니다.
   ```bash
   pnpm --filter @quizdude/db generate
   pnpm --filter @quizdude/db migrate
   ```
   위 명령은 Prisma 스키마를 데이터베이스에 반영합니다.
3. 성공 후 `.env` 파일에서 운영 DB URL을 제거하거나 안전한 위치에만 저장하세요.

### 7. 배포 후 기능 점검

1. 웹 URL(예: `https://quizdude-web.vercel.app`) 접속 → _Upload Lecture_ 화면에서 1MB 이하 PDF 업로드.
2. 업로드 후 `/admin/jobs` 페이지에서 Summarize/Quiz 잡이 생성됐는지 확인.
3. Render 워커 로그에서 Gemini 업로드 로그와 성공 메시지를 확인.
4. 필요하면 Render Cron Job에서 `Run Now`를 눌러 큐 정리 스크립트가 정상적으로 실행되는지 확인하세요.

### 8. 모니터링과 알림 연결

- **Vercel Observability**: 두 프로젝트 각각의 Settings → Observability에서 Slack/Webhook 알림 구성.
- **Render Alerts**: 워커 서비스에서 _Add Alert_ → `Event Type: Deploy Failed`, `Service Unhealthy` 등을 Slack/이메일로 알리도록 설정.
- **Gemini 할당량**: Google Cloud 콘솔에서 일일/월간 예산 알림을 설정.
- **PostgreSQL**: 제공 업체의 모니터링 대시보드에서 CPU, 디스크, 연결 수 알림을 활성화.

위 절차만 완료하면 운영 환경이 구축됩니다. 더 심화된 재해 복구, 운영 체크리스트는 `docs/runbook.md`를 참고하세요.

## 문제 해결

- **잡이 `NEEDS_ATTENTION` 상태로 멈춘 경우**: Worker 로그에서 `GeminiModelUnavailableError` 또는 File API 업로드 오류를 확인하고, Blob 토큰/모델 문자열을 재검토.
- **업로드가 실패하는 경우**: `/dashboard`에서 표시되는 상태 메시지를 확인하고, Blob 토큰 권한 및 파일 크기가 20MB/50MB 제한을 넘지 않는지 확인.
- **오디오 파이프라인 미작동**: 전역 플래그(`ENABLE_AUDIO_PIPELINE`)와 강의 생성 시 설정, ElevenLabs Webhook 유효성, Render Worker에서 FFmpeg 설치 여부를 확인.

## 추가 문서

- `docs/architecture.md`: 전체 아키텍처 개요
- `docs/decisions.md`: 기술 선택 근거
- `docs/feature-flags.md`: 플래그 전략
- `guideline.md`: 요구사항 상세

필수 가이드라인을 준수하며 Phase 4 ~ 5 기능이 완료되었습니다. 이후 Phase 6(배포/운영)과 Phase 7(QA/컴플라이언스) 작업을 진행해 주세요.
