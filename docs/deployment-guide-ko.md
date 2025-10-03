# Quizdude 배포 및 로컬 운영 종합 가이드 (Vercel + Render, 2025 기준)

> 이 문서는 2025년 최신 Vercel Blob 동작 방식(`BLOB_READ_WRITE_TOKEN` 자동 생성, `handleUpload()` 기반 에페메럴 토큰 발급 등)을 반영해 Quizdude 모노레포를 프로덕션에 배포하고 로컬에서 개발·테스트하는 전 과정을 설명합니다. GitHub 저장소에 코드가 올라가 있는 상태를 전제로 합니다.

## 목차

- [A. 사전 준비 체크리스트](#a-사전-준비-체크리스트)
- [B. 코드베이스와 환경 변수 관리](#b-코드베이스와-환경-변수-관리)
- [C. Vercel Blob 스토리지 최신 플로우](#c-vercel-blob-스토리지-최신-플로우)
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
   - GitHub 저장소 `quizdude` 접근 권한
   - Vercel 조직/프로젝트 권한 (Blob, Edge Functions 사용 가능)
   - Render 계정 (Background Worker, Cron Job 플랜)
   - Google Cloud Console에서 Gemini API 사용 설정 및 과금 수단
   - (선택) ElevenLabs Scribe v1 계정 및 Webhook 권한

2. **로컬 환경**
   - Node.js 20 LTS 이상 (`node -v` 확인)
   - `corepack enable` 후 pnpm 8.x 사용
   - Docker Desktop 또는 PostgreSQL 실행 수단

3. **보안 및 비밀 관리**
   - 1Password/Bitwarden 등 시크릿 보관소 준비
   - GitHub 브랜치 보호, Secret Scanning, Dependabot 활성화

4. **문서/지식**
   - `.env.example` 최신화 확인
   - `docs/architecture.md`, `docs/runbook.md` 미리 숙지

---

## B. 코드베이스와 환경 변수 관리

1. **저장소 클론 및 의존성 설치**

   ```bash
   git clone git@github.com:<ORG>/quizdude.git
   cd quizdude
   corepack enable
   pnpm install
   ```

2. **환경 변수 구조**
   - 루트 `.env`: 로컬 개발 기본값 보관 (커밋 금지)
   - `.env.example`: 필수 항목 목록, 새 변수 추가 시 즉시 갱신
   - 배포 환경: Vercel/Render 대시보드에 직접 입력하고 `vercel env pull`로 로컬 동기화

3. **핵심 환경 변수 요약**

   | 변수                           | 설명                                                   | 비고                                                     |
   | ------------------------------ | ------------------------------------------------------ | -------------------------------------------------------- |
   | `DATABASE_URL`                 | Prisma/PostgreSQL 연결 문자열                          | Render, orchestrator, worker에서 동일 사용               |
   | `GEMINI_API_KEY`               | Gemini API Key                                         | Google Cloud Console → Credentials                       |
   | `GEMINI_MODEL_ID`              | 기본 `gemini-flash-latest`                             | 모델 교체 시 전 서비스 동시 업데이트                     |
   | `ENABLE_AUDIO_PIPELINE`        | 오디오 파이프라인 전역 플래그 (`true`/`false`)         | 오디오 기능 비활성화 시 `false` 유지                     |
   | `BLOB_READ_WRITE_TOKEN`        | Vercel Blob 서버용 RW 토큰 (스토어 생성 시 자동 주입)  | 동일 Vercel 프로젝트면 SDK가 자동 사용                   |
   | `NEXT_PUBLIC_APP_URL`          | 프런트엔드 절대 URL                                    | Preview/Production 분리 설정 권장                        |
   | `NEXT_PUBLIC_ORCHESTRATOR_URL` | 오케스트레이터 절대 URL                                | 웹에서 API 호출 및 링크 생성에 사용                      |
   | `ELEVENLABS_API_KEY`           | (선택) ElevenLabs API 키                               | 오디오 파이프라인 활성화 시 필수                         |
   | `ELEVENLABS_WEBHOOK_SECRET`    | (선택) ElevenLabs Webhook 서명 검증 문자열             | ngrok 등 외부 URL 사용 시 반드시 설정                    |
   | `VERCEL_BLOB_CALLBACK_URL`     | (선택) Blob 업로드 완료 콜백 URL (로컬/ngrok 테스트용) | 클라이언트 업로드 시 Vercel ↔ 워커 간 콜백 필요 시 사용 |

4. **환경 변수 동기화 전략**
   - Vercel: Environment Variable Group을 만들어 `BLOB_READ_WRITE_TOKEN` 등 공통 값을 공유
   - Render: 서비스별 Environment 탭에서 `.env` 파일 업로드 기능을 사용하면 일괄 반영 가능
   - 로컬: `vercel env pull .env.vercel.local` → `.env`에 필요한 값 복사 후 파일 삭제

---

## C. Vercel Blob 스토리지 최신 플로우

> 2024년 이후 Vercel Blob은 UI의 "Generate Token" 버튼 없이 **스토어 생성 시 자동으로 `BLOB_READ_WRITE_TOKEN`을 프로젝트 환경 변수에 추가**합니다. 클라이언트 업로드용 토큰은 서버 라우트에서 `handleUpload()`가 매 요청마다 발급합니다.

1. **스토어 생성 절차**
   1. Vercel 대시보드 → 대상 Project → **Storage** → **Connect Database** → **Blob** 선택
   2. 스토어 이름과 리전을 선택하고 생성 (예: `quizdude-artifacts`, `sin1`)
   3. 생성 직후 Project Settings → Environment Variables에서 `BLOB_READ_WRITE_TOKEN`이 자동 추가된 것을 확인

2. **환경 변수 확인/동기화**
   - Production/Preview/Development 환경 각각에 토큰이 생성되므로 필요한 환경만 활성화
   - 로컬 개발 시 아래 명령으로 토큰을 `.env.local` 계열 파일에 가져옵니다.

     ```bash
     npx vercel env pull .env.vercel.local
     ```

   - 필요한 값만 `.env`에 옮겨 적고, 임시 파일은 즉시 삭제합니다.

3. **서버 업로드(Next.js Route Handler 등)**

   ```ts
   import { put } from '@vercel/blob';

   export async function POST(req: Request) {
     const form = await req.formData();
     const file = form.get('file') as File;

     const blob = await put(file.name, file, {
       access: 'public',
       addRandomSuffix: true,
       // token 옵션을 지정하지 않으면 Vercel 런타임이 자동으로 BLOB_READ_WRITE_TOKEN 사용
     });

     return Response.json(blob);
   }
   ```

   - 동일 Vercel 프로젝트/환경에서 실행되는 서버 코드라면 `token` 옵션을 지정할 필요가 없습니다.
   - 다른 프로젝트에서 Blob에 접근해야 한다면 `token: process.env.BLOB_READ_WRITE_TOKEN`를 명시하세요.

4. **클라이언트 직접 업로드 (4.5MB 초과, 대용량 전송)**
   - Vercel Blob SDK의 `handleUpload()`가 각 요청마다 짧은 수명의 에페메럴 토큰을 생성합니다.

   **클라이언트 컴포넌트 예시**

   ```ts
   'use client';

   import { upload } from '@vercel/blob/client';
   import { useState } from 'react';

   export function LectureUploader() {
     const [progress, setProgress] = useState(0);

     async function onFileSelect(file: File) {
       const blob = await upload(file.name, file, {
         access: 'public',
         handleUploadUrl: '/api/uploads/blob',
         onUploadProgress: ({ uploadedBytes, totalBytes }) => {
           setProgress(Math.round((uploadedBytes / totalBytes) * 100));
         },
       });

       // blob.url, blob.pathname 등을 API로 전송
     }

     // ...UI 생략
   }
   ```

   **서버 라우트 예시 (`apps/orchestrator`)**

   ```ts
   import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
   import { NextResponse } from 'next/server';

   export async function POST(req: Request) {
     const body = (await req.json()) as HandleUploadBody;

     const json = await handleUpload({
       request: req,
       body,
       onBeforeGenerateToken: async (pathname) => ({
         allowedContentTypes: ['application/pdf', 'audio/mpeg', 'video/mp4'],
         maximumSizeInBytes: 1024 * 1024 * 200, // 200MB 제한 예시
         addRandomSuffix: true,
         tokenPayload: JSON.stringify({ pathname }),
       }),
       onUploadCompleted: async ({ blob, tokenPayload }) => {
         // 업로드 후 DB 기록, 감사 로그 등 후처리
       },
     });

     return NextResponse.json(json);
   }
   ```

   - `onBeforeGenerateToken`에서 인증/인가 검사를 수행하여 무단 업로드를 막습니다 (예: 세션 체크).
   - 로컬에서 Blob 콜백을 테스트할 때는 ngrok 등으로 외부 URL을 확보하고 `VERCEL_BLOB_CALLBACK_URL`을 지정합니다.

5. **CLI 사용**

   ```bash
   # blob 목록 조회
   npx vercel blob ls

   # 로컬 파일 업로드 (환경 변수 사용)
   npx vercel blob put sample.pdf --add-random-suffix

   # 다른 프로젝트 토큰 사용
   npx vercel blob put sample.pdf --rw-token "$BLOB_READ_WRITE_TOKEN"
   ```

6. **리전 및 데이터 레지던시**
   - 사용자 위치/규제를 고려해 스토어 리전을 선택 (예: 한국 사용자 위주 → `sin1` 또는 `tyo1`)
   - 리전 변경은 현재 불가하므로 최초 생성 시 신중히 결정하세요.

7. **리스크 관리**
   - `handleUpload` 라우트에 권한 확인을 넣지 않으면 익명 업로드가 가능해집니다.
   - 파일 크기/콘텐츠 타입 제한을 반드시 설정하세요.
   - 대용량 업로드만 클라이언트 → Blob 으로 보내고, 일반 파일은 서버 업로드로 통일하면 감사/감시가 쉬워집니다.

---

## D. PostgreSQL 데이터베이스 준비

1. **Render**
   - Render 대시보드 → **New + → PostgreSQL**
   - 데이터베이스 이름, 플랜 선택 (프로덕션은 유료 플랜 권장)
   - 생성 후 **Connections → External Database URL**을 복사하여 `DATABASE_URL`로 사용
   - 백업 보존 기간 7일 이상 설정

2. **대안 서비스**
   - Neon/Supabase/Railway 등 사용 가능 (`sslmode=require` 등 옵션 고려)

3. **Prisma 스키마 적용**

   ```bash
   pnpm --filter @quizdude/db generate
   pnpm --filter @quizdude/db migrate
   ```

   - 운영 DB에 적용할 때는 `.env`의 `DATABASE_URL`을 임시로 교체 후 복원하세요.

---

## E. Vercel 프로젝트 구성 (apps/web)

1. Vercel 대시보드 → **Add New → Project** → GitHub 저장소 선택
2. Vercel이 Next.js를 자동 인식
3. **Root Directory**를 `apps/web`으로 설정
4. **Build & Output Settings**
   - Install Command: `pnpm install --frozen-lockfile`
   - Build Command: `pnpm run build`
   - Output Directory: `.vercel/output`
5. **Environment Variables** (Production/Preview 동일 입력 권장)

   | Key                            | 예시 값                                    | 설명                             |
   | ------------------------------ | ------------------------------------------ | -------------------------------- |
   | `NEXT_PUBLIC_APP_URL`          | `https://quizdude-web.vercel.app`          | Vercel 도메인 또는 커스텀 도메인 |
   | `NEXT_PUBLIC_ORCHESTRATOR_URL` | `https://quizdude-orchestrator.vercel.app` | API 호출 대상                    |
   | `BLOB_READ_WRITE_TOKEN`        | Vercel Blob 자동 생성 값                   | 서버 전용, SDK가 자동 사용       |

   #### .env 템플릿 (Bulk Edit / CLI 공용)

   ```bash
   # apps/web - Production
   NEXT_PUBLIC_APP_URL=https://quizdude-web.vercel.app
   NEXT_PUBLIC_ORCHESTRATOR_URL=https://quizdude-orchestrator.vercel.app
   BLOB_READ_WRITE_TOKEN=rw-prod-xxxxxxxx
   ```

   - 위 내용을 `vercel.web.prod.env` 등 임시 파일에 저장하고 Bulk Edit로 붙여 넣을 수 있습니다.
   - CLI 사용 시 `printf "value" | npx vercel env add KEY production` 형태로 자동화 스크립트를 구성하세요.

6. Environment Variable Group으로 `BLOB_READ_WRITE_TOKEN`을 공유하면 orchestrator 프로젝트에도 쉽게 재사용할 수 있습니다.
7. Git Branch: `main` 유지 (Preview = PR)
8. 초기 Deploy 후 **Settings → Functions**에서 Region을 DB와 가까운 리전으로 조정
9. **Settings → Observability**에서 로그/에러 알림 연결 (Slack, 이메일 등)

---

## F. Vercel 프로젝트 구성 (apps/orchestrator)

1. 동일 저장소를 다시 선택해 새 Project 생성
2. **Root Directory**를 `apps/orchestrator`로 지정
3. Build/Output 설정은 `apps/web`과 동일
4. **Environment Variables**

   | Key                            | 설명                              |
   | ------------------------------ | --------------------------------- |
   | `DATABASE_URL`                 | 운영 PostgreSQL 연결 문자열       |
   | `GEMINI_API_KEY`               | Gemini API 키                     |
   | `GEMINI_MODEL_ID`              | 기본값 `gemini-flash-latest`      |
   | `BLOB_READ_WRITE_TOKEN`        | Blob 서버 토큰 (자동 생성)        |
   | `ENABLE_AUDIO_PIPELINE`        | 오디오 파이프라인 사용 여부       |
   | `NEXT_PUBLIC_APP_URL`          | 프런트엔드 절대 URL (링크 생성용) |
   | `NEXT_PUBLIC_ORCHESTRATOR_URL` | 자기 자신 도메인                  |
   | `ELEVENLABS_API_KEY`           | (선택) 오디오 파이프라인용        |
   | `ELEVENLABS_WEBHOOK_SECRET`    | (선택) Webhook 서명 검증용        |
   | `VERCEL_BLOB_CALLBACK_URL`     | (선택) ngrok 등 외부 콜백 URL     |

   #### .env 템플릿 (Production)

   ```bash
   # apps/orchestrator - Production
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/quizdude
   GEMINI_API_KEY=your-gemini-key
   GEMINI_MODEL_ID=gemini-flash-latest
   BLOB_READ_WRITE_TOKEN=rw-prod-xxxxxxxx
   ENABLE_AUDIO_PIPELINE=false
   NEXT_PUBLIC_APP_URL=https://quizdude-web.vercel.app
   NEXT_PUBLIC_ORCHESTRATOR_URL=https://quizdude-orchestrator.vercel.app
   ELEVENLABS_API_KEY=
   ELEVENLABS_WEBHOOK_SECRET=
   VERCEL_BLOB_CALLBACK_URL=
   ```

   - Production/Preview/Development 별로 파일을 분리해 관리하면 실수로 값이 섞이는 것을 막을 수 있습니다.

5. 배포 후 **Settings → Logs**에서 Route Handler 로그 확인
6. **Settings → Webhooks**로 GitHub Actions와 연결할 수 있습니다.
7. **Access Control**에서 Production 배포 권한을 제한하세요.
8. `handleUpload` 라우트에 인증 로직이 있는지 점검합니다.

---

## G. Render 백그라운드 워커 배포 (apps/worker)

1. Render 대시보드 → **New + → Background Worker**
2. Git Provider에서 `quizdude` 저장소 선택
3. 런타임은 Node로 자동 인식
4. **Root Directory**: `apps/worker`
5. **Build Command**

   ```bash
   pnpm install --frozen-lockfile
   pnpm run build
   ```

6. **Start Command**

   ```bash
   pnpm run start
   ```

7. **Instance Type**: Starter로 시작 → 필요 시 상향 조정
8. **Environment Variables**
   - `DATABASE_URL`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL_ID`
   - `BLOB_READ_WRITE_TOKEN`
   - `ENABLE_AUDIO_PIPELINE`
   - `ELEVENLABS_API_KEY` (선택)
   - `ELEVENLABS_WEBHOOK_SECRET` (선택)
   - `JOB_POLL_INTERVAL_MS` (선택, 기본 5000)
   - `JOB_MAX_ATTEMPTS` (선택, 기본 3)

   #### .env 템플릿 (Render Worker)

   ```bash
   # apps/worker - Render Background Worker
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/quizdude
   GEMINI_API_KEY=your-gemini-key
   GEMINI_MODEL_ID=gemini-flash-latest
   BLOB_READ_WRITE_TOKEN=rw-prod-xxxxxxxx
   ENABLE_AUDIO_PIPELINE=false
   ELEVENLABS_API_KEY=
   ELEVENLABS_WEBHOOK_SECRET=
   JOB_POLL_INTERVAL_MS=5000
   JOB_MAX_ATTEMPTS=3
   ```

   - Render 대시보드 → Environment → **Add from .env file** 버튼으로 위 내용을 붙여 넣으면 일괄 등록됩니다.
   - Terraform/Render API를 사용할 때도 동일한 `.env` 파일을 입력 소스로 활용할 수 있습니다.

9. **Auto Deploy**: Branch = `main`
10. 초기 배포 후 `No pending jobs found, sleeping...` 등의 heartbeat 로그가 나오는지 확인
11. Metrics 탭에서 CPU/Memory를 모니터링하고 알림을 설정하세요.

---

## H. Render Cron Job 설정 (큐 정리)

1. Render → **New + → Cron Job**
2. 동일 저장소, **Root Directory** = `apps/worker`
3. **Build Command**

   ```bash
   pnpm install --frozen-lockfile
   pnpm run build
   ```

4. **Command**

   ```bash
   pnpm run cleanup
   ```

5. **Schedule**: `*/10 * * * *` (10분마다) 권장 → 트래픽에 따라 조절
6. 환경 변수
   - `DATABASE_URL`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL_ID`
   - `BLOB_READ_WRITE_TOKEN`
   - `ENABLE_AUDIO_PIPELINE`
   - `ELEVENLABS_API_KEY` (선택)
   - `ELEVENLABS_WEBHOOK_SECRET` (선택)
   - `JOB_PROCESSING_TIMEOUT_MINUTES` (선택, 기본 15)
   - `JOB_CLEANUP_MAX_ATTEMPTS` (선택, 기본 5)
   - `JOB_RESCHEDULE_DELAY_SECONDS` (선택, 기본 60)

   #### .env 템플릿 (Render Cron)

   ```bash
   # apps/worker - Render Cron Job
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/quizdude
   GEMINI_API_KEY=your-gemini-key
   GEMINI_MODEL_ID=gemini-flash-latest
   BLOB_READ_WRITE_TOKEN=rw-prod-xxxxxxxx
   ENABLE_AUDIO_PIPELINE=false
   ELEVENLABS_API_KEY=
   ELEVENLABS_WEBHOOK_SECRET=
   JOB_PROCESSING_TIMEOUT_MINUTES=15
   JOB_CLEANUP_MAX_ATTEMPTS=5
   JOB_RESCHEDULE_DELAY_SECONDS=60
   ```

   - Cron Job 편집 화면에서도 `.env` 파일을 그대로 붙여 넣을 수 있습니다.

7. 생성 후 **Run Now**로 1회 실행해 로그를 확인
8. 실패 시 Render Alerts로 Slack/이메일 알림을 받도록 설정하세요.

---

## I. 처음 배포 후 필수 점검 절차

1. `https://<web-project>.vercel.app` 접속 → 기본 화면 로드 확인
2. `https://<orchestrator>.vercel.app/api/health` (또는 `/api/jobs` 등 안전한 GET 엔드포인트)에서 200 응답 확인
3. 웹 UI에서 PDF 업로드 → Network 탭에서 Blob 업로드 요청이 정상 수행되는지 확인
4. Render Worker 로그에서 업로드/요약/퀴즈 생성 흐름을 확인
5. PostgreSQL 접속 (`psql`, Prisma Studio)으로 새 데이터가 생성되었는지 확인
6. Observability/Alert 채널 테스트 (Slack, 이메일)

---

## J. 운영 중 필수 모니터링 항목

- **Vercel Projects**: Build 실패, Server Error Rate(5xx), Function Duration 알림
- **Render Worker**: 재시작, 메모리 급증, Start 실패 알림
- **Gemini API**: 월간 Budgets & Alerts, 호출량 추이 모니터링
- **PostgreSQL**: 커넥션 수, 디스크 사용량, 백업 상태
- **Blob 스토어**: 저장 공간/요청량 → 필요 시 수동 정리 또는 Lifecycle 정책
- **ElevenLabs Webhook**: 실패 재시도 횟수, Unauthorized 응답 여부

---

## K. 로컬 개발/테스트 워크플로

1. **의존성 설치**

   ```bash
   corepack enable
   pnpm install
   ```

2. **로컬 PostgreSQL (Docker 예시)**

   ```bash
   docker run --name quizdude-db \
     -e POSTGRES_PASSWORD=secret \
     -e POSTGRES_USER=quizdude \
     -e POSTGRES_DB=quizdude \
     -p 5432:5432 -d postgres:16
   ```

   - `.env` → `DATABASE_URL=postgresql://quizdude:secret@localhost:5432/quizdude`

3. **Prisma 마이그레이션**

   ```bash
   pnpm --filter @quizdude/db generate
   pnpm --filter @quizdude/db migrate
   ```

4. **서비스 실행**
   - 오케스트레이터: `PORT=3001 pnpm --filter orchestrator dev`
   - 워커: `pnpm --filter worker dev`
   - 웹: `pnpm --filter web dev`

5. **Blob 환경 변수**
   - 로컬에서도 `BLOB_READ_WRITE_TOKEN`이 필요하므로 `vercel env pull`로 가져오거나 별도 테스트 스토어를 생성합니다.
   - 클라이언트 업로드 테스트 시 ngrok URL을 `VERCEL_BLOB_CALLBACK_URL`로 지정해 Blob 콜백을 수신합니다.

6. **품질 점검 명령어**

   ```bash
   pnpm lint
   pnpm test
   pnpm build
   pnpm --filter @quizdude/shared test
   pnpm --filter @quizdude/db typecheck
   ```

7. **도구 활용**
   - Prisma Studio: `pnpm --filter @quizdude/db exec prisma studio`
   - Blob CLI: `npx vercel blob ls`
   - ngrok: `ngrok http 3001` → ElevenLabs Webhook/Blob 콜백 테스트

---

## L. 로컬에서 기능 점검 시나리오

1. **PDF 업로드 → 요약/퀴즈**
   - 웹(`http://localhost:3000`)에서 PDF 업로드 → orchestrator 로그에서 업로드 URL/Job 생성 확인
   - Render(worker) 로그에서 Gemini 업로드 및 처리 완료 확인
   - 웹 대시보드에서 요약과 퀴즈 데이터가 정상 렌더링되는지 검증

2. **오디오 파이프라인 (선택)**
   - `.env`에 `ENABLE_AUDIO_PIPELINE=true` + ElevenLabs 키/시크릿 설정
   - `ngrok http 3001`로 오케스트레이터 webhook을 외부에 노출하고 ElevenLabs에 등록
   - 오디오 포함 업로드 후 워커 로그와 ElevenLabs 좌측 패널에서 진행 상황 확인

3. **에러 핸들링 테스트**
   - Prisma DB를 중지하거나 `BLOB_READ_WRITE_TOKEN`을 잘못 입력해 Worker가 어떻게 실패하는지 확인
   - 실패한 Job이 `NEEDS_ATTENTION` 상태로 전환되는지, cleanup 스크립트가 작동하는지 검증

4. **Cleanup 스크립트 검증**
   - `pnpm --filter worker run cleanup` 실행 → 만료된 Job/Blob 핸들이 정리되는지 로그 확인

---

## M. 토큰/비밀 키 회전 절차

1. **BLOB_READ_WRITE_TOKEN 재생성**
   - Vercel → Project Settings → Environment Variables → 해당 키를 제거 후 Blob 스토어 탭을 재연결하거나, `vercel env rm` 후 `vercel env add`로 새 토큰을 입력
   - 새 토큰을 Vercel/Render/로컬에 모두 반영하고 각 서비스를 재배포

2. **Gemini API 키 회전**
   - Google Cloud Console → Credentials → API 키 재발급 → 모든 서비스에 적용 후 재배포

3. **DATABASE_URL 비밀번호 변경**
   - DB에서 비밀번호 갱신 → 환경 변수 업데이트 → 서비스 재시작 → Prisma 마이그레이션/쿼리로 검증

4. **ElevenLabs Webhook Secret 회전**
   - ElevenLabs 대시보드에서 Secret 재생성 → orchestrator/worker 환경 변수 업데이트 → Webhook 테스트 실행

---

## N. 자주 사용하는 명령어 치트시트

```bash
# 린트 / 테스트 / 빌드
pnpm lint
pnpm test
pnpm build

# 개별 앱 개발 서버
pnpm --filter web dev
pnpm --filter orchestrator dev
pnpm --filter worker dev

# 워커 큐 정리 수동 실행
pnpm --filter worker run cleanup

# Prisma
pnpm --filter @quizdude/db generate
pnpm --filter @quizdude/db migrate
pnpm --filter @quizdude/db exec prisma studio

# Vercel Blob CLI
npx vercel blob ls
npx vercel blob put sample.pdf --add-random-suffix
```

---

## O. 문제 해결 가이드

| 증상                         | 점검 포인트                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| 업로드 즉시 실패             | `BLOB_READ_WRITE_TOKEN` 존재 여부, `handleUpload` 라우트 권한 검사, 파일 크기/타입 제한 |
| Worker가 Job을 처리하지 않음 | Render Worker 로그, `JOB_POLL_INTERVAL_MS`/DB 연결 상태, Prisma 마이그레이션 누락       |
| "No token found" 에러        | 환경 변수 범위(Production/Preview) 확인, 다른 프로젝트에서 호출 중인지 점검             |
| Gemini 모델 관련 오류        | `GEMINI_MODEL_ID` 오타, Google Cloud에서 모델 접근 권한 확인                            |
| Cron Job 실패                | Render Cron Logs → 환경 변수 입력 누락 여부, 명령어 종료 코드 확인                      |
| ElevenLabs Webhook 403       | `ELEVENLABS_WEBHOOK_SECRET` 불일치, ngrok URL 만료 여부                                 |

---

### A → Z 마무리 체크

A. 계정/권한 정비 → B. 환경 변수 최신화 (`BLOB_READ_WRITE_TOKEN` 자동 생성 확인) → C. Blob 스토어 생성 및 `handleUpload` 라우트 구성 → D. PostgreSQL 준비 → E/F. Vercel 프로젝트(web/orchestrator) 배포 → G/H. Render Worker & Cron 설정 → I. 배포 후 헬스 체크 → J. 모니터링/알림 구성 → K/L. 로컬 테스트와 시나리오 검증 → M. 비밀 키 회전 전략 수립 → N/O. 운영 명령어 및 문제 해결 플로우 숙지.

최신 플로우를 기반으로 위 절차를 따르면 Quizdude 서비스를 안정적으로 배포하고 운영할 수 있습니다.
