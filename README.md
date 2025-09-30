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
4. **Vercel Blob**: 업로드 URL 발급을 위한 `VERCEL_BLOB_WRITE_TOKEN`과 `VERCEL_BLOB_READ_WRITE_URL`.
5. *(선택)* **ElevenLabs Scribe v1**: 오디오/비디오 전사 기능 사용 시 API Key 및 Webhook Secret.

## 환경 변수 설정
루트에 `.env`를 생성하고 `.env.example`를 참고해 채워 넣습니다. 주요 항목은 아래와 같습니다.

| 변수 | 설명 |
| --- | --- |
| `DATABASE_URL` | Prisma가 사용하는 PostgreSQL 연결 문자열 |
| `GEMINI_API_KEY` | Gemini API 키 |
| `GEMINI_MODEL_ID` | 기본 모델 문자열. 기본값 `gemini-flash-latest`이며 워커가 Models API로 존재 여부를 검증합니다. |
| `ENABLE_AUDIO_PIPELINE` | 오디오/비디오 전사 파이프라인 전역 플래그 (`true`/`false`). |
| `VERCEL_BLOB_WRITE_TOKEN`, `VERCEL_BLOB_READ_WRITE_URL` | 업로드 URL 발급/다운로드용 토큰 |
| `NEXT_PUBLIC_ORCHESTRATOR_URL` | 웹 앱에서 오케스트레이터 API를 호출할 기본 URL (예: `http://localhost:3001`) |
| `NEXT_PUBLIC_APP_URL` | 웹 애플리케이션 기본 URL |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET` | 오디오 파이프라인 사용 시 필요 |

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

## 프로덕션 배포 가이드
### 1. Vercel (웹 & 오케스트레이터)
- `apps/web`, `apps/orchestrator` 폴더를 각각 Vercel 프로젝트로 배포하거나 단일 모노레포 프로젝트에서 두 개의 빌드 타깃을 설정합니다.
- **환경 변수**: `.env`에 정의한 항목 중 웹/오케스트레이터에서 필요한 값(`NEXT_PUBLIC_*`, Blob 토큰, Database URL 등)을 Vercel 환경에 추가합니다.
- **빌드 명령**: `pnpm install && pnpm --filter web build` 또는 `pnpm --filter orchestrator build`.
- `NEXT_PUBLIC_ORCHESTRATOR_URL`은 오케스트레이터 배포 URL을 가리키도록 설정합니다.

### 2. Render Background Worker (apps/worker)
- Render Dashboards에서 *Background Worker* 서비스 생성.
- **Start Command**: `pnpm --filter worker start` (deploy hook에서 `pnpm install` + `pnpm --filter worker build` 실행).
- **환경 변수**: Database URL, Gemini/Blob 토큰, `ENABLE_AUDIO_PIPELINE`, ElevenLabs 키 등을 모두 Render 서비스에 설정.
- 필요 시 Render Cron으로 실패한 잡 재처리/정리 스크립트를 추가할 수 있습니다.

### 3. 데이터베이스 & 스토리지
- PostgreSQL을 Render/Neon/Supabase 등으로 제공.
- Vercel Blob은 프로젝트별 Token을 Vercel/Render 양쪽에 배치해야 합니다.

### 4. CI/CD & 품질 보증
- Husky `pre-commit` 훅이 `pnpm lint-staged`를 실행합니다.
- 수동 테스트: `pnpm --filter @quizdude/shared test`, `pnpm --filter worker typecheck` 등.
- 배포 전 Gemini API 할당량과 모델 가용성을 Models API로 확인하십시오. 모델 미존재 시 오퍼레이터에게 최신 플래시 계열로 교체를 요청하고 자동 치환하지 않습니다.

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
